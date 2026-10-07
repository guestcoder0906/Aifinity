import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Receipt as ReceiptIcon, X, Sparkles, CheckCircle2, AlertCircle, Info } from 'lucide-react';
import { PaymentTransactionRecord } from '../services/authService';

interface PurchaseNotificationBannerProps {
  message: {
    type: 'success' | 'info' | 'error';
    text: string;
  } | null;
  onDismiss: () => void;
  verifiedReceipt?: PaymentTransactionRecord | null;
  onOpenReceipt?: () => void;
  onOpenOrderHistory?: () => void;
}

export const PurchaseNotificationBanner: React.FC<PurchaseNotificationBannerProps> = ({
  message,
  onDismiss,
  verifiedReceipt,
  onOpenReceipt,
  onOpenOrderHistory,
}) => {
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => {
      onDismiss();
    }, 12000);
    return () => clearTimeout(timer);
  }, [message, onDismiss]);

  if (!message || typeof document === 'undefined') return null;

  const isSuccess = message.type === 'success';
  const isError = message.type === 'error';

  const bannerContent = (
    <div
      className="fixed inset-0 z-[999999] flex items-center justify-center p-3 sm:p-5 bg-black/75 backdrop-blur-sm overflow-y-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget) onDismiss();
      }}
    >
      <div
        id="purchase-notification-toast"
        aria-label="Purchase Notification"
        className="w-full max-w-md mx-auto my-auto max-h-[92dvh] flex flex-col transition-all duration-300 animate-in fade-in zoom-in-95"
      >
        <div
          className={`p-4 sm:p-5 rounded-2xl border-2 shadow-[0_20px_60px_rgba(0,0,0,0.95)] backdrop-blur-2xl flex flex-col gap-3 overflow-y-auto max-h-[88dvh] ${
            isSuccess
              ? 'bg-neutral-950/98 border-emerald-500/90 text-emerald-100 ring-2 ring-emerald-400/40'
              : isError
              ? 'bg-neutral-950/98 border-rose-500/90 text-rose-100 ring-2 ring-rose-400/40'
              : 'bg-neutral-950/98 border-blue-500/90 text-blue-100 ring-2 ring-blue-400/40'
          }`}
        >
          {/* Header Row */}
          <div className="flex items-center justify-between gap-2.5">
            <div className="flex items-center gap-2.5 min-w-0">
              <div
                className={`w-8 h-8 sm:w-9 sm:h-9 rounded-xl flex items-center justify-center shrink-0 ${
                  isSuccess
                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                    : isError
                    ? 'bg-rose-500/20 text-rose-400 border border-rose-500/40'
                    : 'bg-blue-500/20 text-blue-400 border border-blue-500/40'
                }`}
              >
                {isSuccess ? (
                  <CheckCircle2 className="w-5 h-5" />
                ) : isError ? (
                  <AlertCircle className="w-5 h-5" />
                ) : (
                  <Info className="w-5 h-5" />
                )}
              </div>
              <span className="text-sm sm:text-base font-bold tracking-tight text-white flex items-center gap-1.5 truncate">
                <span className="truncate">{isSuccess ? 'Payment Verified & Applied!' : isError ? 'Payment Issue' : 'Payment Notification'}</span>
                {isSuccess && <Sparkles size={15} className="text-amber-400 inline shrink-0" />}
              </span>
            </div>

            <button
              id="dismiss-purchase-banner-btn"
              onClick={onDismiss}
              aria-label="Close notification"
              className="text-neutral-400 hover:text-white p-1.5 rounded-lg hover:bg-neutral-800/80 transition-colors shrink-0"
            >
              <X size={18} />
            </button>
          </div>

          {/* Message Body */}
          <p className="text-xs sm:text-sm leading-relaxed text-neutral-200 break-words pl-0.5">
            {message.text}
          </p>

          {/* Action Controls */}
          <div className="flex flex-wrap items-center gap-2 pt-2.5 border-t border-neutral-800/80 mt-1">
            {verifiedReceipt && onOpenReceipt && (
              <button
                id="view-receipt-from-banner-btn"
                onClick={onOpenReceipt}
                className="px-3 py-2 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-neutral-950 font-bold rounded-lg text-xs sm:text-sm flex items-center gap-1.5 transition-all shadow-md active:scale-95 shrink-0"
              >
                <ReceiptIcon size={15} className="shrink-0" />
                <span>View Official Receipt</span>
              </button>
            )}

            {onOpenOrderHistory && (
              <button
                id="view-order-history-from-banner-btn"
                onClick={onOpenOrderHistory}
                className="px-3 py-2 text-xs sm:text-sm text-neutral-300 hover:text-white bg-neutral-800 hover:bg-neutral-700/80 rounded-lg transition-colors border border-neutral-700/60 shrink-0"
              >
                Order History
              </button>
            )}

            <button
              id="dismiss-btn"
              onClick={onDismiss}
              className="px-3 py-2 text-xs sm:text-sm text-neutral-400 hover:text-white bg-neutral-800/60 hover:bg-neutral-800 rounded-lg transition-colors shrink-0 sm:ml-auto"
            >
              Dismiss
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(bannerContent, document.body);
};
