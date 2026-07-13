import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { BellPlus, Boxes, MapPin, Plus, Save, ShieldCheck, Trash2, X } from 'lucide-react';

const API = import.meta.env.PROD ? 'https://brain.mabdc.com' : 'https://brain.mabdc.com';
const emptyForm = { category: '', serial: '', value: '', warrantyDate: '', location: '', notes: '' };

function readBody(item) {
  try {
    const parsed = JSON.parse(item.body || '{}');
    return {
      category: parsed.category || item.title || '',
      serial: parsed.serial || '',
      value: parsed.value || '',
      warrantyDate: parsed.warrantyDate || '',
      location: parsed.location || '',
      notes: parsed.notes || '',
    };
  } catch {
    return { category: item.title || '', serial: '', value: '', warrantyDate: item.expiry_date || '', location: '', notes: item.body || '' };
  }
}

function daysUntil(dateValue) {
  if (!dateValue) return null;
  const today = new Date();
  const target = new Date(`${dateValue}T00:00:00`);
  today.setHours(0, 0, 0, 0);
  return Math.ceil((target - today) / 86400000);
}

function warrantyLabel(dateValue) {
  const days = daysUntil(dateValue);
  if (days === null) return 'No warranty date';
  if (days < 0) return 'Warranty expired';
  if (days <= 30) return `Expires in ${days}d`;
  return 'Under warranty';
}

function warrantyClass(dateValue) {
  const days = daysUntil(dateValue);
  if (days === null) return 'bg-slate-100 text-slate-500 border-slate-200';
  if (days < 0) return 'bg-red-50 text-red-600 border-red-200';
  if (days <= 30) return 'bg-amber-50 text-amber-700 border-amber-200';
  return 'bg-emerald-50 text-emerald-700 border-emerald-200';
}

