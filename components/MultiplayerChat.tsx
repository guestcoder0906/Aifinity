import React, { useState, useEffect, useRef } from 'react';
import {
  MessageSquare,
  Send,
  X,
  Maximize2,
  Minimize2,
  Trash2,
  Reply,
  Lock,
  Users,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Shield,
  CornerDownRight,
  AlertCircle
} from 'lucide-react';
import { MultiplayerChatMessage } from '../services/multiplayer';
import { UserProfile } from '../services/authService';
import { safeStorage } from '../services/safeStorage';

interface MultiplayerChatProps {
  messages: MultiplayerChatMessage[];
  currentUsername: string;
  currentUser?: UserProfile | null;
  hostUsername?: string;
  players: Array<{
    username: string;
    status: 'active' | 'inactive';
    role?: 'admin' | 'mod' | 'user';
    tier?: string;
    characterName?: string;
  }>;
  onSendMessage: (text: string, whisperTo?: string[], replyTo?: MultiplayerChatMessage['replyTo']) => Promise<any>;
  onDeleteMessage: (messageId: string) => Promise<boolean>;
  isOpen: boolean;
  onToggleOpen: () => void;
}

export const MultiplayerChat: React.FC<MultiplayerChatProps> = ({
  messages,
  currentUsername,
  currentUser,
  hostUsername,
  players,
  onSendMessage,
  onDeleteMessage,
  isOpen,
  onToggleOpen
}) => {
  const [inputText, setInputText] = useState('');
  const [isExpanded, setIsExpanded] = useState(false);
  const [whisperRecipient, setWhisperRecipient] = useState<string>('all');
  const [replyingTo, setReplyingTo] = useState<MultiplayerChatMessage | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const lastViewedMsgCountRef = useRef<number>(messages.length);

  const myUsernameLower = (currentUsername || '').trim().toLowerCase();
  const isHost = (hostUsername || '').trim().toLowerCase() === myUsernameLower;
  const isStaff = currentUser?.role === 'admin' || currentUser?.role === 'mod';

  // Draggable button position state (defaults to middle side instead of bottom so it doesn't cover anything)
  const [btnPos, setBtnPos] = useState<{ x: number; y: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef<{ pointerX: number; pointerY: number; btnX: number; btnY: number } | null>(null);
  const hasDraggedRef = useRef(false);

  const clampPosition = (x: number, y: number) => {
    const btnSize = 50;
    const margin = 10;
    const maxX = Math.max(margin, window.innerWidth - btnSize - margin);
    const maxY = Math.max(60, window.innerHeight - btnSize - margin);
    return {
      x: Math.min(Math.max(margin, x), maxX),
      y: Math.min(Math.max(60, y), maxY),
    };
  };

  useEffect(() => {
    const saved = safeStorage.getItem('aifinity_mp_btn_pos');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (typeof parsed.x === 'number' && typeof parsed.y === 'number') {
          setBtnPos(clampPosition(parsed.x, parsed.y));
          return;
        }
      } catch (e) {}
    }
    // Default position: middle side (right edge, centered vertically around 50% height)
    const defaultX = Math.max(10, window.innerWidth - 62);
    const defaultY = Math.max(60, Math.round(window.innerHeight * 0.5 - 25));
    setBtnPos({ x: defaultX, y: defaultY });
  }, []);

  useEffect(() => {
    const handleResize = () => {
      setBtnPos((prev) => {
        if (!prev) return prev;
        return clampPosition(prev.x, prev.y);
      });
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handlePointerDown = (e: React.MouseEvent | React.TouchEvent) => {
    if ('button' in e && e.button !== 0) return;
    const clientX = 'clientX' in e ? e.clientX : e.touches[0].clientX;
    const clientY = 'clientY' in e ? e.clientY : e.touches[0].clientY;

    const currentX = btnPos?.x ?? (window.innerWidth - 62);
    const currentY = btnPos?.y ?? (window.innerHeight * 0.5 - 25);

    dragStartRef.current = {
      pointerX: clientX,
      pointerY: clientY,
      btnX: currentX,
      btnY: currentY,
    };
    hasDraggedRef.current = false;

    const handlePointerMove = (moveEvt: MouseEvent | TouchEvent) => {
      if (!dragStartRef.current) return;
      const moveX = 'clientX' in moveEvt ? moveEvt.clientX : moveEvt.touches[0].clientX;
      const moveY = 'clientY' in moveEvt ? moveEvt.clientY : moveEvt.touches[0].clientY;

      const dx = moveX - dragStartRef.current.pointerX;
      const dy = moveY - dragStartRef.current.pointerY;

      if (!hasDraggedRef.current && Math.hypot(dx, dy) > 4) {
        hasDraggedRef.current = true;
        setIsDragging(true);
      }

      if (hasDraggedRef.current) {
        if ('cancelable' in moveEvt && moveEvt.cancelable) {
          moveEvt.preventDefault();
        }
        const newX = dragStartRef.current.btnX + dx;
        const newY = dragStartRef.current.btnY + dy;
        const clamped = clampPosition(newX, newY);
        setBtnPos(clamped);
      }
    };

    const handlePointerUp = () => {
      if (dragStartRef.current && hasDraggedRef.current) {
        setBtnPos((current) => {
          if (current) {
            safeStorage.setItem('aifinity_mp_btn_pos', JSON.stringify(current));
          }
          return current;
        });
      }
      dragStartRef.current = null;
      setIsDragging(false);
      window.removeEventListener('mousemove', handlePointerMove);
      window.removeEventListener('mouseup', handlePointerUp);
      window.removeEventListener('touchmove', handlePointerMove);
      window.removeEventListener('touchend', handlePointerUp);
      window.removeEventListener('touchcancel', handlePointerUp);
    };

    window.addEventListener('mousemove', handlePointerMove);
    window.addEventListener('mouseup', handlePointerUp);
    window.addEventListener('touchmove', handlePointerMove, { passive: false });
    window.addEventListener('touchend', handlePointerUp);
    window.addEventListener('touchcancel', handlePointerUp);
  };

  const handleButtonClick = (e: React.MouseEvent) => {
    if (hasDraggedRef.current) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    onToggleOpen();
  };

  // Handle unread messages count when chat is closed
  useEffect(() => {
    if (isOpen) {
      setUnreadCount(0);
      lastViewedMsgCountRef.current = messages.length;
    } else {
      const diff = Math.max(0, messages.length - lastViewedMsgCountRef.current);
      setUnreadCount(diff);
    }
  }, [messages.length, isOpen]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen]);

  const handleSend = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = inputText.trim();
    if (!trimmed || isSending) return;

    let textToSend = trimmed;
    let targetWhispers: string[] | undefined = undefined;

    // Support slash command: /w username text or /whisper username text
    const slashWhisperMatch = trimmed.match(/^\/(?:w|whisper)\s+(\S+)\s+(.+)$/i);
    if (slashWhisperMatch) {
      targetWhispers = [slashWhisperMatch[1].trim()];
      textToSend = slashWhisperMatch[2].trim();
    } else if (whisperRecipient && whisperRecipient !== 'all') {
      targetWhispers = [whisperRecipient];
    }

    const replyData = replyingTo ? {
      id: replyingTo.id,
      senderUsername: replyingTo.senderUsername,
      characterName: replyingTo.characterName,
      text: replyingTo.text
    } : undefined;

    try {
      setIsSending(true);
      await onSendMessage(textToSend, targetWhispers, replyData);
      setInputText('');
      setReplyingTo(null);
      if (slashWhisperMatch) {
        setWhisperRecipient('all');
      }
    } catch (err) {
      console.error("Failed to send message:", err);
    } finally {
      setIsSending(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  };

  const handleDelete = async (messageId: string) => {
    try {
      setDeletingId(messageId);
      await onDeleteMessage(messageId);
    } catch (err: any) {
      alert(err?.message || "Could not delete message.");
    } finally {
      setDeletingId(null);
    }
  };

  // Filter messages based on whisper visibility
  const visibleMessages = messages.filter((msg) => {
    if (!msg.whisperTo || msg.whisperTo.length === 0) return true;
    const isSender = (msg.senderUsername || '').toLowerCase() === myUsernameLower;
    const isTarget = msg.whisperTo.some(u => u.toLowerCase() === myUsernameLower);
    return isSender || isTarget || isStaff;
  });

  const canDeleteMessage = (msg: MultiplayerChatMessage) => {
    const isSender = (msg.senderUsername || '').toLowerCase() === myUsernameLower;
    return isSender || isHost || isStaff;
  };

  const formatTime = (ts: number) => {
    try {
      return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  };

  const otherPlayers = players.filter(
    (p) => (p.username || '').toLowerCase() !== myUsernameLower
  );

  return (
    <>
      {/* Floating Draggable Chat Toggle Button (Visible when chat is closed, located in middle side) */}
      {!isOpen && (
        <div
          id="multiplayer-chat-toggle-container"
          style={{
            position: 'fixed',
            left: btnPos ? `${btnPos.x}px` : undefined,
            top: btnPos ? `${btnPos.y}px` : undefined,
            right: btnPos ? undefined : '12px',
            bottom: btnPos ? undefined : '50%',
            transform: btnPos ? undefined : 'translateY(50%)',
            zIndex: 9990,
          }}
          className="touch-none select-none"
        >
          <button
            id="multiplayer-chat-toggle-btn"
            onClick={handleButtonClick}
            onMouseDown={handlePointerDown}
            onTouchStart={handlePointerDown}
            className={`relative w-12 h-12 rounded-full flex items-center justify-center bg-neutral-900/95 hover:bg-neutral-800 text-white border-2 border-blue-500/80 shadow-[0_4px_24px_rgba(0,0,0,0.8),0_0_16px_rgba(59,130,246,0.4)] backdrop-blur-md transition-transform duration-100 ${
              isDragging
                ? 'cursor-grabbing scale-110 ring-2 ring-blue-400 shadow-[0_0_25px_rgba(59,130,246,0.6)]'
                : 'cursor-grab hover:scale-105 active:scale-95'
            } group`}
            title={`Multiplayer Chat (${players.filter((p) => p.status === 'active').length} online) • Click to open, drag to reposition`}
            aria-label="Multiplayer Chat"
          >
            {/* Chat Icon */}
            <MessageSquare size={22} className="text-blue-400 group-hover:text-blue-300 transition-colors pointer-events-none" />

            {/* Unread message count badge */}
            {unreadCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 bg-gradient-to-r from-red-500 to-amber-500 text-white font-bold font-mono text-[10px] min-w-[18px] h-[18px] px-1 rounded-full flex items-center justify-center animate-pulse shadow-md border-2 border-neutral-950 pointer-events-none">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}

            {/* Active player count indicator */}
            <span
              className="absolute -bottom-1 -right-1 bg-emerald-500 text-neutral-950 font-extrabold font-mono text-[9px] min-w-[17px] h-[17px] px-0.5 rounded-full flex items-center justify-center border-2 border-neutral-950 shadow pointer-events-none"
              title={`${players.filter((p) => p.status === 'active').length} players online`}
            >
              {players.filter((p) => p.status === 'active').length}
            </span>
          </button>
        </div>
      )}

      {/* Expandable Chat Window */}
      {isOpen && (
        <div
          id="multiplayer-chat-window"
          className={`fixed z-[9995] bg-neutral-950/95 border border-blue-500/50 shadow-2xl rounded-2xl flex flex-col overflow-hidden backdrop-blur-xl transition-all duration-200 animate-in fade-in zoom-in-95 ${
            isExpanded
              ? 'bottom-2 right-2 top-2 left-2 sm:left-auto sm:right-4 sm:bottom-4 sm:top-16 sm:w-[540px] max-w-full'
              : 'bottom-3 right-3 sm:bottom-4 sm:right-4 w-[calc(100vw-1.5rem)] sm:w-[410px] h-[520px] max-h-[85vh]'
          }`}
        >
          {/* Chat Header */}
          <div className="px-3.5 py-2.5 bg-gradient-to-r from-neutral-900 via-neutral-900 to-blue-950/50 border-b border-neutral-800 flex items-center justify-between shrink-0 select-none">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-7 h-7 rounded-lg bg-blue-500/20 border border-blue-500/40 text-blue-400 flex items-center justify-center shrink-0">
                <MessageSquare size={15} />
              </div>
              <div className="truncate">
                <div className="flex items-center gap-1.5">
                  <span className="font-bold text-xs sm:text-sm text-white truncate">Realm Chat</span>
                  <span className="text-[10px] bg-blue-950 text-blue-300 border border-blue-800/80 px-1.5 py-0.2 rounded font-mono font-bold">
                    {players.filter(p => p.status === 'active').length} Active
                  </span>
                </div>
                <div className="text-[10px] text-neutral-400 truncate">
                  Logged in as <strong className="text-neutral-200">@{currentUsername}</strong>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="p-1.5 text-neutral-400 hover:text-white hover:bg-neutral-800 rounded-lg transition-colors cursor-pointer"
                title={isExpanded ? "Collapse chat" : "Expand chat"}
              >
                {isExpanded ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
              </button>
              <button
                onClick={onToggleOpen}
                className="p-1.5 text-neutral-400 hover:text-white hover:bg-neutral-800 rounded-lg transition-colors cursor-pointer"
                title="Close chat window"
              >
                <X size={15} />
              </button>
            </div>
          </div>

          {/* Messages Area */}
          <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-2.5 text-xs font-sans scroll-smooth">
            {visibleMessages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-6 text-neutral-500 space-y-2">
                <div className="w-10 h-10 rounded-full bg-neutral-900 border border-neutral-800 flex items-center justify-center text-neutral-400">
                  <MessageSquare size={20} />
                </div>
                <p className="text-xs font-medium text-neutral-400">No chat messages yet.</p>
                <p className="text-[11px] text-neutral-500 max-w-xs leading-relaxed">
                  Coordinate moves, discuss strategy, or whisper privately to specific adventurers!
                </p>
              </div>
            ) : (
              visibleMessages.map((msg) => {
                const isMe = (msg.senderUsername || '').toLowerCase() === myUsernameLower;
                const isMsgHost = (hostUsername || '').toLowerCase() === (msg.senderUsername || '').toLowerCase();
                const isWhisper = Boolean(msg.whisperTo && msg.whisperTo.length > 0);
                const isWhisperToMe = isWhisper && !isMe;

                return (
                  <div
                    key={msg.id}
                    className={`group relative rounded-xl p-2.5 transition-all ${
                      isWhisper
                        ? 'bg-purple-950/30 border border-purple-800/50 hover:border-purple-700/70 shadow-sm shadow-purple-950/20'
                        : isMe
                        ? 'bg-blue-950/25 border border-blue-900/40 hover:border-blue-800/60'
                        : 'bg-neutral-900/60 border border-neutral-800/80 hover:border-neutral-700/80'
                    }`}
                  >
                    {/* Quoted reply if present */}
                    {msg.replyTo && (
                      <div className="mb-1.5 pl-2 py-0.5 border-l-2 border-blue-500/60 bg-black/40 rounded text-[11px] text-neutral-400 flex items-center gap-1.5">
                        <CornerDownRight size={11} className="text-blue-400 shrink-0" />
                        <span className="font-semibold text-blue-300 truncate">
                          {msg.replyTo.characterName || `@${msg.replyTo.senderUsername}`}
                        </span>
                        <span className="truncate italic text-neutral-400/90 text-[10px]">
                          "{msg.replyTo.text}"
                        </span>
                      </div>
                    )}

                    {/* Sender bar */}
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {/* Character Name */}
                        {msg.characterName ? (
                          <span className="font-bold text-amber-300 hover:text-amber-200">
                            {msg.characterName}
                          </span>
                        ) : null}

                        {/* Username tag */}
                        <span className="text-neutral-400 text-[11px]">
                          @{msg.senderUsername}
                        </span>

                        {/* Host badge */}
                        {isMsgHost && (
                          <span className="text-[9px] font-mono font-bold px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40">
                            Host
                          </span>
                        )}

                        {/* Admin / Mod badge */}
                        {msg.senderRole === 'admin' ? (
                          <span className="text-[9px] font-mono font-bold px-1.5 py-0.2 rounded bg-cyan-950 text-cyan-300 border border-cyan-700 flex items-center gap-0.5">
                            <Shield size={9} /> Admin
                          </span>
                        ) : msg.senderRole === 'mod' ? (
                          <span className="text-[9px] font-mono font-bold px-1.5 py-0.2 rounded bg-purple-950 text-purple-300 border border-purple-700 flex items-center gap-0.5">
                            <Shield size={9} /> Mod
                          </span>
                        ) : null}

                        {/* Whisper tag */}
                        {isWhisper && (
                          <span className="text-[9px] font-mono font-bold px-1.5 py-0.2 rounded bg-purple-900/60 text-purple-200 border border-purple-500/40 flex items-center gap-1">
                            <Lock size={9} />
                            {isMe ? `Whisper to @${msg.whisperTo?.join(', @')}` : `Whisper from @${msg.senderUsername}`}
                          </span>
                        )}
                      </div>

                      {/* Timestamp */}
                      <span
                        className="text-[10px] text-neutral-500 font-mono shrink-0 select-none"
                        title={new Date(msg.timestamp).toLocaleString()}
                      >
                        {formatTime(msg.timestamp)}
                      </span>
                    </div>

                    {/* Message content */}
                    <div className="text-xs sm:text-[13px] text-neutral-200 leading-relaxed break-words whitespace-pre-wrap selection:bg-blue-900 selection:text-white">
                      {msg.text}
                    </div>

                    {/* Hover action toolbar */}
                    <div className="mt-1.5 pt-1 border-t border-neutral-800/60 flex items-center justify-end gap-1 opacity-90 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                      {/* Reply button */}
                      <button
                        onClick={() => {
                          setReplyingTo(msg);
                          inputRef.current?.focus();
                        }}
                        className="px-1.5 py-0.5 text-[10px] text-neutral-400 hover:text-blue-300 hover:bg-neutral-800 rounded transition-colors flex items-center gap-1 cursor-pointer"
                        title="Reply to this message"
                      >
                        <Reply size={11} /> Reply
                      </button>

                      {/* Quick Whisper button if not me */}
                      {!isMe && (
                        <button
                          onClick={() => {
                            setWhisperRecipient(msg.senderUsername);
                            inputRef.current?.focus();
                          }}
                          className="px-1.5 py-0.5 text-[10px] text-neutral-400 hover:text-purple-300 hover:bg-neutral-800 rounded transition-colors flex items-center gap-1 cursor-pointer"
                          title={`Whisper to @${msg.senderUsername}`}
                        >
                          <Lock size={10} /> Whisper
                        </button>
                      )}

                      {/* Delete button for sender or host/mod/admin */}
                      {canDeleteMessage(msg) && (
                        <button
                          onClick={() => handleDelete(msg.id)}
                          disabled={deletingId === msg.id}
                          className="px-1.5 py-0.5 text-[10px] text-neutral-500 hover:text-red-400 hover:bg-neutral-800 rounded transition-colors flex items-center gap-1 cursor-pointer disabled:opacity-50"
                          title={isMe ? "Delete your message" : "Moderator: Delete player message"}
                        >
                          <Trash2 size={11} />
                          {deletingId === msg.id ? 'Deleting...' : 'Delete'}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Reply Banner */}
          {replyingTo && (
            <div className="px-3 py-1.5 bg-blue-950/70 border-t border-blue-800/60 flex items-center justify-between text-xs text-blue-200 shrink-0">
              <div className="flex items-center gap-1.5 truncate">
                <Reply size={12} className="text-blue-400 shrink-0" />
                <span className="font-semibold text-blue-300 truncate">
                  Replying to {replyingTo.characterName || `@${replyingTo.senderUsername}`}:
                </span>
                <span className="text-[11px] text-neutral-300 truncate italic">
                  "{replyingTo.text}"
                </span>
              </div>
              <button
                onClick={() => setReplyingTo(null)}
                className="p-1 text-neutral-400 hover:text-white rounded transition-colors cursor-pointer shrink-0"
                title="Cancel reply"
              >
                <X size={12} />
              </button>
            </div>
          )}

          {/* Target Whisper Selector */}
          <div className="px-3 py-1.5 bg-neutral-900 border-t border-neutral-800 flex items-center justify-between gap-2 text-xs shrink-0">
            <div className="flex items-center gap-1.5 text-neutral-400 text-[11px]">
              {whisperRecipient === 'all' ? (
                <Users size={12} className="text-blue-400" />
              ) : (
                <Lock size={12} className="text-purple-400" />
              )}
              <span>Send To:</span>
            </div>

            <div className="flex items-center gap-1 flex-1 max-w-[220px]">
              <select
                value={whisperRecipient}
                onChange={(e) => setWhisperRecipient(e.target.value)}
                className={`w-full text-[11px] font-mono px-2 py-1 rounded border transition-colors outline-none cursor-pointer ${
                  whisperRecipient === 'all'
                    ? 'bg-neutral-950 text-neutral-200 border-neutral-700'
                    : 'bg-purple-950/90 text-purple-200 border-purple-600'
                }`}
              >
                <option value="all">Everyone (Public Chat)</option>
                {otherPlayers.map((p) => (
                  <option key={p.username} value={p.username}>
                    🔒 Whisper: {p.characterName ? `${p.characterName} (@${p.username})` : `@${p.username}`}
                  </option>
                ))}
              </select>

              {whisperRecipient !== 'all' && (
                <button
                  type="button"
                  onClick={() => setWhisperRecipient('all')}
                  className="p-1 text-neutral-400 hover:text-white rounded"
                  title="Switch back to public chat"
                >
                  <X size={12} />
                </button>
              )}
            </div>
          </div>

          {/* Input & Send Form */}
          <form
            onSubmit={handleSend}
            className="p-2 sm:p-2.5 bg-neutral-950 border-t border-neutral-800 flex items-center gap-2 shrink-0"
          >
            <input
              ref={inputRef}
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder={
                whisperRecipient === 'all'
                  ? "Type message to all players (or /w user message)..."
                  : `Whisper message to @${whisperRecipient}...`
              }
              className={`flex-1 min-w-0 bg-neutral-900 border rounded-xl px-3 py-2 text-xs sm:text-[13px] text-white placeholder-neutral-500 focus:outline-none transition-all ${
                whisperRecipient !== 'all'
                  ? 'border-purple-600 focus:border-purple-400 focus:ring-1 focus:ring-purple-500/30'
                  : 'border-neutral-700 focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30'
              }`}
            />

            <button
              type="submit"
              disabled={!inputText.trim() || isSending}
              className={`p-2 sm:px-3 sm:py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shrink-0 ${
                whisperRecipient !== 'all'
                  ? 'bg-purple-600 hover:bg-purple-500 text-white shadow-lg shadow-purple-900/30'
                  : 'bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-900/30'
              }`}
              title="Send message (Enter)"
            >
              <Send size={14} />
              <span className="hidden sm:inline">Send</span>
            </button>
          </form>
        </div>
      )}
    </>
  );
};
