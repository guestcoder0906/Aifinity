import { loadStripe, Stripe as StripeClient } from '@stripe/stripe-js';
import { UserProfile } from './authService';
import { safeStorage, safeSessionStorage } from './safeStorage';

let stripePromise: Promise<StripeClient | null> | null = null;

export function getClientStripe(publishableKey?: string | null): Promise<StripeClient | null> {
  const key =
    publishableKey ||
    (import.meta as any).env?.VITE_STRIPE_PUBLISHABLE_KEY ||
    '';

  if (!key) return Promise.resolve(null);

  if (!stripePromise) {
    stripePromise = loadStripe(key);
  }
  return stripePromise;
}

/**
 * Initiates an authentic Stripe Checkout session redirect.
 * If the Stripe server endpoint returns an error, it throws the real error so the user is informed
 * rather than recording any unverified transaction.
 */
export async function createRealStripeCheckoutSession(params: {
  amount: number;
  itemName: string;
  itemType: 'pack' | 'tier';
  itemId: string;
  actionDelta: number;
  user: UserProfile;
  origin?: string;
}): Promise<{ url: string; sessionId: string }> {
  const { amount, itemName, itemType, itemId, actionDelta, user, origin } = params;

  const clientOrigin =
    origin ||
    (typeof window !== 'undefined' ? window.location.origin : 'https://www.aifinity-rpg.com');

  const response = await fetch('/api/stripe/create-checkout-session', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
    body: JSON.stringify({
      amount,
      itemName,
      itemType,
      itemId,
      actionDelta,
      userId: user.uid,
      userEmail: user.email || '',
      username: user.username || '',
      origin: clientOrigin
    })
  });

  const contentType = response.headers.get('content-type') || '';
  let data: any = null;

  if (contentType.includes('application/json')) {
    data = await response.json().catch(() => null);
  }

  if (!response.ok || !data || !data.url) {
    if (response.status === 404) {
      throw new Error(
        `Stripe server endpoint (/api/stripe/create-checkout-session) returned 404 Not Found. Make sure the Node/Express backend server is running and STRIPE_SECRET_KEY is configured in your deployment settings.`
      );
    }
    const errMessage =
      data?.message ||
      (data?.error === 'STRIPE_NOT_CONFIGURED'
        ? 'STRIPE_SECRET_KEY is missing in your server environment variables. Please add your live or test Stripe Secret Key in Settings.'
        : `Stripe checkout initiation failed (HTTP ${response.status}).`);
    
    const errorObj = new Error(errMessage);
    (errorObj as any).serverPayload = data;
    throw errorObj;
  }

  if (typeof window !== 'undefined') {
    try {
      const pendingData = {
        sessionId: data.sessionId,
        amount,
        itemName,
        itemType,
        itemId,
        actionDelta,
        userId: user.uid,
        userEmail: user.email || '',
        username: user.username || '',
        timestamp: new Date().toISOString()
      };
      safeSessionStorage.setItem('aifinity_pending_checkout', JSON.stringify(pendingData));
      safeStorage.setItem('aifinity_pending_checkout', JSON.stringify(pendingData));
      safeStorage.setItem('aifinity_last_checkout_user', user.uid);
      if (user.email) {
        safeStorage.setItem('aifinity_last_checkout_email', user.email);
      }
    } catch (e) {
      console.warn('Could not save pending checkout:', e);
    }
  }

  return {
    url: data.url,
    sessionId: data.sessionId
  };
}

/**
 * Polls the backend to check if an active checkout session was paid
 */
export async function checkStripeSessionStatus(sessionId: string): Promise<{
  paid: boolean;
  status?: string;
  amount?: number;
  customerEmail?: string;
  metadata?: any;
  paymentIntentId?: string;
}> {
  try {
    const res = await fetch(`/api/stripe/check-session-status?sessionId=${encodeURIComponent(sessionId)}`);
    if (!res.ok) return { paid: false };
    const data = await res.json();
    return data;
  } catch (e) {
    console.warn('Check session status error:', e);
    return { paid: false };
  }
}

