import React, { useState, useEffect } from 'react';
import { X, Calendar, ChevronDown, Info } from 'lucide-react';

const API = import.meta.env.PROD ? 'https://brain.mabdc.com' : 'https://brain.mabdc.com';

const CATEGORIES = ['Food & Drinks', 'Transport', 'Shopping', 'Bills & Utilities', 'Entertainment', 'Health', 'Other'];
const ACCOUNTS   = ['Cash', 'Card', 'Bank Transfer', 'Credit Card'];
const PROJECTS   = ['Personal', 'Work', 'Travel', 'Side Project'];
const PRIORITIES = ['High', 'Medium', 'Low'];
const REPEATS    = ['None', 'Daily', 'Weekly', 'Monthly'];

// ─── AI Parsers ────────────────────────────────────────────────────────────────

function parseExpense(rest) {
  // e.g. "45 AED lunch at Carrefour" or "45 lunch Carrefour" or "45.50 groceries"
  const amtMatch = rest.match(/^(\d+(?:\.\d+)?)/);
  const amount   = amtMatch ? parseFloat(amtMatch[1]) : 0;
  let   remainder = rest.replace(/^\d+(?:\.\d+)?/, '').replace(/aed/i, '').trim();

  // Guess category from keywords
  const catMap = {
    'Food & Drinks': ['lunch','dinner','breakfast','cafe','coffee','food','restaurant','eat','carrefour','lulu','groceries','pizza','burger'],
    Transport:       ['uber','careem','taxi','metro','bus','fuel','petrol','flight','parking','transport'],
    Shopping:        ['amazon','noon','mall','shop','clothes','shoes','electronics'],
    'Bills & Utilities': ['bill','electricity','water','internet','phone','dewa','etisalat','du'],
    Entertainment:   ['cinema','movie','concert','netflix','spotify','game'],
    Health:          ['pharmacy','doctor','hospital','gym','medicine','clinic'],
  };
  let category = 'Other';
  const lower = remainder.toLowerCase();
  for (const [cat, words] of Object.entries(catMap)) {
    if (words.some(w => lower.includes(w))) { category = cat; break; }
  }

  // Try to extract merchant (last "at X" or "from X" pattern)
  const atMatch = remainder.match(/(?:at|from|@)\s+(.+)/i);
  const merchant = atMatch ? atMatch[1].trim() : (remainder.split(' ').slice(-1)[0] || 'Merchant');
  const notes    = atMatch ? remainder.replace(atMatch[0], '').trim() : '';

  const confidence = amount > 0 && merchant ? 92 : amount > 0 ? 74 : 55;
  return { amount, merchant, category, account: 'Cash', project: 'Personal', notes: notes || (lower.split(' ')[0]) || '', confidence };
}

function parseTask(rest) {
  const priorityWords = { high: 'High', urgent: 'High', important: 'High', medium: 'Medium', low: 'Low' };
  let priority = '';
  let title = rest;
  for (const [word, val] of Object.entries(priorityWords)) {
    if (rest.toLowerCase().includes(word)) { priority = val; title = rest.replace(new RegExp(word, 'i'), '').trim(); break; }
  }
  // Extract due date hints
  const dueMap = { today: 'Today', tomorrow: 'Tomorrow', 'next week': 'Next Week', friday: 'Fri', monday: 'Mon' };
  let due = '';
  for (const [word, val] of Object.entries(dueMap)) {
    if (rest.toLowerCase().includes(word)) { due = val; title = title.replace(new RegExp(word, 'i'), '').trim(); break; }
  }
  const confidence = title.length > 3 ? 88 : 65;
  return { title: title || rest, priority: priority || 'Medium', due: due || 'No due date', confidence };
}

function parseNote(rest) {
  const title = rest.split('\n')[0].slice(0, 60) || 'New Note';
  const body  = rest.slice(title.length).trim();
  return { title, body, confidence: title.length > 5 ? 95 : 70 };
}

