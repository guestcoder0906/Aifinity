import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  TrendingUp,
  TrendingDown,
  Activity,
  X,
  GripVertical,
  Package,
  Clock,
  Compass,
  Sparkles
} from 'lucide-react';
import { UpdateItem } from '../types';

export interface LiveStatusItem {
  id: string;
  update: UpdateItem;
  createdAt: number;
  durationMs: number;
}

interface SlidableUpdateProps {
  item: LiveStatusItem;
  onDismiss: (id: string) => void;
}

const SlidableUpdate: React.FC<SlidableUpdateProps> = ({ item, onDismiss }) => {
  const [offsetX, setOffsetX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [isExiting, setIsExiting] = useState(false);
  const [exitDirection, setExitDirection] = useState<'right' | 'left'>('right');
  const [isPaused, setIsPaused] = useState(false);

  const startXRef = useRef(0);
  const startYRef = useRef(0);
  const startTimeRef = useRef(0);
  const isHoveredRef = useRef(false);
  const isDraggingRef = useRef(false);
  const isExitingRef = useRef(false);
  const remainingTimeRef = useRef(item.durationMs);
  const cardRef = useRef<HTMLDivElement>(null);

  // Trigger smooth exit animation and then dismiss
  const triggerDismiss = useCallback((direction: 'right' | 'left' = 'right') => {
    if (isExitingRef.current) return;
    isExitingRef.current = true;
    setIsExiting(true);
    setExitDirection(direction);
    setTimeout(() => {
      onDismiss(item.id);
    }, 220);
  }, [item.id, onDismiss]);

  // Auto-dismiss countdown timer (pauses when hovered or dragged without high-frequency intervals)
  useEffect(() => {
    if (isPaused || isExiting) return;

    const timeout = setTimeout(() => {
      triggerDismiss('right');
    }, remainingTimeRef.current);

    const startedAt = Date.now();

    return () => {
      clearTimeout(timeout);
      const elapsed = Date.now() - startedAt;
      remainingTimeRef.current = Math.max(0, remainingTimeRef.current - elapsed);
    };
  }, [isPaused, isExiting, triggerDismiss]);

  // Unified Drag & Touch Handlers (robust on mobile touch screens and desktop mice)
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || isExitingRef.current) return;
    startXRef.current = e.clientX;
    startYRef.current = e.clientY;
    startTimeRef.current = Date.now();
    isDraggingRef.current = true;
    setIsDragging(true);

    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Ignored
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingRef.current || isExitingRef.current) return;
    const dx = e.clientX - startXRef.current;
    setOffsetX(dx);
  };

  const handlePointerEnd = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingRef.current) return;
    isDraggingRef.current = false;
    setIsDragging(false);

    try {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    } catch {
      // Ignored
    }

    const dx = e.clientX - startXRef.current;
    const dt = Math.max(1, Date.now() - startTimeRef.current);
    const velocityX = dx / dt;

    if (dx > 35 || (dx > 12 && velocityX > 0.3)) {
      triggerDismiss('right');
    } else if (dx < -35 || (dx < -12 && velocityX < -0.3)) {
      triggerDismiss('left');
    } else {
      setOffsetX(0);
    }
  };

  // Dedicated touch events for high-precision mobile sliding
  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (isExitingRef.current || e.touches.length === 0) return;
    const t = e.touches[0];
    startXRef.current = t.clientX;
    startYRef.current = t.clientY;
    startTimeRef.current = Date.now();
    isDraggingRef.current = true;
    setIsDragging(true);
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (!isDraggingRef.current || isExitingRef.current || e.touches.length === 0) return;
    const t = e.touches[0];
    const dx = t.clientX - startXRef.current;
    const dy = t.clientY - startYRef.current;
    if (Math.abs(dx) > Math.abs(dy)) {
      setOffsetX(dx);
    }
  };

  const handleTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
    if (!isDraggingRef.current) return;
    isDraggingRef.current = false;
    setIsDragging(false);
    const endX = e.changedTouches && e.changedTouches.length > 0 ? e.changedTouches[0].clientX : startXRef.current + offsetX;
    const dx = endX - startXRef.current;
    const dt = Math.max(1, Date.now() - startTimeRef.current);
    const velocityX = dx / dt;

    if (dx > 35 || (dx > 12 && velocityX > 0.3)) {
      triggerDismiss('right');
    } else if (dx < -35 || (dx < -12 && velocityX < -0.3)) {
      triggerDismiss('left');
    } else {
      setOffsetX(0);
    }
  };

  // Get appropriate category icon
  const getIcon = () => {
    switch (item.update.type) {
      case 'stat':
        if (item.update.value < 0) {
          return <TrendingDown size={14} className="text-rose-400 shrink-0" />;
        }
        if (item.update.value > 0) {
          return <TrendingUp size={14} className="text-emerald-400 shrink-0" />;
        }
        return <Activity size={14} className="text-amber-400 shrink-0" />;
      case 'item':
        return <Package size={14} className="text-sky-400 shrink-0" />;
      case 'time':
        return <Clock size={14} className="text-indigo-400 shrink-0" />;
      case 'location':
        return <Compass size={14} className="text-teal-400 shrink-0" />;
      case 'status':
        return <Sparkles size={14} className="text-purple-400 shrink-0" />;
      default:
        return <Activity size={14} className="text-amber-400 shrink-0" />;
    }
  };

  // Dynamic styling based on update value
  const isNegative = item.update.value < 0;
  const isPositive = item.update.value > 0;

  const badgeColorClasses = isNegative
    ? 'border-rose-600/60 bg-neutral-950/95 text-rose-300 shadow-[0_4px_20px_rgba(225,29,72,0.18)]'
    : isPositive
    ? 'border-emerald-600/60 bg-neutral-950/95 text-emerald-300 shadow-[0_4px_20px_rgba(16,185,129,0.18)]'
    : 'border-amber-600/60 bg-neutral-950/95 text-amber-300 shadow-[0_4px_20px_rgba(245,158,11,0.15)]';

  // Calculate transform and opacity while dragging / exiting
  let transformStyle = `translateX(${offsetX}px)`;
  let opacityStyle = Math.max(0.2, 1 - Math.abs(offsetX) / 140);

  if (isExiting) {
    transformStyle = exitDirection === 'right' ? 'translateX(130%)' : 'translateX(-130%)';
    opacityStyle = 0;
  }

  return (
    <div
      ref={cardRef}
      role="status"
      aria-live="polite"
      onMouseEnter={() => {
        isHoveredRef.current = true;
        setIsPaused(true);
      }}
      onMouseLeave={() => {
        isHoveredRef.current = false;
        setIsPaused(false);
      }}
      onPointerDown={(e) => {
        setIsPaused(true);
        handlePointerDown(e);
      }}
      onPointerMove={handlePointerMove}
      onPointerUp={(e) => {
        setIsPaused(isHoveredRef.current);
        handlePointerEnd(e);
      }}
      onPointerCancel={(e) => {
        setIsPaused(false);
        handlePointerEnd(e);
      }}
      onTouchStart={(e) => {
        setIsPaused(true);
        handleTouchStart(e);
      }}
      onTouchMove={handleTouchMove}
      onTouchEnd={(e) => {
        setIsPaused(false);
        handleTouchEnd(e);
      }}
      onTouchCancel={(e) => {
        setIsPaused(false);
        handleTouchEnd(e);
      }}
      style={{
        transform: transformStyle,
        opacity: opacityStyle,
        transition: isDragging
          ? 'none'
          : 'transform 0.22s cubic-bezier(0.2, 0.8, 0.2, 1), opacity 0.2s ease-out',
        touchAction: 'pan-y'
      }}
      className={`group relative flex items-center gap-2 px-2.5 py-1.5 rounded-lg border text-xs font-mono select-none pointer-events-auto cursor-grab active:cursor-grabbing backdrop-blur-md max-w-[calc(100vw-2.5rem)] sm:max-w-xs animate-in slide-in-from-right-8 fade-in duration-300 ${badgeColorClasses}`}
      title="Slide or click X to close"
    >
      {/* Visual slide grab handle indicator */}
      <div className="flex items-center text-neutral-600 group-hover:text-neutral-400 transition-colors shrink-0">
        <GripVertical size={13} />
      </div>

      {/* Category Icon */}
      {getIcon()}

      {/* Status Update Text */}
      <span className="font-semibold tracking-tight truncate pr-1">
        {typeof item.update?.text === 'object' && item.update?.text !== null
          ? ((item.update.text as any).text || (item.update.text as any).description || JSON.stringify(item.update.text))
          : String(item.update?.text || '')}
      </span>

      {/* Quick Close Button */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          triggerDismiss('right');
        }}
        onPointerDown={(e) => e.stopPropagation()}
        onTouchStart={(e) => e.stopPropagation()}
        onTouchEnd={(e) => {
          e.stopPropagation();
          triggerDismiss('right');
        }}
        aria-label="Close update"
        title="Close"
        className="ml-auto p-1.5 rounded-md text-neutral-400 hover:text-white hover:bg-neutral-800/90 active:bg-neutral-700 transition-colors shrink-0 cursor-pointer min-w-[26px] min-h-[26px] flex items-center justify-center"
      >
        <X size={13} />
      </button>

      {/* Temporary Lifespan Countdown Bar */}
      <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-neutral-900/80 overflow-hidden rounded-b-lg">
        <div
          className={`h-full ${
            isNegative
              ? 'bg-rose-500/80'
              : isPositive
              ? 'bg-emerald-500/80'
              : 'bg-amber-500/80'
          }`}
          style={{
            width: '100%',
            animation: `shrinkProgress ${item.durationMs}ms linear forwards`,
            animationPlayState: isPaused || isDragging ? 'paused' : 'running'
          }}
        />
      </div>
    </div>
  );
};

