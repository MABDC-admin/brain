import React, { useState, useEffect, useRef } from 'react';
import { Search, X, CheckCircle2, Wallet, FileText, Bell, FolderOpen } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const API = import.meta.env.PROD ? 'https://brain.mabdc.com' : 'https://brain.mabdc.com';

const TYPE_META = {
  task:     { icon: CheckCircle2, color: 'text-green-500',  bg: 'bg-green-500',  to: '/tasks' },
  expense:  { icon: Wallet,       color: 'text-blue-400',   bg: 'bg-blue-500',   to: '/expenses' },
  note:     { icon: FileText,     color: 'text-purple-400', bg: 'bg-purple-500', to: '/notes' },
  reminder: { icon: Bell,         color: 'text-orange-400', bg: 'bg-orange-500', to: '/reminders' },
};

export default function SearchOverlay({ onClose }) {
  const [query,   setQuery]   = useState('');
  const [results, setResults] = useState([]);
  const [allItems, setAllItems] = useState([]);
  const inputRef  = useRef(null);
  const navigate  = useNavigate();

  // Load all items once
  useEffect(() => {
    fetch(`${API}/items`)
      .then(r => r.json())
      .then(setAllItems)
      .catch(() => setAllItems([]));
    setTimeout(() => inputRef.current?.focus(), 80);
  }, []);

  // Filter as user types
  useEffect(() => {
    const q = query.trim().toLowerCase();
    if (!q) { setResults([]); return; }
    const filtered = allItems.filter(i =>
      i.title?.toLowerCase().includes(q) ||
      i.subtitle?.toLowerCase().includes(q)
    ).slice(0, 30);
    setResults(filtered);
  }, [query, allItems]);

  const go = (item) => {
    navigate(TYPE_META[item.type]?.to || '/');
    onClose();
  };

  // Group by type
  const grouped = results.reduce((acc, item) => {
    acc[item.type] = acc[item.type] || [];
    acc[item.type].push(item);
    return acc;
  }, {});

  return (
    <div className="fixed inset-0 z-[200] bg-black/70 backdrop-blur-sm flex flex-col"
      onClick={onClose}>
      <div className="bg-[#0b0c10] flex flex-col flex-1 max-h-full"
        onClick={e => e.stopPropagation()}>

        {/* Search bar */}
        <div className="flex items-center gap-3 px-4 pt-5 pb-3 border-b border-[#1a1b23]">
          <Search className="w-5 h-5 text-gray-500 shrink-0"/>
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search tasks, expenses, notes…"
            className="flex-1 bg-transparent text-white text-[16px] outline-none placeholder-gray-600"
          />
          {query && (
            <button onClick={() => setQuery('')} className="text-gray-600 hover:text-white">
              <X className="w-5 h-5"/>
            </button>
          )}
          <button onClick={onClose} className="text-gray-400 hover:text-white text-sm font-medium ml-1">
            Cancel
          </button>
        </div>

        {/* Results */}
        <div className="flex-1 overflow-y-auto scrollbar-hide px-4 py-3">
          {!query && (
            <div className="text-center py-16 text-gray-600">
              <Search className="w-10 h-10 mx-auto mb-3 opacity-30"/>
              <p className="font-medium">Search across all workspaces</p>
              <p className="text-sm mt-1 text-gray-700">Tasks, expenses, notes, reminders</p>
            </div>
          )}

          {query && results.length === 0 && (
            <div className="text-center py-16 text-gray-600">
              <p className="font-medium">No results for "{query}"</p>
              <p className="text-sm mt-1 text-gray-700">Try a different keyword</p>
            </div>
          )}

          {Object.entries(grouped).map(([type, items]) => {
            const meta = TYPE_META[type] || {};
            const Icon = meta.icon || FolderOpen;
            return (
              <div key={type} className="mb-5">
                <div className="flex items-center gap-2 mb-2">
                  <div className={`w-4 h-4 rounded ${meta.bg} flex items-center justify-center`}>
                    <Icon className="w-2.5 h-2.5 text-white"/>
                  </div>
                  <p className="text-xs text-gray-500 font-semibold uppercase tracking-wider">{type}s</p>
                  <span className="text-xs text-gray-700">{items.length}</span>
                </div>
                <div className="bg-[#14151b] border border-[#2a2b36] rounded-2xl overflow-hidden">
                  {items.map((item, i) => {
                    // Highlight matching text
                    const highlight = (text) => {
                      if (!query || !text) return text;
                      const idx = text.toLowerCase().indexOf(query.toLowerCase());
                      if (idx === -1) return text;
                      return (
                        <>
                          {text.slice(0, idx)}
                          <mark className="bg-indigo-500/30 text-indigo-300 rounded px-0.5">{text.slice(idx, idx + query.length)}</mark>
                          {text.slice(idx + query.length)}
                        </>
                      );
                    };
                    return (
                      <button key={item.id} onClick={() => go(item)}
                        className={`w-full flex items-center px-4 py-3 text-left hover:bg-[#1e1f28] transition-colors ${i < items.length - 1 ? 'border-b border-[#2a2b36]' : ''}`}>
                        <Icon className={`w-4 h-4 ${meta.color} mr-3 shrink-0`}/>
                        <div className="flex-1 min-w-0">
                          <p className="text-white text-[14px] font-medium truncate">{highlight(item.title)}</p>
                          <p className="text-gray-500 text-[12px] truncate">{item.subtitle}</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
