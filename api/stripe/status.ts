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
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const hasSecretKey = !!process.env.STRIPE_SECRET_KEY;
  const hasPub = !!process.env.VITE_STRIPE_PUBLISHABLE_KEY;
  const isLive = (process.env.STRIPE_SECRET_KEY || '').startsWith('sk_live_');

  return res.status(200).json({
    configured: hasSecretKey,
    hasPublishableKey: hasPub,
    publishableKey: process.env.VITE_STRIPE_PUBLISHABLE_KEY || null,
    mode: isLive ? 'live' : 'test'
  });
}
