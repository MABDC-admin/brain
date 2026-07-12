import React, { useState, useRef, useEffect } from 'react';
import { Send, X, Sparkles, Zap, RotateCcw } from 'lucide-react';

const API = import.meta.env.PROD ? 'https://brain.mabdc.com' : 'https://brain.mabdc.com';

const SUGGESTIONS = [
  'Why am I overspending? 💸',
  'What tasks are due soon? ✅',
  'Summarise my week 📊',
  'What notes did I write? 📝',
  'How many reminders do I have? 🔔',
  'What\'s my biggest expense category? 📉',
];

function TypingDots() {
  return (
    <div className="flex items-center gap-1 px-4 py-3 bg-[#14151b] rounded-2xl rounded-tl-sm w-fit">
      {[0, 1, 2].map(i => (
        <div key={i} className="w-2 h-2 bg-gray-500 rounded-full"
          style={{ animation: `bounce 1.2s ${i * 0.15}s ease-in-out infinite` }}/>
      ))}
    </div>
  );
}

export default function ChatPage() {
  const [messages,  setMessages]  = useState([
    { role: 'assistant', content: '👋 Hi! I\'m your Command Brain AI. I have access to all your tasks, expenses, reminders, and notes. Ask me anything!' }
  ]);
  const [input,     setInput]     = useState('');
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState('');
  const bottomRef = useRef(null);
  const inputRef  = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const send = async (text) => {
    const msg = (text || input).trim();
    if (!msg || loading) return;
    setInput('');
    setError('');

    const userMsg = { role: 'user', content: msg };
    const newHistory = [...messages, userMsg];
    setMessages(newHistory);
    setLoading(true);

    try {
      const res = await fetch(`${API}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: msg,
          history: messages.filter(m => m.role !== 'system').slice(-10),
        }),
      });
      const data = await res.json();
      setMessages(h => [...h, { role: 'assistant', content: data.reply }]);
    } catch {
      setError('Could not reach AI — is the backend running?');
    }
    setLoading(false);
    setTimeout(() => inputRef.current?.focus(), 100);
  };

  const clear = () => setMessages([
    { role: 'assistant', content: '👋 Fresh start! What would you like to know?' }
  ]);

  return (
    <div className="flex flex-col h-full bg-[#0b0c10] text-white">
      {/* Header */}
      <div className="px-5 pt-6 pb-3 shrink-0 flex items-center justify-between border-b border-[#1a1b23]">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-500/30">
            <Sparkles className="w-5 h-5 text-white"/>
          </div>
          <div>
            <h1 className="text-[17px] font-bold text-white">AI Assistant</h1>
            <p className="text-gray-500 text-[11px]">Knows your tasks, expenses & more</p>
          </div>
        </div>
        <button onClick={clear} className="text-gray-600 hover:text-white transition-colors p-1">
          <RotateCcw className="w-4 h-4"/>
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto scrollbar-hide px-4 py-4 space-y-3">
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            {m.role === 'assistant' && (
              <div className="w-7 h-7 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center mr-2 mt-1 shrink-0">
                <Zap className="w-3.5 h-3.5 text-white"/>
              </div>
            )}
            <div className={`max-w-[82%] px-4 py-3 rounded-2xl text-[14px] leading-relaxed whitespace-pre-wrap
              ${m.role === 'user'
                ? 'bg-indigo-500 text-white rounded-tr-sm'
                : 'bg-[#14151b] text-gray-100 border border-[#2a2b36] rounded-tl-sm'}`}>
              {m.content}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="w-7 h-7 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center mr-2 mt-1 shrink-0">
              <Zap className="w-3.5 h-3.5 text-white"/>
            </div>
            <TypingDots/>
          </div>
        )}

        {error && (
          <div className="text-red-400 text-xs text-center bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2">
            {error}
          </div>
        )}
        <div ref={bottomRef}/>
      </div>

      {/* Suggestion chips */}
      {messages.length <= 1 && (
        <div className="px-4 pb-2 shrink-0">
          <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1">
            {SUGGESTIONS.map((s, i) => (
              <button key={i} onClick={() => send(s.replace(/ [^\s]+$/, '')
                  .replace(/[💸✅📊📝🔔📉]/g, '').trim())}
                className="shrink-0 text-xs px-3 py-2 rounded-full bg-[#14151b] border border-[#2a2b36] text-gray-300 hover:border-indigo-400 hover:text-white transition-colors whitespace-nowrap">
                {s}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Input bar */}
      <div className="px-4 pb-5 shrink-0">
        <div className="flex items-center gap-2 bg-[#14151b] border border-[#2a2b36] focus-within:border-indigo-400 rounded-2xl px-4 py-3 transition-colors">
          <input
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && send()}
            placeholder="Ask anything about your data…"
            className="flex-1 bg-transparent outline-none text-white text-[14px] placeholder-gray-600"
          />
          {input && <button onClick={() => setInput('')} className="text-gray-600 hover:text-white"><X className="w-4 h-4"/></button>}
          <button onClick={() => send()} disabled={!input.trim() || loading}
            className={`p-1.5 rounded-xl transition-all ${input.trim() && !loading ? 'bg-indigo-500 hover:bg-indigo-400 text-white' : 'text-gray-700'}`}>
            <Send className="w-4 h-4"/>
          </button>
        </div>
      </div>

      <style>{`
        @keyframes bounce {
          0%, 60%, 100% { transform: translateY(0); }
          30% { transform: translateY(-5px); }
        }
      `}</style>
    </div>
  );
}
