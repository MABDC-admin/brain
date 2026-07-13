import React, { useState, useEffect, useCallback } from 'react';
import { Search, MoreVertical, Pin, X, Trash2, ChevronLeft, Plus, Share2, QrCode } from 'lucide-react';
import SwipeableRow from '../components/SwipeableRow.jsx';

const API = import.meta.env.PROD ? 'https://brain.mabdc.com' : 'https://brain.mabdc.com';
const TABS = ['ALL', 'PINNED', 'TAGS'];

function NoteEditor({ note, onClose, onDelete }) {
  const [showQr, setShowQr] = React.useState(false);
  const shareText = `${note.title}\n${note.body || ''}`.trim();
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(shareText)}&size=220x220&bgcolor=0b0c10&color=a5b4fc`;

  const shareWhatsApp = () => {
    window.open(`https://wa.me/?text=${encodeURIComponent(shareText)}`, '_blank');
  };

  return (
    <div className="absolute inset-0 z-50 bg-[#0b0c10] flex flex-col page-enter">
      <div className="flex items-center px-5 pt-6 pb-4 border-b border-[#1a1b23] shrink-0">
        <button onClick={onClose} className="mr-4 text-gray-400 hover:text-white transition-colors">
          <ChevronLeft className="w-6 h-6"/>
        </button>
        <div className="flex-1">
          <p className="font-bold text-white text-lg">{note.title}</p>
          <p className="text-gray-500 text-xs">{note.subtitle}</p>
        </div>
        <button onClick={shareWhatsApp} className="text-gray-600 hover:text-green-400 ml-3 transition-colors" title="Share on WhatsApp">
          <Share2 className="w-5 h-5"/>
        </button>
        <button onClick={() => setShowQr(v => !v)} className={`ml-3 transition-colors ${showQr ? 'text-indigo-400' : 'text-gray-600 hover:text-indigo-400'}`} title="Show QR code">
          <QrCode className="w-5 h-5"/>
        </button>
        <button onClick={() => onDelete(note.id)} className="text-gray-600 hover:text-red-400 ml-3 transition-colors">
          <Trash2 className="w-5 h-5"/>
        </button>
      </div>
      {showQr && (
        <div className="mx-5 mt-4 p-4 bg-[#14151b] border border-[#2a2b36] rounded-2xl flex flex-col items-center">
          <p className="text-gray-500 text-xs mb-3">Scan to share this note</p>
          <img src={qrUrl} alt="QR Code" className="w-36 h-36 rounded-xl"/>
        </div>
      )}
      {note.expiry_date && (
        <div className="mx-5 mt-3">
          <span className="bg-red-500/20 text-red-400 text-xs px-3 py-1 rounded-full border border-red-500/30 font-semibold">
            Expires: {note.expiry_date}
          </span>
        </div>
      )}
      {note.image_url && (
        <div className="mx-5 mt-4 rounded-2xl overflow-hidden border border-[#2a2b36]">
          <img src={note.image_url} alt="Scanned" className="w-full h-auto object-contain max-h-52"/>
        </div>
      )}
      <div className="flex-1 p-5 overflow-y-auto scrollbar-hide">
        <p className="text-gray-300 text-[15px] leading-relaxed whitespace-pre-wrap">
          {note.body || 'No additional content. Created from the quick-add or scanned document.'}
        </p>
      </div>
    </div>
  );
}

