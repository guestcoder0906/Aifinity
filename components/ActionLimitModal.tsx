import React, { useState } from 'react';
import { safeStorage } from '../services/safeStorage';
import { X, AlertCircle, Key, ShoppingCart, ExternalLink, ArrowRight, BookOpen, CheckCircle2, UserPlus, Sparkles, BookmarkCheck } from 'lucide-react';

interface ActionLimitModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser?: any;
  actionStatus?: any;
  onOpenMarket: (tab?: 'packs' | 'subscriptions' | 'apikey') => void;
  onApiKeySaved: () => void;
  onOpenAuth?: (mode?: 'login' | 'signup') => void;
}

export const ActionLimitModal: React.FC<ActionLimitModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  actionStatus,
  onOpenMarket,
  onApiKeySaved,
  onOpenAuth
}) => {
  const [showKeyGuide, setShowKeyGuide] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [keySaved, setKeySaved] = useState(false);

  if (!isOpen) return null;

  const isGuest = !currentUser;

  const handleSaveKey = () => {
    if (apiKeyInput.trim()) {
      safeStorage.setItem('aimud_apikey', apiKeyInput.trim());
      setKeySaved(true);
      onApiKeySaved();
      setTimeout(() => {
        window.location.reload();
      }, 1000);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm animate-in fade-in duration-200 font-sans">
      <div className="bg-neutral-900 border border-neutral-700 w-full max-w-lg rounded-xl shadow-2xl p-6 relative text-neutral-200">
        
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-neutral-400 hover:text-white p-1 rounded-lg hover:bg-neutral-800 transition-colors"
        >
          <X size={18} />
        </button>

        <div className="flex items-center gap-3 mb-4">
          <div className={`w-10 h-10 rounded-full ${isGuest ? 'bg-amber-500/20 border-amber-500/40 text-amber-400' : 'bg-amber-950/60 border-amber-500/40 text-amber-400'} border flex items-center justify-center shrink-0`}>
            {isGuest ? <Sparkles size={22} /> : <AlertCircle size={22} />}
          </div>
          <div>
            <h3 className="text-lg font-bold text-white">
              {isGuest ? "Guest Action Limit Reached" : "Daily Free Actions Limit Reached"}
            </h3>
            <p className="text-xs text-neutral-400">
              {isGuest
                ? "You've used all 5 free initial preview actions for this guest session."
                : "You've used all 30 free daily actions today (20 base + 10 Beta bonus)."}
            </p>
          </div>
        </div>

        {isGuest ? (
          /* Guest Out-of-Actions Prompt: Direct to Sign Up / Log In */
          <div className="mb-5 space-y-4">
            <div className="p-4 bg-gradient-to-br from-neutral-950 to-neutral-900 border border-amber-500/30 rounded-xl space-y-3">
              <div className="text-xs font-semibold text-amber-300 flex items-center gap-1.5">
                <Sparkles size={14} />
                <span>Create a free account or log in to unlock:</span>
              </div>
              <ul className="text-xs space-y-2 text-neutral-300">
                <li className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0"></span>
                  <span><strong>30 Free Actions Daily:</strong> 20 base + 10 Beta bonus refreshed & stacked every day (stacks up to max 200 free actions)</span>
                </li>
                <li className="flex items-center gap-2">
                  <BookmarkCheck size={13} className="text-blue-400 shrink-0" />
                  <span><strong>Save Your Adventures:</strong> Never lose character or story progress</span>
                </li>
                <li className="flex items-center gap-2">
                  <ShoppingCart size={13} className="text-amber-400 shrink-0" />
                  <span><strong>Buy Action Packs:</strong> Top up anytime starting at $0.99</span>
                </li>
              </ul>
            </div>

            {onOpenAuth && (
              <button
                onClick={() => {
                  onClose();
                  onOpenAuth('signup');
                }}
                className="w-full py-3 px-4 bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 text-neutral-950 font-bold text-sm rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-amber-500/20 transition-all cursor-pointer"
              >
                <UserPlus size={16} />
                <span>Sign Up / Log In (Get 30 Free Actions)</span>
                <ArrowRight size={15} />
              </button>
            )}
          </div>
        ) : (
          <p className="text-xs text-neutral-300 leading-relaxed mb-5">
            Your daily free action quota will automatically refresh tomorrow. In the meantime, you can continue playing immediately using either option below:
          </p>
        )}

        {/* Option A: Connect Your Own Free Gemini API Key */}
        <div className="bg-neutral-950 border border-neutral-800 rounded-xl p-4 mb-3 hover:border-blue-500/50 transition-colors">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2 mb-1">
              <Key size={16} className="text-blue-400" />
              <h4 className="font-bold text-sm text-white">
                {isGuest ? "Alternative: Connect Free Gemini API Key" : "Option 1: Connect Free Gemini API Key"}
              </h4>
            </div>
            <span className="text-[10px] bg-emerald-950 text-emerald-300 border border-emerald-800/80 px-2 py-0.5 rounded font-mono">
              100% Free
            </span>
          </div>

          <p className="text-xs text-neutral-400 mb-3">
            Use your personal Google Gemini API key to play infinitely using your own resources without action limits.
          </p>

          {!showKeyGuide ? (
            <div className="flex gap-2">
              <button
                onClick={() => setShowKeyGuide(true)}
                className="text-xs font-semibold text-blue-400 hover:text-blue-300 flex items-center gap-1.5 py-1"
              >
                <BookOpen size={13} />
                <span>View Quick Guide & Connect Key</span>
              </button>
            </div>
          ) : (
            <div className="space-y-3 pt-2 border-t border-neutral-800 animate-in fade-in duration-150">
              <div className="text-[11px] text-neutral-300 space-y-1.5 bg-neutral-900 p-3 rounded-lg border border-neutral-800">
                <p>1. Open Google AI Studio: <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer" className="text-blue-400 underline inline-flex items-center gap-0.5">aistudio.google.com/app/apikey <ExternalLink size={10} /></a></p>
                <p>2. Click <strong>"Create API Key"</strong> and copy it.</p>
                <p>3. Paste below to unlock infinite turns:</p>
              </div>

              <div className="flex gap-2">
                <input
                  type="password"
                  placeholder="Paste AIzaSy... key"
                  value={apiKeyInput}
                  onChange={(e) => setApiKeyInput(e.target.value)}
                  className="flex-1 bg-black border border-neutral-700 rounded px-2.5 py-1.5 text-xs text-white font-mono"
                />
                <button
                  onClick={handleSaveKey}
                  className="bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold px-3 py-1.5 rounded transition-colors"
                >
                  Activate
                </button>
              </div>

              {keySaved && (
                <p className="text-xs text-emerald-400 font-mono flex items-center gap-1">
                  <CheckCircle2 size={13} />
                  Key verified! Reloading simulation...
                </p>
              )}
            </div>
          )}
        </div>

        {/* Option B: Aifinity Market */}
        <div className="bg-neutral-950 border border-neutral-800 rounded-xl p-4 mb-4 hover:border-amber-500/50 transition-colors">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2 mb-1">
              <ShoppingCart size={16} className="text-amber-400" />
              <h4 className="font-bold text-sm text-white">
                {isGuest ? "Aifinity Market" : "Option 2: Get Action Packs or Subscribe"}
              </h4>
            </div>
            <span className="text-[10px] bg-amber-950 text-amber-300 border border-amber-800/80 px-2 py-0.5 rounded font-mono">
              From $2.99
            </span>
          </div>

          <p className="text-xs text-neutral-400 mb-3">
            {isGuest
              ? "Action packs start at $2.99 (20 actions) up to 500 actions, and monthly subscriptions offer unlimited play. (Requires free account)."
              : "Top up action packs starting at $2.99 (20 actions) up to 500 actions, or get Adventurer / Legendary tier for unlimited play."}
          </p>

          <button
            onClick={() => {
              onClose();
              if (isGuest && onOpenAuth) {
                onOpenAuth('signup');
              } else {
                onOpenMarket('packs');
              }
            }}
            className="w-full bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 text-neutral-950 font-bold text-xs py-2 px-3 rounded-lg flex items-center justify-center gap-1.5 shadow-md transition-all"
          >
            <span>{isGuest ? "Sign Up to Access Market" : "Open Aifinity Market"}</span>
            <ArrowRight size={13} />
          </button>
        </div>

        <div className="text-center">
          <button
            onClick={onClose}
            className="text-xs text-neutral-400 hover:text-neutral-200"
          >
            {isGuest ? "Cancel" : "I'll wait until tomorrow's free daily reset"}
          </button>
        </div>

      </div>
    </div>
  );
};

export default ActionLimitModal;
