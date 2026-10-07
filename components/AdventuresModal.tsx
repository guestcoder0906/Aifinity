import React, { useState, useEffect } from 'react';
import {
  X,
  Bookmark,
  Plus,
  Play,
  Share2,
  Trash2,
  Lock,
  Sparkles,
  Clock,
  Calendar,
  Layers,
  ArrowRight,
  AlertTriangle,
  CheckCircle2
} from 'lucide-react';
import { AdventuresService, SavedAdventure } from '../services/adventuresService';
import { UserProfile, isDefaultAdmin } from '../services/authService';
import { NarrativeEntry } from '../types';
import { FileSystem } from '../services/fileSystem';

interface AdventuresModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: UserProfile | null;
  guestId: string;
  fileSystem: FileSystem;
  narrative: NarrativeEntry[];
  onLoadAdventure: (adventure: SavedAdventure) => void;
  onOpenMarket: (tab?: 'packs' | 'subscriptions' | 'apikey') => void;
  onOpenCommunityShare: (adventure: SavedAdventure) => void;
}

export const AdventuresModal: React.FC<AdventuresModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  guestId = '',
  fileSystem,
  narrative = [],
  onLoadAdventure,
  onOpenMarket,
  onOpenCommunityShare
}) => {
  const [adventures, setAdventures] = useState<SavedAdventure[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [isDeletingId, setIsDeletingId] = useState<string | null>(null);

  const isAdmin = currentUser?.role === 'admin' || isDefaultAdmin(currentUser?.email, currentUser?.username);
  const isMod = currentUser?.role === 'mod';
  const isSubscriber = currentUser?.tier === 'adventurer' || currentUser?.tier === 'legendary' || currentUser?.tier === 'celestial';
  const canSaveMultiple = Boolean(currentUser?.canSaveMultipleAdventures || isAdmin || isMod || isSubscriber);

  const isFetchingRef = React.useRef(false);

  const loadList = async (showFullSpinner = false) => {
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;
    if (showFullSpinner) {
      setIsLoading(true);
    }
    try {
      const list = await AdventuresService.getSavedAdventures(currentUser, guestId);
      setAdventures(list);
    } catch (err) {
      console.warn('Failed to load saved adventures list:', err);
    } finally {
      setIsLoading(false);
      isFetchingRef.current = false;
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadList(adventures.length === 0);
      setSaveError(null);
      setSaveSuccess(false);
      setNewTitle('');
      setConfirmDeleteId(null);
    }
  }, [isOpen, currentUser?.uid, guestId]);

  if (!isOpen) return null;

  const handleSaveCurrent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    setSaveError(null);
    setSaveSuccess(false);

    // Free users check: locked if they already have 1 saved adventure and do not have multiple saves permission
    if (!canSaveMultiple && (adventures || []).length >= 1) {
      setSaveError('Saving multiple adventures is locked for Free users. Upgrade to Adventurer tier ($4.99/mo) in the Market or receive permission from an Admin/Mod to unlock unlimited adventure slots!');
      return;
    }

    setIsSaving(true);
    try {
      const allFiles = fileSystem ? fileSystem.getAll() : {};
      const firstUserEntry = (narrative || []).find(n => n.type === 'user');
      const firstAiEntry = (narrative || []).find(n => n.type === 'ai');

      const res = await AdventuresService.saveAdventure(currentUser, guestId, {
        title: newTitle.trim(),
        startingPrompt: firstUserEntry?.text || 'Starting scenario',
        initialAiGeneration: firstAiEntry?.text || '',
        narrative: narrative || [],
        files: allFiles
      });

      if (res.success) {
        setSaveSuccess(true);
        setNewTitle('');
        await loadList();
      } else {
        setSaveError(res.message || 'Failed to save adventure.');
      }
    } catch (e: any) {
      setSaveError(e.message || 'Error saving adventure.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    setIsDeletingId(id);
    const prevList = [...adventures];
    // Immediate optimistic removal so user sees the adventure vanish instantly
    setAdventures(prev => prev.filter(a => a.id !== id));
    setConfirmDeleteId(null);

    try {
      await AdventuresService.deleteAdventure(currentUser, guestId, id);
    } catch (err) {
      console.error('Failed to delete adventure:', err);
      // Revert if error
      setAdventures(prevList);
    } finally {
      setIsDeletingId(null);
      // Reload in background to ensure sync
      try {
        const freshList = await AdventuresService.getSavedAdventures(currentUser, guestId);
        setAdventures(freshList);
      } catch (e) {}
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 md:p-4 bg-black/85 backdrop-blur-sm animate-in fade-in duration-200 font-sans">
      <div className="bg-neutral-900 border border-neutral-700 w-full max-w-2xl max-h-[85vh] rounded-xl shadow-2xl flex flex-col overflow-hidden text-neutral-200">
        
        {/* Header */}
        <div className="p-4 md:p-5 border-b border-neutral-800 bg-neutral-950 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-blue-950/60 border border-blue-800/60 flex items-center justify-center text-blue-400">
              <Bookmark size={20} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                Saved Adventures
                {!isSubscriber && (
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-neutral-800 text-neutral-400 border border-neutral-700">
                    Free Tier: 1 Slot Limit
                  </span>
                )}
                {isSubscriber && (
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40">
                    Unlimited Slots Active
                  </span>
                )}
              </h2>
              <p className="text-xs text-neutral-400">
                Save, load, and manage your multiverse campaigns
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-neutral-400 hover:text-white p-1 rounded-lg hover:bg-neutral-800 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Save Current Adventure Form */}
        <div className="p-4 bg-neutral-950/60 border-b border-neutral-800">
          <form onSubmit={handleSaveCurrent} className="flex flex-col gap-2">
            <label className="text-xs font-semibold text-neutral-300 flex items-center justify-between">
              <span>Save Current Adventure State</span>
              <span className="text-[11px] text-neutral-400 font-normal">
                {(narrative || []).length} story events recorded
              </span>
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="e.g., Cyberpunk Underworld Chapter 1"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                className="flex-1 bg-black border border-neutral-700 rounded-lg px-3 py-2 text-xs text-white placeholder-neutral-500 focus:border-blue-500 focus:outline-none"
              />
              <button
                type="submit"
                disabled={isSaving || !newTitle.trim()}
                className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-bold px-4 py-2 rounded-lg flex items-center gap-1.5 transition-colors shrink-0"
              >
                <Plus size={14} />
                <span>{isSaving ? 'Saving...' : 'Save Current'}</span>
              </button>
            </div>

            {saveSuccess && (
              <p className="text-xs text-emerald-400 font-mono flex items-center gap-1.5 mt-1">
                <CheckCircle2 size={13} />
                Adventure saved successfully!
              </p>
            )}

            {saveError && (
              <div className="bg-amber-950/40 border border-amber-500/50 p-3 rounded-lg text-xs text-amber-200 mt-2 space-y-2">
                <div className="flex items-start gap-2">
                  <AlertTriangle size={15} className="text-amber-400 shrink-0 mt-0.5" />
                  <span>{saveError}</span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenMarket('subscriptions');
                  }}
                  className="bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-400 text-neutral-950 font-bold text-xs px-3 py-1.5 rounded flex items-center gap-1.5 shadow"
                >
                  <span>Upgrade to Adventurer ($9.99/mo)</span>
                  <ArrowRight size={13} />
                </button>
              </div>
            )}
          </form>
        </div>

        {/* Adventures List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {isLoading && adventures.length === 0 ? (
            <div className="text-center py-8 text-xs text-neutral-400 animate-pulse">
              Loading your saved adventures...
            </div>
          ) : (adventures || []).length === 0 ? (
            <div className="text-center py-10 space-y-2">
              <Bookmark size={32} className="mx-auto text-neutral-600 mb-2" />
              <h4 className="text-sm font-semibold text-neutral-300">No Saved Adventures Yet</h4>
              <p className="text-xs text-neutral-400 max-w-sm mx-auto">
                Type a name above and click "Save Current" to preserve your story, character stats, and generated world files.
              </p>
            </div>
          ) : (
            adventures.map((adv) => (
              <div
                key={adv.id}
                className="bg-neutral-950 border border-neutral-800 hover:border-neutral-700 rounded-xl p-4 transition-all flex flex-col justify-between gap-3"
              >
                <div>
                  <div className="flex justify-between items-start">
                    <h3 className="text-sm font-bold text-white">{adv.title}</h3>
                    <div className="flex items-center gap-1.5 text-[11px] text-neutral-400 font-mono">
                      <Calendar size={12} />
                      <span>{new Date(adv.createdAt).toLocaleDateString()}</span>
                    </div>
                  </div>

                  <p className="text-xs text-neutral-400 line-clamp-2 mt-1 italic">
                    "{adv.startingPrompt}"
                  </p>

                  <div className="flex items-center gap-4 text-[11px] text-neutral-400 mt-2 font-mono">
                    <span className="flex items-center gap-1">
                      <Layers size={12} />
                      {adv.turnCount} turns
                    </span>
                    <span>
                      {Object.keys(adv.files || {}).length} world files
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-neutral-900">
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        onLoadAdventure(adv);
                        onClose();
                      }}
                      className="bg-blue-600/90 hover:bg-blue-600 text-white text-xs font-semibold px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-colors"
                    >
                      <Play size={13} />
                      <span>Load / Play</span>
                    </button>
                    <button
                      onClick={() => {
                        onOpenCommunityShare(adv);
                      }}
                      className="bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs font-medium px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-colors"
                    >
                      <Share2 size={13} className="text-amber-400" />
                      <span>Share to Community</span>
                    </button>
                  </div>

                  {confirmDeleteId === adv.id ? (
                    <div className="flex items-center gap-1.5 bg-red-950/80 border border-red-800/80 px-2 py-1 rounded-lg">
                      <span className="text-[11px] text-red-300 font-semibold">Delete?</span>
                      <button
                        onClick={() => handleDelete(adv.id)}
                        disabled={isDeletingId === adv.id}
                        className="bg-red-600 hover:bg-red-500 text-white text-[11px] font-bold px-2 py-0.5 rounded transition-colors disabled:opacity-50 cursor-pointer"
                      >
                        {isDeletingId === adv.id ? 'Deleting...' : 'Yes'}
                      </button>
                      <button
                        onClick={() => setConfirmDeleteId(null)}
                        disabled={isDeletingId === adv.id}
                        className="bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-[11px] px-2 py-0.5 rounded transition-colors cursor-pointer"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setConfirmDeleteId(adv.id)}
                      className="text-neutral-500 hover:text-red-400 p-1.5 rounded hover:bg-neutral-900 transition-colors cursor-pointer"
                      title="Delete Adventure"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

      </div>
    </div>
  );
};

export default AdventuresModal;
