import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, MoreVertical, FolderOpen, Check, Circle, ChevronRight, Trash2, X } from 'lucide-react';

const getLS = (k, def) => { try { return JSON.parse(localStorage.getItem(k)) ?? def; } catch { return def; } };
const setLS = (k, v)   => localStorage.setItem(k, JSON.stringify(v));

const COLORS = [
  { name: 'Indigo', value: '#6366f1' }, { name: 'Green',  value: '#22c55e' },
  { name: 'Blue',   value: '#3b82f6' }, { name: 'Orange', value: '#f97316' },
  { name: 'Purple', value: '#a855f7' }, { name: 'Pink',   value: '#ec4899' },
  { name: 'Teal',   value: '#14b8a6' }, { name: 'Red',    value: '#ef4444' },
];
const STATUSES = ['Planning', 'In Progress', 'On Hold', 'Done'];
const STATUS_COLOR = { Planning: 'text-gray-400', 'In Progress': 'text-blue-400', 'On Hold': 'text-orange-400', Done: 'text-green-400' };

export default function ProjectPage() {
  const [projects, setProjects] = useState(() => getLS('projects', [
    { id: 1, name: 'Dubai Launch',      color: '#6366f1', status: 'In Progress', tasks: 5, notes: 2, desc: 'Product launch campaign for Q3' },
    { id: 2, name: 'Website Redesign',  color: '#22c55e', status: 'Planning',    tasks: 3, notes: 1, desc: 'Full website revamp with new branding' },
    { id: 3, name: 'Investor Deck',     color: '#f97316', status: 'In Progress', tasks: 4, notes: 3, desc: 'Series A pitch preparation' },
  ]));
  const [showAdd,  setShowAdd]  = useState(false);
  const [selected, setSelected] = useState(null);
  const [form,     setForm]     = useState({ name: '', color: '#6366f1', status: 'Planning', desc: '' });

  const save = () => {
    if (!form.name.trim()) return;
    const newP = { id: Date.now(), name: form.name, color: form.color, status: form.status, desc: form.desc, tasks: 0, notes: 0 };
    const updated = [...projects, newP];
    setProjects(updated);
    setLS('projects', updated);
    setShowAdd(false);
    setForm({ name: '', color: '#6366f1', status: 'Planning', desc: '' });
  };

  const deleteProject = (id) => {
    const updated = projects.filter(p => p.id !== id);
    setProjects(updated);
    setLS('projects', updated);
    setSelected(null);
  };

  const updateStatus = (id, status) => {
    const updated = projects.map(p => p.id === id ? { ...p, status } : p);
    setProjects(updated);
    setLS('projects', updated);
    setSelected(p => p?.id === id ? { ...p, status } : p);
  };

  return (
    <div className="flex flex-col h-full bg-[#0b0c10] text-white relative">
      <div className="p-5 pb-3 shrink-0">
        <div className="flex justify-between items-center mb-4">
          <h1 className="text-2xl font-bold text-teal-400">/project</h1>
          <MoreVertical className="w-6 h-6 text-gray-500"/>
        </div>

        {/* Stats */}
        <div className="flex gap-2 mb-4">
          {[
            { label: 'Total',       value: projects.length },
            { label: 'In Progress', value: projects.filter(p => p.status === 'In Progress').length, color: 'text-blue-400' },
            { label: 'Done',        value: projects.filter(p => p.status === 'Done').length,        color: 'text-green-400' },
          ].map(s => (
            <div key={s.label} className="flex-1 bg-[#14151b] border border-[#2a2b36] rounded-xl py-2 px-1 text-center">
              <p className={`text-xl font-bold ${s.color || 'text-white'}`}>{s.value}</p>
              <p className="text-gray-600 text-[10px] font-medium">{s.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Project list */}
      <div className="flex-1 overflow-y-auto scrollbar-hide px-5 space-y-3">
        {projects.length === 0 && (
          <div className="text-center py-16 text-gray-600">
            <FolderOpen className="w-12 h-12 mx-auto mb-3 opacity-30"/>
            <p className="text-gray-400 font-semibold">No projects yet</p>
            <p className="text-sm mt-1">Tap + to create your first project</p>
          </div>
        )}
        {projects.map(p => (
          <button key={p.id} onClick={() => setSelected(p)}
            className="w-full bg-[#14151b] border border-[#2a2b36] rounded-2xl p-4 text-left hover:bg-[#1a1b23] transition-all active:scale-[0.98] group">
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: p.color + '33', border: `1.5px solid ${p.color}55` }}>
                  <FolderOpen className="w-5 h-5" style={{ color: p.color }}/>
                </div>
                <div>
                  <p className="text-white font-semibold text-[15px]">{p.name}</p>
                  {p.desc && <p className="text-gray-500 text-[12px] mt-0.5 truncate max-w-[180px]">{p.desc}</p>}
                </div>
              </div>
              <span className={`text-[11px] font-semibold ${STATUS_COLOR[p.status] || 'text-gray-400'}`}>{p.status}</span>
            </div>
            {/* Progress bar */}
            <div className="flex items-center gap-3">
              <div className="flex-1 h-1.5 bg-[#2a2b36] rounded-full overflow-hidden">
                <div className="h-full rounded-full transition-all"
                  style={{ width: p.status === 'Done' ? '100%' : p.status === 'In Progress' ? '55%' : '15%', backgroundColor: p.color }}/>
              </div>
              <span className="text-gray-600 text-[11px] shrink-0">{p.tasks} tasks · {p.notes} notes</span>
            </div>
          </button>
        ))}
      </div>

      {/* Add Button */}
      <div className="p-5 pt-3 shrink-0">
        <button onClick={() => setShowAdd(true)}
          className="w-full py-4 rounded-full font-semibold text-white flex items-center justify-center gap-2 transition-all hover:opacity-90 active:scale-[0.98]"
          style={{ background: 'linear-gradient(135deg, #14b8a6, #0d9488)' }}>
          <Plus className="w-5 h-5"/> New Project
        </button>
      </div>

      {/* Add Project Modal */}
      {showAdd && (
        <div className="absolute inset-0 z-50 bg-black/60 flex items-end justify-center" onClick={() => setShowAdd(false)}>
          <div className="bg-[#0f1015] rounded-t-3xl w-full p-6 border border-[#2a2b36]" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-5">
              <h3 className="text-lg font-bold text-white">New Project</h3>
              <button onClick={() => setShowAdd(false)}><X className="w-5 h-5 text-gray-400"/></button>
            </div>
            <div className="space-y-4">
              <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="Project name..." autoFocus
                className="w-full bg-[#1a1b23] border border-[#2a2b36] rounded-xl px-4 py-3 text-white outline-none focus:border-teal-400"/>
              <input value={form.desc} onChange={e => setForm(f => ({ ...f, desc: e.target.value }))}
                placeholder="Short description..."
                className="w-full bg-[#1a1b23] border border-[#2a2b36] rounded-xl px-4 py-3 text-white outline-none focus:border-teal-400"/>
              {/* Color picker */}
              <div>
                <p className="text-xs text-gray-400 font-medium mb-2">Color</p>
                <div className="flex gap-2 flex-wrap">
                  {COLORS.map(c => (
                    <button key={c.value} onClick={() => setForm(f => ({ ...f, color: c.value }))}
                      className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all ${form.color === c.value ? 'ring-2 ring-white ring-offset-2 ring-offset-[#0f1015] scale-110' : ''}`}
                      style={{ backgroundColor: c.value }}>
                      {form.color === c.value && <Check className="w-4 h-4 text-white"/>}
                    </button>
                  ))}
                </div>
              </div>
              {/* Status */}
              <div>
                <p className="text-xs text-gray-400 font-medium mb-2">Status</p>
                <div className="flex gap-2 flex-wrap">
                  {STATUSES.map(s => (
                    <button key={s} onClick={() => setForm(f => ({ ...f, status: s }))}
                      className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${form.status === s ? 'border-teal-400 bg-teal-400/10 text-teal-400' : 'border-[#2a2b36] text-gray-400'}`}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>
              <button onClick={save} disabled={!form.name.trim()}
                className="w-full py-3 rounded-xl font-semibold text-white disabled:opacity-40 transition-colors"
                style={{ background: 'linear-gradient(135deg, #14b8a6, #0d9488)' }}>
                Create Project
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Project Detail Overlay */}
      {selected && (
        <div className="absolute inset-0 z-50 bg-[#0b0c10] flex flex-col page-enter">
          <div className="px-5 pt-6 pb-4 border-b border-[#1a1b23] shrink-0 flex items-center justify-between">
            <button onClick={() => setSelected(null)} className="text-gray-400 hover:text-white"><X className="w-6 h-6"/></button>
            <button onClick={() => deleteProject(selected.id)} className="text-gray-600 hover:text-red-400 transition-colors"><Trash2 className="w-5 h-5"/></button>
          </div>
          <div className="flex-1 overflow-y-auto scrollbar-hide p-5">
            <div className="flex items-center gap-4 mb-6">
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center" style={{ backgroundColor: selected.color + '33', border: `2px solid ${selected.color}55` }}>
                <FolderOpen className="w-8 h-8" style={{ color: selected.color }}/>
              </div>
              <div>
                <h2 className="text-white text-2xl font-bold">{selected.name}</h2>
                {selected.desc && <p className="text-gray-500 text-sm mt-0.5">{selected.desc}</p>}
              </div>
            </div>

            {/* Status chooser */}
            <p className="text-xs text-gray-500 uppercase tracking-wider font-semibold mb-3">Status</p>
            <div className="flex gap-2 flex-wrap mb-6">
              {STATUSES.map(s => (
                <button key={s} onClick={() => updateStatus(selected.id, s)}
                  className={`px-4 py-2 rounded-xl text-sm font-medium border transition-all ${selected.status === s ? 'text-white border-transparent' : 'border-[#2a2b36] text-gray-400 hover:border-gray-500'}`}
                  style={selected.status === s ? { backgroundColor: selected.color + 'cc' } : {}}>
                  {selected.status === s && <Check className="inline w-3.5 h-3.5 mr-1"/>}{s}
                </button>
              ))}
            </div>

            {/* Stats */}
            <p className="text-xs text-gray-500 uppercase tracking-wider font-semibold mb-3">Overview</p>
            <div className="grid grid-cols-2 gap-3 mb-6">
              {[
                { label: 'Tasks', value: selected.tasks },
                { label: 'Notes', value: selected.notes },
                { label: 'Progress', value: selected.status === 'Done' ? '100%' : selected.status === 'In Progress' ? '55%' : '15%' },
                { label: 'Status',   value: selected.status },
              ].map(s => (
                <div key={s.label} className="bg-[#14151b] border border-[#2a2b36] rounded-2xl p-4 text-center">
                  <p className="text-white text-2xl font-bold">{s.value}</p>
                  <p className="text-gray-500 text-xs mt-0.5">{s.label}</p>
                </div>
              ))}
            </div>

            <div className="bg-[#14151b] border border-[#2a2b36] rounded-2xl p-4 text-center text-gray-500">
              <p className="text-sm">Task & note linking coming soon</p>
              <p className="text-xs mt-1">Tag items with this project from any workspace</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
