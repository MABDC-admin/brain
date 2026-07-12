import React, { useState, useEffect, useCallback } from 'react';
import { Calendar, Bell, MoreVertical, CheckCircle2 } from 'lucide-react';

const API = import.meta.env.PROD ? 'https://brain.mabdc.com' : 'https://brain.mabdc.com';
const PRIORITY_COLOR = { High: 'text-red-500', Medium: 'text-orange-400', Low: 'text-blue-400' };

const AGENDA_COLORS = ['bg-blue-500', 'bg-purple-500', 'bg-green-500', 'bg-orange-500', 'bg-teal-500', 'bg-pink-500'];

function getTimeFromSubtitle(sub = '') {
  const m = sub.match(/(\d{1,2}:\d{2}\s*(?:AM|PM)?)/i);
  return m ? m[1] : null;
}

function getPriorityFromSubtitle(sub = '') {
  if (sub.toLowerCase().includes('high'))   return 'High';
  if (sub.toLowerCase().includes('medium')) return 'Medium';
  if (sub.toLowerCase().includes('low'))    return 'Low';
  return null;
}

export default function TodayPage() {
  const [tasks,     setTasks]     = useState([]);
  const [reminders, setReminders] = useState([]);
  const [done,      setDone]      = useState([]);
  const [loading,   setLoading]   = useState(true);
  const toggle = (id) => setDone(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]);

  const today = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [t, r] = await Promise.all([
        fetch(`${API}/items/type/task`).then(x => x.json()),
        fetch(`${API}/items/type/reminder`).then(x => x.json()),
      ]);
      setTasks(t);
      setReminders(r);
    } catch {
      // Fallback sample data
      setTasks([
        { id: 1, title: 'Send proposal to Acme',   subtitle: 'Task • Due Fri, 18 Jul', priority: 'High' },
        { id: 2, title: 'Review deck with team',   subtitle: 'Task • Due Tomorrow, 11:00 AM' },
        { id: 3, title: 'Book flights to Dubai',   subtitle: 'Task • Due 20 Jul' },
        { id: 4, title: 'Prepare investor deck',   subtitle: 'Task • Due 25 Jul', priority: 'Medium' },
        { id: 5, title: 'Update website copy',     subtitle: 'Task • No due date' },
      ]);
      setReminders([
        { id: 10, title: 'Call Ahmed',    subtitle: 'Reminder • Tomorrow, 7:00 PM' },
        { id: 11, title: 'Take medicine', subtitle: 'Reminder • Daily, 9:00 AM' },
        { id: 12, title: 'Gym',           subtitle: 'Reminder • Every Mon, Wed, Fri, 6:30 AM' },
      ]);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // Build agenda from reminders that have times
  const agenda = [
    ...reminders
      .map(r => ({ time: getTimeFromSubtitle(r.subtitle), label: r.title, color: 'bg-orange-500', reminder: true, id: r.id }))
      .filter(a => a.time),
  ];

  // Add static agenda items if fewer than 2 from DB
  if (agenda.length < 2) {
    const defaults = [
      { time: '10:00 AM', label: 'Team standup',    color: 'bg-blue-500', id: 'a1' },
      { time: '12:00 PM', label: 'Lunch with Sara', color: 'bg-purple-500', id: 'a2' },
      { time: '3:00 PM',  label: 'Review proposal', color: 'bg-green-500', id: 'a3' },
    ];
    defaults.slice(0, 3 - agenda.length).forEach(d => agenda.push(d));
  }
  agenda.sort((a, b) => {
    const toMin = t => {
      if (!t) return 9999;
      const [h, rest] = t.split(':');
      const [m, period] = (rest || '00').split(' ');
      let hr = parseInt(h);
      if (period?.toUpperCase() === 'PM' && hr !== 12) hr += 12;
      if (period?.toUpperCase() === 'AM' && hr === 12) hr = 0;
      return hr * 60 + parseInt(m);
    };
    return toMin(a.time) - toMin(b.time);
  });

  const openTasks = tasks.filter(t => !done.includes(t.id));
  const doneTasks = tasks.filter(t => done.includes(t.id));

  return (
    <div className="p-6 flex flex-col h-full text-white">
      {/* Header */}
      <div className="flex justify-between items-center mb-1">
        <h1 className="text-2xl font-bold text-teal-400">/today</h1>
        <MoreVertical className="w-6 h-6 text-gray-500"/>
      </div>
      <h2 className="text-2xl font-bold text-white mb-5">{today}</h2>

      {/* Stats Strip */}
      <div className="flex gap-2 mb-5">
        {[
          { label: 'Tasks',     value: openTasks.length,  color: 'text-green-400', bg: 'bg-green-500/10' },
          { label: 'Done',      value: doneTasks.length,  color: 'text-gray-400',  bg: 'bg-gray-500/10' },
          { label: 'Reminders', value: reminders.length,  color: 'text-orange-400',bg: 'bg-orange-500/10' },
          { label: 'Events',    value: agenda.length,     color: 'text-blue-400',  bg: 'bg-blue-500/10' },
        ].map(s => (
          <div key={s.label} className={`flex-1 ${s.bg} rounded-xl py-2 px-1 text-center`}>
            <p className={`text-lg font-bold ${s.color}`}>{s.value}</p>
            <p className="text-gray-500 text-[10px] font-medium">{s.label}</p>
          </div>
        ))}
      </div>

      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-gray-500 flex flex-col items-center gap-2">
            <svg className="animate-spin h-8 w-8" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
            </svg>
            <span className="text-sm">Loading your day…</span>
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto scrollbar-hide space-y-5">

          {/* Agenda */}
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Agenda</p>
            <div className="bg-[#14151b] rounded-2xl border border-[#2a2b36] overflow-hidden">
              {agenda.slice(0, 5).map((a, i) => (
                <div key={a.id || i} className={`flex items-center px-4 py-3 ${i < agenda.length - 1 ? 'border-b border-[#2a2b36]' : ''}`}>
                  <span className="text-gray-400 text-[12px] w-20 shrink-0 font-medium">{a.time}</span>
                  <span className={`w-2 h-2 rounded-full ${a.color} mr-3 shrink-0`}/>
                  <span className="text-white text-[14px] flex-1 font-medium">{a.label}</span>
                  {a.reminder && <Bell className="w-4 h-4 text-orange-400 shrink-0"/>}
                </div>
              ))}
            </div>
          </div>

          {/* Open Tasks */}
          <div>
            <div className="flex justify-between items-center mb-2">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Tasks ({openTasks.length})</p>
              {doneTasks.length > 0 && <span className="text-xs text-gray-600">{doneTasks.length} done</span>}
            </div>
            {openTasks.length === 0 ? (
              <div className="bg-[#14151b] rounded-2xl border border-[#2a2b36] p-6 text-center">
                <CheckCircle2 className="w-8 h-8 text-green-500 mx-auto mb-2"/>
                <p className="text-white font-semibold">All done for today! 🎉</p>
              </div>
            ) : (
              <div className="bg-[#14151b] rounded-2xl border border-[#2a2b36] overflow-hidden">
                {openTasks.slice(0, 6).map((t, i) => {
                  const priority = t.priority || getPriorityFromSubtitle(t.subtitle);
                  return (
                    <div key={t.id} onClick={() => toggle(t.id)}
                      className={`flex items-center px-4 py-3 cursor-pointer hover:bg-[#1a1b23] transition-colors ${i < openTasks.slice(0,6).length - 1 ? 'border-b border-[#2a2b36]' : ''}`}>
                      <div className="w-5 h-5 rounded-full border-2 border-gray-500 mr-4 shrink-0 hover:border-green-400 transition-colors"/>
                      <div className="flex-1 min-w-0">
                        <p className="text-[14px] font-medium text-white truncate">{t.title}</p>
                        <p className="text-gray-500 text-[11px]">{t.subtitle?.split('•')[1]?.trim()}</p>
                      </div>
                      {priority && <span className={`text-[11px] font-bold ${PRIORITY_COLOR[priority]} shrink-0 ml-2`}>! {priority}</span>}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Reminders */}
          {reminders.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Reminders ({reminders.length})</p>
              <div className="bg-[#14151b] rounded-2xl border border-[#2a2b36] overflow-hidden">
                {reminders.slice(0, 3).map((r, i) => (
                  <div key={r.id} className={`flex items-center px-4 py-3 ${i < reminders.slice(0,3).length - 1 ? 'border-b border-[#2a2b36]' : ''}`}>
                    <Bell className="w-5 h-5 text-orange-400 mr-3 shrink-0"/>
                    <div className="flex-1 min-w-0">
                      <p className="text-[14px] font-medium text-white truncate">{r.title}</p>
                      <p className="text-gray-500 text-[11px]">{r.subtitle?.split('•')[1]?.trim()}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* CTA */}
      <button className="mt-4 w-full py-4 rounded-2xl font-semibold text-white flex items-center justify-center gap-2 shrink-0 transition-all hover:opacity-90 active:scale-[0.98]"
        style={{ background: 'linear-gradient(135deg, #14b8a6, #0d9488)' }}>
        <Calendar className="w-5 h-5"/> Plan My Day
      </button>
    </div>
  );
}
