// Shared layout wrapper — dark phone frame with FAB command picker
import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Home, Search, Plus, Settings, CheckCircle2, Bell, Wallet, FileText, Camera, Images } from 'lucide-react';
import CommandPreview from './components/CommandPreview.jsx';

const FAB_OPTIONS = [
  { type: 'task',     label: 'Task',     icon: CheckCircle2, color: 'bg-green-500',  hint: 'Add something to do' },
  { type: 'expense',  label: 'Expense',  icon: Wallet,       color: 'bg-blue-500',   hint: 'Log a payment' },
  { type: 'note',     label: 'Note',     icon: FileText,     color: 'bg-purple-500', hint: 'Write it down' },
  { type: 'reminder', label: 'Reminder', icon: Bell,         color: 'bg-orange-500', hint: 'Don\'t forget' },
];

export default function Layout({ children, isScanning, fileInputRef, onFileChange, loadItems, onSearchOpen, workspace, setWorkspace }) {
  const navigate    = useNavigate();
  const location    = useLocation();
  const path        = location.pathname;
  const [fabOpen,   setFabOpen]   = useState(false);
  const [preview,   setPreview]   = useState(null);
  const navItems = [
    { icon: Home,     label: 'Home',     to: '/',        badge: null },
    { icon: Search,   label: 'Search',   to: '/search',  badge: null },
    { icon: FileText, label: 'Vault',    to: '/vault',   badge: null },
    { icon: Settings, label: 'Settings', to: '/settings', badge: null },
  ];

  const handleFabOption = (opt) => {
    setFabOpen(false);
    setPreview({ type: opt.type, rest: '', text: `/${opt.type} `, cmd: `/${opt.type}` });
  };

  const handleScanUpload = () => {
    setFabOpen(false);
    fileInputRef?.current?.click();
  };

  return (
    <div className="app-shell flex justify-center items-center min-h-screen font-sans transition-colors duration-500" style={{ backgroundColor: 'var(--app-bg)' }}>
      <div className="phone-shell relative overflow-hidden transition-colors duration-500"
           style={{ backgroundColor: 'var(--frame-bg)' }}>

        {/* Status Bar & Workspace Switcher */}
        <div className="flex justify-between items-center px-7 pt-4 pb-2 text-sm font-semibold shrink-0 z-10" style={{ color: 'var(--text-primary)' }}>
          <div className="flex items-center gap-2">
            <span className="text-gray-400 text-xs">{(new Date()).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })}</span>
          </div>
          
          <div className="relative group z-50">
            <button className="flex items-center gap-1.5 bg-[#1a1b23] hover:bg-[#2a2b36] border border-[#2a2b36] px-3 py-1 rounded-full text-xs transition-colors">
              <span className="w-2 h-2 rounded-full bg-indigo-500"></span>
              <span className="text-white">{workspace || 'Personal'}</span>
            </button>
            <div className="absolute top-full mt-2 left-1/2 -translate-x-1/2 w-48 bg-[#1a1b23] border border-[#2a2b36] rounded-xl shadow-2xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all flex flex-col overflow-hidden">
              {['Personal', 'Company', 'Employee Docs', 'Family', 'Archive'].map(ws => (
                <button key={ws} onClick={() => setWorkspace(ws)}
                  className={`px-4 py-2.5 text-xs text-left hover:bg-[#2a2b36] transition-colors ${workspace === ws ? 'text-indigo-400 font-bold bg-[#2a2b36]' : 'text-gray-300'}`}>
                  {ws}
                </button>
              ))}
            </div>
          </div>

          <span className="text-xs text-gray-400">●●● 100%</span>
        </div>

        {/* Page Content */}
        <div className="absolute inset-0 top-[36px] bottom-[88px] overflow-y-auto scrollbar-hide">
          {children}
        </div>

        {/* Bottom Navigation */}
        <div className="absolute bottom-0 left-0 right-0 h-[88px] bg-[#0b0c10]/95 backdrop-blur-sm flex justify-between items-center px-6 pb-6 pt-2 z-30 border-t border-[#1a1b23]">
          {navItems.slice(0, 2).map(({ icon: Icon, label, to, badge }) => {
            const active = path === to;
            const isSearch = label === 'Search';
            return (
              <button key={to} onClick={() => isSearch ? onSearchOpen?.() : navigate(to)}
                className={`flex flex-col items-center w-12 transition-all relative ${active ? 'text-indigo-400' : 'text-gray-500 hover:text-gray-300'}`}>
                <div className="relative">
                  <Icon className="w-6 h-6"/>
                  {badge > 0 && (
                    <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[9px] font-bold w-4 h-4 rounded-full flex items-center justify-center">{badge > 9 ? '9+' : badge}</span>
                  )}
                </div>
                <span className="text-[10px] mt-1 font-medium">{label}</span>
                {active && <span className="absolute -bottom-1 w-1 h-1 bg-indigo-400 rounded-full"/>}
              </button>
            );
          })}

          {/* FAB */}
          <div className="w-16 flex justify-center">
            <button onClick={() => setFabOpen(o => !o)}
              className={`w-[56px] h-[56px] rounded-[20px] flex items-center justify-center shadow-xl transform -translate-y-2 transition-all duration-300 ${fabOpen ? 'rotate-45 bg-gray-700' : 'hover:scale-105'}`}
              style={fabOpen ? {} : { background: 'linear-gradient(135deg, #818cf8, #a855f7)' }}>
              {isScanning ? (
                <svg className="animate-spin h-7 w-7 text-white" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/>
                </svg>
              ) : (
                <Plus className="w-7 h-7 text-white"/>
              )}
            </button>
            <input type="file" ref={fileInputRef} hidden accept="image/*,application/pdf" multiple capture="environment" onChange={onFileChange}/>
          </div>

          {navItems.slice(2).map(({ icon: Icon, label, to }) => {
            const active = path === to;
            return (
              <button key={to} onClick={() => navigate(to)}
                className={`flex flex-col items-center w-12 transition-all relative ${active ? 'text-indigo-400' : 'text-gray-500 hover:text-gray-300'}`}>
                <Icon className="w-6 h-6"/>
                <span className="text-[10px] mt-1 font-medium">{label}</span>
                {active && <span className="absolute -bottom-1 w-1 h-1 bg-indigo-400 rounded-full"/>}
              </button>
            );
          })}
        </div>

        {/* Home Indicator */}
        <div className="absolute bottom-1.5 left-1/2 -translate-x-1/2 w-[120px] h-1.5 bg-gray-600 rounded-full z-40"/>

        {/* FAB Picker Overlay */}
        {fabOpen && (
          <div className="absolute inset-0 z-[45] flex flex-col justify-end" onClick={() => setFabOpen(false)}>
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm"/>

            {/* Options Panel */}
            <div className="relative z-10 px-6 pb-[100px] fab-panel" onClick={e => e.stopPropagation()}>
              <p className="text-gray-400 text-xs font-semibold tracking-widest uppercase mb-3 text-center">What do you want to create?</p>

              <div className="grid grid-cols-2 gap-3 mb-3">
                {FAB_OPTIONS.map((opt) => {
                  const Icon = opt.icon;
                  return (
                    <button key={opt.type} onClick={() => handleFabOption(opt)}
                      className="bg-[#14151b] border border-[#2a2b36] rounded-2xl p-4 text-left hover:bg-[#1a1b23] transition-all active:scale-95">
                      <div className={`w-10 h-10 rounded-xl ${opt.color} flex items-center justify-center mb-3`}>
                        <Icon className="w-5 h-5 text-white"/>
                      </div>
                      <p className="text-white font-semibold text-[15px]">{opt.label}</p>
                      <p className="text-gray-500 text-[11px] mt-0.5">{opt.hint}</p>
                    </button>
                  );
                })}
              </div>

              {/* Scan Upload option */}
              <div className="grid grid-cols-2 gap-3">
                <button onClick={handleScanUpload}
                  className="bg-[#14151b] border border-[#2a2b36] rounded-2xl p-4 flex items-center gap-3 hover:bg-[#1a1b23] transition-all active:scale-95">
                  <div className="w-10 h-10 rounded-xl bg-indigo-500 flex items-center justify-center shrink-0">
                    <Camera className="w-5 h-5 text-white"/>
                  </div>
                  <div>
                    <p className="text-white font-semibold text-[13px]">Scan</p>
                    <p className="text-gray-500 text-[10px]">OCR scan</p>
                  </div>
                </button>
                <button onClick={() => { navigate('/gallery'); setFabOpen(false); }}
                  className="bg-[#14151b] border border-[#2a2b36] rounded-2xl p-4 flex items-center gap-3 hover:bg-[#1a1b23] transition-all active:scale-95">
                  <div className="w-10 h-10 rounded-xl bg-pink-600 flex items-center justify-center shrink-0">
                    <Images className="w-5 h-5 text-white"/>
                  </div>
                  <div>
                    <p className="text-white font-semibold text-[13px]">Gallery</p>
                    <p className="text-gray-500 text-[10px]">Scanned docs</p>
                  </div>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Global Command Preview (from FAB) */}
        {preview && (
          <CommandPreview
            command={preview}
            onClose={() => setPreview(null)}
            onSaved={() => { loadItems?.(); setPreview(null); }}
          />
        )}
      </div>
    </div>
  );
}
