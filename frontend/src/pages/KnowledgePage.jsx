import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { BookOpen, Filter, MoreVertical, Plus, Save, Search, Trash2, X } from 'lucide-react';

const API = import.meta.env.PROD ? 'https://brain.mabdc.com' : 'https://brain.mabdc.com';
const STATUSES = ['learning', 'reviewing', 'mastered'];

const emptyForm = { source: '', tags: '', summary: '', status: 'learning' };

function readBody(item) {
  try {
    const parsed = JSON.parse(item.body || '{}');
    return {
      source: parsed.source || item.title || '',
      tags: Array.isArray(parsed.tags) ? parsed.tags : [],
      summary: parsed.summary || '',
      status: parsed.status || 'learning',
    };
  } catch {
    return { source: item.title || '', tags: [], summary: item.body || '', status: 'learning' };
  }
}

function tagsFromInput(value) {
  return value.split(',').map(tag => tag.trim()).filter(Boolean);
}

function statusClass(status) {
  if (status === 'mastered') return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  if (status === 'reviewing') return 'bg-amber-50 text-amber-700 border-amber-200';
  return 'bg-sky-50 text-sky-700 border-sky-200';
}

export default function KnowledgePage({ loadItems, workspace }) {
  const [items, setItems] = useState([]);
  const [status, setStatus] = useState('all');
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [editing, setEditing] = useState({});
  const [saving, setSaving] = useState(false);

  const activeWorkspace = workspace || 'Personal';

  const load = useCallback(() => {
    fetch(`${API}/items/type/knowledge?workspace=${encodeURIComponent(activeWorkspace)}`)
      .then(r => r.json())
      .then(data => setItems(Array.isArray(data) ? data : []))
      .catch(() => setItems([]));
  }, [activeWorkspace]);

  useEffect(() => { load(); }, [load]);

  const visible = useMemo(() => (
    status === 'all' ? items : items.filter(item => readBody(item).status === status)
  ), [items, status]);

  const refreshAll = () => {
    load();
    if (loadItems) loadItems();
  };

  const itemPayload = (item, body) => ({
    type: 'knowledge',
    title: body.source || item.title,
    subtitle: `Knowledge - ${body.status}`,
    body: JSON.stringify(body),
    workspace: activeWorkspace,
  });

  const updateItem = async (item, body) => {
    const payload = itemPayload(item, body);
    let res = await fetch(`${API}/items/${item.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).catch(() => null);
    if (!res || !res.ok) {
      res = await fetch(`${API}/items/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }).catch(() => null);
    }
    if (!res || !res.ok) throw new Error('Update failed');
    return res.json();
  };

  const addKnowledge = async () => {
    if (!form.source.trim()) return;
    setSaving(true);
    const body = {
      source: form.source.trim(),
      tags: tagsFromInput(form.tags),
      summary: form.summary.trim(),
      status: form.status,
    };
    setShowAdd(false);
    setForm(emptyForm);
    try {
      await fetch(`${API}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'knowledge',
          title: body.source,
          subtitle: `Knowledge - ${body.status}`,
          body: JSON.stringify(body),
          workspace: activeWorkspace,
        }),
      });
      refreshAll();
    } catch {}
    setSaving(false);
  };

  const saveEdit = async (item) => {
    const current = readBody(item);
    const draft = editing[item.id] || {};
    const body = {
      ...current,
      summary: draft.summary ?? current.summary,
      status: draft.status ?? current.status,
    };
    setItems(prev => prev.map(row => row.id === item.id ? { ...row, ...itemPayload(item, body) } : row));
    setEditing(prev => {
      const next = { ...prev };
      delete next[item.id];
      return next;
    });
    try { await updateItem(item, body); refreshAll(); } catch {}
  };

  const deleteItem = async (id) => {
    setItems(prev => prev.filter(item => item.id !== id));
    try { await fetch(`${API}/items/${id}`, { method: 'DELETE' }); refreshAll(); } catch {}
  };

  return (
    <div className="flex h-full flex-col bg-[#f7f5ef] text-stone-950">
      <div className="shrink-0 px-5 pt-6">
        <div className="mb-5 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-stone-900">/knowledge</h1>
            <p className="mt-1 text-xs font-medium text-stone-500">Sources, summaries, and review state</p>
          </div>
          <div className="flex gap-3 text-stone-400">
            <Search className="h-6 w-6" />
            <MoreVertical className="h-6 w-6" />
          </div>
        </div>

        <div className="mb-4 flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
          {['all', ...STATUSES].map(option => (
            <button
              key={option}
              onClick={() => setStatus(option)}
              className={`shrink-0 rounded-full border px-3 py-2 text-xs font-bold capitalize transition-colors ${status === option ? 'border-stone-900 bg-stone-900 text-white' : 'border-stone-200 bg-white text-stone-500'}`}
            >
              <Filter className="mr-1 inline h-3 w-3" />
              {option}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-5 pb-4 scrollbar-hide">
        {visible.length === 0 && (
          <div className="rounded-2xl border border-dashed border-stone-300 bg-white/70 p-8 text-center">
            <BookOpen className="mx-auto mb-3 h-9 w-9 text-stone-400" />
            <p className="font-bold text-stone-700">No learning items here</p>
            <p className="mt-1 text-sm text-stone-500">Add a source and track it through review.</p>
          </div>
        )}

        <div className="space-y-3">
          {visible.map(item => {
            const body = readBody(item);
            const draft = editing[item.id] || {};
            const editSummary = draft.summary ?? body.summary;
            const editStatus = draft.status ?? body.status;
            return (
              <div key={item.id} className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
                <div className="mb-3 flex items-start gap-3">
                  <div className="rounded-xl bg-stone-100 p-2 text-stone-700">
                    <BookOpen className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-bold text-stone-900">{body.source}</p>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {body.tags.map(tag => (
                        <span key={tag} className="rounded-full bg-stone-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-stone-500">{tag}</span>
                      ))}
                    </div>
                  </div>
                  <button onClick={() => deleteItem(item.id)} className="rounded-full p-2 text-stone-300 hover:bg-red-50 hover:text-red-500">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>

                <textarea
                  value={editSummary}
                  onChange={e => setEditing(prev => ({ ...prev, [item.id]: { ...prev[item.id], summary: e.target.value } }))}
                  placeholder="Summary..."
                  rows={3}
                  className="w-full resize-none rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-sm leading-relaxed text-stone-800 outline-none focus:border-stone-400"
                />
                <div className="mt-3 flex items-center gap-2">
                  <select
                    value={editStatus}
                    onChange={e => setEditing(prev => ({ ...prev, [item.id]: { ...prev[item.id], status: e.target.value } }))}
                    className={`min-w-0 flex-1 rounded-xl border px-3 py-2 text-sm font-bold outline-none ${statusClass(editStatus)}`}
                  >
                    {STATUSES.map(option => <option key={option} value={option}>{option}</option>)}
                  </select>
                  <button onClick={() => saveEdit(item)} className="rounded-xl bg-stone-900 px-4 py-2 text-sm font-bold text-white">
                    <Save className="mr-1 inline h-4 w-4" />
                    Save
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="shrink-0 px-5 pb-5 pt-2">
        <button onClick={() => setShowAdd(true)} className="flex w-full items-center justify-center gap-2 rounded-full bg-stone-900 py-4 font-bold text-white">
          <Plus className="h-5 w-5" />
          Add Learning Item
        </button>
      </div>

      {showAdd && (
        <div className="absolute inset-0 z-50 flex items-end bg-black/50" onClick={() => setShowAdd(false)}>
          <div className="w-full rounded-t-3xl bg-white p-5" onClick={e => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-bold">Add learning item</h3>
              <button onClick={() => setShowAdd(false)}><X className="h-5 w-5 text-stone-400" /></button>
            </div>
            <div className="space-y-3">
              <input value={form.source} onChange={e => setForm(prev => ({ ...prev, source: e.target.value }))} placeholder="Source, course, book, link..." className="w-full rounded-xl border border-stone-200 px-4 py-3 outline-none focus:border-stone-500" autoFocus />
              <input value={form.tags} onChange={e => setForm(prev => ({ ...prev, tags: e.target.value }))} placeholder="Tags, comma separated" className="w-full rounded-xl border border-stone-200 px-4 py-3 outline-none focus:border-stone-500" />
              <textarea value={form.summary} onChange={e => setForm(prev => ({ ...prev, summary: e.target.value }))} placeholder="Summary..." rows={4} className="w-full resize-none rounded-xl border border-stone-200 px-4 py-3 outline-none focus:border-stone-500" />
              <select value={form.status} onChange={e => setForm(prev => ({ ...prev, status: e.target.value }))} className="w-full rounded-xl border border-stone-200 px-4 py-3 font-bold outline-none focus:border-stone-500">
                {STATUSES.map(option => <option key={option} value={option}>{option}</option>)}
              </select>
              <button onClick={addKnowledge} disabled={saving || !form.source.trim()} className="w-full rounded-xl bg-stone-900 py-3 font-bold text-white disabled:opacity-40">
                {saving ? 'Saving...' : 'Save Item'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
