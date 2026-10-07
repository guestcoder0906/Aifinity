import { UserProfile, UserTier, UserRole, isDefaultAdmin, updateUserProfile, getUserProfile } from './authService';
import { safeStorage } from './safeStorage';

export interface ActionPack {
  id: string;
  name: string;
  actions: number;
  price: number;
  pricePerTurn?: string;
  badge?: string;
  description: string;
}

export interface SubscriptionTier {
  id: UserTier;
  name: string;
  price: number;
  billingPeriod: string;
  features: string[];
  badge?: string;
  highlight?: boolean;
}

export const ACTION_PACKS: ActionPack[] = [
  {
    id: 'pack_pouch_50',
    name: 'Pouch Pack',
    actions: 50,
    price: 0.99,
    description: 'Quick top-up for a thrilling side quest'
  },
  {
    id: 'pack_bag_100',
    name: 'Bag Pack',
    actions: 100,
    price: 1.99,
    description: 'Great for an extended gaming session'
  },
  {
    id: 'pack_chest_250',
    name: 'Chest Pack',
    actions: 250,
    price: 4.99,
    description: 'Deep world exploration with rich encounters'
  },
  {
    id: 'pack_treasure_500',
    name: 'Treasure Pack',
    actions: 500,
    price: 9.99,
    description: 'Huge supply for serious RPG campaign builders'
  },
  {
    id: 'pack_royal_800',
    name: 'Royal Pack',
    actions: 800,
    price: 14.99,
    badge: 'Best Value 🔥',
    description: 'Maximum power and top tier pack'
  }
];

export const SUBSCRIPTION_TIERS: SubscriptionTier[] = [
  {
    id: 'free',
    name: 'Free Tier',
    price: 0,
    billingPeriod: 'forever',
    features: [
      '20 Free daily actions (+10 Beta bonus = 30 total daily actions!)',
      'Single active adventure save slot',
      'Browse Community Adventures',
      'Standard username styling'
    ]
  },
  {
    id: 'adventurer',
    name: '📜 Adventurer Tier',
    price: 4.99,
    billingPeriod: 'month',
    badge: 'Popular',
    highlight: true,
    features: [
      '20 Free daily actions + 10 Beta bonus + 300 monthly bonus actions',
      'Permanent access to saving multiple adventures in Adventures page',
      'Permanent access to posting adventures in Community Adventures',
      'Choose between Full Story, Starting Prompt, or AI Initial World Generation sharing'
    ]
  },
  {
    id: 'legendary',
    name: '🌌 Legendary Tier',
    price: 9.99,
    billingPeriod: 'month',
    badge: 'Great Value',
    highlight: true,
    features: [
      '20 Free daily actions + 10 Beta bonus + 600 monthly bonus actions',
      '✨ Golden Name in chat, sidebar, multiplayer & community posts',
      'Permanent access to saving multiple adventures in Adventures page',
      'Permanent access to posting in Community Adventures',
      'Priority generation processing'
    ]
  },
  {
    id: 'celestial',
    name: '✨ Celestial Tier',
    price: 14.99,
    billingPeriod: 'month',
    badge: '+1,000 Actions 🔥',
    highlight: true,
    features: [
      '10 Free daily actions + 10 Beta bonus + 1,000 monthly bonus actions',
      '🌌 Celestial Name (glowing cosmic neon styling like Admin)',
      'Permanent access to saving multiple adventures in Adventures page',
      'Permanent access to posting in Community Adventures',
      'Instant VIP priority generation'
    ]
  }
];

export type GamePhase = 'alpha' | 'beta' | 'release';

export interface ActionStatus {
  phase: GamePhase;
  isAlphaPhase: boolean;
  isBetaPhase: boolean;
  tier: UserTier;
  role?: UserRole;
  hasCustomApiKey: boolean;
  isUnlimited: boolean;
  hasInfiniteActions?: boolean;
  canPerformAction: boolean;
  dailyFreeTotal: number;
  dailyFreeUsed: number;
  dailyFreeRemaining: number;
  freeStackedActions: number;
  freeRolloverActions: number;
  maxFreeStack: number;
  purchasedCredits: number;
  totalAvailableActions: number;
  canSaveMultipleAdventures: boolean;
  canPostCommunityAdventures: boolean;
  isGuest: boolean;
  guestActionsTotal: number;
  guestActionsUsed: number;
  guestActionsRemaining: number;
}

export class ActionLimitService {
  /**
   * Current Game Phase:
   * 'beta' (registered accounts receive 30 daily free actions [20 base + 10 beta bonus], guests receive 5 trial actions).
   */
  public static readonly CURRENT_PHASE: GamePhase = 'beta';

  public static getPhase(): GamePhase {
    try {
      const override = safeStorage.getItem('aifinity_game_phase');
      if (override === 'alpha' || override === 'beta' || override === 'release') {
        return override;
      }
    } catch (e) {}
    return this.CURRENT_PHASE;
  }

  // Guests receive a strictly permanent initial trial limit of 5 actions total (in Beta/Release)
  public static readonly GUEST_ACTION_LIMIT = 5;

  // Maximum free actions that can be stacked from daily claims (purchased actions are NEVER limited)
  public static readonly MAX_FREE_STACK = 200;

