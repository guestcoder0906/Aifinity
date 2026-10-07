/// <reference types="vite/client" />
import { createClient, SupabaseClient, RealtimeChannel } from '@supabase/supabase-js';
import { FileSystem } from './fileSystem';

export interface MultiplayerChatMessage {
  id: string;
  senderUsername: string;
  senderRole?: 'admin' | 'mod' | 'user';
  senderTier?: string;
  senderGlowingName?: boolean;
  characterName?: string;
  text: string;
  timestamp: number;
  whisperTo?: string[];
  replyTo?: {
    id: string;
    senderUsername: string;
    characterName?: string;
    text: string;
  };
}

export class MultiplayerService {
  private supabase: SupabaseClient;
  private channel: RealtimeChannel | null = null;
  private roomId: string | null = null;
  private currentUsername: string | null = null;
  private hostUsername: string | null = null;
  private currentUserMeta: { tier?: string; role?: 'admin' | 'mod' | 'user'; showGlowingName?: boolean } | null = null;
  private pendingSyncTasks: Array<() => Promise<void>> = [];
  private isProcessingSync = false;
  private onChatMessage?: (msg: MultiplayerChatMessage) => void;
  private onDeleteChatMessage?: (msgId: string) => void;

  private enqueueSync<T>(task: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve) => {
      this.pendingSyncTasks.push(async () => {
        try {
          const res = await task();
          resolve(res);
        } catch (err) {
          console.error("Multiplayer sync error:", err);
          resolve(undefined as any);
        }
      });
      this.runNextSync();
    });
  }

  private async runNextSync() {
    if (this.isProcessingSync) return;
    this.isProcessingSync = true;
    while (this.pendingSyncTasks.length > 0) {
      const next = this.pendingSyncTasks.shift();
      if (next) {
        try {
          await next();
        } catch (e) {
          console.error("Sync task error:", e);
        }
      }
    }
    this.isProcessingSync = false;
  }

  private fileSystem: FileSystem;
  private onStateUpdate: (state: any) => void;
  private onExecuteTurn: (inputs: Record<string, string>) => void;
  private onHostCreateCharacter: (data: { username: string; description: string }) => void;
  private onKicked: () => void;
  private onAdventureDeleted: () => void;
  private onUndoTurn?: (data: any) => void;

  constructor(
    fileSystem: FileSystem,
    onStateUpdate: (state: any) => void,
    onExecuteTurn: (inputs: Record<string, string>) => void,
    onHostCreateCharacter: (data: { username: string; description: string }) => void,
    onKicked: () => void,
    onAdventureDeleted: () => void
  ) {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
    const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

    if (!supabaseUrl || !supabaseAnonKey) {
      console.error("Missing Supabase credentials in Vite env");
    }
    this.supabase = createClient(supabaseUrl, supabaseAnonKey);

    this.fileSystem = fileSystem;
    this.onStateUpdate = onStateUpdate;
    this.onExecuteTurn = onExecuteTurn;
    this.onHostCreateCharacter = onHostCreateCharacter;
    this.onKicked = onKicked;
    this.onAdventureDeleted = onAdventureDeleted;
  }

  private generateRoomCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    let code = '';
    for (let i = 0; i < 5; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }

  async createRoom(
    username: string,
    playerMeta?: { tier?: string; role?: 'admin' | 'mod' | 'user'; showGlowingName?: boolean }
  ): Promise<string> {
    let lastError: any = null;

    for (let attempt = 0; attempt < 5; attempt++) {
      const roomId = this.generateRoomCode();
      const initialState = {
        id: roomId,
        hostUsername: username,
        players: [{
          username,
          status: 'active',
          isReady: false,
          hasCharacter: false,
          tier: playerMeta?.tier,
          role: playerMeta?.role,
          showGlowingName: playerMeta?.showGlowingName
        }],
        gameState: 'waiting_for_world',
        fileSystemState: { files: {}, metadata: {} },
        narrative: [],
        updates: [],
        pendingInputs: {},
        recommendations: [],
        playerRecommendations: {},
        worldTime: '',
        chatMessages: []
      };

      const { error } = await this.supabase
        .from('rooms')
        .insert({ id: roomId, host_username: username, state: initialState });

      if (!error) {
        this.roomId = roomId;
        this.currentUsername = username;
        this.hostUsername = username;
        this.currentUserMeta = playerMeta || null;

        await this.setupChannel(roomId, username, true);
        this.onStateUpdate(initialState);
        return roomId;
      }

      lastError = error;
      console.warn(`Failed attempt ${attempt + 1} creating room code ${roomId}:`, error);
    }

    console.error("Failed to create room in DB after 5 attempts", lastError);
    throw new Error(lastError?.message || "Unable to contact multiplayer database. Please check your connection and try again.");
  }

  async joinRoom(
    roomId: string,
    username: string,
    playerMeta?: { tier?: string; role?: 'admin' | 'mod' | 'user'; showGlowingName?: boolean }
  ): Promise<any> {
    const { data: room, error } = await this.supabase
      .from('rooms')
      .select('state, host_username')
      .eq('id', roomId)
      .single();

    if (error || !room) {
      throw new Error('Room not found');
    }

    const state = room.state;
    this.roomId = roomId;
    this.currentUsername = username;
    this.hostUsername = room.host_username || state.hostUsername || null;
    this.currentUserMeta = playerMeta || null;

    await this.setupChannel(roomId, username, false);
    if (state.fileSystemState) {
      this.fileSystem.importState(state.fileSystemState);
    }
    return state;
  }

  private async setupChannel(roomId: string, username: string, isHost: boolean) {
    if (this.channel) {
      const oldChannel = this.channel;
      this.channel = null;
      try {
        oldChannel.untrack().catch(() => {});
        this.supabase.removeChannel(oldChannel).catch(() => {});
      } catch (err) {
        console.warn("Could not remove previous channel:", err);
      }
    }

    this.channel = this.supabase.channel(`room:${roomId}`, {
      config: {
        presence: { key: username }
      }
    });

    const isTargetHost = (hostCandidate?: string) => {
      const myUser = (this.currentUsername || '').trim().toLowerCase();
      const hostA = (hostCandidate || '').trim().toLowerCase();
      const hostB = (this.hostUsername || '').trim().toLowerCase();
      return Boolean(myUser && (myUser === hostA || (hostB && myUser === hostB)));
    };

    this.channel
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'rooms', filter: `id=eq.${roomId}` }, (payload: any) => {
        const newState = payload.new.state;

        if (newState?.hostUsername) {
          this.hostUsername = newState.hostUsername;
        }

        // Non-host players sync files strictly from DB updates
        if (this.currentUsername !== newState.hostUsername && newState.fileSystemState) {
          this.fileSystem.importState(newState.fileSystemState);
        }

        this.onStateUpdate(newState);
      })
      .on('broadcast', { event: 'submit_action' }, (payload: any) => {
        if (isTargetHost(payload?.payload?.host)) {
          this.handlePlayerActionAsHost(payload.payload.username, payload.payload.action);
        }
      })
      .on('broadcast', { event: 'execute_turn' }, (payload: any) => {
        if (isTargetHost(payload?.payload?.host)) {
          this.onExecuteTurn(payload.payload.inputs);
        }
      })
      .on('broadcast', { event: 'create_character' }, (payload: any) => {
        if (isTargetHost(payload?.payload?.host)) {
          this.onHostCreateCharacter({ username: payload.payload.username, description: payload.payload.description });
        }
      })
      .on('broadcast', { event: 'kick_player' }, (payload: any) => {
        if (this.currentUsername === payload.payload.username) {
          this.leaveRoom();
          this.onKicked();
        }
      })
      .on('broadcast', { event: 'adventure_deleted' }, () => {
        this.leaveRoom();
        this.onAdventureDeleted();
      })
      .on('broadcast', { event: 'undo_turn' }, (payload: any) => {
        if (payload?.payload?.fileSystemState) {
          this.fileSystem.importState(payload.payload.fileSystemState);
        }
        if (this.onUndoTurn) {
          this.onUndoTurn(payload.payload);
        }
      })
      .on('broadcast', { event: 'send_chat_message' }, (payload: any) => {
        const msg = payload?.payload?.message;
        if (msg && this.onChatMessage) {
          this.onChatMessage(msg);
        }
      })
      .on('broadcast', { event: 'delete_chat_message' }, (payload: any) => {
        const msgId = payload?.payload?.messageId;
        if (msgId && this.onDeleteChatMessage) {
          this.onDeleteChatMessage(msgId);
        }
      });

    this.channel.on('presence', { event: 'sync' }, () => {
      const presenceState = this.channel?.presenceState() || {};
      const activeUsernames = Object.keys(presenceState);

      if (this.currentUsername) {
        this.enqueueSync(async () => {
          const { data } = await this.supabase.from('rooms').select('state, host_username').eq('id', roomId).single();
          if (data && data.host_username === this.currentUsername) {
            const state = data.state;
            let changed = false;

            state.players.forEach((p: any) => {
              const isActive = activeUsernames.some(u => u.toLowerCase() === p.username.toLowerCase());
              if (p.status !== (isActive ? 'active' : 'inactive')) {
                p.status = isActive ? 'active' : 'inactive';
                changed = true;
              }
            });

            activeUsernames.forEach((u: string) => {
              const tracks = (presenceState[u] as any[]) || [];
              const meta = tracks[0] || {};
              const existing = state.players.find((p: any) => p.username.toLowerCase() === u.toLowerCase());
              if (!existing) {
                state.players.push({
                  username: u,
                  status: 'active',
                  isReady: false,
                  hasCharacter: false,
                  role: meta.role,
                  showGlowingName: meta.showGlowingName,
                  tier: meta.tier
                });
                changed = true;
              } else {
                if (meta.role && existing.role !== meta.role) {
                  existing.role = meta.role;
                  changed = true;
                }
                if (meta.showGlowingName !== undefined && existing.showGlowingName !== meta.showGlowingName) {
                  existing.showGlowingName = meta.showGlowingName;
                  changed = true;
                }
                if (meta.tier && existing.tier !== meta.tier) {
                  existing.tier = meta.tier;
                  changed = true;
                }
              }
            });

            if (changed) {
              await this.supabase.from('rooms').update({ state }).eq('id', roomId);
              this.checkTurnForHost(state);
            }
          }
        });
      }
    });

    this.channel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        try {
          await this.channel?.track({
            user: username,
            online_at: new Date().toISOString(),
            ...(this.currentUserMeta || {})
          });
        } catch (e) {
          console.warn('Presence tracking error:', e);
        }
      }
    });
  }

  async leaveRoom() {
    if (this.channel) {
      const oldChannel = this.channel;
      this.channel = null;
      try {
        oldChannel.untrack().catch(() => {});
        this.supabase.removeChannel(oldChannel).catch(() => {});
      } catch (err) {
        console.warn("Could not remove previous channel:", err);
      }
    }
    this.roomId = null;
    this.currentUsername = null;
    this.pendingSyncTasks = [];
    this.isProcessingSync = false;
  }

  async submitAction(action: string) {
    if (!this.roomId || !this.channel) return;

    const { data } = await this.supabase.from('rooms').select('host_username').eq('id', this.roomId).single();
    if (data) {
      if (this.currentUsername === data.host_username) {
        this.handlePlayerActionAsHost(this.currentUsername, action);
      } else {
        this.channel.send({
          type: 'broadcast',
          event: 'submit_action',
          payload: { username: this.currentUsername, action, host: data.host_username }
        });
      }
    }
  }

  private async handlePlayerActionAsHost(username: string, action: string) {
    if (!this.roomId) return;
    this.enqueueSync(async () => {
      const { data } = await this.supabase.from('rooms').select('state').eq('id', this.roomId).single();
      if (data) {
        const state = data.state;
        state.pendingInputs[username] = action;
        const player = state.players.find((p: any) => p.username.toLowerCase() === username.toLowerCase());
        if (player) player.isReady = true;

        await this.supabase.from('rooms').update({ state }).eq('id', this.roomId);
        this.checkTurnForHost(state);
      }
    });
  }

  private checkTurnForHost(state: any) {
    if (state.gameState === 'character_creation') {
      const activePlayers = state.players.filter((p: any) => p.status === 'active');
      const allHaveCharacters = activePlayers.length > 0 && activePlayers.every((p: any) => p.hasCharacter);

      if (allHaveCharacters) {
        state.gameState = 'playing';
        this.supabase.from('rooms').update({ state }).eq('id', this.roomId).then(() => {});
      }
      return;
    }

    if (state.gameState !== 'playing') return;
    const activePlayers = state.players.filter((p: any) => p.status === 'active' && p.hasCharacter);
    if (activePlayers.length > 0 && activePlayers.every((p: any) => p.isReady)) {
      this.onExecuteTurn(state.pendingInputs);

      this.channel?.send({
        type: 'broadcast',
        event: 'execute_turn',
        payload: { host: this.currentUsername, inputs: state.pendingInputs }
      });
    }
  }

  async createCharacter(description: string) {
    if (!this.roomId || !this.channel || !this.currentUsername) return;
    let targetHost = this.hostUsername;
    if (!targetHost) {
      const { data } = await this.supabase.from('rooms').select('host_username, state').eq('id', this.roomId).single();
      targetHost = data?.host_username || data?.state?.hostUsername || null;
      if (targetHost) this.hostUsername = targetHost;
    }
    const isCurrentHost = targetHost && (this.currentUsername.trim().toLowerCase() === targetHost.trim().toLowerCase());
    if (isCurrentHost) {
      this.onHostCreateCharacter({ username: this.currentUsername, description });
    } else if (targetHost) {
      this.channel.send({
        type: 'broadcast',
        event: 'create_character',
        payload: { username: this.currentUsername, description, host: targetHost }
      });
    }
  }

  /**
   * Extracts the active time string safely regardless of whether WorldTime.txt
   * is using the legacy flat format or the temporal displacement schema.
   */
  private parseActiveWorldTime(files: Record<string, string>): string {
    const rawTime = files['WorldTime.txt'];
    if (!rawTime) return '';

    // Temporal Displacement Schema: extract timestamp under [CURRENT ACTIVE TIME]
    const activeBlockMatch = rawTime.match(/\[CURRENT ACTIVE TIME\][\s\S]*?Timestamp:\s*([^\n\r]+)/i);
    if (activeBlockMatch && activeBlockMatch[1]) {
      return activeBlockMatch[1].trim();
    }

    // Fallback: match standard timestamp string pattern
    const fallbackMatch = rawTime.match(/\d{1,2}:\d{2}(?::\d{2})?\s*(?:AM|PM)?\s*-\s*[A-Za-z]+\s+\d{1,2},\s*\d{4}/i);
    if (fallbackMatch) {
      return fallbackMatch[0].trim();
    }

    return rawTime.trim().split('\n')[0] || '';
  }

  async syncState(partialState: any): Promise<void> {
    return this.enqueueSync(async () => {
      if (!this.roomId) return;

      const { data } = await this.supabase.from('rooms').select('state').eq('id', this.roomId).single();
      if (!data) return;

      const state = { ...data.state, ...partialState };

      // Guarantee fileSystemState matches current filesystem exports if not explicitly passed
      if (!partialState.fileSystemState) {
        state.fileSystemState = this.fileSystem.exportState();
      }

      // Synchronize dynamic active world time into global state
      if (state.fileSystemState?.files) {
        const activeTime = this.parseActiveWorldTime(state.fileSystemState.files);
        if (activeTime) {
          state.worldTime = activeTime;
        }
      }

      // Update hasCharacter based on exact naming convention format: CharacterName-USERNAME.txt
      if (state.players && state.fileSystemState?.files) {
        const fileKeys = Object.keys(state.fileSystemState.files);
        state.players.forEach((p: any) => {
          const uLower = p.username.toLowerCase();
          p.hasCharacter = fileKeys.some(f => {
            const lowerF = f.toLowerCase();
            return (
              lowerF.endsWith(`-${uLower}.txt`) ||
              lowerF.endsWith(`_${uLower}.txt`) ||
              lowerF.endsWith(` ${uLower}.txt`)
            );
          });
        });
      }

      if (state.turnProcessed) {
        if (state.players) state.players.forEach((p: any) => (p.isReady = false));
        state.pendingInputs = {};
        state.turnProcessed = false;
      }

      if (state.gameState === 'character_creation' && state.players) {
        const activePlayers = state.players.filter((p: any) => p.status === 'active');
        const allHaveCharacters = activePlayers.length > 0 && activePlayers.every((p: any) => p.hasCharacter);
        if (allHaveCharacters) {
          state.gameState = 'playing';
        }
      }

      await this.supabase.from('rooms').update({ state }).eq('id', this.roomId);
      this.checkTurnForHost(state);
    });
  }

  async forceTurn() {
    if (!this.roomId) return;
    const { data } = await this.supabase.from('rooms').select('state').eq('id', this.roomId).single();
    if (data && this.channel) {
      this.onExecuteTurn(data.state.pendingInputs);

      this.channel.send({
        type: 'broadcast',
        event: 'execute_turn',
        payload: { host: this.currentUsername, inputs: data.state.pendingInputs }
      });
    }
  }

  kickPlayer(username: string) {
    this.channel?.send({
      type: 'broadcast',
      event: 'kick_player',
      payload: { username }
    });
  }

  setOnUndoTurn(cb: (data: any) => void) {
    this.onUndoTurn = cb;
  }

  setOnChatMessage(cb: (msg: MultiplayerChatMessage) => void) {
    this.onChatMessage = cb;
  }

  setOnDeleteChatMessage(cb: (msgId: string) => void) {
    this.onDeleteChatMessage = cb;
  }

  async sendChatMessage(
    text: string,
    whisperTo?: string[],
    replyTo?: MultiplayerChatMessage['replyTo']
  ): Promise<MultiplayerChatMessage | null> {
    if (!this.roomId || !this.currentUsername || !text.trim()) return null;

    // Detect character name from file system convention: CharacterName-USERNAME.txt
    let characterName: string | undefined;
    if (this.fileSystem) {
      const uLower = this.currentUsername.trim().toLowerCase();
      const files = this.fileSystem.list();
      const charFile = files.find(f => {
        const lower = f.toLowerCase();
        return lower.endsWith(`-${uLower}.txt`) || lower.endsWith(`_${uLower}.txt`) || lower.endsWith(` ${uLower}.txt`);
      });
      if (charFile) {
        characterName = charFile.replace(/[-_ ][^-_ ]+\.txt$/i, '').replace('.txt', '').trim();
      }
    }

    const message: MultiplayerChatMessage = {
      id: 'msg_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
      senderUsername: this.currentUsername,
      senderRole: this.currentUserMeta?.role || 'user',
      senderTier: this.currentUserMeta?.tier || 'free',
      senderGlowingName: this.currentUserMeta?.showGlowingName,
      characterName,
      text: text.trim(),
      timestamp: Date.now(),
      whisperTo: whisperTo && whisperTo.length > 0 ? whisperTo.map(u => u.trim().toLowerCase()) : undefined,
      replyTo: replyTo ? {
        id: replyTo.id,
        senderUsername: replyTo.senderUsername,
        characterName: replyTo.characterName,
        text: replyTo.text.slice(0, 120)
      } : undefined
    };

    // Low-latency broadcast to all room subscribers
    this.channel?.send({
      type: 'broadcast',
      event: 'send_chat_message',
      payload: { message }
    });

    // Notify local listener right away
    if (this.onChatMessage) {
      this.onChatMessage(message);
    }

    // Persist asynchronously to DB room record
    this.enqueueSync(async () => {
      const { data } = await this.supabase.from('rooms').select('state').eq('id', this.roomId).single();
      if (data && data.state) {
        const state = data.state;
        const currentMessages: MultiplayerChatMessage[] = state.chatMessages || [];
        // Avoid duplicate if already inserted
        if (!currentMessages.some(m => m.id === message.id)) {
          state.chatMessages = [...currentMessages, message].slice(-500);
          await this.supabase.from('rooms').update({ state }).eq('id', this.roomId);
        }
      }
    });

    return message;
  }

  async deleteChatMessage(messageId: string, currentUser?: { username: string; role?: string }): Promise<boolean> {
    if (!this.roomId) return false;
    const { data } = await this.supabase.from('rooms').select('state, host_username').eq('id', this.roomId).single();
    if (!data || !data.state) return false;

    const state = data.state;
    const messages: MultiplayerChatMessage[] = state.chatMessages || [];
    const target = messages.find(m => m.id === messageId);
    if (!target) return false;

    const myUser = (currentUser?.username || this.currentUsername || '').trim().toLowerCase();
    const isSender = (target.senderUsername || '').trim().toLowerCase() === myUser;
    const isHost = (data.host_username || state.hostUsername || '').trim().toLowerCase() === myUser;
    const role = currentUser?.role || this.currentUserMeta?.role;
    const isStaff = role === 'admin' || role === 'mod';

    if (!isSender && !isHost && !isStaff) {
      throw new Error("Only the sender, room host, moderators, or admins can delete this message.");
    }

    state.chatMessages = messages.filter(m => m.id !== messageId);
    await this.supabase.from('rooms').update({ state }).eq('id', this.roomId);

    this.channel?.send({
      type: 'broadcast',
      event: 'delete_chat_message',
      payload: { messageId }
    });

    if (this.onDeleteChatMessage) {
      this.onDeleteChatMessage(messageId);
    }

    this.onStateUpdate(state);
    return true;
  }

  async undoTurn(snapshotData: any) {
    if (!this.roomId) return;
    this.channel?.send({
      type: 'broadcast',
      event: 'undo_turn',
      payload: snapshotData
    });
    await this.syncState({
      fileSystemState: snapshotData.fileSystemState,
      narrative: snapshotData.narrative,
      updates: snapshotData.updates || [],
      recommendations: snapshotData.recommendations || [],
      playerRecommendations: snapshotData.playerRecommendations || {},
      worldTime: snapshotData.worldTime || '',
      gameState: 'playing',
      turnProcessed: true
    });
  }

  async deleteAdventure(user?: { username: string; role?: string }) {
    if (!this.roomId) return;
    if (user) {
      const { data } = await this.supabase.from('rooms').select('host_username').eq('id', this.roomId).single();
      if (data) {
        const isHost = (data.host_username || '').trim().toLowerCase() === user.username.trim().toLowerCase();
        const isStaff = user.role === 'admin' || user.role === 'mod';
        if (!isHost && !isStaff) {
          throw new Error('Only the host, moderators, or administrators can permanently delete this multiplayer adventure.');
        }
      }
    }
    this.channel?.send({
      type: 'broadcast',
      event: 'adventure_deleted'
    });
    await this.supabase.from('rooms').delete().eq('id', this.roomId);
    this.leaveRoom();
  }

  // --- Static Room Management & Query Methods ---

  static async getUserActiveRooms(username: string): Promise<Array<{
    id: string;
    hostUsername: string;
    state: any;
    isHost: boolean;
    characterName?: string;
    playerCount: number;
    gameState: string;
    worldTime?: string;
  }>> {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
    const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
    if (!supabaseUrl || !supabaseAnonKey || !username) return [];

    try {
      const client = createClient(supabaseUrl, supabaseAnonKey);
      const { data, error } = await client.from('rooms').select('id, host_username, state');
      if (error || !data) {
        console.warn("Could not query rooms:", error);
        return [];
      }

      const uLower = username.trim().toLowerCase();
      const myRooms = data.filter((r: any) => {
        const isHost = (r.host_username || r.state?.hostUsername || '').trim().toLowerCase() === uLower;
        const isInPlayers = Array.isArray(r.state?.players) && r.state.players.some((p: any) => (p.username || '').trim().toLowerCase() === uLower);
        return isHost || isInPlayers;
      });

      return myRooms.map((r: any) => {
        const state = r.state || {};
        const isHost = (r.host_username || state.hostUsername || '').trim().toLowerCase() === uLower;
        let charName: string | undefined;

        if (state.fileSystemState?.files) {
          const fileKeys = Object.keys(state.fileSystemState.files);
          const match = fileKeys.find(f => {
            const lower = f.toLowerCase();
            return lower.endsWith(`-${uLower}.txt`) || lower.endsWith(`_${uLower}.txt`) || lower.endsWith(` ${uLower}.txt`);
          });
          if (match) {
            charName = match.replace(/[-_ ][^-_ ]+\.txt$/i, '').replace('.txt', '').trim();
          }
        }

        return {
          id: r.id,
          hostUsername: r.host_username || state.hostUsername || 'Unknown',
          state,
          isHost,
          characterName: charName,
          playerCount: Array.isArray(state.players) ? state.players.length : 1,
          gameState: state.gameState || 'waiting_for_world',
          worldTime: state.worldTime || ''
        };
      });
    } catch (err) {
      console.error("Error fetching user active rooms:", err);
      return [];
    }
  }

  static async leaveRoomPermanently(roomId: string, username: string): Promise<boolean> {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
    const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
    if (!supabaseUrl || !supabaseAnonKey || !roomId || !username) return false;

    try {
      const client = createClient(supabaseUrl, supabaseAnonKey);
      const { data } = await client.from('rooms').select('state, host_username').eq('id', roomId).single();
      if (!data || !data.state) return false;
      const state = data.state;
      const uLower = username.trim().toLowerCase();

      if (Array.isArray(state.players)) {
        state.players = state.players.filter((p: any) => (p.username || '').trim().toLowerCase() !== uLower);
      }

      await client.from('rooms').update({ state }).eq('id', roomId);
      return true;
    } catch (err) {
      console.error("Error leaving room permanently:", err);
      return false;
    }
  }

  static async deleteRoomPermanently(roomId: string, user: { username: string; role?: string }): Promise<boolean> {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
    const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
    if (!supabaseUrl || !supabaseAnonKey || !roomId) return false;

    try {
      const client = createClient(supabaseUrl, supabaseAnonKey);
      const { data } = await client.from('rooms').select('host_username, state').eq('id', roomId).single();
      if (!data) return false;

      const isHost = (data.host_username || data.state?.hostUsername || '').trim().toLowerCase() === user.username.trim().toLowerCase();
      const isStaff = user.role === 'admin' || user.role === 'mod';
      if (!isHost && !isStaff) {
        throw new Error('Only the host, moderators, or administrators can permanently delete this multiplayer adventure.');
      }

      const { error } = await client.from('rooms').delete().eq('id', roomId);
      if (error) throw error;
      return true;
    } catch (err) {
      console.error("Error deleting room permanently:", err);
      throw err;
    }
  }
}
