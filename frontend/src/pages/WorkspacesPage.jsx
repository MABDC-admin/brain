import React from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle2, Bell, Wallet, FileText, FolderOpen, BookOpen, BarChart2, Sparkles, Lock, MoreVertical, Plus } from 'lucide-react';

const WORKSPACES = [
  { icon: CheckCircle2, bg: 'bg-green-500',   label: '/task',      sub: 'Open tasks',           to: '/tasks' },
  { icon: Bell,         bg: 'bg-orange-500',  label: '/reminder',  sub: 'Upcoming reminders',   to: '/reminders' },
  { icon: Wallet,       bg: 'bg-blue-500',    label: '/expense',   sub: 'Track spending',        to: '/expenses' },
  { icon: FileText,     bg: 'bg-purple-500',  label: '/note',      sub: 'Quick notes',           to: '/notes' },
  { icon: FolderOpen,   bg: 'bg-teal-600',    label: '/project',   sub: 'Project boards',        to: '/projects' },
  { icon: BookOpen,     bg: 'bg-pink-500',    label: '/journal',   sub: 'PIN protected',         to: '/journal', locked: true },
  { icon: BarChart2,    bg: 'bg-indigo-500',  label: '/analytics', sub: 'Insights & trends',     to: '/analytics' },
  { icon: Sparkles,     bg: 'bg-violet-600',  label: '/chat',      sub: 'AI assistant (GPT-4o)', to: '/chat' },
];

export default function WorkspacesPage() {
  const navigate = useNavigate();

  return (
    <div className="flex flex-col h-full bg-[#0b0c10] text-white">
      {/* Header */}
      <div className="px-5 pt-6 pb-3 shrink-0">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-white">Workspaces</h1>
            <span className="text-gray-500">▾</span>
          </div>
          <MoreVertical className="w-6 h-6 text-gray-500"/>
        </div>
        <p className="text-gray-500 text-sm mt-1">{WORKSPACES.length} workspaces available</p>
      </div>

      {/* Workspace List */}
      <div className="flex-1 overflow-y-auto scrollbar-hide px-5">
        <div className="space-y-2">
          {WORKSPACES.map(({ icon: Icon, bg, label, sub, to, locked }, i) => (
            <button key={i} onClick={() => to && navigate(to)}
              className="w-full flex items-center py-4 px-4 bg-[#14151b] border border-[#2a2b36] rounded-2xl hover:bg-[#1a1b23] transition-all active:scale-[0.98] text-left">
              <div className={`w-12 h-12 rounded-xl ${bg} flex items-center justify-center mr-4 shrink-0`}>
                <Icon className="w-6 h-6 text-white"/>
              </div>
              <div className="flex-1">
                <p className="text-[16px] font-bold text-white font-mono">{label}</p>
                <p className="text-gray-500 text-[12px] mt-0.5">{sub}</p>
              </div>
              {locked
                ? <Lock className="w-4 h-4 text-gray-600"/>
                : <span className="text-gray-700 text-lg">›</span>
              }
            </button>
          ))}
        </div>
      </div>

      {/* New Workspace CTA */}
      <div className="px-5 pt-3 pb-5 shrink-0">
        <button className="w-full py-4 rounded-2xl font-semibold text-indigo-400 flex items-center justify-center gap-2 bg-indigo-500/10 border border-indigo-500/20 hover:bg-indigo-500/20 transition-colors">
          <Plus className="w-5 h-5"/> New Workspace
        </button>
      </div>
    </div>
  );
}
