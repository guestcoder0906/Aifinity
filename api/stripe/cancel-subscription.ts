import Stripe from 'stripe';

let stripeClient: Stripe | null = null;

function getStripe(): Stripe | null {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    return null;
  }
  if (!stripeClient) {
    stripeClient = new Stripe(secretKey);
  }
  return stripeClient;
}

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'METHOD_NOT_ALLOWED', message: 'Only POST is allowed.' });
  }

  try {
    const { userId, subscriptionId, userEmail, email, username, stripeCustomerId, customerId: bodyCustId } = req.body || {};
    const cleanEmail = (userEmail || email || '').trim().toLowerCase();
    const cleanUsername = (username || '').trim().toLowerCase();
    const cleanUid = (userId || '').trim();
    const explicitCustId = stripeCustomerId || bodyCustId;

    if (!cleanUid && !subscriptionId && !cleanEmail && !cleanUsername && !explicitCustId) {
      return res.status(400).json({ error: 'MISSING_PARAMS', message: 'User ID, Email, or Subscription ID is required.' });
    }

    const stripe = getStripe();
    if (!stripe) {
      return res.status(200).json({ success: true, message: 'Subscription status reset in test mode.' });
    }

    // Fast parallel search across sessions and subscriptions
    const [sessions, subs] = await Promise.all([
      stripe.checkout.sessions.list({ limit: 100 }).catch(() => ({ data: [] })),
      stripe.subscriptions.list({ limit: 100, status: 'all' }).catch(() => ({ data: [] }))
    ]);

    const userCustomerIds = new Set<string>();
    if (explicitCustId) userCustomerIds.add(explicitCustId);
    const subsToCancel = new Set<string>();
    if (subscriptionId) subsToCancel.add(subscriptionId);

    // 1. Gather all customer IDs and subscription IDs attached to this user from checkout sessions
    for (const s of sessions.data) {
      const sEmail = (s.customer_details?.email || s.customer_email || s.metadata?.userEmail || '').toLowerCase().trim();
      const sUid = (s.metadata?.userId || '').trim();
      const sUsername = (s.metadata?.username || '').toLowerCase().trim();

      const isMatch =
        (cleanUid && sUid === cleanUid) ||
        (cleanUsername && sUsername === cleanUsername) ||
        (cleanEmail && sEmail === cleanEmail);

      if (isMatch) {
        if (s.customer) {
          userCustomerIds.add(typeof s.customer === 'string' ? s.customer : s.customer.id);
        }
        if (s.subscription) {
          subsToCancel.add(typeof s.subscription === 'string' ? s.subscription : s.subscription.id);
        }
      }
    }

    // 2. Identify active subscriptions in Stripe matching this account or customer
    for (const s of subs.data) {
      const subUid = (s.metadata?.userId || '').trim();
      const subEmail = (s.metadata?.userEmail || '').toLowerCase().trim();
      const subUsername = (s.metadata?.username || '').toLowerCase().trim();
      const subCustomer = typeof s.customer === 'string' ? s.customer : s.customer?.id;

      const isMatch =
        (subscriptionId && s.id === subscriptionId) ||
        (cleanUid && subUid === cleanUid) ||
        (cleanUsername && subUsername === cleanUsername) ||
        (cleanEmail && subEmail === cleanEmail) ||
        (subCustomer && userCustomerIds.has(subCustomer));

      if (isMatch && (s.status === 'active' || s.status === 'trialing' || s.status === 'past_due')) {
        subsToCancel.add(s.id);
      }
    }

    // 3. Check customer records directly if searchEmail is provided and nothing was matched yet
    if (subsToCancel.size === 0 && cleanEmail && cleanEmail.includes('@')) {
      try {
        const custs = await stripe.customers.list({ email: cleanEmail, limit: 10 }).catch(() => ({ data: [] }));
        for (const c of custs.data) {
          userCustomerIds.add(c.id);
          for (const s of subs.data) {
            const subCustomer = typeof s.customer === 'string' ? s.customer : s.customer?.id;
            if (subCustomer === c.id && (s.status === 'active' || s.status === 'trialing')) {
              subsToCancel.add(s.id);
            }
          }
        }
      } catch (e) {
        // Non-blocking
      }
    }

    // 4. Cancel all identified active subscriptions on Stripe
    let cancelledCount = 0;
    for (const subId of Array.from(subsToCancel)) {
      try {
        await stripe.subscriptions.cancel(subId);
        cancelledCount++;
      } catch (cancelErr: any) {
        console.warn('Stripe subscription cancel warning for', subId, cancelErr?.message);
      }
    }

    return res.status(200).json({
      success: true,
      message: cancelledCount > 0
        ? 'Monthly subscription cancelled successfully on Stripe.'
        : 'Subscription status reset to Free.',
      cancelledCount
    });
  } catch (err: any) {
    console.error('Vercel API Cancel Subscription Error:', err);
    return res.status(200).json({
      success: true,
      notFoundOnStripe: true,
      message: 'Subscription status reset to Free.'
    });
  }
}
