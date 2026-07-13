import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Search, MoreVertical, List, Calendar, FolderOpen, Filter, X, Plus, ChevronDown, GripVertical, ChevronLeft, ChevronRight, Pencil } from 'lucide-react';
import SwipeableRow from '../components/SwipeableRow.jsx';
import Confetti from '../components/Confetti.jsx';
import UndoToast from '../components/UndoToast.jsx';
import { useHaptic } from '../hooks/useHaptic.js';
import { useDeleteConfirmation } from '../hooks/useDeleteConfirmation.js';

const API = import.meta.env.PROD ? 'https://brain.mabdc.com' : 'https://brain.mabdc.com';
const PRIORITY_COLOR = { High: 'text-red-500', Medium: 'text-orange-400', Low: 'text-blue-400' };
const TABS = ['OPEN', 'TODAY', 'OVERDUE', 'DONE'];
const EMPTY_FORM = { title: '', due: '', priority: '', subtasks: [''] };

function parseTaskBody(task) {
  try {
    const parsed = JSON.parse(task.body || '');
    if (Array.isArray(parsed)) return { subtasks: parsed, priority: task.priority || '', due: '' };
    if (parsed && typeof parsed === 'object') {
      return {
        subtasks: Array.isArray(parsed.subtasks) ? parsed.subtasks : [],
        priority: parsed.priority || task.priority || '',
        due: parsed.due || '',
      };
    }
  } catch {}
  return { subtasks: [], priority: task.priority || '', due: '' };
}

function dueSubtitle(due) {
  return due ? `Due ${new Date(due).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}` : 'No due date';
}

