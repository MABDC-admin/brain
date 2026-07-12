import React, { useState } from 'react';
import { CheckCircle2, Bell, Wallet, FileText, ChevronRight, Zap, ArrowRight } from 'lucide-react';

const CURRENCIES = ['AED', 'USD', 'EUR', 'GBP', 'SAR'];
const FEATURES = [
  { icon: CheckCircle2, bg: 'bg-green-500',  label: '/task',     desc: 'Capture tasks in seconds' },
  { icon: Wallet,       bg: 'bg-blue-500',   label: '/expense',  desc: 'Track spending & budgets' },
  { icon: FileText,     bg: 'bg-purple-500', label: '/note',     desc: 'Quick notes anywhere' },
  { icon: Bell,         bg: 'bg-orange-500', label: '/reminder', desc: 'Never miss a thing' },
];

const setLS = (k, v) => localStorage.setItem(k, JSON.stringify(v));

export default function OnboardingScreen({ onComplete }) {
  const [step,     setStep]     = useState(0);
  const [name,     setName]     = useState('');
  const [currency, setCurrency] = useState('AED');
  const [exiting,  setExiting]  = useState(false);

  const next = () => {
    if (step < 3) setStep(s => s + 1);
  };

  const finish = () => {
    setLS('profile_name',  name.trim() || 'Ali');
    setLS('currency',      currency);
    setLS('onboarded',     true);
    setExiting(true);
    setTimeout(onComplete, 400);
  };

  const steps = [
    // ── Step 0: Welcome ──────────────────────────────────────────────────────
    <div key={0} className="flex flex-col items-center justify-center h-full px-8 text-center">
      <div className="w-24 h-24 rounded-3xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center mb-8 shadow-2xl shadow-indigo-500/40"
        style={{ animation: 'pageSlideUp 0.5s ease-out' }}>
        <Zap className="w-12 h-12 text-white"/>
      </div>
      <h1 className="text-3xl font-bold text-white mb-3">Command Brain</h1>
      <p className="text-gray-400 text-[16px] leading-relaxed mb-10">
        Your AI-powered life organiser.<br/>Tasks, expenses, notes & more — all from a single command.
      </p>
      <p className="text-gray-500 text-sm mb-8">First, what should we call you?</p>
      <input
        value={name}
        onChange={e => setName(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && name.trim() && next()}
        placeholder="Your first name"
        className="w-full bg-[#14151b] border border-[#2a2b36] focus:border-indigo-400 rounded-2xl px-5 py-4 text-white text-center text-lg font-medium outline-none transition-colors mb-4"
        autoFocus
      />
      <button onClick={next} disabled={!name.trim()}
        className="w-full py-4 rounded-2xl font-bold text-white text-lg flex items-center justify-center gap-2 disabled:opacity-30 transition-all active:scale-95"
        style={{ background: 'linear-gradient(135deg, #6366f1, #a855f7)' }}>
        Hi, {name.trim() || '...'} 👋 <ArrowRight className="w-5 h-5"/>
      </button>
    </div>,

    // ── Step 1: Currency ─────────────────────────────────────────────────────
    <div key={1} className="flex flex-col px-8 pt-12 h-full">
      <div className="mb-2">
        <span className="text-indigo-400 text-sm font-semibold">Step 2 of 4</span>
        <h2 className="text-2xl font-bold text-white mt-1">Pick your currency</h2>
        <p className="text-gray-500 mt-1">Used for expense tracking and budget alerts.</p>
      </div>
      <div className="flex-1 flex flex-col justify-center">
        <div className="space-y-3">
          {[
            { code: 'AED', name: 'UAE Dirham',       flag: '🇦🇪', symbol: 'د.إ' },
            { code: 'USD', name: 'US Dollar',        flag: '🇺🇸', symbol: '$' },
            { code: 'EUR', name: 'Euro',              flag: '🇪🇺', symbol: '€' },
            { code: 'GBP', name: 'British Pound',    flag: '🇬🇧', symbol: '£' },
            { code: 'SAR', name: 'Saudi Riyal',      flag: '🇸🇦', symbol: '﷼' },
          ].map(c => (
            <button key={c.code} onClick={() => setCurrency(c.code)}
              className={`w-full flex items-center gap-4 p-4 rounded-2xl border transition-all ${currency === c.code ? 'border-indigo-500 bg-indigo-500/10' : 'border-[#2a2b36] bg-[#14151b] hover:bg-[#1a1b23]'}`}>
              <span className="text-3xl">{c.flag}</span>
              <div className="flex-1 text-left">
                <p className="text-white font-semibold">{c.name}</p>
                <p className="text-gray-500 text-sm">{c.code} · {c.symbol}</p>
              </div>
              {currency === c.code && <CheckCircle2 className="w-5 h-5 text-indigo-400 shrink-0"/>}
            </button>
          ))}
        </div>
      </div>
      <button onClick={next}
        className="mb-8 w-full py-4 rounded-2xl font-bold text-white flex items-center justify-center gap-2 transition-all active:scale-95"
        style={{ background: 'linear-gradient(135deg, #6366f1, #a855f7)' }}>
        Continue <ArrowRight className="w-5 h-5"/>
      </button>
    </div>,

    // ── Step 2: Features tour ────────────────────────────────────────────────
    <div key={2} className="flex flex-col px-8 pt-12 h-full">
      <div className="mb-6">
        <span className="text-indigo-400 text-sm font-semibold">Step 3 of 4</span>
        <h2 className="text-2xl font-bold text-white mt-1">Your workspaces</h2>
        <p className="text-gray-500 mt-1">Everything you need, in one place.</p>
      </div>
      <div className="flex-1 space-y-3 overflow-y-auto scrollbar-hide">
        {FEATURES.map((f, i) => {
          const Icon = f.icon;
          return (
            <div key={i} className="flex items-center gap-4 bg-[#14151b] border border-[#2a2b36] rounded-2xl p-4"
              style={{ animation: `pageSlideIn 0.3s ${i * 0.07}s ease-out both` }}>
              <div className={`w-12 h-12 rounded-xl ${f.bg} flex items-center justify-center shrink-0`}>
                <Icon className="w-6 h-6 text-white"/>
              </div>
              <div>
                <p className="text-white font-bold font-mono">{f.label}</p>
                <p className="text-gray-400 text-sm">{f.desc}</p>
              </div>
            </div>
          );
        })}
        <div className="bg-gradient-to-r from-indigo-500/10 to-purple-500/10 border border-indigo-500/20 rounded-2xl p-4 text-center">
          <p className="text-indigo-300 text-sm font-medium">✨ Powered by GPT-4o OCR — scan any document!</p>
        </div>
      </div>
      <button onClick={next}
        className="mb-8 mt-4 w-full py-4 rounded-2xl font-bold text-white flex items-center justify-center gap-2 transition-all active:scale-95"
        style={{ background: 'linear-gradient(135deg, #6366f1, #a855f7)' }}>
        Looks great! <ArrowRight className="w-5 h-5"/>
      </button>
    </div>,

    // ── Step 3: All set ──────────────────────────────────────────────────────
    <div key={3} className="flex flex-col items-center justify-center h-full px-8 text-center">
      <div className="text-7xl mb-6" style={{ animation: 'pageSlideUp 0.4s ease-out' }}>🎉</div>
      <h2 className="text-3xl font-bold text-white mb-3">You're all set,<br/>{name.trim() || 'friend'}!</h2>
      <p className="text-gray-400 text-[15px] leading-relaxed mb-10">
        Start by typing a command like<br/>
        <span className="text-indigo-400 font-mono font-semibold">/expense 45 lunch</span> or{' '}
        <span className="text-green-400 font-mono font-semibold">/task call client</span>
      </p>
      <div className="bg-[#14151b] border border-[#2a2b36] rounded-2xl p-4 mb-8 w-full text-left space-y-2">
        <p className="text-gray-500 text-xs font-semibold uppercase tracking-wider mb-3">Quick tips</p>
        {[
          '💬 Type any /command in the home bar',
          '➕ Tap the + FAB to pick a workspace',
          '📷 Scan documents with the camera button',
          '📊 Check Analytics for spending insights',
        ].map((tip, i) => <p key={i} className="text-gray-300 text-sm">{tip}</p>)}
      </div>
      <button onClick={finish}
        className="w-full py-5 rounded-2xl font-bold text-white text-lg flex items-center justify-center gap-2 transition-all active:scale-95 shadow-xl shadow-indigo-500/30"
        style={{ background: 'linear-gradient(135deg, #6366f1, #a855f7)' }}>
        Let's go! <Zap className="w-5 h-5"/>
      </button>
    </div>,
  ];

  return (
    <div className={`absolute inset-0 z-[100] bg-[#0b0c10] flex flex-col`}
      style={{ transition: 'opacity 0.4s ease', opacity: exiting ? 0 : 1 }}>
      {/* Progress dots */}
      <div className="flex justify-center gap-2 pt-6 pb-2 shrink-0">
        {[0,1,2,3].map(i => (
          <div key={i} className={`h-1.5 rounded-full transition-all duration-300 ${i === step ? 'w-6 bg-indigo-400' : i < step ? 'w-3 bg-indigo-700' : 'w-3 bg-[#2a2b36]'}`}/>
        ))}
      </div>

      {/* Skip (only show on steps 1–2) */}
      {step > 0 && step < 3 && (
        <button onClick={() => setStep(3)} className="absolute top-5 right-5 text-gray-600 text-sm hover:text-gray-400 transition-colors">
          Skip
        </button>
      )}

      <div className="flex-1 overflow-hidden">
        {steps[step]}
      </div>
    </div>
  );
}
