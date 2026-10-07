import React, { useState, useEffect } from 'react';
import { safeStorage, safeSessionStorage } from '../services/safeStorage';
import {
  X,
  Zap,
  Crown,
  Key,
  CreditCard,
  CheckCircle2,
  ExternalLink,
  Sparkles,
  ShieldCheck,
  ArrowRight,
  BookOpen,
  Lock,
  UserPlus,
  AlertCircle,
  Copy,
  Check,
  Receipt as ReceiptIcon,
  FileText,
  Printer,
  RefreshCw
} from 'lucide-react';
import {
  ACTION_PACKS,
  SUBSCRIPTION_TIERS,
  ActionPack,
  SubscriptionTier,
  ActionLimitService,
  ActionStatus
} from '../services/actionLimitService';
import {
  UserProfile,
  recordPaymentTransaction,
  isDefaultAdmin,
  PaymentTransactionRecord,
  getLocalTransactions
} from '../services/authService';
import {
  createRealStripeCheckoutSession,
  checkStripeSessionStatus,
  syncUserPurchasesFromStripe,
  cancelStripeSubscription,
  createStripeCustomerPortalSession
} from '../services/stripeCheckoutService';
import { ReceiptModal } from './ReceiptModal';
import { ReceiptsList } from './ReceiptsList';

interface MarketModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: UserProfile | null;
  actionStatus?: ActionStatus;
  onStatusUpdated: () => void;
  onProfileUpdated?: (updatedUser: UserProfile) => void;
  initialTab?: 'packs' | 'subscriptions' | 'apikey' | 'receipts';
  onOpenAuth?: () => void;
  guestId?: string;
}

