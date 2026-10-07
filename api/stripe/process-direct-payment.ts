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
  res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'METHOD_NOT_ALLOWED', message: 'Only POST method is allowed.' });
  }

  try {
    const {
      token,
      cardNumber,
      expMonth,
      expYear,
      cardCvc,
      cardName,
      amount,
      itemName,
      itemType,
      itemId,
      actionDelta,
      userId,
      userEmail,
      username
    } = req.body || {};

    if (!amount || typeof amount !== 'number' || amount <= 0) {
      return res.status(400).json({ error: 'INVALID_AMOUNT', message: 'Valid amount is required.' });
    }

    const amountInCents = Math.round(amount * 100);
    const safeItemName = String(itemName || 'Market Purchase').replace(/[^\w\s\-\.\,\(\)]/gi, '').trim() || 'Market Purchase';
    const safeUsername = String(username || 'Player').replace(/[^\w\s\-\.]/gi, '').trim() || 'Player';
    const stripe = getStripe();

    if (!stripe) {
      return res.status(400).json({
        error: 'STRIPE_NOT_CONFIGURED',
        message: 'STRIPE_SECRET_KEY is not configured in Vercel environment variables. Please add your Stripe Secret Key in Vercel Project Settings.'
      });
    }

    let chargeSource = token;

    if (!chargeSource && cardNumber) {
      const cleanNum = String(cardNumber).replace(/[\s-]/g, '');
      const cardToken = await stripe.tokens.create({
        card: {
          number: cleanNum,
          exp_month: String(expMonth || '').trim() as any,
          exp_year: String(expYear || '').trim() as any,
          cvc: String(cardCvc || '').trim(),
          name: String(cardName || safeUsername).trim()
        } as any
      });
      chargeSource = cardToken.id;
    }

    if (!chargeSource) {
      return res.status(400).json({
        error: 'MISSING_PAYMENT_DETAILS',
        message: 'Card details or payment token are required.'
      });
    }

    const charge = await stripe.charges.create({
      amount: amountInCents,
      currency: 'usd',
      source: chargeSource,
      description: `Aifinity: ${safeItemName} for ${safeUsername}`,
      receipt_email: userEmail && userEmail.includes('@') ? userEmail : undefined,
      metadata: {
        userId: String(userId || ''),
        username: safeUsername,
        itemName: safeItemName,
        itemType: String(itemType || ''),
        itemId: String(itemId || ''),
        actionDelta: String(actionDelta || 0),
        amount: String(amount)
      }
    });

    return res.status(200).json({
      success: true,
      chargeId: charge.id,
      receiptUrl: charge.receipt_url,
      amount: charge.amount / 100,
      status: charge.status,
      paymentMethodDetails: charge.payment_method_details?.card
        ? `${charge.payment_method_details.card.brand.toUpperCase()} •••• ${charge.payment_method_details.card.last4}`
        : 'Card (Stripe)'
    });
  } catch (err: any) {
    console.error('Vercel API Stripe Direct Charge Error:', err);
    const stripeError = err.raw || err;
    return res.status(400).json({
      error: stripeError.code || 'STRIPE_CHARGE_FAILED',
      message: stripeError.message || err.message || 'Payment processing failed. Please check card details.',
      declineCode: stripeError.decline_code
    });
  }
}
