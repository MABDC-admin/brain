import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, Flame, Plus, RotateCcw, Trash2, X } from 'lucide-react';

const API = import.meta.env.PROD ? 'https://brain.mabdc.com' : 'https://brain.mabdc.com';

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function parseHabitBody(body) {
  if (!body) return { streak: 0, completions: [] };
  try {
    const parsed = typeof body === 'string' ? JSON.parse(body) : body;
    const completions = Array.isArray(parsed?.completions)
      ? [...new Set(parsed.completions.filter(date => typeof date === 'string'))].sort()
      : [];
    const streak = Number.isFinite(Number(parsed?.streak)) ? Number(parsed.streak) : calculateStreak(completions);
    return { streak: Math.max(0, streak), completions };
  } catch {
    return { streak: 0, completions: [] };
  }
}

function calculateStreak(completions) {
  const completed = new Set(completions);
  let streak = 0;
  const cursor = new Date();

  while (completed.has(cursor.toISOString().slice(0, 10))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }

  return streak;
}

function normalizeHabit(item) {
  const body = parseHabitBody(item.body);
  const completions = [...new Set(body.completions)].sort();
  return {
    ...item,
    habitBody: {
      completions,
      streak: calculateStreak(completions),
    },
  };
}

export default function HabitsPage({ loadItems, workspace }) {
  const [habits, setHabits] = useState([]);
  const [showAdd, setShowAdd] = useState(false);
  const [title, setTitle] = useState('');
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const activeWorkspace = workspace || 'Personal';
  const today = useMemo(() => todayKey(), []);

  const load = useCallback(async () => {
    try {
      const response = await fetch(`${API}/items/type/habit?workspace=${encodeURIComponent(activeWorkspace)}`);
      const data = await response.json();
      setHabits(Array.isArray(data) ? data.map(normalizeHabit) : []);
    } catch {
      setHabits([]);
    }
  }, [activeWorkspace]);

  useEffect(() => { load(); }, [load]);

  const refreshAll = () => {
    load();
    if (loadItems) loadItems();
  };

  const addHabit = async () => {
    const name = title.trim();
    if (!name) return;

    const temp = {
      id: `temp-${Date.now()}`,
      title: name,
      subtitle: 'Habit • Daily',
      body: JSON.stringify({ streak: 0, completions: [] }),
      habitBody: { streak: 0, completions: [] },
    };

    setSaving(true);
    setShowAdd(false);
    setTitle('');
    setHabits(prev => [temp, ...prev]);

    try {
      await fetch(`${API}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'habit',
          title: name,
          subtitle: 'Habit • Daily',
          body: JSON.stringify({ streak: 0, completions: [] }),
          workspace: activeWorkspace,
        }),
      });
    } catch {
      setHabits(prev => prev.filter(habit => habit.id !== temp.id));
    } finally {
      refreshAll();
      setSaving(false);
    }
  };

  const markToday = async (habit) => {
    if (String(habit.id).startsWith('temp-')) return;
    const current = parseHabitBody(habit.body);
    if (current.completions.includes(today)) return;

    const completions = [...new Set([...current.completions, today])].sort();
    const nextBody = { streak: calculateStreak(completions), completions };
    const optimistic = normalizeHabit({ ...habit, body: JSON.stringify(nextBody) });

    setBusyId(habit.id);
    setHabits(prev => prev.map(item => item.id === habit.id ? optimistic : item));

    try {
      await fetch(`${API}/items/${habit.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'habit',
          title: habit.title,
          subtitle: 'Habit • Daily',
          body: JSON.stringify(nextBody),
          workspace: activeWorkspace,
        }),
      });
    } catch {
      setHabits(prev => prev.map(item => item.id === habit.id ? normalizeHabit(habit) : item));
    } finally {
      refreshAll();
      setBusyId(null);
    }
  };

  const deleteHabit = async (habit) => {
    const previous = habits;
    setHabits(prev => prev.filter(item => item.id !== habit.id));

    try {
      if (!String(habit.id).startsWith('temp-')) {
        await fetch(`${API}/items/${habit.id}`, { method: 'DELETE' });
      }
    } catch {
      setHabits(previous);
    } finally {
      refreshAll();
    }
  };

  const completedToday = habits.filter(habit => habit.habitBody.completions.includes(today)).length;
  const bestStreak = habits.reduce((max, habit) => Math.max(max, habit.habitBody.streak), 0);

  return (
    <div className="flex flex-col h-full bg-[#f8faf9] text-slate-950 relative">
      <div className="p-5 pb-3 shrink-0">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold text-emerald-600">/habits</h1>
            <p className="text-sm text-slate-500">Daily rhythm for {activeWorkspace}</p>
          </div>
          <button onClick={refreshAll} className="w-10 h-10 rounded-full bg-white border border-slate-200 flex items-center justify-center text-slate-500 shadow-sm">
            <RotateCcw className="w-4 h-4"/>
          </button>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <div className="bg-white border border-slate-200 rounded-2xl p-3 shadow-sm">
            <p className="text-xl font-bold text-slate-950">{habits.length}</p>
            <p className="text-[11px] font-medium text-slate-500">Habits</p>
          </div>
          <div className="bg-white border border-slate-200 rounded-2xl p-3 shadow-sm">
            <p className="text-xl font-bold text-emerald-600">{completedToday}</p>
            <p className="text-[11px] font-medium text-slate-500">Today</p>
          </div>
          <div className="bg-white border border-slate-200 rounded-2xl p-3 shadow-sm">
            <p className="text-xl font-bold text-orange-500">{bestStreak}</p>
            <p className="text-[11px] font-medium text-slate-500">Best streak</p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-hide px-5 pb-2">
        {habits.length === 0 ? (
          <div className="h-full min-h-[300px] flex flex-col items-center justify-center text-center text-slate-400">
            <Flame className="w-12 h-12 mb-3 text-emerald-200"/>
            <p className="font-semibold text-slate-600">No habits yet</p>
            <p className="text-sm mt-1 max-w-[220px]">Create one small daily action and keep the chain visible.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {habits.map(habit => {
              const isDone = habit.habitBody.completions.includes(today);
              return (
                <div key={habit.id} className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
                  <div className="flex items-start gap-3">
                    <button
                      onClick={() => markToday(habit)}
                      disabled={isDone || busyId === habit.id}
                      className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 transition-all ${
                        isDone ? 'bg-emerald-500 text-white' : 'bg-emerald-50 text-emerald-600 border border-emerald-100 active:scale-95'
                      }`}
                    >
                      <Check className="w-5 h-5"/>
                    </button>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-slate-950 truncate">{habit.title}</p>
                      <p className="text-[12px] text-slate-500">{isDone ? 'Completed today' : 'Ready for today'}</p>
                      <div className="mt-3 h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-emerald-500 rounded-full transition-all"
                          style={{ width: `${Math.min(100, habit.habitBody.streak * 14)}%` }}
                        />
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="flex items-center justify-end gap-1 text-orange-500 font-bold">
                        <Flame className="w-4 h-4"/>
                        <span>{habit.habitBody.streak}</span>
                      </div>
                      <p className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold">streak</p>
                      <button onClick={() => deleteHabit(habit)} className="mt-3 text-slate-300 hover:text-red-500">
                        <Trash2 className="w-4 h-4"/>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="p-5 pt-3 shrink-0">
        <button
          onClick={() => setShowAdd(true)}
          className="w-full py-4 rounded-full bg-emerald-600 hover:bg-emerald-500 text-white font-semibold flex items-center justify-center gap-2 transition-all active:scale-[0.98]"
        >
          <Plus className="w-5 h-5"/> Add Habit
        </button>
      </div>

      {showAdd && (
        <div className="absolute inset-0 z-50 bg-black/50 flex items-end justify-center" onClick={() => setShowAdd(false)}>
          <div className="w-full max-w-[420px] bg-white rounded-t-3xl p-6" onClick={event => event.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-bold text-slate-950">New Habit</h3>
              <button onClick={() => setShowAdd(false)} className="text-slate-400"><X className="w-5 h-5"/></button>
            </div>
            <input
              value={title}
              onChange={event => setTitle(event.target.value)}
              onKeyDown={event => { if (event.key === 'Enter') addHabit(); }}
              placeholder="Habit name..."
              autoFocus
              className="w-full border border-slate-200 rounded-2xl px-4 py-3 text-slate-950 outline-none focus:border-emerald-500"
            />
            <button
              onClick={addHabit}
              disabled={saving || !title.trim()}
              className="mt-4 w-full py-3 rounded-2xl bg-emerald-600 text-white font-semibold disabled:opacity-40"
            >
              {saving ? 'Saving...' : 'Create Habit'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
