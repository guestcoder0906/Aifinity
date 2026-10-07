import React, { useState, useEffect } from 'react';
import {
  Receipt,
  CheckCircle2,
  ExternalLink,
  Calendar,
  CreditCard,
  Zap,
  Crown,
  Sparkles,
  ArrowRight,
  Search,
  RefreshCw,
  Copy,
  Check
} from 'lucide-react';
import {
  UserProfile,
  PaymentTransactionRecord,
  getUserTransactions,
  recordPaymentTransaction,
  getLocalTransactions
} from '../services/authService';
import { syncUserPurchasesFromStripe } from '../services/stripeCheckoutService';
import { ActionLimitService } from '../services/actionLimitService';

interface ReceiptsListProps {
  currentUser: UserProfile | null;
  onViewReceipt: (tx: PaymentTransactionRecord) => void;
  onOpenMarket?: () => void;
  onProfileUpdated?: (user: UserProfile) => void;
  onStatusUpdated?: () => void;
}

export const ReceiptsList: React.FC<ReceiptsListProps> = ({
  currentUser,
  onViewReceipt,
  onOpenMarket,
  onProfileUpdated,
  onStatusUpdated
}) => {
  const [transactions, setTransactions] = useState<PaymentTransactionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncNotice, setSyncNotice] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const loadTransactions = async () => {
    if (!currentUser?.uid) {
      setTransactions([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      // First, attempt to auto-sync any recent Stripe checkout sessions
      try {
        const syncRes = await syncUserPurchasesFromStripe(
          currentUser.uid,
          currentUser.email || undefined,
          currentUser.username || undefined
        );
        if (syncRes.success && syncRes.purchases && syncRes.purchases.length > 0) {
          const localList = getLocalTransactions(currentUser.uid);
          const existingIds = new Set<string>(localList.map((t) => t.id));
          localList.forEach((t) => {
            if (t?.id) existingIds.add(String(t.id).replace(/[^a-zA-Z0-9_-]/g, '_'));
          });

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

          let newCredits = 0;
          let highestTier: string | null = null;
          let newFound = 0;
          const newTxIdsToCredit: string[] = [];

          for (const p of syncRes.purchases) {
            const safeId = String(p.id).replace(/[^a-zA-Z0-9_-]/g, '_');
            const isAlreadyCredited = existingIds.has(p.id) || existingIds.has(safeId);

            if (!isAlreadyCredited) {
              newFound++;
              if (p.itemType === 'pack' && p.actionDelta > 0) {
                newCredits += p.actionDelta;
                newTxIdsToCredit.push(p.id);
                newTxIdsToCredit.push(safeId);
              } else if (p.itemType === 'tier' && p.itemId) {
                highestTier = p.itemId;
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

          if (newCredits > 0 || (highestTier && highestTier !== currentUser.tier)) {
            const updated = await ActionLimitService.applyRestoredPurchases(
              currentUser,
              newCredits,
              highestTier as any,
              undefined,
              undefined,
              newTxIdsToCredit
            );
            if (onProfileUpdated && updated) onProfileUpdated({ ...updated });
            if (onStatusUpdated) onStatusUpdated();
            setSyncNotice(`🎉 Restored ${newFound} Stripe order(s) (+${newCredits} actions${highestTier ? ` & ${highestTier} tier` : ''})!`);
          }
        }
      } catch (syncErr) {
        console.warn('Stripe auto-check in receipts list failed:', syncErr);
      }

      const records = await getUserTransactions(currentUser.uid);
      setTransactions(records);
    } catch (err) {
      console.warn('Failed to load user transactions:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleManualSync = async () => {
    if (!currentUser?.uid) return;
    setIsSyncing(true);
    setSyncNotice(null);
    try {
      const syncRes = await syncUserPurchasesFromStripe(
        currentUser.uid,
        currentUser.email || undefined,
        currentUser.username || undefined
      );

      if (syncRes.success && syncRes.purchases && syncRes.purchases.length > 0) {
        const localList = getLocalTransactions(currentUser.uid);
        const existingIds = new Set<string>(localList.map((t) => t.id));
        localList.forEach((t) => {
          if (t?.id) existingIds.add(String(t.id).replace(/[^a-zA-Z0-9_-]/g, '_'));
        });

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

        let newCredits = 0;
        let highestTier: string | null = null;
        let newFound = 0;
        const newTxIdsToCredit: string[] = [];

        for (const p of syncRes.purchases) {
          const safeId = String(p.id).replace(/[^a-zA-Z0-9_-]/g, '_');
          const isAlreadyCredited = existingIds.has(p.id) || existingIds.has(safeId);

          if (!isAlreadyCredited) {
            newFound++;
            if (p.itemType === 'pack' && p.actionDelta > 0) {
              newCredits += p.actionDelta;
              newTxIdsToCredit.push(p.id);
              newTxIdsToCredit.push(safeId);
            } else if (p.itemType === 'tier' && p.itemId) {
              highestTier = p.itemId;
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

        let updated = currentUser;
        if (newCredits > 0 || (highestTier && highestTier !== currentUser.tier)) {
          updated = await ActionLimitService.applyRestoredPurchases(
            currentUser,
            newCredits,
            highestTier as any,
            undefined,
            undefined,
            newTxIdsToCredit
          );
        }
        if (onProfileUpdated && updated) onProfileUpdated({ ...updated });
        if (onStatusUpdated) onStatusUpdated();

        const updatedRecords = await getUserTransactions(currentUser.uid);
        setTransactions(updatedRecords);

        if (newCredits > 0 || highestTier) {
          setSyncNotice(`🎉 Successfully restored ${newFound} Stripe order(s) totaling +${newCredits} actions${highestTier ? ` & ${highestTier} tier` : ''}!`);
        } else {
          setSyncNotice(`Verified ${syncRes.count} Stripe transaction(s). All purchases are already up-to-date on your account.`);
        }
      } else {
        setSyncNotice('No Stripe transactions were found matching your account.');
      }
    } catch (e: any) {
      setSyncNotice('Could not connect to Stripe. Please try again.');
    } finally {
      setIsSyncing(false);
    }
  };

  useEffect(() => {
    loadTransactions();
  }, [currentUser?.uid]);

  const handleCopy = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(id);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const filtered = transactions.filter((tx) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      tx.itemName.toLowerCase().includes(q) ||
      tx.id.toLowerCase().includes(q) ||
      tx.paymentMethod.toLowerCase().includes(q) ||
      (tx.newTier && tx.newTier.toLowerCase().includes(q))
    );
  });

  return (
    <div className="space-y-4">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-neutral-800">
        <div>
          <h3 className="text-base font-bold text-white flex items-center gap-2">
            <Receipt size={18} className="text-amber-400" />
            <span>Order History & Digital Receipts</span>
            <span className="text-xs font-mono px-2 py-0.5 rounded-full bg-neutral-800 text-neutral-300">
              {transactions.length}
            </span>
          </h3>
          <p className="text-xs text-neutral-400">
            Official records and itemized invoices for all Action Packs and Subscriptions
          </p>
        </div>

        <div className="flex items-center gap-2">
          {transactions.length > 0 && (
            <div className="relative">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral-500" />
              <input
                type="text"
                placeholder="Search orders..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="bg-black/60 border border-neutral-800 rounded-lg pl-8 pr-3 py-1 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-amber-500 w-36 sm:w-44"
              />
            </div>
          )}
          <button
            onClick={handleManualSync}
            disabled={isSyncing}
            title="Restore Stripe purchases across accounts"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 text-xs font-mono transition-colors disabled:opacity-50"
          >
            <RefreshCw size={13} className={isSyncing ? 'animate-spin text-amber-400' : ''} />
            <span className="hidden sm:inline">{isSyncing ? 'Syncing...' : 'Restore Stripe Orders'}</span>
          </button>
          <button
            onClick={loadTransactions}
            title="Refresh transactions"
            className="p-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-400 hover:text-white transition-colors"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin text-amber-400' : ''} />
          </button>
        </div>
      </div>

      {syncNotice && (
        <div className="p-3 bg-amber-950/40 border border-amber-800/60 rounded-xl text-xs text-amber-200 font-mono flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={16} className="text-amber-400 shrink-0" />
            <span>{syncNotice}</span>
          </div>
          <button
            onClick={() => setSyncNotice(null)}
            className="text-amber-400/80 hover:text-white text-xs px-1.5 py-0.5"
          >
            ✕
          </button>
        </div>
      )}

      {/* Content */}
      {loading ? (
        <div className="p-8 text-center space-y-3">
          <RefreshCw size={24} className="animate-spin mx-auto text-amber-400" />
          <p className="text-xs text-neutral-400 font-mono">Loading transaction records...</p>
        </div>
      ) : !currentUser ? (
        <div className="p-6 bg-neutral-950/60 rounded-xl border border-neutral-800 text-center space-y-3">
          <Receipt size={32} className="mx-auto text-neutral-600" />
          <div className="space-y-1">
            <h4 className="text-sm font-bold text-white">Log In to View Receipts</h4>
            <p className="text-xs text-neutral-400 max-w-sm mx-auto">
              You are currently playing as a guest. When you log in and make purchases, your receipts and order invoices are permanently saved here.
            </p>
          </div>
        </div>
      ) : transactions.length === 0 ? (
        <div className="p-8 bg-neutral-950/60 rounded-xl border border-neutral-800 text-center space-y-3">
          <div className="w-12 h-12 rounded-full bg-neutral-800/80 border border-neutral-700 mx-auto flex items-center justify-center text-neutral-500">
            <Receipt size={22} />
          </div>
          <div className="space-y-1">
            <h4 className="text-sm font-bold text-white">No Purchase Receipts Yet</h4>
            <p className="text-xs text-neutral-400 max-w-sm mx-auto">
              Any Action Packs or Subscriptions you purchase through Stripe Checkout or Credit Card will instantly appear here with full printable invoices.
            </p>
          </div>
          {onOpenMarket && (
            <button
              onClick={onOpenMarket}
              className="mt-2 inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-neutral-950 text-xs font-bold transition-all shadow"
            >
              <span>Explore Action Packs</span>
              <ArrowRight size={13} />
            </button>
          )}
        </div>
      ) : filtered.length === 0 ? (
        <div className="p-6 text-center text-xs text-neutral-500 font-mono">
          No orders match "{searchQuery}"
        </div>
      ) : (
        <div className="space-y-2.5">
          {filtered.map((tx) => {
            const formattedDate = tx.createdAt
              ? new Date(tx.createdAt).toLocaleDateString(undefined, {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit'
                })
              : 'Recent';

            const isPack = tx.itemType === 'pack';

            return (
              <div
                key={tx.id}
                onClick={() => onViewReceipt(tx)}
                className="group p-3.5 bg-neutral-950/80 hover:bg-neutral-900 border border-neutral-800/80 hover:border-amber-500/50 rounded-xl transition-all cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm"
              >
                {/* Left: Icon & Item Info */}
                <div className="flex items-start sm:items-center gap-3">
                  <div
                    className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                      isPack
                        ? 'bg-amber-500/10 border border-amber-500/30 text-amber-400'
                        : 'bg-blue-500/10 border border-blue-500/30 text-blue-400'
                    }`}
                  >
                    {isPack ? <Zap size={18} /> : <Crown size={18} />}
                  </div>

                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-white text-sm group-hover:text-amber-300 transition-colors">
                        {tx.itemName}
                      </span>
                      <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded-full bg-emerald-950/80 text-emerald-400 border border-emerald-500/40 flex items-center gap-1 font-semibold">
                        <CheckCircle2 size={10} />
                        Completed
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 text-[11px] text-neutral-400">
                      <span className="flex items-center gap-1">
                        <Calendar size={11} className="text-neutral-500" />
                        {formattedDate}
                      </span>
                      <span>•</span>
                      <span className="flex items-center gap-1">
                        <CreditCard size={11} className="text-neutral-500" />
                        {tx.paymentMethod}
                      </span>
                      {tx.actionDelta && (
                        <>
                          <span>•</span>
                          <span className="text-amber-400 font-mono">+{tx.actionDelta} Actions</span>
                        </>
                      )}
                      {tx.newTier && (
                        <>
                          <span>•</span>
                          <span className="text-yellow-400 font-mono">{tx.newTier} Tier</span>
                        </>
                      )}
                      {(tx.attachedUsername || tx.recipient) && (
                        <>
                          <span>•</span>
                          <span className="text-neutral-400 font-mono">
                            Account: <span className="text-neutral-300 font-semibold">{tx.attachedUsername || tx.recipient}</span>
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* Right: Price & View Receipt Button */}
                <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-neutral-900">
                  <div className="text-left sm:text-right">
                    <div className="text-sm font-black text-white font-mono">
                      ${(Number(tx.amount) || 0).toFixed(2)}
                    </div>
                    <div className="text-[10px] text-neutral-500 font-mono">
                      ID: {(tx.id || 'N/A').slice(0, 10)}...
                    </div>
                  </div>

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onViewReceipt(tx);
                    }}
                    className="px-3 py-1.5 rounded-lg bg-neutral-800 group-hover:bg-amber-500 group-hover:text-neutral-950 text-neutral-200 text-xs font-bold transition-colors flex items-center gap-1 shrink-0"
                  >
                    <span>View Receipt</span>
                    <ExternalLink size={12} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default ReceiptsList;
