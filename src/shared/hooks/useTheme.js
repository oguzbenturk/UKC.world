import { useEffect } from 'react';

export const THEME_STORAGE_KEY = 'plannivo-theme';

// Light mode only - dark mode removed
export const useTheme = () => {
  useEffect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      return;
    }

    // Always force light mode
    document.documentElement.classList.remove('dark');
    
    const body = document.body;
    if (body) {
      body.setAttribute('data-theme', 'light');
    }

    // Set light theme color for mobile browsers
    const themeColorMeta = document.querySelector('meta[name="theme-color"]');
    if (themeColorMeta) {
      themeColorMeta.setAttribute('content', '#ffffff');
    }

    // Store light mode preference
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, 'light');
    } catch {
      // Ignore storage write issues (private browsing, etc.)
    }
  }, []);

  return {
    theme: 'light',
    isDark: false,
  };
};