export default function TaskPage({ loadItems, workspace }) {
  const [tab,       setTab]      = useState('OPEN');
  const [tasks,     setTasks]    = useState([]);
  const [showAdd,   setShowAdd]  = useState(false);
  const [editingTask, setEditingTask] = useState(null);
  const [form,      setForm]     = useState(EMPTY_FORM);
  const [saving,    setSaving]   = useState(false);
  const [done,      setDone]     = useState([]);
  const [confetti,  setConfetti] = useState(null); // { x, y }
  const [expanded,  setExpanded] = useState(null);
  const [showCalendar, setShowCalendar] = useState(false);
  const [selected,  setSelected] = useState([]); // multi-select IDs
  const [selecting, setSelecting] = useState(false); // multi-select mode
  const [undoData,  setUndoData]  = useState(null); // { item, confirmFn }
  const dragItem      = useRef(null);
  const dragOverItem  = useRef(null);
  const longPressRef  = useRef(null);
  const haptic = useHaptic();
  const { confirmDelete } = useDeleteConfirmation();

  const load = useCallback(() => {
    fetch(`${API}/items/type/task?workspace=${encodeURIComponent(workspace || 'Personal')}`)
      .then(r => r.json())
      .then(data => setTasks(data))
      .catch(() => setTasks([]));
  }, [workspace]);

  useEffect(() => { load(); }, [load, workspace]);

  const toggle = (id, e) => {
    const rect = e?.currentTarget?.getBoundingClientRect();
    const parentRect = e?.currentTarget?.closest('.task-list-container')?.getBoundingClientRect();
    if (!done.includes(id)) {
      haptic.success();
      if (rect && parentRect) {
        setConfetti({ x: rect.left - parentRect.left + rect.width / 2, y: rect.top - parentRect.top + rect.height / 2 });
        setTimeout(() => setConfetti(null), 1500);
      }
    } else {
      haptic.tap();
    }
    setDone(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]);
  };

  const deleteTask = async (id) => {
    haptic.delete();
    const item = tasks.find(t => t.id === id);
    setTasks(p => p.filter(t => t.id !== id)); // optimistic
    setUndoData({
      item,
      confirmFn: async () => {
        try { await fetch(`${API}/items/${id}`, { method: 'DELETE' }); } catch {}
        if (loadItems) loadItems();
      }
    });
  };

  // Multi-select
  const startSelect   = (id) => { haptic.success(); setSelecting(true); setSelected([id]); };
  const toggleSelect  = (id) => setSelected(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]);
  const markBulkDone  = () => { setDone(p => [...new Set([...p, ...selected])]); haptic.success(); setSelecting(false); setSelected([]); };
  const deleteBulk    = () => {
    confirmDelete({
      title: 'Delete selected tasks?',
      itemName: `${selected.length} selected`,
      onConfirm: () => {
        selected.forEach(id => deleteTask(id));
        setSelecting(false); setSelected([]);
      },
    });
  };

  const onLongPress = (id) => {
    clearTimeout(longPressRef.current);
    longPressRef.current = setTimeout(() => startSelect(id), 380);
  };
  const cancelLongPress = () => clearTimeout(longPressRef.current);

  const handleDragStart = (i) => { dragItem.current = i; };
  const handleDragEnter = (i) => { dragOverItem.current = i; };
  const handleDragEnd   = () => {
    if (dragItem.current === null || dragOverItem.current === null) return;
    const copy = [...tasks];
    const dragged = copy.splice(dragItem.current, 1)[0];
    copy.splice(dragOverItem.current, 0, dragged);
    dragItem.current = null; dragOverItem.current = null;
    setTasks(copy);
    haptic.tap();
  };

  const closeTaskSheet = () => {
    setShowAdd(false);
    setEditingTask(null);
    setForm(EMPTY_FORM);
  };

  const openNewTask = () => {
    setEditingTask(null);
    setForm(EMPTY_FORM);
    setShowAdd(true);
  };

  const openTaskEditor = (task, event) => {
    event?.stopPropagation();
    const meta = parseTaskBody(task);
    setEditingTask(task);
    setForm({
      title: task.title || '',
      due: meta.due || '',
      priority: meta.priority || '',
      subtasks: meta.subtasks.length ? meta.subtasks : [''],
    });
    setShowAdd(true);
  };

  const saveTask = async () => {
    if (!form.title.trim()) return;
    setSaving(true);
    const targetTask = editingTask;
    closeTaskSheet();
    const dueStr   = dueSubtitle(form.due);
    const subtitle = `Task • ${dueStr}`;
    const subtasks = form.subtasks.filter(s => s.trim());
    const body = {
      type: 'task',
      title: form.title.trim(),
      subtitle,
      workspace: workspace || 'Personal',
      body: JSON.stringify({ subtasks, priority: form.priority || '', due: form.due || '' }),
    };
    try {
      await fetch(targetTask ? `${API}/items/${targetTask.id}` : `${API}/items`, {
        method: targetTask ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    } catch {}
    load();
    if (loadItems) loadItems();
    setSaving(false);
  };

  const isToday   = (sub) => sub?.toLowerCase().includes('today');
  const isOverdue = (sub) => { const m = sub?.match(/Due (\d+ \w+)/); if (!m) return false; return new Date(m[1] + ' ' + new Date().getFullYear()) < new Date(); };

  // Calendar helpers
  const getDaysInMonth = (y, m) => new Date(y, m + 1, 0).getDate();
  const getFirstDay    = (y, m) => new Date(y, m, 1).getDay();
  const [calDate, setCalDate] = useState(new Date());
  const calY = calDate.getFullYear(), calM = calDate.getMonth();
  const tasksByDay = {};
  tasks.forEach(t => {
    const m = t.subtitle?.match(/(\d{1,2}) (\w+)/);
    if (m) {
      const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
      const mi = months.indexOf(m[2]);
      if (mi === calM) tasksByDay[parseInt(m[1])] = (tasksByDay[parseInt(m[1])] || 0) + 1;
    }
  });

  const visible = tasks.filter(t => {
    const isDone = done.includes(t.id);
    if (tab === 'DONE')    return isDone;
    if (isDone)            return false;
    if (tab === 'TODAY')   return isToday(t.subtitle);
    if (tab === 'OVERDUE') return isOverdue(t.subtitle);
    return true;
  });

  const parseSubtasks = (t) => parseTaskBody(t).subtasks;
  const [subDone, setSubDone] = useState({});

  return (
    <div className="flex flex-col h-full bg-white text-black">
      <div className="p-6 pb-0">
        <div className="flex justify-between items-center mb-4">
          <h1 className="text-2xl font-bold text-green-600">/task</h1>
          <div className="flex gap-3">
            <button onClick={() => setShowCalendar(v => !v)} className={showCalendar ? 'text-green-500' : 'text-gray-400 hover:text-black'}>
              <Calendar className="w-6 h-6"/>
            </button>
            <Search className="w-6 h-6 text-gray-400"/>
            <MoreVertical className="w-6 h-6 text-gray-400"/>
          </div>
        </div>
        <div className="flex border-b border-gray-200 mb-2">
          {TABS.map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`flex-1 py-2 text-xs font-semibold tracking-wide transition-colors ${tab === t ? 'text-black border-b-2 border-green-600' : 'text-gray-400'}`}>{t}</button>
          ))}
        </div>
      </div>

      {/* Calendar view overlay */}
      {showCalendar && (
        <div className="absolute inset-0 bg-white z-40 flex flex-col">
          <div className="flex items-center justify-between px-6 pt-6 pb-2">
            <button onClick={() => setCalDate(d => new Date(d.getFullYear(), d.getMonth() - 1, 1))}><ChevronLeft className="w-5 h-5 text-gray-500"/></button>
            <p className="font-bold text-black">{calDate.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}</p>
            <button onClick={() => setCalDate(d => new Date(d.getFullYear(), d.getMonth() + 1, 1))}><ChevronRight className="w-5 h-5 text-gray-500"/></button>
          </div>
          <div className="grid grid-cols-7 px-4 mb-1">
            {['S','M','T','W','T','F','S'].map((d,i) => <p key={i} className="text-center text-xs text-gray-400 font-semibold py-1">{d}</p>)}
          </div>
          <div className="grid grid-cols-7 px-4 gap-y-1 flex-1">
            {Array.from({ length: getFirstDay(calY, calM) }).map((_, i) => <div key={`e${i}`}/>)}
            {Array.from({ length: getDaysInMonth(calY, calM) }, (_, i) => i + 1).map(day => {
              const isToday = new Date().getDate() === day && new Date().getMonth() === calM && new Date().getFullYear() === calY;
              const count   = tasksByDay[day] || 0;
              return (
                <div key={day} className={`flex flex-col items-center py-1 rounded-xl ${isToday ? 'bg-green-50' : ''}`}>
                  <p className={`text-sm font-medium ${isToday ? 'text-green-600 font-bold' : 'text-gray-700'}`}>{day}</p>
                  {count > 0 && <div className="w-1.5 h-1.5 rounded-full bg-green-500 mt-0.5"/>}
                  {count > 1 && <p className="text-[9px] text-green-600 font-bold">{count}</p>}
                </div>
              );
            })}
          </div>
          <div className="px-6 pb-6">
            <button onClick={() => setShowCalendar(false)}
              className="w-full py-3 rounded-2xl bg-green-500 text-white font-semibold">Close Calendar</button>
          </div>
        </div>
      )}

      {/* Undo toast */}
      {undoData && (
        <UndoToast
          message={`"${undoData.item?.title?.slice(0, 28)}" deleted`}
          onUndo={() => { setTasks(p => undoData.item ? [...p, undoData.item] : p); setUndoData(null); }}
          onConfirm={() => undoData.confirmFn?.()}
          onDismiss={() => setUndoData(null)}
        />
      )}

      {/* Bulk action bar */}
      {selecting && (
        <div className="absolute bottom-0 left-0 right-0 z-40 bg-white border-t border-gray-200 px-4 py-3 flex items-center gap-3">
          <p className="flex-1 text-sm font-semibold text-gray-700">{selected.length} selected</p>
          <button onClick={markBulkDone} className="px-4 py-2 rounded-xl bg-green-500 text-white font-semibold text-sm">Mark Done</button>
          <button onClick={deleteBulk} className="px-4 py-2 rounded-xl bg-red-100 text-red-600 font-semibold text-sm">Delete</button>
          <button onClick={() => { setSelecting(false); setSelected([]); }} className="text-gray-400"><X className="w-5 h-5"/></button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto scrollbar-hide px-6 relative task-list-container">
        {/* Confetti burst */}
        {confetti && <Confetti x={confetti.x} y={confetti.y} onDone={() => setConfetti(null)}/>}

        {visible.length === 0 && (
          <div className="text-center py-12 text-gray-400">
            <p className="text-4xl mb-2">✅</p>
            <p className="font-medium">No tasks here</p>
          </div>
        )}
        {visible.map((t, idx) => {
          const subs    = parseSubtasks(t);
          const isOpen  = expanded === t.id;
          const isSel   = selected.includes(t.id);
          return (
            <SwipeableRow key={t.id} onDelete={() => deleteTask(t.id)} disabled={selecting} deleteTitle="Delete task?" deleteItemName={t.title}>
              <div className={`bg-white border-b border-gray-100 transition-colors ${isSel ? 'bg-green-50' : ''}`}
                draggable={!selecting}
                onDragStart={() => handleDragStart(idx)}
                onDragEnter={() => handleDragEnter(idx)}
                onDragEnd={handleDragEnd}
                onDragOver={e => e.preventDefault()}
              >
                <div
                  onClick={(e) => selecting ? toggleSelect(t.id) : toggle(t.id, e)}
                  onMouseDown={() => !selecting && onLongPress(t.id)}
                  onMouseUp={cancelLongPress}
                  onTouchStart={() => !selecting && onLongPress(t.id)}
                  onTouchEnd={cancelLongPress}
                  className="flex items-center py-3 cursor-pointer hover:bg-gray-50 transition-colors">
                  {selecting ? (
                    <div className={`w-6 h-6 rounded-full border-2 mr-4 ml-0 shrink-0 flex items-center justify-center transition-all ${isSel ? 'bg-green-500 border-green-500' : 'border-gray-300'}`}>
                      {isSel && <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7"/></svg>}
                    </div>
                  ) : (
                    <div className="text-gray-300 hover:text-gray-500 cursor-grab active:cursor-grabbing mr-2 touch-none" onClick={e => e.stopPropagation()}>
                      <GripVertical className="w-4 h-4"/>
                    </div>
                  )}
                  <div className={`w-6 h-6 rounded-full border-2 mr-4 ml-0 shrink-0 flex items-center justify-center transition-all ${done.includes(t.id) ? 'bg-green-500 border-green-500 scale-110' : 'border-gray-300'}`}>
                    {done.includes(t.id) && <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7"/></svg>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-[15px] font-medium truncate transition-all ${done.includes(t.id) ? 'line-through text-gray-400' : 'text-black'}`}>{t.title}</p>
                    <p className="text-gray-400 text-[12px]">{t.subtitle}</p>
                  </div>
                  <div className="flex items-center gap-2 ml-2 pr-1">
                    {parseTaskBody(t).priority && <span className={`text-[11px] font-bold ${PRIORITY_COLOR[parseTaskBody(t).priority]}`}>● {parseTaskBody(t).priority}</span>}
                    <button onClick={e => openTaskEditor(t, e)}
                      className="text-gray-400 hover:text-green-600 transition-colors" aria-label={`Edit ${t.title}`}>
                      <Pencil className="w-4 h-4"/>
                    </button>
                    {subs.length > 0 && (
                      <button onClick={e => { e.stopPropagation(); setExpanded(p => p === t.id ? null : t.id); }}
                        className="text-gray-400 hover:text-black transition-colors">
                        <ChevronDown className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`}/>
                      </button>
                    )}
                  </div>
                </div>
                {/* Subtasks */}
                {isOpen && subs.length > 0 && (
                  <div className="pb-2 pl-10 pr-4 space-y-1.5 bg-gray-50">
                    {subs.map((s, i) => (
                      <button key={i} onClick={() => setSubDone(p => ({ ...p, [`${t.id}-${i}`]: !p[`${t.id}-${i}`] }))}
                        className="flex items-center gap-2 w-full text-left">
                        <div className={`w-4 h-4 rounded border shrink-0 flex items-center justify-center transition-colors ${subDone[`${t.id}-${i}`] ? 'bg-green-400 border-green-400' : 'border-gray-300'}`}>
                          {subDone[`${t.id}-${i}`] && <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7"/></svg>}
                        </div>
                        <span className={`text-sm ${subDone[`${t.id}-${i}`] ? 'line-through text-gray-400' : 'text-gray-700'}`}>{s}</span>
                      </button>
                    ))}
                    <p className="text-[10px] text-gray-400 mt-1">{subs.filter((_, i) => subDone[`${t.id}-${i}`]).length}/{subs.length} done</p>
                  </div>
                )}
              </div>
            </SwipeableRow>
          );
        })}
      </div>

      <div className="p-6 pt-4 shrink-0">
        <button onClick={openNewTask} className="w-full py-4 rounded-full bg-green-500 hover:bg-green-400 transition-colors font-semibold text-white flex items-center justify-center gap-2">
          <Plus className="w-5 h-5"/> Add Task
        </button>
        <div className="flex justify-around mt-4">
          {[{ icon: List, label: 'List' }, { icon: Calendar, label: 'Calendar' }, { icon: FolderOpen, label: 'Projects' }, { icon: Filter, label: 'Filters' }].map(({ icon: Icon, label }, i) => (
            <button key={i} className={`flex flex-col items-center text-[11px] ${i === 0 ? 'text-green-600' : 'text-gray-400'}`}>
              <Icon className="w-6 h-6 mb-0.5"/>{label}
            </button>
          ))}
        </div>
      </div>

      {showAdd && (
        <div className="absolute inset-0 z-50 bg-black/60 flex items-end justify-center" onClick={closeTaskSheet}>
          <div className="bg-white rounded-t-3xl w-full p-6" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-black">{editingTask ? 'Edit Task' : 'Add Task'}</h3>
              <button onClick={closeTaskSheet}><X className="w-5 h-5 text-gray-400"/></button>
            </div>
            <div className="space-y-3 max-h-[65vh] overflow-y-auto scrollbar-hide pr-1">
              <input value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
                placeholder="Task title..." className="w-full border border-gray-200 rounded-xl px-4 py-3 text-black outline-none focus:border-green-500" autoFocus/>
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="text-xs text-gray-400 font-medium mb-1 block">Due Date</label>
                  <input type="date" value={form.due} onChange={e => setForm(p => ({ ...p, due: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-4 py-3 text-black outline-none focus:border-green-500"/>
                </div>
                <div className="flex-1">
                  <label className="text-xs text-gray-400 font-medium mb-1 block">Priority</label>
                  <div className="flex gap-1">
                    {['High', 'Med', 'Low'].map((p, i) => (
                      <button key={p} onClick={() => setForm(f => ({ ...f, priority: f.priority === ['High','Medium','Low'][i] ? '' : ['High','Medium','Low'][i] }))}
                        className={`flex-1 py-3 rounded-xl text-xs font-medium border transition-colors ${form.priority === ['High','Medium','Low'][i] ? 'border-green-500 bg-green-50 text-green-700' : 'border-gray-200 text-gray-500'}`}>{p}</button>
                    ))}
                  </div>
                </div>
              </div>
              {/* Subtasks */}
              <div>
                <label className="text-xs text-gray-400 font-medium mb-1 block">Subtasks</label>
                {form.subtasks.map((s, i) => (
                  <div key={i} className="flex items-center gap-2 mb-2">
                    <div className="w-3 h-3 rounded-full border-2 border-gray-300 shrink-0"/>
                    <input value={s} onChange={e => setForm(f => { const st = [...f.subtasks]; st[i] = e.target.value; return { ...f, subtasks: st }; })}
                      placeholder={`Subtask ${i + 1}…`}
                      className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm text-black outline-none focus:border-green-400"/>
                    {form.subtasks.length > 1 && (
                      <button onClick={() => setForm(f => ({ ...f, subtasks: f.subtasks.filter((_, j) => j !== i) }))} className="text-gray-400 hover:text-red-400">
                        <X className="w-4 h-4"/>
                      </button>
                    )}
                  </div>
                ))}
                <button onClick={() => setForm(f => ({ ...f, subtasks: [...f.subtasks, ''] }))}
                  className="text-xs text-green-600 font-medium hover:text-green-500">+ Add subtask</button>
              </div>
              <button onClick={saveTask} disabled={saving || !form.title.trim()}
                className="w-full py-3 rounded-xl bg-green-500 hover:bg-green-400 disabled:opacity-40 text-white font-semibold">
                {saving ? 'Saving…' : editingTask ? 'Update Task' : 'Save Task'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
