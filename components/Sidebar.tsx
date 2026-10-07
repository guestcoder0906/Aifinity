import React, { useState, useEffect, useRef } from 'react';
import { UpdateItem } from '../types';
import { FileSystem } from '../services/fileSystem';
import { FileText, ChevronRight, ChevronDown, ChevronUp, ChevronLeft, PanelLeftOpen, PanelLeftClose, Activity, Settings, RefreshCw, RotateCcw, Users, LogOut, Play, Share2, Map as MapIcon, User, Compass, ShoppingCart, Bookmark, Globe, Zap, Scale, Package, AlertTriangle, ShieldCheck, Gauge, X, Shield, AlertOctagon, Hand, Coins, MessageSquare, Trash2, Sparkles } from 'lucide-react';
import MapPanel, { MapPanelHandle } from './MapPanel';
import GoldenName from './GoldenName';
import { ActionStatus } from '../services/actionLimitService';
import { WeightInventoryEngine, CharacterPhysicalStats } from '../services/weightInventoryEngine';
import { parseSecretLocation, formatVisibilityMarkup, isFileVisible } from '../services/visibilityEngine';

interface SidebarProps {
  files: string[];
  fileSystem: FileSystem;
  updates: UpdateItem[];
  debugMode: boolean;
  onToggleDebug: () => void;
  onReset: () => void;
  expandedFile: string | null;
  setExpandedFile: (filename: string | null) => void;
  gameMode: 'menu' | 'singleplayer' | 'multiplayer';
  roomState: any;
  username: string;
  onKickPlayer: (user: string) => void;
  onLeaveGame: () => void;
  onForceTurn: () => void;
  onReferenceClick: (ref: string) => void;
  autoRecommendationsEnabled: boolean;
  onToggleAutoRecommendations: () => void;
  onHostClick: () => void;
  onJoinClick: () => void;
  syncCount: number;
  mapPanelRef: React.RefObject<MapPanelHandle | null>;
  currentUser?: any;
  guestName?: string | null;
  onOpenAuth?: () => void;
  onOpenGuestName?: () => void;
  onLogout?: () => void;
  onNavigateWelcome?: () => void;
  onOpenAccount?: () => void;
  actionStatus?: ActionStatus;
  onUndo?: () => void;
  undoCount?: number;
  onOpenMarket?: (tab?: 'packs' | 'subscriptions' | 'apikey') => void;
  onOpenAdventures?: () => void;
  onOpenCommunity?: () => void;
  onOpenShareCode?: () => void;
  isMobileOpen?: boolean;
  onCloseMobile?: () => void;
  mobileTab?: 'files' | 'map';
  onSetMobileTab?: (tab: 'files' | 'map') => void;
  isMinimized?: boolean;
  onToggleMinimize?: (explicit?: boolean) => void;
  onOpenChat?: () => void;
  unreadChatCount?: number;
  onOpenActiveGames?: () => void;
  onDeleteAdventurePermanently?: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({
  files = [],
  fileSystem,
  updates = [],
  debugMode,
  onToggleDebug,
  onReset,
  expandedFile,
  setExpandedFile,
  gameMode,
  roomState,
  username,
  onKickPlayer,
  onLeaveGame,
  onForceTurn,
  onReferenceClick,
  autoRecommendationsEnabled,
  onToggleAutoRecommendations,
  onHostClick,
  onJoinClick,
  syncCount,
  mapPanelRef,
  currentUser,
  guestName,
  onOpenAuth,
  onOpenGuestName,
  onLogout,
  onNavigateWelcome,
  onOpenAccount,
  actionStatus,
  onUndo,
  undoCount = 0,
  onOpenMarket,
  onOpenAdventures,
  onOpenCommunity,
  onOpenShareCode,
  isMobileOpen,
  onCloseMobile,
  mobileTab,
  onSetMobileTab,
  isMinimized: propIsMinimized,
  onToggleMinimize,
  onOpenChat,
  unreadChatCount = 0,
  onOpenActiveGames,
  onDeleteAdventurePermanently
}) => {

  const [activeTab, setActiveTab] = useState<'files' | 'map'>('files');
  const [internalMinimized, setInternalMinimized] = useState<boolean>(true); // Minimized by default!
  const isMinimized = propIsMinimized !== undefined ? propIsMinimized : internalMinimized;

  const [isMobileScreen, setIsMobileScreen] = useState<boolean>(() => {
    return typeof window !== 'undefined' ? window.innerWidth < 768 : false;
  });

  useEffect(() => {
    const handleResize = () => {
      setIsMobileScreen(window.innerWidth < 768);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const [sidebarWidth, setSidebarWidth] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('aimud_sidebar_width');
      const parsed = saved ? parseInt(saved, 10) : 320;
      return !isNaN(parsed) && parsed >= 200 && parsed <= 800 ? parsed : 320;
    } catch {
      return 320;
    }
  });
  const [isDraggingResizer, setIsDraggingResizer] = useState(false);
  const dragStartXRef = useRef<number>(0);
  const isCurrentlyMinimizedRef = useRef<boolean>(isMinimized);
  const animationFrameRef = useRef<number | null>(null);
  isCurrentlyMinimizedRef.current = isMinimized;

  const handleMouseDownResizer = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingResizer(true);
    dragStartXRef.current = e.clientX;

    // If currently collapsed, expand on drag initiation
    if (isCurrentlyMinimizedRef.current) {
      if (onToggleMinimize) onToggleMinimize(false);
      setInternalMinimized(false);
    }

    const handleMouseMove = (moveEvent: MouseEvent) => {
      moveEvent.preventDefault();
      const currentX = moveEvent.clientX;
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      animationFrameRef.current = requestAnimationFrame(() => {
        const clampedWidth = Math.max(180, Math.min(window.innerWidth * 0.75, currentX));
        setSidebarWidth(clampedWidth);
      });
    };

    const handleMouseUp = (upEvent: MouseEvent) => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      setIsDraggingResizer(false);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.removeEventListener('mousemove', handleMouseMove, { capture: true });
      window.removeEventListener('mouseup', handleMouseUp, { capture: true });

      const finalX = upEvent.clientX;
      if (finalX < 140) {
        if (onToggleMinimize) onToggleMinimize(true);
        setInternalMinimized(true);
      } else {
        const finalWidth = Math.max(200, Math.min(window.innerWidth * 0.75, finalX));
        if (onToggleMinimize) onToggleMinimize(false);
        setInternalMinimized(false);
        setSidebarWidth(finalWidth);
        try {
          localStorage.setItem('aimud_sidebar_width', Math.round(finalWidth).toString());
        } catch (_) {}
      }
    };

    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    window.addEventListener('mousemove', handleMouseMove, { capture: true, passive: false });
    window.addEventListener('mouseup', handleMouseUp, { capture: true });
  };

  const handleDoubleClickResizer = () => {
    if (isMinimized) {
      if (onToggleMinimize) onToggleMinimize(false);
      else setInternalMinimized(false);
    } else {
      if (sidebarWidth !== 320) {
        setSidebarWidth(320);
        try { localStorage.setItem('aimud_sidebar_width', '320'); } catch (_) {}
      } else {
        if (onToggleMinimize) onToggleMinimize(true);
        else setInternalMinimized(true);
      }
    }
  };

  const handleToggleMinimize = () => {
    if (onToggleMinimize) {
      onToggleMinimize();
    } else {
      setInternalMinimized(prev => !prev);
    }
  };

  const [isMobileExpanded, setIsMobileExpanded] = useState(false);
  const [expandedStoredItems, setExpandedStoredItems] = useState<{ [filename: string]: boolean }>({});
  const [expandedContainers, setExpandedContainers] = useState<{ [containerKey: string]: boolean }>({});
  const [dismissedUpdates, setDismissedUpdates] = useState<Set<number>>(new Set());
  const isHost = roomState?.hostUsername === username;
  const expandedRef = useRef<HTMLDivElement>(null);
  const filesListRef = useRef<HTMLDivElement>(null);

  const effectiveMobileOpen = isMobileOpen !== undefined ? isMobileOpen : isMobileExpanded;
  const isMobileDrawerActive = isMobileScreen && effectiveMobileOpen;

  const handleClose = () => {
    if (onCloseMobile) onCloseMobile();
    setIsMobileExpanded(false);
  };

  useEffect(() => {
    if (mobileTab) {
      setActiveTab(mobileTab);
    }
  }, [mobileTab]);

  useEffect(() => {
    if (expandedFile) {
      setActiveTab('files');
      if (onSetMobileTab) onSetMobileTab('files');
      if (isMobileScreen) {
        setIsMobileExpanded(true);
      }
      if (isMinimized) {
        if (onToggleMinimize) onToggleMinimize(false);
        setInternalMinimized(false);
      }
      // Scroll container directly to avoid displacing the mobile window/body
      setTimeout(() => {
        if (expandedRef.current && filesListRef.current) {
          const container = filesListRef.current;
          const target = expandedRef.current;
          const topOffset = target.offsetTop - container.offsetTop;
          container.scrollTo({ top: Math.max(0, topOffset - 10), behavior: 'smooth' });
        }
      }, 50);
    }
  }, [expandedFile, isMobileScreen]);

  const formatContent = (content: string) => {
    if (!content) return '';
    let formatted = content;

    // Use unified visibility markup formatting (supports hide:besides, hide:for, target, hide[])
    formatted = formatVisibilityMarkup(formatted, username, debugMode);

    return formatted;
  };

  const parseLinks = (html: string) => {
    return html.replace(/(<[^>]+>)|\[([^\]]+)\]/g, (match, htmlTag, ref) => {
      if (htmlTag) return htmlTag;
      return `<span class="text-yellow-400 hover:text-yellow-200 hover:underline cursor-pointer" data-ref="${ref}">${ref}</span>`;
    });
  };

  const handleContentClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    const refElement = target.closest('[data-ref]') as HTMLElement;
    if (refElement && refElement.dataset.ref) {
      onReferenceClick(refElement.dataset.ref);
    }
  };

  // Filter files based on hide[], hide:besides(), hide:for(), and target()
  const visibleFiles = files.filter(filename => {
    return isFileVisible(filename, username, debugMode, isHost);
  });

  return (
    <div
      className={`
        ${isMobileDrawerActive
          ? 'fixed inset-0 z-50 bg-neutral-950 flex flex-col'
          : 'hidden md:flex'
        }
        md:relative md:inset-auto md:z-auto md:h-full md:bg-neutral-900 md:border-r md:border-neutral-800 md:flex-col
        text-[11px] md:text-xs font-mono overflow-hidden shrink-0 ${isDraggingResizer ? 'transition-none select-none' : 'transition-[width] duration-200 ease-in-out'}
      `}
      style={{
        WebkitOverflowScrolling: 'touch',
        ...(isMobileDrawerActive
          ? { height: 'var(--app-height, 100dvh)', maxHeight: 'var(--app-height, 100dvh)' }
          : {
              width: isMinimized ? '48px' : `${sidebarWidth}px`,
              minWidth: isMinimized ? '48px' : `${sidebarWidth}px`,
              maxWidth: isMinimized ? '48px' : `${sidebarWidth}px`,
            }
        )
      }}
    >
      {/* Draggable Resizer Edge for Desktop (expands / collapses by dragging) */}
      {!isMobileDrawerActive && (
        <>
          {isDraggingResizer && (
            <div className="fixed inset-0 z-[9999] cursor-col-resize select-none bg-transparent pointer-events-auto" />
          )}
          <div
            onMouseDown={handleMouseDownResizer}
            onDoubleClick={handleDoubleClickResizer}
            className={`hidden md:block absolute top-0 right-0 w-2 h-full cursor-col-resize z-40 group select-none transition-colors ${
              isDraggingResizer ? 'bg-blue-500/80 shadow-[0_0_8px_rgba(59,130,246,0.5)]' : 'hover:bg-blue-500/40'
            }`}
            title={isMinimized ? "Drag right to expand sidebar" : "Drag to resize sidebar width (double-click to toggle/reset)"}
          >
            <div className={`w-0.5 h-8 bg-neutral-700 group-hover:bg-blue-400 rounded absolute top-1/2 -translate-y-1/2 right-0.5 transition-colors ${
              isDraggingResizer ? 'bg-blue-300' : ''
            }`} />
          </div>
        </>
      )}

      {/* Minimized Vertical Rail on Desktop (when collapsed and not mobile drawer) */}
      {isMinimized && !isMobileDrawerActive ? (
        <div className="hidden md:flex flex-col items-center justify-between h-full w-full py-2.5 bg-neutral-950 select-none">
          <div className="flex flex-col items-center gap-2 w-full">
            {/* Expand Sidebar Toggle Button */}
            <button
              id="sidebar-expand-rail-btn"
              onClick={handleToggleMinimize}
              className="w-8 h-8 rounded-lg bg-neutral-900 hover:bg-neutral-800 active:bg-neutral-700 text-blue-400 hover:text-blue-300 border border-neutral-800 flex items-center justify-center transition-colors shadow cursor-pointer"
              title="Expand Sidebar (World Files, Map, Inventory)"
            >
              <PanelLeftOpen size={16} />
            </button>

            <div className="w-5 h-px bg-neutral-800 my-0.5" />

            {/* Quick Files Tab */}
            <button
              id="sidebar-rail-files-btn"
              onClick={() => {
                setActiveTab('files');
                handleToggleMinimize();
              }}
              className={`w-8 h-9 rounded-lg flex flex-col items-center justify-center transition-colors cursor-pointer relative group ${
                activeTab === 'files'
                  ? 'bg-blue-950/80 text-blue-300 border border-blue-800/80 shadow'
                  : 'text-neutral-400 hover:text-white hover:bg-neutral-900'
              }`}
              title={`World Files (${visibleFiles.length}) - Click to expand`}
            >
              <FileText size={14} />
              <span className="text-[8px] font-bold leading-none mt-0.5">{visibleFiles.length}</span>
            </button>

            {/* Quick Map Tab */}
            <button
              id="sidebar-rail-map-btn"
              onClick={() => {
                setActiveTab('map');
                handleToggleMinimize();
              }}
              className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors cursor-pointer group ${
                activeTab === 'map'
                  ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-800/80 shadow'
                  : 'text-neutral-400 hover:text-white hover:bg-neutral-900'
              }`}
              title="World Map - Click to expand"
            >
              <MapIcon size={14} />
            </button>

            <div className="w-5 h-px bg-neutral-800 my-0.5" />

            {/* Quick Link: Adventures */}
            {onOpenAdventures && (
              <button
                onClick={onOpenAdventures}
                className="w-8 h-8 rounded-lg text-neutral-400 hover:text-blue-300 hover:bg-neutral-900 flex items-center justify-center transition-colors cursor-pointer"
                title="Saved Adventures"
              >
                <Bookmark size={14} />
              </button>
            )}

            {/* Quick Link: Community */}
            {onOpenCommunity && (
              <button
                onClick={onOpenCommunity}
                className="w-8 h-8 rounded-lg text-neutral-400 hover:text-emerald-300 hover:bg-neutral-900 flex items-center justify-center transition-colors cursor-pointer"
                title="Community Adventures"
              >
                <Globe size={14} />
              </button>
            )}

            {/* Quick Link: Market */}
            {onOpenMarket && (
              <button
                onClick={() => onOpenMarket('packs')}
                className="w-8 h-8 rounded-lg text-neutral-400 hover:text-amber-300 hover:bg-neutral-900 flex items-center justify-center transition-colors cursor-pointer"
                title="Aifinity Market"
              >
                <ShoppingCart size={14} />
              </button>
            )}

            {/* Phase Indicator */}
            <div
              className="w-7 h-7 rounded-full bg-blue-500/15 border border-blue-500/40 flex items-center justify-center text-blue-400 cursor-help"
              title="Beta Phase Active: 20 Daily Free Actions (+10 Beta Bonus)!"
            >
              <Zap size={13} />
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* Mobile Drawer Header Bar (Visible on mobile when drawer is opened) */}
          <div className="md:hidden flex items-center justify-between px-3 py-2 bg-neutral-900 border-b border-neutral-800 shrink-0">
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  setActiveTab('files');
                  if (onSetMobileTab) onSetMobileTab('files');
                }}
                className={`px-3 py-1 rounded text-xs flex items-center gap-1.5 border transition-colors ${
                  activeTab === 'files'
                    ? 'bg-blue-950 border-blue-700 text-blue-300 font-semibold shadow'
                    : 'bg-neutral-950 border-neutral-800 text-neutral-400'
                }`}
              >
                <FileText size={12} className={activeTab === 'files' ? 'text-blue-400' : 'text-neutral-500'} />
                <span>Files ({visibleFiles.length})</span>
              </button>
              <button
                onClick={() => {
                  setActiveTab('map');
                  if (onSetMobileTab) onSetMobileTab('map');
                }}
                className={`px-3 py-1 rounded text-xs flex items-center gap-1.5 border transition-colors ${
                  activeTab === 'map'
                    ? 'bg-emerald-950 border-emerald-700 text-emerald-300 font-semibold shadow'
                    : 'bg-neutral-950 border-neutral-800 text-neutral-400'
                }`}
              >
                <MapIcon size={12} className={activeTab === 'map' ? 'text-emerald-400' : 'text-neutral-500'} />
                <span>Map</span>
              </button>
            </div>

            <button
              onClick={handleClose}
              className="flex items-center gap-1.5 bg-neutral-800 hover:bg-neutral-700 active:bg-neutral-600 text-gray-200 px-3 py-1 rounded border border-neutral-700 text-xs font-mono transition-colors active:scale-95"
              title="Return to adventure narrative"
            >
              <X size={14} className="text-red-400" />
              <span>Back to Story</span>
            </button>
          </div>

          {/* Main Sidebar Body */}
          <div className="flex-1 flex flex-col min-h-0">

            {/* Account / Guest Status Header */}
            <div className="p-2 sm:p-2.5 bg-neutral-950 border-b border-neutral-800 flex flex-col gap-1.5 sm:gap-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 overflow-hidden">
                <span className={`w-2 h-2 rounded-full shrink-0 ${currentUser ? 'bg-emerald-400' : 'bg-amber-400'}`} />
                <div className="truncate flex items-center gap-1">
                  {currentUser ? (
                    <GoldenName
                      name={currentUser.username}
                      role={currentUser.role}
                      showGlowingName={currentUser.showGlowingName}
                      isGolden={currentUser.tier === 'legendary'}
                      className="font-bold text-gray-200 truncate"
                    />
                  ) : (
                    <span className="font-bold text-gray-200 truncate">
                      {guestName ? `${guestName} (Guest)` : 'Player (Guest)'}
                    </span>
                  )}
                  <span className={`text-[9px] px-1.5 py-0.2 rounded uppercase ml-1 ${
                    currentUser?.tier === 'legendary'
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                      : currentUser?.tier === 'adventurer'
                        ? 'bg-blue-500/20 text-blue-300 border border-blue-500/40'
                        : 'text-neutral-500'
                  }`}>
                    {currentUser ? (currentUser.tier || 'Account') : 'Guest'}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {onNavigateWelcome && (
                  <button
                    onClick={onNavigateWelcome}
                    className="text-[10px] text-blue-400 hover:text-blue-300 flex items-center gap-1 border border-blue-900/60 bg-blue-950/40 px-2 py-0.5 rounded transition-colors shrink-0"
                    title="View Welcome Page"
                  >
                    <Compass size={11} />
                    <span>Welcome</span>
                  </button>
                )}
                {/* Desktop Minimize Button */}
                <button
                  id="sidebar-minimize-btn"
                  onClick={handleToggleMinimize}
                  className="hidden md:flex items-center gap-1 text-[10px] text-neutral-400 hover:text-white bg-neutral-900 hover:bg-neutral-800 px-2 py-0.5 rounded border border-neutral-800 transition-colors cursor-pointer"
                  title="Minimize Sidebar"
                >
                  <PanelLeftClose size={12} className="text-neutral-400" />
                  <span>Minimize</span>
                </button>
              </div>
            </div>

            {/* Action Status Bar */}
            {actionStatus && (
              <div className="p-1.5 bg-neutral-900/90 border border-neutral-800 rounded flex items-center justify-between text-[10px]">
                <div className="flex items-center gap-1.5 text-neutral-300 truncate">
                  <Zap size={11} className={actionStatus.isUnlimited ? "text-amber-400" : "text-emerald-400"} />
                  {actionStatus.isAlphaPhase ? (
                    <span className="font-bold text-amber-300 flex items-center gap-1">
                      <span>Alpha: Unlimited Actions</span>
                      <span className="text-[8px] px-1 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 uppercase font-semibold">
                        Alpha
                      </span>
                    </span>
                  ) : actionStatus.isUnlimited ? (
                    <span className="font-bold text-amber-300">Unlimited Actions</span>
                  ) : actionStatus.isGuest ? (
                    <span>
                      <strong className="text-amber-400">{(actionStatus.guestActionsRemaining ?? actionStatus.dailyFreeRemaining ?? 0)}/{actionStatus.guestActionsTotal ?? 5}</strong> Guest Actions
                    </span>
                  ) : (
                    <span>
                      <strong className="text-emerald-400">{(actionStatus.freeStackedActions ?? actionStatus.dailyFreeRemaining ?? 0)} Free</strong>
                      {(actionStatus.purchasedCredits ?? 0) > 0 && (
                        <span className="text-amber-400 font-bold ml-1">+{actionStatus.purchasedCredits} Cr</span>
                      )}
                    </span>
                  )}
                </div>
                {onOpenMarket && (
                  <button
                    onClick={() => onOpenMarket('packs')}
                    className="bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 px-1.5 py-0.5 rounded font-sans font-semibold text-[10px] transition-colors flex items-center gap-1 shrink-0"
                    title="Open Market"
                  >
                    <span>Market</span>
                    <span className="text-[9px] font-bold">+</span>
                  </button>
                )}
              </div>
            )}

        {/* Action Quick Links: Adventures, Community, Market */}
        <div className="grid grid-cols-3 gap-1 text-[10px]">
          {onOpenAdventures && (
            <button
              onClick={onOpenAdventures}
              className="bg-neutral-900 hover:bg-neutral-800 text-blue-300 border border-neutral-800 py-1 px-1 rounded flex items-center justify-center gap-1 transition-colors"
              title="Saved Adventures"
            >
              <Bookmark size={11} />
              <span className="truncate">Adventures</span>
            </button>
          )}
          {onOpenCommunity && (
            <button
              onClick={onOpenCommunity}
              className="bg-neutral-900 hover:bg-neutral-800 text-emerald-300 border border-neutral-800 py-1 px-1 rounded flex items-center justify-center gap-1 transition-colors"
              title="Community Adventures"
            >
              <Globe size={11} />
              <span className="truncate">Community</span>
            </button>
          )}
          {onOpenMarket && (
            <button
              onClick={() => onOpenMarket('packs')}
              className="bg-neutral-900 hover:bg-neutral-800 text-amber-300 border border-neutral-800 py-1 px-1 rounded flex items-center justify-center gap-1 transition-colors"
              title="Aifinity Market"
            >
              <ShoppingCart size={11} />
              <span className="truncate">Market</span>
            </button>
          )}
        </div>

        <div className="flex gap-1.5 text-[10px]">
          {currentUser ? (
            <div className="flex gap-1.5 w-full">
              <button
                onClick={onLogout}
                className="w-full bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white py-1 px-2 rounded border border-neutral-700 transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                title="Log Out (Switch to Guest)"
              >
                <LogOut size={11} className="text-neutral-400" />
                <span>Log Out</span>
              </button>
            </div>
          ) : (
            <>
              <button
                onClick={onOpenGuestName}
                className="flex-1 bg-neutral-800 hover:bg-neutral-700 text-amber-300 py-1 px-2 rounded border border-neutral-700 transition-colors truncate"
              >
                {guestName ? 'Edit Guest Name' : 'Set Guest Name'}
              </button>
              <button
                onClick={onOpenAuth}
                className="flex-1 bg-blue-600/80 hover:bg-blue-600 text-white font-semibold py-1 px-2 rounded transition-colors truncate"
              >
                Log In / Sign Up
              </button>
            </>
          )}
        </div>
      </div>

      {gameMode === 'multiplayer' && roomState && (
        <div className="flex flex-col border-b border-neutral-800">
          <div className="p-2 bg-neutral-950 border-b border-neutral-800 flex justify-between items-center text-gray-400 font-bold uppercase tracking-wider text-[10px]">
            <div className="flex items-center gap-1.5 truncate">
              <span className="flex items-center gap-1"><Users size={12} /> Players</span>
              {roomState?.id && (
                <button
                  onClick={onOpenShareCode}
                  className="bg-blue-950/70 hover:bg-blue-900/80 text-blue-300 border border-blue-800/60 px-1.5 py-0.5 rounded text-[9.5px] font-mono flex items-center gap-1 cursor-pointer transition-colors"
                  title="Share / Copy Room Code"
                >
                  <span>{roomState.id}</span>
                  <Share2 size={9} />
                </button>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {isHost && (
                <button onClick={onForceTurn} className="hover:text-blue-400 transition-colors flex items-center gap-1" title="Force Turn">
                  <Play size={12} /> Force
                </button>
              )}
              <button onClick={onLeaveGame} className="hover:text-red-400 transition-colors" title="Leave Game">
                <LogOut size={12} />
              </button>
            </div>
          </div>
          <div className="p-2 space-y-1 max-h-32 overflow-y-auto">
            {(roomState.players || []).map((p: any) => (
              <div key={p.username} className="flex justify-between items-center bg-neutral-800/50 px-2 py-1 rounded">
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${p.status === 'active' ? 'bg-emerald-500' : 'bg-neutral-600'}`}></span>
                  <span className={p.username === username ? 'text-blue-300 font-bold' : 'text-gray-300'}>
                    <GoldenName
                      name={p.username}
                      role={p.role}
                      showGlowingName={p.showGlowingName}
                      isGolden={p.tier === 'legendary'}
                    /> {p.username === roomState.hostUsername && '(Host)'}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {p.status === 'active' && p.hasCharacter && (
                    <span className={`text-[10px] ${p.isReady ? 'text-emerald-400' : 'text-yellow-400'}`}>
                      {p.isReady ? 'Ready' : 'Waiting'}
                    </span>
                  )}
                  {isHost && p.username !== username && (
                    <button onClick={() => {
                      if (confirm(`Kick ${p.username}?`)) onKickPlayer(p.username);
                    }} className="text-red-500 hover:text-red-400 text-[10px]">Kick</button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Multiplayer Realm Toolbar: Chat, My Games, Permanent Deletion */}
          <div className="p-2 bg-neutral-950/90 border-t border-neutral-800/80 flex flex-col gap-1.5">
            <div className="grid grid-cols-2 gap-1.5">
              {onOpenChat && (
                <button
                  onClick={onOpenChat}
                  className="bg-blue-900/50 hover:bg-blue-800/70 text-blue-200 border border-blue-700/60 p-1.5 rounded text-[11px] font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer relative"
                  title="Open Multiplayer Chat"
                >
                  <MessageSquare size={12} className="text-blue-300" />
                  <span>Chat</span>
                  {unreadChatCount > 0 && (
                    <span className="bg-red-500 text-white font-bold font-mono text-[9px] px-1 rounded-full animate-pulse">
                      {unreadChatCount}
                    </span>
                  )}
                </button>
              )}

              {onOpenActiveGames && (
                <button
                  onClick={onOpenActiveGames}
                  className="bg-neutral-900 hover:bg-neutral-800 text-neutral-300 border border-neutral-700/60 p-1.5 rounded text-[11px] font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                  title="View All My Active Adventures"
                >
                  <Users size={12} className="text-neutral-400" />
                  <span>My Games</span>
                </button>
              )}
            </div>

            {(isHost || currentUser?.role === 'admin' || currentUser?.role === 'mod') && onDeleteAdventurePermanently && (
              <button
                onClick={onDeleteAdventurePermanently}
                className="w-full bg-red-950/40 hover:bg-red-900/60 text-red-300 hover:text-red-200 border border-red-800/50 p-1 rounded text-[10px] font-medium flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                title="Permanently delete this multiplayer adventure"
              >
                <Trash2 size={10} />
                <span>Delete Adventure Permanently</span>
              </button>
            )}
          </div>
        </div>
      )}

      {(!roomState || gameMode === 'singleplayer') && (
        <div className="hidden md:flex flex-col border-b border-neutral-800 p-2 gap-2 bg-neutral-950">
          <div className="grid grid-cols-2 gap-1.5">
            <button
              onClick={() => {
                if (onCloseMobile) onCloseMobile();
                onHostClick();
              }}
              className="bg-blue-900/40 hover:bg-blue-800/60 text-blue-300 border border-blue-800/50 p-1.5 rounded text-xs transition-colors cursor-pointer font-semibold"
            >
              Host Multiplayer
            </button>
            <button
              onClick={() => {
                if (onCloseMobile) onCloseMobile();
                onJoinClick();
              }}
              className="bg-emerald-900/40 hover:bg-emerald-800/60 text-emerald-300 border border-emerald-800/50 p-1.5 rounded text-xs transition-colors cursor-pointer font-semibold"
            >
              Join Multiplayer
            </button>
          </div>
          {onOpenActiveGames && currentUser && (
            <button
              onClick={onOpenActiveGames}
              className="w-full bg-neutral-900/90 hover:bg-neutral-800 text-blue-300 border border-neutral-800 hover:border-blue-900/60 p-1 rounded text-[11px] font-medium flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
              title="View my active multiplayer games"
            >
              <Users size={11} className="text-blue-400" />
              <span>My Active Adventures</span>
            </button>
          )}
        </div>
      )}

      {/* Files/Map Section */}
      <div className="flex-1 flex flex-col min-h-0 border-b border-neutral-800">
        <div className="p-2 bg-neutral-950 border-b border-neutral-800 flex justify-between items-center text-gray-400 font-bold uppercase tracking-wider text-[10px]">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setActiveTab('files')}
              className={`flex items-center gap-1 hover:text-white transition-colors ${activeTab === 'files' ? 'text-blue-400' : ''}`}
            >
              <FileText size={12} /> World Files
            </button>
            <button
              onClick={() => setActiveTab('map')}
              className={`flex items-center gap-1 hover:text-white transition-colors ${activeTab === 'map' ? 'text-blue-400' : ''}`}
            >
              <MapIcon size={12} /> Map
            </button>
          </div>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-1 cursor-pointer hover:text-white transition-colors" title="Toggle Auto Recommendations">
              <input type="checkbox" checked={autoRecommendationsEnabled} onChange={onToggleAutoRecommendations} className="hidden" />
              <span className={autoRecommendationsEnabled ? "text-blue-400" : ""}>AUTO</span>
            </label>
            <label className="flex items-center gap-1 cursor-pointer hover:text-white transition-colors" title="Toggle Debug Mode & Action Costs">
              <input type="checkbox" checked={debugMode} onChange={onToggleDebug} className="hidden" />
              <Settings size={12} className={debugMode ? "text-yellow-400" : ""} />
              <span className={debugMode ? "text-yellow-400" : ""}>DEBUG</span>
            </label>
            {onUndo && (
              <button
                id="sidebar-undo-turn-btn"
                onClick={onUndo}
                disabled={undoCount === 0}
                className={`transition-all flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-medium border shadow-sm ${
                  undoCount === 0
                    ? 'text-neutral-600 border-neutral-800/40 bg-neutral-900/30 cursor-not-allowed opacity-40'
                    : 'text-amber-300 border-amber-800/60 bg-amber-950/60 hover:bg-amber-900/80 hover:text-amber-100 cursor-pointer active:scale-95'
                }`}
                title={undoCount === 0 ? "No previous turns to undo" : `Undo Turn (${undoCount} available)`}
              >
                <RotateCcw size={11} className="shrink-0" />
                <span>Undo</span>
              </button>
            )}
            {(gameMode === 'singleplayer' || (gameMode === 'multiplayer' && roomState?.hostUsername === username)) && (
              <button
                id="sidebar-reset-adventure-btn"
                onClick={onReset}
                className="flex items-center gap-1 px-2 py-0.5 bg-red-950/70 hover:bg-red-900/90 border border-red-800/80 hover:border-red-600 text-red-300 hover:text-red-100 rounded text-[10px] font-mono font-medium transition-all cursor-pointer shadow-sm active:scale-95"
                title="Reset and start a new adventure"
              >
                <RefreshCw size={11} className="text-red-400 shrink-0" />
                <span>Reset</span>
              </button>
            )}
            <button
              onClick={handleClose}
              className="md:hidden text-neutral-400 hover:text-white transition-colors flex items-center gap-0.5 text-[9.5px] bg-neutral-900 border border-neutral-800 px-1.5 py-0.5 rounded"
              title="Return to adventure narrative"
            >
              <X size={11} className="text-red-400" />
              <span>Close</span>
            </button>
          </div>
        </div>

        {activeTab === 'files' ? (
          <div className="flex-1 flex flex-col min-h-0">
            <div
              ref={filesListRef}
              className="flex-1 overflow-y-auto p-2 space-y-1"
              style={{ WebkitOverflowScrolling: 'touch', overscrollBehaviorY: 'contain' }}
            >
              {visibleFiles.map(filename => {
                const isExpanded = expandedFile === filename;
                const content = fileSystem.read(filename) || '';
                const displayName = fileSystem.getDisplayName(filename);

                return (
                  <div key={filename} ref={isExpanded ? expandedRef : null} className="bg-neutral-800/50 rounded overflow-hidden">
                    <div
                      className={`px-2 py-1.5 cursor-pointer hover:bg-neutral-800 flex items-center gap-2 ${isExpanded ? 'bg-neutral-800' : ''}`}
                      onClick={() => setExpandedFile(isExpanded ? null : filename)}
                    >
                      {isExpanded ? <ChevronDown size={12} className="text-gray-500" /> : <ChevronRight size={12} className="text-gray-500" />}
                      <span className="text-blue-400 font-semibold truncate">{displayName}</span>
                    </div>
                    {isExpanded && (
                      <div className="border-t border-neutral-700 bg-black">
                        {(() => {
                          const isEntity = content.includes('[NAME & DESCRIPTION]') || content.includes('[STATS & MODIFIERS]') || content.includes('[CONTAINERS') || content.includes('[INVENTORY');
                          if (!isEntity) return null;

                          const pStats = WeightInventoryEngine.parseCharacterStatsAndInventory(content);
                          if (!pStats || (!pStats.dimensionsApply && pStats.bodyWeight === 0 && pStats.containers.length === 0)) return null;

                          const isOverLift = pStats.totalCarriedWeight > pStats.maxLiftStrength;
                          const ratio = pStats.encumbranceRatio;
                          let barColor = 'bg-emerald-500';
                          if (isOverLift) barColor = 'bg-red-600 animate-pulse';
                          else if (ratio > 50) barColor = 'bg-amber-500';
                          else if (ratio > 20) barColor = 'bg-yellow-500';

                          const meterWidth = Math.min(100, Math.max(2, (pStats.totalCarriedWeight / Math.max(1, pStats.maxLiftStrength)) * 100));

                          return (
                            <div className="p-2.5 bg-neutral-900/90 border-b border-neutral-800 text-[11px] font-sans space-y-2">
                              {/* Character Physical Dimensions & Body Weight */}
                              <div className="flex flex-wrap items-center justify-between gap-1.5 pb-1.5 border-b border-neutral-800">
                                <div className="flex items-center gap-1.5 text-gray-200 font-semibold">
                                  <Scale size={13} className="text-cyan-400" />
                                  <span>Physical Profile</span>
                                </div>
                                <div className="flex items-center gap-2 text-[10px]">
                                  <span className="px-1.5 py-0.5 rounded bg-neutral-800 text-gray-300 border border-neutral-700">
                                    Weight: <strong className="text-white">{pStats.bodyWeight} lbs</strong>
                                  </span>
                                  <span className="px-1.5 py-0.5 rounded bg-neutral-800 text-gray-300 border border-neutral-700">
                                    Dims: <strong className="text-white">{pStats.dimensionsApply ? (pStats.dimensionsRaw || `${pStats.height || '?'} x ${pStats.width || '?'}`) : 'Incorporeal'}</strong>
                                  </span>
                                </div>
                              </div>

                              {/* Encumbrance Meter & Status */}
                              <div>
                                <div className="flex justify-between items-center text-[10px] mb-1">
                                  <span className="text-gray-400 flex items-center gap-1">
                                    <Package size={11} className="text-gray-400" />
                                    Carried: <strong className="text-white">{pStats.totalCarriedWeight} lbs</strong> / {pStats.bodyWeight} lbs ({ratio}%)
                                  </span>
                                  <span className={`px-1.5 py-0.5 rounded font-bold text-[9px] uppercase tracking-wide ${
                                    isOverLift
                                      ? 'bg-red-950 text-red-400 border border-red-800'
                                      : !pStats.encumbranceApplies
                                        ? 'bg-indigo-950 text-indigo-300 border border-indigo-800'
                                        : pStats.isEncumbered
                                          ? 'bg-yellow-950 text-yellow-300 border border-yellow-800'
                                          : 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                                  }`}>
                                    {isOverLift
                                      ? 'Overburdened (Cannot Lift)'
                                      : !pStats.encumbranceApplies
                                        ? 'Immune to Encumbrance'
                                        : pStats.isEncumbered
                                          ? `Encumbered (>${pStats.encumbranceThreshold}% Slower Speed)`
                                          : `Unencumbered (Good <=${pStats.encumbranceThreshold}%)`}
                                  </span>
                                </div>

                                {/* Visual Progress Bar */}
                                <div className="w-full bg-neutral-950 h-2 rounded-full overflow-hidden border border-neutral-800 relative">
                                  {pStats.encumbranceApplies && (
                                    <div
                                      className="absolute top-0 bottom-0 w-0.5 bg-yellow-400/60 z-10"
                                      style={{ left: `${Math.min(100, (pStats.encumbranceThreshold / 100) * (pStats.bodyWeight / Math.max(1, pStats.maxLiftStrength)) * 100)}%` }}
                                      title={`${pStats.encumbranceThreshold}% Encumbrance Threshold`}
                                    />
                                  )}
                                  <div className={`h-full ${!pStats.encumbranceApplies ? 'bg-indigo-500' : barColor} transition-all duration-300`} style={{ width: `${meterWidth}%` }} />
                                </div>

                                <div className="flex justify-between text-[9px] text-gray-500 mt-1">
                                  <span>0 lbs</span>
                                  {pStats.encumbranceApplies ? (
                                    <span className="text-yellow-500">{pStats.encumbranceThreshold}% Threshold ({Math.round(pStats.bodyWeight * (pStats.encumbranceThreshold / 100))} lbs)</span>
                                  ) : (
                                    <span className="text-indigo-400 italic">{pStats.encumbranceImmunityReason || 'Dynamic Biology: Immune'}</span>
                                  )}
                                  <span>Max Lift: {pStats.maxLiftStrength} lbs</span>
                                </div>
                              </div>

                              {/* Speed & Mobility */}
                              <div className="flex items-center justify-between text-[10px] bg-neutral-950/60 p-1.5 rounded border border-neutral-800/80">
                                <span className="text-gray-400 flex items-center gap-1">
                                  <Gauge size={11} className="text-cyan-400" />
                                  Effective Speed:
                                </span>
                                <div className="flex gap-2">
                                  <span className={pStats.isEncumbered ? 'text-yellow-400 font-mono font-medium' : 'text-emerald-400 font-mono'}>
                                    Walk: {pStats.currentWalkingSpeed} m/s
                                  </span>
                                  <span className={pStats.isEncumbered ? 'text-yellow-400 font-mono font-medium' : 'text-emerald-400 font-mono'}>
                                    Run: {pStats.currentRunningSpeed} m/s
                                  </span>
                                  {pStats.isEncumbered && (
                                    <span className="text-[9px] text-yellow-500 font-semibold">(Penalty Active)</span>
                                  )}
                                  </div>
                              </div>

                              {/* Active Transformation Appearance */}
                              {(pStats.temporaryAppearance || (content.match(/[-*•]?\s*Temporary\s+Appearance\s*[:=]\s*([^\r\n]+)/i)?.[1])) && (
                                <div className="p-2 rounded bg-purple-950/40 border border-purple-800/60 text-[10px] space-y-1">
                                  <div className="flex items-center gap-1.5 text-purple-300 font-semibold">
                                    <Sparkles size={12} className="text-purple-400" />
                                    <span>Active Transformation / Form:</span>
                                  </div>
                                  <div className="text-purple-200/95 italic pl-2 text-[9.5px] leading-relaxed">
                                    "{pStats.temporaryAppearance || content.match(/[-*•]?\s*Temporary\s+Appearance\s*[:=]\s*([^\r\n]+)/i)?.[1]}"
                                  </div>
                                </div>
                              )}

                              {/* Active Status Effects & Chained Effects */}
                              {pStats.activeStatusEffects && pStats.activeStatusEffects.length > 0 && (
                                <div className="p-2 rounded bg-neutral-950 border border-neutral-800 space-y-1.5">
                                  <div className="flex items-center justify-between text-[10px] font-semibold">
                                    <div className="flex items-center gap-1.5 text-amber-300">
                                      <Zap size={12} className="text-amber-400" />
                                      <span>Active Status Effects ({pStats.activeStatusEffects.length}):</span>
                                    </div>
                                    <span className="text-[8.5px] text-neutral-500 font-mono">Dynamic Timers</span>
                                  </div>
                                  <div className="space-y-1">
                                    {pStats.activeStatusEffects.map((eff, ei) => (
                                      <div key={ei} className="p-1.5 rounded bg-neutral-900/90 border border-neutral-800/80 text-[9.5px] space-y-0.5">
                                        <div className="flex items-center justify-between font-medium">
                                          <span className="text-amber-300 font-semibold">• {eff.name}</span>
                                          {eff.expires && (
                                            <span className="text-[8.5px] text-cyan-400 font-mono bg-cyan-950/60 px-1 py-0.2 rounded border border-cyan-800/40">
                                              Expires: {eff.expires}
                                            </span>
                                          )}
                                        </div>
                                        {eff.description && (
                                          <div className="text-gray-300 text-[9px] pl-2 leading-relaxed">
                                            {eff.description}
                                          </div>
                                        )}
                                        {eff.appearance && (
                                          <div className="text-purple-300 text-[8.5px] pl-2 italic">
                                            Form: {eff.appearance}
                                          </div>
                                        )}
                                        {eff.chainedEffect && (
                                          <div className="text-emerald-400 text-[8.5px] pl-2 font-mono flex items-center gap-1">
                                            <span>↪ Transitions into:</span>
                                            <span className="font-semibold">{eff.chainedEffect}</span>
                                          </div>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {/* Currently Holding Section */}
                              {pStats.holdingCapacity && pStats.holdingCapacity.applies && (
                                <div className="space-y-1 pt-1 border-t border-neutral-800">
                                  <div className="text-[10px] text-gray-400 font-medium flex items-center justify-between">
                                    <div className="flex items-center gap-1">
                                      <Hand size={11} className="text-amber-400" />
                                      <span>Currently Holding ({pStats.currentlyHolding.length}):</span>
                                    </div>
                                    <div className="flex items-center gap-1">
                                      <span className={`text-[8.5px] px-1.5 py-0.2 rounded font-semibold ${
                                        pStats.holdingCapacity.hasOverflowHold
                                          ? 'bg-red-950 text-red-300 border border-red-800'
                                          : pStats.holdingCapacity.isFull
                                            ? 'bg-amber-950 text-amber-300 border border-amber-800'
                                            : 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                                      }`}>
                                        {pStats.holdingCapacity.hasOverflowHold
                                          ? 'Overflow Hold'
                                          : pStats.holdingCapacity.isFull
                                            ? 'Full'
                                            : `${pStats.holdingCapacity.freeSlots} Free`}
                                      </span>
                                      <span className="text-gray-400 font-mono text-[9px]">
                                        {Math.round(pStats.currentlyHolding.reduce((sum, h) => sum + h.weight, 0) * 10) / 10} lbs
                                      </span>
                                    </div>
                                  </div>

                                  <div className="text-[8.5px] text-neutral-400 pl-1 flex items-center justify-between">
                                    <span className="truncate">Anatomy: {pStats.holdingCapacity.holdingLimbsDescription}</span>
                                    <span className="text-neutral-500 shrink-0">
                                      Slots: {pStats.handSlots !== undefined ? pStats.handSlots : pStats.holdingCapacity.maxStandardHoldCount} (Start Max: {pStats.maxStartingCarryingItems || (pStats.handSlots !== undefined ? pStats.handSlots : pStats.holdingCapacity.maxStandardHoldCount || 2) * 2})
                                    </span>
                                  </div>

                                  {Boolean(pStats.holdingCapacity.hasOverflowHold) && (
                                    <div className="text-[8px] bg-red-950/60 border border-red-800/70 text-red-300 rounded px-1.5 py-0.5 flex items-center justify-between">
                                      <span className="flex items-center gap-1 truncate">
                                        <AlertTriangle size={9} className="text-red-400 shrink-0" />
                                        <span>Accidental Drop Risk ({pStats.currentlyHolding.filter(h => h.isOverflowHold).length} held overflow):</span>
                                      </span>
                                      <span className="font-mono font-bold text-red-200 shrink-0">
                                        {pStats.holdingCapacity.overflowDropChancePercent || 25}% chance
                                      </span>
                                    </div>
                                  )}

                                  {pStats.currentlyHolding.length > 0 ? (
                                    <div className="text-[9px] text-gray-300 pl-1 border-l border-amber-800/60 space-y-1 mt-0.5">
                                      {pStats.currentlyHolding
                                        .filter((it, idx, arr) => {
                                          const cleanName = (it.name || '')
                                            .replace(/^[-*•>\s]*(?:\[(?:(?:right|left|main|off|both)?\s*hands?(?:\s*(?:\(two[- ]handed\)|two[- ]handed|\/\s*arms?))?|two[- ]handed|jaws?|mouth|teeth|talons?|beak|claws?\s*\d*|tentacles?\s*\d*|trunk|held\s+in\s+[a-z]+|in\s+[a-z]+|under\s+arm(?:\s*\(overflow\))?|overflow\s*hold)\]|(?:(?:right|left|main|off|both)\s*hands?|jaws?|mouth|teeth|talons?|beak|claws?\s*\d*|tentacles?\s*\d*|trunk|held\s+in\s+[a-z]+|in\s+[a-z]+|under\s+arm(?:\s*\(overflow\))?|overflow\s*hold)\s*[:=-])(?:\s*(?:\(two[- ]handed\)|two[- ]handed|\/\s*arms?))?[:=\s-]*/i, '')
                                            .replace(/^(?:\(two[- ]handed\)|two[- ]handed|\/\s*arms?)\s*[:=-]\s*/i, '')
                                            .replace(/(?:\s*\.?\s*\(Overflow:\s*Yes[^)]*\))+/gi, '')
                                            .trim()
                                            .toLowerCase();
                                          const key = `${(it.holdingLimb || '').toLowerCase()}|${cleanName}|${it.weight}`;
                                          return (
                                            idx ===
                                            arr.findIndex(other => {
                                              const otherClean = (other.name || '')
                                                .replace(/^[-*•>\s]*(?:\[(?:(?:right|left|main|off|both)?\s*hands?(?:\s*(?:\(two[- ]handed\)|two[- ]handed|\/\s*arms?))?|two[- ]handed|jaws?|mouth|teeth|talons?|beak|claws?\s*\d*|tentacles?\s*\d*|trunk|held\s+in\s+[a-z]+|in\s+[a-z]+|under\s+arm(?:\s*\(overflow\))?|overflow\s*hold)\]|(?:(?:right|left|main|off|both)\s*hands?|jaws?|mouth|teeth|talons?|beak|claws?\s*\d*|tentacles?\s*\d*|trunk|held\s+in\s+[a-z]+|in\s+[a-z]+|under\s+arm(?:\s*\(overflow\))?|overflow\s*hold)\s*[:=-])(?:\s*(?:\(two[- ]handed\)|two[- ]handed|\/\s*arms?))?[:=\s-]*/i, '')
                                                .replace(/^(?:\(two[- ]handed\)|two[- ]handed|\/\s*arms?)\s*[:=-]\s*/i, '')
                                                .replace(/(?:\s*\.?\s*\(Overflow:\s*Yes[^)]*\))+/gi, '')
                                                .trim()
                                                .toLowerCase();
                                              return `${(other.holdingLimb || '').toLowerCase()}|${otherClean}|${other.weight}` === key;
                                            })
                                          );
                                        })
                                        .map((it, hi) => {
                                          let cleanDisplayName = it.name
                                            .replace(/^[-*•>\s]*(?:\[(?:(?:right|left|main|off|both)?\s*hands?(?:\s*(?:\(two[- ]handed(?:\s*grip)?\)|two[- ]handed(?:\s*grip)?|\/\s*arms?|grip))?|two[- ]handed(?:\s*grip)?|\(two[- ]handed(?:\s*grip)?\)|jaws?|mouth|teeth|talons?|beak|claws?\s*\d*|tentacles?\s*\d*|trunk|held\s+in\s+[a-z]+|in\s+[a-z]+|under\s+arm(?:\s*\(overflow\))?|overflow\s*hold)\]|(?:(?:right|left|main|off|both)\s*hands?|jaws?|mouth|teeth|talons?|beak|claws?\s*\d*|tentacles?\s*\d*|trunk|held\s+in\s+[a-z]+|in\s+[a-z]+|under\s+arm(?:\s*\(overflow\))?|overflow\s*hold)\s*[:=-])(?:\s*(?:\(two[- ]handed(?:\s*grip)?\)|two[- ]handed(?:\s*grip)?|\/\s*arms?|grip))?[:=\s-]*/i, '')
                                            .replace(/^(?:\(two[- ]handed(?:\s*grip)?\)|two[- ]handed(?:\s*grip)?|\/\s*arms?|grip)\s*[:=-]\s*/i, '')
                                            .replace(/^weight\s*[:=]\s*[0-9.]+\s*lbs?\.?\s*(?:dimensions?\s*[:=]\s*)?/i, '')
                                            .replace(/(?:\s*\.?\s*\(Overflow:\s*Yes[^)]*\))+/gi, '')
                                            .trim();
                                          if (!cleanDisplayName || WeightInventoryEngine.isLimbOrGripResidue(cleanDisplayName) || /grip|two[- ]handed|\(two[- ]handed\)/i.test(cleanDisplayName)) {
                                            const matchingEq = pStats.equippedGear?.find(e => Math.abs(e.weight - it.weight) < 0.05 && !WeightInventoryEngine.isLimbOrGripResidue(e.name)) ||
                                              pStats.carriedItems?.find(c => Math.abs(c.weight - it.weight) < 0.05 && !WeightInventoryEngine.isLimbOrGripResidue(c.name));
                                            cleanDisplayName = matchingEq ? matchingEq.name : (it.holdingLimb?.includes('Two-Handed') ? 'Two-Handed Weapon' : 'Held Item');
                                          }
                                          return (
                                            <div key={hi} className={`p-1 rounded ${it.isOverflowHold ? 'bg-red-950/40 border border-red-900/60' : 'bg-neutral-950/60'}`}>
                                              <div className="flex justify-between items-center">
                                                <span className="font-medium text-amber-200">
                                                  • {it.holdingLimb ? <span className="text-neutral-400 font-normal">[{it.holdingLimb}] </span> : null}
                                                  {cleanDisplayName}
                                                </span>
                                                <span className="font-mono text-gray-400 text-[8.5px]">
                                                  {it.weight} lbs ({(() => {
                                                    const raw = it.dimensions?.raw || '';
                                                    const dimMatch = raw.match(/([0-9.]+\s*x\s*[0-9.]+(?:\s*x\s*[0-9.]+)?\s*(?:in|inch|inches|cm|m|ft)?)/i);
                                                    if (dimMatch) return dimMatch[1].trim();
                                                    if (raw.length <= 25 && !raw.includes(':') && !raw.toLowerCase().includes('overflow')) return raw;
                                                    if (it.dimensions?.height !== undefined && it.dimensions?.width !== undefined) {
                                                      return `${it.dimensions.height}x${it.dimensions.width}${it.dimensions.depth !== undefined ? `x${it.dimensions.depth}` : ''} in`;
                                                    }
                                                    return 'Standard size';
                                                  })()})
                                                </span>
                                              </div>
                                              {it.isOverflowHold && (
                                                <div className="text-[8px] text-red-400 flex items-center justify-between mt-0.5 pt-0.5 border-t border-red-900/40">
                                                  <div className="flex items-center gap-1 truncate pr-1">
                                                    <AlertTriangle size={9} className="shrink-0 text-red-400" />
                                                    <span className="truncate">{it.overflowWarning || 'Held with overflow; heavier/bulkier items drop first.'}</span>
                                                  </div>
                                                  {it.dropChancePercent !== undefined && (
                                                    <span className="font-mono font-bold text-red-200 shrink-0">
                                                      {it.dropChancePercent}% drop
                                                    </span>
                                                  )}
                                                </div>
                                              )}
                                            </div>
                                          );
                                        })}
                                    </div>
                                  ) : (
                                    <div className="text-[9px] text-gray-500 italic pl-1">
                                      Hands/Appendages Free (0 lbs)
                                    </div>
                                  )}
                                </div>
                              )}

                              {/* Equipped Gear & Armor */}
                              <div className="space-y-1 pt-1 border-t border-neutral-800">
                                <div className="text-[10px] text-gray-400 font-medium flex items-center justify-between">
                                  <div className="flex items-center gap-1">
                                    <Shield size={11} className="text-emerald-400" />
                                    <span>Equipped Gear & Armor ({pStats.equippedGear.length}):</span>
                                  </div>
                                  <span className="text-gray-400 font-mono text-[9px]">
                                    {Math.round(pStats.equippedGear.reduce((sum, g) => sum + g.weight, 0) * 10) / 10} lbs
                                  </span>
                                </div>
                                {pStats.equippedGear.length > 0 ? (
                                  <div className="text-[9px] text-gray-300 pl-1 border-l border-emerald-800/60 space-y-0.5">
                                    {pStats.equippedGear.map((it, gi) => (
                                      <div key={gi} className="flex justify-between items-center">
                                        <span>• {it.name}</span>
                                        <span className="font-mono text-gray-500">{it.weight} lbs ({it.dimensions.raw || 'No dim'})</span>
                                      </div>
                                    ))}
                                  </div>
                                ) : (
                                  <div className="text-[9px] text-gray-500 italic pl-1">
                                    0 lbs (None)
                                  </div>
                                )}
                              </div>

                              {/* Containers & Overflow Detection */}
                              {pStats.containers.length > 0 && (
                                <div className="space-y-1 pt-1 border-t border-neutral-800">
                                  <div className="text-[10px] text-gray-400 font-medium flex items-center justify-between">
                                    <div className="flex items-center gap-1">
                                      <Package size={11} className="text-blue-400" />
                                      <span>Equipped Containers ({pStats.containers.length}):</span>
                                    </div>
                                    {pStats.containers.length > 1 && (
                                      <div className="flex items-center gap-1.5 text-[8.5px]">
                                        <button
                                          type="button"
                                          onClick={() => {
                                            const updates: { [k: string]: boolean } = {};
                                            pStats.containers.forEach((c, idx) => {
                                              updates[`${filename}_${c.name}_${idx}`] = true;
                                            });
                                            setExpandedContainers(prev => ({ ...prev, ...updates }));
                                          }}
                                          className="text-blue-400 hover:text-blue-300 transition-colors"
                                          title="Expand all containers"
                                        >
                                          Expand All
                                        </button>
                                        <span className="text-neutral-700">|</span>
                                        <button
                                          type="button"
                                          onClick={() => {
                                            const updates: { [k: string]: boolean } = {};
                                            pStats.containers.forEach((c, idx) => {
                                              updates[`${filename}_${c.name}_${idx}`] = false;
                                            });
                                            setExpandedContainers(prev => ({ ...prev, ...updates }));
                                          }}
                                          className="text-neutral-500 hover:text-neutral-300 transition-colors"
                                          title="Collapse all containers"
                                        >
                                          Collapse All
                                        </button>
                                      </div>
                                    )}
                                  </div>
                                  {pStats.containers.map((cont, ci) => {
                                    const containerKey = `${filename}_${cont.name}_${ci}`;
                                    const isExpanded = expandedContainers[containerKey] !== false; // expanded by default so user can immediately see items!
                                    return (
                                      <div key={ci} className="bg-neutral-950/90 rounded border border-neutral-800 text-[10px] overflow-hidden transition-colors">
                                        <button
                                          type="button"
                                          onClick={() => setExpandedContainers(prev => ({ ...prev, [containerKey]: !isExpanded }))}
                                          className="w-full text-left p-1.5 flex items-center justify-between hover:bg-neutral-900/60 transition-colors cursor-pointer group"
                                          title={isExpanded ? "Click to collapse container items" : "Click to expand container items"}
                                        >
                                          <div className="flex items-center gap-1.5 min-w-0 pr-2">
                                            <span className="text-gray-500 group-hover:text-blue-400 transition-colors shrink-0">
                                              {isExpanded ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
                                            </span>
                                            <span className="text-blue-300 font-semibold truncate group-hover:text-blue-200">
                                              {cont.name}
                                            </span>
                                            <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-blue-950/70 border border-blue-800/40 text-blue-300 shrink-0 font-medium">
                                              {cont.items.length} {cont.items.length === 1 ? 'item' : 'items'}
                                            </span>
                                            <span className={`text-[8px] px-1 py-0.2 rounded border font-mono shrink-0 ${cont.isRigid ? 'bg-neutral-800/80 text-neutral-300 border-neutral-700' : 'bg-emerald-950/70 text-emerald-300 border-emerald-800/40'}`}>
                                              {cont.isRigid ? 'Rigid (1.0x)' : `Stretch (${cont.stretchFactor || 1.3}x)`}
                                            </span>
                                          </div>
                                          <div className="text-right shrink-0">
                                            <span className="text-gray-400 font-mono text-[8.5px]">
                                              {cont.totalWeight} lbs
                                            </span>
                                            {cont.isStretched && cont.stretchedDimensions ? (
                                              <span className="text-amber-300 font-mono text-[8px] block font-semibold" title={`Stretched size: ${cont.stretchedDimensions.raw} (Base: ${cont.dimensions.raw})`}>
                                                ⚡ {cont.stretchedDimensions.height}x{cont.stretchedDimensions.width}x{cont.stretchedDimensions.depth}"
                                              </span>
                                            ) : (
                                              <span className="text-gray-600 text-[8px] block">
                                                Size: {cont.dimensions.raw || '18x12"'}
                                              </span>
                                            )}
                                          </div>
                                        </button>

                                        {cont.isStretched && !cont.hasOverflow && (
                                          <div className="mx-1.5 mb-1 flex flex-col gap-0.5 text-[8.5px] text-amber-300 bg-amber-950/40 p-1.5 rounded border border-amber-800/50">
                                            <div className="flex items-center gap-1 font-medium">
                                              <span className="text-[10px]">⚡</span>
                                              <span>Stretched to {cont.currentStretchRatio || 1.3}x capacity</span>
                                              <span className="text-amber-400/70 text-[8px] ml-auto">Max: {cont.stretchFactor || 1.3}x</span>
                                            </div>
                                            <div className="text-[8px] text-amber-200/90 pl-3.5">
                                              Updated Size: <span className="font-mono font-semibold text-amber-300">{cont.stretchedDimensions?.raw || cont.currentDimensions?.raw}</span>
                                              <span className="text-amber-400/60 ml-1">(Base: {cont.dimensions.raw})</span>
                                            </div>
                                          </div>
                                        )}
                                        {cont.hasDoesNotFit && (
                                          <div className="mx-1.5 mb-1 flex items-center gap-1 text-[8.5px] text-red-400 bg-red-950/60 p-1 rounded border border-red-800/60">
                                            <AlertOctagon size={11} className="text-red-400 shrink-0" />
                                            <span>{cont.overflowReason || "Cannot Fit: Rigid item's dimensions exceed container opening!"}</span>
                                          </div>
                                        )}
                                        {cont.hasOverflow && (
                                          <div className="mx-1.5 mb-1 flex items-center gap-1 text-[8.5px] text-amber-400 bg-amber-950/60 p-1 rounded border border-amber-800/60">
                                            <AlertTriangle size={11} className="text-amber-400 shrink-0" />
                                            <span>{cont.overflowReason || (cont.isRigid ? "Rigid container cannot stretch (strictly 1.0x space max). Overflow!" : "Container Overflow: Exceeded maximum stretch capacity!")}</span>
                                          </div>
                                        )}

                                        {isExpanded && (
                                          <div className="px-2 pb-1.5 pt-0.5 border-t border-neutral-800/70 bg-black/40 space-y-1">
                                            {cont.items.length === 0 ? (
                                              <div className="text-[9px] text-gray-500 italic py-1 pl-1">
                                                Empty (no items inside this container yet)
                                              </div>
                                            ) : (
                                              <div className="space-y-0.5 pt-0.5">
                                                {cont.items.map((it, ii) => (
                                                  <div key={ii} className="flex justify-between items-center text-[9px] hover:bg-neutral-900/40 px-1 py-0.5 rounded">
                                                    <span className={`truncate pr-1 ${it.doesNotFit ? 'text-red-400 font-semibold' : it.isOverflow ? 'text-amber-300 font-semibold' : 'text-gray-300'}`}>
                                                      • {it.name} {it.doesNotFit ? '⛔ (Does Not Fit)' : it.isOverflow ? `⚠️ (Overflow: ${it.dropChancePercent || 25}% Drop Risk)` : ''}
                                                    </span>
                                                    <span className="font-mono text-gray-500 text-[8px] shrink-0">
                                                      {it.weight} lbs {it.dimensions.raw ? `(${it.dimensions.raw})` : ''}
                                                    </span>
                                                  </div>
                                                ))}
                                              </div>
                                            )}
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              )}

                              {/* Carried Loose Items */}
                              {pStats.carriedItems.length > 0 && (
                                <div className="space-y-1 pt-1 border-t border-neutral-800">
                                  <div className="text-[10px] text-gray-400 font-medium">
                                    Carried Loose Items ({pStats.carriedItems.length}):
                                  </div>
                                  <div className="text-[9px] text-gray-300 pl-1 border-l border-neutral-800 space-y-0.5">
                                    {pStats.carriedItems.map((it, li) => (
                                      <div key={li} className="flex justify-between items-center">
                                        <span>• {it.name}</span>
                                        <span className="font-mono text-gray-500">{it.weight} lbs</span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {/* Currency & Financial Balance */}
                              {pStats.currency && (pStats.currency.hasCurrency || pStats.currency.carriedCurrencies.length > 0 || pStats.currency.storedCurrencies.length > 0) && (
                                <div className="pt-1.5 border-t border-neutral-800/80">
                                  <div className="bg-gradient-to-r from-amber-950/30 to-neutral-900/50 p-2 rounded border border-amber-800/40 text-[10px] space-y-1.5">
                                    <div className="flex items-center justify-between">
                                      <div className="flex items-center gap-1.5 text-amber-300 font-semibold">
                                        <Coins size={12} className="text-amber-400" />
                                        <span>Currency & Balance</span>
                                      </div>
                                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-950/80 text-amber-200 border border-amber-700/50 font-mono font-medium">
                                        Net: {pStats.currency.totalNetWorthSummary || '0'}
                                      </span>
                                    </div>

                                    <div className="grid grid-cols-1 gap-1 text-[9.5px]">
                                      <div className="text-gray-300 bg-neutral-950/60 p-1.5 rounded border border-neutral-800/40 space-y-1">
                                        <div className="flex items-start justify-between gap-1">
                                          <span className="text-gray-400 shrink-0 font-medium">💰 Carried (On Person):</span>
                                          <span className="text-amber-200 font-mono text-right font-medium">
                                            {pStats.currency.carriedSummary || 'None (0)'}
                                          </span>
                                        </div>
                                        {pStats.currency.carriedCurrencies.length > 0 && (
                                          <div className="pt-1 border-t border-neutral-800/50 space-y-1 text-[8.5px]">
                                            {pStats.currency.carriedCurrencies.map((c, ci) => (
                                              <div key={ci} className="flex justify-between items-center text-gray-400">
                                                <div className="truncate mr-1">
                                                  <span className="text-amber-400 font-mono font-semibold">
                                                    • {c.amount.toLocaleString()}x
                                                  </span>{' '}
                                                  <span className="text-amber-200/90 font-medium">
                                                    [{c.name}]
                                                  </span>
                                                  {c.worth && !/^(?:credits?|digital|coins?|currency|money|cash|none|n\/a|unparsed)$/i.test(c.worth.trim()) && c.worth.trim().toLowerCase() !== c.name.trim().toLowerCase() && !WeightInventoryEngine.isContainerName(c.worth) ? (
                                                    <span className="text-gray-400 font-normal"> (Worth: {c.worth})</span>
                                                  ) : null}
                                                  {c.container ? <span className="text-amber-500/80 font-normal"> [{c.container}]</span> : null}
                                                </div>
                                                <div className="text-right font-mono text-[8px] text-gray-500 shrink-0">
                                                  {c.dimensions?.raw && !c.isDigital ? `${c.dimensions.raw} • ` : (c.isDigital ? 'Digital • ' : '')}
                                                  {c.weight !== undefined ? `${c.weight} lbs` : ''}
                                                </div>
                                              </div>
                                            ))}
                                          </div>
                                        )}
                                      </div>

                                      {pStats.currency.storedCurrencies.length > 0 && (
                                        <div className="text-gray-300 bg-neutral-950/60 p-1.5 rounded border border-neutral-800/40 space-y-1">
                                          <div className="flex items-start justify-between gap-1">
                                            <span className="text-gray-400 shrink-0 font-medium">🏦 Stored / Remote:</span>
                                            <span className="text-gray-300 font-mono font-medium text-right">
                                              {pStats.currency.storedSummary}
                                            </span>
                                          </div>
                                          <div className="pt-1 border-t border-neutral-800/50 space-y-1 text-[8.5px]">
                                            {pStats.currency.storedCurrencies.map((sc, sci) => {
                                              const res = sc.location ? parseSecretLocation(sc.location, username, debugMode) : null;
                                              return (
                                                <div key={sci} className="space-y-0.5">
                                                  <div className="flex justify-between items-center text-gray-400">
                                                    <div className="truncate mr-1">
                                                      <span className="text-gray-300 font-mono font-semibold">
                                                        • {sc.amount.toLocaleString()}x
                                                      </span>{' '}
                                                      <span className="text-gray-200 font-medium">
                                                        [{sc.name}]
                                                      </span>
                                                      {sc.worth && !/^(?:credits?|digital|coins?|currency|money|cash|none|n\/a|unparsed)$/i.test(sc.worth.trim()) && sc.worth.trim().toLowerCase() !== sc.name.trim().toLowerCase() && !WeightInventoryEngine.isContainerName(sc.worth) ? (
                                                        <span className="text-gray-400 font-normal"> (Worth: {sc.worth})</span>
                                                      ) : null}
                                                    </div>
                                                    <div className="text-right font-mono text-[8px] text-gray-500 shrink-0">
                                                      {sc.dimensions?.raw && !sc.isDigital ? `${sc.dimensions.raw} • ` : (sc.isDigital ? 'Digital • ' : '')}
                                                      {sc.weight !== undefined ? `${sc.weight} lbs` : ''}
                                                    </div>
                                                  </div>
                                                  {res && (
                                                    <div className={`text-[8px] italic pl-2 truncate ${res.isSecret ? (res.isVisibleToPlayer ? 'text-emerald-400 font-medium' : 'text-gray-500') : 'text-amber-400/90'}`}>
                                                      📍 {res.displayFormatted}
                                                    </div>
                                                  )}
                                                </div>
                                              );
                                            })}
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              )}

                              {/* Stored Items (Not on Person) */}
                              {pStats.storedItems.length > 0 && (
                                <div className="pt-1 border-t border-neutral-800/60">
                                  <button
                                    type="button"
                                    onClick={() => setExpandedStoredItems(prev => ({ ...prev, [filename]: !prev[filename] }))}
                                    className="w-full text-left text-[9px] bg-neutral-950 hover:bg-neutral-900 text-gray-400 p-1.5 rounded border border-neutral-800/60 flex items-center justify-between transition-colors group cursor-pointer"
                                    title={expandedStoredItems[filename] ? "Click to collapse stored items" : "Click to expand stored items"}
                                  >
                                    <div className="flex items-center gap-1.5 font-medium text-gray-300">
                                      <span>📦 Owned & Stored Off-Person ({pStats.storedItems.length})</span>
                                      <span className="text-[8px] text-gray-500 font-normal hidden sm:inline">(Excluded from carried weight)</span>
                                    </div>
                                    <div className="flex items-center gap-1 text-gray-500 group-hover:text-gray-300 shrink-0">
                                      <span className="text-[8px]">{expandedStoredItems[filename] ? 'Hide' : 'View'}</span>
                                      {expandedStoredItems[filename] ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
                                    </div>
                                  </button>
                                  {expandedStoredItems[filename] && (
                                    <div className="mt-1 pl-1.5 border-l border-neutral-800 space-y-1 bg-neutral-950/70 p-1.5 rounded text-[9px]">
                                      {pStats.storedItems.map((it, si) => (
                                        <div key={si} className="text-gray-300 hover:text-white py-0.5 border-b border-neutral-900/60 last:border-0">
                                          <div className="flex justify-between items-center">
                                            <span className="truncate pr-1 font-medium">• {it.name}</span>
                                            <span className="font-mono text-gray-500 text-[8px] shrink-0">
                                              {it.weight > 0 ? `${it.weight} lbs` : '0 lbs'}
                                              {it.dimensions?.raw && it.dimensions.raw !== 'None' && it.dimensions.raw !== '0 lbs' ? ` (${it.dimensions.raw})` : ''}
                                            </span>
                                          </div>
                                          {it.location && (() => {
                                            const locRes = parseSecretLocation(it.location, username, debugMode);
                                            return (
                                              <div className="text-[8px] italic pl-2 flex items-center gap-1 mt-0.5">
                                                <span className={locRes.isSecret ? (locRes.isVisibleToPlayer ? 'text-emerald-300 font-medium' : 'text-gray-500 font-medium') : 'text-amber-300/80'}>
                                                  📍 {locRes.displayFormatted}
                                                </span>
                                              </div>
                                            );
                                          })()}
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })()}

                        <div
                          className="p-2 text-gray-400 whitespace-pre-wrap text-[10px] md:text-xs leading-relaxed"
                          onClick={handleContentClick}
                        >
                          <span dangerouslySetInnerHTML={{ __html: parseLinks(formatContent(content)) }} />
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            
            {/* Status Section inside Files Tab */}
            <div className="h-28 sm:h-32 max-h-40 min-h-[60px] border-t border-neutral-800 flex flex-col bg-neutral-950 shrink-0">
              <div className="p-1.5 sm:p-2 border-b border-neutral-800 bg-neutral-900 text-gray-400 font-bold uppercase tracking-wider text-[9.5px] sm:text-[10px] flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Activity size={12} className="text-amber-400" />
                  <span>Live Status Updates</span>
                  {(updates || []).filter((_, i) => !dismissedUpdates.has(i)).length > 0 && (
                    <span className="text-[8px] px-1 py-0.2 rounded bg-neutral-800 text-gray-300 font-normal">
                      {(updates || []).filter((_, i) => !dismissedUpdates.has(i)).length}
                    </span>
                  )}
                </div>
                {(updates || []).filter((_, i) => !dismissedUpdates.has(i)).length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      const allIdxs = (updates || []).map((_, i) => i);
                      setDismissedUpdates(new Set(allIdxs));
                    }}
                    className="text-[8.5px] text-gray-500 hover:text-gray-300 transition-colors cursor-pointer capitalize font-normal px-1 py-0.5 rounded hover:bg-neutral-800/60"
                    title="Clear status updates"
                  >
                    Clear All
                  </button>
                )}
              </div>
              <div className="flex-1 overflow-y-auto p-1.5 sm:p-2 font-mono text-[9.5px] sm:text-[10px] md:text-xs space-y-1" style={{ WebkitOverflowScrolling: 'touch' }}>
                {(updates || []).filter((_, i) => !dismissedUpdates.has(i)).length === 0 && (
                  <span className="text-gray-700 italic">No updates...</span>
                )}
                {(updates || []).map((u, i) => {
                  if (dismissedUpdates.has(i)) return null;
                  const isNeg = u.value < 0;
                  const isPos = u.value > 0;
                  return (
                    <div
                      key={i}
                      className="group flex items-center justify-between gap-1 p-1 rounded bg-neutral-900/40 hover:bg-neutral-900/80 border border-neutral-800 transition-colors animate-in fade-in slide-in-from-left-2 duration-300"
                    >
                      <span className={`truncate ${isNeg ? 'text-red-400' : isPos ? 'text-green-400' : 'text-yellow-400'}`}>
                        {typeof u.text === 'object' && u.text !== null
                          ? ((u.text as any).text || (u.text as any).description || JSON.stringify(u.text))
                          : String(u.text || '')}
                      </span>
                      <button
                        type="button"
                        onClick={() => setDismissedUpdates(prev => new Set([...prev, i]))}
                        className="text-gray-600 hover:text-gray-300 p-0.5 rounded hover:bg-neutral-800/80 transition-colors shrink-0 cursor-pointer"
                        title="Dismiss update"
                        aria-label="Dismiss update"
                      >
                        <X size={11} />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 overflow-hidden relative">
            <MapPanel ref={mapPanelRef} fileSystem={fileSystem} files={files} username={username} debugMode={debugMode} syncCount={syncCount} />
          </div>
        )}
      </div>
      </div>
      </>
      )}
    </div>
  );
};

export default Sidebar;