function parseReminder(rest) {
  const timeMatch = rest.match(/(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)/i);
  const time = timeMatch ? timeMatch[1] : '';
  const dueMap = { today: 'Today', tomorrow: 'Tomorrow', daily: 'Daily', weekly: 'Weekly', 'every day': 'Daily' };
  let repeat = 'None';
  for (const [w, v] of Object.entries(dueMap)) { if (rest.toLowerCase().includes(w)) { repeat = v; break; } }
  let title = rest.replace(timeMatch?.[0] || '', '').replace(/today|tomorrow|daily|weekly|every day/gi, '').trim();
  return { title: title || rest, time: time || '09:00 AM', repeat, confidence: 85 };
}

// ─── Confidence Bar ─────────────────────────────────────────────────────────────

function ConfidenceBar({ value }) {
  const level = value >= 85 ? 'High' : value >= 65 ? 'Medium' : 'Low';
  const color  = value >= 85 ? '#22c55e' : value >= 65 ? '#f97316' : '#ef4444';
  return (
    <div className="mt-4 pt-4 border-t border-[#2a2b36]">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5 text-gray-400 text-sm">
          <Info className="w-4 h-4"/> AI confidence
        </div>
        <div className="flex items-center gap-1">
          <span className="font-bold text-sm" style={{ color }}>{level}</span>
          <span className="text-gray-400 text-sm">{value}%</span>
        </div>
      </div>
      <div className="h-1.5 bg-[#2a2b36] rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all duration-700" style={{ width: `${value}%`, backgroundColor: color }}/>
      </div>
    </div>
  );
}

// ─── Field Row ──────────────────────────────────────────────────────────────────

