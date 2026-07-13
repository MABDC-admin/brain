import React, { useEffect, useState } from 'react';
import { MailCheck, RefreshCw, Send, ShieldCheck } from 'lucide-react';

const API = import.meta.env.PROD ? 'https://brain.mabdc.com' : 'https://brain.mabdc.com';

export default function EmailAuditPage() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [resending, setResending] = useState(null);

  const loadRows = () => {
    setLoading(true);
    fetch(`${API}/api/email/audit?limit=100`, { credentials: 'include' })
      .then(response => response.ok ? response.json() : [])
      .then(data => setRows(Array.isArray(data) ? data : []))
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadRows(); }, []);

  const resend = async (id) => {
    setResending(id);
    try {
      const response = await fetch(`${API}/api/email/audit/${id}/resend`, { method: 'POST', credentials: 'include' });
      if (!response.ok) throw new Error('Resend failed');
      loadRows();
    } catch {
      setRows(current => current.map(row => row.id === id ? { ...row, delivery_detail: 'Resend failed' } : row));
    } finally {
      setResending(null);
    }
  };

  return (
    <div className="flex h-full flex-col bg-[#101114] text-white">
      <div className="shrink-0 border-b border-white/10 px-5 pb-4 pt-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-black tracking-tight">Sent email</h1>
            <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-white/35">Delivery log and resend queue</p>
          </div>
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500 text-white">
            <MailCheck className="h-6 w-6" />
          </div>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2">
          <div className="rounded-xl bg-white/5 p-3">
            <p className="text-lg font-black">{rows.length}</p>
            <p className="text-[10px] font-bold uppercase text-white/35">Total</p>
          </div>
          <div className="rounded-xl bg-white/5 p-3">
            <p className="text-lg font-black">{rows.filter(row => row.status === 'completed').length}</p>
            <p className="text-[10px] font-bold uppercase text-white/35">Sent</p>
          </div>
          <div className="rounded-xl bg-white/5 p-3">
            <p className="text-lg font-black">{rows.filter(row => row.status === 'failed').length}</p>
            <p className="text-[10px] font-bold uppercase text-white/35">Failed</p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4 scrollbar-hide">
        {loading ? (
          <div className="py-12 text-center text-sm text-white/40">Loading email log...</div>
        ) : rows.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-white/15 p-8 text-center text-sm text-white/45">No sent emails yet.</div>
        ) : (
          <div className="space-y-3">
            {rows.map(row => (
              <div key={row.id} className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                <div className="mb-3 flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/10 text-emerald-300">
                    <Send className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-black">{row.subject || row.document_title || 'Email'}</p>
                    <p className="mt-1 text-xs font-semibold text-white/45">{row.to}</p>
                  </div>
                  <span className={`rounded-full px-2 py-1 text-[10px] font-black uppercase ${row.status === 'completed' ? 'bg-emerald-500/15 text-emerald-300' : 'bg-rose-500/15 text-rose-300'}`}>{row.status}</span>
                </div>
                {row.document_title && <p className="mb-2 rounded-xl bg-white/5 px-3 py-2 text-xs text-white/60">{row.document_title}</p>}
                <p className="text-xs text-white/40">{row.delivery_detail}</p>
                <div className="mt-4 flex items-center justify-between">
                  <div className="flex items-center gap-2 text-[11px] font-semibold text-white/35">
                    <ShieldCheck className="h-3.5 w-3.5" />
                    <span>{row.created_at ? new Date(row.created_at).toLocaleString() : ''}</span>
                  </div>
                  {row.can_resend && (
                    <button onClick={() => resend(row.id)} disabled={resending === row.id}
                      className="flex items-center gap-2 rounded-full bg-white px-3 py-2 text-xs font-black text-slate-950 disabled:opacity-60">
                      <RefreshCw className={`h-3.5 w-3.5 ${resending === row.id ? 'animate-spin' : ''}`} />
                      Resend
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
