import React, { useState, useEffect } from 'react';
import { Calendar, ChevronLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const API = import.meta.env.PROD ? 'https://brain.mabdc.com' : 'https://brain.mabdc.com';

export default function TimelinePage({ workspace }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    fetch(`${API}/items?workspace=${encodeURIComponent(workspace || 'Personal')}`)
      .then(r => r.json())
      .then(data => {
        // Sort items by created_at ascending to show a true chronological timeline
        data.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
        setItems(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [workspace]);

  const TYPE_COLORS = { task: 'bg-green-500', reminder: 'bg-orange-500', expense: 'bg-blue-500', note: 'bg-purple-500', vault_file: 'bg-red-500' };

  return (
    <div className="flex flex-col h-full bg-[#0b0c10] text-white">
      <div className="p-6 pb-4 shrink-0 bg-[#14151b] border-b border-[#2a2b36] flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="w-10 h-10 rounded-full bg-[#1e1f28] flex items-center justify-center text-gray-400 hover:text-white transition-colors">
          <ChevronLeft className="w-6 h-6"/>
        </button>
        <div>
          <h1 className="text-xl font-bold text-white">Life Timeline</h1>
          <p className="text-gray-500 text-xs mt-0.5">Your entire history in {workspace}</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-hide p-6 relative">
        {loading ? (
          <div className="flex justify-center py-20"><div className="w-8 h-8 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin"/></div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-gray-500">
            <Calendar className="w-12 h-12 mb-3 opacity-30"/>
            <p>No history found.</p>
          </div>
        ) : (
          <div className="relative border-l-2 border-[#2a2b36] ml-4 space-y-8 pb-20">
            {items.map((item) => {
              const dateObj = new Date(item.created_at);
              const dateStr = dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
              const timeStr = dateObj.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
              
              return (
                <div key={item.id} className="relative pl-8">
                  <div className={`absolute -left-[9px] top-1 w-4 h-4 rounded-full border-4 border-[#0b0c10] ${TYPE_COLORS[item.type] || 'bg-gray-500'}`}></div>
                  <div className="flex flex-col mb-1">
                    <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">{dateStr} <span className="text-gray-600 font-normal ml-1">{timeStr}</span></span>
                  </div>
                  <div className="bg-[#14151b] border border-[#2a2b36] rounded-2xl p-4 shadow-lg inline-block w-full max-w-sm">
                    <h3 className={`text-[15px] font-semibold text-white ${item.is_locked ? 'italic text-gray-500' : ''}`}>
                      {item.is_locked ? 'Locked Entry' : item.title}
                    </h3>
                    {!item.is_locked && item.subtitle && (
                      <p className="text-gray-400 text-xs mt-1 leading-relaxed">{item.subtitle}</p>
                    )}
                    {item.expiry_date && (
                      <div className="mt-3 inline-block bg-red-500/10 border border-red-500/20 px-2 py-1 rounded-md text-[10px] font-bold text-red-400">
                        Expires: {item.expiry_date}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
