import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Lock, MoreVertical, Plus } from 'lucide-react';
import { MODULES } from '../modules/moduleRegistry.js';

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
        <p className="text-gray-500 text-sm mt-1">{MODULES.length} workspaces available</p>
      </div>

      {/* Workspace List */}
      <div className="flex-1 overflow-y-auto scrollbar-hide px-5">
        <div className="space-y-2">
          {MODULES.map(({ key, icon: Icon, bg, label, sub, to, locked }) => (
            <button key={key} onClick={() => to && navigate(to)}
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
