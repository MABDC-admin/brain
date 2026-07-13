import { useContext } from 'react';
import { ThemeContext } from './themeContextValue.js';

export const useTheme = () => useContext(ThemeContext);
