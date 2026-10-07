import {
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  collection,
  query,
  limit,
  orderBy,
  where
} from 'firebase/firestore';
import { db } from './firebase';
import { UserProfile, isDefaultAdmin, enrichUserProfileWithDefaults } from './authService';

export interface ModGrantResult {
  success: boolean;
  error?: string;
  newCredits?: number;
  newInfiniteStatus?: boolean;
}

/**
 * Fetch list of users for Admin/Mod management.
 * Returns up to 50 users, optionally filtered by username/email search query.
 */
export async function searchUsers(searchTerm: string = ''): Promise<UserProfile[]> {
  try {
    const usersCol = collection(db, 'users');
    const snap = await getDocs(query(usersCol, limit(100)));
    const allUsers: UserProfile[] = [];

    snap.forEach((d) => {
      const data = d.data() as UserProfile;
      if (data && data.uid) {
        allUsers.push(enrichUserProfileWithDefaults(data));
      }
    });

    const term = searchTerm.trim().toLowerCase();
    if (!term) return allUsers;

    return allUsers.filter((u) => {
      const uName = (u.username || '').toLowerCase();
      const uEmail = (u.email || '').toLowerCase();
      return uName.includes(term) || uEmail.includes(term);
    });
  } catch (err) {
    console.error('Failed to search users:', err);
    return [];
  }
}

/**
 * Grant permanent free added actions to any user.
 * - Admins can grant any amount.
 * - Mods can grant a maximum of 500 actions per receiving user per day.
 */
export async function grantActionsToUser(
  actor: UserProfile,
  targetUid: string,
  amount: number
): Promise<ModGrantResult> {
  const isAdmin = actor.role === 'admin' || isDefaultAdmin(actor.email, actor.username);
  const isMod = actor.role === 'mod';

  if (!isAdmin && !isMod) {
    return { success: false, error: 'You do not have permission to grant actions.' };
  }

  if (amount <= 0 || !Number.isInteger(amount)) {
    return { success: false, error: 'Please specify a valid positive number of actions.' };
  }

  try {
    const targetRef = doc(db, 'users', targetUid);
    const targetSnap = await getDoc(targetRef);
    if (!targetSnap.exists()) {
      return { success: false, error: 'Target user not found.' };
    }

    const targetData = targetSnap.data() as UserProfile;
    const today = new Date().toISOString().split('T')[0];

    // Mod limit enforcement: max 500 actions per receiving user per day
    if (!isAdmin && isMod) {
      const lastGrantDate = targetData.modActionsGrantedDate || '';
      const alreadyGrantedToday = lastGrantDate === today ? (targetData.modActionsGrantedToday || 0) : 0;
      const remainingAllowedToday = Math.max(0, 500 - alreadyGrantedToday);

      if (amount > remainingAllowedToday) {
        return {
          success: false,
          error: `Moderators can grant at most 500 actions per user per day. (Remaining allowance for this user today: ${remainingAllowedToday} actions)`
        };
      }

      const newModGrantedTotal = alreadyGrantedToday + amount;
      const newCredits = (targetData.actionCredits || 0) + amount;

      await setDoc(targetRef, {
        actionCredits: newCredits,
        modActionsGrantedToday: newModGrantedTotal,
        modActionsGrantedDate: today
      }, { merge: true });

      return { success: true, newCredits };
    }

    // Admin: Can grant any amount with no daily restriction
    const newCredits = (targetData.actionCredits || 0) + amount;
    await setDoc(targetRef, {
      actionCredits: newCredits
    }, { merge: true });

    return { success: true, newCredits };
  } catch (err: any) {
    console.error('Failed to grant actions:', err);
    return { success: false, error: err.message || 'Failed to grant actions.' };
  }
}

/**
 * Grant or revoke Infinite Actions.
 * - Only Admins can grant infinite actions.
 * - Both Admins and Mods can take away/reset infinite actions.
 */
export async function setInfiniteActionsForUser(
  actor: UserProfile,
  targetUid: string,
  enableInfinite: boolean
): Promise<ModGrantResult> {
  const isAdmin = actor.role === 'admin' || isDefaultAdmin(actor.email, actor.username);
  const isMod = actor.role === 'mod';

  if (!isAdmin && !isMod) {
    return { success: false, error: 'Unauthorized.' };
  }

  // Only Admins can grant infinite actions
  if (enableInfinite && !isAdmin) {
    return { success: false, error: 'Only Admins can grant infinite actions.' };
  }

  try {
    const targetRef = doc(db, 'users', targetUid);
    await setDoc(targetRef, {
      hasInfiniteActions: enableInfinite
    }, { merge: true });
    return { success: true, newInfiniteStatus: enableInfinite };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to update infinite actions.' };
  }
}

/**
 * Reset / take away all actions and revoke infinite actions from a user.
 * - Both Admins and Mods can take away/reset actions.
 */
