import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  signOut as fbSignOut,
  onAuthStateChanged,
  User as FirebaseUser
} from 'firebase/auth';
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  arrayUnion,
  deleteDoc,
  collection,
  query,
  where,
  getDocs
} from 'firebase/firestore';
import { auth, googleProvider, db } from './firebase';

export type UserTier = 'free' | 'adventurer' | 'legendary' | 'celestial';
export type UserRole = 'user' | 'mod' | 'admin';

export interface UserProfile {
  uid: string;
  email: string | null;
  username: string;
  authProvider: 'password' | 'google';
  createdAt: string;
  tier?: UserTier;
  role?: UserRole;
  showGlowingName?: boolean;
  hasInfiniteActions?: boolean;
  canSaveMultipleAdventures?: boolean;
  canPostCommunityAdventures?: boolean;
  actionCredits?: number;
  freeStackedActions?: number;
  freeRolloverActions?: number;
  dailyActionsUsed?: number;
  dailyActionsDate?: string;
  lastDailyClaimDate?: string;
  subscriptionExpiresAt?: string | null;
  stripeSubscriptionId?: string | null;
  stripeCustomerId?: string | null;
  subscriptionStatus?: 'active' | 'canceled' | 'past_due' | 'unpaid' | 'none';
  subscriptionPeriodEnd?: string | null;
  subscriptionCancelAtPeriodEnd?: boolean;
  modActionsGrantedToday?: number;
  modActionsGrantedDate?: string;
  appliedTransactionIds?: string[];
  creditedActionTxIds?: string[];
}

/**
 * Checks if user is default Admin (Chloe: chloe.a.alba.1@gmail.com or username Chloe)
 */
export function isDefaultAdmin(email?: string | null, username?: string | null): boolean {
  if (email && email.trim().toLowerCase() === 'chloe.a.alba.1@gmail.com') return true;
  if (username && username.trim().toLowerCase() === 'chloe') return true;
  return false;
}

/**
 * Ensures defaults for roles, celestial glowing names, and admin infinite actions
 */
export function enrichUserProfileWithDefaults(profile: UserProfile): UserProfile {
  if (isDefaultAdmin(profile.email, profile.username)) {
    profile.role = 'admin';
    profile.hasInfiniteActions = true;
    profile.canSaveMultipleAdventures = true;
    profile.canPostCommunityAdventures = true;
    if (profile.showGlowingName === undefined) {
      profile.showGlowingName = true;
    }
  } else {
    if (!profile.role) profile.role = 'user';
    if (profile.showGlowingName === undefined && (profile.role === 'admin' || profile.role === 'mod')) {
      profile.showGlowingName = true;
    }
  }
  return profile;
}

export interface GuestProfile {
  guestId: string;
  rawGuestName: string | null; // e.g. "ShadowRunner"
  displayGuestName: string;   // e.g. "ShadowRunner (Guest)" or "Player"
}

// Username format validation: 2-20 characters, only letters and numbers
export function validateUsernameFormat(name: string): { valid: boolean; error?: string } {
  if (!name || name.trim().length === 0) {
    return { valid: false, error: 'Username is required.' };
  }
  const trimmed = name.trim();
  if (trimmed.length < 2 || trimmed.length > 20) {
    return { valid: false, error: 'Username must be between 2 and 20 characters.' };
  }
  if (!/^[a-zA-Z0-9]+$/.test(trimmed)) {
    return { valid: false, error: 'Username can only contain letters and numbers.' };
  }
  return { valid: true };
}

