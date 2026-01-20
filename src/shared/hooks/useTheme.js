import { useEffect, useRef, useState } from 'react';

export const THEME_STORAGE_KEY = 'plannivo-theme';

const getInitialTheme = () => {
  if (typeof window === 'undefined') {
    return { theme: 'dark', hasStoredPreference: false };
  }

  try {
    const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (storedTheme === 'light' || storedTheme === 'dark') {
      return { theme: storedTheme, hasStoredPreference: true };
    }
  } catch {
    // Ignore storage access errors (private mode, etc.)
  }

  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  return { theme: prefersDark ? 'dark' : 'light', hasStoredPreference: false };
};

export const useTheme = () => {
  const initialThemeRef = useRef();
  if (!initialThemeRef.current) {
    initialThemeRef.current = getInitialTheme();
  }

  const [theme, setTheme] = useState(initialThemeRef.current.theme);
  const hasUserPreference = useRef(initialThemeRef.current.hasStoredPreference);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      return;
    }

    document.documentElement.classList.remove('dark');

    const body = document.body;
    const isDarkMode = theme === 'dark';

    if (body) {
      body.setAttribute('data-theme', theme);
    }

    if (hasUserPreference.current) {
      try {
        window.localStorage.setItem(THEME_STORAGE_KEY, theme);
      } catch {
        // Ignore storage write issues (private browsing, etc.)
      }
    }

    const themeColorMeta = document.querySelector('meta[name="theme-color"]');
    if (themeColorMeta) {
      themeColorMeta.setAttribute('content', isDarkMode ? '#0f172a' : '#ffffff');
    }
  }, [theme]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleSchemeChange = (event) => {
      if (!hasUserPreference.current) {
        setTheme(event.matches ? 'dark' : 'light');
      }
    };

    mediaQuery.addEventListener('change', handleSchemeChange);
    return () => mediaQuery.removeEventListener('change', handleSchemeChange);
  }, []);

  const toggleTheme = () => {
    hasUserPreference.current = true;
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  const setUserTheme = (value) => {
    hasUserPreference.current = true;
    setTheme(value);
  };

  return {
    theme,
    isDark: theme === 'dark',
    toggleTheme,
    setTheme: setUserTheme,
  };
};
