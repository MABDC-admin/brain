import React, { useState, useEffect, useCallback } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';
import { MoreVertical, LayoutGrid, List, Grid2x2, Wallet, X, Target, AlertTriangle, Check, RefreshCw } from 'lucide-react';
import SwipeableRow from '../components/SwipeableRow.jsx';

const API = import.meta.env.PROD ? 'https://brain.mabdc.com' : 'https://brain.mabdc.com';
const CATEGORIES = ['Food & Drinks', 'Transport', 'Shopping', 'Bills & Utilities', 'Entertainment', 'Health', 'Other'];
const CAT_COLORS = { 'Food & Drinks': '#3b82f6', Transport: '#22c55e', Shopping: '#f97316', 'Bills & Utilities': '#a855f7', Entertainment: '#ec4899', Health: '#14b8a6', Other: '#9ca3af' };
const CAT_ICONS  = { 'Food & Drinks': '🍽️', Transport: '🚌', Shopping: '🛍️', 'Bills & Utilities': '⚡', Entertainment: '🎬', Health: '💊', Other: '···' };

const getLS = (k, def) => { try { return JSON.parse(localStorage.getItem(k)) ?? def; } catch { return def; } };
const setLS = (k, v)   => localStorage.setItem(k, JSON.stringify(v));

function Modal({ title, onClose, children }) {
  return (
    <div className="absolute inset-0 z-50 bg-black/60 flex items-end justify-center" onClick={onClose}>
      <div className="bg-[#0f1015] rounded-t-3xl w-full p-6 shadow-2xl border border-[#2a2b36]" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-bold text-white">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white"><X className="w-5 h-5"/></button>
        </div>
        {children}
      </div>
    </div>
  );
}

