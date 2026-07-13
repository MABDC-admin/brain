import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarClock, DollarSign, PiggyBank, Plus, Save, Target, Trash2, X } from 'lucide-react';
import { useDeleteConfirmation } from '../hooks/useDeleteConfirmation.js';

const API = import.meta.env.PROD ? 'https://brain.mabdc.com' : 'https://brain.mabdc.com';
const emptyForm = { title: '', targetAmount: '', currentAmount: '', dueDate: '', notes: '' };

function readBody(item) {
  try {
    const parsed = JSON.parse(item.body || '{}');
    return {
      targetAmount: parsed.targetAmount || '',
      currentAmount: parsed.currentAmount || '',
      dueDate: parsed.dueDate || '',
      notes: parsed.notes || '',
    };
  } catch {
    return { targetAmount: '', currentAmount: '', dueDate: item.expiry_date || '', notes: item.body || '' };
  }
}

function amount(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function progress(body) {
  const target = amount(body.targetAmount);
  if (target <= 0) return 0;
  return Math.min(100, Math.round((amount(body.currentAmount) / target) * 100));
}

function daysUntil(dateValue) {
  if (!dateValue) return null;
  const today = new Date();
  const target = new Date(`${dateValue}T00:00:00`);
  today.setHours(0, 0, 0, 0);
  return Math.ceil((target - today) / 86400000);
}

function dueLabel(dateValue) {
  const days = daysUntil(dateValue);
  if (days === null) return 'No due date';
  if (days < 0) return `${Math.abs(days)}d overdue`;
  if (days === 0) return 'Due today';
  return `${days}d left`;
}

function dueClass(dateValue) {
  const days = daysUntil(dateValue);
  if (days === null) return 'bg-slate-100 text-slate-500 border-slate-200';
  if (days < 0) return 'bg-red-50 text-red-600 border-red-200';
  if (days <= 30) return 'bg-amber-50 text-amber-700 border-amber-200';
  return 'bg-emerald-50 text-emerald-700 border-emerald-200';
}

export default function FinancePlanPage({ loadItems, workspace }) {
  const [items, setItems] = useState([]);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [editing, setEditing] = useState({});
  const [saving, setSaving] = useState(false);
  const { confirmDelete } = useDeleteConfirmation();
  const activeWorkspace = workspace || 'Personal';

  const load = useCallback(() => {
    fetch(`${API}/items/type/finance_plan?workspace=${encodeURIComponent(activeWorkspace)}`)
      .then(r => r.json())
      .then(data => setItems(Array.isArray(data) ? data : []))
      .catch(() => setItems([]));
  }, [activeWorkspace]);

  useEffect(() => { load(); }, [load]);

  const totals = useMemo(() => items.reduce((acc, item) => {
    const body = readBody(item);
    acc.current += amount(body.currentAmount);
    acc.target += amount(body.targetAmount);
    return acc;
  }, { current: 0, target: 0 }), [items]);

  const refreshAll = () => {
    load();
    if (loadItems) loadItems();
  };

  const itemPayload = (item, body) => ({
    type: 'finance_plan',
    title: item.title,
    subtitle: `$${amount(body.currentAmount).toLocaleString()} of $${amount(body.targetAmount).toLocaleString()}`,
    body: JSON.stringify(body),
    expiry_date: body.dueDate || null,
    workspace: activeWorkspace,
  });

  const updateItem = async (item, body) => {
    const payload = itemPayload(item, body);
    let res = await fetch(`${API}/items/${item.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).catch(() => null);
    if (!res || !res.ok) {
      res = await fetch(`${API}/items/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }).catch(() => null);
    }
    if (!res || !res.ok) throw new Error('Update failed');
    return res.json();
  };

  const addPlan = async () => {
    if (!form.title.trim()) return;
    setSaving(true);
    const body = {
      targetAmount: form.targetAmount,
      currentAmount: form.currentAmount || '0',
      dueDate: form.dueDate,
      notes: form.notes.trim(),
    };
    const title = form.title.trim();
    setShowAdd(false);
    setForm(emptyForm);
    try {
      await fetch(`${API}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'finance_plan',
          title,
          subtitle: `$${amount(body.currentAmount).toLocaleString()} of $${amount(body.targetAmount).toLocaleString()}`,
          body: JSON.stringify(body),
          expiry_date: body.dueDate || null,
          workspace: activeWorkspace,
        }),
      });
      refreshAll();
    } catch {}
    setSaving(false);
  };

  const saveCurrent = async (item) => {
    const current = readBody(item);
    const draft = editing[item.id] || {};
    const body = {
      ...current,
      currentAmount: draft.currentAmount ?? current.currentAmount,
      notes: draft.notes ?? current.notes,
    };
    setItems(prev => prev.map(row => row.id === item.id ? { ...row, ...itemPayload(item, body) } : row));
    setEditing(prev => {
      const next = { ...prev };
      delete next[item.id];
      return next;
    });
    try { await updateItem(item, body); refreshAll(); } catch {}
  };

  const deleteItem = async (id) => {
    setItems(prev => prev.filter(item => item.id !== id));
    try { await fetch(`${API}/items/${id}`, { method: 'DELETE' }); refreshAll(); } catch {}
  };

  const overallProgress = totals.target > 0 ? Math.min(100, Math.round((totals.current / totals.target) * 100)) : 0;

  return (
    <div className="flex h-full flex-col bg-[#f8faf9] text-slate-950">
      <div className="shrink-0 px-5 pt-6">
        <div className="mb-5 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-emerald-800">/finance plan</h1>
            <p className="mt-1 text-xs font-medium text-slate-500">Targets, funding progress, and deadlines</p>
          </div>
          <PiggyBank className="h-7 w-7 text-emerald-700" />
        </div>
        <div className="mb-4 rounded-2xl bg-emerald-800 p-4 text-white shadow-sm">
          <div className="mb-2 flex items-center justify-between text-xs font-bold uppercase text-emerald-100">
            <span>Total progress</span>
            <span>{overallProgress}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-white/20">
            <div className="h-full rounded-full bg-lime-300" style={{ width: `${overallProgress}%` }} />
          </div>
          <p className="mt-3 text-sm font-bold">${totals.current.toLocaleString()} / ${totals.target.toLocaleString()}</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-5 pb-4 scrollbar-hide">
        {items.length === 0 && (
          <div className="rounded-2xl border border-dashed border-emerald-200 bg-white p-8 text-center">
            <Target className="mx-auto mb-3 h-9 w-9 text-emerald-500" />
            <p className="font-bold text-slate-700">No financial targets</p>
          </div>
        )}
        <div className="space-y-3">
          {items.map(item => {
            const body = readBody(item);
            const draft = editing[item.id] || {};
            const pct = progress(body);
            return (
              <div key={item.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="mb-3 flex items-start gap-3">
                  <div className="rounded-xl bg-emerald-50 p-2 text-emerald-800"><DollarSign className="h-5 w-5" /></div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-bold">{item.title}</p>
                    <p className="text-sm text-slate-500">${amount(body.currentAmount).toLocaleString()} of ${amount(body.targetAmount).toLocaleString()}</p>
                  </div>
                  <span className={`shrink-0 rounded-full border px-2 py-1 text-[10px] font-bold ${dueClass(body.dueDate)}`}>{dueLabel(body.dueDate)}</span>
                </div>

                <div className="mb-3">
                  <div className="mb-1 flex justify-between text-xs font-bold text-slate-500">
                    <span>Progress</span>
                    <span>{pct}%</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full rounded-full bg-emerald-600" style={{ width: `${pct}%` }} />
                  </div>
                </div>

                <div className="grid gap-2">
                  <input value={draft.currentAmount ?? body.currentAmount} onChange={e => setEditing(prev => ({ ...prev, [item.id]: { ...prev[item.id], currentAmount: e.target.value } }))} inputMode="decimal" placeholder="Current amount" className="rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-emerald-600" />
                  <textarea value={draft.notes ?? body.notes} onChange={e => setEditing(prev => ({ ...prev, [item.id]: { ...prev[item.id], notes: e.target.value } }))} placeholder="Notes..." rows={2} className="resize-none rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-emerald-600" />
                </div>

                <div className="mt-3 flex gap-2">
                  <button onClick={() => saveCurrent(item)} className="flex flex-1 items-center justify-center gap-1 rounded-xl bg-emerald-800 py-2 text-sm font-bold text-white"><Save className="h-4 w-4" />Save</button>
                  <div className="flex items-center gap-1 rounded-xl bg-slate-50 px-3 py-2 text-xs font-bold text-slate-500"><CalendarClock className="h-4 w-4" />{body.dueDate || 'No date'}</div>
                  <button onClick={() => confirmDelete({ title: 'Delete financial target?', itemName: item.title, onConfirm: () => deleteItem(item.id) })} className="rounded-xl bg-red-50 px-3 py-2 text-red-500"><Trash2 className="h-4 w-4" /></button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="shrink-0 px-5 pb-5 pt-2">
        <button onClick={() => setShowAdd(true)} className="flex w-full items-center justify-center gap-2 rounded-full bg-emerald-800 py-4 font-bold text-white">
          <Plus className="h-5 w-5" />
          Add Target
        </button>
      </div>

      {showAdd && (
        <div className="absolute inset-0 z-50 flex items-end bg-black/50" onClick={() => setShowAdd(false)}>
          <div className="w-full rounded-t-3xl bg-white p-5" onClick={e => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-bold">Add financial target</h3>
              <button onClick={() => setShowAdd(false)}><X className="h-5 w-5 text-slate-400" /></button>
            </div>
            <div className="space-y-3">
              <input value={form.title} onChange={e => setForm(prev => ({ ...prev, title: e.target.value }))} placeholder="Target name" className="w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-emerald-600" autoFocus />
              <div className="grid grid-cols-2 gap-3">
                <input value={form.targetAmount} onChange={e => setForm(prev => ({ ...prev, targetAmount: e.target.value }))} inputMode="decimal" placeholder="Target amount" className="rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-emerald-600" />
                <input value={form.currentAmount} onChange={e => setForm(prev => ({ ...prev, currentAmount: e.target.value }))} inputMode="decimal" placeholder="Current" className="rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-emerald-600" />
              </div>
              <input type="date" value={form.dueDate} onChange={e => setForm(prev => ({ ...prev, dueDate: e.target.value }))} className="w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-emerald-600" />
              <textarea value={form.notes} onChange={e => setForm(prev => ({ ...prev, notes: e.target.value }))} placeholder="Notes..." rows={3} className="w-full resize-none rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-emerald-600" />
              <button onClick={addPlan} disabled={saving || !form.title.trim()} className="w-full rounded-xl bg-emerald-800 py-3 font-bold text-white disabled:opacity-40">
                {saving ? 'Saving...' : 'Save Target'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
