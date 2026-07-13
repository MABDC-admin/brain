import React, { useState, useEffect, useCallback, useRef } from 'react';
import { ChevronLeft, Lock, Plus, Trash2, BookOpen } from 'lucide-react';
import { useDeleteConfirmation } from '../hooks/useDeleteConfirmation.js';

const API = import.meta.env.PROD ? 'https://brain.mabdc.com' : 'https://brain.mabdc.com';
const MOODS = ['😊', '😐', '😔', '🔥', '😴', '🤔', '💪', '❤️'];
const PIN_KEY = 'journal_pin';
const LOCK_KEY = 'journal_locked';

// Journal entries are stored as note-type items in the DB
// with subtitle "Journal • [date]"

function formatDate(date) {
  return new Date(date).toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
  });
}

function wordCount(text) {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}

// ── PIN Lock Screen ───────────────────────────────────────────────────────────
function PinScreen({ onUnlock }) {
  const [pin,     setPin]     = useState('');
  const [error,   setError]   = useState(false);
  const [setting] = useState(!localStorage.getItem(PIN_KEY));
  const [confirm, setConfirm] = useState('');
  const [step,    setStep]    = useState(1); // 1=enter, 2=confirm

  const handleDigit = (d) => {
    if (setting) {
      if (step === 1) {
        const next = pin + d;
        setPin(next);
        if (next.length === 4) { setStep(2); setConfirm(''); }
      } else {
        const next = confirm + d;
        setConfirm(next);
        if (next.length === 4) {
          if (next === pin) { localStorage.setItem(PIN_KEY, pin); localStorage.setItem(LOCK_KEY, 'false'); onUnlock(); }
          else { setError(true); setStep(1); setPin(''); setConfirm(''); setTimeout(() => setError(false), 1000); }
        }
      }
    } else {
      const next = pin + d;
      setPin(next);
      if (next.length === 4) {
        if (next === localStorage.getItem(PIN_KEY)) { localStorage.setItem(LOCK_KEY, 'false'); onUnlock(); }
        else { setError(true); setPin(''); setTimeout(() => setError(false), 1000); }
      }
    }
  };

  const current = setting && step === 2 ? confirm : pin;

  return (
    <div className="flex flex-col items-center justify-center h-full bg-[#0b0c10] px-8">
      <div className="w-16 h-16 rounded-2xl bg-pink-500/20 border border-pink-500/30 flex items-center justify-center mb-6">
        <Lock className="w-8 h-8 text-pink-400"/>
      </div>
      <h2 className="text-white text-xl font-bold mb-1">
        {setting ? (step === 1 ? 'Set PIN' : 'Confirm PIN') : 'Journal Locked'}
      </h2>
      <p className="text-gray-500 text-sm mb-8">
        {setting ? (step === 1 ? 'Choose a 4-digit PIN' : 'Re-enter your PIN') : 'Enter PIN to unlock'}
      </p>

      {/* Dots */}
      <div className={`flex gap-4 mb-10 transition-transform ${error ? 'shake' : ''}`}>
        {[0,1,2,3].map(i => (
          <div key={i} className={`w-4 h-4 rounded-full border-2 transition-colors ${i < current.length ? (error ? 'bg-red-500 border-red-500' : 'bg-pink-500 border-pink-500') : 'border-gray-600'}`}/>
        ))}
      </div>

      {/* Keypad */}
      <div className="grid grid-cols-3 gap-3 w-full max-w-[240px]">
        {['1','2','3','4','5','6','7','8','9','','0','⌫'].map((d, i) => (
          <button key={i} onClick={() => d === '⌫' ? (setting && step === 2 ? setConfirm(c => c.slice(0,-1)) : setPin(p => p.slice(0,-1))) : d && handleDigit(d)}
            className={`h-14 rounded-2xl flex items-center justify-center text-xl font-semibold transition-all
            ${d === '' ? '' : d === '⌫' ? 'text-gray-400 hover:bg-[#1a1b23] active:scale-95' : 'bg-[#14151b] border border-[#2a2b36] text-white hover:bg-[#1e1f28] active:scale-95'}`}>
            {d}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Entry Editor ──────────────────────────────────────────────────────────────
function EntryEditor({ entry, onClose, onSave, onDelete }) {
  const [body,  setBody]  = useState(entry?.body  || '');
  const [mood,  setMood]  = useState(entry?.mood  || '');
  const [title] = useState(entry?.title || formatDate(new Date()));
  const [saving, setSaving] = useState(false);
  const textRef = useRef();
  const { confirmDelete } = useDeleteConfirmation();

  useEffect(() => { textRef.current?.focus(); }, []);

  const handleSave = async () => {
    if (!body.trim()) return;
    setSaving(true);
    await onSave({ title, body, mood });
    setSaving(false);
    onClose();
  };

  return (
    <div className="absolute inset-0 z-50 bg-[#0b0c10] flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-5 pb-3 shrink-0 border-b border-[#1a1b23]">
        <button onClick={onClose} className="text-gray-400 hover:text-white p-1"><ChevronLeft className="w-6 h-6"/></button>
        <div className="flex-1 text-center">
          <p className="text-white font-semibold text-sm truncate">{title}</p>
          <p className="text-gray-500 text-[11px]">{wordCount(body)} words</p>
        </div>
        <div className="flex items-center gap-2">
          {entry?.id && (
            <button onClick={() => confirmDelete({ title: 'Delete journal entry?', itemName: title, onConfirm: async () => { await onDelete(entry.id); onClose(); } })} className="text-gray-600 hover:text-red-400 p-1"><Trash2 className="w-5 h-5"/></button>
          )}
          <button onClick={handleSave} disabled={saving || !body.trim()}
            className="bg-pink-500 hover:bg-pink-400 disabled:opacity-40 text-white text-sm font-semibold px-4 py-1.5 rounded-xl transition-colors">
            {saving ? '…' : 'Save'}
          </button>
        </div>
      </div>

      {/* Mood */}
      <div className="flex gap-2 px-5 py-3 border-b border-[#1a1b23] shrink-0 overflow-x-auto scrollbar-hide">
        <span className="text-gray-500 text-sm mr-1 shrink-0 self-center">Mood:</span>
        {MOODS.map(m => (
          <button key={m} onClick={() => setMood(prev => prev === m ? '' : m)}
            className={`text-2xl w-10 h-10 rounded-xl flex items-center justify-center transition-all ${mood === m ? 'bg-pink-500/20 scale-110' : 'hover:bg-[#1a1b23]'}`}>
            {m}
          </button>
        ))}
      </div>

      {/* Body */}
      <textarea
        ref={textRef}
        value={body}
        onChange={e => setBody(e.target.value)}
        placeholder={"What's on your mind today?\n\nWrite freely — this is your private space..."}
        className="flex-1 bg-transparent text-white px-5 py-4 outline-none resize-none text-[15px] leading-relaxed placeholder-gray-600"
      />
    </div>
  );
}

// ── Main Journal Page ─────────────────────────────────────────────────────────
export default function JournalPage() {
  const [locked,   setLocked]   = useState(localStorage.getItem(LOCK_KEY) !== 'false');
  const [entries,  setEntries]  = useState([]);
  const [editing,  setEditing]  = useState(null); // null | 'new' | item
  const [streak,   setStreak]   = useState(0);

  const load = useCallback(() => {
    fetch(`${API}/items/type/journal`)
      .then(r => r.json())
      .then(data => {
        setEntries(data);
        setStreak(Math.min(data.length, 7)); // simple streak from count
      })
      .catch(() => setEntries([]));
  }, []);

  useEffect(() => { if (!locked) load(); }, [locked, load]);

  const saveEntry = async ({ title, body, mood }) => {
    const subtitle = `Journal • ${new Date().toLocaleDateString('en-GB')} ${mood ? mood : ''}`;
    await fetch(`${API}/items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'journal', title, subtitle, body }),
    });
    load();
  };

  const deleteEntry = async (id) => {
    await fetch(`${API}/items/${id}`, { method: 'DELETE' });
    load();
  };

  if (locked) return <PinScreen onUnlock={() => setLocked(false)}/>;

  return (
    <div className="flex flex-col h-full relative">
      {/* Header */}
      <div className="p-6 pb-3 shrink-0">
        <div className="flex justify-between items-center mb-1">
          <h1 className="text-2xl font-bold text-pink-400">/journal</h1>
          <div className="flex gap-3">
            <button onClick={() => { localStorage.setItem(LOCK_KEY, 'true'); setLocked(true); }}
              className="text-gray-500 hover:text-white transition-colors">
              <Lock className="w-5 h-5"/>
            </button>
          </div>
        </div>
        <p className="text-gray-500 text-sm">Your private space</p>

        {/* Streak */}
        <div className="flex gap-3 mt-4">
          <div className="flex-1 bg-[#14151b] border border-[#2a2b36] rounded-2xl p-3 text-center">
            <p className="text-2xl font-bold text-pink-400">{streak}</p>
            <p className="text-gray-500 text-[11px]">Day streak 🔥</p>
          </div>
          <div className="flex-1 bg-[#14151b] border border-[#2a2b36] rounded-2xl p-3 text-center">
            <p className="text-2xl font-bold text-white">{entries.length}</p>
            <p className="text-gray-500 text-[11px]">Total entries</p>
          </div>
          <div className="flex-1 bg-[#14151b] border border-[#2a2b36] rounded-2xl p-3 text-center">
            <p className="text-2xl font-bold text-white">{new Date().toLocaleDateString('en-US', { month: 'short' })}</p>
            <p className="text-gray-500 text-[11px]">This month</p>
          </div>
        </div>
      </div>

      {/* Entries List */}
      <div className="flex-1 overflow-y-auto scrollbar-hide px-6">
        {entries.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <BookOpen className="w-12 h-12 text-gray-700 mb-3"/>
            <p className="text-gray-400 font-semibold">No entries yet</p>
            <p className="text-gray-600 text-sm mt-1">Start writing your first entry below</p>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-gray-500 uppercase tracking-wider font-semibold">Past Entries</p>
            {entries.map((e) => {
              const mood = e.subtitle?.match(/[\u{1F300}-\u{1FFFF}]/gu)?.[0] || '';
              const date = e.subtitle?.split('•')[1]?.trim().replace(mood, '').trim() || 'Unknown';
              return (
                <div key={e.id} onClick={() => setEditing(e)}
                  className="bg-[#14151b] border border-[#2a2b36] rounded-2xl p-4 cursor-pointer hover:bg-[#1a1b23] transition-all active:scale-[0.98]">
                  <div className="flex items-start justify-between mb-1">
                    <p className="text-white font-semibold text-[15px] flex-1 truncate pr-2">{e.title}</p>
                    {mood && <span className="text-xl shrink-0">{mood}</span>}
                  </div>
                  <p className="text-gray-500 text-[12px]">{date}</p>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* New Entry Button */}
      <div className="p-6 pt-4 shrink-0">
        <button onClick={() => setEditing('new')}
          className="w-full py-4 rounded-2xl font-semibold text-white flex items-center justify-center gap-2 transition-all hover:opacity-90 active:scale-[0.98]"
          style={{ background: 'linear-gradient(135deg, #ec4899, #a855f7)' }}>
          <Plus className="w-5 h-5"/> New Entry
        </button>
      </div>

      {/* Editor Overlay */}
      {editing && (
        <EntryEditor
          entry={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSave={saveEntry}
          onDelete={deleteEntry}
        />
      )}
    </div>
  );
}
