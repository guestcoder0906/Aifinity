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
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const stripe = getStripe();
    if (!stripe) {
      return res.status(400).json({
        error: 'STRIPE_NOT_CONFIGURED',
        message: 'STRIPE_SECRET_KEY is not configured.'
      });
    }

    const sessionId = (req.query?.sessionId || req.body?.sessionId) as string;
    if (!sessionId) {
      return res.status(400).json({ error: 'MISSING_SESSION_ID', message: 'Session ID is required.' });
    }

    const session = await stripe.checkout.sessions.retrieve(sessionId);
    const isPaid = session.payment_status === 'paid' || session.status === 'complete';

    return res.status(200).json({
      paid: isPaid,
      status: session.status,
      payment_status: session.payment_status,
      sessionId: session.id,
      paymentIntentId: session.payment_intent,
      amount: (session.amount_total || 0) / 100,
      customerEmail: session.customer_details?.email || session.customer_email || null,
      customerName: session.customer_details?.name || null,
      metadata: session.metadata || {}
    });
  } catch (err: any) {
    console.error('Vercel API Stripe Verify Error:', err);
    return res.status(500).json({
      error: 'STRIPE_VERIFY_FAILED',
      message: err.message || 'Failed to verify session.'
    });
  }
}
