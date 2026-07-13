import React, { useState, useEffect, useCallback } from 'react';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, Cell, PieChart, Pie
} from 'recharts';
import { TrendingUp, CheckCircle2, Wallet, FileText, Bell, BarChart2 } from 'lucide-react';
import { useCountUp } from '../hooks/useCountUp.js';

const API = import.meta.env.PROD ? 'https://brain.mabdc.com' : 'https://brain.mabdc.com';

const CAT_COLORS = {
  'Food & Drinks': '#3b82f6', Transport: '#22c55e', Shopping: '#f97316',
  'Bills & Utilities': '#a855f7', Entertainment: '#ec4899', Health: '#14b8a6', Other: '#9ca3af'
};
const CATEGORIES = Object.keys(CAT_COLORS);

function parseAmount(title = '')   { const m = title.match(/^(\d+(?:\.\d+)?)/); return m ? parseFloat(m[1]) : 0; }
function parseCat(sub = '')        { return CATEGORIES.find(c => sub.includes(c)) || 'Other'; }
const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-[#1a1b23] border border-[#2a2b36] rounded-xl px-3 py-2 text-white text-xs shadow-xl">
      <p className="font-bold">{label}</p>
      <p className="text-blue-400">{payload[0]?.value?.toFixed(0)} AED</p>
    </div>
  );
};

