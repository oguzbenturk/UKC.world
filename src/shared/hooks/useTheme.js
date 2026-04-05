import { useEffect } from 'react';

export const THEME_STORAGE_KEY = 'plannivo-theme';

// Dark mode only - no light mode support
export const useTheme = () => {
  useEffect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      return;
    }

    // Always force dark mode
    document.documentElement.classList.add('dark');
    
    const body = document.body;
    if (body) {
      body.setAttribute('data-theme', 'dark');
    }

    // Set dark theme color for mobile browsers
    const themeColorMeta = document.querySelector('meta[name="theme-color"]');
    if (themeColorMeta) {
      themeColorMeta.setAttribute('content', '#0f172a');
    }

    // Store dark mode preference
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, 'dark');
    } catch {
      // Ignore storage write issues (private browsing, etc.)
    }
  }, []);

  return {
    theme: 'dark',
    isDark: true,
  };
};
