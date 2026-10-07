import React, { useState } from 'react';
import {
  setGuestName,
  clearGuestName,
  generateRandomUsername,
  validateUsernameFormat
} from '../services/authService';
import { X, User, Dices, AlertCircle, Check } from 'lucide-react';

interface GuestNameModalProps {
  isOpen: boolean;
  onClose: () => void;
  guestId: string;
  currentGuestName: string | null;
  onNameSaved: (newName: string | null) => void;
}

export const GuestNameModal: React.FC<GuestNameModalProps> = ({
  isOpen,
  onClose,
  guestId,
  currentGuestName,
  onNameSaved
}) => {
  const [nameInput, setNameInput] = useState(currentGuestName || '');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleRandomize = () => {
    setNameInput(generateRandomUsername());
    setError(null);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const validation = validateUsernameFormat(nameInput);
    if (!validation.valid) {
      setError(validation.error || 'Invalid name format.');
      return;
    }

    setLoading(true);
    try {
      const res = await setGuestName(nameInput, currentGuestName, guestId);
      if (!res.success) {
        setError(res.error || 'Failed to reserve guest name.');
      } else {
        onNameSaved(nameInput.trim());
        onClose();
      }
    } catch (err: any) {
      setError(err.message || 'Error updating guest name.');
    } finally {
      setLoading(false);
    }
  };

  const handleClearName = async () => {
    setLoading(true);
    try {
      await clearGuestName(currentGuestName, guestId);
      setNameInput('');
      onNameSaved(null);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Error resetting guest name.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div id="guest-name-modal" className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-4 font-mono">
      <div className="bg-neutral-900 border border-neutral-700 w-full max-w-md rounded-lg shadow-2xl p-6 relative">
        <button
          id="close-guest-name-modal"
          onClick={onClose}
          className="absolute top-4 right-4 text-neutral-400 hover:text-white transition-colors"
          title="Close"
        >
          <X size={18} />
        </button>

        <div className="flex items-center gap-2 mb-4">
          <div className="w-7 h-7 rounded bg-amber-600/30 border border-amber-500/50 flex items-center justify-center text-amber-400 font-bold text-sm">
            G
          </div>
          <div>
            <h2 className="text-base font-bold text-white tracking-wider">SET GUEST NAME</h2>
            <p className="text-[11px] text-neutral-400">Choose a temporary name for this device</p>
          </div>
        </div>

        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="block text-xs text-neutral-300 mb-1">
              Guest Name <span className="text-neutral-500">(2-20 alphanumeric characters)</span>
            </label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <User className="absolute left-2.5 top-2.5 text-neutral-500" size={14} />
                <input
                  id="guest-name-input"
                  type="text"
                  required
                  maxLength={20}
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value.replace(/[^a-zA-Z0-9]/g, ''))}
                  placeholder="e.g. HowlingKnight"
                  className="w-full bg-black border border-neutral-700 pl-8 pr-3 py-2 text-xs text-white rounded focus:border-amber-500 focus:outline-none"
                />
              </div>
              <button
                type="button"
                onClick={handleRandomize}
                className="px-3 py-2 bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-xs text-amber-300 rounded flex items-center gap-1 transition-colors cursor-pointer"
                title="Autofill a random name"
              >
                <Dices size={14} />
                <span>Random</span>
              </button>
            </div>
          </div>

          <div className="p-3 bg-neutral-950 border border-neutral-800 rounded text-xs space-y-1">
            <div className="text-neutral-400">
              Display format in game:
            </div>
            <div className="text-amber-400 font-bold">
              {nameInput.trim() ? `${nameInput.trim()} (Guest)` : '(Unset - default: Player)'}
            </div>
            <p className="text-[11px] text-neutral-500 mt-1">
              • Cannot be identical to any registered account or another active guest.
              <br />
              • Saves in your browser on this device.
            </p>
          </div>

          {error && (
            <div className="p-2.5 bg-red-950/60 border border-red-800 text-red-300 text-xs rounded flex items-start gap-2">
              <AlertCircle size={14} className="shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <div className="flex gap-2 pt-2">
            {currentGuestName && (
              <button
                type="button"
                onClick={handleClearName}
                disabled={loading}
                className="w-1/3 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-xs font-semibold py-2.5 rounded transition-colors"
              >
                Clear Name
              </button>
            )}
            <button
              id="save-guest-name-btn"
              type="submit"
              disabled={loading}
              className="flex-1 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white text-xs font-bold py-2.5 rounded tracking-wider flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
            >
              <Check size={14} />
              <span>{loading ? 'CHECKING...' : 'CONFIRM GUEST NAME'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default GuestNameModal;