// Generates random unique-style usernames like GoldenTable86, Bird872, HowlingKnight
export function generateRandomUsername(): string {
  const prefixes = [
    'Golden', 'Bird', 'Howling', 'Silver', 'Shadow', 'Mystic', 'Swift', 'Iron',
    'Storm', 'Crimson', 'Azure', 'Solar', 'Lunar', 'Cyber', 'Frost', 'Thunder',
    'Blaze', 'Silent', 'Wild', 'Astral', 'Crystal', 'Night', 'Star', 'Emerald'
  ];
  const nouns = [
    'Table', 'Bird', 'Knight', 'Dragon', 'Falcon', 'Wolf', 'Mage', 'Tiger',
    'Blade', 'Rogue', 'Hunter', 'Viper', 'Ghost', 'Raven', 'Titan', 'Phoenix',
    'Spark', 'Hawk', 'Fox', 'Archer', 'Shield', 'Sentinel', 'Warrior'
  ];
  const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
  const noun = nouns[Math.floor(Math.random() * nouns.length)];

  const style = Math.random();
  let result = '';
  if (style < 0.4) {
    // e.g., GoldenTable86
    const num = Math.floor(Math.random() * 90) + 10;
    result = `${prefix}${noun}${num}`;
  } else if (style < 0.7) {
    // e.g., Bird872
    const num = Math.floor(Math.random() * 900) + 100;
    result = `${prefix}${num}`;
  } else {
    // e.g., HowlingKnight
    result = `${prefix}${noun}`;
  }

  if (result.length > 20) {
    result = result.substring(0, 20);
  }
  return result;
}

// Persistent Guest ID generator
export function getOrCreateGuestId(): string {
  let guestId = localStorage.getItem('aifinity_guest_id');
  if (!guestId) {
    guestId = 'guest_' + Math.random().toString(36).substring(2, 11) + '_' + Date.now().toString(36);
    localStorage.setItem('aifinity_guest_id', guestId);
  }
  return guestId;
}

// Check if a guest name is active or taken
export async function isGuestNameActive(guestName: string): Promise<boolean> {
  const lower = guestName.trim().toLowerCase();
  try {
    const userDoc = await getDoc(doc(db, 'usernames', lower));
    if (userDoc.exists()) return true;
    const guestDoc = await getDoc(doc(db, 'guest_names', lower));
    return guestDoc.exists();
  } catch (err) {
    return false;
  }
}

export async function reserveGuestName(guestName: string, guestId: string): Promise<boolean> {
  const res = await setGuestName(guestName, null, guestId);
  return res.success;
}

// Check if a registered username is taken
export async function isUsernameTaken(username: string, currentGuestId?: string): Promise<boolean> {
  const lower = username.trim().toLowerCase();
  try {
    // Check in registered usernames
    const userDoc = await getDoc(doc(db, 'usernames', lower));
    if (userDoc.exists()) return true;

    // Check in active guest names
    const guestDoc = await getDoc(doc(db, 'guest_names', lower));
    if (guestDoc.exists()) {
      const data = guestDoc.data();
      const guestId = currentGuestId || localStorage.getItem('aifinity_guest_id') || localStorage.getItem('aimud_guest_id');
      // If this name was reserved by this current guest session, they can transition it to their registered account!
      if (guestId && data?.guestId === guestId) {
        return false;
      }
      return true;
    }

    return false;
  } catch (err) {
    console.warn('Error checking username availability:', err);
    return false;
  }
}

// Check if guest name can be claimed by current guest
export async function isGuestNameAvailable(guestName: string, currentGuestId: string): Promise<boolean> {
  const lower = guestName.trim().toLowerCase();
  try {
    const timeoutPromise = new Promise<null>((resolve) => setTimeout(() => resolve(null), 1500));
    const checkPromise = Promise.all([
      getDoc(doc(db, 'usernames', lower)),
      getDoc(doc(db, 'guest_names', lower))
    ]);

    const result = await Promise.race([checkPromise, timeoutPromise]);
    if (!result) {
      // Timeout reached: avoid stalling user
      return true;
    }

    const [userDoc, guestDoc] = result;
    if (userDoc.exists()) return false;

    if (guestDoc.exists()) {
      const data = guestDoc.data();
      if (data?.guestId === currentGuestId) return true;
      return false;
    }
    return true;
  } catch (err) {
    console.warn('Error checking guest name availability:', err);
    return true;
  }
}

// Claim or update guest name
export async function setGuestName(
  newGuestName: string,
  oldGuestName: string | null,
  guestId: string
): Promise<{ success: boolean; error?: string }> {
  const validation = validateUsernameFormat(newGuestName);
  if (!validation.valid) {
    return { success: false, error: validation.error };
  }

  const newLower = newGuestName.trim().toLowerCase();
  const available = await isGuestNameAvailable(newGuestName, guestId);
  if (!available) {
    return { success: false, error: 'That name is already taken by another user or guest.' };
  }

  try {
    // Release old name if different
    if (oldGuestName && oldGuestName.trim().toLowerCase() !== newLower) {
      await deleteDoc(doc(db, 'guest_names', oldGuestName.trim().toLowerCase())).catch(() => {});
    }

    // Reserve new name
    await setDoc(doc(db, 'guest_names', newLower), {
      guestId,
      displayName: newGuestName.trim(),
      nameLower: newLower,
      claimedAt: new Date().toISOString()
    });

    localStorage.setItem('aifinity_guest_name', newGuestName.trim());
    return { success: true };
  } catch (err: any) {
    console.error('Failed to claim guest name in Firestore:', err);
    return { success: false, error: err.message || 'Failed to reserve guest name.' };
  }
}

