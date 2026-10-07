import React, { useState } from 'react';
import { X, Copy, Check, Users, Share2, Sparkles, ShieldCheck } from 'lucide-react';

interface ShareRoomModalProps {
  isOpen: boolean;
  onClose: () => void;
  roomId: string;
  hostUsername?: string;
  isHost?: boolean;
}

export const ShareRoomModal: React.FC<ShareRoomModalProps> = ({
  isOpen,
  onClose,
  roomId,
  hostUsername,
  isHost = true
}) => {
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  if (!isOpen || !roomId) return null;

  const handleCopyCode = async () => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(roomId);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = roomId;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2500);
    } catch (err) {
      console.warn('Failed to copy code to clipboard:', err);
    }
  };

  const getShareUrl = () => {
    if (typeof window === 'undefined') return '';
    const origin = window.location.origin;
    return `${origin}/?room=${encodeURIComponent(roomId)}`;
  };

  const handleCopyLink = async () => {
    try {
      const url = getShareUrl();
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(url);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = url;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2500);
    } catch (err) {
      console.warn('Failed to copy link to clipboard:', err);
    }
  };

  return (
    <div
      id="share-room-modal"
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/85 backdrop-blur-sm p-4 font-sans animate-in fade-in duration-200 overflow-y-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-neutral-900 border border-neutral-700/80 w-full max-w-md rounded-2xl shadow-2xl p-6 md:p-7 relative text-neutral-200 flex flex-col gap-5 my-auto">
        
        {/* Close button */}
        <button
          id="close-share-room-modal"
          onClick={onClose}
          className="absolute top-4 right-4 text-neutral-400 hover:text-white p-1.5 rounded-lg hover:bg-neutral-800 transition-colors cursor-pointer"
          title="Close"
          aria-label="Close"
        >
          <X size={18} />
        </button>

        {/* Header with icon badge */}
        <div className="flex items-start gap-3.5 pr-6">
          <div className="w-10 h-10 rounded-xl bg-blue-500/20 border border-blue-500/40 flex items-center justify-center text-blue-400 shrink-0 shadow-[0_0_15px_rgba(59,130,246,0.3)]">
            <Share2 size={20} />
          </div>
          <div>
            <h2 className="text-lg font-black text-white tracking-wide font-mono flex items-center gap-2">
              <span>{isHost ? 'Multiplayer Realm Created' : 'Multiplayer Room Code'}</span>
              <Sparkles size={15} className="text-amber-400" />
            </h2>
            <p className="text-xs text-neutral-400 mt-0.5">
              Share your room code with others to join this cooperative adventure!
            </p>
          </div>
        </div>

        {/* Room Code Showcase Box */}
        <div className="bg-neutral-950/90 border border-blue-500/30 rounded-xl p-4 flex flex-col items-center justify-center gap-2.5 shadow-inner relative overflow-hidden">
          <div className="absolute top-0 inset-x-0 h-0.5 bg-gradient-to-r from-transparent via-blue-500 to-transparent opacity-70" />
          
          <span className="text-[11px] font-mono text-neutral-400 uppercase tracking-widest font-semibold flex items-center gap-1.5">
            <Users size={12} className="text-blue-400" />
            Room Access Code
          </span>

          <div className="flex items-center justify-center gap-3 w-full my-1">
            <div className="text-3xl md:text-4xl font-black font-mono tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-sky-300 to-indigo-300 select-all px-3 py-1 bg-blue-950/30 border border-blue-800/40 rounded-lg">
              {roomId}
            </div>
          </div>

          <div className="flex items-center gap-2 w-full mt-1">
            <button
              onClick={handleCopyCode}
              className={`flex-1 py-2.5 px-3 rounded-lg font-mono text-xs font-bold flex items-center justify-center gap-2 transition-all shadow-md cursor-pointer ${
                copiedCode
                  ? 'bg-emerald-600 text-white shadow-[0_0_15px_rgba(16,185,129,0.4)]'
                  : 'bg-blue-600 hover:bg-blue-500 text-white shadow-[0_0_12px_rgba(37,99,235,0.3)]'
              }`}
            >
              {copiedCode ? (
                <>
                  <Check size={14} className="text-emerald-200" />
                  <span>Code Copied!</span>
                </>
              ) : (
                <>
                  <Copy size={14} />
                  <span>Copy Room Code</span>
                </>
              )}
            </button>

            <button
              onClick={handleCopyLink}
              title="Copy Direct Join Link"
              className={`py-2.5 px-3 rounded-lg font-mono text-xs font-medium border flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                copiedLink
                  ? 'bg-emerald-950/60 border-emerald-500 text-emerald-300'
                  : 'bg-neutral-900 hover:bg-neutral-800 border-neutral-700 text-neutral-300'
              }`}
            >
              {copiedLink ? (
                <>
                  <Check size={13} className="text-emerald-400" />
                  <span>Link Copied</span>
                </>
              ) : (
                <>
                  <Share2 size={13} />
                  <span>Copy Link</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Instructions / Tips */}
        <div className="bg-neutral-950/50 border border-neutral-800/80 rounded-xl p-3.5 text-xs text-neutral-400 space-y-1.5">
          <div className="flex items-center gap-1.5 text-neutral-300 font-semibold text-[11.5px]">
            <ShieldCheck size={13} className="text-emerald-400" />
            <span>How friends can join:</span>
          </div>
          <ol className="list-decimal list-inside space-y-1 text-[11px] text-neutral-400 leading-relaxed pl-1">
            <li>Click <strong className="text-blue-300">Multiplayer</strong> in the top menu or on the welcome page.</li>
            <li>Select <strong className="text-blue-300">Join Realm</strong> and paste the room code <strong className="font-mono text-white bg-neutral-800 px-1 py-0.5 rounded">{roomId}</strong>.</li>
            <li>Once they join and submit their character, everyone plays synchronously in turns!</li>
          </ol>
        </div>

        {/* Footer buttons */}
        <div className="flex items-center justify-end gap-2 pt-1 border-t border-neutral-800/80">
          <button
            onClick={onClose}
            className="w-full sm:w-auto px-5 py-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 hover:text-white rounded-lg text-xs font-mono font-semibold transition-colors cursor-pointer text-center"
          >
            {isHost ? 'Start Setting Up World & Adventure' : 'Close'}
          </button>
        </div>

      </div>
    </div>
  );
};
