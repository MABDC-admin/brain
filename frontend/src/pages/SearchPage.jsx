import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { Search, Mic, ArrowUpRight, X } from 'lucide-react';

const API = import.meta.env.PROD ? 'https://brain.mabdc.com' : 'https://brain.mabdc.com';
const FILTERS = ['Tasks', 'Notes', 'Expenses', 'Reminders', 'Vault'];
const TYPE_MAP = { Tasks: 'task', Notes: 'note', Expenses: 'expense', Reminders: 'reminder', Vault: 'vault_file' };

export default function SearchPage({ items }) {
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const initial  = searchParams.get('q') || '';

  const [query,         setQuery]         = useState(initial);
  const [activeFilters, setActiveFilters] = useState([]);
  const [allItems,      setAllItems]      = useState(items || []);

  // Fetch all items for cross-workspace search
  useEffect(() => {
    fetch(`${API}/items`)
      .then(r => r.json())
      .then(setAllItems)
      .catch(() => setAllItems(items || []));
  }, [items]);

  useEffect(() => {
    setQuery(new URLSearchParams(location.search).get('q') || '');
  }, [location.search]);

  const toggleFilter = (f) => setActiveFilters(p => p.includes(f) ? p.filter(x => x !== f) : [...p, f]);

  const filtered = query.length >= 1
    ? allItems.filter(i => {
        const typeMatch = activeFilters.length === 0 || activeFilters.some(f => i.type === TYPE_MAP[f]);
        const q = query.toLowerCase();
        
        if (i.is_locked) {
          // Locked items only match generic keywords to protect privacy
          return typeMatch && ('locked document'.includes(q) || 'secure'.includes(q));
        }

        const textMatch = (i.title && i.title.toLowerCase().includes(q)) ||
                          (i.subtitle && i.subtitle.toLowerCase().includes(q)) ||
                          (i.body && i.body.toLowerCase().includes(q));
        return typeMatch && textMatch;
      })
    : [];

  const TYPE_COLORS = { task: 'bg-green-500', reminder: 'bg-orange-500', expense: 'bg-blue-500', note: 'bg-purple-500', vault_file: 'bg-red-500' };
  const TYPE_LABELS = { task: 'Task', reminder: 'Reminder', expense: 'Expense', note: 'Note', vault_file: 'Vault' };

  return (
    <div className="p-6 flex flex-col h-full text-white">
      <div className="flex justify-between items-center mb-5">
        <h1 className="text-2xl font-bold text-indigo-400">/search</h1>
      </div>

      {/* Search Bar */}
      <div className="bg-[#14151b] rounded-2xl flex items-center px-4 py-3 mb-4 border border-[#2a2b36] focus-within:border-indigo-400 transition-colors">
        <Search className="w-5 h-5 text-gray-500 mr-3 shrink-0"/>
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          type="text"
          placeholder="Search across your data..."
          className="bg-transparent border-none outline-none flex-1 text-white placeholder-gray-600 text-[15px]"
          autoFocus
        />
        {query ? (
          <button onClick={() => setQuery('')} className="text-gray-500 hover:text-white ml-2"><X className="w-4 h-4"/></button>
        ) : (
          <Mic className="w-5 h-5 text-gray-500 ml-2"/>
        )}
      </div>

      {/* Filters */}
      <div className="mb-5">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Sources</p>
        <div className="flex flex-wrap gap-2">
          {FILTERS.map(f => (
            <button key={f} onClick={() => toggleFilter(f)}
              className={`px-4 py-2 rounded-full text-sm font-medium border transition-all ${
                activeFilters.includes(f)
                  ? 'bg-indigo-500 border-indigo-500 text-white shadow-lg shadow-indigo-500/20'
                  : 'border-[#2a2b36] text-gray-400 hover:border-indigo-400 hover:text-indigo-300'}`}>
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* Results or Recent */}
      {query.length >= 1 ? (
        <div className="flex-1 overflow-y-auto scrollbar-hide">
          {filtered.length > 0 ? (
            <>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                {filtered.length} result{filtered.length !== 1 ? 's' : ''}
                {activeFilters.length > 0 && ` in ${activeFilters.join(', ')}`}
              </p>
              <div className="space-y-2">
                {filtered.map(i => (
              <div key={i.id} className="bg-[#14151b] border border-[#2a2b36] rounded-2xl p-4 flex items-center justify-between">
                <div>
                  <h3 className={`text-[15px] font-semibold text-white ${i.is_locked ? 'italic text-gray-500' : ''}`}>
                    {i.is_locked ? 'Locked Document' : i.title}
                  </h3>
                  <div className="flex items-center gap-2 mt-1">
                    <span className={`w-2 h-2 rounded-full ${TYPE_COLORS[i.type]}`}/>
                    <span className="text-xs text-gray-500">{TYPE_LABELS[i.type]}</span>
                    {i.workspace && (
                      <>
                        <span className="text-gray-600">•</span>
                        <span className="text-xs text-indigo-400">{i.workspace}</span>
                      </>
                    )}
                  </div>
                </div>
                <button className="w-8 h-8 rounded-full bg-[#1e1f28] flex items-center justify-center text-gray-400 hover:text-white transition-colors">
                  <ArrowUpRight className="w-4 h-4"/>
                </button>
              </div>
            ))}</div></>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center py-16 text-gray-500">
              <Search className="w-12 h-12 mb-3 opacity-30"/>
              <p className="font-semibold text-gray-400">No results for "{query}"</p>
              <p className="text-sm mt-1">Try different keywords or remove filters</p>
            </div>
          )}
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto scrollbar-hide">
          {allItems.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">All items ({allItems.length})</p>
              <div className="space-y-2">
                {allItems.slice(0, 5).map((item, i) => (
                  <div key={i} className="bg-[#14151b] rounded-xl p-3 border border-[#2a2b36] flex items-center gap-3">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full text-white shrink-0 ${TYPE_COLORS[item.type] || 'bg-gray-500'}`}>
                      {TYPE_LABELS[item.type] || item.type}
                    </span>
                    <span className="text-white text-[14px] font-medium truncate">{item.title}</span>
                  </div>
                ))}
                {allItems.length > 5 && (
                  <p className="text-gray-600 text-center text-sm pt-1">+{allItems.length - 5} more — start typing to search</p>
                )}
              </div>
            </div>
          )}

          {allItems.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-gray-500">
              <Search className="w-12 h-12 mb-3 opacity-30"/>
              <p className="font-semibold text-gray-400">Nothing to search yet</p>
              <p className="text-sm mt-1">Add tasks, notes, expenses, reminders, or vault files.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