export const MarketModal: React.FC<MarketModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  actionStatus,
  onStatusUpdated,
  onProfileUpdated,
  initialTab = 'packs',
  onOpenAuth,
  guestId
}) => {
  const effectiveStatus = actionStatus || ActionLimitService.getActionStatus(currentUser, guestId);
  const isGuest = !currentUser;
  const isAdmin = currentUser?.role === 'admin' || isDefaultAdmin(currentUser?.email, currentUser?.username);

  const [activeTab, setActiveTab] = useState<'packs' | 'subscriptions' | 'apikey' | 'receipts'>(initialTab);
  const [selectedReceiptForInvoice, setSelectedReceiptForInvoice] = useState<PaymentTransactionRecord | null>(null);
  const [selectedItem, setSelectedItem] = useState<{ type: 'pack' | 'tier'; data: ActionPack | SubscriptionTier } | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<'stripe_checkout' | 'card'>('stripe_checkout');
  const [checkoutSessionUrl, setCheckoutSessionUrl] = useState<string | null>(null);
  const [processingMessage, setProcessingMessage] = useState<string | null>(null);
  const [cardNumber, setCardNumber] = useState('');
  const [cardExp, setCardExp] = useState('');
  const [cardCvc, setCardCvc] = useState('');
  const [cardName, setCardName] = useState('');
  const [cardError, setCardError] = useState<string | null>(null);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [paymentDebugDetails, setPaymentDebugDetails] = useState<any>(null);
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);

  // Guest warning prompt state
  const [guestNoticeOpen, setGuestNoticeOpen] = useState(false);
  const [attemptedItemName, setAttemptedItemName] = useState('');

  // Successful transaction digital receipt
  const [transactionReceipt, setTransactionReceipt] = useState<{
    id: string;
    itemName: string;
    amount: number;
    paymentMethod: string;
    timestamp: string;
    actionDelta?: number;
    newTier?: string;
    stripePaymentIntentId?: string;
    mode?: 'live' | 'test';
  } | null>(null);

  const [copiedTxId, setCopiedTxId] = useState(false);
  const [waitingSessionId, setWaitingSessionId] = useState<string | null>(null);
  const [isSyncingPurchases, setIsSyncingPurchases] = useState(false);
  const [syncStatusMessage, setSyncStatusMessage] = useState<{ type: 'success' | 'info' | 'error'; text: string } | null>(null);
  const [isCancellingSubscription, setIsCancellingSubscription] = useState(false);
  const [isOpeningPortal, setIsOpeningPortal] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [cancelSuccessMessage, setCancelSuccessMessage] = useState<string | null>(null);
  const [cancelErrorMessage, setCancelErrorMessage] = useState<string | null>(null);
  const pollingIntervalRef = React.useRef<number | null>(null);

  // Direct cancellation of active monthly subscription
  const handleCancelSubscription = async () => {
    if (!currentUser?.uid) return;
    setIsCancellingSubscription(true);
    setCancelErrorMessage(null);
    let res: any = null;
    try {
      res = await cancelStripeSubscription(
        currentUser.uid,
        currentUser.stripeSubscriptionId,
        currentUser.email || undefined,
        currentUser.username || undefined,
        currentUser.stripeCustomerId || undefined
      );
    } catch (e) {
      console.warn('Stripe cancellation call warning:', e);
    }

    try {
      const updated = await ActionLimitService.cancelSubscription(currentUser, guestId);
      if (onProfileUpdated) onProfileUpdated({ ...updated });
      onStatusUpdated();
      setShowCancelConfirm(false);
      
      const successText = res?.notFoundOnStripe
        ? 'Your account plan has been updated to Free.'
        : res?.message || 'Your monthly subscription has been successfully cancelled on Stripe and your account has returned to Free.';

      setCancelSuccessMessage(successText);

      setTimeout(() => setCancelSuccessMessage(null), 10000);
    } catch (err: any) {
      console.error('Failed to update local cancellation status:', err);
      setCancelSuccessMessage('Your monthly subscription has been cancelled and updated to Free.');
      setTimeout(() => setCancelSuccessMessage(null), 10000);
    } finally {
      setIsCancellingSubscription(false);
    }
  };

  // Direct portal redirect to Stripe Customer Portal
  const handleOpenStripePortal = async () => {
    if (!currentUser?.uid) return;
    setIsOpeningPortal(true);
    setCancelErrorMessage(null);
    try {
      const portalUrl = await createStripeCustomerPortalSession(
        currentUser.uid,
        currentUser.email || undefined,
        currentUser.username || undefined,
        currentUser.stripeSubscriptionId || undefined,
        typeof window !== 'undefined' ? window.location.origin : 'https://www.aifinity-rpg.com',
        currentUser.stripeCustomerId || undefined
      );
      if (portalUrl) {
        window.location.href = portalUrl;
      } else {
        throw new Error('Stripe did not return a valid customer portal link.');
      }
    } catch (err: any) {
      setCancelErrorMessage(
        err.message || 'Stripe Customer Portal is currently in test mode or unavailable. You can click "Yes, Cancel" below to reset your plan to Free.'
      );
      setShowCancelConfirm(true);
    } finally {
      setIsOpeningPortal(false);
    }
  };

  useEffect(() => {
    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
    };
  }, []);

  // Check and restore all completed Stripe purchases for current account
  const handleSyncStripePurchases = async () => {
    if (!currentUser || !currentUser.uid) {
      setSyncStatusMessage({
        type: 'info',
        text: 'Please log in to your account first so we can match your Stripe purchases.'
      });
      return;
    }
    setIsSyncingPurchases(true);
    setSyncStatusMessage({
      type: 'info',
      text: 'Connecting to Stripe to scan for completed transactions...'
    });

    try {
      const syncRes = await syncUserPurchasesFromStripe(
        currentUser.uid,
        currentUser.email || undefined,
        currentUser.username || undefined
      );
      if (syncRes.success && syncRes.purchases && syncRes.purchases.length > 0) {
        const localTx = getLocalTransactions(currentUser.uid);
        const existingIds = new Set<string>(localTx.map((t) => t.id));
        localTx.forEach((t) => {
          if (t?.id) existingIds.add(String(t.id).replace(/[^a-zA-Z0-9_-]/g, '_'));
        });

        // Also cross-reference Firestore and UserProfile credited IDs
        try {
          const firestoreTx = await getUserTransactions(currentUser.uid);
          firestoreTx.forEach((t) => {
            if (t?.id) {
              existingIds.add(t.id);
              existingIds.add(String(t.id).replace(/[^a-zA-Z0-9_-]/g, '_'));
            }
          });
        } catch (e) {}

        if (Array.isArray(currentUser.creditedActionTxIds)) {
          currentUser.creditedActionTxIds.forEach((id) => {
            existingIds.add(id);
            existingIds.add(String(id).replace(/[^a-zA-Z0-9_-]/g, '_'));
          });
        }
        if (Array.isArray(currentUser.appliedTransactionIds)) {
          currentUser.appliedTransactionIds.forEach((id) => {
            existingIds.add(id);
            existingIds.add(String(id).replace(/[^a-zA-Z0-9_-]/g, '_'));
          });
        }
        try {
          const rawCred = localStorage.getItem(`aifinity_credited_txs_${currentUser.uid}`);
          if (rawCred) {
            const parsedCred = JSON.parse(rawCred);
            if (Array.isArray(parsedCred)) {
              parsedCred.forEach((id: string) => {
                existingIds.add(id);
                existingIds.add(String(id).replace(/[^a-zA-Z0-9_-]/g, '_'));
              });
            }
          }
        } catch (e) {}

        let totalNewCredits = 0;
        let newlyRestoredCount = 0;
        const newTxIdsToCredit: string[] = [];
        let totalLifetimePackActions = 0;

        const tierRank: Record<string, number> = {
          free: 0,
          adventurer: 1,
          legendary: 2,
          celestial: 3
        };

        let bestPurchasedTier: 'adventurer' | 'legendary' | 'celestial' | null = null;

        for (const p of syncRes.purchases) {
          if (p.itemType === 'pack' && p.actionDelta > 0) {
            totalLifetimePackActions += p.actionDelta;
          }

          if (p.itemType === 'tier' && p.itemId) {
            const rank = tierRank[p.itemId] || 0;
            const currentBestRank = bestPurchasedTier ? tierRank[bestPurchasedTier] : 0;
            if (rank > currentBestRank) {
              bestPurchasedTier = p.itemId as any;
            }
          }

          const safeId = String(p.id).replace(/[^a-zA-Z0-9_-]/g, '_');
          const isAlreadyCredited = existingIds.has(p.id) || existingIds.has(safeId);

          if (!isAlreadyCredited) {
            newlyRestoredCount++;
            if (p.itemType === 'pack' && p.actionDelta > 0) {
              totalNewCredits += p.actionDelta;
              newTxIdsToCredit.push(p.id);
              newTxIdsToCredit.push(safeId);
            }

            const tx: PaymentTransactionRecord = {
              id: p.id,
              amount: p.amount,
              itemName: p.itemName,
              itemType: p.itemType,
              paymentMethod: 'Stripe Checkout',
              status: 'completed',
              createdAt: p.createdAt,
              customerName: p.customerName || p.username || currentUser.username || 'Adventurer',
              email: p.email || currentUser.email || undefined,
              attachedUsername: p.username || currentUser.username || 'Adventurer',
              recipient: p.username || currentUser.username || currentUser.email || 'Adventurer',
              notes: p.itemType === 'pack' ? `Restored ${p.actionDelta} actions` : `Restored ${p.itemName}`,
              userId: p.userId || currentUser.uid,
              actionDelta: p.actionDelta,
              newTier: p.itemType === 'tier' ? p.itemId : undefined
            };
            await recordPaymentTransaction(currentUser.uid, tx);
            existingIds.add(p.id);
            existingIds.add(safeId);
          }
        }

        const currentTierRank = tierRank[currentUser.tier || 'free'] || 0;
        const bestRank = bestPurchasedTier ? (tierRank[bestPurchasedTier] || 0) : 0;
        const needsTierUpgrade = Boolean(bestPurchasedTier && bestRank > currentTierRank);

        let updated = currentUser;
        if (totalNewCredits > 0 || needsTierUpgrade) {
          const targetTier = needsTierUpgrade ? bestPurchasedTier : (bestPurchasedTier || undefined);
          updated = await ActionLimitService.applyRestoredPurchases(
            currentUser,
            totalNewCredits,
            targetTier as any,
            guestId,
            undefined,
            newTxIdsToCredit
          );
        }

        if (updated) {
          if (onProfileUpdated) onProfileUpdated({ ...updated });
          onStatusUpdated();
        }

        if (totalNewCredits > 0 || needsTierUpgrade) {
          setSyncStatusMessage({
            type: 'success',
            text: `🎉 Membership Verified! Added ${totalNewCredits > 0 ? `+${totalNewCredits} actions` : `credits`} ${bestPurchasedTier ? `& activated ${bestPurchasedTier.toUpperCase()} tier` : ''} on your account.`
          });
        } else {
          setSyncStatusMessage({
            type: 'info',
            text: `Verified ${syncRes.count} Stripe transaction(s). All purchases are already active on your account!`
          });
        }
      } else {
        setSyncStatusMessage({
          type: 'info',
          text: 'No pending or uncredited Stripe purchases were found for your email / account.'
        });
      }
    } catch (err: any) {
      setSyncStatusMessage({
        type: 'error',
        text: `Sync failed: ${err.message || 'Could not verify Stripe purchases'}`
      });
    } finally {
      setIsSyncingPurchases(false);
      setTimeout(() => setSyncStatusMessage(null), 8000);
    }
  };

  // Immediate manual verification of waiting Stripe session
  const handleManualCheckSession = async () => {
    if (!waitingSessionId) return;
    setProcessingMessage('Checking Stripe session payment status...');
    try {
      const statusData = await checkStripeSessionStatus(waitingSessionId);
      if (statusData.paid || statusData.status === 'complete') {
        if (pollingIntervalRef.current) {
          clearInterval(pollingIntervalRef.current);
          pollingIntervalRef.current = null;
        }

        const delta = selectedItem?.type === 'pack' ? (selectedItem.data as ActionPack).actions : 0;
        let updatedUser = currentUser;
        if (selectedItem?.type === 'pack' && delta > 0) {
          updatedUser = await ActionLimitService.addPurchasedCredits(currentUser, delta, guestId);
        } else if (selectedItem?.type === 'tier') {
          const targetTier = (selectedItem.data.id || 'adventurer') as any;
          updatedUser = await ActionLimitService.activateSubscription(currentUser, targetTier, guestId);
        }

        if (updatedUser) {
          if (onProfileUpdated) onProfileUpdated({ ...updatedUser });
          onStatusUpdated();
        }

        if (currentUser?.uid && selectedItem) {
          const txRecord: PaymentTransactionRecord = {
            id: waitingSessionId,
            amount: selectedItem.data.price,
            itemName: selectedItem.data.name,
            itemType: selectedItem.type,
            paymentMethod: 'Stripe Checkout',
            status: 'completed',
            createdAt: new Date().toISOString(),
            recipient: currentUser.username || currentUser.email || 'Adventurer',
            notes: selectedItem.type === 'pack' ? `Added ${delta} actions` : `Activated ${selectedItem.data.name}`,
            userId: currentUser.uid,
            actionDelta: delta,
            newTier: selectedItem.type === 'tier' ? selectedItem.data.id : undefined
          };
          await recordPaymentTransaction(currentUser.uid, txRecord);
        }

        // Broadcast across tabs
        try {
          safeStorage.setItem(
            'aifinity_payment_sync_event',
            JSON.stringify({ uid: currentUser?.uid, time: Date.now() })
          );
        } catch (e) {}

        setIsProcessingPayment(false);
        setProcessingMessage(null);
        const savedWaitingId = waitingSessionId;
        setWaitingSessionId(null);

        if (selectedItem) {
          setTransactionReceipt({
            id: savedWaitingId,
            itemName: selectedItem.data.name,
            amount: selectedItem.data.price,
            paymentMethod: 'Stripe Checkout',
            timestamp: new Date().toISOString(),
            actionDelta: delta,
            newTier: selectedItem.type === 'tier' ? selectedItem.data.id : undefined,
            stripePaymentIntentId: statusData.paymentIntentId || savedWaitingId,
            mode: stripeStatus?.mode || 'live'
          });
        }
      } else {
        setProcessingMessage('Stripe session is not marked as paid yet. Please finish paying in the Stripe window, then click verify again.');
      }
    } catch (e: any) {
      setProcessingMessage(`Verification error: ${e.message || 'Try again in a moment'}`);
    }
  };

  // Stripe status from server / environment
  const [stripeStatus, setStripeStatus] = useState<{
    configured: boolean;
    hasPublishableKey: boolean;
    publishableKey: string | null;
    mode: 'live' | 'test';
  } | null>(null);

  useEffect(() => {
    if (isOpen) {
      fetch('/api/stripe/status')
        .then(res => res.json())
        .then(data => setStripeStatus(data))
        .catch(() => {
          // default test fallback if server endpoint offline
          const clientPub = (import.meta as any).env?.VITE_STRIPE_PUBLISHABLE_KEY || '';
          setStripeStatus({
            configured: false,
            hasPublishableKey: !!clientPub,
            publishableKey: clientPub || null,
            mode: clientPub.startsWith('pk_live_') ? 'live' : 'test'
          });
        });
    }
  }, [isOpen]);

  // Custom API Key input
  const [customKeyInput, setCustomKeyInput] = useState(() => {
    try {
      return safeStorage.getItem('aimud_apikey') || '';
    } catch {
      return '';
    }
  });
  const [keySavedMessage, setKeySavedMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSelectPack = (pack: ActionPack) => {
    if (isGuest) {
      setAttemptedItemName(pack.name);
      setGuestNoticeOpen(true);
      return;
    }
    setSelectedItem({ type: 'pack', data: pack });
    setTransactionReceipt(null);
    setPaymentError(null);
    setCardError(null);
  };

  const handleSelectTier = (tier: SubscriptionTier) => {
    if (tier.id === 'free') return;
    if (isGuest) {
      setAttemptedItemName(tier.name);
      setGuestNoticeOpen(true);
      return;
    }
    setSelectedItem({ type: 'tier', data: tier });
    setTransactionReceipt(null);
    setPaymentError(null);
    setCardError(null);
  };

  const handleProcessPayment = async () => {
    if (!selectedItem) return;
    if (isGuest || !currentUser) {
      setGuestNoticeOpen(true);
      return;
    }

    setPaymentError(null);
    setCardError(null);
    setCheckoutSessionUrl(null);

    const activePub = stripeStatus?.publishableKey || (import.meta as any).env?.VITE_STRIPE_PUBLISHABLE_KEY || 'pk_test_TYooMQauvdEDq54NiTphI7jx';
    const isLiveMode = activePub.startsWith('pk_live_') || stripeStatus?.mode === 'live';

    // 1. STRIPE CHECKOUT FLOW (Official Stripe-hosted checkout supporting Google Pay, Apple Pay, Cards, Link)
    if (paymentMethod === 'stripe_checkout') {
      setIsProcessingPayment(true);
      setProcessingMessage('Connecting to Stripe Checkout...');

      try {
        const delta = selectedItem.type === 'pack' ? (selectedItem.data as ActionPack).actions : 0;
        const result = await createRealStripeCheckoutSession({
          amount: selectedItem.data.price,
          itemName: selectedItem.data.name,
          itemType: selectedItem.type,
          itemId: selectedItem.data.id,
          actionDelta: delta,
          user: currentUser
        });

        if (result.url) {
          setCheckoutSessionUrl(result.url);
          setWaitingSessionId(result.sessionId);
          setIsProcessingPayment(true);
          setProcessingMessage('Stripe Checkout window opened. Complete payment to receive your items automatically...');

          try {
            const checkoutMeta = {
              sessionId: result.sessionId,
              userId: currentUser?.uid,
              username: currentUser?.username,
              startedAt: Date.now()
            };
            safeSessionStorage.setItem('aifinity_active_stripe_checkout', JSON.stringify(checkoutMeta));
            safeStorage.setItem('aifinity_active_stripe_checkout', JSON.stringify(checkoutMeta));
          } catch (e) {}

          // Open Stripe checkout in window / new tab
          const isIframe = typeof window !== 'undefined' && window.self !== window.top;
          if (typeof window !== 'undefined') {
            if (isIframe) {
              window.open(result.url, '_blank');
            } else {
              try {
                window.location.href = result.url;
              } catch (navErr: any) {
                console.error('Direct window.location.href redirect error:', navErr);
                window.open(result.url, '_blank');
              }
            }
          }

          // Start active background polling to detect completed payment in real time
          if (pollingIntervalRef.current) {
            clearInterval(pollingIntervalRef.current);
          }
          pollingIntervalRef.current = window.setInterval(async () => {
            try {
              const statusData = await checkStripeSessionStatus(result.sessionId);
              if (statusData.paid || statusData.status === 'complete') {
                if (pollingIntervalRef.current) {
                  clearInterval(pollingIntervalRef.current);
                  pollingIntervalRef.current = null;
                }

                // Immediately credit user
                let updatedUser = currentUser;
                if (selectedItem.type === 'pack' && delta > 0) {
                  updatedUser = await ActionLimitService.addPurchasedCredits(currentUser, delta, guestId);
                } else if (selectedItem.type === 'tier') {
                  const targetTier = (selectedItem.data.id || 'adventurer') as any;
                  updatedUser = await ActionLimitService.activateSubscription(currentUser, targetTier, guestId);
                }

                if (updatedUser) {
                  if (onProfileUpdated) onProfileUpdated({ ...updatedUser });
                  onStatusUpdated();
                }

                if (currentUser?.uid) {
                  const txRecord: PaymentTransactionRecord = {
                    id: result.sessionId,
                    amount: selectedItem.data.price,
                    itemName: selectedItem.data.name,
                    itemType: selectedItem.type,
                    paymentMethod: 'Stripe Checkout',
                    status: 'completed',
                    createdAt: new Date().toISOString(),
                    customerName: currentUser.username || 'Adventurer',
                    email: currentUser.email || undefined,
                    attachedUsername: currentUser.username || 'Adventurer',
                    recipient: currentUser.username || currentUser.email || 'Adventurer',
                    notes: selectedItem.type === 'pack' ? `Added ${delta} actions` : `Activated ${selectedItem.data.name}`,
                    userId: currentUser.uid,
                    actionDelta: delta,
                    newTier: selectedItem.type === 'tier' ? selectedItem.data.id : undefined
                  };
                  await recordPaymentTransaction(currentUser.uid, txRecord);
                }

                // Cross-tab broadcast
                try {
                  safeStorage.setItem(
                    'aifinity_payment_sync_event',
                    JSON.stringify({ uid: currentUser?.uid, time: Date.now() })
                  );
                } catch (e) {}

                setIsProcessingPayment(false);
                setProcessingMessage(null);
                setWaitingSessionId(null);

                setTransactionReceipt({
                  id: result.sessionId,
                  itemName: selectedItem.data.name,
                  amount: selectedItem.data.price,
                  paymentMethod: 'Stripe Checkout',
                  timestamp: new Date().toISOString(),
                  actionDelta: delta,
                  newTier: selectedItem.type === 'tier' ? selectedItem.data.id : undefined,
                  stripePaymentIntentId: statusData.paymentIntentId || result.sessionId,
                  mode: stripeStatus?.mode || 'live'
                });
              }
            } catch (pollErr) {
              console.warn('Polling checkStripeSessionStatus error:', pollErr);
            }
          }, 2500);

          return;
        }

        throw new Error('Stripe did not return a valid checkout URL.');
      } catch (err: any) {
        console.error('Stripe Checkout session error (full):', err);
        const detailedMessage = err.message || (typeof err === 'string' ? err : JSON.stringify(err));
        setPaymentError(`Stripe Checkout Error: ${detailedMessage}`);
        setPaymentDebugDetails({
          errorName: err.name || 'Error',
          errorMessage: err.message,
          errorStack: err.stack,
          serverPayload: err.serverPayload,
          userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
          timestamp: new Date().toISOString()
        });
        setIsProcessingPayment(false);
        setProcessingMessage(null);
        return;
      }
    }

    // 2. DIRECT CREDIT / DEBIT CARD FLOW (Processed by Stripe API)
    if (paymentMethod === 'card') {
      const cleanCard = cardNumber.replace(/[\s-]/g, '');
      if (!cleanCard || cleanCard.length < 13 || cleanCard.length > 19 || !/^\d+$/.test(cleanCard)) {
        setCardError('Please enter a valid card number.');
        return;
      }
      if (!cardExp || !cardExp.includes('/')) {
        setCardError('Please enter expiration date in MM/YY format.');
        return;
      }
      const [mStr, yStr] = cardExp.split('/').map(s => s.trim());
      const expMonth = parseInt(mStr, 10);
      const expYear = parseInt(yStr.length === 2 ? '20' + yStr : yStr, 10);
      const nowYear = new Date().getFullYear();
      const nowMonth = new Date().getMonth() + 1;
      if (isNaN(expMonth) || expMonth < 1 || expMonth > 12 || isNaN(expYear) || expYear < nowYear || (expYear === nowYear && expMonth < nowMonth)) {
        setCardError('Card has expired or expiration date is invalid.');
        return;
      }
      if (!cardCvc || cardCvc.length < 3 || cardCvc.length > 4 || !/^\d+$/.test(cardCvc)) {
        setCardError('Please enter a valid 3 or 4-digit CVC code.');
        return;
      }

      setIsProcessingPayment(true);
      setProcessingMessage('Processing payment with Stripe...');

      try {
        const chargeRes = await fetch('/api/stripe/process-direct-payment', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          body: JSON.stringify({
            cardNumber: cleanCard,
            expMonth,
            expYear,
            cardCvc,
            cardName: cardName.trim() || currentUser.username || 'Player',
            amount: selectedItem.data.price,
            itemName: selectedItem.data.name,
            itemType: selectedItem.type,
            itemId: selectedItem.data.id,
            actionDelta: selectedItem.type === 'pack' ? (selectedItem.data as ActionPack).actions : 0,
            userId: currentUser.uid,
            userEmail: currentUser.email || '',
            username: currentUser.username || ''
          })
        });

        const contentType = chargeRes.headers.get('content-type') || '';
        let chargeData: any = null;
        if (contentType.includes('application/json')) {
          chargeData = await chargeRes.json().catch(() => null);
        }

        if (!chargeRes.ok || !chargeData || !chargeData.success) {
          const errMsg = chargeData?.message || `Payment processing failed (HTTP ${chargeRes.status}).`;
          const errObj = new Error(errMsg);
          (errObj as any).serverPayload = chargeData;
          throw errObj;
        }

        // Apply purchased credits or subscription only upon verified charge
        let actionDelta: number | undefined;
        let newTier: string | undefined;
        let updatedProfile: UserProfile = currentUser;

        if (selectedItem.type === 'pack') {
          const pack = selectedItem.data as ActionPack;
          updatedProfile = await ActionLimitService.addPurchasedCredits(currentUser, pack.actions);
          actionDelta = pack.actions;
        } else {
          const tier = selectedItem.data as SubscriptionTier;
          updatedProfile = await ActionLimitService.activateSubscription(currentUser, tier.id);
          newTier = tier.name;
        }

        // Record official transaction in Firestore
        const txId = chargeData.chargeId || `tx_${Date.now()}`;
        const nowIso = new Date().toISOString();
        await recordPaymentTransaction(currentUser.uid, {
          id: txId,
          amount: selectedItem.data.price,
          itemName: selectedItem.data.name,
          itemType: selectedItem.type,
          paymentMethod: chargeData.paymentMethodDetails || 'Credit Card (Stripe)',
          status: 'completed',
          createdAt: nowIso,
          customerName: currentUser.username || 'Adventurer',
          email: currentUser.email || undefined,
          attachedUsername: currentUser.username || 'Adventurer',
          recipient: currentUser.username || currentUser.email || 'Adventurer',
          notes: selectedItem.type === 'pack' ? `Added ${actionDelta} actions` : `Activated ${selectedItem.data.name}`,
          userId: currentUser.uid,
          actionDelta,
          newTier
        });

        if (onProfileUpdated && updatedProfile) {
          onProfileUpdated({ ...updatedProfile });
        }
        onStatusUpdated();
        setTransactionReceipt({
          id: txId,
          itemName: selectedItem.data.name,
          amount: selectedItem.data.price,
          paymentMethod: chargeData.paymentMethodDetails || 'Credit Card (Stripe)',
          receiptUrl: chargeData.receiptUrl,
          timestamp: new Date().toLocaleString(),
          actionDelta,
          newTier,
          stripePaymentIntentId: txId,
          mode: isLiveMode ? 'live' : 'test'
        });

        setIsProcessingPayment(false);
        setProcessingMessage(null);
        return;
      } catch (err: any) {
        console.error('Card payment error:', err);
        const detailedMessage = err.message || (typeof err === 'string' ? err : 'Payment processing failed.');
        setPaymentError(`Payment Failed: ${detailedMessage}`);
        setPaymentDebugDetails({
          errorName: err.name || 'Error',
          errorMessage: err.message,
          errorStack: err.stack,
          serverPayload: err.serverPayload,
          userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
          timestamp: new Date().toISOString()
        });
        setIsProcessingPayment(false);
        setProcessingMessage(null);
        return;
      }
    }
  };

  const handleCopyTxId = (id: string) => {
    navigator.clipboard.writeText(id);
    setCopiedTxId(true);
    setTimeout(() => setCopiedTxId(false), 2000);
  };

  const handleSaveApiKey = () => {
    if (customKeyInput.trim()) {
      safeStorage.setItem('aimud_apikey', customKeyInput.trim());
      setKeySavedMessage('Gemini API Key activated! Unlimited actions enabled.');
      onStatusUpdated();
      setTimeout(() => {
        window.location.reload();
      }, 1200);
    } else {
      safeStorage.removeItem('aimud_apikey');
      setKeySavedMessage('API Key cleared. Standard action limits now apply.');
      onStatusUpdated();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/85 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-neutral-900 border border-neutral-700 w-full max-w-4xl max-h-[82vh] md:max-h-[85vh] rounded-xl shadow-2xl flex flex-col overflow-hidden text-neutral-200 font-sans">
        
        {/* Header - Compact height */}
        <div className="px-4 py-3 md:px-5 md:py-3.5 border-b border-neutral-800 bg-neutral-950 flex justify-between items-center shrink-0">
          <div className="flex items-center gap-2.5 sm:gap-3">
            <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-lg bg-gradient-to-br from-amber-500/20 to-yellow-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
              <Sparkles size={18} />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold tracking-tight text-white flex items-center gap-2">
                Aifinity Market
                {effectiveStatus.isAlphaPhase ? (
                  <span className="text-[10px] sm:text-[11px] font-mono font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 flex items-center gap-1">
                    <Zap size={10} className="text-amber-400" />
                    Alpha Phase Active (Unlimited Actions)
                  </span>
                ) : (
                  <span className="text-[10px] sm:text-[11px] font-mono font-medium px-2 py-0.5 rounded-full bg-blue-900/40 text-blue-300 border border-blue-800/60">
                    Beta Phase Active (+10 Daily Bonus)
                  </span>
                )}
                {isAdmin && (
                  <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40">
                    Owner
                  </span>
                )}
              </h2>
              <p className="text-[11px] sm:text-xs text-neutral-400">
                Action packs, monthly memberships, or connect your free Google Gemini API key
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-neutral-400 hover:text-white p-1.5 rounded-lg hover:bg-neutral-800 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Guest Warning Banner if not logged in */}
        {isGuest && (
          <div className="px-4 py-2 bg-amber-950/40 border-b border-amber-500/30 flex items-center justify-between gap-3 text-xs shrink-0">
            <div className="flex items-center gap-2 text-amber-300">
              <Lock size={14} className="shrink-0 text-amber-400" />
              <span className="text-[11px]">
                <strong>Browsing as Guest:</strong> Purchases require an account so actions and saved adventures are permanently linked.
              </span>
            </div>
            {onOpenAuth && (
              <button
                onClick={() => {
                  onClose();
                  onOpenAuth();
                }}
                className="bg-amber-500 hover:bg-amber-400 text-neutral-950 font-bold px-2.5 py-1 rounded text-[11px] transition-colors shrink-0 shadow"
              >
                Log In
              </button>
            )}
          </div>
        )}

        {/* Current Balance Bar - Compact */}
        <div className="px-4 py-2 bg-neutral-950/80 border-b border-neutral-800/80 flex flex-wrap items-center justify-between gap-2.5 text-xs shrink-0">
          <div className="flex items-center gap-3 sm:gap-4">
            {effectiveStatus.isAlphaPhase ? (
              <div>
                <span className="text-neutral-400">Phase: </span>
                <span className="font-bold text-amber-400">Alpha (Unlimited Actions)</span>
                <span className="text-[10px] text-neutral-400 ml-1">
                  (Free actions during Alpha phase)
                </span>
              </div>
            ) : (
              <div>
                <span className="text-neutral-400">{isGuest ? "Guest: " : "Daily Free: "}</span>
                <span className={`font-bold ${isGuest ? "text-amber-400" : "text-emerald-400"}`}>
                  {isGuest ? `${effectiveStatus.dailyFreeRemaining} / ${effectiveStatus.dailyFreeTotal}` : effectiveStatus.dailyFreeRemaining}
                </span>
                <span className="text-[10px] text-neutral-400 ml-1">
                  {isGuest ? "(5 trial actions)" : "(+10 beta bonus)"}
                </span>
              </div>
            )}
            {!effectiveStatus.isAlphaPhase && !isGuest && (
              <div>
                <span className="text-neutral-400">Free Total Actions: </span>
                <span className="font-bold text-emerald-400">
                  {effectiveStatus.freeStackedActions ?? effectiveStatus.dailyFreeRemaining ?? 0}
                </span>
                <span className="text-[10px] text-neutral-400 ml-1">
                  (max {effectiveStatus.maxFreeStack || 200})
                </span>
              </div>
            )}
            <div>
              <span className="text-neutral-400">Purchased Credits: </span>
              <span className="font-bold text-amber-400">+{effectiveStatus.purchasedCredits}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-neutral-400">Plan: </span>
            <span className={`font-semibold px-2 py-0.5 rounded text-[10px] uppercase ${
              effectiveStatus.tier === 'celestial'
                ? 'bg-gradient-to-r from-sky-950 to-purple-950 text-cyan-200 border border-cyan-400/60 shadow-[0_0_8px_rgba(56,189,248,0.4)]'
                : effectiveStatus.tier === 'legendary'
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                : effectiveStatus.tier === 'adventurer'
                  ? 'bg-blue-500/20 text-blue-300 border border-blue-500/40'
                  : 'bg-neutral-800 text-neutral-300'
            }`}>
              {effectiveStatus.tier}
            </span>
            {effectiveStatus.hasCustomApiKey && (
              <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800 font-mono">
                Custom Key Active
              </span>
            )}
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex flex-wrap items-center justify-between border-b border-neutral-800 bg-neutral-900/60 px-4 pt-1.5 gap-2 text-xs md:text-sm font-medium shrink-0">
          <div className="flex gap-2">
            <button
              onClick={() => { setActiveTab('packs'); setSelectedItem(null); setTransactionReceipt(null); }}
              className={`pb-2.5 px-3 flex items-center gap-1.5 border-b-2 transition-colors ${
                activeTab === 'packs'
                  ? 'border-amber-400 text-amber-300 font-semibold'
                  : 'border-transparent text-neutral-400 hover:text-neutral-200'
              }`}
            >
              <Zap size={15} />
              Action Packs
            </button>
            <button
              onClick={() => { setActiveTab('subscriptions'); setSelectedItem(null); setTransactionReceipt(null); }}
              className={`pb-2.5 px-3 flex items-center gap-1.5 border-b-2 transition-colors ${
                activeTab === 'subscriptions'
                  ? 'border-amber-400 text-amber-300 font-semibold'
                  : 'border-transparent text-neutral-400 hover:text-neutral-200'
              }`}
            >
              <Crown size={15} />
              Monthly Memberships
            </button>
            <button
              onClick={() => { setActiveTab('apikey'); setSelectedItem(null); setTransactionReceipt(null); }}
              className={`pb-2.5 px-3 flex items-center gap-1.5 border-b-2 transition-colors ${
                activeTab === 'apikey'
                  ? 'border-amber-400 text-amber-300 font-semibold'
                  : 'border-transparent text-neutral-400 hover:text-neutral-200'
              }`}
            >
              <Key size={15} />
              Free Gemini API Key
            </button>
            <button
              onClick={() => { setActiveTab('receipts'); setSelectedItem(null); setTransactionReceipt(null); }}
              className={`pb-2.5 px-3 flex items-center gap-1.5 border-b-2 transition-colors ${
                activeTab === 'receipts'
                  ? 'border-amber-400 text-amber-300 font-semibold'
                  : 'border-transparent text-neutral-400 hover:text-neutral-200'
              }`}
            >
              <ReceiptIcon size={15} />
              Receipts & Orders
            </button>
          </div>

          <button
            onClick={handleSyncStripePurchases}
            disabled={isSyncingPurchases}
            className="mb-1.5 px-3 py-1.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            title="Scan Stripe for completed purchases and credit any missing actions to your account"
          >
            <RefreshCw size={13} className={isSyncingPurchases ? 'animate-spin text-amber-400' : 'text-amber-400'} />
            <span>{isSyncingPurchases ? 'Checking Stripe...' : 'Restore Stripe Purchases'}</span>
          </button>
        </div>

        {/* Content Area - Scrollable */}
        <div className="flex-1 overflow-y-auto p-3.5 sm:p-5 space-y-4">

          {/* Sync Status Banner */}
          {syncStatusMessage && (
            <div
              className={`p-3 rounded-lg border text-xs flex items-center justify-between gap-2 animate-in fade-in duration-150 ${
                syncStatusMessage.type === 'success'
                  ? 'bg-emerald-950/60 border-emerald-500/60 text-emerald-200'
                  : syncStatusMessage.type === 'error'
                  ? 'bg-rose-950/60 border-rose-500/60 text-rose-200'
                  : 'bg-blue-950/60 border-blue-500/60 text-blue-200'
              }`}
            >
              <div className="flex items-center gap-2">
                <Sparkles size={14} className="shrink-0 text-amber-400" />
                <span>{syncStatusMessage.text}</span>
              </div>
              <button
                type="button"
                onClick={() => setSyncStatusMessage(null)}
                className="text-neutral-400 hover:text-white"
              >
                <X size={14} />
              </button>
            </div>
          )}

          {/* Checkout Sheet if item is selected */}
          {selectedItem && (
            <div className="bg-neutral-950 border border-amber-500/40 rounded-xl p-4 sm:p-5 mb-4 animate-in slide-in-from-top-2 duration-200 shadow-xl">
              <div className="flex justify-between items-start mb-3">
                <div>
                  <span className="text-[11px] uppercase tracking-wider text-amber-400 font-mono font-semibold">
                    Order Checkout
                  </span>
                  <h3 className="text-base sm:text-lg font-bold text-white">
                    {selectedItem.data.name} — ${selectedItem.data.price}
                    {selectedItem.type === 'tier' && <span className="text-xs text-neutral-400 font-normal"> / month</span>}
                  </h3>
                </div>
                <button
                  onClick={() => {
                    setSelectedItem(null);
                    setTransactionReceipt(null);
                    setPaymentError(null);
                  }}
                  className="text-neutral-400 hover:text-white text-xs px-2 py-1 bg-neutral-800 rounded hover:bg-neutral-700 transition-colors"
                >
                  Close
                </button>
              </div>

              {/* Success Receipt */}
              {transactionReceipt ? (
                <div className="p-4 sm:p-5 bg-emerald-950/40 border border-emerald-500/50 rounded-xl space-y-3.5">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 shrink-0">
                      <CheckCircle2 size={20} />
                    </div>
                    <div>
                      <h4 className="text-sm sm:text-base font-bold text-white">Payment Confirmed & Delivered!</h4>
                      <p className="text-xs text-emerald-300">
                        {transactionReceipt.actionDelta
                          ? `Added +${transactionReceipt.actionDelta} action credits to your account.`
                          : `Your ${transactionReceipt.newTier || 'subscription'} membership is now active.`}
                      </p>
                    </div>
                  </div>

                  <div className="bg-black/50 border border-neutral-800 rounded-lg p-3 text-xs font-mono space-y-1.5 text-neutral-300">
                    <div className="flex justify-between">
                      <span className="text-neutral-400">Item:</span>
                      <span className="text-white font-bold">{transactionReceipt.itemName}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-neutral-400">Amount:</span>
                      <span className="text-emerald-400 font-bold">${(Number(transactionReceipt.amount) || 0).toFixed(2)} USD</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-neutral-400">Payment Method:</span>
                      <span>{transactionReceipt.paymentMethod}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-neutral-400">Status:</span>
                      <span className="text-emerald-400 font-semibold">Completed & Verified</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-neutral-400">Account:</span>
                      <span>{currentUser?.email || currentUser?.username}</span>
                    </div>
                    {transactionReceipt.stripePaymentIntentId && (
                      <div className="flex justify-between">
                        <span className="text-neutral-400">Stripe Payment Intent:</span>
                        <span className="text-blue-400 font-mono text-[10px]">{transactionReceipt.stripePaymentIntentId}</span>
                      </div>
                    )}
                    <div className="flex justify-between items-center pt-1 border-t border-neutral-800">
                      <span className="text-neutral-400">Transaction ID:</span>
                      <button
                        onClick={() => handleCopyTxId(transactionReceipt.id)}
                        className="text-[11px] text-blue-400 hover:text-blue-300 flex items-center gap-1 font-mono"
                        title="Copy Transaction ID"
                      >
                        {transactionReceipt.id}
                        {copiedTxId ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                      </button>
                    </div>
                  </div>

                  <div className="flex flex-wrap justify-between items-center gap-2 pt-2 border-t border-emerald-800/40">
                    <button
                      onClick={() => {
                        setSelectedReceiptForInvoice({
                          id: transactionReceipt.id,
                          itemName: transactionReceipt.itemName,
                          amount: transactionReceipt.amount,
                          paymentMethod: transactionReceipt.paymentMethod,
                          status: 'completed',
                          createdAt: new Date().toISOString(),
                          actionDelta: transactionReceipt.actionDelta,
                          newTier: transactionReceipt.newTier,
                          userId: currentUser?.uid
                        });
                      }}
                      className="px-3 py-1.5 bg-neutral-900 hover:bg-neutral-800 border border-emerald-500/40 text-emerald-300 text-xs font-bold rounded-lg transition-colors flex items-center gap-1.5"
                    >
                      <FileText size={13} />
                      <span>View Official Printable Receipt</span>
                    </button>

                    <button
                      onClick={() => {
                        setSelectedItem(null);
                        setTransactionReceipt(null);
                      }}
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-lg transition-colors shadow"
                    >
                      Done & Return to Market
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-3.5">
                  {paymentError && (
                    <div className="p-3 bg-red-950/80 border border-red-800 text-red-300 text-xs rounded-lg space-y-2">
                      <div className="flex items-start gap-2">
                        <AlertCircle size={16} className="shrink-0 text-red-400 mt-0.5" />
                        <div className="flex-1 font-mono text-xs break-words">
                          <span className="font-bold text-red-200">Error: </span>
                          {paymentError}
                        </div>
                      </div>
                      {paymentDebugDetails && (
                        <div className="pt-2 border-t border-red-900/60 font-mono text-[11px] text-neutral-400 space-y-1 bg-black/40 p-2 rounded">
                          <div className="font-bold text-neutral-300 text-[10px] uppercase">Diagnostic Debug Info:</div>
                          <div className="text-red-300 break-all">Message: {paymentDebugDetails.errorMessage || 'Unknown error'}</div>
                          {paymentDebugDetails.errorStack && (
                            <pre className="text-[9px] text-neutral-500 whitespace-pre-wrap overflow-x-auto max-h-24 p-1 bg-black/60 rounded border border-neutral-900">
                              {paymentDebugDetails.errorStack}
                            </pre>
                          )}
                          {paymentDebugDetails.serverPayload && (
                            <pre className="text-[9px] text-amber-400/80 whitespace-pre-wrap overflow-x-auto max-h-20 p-1 bg-black/60 rounded border border-neutral-900">
                              {JSON.stringify(paymentDebugDetails.serverPayload, null, 2)}
                            </pre>
                          )}
                          <div className="text-[10px] text-neutral-500">
                            Time: {paymentDebugDetails.timestamp}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Stripe Live Status Banner */}
                  <div className="p-3 rounded-lg border bg-neutral-950/80 font-mono text-xs">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${
                          (stripeStatus?.publishableKey || '').startsWith('pk_live_') || stripeStatus?.mode === 'live'
                            ? 'bg-emerald-400 animate-pulse'
                            : 'bg-emerald-500'
                        }`} />
                        <span className="text-neutral-200 font-semibold">
                          {(stripeStatus?.publishableKey || '').startsWith('pk_live_') || stripeStatus?.mode === 'live'
                            ? 'Stripe: Live Production'
                            : 'Stripe: Active & Connected'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Payment Method Selector: Stripe 1-Click, Card */}
                  <div>
                    <label className="text-[11px] text-neutral-400 font-mono block mb-1.5">
                      Select Payment Method:
                    </label>
                    <div className="grid grid-cols-2 gap-2.5">
                      {/* Stripe Checkout */}
                      <button
                        type="button"
                        onClick={() => {
                          setPaymentMethod('stripe_checkout');
                          setCardError(null);
                        }}
                        className={`p-2.5 rounded-lg border flex flex-col items-center justify-center gap-1 transition-all ${
                          paymentMethod === 'stripe_checkout'
                            ? 'border-emerald-500 bg-emerald-950/40 text-white shadow-sm ring-1 ring-emerald-500/50'
                            : 'border-neutral-800 bg-neutral-900 text-neutral-400 hover:text-neutral-200'
                        }`}
                      >
                        <span className="font-black text-xs text-emerald-400">Stripe Checkout</span>
                        <span className="text-[9px] text-neutral-300">1-Click (Cards, GPay, Apple Pay)</span>
                      </button>

                      {/* Direct Card */}
                      <button
                        type="button"
                        onClick={() => {
                          setPaymentMethod('card');
                          setCardError(null);
                        }}
                        className={`p-2.5 rounded-lg border flex flex-col items-center justify-center gap-1 transition-all ${
                          paymentMethod === 'card'
                            ? 'border-amber-400 bg-amber-950/50 text-white shadow-sm ring-1 ring-amber-500/50'
                            : 'border-neutral-800 bg-neutral-900 text-neutral-400 hover:text-neutral-200'
                        }`}
                      >
                        <CreditCard size={15} />
                        <span className="text-[9px] font-medium text-neutral-300">Direct Credit Card</span>
                      </button>
                    </div>
                  </div>

                  {/* ACTIVE CHECKOUT SESSION NOTICE */}
                  {checkoutSessionUrl && (
                    <div className="p-3.5 bg-amber-950/40 border border-amber-500/50 rounded-lg space-y-2.5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-xs text-amber-300 font-bold">
                          <RefreshCw size={13} className="animate-spin text-amber-400 shrink-0" />
                          <span>Waiting for Stripe Payment...</span>
                        </div>
                        <span className="text-[10px] text-amber-400 font-mono">Auto-detect active</span>
                      </div>
                      <p className="text-[11px] text-neutral-300">
                        Please finish paying in the Stripe checkout tab. As soon as you complete the payment, this window will automatically detect it and grant your items.
                      </p>
                      <div className="flex flex-wrap items-center gap-2 pt-1">
                        <a
                          href={checkoutSessionUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-white rounded text-xs font-semibold flex items-center gap-1.5 transition-colors shrink-0"
                        >
                          Re-open Stripe Window <ExternalLink size={12} />
                        </a>
                        {waitingSessionId && (
                          <button
                            type="button"
                            onClick={handleManualCheckSession}
                            className="px-3 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-neutral-950 font-bold rounded text-xs flex items-center gap-1.5 transition-colors cursor-pointer shadow"
                          >
                            <CheckCircle2 size={13} />
                            I Have Paid (Verify Now)
                          </button>
                        )}
                      </div>
                    </div>
                  )}

                  {/* CREDIT CARD FORM */}
                  {paymentMethod === 'card' && (
                    <div className="space-y-2.5 bg-neutral-900/70 p-3.5 rounded-lg border border-neutral-800">
                      {cardError && (
                        <div className="text-xs text-red-400 font-mono bg-red-950/50 p-2 rounded border border-red-900">
                          {cardError}
                        </div>
                      )}
                      <div>
                        <label className="text-[10px] uppercase font-mono text-neutral-400 block mb-1">Cardholder Name</label>
                        <input
                          type="text"
                          placeholder={currentUser?.username || 'Jane Doe'}
                          value={cardName}
                          onChange={(e) => setCardName(e.target.value)}
                          className="w-full bg-black border border-neutral-700 rounded p-2 text-xs text-white font-mono focus:border-amber-500 focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] uppercase font-mono text-neutral-400 block mb-1">Card Number</label>
                        <input
                          type="text"
                          maxLength={19}
                          placeholder="4242 4242 4242 4242"
                          value={cardNumber}
                          onChange={(e) => {
                            const raw = e.target.value.replace(/\D/g, '').substring(0, 16);
                            const formatted = raw.match(/.{1,4}/g)?.join(' ') || raw;
                            setCardNumber(formatted);
                          }}
                          className="w-full bg-black border border-neutral-700 rounded p-2 text-xs text-white font-mono focus:border-amber-500 focus:outline-none"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-2.5">
                        <div>
                          <label className="text-[10px] uppercase font-mono text-neutral-400 block mb-1">Expiration</label>
                          <input
                            type="text"
                            maxLength={5}
                            placeholder="MM/YY"
                            value={cardExp}
                            onChange={(e) => {
                              let v = e.target.value.replace(/\D/g, '').substring(0, 4);
                              if (v.length >= 3) {
                                v = v.substring(0, 2) + '/' + v.substring(2);
                              }
                              setCardExp(v);
                            }}
                            className="w-full bg-black border border-neutral-700 rounded p-2 text-xs text-white font-mono focus:border-amber-500 focus:outline-none"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] uppercase font-mono text-neutral-400 block mb-1">CVC</label>
                          <input
                            type="password"
                            maxLength={4}
                            placeholder="123"
                            value={cardCvc}
                            onChange={(e) => setCardCvc(e.target.value.replace(/\D/g, '').substring(0, 4))}
                            className="w-full bg-black border border-neutral-700 rounded p-2 text-xs text-white font-mono focus:border-amber-500 focus:outline-none"
                          />
                        </div>
                      </div>
                      <div className="text-[10px] text-neutral-400 flex items-center gap-1 pt-1">
                        <Lock size={11} className="text-emerald-400 shrink-0" />
                        <span>Encrypted & processed securely with Stripe</span>
                      </div>
                    </div>
                  )}

                  {/* SUBMIT BUTTON */}
                  <div className="flex items-center justify-between pt-1">
                    <div className="text-[11px] text-neutral-400 flex items-center gap-1">
                      <ShieldCheck size={14} className="text-emerald-400 shrink-0" />
                      <span>Direct Stripe Guarantee</span>
                    </div>

                    <button
                      disabled={isProcessingPayment}
                      onClick={handleProcessPayment}
                      className={`px-5 py-2.5 rounded-lg font-bold text-xs sm:text-sm flex items-center gap-1.5 transition-all cursor-pointer shadow-lg ${
                        paymentMethod === 'stripe_checkout'
                          ? 'bg-emerald-500 hover:bg-emerald-400 text-neutral-950'
                          : 'bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 text-neutral-950'
                      } ${isProcessingPayment ? 'opacity-70 cursor-wait' : ''}`}
                    >
                      {isProcessingPayment ? (
                        <span>{processingMessage || 'Processing Order...'}</span>
                      ) : paymentMethod === 'stripe_checkout' ? (
                        <>Checkout with <span className="font-extrabold text-neutral-900">Stripe</span> (${(Number(selectedItem.data.price) || 0).toFixed(2)})</>
                      ) : (
                        <>Pay with Card (${(Number(selectedItem.data.price) || 0).toFixed(2)})</>
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 1: Action Packs */}
          {activeTab === 'packs' && (
            <div className="space-y-4">
              <div>
                <h3 className="text-base font-semibold text-white">Action Packs</h3>
                <p className="text-xs text-neutral-400">
                  Instant extra turns that never expire. Automatically used whenever your 30 free daily actions run out.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
                {ACTION_PACKS.map((pack) => {
                  const isSelected = selectedItem?.data.id === pack.id;
                  const isBestValue = pack.id === 'pack_royal_500';

                  return (
                    <div
                      key={pack.id}
                      className={`relative bg-neutral-950 rounded-xl p-4 border transition-all flex flex-col justify-between ${
                        isBestValue
                          ? 'border-amber-500/70 bg-gradient-to-b from-amber-950/20 to-neutral-950'
                          : 'border-neutral-800 hover:border-neutral-700'
                      } ${isSelected ? 'ring-2 ring-amber-400' : ''}`}
                    >
                      {pack.badge && (
                        <span className="absolute -top-2.5 right-3 px-2 py-0.5 bg-gradient-to-r from-amber-500 to-yellow-500 text-neutral-950 text-[10px] font-extrabold uppercase rounded-full shadow-md">
                          {pack.badge}
                        </span>
                      )}

                      <div>
                        <div className="flex justify-between items-start mb-2">
                          <h4 className="font-bold text-white text-base">{pack.name}</h4>
                        </div>

                        <div className="my-2">
                          <span className="text-2xl font-black text-white">${pack.price}</span>
                          <span className="text-xs text-neutral-400 ml-1.5 font-mono">for {pack.actions} actions</span>
                        </div>

                        <p className="text-xs text-neutral-400 mb-4">{pack.description}</p>
                      </div>

                      <button
                        onClick={() => handleSelectPack(pack)}
                        className={`w-full py-2 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                          isBestValue
                            ? 'bg-gradient-to-r from-amber-500 to-yellow-500 text-neutral-950 hover:brightness-110'
                            : 'bg-neutral-800 hover:bg-neutral-700 text-white'
                        }`}
                      >
                        {isGuest ? (
                          <>
                            <Lock size={12} />
                            <span>Log In to Buy {pack.actions} Actions</span>
                          </>
                        ) : (
                          <>
                            <span>Buy {pack.actions} Actions</span>
                            <ArrowRight size={13} />
                          </>
                        )}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB 2: Monthly Memberships */}
          {activeTab === 'subscriptions' && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-semibold text-white">Monthly Memberships</h3>
                    <span className="px-2 py-0.5 text-[10px] font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 rounded-full">
                      Renews Monthly • Cancel Anytime
                    </span>
                  </div>
                  <p className="text-xs text-neutral-400">
                    Recurring monthly subscriptions attached strictly to your account. Unlock permanent adventure slots, glowing names, and bonus daily actions.
                  </p>
                </div>
              </div>

              {/* Cancel Success / Error Notifications */}
              {cancelSuccessMessage && (
                <div className="p-3 bg-emerald-950/60 border border-emerald-800/80 rounded-xl text-xs text-emerald-300 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />
                    <span>{cancelSuccessMessage}</span>
                  </div>
                  <button
                    onClick={() => setCancelSuccessMessage(null)}
                    className="text-emerald-400 hover:text-white text-xs font-bold"
                  >
                    Dismiss
                  </button>
                </div>
              )}

              {cancelErrorMessage && (
                <div className="p-3 bg-rose-950/60 border border-rose-800/80 rounded-xl text-xs text-rose-300 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <AlertCircle size={16} className="text-rose-400 shrink-0" />
                    <span>{cancelErrorMessage}</span>
                  </div>
                  <button
                    onClick={() => setCancelErrorMessage(null)}
                    className="text-rose-400 hover:text-white text-xs font-bold"
                  >
                    Dismiss
                  </button>
                </div>
              )}

              {/* Active Subscription Banner & Cancellation Controls */}
              {currentUser && effectiveStatus.tier !== 'free' && (
                <div className="bg-gradient-to-r from-neutral-900 via-neutral-900 to-indigo-950/40 border border-indigo-900/60 rounded-xl p-4 sm:p-5 shadow-lg">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="flex items-start gap-3.5">
                      <div className="w-10 h-10 rounded-xl bg-indigo-500/20 border border-indigo-500/40 flex items-center justify-center text-indigo-300 shrink-0 mt-0.5">
                        <Crown size={20} />
                      </div>
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-bold text-white capitalize">
                            {effectiveStatus.tier} Monthly Plan
                          </span>
                          <span className="px-2 py-0.5 text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 rounded-full flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                            Active Subscription
                          </span>
                          <span className="text-[11px] text-neutral-400 font-mono">
                            Attached to: <strong className="text-neutral-200">{currentUser.username}</strong>
                          </span>
                        </div>
                        <p className="text-xs text-neutral-400">
                          {currentUser.subscriptionExpiresAt ? (
                            <>Current billing cycle active until <strong className="text-neutral-200">{new Date(currentUser.subscriptionExpiresAt).toLocaleDateString()}</strong></>
                          ) : (
                            <>Active monthly plan auto-renewing every 30 days.</>
                          )}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 self-start md:self-auto shrink-0">
                      <button
                        onClick={handleOpenStripePortal}
                        disabled={isOpeningPortal}
                        className="px-3.5 py-2 text-xs font-semibold text-blue-300 hover:text-blue-200 bg-blue-950/40 hover:bg-blue-900/50 border border-blue-800/60 rounded-lg transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                        title="Redirect to Stripe's Customer Portal to manage, change billing, or cancel directly on Stripe"
                      >
                        <ExternalLink size={13} className={isOpeningPortal ? 'animate-spin' : ''} />
                        <span>{isOpeningPortal ? 'Opening Stripe...' : 'Manage on Stripe'}</span>
                      </button>

                      {!showCancelConfirm ? (
                        <button
                          onClick={() => setShowCancelConfirm(true)}
                          className="px-3.5 py-2 text-xs font-semibold text-rose-300 hover:text-rose-200 bg-rose-950/40 hover:bg-rose-900/50 border border-rose-800/60 rounded-lg transition-all cursor-pointer"
                        >
                          Cancel Subscription
                        </button>
                      ) : (
                        <div className="flex items-center gap-2 bg-neutral-950 p-1.5 rounded-lg border border-rose-900/80">
                          <span className="text-[11px] text-rose-300 font-medium px-2">
                            Confirm cancellation?
                          </span>
                          <button
                            onClick={handleCancelSubscription}
                            disabled={isCancellingSubscription}
                            className="px-2.5 py-1 text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white rounded transition-colors disabled:opacity-50 cursor-pointer"
                          >
                            {isCancellingSubscription ? 'Cancelling...' : 'Yes, Cancel'}
                          </button>
                          <button
                            onClick={() => setShowCancelConfirm(false)}
                            disabled={isCancellingSubscription}
                            className="px-2.5 py-1 text-xs font-semibold bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded transition-colors cursor-pointer"
                          >
                            Keep Plan
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {SUBSCRIPTION_TIERS.map((tier) => {
                  const isCurrent = effectiveStatus.tier === tier.id;
                  const isCelestial = tier.id === 'celestial';
                  const isLegendary = tier.id === 'legendary';

                  return (
                    <div
                      key={tier.id}
                      className={`relative bg-neutral-950 rounded-xl p-5 border flex flex-col justify-between ${
                        isCelestial
                          ? 'border-cyan-400/80 bg-gradient-to-b from-sky-950/40 via-indigo-950/30 to-neutral-950 shadow-[0_0_20px_rgba(56,189,248,0.2)] ring-1 ring-cyan-400/50'
                          : isLegendary
                          ? 'border-amber-500/80 bg-gradient-to-b from-amber-950/30 via-neutral-950 to-neutral-950 shadow-xl'
                          : tier.highlight
                            ? 'border-blue-500/70 bg-gradient-to-b from-blue-950/20 to-neutral-950'
                            : 'border-neutral-800'
                      }`}
                    >
                      {tier.badge && (
                        <span className={`absolute -top-2.5 right-4 px-2 py-0.5 text-[10px] font-extrabold uppercase rounded-full shadow-md ${
                          isCelestial
                            ? 'bg-gradient-to-r from-cyan-400 via-sky-300 to-purple-400 text-black shadow-[0_0_10px_rgba(56,189,248,0.6)]'
                            : isLegendary
                            ? 'bg-gradient-to-r from-amber-400 to-yellow-400 text-black'
                            : 'bg-blue-600 text-white'
                        }`}>
                          {tier.badge}
                        </span>
                      )}

                      <div>
                        <h4 className={`text-base font-bold mb-1 ${
                          isCelestial
                            ? 'text-transparent bg-clip-text bg-gradient-to-r from-cyan-300 via-sky-200 to-purple-300 flex items-center gap-1.5'
                            : isLegendary
                            ? 'text-amber-300 flex items-center gap-1.5'
                            : 'text-white'
                        }`}>
                          {tier.name}
                        </h4>

                        <div className="my-3">
                          <span className="text-3xl font-black text-white">
                            ${tier.price}
                          </span>
                          <span className="text-xs text-neutral-400 ml-1 font-mono">
                            /{tier.billingPeriod}
                          </span>
                        </div>

                        <div className="space-y-2 mb-6 text-xs text-neutral-300">
                          {tier.features.map((feat, idx) => (
                            <div key={idx} className="flex items-start gap-2">
                              <CheckCircle2 size={14} className={`shrink-0 mt-0.5 ${
                                isCelestial ? 'text-cyan-400' : isLegendary ? 'text-amber-400' : 'text-blue-400'
                              }`} />
                              <span>{feat}</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div>
                        {isCurrent ? (
                          <div className="w-full py-2 text-center text-xs font-bold rounded-lg bg-neutral-800/80 text-emerald-400 border border-emerald-900/60">
                            ✓ Current Active Plan
                          </div>
                        ) : tier.id === 'free' ? (
                          <div className="w-full py-2 text-center text-xs font-medium rounded-lg bg-neutral-900 text-neutral-500">
                            Default Plan
                          </div>
                        ) : (
                          <button
                            onClick={() => handleSelectTier(tier)}
                            className={`w-full py-2.5 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 shadow-md ${
                              isCelestial
                                ? 'bg-gradient-to-r from-cyan-400 via-sky-300 to-purple-400 text-black hover:brightness-110 shadow-[0_0_12px_rgba(56,189,248,0.4)]'
                                : isLegendary
                                ? 'bg-gradient-to-r from-amber-400 via-yellow-400 to-amber-500 text-black hover:brightness-110'
                                : 'bg-blue-600 hover:bg-blue-500 text-white'
                            }`}
                          >
                            {isGuest ? (
                              <>
                                <Lock size={12} />
                                <span>Log In to Subscribe</span>
                              </>
                            ) : (
                              <>
                                <span>Subscribe to {tier.name.replace(/[^a-zA-Z]/g, '').trim()}</span>
                                <ArrowRight size={13} />
                              </>
                            )}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB 3: Connect Free Gemini API Key */}
          {activeTab === 'apikey' && (
            <div className="space-y-6 max-w-2xl mx-auto">
              <div className="text-center space-y-1.5">
                <div className="w-12 h-12 rounded-xl bg-blue-950/60 border border-blue-800/60 flex items-center justify-center text-blue-400 mx-auto mb-3">
                  <Key size={24} />
                </div>
                <h3 className="text-lg font-bold text-white">
                  Bring Your Own Free Gemini API Key
                </h3>
                <p className="text-xs text-neutral-400">
                  Don't want to buy action packs? Connect your personal free Gemini API key to play infinitely without action counters.
                </p>
              </div>

              {/* Quick Guide */}
              <div className="bg-neutral-950 border border-neutral-800 rounded-xl p-4 md:p-5 space-y-3">
                <div className="flex items-center gap-2 text-xs font-bold text-blue-400 uppercase tracking-wider font-mono">
                  <BookOpen size={14} />
                  <span>Quick 3-Step Guide to Free Gemini API Key</span>
                </div>

                <div className="space-y-2 text-xs text-neutral-300">
                  <div className="flex items-start gap-2">
                    <span className="w-5 h-5 rounded-full bg-neutral-800 text-white flex items-center justify-center font-bold shrink-0 text-[10px]">1</span>
                    <div>
                      <span>Visit Google AI Studio's API Keys dashboard at </span>
                      <a
                        href="https://aistudio.google.com/app/apikey"
                        target="_blank"
                        rel="noreferrer"
                        className="text-blue-400 hover:text-blue-300 underline font-semibold inline-flex items-center gap-1"
                      >
                        aistudio.google.com/app/apikey
                        <ExternalLink size={12} />
                      </a>
                    </div>
                  </div>

                  <div className="flex items-start gap-2">
                    <span className="w-5 h-5 rounded-full bg-neutral-800 text-white flex items-center justify-center font-bold shrink-0 text-[10px]">2</span>
                    <span>Click <strong>"Create API Key"</strong> and copy your new secret key string.</span>
                  </div>

                  <div className="flex items-start gap-2">
                    <span className="w-5 h-5 rounded-full bg-neutral-800 text-white flex items-center justify-center font-bold shrink-0 text-[10px]">3</span>
                    <span>Paste your key below and click <strong>"Activate Free Key"</strong>.</span>
                  </div>
                </div>
              </div>

              {/* Key Input Field */}
              <div className="space-y-3 bg-neutral-950 border border-neutral-800 rounded-xl p-4 md:p-5">
                <label className="block text-xs font-mono text-neutral-400">
                  Gemini API Key
                </label>
                <input
                  type="password"
                  placeholder="AIzaSy..."
                  value={customKeyInput}
                  onChange={(e) => setCustomKeyInput(e.target.value)}
                  className="w-full bg-black border border-neutral-700 rounded-lg p-3 text-sm text-white font-mono focus:border-blue-500 focus:outline-none"
                />

                {keySavedMessage && (
                  <p className="text-xs text-emerald-400 font-mono flex items-center gap-1.5">
                    <CheckCircle2 size={14} />
                    {keySavedMessage}
                  </p>
                )}

                <div className="flex gap-2 justify-end pt-1">
                  {customKeyInput && (
                    <button
                      onClick={() => {
                        setCustomKeyInput('');
                        safeStorage.removeItem('aimud_apikey');
                        setKeySavedMessage('Key removed. Reset to standard tier.');
                        onStatusUpdated();
                      }}
                      className="px-3 py-2 rounded-lg text-xs font-medium text-neutral-400 hover:text-red-400 transition-colors"
                    >
                      Clear Key
                    </button>
                  )}
                  <button
                    onClick={handleSaveApiKey}
                    className="px-5 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition-all shadow-md"
                  >
                    Activate Free Key
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: Receipts & Orders */}
          {activeTab === 'receipts' && (
            <div className="max-w-3xl mx-auto">
              <ReceiptsList
                currentUser={currentUser}
                onViewReceipt={(tx) => setSelectedReceiptForInvoice(tx)}
                onOpenMarket={() => setActiveTab('packs')}
                onProfileUpdated={onProfileUpdated}
                onStatusUpdated={onStatusUpdated}
              />
            </div>
          )}

        </div>
      </div>

      {/* Guest Notice Modal */}
      {guestNoticeOpen && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
          <div className="bg-neutral-900 border border-amber-500/50 rounded-xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 shrink-0">
                <Lock size={20} />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Sign In Required to Purchase</h3>
                <p className="text-xs text-amber-300">Guests cannot buy items or subscriptions</p>
              </div>
            </div>

            <p className="text-xs text-neutral-300 leading-relaxed">
              To ensure that your purchased action packs or monthly membership benefits are permanently attached to your personal account, you must log in or sign up first.
            </p>

            <div className="flex gap-2 pt-2">
              <button
                onClick={() => setGuestNoticeOpen(false)}
                className="flex-1 px-4 py-2.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded-lg text-xs font-semibold transition-colors"
              >
                Cancel
              </button>
              {onOpenAuth && (
                <button
                  onClick={() => {
                    setGuestNoticeOpen(false);
                    onClose();
                    onOpenAuth();
                  }}
                  className="flex-1 px-4 py-2.5 bg-amber-500 hover:bg-amber-400 text-neutral-950 font-bold rounded-lg text-xs transition-colors flex items-center justify-center gap-1.5 shadow"
                >
                  <UserPlus size={14} />
                  <span>Log In / Sign Up</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Printable / Viewable Official Receipt Modal */}
      <ReceiptModal
        isOpen={!!selectedReceiptForInvoice}
        onClose={() => setSelectedReceiptForInvoice(null)}
        transaction={selectedReceiptForInvoice}
        currentUser={currentUser}
      />
    </div>
  );
};

export default MarketModal;
