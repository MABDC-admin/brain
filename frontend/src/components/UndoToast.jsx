import React, { useEffect, useRef } from 'react';
import { RotateCcw, X } from 'lucide-react';

/**
 * UndoToast — appears after a destructive action with an Undo button.
 * Auto-dismisses after `duration` ms. Calls onConfirm when time expires.
 * @param {string}   message    — e.g. "Task deleted"
 * @param {function} onUndo     — restore the item
 * @param {function} onConfirm  — actually delete (e.g. call DELETE API)
 * @param {function} onDismiss  — hide the toast (called by both paths)
 * @param {number}   duration   — ms before auto-confirm (default 4000)
 */
export default function UndoToast({ message, onUndo, onConfirm, onDismiss, duration = 4000 }) {
  const timerRef = useRef(null);

  useEffect(() => {
    timerRef.current = setTimeout(() => { onConfirm?.(); onDismiss?.(); }, duration);
    return () => clearTimeout(timerRef.current);
  }, [duration, onConfirm, onDismiss]);

  const handleUndo = () => {
    clearTimeout(timerRef.current);
    onUndo?.();
    onDismiss?.();
  };

  const handleDismiss = () => {
    clearTimeout(timerRef.current);
    onConfirm?.();
    onDismiss?.();
  };

  // Progress bar shrinks over duration
  return (
    <div className="fixed bottom-24 left-3 right-3 z-[150]"
      style={{ animation: 'pageSlideUp 0.25s ease-out' }}>
      <div className="bg-[#1e1f2a] border border-[#2a2b36] rounded-2xl overflow-hidden shadow-2xl">
        {/* Shrinking timer bar */}
        <div className="h-0.5 bg-indigo-500 origin-left"
          style={{ animation: `shrink ${duration}ms linear forwards` }}/>
        <div className="px-4 py-3 flex items-center gap-3">
          <p className="flex-1 text-white text-sm font-medium">{message}</p>
          <button onClick={handleUndo}
            className="flex items-center gap-1.5 text-indigo-400 font-bold text-sm hover:text-indigo-300 transition-colors shrink-0">
            <RotateCcw className="w-3.5 h-3.5"/> Undo
          </button>
          <button onClick={handleDismiss} className="text-gray-600 hover:text-white transition-colors">
            <X className="w-4 h-4"/>
          </button>
        </div>
      </div>
      <style>{`@keyframes shrink { from { width: 100%; } to { width: 0%; } }`}</style>
    </div>
  );
}
