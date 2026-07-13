import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Bell, CalendarDays, CheckCircle2, FileText, Filter, MoreVertical, Pencil, Plus, Search, Trash2, X } from 'lucide-react';
import SwipeableRow from '../components/SwipeableRow.jsx';
import { DEFAULT_RULES, getExpiryReminderDraft } from '../modules/rules.js';
import { useDeleteConfirmation } from '../hooks/useDeleteConfirmation.js';

const API = import.meta.env.PROD ? 'https://brain.mabdc.com' : 'https://brain.mabdc.com';
const FILTERS = ['all', 'expired', 'soon', 'valid'];
const DOCUMENT_TYPES = ['Passport', 'Visa', 'Emirates ID', 'License', 'Contract', 'Certificate', 'Other'];
const EMPTY_FORM = { title: '', documentType: 'Passport', owner: '', expiryDate: '', reference: '', notes: '' };

function parseBody(item) {
  try {
    const body = JSON.parse(item.body || '{}');
    return body && typeof body === 'object' && !Array.isArray(body) ? body : {};
  } catch {
    return {};
  }
}

function todayDate() {
  return new Date().toISOString().slice(0, 10);
}

function loadAutomationRules() {
  try {
    const stored = JSON.parse(localStorage.getItem('commandbrain_rules') || '[]');
    if (!Array.isArray(stored)) return DEFAULT_RULES;
    return DEFAULT_RULES.map(rule => ({ ...rule, ...(stored.find(item => item.id === rule.id) || {}) }));
  } catch {
    return DEFAULT_RULES;
  }
}

function daysUntil(date) {
  if (!date) return null;
  const start = new Date(`${todayDate()}T00:00:00`);
  const end = new Date(`${date}T00:00:00`);
  return Math.round((end - start) / 86400000);
}

function expiryStatus(date) {
  const days = daysUntil(date);
  if (days === null) return { key: 'valid', label: 'No expiry', tone: 'text-gray-500 bg-gray-50 border-gray-100' };
  if (days < 0) return { key: 'expired', label: `Expired ${Math.abs(days)}d ago`, tone: 'text-red-600 bg-red-50 border-red-100' };
  if (days <= 30) return { key: 'soon', label: days === 0 ? 'Expires today' : `Expires in ${days}d`, tone: 'text-amber-700 bg-amber-50 border-amber-100' };
  return { key: 'valid', label: `Valid ${days}d`, tone: 'text-emerald-700 bg-emerald-50 border-emerald-100' };
}

function subtitleFor(body) {
  return body.expiryDate ? `${body.documentType || 'Document'} • Expires ${body.expiryDate}` : `${body.documentType || 'Document'} • No expiry`;
}

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="text-xs text-gray-500 font-semibold mb-1 block">{label}</span>
      {children}
    </label>
  );
}