export async function resetUserActions(
  actor: UserProfile,
  targetUid: string
): Promise<ModGrantResult> {
  const isAdmin = actor.role === 'admin' || isDefaultAdmin(actor.email, actor.username);
  const isMod = actor.role === 'mod';

  if (!isAdmin && !isMod) {
    return { success: false, error: 'Unauthorized to reset user actions.' };
  }

  try {
    const targetRef = doc(db, 'users', targetUid);
    await setDoc(targetRef, {
      hasInfiniteActions: false,
      actionCredits: 0,
      dailyActionsUsed: 0
    }, { merge: true });
    return { success: true, newCredits: 0, newInfiniteStatus: false };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to reset actions.' };
  }
}

/**
 * Grant or change a user's role (Admin, Mod, User).
 * - ONLY Admins can grant other users as mods/Admins.
 * - Mods CANNOT grant other users as mods or Admins.
 */
export async function setUserRole(
  actor: UserProfile,
  targetUid: string,
  newRole: 'user' | 'mod' | 'admin'
): Promise<ModGrantResult> {
  const isAdmin = actor.role === 'admin' || isDefaultAdmin(actor.email, actor.username);

  if (!isAdmin) {
    return { success: false, error: 'Only Admins can grant or change user roles.' };
  }

  try {
    const targetRef = doc(db, 'users', targetUid);
    const updates: Partial<UserProfile> = {
      role: newRole
    };
    if (newRole === 'admin') {
      updates.hasInfiniteActions = true;
      updates.canSaveMultipleAdventures = true;
      updates.canPostCommunityAdventures = true;
    }
    if (newRole === 'mod') {
      updates.canSaveMultipleAdventures = true;
      updates.canPostCommunityAdventures = true;
    }

    await setDoc(targetRef, updates, { merge: true });
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to update user role.' };
  }
}

/**
 * Grant permanent access to saving multiple adventures and posting in Community adventures.
 * - Both Admins and Mods can grant these permanent permissions.
 */
export async function grantAdventurePermissions(
  actor: UserProfile,
  targetUid: string,
  perms: {
    canSaveMultipleAdventures?: boolean;
    canPostCommunityAdventures?: boolean;
  }
): Promise<ModGrantResult> {
  const isAdmin = actor.role === 'admin' || isDefaultAdmin(actor.email, actor.username);
  const isMod = actor.role === 'mod';

  if (!isAdmin && !isMod) {
    return { success: false, error: 'Unauthorized to grant adventure permissions.' };
  }

  try {
    const targetRef = doc(db, 'users', targetUid);
    await setDoc(targetRef, perms, { merge: true });
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to update permissions.' };
  }
}

/**
 * Toggle glowing highlighted name setting on own account.
 */
export async function setGlowingNamePreference(
  user: UserProfile,
  enabled: boolean
): Promise<void> {
  try {
    const userRef = doc(db, 'users', user.uid);
    await setDoc(userRef, { showGlowingName: enabled }, { merge: true });
    user.showGlowingName = enabled;
  } catch (err) {
    console.error('Failed to update glowing name preference:', err);
  }
}

export interface PayoutSettings {
  recipientEmail: string;
  recipientName: string;
  venmoHandle?: string;
  cashAppHandle?: string;
  payPalHandle?: string;
  instructions?: string;
  updatedAt?: string;
}

export const DEFAULT_PAYOUT_SETTINGS: PayoutSettings = {
  recipientEmail: 'chloe.a.alba.1@gmail.com',
  recipientName: 'Chloe',
  venmoHandle: 'chloe.a.alba.1@gmail.com',
  cashAppHandle: '$chloealba1',
  payPalHandle: 'chloe.a.alba.1@gmail.com',
  instructions: 'Include your Aifinity account email in the payment note/memo.'
};

/**
 * Fetch payout routing settings. Defaults to Chloe's email and payment handles.
 */
export async function getPayoutSettings(): Promise<PayoutSettings> {
  try {
    const configRef = doc(db, 'config', 'payout_settings');
    const snap = await getDoc(configRef);
    if (snap.exists()) {
      return { ...DEFAULT_PAYOUT_SETTINGS, ...snap.data() as Partial<PayoutSettings> };
    }
  } catch (err) {
    console.warn('Failed to load payout settings from Firestore, using defaults:', err);
  }
  return DEFAULT_PAYOUT_SETTINGS;
}

/**
 * Update payout routing settings in Firestore (restricted to admin Chloe).
 */
export async function updatePayoutSettings(
  actor: UserProfile,
  settings: Partial<PayoutSettings>
): Promise<{ success: boolean; error?: string }> {
  const isAdmin = actor.role === 'admin' || isDefaultAdmin(actor.email, actor.username);
  if (!isAdmin) {
    return { success: false, error: 'Only administrators can update payout destination settings.' };
  }

  try {
    const configRef = doc(db, 'config', 'payout_settings');
    const dataToSave = {
      ...DEFAULT_PAYOUT_SETTINGS,
      ...settings,
      updatedAt: new Date().toISOString()
    };
    await setDoc(configRef, dataToSave, { merge: true });
    return { success: true };
  } catch (err: any) {
    console.error('Failed to update payout settings in Firestore:', err);
    return { success: false, error: err.message || 'Failed to update payout destination settings.' };
  }
}

