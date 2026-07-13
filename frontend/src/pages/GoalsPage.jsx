import React, { useCallback, useEffect, useState } from 'react';
import { CalendarDays, Check, Flag, Plus, Target, Trash2, X } from 'lucide-react';

const API = import.meta.env.PROD ? 'https://brain.mabdc.com' : 'https://brain.mabdc.com';

function parseGoalBody(body) {
  if (!body) return { targetDate: '', progress: 0, milestones: [] };
  try {
    const parsed = typeof body === 'string' ? JSON.parse(body) : body;
    const progress = Math.min(100, Math.max(0, Number(parsed?.progress) || 0));
    const milestones = Array.isArray(parsed?.milestones)
      ? parsed.milestones.map((milestone, index) => ({
          id: milestone?.id || `${index}-${milestone?.title || 'milestone'}`,
          title: String(milestone?.title || '').trim(),
          complete: Boolean(milestone?.complete),
        })).filter(milestone => milestone.title)
      : [];

    return {
      targetDate: typeof parsed?.targetDate === 'string' ? parsed.targetDate : '',
      progress,
      milestones,
    };
  } catch {
    return { targetDate: '', progress: 0, milestones: [] };
  }
}

function normalizeGoal(item) {
  return { ...item, goalBody: parseGoalBody(item.body) };
}

