
import React, { createContext, useContext, useState, useEffect } from 'react';

interface ThemeContextType {
  isDarkMode: boolean;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Default state is now true (Dark) to match the logic below ensuring initial render matches
  const [isDarkMode, setIsDarkMode] = useState(true);

  useEffect(() => {
    // Check local storage
    const savedTheme = localStorage.getItem('pm_theme');
    
    // Logic: Default to Dark unless 'light' is explicitly saved
    // If savedTheme is null (first visit), this block goes to else -> Dark Mode
    if (savedTheme === 'light') {
      setIsDarkMode(false);
      document.documentElement.classList.remove('dark');
    } else {
      // Default to Dark
      setIsDarkMode(true);
      document.documentElement.classList.add('dark');
      // If it was null, we could optionally save 'dark' here, but leaving it null allows us to change defaults later if needed.
      // However, for consistency, we assume 'dark' is the default state.
    }
  }, []);

  const toggleTheme = () => {
    setIsDarkMode((prev) => {
      const newMode = !prev;
      if (newMode) {
        document.documentElement.classList.add('dark');
        localStorage.setItem('pm_theme', 'dark');
      } else {
        document.documentElement.classList.remove('dark');
        localStorage.setItem('pm_theme', 'light');
      }
      return newMode;
    });
  };

  return (
    <ThemeContext.Provider value={{ isDarkMode, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};
