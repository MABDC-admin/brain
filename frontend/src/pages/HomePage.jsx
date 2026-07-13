import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CheckCircle2, Bell, Wallet, FileText, Sparkles, ChevronRight,
  X, Send, TrendingUp, AlertTriangle, Zap, BarChart2, Calendar
} from 'lucide-react';
import CommandPreview from '../components/CommandPreview.jsx';

const API = import.meta.env.PROD ? 'https://brain.mabdc.com' : 'https://brain.mabdc.com';

function useClock() {
  const [time, setTime] = React.useState(new Date());
  React.useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return time;
}

const ICON_MAP = {
  task:     { icon: CheckCircle2, bg: 'bg-green-500',  to: '/tasks' },
  reminder: { icon: Bell,         bg: 'bg-orange-500', to: '/reminders' },
  expense:  { icon: Wallet,       bg: 'bg-blue-500',   to: '/expenses' },
  note:     { icon: FileText,     bg: 'bg-purple-500', to: '/notes' },
};

const COMMANDS = [
  { cmd: '/task',     color: 'text-green-400',  type: 'task',     hint: 'Add a task' },
  { cmd: '/expense',  color: 'text-blue-400',   type: 'expense',  hint: 'Log expense' },
  { cmd: '/note',     color: 'text-purple-400', type: 'note',     hint: 'Write a note' },
  { cmd: '/reminder', color: 'text-orange-400', type: 'reminder', hint: 'Set reminder' },
];

function parseCommand(text) {
  const lower = text.trim().toLowerCase();
  for (const cmd of COMMANDS) {
    if (lower.startsWith(cmd.cmd)) {
      return { ...cmd, rest: text.trim().slice(cmd.cmd.length).trim(), text: text.trim() };
    }
  }
  return null;
}

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

// ── Smart Widget cards ────────────────────────────────────────────────────────

