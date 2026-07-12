import React, { useState } from 'react';
import {
  ChevronRight, ChevronLeft, LayoutGrid, Sliders, ShieldCheck, Cloud,
  FileText, Bell, Info, User, Check, Eye, EyeOff, Moon, Sun,
  Globe, DollarSign, ToggleLeft, ToggleRight, Key, Cpu, Trash2,
  Download, RefreshCw, Smartphone
} from 'lucide-react';
import { useTheme } from '../ThemeContext.jsx';


// ── Persistent settings via localStorage ──────────────────────────────────────
const getLS  = (k, def) => { try { return JSON.parse(localStorage.getItem(k)) ?? def; } catch { return def; } };
const setLS  = (k, v)   => localStorage.setItem(k, JSON.stringify(v));

const CURRENCIES = ['AED', 'USD', 'EUR', 'GBP', 'SAR'];
const LANGUAGES  = ['English', 'Arabic', 'French', 'Spanish'];
const DATE_FMTS  = ['DD/MM/YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD'];
const MODELS     = ['openai/gpt-4o', 'openai/gpt-4o-mini', 'anthropic/claude-3.5-sonnet'];

// ── Reusable sub-components ───────────────────────────────────────────────────

function Toggle({ on, onToggle, color = 'bg-indigo-500' }) {
  return (
    <button onClick={onToggle}
      className={`w-12 h-6 rounded-full relative transition-colors duration-300 ${on ? color : 'bg-gray-600'}`}>
      <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all duration-300 ${on ? 'left-6' : 'left-0.5'}`}/>
    </button>
  );
}

function Row({ label, sub, right, onClick, border = true }) {
  return (
    <button onClick={onClick}
      className={`w-full flex items-center px-4 py-4 hover:bg-[#1e1f28] transition-colors text-left ${border ? 'border-b border-[#2a2b36]' : ''}`}>
      <div className="flex-1 min-w-0">
        <p className="text-white text-[15px]">{label}</p>
        {sub && <p className="text-gray-500 text-[12px] mt-0.5">{sub}</p>}
      </div>
      {right}
    </button>
  );
}

function PanelHeader({ title, onBack }) {
  return (
    <div className="flex items-center px-4 pt-6 pb-4 border-b border-[#2a2b36] shrink-0">
      <button onClick={onBack} className="text-gray-400 hover:text-white mr-3 p-1">
        <ChevronLeft className="w-6 h-6"/>
      </button>
      <h2 className="text-white font-bold text-xl">{title}</h2>
    </div>
  );
}

// ── Sub-panels ────────────────────────────────────────────────────────────────

function ProfilePanel({ onBack }) {
  const [name,  setName]  = useState(getLS('profile_name',  'Ali Hassan'));
  const [email, setEmail] = useState(getLS('profile_email', 'ali@example.com'));
  const [saved, setSaved] = useState(false);

  const save = () => {
    setLS('profile_name',  name);
    setLS('profile_email', email);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="flex flex-col h-full">
      <PanelHeader title="Profile" onBack={onBack}/>
      <div className="flex-1 p-6 space-y-6">
        {/* Avatar */}
        <div className="flex flex-col items-center gap-3">
          <div className="w-20 h-20 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center text-white font-bold text-3xl">
            {name.charAt(0).toUpperCase()}
          </div>
          <button className="text-indigo-400 text-sm font-medium hover:text-indigo-300">Change photo</button>
        </div>
        {/* Fields */}
        <div className="space-y-4">
          <div>
            <label className="text-gray-400 text-xs font-semibold uppercase tracking-wider block mb-2">Full Name</label>
            <input value={name} onChange={e => setName(e.target.value)}
              className="w-full bg-[#14151b] border border-[#2a2b36] rounded-xl px-4 py-3 text-white outline-none focus:border-indigo-400 transition-colors"/>
          </div>
          <div>
            <label className="text-gray-400 text-xs font-semibold uppercase tracking-wider block mb-2">Email</label>
            <input value={email} onChange={e => setEmail(e.target.value)}
              className="w-full bg-[#14151b] border border-[#2a2b36] rounded-xl px-4 py-3 text-white outline-none focus:border-indigo-400 transition-colors"/>
          </div>
        </div>
        <button onClick={save}
          className={`w-full py-4 rounded-2xl font-semibold text-white flex items-center justify-center gap-2 transition-all ${saved ? 'bg-green-500' : 'bg-indigo-500 hover:bg-indigo-400'}`}>
          {saved ? <><Check className="w-5 h-5"/> Saved!</> : 'Save Changes'}
        </button>
      </div>
    </div>
  );
}

function PreferencesPanel({ onBack }) {
  const { dark, setDark }  = useTheme();
  const [currency, setCurrency] = useState(getLS('currency', 'AED'));
  const [language, setLanguage] = useState(getLS('language', 'English'));
  const [dateFmt,  setDateFmt]  = useState(getLS('date_fmt', 'DD/MM/YYYY'));
  const [compact,  setCompact]  = useState(getLS('compact',   false));

  const persist = (setter, key) => (val) => { setter(val); setLS(key, val); };

  return (
    <div className="flex flex-col h-full">
      <PanelHeader title="Preferences" onBack={onBack}/>
      <div className="flex-1 overflow-y-auto scrollbar-hide p-5 space-y-4">

        {/* Appearance */}
        <p className="text-xs text-gray-500 font-semibold uppercase tracking-wider">Appearance</p>
        <div className="bg-[#14151b] rounded-2xl border border-[#2a2b36] overflow-hidden">
          <div className="flex items-center justify-between px-4 py-4 border-b border-[#2a2b36]">
            <div className="flex items-center gap-3">
              {dark ? <Moon className="w-5 h-5 text-indigo-400"/> : <Sun className="w-5 h-5 text-yellow-400"/>}
              <div>
                <p className="text-white text-[15px]">Dark Mode</p>
                <p className="text-gray-500 text-[12px]">{dark ? 'Dark theme active' : 'Light theme active'}</p>
              </div>
            </div>
            <Toggle on={dark} onToggle={() => setDark(v => !v)}/>
          </div>
          <div className="flex items-center justify-between px-4 py-4">
            <div className="flex items-center gap-3">
              <Smartphone className="w-5 h-5 text-gray-400"/>
              <div>
                <p className="text-white text-[15px]">Compact View</p>
                <p className="text-gray-500 text-[12px]">Denser list layout</p>
              </div>
            </div>
            <Toggle on={compact} onToggle={() => persist(setCompact, 'compact')(!compact)}/>
          </div>
        </div>

        {/* Regional */}
        <p className="text-xs text-gray-500 font-semibold uppercase tracking-wider">Regional</p>
        <div className="bg-[#14151b] rounded-2xl border border-[#2a2b36] overflow-hidden">
          <div className="px-4 py-3 border-b border-[#2a2b36]">
            <p className="text-gray-400 text-xs mb-2">Currency</p>
            <div className="flex gap-2 flex-wrap">
              {CURRENCIES.map(c => (
                <button key={c} onClick={() => persist(setCurrency, 'currency')(c)}
                  className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${currency === c ? 'border-indigo-500 bg-indigo-500/10 text-indigo-400' : 'border-[#2a2b36] text-gray-400'}`}>
                  {c}
                </button>
              ))}
            </div>
          </div>
          <div className="px-4 py-3 border-b border-[#2a2b36]">
            <p className="text-gray-400 text-xs mb-2">Language</p>
            <div className="flex gap-2 flex-wrap">
              {LANGUAGES.map(l => (
                <button key={l} onClick={() => persist(setLanguage, 'language')(l)}
                  className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${language === l ? 'border-indigo-500 bg-indigo-500/10 text-indigo-400' : 'border-[#2a2b36] text-gray-400'}`}>
                  {l}
                </button>
              ))}
            </div>
          </div>
          <div className="px-4 py-3">
            <p className="text-gray-400 text-xs mb-2">Date Format</p>
            <div className="flex gap-2 flex-wrap">
              {DATE_FMTS.map(f => (
                <button key={f} onClick={() => persist(setDateFmt, 'date_fmt')(f)}
                  className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${dateFmt === f ? 'border-indigo-500 bg-indigo-500/10 text-indigo-400' : 'border-[#2a2b36] text-gray-400'}`}>
                  {f}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function AiPrivacyPanel({ onBack }) {
  const [apiKey, setApiKey]     = useState(getLS('openrouter_key', ''));
  const [model,  setModel]      = useState(getLS('ai_model', MODELS[0]));
  const [show,   setShow]       = useState(false);
  const [saved,  setSaved]      = useState(false);
  const [aiEnabled, setAiEnabled] = useState(getLS('ai_enabled', true));

  const saveKey = () => {
    setLS('openrouter_key', apiKey);
    setLS('ai_model', model);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const masked = apiKey ? apiKey.slice(0, 8) + '••••••••••••••••' + apiKey.slice(-4) : '';

  return (
    <div className="flex flex-col h-full">
      <PanelHeader title="AI & Privacy" onBack={onBack}/>
      <div className="flex-1 overflow-y-auto scrollbar-hide p-5 space-y-4">

        <div className="bg-[#14151b] rounded-2xl border border-[#2a2b36] overflow-hidden">
          <div className="flex items-center justify-between px-4 py-4 border-b border-[#2a2b36]">
            <div>
              <p className="text-white text-[15px]">AI Features</p>
              <p className="text-gray-500 text-[12px]">Command parsing & OCR</p>
            </div>
            <Toggle on={aiEnabled} onToggle={() => { setAiEnabled(v => !v); setLS('ai_enabled', !aiEnabled); }} color="bg-green-500"/>
          </div>
        </div>

        <p className="text-xs text-gray-500 font-semibold uppercase tracking-wider">OpenRouter API Key</p>
        <div className="bg-[#14151b] rounded-2xl border border-[#2a2b36] p-4 space-y-3">
          <div className="relative">
            <input
              type={show ? 'text' : 'password'}
              value={apiKey}
              onChange={e => setApiKey(e.target.value)}
              placeholder="sk-or-v1-..."
              className="w-full bg-[#0b0c10] border border-[#2a2b36] rounded-xl px-4 py-3 text-white outline-none focus:border-indigo-400 text-[14px] pr-12 font-mono"/>
            <button onClick={() => setShow(s => !s)} className="absolute right-3 top-3.5 text-gray-500 hover:text-white">
              {show ? <EyeOff className="w-5 h-5"/> : <Eye className="w-5 h-5"/>}
            </button>
          </div>
          <p className="text-gray-600 text-[11px]">Get your key at openrouter.ai — used for OCR & command parsing</p>
        </div>

        <p className="text-xs text-gray-500 font-semibold uppercase tracking-wider">Vision Model</p>
        <div className="bg-[#14151b] rounded-2xl border border-[#2a2b36] overflow-hidden">
          {MODELS.map((m, i) => (
            <button key={m} onClick={() => setModel(m)}
              className={`w-full flex items-center justify-between px-4 py-3.5 hover:bg-[#1a1b23] transition-colors ${i < MODELS.length - 1 ? 'border-b border-[#2a2b36]' : ''}`}>
              <div className="flex items-center gap-3">
                <Cpu className="w-4 h-4 text-gray-500 shrink-0"/>
                <span className="text-white text-[13px] font-mono">{m}</span>
              </div>
              {model === m && <Check className="w-4 h-4 text-indigo-400"/>}
            </button>
          ))}
        </div>

        <button onClick={saveKey}
          className={`w-full py-4 rounded-2xl font-semibold text-white flex items-center justify-center gap-2 transition-all ${saved ? 'bg-green-500' : 'bg-indigo-500 hover:bg-indigo-400'}`}>
          {saved ? <><Check className="w-5 h-5"/> Saved!</> : <><Key className="w-5 h-5"/> Save API Key</>}
        </button>
      </div>
    </div>
  );
}

function SecurityPanel({ onBack }) {
  const [pin, setPin] = useState(getLS('app_pin', ''));
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [isSetting, setIsSetting] = useState(false);
  const [saved, setSaved] = useState(false);

  const savePin = () => {
    if (newPin !== confirmPin) { alert('PINs do not match'); return; }
    setLS('app_pin', newPin);
    setPin(newPin);
    setSaved(true);
    setTimeout(() => { setSaved(false); setIsSetting(false); }, 2000);
  };

  const removePin = () => {
    setLS('app_pin', '');
    setPin('');
    setNewPin('');
    setConfirmPin('');
  };

  return (
    <div className="flex flex-col h-full">
      <PanelHeader title="Security & Lock" onBack={onBack}/>
      <div className="flex-1 p-5 space-y-4">
        <p className="text-xs text-gray-500 uppercase tracking-wider font-semibold">App Lock</p>
        <div className="bg-[#14151b] rounded-2xl border border-[#2a2b36] overflow-hidden p-4">
          <div className="flex justify-between items-center mb-4">
            <div>
              <p className="text-white text-[15px]">Require PIN</p>
              <p className="text-gray-500 text-[12px]">{pin ? 'App is protected' : 'App is open'}</p>
            </div>
            {pin ? (
              <button onClick={removePin} className="text-red-400 text-sm font-semibold">Remove PIN</button>
            ) : (
              <button onClick={() => setIsSetting(true)} className="text-indigo-400 text-sm font-semibold">Set PIN</button>
            )}
          </div>
          
          {isSetting && (
            <div className="space-y-3 pt-4 border-t border-[#2a2b36]">
              <input type="password" placeholder="Enter 4-digit PIN" maxLength={4}
                value={newPin} onChange={e => setNewPin(e.target.value.replace(/\\D/g, ''))}
                className="w-full bg-[#0b0c10] border border-[#2a2b36] rounded-xl px-4 py-3 text-white outline-none focus:border-indigo-400" />
              <input type="password" placeholder="Confirm PIN" maxLength={4}
                value={confirmPin} onChange={e => setConfirmPin(e.target.value.replace(/\\D/g, ''))}
                className="w-full bg-[#0b0c10] border border-[#2a2b36] rounded-xl px-4 py-3 text-white outline-none focus:border-indigo-400" />
              <button onClick={savePin} disabled={newPin.length !== 4 || confirmPin.length !== 4}
                className="w-full py-3 rounded-xl bg-indigo-500 hover:bg-indigo-400 text-white font-bold disabled:opacity-50">
                {saved ? 'Saved!' : 'Save PIN'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function NotificationsPanel({ onBack }) {
  const defaults = { task: true, reminder: true, expense: false, note: false, journal: false };
  const [notifs, setNotifs] = useState(getLS('notifs', defaults));
  const toggle = (k) => setNotifs(p => { const n = { ...p, [k]: !p[k] }; setLS('notifs', n); return n; });

  const items = [
    { key: 'task',     label: 'Tasks',     sub: 'Due date & overdue alerts',   color: 'bg-green-500' },
    { key: 'reminder', label: 'Reminders', sub: 'At scheduled time',            color: 'bg-orange-500' },
    { key: 'expense',  label: 'Expenses',  sub: 'Budget limits exceeded',       color: 'bg-blue-500' },
    { key: 'note',     label: 'Notes',     sub: 'Pinned note updates',          color: 'bg-purple-500' },
    { key: 'journal',  label: 'Journal',   sub: 'Daily writing reminder',       color: 'bg-pink-500' },
  ];

  return (
    <div className="flex flex-col h-full">
      <PanelHeader title="Notifications" onBack={onBack}/>
      <div className="flex-1 p-5 space-y-4">
        <div className="bg-[#14151b] rounded-2xl border border-[#2a2b36] overflow-hidden">
          {items.map(({ key, label, sub, color }, i) => (
            <div key={key} className={`flex items-center justify-between px-4 py-4 ${i < items.length - 1 ? 'border-b border-[#2a2b36]' : ''}`}>
              <div className="flex items-center gap-3">
                <div className={`w-2 h-2 rounded-full ${color}`}/>
                <div>
                  <p className="text-white text-[15px]">{label}</p>
                  <p className="text-gray-500 text-[12px]">{sub}</p>
                </div>
              </div>
              <Toggle on={!!notifs[key]} onToggle={() => toggle(key)}/>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function AboutPanel({ onBack }) {
  return (
    <div className="flex flex-col h-full">
      <PanelHeader title="About Command Brain" onBack={onBack}/>
      <div className="flex-1 p-6 flex flex-col items-center text-center">
        <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center mb-4 shadow-xl shadow-indigo-500/30">
          <span className="text-white text-3xl font-bold">CB</span>
        </div>
        <h3 className="text-white text-xl font-bold mb-1">Command Brain</h3>
        <p className="text-gray-500 text-sm mb-1">Version 1.0.0</p>
        <p className="text-gray-600 text-xs mb-8">Built with React + FastAPI + SQLite</p>

        <div className="w-full bg-[#14151b] rounded-2xl border border-[#2a2b36] overflow-hidden text-left">
          {[
            { label: 'Frontend',  val: 'React + Vite + TailwindCSS' },
            { label: 'Backend',   val: 'FastAPI + SQLite' },
            { label: 'AI / OCR',  val: 'GPT-4o via OpenRouter' },
            { label: 'Developer', val: 'Command Brain Team' },
          ].map(({ label, val }, i, arr) => (
            <div key={i} className={`px-4 py-3 flex justify-between ${i < arr.length - 1 ? 'border-b border-[#2a2b36]' : ''}`}>
              <span className="text-gray-500 text-sm">{label}</span>
              <span className="text-white text-sm font-medium">{val}</span>
            </div>
          ))}
        </div>

        <p className="text-gray-700 text-xs mt-8">© 2025 Command Brain. All rights reserved.</p>

        <button onClick={() => { localStorage.removeItem('onboarded'); window.location.reload(); }}
          className="mt-4 text-xs text-gray-600 hover:text-indigo-400 transition-colors underline underline-offset-2">
          Replay onboarding
        </button>
      </div>
    </div>
  );
}

function DataSyncPanel({ onBack }) {
  const [syncing,    setSyncing]    = useState(false);
  const [exporting,  setExporting]  = useState(false);
  const [exportDone, setExportDone] = useState('');

  const handleSync = () => { setSyncing(true); setTimeout(() => setSyncing(false), 2000); };

  const exportData = async (format) => {
    setExporting(true);
    try {
      const items = await fetch('http://localhost:8001/items').then(r => r.json());
      let content, filename, type;
      if (format === 'json') {
        content  = JSON.stringify(items, null, 2);
        filename = `commandbrain_${new Date().toISOString().slice(0,10)}.json`;
        type     = 'application/json';
      } else {
        const headers = ['id', 'type', 'title', 'subtitle', 'expiry_date'];
        const rows    = items.map(i => headers.map(h => `"${(i[h] || '').toString().replace(/"/g, '""')}"`).join(','));
        content  = [headers.join(','), ...rows].join('\n');
        filename = `commandbrain_${new Date().toISOString().slice(0,10)}.csv`;
        type     = 'text/csv';
      }
      const blob = new Blob([content], { type });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      setExportDone(`✅ ${items.length} items exported as ${format.toUpperCase()}`);
      setTimeout(() => setExportDone(''), 3000);
    } catch { setExportDone('❌ Export failed — is backend running?'); setTimeout(() => setExportDone(''), 3000); }
    setExporting(false);
  };

  const clearData = async () => {
    if (!window.confirm('Delete ALL items? This cannot be undone.')) return;
    try {
      const items = await fetch('http://localhost:8001/items').then(r => r.json());
      await Promise.all(items.map(i => fetch(`http://localhost:8001/items/${i.id}`, { method: 'DELETE' })));
      setExportDone('🗑️ All data cleared');
      setTimeout(() => window.location.reload(), 1000);
    } catch { setExportDone('❌ Clear failed'); setTimeout(() => setExportDone(''), 2000); }
  };

  return (
    <div className="flex flex-col h-full">
      <PanelHeader title="Data & Sync" onBack={onBack}/>
      <div className="flex-1 p-5 space-y-4 overflow-y-auto scrollbar-hide">

        {exportDone && (
          <div className="bg-[#1a1b23] border border-[#2a2b36] rounded-xl px-4 py-3 text-white text-sm text-center toast-enter">
            {exportDone}
          </div>
        )}

        <p className="text-xs text-gray-500 uppercase tracking-wider font-semibold">Sync</p>
        <div className="bg-[#14151b] rounded-2xl border border-[#2a2b36] overflow-hidden">
          <button onClick={handleSync} className="w-full flex items-center px-4 py-4 hover:bg-[#1e1f28] transition-colors text-left">
            <RefreshCw className={`w-5 h-5 mr-4 text-gray-400 ${syncing ? 'animate-spin' : ''}`}/>
            <div className="flex-1">
              <p className="text-white text-[15px]">Sync now</p>
              <p className="text-gray-500 text-[12px]">{syncing ? 'Syncing…' : 'Last synced: just now'}</p>
            </div>
          </button>
        </div>

        <p className="text-xs text-gray-500 uppercase tracking-wider font-semibold">Export</p>
        <div className="bg-[#14151b] rounded-2xl border border-[#2a2b36] overflow-hidden">
          <button onClick={() => exportData('csv')} disabled={exporting}
            className="w-full flex items-center px-4 py-4 hover:bg-[#1e1f28] transition-colors text-left border-b border-[#2a2b36]">
            <Download className="w-5 h-5 mr-4 text-gray-400"/>
            <div className="flex-1">
              <p className="text-white text-[15px]">Export as CSV</p>
              <p className="text-gray-500 text-[12px]">Spreadsheet-compatible</p>
            </div>
            {exporting && <svg className="animate-spin h-4 w-4 text-indigo-400" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>}
          </button>
          <button onClick={() => exportData('json')} disabled={exporting}
            className="w-full flex items-center px-4 py-4 hover:bg-[#1e1f28] transition-colors text-left">
            <Download className="w-5 h-5 mr-4 text-gray-400"/>
            <div className="flex-1">
              <p className="text-white text-[15px]">Export as JSON</p>
              <p className="text-gray-500 text-[12px]">Developer-friendly format</p>
            </div>
          </button>
        </div>

        <p className="text-xs text-gray-500 uppercase tracking-wider font-semibold">Danger Zone</p>
        <div className="bg-[#14151b] rounded-2xl border border-red-500/20 overflow-hidden">
          <button onClick={clearData}
            className="w-full flex items-center px-4 py-4 hover:bg-red-500/10 transition-colors text-left">
            <Trash2 className="w-5 h-5 mr-4 text-red-400"/>
            <div className="flex-1">
              <p className="text-red-400 text-[15px]">Clear all data</p>
              <p className="text-gray-500 text-[12px]">Permanently deletes all items</p>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Settings Page ────────────────────────────────────────────────────────

const MENU_ITEMS = [
  { key: 'profile',      icon: User,        label: 'Profile',              sub: 'Name, photo, email' },
  { key: 'preferences',  icon: Sliders,     label: 'Preferences',          sub: 'Theme, currency, language' },
  { key: 'ai-privacy',   icon: ShieldCheck, label: 'AI & Privacy',         sub: 'API key, model selection' },
  { key: 'security',     icon: Lock,        label: 'Security & Lock',      sub: 'App PIN, locked items' },
  { key: 'data',         icon: Cloud,       label: 'Data & Sync',          sub: 'Export, backup, clear' },
  { key: 'notifications',icon: Bell,        label: 'Notifications',        sub: 'Per-workspace alerts' },
  { key: 'about',        icon: Info,        label: 'About Command Brain',  sub: 'v1.0.0' },
];

export default function SettingsPage() {
  const [panel, setPanel] = useState(null);
  const name  = getLS('profile_name',  'Ali Hassan');
  const email = getLS('profile_email', 'ali@example.com');

  if (panel === 'profile')       return <ProfilePanel       onBack={() => setPanel(null)}/>;
  if (panel === 'preferences')   return <PreferencesPanel   onBack={() => setPanel(null)}/>;
  if (panel === 'ai-privacy')    return <AiPrivacyPanel     onBack={() => setPanel(null)}/>;
  if (panel === 'security')      return <SecurityPanel      onBack={() => setPanel(null)}/>;
  if (panel === 'notifications') return <NotificationsPanel onBack={() => setPanel(null)}/>;
  if (panel === 'about')         return <AboutPanel         onBack={() => setPanel(null)}/>;
  if (panel === 'data')          return <DataSyncPanel      onBack={() => setPanel(null)}/>;

  return (
    <div className="p-6 flex flex-col h-full text-white">
      <h1 className="text-2xl font-bold text-white mb-6">Settings</h1>

      {/* Profile Card */}
      <button onClick={() => setPanel('profile')}
        className="bg-[#14151b] rounded-2xl p-4 flex items-center border border-[#2a2b36] mb-5 cursor-pointer hover:bg-[#1e1f28] transition-colors w-full text-left">
        <div className="w-14 h-14 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center text-white font-bold text-xl mr-4 shrink-0">
          {name.charAt(0).toUpperCase()}
        </div>
        <div className="flex-1">
          <p className="font-bold text-white text-lg">{name}</p>
          <p className="text-gray-400 text-sm">{email}</p>
        </div>
        <ChevronRight className="w-5 h-5 text-gray-500"/>
      </button>

      {/* Menu */}
      <div className="flex-1 overflow-y-auto scrollbar-hide">
        <div className="bg-[#14151b] rounded-2xl border border-[#2a2b36] overflow-hidden">
          {MENU_ITEMS.map(({ key, icon: Icon, label, sub }, i) => (
            <button key={key} onClick={() => setPanel(key)}
              className={`w-full flex items-center px-4 py-4 hover:bg-[#1e1f28] transition-colors text-left ${i < MENU_ITEMS.length - 1 ? 'border-b border-[#2a2b36]' : ''}`}>
              <Icon className="w-5 h-5 text-gray-400 mr-4 shrink-0"/>
              <div className="flex-1">
                <p className="text-white text-[15px]">{label}</p>
                <p className="text-gray-500 text-[12px] mt-0.5">{sub}</p>
              </div>
              <ChevronRight className="w-4 h-4 text-gray-500"/>
            </button>
          ))}
        </div>
        <p className="text-center text-gray-700 text-xs mt-5">Command Brain v1.0.0</p>
      </div>
    </div>
  );
}
