import { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { supabase } from '../lib/supabase';

type Theme = 'light' | 'dark';

interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
  setTheme: (theme: Theme) => void;
  canToggleTheme: boolean;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

function readSignedInTheme(): Theme {
  if (typeof window === 'undefined') return 'light';
  const stored = localStorage.getItem('theme');
  return stored === 'dark' ? 'dark' : 'light';
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  // Always render the first public/visitor frame in the bright theme.
  // A signed-in user's saved preference is restored after auth is resolved.
  const [theme, setThemeState] = useState<Theme>('light');
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    let mounted = true;

    const resolveThemeForSession = (hasSession: boolean) => {
      if (!mounted) return;
      setIsAuthenticated(hasSession);
      setThemeState(hasSession ? readSignedInTheme() : 'light');
    };

    void supabase.auth.getSession().then(({ data: { session } }) => {
      resolveThemeForSession(Boolean(session?.user));
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      resolveThemeForSession(Boolean(session?.user));
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('dark', isAuthenticated && theme === 'dark');

    // Keep browser chrome bright for visitors as well as the page itself.
    const effectiveTheme: Theme = isAuthenticated ? theme : 'light';
    root.style.colorScheme = effectiveTheme;

    const themeColor = document.querySelector('meta[name="theme-color"]');
    themeColor?.setAttribute('content', effectiveTheme === 'dark' ? '#0a0c10' : '#ffffff');

    if (isAuthenticated) {
      localStorage.setItem('theme', theme);
    }
  }, [theme, isAuthenticated]);

  const toggleTheme = () => {
    // Visitors intentionally stay in DRIGHT's bright theme.
    if (!isAuthenticated) {
      setThemeState('light');
      return;
    }
    setThemeState(prev => (prev === 'light' ? 'dark' : 'light'));
  };

  const setTheme = (newTheme: Theme) => {
    if (!isAuthenticated) {
      setThemeState('light');
      return;
    }
    setThemeState(newTheme);
  };

  return (
    <ThemeContext.Provider value={{ theme: isAuthenticated ? theme : 'light', toggleTheme, setTheme, canToggleTheme: isAuthenticated }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
