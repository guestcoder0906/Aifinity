import React, { useState, useEffect } from 'react';
import { Loader2, Unlock } from 'lucide-react';

interface InputAreaProps {
  onSend: (text: string) => void;
  disabled: boolean;
  isProcessing?: boolean;
  onCancelProcessing?: () => void;
  canUnlock?: boolean;
  isMyTurnReady?: boolean;
  recommendations?: string[];
  placeholder?: string;
}

const InputArea: React.FC<InputAreaProps> = ({
  onSend,
  disabled,
  isProcessing = false,
  onCancelProcessing,
  canUnlock = true,
  isMyTurnReady = false,
  recommendations,
  placeholder
}) => {
  const [input, setInput] = useState('');
  const [processingSeconds, setProcessingSeconds] = useState(0);

  useEffect(() => {
    let interval: any;
    if (isProcessing) {
      setProcessingSeconds(0);
      interval = setInterval(() => {
        setProcessingSeconds(prev => prev + 1);
      }, 1000);
    } else {
      setProcessingSeconds(0);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isProcessing]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || disabled) return;
    onSend(input.trim());
    setInput('');
  };

  const allowUnlock = canUnlock && Boolean(onCancelProcessing);

  const placeholderText = placeholder || (
    isProcessing
      ? `Processing action (${processingSeconds}s)...`
      : isMyTurnReady
        ? "Action submitted. Waiting for other players..."
        : disabled
          ? (allowUnlock ? "Input paused. Click Unlock to resume action input." : "Input locked.")
          : "Enter action (e.g. explore the forest, check inventory, cast spell)..."
  );

  return (
    <div className="flex flex-col border-t border-neutral-800 bg-neutral-900 safe-area-bottom shrink-0">
      {recommendations && recommendations.length > 0 && !disabled && (
        <div className="flex items-center gap-1.5 p-1.5 px-2.5 sm:px-4 bg-neutral-950 border-b border-neutral-800 overflow-x-auto no-scrollbar">
          {recommendations.map((rec: any, idx) => {
            const recLabel = typeof rec === 'string'
              ? rec
              : (typeof rec === 'object' && rec !== null)
                ? (rec.text || rec.label || rec.action || rec.recommendation || JSON.stringify(rec))
                : String(rec || '');
            if (!recLabel.trim()) return null;
            return (
              <button
                key={idx}
                type="button"
                onClick={() => setInput(recLabel)}
                className="text-[11px] sm:text-xs bg-neutral-800 hover:bg-neutral-700 text-blue-300 px-2.5 py-1 rounded-full border border-neutral-700 transition-colors font-mono whitespace-nowrap shrink-0 active:scale-95 cursor-pointer"
              >
                {recLabel}
              </button>
            );
          })}
        </div>
      )}
      <form 
        onSubmit={handleSubmit} 
        className="p-2 sm:p-3 md:p-4 flex gap-1.5 sm:gap-2 items-center"
      >
        <div className="relative flex-1 flex items-center">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={placeholderText}
            disabled={disabled}
            className="w-full bg-black border border-neutral-700 rounded px-3 py-2 sm:px-4 sm:py-2.5 text-base sm:text-sm text-gray-200 focus:outline-none focus:border-blue-500 font-mono transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            style={{ fontSize: '16px' }}
            autoComplete="off"
          />
          {isProcessing && (
            <div className="absolute right-3 flex items-center gap-1.5 text-xs font-mono text-blue-400 pointer-events-none">
              <Loader2 size={14} className="animate-spin text-blue-400" />
              <span className="hidden sm:inline text-[11px] opacity-80">{processingSeconds}s</span>
            </div>
          )}
        </div>
        {allowUnlock && ((isProcessing && processingSeconds >= 3) || (disabled && !isProcessing)) ? (
          <button
            type="button"
            onClick={onCancelProcessing}
            title="Unlock action input"
            className="bg-amber-900/80 hover:bg-amber-800 text-amber-200 border border-amber-700 font-bold px-3 sm:px-4 py-2 rounded text-xs transition-all active:scale-95 shrink-0 flex items-center gap-1 cursor-pointer"
          >
            <Unlock size={13} />
            <span className="hidden sm:inline">Unlock</span>
          </button>
        ) : null}
        <button 
          type="submit" 
          disabled={disabled || !input.trim()}
          className="bg-blue-600 hover:bg-blue-500 text-white font-bold px-4 sm:px-6 py-2 rounded text-xs sm:text-sm transition-colors disabled:bg-neutral-800 disabled:text-gray-500 active:scale-95 shrink-0 cursor-pointer disabled:cursor-not-allowed"
        >
          SEND
        </button>
      </form>
    </div>
  );
};

export default InputArea;