function WidgetCard({ icon: Icon, iconBg, label, value, sub, color, onClick, alert }) {
  return (
    <button onClick={onClick}
      className="flex-1 min-w-0 bg-[#14151b] border border-[#2a2b36] rounded-2xl p-3.5 text-left hover:bg-[#1a1b23] transition-all active:scale-[0.97] relative overflow-hidden">
      {alert && <span className="absolute top-2 right-2 w-2 h-2 bg-red-500 rounded-full animate-pulse"/>}
      <div className={`w-9 h-9 rounded-xl ${iconBg} flex items-center justify-center mb-2`}>
        <Icon className="w-5 h-5 text-white"/>
      </div>
      <p className={`text-xl font-bold ${color || 'text-white'} leading-tight`}>{value}</p>
      <p className="text-gray-400 text-[11px] font-medium mt-0.5 truncate">{label}</p>
      {sub && <p className="text-gray-600 text-[10px] mt-0.5 truncate">{sub}</p>}
    </button>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function HomePage({ items, loadItems }) {
  const [selectedItem, setSelectedItem] = useState(null);
  const [cmd,          setCmd]          = useState('');
  const [preview,      setPreview]      = useState(null);
  const [toast,        setToast]        = useState(null);
  const [stats,        setStats]        = useState({ tasks: 0, reminders: 0, expenses: 0, totalSpend: 0, nextReminder: null });
  const navigate   = useNavigate();
  const inputRef   = useRef();
  const matched    = parseCommand(cmd);
  const name       = (() => { try { return JSON.parse(localStorage.getItem('profile_name')) || 'Ali'; } catch { return 'Ali'; } })();
  const budget     = (() => { try { return JSON.parse(localStorage.getItem('expense_budgets')) || {}; } catch { return {}; } })();
  const totalBudget = Object.values(budget).reduce((a, b) => a + Number(b), 0);
  const clock      = useClock();

  useEffect(() => {
    Promise.all([
      fetch(`${API}/items/type/task`).then(r => r.json()).catch(() => []),
      fetch(`${API}/items/type/reminder`).then(r => r.json()).catch(() => []),
      fetch(`${API}/items/type/expense`).then(r => r.json()).catch(() => []),
    ]).then(([tasks, reminders, expenses]) => {
      const openTasks = tasks.filter(t => !t.subtitle?.includes('Done'));
      const totalSpend = expenses.reduce((s, e) => {
        const m = e.title?.match(/^(\d+(?:\.\d+)?)/);
        return s + (m ? parseFloat(m[1]) : 0);
      }, 0);
      const nextReminder = reminders[0]?.title || null;
      setStats({ tasks: openTasks.length, reminders: reminders.length, expenses: expenses.length, totalSpend, nextReminder });
    });
  }, [items]);

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(null), 2500); };

  const handleSubmit = () => {
    if (!cmd.trim()) return;
    if (matched) { setPreview(matched); setCmd(''); }
    else { navigate(`/search?q=${encodeURIComponent(cmd)}`); setCmd(''); }
  };

  const budgetPct = totalBudget > 0 ? Math.min(100, Math.round((stats.totalSpend / totalBudget) * 100)) : null;
  const budgetAlert = budgetPct !== null && budgetPct >= 90;

  return (
    <div className="p-5 flex flex-col h-full relative">
      {/* Toast */}
      {toast && (
        <div className="absolute top-3 left-4 right-4 z-50 bg-[#1a1b23] border border-[#2a2b36] text-white text-sm font-medium px-4 py-3 rounded-2xl shadow-xl text-center toast-enter">
          {toast}
        </div>
      )}

      {/* Header */}
      <div className="flex justify-between items-center mb-1">
        <div>
          <p className="text-gray-400 text-sm font-medium">{greeting()},</p>
          <h1 className="text-2xl font-bold text-white leading-tight">{name} 👋</h1>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => navigate('/chat')}
            className="bg-gradient-to-br from-indigo-500 to-purple-600 p-2 rounded-2xl shadow-lg shadow-indigo-500/30 hover:opacity-90 transition-opacity">
            <Sparkles className="w-5 h-5 text-white"/>
          </button>
          <div className="bg-[#14151b] border border-[#2a2b36] px-3 py-1.5 rounded-2xl text-right">
            <p className="text-white text-[15px] font-bold leading-tight tabular-nums">
              {clock.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
            </p>
            <p className="text-gray-600 text-[10px] leading-tight">
              {clock.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}
            </p>
          </div>
        </div>
      </div>

      {/* ── Smart Widgets ── */}
      <div className="mt-4 mb-4">
        {/* Global Timeline Button */}
        <button onClick={() => navigate('/timeline')}
          className="w-full bg-gradient-to-r from-indigo-500/20 to-purple-500/20 border border-indigo-500/30 rounded-2xl p-4 flex items-center justify-between hover:bg-indigo-500/30 transition-colors group mb-4">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-full bg-indigo-500/20 flex items-center justify-center">
              <Calendar className="w-5 h-5 text-indigo-400" />
            </div>
            <div className="text-left">
              <h3 className="font-bold text-white text-sm">Life Timeline</h3>
              <p className="text-[10px] text-indigo-200 mt-0.5">View your chronological history</p>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-indigo-400 group-hover:translate-x-1 transition-transform" />
        </button>

        <div className="flex justify-between items-center mb-2">
          <p className="text-xs text-gray-500 font-semibold uppercase tracking-wider">Today at a glance</p>
          <button onClick={() => navigate('/analytics')}
            className="flex items-center gap-1 text-indigo-400 text-xs font-semibold hover:text-indigo-300 transition-colors">
            <BarChart2 className="w-3.5 h-3.5"/> Analytics
          </button>
        </div>
        <div className="flex gap-2">
          <WidgetCard
            icon={CheckCircle2} iconBg="bg-green-500"
            label="Open tasks" value={stats.tasks}
            sub={stats.tasks === 0 ? 'All done! 🎉' : 'tap to view'}
            color={stats.tasks > 0 ? 'text-green-400' : 'text-gray-400'}
            onClick={() => navigate('/tasks')}
          />
          <WidgetCard
            icon={Bell} iconBg="bg-orange-500"
            label="Reminders" value={stats.reminders}
            sub={stats.nextReminder || 'none set'}
            color="text-orange-400"
            onClick={() => navigate('/reminders')}
          />
          <WidgetCard
            icon={Wallet} iconBg={budgetAlert ? 'bg-red-500' : 'bg-blue-500'}
            label="This month"
            value={`${stats.totalSpend.toFixed(0)}`}
            sub={budgetPct !== null ? `${budgetPct}% of budget` : 'no budget set'}
            color={budgetAlert ? 'text-red-400' : 'text-blue-400'}
            alert={budgetAlert}
            onClick={() => navigate('/expenses')}
          />
        </div>

        {/* Budget progress bar */}
        {budgetPct !== null && (
          <div className="mt-2 bg-[#14151b] border border-[#2a2b36] rounded-xl px-4 py-2.5">
            <div className="flex justify-between items-center mb-1.5">
              <div className="flex items-center gap-1.5">
                {budgetAlert ? <AlertTriangle className="w-3.5 h-3.5 text-red-400"/> : <TrendingUp className="w-3.5 h-3.5 text-blue-400"/>}
                <span className="text-xs text-gray-400 font-medium">Monthly Budget</span>
              </div>
              <span className={`text-xs font-bold ${budgetAlert ? 'text-red-400' : 'text-white'}`}>
                {stats.totalSpend.toFixed(0)} / {totalBudget} AED
              </span>
            </div>
            <div className="h-1.5 bg-[#2a2b36] rounded-full overflow-hidden">
              <div className="h-full rounded-full transition-all duration-700"
                style={{ width: `${budgetPct}%`, backgroundColor: budgetAlert ? '#ef4444' : budgetPct > 70 ? '#f97316' : '#3b82f6' }}/>
            </div>
          </div>
        )}
      </div>

      {/* Command autocomplete */}
      {cmd && !matched && (
        <div className="bg-[#14151b] border border-[#2a2b36] rounded-2xl mb-3 overflow-hidden">
          {COMMANDS.filter(c => c.cmd.startsWith(cmd.toLowerCase().split(' ')[0])).slice(0, 4).map((c, i) => (
            <button key={i} onClick={() => { setCmd(c.cmd + ' '); inputRef.current?.focus(); }}
              className="w-full px-4 py-3 text-left hover:bg-[#1a1b23] transition-colors border-b border-[#2a2b36] last:border-0 flex items-center gap-3">
              <span className={`font-bold text-sm font-mono ${c.color}`}>{c.cmd}</span>
              <span className="text-gray-500 text-sm">{c.hint}</span>
            </button>
          ))}
        </div>
      )}
      {matched && (
        <div className="bg-[#14151b] border border-[#2a2b36] rounded-2xl mb-3 px-4 py-3 flex items-center gap-3">
          <Zap className="w-4 h-4 text-indigo-400 shrink-0"/>
          <span className={`font-bold text-sm font-mono ${matched.color}`}>{matched.cmd}</span>
          {matched.rest && <span className="text-white text-sm truncate">"{matched.rest}"</span>}
          <span className="ml-auto text-gray-600 text-xs shrink-0">↵ preview</span>
        </div>
      )}

      {/* Recent */}
      <div className="flex justify-between items-center mb-2">
        <p className="text-xs text-gray-500 font-semibold uppercase tracking-wider">Recent</p>
        <button onClick={() => navigate('/search')} className="text-indigo-400 text-xs font-medium hover:text-indigo-300">See all →</button>
      </div>

      <div className="flex-1 overflow-y-auto space-y-2.5 scrollbar-hide">
        {items.length === 0 && (
          <div className="text-center py-10 text-gray-600">
            <p className="text-4xl mb-3">✨</p>
            <p className="font-medium text-gray-500">Type a command below</p>
            <p className="text-gray-700 text-sm mt-1">e.g. /expense 45 lunch at Carrefour</p>
          </div>
        )}
        {items.slice(0, 7).map((item, idx) => {
          const cfg  = ICON_MAP[item.type] || ICON_MAP.note;
          const Icon = cfg.icon;
          return (
            <div key={idx} onClick={() => setSelectedItem(item)}
              className="bg-[#14151b] rounded-2xl p-3.5 flex items-center justify-between cursor-pointer hover:bg-[#1a1b23] transition-all active:scale-[0.98]">
              <div className="flex items-center space-x-3 min-w-0">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${cfg.bg} shrink-0`}>
                  <Icon className="text-white w-5 h-5"/>
                </div>
                <div className="min-w-0">
                  <div className="font-semibold text-white text-[14px] truncate">{item.title}</div>
                  <div className="text-[12px] text-gray-500 truncate">{item.subtitle}</div>
                  {item.expiry_date && (
                    <span className="bg-red-500/20 text-red-400 text-[9px] px-1.5 py-0.5 rounded-full font-semibold border border-red-500/20 mt-0.5 inline-block">
                      Expires: {item.expiry_date}
                    </span>
                  )}
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-gray-600 shrink-0 ml-2"/>
            </div>
          );
        })}
      </div>

      {/* Command Bar */}
      <div className="mt-3 shrink-0">
        <div className="rounded-[24px] p-[1.5px]"
          style={{ background: matched ? 'linear-gradient(135deg,#22c55e,#6366f1)' : 'linear-gradient(135deg,#a855f7,#3b82f6)' }}>
          <div className="flex items-center px-4 py-3 bg-[#111218] rounded-[23px] gap-2">
            <span className="text-indigo-400 text-lg font-mono shrink-0">/</span>
            <input ref={inputRef} type="text" value={cmd}
              onChange={e => setCmd(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSubmit()}
              placeholder="expense 45 lunch  |  task call…  |  note…"
              className="bg-transparent border-none outline-none flex-1 text-white placeholder-gray-600 text-[14px] min-w-0"/>
            {cmd && <button onClick={() => setCmd('')} className="text-gray-500 hover:text-white shrink-0"><X className="w-4 h-4"/></button>}
            <button onClick={handleSubmit} disabled={!cmd.trim()}
              className={`p-1.5 rounded-xl transition-all shrink-0 ${cmd.trim() ? 'bg-indigo-500 hover:bg-indigo-400 text-white' : 'text-gray-600'}`}>
              <Send className="w-4 h-4"/>
            </button>
          </div>
        </div>
        {!cmd && (
          <div className="flex gap-2 mt-2 overflow-x-auto scrollbar-hide pb-1">
            {COMMANDS.map((c, i) => (
              <button key={i} onClick={() => { setCmd(c.cmd + ' '); setTimeout(() => inputRef.current?.focus(), 50); }}
                className={`shrink-0 text-xs px-3 py-1.5 rounded-full border border-[#2a2b36] ${c.color} hover:bg-[#1a1b23] transition-colors font-medium`}>
                {c.cmd}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Item Detail Modal */}
      {selectedItem && (
        <div className="absolute inset-0 z-50 bg-black/70 flex items-end justify-center p-4 backdrop-blur-sm" onClick={() => setSelectedItem(null)}>
          <div className="bg-[#1a1b23] rounded-3xl w-full p-6 border border-[#2a2b36] max-h-[80%] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-start mb-4">
              <div className="flex-1 pr-4">
                <h3 className="text-xl font-bold text-white">{selectedItem.title}</h3>
                <p className="text-gray-400 text-sm mt-0.5">{selectedItem.subtitle}</p>
                {selectedItem.expiry_date && (
                  <span className="bg-red-500/20 text-red-400 text-[10px] px-2 py-0.5 rounded-full border border-red-500/30 font-semibold mt-1 inline-block">
                    Expires: {selectedItem.expiry_date}
                  </span>
                )}
              </div>
              <button onClick={() => setSelectedItem(null)} className="text-gray-400 hover:text-white shrink-0"><X className="w-6 h-6"/></button>
            </div>
            <div className="overflow-y-auto scrollbar-hide">
              {selectedItem.image_url
                ? <div className="rounded-xl overflow-hidden border border-[#2a2b36]"><img src={selectedItem.image_url} alt="" className="w-full h-auto object-contain"/></div>
                : <div className="p-8 rounded-xl bg-black/30 border border-[#2a2b36] text-gray-500 text-center text-sm">No image attached</div>
              }
            </div>
            <button onClick={() => { navigate(ICON_MAP[selectedItem.type]?.to || '/'); setSelectedItem(null); }}
              className="mt-4 py-3 rounded-xl bg-indigo-500 hover:bg-indigo-400 text-white font-semibold transition-colors text-center">
              Open in {selectedItem.type} workspace →
            </button>
          </div>
        </div>
      )}

      {/* Command Preview */}
      {preview && (
        <CommandPreview command={preview} onClose={() => setPreview(null)}
          onSaved={() => { loadItems?.(); showToast(`✅ ${preview.type.charAt(0).toUpperCase() + preview.type.slice(1)} saved!`); }}/>
      )}
    </div>
  );
}
