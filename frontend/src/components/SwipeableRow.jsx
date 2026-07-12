import React, { useRef, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { useHaptic } from '../hooks/useHaptic.js';

/**
 * SwipeableRow — swipe left to reveal delete button.
 * Works on touch (mobile) and mouse (desktop drag).
 */
export default function SwipeableRow({ children, onDelete, disabled = false }) {
  const [offset,    setOffset]    = useState(0);
  const [revealed,  setRevealed]  = useState(false);
  const startX     = useRef(null);
  const dragging   = useRef(false);
  const THRESHOLD  = 55;
  const MAX_SWIPE  = 72;
  const haptic     = useHaptic();

  // ── Touch handlers ───────────────────────────────────────────────────────
  const onTouchStart = (e) => {
    if (disabled) return;
    startX.current = e.touches[0].clientX;
    dragging.current = true;
  };
  const onTouchMove = (e) => {
    if (!dragging.current || startX.current === null) return;
    const dx = e.touches[0].clientX - startX.current;
    if (dx < 0) {
      setOffset(Math.max(dx, -MAX_SWIPE));
    } else if (revealed) {
      setOffset(Math.min(dx - MAX_SWIPE, 0));
    }
  };
  const onTouchEnd = () => {
    dragging.current = false;
    if (offset < -THRESHOLD) { setOffset(-MAX_SWIPE); setRevealed(true); haptic.tap(); }
    else                     { setOffset(0);           setRevealed(false); }
  };

  // ── Mouse handlers (desktop preview) ────────────────────────────────────
  const onMouseDown = (e) => {
    if (disabled) return;
    startX.current = e.clientX;
    dragging.current = true;
  };
  const onMouseMove = (e) => {
    if (!dragging.current || startX.current === null) return;
    const dx = e.clientX - startX.current;
    if (dx < 0) setOffset(Math.max(dx, -MAX_SWIPE));
  };
  const onMouseUp = () => {
    dragging.current = false;
    if (offset < -THRESHOLD) { setOffset(-MAX_SWIPE); setRevealed(true); haptic.tap(); }
    else                     { setOffset(0);           setRevealed(false); }
  };

  const reset = () => { setOffset(0); setRevealed(false); };

  const handleDelete = (e) => {
    e.stopPropagation();
    haptic.delete();
    reset();
    onDelete?.();
  };

  return (
    <div className="relative overflow-hidden select-none"
      onMouseLeave={() => { if (dragging.current) { dragging.current = false; setOffset(0); setRevealed(false); } }}>
      {/* Delete panel behind */}
      <div className="absolute right-0 top-0 bottom-0 flex items-center justify-center bg-red-500 rounded-r-2xl"
        style={{ width: MAX_SWIPE }}>
        <button onClick={handleDelete} className="flex flex-col items-center gap-1 w-full h-full justify-center">
          <Trash2 className="w-5 h-5 text-white"/>
          <span className="text-white text-[9px] font-semibold">Delete</span>
        </button>
      </div>

      {/* Swipeable content */}
      <div
        style={{ transform: `translateX(${offset}px)`, transition: dragging.current ? 'none' : 'transform 0.22s cubic-bezier(0.25,0.46,0.45,0.94)' }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onClick={revealed ? reset : undefined}
      >
        {children}
      </div>
    </div>
  );
}