// Clear guest name
export async function clearGuestName(guestName: string | null, guestId: string): Promise<void> {
  if (guestName) {
    try {
      await deleteDoc(doc(db, 'guest_names', guestName.trim().toLowerCase())).catch(() => {});
    } catch (e) {}
  }
  localStorage.removeItem('aifinity_guest_name');
}

// In-memory cache for profiles currently being created or fetched to avoid race conditions
let activeProfileCache: Record<string, UserProfile> = {};

// Local email session support for seamless registration and login when Firebase Email Provider is disabled in Firebase Console
let fallbackSessionUser: UserProfile | null = null;
const authListeners = new Set<(user: UserProfile | null, loading: boolean) => void>();

function notifyAuthListeners(user: UserProfile | null, loading: boolean) {
  authListeners.forEach((cb) => {
    try {
      cb(user, loading);
    } catch (e) {
      console.error('Auth listener error:', e);
    }
  });
}

if (typeof window !== 'undefined') {
  try {
    const raw = localStorage.getItem('aifinity_fallback_session');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.uid) {
        fallbackSessionUser = enrichUserProfileWithDefaults(parsed);
        activeProfileCache[fallbackSessionUser.uid] = fallbackSessionUser;
      }
    }
  } catch (e) {}
}

// Register user with email/password
export async function registerWithEmail(
  email: string,
  pass: string,
  username: string
): Promise<{ user?: UserProfile; error?: string; operationNotAllowed?: boolean }> {
  const validation = validateUsernameFormat(username);
  if (!validation.valid) {
    return { error: validation.error };
  }

  const taken = await isUsernameTaken(username);
  if (taken) {
    return { error: 'Username is already taken. Please choose another.' };
  }

  try {
    const cred = await createUserWithEmailAndPassword(auth, email, pass);
    const uid = cred.user.uid;
    const lower = username.trim().toLowerCase();
    const cleanEmail = (cred.user.email || email).trim();
    const emailLower = cleanEmail.toLowerCase();

    const profile: UserProfile = enrichUserProfileWithDefaults({
      uid,
      email: cleanEmail,
      username: username.trim(),
      authProvider: 'password',
      createdAt: new Date().toISOString()
    });

    // Populate active cache immediately so auth state listener immediately finds the profile
    activeProfileCache[uid] = profile;

    // Save profile, unique username reservation, and email index in Firestore
    await Promise.all([
      setDoc(doc(db, 'users', uid), profile),
      setDoc(doc(db, 'usernames', lower), {
        uid,
        username: username.trim(),
        createdAt: new Date().toISOString()
      }),
      setDoc(doc(db, 'emails', emailLower), {
        uid,
        email: cleanEmail,
        createdAt: new Date().toISOString()
      })
    ]);

    // Clean up temporary guest claim if any
    try {
      await deleteDoc(doc(db, 'guest_names', lower));
    } catch {
      // Non-blocking
    }

    return { user: profile };
  } catch (err: any) {
    let msg = err.message || 'Registration failed.';
    let operationNotAllowed = false;
    if (err.code === 'auth/operation-not-allowed') {
      try {
        const resp = await fetch('/api/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, pass, username })
        });
        const data = await resp.json();
        if (resp.ok && data.user) {
          const profile = enrichUserProfileWithDefaults(data.user);
          fallbackSessionUser = profile;
          activeProfileCache[profile.uid] = profile;
          if (typeof window !== 'undefined') {
            localStorage.setItem('aifinity_fallback_session', JSON.stringify(profile));
          }
          notifyAuthListeners(profile, false);
          return { user: profile };
        }
        return { error: data.error || 'Registration failed.' };
      } catch (fallbackErr: any) {
        msg = fallbackErr.message || 'Registration failed.';
        operationNotAllowed = true;
      }
    } else if (err.code === 'auth/email-already-in-use') {
      msg = 'An account with this email already exists.';
    } else if (err.code === 'auth/weak-password') {
      msg = 'Password should be at least 6 characters.';
    } else if (err.code === 'auth/invalid-email') {
      msg = 'Please enter a valid email address.';
    }
    return { error: msg, operationNotAllowed };
  }
}

