import { renderHook } from '@testing-library/react';
import { useTheme } from '@/shared/hooks/useTheme';

describe('useTheme', () => {
  beforeEach(() => {
    document.documentElement.classList.remove('dark');
    document.body.removeAttribute('data-theme');
  });

  it('returns light mode values', () => {
    const { result } = renderHook(() => useTheme());
    expect(result.current.theme).toBe('light');
    expect(result.current.isDark).toBe(false);
  });

  it('does not add dark class to html element', () => {
    renderHook(() => useTheme());
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it('sets data-theme to light on body', () => {
    renderHook(() => useTheme());
    expect(document.body.getAttribute('data-theme')).toBe('light');
  });
});
