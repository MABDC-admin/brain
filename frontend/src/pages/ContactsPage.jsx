import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Bell, CalendarClock, Mail, MoreVertical, Pencil, Phone, Plus, Search, Trash2, User, X } from 'lucide-react';
import SwipeableRow from '../components/SwipeableRow.jsx';
import { useDeleteConfirmation } from '../hooks/useDeleteConfirmation.js';

const API = import.meta.env.PROD ? 'https://brain.mabdc.com' : 'https://brain.mabdc.com';
const EMPTY_FORM = { title: '', phone: '', email: '', notes: '', lastContacted: '', nextFollowUp: '' };

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

function isOverdue(date) {
  if (!date) return false;
  return date < todayDate();
}

function subtitleFor(nextFollowUp) {
  return nextFollowUp ? `Contact • Follow up ${nextFollowUp}` : 'Contact';
}

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="text-xs text-gray-500 font-semibold mb-1 block">{label}</span>
      {children}
    </label>
  );
}

function ContactModal({ contact, onClose, onSave, saving }) {
  const body = contact ? parseBody(contact) : {};
  const [form, setForm] = useState(contact ? { title: contact.title || '', ...EMPTY_FORM, ...body } : EMPTY_FORM);
  const editing = Boolean(contact);

  const submit = () => {
    if (!form.title.trim()) return;
    onSave({
      title: form.title.trim(),
      phone: form.phone.trim(),
      email: form.email.trim(),
      notes: form.notes.trim(),
      lastContacted: form.lastContacted,
      nextFollowUp: form.nextFollowUp,
    });
  };

  return (
    <div className="absolute inset-0 z-50 bg-black/60 flex items-end justify-center" onClick={onClose}>
      <div className="bg-white rounded-t-3xl w-full p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-5">
          <h3 className="text-lg font-bold text-black">{editing ? 'Edit Contact' : 'Add Contact'}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-black"><X className="w-5 h-5"/></button>
        </div>
        <div className="space-y-3 max-h-[68vh] overflow-y-auto scrollbar-hide pr-1">
          <Field label="Name">
            <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              placeholder="Contact name" autoFocus
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-black outline-none focus:border-cyan-500"/>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Phone">
              <input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                placeholder="+971..." className="w-full border border-gray-200 rounded-xl px-4 py-3 text-black outline-none focus:border-cyan-500"/>
            </Field>
            <Field label="Email">
              <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                placeholder="name@email.com" className="w-full border border-gray-200 rounded-xl px-4 py-3 text-black outline-none focus:border-cyan-500"/>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Last Contacted">
              <input type="date" value={form.lastContacted} onChange={e => setForm(f => ({ ...f, lastContacted: e.target.value }))}
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-black outline-none focus:border-cyan-500"/>
            </Field>
            <Field label="Next Follow-up">
              <input type="date" value={form.nextFollowUp} onChange={e => setForm(f => ({ ...f, nextFollowUp: e.target.value }))}
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-black outline-none focus:border-cyan-500"/>
            </Field>
          </div>
          <Field label="Notes">
            <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              placeholder="Relationship, context, next action..." rows={4}
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-black outline-none resize-none focus:border-cyan-500"/>
          </Field>
          <button onClick={submit} disabled={saving || !form.title.trim()}
            className="w-full py-3 rounded-xl bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 text-white font-semibold transition-colors">
            {saving ? 'Saving...' : editing ? 'Save Contact' : 'Create Contact'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ContactsPage({ loadItems, workspace }) {
  const [contacts, setContacts] = useState([]);
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState('');
  const { confirmDelete } = useDeleteConfirmation();

  const currentWorkspace = workspace || 'Personal';
  const load = useCallback(() => {
    fetch(`${API}/items/type/contact?workspace=${encodeURIComponent(currentWorkspace)}`)
      .then(r => r.json())
      .then(data => setContacts(Array.isArray(data) ? data : []))
      .catch(() => setContacts([]));
  }, [currentWorkspace]);

  useEffect(() => { load(); }, [load]);

  const enriched = useMemo(() => contacts.map(contact => ({ ...contact, meta: parseBody(contact) })), [contacts]);
  const overdue = enriched.filter(contact => isOverdue(contact.meta.nextFollowUp));
  const visible = enriched.filter(contact => {
    const needle = `${contact.title || ''} ${contact.meta.phone || ''} ${contact.meta.email || ''} ${contact.meta.notes || ''}`.toLowerCase();
    return needle.includes(query.trim().toLowerCase());
  });

  const saveContact = async (data, contact = editing) => {
    setSaving(true);
    const payload = {
      type: 'contact',
      title: data.title,
      subtitle: subtitleFor(data.nextFollowUp),
      body: JSON.stringify({
        phone: data.phone,
        email: data.email,
        notes: data.notes,
        lastContacted: data.lastContacted,
        nextFollowUp: data.nextFollowUp,
      }),
      workspace: currentWorkspace,
    };
    try {
      await fetch(contact ? `${API}/items/${contact.id}` : `${API}/items`, {
        method: contact ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } catch {}
    setShowAdd(false);
    setEditing(null);
    setSaving(false);
    load();
    if (loadItems) loadItems();
  };

  const deleteContact = async (id) => {
    setContacts(p => p.filter(contact => contact.id !== id));
    try { await fetch(`${API}/items/${id}`, { method: 'DELETE' }); } catch {}
    if (loadItems) loadItems();
  };

  const createReminder = async (contact) => {
    const due = contact.meta.nextFollowUp || todayDate();
    try {
      await fetch(`${API}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'reminder',
          title: `Follow up: ${contact.title}`,
          subtitle: `Reminder • ${due}`,
          workspace: currentWorkspace,
        }),
      });
    } catch {}
    if (loadItems) loadItems();
  };

  return (
    <div className="flex flex-col h-full bg-white text-black relative">
      <div className="px-5 pt-6 pb-0 shrink-0">
        <div className="flex justify-between items-center mb-4">
          <h1 className="text-2xl font-bold text-cyan-700">/contacts</h1>
          <div className="flex gap-3">
            <Search className="w-6 h-6 text-gray-400"/>
            <MoreVertical className="w-6 h-6 text-gray-400"/>
          </div>
        </div>
        <input value={query} onChange={e => setQuery(e.target.value)}
          placeholder="Search contacts..."
          className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-cyan-500 mb-4"/>
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="bg-cyan-50 border border-cyan-100 rounded-2xl p-4">
            <p className="text-2xl font-bold text-cyan-800">{contacts.length}</p>
            <p className="text-xs font-semibold text-cyan-700">Contacts</p>
          </div>
          <div className="bg-red-50 border border-red-100 rounded-2xl p-4">
            <p className="text-2xl font-bold text-red-600">{overdue.length}</p>
            <p className="text-xs font-semibold text-red-500">Overdue follow-ups</p>
          </div>
        </div>
        {overdue.length > 0 && (
          <div className="mb-4">
            <p className="text-xs font-bold text-red-500 mb-2 uppercase tracking-wide">Overdue</p>
            <div className="flex gap-2 overflow-x-auto scrollbar-hide">
              {overdue.map(contact => (
                <button key={contact.id} onClick={() => setEditing(contact)}
                  className="shrink-0 px-3 py-2 rounded-xl bg-red-50 border border-red-100 text-left min-w-36">
                  <p className="text-sm font-semibold text-red-700 truncate">{contact.title}</p>
                  <p className="text-[11px] text-red-500">{contact.meta.nextFollowUp}</p>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-hide px-5">
        {visible.length === 0 && (
          <div className="text-center py-12 text-gray-400">
            <User className="w-10 h-10 mx-auto mb-3 text-gray-300"/>
            <p className="font-semibold">No contacts found</p>
          </div>
        )}
        <div className="space-y-3">
          {visible.map(contact => (
            <SwipeableRow key={contact.id} onDelete={() => deleteContact(contact.id)} deleteTitle="Delete contact?" deleteItemName={contact.title}>
              <div className="bg-white border border-gray-100 rounded-2xl px-4 py-4 shadow-sm">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-full bg-cyan-50 text-cyan-700 flex items-center justify-center shrink-0">
                    <User className="w-5 h-5"/>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-semibold text-black truncate">{contact.title}</p>
                        <p className={`text-[12px] ${isOverdue(contact.meta.nextFollowUp) ? 'text-red-500 font-semibold' : 'text-gray-500'}`}>
                          {contact.subtitle || subtitleFor(contact.meta.nextFollowUp)}
                        </p>
                      </div>
                      <div className="flex gap-2 shrink-0">
                        <button onClick={() => createReminder(contact)} className="text-gray-400 hover:text-orange-500" title="Create reminder">
                          <Bell className="w-4 h-4"/>
                        </button>
                        <button onClick={() => setEditing(contact)} className="text-gray-400 hover:text-cyan-600" title="Edit contact">
                          <Pencil className="w-4 h-4"/>
                        </button>
                        <button onClick={() => confirmDelete({ title: 'Delete contact?', itemName: contact.title, onConfirm: () => deleteContact(contact.id) })} className="text-gray-400 hover:text-red-500" title="Delete contact">
                          <Trash2 className="w-4 h-4"/>
                        </button>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3 text-[12px] text-gray-500">
                      {contact.meta.phone && <span className="flex items-center gap-1"><Phone className="w-3 h-3"/>{contact.meta.phone}</span>}
                      {contact.meta.email && <span className="flex items-center gap-1"><Mail className="w-3 h-3"/>{contact.meta.email}</span>}
                      {contact.meta.lastContacted && <span className="flex items-center gap-1"><CalendarClock className="w-3 h-3"/>Last {contact.meta.lastContacted}</span>}
                    </div>
                    {contact.meta.notes && <p className="text-[13px] text-gray-600 leading-relaxed mt-3 line-clamp-2">{contact.meta.notes}</p>}
                  </div>
                </div>
              </div>
            </SwipeableRow>
          ))}
        </div>
      </div>

      <div className="px-5 pt-3 pb-5 shrink-0">
        <button onClick={() => setShowAdd(true)}
          className="w-full py-4 rounded-full bg-cyan-600 hover:bg-cyan-500 transition-colors font-semibold text-white flex items-center justify-center gap-2">
          <Plus className="w-5 h-5"/> Add Contact
        </button>
      </div>

      {showAdd && <ContactModal saving={saving} onClose={() => setShowAdd(false)} onSave={data => saveContact(data, null)} />}
      {editing && <ContactModal contact={editing} saving={saving} onClose={() => setEditing(null)} onSave={data => saveContact(data, editing)} />}
    </div>
  );
}