// Login with email/password
export async function loginWithEmail(
  email: string,
  pass: string
): Promise<{ user?: UserProfile; error?: string; accountNotFound?: boolean; operationNotAllowed?: boolean; isGoogleAccount?: boolean }> {
  try {
    const cleanEmail = email.trim();
    if (!cleanEmail) {
      return { error: 'Please enter your email.' };
    }
    if (!pass) {
      return { error: 'Please enter your password.' };
    }

    const emailLower = cleanEmail.toLowerCase();

    // Check if account exists first in Firestore emails or users collection
    let accountExists = false;
    let isGoogleAccount = false;
    try {
      const emailDoc = await getDoc(doc(db, 'emails', emailLower));
      if (emailDoc.exists()) {
        accountExists = true;
        const uid = emailDoc.data()?.uid;
        if (uid) {
          const uDoc = await getDoc(doc(db, 'users', uid));
          if (uDoc.exists() && uDoc.data()?.authProvider === 'google') {
            isGoogleAccount = true;
          }
        }
      } else {
        const q1 = query(collection(db, 'users'), where('email', '==', cleanEmail));
        const snap1 = await getDocs(q1);
        if (!snap1.empty) {
          accountExists = true;
          if (snap1.docs[0].data()?.authProvider === 'google') {
            isGoogleAccount = true;
          }
        } else {
          const q2 = query(collection(db, 'users'), where('email', '==', emailLower));
          const snap2 = await getDocs(q2);
          if (!snap2.empty) {
            accountExists = true;
            if (snap2.docs[0].data()?.authProvider === 'google') {
              isGoogleAccount = true;
            }
          }
        }
      }
    } catch (checkErr) {
      // Proceed to auth attempt if Firestore lookup fails
    }

    try {
      const cred = await signInWithEmailAndPassword(auth, cleanEmail, pass);
      const userDoc = await getDoc(doc(db, 'users', cred.user.uid));
      if (userDoc.exists()) {
        const profile = enrichUserProfileWithDefaults(userDoc.data() as UserProfile);
        activeProfileCache[cred.user.uid] = profile;
        return { user: profile };
      }

      // Fallback if profile document wasn't found in Firestore
      const fallbackProfile: UserProfile = enrichUserProfileWithDefaults({
        uid: cred.user.uid,
        email: cred.user.email,
        username: (cred.user.displayName || cred.user.email?.split('@')[0] || 'Player').replace(/[^a-zA-Z0-9]/g, '').substring(0, 20),
        authProvider: 'password',
        createdAt: new Date().toISOString()
      });
      activeProfileCache[cred.user.uid] = fallbackProfile;
      return { user: fallbackProfile };
    } catch (authErr: any) {
      if (authErr.code === 'auth/operation-not-allowed') {
        if (isGoogleAccount) {
          return {
            error: `This email (${cleanEmail}) was registered using Google Sign-In. Please click Sign In With Google below.`,
            operationNotAllowed: true,
            isGoogleAccount: true
          };
        }
        try {
          const resp = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: cleanEmail, pass })
          });
          const data = await resp.json();
          if (resp.ok && data.user) {
            const profile = enrichUserProfileWithDefaults(data.user);
            fallbackSessionUser = profile;
            activeProfileCache[profile.uid] = profile;
            if (typeof window !== 'undefined') {
              localStorage.setItem('aifinity_fallback_session', JSON.stringify(profile));
            }
            notifyAuthListeners(profile, false);
            return { user: profile };
          }
          if (data.accountNotFound) {
            return {
              error: 'No account found with this email. Please enter your desired username and password to create your account.',
              accountNotFound: true
            };
          }
          return { error: data.error || 'Invalid email or password. Please try again.' };
        } catch (fallbackErr: any) {
          return { error: fallbackErr.message || 'Login failed.' };
        }
      }
      // If Firebase explicitly reports user-not-found, OR if our lookup showed account does not exist:
      if (
        authErr.code === 'auth/user-not-found' ||
        (!accountExists && (authErr.code === 'auth/invalid-credential' || authErr.code === 'auth/wrong-password'))
      ) {
        return {
          error: "No account found with this email. Please enter your desired username and password to create your account.",
          accountNotFound: true
        };
      }
      if (authErr.code === 'auth/invalid-credential' || authErr.code === 'auth/wrong-password') {
        return { error: 'Invalid password for this account. Please try again.' };
      }
      if (authErr.code === 'auth/too-many-requests') {
        return { error: 'Too many unsuccessful attempts. Please try again later.' };
      }
      return { error: authErr.message || 'Login failed.' };
    }
  } catch (err: any) {
    let msg = err.message || 'Login failed.';
    return { error: msg };
  }
}

