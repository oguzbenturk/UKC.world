import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * ScrollToTop Component
 * 
 * Automatically scrolls the window to the top (0, 0) whenever the route (location) changes.
 * This ensures that navigating to a new page doesn't inherit the previous scroll position.
 */
const ScrollToTop = () => {
  const { pathname } = useLocation();

  useEffect(() => {
    // Reset window scroll
    window.scrollTo(0, 0);

    // Reset potential scroll containers (common in dashboard layouts)
    const scrollContainers = [
      document.querySelector('.content-container'),
      document.querySelector('main'),
      document.getElementById('root'),
    ];

    scrollContainers.forEach(container => {
      if (container) {
        container.scrollTop = 0;
      }
    });
  }, [pathname]);

  return null;
};

export default ScrollToTop;
