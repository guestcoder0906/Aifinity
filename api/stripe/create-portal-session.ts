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
    const {
      customerId: bodyCustomerId,
      stripeCustomerId,
      userId,
      userEmail,
      username,
      stripeSubscriptionId,
      origin: clientOrigin
    } = req.body || {};

    let origin = String(clientOrigin || req.headers?.referer || req.headers?.origin || '').trim();
    if (origin.endsWith('/')) origin = origin.slice(0, -1);
    if (!origin || origin === 'null') {
      const proto = req.headers?.['x-forwarded-proto'] || 'https';
      const host = req.headers?.['x-forwarded-host'] || req.headers?.host || 'www.aifinity-rpg.com';
      origin = `${proto}://${host}`;
    }
    if (!origin.startsWith('http://') && !origin.startsWith('https://')) {
      origin = `https://${origin}`;
    }
    origin = origin.replace(/\/+$/, '');

    const stripe = getStripe();
    if (!stripe) {
      return res.status(400).json({ error: 'STRIPE_NOT_CONFIGURED', message: 'Stripe is not configured in server environment.' });
    }

    const cleanEmail = (userEmail || '').trim().toLowerCase();
    const cleanUsername = (username || '').trim().toLowerCase();
    const cleanUid = (userId || '').trim();

    let customerId: string | undefined = bodyCustomerId || stripeCustomerId;

    // Fast parallel lookup if not provided directly
    if (!customerId) {
      const [sessionsRes, subsRes, customersRes] = await Promise.all([
        stripe.checkout.sessions.list({ limit: 100 }).catch(() => ({ data: [] })),
        stripe.subscriptions.list({ limit: 100, status: 'all' }).catch(() => ({ data: [] })),
        cleanEmail.includes('@')
          ? stripe.customers.list({ email: cleanEmail, limit: 10 }).catch(() => ({ data: [] }))
          : Promise.resolve({ data: [] })
      ]);

      // A. Direct customer match by email
      if (customersRes.data.length > 0) {
        customerId = customersRes.data[0].id;
      }

      // B. Match checkout sessions
      const matchedCustomerIds = new Set<string>();
      for (const s of sessionsRes.data) {
        const sEmail = (s.customer_details?.email || s.customer_email || s.metadata?.userEmail || '').toLowerCase().trim();
        const sUid = (s.metadata?.userId || '').trim();
        const sUsername = (s.metadata?.username || '').toLowerCase().trim();

        if (
          (cleanUid && sUid === cleanUid) ||
          (cleanEmail && sEmail === cleanEmail) ||
          (cleanUsername && sUsername === cleanUsername)
        ) {
          if (s.customer) {
            const cId = typeof s.customer === 'string' ? s.customer : s.customer.id;
            matchedCustomerIds.add(cId);
            if (!customerId) customerId = cId;
          }
        }
      }

      // C. Match subscriptions
      if (!customerId) {
        for (const sub of subsRes.data) {
          const subUid = (sub.metadata?.userId || '').trim();
          const subEmail = (sub.metadata?.userEmail || '').toLowerCase().trim();
          const subUsername = (sub.metadata?.username || '').toLowerCase().trim();
          const subCust = typeof sub.customer === 'string' ? sub.customer : sub.customer?.id;

          if (
            (stripeSubscriptionId && sub.id === stripeSubscriptionId) ||
            (cleanUid && subUid === cleanUid) ||
            (cleanEmail && subEmail === cleanEmail) ||
            (cleanUsername && subUsername === cleanUsername) ||
            (subCust && matchedCustomerIds.has(subCust))
          ) {
            if (sub.customer) {
              customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer.id;
              break;
            }
          }
        }
      }

      // D. Broad customer scan if still missing
      if (!customerId) {
        const allCustomers = await stripe.customers.list({ limit: 50 }).catch(() => ({ data: [] }));
        for (const c of allCustomers.data) {
          const cEmail = (c.email || c.metadata?.userEmail || '').toLowerCase().trim();
          const cUid = (c.metadata?.userId || '').trim();
          const cUsername = (c.metadata?.username || '').toLowerCase().trim();

          if (
            (cleanEmail && cEmail === cleanEmail) ||
            (cleanUid && cUid === cleanUid) ||
            (cleanUsername && cUsername === cleanUsername)
          ) {
            customerId = c.id;
            break;
          }
        }
      }

      // E. If no customer exists on Stripe yet, auto-create one so the portal can open
      if (!customerId) {
        try {
          const newCust = await stripe.customers.create({
            email: cleanEmail || undefined,
            name: username || undefined,
            metadata: {
              userId: cleanUid,
              username: cleanUsername,
              autoCreated: 'true'
            }
          });
          customerId = newCust.id;
        } catch (createCustErr: any) {
          console.warn('Auto-create Stripe customer note:', createCustErr?.message);
        }
      }
    }

    if (!customerId) {
      return res.status(404).json({
        error: 'CUSTOMER_NOT_FOUND',
        message: 'No Stripe customer account was found for your user profile. You can click "Cancel Subscription" below to reset your plan to Free.'
      });
    }

    try {
      const portalSession = await stripe.billingPortal.sessions.create({
        customer: customerId,
        return_url: `${origin}/?stripe_portal_return=true`
      });

      return res.status(200).json({
        success: true,
        url: portalSession.url
      });
    } catch (portalErr: any) {
      console.warn('Stripe customer portal session error:', portalErr?.message);
      return res.status(200).json({
        success: false,
        portalNotConfigured: true,
        message: 'Stripe Customer Portal is currently in test mode or not activated in the Stripe Dashboard. You can cancel your subscription directly here with one click.'
      });
    }
  } catch (err: any) {
    console.error('Vercel API Create Customer Portal Session Error:', err);
    return res.status(500).json({
      error: 'PORTAL_ERROR',
      message: err.message || 'Failed to create Stripe Customer Portal session.'
    });
  }
}
