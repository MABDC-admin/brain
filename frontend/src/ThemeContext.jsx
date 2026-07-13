import React, { useState, useEffect } from 'react';
import { ThemeContext } from './hooks/themeContextValue.js';


export function ThemeProvider({ children }) {
  const [dark, setDark] = useState(() => {
    try { return JSON.parse(localStorage.getItem('dark_mode')) !== false; }
    catch { return true; }
  });

  useEffect(() => {
    const root = document.documentElement;
    if (dark) {
      root.classList.remove('light-theme');
      root.classList.add('dark-theme');
    } else {
      root.classList.remove('dark-theme');
      root.classList.add('light-theme');
    }
    localStorage.setItem('dark_mode', JSON.stringify(dark));
  }, [dark]);

  return (
    <ThemeContext.Provider value={{ dark, setDark }}>
      {children}
    </ThemeContext.Provider>
  );
}
