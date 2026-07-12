import React, { useState, useEffect } from 'react';
import { Download, X, Smartphone } from 'lucide-react';

/**
 * InstallBanner — listens for the browser's `beforeinstallprompt` event
 * and shows a dismissible "Add to Home Screen" banner.
 * Only shown once per session (or until user dismisses permanently).
 */
export default function InstallBanner() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [visible,        setVisible]        = useState(false);
  const dismissed = localStorage.getItem('pwa_banner_dismissed') === 'true';

  useEffect(() => {
    if (dismissed) return;
    const handler = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
      // Small delay so it doesn't immediately fight for attention
      setTimeout(() => setVisible(true), 3000);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, [dismissed]);

  const install = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    setVisible(false);
    if (outcome === 'accepted') setDeferredPrompt(null);
  };

  const dismiss = () => {
    setVisible(false);
    localStorage.setItem('pwa_banner_dismissed', 'true');
  };

  if (!visible) return null;

  return (
    <div className="fixed bottom-[76px] left-3 right-3 z-[80] toast-enter"
      style={{ animation: 'pageSlideUp 0.3s ease-out' }}>
      <div className="bg-gradient-to-r from-indigo-600 to-purple-600 rounded-2xl px-4 py-3 flex items-center gap-3 shadow-2xl shadow-indigo-500/40">
        <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center shrink-0">
          <Smartphone className="w-5 h-5 text-white"/>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-white font-bold text-sm leading-tight">Install Command Brain</p>
          <p className="text-white/70 text-xs">Works offline · Instant launch</p>
        </div>
        <button onClick={install}
          className="bg-white text-indigo-600 font-bold text-xs px-3 py-2 rounded-xl hover:bg-white/90 transition-colors shrink-0 flex items-center gap-1">
          <Download className="w-3.5 h-3.5"/> Install
        </button>
        <button onClick={dismiss} className="text-white/50 hover:text-white/90 transition-colors shrink-0 ml-1">
          <X className="w-4 h-4"/>
        </button>
      </div>
    </div>
  );
}