  // Registered players receive 20 base + 10 beta bonus = 30 free actions every day (in Beta/Release)
  public static readonly BASE_DAILY_FREE = 20;
  public static readonly BETA_DAILY_BONUS = 10;
  public static readonly TOTAL_DAILY_FREE = ActionLimitService.BASE_DAILY_FREE + ActionLimitService.BETA_DAILY_BONUS; // 30

  private static getTodayDateString(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  /**
   * Scope storage key strictly to user account UID or unique guest ID
   * This guarantees accounts and guests never share action counts or subscription states.
   */
  private static getStorageKey(user: UserProfile | null, guestId?: string): string {
    if (user && user.uid) {
      return `aifinity_user_actions_${user.uid}`;
    }
    const safeGuestId = guestId || safeStorage.getItem('aifinity_guest_id') || safeStorage.getItem('aimud_guest_id') || 'guest_default';
    return `aifinity_guest_actions_${safeGuestId}`;
  }

  private static getLocalState(user: UserProfile | null, guestId?: string): {
    tier: UserTier;
    actionCredits: number;
    freeStackedActions: number;
    freeRolloverActions: number;
    dailyActionsUsed: number;
    dailyActionsDate: string;
  } {
    // Clear any obsolete shared legacy state that caused cross-user contamination
    try {
      safeStorage.removeItem('aifinity_action_state');
    } catch (e) {}

    const today = this.getTodayDateString();
    const key = this.getStorageKey(user, guestId);

    try {
      const raw = safeStorage.getItem(key);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          // If this is a guest: DO NOT RESET ACTIONS ON DATE CHANGE.
          // Guest limit of 5 actions is permanently saved for each guest.
          if (!user) {
            const guestUsed = typeof parsed.dailyActionsUsed === 'number' ? parsed.dailyActionsUsed : 0;
            return {
              tier: 'free',
              actionCredits: 0,
              freeStackedActions: 0,
              freeRolloverActions: 0,
              dailyActionsUsed: guestUsed,
              dailyActionsDate: parsed.dailyActionsDate || today
            };
          }

          const isCel = parsed.tier === 'celestial';
          const quota = isCel ? 20 : ActionLimitService.TOTAL_DAILY_FREE;

          // Registered accounts: stack unused free actions when date changes (capped at MAX_FREE_STACK = 200)!
          if (parsed.dailyActionsDate !== today) {
            const unusedFromPrev = Math.max(0, quota - (parsed.dailyActionsUsed || 0));
            const prevRollover = typeof parsed.freeRolloverActions === 'number'
              ? parsed.freeRolloverActions
              : (typeof parsed.freeStackedActions === 'number' ? parsed.freeStackedActions : 0);
            const maxRollover = Math.max(0, ActionLimitService.MAX_FREE_STACK - quota);
            parsed.freeRolloverActions = Math.min(maxRollover, prevRollover + unusedFromPrev);
            parsed.freeStackedActions = Math.min(ActionLimitService.MAX_FREE_STACK, quota + parsed.freeRolloverActions);
            parsed.dailyActionsDate = today;
            parsed.dailyActionsUsed = 0;
            safeStorage.setItem(key, JSON.stringify(parsed));
          }

          const freeRolloverActions = typeof parsed.freeRolloverActions === 'number'
            ? parsed.freeRolloverActions
            : 0;

          const dailyRemaining = Math.max(0, quota - (parsed.dailyActionsUsed || 0));
          const freeStackedActions = Math.min(
            ActionLimitService.MAX_FREE_STACK,
            dailyRemaining + freeRolloverActions
          );

          return {
            tier: (parsed.tier === 'adventurer' || parsed.tier === 'legendary' || parsed.tier === 'celestial') ? parsed.tier : 'free',
            actionCredits: typeof parsed.actionCredits === 'number' ? parsed.actionCredits : 0,
            freeStackedActions,
            freeRolloverActions,
            dailyActionsUsed: typeof parsed.dailyActionsUsed === 'number' ? parsed.dailyActionsUsed : 0,
            dailyActionsDate: parsed.dailyActionsDate || today
          };
        }
      }
    } catch (e) {}