export default function AssetsPage({ loadItems, workspace }) {
  const [items, setItems] = useState([]);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [editing, setEditing] = useState({});
  const [saving, setSaving] = useState(false);
  const activeWorkspace = workspace || 'Personal';

  const load = useCallback(() => {
    fetch(`${API}/items/type/asset?workspace=${encodeURIComponent(activeWorkspace)}`)
      .then(r => r.json())
      .then(data => setItems(Array.isArray(data) ? data : []))
      .catch(() => setItems([]));
  }, [activeWorkspace]);

  useEffect(() => { load(); }, [load]);

  const totalValue = useMemo(() => items.reduce((sum, item) => {
    const amount = Number(readBody(item).value);
    return Number.isFinite(amount) ? sum + amount : sum;
  }, 0), [items]);

  const refreshAll = () => {
    load();
    if (loadItems) loadItems();
  };

  const itemPayload = (item, body) => ({
    type: 'asset',
    title: body.category || item.title,
    subtitle: `${body.location || 'No location'} - ${warrantyLabel(body.warrantyDate)}`,
    body: JSON.stringify(body),
    expiry_date: body.warrantyDate || null,
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

  const addAsset = async () => {
    if (!form.category.trim()) return;
    setSaving(true);
    const body = { ...form, category: form.category.trim(), notes: form.notes.trim() };
    setShowAdd(false);
    setForm(emptyForm);
    try {
      await fetch(`${API}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'asset', title: body.category, subtitle: `${body.location || 'No location'} - ${warrantyLabel(body.warrantyDate)}`, body: JSON.stringify(body), expiry_date: body.warrantyDate || null, workspace: activeWorkspace }),
      });
      refreshAll();
    } catch {}
    setSaving(false);
  };

  const saveEdit = async (item) => {
    const current = readBody(item);
    const draft = editing[item.id] || {};
    const body = { ...current, notes: draft.notes ?? current.notes, location: draft.location ?? current.location };
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
    try {
      await fetch(`${API}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'reminder',
          title: `Warranty: ${body.category}`,
          subtitle: `Reminder - ${body.warrantyDate || 'check warranty'}`,
          body: `Warranty reminder for ${body.category}`,
          workspace: activeWorkspace,
        }),
      });
      if (loadItems) loadItems();
    } catch {}
  };

  return (
    <div className="flex h-full flex-col bg-[#fbfaf7] text-slate-950">
      <div className="shrink-0 px-5 pt-6">
        <div className="mb-5 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-cyan-800">/assets</h1>
            <p className="mt-1 text-xs font-medium text-slate-500">Inventory, locations, and warranties</p>
          </div>
          <Boxes className="h-7 w-7 text-cyan-700" />
        </div>
        <div className="mb-4 grid grid-cols-2 gap-3">
          <div className="rounded-2xl bg-cyan-800 p-4 text-white">
            <p className="text-xs font-bold uppercase text-cyan-100">Assets</p>
            <p className="mt-1 text-3xl font-black">{items.length}</p>
          </div>
          <div className="rounded-2xl border border-cyan-100 bg-white p-4">
            <p className="text-xs font-bold uppercase text-slate-500">Value</p>
            <p className="mt-1 text-2xl font-black text-cyan-800">${totalValue.toLocaleString()}</p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-5 pb-4 scrollbar-hide">
        {items.length === 0 && (
          <div className="rounded-2xl border border-dashed border-cyan-200 bg-white p-8 text-center">
            <ShieldCheck className="mx-auto mb-3 h-9 w-9 text-cyan-500" />
            <p className="font-bold text-slate-700">No assets tracked</p>
          </div>
        )}
        <div className="space-y-3">
          {items.map(item => {
            const body = readBody(item);
            const draft = editing[item.id] || {};
            return (
              <div key={item.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="mb-3 flex items-start gap-3">
                  <div className="rounded-xl bg-cyan-50 p-2 text-cyan-800"><Boxes className="h-5 w-5" /></div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-bold">{body.category}</p>
                    <p className="text-sm text-slate-500">Serial {body.serial || 'not set'}</p>
                    <p className="mt-1 text-xs font-bold text-cyan-700">{body.value ? `$${Number(body.value).toLocaleString()}` : 'No value set'}</p>
                  </div>
                  <span className={`shrink-0 rounded-full border px-2 py-1 text-[10px] font-bold ${warrantyClass(body.warrantyDate)}`}>{warrantyLabel(body.warrantyDate)}</span>
                </div>
                <div className="grid gap-2">
                  <div className="relative">
                    <MapPin className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                    <input value={draft.location ?? body.location} onChange={e => setEditing(prev => ({ ...prev, [item.id]: { ...prev[item.id], location: e.target.value } }))} placeholder="Location" className="w-full rounded-xl border border-slate-200 py-2 pl-9 pr-3 text-sm outline-none focus:border-cyan-600" />
                  </div>
                  <textarea value={draft.notes ?? body.notes} onChange={e => setEditing(prev => ({ ...prev, [item.id]: { ...prev[item.id], notes: e.target.value } }))} placeholder="Notes..." rows={2} className="resize-none rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-cyan-600" />
                </div>
                <div className="mt-3 flex gap-2">
                  <button onClick={() => saveEdit(item)} className="flex flex-1 items-center justify-center gap-1 rounded-xl bg-cyan-800 py-2 text-sm font-bold text-white"><Save className="h-4 w-4" />Save</button>
                  <button onClick={() => createReminder(item)} className="rounded-xl bg-amber-100 px-3 py-2 text-amber-700"><BellPlus className="h-4 w-4" /></button>
                  <button onClick={() => deleteItem(item.id)} className="rounded-xl bg-red-50 px-3 py-2 text-red-500"><Trash2 className="h-4 w-4" /></button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="shrink-0 px-5 pb-5 pt-2">
        <button onClick={() => setShowAdd(true)} className="flex w-full items-center justify-center gap-2 rounded-full bg-cyan-800 py-4 font-bold text-white">
          <Plus className="h-5 w-5" />
          Add Asset
        </button>
      </div>

      {showAdd && (
        <div className="absolute inset-0 z-50 flex items-end bg-black/50" onClick={() => setShowAdd(false)}>
          <div className="w-full rounded-t-3xl bg-white p-5" onClick={e => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-bold">Add asset</h3>
              <button onClick={() => setShowAdd(false)}><X className="h-5 w-5 text-slate-400" /></button>
            </div>
            <div className="space-y-3">
              <input value={form.category} onChange={e => setForm(prev => ({ ...prev, category: e.target.value }))} placeholder="Asset name or category" className="w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-cyan-600" autoFocus />
              <div className="grid grid-cols-2 gap-3">
                <input value={form.serial} onChange={e => setForm(prev => ({ ...prev, serial: e.target.value }))} placeholder="Serial" className="rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-cyan-600" />
                <input value={form.value} onChange={e => setForm(prev => ({ ...prev, value: e.target.value }))} placeholder="Value" inputMode="decimal" className="rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-cyan-600" />
              </div>
              <input type="date" value={form.warrantyDate} onChange={e => setForm(prev => ({ ...prev, warrantyDate: e.target.value }))} className="w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-cyan-600" />
              <input value={form.location} onChange={e => setForm(prev => ({ ...prev, location: e.target.value }))} placeholder="Location" className="w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-cyan-600" />
              <textarea value={form.notes} onChange={e => setForm(prev => ({ ...prev, notes: e.target.value }))} placeholder="Notes..." rows={3} className="w-full resize-none rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-cyan-600" />
              <button onClick={addAsset} disabled={saving || !form.category.trim()} className="w-full rounded-xl bg-cyan-800 py-3 font-bold text-white disabled:opacity-40">
                {saving ? 'Saving...' : 'Save Asset'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
