import React, { useState, useEffect } from 'react';
import {
  X,
  Globe,
  Share2,
  Play,
  Sparkles,
  Search,
  Filter,
  Lock,
  ArrowRight,
  BookOpen,
  Calendar,
  Layers,
  Crown,
  CheckCircle2,
  AlertTriangle,
  FileText,
  Trash2,
  Heart,
  MessageSquare,
  Send,
  CornerDownRight,
  TrendingUp,
  Clock
} from 'lucide-react';
import {
  AdventuresService,
  CommunityAdventure,
  CommunityShareType,
  CommunityComment,
  SavedAdventure
} from '../services/adventuresService';
import { UserProfile, isDefaultAdmin } from '../services/authService';
import { NarrativeEntry } from '../types';
import { FileSystem } from '../services/fileSystem';
import GoldenName from './GoldenName';

interface CommunityAdventuresModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: UserProfile | null;
  fileSystem: FileSystem;
  narrative: NarrativeEntry[];
  initialAdventureToShare?: SavedAdventure | null;
  onPlayCommunityAdventure: (adventure: CommunityAdventure) => void;
  onOpenMarket: (tab?: 'packs' | 'subscriptions' | 'apikey') => void;
}

export const CommunityAdventuresModal: React.FC<CommunityAdventuresModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  fileSystem,
  narrative = [],
  initialAdventureToShare,
  onPlayCommunityAdventure,
  onOpenMarket
}) => {
  const [adventures, setAdventures] = useState<CommunityAdventure[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [shareFilter, setShareFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'newest' | 'popular'>('newest');

  // Expanded comments section state
  const [expandedCommentsAdvId, setExpandedCommentsAdvId] = useState<string | null>(null);
  const [commentInput, setCommentInput] = useState<{ [advId: string]: string }>({});
  const [isSubmittingComment, setIsSubmittingComment] = useState<{ [advId: string]: boolean }>({});
  const [likeWarning, setLikeWarning] = useState<string | null>(null);

  // Sharing Dialog State
  const [isPostingModalOpen, setIsPostingModalOpen] = useState(false);
  const [postTitle, setPostTitle] = useState('');
  const [selectedShareType, setSelectedShareType] = useState<CommunityShareType>('full');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [postError, setPostError] = useState<string | null>(null);
  const [postSuccess, setPostSuccess] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deleteStatus, setDeleteStatus] = useState<string | null>(null);

  const isSubscriber = currentUser?.tier === 'adventurer' || currentUser?.tier === 'legendary' || currentUser?.tier === 'celestial';
  const isAdmin = currentUser?.role === 'admin' || isDefaultAdmin(currentUser?.email, currentUser?.username);
  const isMod = currentUser?.role === 'mod';
  const isStaff = isAdmin || isMod;
  const hasUnlimitedPosts = isSubscriber || isStaff || Boolean(currentUser?.canPostCommunityAdventures);

  const myPostsCount = adventures.filter(
    (a) => currentUser && (a.authorId === currentUser.uid || a.authorName.toLowerCase() === currentUser.username.toLowerCase())
  ).length;

  const canPost = !!currentUser && (hasUnlimitedPosts || myPostsCount < 1);

  const loadCommunityAdventures = async () => {
    setIsLoading(true);
    const list = await AdventuresService.getCommunityAdventures();
    setAdventures(list);
    setIsLoading(false);
  };

  const handleToggleLike = async (adv: CommunityAdventure) => {
    if (!currentUser) {
      setLikeWarning("Please log in to like community adventures.");
      setTimeout(() => setLikeWarning(null), 3500);
      return;
    }

    const isMyPost = (adv.authorId === currentUser.uid) || (adv.authorName.toLowerCase() === currentUser.username.toLowerCase());
    if (isMyPost) {
      setLikeWarning("You can't like your own community adventures!");
      setTimeout(() => setLikeWarning(null), 3500);
      return;
    }

    const alreadyLiked = adv.likedBy?.includes(currentUser.uid);
    const updatedLikedBy = alreadyLiked
      ? (adv.likedBy || []).filter(id => id !== currentUser.uid)
      : [...(adv.likedBy || []), currentUser.uid];
    const updatedLikesCount = updatedLikedBy.length;

    setAdventures(prev => prev.map(a => a.id === adv.id ? { ...a, likedBy: updatedLikedBy, likesCount: updatedLikesCount } : a));

    const res = await AdventuresService.toggleLikeCommunityAdventure(adv.id, currentUser);
    if (!res.success) {
      setLikeWarning(res.message || "Failed to update like.");
      setTimeout(() => setLikeWarning(null), 3500);
      loadCommunityAdventures();
    }
  };

  const handleAddComment = async (advId: string) => {
    const text = (commentInput[advId] || '').trim();
    if (!text) return;
    if (!currentUser) {
      setLikeWarning("Please log in to comment on community adventures.");
      setTimeout(() => setLikeWarning(null), 3500);
      return;
    }

    try {
      setIsSubmittingComment(prev => ({ ...prev, [advId]: true }));
      const res = await AdventuresService.addCommunityComment(advId, currentUser, text);
      if (res.success && res.comment) {
        setAdventures(prev => prev.map(a => {
          if (a.id === advId) {
            return {
              ...a,
              comments: [...(a.comments || []), res.comment!]
            };
          }
          return a;
        }));
        setCommentInput(prev => ({ ...prev, [advId]: '' }));
      } else {
        alert(res.message || "Failed to post comment.");
      }
    } catch (err: any) {
      alert(err.message || "Failed to post comment.");
    } finally {
      setIsSubmittingComment(prev => ({ ...prev, [advId]: false }));
    }
  };

  const handleDeleteComment = async (advId: string, commentId: string) => {
    if (!currentUser) return;
    try {
      const res = await AdventuresService.deleteCommunityComment(advId, commentId, currentUser);
      if (res.success) {
        setAdventures(prev => prev.map(a => {
          if (a.id === advId) {
            return {
              ...a,
              comments: (a.comments || []).filter(c => c.id !== commentId)
            };
          }
          return a;
        }));
      } else {
        alert(res.message || "Failed to delete comment.");
      }
    } catch (err: any) {
      alert(err.message || "Failed to delete comment.");
    }
  };

  const handleDeletePost = async (advId: string, title: string) => {
    if (confirmDeleteId !== advId) {
      setConfirmDeleteId(advId);
      return;
    }
    setConfirmDeleteId(null);
    const res = await AdventuresService.deleteCommunityAdventure(advId, currentUser);
    if (res.success) {
      setAdventures((prev) => prev.filter((a) => a.id !== advId));
      setDeleteStatus(`Removed "${title}" from community adventures.`);
      setTimeout(() => setDeleteStatus(null), 4000);
    } else {
      setDeleteStatus(res.message || 'Failed to remove post.');
      setTimeout(() => setDeleteStatus(null), 4000);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadCommunityAdventures();
      if (initialAdventureToShare) {
        setPostTitle(initialAdventureToShare.title);
        setIsPostingModalOpen(true);
      }
    }
  }, [isOpen, initialAdventureToShare]);

  if (!isOpen) return null;

  const handleOpenPostDialog = () => {
    setPostError(null);
    setPostSuccess(false);

    if (!currentUser) {
      setPostError('You must be logged into an account to post adventures.');
      setIsPostingModalOpen(true);
      return;
    }

    if (!canPost) {
      setPostError('Free tier adventurers can have a maximum of 1 active posted adventure in Community Adventures. Delete your existing post or upgrade to an Adventurer subscription for unlimited community posts!');
      setIsPostingModalOpen(true);
      return;
    }

    if (!initialAdventureToShare) {
      const firstUser = (narrative || []).find(n => n.type === 'user');
      setPostTitle(firstUser?.text ? firstUser.text.substring(0, 40) + '...' : 'Epic Community Adventure');
    }
    setIsPostingModalOpen(true);
  };

  const handlePostAdventure = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!postTitle.trim()) return;

    if (!currentUser) {
      setPostError('You must be logged into an account to post to Community Adventures.');
      return;
    }

    if (!canPost) {
      setPostError('Free tier adventurers can have a maximum of 1 active posted adventure. Delete your existing post or upgrade in the Market for unlimited community adventure slots!');
      return;
    }

    setIsSubmitting(true);
    setPostError(null);

    try {
      let promptText = '';
      let initialAi = '';
      let fullNarrative: NarrativeEntry[] | undefined = undefined;
      let fullFiles: Record<string, string> | undefined = undefined;

      if (initialAdventureToShare) {
        promptText = initialAdventureToShare.startingPrompt;
        initialAi = initialAdventureToShare.initialAiGeneration;
        fullNarrative = initialAdventureToShare.narrative;
        fullFiles = initialAdventureToShare.files;
      } else {
        const firstUser = (narrative || []).find(n => n.type === 'user');
        const firstAi = (narrative || []).find(n => n.type === 'ai');
        promptText = firstUser?.text || 'Starting scenario';
        initialAi = firstAi?.text || '';
        fullNarrative = narrative || [];
        fullFiles = fileSystem?.getAll ? fileSystem.getAll() : {};
      }

      const res = await AdventuresService.postToCommunity(currentUser, {
        title: postTitle.trim(),
        shareType: selectedShareType,
        startingPrompt: promptText,
        initialAiGeneration: initialAi,
        narrative: fullNarrative,
        files: fullFiles
      });

      if (res.success) {
        setPostSuccess(true);
        await loadCommunityAdventures();
        setTimeout(() => {
          setIsPostingModalOpen(false);
          setPostSuccess(false);
        }, 1200);
      } else {
        setPostError(res.message || 'Failed to post adventure.');
      }
    } catch (e: any) {
      setPostError(e.message || 'Error occurred while sharing.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const filteredAdventures = adventures
    .filter(adv => {
      const matchesSearch =
        adv.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        adv.authorName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        adv.startingPrompt.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesFilter = shareFilter === 'all' || adv.shareType === shareFilter;
      return matchesSearch && matchesFilter;
    })
    .sort((a, b) => {
      if (sortBy === 'popular') {
        const diff = (b.likesCount || 0) - (a.likesCount || 0);
        if (diff !== 0) return diff;
      }
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

  const getShareTypeBadge = (type: CommunityShareType) => {
    switch (type) {
      case 'full':
        return { label: 'Exact Full Adventure', color: 'bg-purple-950/80 text-purple-300 border-purple-800' };
      case 'prompt_only':
        return { label: 'Only Starting Prompt', color: 'bg-blue-950/80 text-blue-300 border-blue-800' };
      case 'initial_generation':
        return { label: 'Initial AI World (0 Actions)', color: 'bg-emerald-950/80 text-emerald-300 border-emerald-800' };
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 md:p-4 bg-black/85 backdrop-blur-sm animate-in fade-in duration-200 font-sans">
      <div className="bg-neutral-900 border border-neutral-700 w-full max-w-4xl max-h-[88vh] rounded-xl shadow-2xl flex flex-col overflow-hidden text-neutral-200">
        
        {/* Header */}
        <div className="p-4 md:p-5 border-b border-neutral-800 bg-neutral-950 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-emerald-950/60 border border-emerald-800/60 flex items-center justify-center text-emerald-400">
              <Globe size={20} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                Community Adventures
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-900/40 text-emerald-300 border border-emerald-800/60">
                  Shared Multiverse
                </span>
              </h2>
              <p className="text-xs text-neutral-400">
                Explore worlds crafted by fellow adventurers or share your own stories
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <button
              onClick={handleOpenPostDialog}
              className="bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 text-neutral-950 text-xs font-bold px-3 py-1.5 rounded-lg flex items-center gap-1.5 shadow transition-all"
            >
              <Share2 size={13} />
              <span>Share Adventure</span>
            </button>
            <button
              onClick={onClose}
              className="text-neutral-400 hover:text-white p-1 rounded-lg hover:bg-neutral-800 transition-colors"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Filter & Search Bar */}
        <div className="p-3 bg-neutral-950/60 border-b border-neutral-800 flex flex-wrap gap-2 items-center justify-between">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={14} className="absolute left-3 top-2.5 text-neutral-500" />
            <input
              type="text"
              placeholder="Search adventures by title, prompt, or creator..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-black border border-neutral-700 rounded-lg pl-9 pr-3 py-1.5 text-xs text-white placeholder-neutral-500 focus:border-blue-500 focus:outline-none"
            />
          </div>

          <div className="flex items-center gap-2 text-xs flex-wrap">
            <div className="flex items-center gap-1.5">
              <Filter size={13} className="text-neutral-400" />
              <select
                value={shareFilter}
                onChange={(e) => setShareFilter(e.target.value)}
                className="bg-black border border-neutral-700 rounded-lg px-2.5 py-1.5 text-xs text-neutral-300 focus:outline-none cursor-pointer"
              >
                <option value="all">All Sharing Types</option>
                <option value="full">Exact Full Adventure</option>
                <option value="prompt_only">Only Starting Prompt</option>
                <option value="initial_generation">Initial AI World Generation</option>
              </select>
            </div>

            <div className="flex items-center gap-1.5">
              <TrendingUp size={13} className="text-amber-400" />
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as 'newest' | 'popular')}
                className="bg-black border border-neutral-700 rounded-lg px-2.5 py-1.5 text-xs text-neutral-300 focus:outline-none cursor-pointer"
              >
                <option value="newest">🕒 Newest First</option>
                <option value="popular">🔥 Most Popular (Most Likes)</option>
              </select>
            </div>
          </div>
        </div>

        {/* Free Tier Slot Status & Warning */}
        {currentUser && !hasUnlimitedPosts && (
          <div className="px-4 py-2 bg-neutral-950 border-b border-neutral-800 text-[11px] text-neutral-400 flex items-center justify-between flex-wrap gap-2">
            <div>
              <span>Community Adventure Slots: </span>
              <strong className={myPostsCount >= 1 ? "text-amber-400 font-mono" : "text-emerald-400 font-mono"}>
                {myPostsCount} / 1 Active Post (Free Tier)
              </strong>
            </div>
            {onOpenMarket && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenMarket('subscriptions');
                }}
                className="text-amber-400 hover:text-amber-300 flex items-center gap-1 font-semibold cursor-pointer"
              >
                <Sparkles size={11} /> Upgrade for Unlimited Posts
              </button>
            )}
          </div>
        )}

        {likeWarning && (
          <div className="px-4 py-2 bg-amber-950/80 border-b border-amber-600/70 text-xs text-amber-200 flex items-center justify-between animate-in fade-in">
            <span className="flex items-center gap-1.5 font-medium">
              <AlertTriangle size={13} className="text-amber-400" />
              {likeWarning}
            </span>
            <button
              onClick={() => setLikeWarning(null)}
              className="text-neutral-400 hover:text-white text-xs cursor-pointer ml-2"
            >
              &times;
            </button>
          </div>
        )}

        {deleteStatus && (
          <div className="px-6 py-2 bg-neutral-900 border-b border-neutral-800 text-xs text-amber-300 flex items-center justify-between">
            <span>{deleteStatus}</span>
            <button
              type="button"
              onClick={() => setDeleteStatus(null)}
              className="text-neutral-400 hover:text-white text-xs ml-2 cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Post Adventure Modal / Dialog Overlay */}
        {isPostingModalOpen && (
          <div className="p-5 bg-neutral-950 border-b border-amber-500/40 animate-in slide-in-from-top-2 duration-200">
            <div className="flex justify-between items-start mb-3">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Share2 size={16} className="text-amber-400" />
                  Publish Adventure to Community
                </h3>
                <p className="text-xs text-neutral-400">
                  Choose how you'd like to share this adventure with other players.
                </p>
              </div>
              <button
                onClick={() => setIsPostingModalOpen(false)}
                className="text-neutral-400 hover:text-white text-xs"
              >
                Cancel
              </button>
            </div>

            {postSuccess ? (
              <div className="p-3 bg-emerald-950/60 border border-emerald-500/50 rounded-lg text-emerald-300 flex items-center gap-2 text-xs font-semibold">
                <CheckCircle2 size={16} />
                Adventure published successfully to Community Adventures!
              </div>
            ) : (
              <form onSubmit={handlePostAdventure} className="space-y-4">
                <div>
                  <label className="text-xs text-neutral-400 block mb-1">Adventure Title</label>
                  <input
                    type="text"
                    required
                    placeholder="Enter an intriguing title..."
                    value={postTitle}
                    onChange={(e) => setPostTitle(e.target.value)}
                    className="w-full bg-black border border-neutral-700 rounded-lg p-2.5 text-xs text-white"
                  />
                </div>

                {/* 3 Sharing Options requested by user */}
                <div>
                  <label className="text-xs text-neutral-400 block mb-2 font-semibold">
                    Select Sharing Mode:
                  </label>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
                    {/* Option 1: Exact Full Adventure */}
                    <div
                      onClick={() => setSelectedShareType('full')}
                      className={`p-3 rounded-xl border cursor-pointer transition-all ${
                        selectedShareType === 'full'
                          ? 'border-amber-400 bg-amber-950/30'
                          : 'border-neutral-800 bg-neutral-900/60 hover:border-neutral-700'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-bold text-xs text-white">Exact Full Adventure</span>
                        <input
                          type="radio"
                          name="shareType"
                          checked={selectedShareType === 'full'}
                          onChange={() => setSelectedShareType('full')}
                        />
                      </div>
                      <p className="text-[11px] text-neutral-400 leading-snug">
                        Shares the entire story narrative, action log, and all created world files exactly as you played it.
                      </p>
                    </div>

                    {/* Option 2: Only Starting Prompt */}
                    <div
                      onClick={() => setSelectedShareType('prompt_only')}
                      className={`p-3 rounded-xl border cursor-pointer transition-all ${
                        selectedShareType === 'prompt_only'
                          ? 'border-amber-400 bg-amber-950/30'
                          : 'border-neutral-800 bg-neutral-900/60 hover:border-neutral-700'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-bold text-xs text-white">Only Starting Prompt</span>
                        <input
                          type="radio"
                          name="shareType"
                          checked={selectedShareType === 'prompt_only'}
                          onChange={() => setSelectedShareType('prompt_only')}
                        />
                      </div>
                      <p className="text-[11px] text-neutral-400 leading-snug">
                        Shares only the initial seed prompt so other players generate their own unique AI multiverse from scratch.
                      </p>
                    </div>

                    {/* Option 3: Initial AI World Generation */}
                    <div
                      onClick={() => setSelectedShareType('initial_generation')}
                      className={`p-3 rounded-xl border cursor-pointer transition-all ${
                        selectedShareType === 'initial_generation'
                          ? 'border-amber-400 bg-amber-950/30'
                          : 'border-neutral-800 bg-neutral-900/60 hover:border-neutral-700'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-bold text-xs text-white">Initial AI World Generation</span>
                        <input
                          type="radio"
                          name="shareType"
                          checked={selectedShareType === 'initial_generation'}
                          onChange={() => setSelectedShareType('initial_generation')}
                        />
                      </div>
                      <p className="text-[11px] text-neutral-400 leading-snug">
                        Shares what the AI initially exactly fully generated from the starting prompt with zero actions done yet.
                      </p>
                    </div>
                  </div>
                </div>

                {postError && (
                  <div className="bg-amber-950/50 border border-amber-500/60 p-3 rounded-lg text-xs text-amber-200 space-y-2">
                    <div className="flex items-start gap-2">
                      <AlertTriangle size={15} className="text-amber-400 shrink-0 mt-0.5" />
                      <span>{postError}</span>
                    </div>
                    {!isSubscriber && (
                      <button
                        type="button"
                        onClick={() => {
                          setIsPostingModalOpen(false);
                          onClose();
                          onOpenMarket('subscriptions');
                        }}
                        className="bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-400 text-neutral-950 font-bold text-xs px-3 py-1.5 rounded flex items-center gap-1.5 shadow"
                      >
                        <span>Upgrade to Adventurer Tier ($9.99/mo)</span>
                        <ArrowRight size={13} />
                      </button>
                    )}
                  </div>
                )}

                <div className="flex justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setIsPostingModalOpen(false)}
                    className="px-3 py-2 text-xs text-neutral-400 hover:text-white"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting || !postTitle.trim()}
                    className="bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-400 text-neutral-950 font-bold text-xs px-5 py-2 rounded-lg flex items-center gap-1.5 shadow disabled:opacity-50"
                  >
                    <span>{isSubmitting ? 'Publishing...' : 'Publish to Community'}</span>
                    <ArrowRight size={13} />
                  </button>
                </div>
              </form>
            )}
          </div>
        )}

        {/* Adventures Grid */}
        <div className="flex-1 overflow-y-auto p-4 md:p-5 space-y-3">
          {isLoading ? (
            <div className="text-center py-12 text-xs text-neutral-400">
              Loading community multiverse...
            </div>
          ) : (filteredAdventures || []).length === 0 ? (
            <div className="text-center py-12 space-y-2">
              <Globe size={32} className="mx-auto text-neutral-600 mb-2" />
              <h4 className="text-sm font-semibold text-neutral-300">No Community Adventures Found</h4>
              <p className="text-xs text-neutral-400 max-w-sm mx-auto">
                {searchQuery ? 'Try changing your search keywords or filter.' : 'Be the first Adventurer to publish a world for the community!'}
              </p>
            </div>
          ) : (
            filteredAdventures.map((adv) => {
              const badge = getShareTypeBadge(adv.shareType);
              const isLegendary = adv.authorTier === 'legendary';

              return (
                <div
                  key={adv.id}
                  className="bg-neutral-950 border border-neutral-800 hover:border-neutral-700 rounded-xl p-4 transition-all flex flex-col justify-between gap-3"
                >
                  <div>
                    <div className="flex flex-wrap justify-between items-start gap-2 mb-1.5">
                      <div>
                        <h3 className="text-sm font-bold text-white">{adv.title}</h3>
                        <div className="flex items-center gap-2 text-xs text-neutral-400 mt-0.5">
                          <span>by</span>
                          <GoldenName
                            name={adv.authorName}
                            tier={adv.authorTier}
                            isGolden={isLegendary}
                            className="text-xs font-semibold"
                          />
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className={`text-[10px] font-mono px-2 py-0.5 rounded border ${badge.color}`}>
                          {badge.label}
                        </span>
                        <span className="text-[11px] text-neutral-500 font-mono">
                          {new Date(adv.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                    </div>

                    <div className="bg-neutral-900/80 border border-neutral-800/80 rounded-lg p-3 text-xs text-neutral-300 mt-2">
                      <div className="text-[10px] font-mono uppercase text-neutral-500 mb-1">
                        {adv.shareType === 'prompt_only' ? 'Starting Prompt' : 'World Narrative Preview'}
                      </div>
                      <p className="line-clamp-3 italic leading-relaxed">
                        {adv.shareType === 'prompt_only'
                          ? `"${adv.startingPrompt}"`
                          : adv.initialAiGeneration || adv.startingPrompt}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-neutral-900 flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      {/* LIKE BUTTON */}
                      <button
                        type="button"
                        onClick={() => handleToggleLike(adv)}
                        className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all border cursor-pointer ${
                          adv.likedBy?.includes(currentUser?.uid || '')
                            ? 'bg-red-950/70 border-red-500/80 text-red-300 shadow-sm shadow-red-950/40'
                            : 'bg-neutral-900/80 border-neutral-800 text-neutral-300 hover:border-red-500/60 hover:text-red-300'
                        }`}
                        title={
                          currentUser && (adv.authorId === currentUser.uid || adv.authorName.toLowerCase() === currentUser.username.toLowerCase())
                            ? "You cannot like your own adventure"
                            : adv.likedBy?.includes(currentUser?.uid || '')
                            ? "Unlike adventure"
                            : "Like adventure"
                        }
                      >
                        <Heart
                          size={13}
                          className={
                            adv.likedBy?.includes(currentUser?.uid || '')
                              ? 'fill-red-400 text-red-400'
                              : 'text-neutral-400 group-hover:text-red-400'
                          }
                        />
                        <span className="font-mono text-xs">{adv.likesCount || 0}</span>
                      </button>

                      {/* COMMENT TOGGLE BUTTON */}
                      <button
                        type="button"
                        onClick={() => setExpandedCommentsAdvId(expandedCommentsAdvId === adv.id ? null : adv.id)}
                        className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all border cursor-pointer ${
                          expandedCommentsAdvId === adv.id
                            ? 'bg-blue-950/70 border-blue-500/80 text-blue-300 shadow-sm shadow-blue-950/40'
                            : 'bg-neutral-900/80 border-neutral-800 text-neutral-300 hover:border-blue-500/60 hover:text-blue-300'
                        }`}
                        title="View and post comments"
                      >
                        <MessageSquare size={13} className="text-blue-400" />
                        <span className="font-mono text-xs">{adv.comments?.length || 0}</span>
                        <span className="text-[11px] hidden sm:inline">Comments</span>
                      </button>

                      <span className="text-[11px] text-neutral-500 font-mono hidden md:inline ml-1">
                        {adv.shareType === 'full' && adv.narrative ? `${adv.narrative.length} turns` : 'Seed'}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      {(isStaff || (currentUser && (currentUser.uid === adv.authorId || currentUser.username.toLowerCase() === adv.authorName.toLowerCase()))) && (
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleDeletePost(adv.id, adv.title)}
                            className={`p-1.5 rounded transition-colors text-xs flex items-center gap-1 border cursor-pointer ${
                              confirmDeleteId === adv.id
                                ? 'bg-red-600 border-red-500 text-white font-bold animate-pulse'
                                : 'text-red-400 hover:text-red-300 hover:bg-red-950/60 border-red-900/50'
                            }`}
                            title={isStaff && adv.authorId !== currentUser?.uid ? 'Remove Post (Staff Action)' : 'Delete your post'}
                          >
                            <Trash2 size={13} />
                            <span className="text-[11px]">
                              {confirmDeleteId === adv.id
                                ? 'Confirm Removal'
                                : isStaff && adv.authorId !== currentUser?.uid
                                ? 'Staff Remove'
                                : 'Delete'}
                            </span>
                          </button>
                          {confirmDeleteId === adv.id && (
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(null)}
                              className="px-1.5 py-1 text-[10px] text-neutral-400 hover:text-white rounded bg-neutral-800 cursor-pointer"
                            >
                              Cancel
                            </button>
                          )}
                        </div>
                      )}

                      <button
                        onClick={() => {
                          onPlayCommunityAdventure(adv);
                          onClose();
                        }}
                        className="bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold px-4 py-1.5 rounded-lg flex items-center gap-1.5 transition-colors shadow cursor-pointer"
                      >
                        <Play size={13} />
                        <span>Play Adventure</span>
                      </button>
                    </div>
                  </div>

                  {/* EXPANDABLE COMMENT SECTION */}
                  {expandedCommentsAdvId === adv.id && (
                    <div className="pt-3 mt-1 border-t border-neutral-800/80 space-y-2.5 animate-in fade-in duration-150 bg-neutral-900/40 p-3 rounded-xl border border-neutral-800">
                      <div className="flex items-center justify-between text-xs text-neutral-400">
                        <span className="font-bold text-neutral-200 flex items-center gap-1.5">
                          <MessageSquare size={13} className="text-blue-400" />
                          <span>Comments ({adv.comments?.length || 0})</span>
                        </span>
                        <button
                          onClick={() => setExpandedCommentsAdvId(null)}
                          className="text-[11px] text-neutral-500 hover:text-neutral-300 cursor-pointer"
                        >
                          Close Comments
                        </button>
                      </div>

                      {/* Comment List */}
                      <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1">
                        {(!adv.comments || adv.comments.length === 0) ? (
                          <div className="text-[11px] text-neutral-500 italic py-2 text-center">
                            No comments yet. Share your thoughts or feedback for this world!
                          </div>
                        ) : (
                          adv.comments.map((comm) => {
                            const isMyComment = currentUser && (comm.authorId === currentUser.uid || comm.authorName.toLowerCase() === currentUser.username.toLowerCase());
                            const canDeleteComm = isMyComment || isStaff;

                            return (
                              <div
                                key={comm.id}
                                className="p-2.5 bg-neutral-950/80 border border-neutral-800/80 rounded-lg text-xs space-y-1"
                              >
                                <div className="flex items-center justify-between text-[11px]">
                                  <div className="flex items-center gap-2">
                                    <GoldenName
                                      name={comm.authorName}
                                      tier={comm.authorTier}
                                      isGolden={comm.authorTier === 'legendary'}
                                      className="font-bold text-white text-[11px]"
                                    />
                                    <span className="text-[10px] text-neutral-500 font-mono">
                                      {new Date(comm.createdAt).toLocaleDateString()}
                                    </span>
                                  </div>
                                  {canDeleteComm && (
                                    <button
                                      onClick={() => handleDeleteComment(adv.id, comm.id)}
                                      className="text-[10px] text-neutral-500 hover:text-red-400 transition-colors p-0.5 cursor-pointer"
                                      title="Delete comment"
                                    >
                                      <Trash2 size={11} />
                                    </button>
                                  )}
                                </div>
                                <p className="text-neutral-200 text-xs break-words leading-relaxed whitespace-pre-wrap">
                                  {comm.text}
                                </p>
                              </div>
                            );
                          })
                        )}
                      </div>

                      {/* Comment input form */}
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          handleAddComment(adv.id);
                        }}
                        className="flex items-center gap-2 pt-1"
                      >
                        <input
                          type="text"
                          placeholder={currentUser ? "Write a comment..." : "Log in to post a comment..."}
                          disabled={!currentUser}
                          value={commentInput[adv.id] || ''}
                          onChange={(e) => setCommentInput(prev => ({ ...prev, [adv.id]: e.target.value }))}
                          className="flex-1 bg-black border border-neutral-700 focus:border-blue-500 rounded-lg px-3 py-1.5 text-xs text-white placeholder-neutral-500 outline-none"
                        />
                        <button
                          type="submit"
                          disabled={!currentUser || !(commentInput[adv.id] || '').trim() || isSubmittingComment[adv.id]}
                          className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white rounded-lg text-xs font-bold flex items-center gap-1 transition-all cursor-pointer shrink-0"
                        >
                          <Send size={11} />
                          <span>{isSubmittingComment[adv.id] ? 'Posting...' : 'Comment'}</span>
                        </button>
                      </form>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

      </div>
    </div>
  );
};

export default CommunityAdventuresModal;