export default function AnalyticsPage() {
  const [expenses,  setExpenses]  = useState([]);
  const [tasks,     setTasks]     = useState([]);
  const [notes,     setNotes]     = useState([]);
  const [reminders, setReminders] = useState([]);
  const [range,     setRange]     = useState('7d');
  const [loading,   setLoading]   = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [exp, tsk, nte, rem] = await Promise.all([
        fetch(`${API}/items/type/expense`).then(r  => r.json()),
        fetch(`${API}/items/type/task`).then(r     => r.json()),
        fetch(`${API}/items/type/note`).then(r     => r.json()),
        fetch(`${API}/items/type/reminder`).then(r => r.json()),
      ]);
      setExpenses(exp);  setTasks(tsk);  setNotes(nte);  setReminders(rem);
    } catch {
      // Sample fallback
      setExpenses([
        { id: 1, title: '45 AED lunch',          subtitle: 'Food & Drinks • Today' },
        { id: 2, title: '120 AED transport',      subtitle: 'Transport • Yesterday' },
        { id: 3, title: '220 AED shopping',       subtitle: 'Shopping • 3 days ago' },
        { id: 4, title: '60 AED coffee',          subtitle: 'Food & Drinks • 4 days ago' },
        { id: 5, title: '515 AED groceries',      subtitle: 'Food & Drinks • 5 days ago' },
        { id: 6, title: '100 AED entertainment',  subtitle: 'Entertainment • 6 days ago' },
      ]);
      setTasks([
        { id: 1, title: 'Task A', subtitle: 'Task • Done' },
        { id: 2, title: 'Task B', subtitle: 'Task • Open' },
        { id: 3, title: 'Task C', subtitle: 'Task • Done' },
        { id: 4, title: 'Task D', subtitle: 'Task • Open' },
        { id: 5, title: 'Task E', subtitle: 'Task • Done' },
      ]);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── Spending trend (last 7 or 30 days) ────────────────────────────────────
  const days = range === '7d' ? 7 : 30;
  const trendData = Array.from({ length: days }, (_, i) => {
    const daysAgo = days - 1 - i;
    const d = new Date(); d.setDate(d.getDate() - daysAgo);
    const label = d.toLocaleDateString('en-GB', { weekday: days <= 7 ? 'short' : undefined, day: days > 7 ? 'numeric' : undefined });
    const total = expenses
      .filter(e => {
        // crude date matching — in a real app use proper date fields
        if (daysAgo === 0 && e.subtitle?.includes('Today')) return true;
        if (daysAgo === 1 && e.subtitle?.includes('Yesterday')) return true;
        if (e.subtitle?.includes(`${daysAgo} days ago`)) return true;
        return false;
      })
      .reduce((s, e) => s + parseAmount(e.title), 0);
    return { label, total };
  });

  // ── Category breakdown ─────────────────────────────────────────────────────
  const catData = CATEGORIES.map(c => ({
    name: c, value: expenses.filter(e => parseCat(e.subtitle) === c).reduce((s, e) => s + parseAmount(e.title), 0)
  })).filter(d => d.value > 0).sort((a, b) => b.value - a.value);

  const totalSpend   = expenses.reduce((s, e) => s + parseAmount(e.title), 0);
  const doneTasks    = tasks.filter(t => t.subtitle?.includes('Done')).length;
  const completionPct = tasks.length > 0 ? Math.round((doneTasks / tasks.length) * 100) : 0;
  const topCategory  = catData[0]?.name || '—';

  const pieData = [
    { name: 'Done', value: doneTasks },
    { name: 'Open', value: Math.max(0, tasks.length - doneTasks) },
  ];

  // Animated counters
  const animSpend  = useCountUp(Math.round(totalSpend), 900);
  const animPct    = useCountUp(completionPct, 700);
  const animNotes  = useCountUp(notes.length, 600);
  const animRem    = useCountUp(reminders.length, 600);
  const animDone   = useCountUp(doneTasks, 700);
  const animTotal  = useCountUp(tasks.length, 700);

  return (
    <div className="flex flex-col h-full bg-[#0b0c10] text-white">
      {/* Header */}
      <div className="px-5 pt-6 pb-3 shrink-0">
        <div className="flex items-center justify-between mb-1">
          <h1 className="text-2xl font-bold text-indigo-400 flex items-center gap-2">
            <BarChart2 className="w-6 h-6"/> /analytics
          </h1>
          <div className="flex gap-1 bg-[#14151b] rounded-xl p-1 border border-[#2a2b36]">
            {['7d', '30d'].map(r => (
              <button key={r} onClick={() => setRange(r)}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors ${range === r ? 'bg-indigo-500 text-white' : 'text-gray-500'}`}>
                {r}
              </button>
            ))}
          </div>
        </div>
        <p className="text-gray-500 text-sm">Insights across all workspaces</p>
      </div>

      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <svg className="animate-spin h-8 w-8 text-indigo-400" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
          </svg>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto scrollbar-hide px-5 space-y-5 pb-4">

          {/* Summary cards */}
          <div className="grid grid-cols-2 gap-3">
            {[
              { icon: Wallet,       bg: 'bg-blue-500',   label: 'Total Spent',    value: `${animSpend} AED`,          sub: `${expenses.length} transactions` },
              { icon: CheckCircle2, bg: 'bg-green-500',  label: 'Tasks Done',     value: `${animPct}%`,               sub: `${animDone} of ${animTotal}` },
              { icon: FileText,     bg: 'bg-purple-500', label: 'Notes',          value: animNotes,                   sub: 'total written' },
              { icon: Bell,         bg: 'bg-orange-500', label: 'Reminders',      value: animRem,                     sub: 'set' },
            ].map(({ icon: Icon, bg, label, value, sub }) => (
              <div key={label} className="bg-[#14151b] border border-[#2a2b36] rounded-2xl p-4">
                <div className={`w-9 h-9 rounded-xl ${bg} flex items-center justify-center mb-2`}>
                  <Icon className="w-5 h-5 text-white"/>
                </div>
                <p className="text-xl font-bold text-white">{value}</p>
                <p className="text-gray-400 text-[12px] mt-0.5">{label}</p>
                <p className="text-gray-600 text-[11px]">{sub}</p>
              </div>
            ))}
          </div>

          {/* Spending trend */}
          <div className="bg-[#14151b] border border-[#2a2b36] rounded-2xl p-4">
            <div className="flex justify-between items-center mb-4">
              <div>
                <p className="text-white font-semibold">Spending Trend</p>
                <p className="text-gray-500 text-xs">Last {days} days</p>
              </div>
              <div className="flex items-center gap-1 text-blue-400">
                <TrendingUp className="w-4 h-4"/>
                <span className="text-sm font-semibold">{totalSpend.toFixed(0)} AED</span>
              </div>
            </div>
            <ResponsiveContainer width="100%" height={120}>
              <LineChart data={trendData} margin={{ top: 5, right: 5, bottom: 0, left: -30 }}>
                <XAxis dataKey="label" tick={{ fill: '#6b7280', fontSize: 10 }} axisLine={false} tickLine={false}/>
                <YAxis tick={{ fill: '#6b7280', fontSize: 10 }} axisLine={false} tickLine={false}/>
                <Tooltip content={<CustomTooltip/>}/>
                <Line type="monotone" dataKey="total" stroke="#6366f1" strokeWidth={2.5} dot={{ fill: '#6366f1', r: 3 }} activeDot={{ r: 5 }}/>
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Category breakdown */}
          <div className="bg-[#14151b] border border-[#2a2b36] rounded-2xl p-4">
            <p className="text-white font-semibold mb-1">By Category</p>
            <p className="text-gray-500 text-xs mb-4">Top spend: <span className="text-white font-medium">{topCategory}</span></p>
            {catData.length === 0 ? (
              <p className="text-gray-600 text-sm text-center py-4">No expense data yet</p>
            ) : (
              <ResponsiveContainer width="100%" height={catData.length * 36 + 10}>
                <BarChart layout="vertical" data={catData} margin={{ top: 0, right: 30, bottom: 0, left: 0 }}>
                  <XAxis type="number" hide/>
                  <YAxis type="category" dataKey="name" tick={{ fill: '#9ca3af', fontSize: 11 }} axisLine={false} tickLine={false} width={110}/>
                  <Tooltip formatter={(v) => [`${v.toFixed(0)} AED`]} contentStyle={{ background: '#1a1b23', border: '1px solid #2a2b36', borderRadius: 12, fontSize: 12 }}/>
                  <Bar dataKey="value" radius={[0, 6, 6, 0]} barSize={16}>
                    {catData.map((d, i) => <Cell key={i} fill={CAT_COLORS[d.name] || '#6b7280'}/>)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Task completion */}
          <div className="bg-[#14151b] border border-[#2a2b36] rounded-2xl p-4 flex items-center gap-5">
            <div className="w-24 h-24 shrink-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={pieData.every(d => d.value === 0) ? [{ name: 'None', value: 1 }] : pieData}
                    dataKey="value" innerRadius={28} outerRadius={42} strokeWidth={0}>
                    <Cell fill="#22c55e"/>
                    <Cell fill="#1a1b23"/>
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div>
              <p className="text-3xl font-bold text-white">{completionPct}<span className="text-lg text-gray-400">%</span></p>
              <p className="text-gray-400 text-sm font-medium">Tasks completed</p>
              <p className="text-gray-600 text-xs mt-1">{doneTasks} done · {tasks.length - doneTasks} remaining</p>
              <div className="h-1.5 bg-[#2a2b36] rounded-full mt-2 w-32 overflow-hidden">
                <div className="h-full bg-green-500 rounded-full transition-all" style={{ width: `${completionPct}%` }}/>
              </div>
            </div>
          </div>

          {/* Top insight */}
          <div className="bg-gradient-to-r from-indigo-500/10 to-purple-500/10 border border-indigo-500/20 rounded-2xl p-4">
            <p className="text-indigo-400 text-xs font-semibold uppercase tracking-wider mb-1">💡 AI Insight</p>
            <p className="text-white font-medium text-sm">
              {catData[0]
                ? `${catData[0].name} is your biggest expense at ${catData[0].value.toFixed(0)} AED — ${Math.round(catData[0].value / Math.max(totalSpend, 1) * 100)}% of total spend.`
                : 'Start logging expenses to see your spending patterns.'}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
