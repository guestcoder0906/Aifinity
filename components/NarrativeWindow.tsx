import React, { useEffect, useRef } from 'react';
import { NarrativeEntry } from '../types';
import { FileSystem } from '../services/fileSystem';
import { formatVisibilityMarkup } from '../services/visibilityEngine';

const parsedCache = new Map<string, string>();
const MAX_CACHE_SIZE = 500;

function parseText(text: any, username: string, debugMode: boolean): string {
  let processed = typeof text === 'string'
    ? text
    : (typeof text === 'object' && text !== null)
      ? (text.text || text.content || text.narrative || JSON.stringify(text))
      : String(text || '');

  // 1. Handle visibility markup: hide:besides, hide:for, target, hide[]
  processed = formatVisibilityMarkup(processed, username, debugMode);

  // 3. Handle Status/Effect/Outcome effects specially so they don't become clickable links
  // This catches patterns like [Status:Hidden(...)], [Effect:Poison], [Jump: Failure], [Perception: Success]
  processed = processed.replace(/\[((?:Status|Effect)\s*:[^\]]+)\]/gi, (match) => {
    return `<span class="text-blue-400 bg-blue-900/20 px-1 rounded border border-blue-800/50 font-semibold">${match}</span>`;
  });

  processed = processed.replace(/\[([^\]]+:\s*(?:Success|Failure|Critical Success|Critical Failure)[^\]]*)\]/gi, (match) => {
    const isSuccess = match.toLowerCase().includes('success');
    const color = isSuccess ? 'text-green-400 bg-green-900/20 border-green-800/50' : 'text-red-400 bg-red-900/20 border-red-800/50';
    return `<span class="${color} px-1 rounded border font-semibold">${match}</span>`;
  });

  // 4. Handle [Probability Check: ...] for detailed math
  processed = processed.replace(/\[Probability Check:\s*(.*?)\s*-\s*Result:\s*(.*?)\s*\|\s*Roll:\s*(.*?)\s*\|\s*Math:\s*(.*?)\s*\|\s*Thresholds:\s*(.*?)\]/g, (match, name, result, roll, math, thresholds) => {
    const isSuccess = result.toLowerCase().includes('success');
    const baseColor = isSuccess ? 'text-green-300' : 'text-red-300';

    return `<span class="group relative ${baseColor} border-b border-dashed border-current select-none ml-1 text-xs cursor-help inline-block">
      [Math: ${name}]
      <span class="absolute bottom-full left-0 mb-2 hidden group-hover:block w-64 md:w-80 p-2 bg-neutral-900 border border-neutral-700 rounded shadow-xl text-xs text-gray-300 z-50 pointer-events-none format-pre text-left max-w-[85vw] md:max-w-sm">
        <div class="font-bold text-blue-400 border-b border-neutral-800 pb-1 mb-1 truncate">${name}</div>
        <div class="grid grid-cols-2 gap-x-2 gap-y-1 mb-1">
          <span class="text-gray-500">Roll (0-1000):</span> <span class="text-white font-mono font-bold">${roll}</span>
          <span class="text-gray-500">Result:</span> <span class="${baseColor} font-bold">${result}</span>
          <span class="text-gray-500">RNG Source:</span> <span class="text-emerald-400 font-mono text-[10px]">Unbiased Backend Random First</span>
        </div>
        <div class="text-gray-500 mt-1 border-t border-neutral-800 pt-1 text-[10px] uppercase tracking-wider">Calculation</div>
        <div class="text-xs text-white mb-1 font-mono">${math}</div>
        <div class="text-gray-500 mb-1 border-t border-neutral-800 pt-1 text-[10px] uppercase tracking-wider">Thresholds</div>
        <div class="font-mono text-[10px] whitespace-pre-wrap break-all bg-black/30 p-1 rounded border border-neutral-800/50">${thresholds.replace(/&quot;/g, '"')}</div>
      </span>
    </span>`;
  });

  // 5. Handle [Object] links
  processed = processed.replace(/(<[^>]+>)|\[([^\]]+)\]/g, (match, htmlTag, ref) => {
    if (htmlTag) return htmlTag;
    return `<span class="text-yellow-400 hover:text-yellow-200 hover:underline cursor-pointer" data-ref="${ref}">${ref}</span>`;
  });

  return processed;
}

