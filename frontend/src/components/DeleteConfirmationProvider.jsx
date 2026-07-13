import React, { useCallback, useMemo, useState } from 'react';
import { AlertTriangle, Trash2, X } from 'lucide-react';
import { DeleteConfirmationContext } from '../hooks/useDeleteConfirmation.js';

export function DeleteConfirmationProvider({ children }) {
  const [request, setRequest] = useState(null);
  const [busy, setBusy] = useState(false);
  const [phraseInput, setPhraseInput] = useState('');

  const close = useCallback(() => {
    if (!busy) {
      setRequest(null);
      setPhraseInput('');
    }
  }, [busy]);

  const confirmDelete = useCallback((nextRequest) => {
    setRequest({
      title: 'Delete item?',
      itemName: '',
      message: 'This action cannot be undone.',
      confirmLabel: 'Delete',
      requiresPhrase: false,
      ...nextRequest,
    });
    setPhraseInput('');
  }, []);

  const handleConfirm = async () => {
    if (!request?.onConfirm) return;
    setBusy(true);
    try {
      await request.onConfirm(phraseInput.trim());
      setRequest(null);
      setPhraseInput('');
    } finally {
      setBusy(false);
    }
  };

  const value = useMemo(() => ({ confirmDelete }), [confirmDelete]);
  const phraseReady = !request?.requiresPhrase || phraseInput.trim().length > 0;

  return (
    <DeleteConfirmationContext.Provider value={value}>
      {children}
      {request && (
        <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/70 px-4 pb-4 pt-10 sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-labelledby="delete-confirm-title">
          <div className="w-full max-w-sm overflow-hidden rounded-t-[28px] border border-red-500/20 bg-[#111219] shadow-2xl sm:rounded-[24px]">
            <div className="flex items-start gap-4 border-b border-[#242631] p-5">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-red-500/15 text-red-400">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <h2 id="delete-confirm-title" className="text-base font-bold text-white">{request.title}</h2>
                {request.itemName && (
                  <p className="mt-1 truncate text-sm font-semibold text-red-200">{request.itemName}</p>
                )}
                <p className="mt-2 text-sm leading-5 text-gray-400">{request.message}</p>
              </div>
              <button type="button" onClick={close} disabled={busy} className="rounded-full p-2 text-gray-500 transition-colors hover:bg-[#1d1f29] hover:text-white disabled:opacity-50" aria-label="Cancel delete">
                <X className="h-5 w-5" />
              </button>
            </div>
            {request.requiresPhrase && (
              <div className="border-b border-[#242631] px-4 py-4">
                <label className="mb-2 block text-xs font-bold uppercase tracking-[0.18em] text-red-200">
                  Security phrase
                </label>
                <input
                  value={phraseInput}
                  onChange={(e) => setPhraseInput(e.target.value)}
                  autoFocus
                  autoCapitalize="none"
                  autoComplete="off"
                  spellCheck="false"
                  placeholder="Enter security phrase"
                  className="w-full rounded-2xl border border-red-500/30 bg-[#0b0c10] px-4 py-3 text-sm font-semibold text-white outline-none transition-colors placeholder:text-gray-600 focus:border-red-400"
                />
                <p className="mt-2 text-xs text-gray-500">
                  Type the exact phrase to unlock this delete action.
                </p>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3 p-4">
              <button type="button" onClick={close} disabled={busy} className="rounded-2xl border border-[#2a2b36] bg-[#181a22] px-4 py-3 text-sm font-bold text-gray-200 transition-colors hover:bg-[#20232d] disabled:opacity-50">
                Cancel
              </button>
              <button type="button" onClick={handleConfirm} disabled={busy || !phraseReady} className="flex items-center justify-center gap-2 rounded-2xl bg-red-500 px-4 py-3 text-sm font-bold text-white shadow-lg shadow-red-950/30 transition-colors hover:bg-red-400 disabled:opacity-60">
                <Trash2 className="h-4 w-4" />
                {busy ? 'Deleting...' : request.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </DeleteConfirmationContext.Provider>
  );
}
