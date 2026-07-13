import React, { useEffect, useMemo, useState } from 'react';
import { Bell, Power, RotateCcw, Save, SlidersHorizontal, Tag, Workflow } from 'lucide-react';
import { DEFAULT_RULES, applyRules, getExpiryReminderDraft } from '../modules/rules.js';

const STORAGE_KEY = 'commandbrain_rules';

function loadRules() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    if (!Array.isArray(stored)) return DEFAULT_RULES;
    return DEFAULT_RULES.map(rule => ({ ...rule, ...(stored.find(item => item.id === rule.id) || {}) }));
  } catch {
    return DEFAULT_RULES;
  }
}

function ruleIcon(kind) {
  if (kind === 'tag-expense-over') return Tag;
  if (kind === 'auto-create-expiry-reminder') return Bell;
  return SlidersHorizontal;
}

export default function AutomationPage() {
  const [rules, setRules] = useState(loadRules);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(rules));
  }, [rules]);

  const previewItem = useMemo(() => applyRules({
    type: 'expense',
    title: '1250 AED Equipment',
    subtitle: 'Business expense',
  }, rules), [rules]);
  const expiryPreview = useMemo(() => getExpiryReminderDraft({
    title: 'Passport',
    subtitle: 'Document - Expires 2026-08-01',
    workspace: 'Personal',
  }, rules), [rules]);

  const updateRule = (id, updates) => {
    setSaved(false);
    setRules(current => current.map(rule => rule.id === id ? { ...rule, ...updates } : rule));
  };

  const resetRules = () => {
    setRules(DEFAULT_RULES);
    setSaved(false);
  };

  return (
    <div className="flex h-full flex-col bg-[#f8fafc] text-slate-950">
      <div className="shrink-0 px-5 pt-6 pb-3">
        <div className="mb-5 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">/automation</h1>
            <p className="mt-1 text-xs font-medium text-slate-500">Local rules stored on this device</p>
          </div>
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-900 text-white">
            <Workflow className="h-5 w-5" />
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Rule preview</p>
          <p className="mt-2 text-sm font-semibold text-slate-800">{previewItem.title}</p>
          <p className="mt-1 text-xs text-slate-500">Tags: {previewItem.tags || 'none'}</p>
          <p className="mt-1 text-xs text-slate-500">Expiry action: {expiryPreview ? expiryPreview.title : 'none'}</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-5 pb-4 scrollbar-hide">
        <div className="space-y-3">
          {rules.map(rule => {
            const Icon = ruleIcon(rule.kind);
            return (
              <div key={rule.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="mb-4 flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-700">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-slate-900">{rule.label}</p>
                    <p className="mt-1 text-xs text-slate-500">{rule.kind}</p>
                  </div>
                  <button
                    onClick={() => updateRule(rule.id, { enabled: !rule.enabled })}
                    className={`flex h-9 w-16 items-center rounded-full p-1 transition-colors ${rule.enabled ? 'bg-emerald-500' : 'bg-slate-200'}`}
                    aria-label={`${rule.enabled ? 'Disable' : 'Enable'} ${rule.label}`}
                  >
                    <span className={`flex h-7 w-7 items-center justify-center rounded-full bg-white shadow transition-transform ${rule.enabled ? 'translate-x-7 text-emerald-600' : 'translate-x-0 text-slate-400'}`}>
                      <Power className="h-3.5 w-3.5" />
                    </span>
                  </button>
                </div>

                {rule.kind === 'tag-expense-over' && (
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      value={rule.amount}
                      onChange={event => updateRule(rule.id, { amount: event.target.value })}
                      inputMode="decimal"
                      className="rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-500"
                      aria-label="Expense threshold"
                    />
                    <input
                      value={rule.tag}
                      onChange={event => updateRule(rule.id, { tag: event.target.value })}
                      className="rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-500"
                      aria-label="Expense tag"
                    />
                  </div>
                )}

                {rule.kind === 'pin-note-keywords' && (
                  <input
                    value={rule.keywords}
                    onChange={event => updateRule(rule.id, { keywords: event.target.value })}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-500"
                    aria-label="Pinned note keywords"
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid shrink-0 grid-cols-2 gap-3 px-5 pb-5 pt-2">
        <button onClick={resetRules} className="flex items-center justify-center gap-2 rounded-full border border-slate-200 bg-white py-4 font-bold text-slate-600">
          <RotateCcw className="h-4 w-4" />
          Reset
        </button>
        <button onClick={() => setSaved(true)} className="flex items-center justify-center gap-2 rounded-full bg-slate-900 py-4 font-bold text-white">
          <Save className="h-4 w-4" />
          {saved ? 'Saved' : 'Save'}
        </button>
      </div>
    </div>
  );
}
