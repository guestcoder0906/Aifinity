import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Gift, Sparkles, CheckCircle2, Zap, X } from 'lucide-react';

interface DailyClaimNotificationBannerProps {
  amount: number;
  stacked?: number;
  totalStacked?: number;
  total: number;
  onDismiss: () => void;
}

export const DailyClaimNotificationBanner: React.FC<DailyClaimNotificationBannerProps> = ({
  amount,
  stacked = 0,
  totalStacked = 0,
  total,
  onDismiss,
}) => {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      onDismiss();
    }, 8000);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  const bannerContent = (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-x-0 top-0 z-[9999999] pointer-events-none flex justify-center items-start pt-[max(0.75rem,env(safe-area-inset-top))] px-3 sm:px-4 box-border w-screen"
      style={{
        paddingTop: 'max(0.75rem, calc(env(safe-area-inset-top, 0px) + 0.5rem))',
        paddingLeft: 'max(0.75rem, calc(env(safe-area-inset-left, 0px) + 0.75rem))',
        paddingRight: 'max(0.75rem, calc(env(safe-area-inset-right, 0px) + 0.75rem))',
      }}
    >
      <div className="pointer-events-auto w-full max-w-md mx-auto bg-neutral-950/98 border-2 border-emerald-500/90 rounded-2xl p-3.5 sm:p-4 shadow-[0_16px_48px_rgba(0,0,0,0.9),0_0_24px_rgba(16,185,129,0.3)] backdrop-blur-2xl ring-1 ring-emerald-400/50 flex items-start gap-2.5 sm:gap-3 text-white max-h-[85dvh] overflow-y-auto box-border transition-all duration-300 animate-in fade-in slide-in-from-top-4">
        {/* Leading Gift Icon */}
        <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center shrink-0 text-emerald-400 shadow-[0_0_12px_rgba(16,185,129,0.3)] mt-0.5">
          <Gift size={18} className="animate-bounce sm:w-5 sm:h-5" />
        </div>

        {/* Content Body */}
        <div className="flex-1 min-w-0 pr-1">
          <div className="flex items-center gap-1.5 font-bold text-xs sm:text-sm text-emerald-300">
            <span className="truncate">Claimed Free Daily Actions</span>
            <Sparkles size={13} className="text-amber-400 shrink-0" />
          </div>

          <p className="text-[11px] sm:text-xs text-neutral-200 mt-1 leading-snug break-words">
            <span className="font-extrabold text-emerald-400">+{amount} daily actions</span> granted! (20 Free daily actions + 10 Beta bonus)
          </p>

          <div className="mt-1.5 text-[10px] sm:text-[11px] text-neutral-300 font-medium flex items-center gap-1.5 flex-wrap">
            <Zap size={11} className="text-amber-400 shrink-0" />
            <span>Free Actions: <strong className="text-emerald-300">{totalStacked}/200 max</strong></span>
            {totalStacked >= 200 && <span className="text-amber-400 font-bold">(Max capacity)</span>}
          </div>

          <div className="mt-1.5 sm:mt-2 flex items-center gap-1.5 text-[10px] sm:text-[11px] text-neutral-400 font-mono">
            <CheckCircle2 size={12} className="text-emerald-400 shrink-0" />
            <span>Total Available: <strong className="text-white">{total} actions</strong></span>
          </div>
        </div>

        {/* Close Button */}
        <button
          onClick={onDismiss}
          className="p-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors shrink-0 cursor-pointer min-w-[28px] min-h-[28px] flex items-center justify-center -mr-0.5 -mt-0.5"
          title="Dismiss notification"
          aria-label="Dismiss notification"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );

  if (!mounted || typeof document === 'undefined') {
    return bannerContent;
  }

  return createPortal(bannerContent, document.body);
};
