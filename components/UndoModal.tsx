import React from 'react';
import { RotateCcw, AlertTriangle } from 'lucide-react';
import { TurnSnapshot } from '../types';

interface UndoModalProps {
  isOpen: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  previousSnapshot: TurnSnapshot | null;
  isMultiplayer?: boolean;
}

const UndoModal: React.FC<UndoModalProps> = ({
  isOpen,
  onConfirm,
  onCancel,
  previousSnapshot,
  isMultiplayer = false
}) => {
  if (!isOpen) return null;

  return (
    <div className={`fixed inset-0 ${isMultiplayer ? 'z-[9999]' : 'z-50'} flex items-center justify-center p-4`}>
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative bg-neutral-900 border border-neutral-700 p-6 rounded-lg shadow-2xl max-w-md w-full font-mono">
        <div className="flex items-center gap-2.5 mb-3 text-amber-400">
          <RotateCcw size={20} className="text-amber-400 shrink-0" />
          <h3 className="text-lg font-bold text-white">Undo Turn?</h3>
        </div>

        <p className="text-neutral-300 mb-4 text-sm leading-relaxed">
          Are you sure you want to revert to the previous turn? This will restore the entire adventure world, files, map, status effects, and narrative to that point.
        </p>

        {previousSnapshot && (
          <div className="bg-neutral-950 border border-neutral-800 rounded p-3 mb-4 text-xs space-y-1 text-neutral-400">
            <div className="flex justify-between">
              <span className="text-neutral-500">Target State:</span>
              <span className="text-amber-300 font-semibold">Turn #{previousSnapshot.turnNumber || 1}</span>
            </div>
            {previousSnapshot.worldTime && (
              <div className="flex justify-between">
                <span className="text-neutral-500">World Time:</span>
                <span className="text-blue-300">{previousSnapshot.worldTime}</span>
              </div>
            )}
            {previousSnapshot.userAction && (
              <div className="pt-1 border-t border-neutral-850">
                <span className="text-neutral-500 block mb-0.5">Prior Action:</span>
                <p className="text-neutral-300 line-clamp-2 italic">"{previousSnapshot.userAction}"</p>
              </div>
            )}
          </div>
        )}

        {isMultiplayer && (
          <div className="flex items-start gap-2 bg-amber-950/40 border border-amber-800/60 rounded p-2.5 mb-5 text-[11px] text-amber-300">
            <AlertTriangle size={14} className="shrink-0 text-amber-400 mt-0.5" />
            <span>
              <strong>Multiplayer Notice:</strong> As the host, confirming will immediately rewind the world state and narrative for all connected players in this room.
            </span>
          </div>
        )}

        <div className="flex justify-end gap-3 mt-2">
          <button
            onClick={onCancel}
            className="px-3.5 py-1.5 rounded border border-neutral-700 text-neutral-300 hover:bg-neutral-800 hover:text-white transition-colors text-xs font-semibold cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-1.5 rounded bg-amber-600 hover:bg-amber-500 text-white transition-colors font-bold text-xs flex items-center gap-1.5 shadow-md cursor-pointer"
          >
            <RotateCcw size={12} />
            <span>Revert to Previous Turn</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default UndoModal;