export default function ExpensePage({ loadItems, workspace }) {
  const [expenses,   setExpenses]   = useState([]);
  const [showAdd,    setShowAdd]    = useState(false);
  const [showBudget, setShowBudget] = useState(false);
  const [activeTab,  setActiveTab]  = useState('Overview');
  const [form,       setForm]       = useState({ amount: '', merchant: '', category: 'Food & Drinks', notes: '', recurring: '' });
  const [budgets,    setBudgets]    = useState(() => getLS('expense_budgets', {}));
  const [budgetForm, setBudgetForm] = useState({});
  const [saving,     setSaving]     = useState(false);

  const load = useCallback(() => {
    fetch(`${API}/items/type/expense?workspace=${encodeURIComponent(workspace || 'Personal')}`)
      .then(r => r.json())
      .then(setExpenses)
      .catch(() => setExpenses([]));
  }, [workspace]);

  useEffect(() => { load(); }, [load, workspace]);

  const parseAmount   = (title) => { const m = title?.match(/^(\d+(?:\.\d+)?)/); return m ? parseFloat(m[1]) : 0; };
  const parseCategory = (sub)   => CATEGORIES.find(c => sub?.includes(c)) || 'Other';

  const totals = {};
  CATEGORIES.forEach(c => { totals[c] = 0; });
  expenses.forEach(e => { const cat = parseCategory(e.subtitle); totals[cat] = (totals[cat] || 0) + parseAmount(e.title); });
  const total     = Object.values(totals).reduce((a, b) => a + b, 0);
  const chartData = CATEGORIES.map(c => ({ name: c, value: totals[c] || 0 })).filter(d => d.value > 0);

  const deleteExpense = async (id, e) => {
    e.stopPropagation();
    try { await fetch(`${API}/items/${id}`, { method: 'DELETE' }); } catch {}
    setExpenses(p => p.filter(x => x.id !== id));
  };

  const addExpense = async () => {
    if (!form.amount || !form.merchant) return;
    setSaving(true);
    // Close immediately
    setShowAdd(false);
    setForm({ amount: '', merchant: '', category: 'Food & Drinks', notes: '', recurring: '' });
    const title    = `${parseFloat(form.amount).toFixed(2)} AED ${form.merchant}`;
    const recurTag = form.recurring ? ` [Recurring: ${form.recurring}]` : '';
    const subtitle = `${form.category} • Today${recurTag}`;
    try {
      await fetch(`${API}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'expense', title, subtitle, workspace: workspace || 'Personal' }),
      });
    } catch {}
    load();
    if (loadItems) loadItems();
    setSaving(false);
  };

  const saveBudgets = () => {
    const merged = { ...budgets };
    Object.entries(budgetForm).forEach(([k, v]) => { if (v) merged[k] = parseFloat(v); });
    setBudgets(merged);
    setLS('expense_budgets', merged);
    setShowBudget(false);
  };

  const totalBudget = Object.values(budgets).reduce((a, b) => a + Number(b), 0);
  const overallPct  = totalBudget > 0 ? Math.min(100, Math.round((total / totalBudget) * 100)) : null;

  return (
    <div className="flex flex-col h-full bg-[#0b0c10] text-white relative">
      <div className="p-5 pb-0 shrink-0">
        <div className="flex justify-between items-center mb-4">
          <h1 className="text-2xl font-bold text-blue-400">/expense</h1>
          <div className="flex gap-3">
            <button onClick={() => { setBudgetForm({}); setShowBudget(true); }} title="Set budgets">
              <Target className="w-6 h-6 text-gray-400 hover:text-white transition-colors"/>
            </button>
            <MoreVertical className="w-6 h-6 text-gray-400"/>
          </div>
        </div>

        {/* Overall budget bar */}
        {overallPct !== null && (
          <div className="bg-[#14151b] border border-[#2a2b36] rounded-xl px-4 py-3 mb-4">
            <div className="flex justify-between items-center mb-2">
              <div className="flex items-center gap-1.5">
                {overallPct >= 90 ? <AlertTriangle className="w-4 h-4 text-red-400"/> : <Target className="w-4 h-4 text-blue-400"/>}
                <span className="text-sm text-gray-300 font-medium">Monthly Budget</span>
              </div>
              <span className={`text-sm font-bold ${overallPct >= 90 ? 'text-red-400' : overallPct >= 70 ? 'text-orange-400' : 'text-white'}`}>
                {total.toFixed(0)} / {totalBudget} AED · {overallPct}%
              </span>
            </div>
            <div className="h-2 bg-[#2a2b36] rounded-full overflow-hidden">
              <div className="h-full rounded-full transition-all duration-700"
                style={{ width: `${overallPct}%`, backgroundColor: overallPct >= 90 ? '#ef4444' : overallPct >= 70 ? '#f97316' : '#3b82f6' }}/>
            </div>
          </div>
        )}

        <div className="bg-[#14151b] rounded-xl px-4 py-3 flex items-center justify-between mb-4 cursor-pointer border border-[#2a2b36]">
          <span className="font-medium text-gray-300">This Month ▾</span>
        </div>
      </div>

      {activeTab === 'Overview' ? (
        <>
          <div className="flex items-center justify-between px-5 mb-4">
            <div>
              <p className="text-4xl font-bold text-white">{total.toFixed(0)} <span className="text-xl text-gray-400 font-semibold">AED</span></p>
              <p className="text-sm text-gray-500 mt-0.5">Total expenses</p>
            </div>
            <div className="w-28 h-28">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={chartData.length ? chartData : [{ name: 'None', value: 1 }]} dataKey="value" innerRadius={30} outerRadius={50} strokeWidth={0}>
                    {(chartData.length ? chartData : [{ name: 'None', value: 1 }]).map((d, i) => (
                      <Cell key={i} fill={CAT_COLORS[d.name] || '#1a1b23'}/>
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto scrollbar-hide px-5">
            {CATEGORIES.map((c, i) => {
              const amt    = totals[c] || 0;
              const pct    = total > 0 ? Math.round((amt / total) * 100) : 0;
              const bdg    = budgets[c] ? Number(budgets[c]) : null;
              const bdgPct = bdg ? Math.min(100, Math.round((amt / bdg) * 100)) : null;
              const over   = bdg && amt > bdg;
              return (
                <div key={i} className="mb-3">
                  <div className="flex items-center py-2">
                    <div className="w-10 h-10 rounded-full flex items-center justify-center text-lg mr-4 shrink-0"
                      style={{ backgroundColor: (CAT_COLORS[c] || '#9ca3af') + '22' }}>
                      <span style={{ color: CAT_COLORS[c] }}>{CAT_ICONS[c]}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-[14px] font-medium text-white">{c}</span>
                        <div className="flex items-center gap-2">
                          {over && <AlertTriangle className="w-3.5 h-3.5 text-red-400"/>}
                          <span className={`text-[14px] font-semibold ${over ? 'text-red-400' : 'text-white'}`}>{amt.toFixed(0)} AED</span>
                          <span className="text-[12px] text-gray-500">{pct}%</span>
                        </div>
                      </div>
                      {bdgPct !== null && (
                        <div className="h-1 bg-[#2a2b36] rounded-full overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${bdgPct}%`, backgroundColor: over ? '#ef4444' : CAT_COLORS[c] }}/>
                        </div>
                      )}
                    </div>
                  </div>
                  {bdg && <p className="text-[10px] text-gray-600 ml-14">{amt.toFixed(0)} / {bdg} AED budget{over ? ' — OVER BUDGET!' : ''}</p>}
                </div>
              );
            })}
          </div>
        </>
      ) : (
        <div className="flex-1 overflow-y-auto scrollbar-hide px-5">
          {expenses.map((e) => (
            <SwipeableRow key={e.id} onDelete={() => deleteExpense(e.id, { stopPropagation: () => {} })}>
              <div className="flex items-center py-3 border-b border-[#1a1b23] bg-[#0b0c10]">
                <div className="w-10 h-10 rounded-full flex items-center justify-center text-lg mr-4 shrink-0"
                  style={{ backgroundColor: (CAT_COLORS[parseCategory(e.subtitle)] || '#9ca3af') + '22' }}>
                  <span style={{ color: CAT_COLORS[parseCategory(e.subtitle)] }}>{CAT_ICONS[parseCategory(e.subtitle)]}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[14px] font-medium text-white truncate">{e.title}</p>
                  <p className="text-gray-500 text-[12px]">{e.subtitle?.split('[')[0].trim()}</p>
                </div>
                <div className="flex items-center gap-2 pr-2">
                  {e.subtitle?.includes('[Recurring:') && (
                    <span className="flex items-center gap-1 text-[10px] text-blue-400 bg-blue-500/10 border border-blue-500/20 px-2 py-0.5 rounded-full font-semibold shrink-0">
                      <RefreshCw className="w-2.5 h-2.5"/> {e.subtitle.match(/\[Recurring: (\w+)\]/)?.[1]}
                    </span>
                  )}
                  <span className="text-[14px] font-bold text-white">{parseAmount(e.title).toFixed(0)} AED</span>
                </div>
              </div>
            </SwipeableRow>
          ))}
        </div>
      )}

      <div className="p-5 pt-3 shrink-0">
        <button onClick={() => setShowAdd(true)} className="w-full py-4 rounded-full bg-blue-500 hover:bg-blue-400 transition-colors font-semibold text-white flex items-center justify-center gap-2">
          + Add Expense
        </button>
        <div className="flex justify-around mt-4">
          {[{ icon: LayoutGrid, label: 'Overview' }, { icon: List, label: 'List' }, { icon: Grid2x2, label: 'Categories' }, { icon: Wallet, label: 'Accounts' }].map(({ icon: Icon, label }, i) => (
            <button key={i} onClick={() => setActiveTab(label)} className={`flex flex-col items-center text-[11px] ${activeTab === label ? 'text-blue-400' : 'text-gray-500'}`}>
              <Icon className="w-6 h-6 mb-0.5"/>{label}
            </button>
          ))}
        </div>
      </div>

      {/* Add Expense Modal */}
      {showAdd && (
        <Modal title="Add Expense" onClose={() => setShowAdd(false)}>
          <div className="space-y-4">
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="text-xs text-gray-400 font-medium mb-1 block">Amount (AED)</label>
                <input type="number" value={form.amount} onChange={e => setForm(p => ({ ...p, amount: e.target.value }))}
                  placeholder="0.00" className="w-full bg-[#1a1b23] border border-[#2a2b36] rounded-xl px-4 py-3 text-white outline-none focus:border-blue-500" autoFocus/>
              </div>
              <div className="flex-1">
                <label className="text-xs text-gray-400 font-medium mb-1 block">Merchant</label>
                <input value={form.merchant} onChange={e => setForm(p => ({ ...p, merchant: e.target.value }))}
                  placeholder="e.g. Carrefour" className="w-full bg-[#1a1b23] border border-[#2a2b36] rounded-xl px-4 py-3 text-white outline-none focus:border-blue-500"/>
              </div>
            </div>
            <div>
              <label className="text-xs text-gray-400 font-medium mb-1 block">Category</label>
              <div className="flex flex-wrap gap-2">
                {CATEGORIES.map(c => (
                  <button key={c} onClick={() => setForm(p => ({ ...p, category: c }))}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${form.category === c ? 'border-blue-500 bg-blue-500/10 text-blue-400' : 'border-[#2a2b36] text-gray-400'}`}>{c}</button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-xs text-gray-400 font-medium mb-2 block">Recurring</label>
              <div className="flex gap-2">
                {['', 'Daily', 'Weekly', 'Monthly'].map(r => (
                  <button key={r || 'none'} onClick={() => setForm(p => ({ ...p, recurring: r }))}
                    className={`flex-1 py-2 rounded-xl text-xs font-medium border transition-colors ${form.recurring === r ? 'border-blue-500 bg-blue-500/10 text-blue-400' : 'border-[#2a2b36] text-gray-500'}`}>
                    {r || 'None'}
                  </button>
                ))}
              </div>
            </div>
            <button onClick={addExpense} disabled={saving || !form.amount || !form.merchant}
              className="w-full py-3 rounded-xl bg-blue-500 hover:bg-blue-400 disabled:opacity-40 text-white font-semibold">
              {saving ? 'Saving…' : 'Save Expense'}
            </button>
          </div>
        </Modal>
      )}

      {/* Budget Setup Modal */}
      {showBudget && (
        <Modal title="Set Monthly Budgets" onClose={() => setShowBudget(false)}>
          <div className="space-y-3 max-h-[60vh] overflow-y-auto scrollbar-hide pr-1">
            <p className="text-gray-500 text-xs">Set a spending limit per category. Leave blank to skip.</p>
            {CATEGORIES.map(c => (
              <div key={c} className="flex items-center gap-3">
                <span className="text-xl w-8">{CAT_ICONS[c]}</span>
                <div className="flex-1">
                  <p className="text-white text-sm font-medium">{c}</p>
                  {budgets[c] && <p className="text-gray-600 text-[10px]">Current: {budgets[c]} AED</p>}
                </div>
                <input
                  type="number"
                  value={budgetForm[c] ?? (budgets[c] || '')}
                  onChange={e => setBudgetForm(f => ({ ...f, [c]: e.target.value }))}
                  placeholder="AED"
                  className="w-24 bg-[#1a1b23] border border-[#2a2b36] rounded-xl px-3 py-2 text-white outline-none focus:border-blue-500 text-sm text-right"/>
              </div>
            ))}
          </div>
          <button onClick={saveBudgets}
            className="mt-4 w-full py-3 rounded-xl bg-blue-500 hover:bg-blue-400 text-white font-semibold flex items-center justify-center gap-2">
            <Check className="w-4 h-4"/> Save Budgets
          </button>
        </Modal>
      )}
    </div>
  );
}
