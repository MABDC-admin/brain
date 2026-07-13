import React, { useState, useEffect, useCallback } from 'react';
import { Search, MoreVertical, Bell, RefreshCw, ChevronLeft, ChevronRight, X } from 'lucide-react';
import SwipeableRow from '../components/SwipeableRow.jsx';

const API = import.meta.env.PROD ? 'https://brain.mabdc.com' : 'https://brain.mabdc.com';
const REPEAT_OPTS = ['None', 'Daily', 'Weekly', 'Every Mon, Wed, Fri', 'Monthly'];

function buildCalendar(year, month) {
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const offset = (firstDay + 6) % 7;
  const cells = Array(offset).fill(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  return cells;
}

export default function ReminderPage({ loadItems, workspace }) {
  const [reminders, setReminders] = useState([]);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ title: '', date: '', time: '', repeat: 'None' });
  const [saving, setSaving] = useState(false);
  const [selectedDay, setSelectedDay] = useState(null);
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth());
  const [year, setYear] = useState(now.getFullYear());
  const cells = buildCalendar(year, month);
  const DAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
  const monthLabel = new Date(year, month).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  const prevMonth = () => { if (month === 0) { setMonth(11); setYear(y => y - 1); } else setMonth(m => m - 1); };
  const nextMonth = () => { if (month === 11) { setMonth(0); setYear(y => y + 1); } else setMonth(m => m + 1); };

  const load = useCallback(() => {
    fetch(`${API}/items/type/reminder?workspace=${encodeURIComponent(workspace || 'Personal')}`)
      .then(r => r.json())
      .then(setReminders)
      .catch(() => setReminders([]));
  }, [workspace]);

  useEffect(() => { load(); }, [load, workspace]);

  const addReminder = async () => {
    if (!form.title.trim()) return;
    setSaving(true);
    // Close immediately
    setShowAdd(false);
    setForm({ title: '', date: '', time: '', repeat: 'None' });
    const timePart = form.time ? `, ${form.time}` : '';
    const datePart = form.date
      ? new Date(form.date).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })
      : 'Tomorrow';
    const repeatPart = form.repeat !== 'None' ? form.repeat : datePart;
    const subtitle = `Reminder • ${repeatPart}${timePart}`;
    try {
      await fetch(`${API}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'reminder', title: form.title, subtitle, workspace: workspace || 'Personal' }),
      });
    } catch {}
    load();
    if (loadItems) loadItems();
    setSaving(false);
  };

  const isRepeat = (r) => {
    const s = r.subtitle?.toLowerCase() || '';
    return s.includes('daily') || s.includes('weekly') || s.includes('every') || s.includes('monthly');
  };

  return (
    <div className="flex flex-col h-full bg-gray-100 text-black">
      <div className="p-6 pb-0 shrink-0">
        <div className="flex justify-between items-center mb-4">
          <h1 className="text-2xl font-bold text-orange-500">/reminder ▾</h1>
          <div className="flex gap-3"><Search className="w-6 h-6 text-gray-500"/><MoreVertical className="w-6 h-6 text-gray-500"/></div>
        </div>

        {/* Calendar */}
        <div className="bg-white rounded-2xl p-4 mb-4 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <button onClick={prevMonth} className="p-1 hover:bg-gray-100 rounded-full"><ChevronLeft className="w-5 h-5 text-gray-600"/></button>
            <span className="font-semibold text-gray-800">{monthLabel}</span>
            <button onClick={nextMonth} className="p-1 hover:bg-gray-100 rounded-full"><ChevronRight className="w-5 h-5 text-gray-600"/></button>
          </div>
          <div className="grid grid-cols-7 mb-2">
            {DAYS.map(d => <div key={d} className="text-center text-[10px] font-semibold text-gray-400">{d}</div>)}
          </div>
          <div className="grid grid-cols-7 gap-y-1">
            {cells.map((d, i) => (
              <div key={i} className="flex items-center justify-center h-8">
                {d && (
                  <button onClick={() => { setSelectedDay(d); setForm(f => ({ ...f, date: `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}` })); setShowAdd(true); }}
                    className={`w-8 h-8 flex items-center justify-center rounded-full text-[14px] font-medium transition-colors
                    ${d === now.getDate() && month === now.getMonth() && year === now.getFullYear() ? 'bg-orange-500 text-white font-bold' :
                      selectedDay === d ? 'bg-orange-100 text-orange-600' : 'text-gray-700 hover:bg-orange-50'}`}>
                    {d}
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-hide px-6">
        <p className="font-bold text-gray-800 mb-3">Upcoming ({reminders.length})</p>
        {reminders.length === 0 && (
          <div className="text-center py-8 text-gray-400">
            <p className="text-3xl mb-2">🔔</p><p className="font-medium">No reminders yet</p>
          </div>
        )}
        {reminders.map((r) => (
          <SwipeableRow key={r.id} onDelete={() => { fetch(`${API}/items/${r.id}`, { method: 'DELETE' }).catch(()=>{}); setReminders(p => p.filter(x => x.id !== r.id)); }} deleteTitle="Delete reminder?" deleteItemName={r.title}>
            <div className="bg-white rounded-2xl px-4 py-3 flex items-center shadow-sm mb-3">
              <Bell className="w-5 h-5 text-orange-400 mr-3 shrink-0"/>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-black truncate">{r.title}</p>
                <p className="text-gray-500 text-[12px]">{r.subtitle?.split('•')[1]?.trim()}</p>
              </div>
              {isRepeat(r) && (
                <span className="flex items-center gap-1 text-[10px] font-semibold text-orange-500 bg-orange-50 border border-orange-200 px-2 py-0.5 rounded-full shrink-0 ml-2">
                  <RefreshCw className="w-3 h-3"/> Repeat
                </span>
              )}
            </div>
          </SwipeableRow>
        ))}
      </div>

      <div className="p-6 pt-4 shrink-0">
        <button onClick={() => setShowAdd(true)} className="w-full py-4 rounded-full bg-orange-500 hover:bg-orange-400 transition-colors font-semibold text-white flex items-center justify-center gap-2">
          + Add Reminder
        </button>
      </div>

      {showAdd && (
        <div className="absolute inset-0 z-50 bg-black/60 flex items-end justify-center" onClick={() => setShowAdd(false)}>
          <div className="bg-white rounded-t-3xl w-full max-w-[400px] p-6" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-black">Add Reminder</h3>
              <button onClick={() => setShowAdd(false)}><X className="w-5 h-5 text-gray-400"/></button>
            </div>
            <div className="space-y-3">
              <input value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
                placeholder="Reminder title..." className="w-full border border-gray-200 rounded-xl px-4 py-3 text-black outline-none focus:border-orange-400" autoFocus/>
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="text-xs text-gray-400 font-medium mb-1 block">Date</label>
                  <input type="date" value={form.date} onChange={e => setForm(p => ({ ...p, date: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-4 py-3 text-black outline-none focus:border-orange-400"/>
                </div>
                <div className="flex-1">
                  <label className="text-xs text-gray-400 font-medium mb-1 block">Time</label>
                  <input type="time" value={form.time} onChange={e => setForm(p => ({ ...p, time: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-4 py-3 text-black outline-none focus:border-orange-400"/>
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-400 font-medium mb-1 block">Repeat</label>
                <div className="flex flex-wrap gap-2">
                  {REPEAT_OPTS.map(opt => (
                    <button key={opt} onClick={() => setForm(p => ({ ...p, repeat: opt }))}
                      className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${form.repeat === opt ? 'border-orange-400 bg-orange-50 text-orange-600' : 'border-gray-200 text-gray-500'}`}>
                      {opt}
                    </button>
                  ))}
                </div>
              </div>
              <button onClick={addReminder} disabled={saving || !form.title.trim()}
                className="w-full py-3 rounded-xl bg-orange-500 hover:bg-orange-400 disabled:opacity-40 text-white font-semibold transition-colors">
                {saving ? 'Saving…' : 'Save Reminder'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
