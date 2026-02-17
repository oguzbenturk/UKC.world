import { useEffect } from 'react';

/**
 * Lightweight pull-to-refresh detector for touch devices.
 * Invokes the provided callback when the user performs a downward pull near the top of the page.
 */
export function usePullToRefresh(callback, config = {}) {
  const {
    threshold = 80,
    maxScroll = 20,
    maxPullTime = 800,
  } = config;

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    let startY = null;
    let triggered = false;
    let startedAt = 0;

    const onTouchStart = (event) => {
      if (window.scrollY > maxScroll) return;
      if (event.touches.length !== 1) return;
      startY = event.touches[0].clientY;
      startedAt = Date.now();
      triggered = false;
    };

    const onTouchMove = (event) => {
      if (startY === null || triggered) return;
      const delta = event.touches[0].clientY - startY;
      const elapsed = Date.now() - startedAt;
      if (delta > threshold && elapsed <= maxPullTime) {
        triggered = true;
        callback?.();
      }
    };

    const onTouchEnd = () => {
      startY = null;
      triggered = false;
    };

    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchmove', onTouchMove, { passive: true });
    window.addEventListener('touchend', onTouchEnd);

    return () => {
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onTouchEnd);
    };
  }, [callback, threshold, maxScroll, maxPullTime]);
}
