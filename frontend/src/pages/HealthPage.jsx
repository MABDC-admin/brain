import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { BellPlus, CalendarClock, HeartPulse, MoreVertical, Pill, Plus, Save, Trash2, X } from 'lucide-react';
import { useDeleteConfirmation } from '../hooks/useDeleteConfirmation.js';

const API = import.meta.env.PROD ? 'https://brain.mabdc.com' : 'https://brain.mabdc.com';
const emptyForm = { medication: '', dosage: '', schedule: '', refillDate: '', notes: '' };

function readBody(item) {
  try {
    const parsed = JSON.parse(item.body || '{}');
    return {
      medication: parsed.medication || item.title || '',
      dosage: parsed.dosage || '',
      schedule: parsed.schedule || '',
      refillDate: parsed.refillDate || '',
      notes: parsed.notes || '',
    };
  } catch {
    return { medication: item.title || '', dosage: '', schedule: '', refillDate: item.expiry_date || '', notes: item.body || '' };
  }
}

function daysUntil(dateValue) {
  if (!dateValue) return null;
  const today = new Date();
  const target = new Date(`${dateValue}T00:00:00`);
  today.setHours(0, 0, 0, 0);
  return Math.ceil((target - today) / 86400000);
}

function refillLabel(dateValue) {
  const days = daysUntil(dateValue);
  if (days === null) return 'No refill date';
  if (days < 0) return `${Math.abs(days)}d overdue`;
  if (days === 0) return 'Due today';
  return `${days}d left`;
}

function refillClass(dateValue) {
  const days = daysUntil(dateValue);
  if (days === null) return 'bg-slate-100 text-slate-500 border-slate-200';
  if (days <= 3) return 'bg-red-50 text-red-600 border-red-200';
  if (days <= 14) return 'bg-amber-50 text-amber-700 border-amber-200';
  return 'bg-emerald-50 text-emerald-700 border-emerald-200';
}