// Record payment transaction in Firestore under user document
export interface PaymentTransactionRecord {
  id: string;
  amount: number;
  itemName: string;
  itemType: 'pack' | 'tier';
  paymentMethod: string;
  status: 'completed' | 'failed' | 'pending';
  createdAt: string;
  recipient?: string;
  customerName?: string;
  email?: string;
  attachedUsername?: string;
  notes?: string;
  userId?: string;
  actionDelta?: number;
  newTier?: string;
  receiptUrl?: string;
}

export function getLocalTransactions(uid: string): PaymentTransactionRecord[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(`aifinity_user_transactions_${uid}`);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (e) {
    console.warn('Could not parse local transactions:', e);
  }
  return [];
}

export function saveLocalTransaction(uid: string, tx: PaymentTransactionRecord) {
  if (typeof window === 'undefined') return;
  try {
    const existing = getLocalTransactions(uid);
    const filtered = existing.filter(item => item.id !== tx.id);
    const updated = [tx, ...filtered];
    localStorage.setItem(`aifinity_user_transactions_${uid}`, JSON.stringify(updated));
  } catch (e) {
    console.warn('Could not save transaction to localStorage:', e);
  }
}

export async function recordPaymentTransaction(
  uid: string,
  transaction: PaymentTransactionRecord
): Promise<void> {
  const rawId = String(transaction.id || '').trim();
  const safeTxId = (rawId || `tx_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`)
    .replace(/[^a-zA-Z0-9_-]/g, '_');

  const fullTx: PaymentTransactionRecord = {
    ...transaction,
    id: safeTxId,
    userId: uid
  };

  // 1. Instantly persist to localStorage so receipt is immediately accessible
  saveLocalTransaction(uid, fullTx);

  // 2. Persist to Firestore
  try {
    await setDoc(doc(db, 'users', uid, 'transactions', safeTxId), fullTx);
    const userDocRef = doc(db, 'users', uid);
    const updates: any = {
      appliedTransactionIds: arrayUnion(safeTxId, rawId)
    };
    if (fullTx.actionDelta && fullTx.actionDelta > 0) {
      updates.creditedActionTxIds = arrayUnion(safeTxId, rawId);
    }
    await updateDoc(userDocRef, updates).catch(() => {});
  } catch (err) {
    console.warn('Failed to log payment transaction in Firestore (saved locally):', err);
  }
}

export async function getUserTransactions(uid: string): Promise<PaymentTransactionRecord[]> {
  const localList = getLocalTransactions(uid);
  const txMap = new Map<string, PaymentTransactionRecord>();
  for (const item of localList) {
    if (item && item.id) {
      txMap.set(item.id, item);
    }
  }

  try {
    const snap = await getDocs(collection(db, 'users', uid, 'transactions'));
    snap.forEach((docSnap) => {
      const data = docSnap.data() as PaymentTransactionRecord;
      if (data && data.id) {
        txMap.set(data.id, data);
      }
    });
  } catch (err) {
    console.warn('Could not query Firestore transactions, using local store:', err);
  }

  const all = Array.from(txMap.values());
  all.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return all;
}

