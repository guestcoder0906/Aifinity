import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { AIEngine } from './services/aiEngine';
import { FileSystem } from './services/fileSystem';
import { NarrativeEntry, UpdateItem } from './types';
import Sidebar from './components/Sidebar';
import { MapPanelHandle } from './components/MapPanel';
import NarrativeWindow from './components/NarrativeWindow';
import InputArea from './components/InputArea';
import Modal from './components/Modal';
import MainMenu from './components/MainMenu';
import { MultiplayerService, MultiplayerChatMessage } from './services/multiplayer';
import { MultiplayerChat } from './components/MultiplayerChat';
import { ActiveMultiplayerGamesModal } from './components/ActiveMultiplayerGamesModal';
import { SuggestionGenerator } from './services/suggestionGenerator';
import WelcomePage from './components/WelcomePage';
import AuthModal from './components/AuthModal';
import GuestNameModal from './components/GuestNameModal';
import MarketModal from './components/MarketModal';
import ActionLimitModal from './components/ActionLimitModal';
import GuestWelcomeModal from './components/GuestWelcomeModal';
import AdventuresModal from './components/AdventuresModal';
import CommunityAdventuresModal from './components/CommunityAdventuresModal';
import AccountModal from './components/AccountModal';
import UndoModal from './components/UndoModal';
import { HistoryService } from './services/historyService';
import GoldenName from './components/GoldenName';
import { LoadingScreen } from './components/LoadingScreen';
import { ReceiptModal } from './components/ReceiptModal';
import { ShareRoomModal } from './components/ShareRoomModal';
import { PurchaseNotificationBanner } from './components/PurchaseNotificationBanner';
import { DailyClaimNotificationBanner } from './components/DailyClaimNotificationBanner';
import { LiveStatusUpdates } from './components/LiveStatusUpdates';
import { auth, db } from './services/firebase';
import { doc, onSnapshot } from 'firebase/firestore';
import {
  UserProfile,
  subscribeToAuth,
  logOut,
  getOrCreateGuestId,
  generateUniqueGuestMultiplayerName,
  recordPaymentTransaction,
  PaymentTransactionRecord,
  getLocalTransactions,
  getUserTransactions,
  getUserProfile,
  enrichUserProfileWithDefaults
} from './services/authService';
import { syncUserPurchasesFromStripe } from './services/stripeCheckoutService';
import { ActionLimitService, ActionStatus } from './services/actionLimitService';
import { SavedAdventure, CommunityAdventure } from './services/adventuresService';
import {
  Compass,
  User,
  LogIn,
  LogOut as LogOutIcon,
  ShoppingCart,
  Bookmark,
  Globe,
  Zap,
  Crown,
  Menu,
  ChevronDown as ChevronDownIcon,
  ChevronUp as ChevronUpIcon,
  FileText,
  Map as MapIcon,
  Receipt as ReceiptIcon,
  CheckCircle2,
  Sparkles,
  PanelLeftOpen,
  PanelLeftClose,
  RotateCcw,
  RefreshCw,
  Maximize2,
  Minimize2,
  Share2,
  Users,
  MessageSquare,
  Trash2
} from 'lucide-react';

// Instantiate services outside component to persist across re-renders
const fileSystem = new FileSystem();
const aiEngine = new AIEngine(fileSystem);

/**
 * Extracts a display-ready timestamp from WorldTime.txt content,
 * supporting both the temporal displacement schema and legacy flat timestamps.
 */
function parseActiveWorldTime(rawTime: string | null): string {
  if (!rawTime) return '';
  const activeBlockMatch = rawTime.match(/\[CURRENT ACTIVE TIME\][\s\S]*?Timestamp:\s*([^\n\r]+)/i);
  if (activeBlockMatch && activeBlockMatch[1]) {
    return activeBlockMatch[1].trim();
  }
  const fallbackMatch = rawTime.match(/\d{1,2}:\d{2}(?::\d{2})?\s*(?:AM|PM)?\s*-\s*[A-Za-z]+\s+\d{1,2},\s*\d{4}/i);
  if (fallbackMatch) {
    return fallbackMatch[0].trim();
  }
  return rawTime.trim().split('\n')[0] || '';
}

function sanitizeRecommendations(raw: any): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((r: any) => {
    if (typeof r === 'string') return r;
    if (typeof r === 'object' && r !== null) {
      return r.text || r.label || r.action || r.recommendation || JSON.stringify(r);
    }
    return String(r || '');
  }).filter((r: string) => typeof r === 'string' && r.trim().length > 0);
}

function sanitizePlayerRecommendations(raw: any): Record<string, string[]> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const result: Record<string, string[]> = {};
  for (const [key, val] of Object.entries(raw)) {
    if (typeof key === 'string' && key.trim().length > 0) {
      result[key.trim()] = sanitizeRecommendations(val);
    }
  }
  return result;
}

function sanitizeUpdates(raw: any): UpdateItem[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((u: any) => {
    if (!u) return { type: 'misc' as const, text: '', value: 0 };
    let textStr = u.text;
    if (typeof textStr === 'object' && textStr !== null) {
      textStr = textStr.text || textStr.description || textStr.message || JSON.stringify(textStr);
    }
    return {
      ...u,
      text: typeof textStr === 'string' ? textStr : String(textStr || '')
    };
  });
}

function sanitizeNarrativeEntries(raw: any): NarrativeEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((entry: any) => {
    if (!entry) return { id: Date.now().toString(), text: '', type: 'system' as const };
    let textStr = entry.text;
    if (typeof textStr === 'object' && textStr !== null) {
      textStr = textStr.text || textStr.content || textStr.narrative || JSON.stringify(textStr);
    }
    return {
      ...entry,
      text: typeof textStr === 'string' ? textStr : String(textStr || '')
    };
  });
}