export default function HealthPage({ loadItems, workspace }) {
  const [items, setItems] = useState([]);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [editing, setEditing] = useState({});
  const [saving, setSaving] = useState(false);
  const { confirmDelete } = useDeleteConfirmation();
  const activeWorkspace = workspace || 'Personal';

  const load = useCallback(() => {
    fetch(`${API}/items/type/health?workspace=${encodeURIComponent(activeWorkspace)}`)
      .then(r => r.json())
      .then(data => setItems(Array.isArray(data) ? data : []))
      .catch(() => setItems([]));
  }, [activeWorkspace]);

  useEffect(() => { load(); }, [load]);

  const dueRefills = useMemo(() => items.filter(item => {
    const days = daysUntil(readBody(item).refillDate);
    return days !== null && days <= 14;
  }), [items]);

  const refreshAll = () => {
    load();
    if (loadItems) loadItems();
  };

  const itemPayload = (item, body) => ({
    type: 'health',
    title: body.medication || item.title,
    subtitle: `${body.dosage || 'Health item'} - ${body.schedule || 'No schedule'}`,
    body: JSON.stringify(body),
    expiry_date: body.refillDate || null,
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

  const addHealthItem = async () => {
    if (!form.medication.trim()) return;
    setSaving(true);
    const body = { ...form, medication: form.medication.trim(), notes: form.notes.trim() };
    setShowAdd(false);
    setForm(emptyForm);
    try {
      await fetch(`${API}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'health',
          title: body.medication,
          subtitle: `${body.dosage || 'Health item'} - ${body.schedule || 'No schedule'}`,
          body: JSON.stringify(body),
          expiry_date: body.refillDate || null,
          workspace: activeWorkspace,
        }),
      });
      refreshAll();
    } catch {}
    setSaving(false);
  };

  const saveEdit = async (item) => {
    const current = readBody(item);
    const draft = editing[item.id] || {};
    const body = { ...current, notes: draft.notes ?? current.notes, refillDate: draft.refillDate ?? current.refillDate };
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

  const createReminder = async (item) => {
    const body = readBody(item);
    const dateText = body.refillDate || 'soon';
    try {
      await fetch(`${API}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'reminder',
          title: `Refill ${body.medication}`,
          subtitle: `Reminder - ${dateText}`,
          body: `Health refill reminder for ${body.medication}`,
          workspace: activeWorkspace,
        }),
      });
      if (loadItems) loadItems();
    } catch {}
  };

  return (
    <div className="flex h-full flex-col bg-[#f6fbfa] text-slate-950">
      <div className="shrink-0 px-5 pt-6">
        <div className="mb-5 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-teal-700">/health</h1>
            <p className="mt-1 text-xs font-medium text-slate-500">Medication schedules and refills</p>
          </div>
          <MoreVertical className="h-6 w-6 text-slate-400" />
        </div>

        <div className="mb-4 rounded-2xl border border-teal-100 bg-white p-4 shadow-sm">
          <div className="mb-2 flex items-center justify-between">
            <p className="font-bold text-slate-900">Due refills</p>
            <CalendarClock className="h-5 w-5 text-teal-600" />
          </div>
          <p className="text-3xl font-black text-teal-700">{dueRefills.length}</p>
          <p className="mt-1 text-xs font-medium text-slate-500">within 14 days or overdue</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-5 pb-4 scrollbar-hide">
        {items.length === 0 && (
          <div className="rounded-2xl border border-dashed border-teal-200 bg-white p-8 text-center">
            <HeartPulse className="mx-auto mb-3 h-9 w-9 text-teal-400" />
            <p className="font-bold text-slate-700">No health items yet</p>
          </div>
        )}
        <div className="space-y-3">
          {items.map(item => {
            const body = readBody(item);
            const draft = editing[item.id] || {};
            return (
              <div key={item.id} className="rounded-2xl border border-teal-100 bg-white p-4 shadow-sm">
                <div className="mb-3 flex items-start gap-3">
                  <div className="rounded-xl bg-teal-50 p-2 text-teal-700"><Pill className="h-5 w-5" /></div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-bold">{body.medication}</p>
                    <p className="text-sm text-slate-500">{body.dosage || 'No dosage'} - {body.schedule || 'No schedule'}</p>
                  </div>
                  <span className={`shrink-0 rounded-full border px-2 py-1 text-[10px] font-bold ${refillClass(body.refillDate)}`}>{refillLabel(body.refillDate)}</span>
                </div>
                <div className="grid grid-cols-1 gap-2">
                  <input type="date" value={draft.refillDate ?? body.refillDate} onChange={e => setEditing(prev => ({ ...prev, [item.id]: { ...prev[item.id], refillDate: e.target.value } }))} className="rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-teal-500" />
                  <textarea value={draft.notes ?? body.notes} onChange={e => setEditing(prev => ({ ...prev, [item.id]: { ...prev[item.id], notes: e.target.value } }))} placeholder="Notes..." rows={2} className="resize-none rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-teal-500" />
                </div>
                <div className="mt-3 flex gap-2">
                  <button onClick={() => saveEdit(item)} className="flex flex-1 items-center justify-center gap-1 rounded-xl bg-teal-600 py-2 text-sm font-bold text-white"><Save className="h-4 w-4" />Save</button>
                  <button onClick={() => createReminder(item)} className="rounded-xl bg-amber-100 px-3 py-2 text-amber-700"><BellPlus className="h-4 w-4" /></button>
                  <button onClick={() => confirmDelete({ title: 'Delete health item?', itemName: body.medication, onConfirm: () => deleteItem(item.id) })} className="rounded-xl bg-red-50 px-3 py-2 text-red-500"><Trash2 className="h-4 w-4" /></button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="shrink-0 px-5 pb-5 pt-2">
        <button onClick={() => setShowAdd(true)} className="flex w-full items-center justify-center gap-2 rounded-full bg-teal-600 py-4 font-bold text-white">
          <Plus className="h-5 w-5" />
          Add Health Item
        </button>
      </div>

      {showAdd && (
        <div className="absolute inset-0 z-50 flex items-end bg-black/50" onClick={() => setShowAdd(false)}>
          <div className="w-full rounded-t-3xl bg-white p-5" onClick={e => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-bold">Add medication</h3>
              <button onClick={() => setShowAdd(false)}><X className="h-5 w-5 text-slate-400" /></button>
            </div>
            <div className="space-y-3">
              <input value={form.medication} onChange={e => setForm(prev => ({ ...prev, medication: e.target.value }))} placeholder="Medication or health item" className="w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-teal-500" autoFocus />
              <div className="grid grid-cols-2 gap-3">
                <input value={form.dosage} onChange={e => setForm(prev => ({ ...prev, dosage: e.target.value }))} placeholder="Dosage" className="rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-teal-500" />
                <input value={form.schedule} onChange={e => setForm(prev => ({ ...prev, schedule: e.target.value }))} placeholder="Schedule" className="rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-teal-500" />
              </div>
              <input type="date" value={form.refillDate} onChange={e => setForm(prev => ({ ...prev, refillDate: e.target.value }))} className="w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-teal-500" />
              <textarea value={form.notes} onChange={e => setForm(prev => ({ ...prev, notes: e.target.value }))} placeholder="Notes..." rows={3} className="w-full resize-none rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-teal-500" />
              <button onClick={addHealthItem} disabled={saving || !form.medication.trim()} className="w-full rounded-xl bg-teal-600 py-3 font-bold text-white disabled:opacity-40">
                {saving ? 'Saving...' : 'Save Health Item'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