function Field({ label, value, options, onChange, editable }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="py-3 border-b border-[#2a2b36] last:border-0">
      <p className="text-gray-500 text-xs mb-1">{label}</p>
      {options ? (
        <div className="relative">
          <button onClick={() => setOpen(o => !o)} className="flex items-center justify-between w-full text-left">
            <span className="text-white text-[16px] font-medium">{value}</span>
            <ChevronDown className={`w-5 h-5 text-gray-500 transition-transform ${open ? 'rotate-180' : ''}`}/>
          </button>
          {open && (
            <div className="absolute left-0 right-0 top-8 bg-[#1a1b23] border border-[#2a2b36] rounded-xl z-10 overflow-hidden shadow-xl">
              {options.map(opt => (
                <button key={opt} onClick={() => { onChange(opt); setOpen(false); }}
                  className={`w-full text-left px-4 py-2.5 text-sm hover:bg-[#2a2b36] transition-colors ${opt === value ? 'text-indigo-400 font-semibold' : 'text-white'}`}>
                  {opt}
                </button>
              ))}
            </div>
          )}
        </div>
      ) : editable ? (
        <input value={value} onChange={e => onChange(e.target.value)}
          className="bg-transparent text-white text-[16px] font-medium outline-none border-b border-transparent focus:border-indigo-400 w-full transition-colors"/>
      ) : (
        <p className="text-white text-[16px] font-medium">{value}</p>
      )}
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────────

export default function CommandPreview({ command, onClose, onSaved }) {
  const [tab, setTab] = useState('PREVIEW');
  const [saving, setSaving] = useState(false);
  const [fields, setFields] = useState({});

  const type = command?.type || 'expense';
  const rest = command?.rest || '';
  const originalText = command?.text || '';

  useEffect(() => {
    if (type === 'expense')  setFields(parseExpense(rest));
    if (type === 'task')     setFields(parseTask(rest));
    if (type === 'note')     setFields(parseNote(rest));
    if (type === 'reminder') setFields(parseReminder(rest));
  }, [type, rest]);

  const set = (key) => (val) => setFields(f => ({ ...f, [key]: val }));

  const handleSave = async () => {
    setSaving(true);
    let title = '', subtitle = '';
    if (type === 'expense') {
      title    = `${parseFloat(fields.amount || 0).toFixed(2)} AED ${fields.merchant}`;
      subtitle = `${fields.category} • Today`;
    } else if (type === 'task') {
      title    = fields.title;
      subtitle = `Task • ${fields.due}`;
    } else if (type === 'note') {
      title    = fields.title;
      subtitle = `Note • Today`;
    } else if (type === 'reminder') {
      title    = fields.title;
      subtitle = `Reminder • ${fields.repeat !== 'None' ? fields.repeat : 'Tomorrow'}, ${fields.time}`;
    }
    try {
      const res = await fetch(`${API}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, title, subtitle }),
      });
      if (res.ok) { onSaved?.(); onClose?.(); }
    } catch {}
    setSaving(false);
  };

  const COLORS = { expense: '#3b82f6', task: '#22c55e', note: '#a855f7', reminder: '#f97316' };
  const accent = COLORS[type] || '#6366f1';

  return (
    <div className="absolute inset-0 z-[60] bg-[#0b0c10] flex flex-col">
      {/* Header */}
      <div className="px-6 pt-6 pb-4 shrink-0">
        <div className="flex items-start justify-between">
          <div className="flex-1 pr-4">
            <p className="text-gray-500 text-sm font-mono mb-1" style={{ color: accent }}>/{type}</p>
            <h2 className="text-white text-[22px] font-bold leading-snug">{rest || 'New ' + type}</h2>
          </div>
          <button onClick={onClose} className="bg-[#1a1b23] rounded-full p-2 text-gray-400 hover:text-white transition-colors shrink-0 mt-1">
            <X className="w-5 h-5"/>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex mt-5 bg-[#14151b] rounded-xl p-1">
          {['PREVIEW', 'DETAILS'].map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`flex-1 py-2.5 rounded-lg text-sm font-semibold tracking-wide transition-all ${tab === t ? 'bg-[#0b0c10] text-white shadow-sm' : 'text-gray-500'}`}>
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto scrollbar-hide px-6">
        <div className="bg-[#14151b] rounded-2xl p-5">
          {/* ── EXPENSE ── */}
          {type === 'expense' && (
            <>
              <div className="flex items-center justify-between mb-4 pb-4 border-b border-[#2a2b36]">
                <div>
                  <span className="text-5xl font-bold text-white">{parseFloat(fields.amount || 0).toFixed(2)}</span>
                  <span className="text-xl text-gray-400 font-semibold ml-2">AED</span>
                </div>
                <div className="flex items-center gap-2 bg-[#1a1b23] px-3 py-2 rounded-xl border border-[#2a2b36]">
                  <span className="text-white text-sm font-medium">Today</span>
                  <Calendar className="w-4 h-4 text-gray-400"/>
                </div>
              </div>
              {tab === 'PREVIEW' ? (
                <>
                  <Field label="Merchant" value={fields.merchant || ''} onChange={set('merchant')} editable/>
                  <Field label="Category" value={fields.category || 'Other'} options={CATEGORIES} onChange={set('category')}/>
                  <Field label="Account"  value={fields.account  || 'Cash'} options={ACCOUNTS}   onChange={set('account')}/>
                  <Field label="Project"  value={fields.project  || 'Personal'} options={PROJECTS} onChange={set('project')}/>
                  <Field label="Notes"    value={fields.notes    || ''} onChange={set('notes')} editable/>
                </>
              ) : (
                <div className="space-y-3">
                  <div className="flex gap-2">
                    <input type="number" value={fields.amount || ''} onChange={e => set('amount')(e.target.value)}
                      placeholder="Amount" className="flex-1 bg-[#1a1b23] border border-[#2a2b36] rounded-xl px-4 py-3 text-white outline-none focus:border-blue-500"/>
                    <input value={fields.merchant || ''} onChange={e => set('merchant')(e.target.value)}
                      placeholder="Merchant" className="flex-1 bg-[#1a1b23] border border-[#2a2b36] rounded-xl px-4 py-3 text-white outline-none focus:border-blue-500"/>
                  </div>
                  {CATEGORIES.map(c => (
                    <button key={c} onClick={() => set('category')(c)}
                      className={`w-full text-left px-4 py-2.5 rounded-xl text-sm border transition-colors ${fields.category === c ? 'border-blue-500 bg-blue-500/10 text-blue-400' : 'border-[#2a2b36] text-gray-400 hover:bg-[#1a1b23]'}`}>
                      {c}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}

          {/* ── TASK ── */}
          {type === 'task' && (
            <>
              {tab === 'PREVIEW' ? (
                <>
                  <Field label="Title"    value={fields.title    || ''} onChange={set('title')} editable/>
                  <Field label="Due Date" value={fields.due      || 'No due date'} onChange={set('due')} editable/>
                  <Field label="Priority" value={fields.priority || 'Medium'} options={PRIORITIES} onChange={set('priority')}/>
                </>
              ) : (
                <div className="space-y-3">
                  <input value={fields.title || ''} onChange={e => set('title')(e.target.value)}
                    placeholder="Task title" className="w-full bg-[#1a1b23] border border-[#2a2b36] rounded-xl px-4 py-3 text-white outline-none focus:border-green-500"/>
                  <input type="date" onChange={e => set('due')(e.target.value)}
                    className="w-full bg-[#1a1b23] border border-[#2a2b36] rounded-xl px-4 py-3 text-white outline-none focus:border-green-500"/>
                  <div className="flex gap-2">
                    {PRIORITIES.map(p => (
                      <button key={p} onClick={() => set('priority')(p)}
                        className={`flex-1 py-2 rounded-xl text-sm font-medium border transition-colors ${fields.priority === p ? 'border-green-500 bg-green-500/10 text-green-400' : 'border-[#2a2b36] text-gray-400'}`}>{p}</button>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {/* ── NOTE ── */}
          {type === 'note' && (
            <>
              {tab === 'PREVIEW' ? (
                <>
                  <Field label="Title" value={fields.title || ''} onChange={set('title')} editable/>
                  <Field label="Body"  value={fields.body  || ''} onChange={set('body')}  editable/>
                </>
              ) : (
                <div className="space-y-3">
                  <input value={fields.title || ''} onChange={e => set('title')(e.target.value)}
                    placeholder="Note title" className="w-full bg-[#1a1b23] border border-[#2a2b36] rounded-xl px-4 py-3 text-white outline-none focus:border-purple-500"/>
                  <textarea value={fields.body || ''} onChange={e => set('body')(e.target.value)} rows={4}
                    placeholder="Note body..." className="w-full bg-[#1a1b23] border border-[#2a2b36] rounded-xl px-4 py-3 text-white outline-none focus:border-purple-500 resize-none"/>
                </div>
              )}
            </>
          )}

          {/* ── REMINDER ── */}
          {type === 'reminder' && (
            <>
              {tab === 'PREVIEW' ? (
                <>
                  <Field label="Title"  value={fields.title  || ''} onChange={set('title')} editable/>
                  <Field label="Time"   value={fields.time   || '09:00 AM'} onChange={set('time')} editable/>
                  <Field label="Repeat" value={fields.repeat || 'None'} options={REPEATS} onChange={set('repeat')}/>
                </>
              ) : (
                <div className="space-y-3">
                  <input value={fields.title || ''} onChange={e => set('title')(e.target.value)}
                    placeholder="Reminder title" className="w-full bg-[#1a1b23] border border-[#2a2b36] rounded-xl px-4 py-3 text-white outline-none focus:border-orange-400"/>
                  <input type="time" onChange={e => set('time')(e.target.value)}
                    className="w-full bg-[#1a1b23] border border-[#2a2b36] rounded-xl px-4 py-3 text-white outline-none focus:border-orange-400"/>
                  {REPEATS.map(r => (
                    <button key={r} onClick={() => set('repeat')(r)}
                      className={`w-full text-left px-4 py-2.5 rounded-xl text-sm border transition-colors ${fields.repeat === r ? 'border-orange-400 bg-orange-400/10 text-orange-400' : 'border-[#2a2b36] text-gray-400'}`}>{r}</button>
                  ))}
                </div>
              )}
            </>
          )}

          <ConfidenceBar value={fields.confidence || 80}/>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="p-6 flex gap-3 shrink-0">
        <button onClick={() => setTab(tab === 'PREVIEW' ? 'DETAILS' : 'PREVIEW')}
          className="flex-1 py-4 rounded-2xl bg-[#1a1b23] border border-[#2a2b36] text-white font-semibold text-[16px] hover:bg-[#252632] transition-colors">
          {tab === 'PREVIEW' ? 'Edit' : 'Preview'}
        </button>
        <button onClick={handleSave} disabled={saving}
          className="flex-1 py-4 rounded-2xl font-semibold text-white text-[16px] transition-colors disabled:opacity-50"
          style={{ background: 'linear-gradient(135deg, #6366f1, #a855f7)' }}>
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  );
}
