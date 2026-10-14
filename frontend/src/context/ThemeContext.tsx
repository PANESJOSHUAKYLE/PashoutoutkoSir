/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useAuth } from './AuthContext';
import { eventApi } from '../data/eventApi';

interface ThemeContextType {
  darkMode: boolean;
  toggleDarkMode: () => Promise<void>;
  setDarkMode: (value: boolean) => Promise<void>;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { user, updateUser } = useAuth();
  const [localDarkMode, setDarkModeState] = useState(() => {
    try {
      return localStorage.getItem('cot-dark-mode') !== '0';
    } catch {
      return true;
    }
  });

  const darkMode = user ? user.dark_mode : localDarkMode;

  useEffect(() => {
    document.documentElement.classList.toggle('light', !darkMode);
    document.documentElement.style.colorScheme = darkMode ? 'dark' : 'light';
    try {
      localStorage.setItem('cot-dark-mode', darkMode ? '1' : '0');
    } catch {
      /* ignore */
    }
  }, [darkMode]);

  const setDarkMode = async (value: boolean) => {
    setDarkModeState(value);
    if (user) {
      const updated = await eventApi.updateProfile({
        name: user.name,
        email: user.email,
        phone: user.phone,
        dark_mode: value,
      });
      updateUser(updated);
    }
  };

  return (
    <ThemeContext.Provider
      value={{
        darkMode,
        setDarkMode,
        toggleDarkMode: () => setDarkMode(!darkMode),
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used within ThemeProvider');
  return context;
}
