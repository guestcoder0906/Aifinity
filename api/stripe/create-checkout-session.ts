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
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'METHOD_NOT_ALLOWED', message: 'Only POST method is allowed.' });
  }

  try {
    const stripe = getStripe();
    if (!stripe) {
      return res.status(400).json({
        error: 'STRIPE_NOT_CONFIGURED',
        message: 'STRIPE_SECRET_KEY is not configured in Vercel environment variables. Please add your Stripe Secret Key in Vercel Project Settings.'
      });
    }

    const { amount, itemName, itemType, itemId, actionDelta, userId, userEmail, username, origin: clientOrigin } = req.body || {};
    if (!amount || typeof amount !== 'number' || amount <= 0) {
      return res.status(400).json({ error: 'INVALID_AMOUNT', message: 'Valid amount in USD is required.' });
    }

    let origin = String(clientOrigin || req.headers?.origin || '').trim();
    if (!origin || origin === 'null') {
      const proto = req.headers?.['x-forwarded-proto'] || 'https';
      const host = req.headers?.['x-forwarded-host'] || req.headers?.host || 'www.aifinity-rpg.com';
      origin = `${proto}://${host}`;
    }
    if (!origin.startsWith('http://') && !origin.startsWith('https://')) {
      origin = `https://${origin}`;
    }
    origin = origin.replace(/\/+$/, '');

    const amountInCents = Math.round(amount * 100);
    const safeItemName = String(itemName || 'Market Purchase').replace(/[^\w\s\-\.\,\(\)]/gi, '').trim() || 'Market Purchase';
    const safeUsername = String(username || 'Player').replace(/[^\w\s\-\.]/gi, '').trim() || 'Player';
    const isSubscription = itemType === 'tier' || itemId === 'adventurer' || itemId === 'legendary' || itemId === 'celestial';

    const sessionParams: any = {
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: {
            name: `Aifinity: ${safeItemName}`,
            description: itemType === 'pack'
              ? `Action Pack (+${actionDelta || 0} Actions) for ${safeUsername}`
              : `${safeItemName} Monthly Membership for ${safeUsername}`
          },
          unit_amount: amountInCents,
          ...(isSubscription ? { recurring: { interval: 'month' } } : {})
        },
        quantity: 1
      }],
      mode: isSubscription ? 'subscription' : 'payment',
      customer_email: userEmail && userEmail.includes('@') ? userEmail : undefined,
      metadata: {
        userId: String(userId || ''),
        username: safeUsername,
        itemName: safeItemName,
        itemType: String(itemType || ''),
        itemId: String(itemId || ''),
        actionDelta: String(actionDelta || 0),
        amount: String(amount),
        userEmail: String(userEmail || '')
      },
      success_url: `${origin}/?stripe_session_id={CHECKOUT_SESSION_ID}&stripe_status=success`,
      cancel_url: `${origin}/?stripe_status=cancelled`
    };

    if (isSubscription) {
      sessionParams.subscription_data = {
        metadata: {
          userId: String(userId || ''),
          username: safeUsername,
          itemName: safeItemName,
          itemId: String(itemId || ''),
          userEmail: String(userEmail || '')
        }
      };
    }

    const session = await stripe.checkout.sessions.create(sessionParams);

    return res.status(200).json({
      url: session.url,
      sessionId: session.id
    });
  } catch (err: any) {
    console.error('Vercel API Stripe Checkout Error:', err);
    return res.status(500).json({
      error: 'STRIPE_CHECKOUT_FAILED',
      message: err.message || 'Failed to create Stripe Checkout session.'
    });
  }
}