// Google Sign-in with Firebase
export async function loginWithGoogle(): Promise<{
  user?: UserProfile;
  needsUsername?: boolean;
  googleUser?: FirebaseUser;
  error?: string;
}> {
  try {
    const cred = await signInWithPopup(auth, googleProvider);
    const uid = cred.user.uid;

    const userDoc = await getDoc(doc(db, 'users', uid));
    if (userDoc.exists()) {
      const profile = enrichUserProfileWithDefaults(userDoc.data() as UserProfile);
      activeProfileCache[uid] = profile;
      if (isDefaultAdmin(profile.email, profile.username) && (profile.role !== 'admin' || !profile.hasInfiniteActions)) {
        await setDoc(doc(db, 'users', uid), {
          role: 'admin',
          hasInfiniteActions: true,
          canSaveMultipleAdventures: true,
          canPostCommunityAdventures: true,
          showGlowingName: profile.showGlowingName !== undefined ? profile.showGlowingName : true
        }, { merge: true }).catch(() => {});
      }
      return { user: profile };
    }

    // New Google user: always give the user the prompt to manually set their username and password first
    return { needsUsername: true, googleUser: cred.user };
  } catch (err: any) {
    if (err.code === 'auth/popup-closed-by-user') {
      return { error: 'Sign in popup closed.' };
    }
    if (err.code === 'auth/popup-blocked') {
      return { error: 'Popup was blocked by your browser. Please allow popups for https://www.aifinity-rpg.com to complete Google sign-in.' };
    }
    if (err.code === 'auth/unauthorized-domain') {
      return {
        error: 'Google Sign-In authorization for www.aifinity-rpg.com requires domain authorization in the Firebase project settings.'
      };
    }
    // Cross-Origin-Opener-Policy recovery: if window.close was intercepted by browser policy, check if user was authenticated
    if (auth.currentUser) {
      try {
        const uid = auth.currentUser.uid;
        const userDoc = await getDoc(doc(db, 'users', uid));
        if (userDoc.exists()) {
          const profile = enrichUserProfileWithDefaults(userDoc.data() as UserProfile);
          activeProfileCache[uid] = profile;
          return { user: profile };
        }
        return { needsUsername: true, googleUser: auth.currentUser };
      } catch (recoveryErr) {
        console.warn("COOP recovery failed:", recoveryErr);
      }
    }
    return { error: err.message || 'Google sign in failed.' };
  }
}

// Complete Google sign-in after manually setting a unique username and optional password
export async function completeGoogleSignUp(
  googleUser: FirebaseUser,
  username: string,
  optionalPassword?: string
): Promise<{ user?: UserProfile; error?: string }> {
  const validation = validateUsernameFormat(username);
  if (!validation.valid) {
    return { error: validation.error };
  }

  const taken = await isUsernameTaken(username);
  if (taken) {
    return { error: 'Username is already taken. Please choose another.' };
  }

  try {
    const cleanEmail = (googleUser.email || '').trim();
    const emailLower = cleanEmail.toLowerCase();
    const lower = username.trim().toLowerCase();

    const profile: UserProfile = enrichUserProfileWithDefaults({
      uid: googleUser.uid,
      email: googleUser.email,
      username: username.trim(),
      authProvider: 'google',
      createdAt: new Date().toISOString()
    });
    activeProfileCache[googleUser.uid] = profile;

    await Promise.all([
      setDoc(doc(db, 'users', googleUser.uid), profile),
      setDoc(doc(db, 'usernames', lower), {
        uid: googleUser.uid,
        username: username.trim(),
        createdAt: new Date().toISOString()
      }),
      emailLower ? setDoc(doc(db, 'emails', emailLower), {
        uid: googleUser.uid,
        email: cleanEmail,
        createdAt: new Date().toISOString()
      }) : Promise.resolve()
    ]);

    // Optional account password update if the user manually specified a password
    if (optionalPassword && optionalPassword.length >= 6) {
      try {
        const { updatePassword } = await import('firebase/auth');
        await updatePassword(googleUser, optionalPassword);
      } catch (pwErr) {
        console.warn('Could not set optional password on Google user:', pwErr);
      }
    }

    // Clean up temporary guest claim if any
    try {
      await deleteDoc(doc(db, 'guest_names', lower));
    } catch {
      // Non-blocking
    }

    return { user: profile };
  } catch (err: any) {
    return { error: err.message || 'Failed to complete Google account setup.' };
  }
}

// Log out
export async function logOut(): Promise<void> {
  activeProfileCache = {};
  if (fallbackSessionUser) {
    fallbackSessionUser = null;
    if (typeof window !== 'undefined') {
      localStorage.removeItem('aifinity_fallback_session');
    }
    notifyAuthListeners(null, false);
  }
  await fbSignOut(auth);
}

