import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { BellPlus, CalendarDays, Check, MapPin, Plane, Plus, Trash2, X } from 'lucide-react';

const API = import.meta.env.PROD ? 'https://brain.mabdc.com' : 'https://brain.mabdc.com';
const emptyForm = { destination: '', startDate: '', endDate: '', bookingRef: '', checklist: '' };

function readBody(item) {
  try {
    const parsed = JSON.parse(item.body || '{}');
    return {
      destination: parsed.destination || item.title || '',
      startDate: parsed.startDate || '',
      endDate: parsed.endDate || '',
      bookingRef: parsed.bookingRef || '',
      checklist: Array.isArray(parsed.checklist) ? parsed.checklist : [],
    };
  } catch {
    return { destination: item.title || '', startDate: '', endDate: '', bookingRef: '', checklist: [] };
  }
}

function checklistFromInput(value) {
  return value.split('\n').map(text => text.trim()).filter(Boolean).map(text => ({ text, done: false }));
}

function daysUntil(dateValue) {
  if (!dateValue) return null;
  const today = new Date();
  const target = new Date(`${dateValue}T00:00:00`);
  today.setHours(0, 0, 0, 0);
  return Math.ceil((target - today) / 86400000);
}

function tripDateLabel(body) {
  if (!body.startDate) return 'Dates not set';
  const start = new Date(`${body.startDate}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  if (!body.endDate) return start;
  const end = new Date(`${body.endDate}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return `${start} - ${end}`;
}

export default function TravelPage({ loadItems, workspace }) {
  const [items, setItems] = useState([]);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const activeWorkspace = workspace || 'Personal';

  const load = useCallback(() => {
    fetch(`${API}/items/type/travel?workspace=${encodeURIComponent(activeWorkspace)}`)
      .then(r => r.json())
      .then(data => setItems(Array.isArray(data) ? data : []))
      .catch(() => setItems([]));
  }, [activeWorkspace]);

  useEffect(() => { load(); }, [load]);

  const upcoming = useMemo(() => items.filter(item => {
    const days = daysUntil(readBody(item).startDate);
    return days === null || days >= 0;
  }), [items]);

  const refreshAll = () => {
    load();
    if (loadItems) loadItems();
  };

  const itemPayload = (item, body) => ({
    type: 'travel',
    title: body.destination || item.title,
    subtitle: `Trip - ${tripDateLabel(body)}`,
    body: JSON.stringify(body),
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

  const addTrip = async () => {
    if (!form.destination.trim()) return;
    setSaving(true);
    const body = {
      destination: form.destination.trim(),
      startDate: form.startDate,
      endDate: form.endDate,
      bookingRef: form.bookingRef.trim(),
      checklist: checklistFromInput(form.checklist),
    };
    setShowAdd(false);
    setForm(emptyForm);
    try {
      await fetch(`${API}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'travel', title: body.destination, subtitle: `Trip - ${tripDateLabel(body)}`, body: JSON.stringify(body), workspace: activeWorkspace }),
      });
      refreshAll();
    } catch {}
    setSaving(false);
  };

  const toggleChecklist = async (item, index) => {
    const body = readBody(item);
    const checklist = body.checklist.map((entry, i) => i === index ? { ...entry, done: !entry.done } : entry);
    const nextBody = { ...body, checklist };
    setItems(prev => prev.map(row => row.id === item.id ? { ...row, ...itemPayload(item, nextBody) } : row));
    try { await updateItem(item, nextBody); } catch {}
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
          title: `Trip to ${body.destination}`,
          subtitle: `Reminder - ${body.startDate || 'upcoming'}`,
          body: `Travel reminder for ${body.destination}`,
          workspace: activeWorkspace,
        }),
      });
      if (loadItems) loadItems();
    } catch {}
  };

  return (
    <div className="flex h-full flex-col bg-[#f8fafc] text-slate-950">
      <div className="shrink-0 px-5 pt-6">
        <div className="mb-5 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-blue-700">/travel</h1>
            <p className="mt-1 text-xs font-medium text-slate-500">Trips, bookings, and packing lists</p>
          </div>
          <Plane className="h-7 w-7 text-blue-500" />
        </div>
        <div className="mb-4 rounded-2xl bg-blue-700 p-4 text-white shadow-sm">
          <p className="text-xs font-bold uppercase tracking-wide text-blue-100">Upcoming trips</p>
          <p className="mt-1 text-4xl font-black">{upcoming.length}</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-5 pb-4 scrollbar-hide">
        {items.length === 0 && (
          <div className="rounded-2xl border border-dashed border-blue-200 bg-white p-8 text-center">
            <MapPin className="mx-auto mb-3 h-9 w-9 text-blue-400" />
            <p className="font-bold text-slate-700">No trips planned</p>
          </div>
        )}
        <div className="space-y-3">
          {items.map(item => {
            const body = readBody(item);
            const complete = body.checklist.filter(entry => entry.done).length;
            return (
              <div key={item.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="mb-3 flex items-start gap-3">
                  <div className="rounded-xl bg-blue-50 p-2 text-blue-700"><MapPin className="h-5 w-5" /></div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-bold">{body.destination}</p>
                    <p className="flex items-center gap-1 text-sm text-slate-500"><CalendarDays className="h-3.5 w-3.5" />{tripDateLabel(body)}</p>
                    {body.bookingRef && <p className="mt-1 text-xs font-bold text-blue-600">Ref {body.bookingRef}</p>}
                  </div>
                  <button onClick={() => deleteItem(item.id)} className="rounded-xl bg-red-50 p-2 text-red-500"><Trash2 className="h-4 w-4" /></button>
                </div>

                {body.checklist.length > 0 && (
                  <div className="space-y-2 rounded-xl bg-slate-50 p-3">
                    <div className="flex items-center justify-between text-xs font-bold text-slate-500">
                      <span>Checklist</span>
                      <span>{complete}/{body.checklist.length}</span>
                    </div>
                    {body.checklist.map((entry, index) => (
                      <button key={`${entry.text}-${index}`} onClick={() => toggleChecklist(item, index)} className="flex w-full items-center gap-2 text-left text-sm">
                        <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${entry.done ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-300 bg-white text-transparent'}`}>
                          <Check className="h-3 w-3" />
                        </span>
                        <span className={entry.done ? 'text-slate-400 line-through' : 'text-slate-700'}>{entry.text}</span>
                      </button>
                    ))}
                  </div>
                )}

                <button onClick={() => createReminder(item)} className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-blue-50 py-2 text-sm font-bold text-blue-700">
                  <BellPlus className="h-4 w-4" />
                  Create Reminder
                </button>
              </div>
            );
          })}
        </div>
      </div>

      <div className="shrink-0 px-5 pb-5 pt-2">
        <button onClick={() => setShowAdd(true)} className="flex w-full items-center justify-center gap-2 rounded-full bg-blue-700 py-4 font-bold text-white">
          <Plus className="h-5 w-5" />
          Add Trip
        </button>
      </div>

      {showAdd && (
        <div className="absolute inset-0 z-50 flex items-end bg-black/50" onClick={() => setShowAdd(false)}>
          <div className="w-full rounded-t-3xl bg-white p-5" onClick={e => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-bold">Add trip</h3>
              <button onClick={() => setShowAdd(false)}><X className="h-5 w-5 text-slate-400" /></button>
            </div>
            <div className="space-y-3">
              <input value={form.destination} onChange={e => setForm(prev => ({ ...prev, destination: e.target.value }))} placeholder="Destination" className="w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-blue-500" autoFocus />
              <div className="grid grid-cols-2 gap-3">
                <input type="date" value={form.startDate} onChange={e => setForm(prev => ({ ...prev, startDate: e.target.value }))} className="rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-blue-500" />
                <input type="date" value={form.endDate} onChange={e => setForm(prev => ({ ...prev, endDate: e.target.value }))} className="rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-blue-500" />
              </div>
              <input value={form.bookingRef} onChange={e => setForm(prev => ({ ...prev, bookingRef: e.target.value }))} placeholder="Booking reference" className="w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-blue-500" />
              <textarea value={form.checklist} onChange={e => setForm(prev => ({ ...prev, checklist: e.target.value }))} placeholder="Checklist, one item per line" rows={4} className="w-full resize-none rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-blue-500" />
              <button onClick={addTrip} disabled={saving || !form.destination.trim()} className="w-full rounded-xl bg-blue-700 py-3 font-bold text-white disabled:opacity-40">
                {saving ? 'Saving...' : 'Save Trip'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