function DocumentModal({ document, onClose, onSave, saving }) {
  const body = document ? parseBody(document) : {};
  const [form, setForm] = useState(document ? { ...EMPTY_FORM, title: document.title || '', ...body } : EMPTY_FORM);
  const editing = Boolean(document);

  const submit = () => {
    if (!form.title.trim()) return;
    onSave({
      title: form.title.trim(),
      documentType: form.documentType,
      owner: form.owner.trim(),
      expiryDate: form.expiryDate,
      reference: form.reference.trim(),
      notes: form.notes.trim(),
    });
  };

  return (
    <div className="absolute inset-0 z-50 bg-black/60 flex items-end justify-center" onClick={onClose}>
      <div className="bg-[#0f172a] rounded-t-3xl w-full p-6 shadow-2xl border border-slate-700" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-5">
          <h3 className="text-lg font-bold text-white">{editing ? 'Edit Document' : 'Add Document'}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white"><X className="w-5 h-5"/></button>
        </div>
        <div className="space-y-3 max-h-[68vh] overflow-y-auto scrollbar-hide pr-1">
          <Field label="Document Name">
            <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              placeholder="e.g. Dennis passport" autoFocus
              className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white outline-none focus:border-sky-400"/>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Type">
              <select value={form.documentType} onChange={e => setForm(f => ({ ...f, documentType: e.target.value }))}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white outline-none focus:border-sky-400">
                {DOCUMENT_TYPES.map(type => <option key={type}>{type}</option>)}
              </select>
            </Field>
            <Field label="Owner">
              <input value={form.owner} onChange={e => setForm(f => ({ ...f, owner: e.target.value }))}
                placeholder="Owner" className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white outline-none focus:border-sky-400"/>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Expiry Date">
              <input type="date" value={form.expiryDate} onChange={e => setForm(f => ({ ...f, expiryDate: e.target.value }))}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white outline-none focus:border-sky-400"/>
            </Field>
            <Field label="Reference">
              <input value={form.reference} onChange={e => setForm(f => ({ ...f, reference: e.target.value }))}
                placeholder="Number or code" className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white outline-none focus:border-sky-400"/>
            </Field>
          </div>
          <Field label="Notes">
            <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              placeholder="Renewal steps, storage location, attachments..." rows={4}
              className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white outline-none resize-none focus:border-sky-400"/>
          </Field>
          <button onClick={submit} disabled={saving || !form.title.trim()}
            className="w-full py-3 rounded-xl bg-sky-500 hover:bg-sky-400 disabled:opacity-40 text-white font-semibold transition-colors">
            {saving ? 'Saving...' : editing ? 'Save Document' : 'Create Document'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function DocumentsPage({ loadItems, workspace }) {
  const [documents, setDocuments] = useState([]);
  const [filter, setFilter] = useState('all');
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState('');
  const { confirmDelete } = useDeleteConfirmation();

  const currentWorkspace = workspace || 'Personal';
  const load = useCallback(() => {
    fetch(`${API}/items/type/document?workspace=${encodeURIComponent(currentWorkspace)}`)
      .then(r => r.json())
      .then(data => setDocuments(Array.isArray(data) ? data : []))
      .catch(() => setDocuments([]));
  }, [currentWorkspace]);

  useEffect(() => { load(); }, [load]);

  const enriched = useMemo(() => documents.map(document => {
    const meta = parseBody(document);
    return { ...document, meta, status: expiryStatus(meta.expiryDate) };
  }), [documents]);

  const counts = useMemo(() => ({
    all: enriched.length,
    expired: enriched.filter(document => document.status.key === 'expired').length,
    soon: enriched.filter(document => document.status.key === 'soon').length,
    valid: enriched.filter(document => document.status.key === 'valid').length,
  }), [enriched]);

  const visible = enriched.filter(document => {
    const matchesFilter = filter === 'all' || document.status.key === filter;
    const needle = `${document.title || ''} ${document.meta.documentType || ''} ${document.meta.owner || ''} ${document.meta.reference || ''} ${document.meta.notes || ''}`.toLowerCase();
    return matchesFilter && needle.includes(query.trim().toLowerCase());
  });

  const saveDocument = async (data, document = editing) => {
    setSaving(true);
    const body = {
      documentType: data.documentType,
      owner: data.owner,
      expiryDate: data.expiryDate,
      reference: data.reference,
      notes: data.notes,
    };
    const payload = {
      type: 'document',
      title: data.title,
      subtitle: subtitleFor(body),
      body: JSON.stringify(body),
      workspace: currentWorkspace,
    };
    try {
      const response = await fetch(document ? `${API}/items/${document.id}` : `${API}/items`, {
        method: document ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!document && response.ok) {
        const savedDocument = await response.json();
        const reminder = getExpiryReminderDraft(savedDocument, loadAutomationRules());
        if (reminder) {
          await fetch(`${API}/items`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(reminder),
          });
        }
      }
    } catch {}
    setShowAdd(false);
    setEditing(null);
    setSaving(false);
    load();
    if (loadItems) loadItems();
  };

  const deleteDocument = async (id) => {
    setDocuments(p => p.filter(document => document.id !== id));
    try { await fetch(`${API}/items/${id}`, { method: 'DELETE' }); } catch {}
    if (loadItems) loadItems();
  };

  const createReminder = async (document) => {
    const due = document.meta.expiryDate || todayDate();
    try {
      await fetch(`${API}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'reminder',
          title: `Renew: ${document.title}`,
          subtitle: `Reminder • ${due}`,
          workspace: currentWorkspace,
        }),
      });
    } catch {}
    if (loadItems) loadItems();
  };

  return (
    <div className="flex flex-col h-full bg-[#020617] text-white relative">
      <div className="px-5 pt-6 pb-0 shrink-0">
        <div className="flex justify-between items-center mb-4">
          <h1 className="text-2xl font-bold text-sky-400">/documents</h1>
          <div className="flex gap-3">
            <Filter className="w-6 h-6 text-slate-500"/>
            <MoreVertical className="w-6 h-6 text-slate-500"/>
          </div>
        </div>
        <div className="relative mb-4">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-3"/>
          <input value={query} onChange={e => setQuery(e.target.value)}
            placeholder="Search documents..."
            className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-9 pr-4 py-2.5 text-sm text-white outline-none focus:border-sky-400 placeholder-slate-600"/>
        </div>
        <div className="grid grid-cols-4 gap-2 mb-4">
          {FILTERS.map(name => (
            <button key={name} onClick={() => setFilter(name)}
              className={`rounded-2xl px-2 py-3 border text-center transition-colors ${filter === name ? 'bg-sky-500 border-sky-400 text-white' : 'bg-slate-900 border-slate-800 text-slate-400'}`}>
              <p className="text-lg font-bold leading-none">{counts[name]}</p>
              <p className="text-[10px] font-semibold capitalize mt-1">{name}</p>
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-hide px-5">
        {visible.length === 0 && (
          <div className="text-center py-12 text-slate-500">
            <FileText className="w-10 h-10 mx-auto mb-3 text-slate-700"/>
            <p className="font-semibold">No documents here</p>
          </div>
        )}
        <div className="space-y-3">
          {visible.map(document => (
            <SwipeableRow key={document.id} onDelete={() => deleteDocument(document.id)} deleteTitle="Delete document?" deleteItemName={document.title}>
              <div className="bg-slate-900 border border-slate-800 rounded-2xl px-4 py-4">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-sky-500/10 text-sky-400 flex items-center justify-center shrink-0">
                    <FileText className="w-5 h-5"/>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-semibold text-white truncate">{document.title}</p>
                        <p className="text-[12px] text-slate-500">{document.subtitle || subtitleFor(document.meta)}</p>
                      </div>
                      <div className="flex gap-2 shrink-0">
                        <button onClick={() => createReminder(document)} className="text-slate-500 hover:text-orange-400" title="Create reminder">
                          <Bell className="w-4 h-4"/>
                        </button>
                        <button onClick={() => setEditing(document)} className="text-slate-500 hover:text-sky-400" title="Edit document">
                          <Pencil className="w-4 h-4"/>
                        </button>
                        <button onClick={() => confirmDelete({ title: 'Delete document?', itemName: document.title, onConfirm: () => deleteDocument(document.id) })} className="text-slate-500 hover:text-red-400" title="Delete document">
                          <Trash2 className="w-4 h-4"/>
                        </button>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 mt-3">
                      <span className={`text-[11px] font-bold px-2 py-1 rounded-full border ${document.status.tone}`}>
                        {document.status.key === 'valid' ? <CheckCircle2 className="w-3 h-3 inline mr-1"/> : <CalendarDays className="w-3 h-3 inline mr-1"/>}
                        {document.status.label}
                      </span>
                      {document.meta.owner && <span className="text-[11px] text-slate-400 bg-slate-800 px-2 py-1 rounded-full">{document.meta.owner}</span>}
                      {document.meta.reference && <span className="text-[11px] text-slate-500">Ref {document.meta.reference}</span>}
                    </div>
                    {document.meta.notes && <p className="text-[13px] text-slate-400 leading-relaxed mt-3 line-clamp-2">{document.meta.notes}</p>}
                  </div>
                </div>
              </div>
            </SwipeableRow>
          ))}
        </div>
      </div>

      <div className="px-5 pt-3 pb-5 shrink-0">
        <button onClick={() => setShowAdd(true)}
          className="w-full py-4 rounded-full bg-sky-500 hover:bg-sky-400 transition-colors font-semibold text-white flex items-center justify-center gap-2">
          <Plus className="w-5 h-5"/> Add Document
        </button>
      </div>

      {showAdd && <DocumentModal saving={saving} onClose={() => setShowAdd(false)} onSave={data => saveDocument(data, null)} />}
      {editing && <DocumentModal document={editing} saving={saving} onClose={() => setEditing(null)} onSave={data => saveDocument(data, editing)} />}
    </div>
  );
}