    const defaultState = {
      tier: 'free' as UserTier,
      actionCredits: 0,
      freeStackedActions: ActionLimitService.TOTAL_DAILY_FREE,
      freeRolloverActions: 0,
      dailyActionsUsed: 0,
      dailyActionsDate: today
    };
    try {
      safeStorage.setItem(key, JSON.stringify(defaultState));
    } catch (e) {}
    return defaultState;
  }

  private static saveLocalState(
    user: UserProfile | null,
    guestId: string | undefined,
    state: {
      tier: UserTier;
      actionCredits: number;
      freeStackedActions?: number;
      freeRolloverActions?: number;
      dailyActionsUsed: number;
      dailyActionsDate: string;
    }
  ) {
    const key = this.getStorageKey(user, guestId);
    try {
      safeStorage.setItem(key, JSON.stringify(state));
    } catch (e) {}
  }

  /**
   * Check whether user has entered their own Gemini API key
   */
  public static hasCustomApiKey(): boolean {
    const key = safeStorage.getItem('aimud_apikey');
    return !!(key && key.trim().length > 10);
  }

  /**
   * Get the current real-time action status scoped to this account or guest
   */
  public static getActionStatus(user: UserProfile | null, guestId?: string): ActionStatus {
    const today = this.getTodayDateString();
    const hasCustomKey = this.hasCustomApiKey();
    const local = this.getLocalState(user, guestId);
    const phase = this.getPhase();
    const isAlpha = phase === 'alpha';
    const isBeta = phase === 'beta';

    // If user is a guest:
    // In Alpha phase: unlimited actions!
    // In Beta/Release phase: strict permanent 5 action trial
    if (!user) {
      const guestUsed = typeof local.dailyActionsUsed === 'number' ? local.dailyActionsUsed : 0;
      const guestLimit = this.GUEST_ACTION_LIMIT; // 5 in beta/release
      const isUnlimited = isAlpha || hasCustomKey;
      const guestRemaining = isAlpha ? 999999 : Math.max(0, guestLimit - guestUsed);
      const totalAvailable = isUnlimited ? 999999 : guestRemaining;
      const canPerformAction = isUnlimited || totalAvailable > 0;

      return {
        phase,
        isAlphaPhase: isAlpha,
        isBetaPhase: isBeta,
        tier: 'free',
        hasCustomApiKey: hasCustomKey,
        isUnlimited,
        canPerformAction,
        dailyFreeTotal: isAlpha ? 999999 : guestLimit,
        dailyFreeUsed: guestUsed,
        dailyFreeRemaining: guestRemaining,
        freeStackedActions: 0,
        maxFreeStack: this.MAX_FREE_STACK,
        purchasedCredits: 0,
        totalAvailableActions: totalAvailable,
        canSaveMultipleAdventures: false,
        canPostCommunityAdventures: false,
        isGuest: true,
        guestActionsTotal: guestLimit,
        guestActionsUsed: guestUsed,
        guestActionsRemaining: guestRemaining
      };
    }

    // Authenticated user: profile in Firestore and local state are unified
    let tier: UserTier = 'free';
    if (user.tier === 'adventurer' || user.tier === 'legendary' || user.tier === 'celestial') {
      // Check subscription expiry if present
      if (user.subscriptionExpiresAt) {
        const expires = new Date(user.subscriptionExpiresAt).getTime();
        if (expires > Date.now()) {
          tier = user.tier;
        }
      } else {
        tier = user.tier;
      }
    } else if (local.tier === 'adventurer' || local.tier === 'legendary' || local.tier === 'celestial') {
      tier = local.tier;
    }

    const purchasedCredits = Math.max(
      typeof user.actionCredits === 'number' ? user.actionCredits : 0,
      typeof local.actionCredits === 'number' ? local.actionCredits : 0
    );

    // Reset daily if date changed
    let dailyUsed = 0;
    if (user.dailyActionsDate === today && typeof user.dailyActionsUsed === 'number') {
      dailyUsed = user.dailyActionsUsed;
    } else if (local.dailyActionsDate === today && typeof local.dailyActionsUsed === 'number') {
      dailyUsed = local.dailyActionsUsed;
    }

    const isAdmin = user.role === 'admin' || isDefaultAdmin(user.email, user.username);
    const isMod = user.role === 'mod';
    const hasInfinite = Boolean(user.hasInfiniteActions || isAdmin);

    const isCelestial = tier === 'celestial';
    const tierBaseDaily = isCelestial ? 10 : this.BASE_DAILY_FREE; // 10 for celestial, 20 for others
    const tierBetaBonus = this.BETA_DAILY_BONUS; // 10
    const tierTotalDaily = tierBaseDaily + tierBetaBonus; // 20 for celestial, 30 for others

    const dailyFreeTotal = isBeta ? tierTotalDaily : (isAlpha ? 999999 : tierBaseDaily);
    const dailyFreeRemaining = isAlpha ? 999999 : Math.max(0, dailyFreeTotal - dailyUsed);

    const freeRolloverActions = Math.min(
      Math.max(0, this.MAX_FREE_STACK - dailyFreeTotal),
      Math.max(
        typeof user.freeRolloverActions === 'number' ? user.freeRolloverActions : 0,
        typeof local.freeRolloverActions === 'number' ? local.freeRolloverActions : 0
      )
    );

    // Total free actions in stack: (Today's remaining daily free actions + rollover from previous days, capped at MAX_FREE_STACK = 200)
    const freeStackedActions = isAlpha ? 999999 : Math.min(this.MAX_FREE_STACK, dailyFreeRemaining + freeRolloverActions);

    const isUnlimited = isAlpha || hasCustomKey || hasInfinite;
    const totalAvailable = isUnlimited ? 999999 : (freeStackedActions + purchasedCredits);
    const canPerformAction = isUnlimited || totalAvailable > 0;

    const canSaveMultiple = Boolean(user.canSaveMultipleAdventures || isAdmin || isMod || tier === 'adventurer' || tier === 'legendary' || tier === 'celestial');
    const canPostCommunity = Boolean(user.canPostCommunityAdventures || isAdmin || isMod || tier === 'adventurer' || tier === 'legendary' || tier === 'celestial');

    return {
      phase,
      isAlphaPhase: isAlpha,
      isBetaPhase: isBeta,
      tier,
      role: isAdmin ? 'admin' : isMod ? 'mod' : (user.role || 'user'),
      hasCustomApiKey: hasCustomKey,
      isUnlimited,
      hasInfiniteActions: hasInfinite,
      canPerformAction,
      dailyFreeTotal,
      dailyFreeUsed: dailyUsed,
      dailyFreeRemaining,
      freeStackedActions,
      freeRolloverActions,
      maxFreeStack: this.MAX_FREE_STACK,
      purchasedCredits,
      totalAvailableActions: totalAvailable,
      canSaveMultipleAdventures: canSaveMultiple,
      canPostCommunityAdventures: canPostCommunity,
      isGuest: false,
      guestActionsTotal: this.GUEST_ACTION_LIMIT,
      guestActionsUsed: 0,
      guestActionsRemaining: 0
    };
  }

  /**
   * Consumes one action turn. Returns whether action was allowed.
   */
  public static async consumeAction(user: UserProfile | null, guestId?: string): Promise<{
    allowed: boolean;
    remaining: number;
    usedCredit: boolean;
    reason?: 'limit_reached';
  }> {
    const phase = this.getPhase();
    const status = this.getActionStatus(user, guestId);

    // During Alpha phase or if player has unlimited actions: grant unlimited free play without consuming limits
    if (phase === 'alpha' || status.isUnlimited) {
      return { allowed: true, remaining: Infinity, usedCredit: false };
    }

    if (!status.canPerformAction) {
      return { allowed: false, remaining: 0, usedCredit: false, reason: 'limit_reached' };
    }

    const today = this.getTodayDateString();

    // Guest action consumption (permanent lifetime trial of 3 actions)
    if (!user) {
      const currentGuestUsed = status.guestActionsUsed;
      if (currentGuestUsed >= this.GUEST_ACTION_LIMIT) {
        return { allowed: false, remaining: 0, usedCredit: false, reason: 'limit_reached' };
      }
      const newGuestUsed = currentGuestUsed + 1;
      this.saveLocalState(null, guestId, {
        tier: 'free',
        actionCredits: 0,
        dailyActionsUsed: newGuestUsed,
        dailyActionsDate: today
      });
      const remaining = Math.max(0, this.GUEST_ACTION_LIMIT - newGuestUsed);
      return {
        allowed: true,
        remaining,
        usedCredit: false
      };
    }

    // Registered player action consumption:
    // Priority:
    // 1. Daily free actions
    // 2. Free rollover actions (up to 200 max free stack)
    // 3. Purchased credits (unlimited, never capped)
    let newDailyUsed = status.dailyFreeUsed;
    let newFreeRollover = status.freeRolloverActions;
    let newCredits = status.purchasedCredits;
    let usedCredit = false;

    if (status.dailyFreeRemaining > 0) {
      newDailyUsed += 1;
    } else if (newFreeRollover > 0) {
      newFreeRollover -= 1;
    } else if (newCredits > 0) {
      newCredits -= 1;
      usedCredit = true;
    } else {
      return { allowed: false, remaining: 0, usedCredit: false, reason: 'limit_reached' };
    }

    const remainingDaily = Math.max(0, status.dailyFreeTotal - newDailyUsed);
    const newFreeStacked = Math.min(this.MAX_FREE_STACK, remainingDaily + newFreeRollover);

    // Save state strictly scoped to this user
    this.saveLocalState(user, guestId, {
      tier: status.tier,
      actionCredits: newCredits,
      freeRolloverActions: newFreeRollover,
      freeStackedActions: newFreeStacked,
      dailyActionsUsed: newDailyUsed,
      dailyActionsDate: today
    });

    // If logged in, update Firestore profile and memory asynchronously without blocking gameplay
    if (user?.uid) {
      user.dailyActionsUsed = newDailyUsed;
      user.dailyActionsDate = today;
      user.freeRolloverActions = newFreeRollover;
      user.freeStackedActions = newFreeStacked;
      user.actionCredits = newCredits;
      // Fire-and-forget sync to Firestore with timeout so account actions never get stuck
      Promise.race([
        updateUserProfile(user.uid, {
          dailyActionsUsed: newDailyUsed,
          dailyActionsDate: today,
          freeRolloverActions: newFreeRollover,
          freeStackedActions: newFreeStacked,
          actionCredits: newCredits
        }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Profile sync timeout')), 2500))
      ]).catch(profileErr => {
        console.warn("Could not sync action count to Firestore:", profileErr);
      });
    }

    const remainingTotal = newFreeStacked + newCredits;

    return {
      allowed: true,
      remaining: remainingTotal,
      usedCredit
    };
  }

  /**
   * Checks if user has logged in / opened the game on a new day.
   * If on a new day:
   * 1. Stacks any unused actions from the previous day into actionCredits.
   * 2. Resets today's dailyActionsUsed to 0.
   * 3. Sets dailyActionsDate and lastDailyClaimDate to today.
   * 4. Updates profile in Firestore & local state.
   * 5. Returns claim details so UI can trigger "Claimed free daily actions (+50 actions!)" notification.
   */
  public static async checkAndClaimDailyActions(
    user: UserProfile | null,
    guestId?: string
  ): Promise<{
    claimed: boolean;
    amount: number;
    stackedFromPrevious: number;
    totalStacked: number;
    totalAvailable: number;
    updatedUser?: UserProfile;
  }> {
    if (!user || !user.uid) {
      return { claimed: false, amount: 0, stackedFromPrevious: 0, totalStacked: 0, totalAvailable: 0 };
    }

    const today = this.getTodayDateString();
    let local = this.getLocalState(user, guestId);

    // Check if user has already claimed today
    const userClaimDate = user.lastDailyClaimDate;
    let localClaimDate: string | null = null;
    try {
      localClaimDate = safeStorage.getItem(`aifinity_daily_claim_${user.uid}`);
    } catch (e) {}

    const alreadyClaimed = userClaimDate === today || localClaimDate === today;
    if (alreadyClaimed) {
      const currentStatus = this.getActionStatus(user, guestId);
      return {
        claimed: false,
        amount: 0,
        stackedFromPrevious: 0,
        totalStacked: currentStatus.freeStackedActions,
        totalAvailable: currentStatus.totalAvailableActions
      };
    }

    // New day claim!
    const tier = (user.tier === 'celestial' || local.tier === 'celestial') ? 'celestial' : (user.tier || local.tier || 'free');
    const isCelestial = tier === 'celestial';
    const isBeta = this.getPhase() === 'beta';
    const baseDaily = isCelestial ? 10 : this.BASE_DAILY_FREE; // 10 for celestial, 20 for others
    const betaBonus = this.BETA_DAILY_BONUS; // 10
    const todayFreeGrant = isBeta ? (baseDaily + betaBonus) : baseDaily; // 30 (or 20 for celestial)

    // Calculate unused daily actions from the previous day to stack into rollover
    let stackedFromPrevious = 0;
    const currentRollover = typeof user.freeRolloverActions === 'number'
      ? user.freeRolloverActions
      : (typeof local.freeRolloverActions === 'number' ? local.freeRolloverActions : 0);

    const prevDate = user.dailyActionsDate || local.dailyActionsDate;
    if (prevDate && prevDate !== today) {
      const prevQuota = isCelestial ? 20 : ActionLimitService.TOTAL_DAILY_FREE;
      const prevUsed = typeof user.dailyActionsUsed === 'number' ? user.dailyActionsUsed : (local.dailyActionsUsed || 0);
      const rawUnused = Math.max(0, prevQuota - prevUsed);
      const maxRollover = Math.max(0, ActionLimitService.MAX_FREE_STACK - todayFreeGrant);
      const spaceInRollover = Math.max(0, maxRollover - currentRollover);
      stackedFromPrevious = Math.min(spaceInRollover, rawUnused);
    }

    const maxRollover = Math.max(0, ActionLimitService.MAX_FREE_STACK - todayFreeGrant);
    const newRollover = Math.min(maxRollover, currentRollover + stackedFromPrevious);
    const newFreeStacked = Math.min(ActionLimitService.MAX_FREE_STACK, todayFreeGrant + newRollover);

    // Purchased credits remain untouched by free daily claims!
    const existingPurchasedCredits = Math.max(
      typeof user.actionCredits === 'number' ? user.actionCredits : 0,
      typeof local.actionCredits === 'number' ? local.actionCredits : 0
    );

    // Update in-memory user
    user.freeRolloverActions = newRollover;
    user.freeStackedActions = newFreeStacked;
    user.actionCredits = existingPurchasedCredits;
    user.dailyActionsUsed = 0;
    user.dailyActionsDate = today;
    user.lastDailyClaimDate = today;

    // Save local state
    this.saveLocalState(user, guestId, {
      tier,
      actionCredits: existingPurchasedCredits,
      freeRolloverActions: newRollover,
      freeStackedActions: newFreeStacked,
      dailyActionsUsed: 0,
      dailyActionsDate: today
    });
    try {
      safeStorage.setItem(`aifinity_daily_claim_${user.uid}`, today);
    } catch (e) {}

    // Persist to Firestore
    try {
      await updateUserProfile(user.uid, {
        freeRolloverActions: newRollover,
        freeStackedActions: newFreeStacked,
        actionCredits: existingPurchasedCredits,
        dailyActionsUsed: 0,
        dailyActionsDate: today,
        lastDailyClaimDate: today
      });
    } catch (err) {
      console.warn("Could not sync daily action claim to Firestore:", err);
    }

    const currentStatus = this.getActionStatus(user, guestId);

    return {
      claimed: true,
      amount: todayFreeGrant,
      stackedFromPrevious,
      totalStacked: newFreeStacked,
      totalAvailable: currentStatus.totalAvailableActions,
      updatedUser: user
    };
  }

  /**
   * Grants purchased action credits (e.g. after Google Pay / Card checkout)
   * Guests cannot buy credits; user must be logged in.
   */
  public static async addPurchasedCredits(
    user: UserProfile | null,
    amount: number,
    guestId?: string,
    txId?: string
  ): Promise<UserProfile> {
    if (!user || !user.uid) {
      throw new Error('Guests cannot buy action packs. Please log in or sign up first.');
    }

    const existingCredited = new Set<string>(user.creditedActionTxIds || []);
    if (txId) {
      const safeId = String(txId).replace(/[^a-zA-Z0-9_-]/g, '_');
      if (existingCredited.has(txId) || existingCredited.has(safeId)) {
        return user; // Already credited, avoid duplicate addition!
      }
      existingCredited.add(txId);
      existingCredited.add(safeId);
    }

    const status = this.getActionStatus(user, guestId);
    const newCredits = status.purchasedCredits + amount;
    const today = this.getTodayDateString();

    user.actionCredits = newCredits;
    user.creditedActionTxIds = Array.from(existingCredited);

    this.saveLocalState(user, guestId, {
      tier: status.tier,
      actionCredits: newCredits,
      dailyActionsUsed: status.dailyFreeUsed,
      dailyActionsDate: today
    });

    await updateUserProfile(user.uid, {
      actionCredits: newCredits,
      creditedActionTxIds: Array.from(existingCredited)
    });

    return user;
  }

  /**
   * Helper to credit action packs by UID directly (e.g. from Stripe redirect)
   */
  public static async addPurchasedCreditsByUid(
    uid: string,
    amount: number,
    txId?: string
  ): Promise<UserProfile | null> {
    let profile = await getUserProfile(uid, true);
    if (!profile) {
      profile = {
        uid,
        email: null,
        username: 'Player',
        role: 'user',
        tier: 'free',
        actionCredits: 0,
        authProvider: 'password',
        createdAt: new Date().toISOString()
      } as UserProfile;
    }
    const updated = await this.addPurchasedCredits(profile, amount, undefined, txId);
    return updated;
  }

  /**
   * Activates monthly subscription (Adventurer, Legendary, or Celestial)
   * Guests cannot buy subscriptions; user must be logged in.
   */
  public static async activateSubscription(
    user: UserProfile | null,
    tier: UserTier,
    guestId?: string,
    subscriptionDetails?: {
      subscriptionId?: string;
      customerId?: string;
      periodEnd?: string;
      status?: string;
      cancelAtPeriodEnd?: boolean;
    }
  ): Promise<UserProfile> {
    if (!user || !user.uid) {
      throw new Error('Guests cannot buy subscriptions. Please log in or sign up first.');
    }

    const status = this.getActionStatus(user, guestId);
    const today = this.getTodayDateString();

    // Bonus actions per tier: Adventurer = 300, Legendary = 600, Celestial = unlimited actions (+1000 buffer)
    let bonusActions = 0;
    if (tier === 'adventurer') {
      bonusActions = 300;
    } else if (tier === 'legendary') {
      bonusActions = 600;
    } else if (tier === 'celestial') {
      bonusActions = 1000;
    }
    const currentCredits = typeof user.actionCredits === 'number' ? user.actionCredits : status.purchasedCredits;
    const newCredits = currentCredits + bonusActions;

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);
    const expiresStr = subscriptionDetails?.periodEnd || expiresAt.toISOString();

    user.tier = tier;
    user.actionCredits = newCredits;
    user.subscriptionExpiresAt = expiresStr;
    user.stripeSubscriptionId = subscriptionDetails?.subscriptionId || user.stripeSubscriptionId || null;
    user.stripeCustomerId = subscriptionDetails?.customerId || user.stripeCustomerId || null;
    user.subscriptionStatus = (subscriptionDetails?.status as any) || 'active';
    user.subscriptionPeriodEnd = expiresStr;
    user.subscriptionCancelAtPeriodEnd = subscriptionDetails?.cancelAtPeriodEnd || false;
    user.canSaveMultipleAdventures = true;
    user.canPostCommunityAdventures = true;
    if (tier === 'legendary' || tier === 'celestial') {
      if (user.showGlowingName === undefined) {
        user.showGlowingName = true;
      }
    }

    this.saveLocalState(user, guestId, {
      tier,
      actionCredits: newCredits,
      dailyActionsUsed: status.dailyFreeUsed,
      dailyActionsDate: today
    });

    await updateUserProfile(user.uid, {
      tier,
      actionCredits: newCredits,
      subscriptionExpiresAt: expiresStr,
      stripeSubscriptionId: user.stripeSubscriptionId,
      stripeCustomerId: user.stripeCustomerId,
      subscriptionStatus: 'active',
      subscriptionPeriodEnd: expiresStr,
      subscriptionCancelAtPeriodEnd: user.subscriptionCancelAtPeriodEnd,
      canSaveMultipleAdventures: true,
      canPostCommunityAdventures: true,
      ...(tier === 'legendary' || tier === 'celestial' ? { showGlowingName: true } : {})
    });

    return user;
  }

  /**
   * Atomically applies both action packs and subscription tier upgrades to a user's account
   * ensuring that action packs are never overwritten by subscriptions and vice versa.
   */
  public static async applyRestoredPurchases(
    user: UserProfile | null,
    addedCredits: number,
    newTier: UserTier | null,
    guestId?: string,
    minActionCreditsFloor?: number,
    newTxIdsToCredit?: string[]
  ): Promise<UserProfile> {
    if (!user || !user.uid) {
      throw new Error('User must be logged in to restore purchases.');
    }

    const existingCredited = new Set<string>(user.creditedActionTxIds || []);
    if (Array.isArray(user.appliedTransactionIds)) {
      user.appliedTransactionIds.forEach((id) => {
        existingCredited.add(id);
        existingCredited.add(String(id).replace(/[^a-zA-Z0-9_-]/g, '_'));
      });
    }
    try {
      const rawCred = safeStorage.getItem(`aifinity_credited_txs_${user.uid}`);
      if (rawCred) {
        const parsed = JSON.parse(rawCred);
        if (Array.isArray(parsed)) {
          parsed.forEach((id: string) => {
            existingCredited.add(id);
            existingCredited.add(String(id).replace(/[^a-zA-Z0-9_-]/g, '_'));
          });
        }
      }
    } catch (e) {}

    let filteredAddedCredits = addedCredits;

    // Deduplicate against already credited transaction IDs
    if (newTxIdsToCredit !== undefined) {
      if (newTxIdsToCredit.length === 0) {
        filteredAddedCredits = 0;
      } else {
        const trulyNewTxIds: string[] = [];
        for (const id of newTxIdsToCredit) {
          const safeId = String(id).replace(/[^a-zA-Z0-9_-]/g, '_');
          if (!existingCredited.has(id) && !existingCredited.has(safeId)) {
            trulyNewTxIds.push(id);
            trulyNewTxIds.push(safeId);
            existingCredited.add(id);
            existingCredited.add(safeId);
          }
        }

        // If none of the passed transaction IDs are genuinely new, do not add more actions
        if (trulyNewTxIds.length === 0) {
          filteredAddedCredits = 0;
        }
      }
    }

    const status = this.getActionStatus(user, guestId);
    const today = this.getTodayDateString();

    const tierRank: Record<string, number> = {
      free: 0,
      adventurer: 1,
      legendary: 2,
      celestial: 3
    };

    let resolvedTier: UserTier = user.tier || status.tier || 'free';
    if (newTier && (tierRank[newTier] || 0) > (tierRank[resolvedTier] || 0)) {
      resolvedTier = newTier;
    }

    let expiresStr = user.subscriptionExpiresAt;
    if (newTier && (!expiresStr || new Date(expiresStr).getTime() < Date.now())) {
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 30);
      expiresStr = expiresAt.toISOString();
    }

    const currentCredits = typeof user.actionCredits === 'number' ? user.actionCredits : status.purchasedCredits;
    // Total credits = existing credits + truly new verified action pack credits
    // Subscription bonus actions are granted once on initial checkout purchase, NEVER re-added repeatedly on login/restore!
    let finalCredits = currentCredits + filteredAddedCredits;

    // If a minimum floor of total purchased credits was provided, ensure credits never drop below it
    if (typeof minActionCreditsFloor === 'number' && finalCredits < minActionCreditsFloor) {
      finalCredits = minActionCreditsFloor;
    }

    user.tier = resolvedTier;
    user.actionCredits = finalCredits;
    user.subscriptionExpiresAt = expiresStr;
    user.canSaveMultipleAdventures = true;
    user.canPostCommunityAdventures = true;
    user.creditedActionTxIds = Array.from(existingCredited);
    if (resolvedTier === 'legendary' || resolvedTier === 'celestial' || isDefaultAdmin(user.email, user.username)) {
      user.showGlowingName = true;
    }

    try {
      safeStorage.setItem(`aifinity_credited_txs_${user.uid}`, JSON.stringify(Array.from(existingCredited).slice(-200)));
    } catch (e) {}

    this.saveLocalState(user, guestId, {
      tier: resolvedTier,
      actionCredits: finalCredits,
      dailyActionsUsed: status.dailyFreeUsed,
      dailyActionsDate: today
    });

    await updateUserProfile(user.uid, {
      tier: resolvedTier,
      actionCredits: finalCredits,
      subscriptionExpiresAt: expiresStr || null as any,
      creditedActionTxIds: Array.from(existingCredited),
      canSaveMultipleAdventures: true,
      canPostCommunityAdventures: true,
      ...(resolvedTier === 'legendary' || resolvedTier === 'celestial' ? { showGlowingName: true } : {})
    });

    return user;
  }

  /**
   * Helper to activate subscription by UID directly (e.g. from Stripe redirect)
   */
  public static async activateSubscriptionByUid(
    uid: string,
    tier: UserTier
  ): Promise<UserProfile | null> {
    let profile = await getUserProfile(uid, true);
    if (!profile) {
      profile = {
        uid,
        email: null,
        username: 'Player',
        role: 'user',
        tier: 'free',
        actionCredits: 0,
        authProvider: 'password',
        createdAt: new Date().toISOString()
      } as UserProfile;
    }
    const updated = await this.activateSubscription(profile, tier);
    return updated;
  }

  /**
   * Cancels user's active subscription and reverts to 'free' tier
   */
  public static async cancelSubscription(
    user: UserProfile | null,
    guestId?: string
  ): Promise<UserProfile> {
    if (!user || !user.uid) {
      throw new Error('Must be logged in to cancel subscription.');
    }

    const today = this.getTodayDateString();
    const status = this.getActionStatus(user, guestId);
    const isAdminOrMod = user.role === 'admin' || user.role === 'mod' || isDefaultAdmin(user.email, user.username);

    user.tier = 'free';
    user.subscriptionExpiresAt = undefined;
    user.stripeSubscriptionId = null;
    user.subscriptionStatus = 'canceled';
    user.subscriptionPeriodEnd = null;
    if (!isAdminOrMod) {
      user.canSaveMultipleAdventures = false;
      user.canPostCommunityAdventures = false;
      user.showGlowingName = false;
    }

    this.saveLocalState(user, guestId, {
      tier: 'free',
      actionCredits: user.actionCredits || 0,
      dailyActionsUsed: status.dailyFreeUsed,
      dailyActionsDate: today
    });

    await updateUserProfile(user.uid, {
      tier: 'free',
      subscriptionExpiresAt: null as any,
      stripeSubscriptionId: null as any,
      subscriptionStatus: 'canceled',
      subscriptionPeriodEnd: null as any,
      ...(!isAdminOrMod ? {
        canSaveMultipleAdventures: false,
        canPostCommunityAdventures: false,
        showGlowingName: false
      } : {})
    });

    return user;
  }

  /**
   * Automatically synchronizes user profile with real-time Stripe subscription status
   * Attaches subscription strictly to this account, auto-updating active tiers without breaking single-payment upgrades
   */
  public static async syncSubscriptionState(
    user: UserProfile | null,
    activeSub: {
      id: string;
      tierId: UserTier;
      status: string;
      periodEnd: string;
      cancelAtPeriodEnd?: boolean;
      customerId?: string;
    } | null,
    guestId?: string
  ): Promise<UserProfile> {
    if (!user || !user.uid) return user as any;

    const isAdminOrMod = user.role === 'admin' || user.role === 'mod' || isDefaultAdmin(user.email, user.username);
    const today = this.getTodayDateString();
    const status = this.getActionStatus(user, guestId);

    if (activeSub && (activeSub.status === 'active' || activeSub.status === 'trialing')) {
      user.tier = activeSub.tierId;
      user.stripeSubscriptionId = activeSub.id;
      user.stripeCustomerId = activeSub.customerId || user.stripeCustomerId || null;
      user.subscriptionStatus = 'active';
      user.subscriptionExpiresAt = activeSub.periodEnd;
      user.subscriptionPeriodEnd = activeSub.periodEnd;
      user.subscriptionCancelAtPeriodEnd = activeSub.cancelAtPeriodEnd || false;
      user.canSaveMultipleAdventures = true;
      user.canPostCommunityAdventures = true;
      if (activeSub.tierId === 'legendary' || activeSub.tierId === 'celestial' || isAdminOrMod) {
        user.showGlowingName = true;
      }

      this.saveLocalState(user, guestId, {
        tier: activeSub.tierId,
        actionCredits: user.actionCredits || 0,
        dailyActionsUsed: status.dailyFreeUsed,
        dailyActionsDate: today
      });

      await updateUserProfile(user.uid, {
        tier: activeSub.tierId,
        stripeSubscriptionId: activeSub.id,
        stripeCustomerId: user.stripeCustomerId,
        subscriptionStatus: 'active',
        subscriptionExpiresAt: activeSub.periodEnd,
        subscriptionPeriodEnd: activeSub.periodEnd,
        subscriptionCancelAtPeriodEnd: activeSub.cancelAtPeriodEnd || false,
        canSaveMultipleAdventures: true,
        canPostCommunityAdventures: true,
        ...(activeSub.tierId === 'legendary' || activeSub.tierId === 'celestial' || isAdminOrMod ? { showGlowingName: true } : {})
      });
    } else if (
      !activeSub &&
      !isAdminOrMod &&
      (user.subscriptionStatus === 'canceled' || (user.subscriptionExpiresAt && new Date(user.subscriptionExpiresAt).getTime() < Date.now()))
    ) {
      // ONLY downgrade to Free if the subscription was canceled or the paid period end has elapsed.
      // Never downgrade active users if paid period is still valid or Stripe returns null/unavailable.
      user.tier = 'free';
      user.subscriptionStatus = 'canceled';
      user.subscriptionExpiresAt = undefined;
      user.stripeSubscriptionId = null;
      user.subscriptionPeriodEnd = null;
      user.canSaveMultipleAdventures = false;
      user.canPostCommunityAdventures = false;
      user.showGlowingName = false;

      this.saveLocalState(user, guestId, {
        tier: 'free',
        actionCredits: user.actionCredits || 0,
        dailyActionsUsed: status.dailyFreeUsed,
        dailyActionsDate: today
      });

      await updateUserProfile(user.uid, {
        tier: 'free',
        subscriptionStatus: 'canceled',
        subscriptionExpiresAt: null as any,
        stripeSubscriptionId: null as any,
        subscriptionPeriodEnd: null as any,
        canSaveMultipleAdventures: false,
        canPostCommunityAdventures: false,
        showGlowingName: false
      });
    }

    return user;
  }
}

export default ActionLimitService;