export default function NotePage({ loadItems, workspace }) {
  const [tab,          setTab]         = useState('ALL');
  const [notes,        setNotes]       = useState([]);
  const [pinned,       setPinned]      = useState([]);
  const [showAdd,      setShowAdd]     = useState(false);
  const [selectedNote, setSelectedNote] = useState(null);
  const [form,         setForm]        = useState({ title: '', body: '' });
  const [saving,       setSaving]      = useState(false);
  const [searchOpen,   setSearchOpen]  = useState(false);
  const [searchQuery,  setSearchQuery] = useState('');

  const load = useCallback(() => {
    fetch(`${API}/items/type/note?workspace=${encodeURIComponent(workspace || 'Personal')}`)
      .then(r => r.json())
      .then(data => setNotes(data))
      .catch(() => setNotes([]));
  }, [workspace]);

  useEffect(() => { load(); }, [load, workspace]);

  const togglePin = (id) => setPinned(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]);

  const deleteNote = async (id) => {
    try { await fetch(`${API}/items/${id}`, { method: 'DELETE' }); } catch {}
    if (loadItems) loadItems();
    setNotes(p => p.filter(n => n.id !== id));
    setSelectedNote(null);
  };

  const addNote = async () => {
    if (!form.title.trim()) return;
    setSaving(true);
    // Close immediately
    setShowAdd(false);
    setForm({ title: '', body: '' });
    try {
      await fetch(`${API}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'note', title: form.title, subtitle: `Note • Today`, body: form.body, workspace: workspace || 'Personal' }),
      });
    } catch {}
    load();
    if (loadItems) loadItems();
    setSaving(false);
  };

  const allVisible = tab === 'PINNED' ? notes.filter(n => pinned.includes(n.id)) : notes;
  const visible = searchQuery.trim()
    ? allVisible.filter(n =>
        n.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        n.body?.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : allVisible;

  return (
    <div className="flex flex-col h-full bg-[#0b0c10] text-white relative">
      <div className="px-5 pt-6 pb-0 shrink-0">
        <div className="flex justify-between items-center mb-4">
          <h1 className="text-2xl font-bold text-purple-400">/note</h1>
          <div className="flex gap-3">
            <button onClick={() => { setSearchOpen(v => !v); setSearchQuery(''); }}>
              <Search className={`w-6 h-6 transition-colors ${searchOpen ? 'text-purple-400' : 'text-gray-500 hover:text-white'}`}/>
            </button>
            <MoreVertical className="w-6 h-6 text-gray-500"/>
          </div>
        </div>

        {searchOpen && (
          <div className="mb-3">
            <input
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search notes…"
              autoFocus
              className="w-full bg-[#14151b] border border-[#2a2b36] focus:border-purple-400 rounded-xl px-4 py-2.5 text-white text-sm outline-none transition-colors placeholder-gray-600"
            />
          </div>
        )}

        {/* Tabs */}
        <div className="flex border-b border-[#1a1b23] mb-0">
          {TABS.map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`flex-1 py-2.5 text-xs font-semibold tracking-wide transition-colors ${tab === t ? 'text-white border-b-2 border-purple-500' : 'text-gray-600'}`}>
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* Notes grid / list */}
      <div className="flex-1 overflow-y-auto scrollbar-hide px-5 pt-4">
        {visible.length === 0 && (
          <div className="text-center py-12">
            <p className="text-4xl mb-3">📝</p>
            <p className="text-gray-400 font-semibold">No notes yet</p>
            <p className="text-gray-600 text-sm mt-1">Tap + to write your first note</p>
          </div>
        )}
        <div className="space-y-2">
          {visible.map((note) => (
            <SwipeableRow key={note.id} onDelete={() => deleteNote(note.id)}>
              <div onClick={() => setSelectedNote(note)}
                className="bg-[#14151b] rounded-2xl px-4 py-4 border border-[#2a2b36] cursor-pointer hover:bg-[#1a1b23] transition-all">
                <div className="flex items-start justify-between mb-1">
                  <p className="font-semibold text-white text-[15px] flex-1 pr-3 leading-tight">{note.title}</p>
                  <button onClick={e => { e.stopPropagation(); togglePin(note.id); }}
                    className={`shrink-0 transition-colors ${pinned.includes(note.id) ? 'text-yellow-400' : 'text-gray-700 hover:text-gray-400'}`}>
                    <Pin className="w-4 h-4"/>
                  </button>
                </div>
                {note.body && (
                  <p className="text-gray-500 text-[13px] leading-relaxed line-clamp-2 mb-2">{note.body}</p>
                )}
                <div className="flex items-center justify-between">
                  <p className="text-gray-700 text-[11px]">{note.subtitle?.split('•')[1]?.trim()}</p>
                  {note.expiry_date && (
                    <span className="bg-red-500/20 text-red-400 text-[9px] px-2 py-0.5 rounded-full border border-red-500/20 font-semibold">
                      Exp: {note.expiry_date}
                    </span>
                  )}
                </div>
              </div>
            </SwipeableRow>
          ))}
        </div>
      </div>

      {/* Add button */}
      <div className="px-5 pt-3 pb-5 shrink-0">
        <button onClick={() => setShowAdd(true)}
          className="w-full py-4 rounded-full font-semibold text-white flex items-center justify-center gap-2 transition-all hover:opacity-90 active:scale-[0.98]"
          style={{ background: 'linear-gradient(135deg, #a855f7, #7c3aed)' }}>
          <Plus className="w-5 h-5"/> New Note
        </button>
      </div>

      {/* Add Note Modal */}
      {showAdd && (
        <div className="absolute inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end" onClick={() => setShowAdd(false)}>
          <div className="bg-[#0f1015] rounded-t-3xl w-full p-6 border border-[#2a2b36]" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-5">
              <h3 className="text-lg font-bold text-white">New Note</h3>
              <button onClick={() => setShowAdd(false)}><X className="w-5 h-5 text-gray-400"/></button>
            </div>
            <div className="space-y-3">
              <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                placeholder="Note title..." autoFocus
                className="w-full bg-[#1a1b23] border border-[#2a2b36] focus:border-purple-400 rounded-xl px-4 py-3 text-white outline-none transition-colors"/>
              <textarea value={form.body} onChange={e => setForm(f => ({ ...f, body: e.target.value }))}
                placeholder="Write something..." rows={4}
                className="w-full bg-[#1a1b23] border border-[#2a2b36] focus:border-purple-400 rounded-xl px-4 py-3 text-white outline-none resize-none transition-colors text-[14px] leading-relaxed"/>
              <button onClick={addNote} disabled={saving || !form.title.trim()}
                className="w-full py-3 rounded-xl font-semibold text-white disabled:opacity-40 transition-colors"
                style={{ background: 'linear-gradient(135deg, #a855f7, #7c3aed)' }}>
                {saving ? 'Saving…' : 'Save Note'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Note detail */}
      {selectedNote && (
        <NoteEditor note={selectedNote} onClose={() => setSelectedNote(null)} onDelete={deleteNote}/>
      )}
    </div>
  );
}