// Fetch user profile from Firestore by UID
export async function getUserProfile(uid: string, forceFresh: boolean = false): Promise<UserProfile | null> {
  // Check if this is an active fallback email session
  if (fallbackSessionUser && fallbackSessionUser.uid === uid) {
    if (forceFresh) {
      try {
        const resp = await fetch(`/api/auth/user/${uid}`);
        if (resp.ok) {
          const data = await resp.json();
          if (data.user) {
            fallbackSessionUser = enrichUserProfileWithDefaults(data.user);
            activeProfileCache[uid] = fallbackSessionUser;
          }
        }
      } catch (e) {}
    }
    return enrichUserProfileWithDefaults(fallbackSessionUser);
  }

  // Helper to read any cached local purchase state
  const getLocalPurchaseOverrides = (targetUid: string) => {
    try {
      if (typeof window === 'undefined') return null;
      const raw = localStorage.getItem(`aifinity_user_actions_${targetUid}`);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return parsed;
    } catch {
      return null;
    }
  };

  if (!forceFresh && activeProfileCache[uid]) {
    const cached = enrichUserProfileWithDefaults(activeProfileCache[uid]);
    if (isDefaultAdmin(cached.email, cached.username) && (cached.role !== 'admin' || !cached.hasInfiniteActions)) {
      cached.role = 'admin';
      cached.hasInfiniteActions = true;
      cached.canSaveMultipleAdventures = true;
      cached.canPostCommunityAdventures = true;
    }
    const local = getLocalPurchaseOverrides(uid);
    if (local) {
      if ((local.tier === 'adventurer' || local.tier === 'legendary' || local.tier === 'celestial') && cached.tier !== local.tier) {
        cached.tier = local.tier;
        cached.canSaveMultipleAdventures = true;
        cached.canPostCommunityAdventures = true;
      }
      if (typeof local.actionCredits === 'number' && local.actionCredits > (cached.actionCredits || 0)) {
        cached.actionCredits = local.actionCredits;
      }
    }
    return cached;
  }

  try {
    const snap = await getDoc(doc(db, 'users', uid));
    let profile: UserProfile | null = null;
    if (snap.exists()) {
      profile = enrichUserProfileWithDefaults(snap.data() as UserProfile);
    } else if (activeProfileCache[uid]) {
      profile = enrichUserProfileWithDefaults(activeProfileCache[uid]);
    }

    if (profile) {
      const local = getLocalPurchaseOverrides(uid);
      let needsFirestoreSync = false;
      if (local) {
        if ((local.tier === 'adventurer' || local.tier === 'legendary' || local.tier === 'celestial') && profile.tier !== local.tier) {
          profile.tier = local.tier;
          profile.canSaveMultipleAdventures = true;
          profile.canPostCommunityAdventures = true;
          needsFirestoreSync = true;
        }
        if (typeof local.actionCredits === 'number' && local.actionCredits > (profile.actionCredits || 0)) {
          profile.actionCredits = local.actionCredits;
          needsFirestoreSync = true;
        }
      }

      if (isDefaultAdmin(profile.email, profile.username) && (profile.role !== 'admin' || !profile.hasInfiniteActions)) {
        profile.role = 'admin';
        profile.hasInfiniteActions = true;
        profile.canSaveMultipleAdventures = true;
        profile.canPostCommunityAdventures = true;
        needsFirestoreSync = true;
      }

      activeProfileCache[uid] = profile;

      if (needsFirestoreSync && auth.currentUser?.uid === uid) {
        setDoc(doc(db, 'users', uid), {
          tier: profile.tier,
          actionCredits: profile.actionCredits,
          role: profile.role,
          hasInfiniteActions: profile.hasInfiniteActions,
          canSaveMultipleAdventures: profile.canSaveMultipleAdventures,
          canPostCommunityAdventures: profile.canPostCommunityAdventures,
          showGlowingName: profile.showGlowingName !== undefined ? profile.showGlowingName : true
        }, { merge: true }).catch(() => {});
      }
      return profile;
    }
    return null;
  } catch (e) {
    return activeProfileCache[uid] || null;
  }
}