export interface StripeActiveSubscription {
  id: string;
  tierId: 'adventurer' | 'legendary' | 'celestial';
  itemName: string;
  status: 'active' | 'trialing' | 'canceled' | 'past_due' | 'unpaid';
  periodEnd: string;
  cancelAtPeriodEnd: boolean;
  customerId?: string;
}

/**
 * Syncs and retrieves all completed Stripe purchases and active monthly subscriptions for a user
 */
export async function syncUserPurchasesFromStripe(
  userId: string,
  email?: string,
  username?: string
): Promise<{
  success: boolean;
  count: number;
  activeSubscription?: StripeActiveSubscription | null;
  totalPackActions?: number;
  highestPurchasedTier?: 'adventurer' | 'legendary' | 'celestial' | null;
  purchases: Array<{
    id: string;
    amount: number;
    itemType: 'pack' | 'tier';
    itemId: string;
    itemName: string;
    actionDelta: number;
    email: string;
    userId: string;
    username?: string;
    customerName?: string;
    paymentMethod: string;
    status: 'completed';
    createdAt: string;
  }>;
}> {
  try {
    const url = `/api/stripe/sync-user-purchases?userId=${encodeURIComponent(userId)}&email=${encodeURIComponent(email || '')}&username=${encodeURIComponent(username || '')}`;
    const res = await fetch(url);
    if (!res.ok) {
      return { success: false, count: 0, purchases: [], activeSubscription: null };
    }
    const data = await res.json();
    return data;
  } catch (err: any) {
    // Gracefully handle network disconnects, browser tab switches, or offline modes
    return { success: false, count: 0, purchases: [], activeSubscription: null };
  }
}

/**
 * Cancels a user's active monthly Stripe subscription
 */
export async function cancelStripeSubscription(
  userId: string,
  subscriptionId?: string | null,
  userEmail?: string,
  username?: string,
  stripeCustomerId?: string | null
): Promise<{ success: boolean; message: string; status?: string; notFoundOnStripe?: boolean }> {
  try {
    const res = await fetch('/api/stripe/cancel-subscription', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: JSON.stringify({
        userId,
        subscriptionId: subscriptionId || undefined,
        userEmail: userEmail || undefined,
        email: userEmail || undefined,
        username: username || undefined,
        stripeCustomerId: stripeCustomerId || undefined,
        customerId: stripeCustomerId || undefined
      })
    });

    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.success) {
      return {
        success: true,
        notFoundOnStripe: true,
        message: data?.message || 'Subscription status reset to Free.'
      };
    }

    return data;
  } catch (err) {
    console.warn('cancelStripeSubscription request warning:', err);
    return {
      success: true,
      notFoundOnStripe: true,
      message: 'Subscription status reset to Free.'
    };
  }
}

/**
 * Creates a Stripe Customer Portal session URL for managing subscription/payment methods
 */
export async function createStripeCustomerPortalSession(
  userId: string,
  userEmail?: string,
  username?: string,
  stripeSubscriptionId?: string,
  origin?: string,
  stripeCustomerId?: string | null
): Promise<string> {
  const clientOrigin =
    origin ||
    (typeof window !== 'undefined' ? window.location.origin : 'https://www.aifinity-rpg.com');

  const res = await fetch('/api/stripe/create-portal-session', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json'
    },
    body: JSON.stringify({
      userId,
      userEmail: userEmail || undefined,
      username: username || undefined,
      stripeSubscriptionId: stripeSubscriptionId || undefined,
      stripeCustomerId: stripeCustomerId || undefined,
      customerId: stripeCustomerId || undefined,
      origin: clientOrigin
    })
  });

  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.url) {
    throw new Error(data?.message || 'Unable to open Stripe Customer Portal.');
  }

  return data.url;
}