const NarrativeEntryRow = React.memo(({ entry, username, debugMode }: { entry: NarrativeEntry; username: string; debugMode: boolean }) => {
  const parsedHtml = React.useMemo(() => {
    const rawKey = `${entry.id}_${entry.type}_${username}_${debugMode ? '1' : '0'}`;
    const cached = parsedCache.get(rawKey);
    if (cached !== undefined) return cached;
    const res = parseText(entry.text, username, debugMode);
    if (parsedCache.size > MAX_CACHE_SIZE) {
      const firstKey = parsedCache.keys().next().value;
      if (firstKey) parsedCache.delete(firstKey);
    }
    parsedCache.set(rawKey, res);
    return res;
  }, [entry.id, entry.type, entry.text, username, debugMode]);

  // Cost text appended as small text in debug mode for each action showing total costs of that full action
  const costDisplay = React.useMemo(() => {
    if (!debugMode || entry.type !== 'ai') return null;
    if (entry.usage) {
      const { inputCost, outputCost, totalCost, promptTokens, candidatesTokens, calls, model } = entry.usage as any;
      const modelName = model || 'gemini-3.8-flash';
      const passesLabel = calls && calls > 1 ? ` (${calls} passes)` : '';
      return `Total Action Cost: $${totalCost.toFixed(6)} total ($${inputCost.toFixed(6)} in + $${outputCost.toFixed(6)} out | ${promptTokens.toLocaleString()} in, ${candidatesTokens.toLocaleString()} out · ${modelName}${passesLabel})`;
    }
    // Fallback estimation for entries generated prior to tracking
    const estOut = Math.max(1, Math.ceil((entry.text || '').length / 4));
    const estIn = 1400;
    const inCost = (estIn * 0.15) / 1_000_000;
    const outCost = (estOut * 0.60) / 1_000_000;
    const totCost = inCost + outCost;
    return `Total Action Cost: ~$${totCost.toFixed(6)} total (~$${inCost.toFixed(6)} in + ~$${outCost.toFixed(6)} out | ~${estIn.toLocaleString()} in, ~${estOut.toLocaleString()} out · gemini-3.8-flash)`;
  }, [debugMode, entry.type, entry.usage, entry.text]);

  // If the entire entry is hidden (e.g., only contained a target() not meant for us), don't render an empty div
  if (!parsedHtml.trim() && entry.type !== 'user') return null;

  return (
    <div className={`narrative-entry leading-relaxed ${entry.type === 'user' ? 'text-blue-400 font-semibold border-l-2 border-blue-900 pl-2' :
      entry.type === 'system' ? 'text-green-500 italic' :
        'text-gray-300'
      }`}>
      {entry.type === 'user' && <span className="mr-1.5">&gt;</span>}
      <span dangerouslySetInnerHTML={{ __html: parsedHtml }} />
      {costDisplay && (
        <span className="text-[10px] text-neutral-400 font-mono select-none ml-2 opacity-90 block sm:inline-block bg-neutral-900/60 px-1.5 py-0.5 rounded border border-neutral-800">
          [{costDisplay}]
        </span>
      )}
    </div>
  );
});

interface NarrativeWindowProps {
  history: NarrativeEntry[];
  fileSystem: FileSystem; // Passed not for reading, but for resolving references if needed
  onReferenceClick: (ref: string) => void;
  debugMode: boolean;
  username: string;
}

const NarrativeWindow: React.FC<NarrativeWindowProps> = ({ history = [], onReferenceClick, debugMode, username }) => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (containerRef.current) {
      // Scroll container directly to prevent mobile browser window/body scroll displacement
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [history.length]);

  const handleClick = React.useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    const refElement = target.closest('[data-ref]') as HTMLElement;
    if (refElement && refElement.dataset.ref) {
      onReferenceClick(refElement.dataset.ref);
    }
  }, [onReferenceClick]);

  return (
    <div
      ref={containerRef}
      className="flex-1 overflow-y-auto p-2.5 sm:p-4 space-y-2.5 sm:space-y-3.5 font-mono bg-black min-h-0 text-xs sm:text-[13px] md:text-sm leading-relaxed"
      style={{ WebkitOverflowScrolling: 'touch' }}
      onClick={handleClick}
    >
      {(history || []).length === 0 && (
        <div className="text-green-500 italic flex flex-col gap-1.5 sm:gap-2 text-xs sm:text-sm">
          <span>Initializing system connection...</span>
          <span>Enter world description to start adventure....</span>
        </div>
      )}

      {(history || []).map((entry) => (
        <NarrativeEntryRow
          key={entry.id}
          entry={entry}
          username={username}
          debugMode={debugMode}
        />
      ))}
    </div>
  );
};

export default React.memo(NarrativeWindow);