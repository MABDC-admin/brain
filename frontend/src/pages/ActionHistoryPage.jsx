import React, { useEffect, useMemo, useState } from 'react';
import { Activity, CheckCircle2, Clock, FileText, ShieldAlert, XCircle } from 'lucide-react';

const API = import.meta.env.PROD ? 'https://brain.mabdc.com' : 'https://brain.mabdc.com';

function statusStyle(status) {
  if (status === 'completed' || status === 'success') return 'bg-emerald-100 text-emerald-700';
  if (status === 'pending') return 'bg-amber-100 text-amber-700';
  if (status === 'failed' || status === 'blocked') return 'bg-rose-100 text-rose-700';
  return 'bg-slate-100 text-slate-600';
}

function statusIcon(status) {
  if (status === 'completed' || status === 'success') return CheckCircle2;
  if (status === 'pending') return Clock;
  if (status === 'failed' || status === 'blocked') return XCircle;
  return ShieldAlert;
}

export default function ActionHistoryPage() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    fetch(`${API}/api/assistant/audit?limit=100`, { credentials: 'include' })
      .then(response => response.ok ? response.json() : [])
      .then(data => setRows(Array.isArray(data) ? data : []))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    if (filter === 'all') return rows;
    return rows.filter(row => row.status === filter || row.action === filter);
  }, [filter, rows]);

  const counts = useMemo(() => ({
    all: rows.length,
    completed: rows.filter(row => row.status === 'completed' || row.status === 'success').length,
    pending: rows.filter(row => row.status === 'pending').length,
    failed: rows.filter(row => row.status === 'failed' || row.status === 'blocked').length,
  }), [rows]);

  return (
    <div className="flex h-full flex-col bg-slate-50 text-slate-950">
      <div className="shrink-0 border-b border-slate-200 bg-white px-5 pb-4 pt-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-black tracking-tight">AI actions</h1>
            <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Commands, approvals, OCR, deletes, and sends</p>
          </div>
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-900 text-white">
            <Activity className="h-6 w-6" />
          </div>
        </div>
        <div className="mt-4 grid grid-cols-4 gap-2">
          {[
            ['all', 'All', counts.all],
            ['completed', 'Done', counts.completed],
            ['pending', 'Open', counts.pending],
            ['failed', 'Risk', counts.failed],
          ].map(([key, label, count]) => (
            <button key={key} onClick={() => setFilter(key)}
              className={`rounded-xl px-2 py-3 text-center text-xs font-bold ${filter === key ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600'}`}>
              <span className="block text-sm">{count}</span>{label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4 scrollbar-hide">
        {loading ? (
          <div className="py-12 text-center text-sm text-slate-400">Loading actions...</div>
        ) : filtered.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">No actions found.</div>
        ) : (
          <div className="space-y-3">
            {filtered.map(row => {
              const Icon = statusIcon(row.status);
              return (
                <div key={row.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-700">
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="mb-1 flex flex-wrap items-center gap-2">
                        <span className={`rounded-full px-2 py-1 text-[10px] font-black uppercase ${statusStyle(row.status)}`}>{row.status}</span>
                        <span className="text-[11px] font-bold uppercase text-slate-400">{row.action}</span>
                      </div>
                      <p className="text-sm font-bold text-slate-900">{row.summary || row.action}</p>
                      {row.request_text && <p className="mt-2 text-xs text-slate-500">{row.request_text}</p>}
                      <div className="mt-3 flex items-center gap-2 text-[11px] font-semibold text-slate-400">
                        <FileText className="h-3.5 w-3.5" />
                        <span>{row.target_type || 'assistant'} {row.target_id ? `#${row.target_id}` : ''}</span>
                        <span>{row.created_at ? new Date(row.created_at).toLocaleString() : ''}</span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
