import React, { useState, useEffect } from 'react';
import { Lock, Delete, Fingerprint } from 'lucide-react';
import { useHaptic } from '../hooks/useHaptic.js';

export default function LockScreen({ onUnlock, correctPin }) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState(false);
  const haptic = useHaptic();

  const handlePress = (num) => {
    if (pin.length >= 4) return;
    haptic.tap();
    const newPin = pin + num;
    setPin(newPin);
    
    if (newPin.length === 4) {
      if (newPin === correctPin) {
        haptic.success();
        setTimeout(onUnlock, 200);
      } else {
        haptic.error();
        setError(true);
        setTimeout(() => {
          setPin('');
          setError(false);
        }, 500);
      }
    }
  };

  const handleDelete = () => {
    if (pin.length === 0) return;
    haptic.tap();
    setPin(pin.slice(0, -1));
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#0b0c10] flex flex-col items-center justify-center p-6">
      <div className="mb-12 flex flex-col items-center">
        <div className="w-16 h-16 rounded-full bg-indigo-500/20 flex items-center justify-center mb-6">
          <Lock className="w-8 h-8 text-indigo-400" />
        </div>
        <h1 className="text-2xl font-bold text-white mb-2">App Locked</h1>
        <p className="text-gray-400 text-sm">Enter your PIN to continue</p>
      </div>

      <div className={`flex gap-4 mb-16 ${error ? 'animate-[shake_0.2s_ease-in-out_0s_2]' : ''}`}>
        {[...Array(4)].map((_, i) => (
          <div key={i} className={`w-4 h-4 rounded-full border-2 transition-all duration-200 ${
            pin.length > i ? 'bg-indigo-500 border-indigo-500' : 'border-gray-600 bg-transparent'
          }`} />
        ))}
      </div>

      <div className="grid grid-cols-3 gap-6 w-full max-w-[280px]">
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
          <button key={num} onClick={() => handlePress(num.toString())}
            className="w-20 h-20 rounded-full bg-[#14151b] border border-[#2a2b36] text-white text-2xl font-semibold flex items-center justify-center active:bg-indigo-500/20 active:border-indigo-500 transition-colors">
            {num}
          </button>
        ))}
        <button onClick={() => {}} className="w-20 h-20 flex items-center justify-center">
          <Fingerprint className="w-8 h-8 text-indigo-400 opacity-50" />
        </button>
        <button onClick={() => handlePress('0')}
          className="w-20 h-20 rounded-full bg-[#14151b] border border-[#2a2b36] text-white text-2xl font-semibold flex items-center justify-center active:bg-indigo-500/20 active:border-indigo-500 transition-colors">
          0
        </button>
        <button onClick={handleDelete} className="w-20 h-20 flex items-center justify-center active:text-red-400 transition-colors">
          <Delete className="w-8 h-8 text-gray-500" />
        </button>
      </div>
      
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-10px); }
          75% { transform: translateX(10px); }
        }
      `}} />
    </div>
  );
}
