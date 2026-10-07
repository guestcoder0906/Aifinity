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
  // Global CORS Headers for custom domains (aifinity-rpg.com / www.aifinity-rpg.com) and previews
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const userId = String(req.query?.userId || req.body?.userId || '').trim();
    const email = String(req.query?.email || req.body?.email || '').trim().toLowerCase();
    const username = String(req.query?.username || req.body?.username || '').trim().toLowerCase();

    if (!userId && !email && !username) {
      return res.status(400).json({
        error: 'MISSING_PARAMS',
        message: 'userId, email, or username is required to sync purchases.'
      });
    }

    const stripe = getStripe();
    if (!stripe) {
      return res.status(200).json({
        success: true,
        count: 0,
        purchases: [],
        activeSubscription: null,
        totalPackActions: 0,
        highestPurchasedTier: null
      });
    }

    const [sessions, subscriptions] = await Promise.all([
      stripe.checkout.sessions.list({ limit: 100 }).catch(() => ({ data: [] })),
      stripe.subscriptions.list({ limit: 100, status: 'all' }).catch(() => ({ data: [] }))
    ]);

    const completedPurchases: any[] = [];
    const seenIds = new Set<string>();
    const userCustomerIds = new Set<string>();

    for (const s of sessions.data) {
      const isPaid = s.payment_status === 'paid' || s.status === 'complete';
      if (!isPaid) continue;
      if (seenIds.has(s.id)) continue;

      const sEmail = (s.customer_details?.email || s.customer_email || s.metadata?.userEmail || '').toLowerCase().trim();
      const sUid = (s.metadata?.userId || '').trim();
      const sUsername = (s.metadata?.username || '').toLowerCase().trim();

      let isMatch = false;

      // Strict purchase attribution: match by userId, username, or email
      if (userId && sUid && sUid === userId) {
        isMatch = true;
      } else if (username && sUsername && sUsername === username) {
        isMatch = true;
      } else if (email && sEmail && sEmail === email && (!sUid || sUid === userId)) {
        isMatch = true;
      }

      if (isMatch) {
        seenIds.add(s.id);
        if (s.customer) {
          userCustomerIds.add(typeof s.customer === 'string' ? s.customer : s.customer.id);
        }
        const attachedUsername = s.metadata?.username || username || '';
        completedPurchases.push({
          id: s.id,
          amount: (s.amount_total || 0) / 100,
          itemType: (s.metadata?.itemType || (s.metadata?.itemId === 'adventurer' || s.metadata?.itemId === 'legendary' || s.metadata?.itemId === 'celestial' ? 'tier' : 'pack')) as 'pack' | 'tier',
          itemId: s.metadata?.itemId || '',
          itemName: s.metadata?.itemName || (s.amount_total === 499 ? 'Adventurer Tier' : s.amount_total === 999 ? 'Legendary Tier' : s.amount_total === 1499 ? 'Celestial Tier' : 'Action Pack Purchase'),
          actionDelta: parseInt(s.metadata?.actionDelta, 10) || (s.amount_total === 99 ? 50 : s.amount_total === 299 ? 200 : 0),
          email: sEmail || email,
          userId: sUid || userId,
          username: attachedUsername,
          customerName: s.customer_details?.name || attachedUsername || 'Customer',
          paymentMethod: s.mode === 'subscription' ? 'Stripe Monthly Subscription' : 'Stripe Checkout',
          status: 'completed',
          createdAt: new Date(s.created * 1000).toISOString()
        });
      }
    }

    // Find active monthly subscription attached to this account
    let activeSub: any = null;
    for (const sub of subscriptions.data) {
      const subUid = (sub.metadata?.userId || '').trim();
      const subUsername = (sub.metadata?.username || '').trim().toLowerCase();
      const subCustomer = typeof sub.customer === 'string' ? sub.customer : sub.customer?.id;

      const isSubMatch =
        (userId && subUid === userId) ||
        (username && subUsername === username) ||
        (subCustomer && userCustomerIds.has(subCustomer));

      if (isSubMatch) {
        const isLive = sub.status === 'active' || sub.status === 'trialing';
        const tierId = (sub.metadata?.itemId as any) ||
          (sub.items.data[0]?.price?.unit_amount === 499 ? 'adventurer' :
           sub.items.data[0]?.price?.unit_amount === 999 ? 'legendary' :
           sub.items.data[0]?.price?.unit_amount === 1499 ? 'celestial' : 'adventurer');

        const periodEnd = new Date(sub.current_period_end * 1000).toISOString();

        if (isLive || !activeSub) {
          activeSub = {
            id: sub.id,
            tierId,
            itemName: tierId === 'celestial' ? 'Celestial Tier' : tierId === 'legendary' ? 'Legendary Tier' : 'Adventurer Tier',
            status: sub.status,
            periodEnd,
            cancelAtPeriodEnd: Boolean(sub.cancel_at_period_end),
            customerId: subCustomer
          };
          if (isLive) break;
        }
      }
    }

    // Compute total lifetime action pack credits purchased
    let totalPackActions = 0;
    const tierRank: Record<string, number> = { free: 0, adventurer: 1, legendary: 2, celestial: 3 };
    let highestPurchasedTier: string | null = activeSub?.tierId || null;

    for (const p of completedPurchases) {
      if (p.itemType === 'pack' && p.actionDelta > 0) {
        totalPackActions += p.actionDelta;
      } else if (p.itemType === 'tier' && p.itemId) {
        const rank = tierRank[p.itemId] || 0;
        const currentRank = highestPurchasedTier ? (tierRank[highestPurchasedTier] || 0) : 0;
        if (rank > currentRank) {
          highestPurchasedTier = p.itemId;
        }
      }
    }

    return res.status(200).json({
      success: true,
      count: completedPurchases.length,
      purchases: completedPurchases,
      activeSubscription: activeSub,
      totalPackActions,
      highestPurchasedTier
    });
  } catch (err: any) {
    console.error('Vercel API Stripe Sync Purchases Error:', err);
    return res.status(500).json({
      error: 'SYNC_FAILED',
      message: err.message || 'Failed to sync Stripe purchases'
    });
  }
}
