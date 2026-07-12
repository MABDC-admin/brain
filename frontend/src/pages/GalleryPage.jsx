import React, { useState, useEffect, useCallback } from 'react';
import { ChevronLeft, Images, X, ZoomIn } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const API = import.meta.env.PROD ? 'https://brain.mabdc.com' : 'https://brain.mabdc.com';

export default function GalleryPage() {
  const [items,    setItems]    = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [selected, setSelected] = useState(null);
  const navigate = useNavigate();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const all = await fetch(`${API}/items`).then(r => r.json());
      setItems(all.filter(i => i.image_url));
    } catch {
      setItems([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // Group by date via subtitle
  const groups = {};
  items.forEach(i => {
    const dateKey = i.subtitle?.split('•')[1]?.trim() || 'Unknown date';
    groups[dateKey] = groups[dateKey] || [];
    groups[dateKey].push(i);
  });

  return (
    <div className="flex flex-col h-full bg-[#0b0c10] text-white">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 pt-6 pb-4 shrink-0">
        <button onClick={() => navigate(-1)} className="text-gray-400 hover:text-white transition-colors">
          <ChevronLeft className="w-6 h-6"/>
        </button>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <Images className="w-5 h-5 text-indigo-400"/> Scanned Documents
          </h1>
          <p className="text-gray-500 text-xs">{items.length} document{items.length !== 1 ? 's' : ''}</p>
        </div>
      </div>

      {loading && (
        <div className="flex-1 flex items-center justify-center">
          <svg className="animate-spin h-8 w-8 text-indigo-400" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
          </svg>
        </div>
      )}

      {!loading && items.length === 0 && (
        <div className="flex-1 flex flex-col items-center justify-center text-gray-600 px-8 text-center">
          <Images className="w-16 h-16 mb-4 opacity-20"/>
          <p className="font-semibold text-lg mb-1">No scanned documents yet</p>
          <p className="text-sm text-gray-700">Scan receipts, notes, or documents using the camera button on the home screen.</p>
        </div>
      )}

      {!loading && items.length > 0 && (
        <div className="flex-1 overflow-y-auto scrollbar-hide px-4 pb-4">
          {Object.entries(groups).map(([date, groupItems]) => (
            <div key={date} className="mb-5">
              <p className="text-xs text-gray-500 font-semibold uppercase tracking-wider mb-2 px-1">{date}</p>
              <div className="grid grid-cols-2 gap-2">
                {groupItems.map(item => (
                  <button key={item.id} onClick={() => setSelected(item)}
                    className="relative aspect-square rounded-2xl overflow-hidden bg-[#14151b] border border-[#2a2b36] group">
                    <img src={item.image_url} alt={item.title}
                      className="w-full h-full object-cover transition-transform group-hover:scale-105 duration-300"/>
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
                      <ZoomIn className="w-7 h-7 text-white opacity-0 group-hover:opacity-100 transition-opacity"/>
                    </div>
                    <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent px-2 py-2">
                      <p className="text-white text-xs font-medium truncate">{item.title}</p>
                      <p className="text-gray-300 text-[10px]">{item.type}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Lightbox */}
      {selected && (
        <div className="fixed inset-0 z-[200] bg-black/95 flex flex-col" onClick={() => setSelected(null)}>
          <div className="flex items-center justify-between px-5 pt-5 pb-3 shrink-0" onClick={e => e.stopPropagation()}>
            <div>
              <p className="text-white font-bold">{selected.title}</p>
              <p className="text-gray-400 text-xs">{selected.subtitle}</p>
            </div>
            <button onClick={() => setSelected(null)} className="text-gray-400 hover:text-white p-1">
              <X className="w-6 h-6"/>
            </button>
          </div>
          <div className="flex-1 flex items-center justify-center p-4">
            <img src={selected.image_url} alt={selected.title}
              className="max-w-full max-h-full object-contain rounded-2xl"
              onClick={e => e.stopPropagation()}/>
          </div>
        </div>
      )}
    </div>
  );
}