function targetLabel(targetDate) {
  if (!targetDate) return 'No target date';
  return new Date(`${targetDate}T00:00:00`).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export default function GoalsPage({ loadItems, workspace }) {
  const [goals, setGoals] = useState([]);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ title: '', targetDate: '', progress: 0 });
  const [milestoneText, setMilestoneText] = useState({});
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const activeWorkspace = workspace || 'Personal';

  const load = useCallback(async () => {
    try {
      const response = await fetch(`${API}/items/type/goal?workspace=${encodeURIComponent(activeWorkspace)}`);
      const data = await response.json();
      setGoals(Array.isArray(data) ? data.map(normalizeGoal) : []);
    } catch {
      setGoals([]);
    }
  }, [activeWorkspace]);

  useEffect(() => { load(); }, [load]);

  const refreshAll = () => {
    load();
    if (loadItems) loadItems();
  };

  const updateGoalBody = async (goal, nextBody) => {
    const optimistic = normalizeGoal({ ...goal, body: JSON.stringify(nextBody) });
    setBusyId(goal.id);
    setGoals(prev => prev.map(item => item.id === goal.id ? optimistic : item));

    try {
      await fetch(`${API}/items/${goal.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'goal',
          title: goal.title,
          subtitle: `Goal • ${nextBody.progress}%`,
          body: JSON.stringify(nextBody),
          workspace: activeWorkspace,
        }),
      });
    } catch {
      setGoals(prev => prev.map(item => item.id === goal.id ? normalizeGoal(goal) : item));
    } finally {
      refreshAll();
      setBusyId(null);
    }
  };

  const addGoal = async () => {
    const title = form.title.trim();
    if (!title) return;

    const body = { targetDate: form.targetDate, progress: Number(form.progress) || 0, milestones: [] };
    const temp = normalizeGoal({
      id: `temp-${Date.now()}`,
      title,
      subtitle: `Goal • ${body.progress}%`,
      body: JSON.stringify(body),
    });

    setSaving(true);
    setShowAdd(false);
    setForm({ title: '', targetDate: '', progress: 0 });
    setGoals(prev => [temp, ...prev]);

    try {
      await fetch(`${API}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'goal',
          title,
          subtitle: `Goal • ${body.progress}%`,
          body: JSON.stringify(body),
          workspace: activeWorkspace,
        }),
      });
    } catch {
      setGoals(prev => prev.filter(goal => goal.id !== temp.id));
    } finally {
      refreshAll();
      setSaving(false);
    }
  };

  const updateProgress = (goal, progress) => {
    if (String(goal.id).startsWith('temp-')) return;
    const nextBody = { ...goal.goalBody, progress: Math.min(100, Math.max(0, Number(progress) || 0)) };
    updateGoalBody(goal, nextBody);
  };

  const addMilestone = (goal) => {
    const title = (milestoneText[goal.id] || '').trim();
    if (!title || String(goal.id).startsWith('temp-')) return;

    const nextBody = {
      ...goal.goalBody,
      milestones: [
        ...goal.goalBody.milestones,
        { id: `ms-${Date.now()}`, title, complete: false },
      ],
    };

    setMilestoneText(prev => ({ ...prev, [goal.id]: '' }));
    updateGoalBody(goal, nextBody);
  };

  const toggleMilestone = (goal, milestoneId) => {
    if (String(goal.id).startsWith('temp-')) return;
    const milestones = goal.goalBody.milestones.map(milestone =>
      milestone.id === milestoneId ? { ...milestone, complete: !milestone.complete } : milestone
    );
    const completed = milestones.filter(milestone => milestone.complete).length;
    const progress = milestones.length ? Math.round((completed / milestones.length) * 100) : goal.goalBody.progress;
    updateGoalBody(goal, { ...goal.goalBody, progress, milestones });
  };

  const deleteGoal = async (goal) => {
    const previous = goals;
    setGoals(prev => prev.filter(item => item.id !== goal.id));

    try {
      if (!String(goal.id).startsWith('temp-')) {
        await fetch(`${API}/items/${goal.id}`, { method: 'DELETE' });
      }
    } catch {
      setGoals(previous);
    } finally {
      refreshAll();
    }
  };

  const averageProgress = goals.length
    ? Math.round(goals.reduce((total, goal) => total + goal.goalBody.progress, 0) / goals.length)
    : 0;

  return (
    <div className="flex flex-col h-full bg-[#f7f8fb] text-slate-950 relative">
      <div className="p-5 pb-3 shrink-0">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold text-sky-600">/goals</h1>
            <p className="text-sm text-slate-500">Milestones for {activeWorkspace}</p>
          </div>
          <div className="w-11 h-11 rounded-2xl bg-sky-50 border border-sky-100 flex items-center justify-center text-sky-600">
            <Target className="w-5 h-5"/>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <div className="bg-white border border-slate-200 rounded-2xl p-3 shadow-sm">
            <p className="text-xl font-bold">{goals.length}</p>
            <p className="text-[11px] font-medium text-slate-500">Goals</p>
          </div>
          <div className="bg-white border border-slate-200 rounded-2xl p-3 shadow-sm">
            <p className="text-xl font-bold text-sky-600">{averageProgress}%</p>
            <p className="text-[11px] font-medium text-slate-500">Average</p>
          </div>
          <div className="bg-white border border-slate-200 rounded-2xl p-3 shadow-sm">
            <p className="text-xl font-bold text-emerald-600">{goals.filter(goal => goal.goalBody.progress >= 100).length}</p>
            <p className="text-[11px] font-medium text-slate-500">Done</p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-hide px-5 pb-2">
        {goals.length === 0 ? (
          <div className="h-full min-h-[320px] flex flex-col items-center justify-center text-center text-slate-400">
            <Flag className="w-12 h-12 mb-3 text-sky-200"/>
            <p className="font-semibold text-slate-600">No goals yet</p>
            <p className="text-sm mt-1 max-w-[230px]">Add a target, then break it into visible milestones.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {goals.map(goal => {
              const completed = goal.goalBody.milestones.filter(milestone => milestone.complete).length;
              return (
                <div key={goal.id} className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-950 truncate">{goal.title}</p>
                      <div className="flex items-center gap-1.5 text-[12px] text-slate-500 mt-1">
                        <CalendarDays className="w-3.5 h-3.5"/>
                        <span>{targetLabel(goal.goalBody.targetDate)}</span>
                      </div>
                    </div>
                    <button onClick={() => deleteGoal(goal)} className="text-slate-300 hover:text-red-500 shrink-0">
                      <Trash2 className="w-4 h-4"/>
                    </button>
                  </div>

                  <div className="flex items-center gap-3 mb-3">
                    <input
                      type="range"
                      min="0"
                      max="100"
                      step="5"
                      value={goal.goalBody.progress}
                      disabled={busyId === goal.id}
                      onChange={event => updateProgress(goal, event.target.value)}
                      className="flex-1 accent-sky-600"
                    />
                    <span className="w-11 text-right text-sm font-bold text-sky-600">{goal.goalBody.progress}%</span>
                  </div>
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden mb-4">
                    <div className="h-full bg-sky-600 rounded-full transition-all" style={{ width: `${goal.goalBody.progress}%` }}/>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-[11px] uppercase tracking-wide text-slate-400 font-bold">Milestones</p>
                      <p className="text-[11px] text-slate-400">{completed}/{goal.goalBody.milestones.length}</p>
                    </div>
                    {goal.goalBody.milestones.map(milestone => (
                      <button
                        key={milestone.id}
                        onClick={() => toggleMilestone(goal, milestone.id)}
                        className="w-full flex items-center gap-2 text-left rounded-xl bg-slate-50 px-3 py-2 active:scale-[0.99]"
                      >
                        <span className={`w-5 h-5 rounded-full border flex items-center justify-center shrink-0 ${
                          milestone.complete ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-slate-300'
                        }`}>
                          {milestone.complete && <Check className="w-3 h-3"/>}
                        </span>
                        <span className={`text-sm truncate ${milestone.complete ? 'line-through text-slate-400' : 'text-slate-700'}`}>
                          {milestone.title}
                        </span>
                      </button>
                    ))}
                    <div className="flex gap-2 pt-1">
                      <input
                        value={milestoneText[goal.id] || ''}
                        onChange={event => setMilestoneText(prev => ({ ...prev, [goal.id]: event.target.value }))}
                        onKeyDown={event => { if (event.key === 'Enter') addMilestone(goal); }}
                        placeholder="Add milestone..."
                        className="flex-1 min-w-0 border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-sky-500"
                      />
                      <button
                        onClick={() => addMilestone(goal)}
                        disabled={!String(milestoneText[goal.id] || '').trim()}
                        className="w-10 h-10 rounded-xl bg-sky-600 text-white flex items-center justify-center disabled:opacity-40"
                      >
                        <Plus className="w-4 h-4"/>
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
          className="w-full py-4 rounded-full bg-sky-600 hover:bg-sky-500 text-white font-semibold flex items-center justify-center gap-2 transition-all active:scale-[0.98]"
        >
          <Plus className="w-5 h-5"/> Add Goal
        </button>
      </div>

      {showAdd && (
        <div className="absolute inset-0 z-50 bg-black/50 flex items-end justify-center" onClick={() => setShowAdd(false)}>
          <div className="w-full max-w-[420px] bg-white rounded-t-3xl p-6" onClick={event => event.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-bold">New Goal</h3>
              <button onClick={() => setShowAdd(false)} className="text-slate-400"><X className="w-5 h-5"/></button>
            </div>
            <div className="space-y-3">
              <input
                value={form.title}
                onChange={event => setForm(prev => ({ ...prev, title: event.target.value }))}
                onKeyDown={event => { if (event.key === 'Enter') addGoal(); }}
                placeholder="Goal title..."
                autoFocus
                className="w-full border border-slate-200 rounded-2xl px-4 py-3 outline-none focus:border-sky-500"
              />
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">Target date</label>
                <input
                  type="date"
                  value={form.targetDate}
                  onChange={event => setForm(prev => ({ ...prev, targetDate: event.target.value }))}
                  className="w-full border border-slate-200 rounded-2xl px-4 py-3 outline-none focus:border-sky-500"
                />
              </div>
              <div>
                <div className="flex justify-between text-xs font-semibold text-slate-400 mb-1">
                  <span>Starting progress</span>
                  <span>{form.progress}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="5"
                  value={form.progress}
                  onChange={event => setForm(prev => ({ ...prev, progress: Number(event.target.value) }))}
                  className="w-full accent-sky-600"
                />
              </div>
              <button
                onClick={addGoal}
                disabled={saving || !form.title.trim()}
                className="w-full py-3 rounded-2xl bg-sky-600 text-white font-semibold disabled:opacity-40"
              >
                {saving ? 'Saving...' : 'Create Goal'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