export interface LiveStatusUpdatesProps {
  updates: UpdateItem[];
  gameOver?: boolean;
}

export const LiveStatusUpdates: React.FC<LiveStatusUpdatesProps> = ({
  updates,
  gameOver = false
}) => {
  const [toasts, setToasts] = useState<LiveStatusItem[]>([]);
  const prevUpdatesRef = useRef<UpdateItem[]>([]);
  const isFirstMountRef = useRef(true);

  // When new updates arrive, queue them as temporary live slidable cards
  useEffect(() => {
    // Show initial updates if present on mount
    if (isFirstMountRef.current) {
      isFirstMountRef.current = false;
      prevUpdatesRef.current = updates || [];
      if (updates && updates.length > 0) {
        const initialToasts: LiveStatusItem[] = updates.slice(0, 2).map((u, i) => ({
          id: `live_update_init_${Date.now()}_${i}`,
          update: u,
          createdAt: Date.now(),
          durationMs: 6500
        }));
        setToasts(initialToasts);
      }
      return;
    }

    if (!updates || updates.length === 0) {
      prevUpdatesRef.current = [];
      setToasts([]);
      return;
    }

    const prevList = prevUpdatesRef.current;
    let freshItems: UpdateItem[] = [];

    if (prevList.length === 0) {
      freshItems = updates.slice(0, 5);
    } else {
      // Find how many items were prepended ahead of previous list
      const firstPrev = prevList[0];
      const matchIndex = updates.findIndex(
        (u, idx) =>
          u === firstPrev ||
          (u.text === firstPrev.text &&
            u.value === firstPrev.value &&
            u.type === firstPrev.type &&
            idx > 0)
      );

      if (matchIndex > 0) {
        freshItems = updates.slice(0, matchIndex);
      } else if (matchIndex === -1) {
        freshItems = updates.slice(0, 5);
      }
    }

    prevUpdatesRef.current = updates;

    if (freshItems.length > 0) {
      const newToasts: LiveStatusItem[] = freshItems.map((u, i) => ({
        id: `live_update_${Date.now()}_${i}_${Math.random().toString(36).substring(2, 7)}`,
        update: u,
        createdAt: Date.now(),
        durationMs: 6500 // Stays visible for 6.5s before auto-dismiss
      }));

      // Keep at most 5 live toasts on screen to prevent viewport crowding
      setToasts((prev) => [...newToasts, ...prev].slice(0, 5));
    }
  }, [updates]);

  const handleDismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  if (gameOver || toasts.length === 0) {
    return null;
  }

  return (
    <div
      id="live-status-updates-overlay"
      aria-label="Live Status Updates"
      className="absolute bottom-24 right-3 sm:right-6 z-30 flex flex-col gap-1.5 items-end pointer-events-none"
    >
      {toasts.map((toast) => (
        <SlidableUpdate key={toast.id} item={toast} onDismiss={handleDismiss} />
      ))}
    </div>
  );
};

export default LiveStatusUpdates;
