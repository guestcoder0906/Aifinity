import React, { useState } from 'react';
import { safeStorage } from '../services/safeStorage';
import {
  X,
  Sparkles,
  Zap,
  BookmarkCheck,
  ShoppingCart,
  ShieldCheck,
  ArrowRight,
  UserPlus
} from 'lucide-react';

interface GuestWelcomeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenAuth: (mode?: 'login' | 'signup') => void;
}

export const GuestWelcomeModal: React.FC<GuestWelcomeModalProps> = ({
  isOpen,
  onClose,
  onOpenAuth
}) => {
  const [dontShowAgain, setDontShowAgain] = useState(false);

  if (!isOpen) return null;

  const handleDismiss = () => {
    if (dontShowAgain) {
      try {
        safeStorage.setItem('aimud_hide_guest_welcome', 'true');
      } catch (e) {}
    }
    onClose();
  };

  const handleDismissNever = () => {
    try {
      safeStorage.setItem('aimud_hide_guest_welcome', 'true');
    } catch (e) {}
    onClose();
  };

  const handleSignUpClick = () => {
    if (dontShowAgain) {
      try {
        safeStorage.setItem('aimud_hide_guest_welcome', 'true');
      } catch (e) {}
    }
    onClose();
    onOpenAuth('signup');
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200 font-sans overflow-y-auto"
      style={{ WebkitOverflowScrolling: 'touch' }}
    >
      <div className="bg-neutral-900 border border-amber-500/40 w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden relative text-neutral-200 flex flex-col max-h-[calc(100dvh-1.5rem)] sm:max-h-[calc(100dvh-2rem)] my-auto shrink-0">
        
        {/* Decorative Top Accent Bar */}
        <div className="h-1.5 w-full bg-gradient-to-r from-amber-500 via-yellow-400 to-amber-600 shrink-0"></div>

        {/* Close Button */}
        <button
          onClick={handleDismiss}
          className="absolute top-4 right-4 text-neutral-400 hover:text-white p-1.5 rounded-lg hover:bg-neutral-800 transition-colors z-10"
          title="Close prompt"
        >
          <X size={18} />
        </button>

        <div className="p-4 sm:p-6 space-y-4 sm:space-y-5 overflow-y-auto max-h-full font-sans">
          {/* Header */}
          <div className="flex items-start gap-3.5">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-amber-500/20 to-yellow-500/10 border border-amber-500/40 flex items-center justify-center text-amber-400 shrink-0 shadow-inner">
              <Sparkles size={24} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold tracking-tight text-white">
                  Welcome to Aifinity!
                </h2>
                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/40 font-mono">
                  Beta Phase
                </span>
              </div>
              <p className="text-xs text-neutral-400 mt-0.5">
                Experience infinite AI text RPG adventures solo or with friends.
              </p>
            </div>
          </div>

          {/* Guest Comparison Callout */}
          <div className="p-3.5 bg-neutral-950 border border-neutral-800 rounded-xl space-y-3">
            <div className="flex items-center justify-between text-xs pb-2 border-b border-neutral-800/80">
              <span className="text-neutral-400">Account Benefits:</span>
              <span className="font-mono font-bold text-blue-300 bg-blue-950/50 px-2 py-0.5 rounded border border-blue-900/60 flex items-center gap-1">
                <Zap size={12} className="text-blue-400" /> 20 Daily Free Actions
                <span className="text-[10px] text-blue-400 font-normal">(+10 during Beta)</span>
              </span>
            </div>

            <div className="space-y-2.5 pt-1">
              <div className="flex items-start gap-2.5 text-xs">
                <div className="w-5 h-5 rounded-md bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0 mt-0.5">
                  <Zap size={13} />
                </div>
                <div>
                  <strong className="text-white">Unlock 20 Daily Free Actions:</strong>{' '}
                  <span className="text-neutral-300">
                    Registered accounts receive 20 daily free actions <span className="text-blue-400 font-medium">(+10 daily free actions during Beta)</span> and can stack up to 200 free actions! Guests receive 5 initial trial actions.
                  </span>
                </div>
              </div>

              <div className="flex items-start gap-2.5 text-xs">
                <div className="w-5 h-5 rounded-md bg-blue-500/20 text-blue-400 flex items-center justify-center shrink-0 mt-0.5">
                  <BookmarkCheck size={13} />
                </div>
                <div>
                  <strong className="text-white">Save Your Adventures:</strong>{' '}
                  <span className="text-neutral-300">
                    Permanently save your stories, choices, inventory, and worlds to your account.
                  </span>
                </div>
              </div>

              <div className="flex items-start gap-2.5 text-xs">
                <div className="w-5 h-5 rounded-md bg-amber-500/20 text-amber-400 flex items-center justify-center shrink-0 mt-0.5">
                  <ShoppingCart size={13} />
                </div>
                <div>
                  <strong className="text-white">Unlock Aifinity Market:</strong>{' '}
                  <span className="text-neutral-300">
                    Buy permanent action packs (starting at $0.99) or activate monthly memberships.
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Primary Call to Action */}
          <div className="space-y-2.5">
            <button
              onClick={handleSignUpClick}
              className="w-full py-3 px-4 bg-gradient-to-r from-amber-500 via-yellow-500 to-amber-500 hover:from-amber-400 hover:to-yellow-400 text-neutral-950 font-bold text-sm rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-amber-500/10 hover:shadow-amber-500/20 transition-all cursor-pointer"
            >
              <UserPlus size={16} />
              <span>Create Account (Unlock 20 Daily Free Actions)</span>
              <ArrowRight size={15} />
            </button>

            <button
              onClick={handleDismiss}
              className="w-full py-2.5 px-4 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 font-medium text-xs rounded-xl transition-colors"
            >
              Continue as Guest (5 Free Trial Actions)
            </button>
          </div>

          {/* Option to Not Show Again */}
          <div className="pt-2 border-t border-neutral-800/80 flex items-center justify-between text-xs text-neutral-400">
            <label className="flex items-center gap-2 cursor-pointer select-none hover:text-neutral-200 transition-colors">
              <input
                type="checkbox"
                checked={dontShowAgain}
                onChange={(e) => setDontShowAgain(e.target.checked)}
                className="w-3.5 h-3.5 rounded bg-black border-neutral-700 text-amber-500 focus:ring-0 focus:outline-none cursor-pointer"
              />
              <span>Don't show this prompt again</span>
            </label>

            <button
              onClick={handleDismissNever}
              className="text-[11px] text-neutral-500 hover:text-neutral-300 transition-colors underline"
            >
              Never show again
            </button>
          </div>

        </div>

      </div>
    </div>
  );
};

export default GuestWelcomeModal;