export function updateCachedProfile(uid: string, updates: Partial<UserProfile>): void {
  if (activeProfileCache[uid]) {
    activeProfileCache[uid] = {
      ...activeProfileCache[uid],
      ...updates
    };
  } else {
    activeProfileCache[uid] = {
      uid,
      email: null,
      username: 'Player',
      authProvider: 'password',
      createdAt: new Date().toISOString(),
      ...updates
    } as UserProfile;
  }
}

// Listen to auth state changes
export function subscribeToAuth(callback: (user: UserProfile | null, loading: boolean) => void) {
  authListeners.add(callback);
  if (fallbackSessionUser) {
    callback(fallbackSessionUser, false);
  }

  const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
    if (fbUser) {
      fallbackSessionUser = null;
      if (typeof window !== 'undefined') {
        localStorage.removeItem('aifinity_fallback_session');
      }
      let profile = await getUserProfile(fbUser.uid);
      if (!profile) {
        // Retry with delays to allow Firestore writes to settle
        for (let i = 0; i < 3; i++) {
          await new Promise((r) => setTimeout(r, 250 * (i + 1)));
          profile = await getUserProfile(fbUser.uid);
          if (profile) break;
        }
      }
      if (profile) {
        callback(profile, false);
      } else {
        // Construct fallback user profile so user is never reported as null when authenticated
        const fallback: UserProfile = enrichUserProfileWithDefaults({
          uid: fbUser.uid,
          email: fbUser.email,
          username: (fbUser.displayName || fbUser.email?.split('@')[0] || 'Player').replace(/[^a-zA-Z0-9]/g, '').substring(0, 20) || 'Player',
          authProvider: (fbUser.providerData[0]?.providerId === 'google.com' ? 'google' : 'password'),
          createdAt: new Date().toISOString()
        });
        activeProfileCache[fbUser.uid] = fallback;
        callback(fallback, false);
      }
    } else {
      if (!fallbackSessionUser) {
        activeProfileCache = {};
        callback(null, false);
      }
    }
  });

  return () => {
    authListeners.delete(callback);
    unsubscribe();
  };
}

// Generate unique Guest# between 1-9999 for multiplayer guests who haven't set their name
export function generateUniqueGuestMultiplayerName(existingPlayerNames: string[] = []): string {
  const existingNumbers = new Set<number>();
  for (const name of existingPlayerNames) {
    const match = name.match(/^Guest(\d+)$/i);
    if (match) {
      existingNumbers.add(parseInt(match[1], 10));
    }
  }

  // Find an unused number from 1 to 9999
  let candidate = Math.floor(Math.random() * 9999) + 1;
  let attempts = 0;
  while (existingNumbers.has(candidate) && attempts < 1000) {
    candidate = Math.floor(Math.random() * 9999) + 1;
    attempts++;
  }
  return `Guest${candidate}`;
}

// Update partial user profile in Firestore and sync in-memory cache and localStorage
export async function updateUserProfile(uid: string, updates: Partial<UserProfile>): Promise<void> {
  try {
    updateCachedProfile(uid, updates);

    if (fallbackSessionUser && fallbackSessionUser.uid === uid) {
      fallbackSessionUser = { ...fallbackSessionUser, ...updates };
      activeProfileCache[uid] = fallbackSessionUser;
      if (typeof window !== 'undefined') {
        localStorage.setItem('aifinity_fallback_session', JSON.stringify(fallbackSessionUser));
      }
      fetch('/api/auth/update-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uid, updates })
      }).catch(() => {});
      notifyAuthListeners(fallbackSessionUser, false);
    }

    // Sync to local storage state
    if (typeof window !== 'undefined') {
      try {
        const key = `aifinity_user_actions_${uid}`;
        const raw = localStorage.getItem(key);
        const currentLocal = raw ? JSON.parse(raw) : {};
        if (updates.tier) currentLocal.tier = updates.tier;
        if (typeof updates.actionCredits === 'number') currentLocal.actionCredits = updates.actionCredits;
        localStorage.setItem(key, JSON.stringify(currentLocal));
      } catch (e) {
        // ignore
      }
    }

    const userRef = doc(db, 'users', uid);
    await setDoc(userRef, updates, { merge: true });
  } catch (err) {
    console.error('Failed to update user profile in Firestore:', err);
  }
}
