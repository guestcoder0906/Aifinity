import React, { useState, useEffect } from 'react';
import {
  Users,
  X,
  Play,
  LogOut,
  Trash2,
  AlertTriangle,
  Sparkles,
  Shield,
  Clock,
  User,
  ExternalLink,
  RefreshCw,
  Crown
} from 'lucide-react';
import { MultiplayerService } from '../services/multiplayer';
import { UserProfile } from '../services/authService';

interface ActiveRoomData {
  id: string;
  hostUsername: string;
  state: any;
  isHost: boolean;
  characterName?: string;
  playerCount: number;
  gameState: string;
  worldTime?: string;
}

interface ActiveMultiplayerGamesModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: UserProfile | null;
  onSelectRoom: (roomId: string) => void;
  onOpenMarket?: (tab?: 'packs' | 'subscriptions') => void;
  slotLimitWarning?: boolean;
}

export const ActiveMultiplayerGamesModal: React.FC<ActiveMultiplayerGamesModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  onSelectRoom,
  onOpenMarket,
  slotLimitWarning = false
}) => {
  const [activeRooms, setActiveRooms] = useState<ActiveRoomData[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [roomToDelete, setRoomToDelete] = useState<ActiveRoomData | null>(null);
  const [roomToLeave, setRoomToLeave] = useState<ActiveRoomData | null>(null);
  const [showDeleteAllConfirm, setShowDeleteAllConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isDeletingAll, setIsDeletingAll] = useState(false);
  const [leavingRoomId, setLeavingRoomId] = useState<string | null>(null);

  const isFreeTier = !currentUser || currentUser.tier === 'free' || !currentUser.tier;
  const isStaff = currentUser?.role === 'admin' || currentUser?.role === 'mod';
  const hasUnlimitedSlots = !isFreeTier || isStaff;

  const loadRooms = async () => {
    if (!currentUser?.username) return;
    try {
      setLoading(true);
      setError(null);
      const rooms = await MultiplayerService.getUserActiveRooms(currentUser.username);
      setActiveRooms(rooms);
    } catch (err: any) {
      console.error("Failed to load active rooms:", err);
      setError(err?.message || "Could not retrieve your active multiplayer adventures.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && currentUser?.username) {
      loadRooms();
    }
  }, [isOpen, currentUser?.username]);

  if (!isOpen) return null;

  const handleConfirmLeave = async () => {
    if (!roomToLeave || !currentUser?.username) return;
    try {
      setLeavingRoomId(roomToLeave.id);
      await MultiplayerService.leaveRoomPermanently(roomToLeave.id, currentUser.username);
      setRoomToLeave(null);
      await loadRooms();
    } catch (err: any) {
      setError(err?.message || "Failed to leave multiplayer room.");
    } finally {
      setLeavingRoomId(null);
    }
  };

  const handleConfirmDelete = async () => {
    if (!roomToDelete || !currentUser) return;
    try {
      setIsDeleting(true);
      await MultiplayerService.deleteRoomPermanently(roomToDelete.id, {
        username: currentUser.username,
        role: currentUser.role
      });
      setRoomToDelete(null);
      await loadRooms();
    } catch (err: any) {
      setError(err?.message || "Failed to delete multiplayer adventure.");
    } finally {
      setIsDeleting(false);
    }
  };

  const handleDeleteAllRooms = async () => {
    if (!currentUser?.username || activeRooms.length === 0) return;
    try {
      setIsDeletingAll(true);
      setError(null);

      for (const room of activeRooms) {
        const canDelete = room.isHost || isStaff;
        try {
          if (canDelete) {
            await MultiplayerService.deleteRoomPermanently(room.id, {
              username: currentUser.username,
              role: currentUser.role
            });
          } else {
            await MultiplayerService.leaveRoomPermanently(room.id, currentUser.username);
          }
        } catch (roomErr) {
          console.warn(`Error processing room ${room.id}:`, roomErr);
        }
      }

      setShowDeleteAllConfirm(false);
      await loadRooms();
    } catch (err: any) {
      setError(err?.message || "Failed to delete all multiplayer games.");
    } finally {
      setIsDeletingAll(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/85 backdrop-blur-md p-3 sm:p-4 overflow-y-auto font-sans"
    >
      <div className="bg-neutral-900 border border-neutral-700 w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden flex flex-col my-auto max-h-[88vh] animate-in fade-in zoom-in-95 duration-150">
        
        {/* Header */}
        <div className="px-5 py-4 bg-gradient-to-r from-neutral-950 via-neutral-900 to-blue-950/40 border-b border-neutral-800 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-500/20 border border-blue-500/40 text-blue-400 flex items-center justify-center shrink-0">
              <Users size={20} />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                My Multiplayer Adventures
                <button
                  onClick={loadRooms}
                  disabled={loading}
                  className="p-1 text-neutral-400 hover:text-white rounded transition-colors cursor-pointer"
                  title="Refresh active games"
                >
                  <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
                </button>
              </h2>
              <p className="text-xs text-neutral-400">
                Active cooperative games you have created or joined
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors cursor-pointer"
            title="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Slot Limits Status Bar */}
        <div className="px-5 py-2.5 bg-neutral-950/90 border-b border-neutral-800/80 flex flex-wrap items-center justify-between gap-2 text-xs shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-neutral-400">Active Game Slots:</span>
            {hasUnlimitedSlots ? (
              <span className="font-bold text-cyan-400 flex items-center gap-1 font-mono">
                <Crown size={12} className="text-cyan-400" />
                {activeRooms.length} Active (Unlimited Slots - {currentUser?.tier?.toUpperCase() || 'STAFF'})
              </span>
            ) : (
              <span className="font-bold text-amber-400 font-mono">
                {activeRooms.length} / 1 Active (Free Tier)
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {activeRooms.length > 0 && (
              <button
                onClick={() => setShowDeleteAllConfirm(true)}
                disabled={loading || isDeletingAll}
                className="px-2.5 py-1 bg-red-950/70 hover:bg-red-900 text-red-300 border border-red-800/80 rounded-lg text-[11px] font-semibold flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
                title="Delete or clear all active multiplayer games"
              >
                <Trash2 size={12} className="text-red-400" />
                <span>Delete All</span>
              </button>
            )}

            {!hasUnlimitedSlots && onOpenMarket && (
              <button
                onClick={() => {
                  onClose();
                  onOpenMarket('subscriptions');
                }}
                className="text-[11px] font-semibold text-amber-400 hover:text-amber-300 flex items-center gap-1 cursor-pointer transition-colors"
              >
                <Sparkles size={12} />
                <span>Upgrade for Unlimited Slots</span>
              </button>
            )}
          </div>
        </div>

        {/* Slot Limit Warning Banner if opened due to cap */}
        {slotLimitWarning && !hasUnlimitedSlots && activeRooms.length >= 1 && (
          <div className="mx-4 mt-4 p-3 bg-amber-950/50 border border-amber-500/50 rounded-xl text-xs text-amber-200 flex items-start gap-2.5">
            <AlertTriangle size={16} className="text-amber-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <div className="font-bold text-amber-300">Active Multiplayer Slot Limit Reached</div>
              <p className="text-[11px] text-amber-200/90 leading-relaxed">
                Free tier adventurers can only participate in <strong>1 active multiplayer game slot</strong> at a time. Leave an existing game below or upgrade in the Market to unlock unlimited multiplayer slots.
              </p>
            </div>
          </div>
        )}

        {/* Content / Game List */}
        <div className="p-4 sm:p-5 flex-1 min-h-0 overflow-y-auto space-y-3">
          {error && (
            <div className="p-3 bg-red-950/60 border border-red-800 text-red-300 text-xs rounded-xl flex items-center gap-2">
              <AlertTriangle size={15} />
              <span>{error}</span>
            </div>
          )}

          {loading ? (
            <div className="py-12 flex flex-col items-center justify-center text-neutral-400 space-y-3">
              <RefreshCw size={24} className="animate-spin text-blue-400" />
              <p className="text-xs">Scanning active multiplayer realms...</p>
            </div>
          ) : activeRooms.length === 0 ? (
            <div className="py-12 flex flex-col items-center justify-center text-center text-neutral-400 space-y-3">
              <div className="w-12 h-12 rounded-full bg-neutral-950 border border-neutral-800 flex items-center justify-center text-neutral-500">
                <Users size={22} />
              </div>
              <p className="text-sm font-semibold text-neutral-300">No active multiplayer adventures found.</p>
              <p className="text-xs text-neutral-500 max-w-sm leading-relaxed">
                You are not currently enrolled in any multiplayer rooms. Host a new adventure or join an existing realm code from the main menu!
              </p>
            </div>
          ) : (
            activeRooms.map((room) => {
              const playersList = Array.isArray(room.state?.players) ? room.state.players : [];
              const canDelete = room.isHost || isStaff;

              return (
                <div
                  key={room.id}
                  className="bg-neutral-950 border border-neutral-800 hover:border-neutral-700 rounded-xl p-4 transition-all shadow-md space-y-3"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2.5">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-lg font-black font-mono tracking-widest text-blue-400 bg-blue-950/50 px-2 py-0.5 rounded border border-blue-800/60">
                          {room.id}
                        </span>

                        {room.isHost ? (
                          <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40">
                            Host (Created by you)
                          </span>
                        ) : (
                          <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-neutral-800 text-neutral-300">
                            Participant
                          </span>
                        )}

                        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-neutral-900 text-neutral-400 border border-neutral-800">
                          {room.gameState === 'playing' ? '🟢 In Adventure' : room.gameState === 'character_creation' ? '🟡 Character Creation' : '⚪ Waiting For World'}
                        </span>
                      </div>

                      <div className="flex items-center gap-3 text-xs text-neutral-400 flex-wrap">
                        {room.characterName && (
                          <div className="flex items-center gap-1">
                            <User size={12} className="text-amber-400" />
                            <span>Character: <strong className="text-amber-300">{room.characterName}</strong></span>
                          </div>
                        )}
                        <div>
                          Host: <strong className="text-neutral-300">@{room.hostUsername}</strong>
                        </div>
                        {room.worldTime && (
                          <div className="flex items-center gap-1">
                            <Clock size={12} className="text-blue-400" />
                            <span>{room.worldTime}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Action buttons for this room */}
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => {
                          onClose();
                          onSelectRoom(room.id);
                        }}
                        className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded-lg flex items-center gap-1.5 shadow-md shadow-blue-900/30 transition-all cursor-pointer"
                        title="Resume playing this multiplayer adventure"
                      >
                        <Play size={13} />
                        <span>Resume Adventure</span>
                      </button>

                      {!room.isHost && (
                        <button
                          onClick={() => setRoomToLeave(room)}
                          disabled={leavingRoomId === room.id}
                          className="px-2.5 py-1.5 bg-neutral-900 hover:bg-neutral-800 text-neutral-300 hover:text-red-300 border border-neutral-700 rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer disabled:opacity-50"
                          title="Leave this adventure and free up your slot"
                        >
                          <LogOut size={12} />
                          <span>Leave</span>
                        </button>
                      )}

                      {canDelete && (
                        <button
                          onClick={() => setRoomToDelete(room)}
                          className="px-2.5 py-1.5 bg-red-950/60 hover:bg-red-900 text-red-300 border border-red-800/80 rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer"
                          title="Permanently delete this multiplayer adventure"
                        >
                          <Trash2 size={12} />
                          <span>Delete</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Players list */}
                  {playersList.length > 0 && (
                    <div className="pt-2 border-t border-neutral-900 flex items-center gap-2 text-[11px] text-neutral-400 flex-wrap">
                      <span className="font-semibold text-neutral-300 flex items-center gap-1">
                        <Users size={12} /> Players ({playersList.length}):
                      </span>
                      {playersList.map((p: any, idx: number) => (
                        <span
                          key={p.username || idx}
                          className={`px-1.5 py-0.2 rounded font-mono ${
                            p.status === 'active'
                              ? 'bg-emerald-950/70 text-emerald-300 border border-emerald-800/60'
                              : 'bg-neutral-900 text-neutral-500'
                          }`}
                        >
                          @{p.username} {p.status === 'active' ? '●' : '○'}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 bg-neutral-950 border-t border-neutral-800 flex flex-wrap items-center justify-between gap-2 text-xs text-neutral-400 shrink-0">
          <div className="flex items-center gap-3 flex-wrap">
            <span>Adventures persist until deleted by host, moderator, or administrator.</span>
            {activeRooms.length > 0 && (
              <button
                onClick={() => setShowDeleteAllConfirm(true)}
                disabled={loading || isDeletingAll}
                className="text-red-400 hover:text-red-300 font-semibold cursor-pointer disabled:opacity-50 flex items-center gap-1 transition-colors"
                title="Delete or leave all active multiplayer games"
              >
                <Trash2 size={12} />
                <span>Delete All ({activeRooms.length})</span>
              </button>
            )}
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-white rounded-lg transition-colors cursor-pointer font-semibold"
          >
            Close
          </button>
        </div>

      </div>

      {/* Confirmation Dialog for Leaving Adventure */}
      {roomToLeave && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/90 p-4 font-sans animate-in fade-in duration-150"
        >
          <div className="bg-neutral-900 border border-neutral-700 rounded-xl p-5 sm:p-6 max-w-md w-full text-neutral-200 shadow-2xl space-y-4 animate-in zoom-in-95">
            <div className="flex items-center gap-3 text-amber-400">
              <div className="w-10 h-10 rounded-full bg-amber-500/20 border border-amber-500/40 flex items-center justify-center shrink-0">
                <LogOut size={20} />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Leave Multiplayer Adventure?</h3>
                <p className="text-xs text-neutral-400">Room Code: <strong className="text-amber-300 font-mono">{roomToLeave.id}</strong></p>
              </div>
            </div>

            <p className="text-xs text-neutral-300 leading-relaxed">
              Are you sure you want to leave this adventure? Your slot will be freed up. You can rejoin later using the room code if the game is still active.
            </p>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setRoomToLeave(null)}
                disabled={Boolean(leavingRoomId)}
                className="px-3.5 py-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmLeave}
                disabled={Boolean(leavingRoomId)}
                className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-neutral-950 font-bold rounded-lg text-xs transition-all shadow-lg shadow-amber-900/30 cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
              >
                <LogOut size={13} />
                <span>{leavingRoomId ? "Leaving..." : "Leave Adventure"}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Dialog for Permanent Deletion */}
      {roomToDelete && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/90 p-4 font-sans animate-in fade-in duration-150"
        >
          <div className="bg-neutral-900 border border-red-500/50 rounded-xl p-5 sm:p-6 max-w-md w-full text-neutral-200 shadow-2xl space-y-4 animate-in zoom-in-95">
            <div className="flex items-center gap-3 text-red-400">
              <div className="w-10 h-10 rounded-full bg-red-500/20 border border-red-500/40 flex items-center justify-center shrink-0">
                <Trash2 size={20} />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Permanently Delete Adventure?</h3>
                <p className="text-xs text-neutral-400">Room Code: <strong className="text-red-300 font-mono">{roomToDelete.id}</strong></p>
              </div>
            </div>

            <p className="text-xs text-neutral-300 leading-relaxed">
              Are you sure you want to permanently delete this multiplayer adventure? All world files, chat history, and character progress will be erased for all players. <strong className="text-red-400">This action cannot be undone.</strong>
            </p>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setRoomToDelete(null)}
                disabled={isDeleting}
                className="px-3.5 py-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={isDeleting}
                className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg text-xs font-bold transition-all shadow-lg shadow-red-900/30 cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
              >
                <Trash2 size={13} />
                <span>{isDeleting ? "Deleting..." : "Permanently Delete"}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Dialog for Delete All Multiplayer Games */}
      {showDeleteAllConfirm && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/90 p-4 font-sans animate-in fade-in duration-150"
        >
          <div className="bg-neutral-900 border border-red-500/60 rounded-xl p-5 sm:p-6 max-w-md w-full text-neutral-200 shadow-2xl space-y-4 animate-in zoom-in-95">
            <div className="flex items-center gap-3 text-red-400">
              <div className="w-11 h-11 rounded-full bg-red-500/20 border border-red-500/40 flex items-center justify-center shrink-0">
                <Trash2 size={22} />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Delete All Multiplayer Games?</h3>
                <p className="text-xs text-neutral-400">
                  Total Active Games: <strong className="text-red-300 font-mono">{activeRooms.length}</strong>
                </p>
              </div>
            </div>

            <p className="text-xs text-neutral-300 leading-relaxed">
              Are you sure you want to delete all <strong className="text-white font-semibold">{activeRooms.length} active multiplayer adventures</strong>? 
              Games hosted by you will be permanently deleted for all players, and games you joined will be cleared from your active list.
              <span className="block mt-1.5 text-red-400 font-bold">This action cannot be undone.</span>
            </p>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setShowDeleteAllConfirm(false)}
                disabled={isDeletingAll}
                className="px-3.5 py-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded-lg text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteAllRooms}
                disabled={isDeletingAll}
                className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg text-xs font-bold transition-all shadow-lg shadow-red-900/30 cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
              >
                <Trash2 size={13} className={isDeletingAll ? 'animate-spin' : ''} />
                <span>{isDeletingAll ? "Deleting All Games..." : "Delete All Games"}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
