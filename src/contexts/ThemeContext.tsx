import React, { createContext, useContext, useState, useEffect } from 'react';

export type Theme = 'light' | 'dark' | 'trello';

interface ThemeContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
  isDarkMode: boolean;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, setThemeState] = useState<Theme>('dark');

  const applyTheme = (newTheme: Theme) => {
    const root = document.documentElement;
    root.classList.remove('light', 'dark', 'trello');
    root.classList.add(newTheme);
    localStorage.setItem('pm_theme', newTheme);
    setThemeState(newTheme);
  };

  useEffect(() => {
    const savedTheme = localStorage.getItem('pm_theme') as Theme | null;
    if (savedTheme === 'light' || savedTheme === 'dark' || savedTheme === 'trello') {
      applyTheme(savedTheme);
    } else {
      applyTheme('dark'); // Default to dark
    }
  }, []);

  const toggleTheme = () => {
    let nextTheme: Theme = 'light';
    if (theme === 'light') nextTheme = 'dark';
    else if (theme === 'dark') nextTheme = 'trello';
    else if (theme === 'trello') nextTheme = 'light';
    applyTheme(nextTheme);
  };

  return (
    <ThemeContext.Provider value={{ theme, setTheme: applyTheme, toggleTheme, isDarkMode: theme === 'dark' }}>
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