function extractOrGenerateCharacterName(
  description?: string,
  username?: string,
  excludedNames: string[] = []
): string {
  const cleanUser = (username || '').trim().toLowerCase();
  const normalizedExclusions = new Set(
    excludedNames.map(n => n.trim().toLowerCase()).filter(Boolean)
  );
  normalizedExclusions.add(cleanUser);
  normalizedExclusions.add('adventurer');
  normalizedExclusions.add('player');
  normalizedExclusions.add('hero');
  normalizedExclusions.add('dead');
  normalizedExclusions.add('npc');

  if (description) {
    const trimmed = description.trim();
    const directNameMatch =
      trimmed.match(/(?:named|name is|character named|called|character:?)\s+([A-Z][a-zA-Z'\-]{1,20}(?:\s+[A-Z][a-zA-Z'\-]{1,20})?)/i) ||
      trimmed.match(/^(?:I am|I'm|Name:?|Playing as:?)\s+([A-Z][a-zA-Z'\-]{1,20}(?:\s+[A-Z][a-zA-Z'\-]{1,20})?)/i) ||
      trimmed.match(/\[(?:Name|Character Name)\]:?\s*([A-Z][a-zA-Z'\-]{1,20}(?:\s+[A-Z][a-zA-Z'\-]{1,20})?)/i) ||
      trimmed.match(/^([A-Z][a-z]{2,15}\s+[A-Z][a-z]{2,15})(?:,|\s+is|\s+a|\s+-)/); // e.g. "Brom Ironhand, a dwarf..."

    if (directNameMatch && directNameMatch[1]) {
      const cand = directNameMatch[1].trim();
      const candLower = cand.toLowerCase();
      if (!normalizedExclusions.has(candLower)) {
        return cand;
      }
    }

    // Keyword & archetype suggestions from prompt
    const lowerDesc = trimmed.toLowerCase();
    const archetypes: Array<{ match: RegExp; names: string[] }> = [
      { match: /dwarf|blacksmith|forge|hammer|miner|stone/i, names: ['Brom Ironhand', 'Thorik Stonebreaker', 'Dain Deepforge', 'Hulda Fireheart', 'Bardin Coppervein'] },
      { match: /elf|elven|druid|forest|bow|ranger|scout/i, names: ['Faelar Moonshadow', 'Lyari Swiftwind', 'Aeloria Whisperleaf', 'Caelen Starfall', 'Sylas Verdant'] },
      { match: /mage|wizard|sorcerer|spell|arcane|witch/i, names: ['Valerius Vance', 'Ignis Pyre', 'Zephyr Astral', 'Morrigan Nightshade', 'Althea Spellweaver'] },
      { match: /rogue|thief|assassin|shadow|dagger|sneak/i, names: ['Corvus Shadowstep', 'Nyx Blackthorn', 'Vesper Grey', 'Rook Quickfoot', 'Cassian Whisper'] },
      { match: /paladin|knight|cleric|holy|templar|crusader/i, names: ['Gideon Dawnseeker', 'Lorien Radiant', 'Valeria Sunshield', 'Theron Justicar', 'Aria Pureheart'] },
      { match: /barbarian|berserker|warrior|fighter|gladiator/i, names: ['Torvald Skullcrusher', 'Ragnar Stormborn', 'Astrid Bloodaxe', 'Grom Ironfist', 'Kragor Mountain'] }
    ];

    for (const arch of archetypes) {
      if (arch.match.test(lowerDesc)) {
        for (const candidate of arch.names) {
          if (!normalizedExclusions.has(candidate.toLowerCase())) {
            return candidate;
          }
        }
      }
    }
  }

  const fantasyNames = [
    'Kaelen Thorne', 'Lyra Whisperwind', 'Valerius Vance', 'Aria Shadowglen',
    'Theron Ironwood', 'Elira Dawnseeker', 'Darius Stormborn', 'Sylas Nightshade',
    'Caelum Drake', 'Rowan Ashford', 'Mira Ravencrest', 'Orion Sterling',
    'Balthazar Stone', 'Elowen Frost', 'Garrett Hawk', 'Seraphina Vale',
    'Torin Ember', 'Zephyr Cloud', 'Mireille Dusk', 'Kallum Ash'
  ];

  const seed = (cleanUser || '').split('').reduce((acc, c) => acc + c.charCodeAt(0), 0) + (description ? description.length * 7 + 13 : Date.now());
  for (let i = 0; i < fantasyNames.length; i++) {
    const candidate = fantasyNames[(seed + i) % fantasyNames.length];
    if (!normalizedExclusions.has(candidate.toLowerCase())) {
      return candidate;
    }
  }

  return `Adventurer ${Math.floor(100 + Math.random() * 899)}`;
}

function App() {
  const [narrative, setNarrative] = useState<NarrativeEntry[]>(() => {
    try {
      const saved = localStorage.getItem('aimud_narrative');
      const parsed = saved ? JSON.parse(saved) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });
  const [files, setFiles] = useState<string[]>([]);
  const [updates, setUpdates] = useState<UpdateItem[]>(() => {
    try {
      const saved = localStorage.getItem('aimud_updates');
      const parsed = saved ? JSON.parse(saved) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });
  const [isProcessing, setIsProcessing] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [debugMode, setDebugMode] = useState(false);
  const [isResetModalOpen, setIsResetModalOpen] = useState(false);
  const [isUndoModalOpen, setIsUndoModalOpen] = useState(false);
  const [undoCount, setUndoCount] = useState<number>(() => HistoryService.getCount());
  const [expandedFile, setExpandedFile] = useState<string | null>(null);
  const [worldTime, setWorldTime] = useState<string>('');
  const [gameOver, setGameOver] = useState(false);
  const [isTerminatedOpen, setIsTerminatedOpen] = useState(false);
  const [isCreatingNewAfterDeath, setIsCreatingNewAfterDeath] = useState(false);
  const [newCharacterDescription, setNewCharacterDescription] = useState('');
  const [isSubmittingNewCharacter, setIsSubmittingNewCharacter] = useState(false);
  const [recommendations, setRecommendations] = useState<string[]>([]);
  const [playerRecommendations, setPlayerRecommendations] = useState<Record<string, string[]>>({});
  const [autoRecommendationsEnabled, setAutoRecommendationsEnabled] = useState<boolean>(() => {
    const saved = localStorage.getItem('aimud_autoRecommendationsEnabled');
    return saved !== null ? JSON.parse(saved) : true;
  });
  const [syncCount, setSyncCount] = useState(0);

  // Multiplayer state
  const [gameMode, setGameMode] = useState<'singleplayer' | 'multiplayer'>(() => {
    const saved = localStorage.getItem('aimud_gameMode');
    return (saved === 'multiplayer' ? 'multiplayer' : 'singleplayer');
  });
  const [showMultiplayerModal, setShowMultiplayerModal] = useState<'host' | 'join' | null>(null);
  const [shareRoomModalCode, setShareRoomModalCode] = useState<string | null>(null);
  const [urlRoomToJoin, setUrlRoomToJoin] = useState<string>('');
  const [pendingMultiplayerAction, setPendingMultiplayerAction] = useState<{ mode: 'host' | 'join'; roomId?: string } | null>(null);
  const [multiplayerService, setMultiplayerService] = useState<MultiplayerService | null>(null);
  const [roomState, setRoomState] = useState<any>(null);
  const roomStateRef = useRef<any>(null);
  const [chatMessages, setChatMessages] = useState<MultiplayerChatMessage[]>([]);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [lastChatReadCount, setLastChatReadCount] = useState(0);
  const [isActiveGamesModalOpen, setIsActiveGamesModalOpen] = useState(false);
  const [isActiveGamesSlotLimitWarning, setIsActiveGamesSlotLimitWarning] = useState(false);
  const [username, setUsername] = useState<string>(() => {
    return localStorage.getItem('aimud_username') || '';
  });
  const processingCountRef = useRef(0);
  const [showCharacterCreation, setShowCharacterCreation] = useState(false);
  const [isSubmittingCharacter, setIsSubmittingCharacter] = useState(false);
  const [characterDescription, setCharacterDescription] = useState('');
  const mapPanelRef = useRef<MapPanelHandle>(null);

  // Authentication & Guest state
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [guestId, setGuestId] = useState<string>(() => getOrCreateGuestId());
  const [guestName, setGuestName] = useState<string | null>(() => {
    return localStorage.getItem('aifinity_guest_name');
  });
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [authModalInitialTab, setAuthModalInitialTab] = useState<'login' | 'signup'>('signup');
  const [isGuestNameModalOpen, setIsGuestNameModalOpen] = useState(false);

  // App initialization & full loading gate
  const [isAppFullyLoaded, setIsAppFullyLoaded] = useState<boolean>(false);
  const [authInitialized, setAuthInitialized] = useState<boolean>(false);

  // Guest welcome prompt state (prompt on first visit unless user set "Don't show again")
  const [isGuestWelcomeOpen, setIsGuestWelcomeOpen] = useState(() => {
    try {
      return localStorage.getItem('aimud_hide_guest_welcome') !== 'true';
    } catch (e) {
      return true;
    }
  });

  // Action Limits & Monetization state
  const [actionStatus, setActionStatus] = useState<ActionStatus>(() => ActionLimitService.getActionStatus(null, guestId));
  const [dailyClaimNotification, setDailyClaimNotification] = useState<{ amount: number; stacked?: number; totalStacked?: number; total: number } | null>(null);
  const [isMarketOpen, setIsMarketOpen] = useState(false);
  const [marketInitialTab, setMarketInitialTab] = useState<'packs' | 'subscriptions' | 'apikey'>('packs');
  const [isActionLimitModalOpen, setIsActionLimitModalOpen] = useState(false);

  // Adventures & Community state
  const [isAdventuresModalOpen, setIsAdventuresModalOpen] = useState(false);
  const [isCommunityModalOpen, setIsCommunityModalOpen] = useState(false);
  const [adventureToShare, setAdventureToShare] = useState<SavedAdventure | null>(null);
  const [isAccountModalOpen, setIsAccountModalOpen] = useState(false);
  const [isMobileTopMenuOpen, setIsMobileTopMenuOpen] = useState(false);
  const [isMobilePanelOpen, setIsMobilePanelOpen] = useState(false);
  const [mobilePanelTab, setMobilePanelTab] = useState<'files' | 'map'>('files');
  // Sidebar minimizable & expandable (minimized by default)
  const [isSidebarMinimized, setIsSidebarMinimized] = useState<boolean>(true);

  // Browser Fullscreen toggle state
  const [isFullscreen, setIsFullscreen] = useState<boolean>(() => {
    if (typeof document !== 'undefined') {
      return !!document.fullscreenElement;
    }
    return false;
  });

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
    };
  }, []);

  const toggleFullscreen = useCallback(() => {
    try {
      if (!document.fullscreenElement) {
        if (document.documentElement.requestFullscreen) {
          document.documentElement.requestFullscreen();
        } else if ((document.documentElement as any).webkitRequestFullscreen) {
          (document.documentElement as any).webkitRequestFullscreen();
        }
      } else {
        if (document.exitFullscreen) {
          document.exitFullscreen();
        } else if ((document as any).webkitExitFullscreen) {
          (document as any).webkitExitFullscreen();
        }
      }
    } catch (err) {
      console.warn('Fullscreen toggle not permitted or failed', err);
    }
  }, []);

  const [stripeReturnMessage, setStripeReturnMessage] = useState<{
    type: 'success' | 'info' | 'error';
    text: string;
  } | null>(null);
  const [verifiedReceiptTransaction, setVerifiedReceiptTransaction] = useState<PaymentTransactionRecord | null>(null);
  const [isReceiptModalOpen, setIsReceiptModalOpen] = useState(false);

  // Dynamically keep app height strictly bounded to mobile visual viewport (handles address bar and virtual keyboard)
  useEffect(() => {
    const updateAppHeight = () => {
      const h = window.visualViewport ? window.visualViewport.height : window.innerHeight;
      document.documentElement.style.setProperty('--app-height', `${h}px`);
    };
    updateAppHeight();
    window.addEventListener('resize', updateAppHeight);
    window.addEventListener('orientationchange', updateAppHeight);
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', updateAppHeight);
      window.visualViewport.addEventListener('scroll', updateAppHeight);
    }
    return () => {
      window.removeEventListener('resize', updateAppHeight);
      window.removeEventListener('orientationchange', updateAppHeight);
      if (window.visualViewport) {
        window.visualViewport.removeEventListener('resize', updateAppHeight);
        window.visualViewport.removeEventListener('scroll', updateAppHeight);
      }
    };
  }, []);

  const refreshActionStatus = useCallback(() => {
    setActionStatus(ActionLimitService.getActionStatus(currentUser, guestId));
  }, [currentUser, guestId]);

  const isSyncingPurchasesRef = useRef(false);
  const lastSyncTimestampByUid = useRef<Record<string, number>>({});
  const notifiedPurchaseIdsRef = useRef<Set<string>>(new Set());
  const lastPurchaseToastTimeRef = useRef<number>(0);

  // Unified automatic purchase sync engine:
  // Strictly attributes completed purchases ONLY to the exact account that bought them.
  // Automatically detects completed payments via tab focus, visibilitychange, fast polling,
  // and Firestore real-time snapshots — completely eliminating the need for website code rebuilds.
  const syncUserPurchases = useCallback(async (
    targetUser?: UserProfile | null
  ) => {
    const user = targetUser || currentUser;
    if (!user || !user.uid || isSyncingPurchasesRef.current) return;
    const now = Date.now();
    if (lastSyncTimestampByUid.current[user.uid] && now - lastSyncTimestampByUid.current[user.uid] < 4000) {
      return; // Debounce rapid back-to-back syncs during auth initialization
    }
    lastSyncTimestampByUid.current[user.uid] = now;
    isSyncingPurchasesRef.current = true;

    try {
      const syncRes = await syncUserPurchasesFromStripe(
        user.uid,
        user.email || undefined,
        user.username || undefined
      );

      if (syncRes.success) {
        // 1. Sync real-time active monthly subscription if present
        if (syncRes.activeSubscription !== undefined) {
          // If there is an active monthly sub, or if the user had a stripe sub and no purchased tier overrides it
          const shouldCheckSub = syncRes.activeSubscription || (!syncRes.highestPurchasedTier && user.stripeSubscriptionId);
          if (shouldCheckSub) {
            const syncedSubUser = await ActionLimitService.syncSubscriptionState(
              user,
              syncRes.activeSubscription as any,
              guestId
            );
            if (syncedSubUser) {
              user.tier = syncedSubUser.tier;
              user.stripeSubscriptionId = syncedSubUser.stripeSubscriptionId;
              user.subscriptionExpiresAt = syncedSubUser.subscriptionExpiresAt;
              setCurrentUser({ ...syncedSubUser });
              setActionStatus(ActionLimitService.getActionStatus(syncedSubUser, guestId));
            }
          }
        }

        // 2. Cross-reference all completed purchases attached to this account
        if (syncRes.purchases && syncRes.purchases.length > 0) {
          // Collect known transactions from localStorage and UserProfile
          const localTx = getLocalTransactions(user.uid);
          const knownIds = new Set<string>();
          const creditedTxSet = new Set<string>();

          localTx.forEach((t) => {
            if (t?.id) {
              knownIds.add(t.id);
              knownIds.add(String(t.id).replace(/[^a-zA-Z0-9_-]/g, '_'));
              if (t.actionDelta || t.itemType === 'pack') {
                creditedTxSet.add(t.id);
                creditedTxSet.add(String(t.id).replace(/[^a-zA-Z0-9_-]/g, '_'));
              }
            }
          });

          // Include persistent applied & credited transaction IDs from user profile
          if (Array.isArray(user.appliedTransactionIds)) {
            user.appliedTransactionIds.forEach((id) => {
              knownIds.add(id);
              knownIds.add(String(id).replace(/[^a-zA-Z0-9_-]/g, '_'));
              creditedTxSet.add(id);
              creditedTxSet.add(String(id).replace(/[^a-zA-Z0-9_-]/g, '_'));
            });
          }
          if (Array.isArray(user.creditedActionTxIds)) {
            user.creditedActionTxIds.forEach((id) => {
              knownIds.add(id);
              knownIds.add(String(id).replace(/[^a-zA-Z0-9_-]/g, '_'));
              creditedTxSet.add(id);
              creditedTxSet.add(String(id).replace(/[^a-zA-Z0-9_-]/g, '_'));
            });
          }

          // Also load credited tx IDs from localStorage
          try {
            const rawCred = localStorage.getItem(`aifinity_credited_txs_${user.uid}`);
            if (rawCred) {
              const parsedCred = JSON.parse(rawCred);
              if (Array.isArray(parsedCred)) {
                parsedCred.forEach((id: string) => {
                  knownIds.add(id);
                  knownIds.add(String(id).replace(/[^a-zA-Z0-9_-]/g, '_'));
                  creditedTxSet.add(id);
                  creditedTxSet.add(String(id).replace(/[^a-zA-Z0-9_-]/g, '_'));
                });
              }
            }
          } catch (e) {}

          // Also load persistently notified IDs from localStorage to avoid spamming after page reload
          try {
            const rawNotified = localStorage.getItem(`aifinity_notified_purchases_${user.uid}`);
            if (rawNotified) {
              const parsed = JSON.parse(rawNotified);
              if (Array.isArray(parsed)) {
                parsed.forEach((id: string) => {
                  knownIds.add(id);
                  notifiedPurchaseIdsRef.current.add(id);
                });
              }
            }
          } catch (e) {}

          // Cross-reference Firestore transactions
          try {
            const firestoreTx = await getUserTransactions(user.uid);
            firestoreTx.forEach((t) => {
              if (t?.id) {
                knownIds.add(t.id);
                knownIds.add(String(t.id).replace(/[^a-zA-Z0-9_-]/g, '_'));
                if (t.actionDelta || t.itemType === 'pack') {
                  creditedTxSet.add(t.id);
                  creditedTxSet.add(String(t.id).replace(/[^a-zA-Z0-9_-]/g, '_'));
                }
              }
            });
          } catch (e) {
            // ignore
          }

          // Include in-memory notified IDs to prevent any duplicate toast notifications
          notifiedPurchaseIdsRef.current.forEach((id) => knownIds.add(id));

          const newTxIdsToCredit: string[] = [];
          let totalNewCredits = 0;
          let newlyFoundPurchases = false;
          let latestReceipt: PaymentTransactionRecord | null = null;

          const tierRank: Record<string, number> = {
            free: 0,
            adventurer: 1,
            legendary: 2,
            celestial: 3
          };

          let bestPurchasedTier: 'adventurer' | 'legendary' | 'celestial' | null = (syncRes.highestPurchasedTier as any) || null;

          for (const p of syncRes.purchases) {
            if (p.itemType === 'tier' && p.itemId) {
              const rank = tierRank[p.itemId] || 0;
              const currentBestRank = bestPurchasedTier ? tierRank[bestPurchasedTier] : 0;
              if (rank > currentBestRank) {
                bestPurchasedTier = p.itemId as any;
              }
            }

            const safeId = String(p.id).replace(/[^a-zA-Z0-9_-]/g, '_');
            const isAlreadyCredited = creditedTxSet.has(p.id) || creditedTxSet.has(safeId);
            const isAlreadyKnown =
              isAlreadyCredited ||
              knownIds.has(p.id) ||
              knownIds.has(safeId) ||
              notifiedPurchaseIdsRef.current.has(p.id) ||
              notifiedPurchaseIdsRef.current.has(safeId);

            if (!isAlreadyKnown && !isAlreadyCredited) {
              newlyFoundPurchases = true;
              knownIds.add(p.id);
              knownIds.add(safeId);
              creditedTxSet.add(p.id);
              creditedTxSet.add(safeId);
              notifiedPurchaseIdsRef.current.add(p.id);
              notifiedPurchaseIdsRef.current.add(safeId);

              // ONLY credit actions if this exact transaction ID was NEVER credited to this account
              if (p.itemType === 'pack' && p.actionDelta > 0) {
                totalNewCredits += p.actionDelta;
                newTxIdsToCredit.push(p.id);
                newTxIdsToCredit.push(safeId);
              }

              const tx: PaymentTransactionRecord = {
                id: p.id,
                amount: p.amount,
                itemName: p.itemName,
                itemType: p.itemType,
                paymentMethod: p.paymentMethod || 'Stripe Checkout',
                status: 'completed',
                createdAt: p.createdAt,
                customerName: p.customerName || p.username || user.username || 'Adventurer',
                email: p.email || user.email || undefined,
                attachedUsername: p.username || user.username || 'Adventurer',
                recipient: p.username || user.username || user.email || 'Adventurer',
                notes: p.itemType === 'pack' ? `Restored ${p.actionDelta} actions` : `Activated ${p.itemName}`,
                actionDelta: p.actionDelta,
                newTier: p.itemType === 'tier' ? p.itemId : undefined,
                userId: p.userId || user.uid
              };

              await recordPaymentTransaction(user.uid, tx);
              latestReceipt = tx;
            }
          }

          // Persist all known IDs and credited IDs to localStorage so notifications and duplicate restores never happen
          try {
            const allKnown = Array.from(knownIds);
            localStorage.setItem(`aifinity_notified_purchases_${user.uid}`, JSON.stringify(allKnown.slice(-100)));
            localStorage.setItem(`aifinity_credited_txs_${user.uid}`, JSON.stringify(Array.from(creditedTxSet).slice(-200)));
          } catch (e) {}

          const currentTierRank = tierRank[user.tier || 'free'] || 0;
          const bestRank = bestPurchasedTier ? (tierRank[bestPurchasedTier] || 0) : 0;
          const needsTierUpgrade = Boolean(bestPurchasedTier && bestRank > currentTierRank);

          if ((newlyFoundPurchases && totalNewCredits > 0) || needsTierUpgrade) {
            const targetTier = needsTierUpgrade ? bestPurchasedTier : (bestPurchasedTier || undefined);
            const updated = await ActionLimitService.applyRestoredPurchases(
              user,
              totalNewCredits,
              targetTier as any,
              guestId,
              undefined,
              newTxIdsToCredit
            );
            setCurrentUser({ ...updated });
            setActionStatus(ActionLimitService.getActionStatus(updated, guestId));

            // Only show toast and receipt modal if there was genuinely an uncredited purchase and hasn't shown recently
            const now = Date.now();
            if (newlyFoundPurchases && (totalNewCredits > 0 || needsTierUpgrade) && now - lastPurchaseToastTimeRef.current > 30000) {
              lastPurchaseToastTimeRef.current = now;
              if (latestReceipt) {
                setVerifiedReceiptTransaction(latestReceipt);
                setIsReceiptModalOpen(true);
              }

              setStripeReturnMessage({
                type: 'success',
                text: `🎉 Membership & Purchases Applied! ${user.username}'s account is now ${updated.tier.toUpperCase()} tier${updated.actionCredits ? ` with ${updated.actionCredits} action credits` : ''}.`
              });
            }

            // Cross-tab broadcast
            try {
              localStorage.setItem(
                'aifinity_payment_sync_event',
                JSON.stringify({ uid: user.uid, time: Date.now() })
              );
            } catch (e) {}
          }

          // Clear active checkout markers so background polling stops immediately once verified
          try {
            sessionStorage.removeItem('aifinity_active_stripe_checkout');
            localStorage.removeItem('aifinity_active_stripe_checkout');
            if (newlyFoundPurchases) {
              sessionStorage.removeItem('aifinity_pending_checkout');
              localStorage.removeItem('aifinity_pending_checkout');
            }
          } catch (e) {}
        }
      }
    } catch (syncErr) {
      console.warn('Auto sync purchases failed:', syncErr);
    } finally {
      isSyncingPurchasesRef.current = false;
    }
  }, [currentUser, guestId]);

  // Real-time Firestore user profile listener
  // Automatically syncs whenever actions, credits, or tier change in the database
  useEffect(() => {
    if (!currentUser?.uid) return;
    const uid = currentUser.uid;
    const userDocRef = doc(db, 'users', uid);

    const unsub = onSnapshot(
      userDocRef,
      (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data() as UserProfile;
          const enriched = enrichUserProfileWithDefaults(data);
          setCurrentUser((prev) => {
            if (!prev || prev.uid !== uid) return prev;
            if (
              prev.actionCredits !== enriched.actionCredits ||
              prev.tier !== enriched.tier ||
              prev.dailyActionsUsed !== enriched.dailyActionsUsed ||
              prev.role !== enriched.role ||
              prev.hasInfiniteActions !== enriched.hasInfiniteActions
            ) {
              setActionStatus(ActionLimitService.getActionStatus(enriched, guestId));
              return { ...prev, ...enriched };
            }
            return prev;
          });
        }
      },
      (error) => {
        console.warn('Firestore user profile onSnapshot error:', error);
      }
    );

    return () => unsub();
  }, [currentUser?.uid, guestId]);

  // Immediate sync on tab return or window focus (e.g. after customer pays in Stripe tab)
  useEffect(() => {
    const handleFocusOrVisible = () => {
      if (document.visibilityState === 'visible' && currentUser?.uid) {
        syncUserPurchases(currentUser);
      }
    };
    window.addEventListener('focus', handleFocusOrVisible);
    document.addEventListener('visibilitychange', handleFocusOrVisible);
    return () => {
      window.removeEventListener('focus', handleFocusOrVisible);
      document.removeEventListener('visibilitychange', handleFocusOrVisible);
    };
  }, [currentUser, syncUserPurchases]);

  // Automatic high-frequency poller for active checkout + regular background heartbeat
  useEffect(() => {
    if (!currentUser?.uid) return;

    // Fast polling (every 3s) when a Stripe checkout was initiated recently
    const fastInterval = setInterval(() => {
      try {
        const raw =
          sessionStorage.getItem('aifinity_active_stripe_checkout') ||
          localStorage.getItem('aifinity_active_stripe_checkout');
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed && Date.now() - (parsed.startedAt || 0) < 2 * 60 * 1000) {
            syncUserPurchases(currentUser);
          } else {
            sessionStorage.removeItem('aifinity_active_stripe_checkout');
            localStorage.removeItem('aifinity_active_stripe_checkout');
          }
        }
      } catch (e) {}
    }, 3000);

    // Regular background heartbeat every 60s while logged in (passive sync)
    const heartbeatInterval = setInterval(() => {
      syncUserPurchases(currentUser);
    }, 60000);

    return () => {
      clearInterval(fastInterval);
      clearInterval(heartbeatInterval);
    };
  }, [currentUser, syncUserPurchases]);

  // Listen to Firebase Auth state for automatic persistent login and purchase fulfillment
  useEffect(() => {
    const handleStorageEvent = (e: StorageEvent) => {
      if (e.key === 'aifinity_payment_sync_event' || e.key === 'aifinity_user_actions') {
        refreshActionStatus();
        if (currentUser?.uid) {
          getUserProfile(currentUser.uid, true).then((freshProfile) => {
            if (freshProfile) {
              setCurrentUser({ ...freshProfile });
              setActionStatus(ActionLimitService.getActionStatus(freshProfile, guestId));
            }
          });
        }
      }
    };
    window.addEventListener('storage', handleStorageEvent);

    const unsubscribe = subscribeToAuth(async (user) => {
      setCurrentUser(user);
      setActionStatus(ActionLimitService.getActionStatus(user, guestId));
      if (user) {
        setIsGuestWelcomeOpen(false);
        setIsActionLimitModalOpen(false);

        // Immediately auto-sync Stripe purchases for this specific logged-in user
        await syncUserPurchases(user);
      }
      setAuthInitialized(true);
    });
    return () => {
      window.removeEventListener('storage', handleStorageEvent);
      unsubscribe();
    };
  }, [guestId, syncUserPurchases]);

  // Mark full load completion once initial session and auth have settled
  useEffect(() => {
    if (authInitialized) {
      const timer = setTimeout(() => {
        setIsAppFullyLoaded(true);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [authInitialized]);

  // Fallback timer to ensure loading screen dismisses even under slow/offline connections
  useEffect(() => {
    const fallbackTimer = setTimeout(() => {
      setIsAppFullyLoaded(true);
    }, 2500);
    return () => clearTimeout(fallbackTimer);
  }, []);

  // Check and claim daily actions whenever currentUser loads or day changes
  const runDailyActionClaimCheck = useCallback(async (userToCheck = currentUser) => {
    if (!userToCheck || !userToCheck.uid) return;
    try {
      const claimResult = await ActionLimitService.checkAndClaimDailyActions(userToCheck, guestId);
      if (claimResult.claimed) {
        setDailyClaimNotification({
          amount: claimResult.amount,
          stacked: claimResult.stackedFromPrevious,
          totalStacked: claimResult.totalStacked,
          total: claimResult.totalAvailable
        });
        const updatedStatus = ActionLimitService.getActionStatus(claimResult.updatedUser || userToCheck, guestId);
        setActionStatus(updatedStatus);
      }
    } catch (e) {
      console.warn('Error checking daily action claim:', e);
    }
  }, [currentUser, guestId]);

  // Synchronize actionStatus immediately whenever currentUser or guestId changes
  useEffect(() => {
    setActionStatus(ActionLimitService.getActionStatus(currentUser, guestId));
    if (currentUser?.uid) {
      runDailyActionClaimCheck(currentUser);
    }
  }, [currentUser, guestId, runDailyActionClaimCheck]);

  // Check periodically and when tab regains visibility (e.g. overnight date rollover)
  useEffect(() => {
    if (!currentUser?.uid) return;
    const interval = setInterval(() => {
      runDailyActionClaimCheck();
    }, 60000);

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        runDailyActionClaimCheck();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [currentUser, runDailyActionClaimCheck]);

  // Singleplayer naming rule:
  // - If logged in: account's username
  // - If guest with custom name: `${guestName} (Guest)`
  // - If guest without custom name: 'Player'
  const effectiveSingleplayerName = useMemo(() => {
    if (currentUser) return currentUser.username;
    if (guestName) return `${guestName} (Guest)`;
    return 'Player';
  }, [currentUser, guestName]);

  // Multiplayer naming rule:
  // - If logged in: account's username
  // - If guest with custom name: `${guestName} (Guest)`
  // - If guest without custom name: Guest# (1-9999, unique to active players in room)
  const getMultiplayerUsername = useCallback((existingPlayers: any[] = []) => {
    if (currentUser) return currentUser.username;
    if (guestName) return `${guestName} (Guest)`;
    const existingNames = existingPlayers.map((p: any) => p.username || '');
    return generateUniqueGuestMultiplayerName(existingNames);
  }, [currentUser, guestName]);

  // Active game username depending on gameMode
  const activeGameUsername = gameMode === 'multiplayer' ? (username || getMultiplayerUsername(roomState?.players || [])) : effectiveSingleplayerName;

  // Robust Welcome page route detector
  const isWelcomeRouteActive = (): boolean => {
    if (typeof window === 'undefined') return false;
    const path = (window.location.pathname || '').toLowerCase().replace(/\/+$/, '');
    const hash = (window.location.hash || '').toLowerCase();
    
    // Direct path or subpath check (e.g. /welcome, /welcome/)
    if (path === '/welcome' || path.endsWith('/welcome')) {
      return true;
    }
    // Hash routing check (e.g. #/welcome, #welcome)
    if (hash === '#/welcome' || hash === '#welcome' || hash.includes('welcome')) {
      return true;
    }
    // Query param redirect check from static 404 handlers
    try {
      const search = new URLSearchParams(window.location.search || '');
      const param = search.get('route') || search.get('p') || search.get('page') || search.get('redirect');
      if (param && param.toLowerCase().includes('welcome')) {
        return true;
      }
    } catch {
      // ignore
    }
    return false;
  };

  // Route state for /welcome and /
  const [currentPath, setCurrentPath] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      if (isWelcomeRouteActive()) {
        return '/welcome';
      }
      return window.location.pathname || '/';
    }
    return '/';
  });

  // Catch returns from Stripe Checkout sessions
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const urlParams = new URLSearchParams(window.location.search);
    const sessionId = urlParams.get('stripe_session_id');
    const stripeStatusParam = urlParams.get('stripe_status');

    if (sessionId) {
      try {
        const cleanPath = window.location.pathname || '/';
        window.history.replaceState({}, '', cleanPath);
      } catch (e) {
        console.warn('History replaceState skipped:', e);
      }

      fetch(`/api/stripe/verify-checkout-session?sessionId=${encodeURIComponent(sessionId)}`)
        .then(res => res.json())
        .then(async (data) => {
          if (data.paid || data.status === 'complete' || data.payment_status === 'paid') {
            // Retrieve pending checkout details saved in sessionStorage or localStorage
            let pending: any = null;
            try {
              const rawPending =
                sessionStorage.getItem('aifinity_pending_checkout') ||
                localStorage.getItem('aifinity_pending_checkout');
              if (rawPending) pending = JSON.parse(rawPending);
            } catch (e) {
              console.warn('Could not parse pending checkout:', e);
            }

            const meta = data.metadata || {};
            const itemName = meta.itemName || pending?.itemName || 'Action Pack Purchase';
            const itemType = (meta.itemType || pending?.itemType || 'pack') as 'pack' | 'tier';
            const actionDelta = parseInt(meta.actionDelta, 10) || parseInt(pending?.actionDelta, 10) || 0;
            const itemId = meta.itemId || pending?.itemId || '';
            const amount = typeof data.amount === 'number' && data.amount > 0 ? data.amount : (pending?.amount || 0);

            // Resolve target user ID
            const targetUid =
              meta.userId ||
              pending?.userId ||
              auth.currentUser?.uid ||
              currentUser?.uid ||
              localStorage.getItem('aifinity_last_checkout_user') ||
              '';

            // Allow brief delay if auth is settling on fresh page redirect
            if (targetUid && !auth.currentUser) {
              for (let i = 0; i < 6; i++) {
                if (auth.currentUser) break;
                await new Promise((r) => setTimeout(r, 300));
              }
            }

            const txUsername = meta.username || pending?.username || currentUser?.username || '';
            const txRecord: PaymentTransactionRecord = {
              id: sessionId,
              amount,
              itemName,
              itemType,
              paymentMethod: 'Stripe Checkout',
              status: 'completed',
              createdAt: new Date().toISOString(),
              customerName: data.customerName || (data.customerEmail ? data.customerEmail.split('@')[0] : (currentUser?.username || 'Customer')),
              email: data.customerEmail || currentUser?.email || undefined,
              attachedUsername: txUsername || currentUser?.username || 'Adventurer',
              recipient: txUsername || currentUser?.username || currentUser?.email || 'Adventurer',
              notes: itemType === 'pack' ? `Added ${actionDelta} actions` : `Activated ${itemName}`,
              actionDelta: actionDelta > 0 ? actionDelta : undefined,
              newTier: itemType === 'tier' ? (itemId || itemName) : undefined,
              userId: targetUid || undefined
            };

            if (targetUid) {
              let updatedUser: UserProfile | null = null;
              if (itemType === 'pack' && actionDelta > 0) {
                updatedUser = await ActionLimitService.addPurchasedCreditsByUid(targetUid, actionDelta, sessionId);
              } else if (itemType === 'tier') {
                const targetTier = (itemId || 'adventurer') as any;
                updatedUser = await ActionLimitService.activateSubscriptionByUid(targetUid, targetTier);
              }

              if (updatedUser) {
                setCurrentUser({ ...updatedUser });
                setActionStatus(ActionLimitService.getActionStatus(updatedUser, guestId));
              } else {
                refreshActionStatus();
              }

              await recordPaymentTransaction(targetUid, txRecord);
              notifiedPurchaseIdsRef.current.add(sessionId);
              notifiedPurchaseIdsRef.current.add(String(sessionId).replace(/[^a-zA-Z0-9_-]/g, '_'));
              try {
                const rawN = JSON.parse(localStorage.getItem(`aifinity_notified_purchases_${targetUid}`) || '[]');
                if (Array.isArray(rawN) && !rawN.includes(sessionId)) {
                  rawN.push(sessionId);
                  localStorage.setItem(`aifinity_notified_purchases_${targetUid}`, JSON.stringify(rawN.slice(-100)));
                }
              } catch (e) {}

              // Broadcast update event to all other open tabs
              try {
                localStorage.setItem(
                  'aifinity_payment_sync_event',
                  JSON.stringify({ uid: targetUid, time: Date.now() })
                );
              } catch (e) {}
            } else {
              refreshActionStatus();
            }

            // Immediately display verified receipt
            setVerifiedReceiptTransaction(txRecord);
            setIsReceiptModalOpen(true);
            setStripeReturnMessage({
              type: 'success',
              text: `🎉 Stripe Payment Verified! Purchase of ${itemName} ($${(Number(amount) || 0).toFixed(2)}) has been credited to your account.`
            });

            try {
              sessionStorage.removeItem('aifinity_pending_checkout');
              localStorage.removeItem('aifinity_pending_checkout');
            } catch (e) {}
          }
        })
        .catch(err => {
          console.error('Failed to verify Stripe checkout session:', err);
        });
    } else if (stripeStatusParam === 'cancelled') {
      try {
        const cleanPath = window.location.pathname || '/';
        window.history.replaceState({}, '', cleanPath);
      } catch (e) {
        console.warn('History replaceState skipped:', e);
      }
      setStripeReturnMessage({
        type: 'info',
        text: 'Stripe Checkout was cancelled.'
      });
    }
  }, [guestId, refreshActionStatus, currentUser?.uid]);

  useEffect(() => {
    const handleLocationChange = () => {
      if (isWelcomeRouteActive()) {
        setCurrentPath('/welcome');
      } else {
        setCurrentPath(window.location.pathname || '/');
      }
    };
    window.addEventListener('popstate', handleLocationChange);
    window.addEventListener('hashchange', handleLocationChange);
    return () => {
      window.removeEventListener('popstate', handleLocationChange);
      window.removeEventListener('hashchange', handleLocationChange);
    };
  }, []);

  // Check for room invitation in URL parameters
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const roomParam = urlParams.get('room') || urlParams.get('join') || urlParams.get('r');
      if (roomParam && roomParam.trim()) {
        const cleanRoom = roomParam.trim().toUpperCase();
        setUrlRoomToJoin(cleanRoom);
        if (!currentUser) {
          setPendingMultiplayerAction({ mode: 'join', roomId: cleanRoom });
          setAuthModalInitialTab('login');
          setIsAuthModalOpen(true);
        } else {
          setShowMultiplayerModal('join');
        }
        setCurrentPath('/');
      }
    } catch (e) {
      console.warn('Error reading room from URL:', e);
    }
  }, [currentUser]);

  const handleInitiateHost = () => {
    if (!currentUser) {
      setPendingMultiplayerAction({ mode: 'host' });
      setAuthModalInitialTab('signup');
      setIsAuthModalOpen(true);
      return;
    }
    setShowMultiplayerModal('host');
  };

  const handleInitiateJoin = (roomId?: string) => {
    if (!currentUser) {
      setPendingMultiplayerAction({ mode: 'join', roomId });
      if (roomId) setUrlRoomToJoin(roomId);
      setAuthModalInitialTab('login');
      setIsAuthModalOpen(true);
      return;
    }
    if (roomId) setUrlRoomToJoin(roomId);
    setShowMultiplayerModal('join');
  };

  const handleEnterGame = () => {
    if (typeof window !== 'undefined') {
      if (isWelcomeRouteActive()) {
        window.history.pushState({}, '', '/');
        if (window.location.hash.includes('welcome')) {
          window.location.hash = '';
        }
      }
    }
    setCurrentPath('/');
  };

  const watchdogTimerRef = useRef<any>(null);

  const updateProcessing = (delta: number) => {
    processingCountRef.current = Math.max(0, processingCountRef.current + delta);
    const active = processingCountRef.current > 0;
    setIsProcessing(active);

    if (watchdogTimerRef.current) {
      clearTimeout(watchdogTimerRef.current);
      watchdogTimerRef.current = null;
    }

    if (active) {
      // Safety watchdog: Automatically release lock if stuck for 2 minutes (145s buffer to allow full 120s AI call to complete)
      watchdogTimerRef.current = setTimeout(() => {
        if (processingCountRef.current > 0) {
          console.warn("[Watchdog] Processing lock automatically released after 2 minute timeout.");
          processingCountRef.current = 0;
          setIsProcessing(false);
          aiEngine.cancelAndReset();
          setNarrative(prev => [
            ...prev,
            {
              id: 'timeout-' + Date.now(),
              text: 'The action took longer than expected (2 minutes) and timed out. Action lock released.',
              type: 'system'
            }
          ]);
        }
      }, 145000);
    }
  };

  const isHost = roomState?.hostUsername === username;
  const isMyTurnReady = roomState?.players?.find((p: any) => p.username === username)?.isReady;
  const isMultiplayerBeforeCharacterPrompts = gameMode === 'multiplayer' && (roomState?.gameState === 'waiting_for_world' || (!roomState?.gameState && !isInitialized));

  const handleForceUnlock = () => {
    // Only locked inputs in multiplayer before character prompts are not unlockable because only host can set up world first
    if (isMultiplayerBeforeCharacterPrompts) {
      return;
    }
    if (watchdogTimerRef.current) {
      clearTimeout(watchdogTimerRef.current);
      watchdogTimerRef.current = null;
    }
    processingCountRef.current = 0;
    setIsProcessing(false);
    setShowCharacterCreation(false);
    setGameOver(false);
    aiEngine.cancelAndReset();
    if (gameMode === 'multiplayer' && (!multiplayerService || !roomState || roomState?.gameState !== 'playing')) {
      setGameMode('singleplayer');
      localStorage.setItem('aimud_gameMode', 'singleplayer');
      localStorage.removeItem('aimud_roomId');
      setRoomState(null);
    }
    if (multiplayerService) {
      try {
        (multiplayerService as any).isProcessingSync = false;
      } catch {}
    }
    setNarrative(prev => [
      ...prev,
      {
        id: 'unlocked-' + Date.now(),
        text: 'Action lock released. You can enter a new action.',
        type: 'system'
      }
    ]);
  };

  // Persist narrative and updates
  useEffect(() => {
    if (gameMode === 'singleplayer') {
      localStorage.setItem('aimud_narrative', JSON.stringify(narrative));
    }
  }, [narrative, gameMode]);

  useEffect(() => {
    if (gameMode === 'singleplayer') {
      localStorage.setItem('aimud_updates', JSON.stringify(updates));
    }
  }, [updates, gameMode]);

  useEffect(() => {
    localStorage.setItem('aimud_autoRecommendationsEnabled', JSON.stringify(autoRecommendationsEnabled));
  }, [autoRecommendationsEnabled]);

  // Sync state with filesystem on mount and updates
  const syncFiles = () => {
    setFiles(fileSystem.list());
    setSyncCount(prev => prev + 1);
    const timeContent = fileSystem.read('WorldTime.txt');
    setWorldTime(parseActiveWorldTime(timeContent));
  };

  const initMultiplayerService = () => {
    const ms = new MultiplayerService(
      fileSystem,
      (state) => {
        setRoomState(state);
        roomStateRef.current = state;
        setNarrative(sanitizeNarrativeEntries(state.narrative || []));
        setUpdates(sanitizeUpdates(state.updates || []));
        setWorldTime(state.worldTime || '');
        setRecommendations(sanitizeRecommendations(state.recommendations || []));
        if (state.playerRecommendations) {
          setPlayerRecommendations(sanitizePlayerRecommendations(state.playerRecommendations));
        }
        if (Array.isArray(state.chatMessages)) {
          setChatMessages(state.chatMessages);
        }
        syncFiles();

        // Check if we need to show character creation
        const myName = localStorage.getItem('aimud_username');
        const me = state.players?.find((p: any) => p.username?.toLowerCase() === myName?.toLowerCase());
        const myUsername = me?.username?.toLowerCase();

        // Find if any file matches CharacterName-username.txt or contains character identity
        const myCharacterFileExists = Object.entries(state.fileSystemState?.files || {}).some(([f, content]) => {
          const lowerF = f.toLowerCase();
          if (!myUsername) return false;
          if (
            lowerF.endsWith(`-${myUsername}.txt`) ||
            lowerF.endsWith(`_${myUsername}.txt`) ||
            lowerF.endsWith(` ${myUsername}.txt`) ||
            lowerF.replace(/\.txt$/, '').trim().endsWith(myUsername) ||
            lowerF === `${myUsername}.txt` ||
            lowerF === `character-${myUsername}.txt`
          ) {
            return true;
          }
          if (lowerF.endsWith('.txt') && !lowerF.includes('world') && !lowerF.includes('map') && !lowerF.includes('rule') && !lowerF.includes('lore')) {
            const raw = typeof content === 'string' ? content : '';
            if (raw.includes(`Player: ${myUsername}`) || raw.toLowerCase().includes(`player: ${myUsername}`)) {
              return true;
            }
          }
          return false;
        });

        if (myCharacterFileExists) {
          setIsSubmittingCharacter(false);
          setShowCharacterCreation(false);
        } else if (state.gameState !== 'waiting_for_world' && me) {
          setShowCharacterCreation(true);
        } else {
          setShowCharacterCreation(false);
        }
      },
      async (inputs) => {
        // Host executes turn
        updateProcessing(1);
        const combinedInput = Object.entries(inputs)
          .map(([user, action]) => `${user} does: ${action}`)
          .join('\n');

        // Record turn snapshot before host executes turn
        HistoryService.pushSnapshot({
          id: Date.now().toString(),
          timestamp: Date.now(),
          turnNumber: HistoryService.getCount() + 1,
          userAction: combinedInput,
          narrative: [...(roomStateRef.current?.narrative || [])],
          updates: [...(roomStateRef.current?.updates || [])],
          recommendations: [...(roomStateRef.current?.recommendations || [])],
          playerRecommendations: { ...(roomStateRef.current?.playerRecommendations || {}) },
          fileSystemState: fileSystem.exportState(),
          worldTime: parseActiveWorldTime(fileSystem.read('WorldTime.txt')),
          gameOver: false
        });
        setUndoCount(HistoryService.getCount());

        try {
          const result = await aiEngine.processAction(combinedInput);
          if (result) {
            const formattedPlayersActions = Object.entries(inputs)
              .map(([user, action]) => `[${user}]: ${action}`)
              .join('\n');

            const newNarrative = [
              ...(roomStateRef.current?.narrative || []),
              { id: Date.now().toString() + 'user', text: formattedPlayersActions, type: 'user' as const },
              { id: Date.now().toString() + 'ai', text: result.narrative || '', type: 'ai' as const, usage: result.usage }
            ];
            const safeUpdates = Array.isArray(result.updates) ? result.updates : [];
            const newUpdates = [...safeUpdates, ...(roomStateRef.current?.updates || [])].slice(0, 50);

            ms.syncState({
              fileSystemState: fileSystem.exportState(),
              narrative: newNarrative,
              updates: newUpdates,
              recommendations: result.recommendations || [],
              playerRecommendations: result.playerRecommendations || {},
              gameState: 'playing',
              worldTime: parseActiveWorldTime(fileSystem.read('WorldTime.txt')),
              turnProcessed: true
            });
          } else {
            // Even if AI engine returned null/failed, sync turnProcessed so players are not stuck waiting
            ms.syncState({
              turnProcessed: true
            });
          }
        } catch (turnErr) {
          console.error("Multiplayer turn processing failed:", turnErr);
          ms.syncState({
            turnProcessed: true
          });
        } finally {
          updateProcessing(-1);
        }
      },
      async ({ username: newUsername, description }) => {
        // Host creates character for new player
        updateProcessing(1);
        try {
          const suggestedCharName = extractOrGenerateCharacterName(description, newUsername);
          const prompt = `Create a highly detailed, rich, and extensive character file for player "${newUsername}" based on this description: ${description}.

CHARACTER IDENTITY RULE (CRITICAL):
- The character's in-world Name MUST be a distinct, authentic, fictional name (e.g. "${suggestedCharName}") fitting their class, appearance, background, and world lore.
- NEVER use the player's account username "${newUsername}" as their character name!
- NEVER name the character generic placeholders like "Adventurer" or "Player".
- The file MUST be named EXACTLY in the format "[CharacterName]-${newUsername}.txt" (e.g. "${suggestedCharName.replace(/\s+/g, '')}-${newUsername}.txt").
- Under [NAME & DESCRIPTION] in the character file:
  - Name: [Fictional In-World Character Name] (e.g. "${suggestedCharName}")
  - Player: ${newUsername}
- Place this player character in "CurrentMap.json" under "players" with:
  username: "${newUsername}",
  characterName: "[Fictional In-World Character Name]"
- PLAYER CHARACTERS ARE NEVER NPCS: DO NOT put this player character in "npcs" on CurrentMap.json!
- ZERO UNINTENDED NPC CLONING: Existing NPCs in context must retain their established canonical names. Never create duplicate or cloned NPC files or map tokens with slight name variations (e.g. 'Garrick-npc' vs 'BlacksmithGarrick-npc') unless genuine cloning context (spells/illusions/clones) explicitly applies.

CRITICAL ANTI-LAZINESS MANDATE:
- Do NOT be lazy, rushed, or cut corners. Never use placeholders (like "...", "// etc", "[same as before]"), abbreviations, or incomplete summaries.
- Fill out EVERY single section completely and articulately: [NAME & DESCRIPTION], [STATS & MODIFIERS], [ATTACKS & COMBAT ACTIONS], [ABILITIES & MAGIC], [CONTAINERS & CARRIED GEAR], [CURRENCY & FINANCIAL BALANCE], [OWNED / STORED ITEMS (NOT ON PERSON)], and [STATUS EFFECTS & LORE].
- Make sure the character file includes Physical Dimensions (Height, Width, Depth), Body Weight, Speed, Max Lift Strength (100% of body weight for average human with 1.0x strength), equipped containers with max space dimensions (e.g. 18x12 inches for backpack), items with detectable weights and dimensions, and total carried weight.

DYNAMIC SETTING-APPROPRIATE STARTING CURRENCY & WEALTH (CRITICAL):
- Never be lazy about money or forget starting funds. Dynamically reason about this character's background, social status, profession, and world setting to determine authentic, realistic starting wealth.
- In [CURRENCY & FINANCIAL BALANCE], detail their Currency Type, Carried Balance (On Person) itemized with denominations, and assign it to an equipped container (such as a coin pouch, wallet, purse, or pocket) under [CONTAINERS & CARRIED GEAR]. If they have savings, family heirlooms, or deposits, detail them under Stored Balance.
- CARRIED VS STORED / REMOTE MANDATE: If the character carries a wallet, chit wallet, coin pouch, or cardholder, all money, cash, coins, or digital credits meant to be on them MUST be listed under Carried Balance (On Person) referencing that container. NEVER mark Carried Balance as 0 and put funds in Stored / Remote Balance when they carry a wallet or pouch!
- CONTAINER CONTENTS INTEGRITY: Never output container names or subheaders (e.g. "• (Inside Leather Bifold Wallet: ...)") as item entries inside a container!
- RANGED WEAPONS HANDEDNESS: Ranged weapons are NOT always two-handed; when carried or not actively in use, they are held in 1 hand slot under [CURRENTLY HOLDING].
- HOLDING INTEGRITY: Under [CURRENTLY HOLDING], specify only actual item names with weight and dimensions. Don't add an item as things like free hand because it should just be empty instead etc for example (an unoccupied hand or slot is simply empty—never treat or add "Free Hand" or "Empty Hand" as an item, and never create an item file for it).
- HELD ITEMS & MAP ATTACHMENT: Weapons, tools, or items held in hands ([CURRENTLY HOLDING]) or equipped ([Equipped Gear & Armor]) are attached to the character at their exact coordinates. A weapon's range (e.g. 50m) is its attack reach, NEVER its physical map coordinates! DO NOT place a held weapon far away as a loose item on CurrentMap.json.
- In the 'updates' array, include an update acknowledging their starting currency.

STARTING INVENTORY LIMIT RULE (CRITICAL):
- The maximum number of carrying items this character starts with (equipped gear + carried in containers) MUST BE LESS THAN OR EQUAL TO 2x their hand slots (e.g. max 4 items for a 2-handed humanoid; 1 slot = max 2 items). Any additional items, background equipment, or family heirlooms must be placed under [OWNED / STORED ITEMS (NOT ON PERSON)] with an attached location (e.g. [Location: Starting Home / Camp Stash]). During the adventure, characters can carry more than this limit!

CRITICAL: Check your context. If a character file for player "${newUsername}" (ending in "-${newUsername}.txt") ALREADY EXISTS, you MUST update that specific file and NOT create a new one. Do not create duplicates. Return the character file AND update "CurrentMap.json" to place the new player at the appropriate starting location. DO NOT modify, empty, or delete ANY OTHER existing files (do not use null).`;
          await aiEngine.processAction(prompt);

          // Fallback guarantee: ensure character file exists in filesystem
          const userLower = (newUsername || '').toLowerCase();
          const hasCharFile = fileSystem.list().some(f => {
            const l = f.toLowerCase();
            return (
              l.endsWith(`-${userLower}.txt`) ||
              l.endsWith(`_${userLower}.txt`) ||
              l.endsWith(` ${userLower}.txt`) ||
              l.replace(/\.txt$/, '').trim().endsWith(userLower) ||
              l === `${userLower}.txt` ||
              l === `character-${userLower}.txt`
            );
          });

          if (!hasCharFile) {
            const fallbackCharName = extractOrGenerateCharacterName(description, newUsername);
            const fallbackFileName = `${fallbackCharName.replace(/[^a-zA-Z0-9]/g, '')}-${newUsername}.txt`;
            const fallbackContent = `[NAME & DESCRIPTION]
- Name: ${fallbackCharName}
- Player: ${newUsername}
- Description: ${description || 'A skilled adventurer ready to embark into the unknown.'}
- Physical Dimensions: Height 5'10", Weight 170 lbs
- Max Lift Strength: 170 lbs (1.0x Body Weight)

[STATS & MODIFIERS]
- Health: 100 / 100
- Stamina: 100 / 100
- Speed: 10 m/s
- Strength: 10 (+0)
- Dexterity: 10 (+0)
- Intelligence: 10 (+0)

[ATTACKS & COMBAT ACTIONS]
- Basic Attack: 1d6 physical damage
- Unarmed Strike: 1d4 bludgeoning

[ABILITIES & MAGIC]
- Adventurer's Focus: Steady resolve during perilous encounters

[CONTAINERS & CARRIED GEAR]
- Equipped: Adventurer Attire, Boots
- Backpack (18"x12"x6", max 30 lbs, carried weight: 6 lbs):
  * Rations (3 days)
  * Waterskin (Full)
  * Torches (2)

[CURRENCY & FINANCIAL BALANCE]
- Currency: Gold Pieces
- Carried Balance (Coin Pouch): 20 GP, 15 SP

[STATUS EFFECTS & LORE]
- Status: Healthy & Ready
- Conditions: None`;
            fileSystem.write(fallbackFileName, fallbackContent);
          }

          ms.syncState({
            fileSystemState: fileSystem.exportState(),
            worldTime: parseActiveWorldTime(fileSystem.read('WorldTime.txt'))
          });
        } finally {
          updateProcessing(-1);
        }
      },
      () => {
        // Kicked
        alert('You have been kicked from the session.');
        if (multiplayerService) {
          multiplayerService.leaveRoom();
          setMultiplayerService(null);
        }
        clearSession();
      },
      () => {
        // Adventure deleted
        alert('The host has deleted the adventure.');
        if (multiplayerService) {
          multiplayerService.leaveRoom();
          setMultiplayerService(null);
        }
        clearSession();
      }
    );

    // Synchronize state when host reverts or undos a turn
    ms.setOnUndoTurn((snapshotData) => {
      if (snapshotData.fileSystemState) {
        fileSystem.importState(snapshotData.fileSystemState);
        syncFiles();
      }
      if (snapshotData.narrative) {
        setNarrative(sanitizeNarrativeEntries(snapshotData.narrative));
      }
      if (snapshotData.updates) {
        setUpdates(sanitizeUpdates(snapshotData.updates));
      }
      if (snapshotData.recommendations) {
        setRecommendations(sanitizeRecommendations(snapshotData.recommendations));
      }
      if (snapshotData.playerRecommendations) {
        setPlayerRecommendations(sanitizePlayerRecommendations(snapshotData.playerRecommendations));
      }
      if (snapshotData.worldTime) {
        setWorldTime(snapshotData.worldTime);
      }
    });

    ms.setOnChatMessage((msg) => {
      setChatMessages((prev) => {
        if (prev.some((m) => m.id === msg.id)) return prev;
        return [...prev, msg];
      });
    });

    ms.setOnDeleteChatMessage((msgId) => {
      setChatMessages((prev) => prev.filter((m) => m.id !== msgId));
    });

    setMultiplayerService(ms);
    return ms;
  };

  // Helper to extract player's character name from file system
  const getPlayerCharacterName = (playerUsername: string): string | undefined => {
    if (!playerUsername) return undefined;
    const pLower = playerUsername.trim().toLowerCase();
    const fileList = fileSystem.list();
    const file = fileList.find(f => {
      const fl = f.toLowerCase();
      return fl.endsWith(`-${pLower}.txt`) || fl.endsWith(`_${pLower}.txt`) || fl.endsWith(` ${pLower}.txt`);
    });
    if (file) {
      return file.replace(/[-_ ][^-_ ]+\.txt$/i, '').replace('.txt', '').trim();
    }
    return undefined;
  };

  // Sync unread chat message counter
  useEffect(() => {
    if (isChatOpen) {
      setLastChatReadCount(chatMessages.length);
    }
  }, [isChatOpen, chatMessages.length]);

  const unreadChatCount = isChatOpen ? 0 : Math.max(0, chatMessages.length - lastChatReadCount);

  // Send multiplayer chat message
  const handleSendChatMessage = async (
    text: string,
    whisperTo?: string[],
    replyTo?: MultiplayerChatMessage['replyTo']
  ) => {
    if (multiplayerService) {
      return await multiplayerService.sendChatMessage(text, whisperTo, replyTo);
    }
    return null;
  };

  // Delete chat message (sender, host, mod, or admin)
  const handleDeleteChatMessage = async (messageId: string): Promise<boolean> => {
    if (multiplayerService) {
      return await multiplayerService.deleteChatMessage(
        messageId,
        currentUser ? { username: currentUser.username, role: currentUser.role } : undefined
      );
    }
    return false;
  };

  // Host/Staff delete adventure permanently with confirmation
  const handleDeleteMultiplayerAdventurePermanently = async () => {
    if (!roomState?.id || !multiplayerService) return;
    const myUsernameLower = (currentUser?.username || '').trim().toLowerCase();
    const isHost = (roomState.hostUsername || '').trim().toLowerCase() === myUsernameLower;
    const isStaff = currentUser?.role === 'admin' || currentUser?.role === 'mod';
    if (!isHost && !isStaff) {
      alert("Only the host, moderators, or administrators can permanently delete this multiplayer adventure.");
      return;
    }

    const confirmed = window.confirm(
      `Are you sure you want to permanently delete multiplayer adventure "${roomState.id}"? All room history will be removed and all players will be disconnected. This action cannot be undone.`
    );
    if (!confirmed) return;

    try {
      await multiplayerService.deleteAdventure(
        currentUser ? { username: currentUser.username, role: currentUser.role } : undefined
      );
      localStorage.removeItem('aimud_roomId');
      setGameMode('singleplayer');
      setRoomState(null);
      setMultiplayerService(null);
      fileSystem.clear();
      setNarrative([{ id: 'init', type: 'system', text: `Multiplayer adventure ${roomState.id} was permanently deleted.` }]);
      alert(`Multiplayer adventure ${roomState.id} has been permanently deleted.`);
    } catch (err: any) {
      alert(err?.message || "Failed to delete multiplayer adventure.");
    }
  };

  // Free Tier Slot Limit: Free users can only have 1 active multiplayer slot until they leave or the game gets deleted
  const checkFreeTierSlotLimit = async (targetRoomId?: string): Promise<boolean> => {
    if (!currentUser) return false;
    const isFreeTier = !currentUser.tier || currentUser.tier === 'free';
    const isStaff = currentUser.role === 'admin' || currentUser.role === 'mod';
    if (!isFreeTier || isStaff) {
      return true; // Subscribers & staff have unlimited active multiplayer adventure slots
    }

    try {
      const activeRooms = await MultiplayerService.getUserActiveRooms(currentUser.username);
      // If targetRoomId is specified, check if this is an adventure the user has ALREADY joined
      if (targetRoomId) {
        const alreadyInRoom = activeRooms.some(r => r.id.toUpperCase() === targetRoomId.toUpperCase());
        if (alreadyInRoom) {
          return true; // Resuming their current slot
        }
      }

      if (activeRooms.length >= 1) {
        setIsActiveGamesSlotLimitWarning(true);
        setIsActiveGamesModalOpen(true);
        setShowMultiplayerModal(null);
        return false;
      }
    } catch (err) {
      console.warn("Could not verify user active rooms:", err);
    }
    return true;
  };

  const handleJoinGame = async (roomId: string, joinUsername?: string) => {
    if (!currentUser) {
      setPendingMultiplayerAction({ mode: 'join', roomId });
      setUrlRoomToJoin(roomId);
      setAuthModalInitialTab('login');
      setIsAuthModalOpen(true);
      return;
    }
    const canJoin = await checkFreeTierSlotLimit(roomId);
    if (!canJoin) return;
    const effectiveJoin = currentUser.username;
    setUsername(effectiveJoin);
    localStorage.setItem('aimud_username', effectiveJoin);
    const ms = initMultiplayerService();
    try {
      await ms.joinRoom(
        roomId,
        effectiveJoin,
        { tier: currentUser.tier, role: currentUser.role, showGlowingName: currentUser.showGlowingName }
      );
      localStorage.setItem('aimud_roomId', roomId);
      localStorage.setItem('aimud_gameMode', 'multiplayer');
      setGameMode('multiplayer');
      setShowMultiplayerModal(null);
    } catch (err: any) {
      console.warn("Failed to join room, reverting to singleplayer:", err);
      localStorage.removeItem('aimud_roomId');
      localStorage.setItem('aimud_gameMode', 'singleplayer');
      setGameMode('singleplayer');
      setRoomState(null);
      alert(`Could not join multiplayer room: ${err.message || String(err)}. Returned to singleplayer.`);
    }
  };

  useEffect(() => {
    localStorage.setItem('aimud_gameMode', gameMode);
    if (gameMode === 'singleplayer') {
      syncFiles();
      if (fileSystem.list().length === 0) {
        setNarrative([{
          id: 'init',
          text: 'Welcome to Aifinity. Enter a scenario prompt to begin (e.g., "A cyberpunk detective in Neo-Tokyo")',
          type: 'system'
        }]);
      } else {
        setIsInitialized(true);
        setNarrative(prev => {
          if (prev.length > 0 && prev[prev.length - 1].id.startsWith('resume')) {
            return prev;
          }
          return [...prev, {
            id: 'resume-' + Date.now(),
            text: 'Session Resumed. Check logs for last state.',
            type: 'system'
          }];
        });
      }
    } else if (gameMode === 'multiplayer' && !multiplayerService) {
      // Guests cannot be in multiplayer
      if (!currentUser) {
        setGameMode('singleplayer');
        localStorage.setItem('aimud_gameMode', 'singleplayer');
        return;
      }
      // Try to restore multiplayer session
      const savedRoomId = localStorage.getItem('aimud_roomId');
      const savedUsername = currentUser.username;
      if (savedRoomId && savedUsername) {
        handleJoinGame(savedRoomId, savedUsername);
      } else {
        setGameMode('singleplayer');
        localStorage.setItem('aimud_gameMode', 'singleplayer');
      }
    }
    if (!isInitialized || (gameMode === 'multiplayer' && roomState?.gameState === 'waiting_for_world')) {
      setRecommendations([]);
    }
  }, [gameMode, isInitialized, roomState?.gameState, currentUser]);

  // Safety watchdog: If gameMode is multiplayer but roomState remains null after 5 seconds, auto-revert to singleplayer
  useEffect(() => {
    if (gameMode === 'multiplayer' && !roomState) {
      const timer = setTimeout(() => {
        if (gameMode === 'multiplayer' && !roomStateRef.current) {
          console.warn("[Multiplayer Watchdog] No active room found after timeout, reverting to singleplayer.");
          localStorage.removeItem('aimud_roomId');
          localStorage.setItem('aimud_gameMode', 'singleplayer');
          setGameMode('singleplayer');
        }
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [gameMode, roomState]);

  const handleHostGame = async (hostUsername?: string) => {
    if (!currentUser) {
      setPendingMultiplayerAction({ mode: 'host' });
      setAuthModalInitialTab('signup');
      setIsAuthModalOpen(true);
      return;
    }
    const canHost = await checkFreeTierSlotLimit();
    if (!canHost) return;
    const effectiveHost = currentUser.username;
    setUsername(effectiveHost);
    localStorage.setItem('aimud_username', effectiveHost);
    const ms = initMultiplayerService();
    fileSystem.clear();
    const roomId = await ms.createRoom(
      effectiveHost,
      { tier: currentUser.tier, role: currentUser.role, showGlowingName: currentUser.showGlowingName }
    );
    localStorage.setItem('aimud_roomId', roomId);
    setGameMode('multiplayer');
    setShowMultiplayerModal(null);
    setShareRoomModalCode(roomId);
    setNarrative([{
      id: 'init',
      text: `Hosting Room: ${roomId}. Enter world description to start adventure....`,
      type: 'system'
    }]);
  };

  const handleLogout = async () => {
    try {
      await logOut();
      setCurrentUser(null);
      setActionStatus(ActionLimitService.getActionStatus(null, guestId));
    } catch (err) {
      console.error('Logout error:', err);
    }
  };

  const clearSession = () => {
    fileSystem.clear();
    setNarrative([{
      id: 'init',
      text: 'You left the session. Enter a scenario prompt to begin.',
      type: 'system'
    }]);
    setUpdates([]);
    setRecommendations([]);
    setGameOver(false);
    setIsInitialized(false);
    setExpandedFile(null);
    setShowCharacterCreation(false);
    setIsSubmittingCharacter(false);
    setCharacterDescription('');
    setRoomState(null);
    syncFiles();
    localStorage.removeItem('aimud_narrative');
    localStorage.removeItem('aimud_updates');
    localStorage.removeItem('aimud_recommendations');
    localStorage.removeItem('aimud_roomId');
    setGameMode('singleplayer');
  };

  const handleLeaveGame = async () => {
    if (multiplayerService) {
      await multiplayerService.leaveRoom();
      setMultiplayerService(null);
    }
    clearSession();
  };

  const handleLoadAdventure = (adv: SavedAdventure) => {
    fileSystem.clear();
    HistoryService.clearHistory();
    setUndoCount(0);
    if (adv.files) {
      Object.entries(adv.files).forEach(([k, v]) => fileSystem.write(k, v));
    }
    setNarrative(adv.narrative || []);
    setIsInitialized(true);
    setGameOver(false);
    syncFiles();
    localStorage.setItem('aimud_narrative', JSON.stringify(adv.narrative || []));
    setExpandedFile(null);
  };

  const handlePlayCommunityAdventure = async (adv: CommunityAdventure) => {
    HistoryService.clearHistory();
    setUndoCount(0);
    if (adv.shareType === 'full' && adv.files && adv.narrative) {
      fileSystem.clear();
      Object.entries(adv.files).forEach(([k, v]) => fileSystem.write(k, v));
      setNarrative(adv.narrative);
      setIsInitialized(true);
      setGameOver(false);
      syncFiles();
      localStorage.setItem('aimud_narrative', JSON.stringify(adv.narrative));
      setExpandedFile(null);
    } else if (adv.shareType === 'initial_generation' && adv.initialAiGeneration) {
      fileSystem.clear();
      if (adv.files) {
        Object.entries(adv.files).forEach(([k, v]) => fileSystem.write(k, v));
      }
      const initialNarrative: NarrativeEntry[] = [
        { id: Date.now() + '-user', text: adv.startingPrompt, type: 'user' },
        { id: Date.now() + '-ai', text: adv.initialAiGeneration, type: 'ai' }
      ];
      setNarrative(initialNarrative);
      setIsInitialized(true);
      setGameOver(false);
      syncFiles();
      localStorage.setItem('aimud_narrative', JSON.stringify(initialNarrative));
      setExpandedFile(null);
    } else {
      fileSystem.clear();
      syncFiles();
      setIsInitialized(false);
      setGameOver(false);
      setExpandedFile(null);
      await handleAction(adv.startingPrompt);
    }
  };

  const handleAction = async (text: string) => {
    // Action Limit Verification
    const actionRes = await ActionLimitService.consumeAction(currentUser, guestId);
    if (!actionRes.allowed) {
      setIsActionLimitModalOpen(true);
      return;
    }
    refreshActionStatus();

    if (gameMode === 'singleplayer') {
      // Auto save previous turn snapshot before this action executes
      if (isInitialized) {
        HistoryService.pushSnapshot({
          id: Date.now().toString(),
          timestamp: Date.now(),
          turnNumber: HistoryService.getCount() + 1,
          userAction: text,
          narrative: [...narrative],
          updates: [...updates],
          recommendations: [...recommendations],
          fileSystemState: fileSystem.exportState(),
          worldTime: worldTime,
          gameOver: gameOver
        });
        setUndoCount(HistoryService.getCount());
      }

      updateProcessing(1);
      const userActionId = Date.now().toString();
      setNarrative(prev => [...prev, { id: userActionId, text: text, type: 'user' }]);

      try {
        let result;
        if (!isInitialized) {
          result = await aiEngine.initialize(text, effectiveSingleplayerName);
          setIsInitialized(true);
        } else {
          const mapScreenshot = await mapPanelRef.current?.captureScreenshot() || undefined;
          result = await aiEngine.processAction(text, effectiveSingleplayerName, mapScreenshot);
        }

        if (result) {
          if (result.narrative) {
            const safeNarrative = typeof result.narrative === 'string'
              ? result.narrative
              : (typeof result.narrative === 'object' && result.narrative !== null)
                ? ((result.narrative as any).text || (result.narrative as any).content || JSON.stringify(result.narrative))
                : String(result.narrative);
            setNarrative(prev => [...prev, {
              id: Date.now().toString() + 'ai',
              text: safeNarrative,
              type: 'ai',
              usage: result.usage
            }]);
          }
          if (result.updates && Array.isArray(result.updates)) {
            setUpdates(prev => [...sanitizeUpdates(result.updates), ...prev].slice(0, 50));
          }
          if (result.recommendations && Array.isArray(result.recommendations)) {
            setRecommendations(sanitizeRecommendations(result.recommendations));
          } else {
            setRecommendations([]);
          }
          if (result.playerRecommendations) {
            setPlayerRecommendations(sanitizePlayerRecommendations(result.playerRecommendations));
          }
          if (result.gameOver && gameMode === 'singleplayer') {
            setGameOver(true);
            setIsTerminatedOpen(true);
            setIsCreatingNewAfterDeath(false);
            setNarrative(prev => [...prev, { id: 'death', text: 'CRITICAL FAILURE: Vital signs zero. Simulation Terminated.', type: 'system' }]);
          }
          syncFiles();
        } else {
          setNarrative(prev => [
            ...prev,
            {
              id: Date.now().toString() + 'err',
              text: 'The action took too long or encountered an error. Please try again or rephrase your action.',
              type: 'system'
            }
          ]);
        }
      } catch (actionErr) {
        console.error("Action error:", actionErr);
        setNarrative(prev => [
          ...prev,
          {
            id: Date.now().toString() + 'err',
            text: 'An error occurred while processing your action. You can try again.',
            type: 'system'
          }
        ]);
      } finally {
        updateProcessing(-1);
      }
    } else if (gameMode === 'multiplayer' && multiplayerService) {
      if (roomState?.gameState === 'waiting_for_world' && roomState?.hostUsername === username) {
        // Host initializing world
        updateProcessing(1);
        const userActionId = Date.now().toString();
        const newNarrative = [...narrative, { id: userActionId, text: text, type: 'user' as const }];
        setNarrative(newNarrative);

        try {
          const result = await aiEngine.initialize(text);
          if (result) {
            const safeNarrative = typeof result.narrative === 'string'
              ? result.narrative
              : (typeof result.narrative === 'object' && result.narrative !== null)
                ? ((result.narrative as any).text || (result.narrative as any).content || JSON.stringify(result.narrative))
                : String(result.narrative || '');
            const finalNarrative = [...newNarrative, { id: Date.now().toString() + 'ai', text: safeNarrative, type: 'ai' as const, usage: result.usage }];
            if (result.recommendations && Array.isArray(result.recommendations)) {
              setRecommendations(sanitizeRecommendations(result.recommendations));
            } else {
              setRecommendations([]);
            }
            const safeUpdates = sanitizeUpdates(result.updates);
            multiplayerService.syncState({
              fileSystemState: fileSystem.exportState(),
              narrative: finalNarrative,
              updates: safeUpdates,
              recommendations: sanitizeRecommendations(result.recommendations || []),
              playerRecommendations: sanitizePlayerRecommendations(result.playerRecommendations || {}),
              gameState: 'character_creation',
              worldTime: parseActiveWorldTime(fileSystem.read('WorldTime.txt'))
            });
          }
        } finally {
          updateProcessing(-1);
        }
      } else {
        // Normal action submission
        multiplayerService.submitAction(text);
        setNarrative(prev => [...prev, { id: Date.now().toString(), text: `[Action Submitted: ${text}] Waiting for others...`, type: 'system' }]);
      }
    }
  };

  useEffect(() => {
    if (autoRecommendationsEnabled && !showCharacterCreation) {
      const isSinglePlayerSetup = gameMode === 'singleplayer' && !isInitialized;
      const isMultiplayerSetup = gameMode === 'multiplayer' && roomState?.gameState === 'waiting_for_world' && isHost;

      if ((isSinglePlayerSetup || isMultiplayerSetup) && (recommendations || []).length === 0) {
        if (isSinglePlayerSetup) {
          setRecommendations(SuggestionGenerator.generateSinglePlayer());
        } else {
          setRecommendations(SuggestionGenerator.generateMultiplayer());
        }
      }
    }
  }, [gameMode, isInitialized, roomState?.gameState, isHost, autoRecommendationsEnabled, showCharacterCreation, recommendations?.length || 0]);

  // Derive active action recommendations tailored specifically to the user's character
  const effectiveRecommendations = useMemo(() => {
    if (!autoRecommendationsEnabled || showCharacterCreation) return [];

    if (gameMode === 'multiplayer') {
      const myName = (localStorage.getItem('aimud_username') || username || '').trim();
      const lowerUser = myName.toLowerCase();

      if (roomState?.gameState === 'waiting_for_world' && isHost) {
        return sanitizeRecommendations(recommendations || []);
      }

      if (roomState?.gameState === 'playing') {
        // 1. Check playerRecommendations state
        if (lowerUser) {
          const userKey = Object.keys(playerRecommendations || {}).find(k => k.toLowerCase() === lowerUser);
          if (userKey && Array.isArray(playerRecommendations[userKey]) && playerRecommendations[userKey].length > 0) {
            return sanitizeRecommendations(playerRecommendations[userKey]);
          }

          // 2. Check roomState.playerRecommendations
          const roomRecs = roomState?.playerRecommendations || {};
          const roomKey = Object.keys(roomRecs).find(k => k.toLowerCase() === lowerUser);
          if (roomKey && Array.isArray(roomRecs[roomKey]) && roomRecs[roomKey].length > 0) {
            return sanitizeRecommendations(roomRecs[roomKey]);
          }

          // 3. Fallback: generate character-unique recommendations dynamically
          const unique = AIEngine.generateCharacterUniqueRecommendations(myName, fileSystem);
          if (unique && unique.length > 0) {
            return unique;
          }
        }

        return sanitizeRecommendations(recommendations || []);
      }

      return [];
    }

    // Singleplayer
    return sanitizeRecommendations(recommendations || []);
  }, [
    autoRecommendationsEnabled,
    showCharacterCreation,
    gameMode,
    username,
    playerRecommendations,
    roomState?.playerRecommendations,
    roomState?.gameState,
    isHost,
    recommendations,
    fileSystem,
    syncCount
  ]);

  const handleReferenceClick = (ref: string) => {
    const filename = fileSystem.findFileByReference(ref);
    if (filename) {
      setExpandedFile(filename);
      setMobilePanelTab('files');
      if (typeof window !== 'undefined' && window.innerWidth < 768) {
        setIsMobilePanelOpen(true);
      } else {
        setIsSidebarMinimized(false);
      }
    }
  };

  const handleReset = async () => {
    HistoryService.clearHistory();
    setUndoCount(0);
    if (gameMode === 'multiplayer' && multiplayerService) {
      await multiplayerService.deleteAdventure();
    } else {
      fileSystem.clear();
      setNarrative([{
        id: 'reset',
        text: 'System Reset Complete. Enter a new scenario.',
        type: 'system'
      }]);
      setUpdates([]);
      setRecommendations([]);
      setGameOver(false);
      setIsTerminatedOpen(false);
      setIsCreatingNewAfterDeath(false);
      setNewCharacterDescription('');
      setIsInitialized(false);
      setExpandedFile(null);
      syncFiles();
      localStorage.removeItem('aimud_narrative');
      localStorage.removeItem('aimud_updates');
      localStorage.removeItem('aimud_recommendations');
    }
    setIsTerminatedOpen(false);
    setIsCreatingNewAfterDeath(false);
    setIsResetModalOpen(false);
  };

  const handleContinueWithNewCharacter = async (desc: string) => {
    const trimmedDesc = desc.trim();
    if (!trimmedDesc || isSubmittingNewCharacter) return;
    setIsSubmittingNewCharacter(true);

    try {
      const activeUser = activeGameUsername || username || 'Player';
      const uLower = activeUser.toLowerCase();
      const allFsFiles = fileSystem.list();

      // Collect all dead character names from existing files and map
      const excludedNames: string[] = [];
      allFsFiles.forEach(f => {
        if (f.endsWith('-dead.txt') || f.endsWith('_dead.txt')) {
          const b = f.replace(/\.txt$/, '').replace(/[-_]dead$/i, '').trim();
          if (b) excludedNames.push(b);
        }
      });

      // Find any current character files for this active player
      const currentPlayerFiles = allFsFiles.filter(f => {
        const l = f.toLowerCase();
        return (
          l.endsWith(`-${uLower}.txt`) ||
          l.endsWith(`_${uLower}.txt`) ||
          l.endsWith(` ${uLower}.txt`) ||
          l === `${uLower}.txt` ||
          l === `character-${uLower}.txt`
        );
      });

      let deadCharName = '';
      for (const oldFile of currentPlayerFiles) {
        const content = fileSystem.read(oldFile) || '';
        const baseName = oldFile.replace(/\.txt$/, '').split(/[-_]/)[0].trim();
        deadCharName = baseName;
        excludedNames.push(baseName);

        // Convert fallen character: charactername-username into charactername-dead.txt
        const deadFileName = `${baseName}-dead.txt`;
        let updatedDeadContent = content;
        updatedDeadContent = updatedDeadContent.replace(
          new RegExp(`[-*•]?\\s*Player\\s*[:=]\\s*${activeUser}[^\\n\\r]*`, 'gi'),
          `- Status: Dead (Preserved corpse; former character for ${activeUser})\n- Player: None (Deceased)`
        );
        if (!updatedDeadContent.includes('Status: Dead')) {
          updatedDeadContent = updatedDeadContent.replace(/\[STATUS EFFECTS[^\]]*\]/i, `[STATUS EFFECTS & LORE]\n- Status: Dead (Fallen adventurer)`);
        }

        fileSystem.delete(oldFile);
        fileSystem.write(deadFileName, updatedDeadContent);
      }

      // Remove activeUser from CurrentMap.json players
      try {
        const rawMap = fileSystem.read('CurrentMap.json');
        if (rawMap) {
          const parsedMap = JSON.parse(rawMap);
          let mapModified = false;
          const filterP = (pl: any[]) => {
            if (!Array.isArray(pl)) return pl;
            return pl.filter((p: any) => {
              const pUser = (p.username || '').toLowerCase();
              const pChar = (p.characterName || p.name || '').toLowerCase();
              if (pUser === uLower || (deadCharName && pChar === deadCharName.toLowerCase())) {
                mapModified = true;
                return false;
              }
              return true;
            });
          };

          if (Array.isArray(parsedMap.players)) parsedMap.players = filterP(parsedMap.players);
          if (Array.isArray(parsedMap.pages)) {
            for (const pg of parsedMap.pages) {
              if (Array.isArray(pg.players)) pg.players = filterP(pg.players);
            }
          }

          if (mapModified) {
            fileSystem.write('CurrentMap.json', JSON.stringify(parsedMap, null, 2));
          }
        }
      } catch (e) {}

      syncFiles();

      const suggestedCharName = extractOrGenerateCharacterName(trimmedDesc, activeUser, excludedNames);

      // Pre-capture screenshot if available
      let mapScreenshot: string | undefined;
      if (mapPanelRef.current) {
        try {
          mapScreenshot = await mapPanelRef.current.captureScreenshot();
        } catch (e) {
          // ignore
        }
      }

      const prompt = `[CONTINUE ADVENTURE WITH NEW CHARACTER]
The previous player character "${deadCharName || 'predecessor'}" has fallen / died in this adventure.
Their corpse is preserved in the world as "${deadCharName || 'Predecessor'}-dead.txt".
The player "${activeUser}" is now creating and controlling an entirely NEW, DIFFERENT CHARACTER from their prompt:

NEW CHARACTER CONCEPT:
- Name: ${suggestedCharName}
- Player: ${activeUser}
- Concept & Description: ${trimmedDesc}

CRITICAL NATURAL STORY INTRODUCTION & PERSISTENCE MANDATES:
1. NEW CHARACTER MUST HAVE A DISTINCT NEW NAME: The character's name is "${suggestedCharName}". Do NOT name this character "${deadCharName || 'the dead character'}" and do NOT name them the account username "${activeUser}".
2. SAME ADVENTURE CONTINUES: Do NOT reset the world, erase existing lore, or wipe previous landmarks, locations, or NPCs. The timeline, environment, and world events remain strictly in place. Do NOT duplicate or clone established NPCs with slight name variations.
3. NATURAL STORY INTRODUCTION: Introduce ${suggestedCharName} into the narrative naturally based on the immediate surroundings, recent events, and current context (e.g. an arriving traveler, a hired mercenary investigating the area, an ally drawn by recent commotion, or a wandering explorer stepping into the scene).
4. PREDECESSOR AWARENESS: Acknowledge the aftermath or fallen predecessor if contextually fitting to the immediate location. Do NOT delete or overwrite "${deadCharName || 'Predecessor'}-dead.txt".
5. CHARACTER FILE: Create a full, rich character file named EXACTLY "[CharacterName]-${activeUser}.txt" ("${suggestedCharName.replace(/[^a-zA-Z0-9]/g, '')}-${activeUser}.txt"). Fill out [NAME & DESCRIPTION], [STATS & MODIFIERS], [ATTACKS & COMBAT ACTIONS], [ABILITIES & MAGIC], [CONTAINERS & CARRIED GEAR], [CURRENCY & FINANCIAL BALANCE], and [STATUS EFFECTS & LORE]. Starting carried items must be <= 2x hand slots. Under [CURRENTLY HOLDING], specify only actual item names with weight and dimensions. Don't add an item as things like free hand because it should just be empty instead etc for example (an unoccupied hand or slot is simply empty—never treat or add "Free Hand" or "Empty Hand" as an item, and never create an item file for it).
6. MAP PERSISTENCE: In CurrentMap.json, place this new character under "players" with username: "${activeUser}" and characterName: "${suggestedCharName}" at their arrival coordinates. Remove or mark deceased the old fallen player character.
7. ACTIVE STATUS: Set "gameOver": false in your JSON response so the player can immediately resume playing!

Write an immersive, multi-paragraph narrative (2-3 paragraphs) welcoming and establishing this new character naturally in the ongoing adventure.`;

      const result = await aiEngine.processAction(prompt, activeUser, mapScreenshot);

      if (result) {
        if (result.narrative) {
          const safeNarrative = typeof result.narrative === 'string'
            ? result.narrative
            : (typeof result.narrative === 'object' && result.narrative !== null)
              ? ((result.narrative as any).text || (result.narrative as any).content || JSON.stringify(result.narrative))
              : String(result.narrative);
          setNarrative(prev => [...prev, {
            id: Date.now().toString() + 'ai',
            text: safeNarrative,
            type: 'ai',
            usage: result.usage
          }]);
        }
        if (result.updates && Array.isArray(result.updates)) {
          setUpdates(prev => [...sanitizeUpdates(result.updates), ...prev].slice(0, 50));
        }
        if (result.recommendations && Array.isArray(result.recommendations)) {
          setRecommendations(sanitizeRecommendations(result.recommendations));
        }
      }

      // Guarantee new character file exists with the distinct name
      const expectedFileName = `${suggestedCharName.replace(/[^a-zA-Z0-9]/g, '')}-${activeUser}.txt`;
      if (!fileSystem.exists(expectedFileName)) {
        const fallbackContent = `[NAME & DESCRIPTION]
- Name: ${suggestedCharName}
- Player: ${activeUser}
- Description: ${trimmedDesc}
- Physical Dimensions: Height 5'10", Weight 170 lbs
- Max Lift Strength: 170 lbs (1.0x Body Weight)

[STATS & MODIFIERS]
- Health: 100 / 100
- Energy/Mana/Stamina: 100 / 100
- Speed: 10 m/s
- Strength: 10 (+0)
- Dexterity: 10 (+0)
- Intelligence: 10 (+0)
- Agility: 10 (+0)
- Willpower: 10 (+0)
- Constitution: 10 (+0)

[CURRENTLY HOLDING]
- Main Hand: Empty
- Off Hand: Empty

[CONTAINERS & CARRIED GEAR]
- Carried Weight: 4.0 lbs / 170 lbs (GOOD: Unencumbered)
- Equipped Containers:
  * Travel Pack: Dimensions 16x12x6 inches, Capacity 30 lbs, Weight 2 lbs
  * Coin Pouch: Capacity 5 lbs, Weight 0.5 lbs
- Carried Inventory (Inside Travel Pack):
  * Waterskin: 1.5 lbs, 8/8 sips of fresh water
  * Trail Rations: 1.0 lb, 3 day supply
  * Bedroll: 3.0 lbs

[CURRENCY & FINANCIAL BALANCE]
- Currency System: Standard Silver & Gold
- Carried Balance (On Person): 25 Silver Pieces (Inside Coin Pouch)
- Stored Wealth: 0
- Total Net Worth: 25 Silver Pieces

[STATUS EFFECTS & LORE]
- Status: Healthy (Active adventurer)
`;
        fileSystem.write(expectedFileName, fallbackContent);
      }

      setGameOver(false);
      setIsTerminatedOpen(false);
      setIsCreatingNewAfterDeath(false);
      setNewCharacterDescription('');
      syncFiles();

      if (gameMode === 'multiplayer' && multiplayerService && isHost) {
        multiplayerService.syncState({
          fileSystemState: fileSystem.exportState(),
          narrative: [
            ...(roomStateRef.current?.narrative || []),
            { id: Date.now().toString() + 'ai', text: result?.narrative || '', type: 'ai' as const, usage: result?.usage }
          ],
          updates: [...(result?.updates || []), ...(roomStateRef.current?.updates || [])].slice(0, 50),
          recommendations: result?.recommendations || [],
          gameState: 'playing',
          worldTime: parseActiveWorldTime(fileSystem.read('WorldTime.txt')),
          turnProcessed: true
        });
      }
    } catch (err) {
      console.error("Failed to continue with new character:", err);
      setGameOver(false);
      setIsTerminatedOpen(false);
      setIsCreatingNewAfterDeath(false);
    } finally {
      setIsSubmittingNewCharacter(false);
    }
  };

  const handleUndoConfirm = async () => {
    if (gameMode === 'multiplayer') {
      if (!isHost || !multiplayerService) {
        setIsUndoModalOpen(false);
        return;
      }
      const snapshot = HistoryService.popSnapshot();
      if (!snapshot) {
        setIsUndoModalOpen(false);
        return;
      }

      fileSystem.importState(snapshot.fileSystemState);
      syncFiles();

      const restoredNarrative: NarrativeEntry[] = [
        ...snapshot.narrative,
        {
          id: Date.now().toString() + 'system',
          text: `[SYSTEM: The host has reverted the adventure to Turn #${snapshot.turnNumber || 1}]`,
          type: 'system' as const
        }
      ];

      setNarrative(sanitizeNarrativeEntries(restoredNarrative));
      setUpdates(sanitizeUpdates(snapshot.updates || []));
      setRecommendations(sanitizeRecommendations(snapshot.recommendations || []));
      setGameOver(Boolean(snapshot.gameOver));
      if (snapshot.worldTime) setWorldTime(snapshot.worldTime);

      await multiplayerService.undoTurn({
        fileSystemState: snapshot.fileSystemState,
        narrative: sanitizeNarrativeEntries(restoredNarrative),
        updates: sanitizeUpdates(snapshot.updates || []),
        recommendations: sanitizeRecommendations(snapshot.recommendations || []),
        worldTime: snapshot.worldTime || '',
        turnNumber: snapshot.turnNumber
      });

      setUndoCount(HistoryService.getCount());
      setIsUndoModalOpen(false);
      return;
    }

    // Singleplayer undo
    const snapshot = HistoryService.popSnapshot();
    if (!snapshot) {
      setIsUndoModalOpen(false);
      return;
    }

    fileSystem.importState(snapshot.fileSystemState);
    syncFiles();

    setNarrative(sanitizeNarrativeEntries(snapshot.narrative));
    setUpdates(sanitizeUpdates(snapshot.updates || []));
    setRecommendations(sanitizeRecommendations(snapshot.recommendations || []));
    setGameOver(Boolean(snapshot.gameOver));
    if (snapshot.worldTime) setWorldTime(snapshot.worldTime);

    localStorage.setItem('aimud_narrative', JSON.stringify(snapshot.narrative));
    localStorage.setItem('aimud_updates', JSON.stringify(snapshot.updates || []));
    localStorage.setItem('aimud_recommendations', JSON.stringify(snapshot.recommendations || []));

    setUndoCount(HistoryService.getCount());
    setIsUndoModalOpen(false);
  };

  // While application systems, auth, and state are initializing, display the loading screen
  if (!isAppFullyLoaded) {
    return <LoadingScreen statusText="INITIALIZING AIFINITY" />;
  }

  if (currentPath === '/welcome') {
    return (
      <>
        <WelcomePage onEnterGame={handleEnterGame} />
        {/* Floating Daily Action Claim Banner */}
        {dailyClaimNotification && (
          <DailyClaimNotificationBanner
            amount={dailyClaimNotification.amount}
            stacked={dailyClaimNotification.stacked}
            totalStacked={dailyClaimNotification.totalStacked}
            total={dailyClaimNotification.total}
            onDismiss={() => setDailyClaimNotification(null)}
          />
        )}
        {/* Floating Verified Receipt Banner on Welcome Page */}
        <PurchaseNotificationBanner
          message={stripeReturnMessage}
          onDismiss={() => setStripeReturnMessage(null)}
          verifiedReceipt={verifiedReceiptTransaction}
          onOpenReceipt={() => setIsReceiptModalOpen(true)}
          onOpenOrderHistory={() => {
            setMarketInitialTab('receipts');
            setIsMarketOpen(true);
          }}
        />
        <ReceiptModal
          isOpen={isReceiptModalOpen}
          onClose={() => setIsReceiptModalOpen(false)}
          transaction={verifiedReceiptTransaction}
          currentUser={currentUser}
        />
        {/* Multiplayer Host/Join Modal accessible on welcome route if triggered */}
        {showMultiplayerModal && (
          <MainMenu
            onHostGame={handleHostGame}
            onJoinGame={handleJoinGame}
            onCancel={() => {
              setShowMultiplayerModal(null);
              setUrlRoomToJoin('');
            }}
            initialMode={showMultiplayerModal}
            initialRoomId={urlRoomToJoin}
            defaultUsername={getMultiplayerUsername(roomState?.players || [])}
            currentUser={currentUser}
            guestName={guestName}
            guestId={guestId}
            onOpenAuth={(tab) => {
              setPendingMultiplayerAction({ mode: showMultiplayerModal || 'host', roomId: urlRoomToJoin });
              setShowMultiplayerModal(null);
              setAuthModalInitialTab(tab || 'signup');
              setIsAuthModalOpen(true);
            }}
            onOpenMarket={(tab) => {
              setMarketInitialTab(tab || 'packs');
              setIsMarketOpen(true);
            }}
            onOpenActiveGames={() => setIsActiveGamesModalOpen(true)}
          />
        )}
      </>
    );
  }

  return (
    <div
      className="flex flex-col md:flex-row w-full bg-black text-gray-200 overflow-hidden relative"
      style={{ height: 'var(--app-height, 100dvh)', maxHeight: 'var(--app-height, 100dvh)' }}
    >
      {/* Daily Action Claim Notification Banner */}
      {dailyClaimNotification && (
        <DailyClaimNotificationBanner
          amount={dailyClaimNotification.amount}
          stacked={dailyClaimNotification.stacked}
          totalStacked={dailyClaimNotification.totalStacked}
          total={dailyClaimNotification.total}
          onDismiss={() => setDailyClaimNotification(null)}
        />
      )}

      {/* Stripe Return Notification Banner */}
      <PurchaseNotificationBanner
        message={stripeReturnMessage}
        onDismiss={() => setStripeReturnMessage(null)}
        verifiedReceipt={verifiedReceiptTransaction}
        onOpenReceipt={() => setIsReceiptModalOpen(true)}
        onOpenOrderHistory={() => {
          setMarketInitialTab('receipts');
          setIsMarketOpen(true);
        }}
      />

      <Sidebar
        files={files}
        fileSystem={fileSystem}
        updates={updates}
        debugMode={debugMode}
        onToggleDebug={() => setDebugMode(!debugMode)}
        onReset={() => {
          if (gameMode === 'multiplayer' && !isHost) return;
          setIsResetModalOpen(true);
        }}
        onUndo={() => {
          if (gameMode === 'multiplayer' && !isHost) return;
          setIsUndoModalOpen(true);
        }}
        undoCount={undoCount}
        expandedFile={expandedFile}
        setExpandedFile={setExpandedFile}
        gameMode={gameMode}
        roomState={roomState}
        username={activeGameUsername}
        onKickPlayer={(user) => {
          if (multiplayerService) {
            const userLower = user.toLowerCase();
            const charFile = fileSystem.list().find(f => f.toLowerCase().endsWith(`-${userLower}.txt`));

            if (charFile) {
              fileSystem.delete(charFile);
            }

            multiplayerService.syncState({
              fileSystemState: fileSystem.exportState(),
              narrative: roomState?.narrative || [],
              updates: roomState?.updates || [],
              gameState: roomState?.gameState || 'playing',
              worldTime: parseActiveWorldTime(fileSystem.read('WorldTime.txt'))
            });
            multiplayerService.kickPlayer(user);
          }
        }}
        onLeaveGame={handleLeaveGame}
        onForceTurn={() => multiplayerService?.forceTurn()}
        onReferenceClick={handleReferenceClick}
        autoRecommendationsEnabled={autoRecommendationsEnabled}
        onToggleAutoRecommendations={() => setAutoRecommendationsEnabled(!autoRecommendationsEnabled)}
        onHostClick={handleInitiateHost}
        onJoinClick={() => handleInitiateJoin()}
        syncCount={syncCount}
        mapPanelRef={mapPanelRef}
        currentUser={currentUser}
        guestName={guestName}
        onOpenAuth={() => setIsAuthModalOpen(true)}
        onOpenGuestName={() => setIsGuestNameModalOpen(true)}
        onLogout={handleLogout}
        onNavigateWelcome={() => {
          window.history.pushState({}, '', '/welcome');
          setCurrentPath('/welcome');
        }}
        actionStatus={actionStatus}
        onOpenMarket={(tab) => {
          setMarketInitialTab(tab || 'packs');
          setIsMarketOpen(true);
        }}
        onOpenAccount={() => setIsAccountModalOpen(true)}
        onOpenAdventures={() => setIsAdventuresModalOpen(true)}
        onOpenCommunity={() => setIsCommunityModalOpen(true)}
        onOpenShareCode={() => setShareRoomModalCode(roomState?.id || null)}
        onOpenChat={() => setIsChatOpen(prev => !prev)}
        unreadChatCount={unreadChatCount}
        onOpenActiveGames={() => setIsActiveGamesModalOpen(true)}
        onDeleteAdventurePermanently={handleDeleteMultiplayerAdventurePermanently}
        isMobileOpen={isMobilePanelOpen}
        onCloseMobile={() => setIsMobilePanelOpen(false)}
        mobileTab={mobilePanelTab}
        onSetMobileTab={setMobilePanelTab}
        isMinimized={isSidebarMinimized}
        onToggleMinimize={(explicit?: boolean) => setIsSidebarMinimized(prev => typeof explicit === 'boolean' ? explicit : !prev)}
      />

      <div className="flex-1 flex flex-col min-w-0 min-h-0 relative">
        {/* Main Game Top Bar */}
        <div className="bg-neutral-900 border-b border-neutral-800 text-xs font-mono shadow-lg z-20 flex flex-col">
          {/* Desktop Top Bar (hidden on small mobile, visible md+) */}
          <div className="hidden md:flex px-3 py-2 justify-between items-center gap-2 flex-wrap text-[11px] md:text-xs">
            <div className="flex items-center gap-2 flex-wrap">
              {/* Desktop Sidebar Expand/Collapse Toggle Button */}
              <button
                id="desktop-sidebar-toggle-btn"
                onClick={() => setIsSidebarMinimized(prev => !prev)}
                className="px-2 py-1 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white rounded border border-neutral-700 text-[11px] font-mono flex items-center gap-1.5 transition-colors cursor-pointer"
                title={isSidebarMinimized ? "Expand Sidebar (World Files & Map)" : "Minimize Sidebar"}
              >
                {isSidebarMinimized ? (
                  <>
                    <PanelLeftOpen size={13} className="text-blue-400" />
                    <span className="text-neutral-300">Sidebar</span>
                  </>
                ) : (
                  <>
                    <PanelLeftClose size={13} className="text-neutral-400" />
                    <span className="text-neutral-400">Minimize</span>
                  </>
                )}
              </button>

              {/* Welcome Page Button on Main Game Page */}
              <button
                id="welcome-page-top-btn"
                onClick={() => {
                  window.history.pushState({}, '', '/welcome');
                  setCurrentPath('/welcome');
                }}
                className="px-2.5 py-1 bg-neutral-800 hover:bg-neutral-700 text-blue-300 hover:text-white rounded border border-neutral-700 text-[11px] font-mono flex items-center gap-1.5 transition-colors cursor-pointer"
                title="Go to Welcome Page"
              >
                <Compass size={13} className="text-blue-400" />
                <span className="font-semibold">Welcome Page</span>
              </button>

              {/* Quick Navigation: Adventures, Community, Market */}
              <button
                id="top-adventures-btn"
                onClick={() => setIsAdventuresModalOpen(true)}
                className="px-2.5 py-1 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white rounded border border-neutral-700 text-[11px] font-mono flex items-center gap-1.5 transition-colors cursor-pointer"
                title="View and manage saved adventures"
              >
                <Bookmark size={13} className="text-blue-400" />
                <span>Adventures</span>
              </button>

              <button
                id="top-community-btn"
                onClick={() => setIsCommunityModalOpen(true)}
                className="px-2.5 py-1 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white rounded border border-neutral-700 text-[11px] font-mono flex items-center gap-1.5 transition-colors cursor-pointer"
                title="Browse community adventures"
              >
                <Globe size={13} className="text-emerald-400" />
                <span>Community</span>
              </button>

              <button
                id="top-market-btn"
                onClick={() => {
                  setMarketInitialTab('packs');
                  setIsMarketOpen(true);
                }}
                className="px-2.5 py-1 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 rounded border border-amber-500/40 text-[11px] font-mono flex items-center gap-1.5 transition-colors cursor-pointer"
                title="Aifinity Market: Buy actions, upgrade tier, or connect custom API key"
              >
                <ShoppingCart size={13} className="text-amber-400" />
                <span className="font-bold">Market</span>
                {actionStatus?.isAlphaPhase ? (
                  <span className="text-[10px] bg-amber-500/20 text-amber-200 border border-amber-500/40 px-1.5 py-0.2 rounded font-sans flex items-center gap-1 font-bold">
                    <Zap size={9} className="text-amber-400" /> Alpha: Unlimited
                  </span>
                ) : actionStatus?.isUnlimited ? (
                  <span className="text-[10px] bg-amber-500/20 text-amber-200 px-1.5 py-0.2 rounded font-sans flex items-center gap-0.5">
                    <Zap size={9} /> Unlimited
                  </span>
                ) : actionStatus?.isGuest ? (
                  <span className="text-[10px] bg-amber-950/70 border border-amber-800/60 text-amber-300 px-1.5 py-0.2 rounded font-sans">
                    {actionStatus?.guestActionsRemaining ?? 0}/{actionStatus?.guestActionsTotal ?? 5} Guest Free
                  </span>
                ) : (
                  <span className="text-[10px] bg-neutral-800 text-emerald-300 px-1.5 py-0.2 rounded font-sans">
                    {actionStatus?.freeStackedActions ?? actionStatus?.dailyFreeRemaining ?? 0} Free
                    {(actionStatus?.purchasedCredits ?? 0) > 0 && ` +${actionStatus.purchasedCredits}`}
                  </span>
                )}
              </button>

              {/* Undo Turn Button with Confirmation */}
              <button
                id="top-undo-turn-btn"
                onClick={() => {
                  if (gameMode === 'multiplayer' && !isHost) return;
                  setIsUndoModalOpen(true);
                }}
                disabled={isProcessing || undoCount === 0 || (gameMode === 'multiplayer' && !isHost)}
                className={`px-2.5 py-1 rounded border text-[11px] font-mono flex items-center gap-1.5 transition-colors cursor-pointer ${
                  isProcessing || undoCount === 0 || (gameMode === 'multiplayer' && !isHost)
                    ? 'opacity-40 bg-neutral-900 border-neutral-800 text-neutral-500 cursor-not-allowed'
                    : 'bg-neutral-800 hover:bg-neutral-700 text-amber-300 hover:text-amber-200 border-neutral-700'
                }`}
                title={
                  gameMode === 'multiplayer' && !isHost
                    ? "Only the host can undo a turn in multiplayer"
                    : undoCount === 0
                    ? "No previous turns to undo"
                    : `Revert to previous turn (${undoCount} available)`
                }
              >
                <RotateCcw size={13} className={undoCount > 0 ? "text-amber-400" : "text-neutral-500"} />
                <span>Undo Turn{undoCount > 0 ? ` (${undoCount})` : ''}</span>
              </button>

              {/* Fullscreen Browser Toggle Button */}
              <button
                id="top-fullscreen-toggle-btn"
                onClick={toggleFullscreen}
                className="px-2.5 py-1 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white rounded border border-neutral-700 text-[11px] font-mono flex items-center gap-1.5 transition-colors cursor-pointer"
                title={isFullscreen ? "Exit Fullscreen (or press Esc)" : "Toggle Fullscreen Mode"}
              >
                {isFullscreen ? (
                  <>
                    <Minimize2 size={13} className="text-blue-400" />
                    <span>Exit Fullscreen</span>
                  </>
                ) : (
                  <>
                    <Maximize2 size={13} className="text-blue-400" />
                    <span>Fullscreen</span>
                  </>
                )}
              </button>

              <span className="text-neutral-600">|</span>
              <span className="text-blue-400 tracking-widest">{worldTime || "TIME: UNKNOWN"}</span>
            </div>

            <div className="flex items-center gap-2">
              {currentUser && (
                <button
                  id="top-my-active-games-btn"
                  onClick={() => setIsActiveGamesModalOpen(true)}
                  className="flex items-center gap-1.5 text-neutral-300 hover:text-white bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 px-2 py-0.5 rounded text-[11px] font-mono transition-colors cursor-pointer"
                  title="View Your Active Multiplayer Adventures"
                >
                  <Users size={11} className="text-blue-400" />
                  <span>My Games</span>
                </button>
              )}

              {gameMode === 'multiplayer' && roomState && (
                <>
                  <button
                    onClick={() => setShareRoomModalCode(roomState.id)}
                    className="flex items-center gap-1.5 text-emerald-400 hover:text-emerald-300 bg-emerald-950/70 hover:bg-emerald-900/80 border border-emerald-800/60 px-2 py-0.5 rounded text-[11px] font-mono transition-colors cursor-pointer"
                    title="Click to view & share room code"
                  >
                    <Share2 size={11} className="text-emerald-400" />
                    <span>Room: {roomState.id}</span>
                    <span className="text-neutral-600">|</span>
                    <span>{(roomState.players || []).filter((p: any) => p.status === 'active').length} Players</span>
                  </button>

                  <button
                    id="top-multiplayer-chat-btn"
                    onClick={() => setIsChatOpen(prev => !prev)}
                    className="flex items-center gap-1.5 text-blue-400 hover:text-blue-300 bg-blue-950/70 hover:bg-blue-900/80 border border-blue-800/60 px-2 py-0.5 rounded text-[11px] font-mono transition-colors cursor-pointer relative"
                    title="Toggle Multiplayer Chat"
                  >
                    <MessageSquare size={11} className="text-blue-400" />
                    <span>Chat</span>
                    {unreadChatCount > 0 && (
                      <span className="bg-red-500 text-white font-bold font-mono text-[9px] px-1 rounded-full animate-pulse">
                        {unreadChatCount}
                      </span>
                    )}
                  </button>
                </>
              )}

              {currentUser ? (
                <div className="flex items-center gap-2 bg-neutral-950 px-2.5 py-1 rounded border border-neutral-700 text-[11px]">
                  <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                  <GoldenName
                    name={currentUser.username}
                    role={currentUser.role}
                    tier={currentUser.tier}
                    showGlowingName={currentUser.showGlowingName}
                    isGolden={currentUser.tier === 'legendary'}
                    className="font-bold text-white"
                  />
                  <span className={`text-[9px] px-1.5 py-0.5 rounded uppercase font-semibold ${
                    currentUser.tier === 'celestial'
                      ? 'bg-gradient-to-r from-sky-950 to-purple-950 text-cyan-200 border border-cyan-400/60 shadow-[0_0_8px_rgba(56,189,248,0.4)] flex items-center gap-0.5'
                      : currentUser.tier === 'legendary'
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 flex items-center gap-0.5'
                      : currentUser.tier === 'adventurer'
                        ? 'bg-blue-500/20 text-blue-300 border border-blue-500/40'
                        : 'bg-neutral-800 text-neutral-400'
                  }`}>
                    {currentUser.tier === 'celestial' && <Sparkles size={9} className="text-cyan-300 animate-pulse" />}
                    {currentUser.tier === 'legendary' && <Crown size={9} />}
                    {currentUser.tier || 'free'}
                  </span>
                  <button
                    id="top-account-btn"
                    onClick={() => setIsAccountModalOpen(true)}
                    className={`text-[10px] px-1.5 py-0.5 rounded font-medium border flex items-center gap-1 cursor-pointer transition-colors ${
                      currentUser.role === 'admin'
                        ? 'bg-sky-950/80 hover:bg-sky-900 border-cyan-400/60 text-cyan-300'
                        : currentUser.role === 'mod'
                        ? 'bg-amber-950/80 hover:bg-amber-900 border-amber-400/60 text-amber-300'
                        : 'bg-neutral-800 hover:bg-neutral-700 border-neutral-700 text-neutral-200'
                    }`}
                    title="Account Settings, Permissions & Profile"
                  >
                    <User size={10} />
                    <span>{currentUser.role === 'admin' ? 'Account (Admin)' : currentUser.role === 'mod' ? 'Account (Mod)' : 'Account'}</span>
                  </button>
                  <button
                    id="top-logout-btn"
                    onClick={handleLogout}
                    className="text-neutral-400 hover:text-red-400 ml-0.5 text-[10px] underline cursor-pointer"
                    title="Log out and return to Guest"
                  >
                    Log Out
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-1.5">
                  <div className="flex items-center gap-1.5 bg-neutral-950 px-2 py-1 rounded border border-neutral-800 text-[11px]">
                    <span className="w-2 h-2 rounded-full bg-amber-400"></span>
                    <span className="text-amber-300">
                      {guestName ? `${guestName} (Guest)` : 'Player (Guest)'}
                    </span>
                    <button
                      id="top-change-guest-name-btn"
                      onClick={() => setIsGuestNameModalOpen(true)}
                      className="text-neutral-400 hover:text-amber-300 ml-1 text-[10px] underline cursor-pointer"
                      title="Change guest temporary name"
                    >
                      {guestName ? 'Edit' : 'Set Name'}
                    </button>
                  </div>
                  <button
                    id="top-open-login-btn"
                    onClick={() => setIsAuthModalOpen(true)}
                    className="px-2.5 py-1 bg-blue-600 hover:bg-blue-500 text-white rounded text-[11px] font-semibold flex items-center gap-1 transition-colors cursor-pointer"
                  >
                    <LogIn size={11} />
                    <span>Log In / Sign Up</span>
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Mobile Top Bar (Single compact line on < md) */}
          <div className="flex md:hidden px-2.5 py-1.5 justify-between items-center gap-1 text-[10px] sm:text-[10.5px]">
            <div className="flex items-center gap-1 min-w-0">
              <button
                onClick={() => {
                  setMobilePanelTab('files');
                  setIsMobilePanelOpen(true);
                }}
                className="px-2 py-0.5 rounded bg-blue-950/80 active:bg-blue-900 border border-blue-800/80 text-blue-300 font-semibold flex items-center gap-1 shrink-0 transition-colors active:scale-95"
                title="Open World Files & Character Sheet"
              >
                <FileText size={11} className="text-blue-400" />
                <span>Files ({files.length})</span>
              </button>
              <button
                onClick={() => {
                  setMobilePanelTab('map');
                  setIsMobilePanelOpen(true);
                }}
                className="px-2 py-0.5 rounded bg-emerald-950/80 active:bg-emerald-900 border border-emerald-800/80 text-emerald-300 font-semibold flex items-center gap-1 shrink-0 transition-colors active:scale-95"
                title="Open Map"
              >
                <MapIcon size={11} className="text-emerald-400" />
                <span>Map</span>
              </button>
              <span className="text-blue-400 font-semibold tracking-wide truncate max-w-[70px] sm:max-w-[120px]" title={worldTime}>
                {worldTime || "TIME"}
              </span>
              {gameMode === 'multiplayer' && roomState && (
                <button
                  onClick={() => setShareRoomModalCode(roomState.id)}
                  className="text-emerald-400 hover:text-emerald-300 text-[9px] bg-emerald-950/70 border border-emerald-800/60 px-1.5 py-0.5 rounded truncate flex items-center gap-1 cursor-pointer font-mono"
                  title="Click to view & share room code"
                >
                  <Share2 size={9} />
                  <span>{roomState.id}</span>
                </button>
              )}
            </div>

            <div className="flex items-center gap-1 shrink-0">
              {/* Compact Market / Actions status */}
              <button
                onClick={() => {
                  setMarketInitialTab('packs');
                  setIsMarketOpen(true);
                }}
                className="px-2 py-0.5 bg-amber-500/10 active:bg-amber-500/20 text-amber-300 rounded border border-amber-500/40 text-[10px] flex items-center gap-1"
                title="Aifinity Market"
              >
                <Zap size={10} className="text-amber-400" />
                {actionStatus?.isUnlimited ? (
                  <span className="font-bold">Unlimited</span>
                ) : actionStatus?.isGuest ? (
                  <span>{actionStatus?.guestActionsRemaining ?? 0}/{actionStatus?.guestActionsTotal ?? 5}</span>
                ) : (
                  <span>
                    {actionStatus?.freeStackedActions ?? actionStatus?.dailyFreeRemaining ?? 0} Free
                  </span>
                )}
              </button>

              {/* Mobile Undo Button */}
              <button
                id="mobile-undo-btn"
                onClick={() => {
                  if (gameMode === 'multiplayer' && !isHost) return;
                  setIsUndoModalOpen(true);
                }}
                disabled={isProcessing || undoCount === 0 || (gameMode === 'multiplayer' && !isHost)}
                className={`px-2 py-0.5 rounded border text-[10px] flex items-center gap-1 transition-colors ${
                  isProcessing || undoCount === 0 || (gameMode === 'multiplayer' && !isHost)
                    ? 'opacity-40 bg-neutral-900 border-neutral-800 text-neutral-500'
                    : 'bg-neutral-800 text-amber-300 border-neutral-700 active:bg-neutral-700'
                }`}
                title="Undo Turn"
              >
                <RotateCcw size={10} className={undoCount > 0 ? "text-amber-400" : "text-neutral-500"} />
                <span>Undo{undoCount > 0 ? ` (${undoCount})` : ''}</span>
              </button>

              {/* Expandable Menu Toggle */}
              <button
                onClick={() => setIsMobileTopMenuOpen(!isMobileTopMenuOpen)}
                className={`px-2 py-0.5 rounded border text-[10.5px] font-mono flex items-center gap-1 transition-colors ${
                  isMobileTopMenuOpen
                    ? 'bg-blue-900/60 border-blue-700 text-blue-200'
                    : 'bg-neutral-800 hover:bg-neutral-700 border-neutral-700 text-neutral-300'
                }`}
                title="Navigation & Account Menu"
              >
                <Menu size={11} />
                <span>{isMobileTopMenuOpen ? 'Close' : 'Menu'}</span>
                {isMobileTopMenuOpen ? <ChevronUpIcon size={11} /> : <ChevronDownIcon size={11} />}
              </button>
            </div>
          </div>

          {/* Expandable Mobile Navigation Drawer */}
          {isMobileTopMenuOpen && (
            <div className="md:hidden bg-neutral-950 border-t border-neutral-800 p-2 text-[10.5px] flex flex-col gap-2 animate-in slide-in-from-top-2 duration-150 shadow-2xl">
              {/* Quick Navigation Buttons */}
              <div className="grid grid-cols-3 gap-1.5">
                <button
                  onClick={() => {
                    setIsMobileTopMenuOpen(false);
                    window.history.pushState({}, '', '/welcome');
                    setCurrentPath('/welcome');
                  }}
                  className="p-1.5 bg-neutral-900 hover:bg-neutral-800 text-blue-300 rounded border border-neutral-800 flex items-center justify-center gap-1 transition-colors"
                >
                  <Compass size={12} className="text-blue-400" />
                  <span>Welcome</span>
                </button>

                <button
                  onClick={() => {
                    setIsMobileTopMenuOpen(false);
                    setIsAdventuresModalOpen(true);
                  }}
                  className="p-1.5 bg-neutral-900 hover:bg-neutral-800 text-neutral-200 rounded border border-neutral-800 flex items-center justify-center gap-1 transition-colors"
                >
                  <Bookmark size={12} className="text-blue-400" />
                  <span>Adventures</span>
                </button>

                <button
                  onClick={() => {
                    setIsMobileTopMenuOpen(false);
                    setIsCommunityModalOpen(true);
                  }}
                  className="p-1.5 bg-neutral-900 hover:bg-neutral-800 text-emerald-300 rounded border border-neutral-800 flex items-center justify-center gap-1 transition-colors"
                >
                  <Globe size={12} className="text-emerald-400" />
                  <span>Community</span>
                </button>
              </div>

              {/* Multiplayer Section in Mobile Main Menu */}
              {(!roomState || gameMode === 'singleplayer') ? (
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    onClick={() => {
                      setIsMobileTopMenuOpen(false);
                      handleInitiateHost();
                    }}
                    className="p-2 bg-blue-900/50 hover:bg-blue-800/70 active:bg-blue-700/80 text-blue-200 rounded border border-blue-700/60 flex items-center justify-center gap-1.5 font-semibold transition-colors cursor-pointer"
                  >
                    <Users size={12} className="text-blue-300" />
                    <span>Host Multiplayer</span>
                  </button>
                  <button
                    onClick={() => {
                      setIsMobileTopMenuOpen(false);
                      handleInitiateJoin();
                    }}
                    className="p-2 bg-emerald-900/50 hover:bg-emerald-800/70 active:bg-emerald-700/80 text-emerald-200 rounded border border-emerald-700/60 flex items-center justify-center gap-1.5 font-semibold transition-colors cursor-pointer"
                  >
                    <Sparkles size={12} className="text-emerald-300" />
                    <span>Join Multiplayer</span>
                  </button>
                </div>
              ) : (
                <div className="flex flex-col gap-1.5 p-2 bg-blue-950/70 border border-blue-800/70 rounded">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 truncate">
                      <Users size={12} className="text-blue-400 shrink-0" />
                      <span className="font-bold text-blue-200 truncate">Room: {roomState.id}</span>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        onClick={() => {
                          setIsMobileTopMenuOpen(false);
                          setIsChatOpen(true);
                        }}
                        className="px-2 py-1 bg-blue-900/80 hover:bg-blue-800 text-blue-200 rounded border border-blue-700/60 text-[10px] flex items-center gap-1 cursor-pointer"
                        title="Open Multiplayer Chat"
                      >
                        <MessageSquare size={10} /> Chat {unreadChatCount > 0 && `(${unreadChatCount})`}
                      </button>
                      <button
                        onClick={() => {
                          setIsMobileTopMenuOpen(false);
                          setShareRoomModalCode(roomState.id);
                        }}
                        className="px-2 py-1 bg-blue-900/80 hover:bg-blue-800 text-blue-200 rounded border border-blue-700/60 text-[10px] flex items-center gap-1 cursor-pointer"
                        title="Share Room Code"
                      >
                        <Share2 size={10} /> Share
                      </button>
                      <button
                        onClick={() => {
                          setIsMobileTopMenuOpen(false);
                          handleLeaveGame();
                        }}
                        className="px-2 py-1 bg-red-950/80 hover:bg-red-900 text-red-300 rounded border border-red-800/60 text-[10px] flex items-center gap-1 cursor-pointer"
                        title="Leave Multiplayer Game"
                      >
                        <LogOutIcon size={10} /> Leave
                      </button>
                    </div>
                  </div>

                  {(isHost || currentUser?.role === 'admin' || currentUser?.role === 'mod') && (
                    <button
                      onClick={() => {
                        setIsMobileTopMenuOpen(false);
                        handleDeleteMultiplayerAdventurePermanently();
                      }}
                      className="w-full bg-red-950/40 hover:bg-red-900/60 text-red-300 border border-red-800/50 p-1.5 rounded text-[10px] flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                      title="Permanently delete this multiplayer adventure"
                    >
                      <Trash2 size={10} />
                      <span>Delete Adventure Permanently</span>
                    </button>
                  )}
                </div>
              )}

              {/* View Active Multiplayer Adventures Button */}
              {currentUser && (
                <button
                  onClick={() => {
                    setIsMobileTopMenuOpen(false);
                    setIsActiveGamesModalOpen(true);
                  }}
                  className="w-full p-2 bg-neutral-900 hover:bg-neutral-800 text-blue-300 rounded border border-neutral-800 flex items-center justify-center gap-1.5 font-medium transition-colors cursor-pointer"
                >
                  <Users size={12} className="text-blue-400" />
                  <span>My Active Multiplayer Games</span>
                </button>
              )}

              {/* World Files and Map Links in Mobile Menu */}
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  onClick={() => {
                    setIsMobileTopMenuOpen(false);
                    setMobilePanelTab('files');
                    setIsMobilePanelOpen(true);
                  }}
                  className="p-1.5 bg-neutral-900 hover:bg-neutral-800 text-blue-300 rounded border border-neutral-800 flex items-center justify-center gap-1.5 transition-colors"
                >
                  <FileText size={12} className="text-blue-400" />
                  <span>Files & Character</span>
                </button>
                <button
                  onClick={() => {
                    setIsMobileTopMenuOpen(false);
                    setMobilePanelTab('map');
                    setIsMobilePanelOpen(true);
                  }}
                  className="p-1.5 bg-neutral-900 hover:bg-neutral-800 text-emerald-300 rounded border border-neutral-800 flex items-center justify-center gap-1.5 transition-colors"
                >
                  <MapIcon size={12} className="text-emerald-400" />
                  <span>Interactive Map</span>
                </button>
              </div>

              {/* Action Buttons in Mobile Drawer */}
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  onClick={() => {
                    setIsMobileTopMenuOpen(false);
                    if (gameMode === 'multiplayer' && !isHost) return;
                    setIsUndoModalOpen(true);
                  }}
                  disabled={isProcessing || undoCount === 0 || (gameMode === 'multiplayer' && !isHost)}
                  className={`p-1.5 rounded border text-[11px] font-mono flex items-center justify-center gap-1.5 transition-colors ${
                    isProcessing || undoCount === 0 || (gameMode === 'multiplayer' && !isHost)
                      ? 'opacity-40 bg-neutral-900 border-neutral-800 text-neutral-500 cursor-not-allowed'
                      : 'bg-neutral-900 hover:bg-neutral-800 text-amber-300 border-neutral-800'
                  }`}
                >
                  <RotateCcw size={12} className={undoCount > 0 ? "text-amber-400" : "text-neutral-500"} />
                  <span>Undo{undoCount > 0 ? ` (${undoCount})` : ''}</span>
                </button>

                <button
                  onClick={() => {
                    setIsMobileTopMenuOpen(false);
                    toggleFullscreen();
                  }}
                  className="p-1.5 bg-neutral-900 hover:bg-neutral-800 text-neutral-300 rounded border border-neutral-800 flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                  title="Toggle Fullscreen Browser Mode"
                >
                  {isFullscreen ? (
                    <>
                      <Minimize2 size={12} className="text-blue-400" />
                      <span>Exit Fullscreen</span>
                    </>
                  ) : (
                    <>
                      <Maximize2 size={12} className="text-blue-400" />
                      <span>Fullscreen</span>
                    </>
                  )}
                </button>
              </div>

              {/* User / Account Section in Mobile Menu */}
              <div className="bg-neutral-900/80 p-2 rounded border border-neutral-800 flex items-center justify-between gap-2">
                {currentUser ? (
                  <>
                    <div className="flex items-center gap-1.5 truncate">
                      <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0"></span>
                      <GoldenName
                        name={currentUser.username}
                        role={currentUser.role}
                        tier={currentUser.tier}
                        showGlowingName={currentUser.showGlowingName}
                        isGolden={currentUser.tier === 'legendary'}
                        className="font-bold text-white text-[11px] truncate"
                      />
                      <span className={`text-[9px] px-1 py-0.2 rounded uppercase ${
                        currentUser.tier === 'celestial'
                          ? 'bg-gradient-to-r from-sky-950 to-purple-950 text-cyan-200 border border-cyan-400/60'
                          : currentUser.tier === 'legendary'
                          ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                          : currentUser.tier === 'adventurer'
                          ? 'bg-blue-500/20 text-blue-300 border border-blue-500/40'
                          : 'bg-neutral-800 text-neutral-400'
                      }`}>
                        {currentUser.tier || 'free'}
                      </span>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => {
                          setIsMobileTopMenuOpen(false);
                          setIsAccountModalOpen(true);
                        }}
                        className="px-2 py-1 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 rounded border border-neutral-700 text-[10px] flex items-center gap-1"
                      >
                        <User size={10} />
                        <span>Account</span>
                      </button>
                      <button
                        onClick={() => {
                          setIsMobileTopMenuOpen(false);
                          handleLogout();
                        }}
                        className="px-1.5 py-1 text-red-400 hover:text-red-300 text-[10px] underline"
                      >
                        Log Out
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex items-center gap-1.5 truncate text-[10.5px]">
                      <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0"></span>
                      <span className="text-amber-300 truncate">
                        {guestName ? `${guestName} (Guest)` : 'Guest Player'}
                      </span>
                      <button
                        onClick={() => {
                          setIsMobileTopMenuOpen(false);
                          setIsGuestNameModalOpen(true);
                        }}
                        className="text-neutral-400 hover:text-amber-300 text-[9.5px] underline ml-1"
                      >
                        Edit
                      </button>
                    </div>

                    <button
                      onClick={() => {
                        setIsMobileTopMenuOpen(false);
                        setIsAuthModalOpen(true);
                      }}
                      className="px-2.5 py-1 bg-blue-600 hover:bg-blue-500 text-white rounded text-[10.5px] font-semibold flex items-center gap-1 shrink-0"
                    >
                      <LogIn size={11} />
                      <span>Log In</span>
                    </button>
                  </>
                )}
              </div>
            </div>
          )}
        </div>

        <NarrativeWindow
          history={narrative}
          onReferenceClick={handleReferenceClick}
          debugMode={debugMode}
          fileSystem={fileSystem}
          username={activeGameUsername}
        />

        {/* Floating Status Updates */}
        <LiveStatusUpdates updates={updates} gameOver={gameOver} />

        {/* Terminated Modal (Closable UI) */}
        {gameOver && isTerminatedOpen && (
          <div className="fixed inset-0 flex items-center justify-center bg-black/85 backdrop-blur-md z-50 p-4 pointer-events-auto overflow-y-auto">
            <div className="bg-neutral-950 border-2 border-red-600 p-6 sm:p-8 rounded-2xl max-w-lg w-full text-center shadow-[0_0_80px_rgba(220,38,38,0.55)] relative flex flex-col animate-in zoom-in-95 duration-200 my-auto text-left">
              <button
                onClick={() => setIsTerminatedOpen(false)}
                className="absolute top-4 right-4 text-gray-400 hover:text-white p-1.5 rounded-lg hover:bg-neutral-800 transition-colors cursor-pointer text-lg font-bold leading-none"
                title="Close (Minimize to corner)"
                aria-label="Close"
              >
                ✕
              </button>

              {!isCreatingNewAfterDeath ? (
                <div className="flex flex-col items-center text-center">
                  <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-red-950/80 border border-red-500/50 text-red-400 mb-3 text-2xl shadow-inner">
                    💀
                  </div>
                  <h1 className="text-4xl sm:text-5xl font-black text-red-500 mb-2 tracking-tighter drop-shadow-[0_0_20px_rgba(239,68,68,0.7)]">
                    YOU HAVE DIED
                  </h1>
                  <p className="text-base sm:text-lg text-red-400 font-bold mb-3">
                    Vital signs zero. Your character has fallen.
                  </p>
                  <p className="text-xs sm:text-sm text-neutral-400 mb-6 leading-relaxed max-w-md">
                    Your journey with this character has ended, but this world and its story live on. You can introduce a new character to continue the same adventure seamlessly, or reset to start a fresh adventure.
                  </p>

                  <div className="w-full flex flex-col gap-2.5">
                    <button
                      onClick={() => setIsCreatingNewAfterDeath(true)}
                      className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 px-4 rounded-xl font-mono text-xs sm:text-sm transition-all shadow-[0_0_20px_rgba(37,99,235,0.4)] hover:shadow-[0_0_25px_rgba(37,99,235,0.6)] flex items-center justify-center gap-2 cursor-pointer active:scale-[0.98]"
                    >
                      <span>⚔️</span>
                      <span>Continue with New Character</span>
                    </button>

                    <button
                      onClick={() => {
                        setIsResetModalOpen(true);
                      }}
                      className="w-full bg-red-950/40 hover:bg-red-900/60 text-red-300 hover:text-red-100 font-semibold py-2.5 px-4 rounded-xl border border-red-800/60 font-mono text-xs transition-colors flex items-center justify-center gap-2 cursor-pointer shadow-sm active:scale-[0.98]"
                    >
                      <RefreshCw size={13} className="text-red-400" />
                      <span>Reset to Start a New Adventure</span>
                    </button>

                    <button
                      onClick={() => setIsTerminatedOpen(false)}
                      className="text-xs text-neutral-400 hover:text-neutral-200 transition-colors py-1 cursor-pointer underline decoration-dotted underline-offset-4"
                    >
                      Close & Observe World (Minimized to corner)
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col text-left">
                  <div className="flex items-center justify-between mb-3 border-b border-neutral-800 pb-2.5">
                    <h2 className="text-base sm:text-lg font-bold text-blue-400 font-mono flex items-center gap-2">
                      <span>⚔️</span>
                      <span>Create New Character</span>
                    </h2>
                    <button
                      onClick={() => setIsCreatingNewAfterDeath(false)}
                      disabled={isSubmittingNewCharacter}
                      className="text-xs text-gray-400 hover:text-white font-mono cursor-pointer disabled:opacity-50"
                    >
                      ← Back
                    </button>
                  </div>

                  <p className="text-xs text-neutral-300 mb-2 leading-relaxed">
                    Your new character will be introduced to the story naturally based on the ongoing context, immediate location, and recent events.
                  </p>

                  <div className="bg-amber-950/40 border border-amber-900/50 p-2.5 rounded text-[11px] text-amber-300/90 leading-tight mb-3">
                    <strong>Starting Inventory Limit:</strong> Characters start with at most 2x their hand slots in carried items (e.g. max 4 items for 2 hands). Extra gear belongs in your home/camp stash.
                  </div>

                  <textarea
                    value={newCharacterDescription}
                    onChange={(e) => setNewCharacterDescription(e.target.value)}
                    disabled={isSubmittingNewCharacter}
                    rows={4}
                    className="w-full bg-black border border-neutral-700 focus:border-blue-500 rounded p-2.5 text-white font-mono text-xs resize-none focus:outline-none disabled:opacity-50 mb-3"
                    placeholder="Describe your character's class, appearance, personality, or background (e.g. A seasoned mercenary hired to investigate the strange occurrences here, a swift scout, a wandering mage...)"
                  />

                  {isSubmittingNewCharacter ? (
                    <div className="p-3 bg-blue-950/50 border border-blue-800/60 rounded-xl flex items-center justify-center gap-2.5 text-xs text-blue-300 font-mono animate-pulse">
                      <div className="w-3.5 h-3.5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                      <span>Introducing character to the adventure...</span>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <button
                        onClick={() => setIsCreatingNewAfterDeath(false)}
                        className="w-1/3 bg-neutral-800 hover:bg-neutral-700 text-gray-300 py-2.5 px-3 rounded-xl font-mono text-xs transition-colors cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => handleContinueWithNewCharacter(newCharacterDescription)}
                        disabled={!newCharacterDescription.trim()}
                        className="w-2/3 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold py-2.5 px-3 rounded-xl font-mono text-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer shadow-[0_0_15px_rgba(37,99,235,0.4)]"
                      >
                        <span>Enter Adventure</span>
                        <span>→</span>
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Minimized Controls in Corner when You Have Died dialog is closed */}
        {gameOver && !isTerminatedOpen && !showCharacterCreation && (
          <div className="fixed bottom-20 right-3 sm:right-6 z-40 flex flex-wrap items-center justify-end gap-2 animate-in slide-in-from-bottom-3 duration-300 pointer-events-auto">
            <button
              onClick={() => {
                setIsResetModalOpen(true);
              }}
              className="flex items-center gap-1.5 bg-neutral-950/95 hover:bg-red-950/80 text-red-300 hover:text-red-100 border border-red-800/80 px-3.5 py-2.5 rounded-full shadow-[0_0_20px_rgba(220,38,38,0.45)] font-mono text-xs font-semibold transition-all hover:scale-105 active:scale-95 cursor-pointer backdrop-blur-md"
              title="Reset to start a new adventure"
            >
              <RefreshCw size={12} className="text-red-400" />
              <span>Reset Adventure</span>
            </button>

            <button
              onClick={() => {
                setIsTerminatedOpen(true);
                setIsCreatingNewAfterDeath(true);
              }}
              className="flex items-center gap-2.5 bg-neutral-950/95 hover:bg-neutral-900 text-blue-200 border-2 border-blue-500/80 px-4 py-2.5 rounded-full shadow-[0_0_25px_rgba(37,99,235,0.45)] font-mono text-xs font-bold transition-all hover:scale-105 active:scale-95 cursor-pointer backdrop-blur-md group"
              title="Your character has fallen. Click to continue with a new character."
            >
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
              </span>
              <span className="text-sm leading-none">⚔️</span>
              <span>Continue with New Character</span>
              <span className="text-neutral-400 group-hover:text-white transition-colors text-xs font-sans">↗</span>
            </button>

            <button
              onClick={() => {
                setIsTerminatedOpen(true);
                setIsCreatingNewAfterDeath(false);
              }}
              className="bg-neutral-900/90 hover:bg-neutral-800 text-neutral-400 hover:text-white border border-neutral-700 p-2.5 rounded-full text-xs font-mono transition-colors cursor-pointer shadow-md flex items-center justify-center"
              title="Expand Death Overview"
              aria-label="Expand Death Overview"
            >
              <Maximize2 size={13} />
            </button>
          </div>
        )}

        <InputArea
          onSend={handleAction}
          disabled={isProcessing || gameOver || isMyTurnReady || showCharacterCreation || (gameMode === 'multiplayer' && roomState?.gameState !== 'playing' && !(roomState?.gameState === 'waiting_for_world' && isHost))}
          isProcessing={isProcessing}
          onCancelProcessing={isMultiplayerBeforeCharacterPrompts ? undefined : handleForceUnlock}
          canUnlock={!isMultiplayerBeforeCharacterPrompts}
          isMyTurnReady={Boolean(isMyTurnReady)}
          recommendations={effectiveRecommendations}
          placeholder={
            gameOver
              ? "Character has fallen. Click 'Continue with New Character' in corner to resume..."
              : isMultiplayerBeforeCharacterPrompts
                ? (isHost
                    ? (isProcessing ? "Host setting up world... Please wait..." : "Enter starting world prompt to set up the adventure for all players...")
                    : "Only host can set up world first. Waiting for host to create world...")
                : undefined
          }
        />
      </div>

      <Modal
        isOpen={isResetModalOpen}
        onConfirm={handleReset}
        onCancel={() => setIsResetModalOpen(false)}
      />

      <UndoModal
        isOpen={isUndoModalOpen}
        onConfirm={handleUndoConfirm}
        onCancel={() => setIsUndoModalOpen(false)}
        previousSnapshot={HistoryService.peekSnapshot()}
        isMultiplayer={gameMode === 'multiplayer'}
      />

      <AuthModal
        isOpen={isAuthModalOpen}
        initialTab={authModalInitialTab}
        onClose={() => {
          setIsAuthModalOpen(false);
          setPendingMultiplayerAction(null);
        }}
        onAuthSuccess={(user) => {
          setCurrentUser(user);
          setActionStatus(ActionLimitService.getActionStatus(user, guestId));
          runDailyActionClaimCheck(user);
          setIsActionLimitModalOpen(false);
          setIsGuestWelcomeOpen(false);
          setIsAuthModalOpen(false);

          // If user initiated hosting or joining multiplayer before logging in, proceed automatically
          if (pendingMultiplayerAction) {
            if (pendingMultiplayerAction.roomId) {
              setUrlRoomToJoin(pendingMultiplayerAction.roomId);
            }
            setShowMultiplayerModal(pendingMultiplayerAction.mode);
            setPendingMultiplayerAction(null);
          }
        }}
      />

      <GuestWelcomeModal
        isOpen={isGuestWelcomeOpen && !currentUser}
        onClose={() => setIsGuestWelcomeOpen(false)}
        onOpenAuth={(mode) => {
          setIsGuestWelcomeOpen(false);
          setAuthModalInitialTab(mode || 'signup');
          setIsAuthModalOpen(true);
        }}
      />

      <GuestNameModal
        isOpen={isGuestNameModalOpen}
        onClose={() => setIsGuestNameModalOpen(false)}
        guestId={guestId}
        currentGuestName={guestName}
        onNameSaved={(newName) => {
          setGuestName(newName);
        }}
      />

      <MarketModal
        isOpen={isMarketOpen}
        onClose={() => setIsMarketOpen(false)}
        currentUser={currentUser}
        actionStatus={actionStatus}
        initialTab={marketInitialTab}
        onStatusUpdated={refreshActionStatus}
        onProfileUpdated={(updated) => {
          setCurrentUser({ ...updated });
          setActionStatus(ActionLimitService.getActionStatus(updated, guestId));
        }}
        onOpenAuth={() => {
          setIsMarketOpen(false);
          setAuthModalInitialTab('signup');
          setIsAuthModalOpen(true);
        }}
        guestId={guestId}
      />

      <ActionLimitModal
        isOpen={isActionLimitModalOpen}
        onClose={() => setIsActionLimitModalOpen(false)}
        currentUser={currentUser}
        actionStatus={actionStatus}
        onOpenAuth={(mode) => {
          setIsActionLimitModalOpen(false);
          setAuthModalInitialTab(mode || 'signup');
          setIsAuthModalOpen(true);
        }}
        onOpenMarket={(tab) => {
          setIsActionLimitModalOpen(false);
          setMarketInitialTab(tab || 'packs');
          setIsMarketOpen(true);
        }}
        onApiKeySaved={() => {
          refreshActionStatus();
          setIsActionLimitModalOpen(false);
        }}
      />

      <AdventuresModal
        isOpen={isAdventuresModalOpen}
        onClose={() => setIsAdventuresModalOpen(false)}
        currentUser={currentUser}
        guestId={guestId}
        fileSystem={fileSystem}
        narrative={narrative}
        onLoadAdventure={handleLoadAdventure}
        onOpenCommunityShare={(adventure) => {
          setAdventureToShare(adventure);
          setIsAdventuresModalOpen(false);
          setIsCommunityModalOpen(true);
        }}
        onOpenMarket={() => {
          setIsAdventuresModalOpen(false);
          setMarketInitialTab('subscriptions');
          setIsMarketOpen(true);
        }}
      />

      <CommunityAdventuresModal
        isOpen={isCommunityModalOpen}
        onClose={() => {
          setIsCommunityModalOpen(false);
          setAdventureToShare(null);
        }}
        currentUser={currentUser}
        fileSystem={fileSystem}
        narrative={narrative}
        initialAdventureToShare={adventureToShare}
        onPlayCommunityAdventure={handlePlayCommunityAdventure}
        onOpenMarket={() => {
          setIsCommunityModalOpen(false);
          setMarketInitialTab('subscriptions');
          setIsMarketOpen(true);
        }}
      />

      <AccountModal
        isOpen={isAccountModalOpen}
        onClose={() => setIsAccountModalOpen(false)}
        currentUser={currentUser}
        actionStatus={actionStatus}
        onProfileUpdated={(updatedUser) => {
          setCurrentUser(updatedUser);
          setActionStatus(ActionLimitService.getActionStatus(updatedUser, guestId));
        }}
        onStatusUpdated={() => {
          if (currentUser) {
            setActionStatus(ActionLimitService.getActionStatus(currentUser, guestId));
          }
        }}
      />

      {/* Official Digital Tax Invoice & Receipt Modal */}
      <ReceiptModal
        isOpen={isReceiptModalOpen}
        onClose={() => setIsReceiptModalOpen(false)}
        transaction={verifiedReceiptTransaction}
        currentUser={currentUser}
      />

      {/* Multiplayer Share Room Code Modal - elevated z-index */}
      <ShareRoomModal
        isOpen={!!shareRoomModalCode}
        onClose={() => setShareRoomModalCode(null)}
        roomId={shareRoomModalCode || ''}
        hostUsername={roomState?.hostUsername || username}
        isHost={isHost}
      />

      {/* Multiplayer Host / Join Menu Modal - elevated z-index */}
      {showMultiplayerModal && (
        <MainMenu
          onHostGame={handleHostGame}
          onJoinGame={handleJoinGame}
          onCancel={() => {
            setShowMultiplayerModal(null);
            setUrlRoomToJoin('');
          }}
          initialMode={showMultiplayerModal}
          initialRoomId={urlRoomToJoin}
          defaultUsername={getMultiplayerUsername(roomState?.players || [])}
          currentUser={currentUser}
          guestName={guestName}
          guestId={guestId}
          onOpenAuth={(tab) => {
            setPendingMultiplayerAction({ mode: showMultiplayerModal || 'host', roomId: urlRoomToJoin });
            setShowMultiplayerModal(null);
            setAuthModalInitialTab(tab || 'signup');
            setIsAuthModalOpen(true);
          }}
          onOpenMarket={(tab) => {
            setMarketInitialTab(tab || 'packs');
            setIsMarketOpen(true);
          }}
          onOpenActiveGames={() => setIsActiveGamesModalOpen(true)}
        />
      )}

      {/* Multiplayer Character Creation Modal - elevated z-index */}
      {showCharacterCreation && (
        <div
          id="multiplayer-character-creation-modal"
          className="fixed inset-0 flex items-center justify-center bg-black/90 backdrop-blur-sm z-[9999] p-4 overflow-y-auto"
        >
          <div className="bg-neutral-900 border border-neutral-700 p-6 md:p-7 rounded-xl shadow-2xl w-[480px] max-w-full max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-150 my-auto">
            <h2 className="text-xl text-center text-blue-300 mb-3 font-mono font-bold shrink-0">Create Your Character</h2>

            <div className="mb-3 bg-black/60 p-3 rounded-lg border border-neutral-800 text-xs shrink-0">
              <span className="font-bold text-blue-400 block mb-1 text-[11px] uppercase tracking-wider">Adventure Context:</span>
              <div className="max-h-36 overflow-y-auto pr-1.5 text-xs text-neutral-300 italic whitespace-pre-wrap leading-relaxed">
                {roomState?.narrative?.filter((n: any) => n.type === 'user')[0]?.text || 'A new adventure awaits...'}
              </div>
            </div>

            <div className="overflow-y-auto flex-1 pr-1 flex flex-col gap-2.5 my-1">
              <p className="text-xs text-neutral-400">Describe your character's class, appearance, and background.</p>
              <div className="bg-amber-950/40 border border-amber-900/50 p-2.5 rounded text-[11px] text-amber-300/90 leading-tight">
                <strong>Starting Inventory Limit:</strong> Characters can start with at most 2x their hand slots in carried items (e.g. max 4 items for 2 hands). Extra items will be placed in your starting home/camp stash. (During the adventure, you can carry more!)
              </div>
              <textarea
                value={characterDescription}
                onChange={(e) => setCharacterDescription(e.target.value)}
                disabled={isSubmittingCharacter}
                className="w-full h-28 bg-black border border-neutral-700 focus:border-blue-500 rounded p-2.5 text-white font-mono text-xs resize-none focus:outline-none disabled:opacity-50"
                placeholder="e.g., A rogue elf with a mysterious past, armed with dual daggers and swift reflexes..."
              />
            </div>

            {isSubmittingCharacter ? (
              <div className="mt-4 p-3 bg-blue-950/50 border border-blue-800/60 rounded-lg flex items-center justify-center gap-2.5 text-xs text-blue-300 font-mono animate-pulse shrink-0">
                <div className="w-3.5 h-3.5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                <span>Forging character & entering realm...</span>
              </div>
            ) : (
              <div className="flex gap-2 mt-4 shrink-0">
                <button
                  onClick={handleLeaveGame}
                  className="w-1/3 bg-neutral-800 hover:bg-neutral-700 text-gray-300 p-2.5 rounded font-mono text-xs transition-colors cursor-pointer"
                  title="Leave the multiplayer session"
                >
                  Cancel / Leave
                </button>
                <button
                  onClick={async () => {
                    const desc = characterDescription.trim();
                    if (!desc || isSubmittingCharacter) return;
                    setIsSubmittingCharacter(true);
                    try {
                      await multiplayerService?.createCharacter(desc);
                    } catch (err) {
                      console.error("Error creating character:", err);
                      setIsSubmittingCharacter(false);
                    }
                  }}
                  disabled={!characterDescription.trim() || isSubmittingCharacter}
                  className="w-2/3 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white p-2.5 rounded font-mono text-xs font-bold transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  Submit Character
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Expandable Multiplayer Chat with Floating Button & Controls */}
      {gameMode === 'multiplayer' && roomState && (
        <MultiplayerChat
          messages={chatMessages}
          currentUsername={currentUser ? currentUser.username : username}
          currentUser={currentUser}
          hostUsername={roomState.hostUsername}
          players={(roomState.players || []).map((p: any) => ({
            username: p.username,
            status: p.status || 'active',
            role: p.role,
            tier: p.tier,
            characterName: getPlayerCharacterName(p.username)
          }))}
          onSendMessage={handleSendChatMessage}
          onDeleteMessage={handleDeleteChatMessage}
          isOpen={isChatOpen}
          onToggleOpen={() => setIsChatOpen(!isChatOpen)}
        />
      )}

      {/* Active Multiplayer Games Modal */}
      <ActiveMultiplayerGamesModal
        isOpen={isActiveGamesModalOpen}
        onClose={() => {
          setIsActiveGamesModalOpen(false);
          setIsActiveGamesSlotLimitWarning(false);
        }}
        currentUser={currentUser}
        onSelectRoom={(roomId) => {
          setIsActiveGamesModalOpen(false);
          setIsActiveGamesSlotLimitWarning(false);
          handleJoinGame(roomId);
        }}
        onOpenMarket={(tab) => {
          setIsActiveGamesModalOpen(false);
          setIsActiveGamesSlotLimitWarning(false);
          setMarketInitialTab(tab || 'subscriptions');
          setIsMarketOpen(true);
        }}
        slotLimitWarning={isActiveGamesSlotLimitWarning}
      />
    </div>
  );
}

export default App;
