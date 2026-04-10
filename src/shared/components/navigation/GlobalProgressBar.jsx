import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useIsFetching } from '@tanstack/react-query';

const MAX_DURATION = 2500; // Force-complete after 2.5s regardless of pending fetches

const GlobalProgressBar = () => {
  const location = useLocation();
  const isFetching = useIsFetching();
  const [progress, setProgress] = useState(0);
  const [visible, setVisible] = useState(false);
  const timersRef = useRef([]);
  const completeRef = useRef(null);
  const maxTimerRef = useRef(null);

  const clearAll = () => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
    clearTimeout(completeRef.current);
    clearTimeout(maxTimerRef.current);
  };

  const complete = () => {
    clearAll();
    setProgress(100);
    completeRef.current = setTimeout(() => {
      setVisible(false);
      setProgress(0);
    }, 250);
  };

  // Start bar on route change
  useEffect(() => {
    clearAll();
    setProgress(20);
    setVisible(true);

    timersRef.current = [
      setTimeout(() => setProgress(50), 150),
      setTimeout(() => setProgress(75), 400),
      setTimeout(() => setProgress(88), 900),
    ];

    // Hard timeout — always complete within MAX_DURATION ms
    maxTimerRef.current = setTimeout(complete, MAX_DURATION);

    return clearAll;
  }, [location.pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  // Also complete early when React Query goes idle
  useEffect(() => {
    if (visible && isFetching === 0) {
      // Small debounce so a cascade of quick fetches doesn't flicker
      const t = setTimeout(complete, 120);
      return () => clearTimeout(t);
    }
  }, [isFetching, visible]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!visible && progress === 0) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        height: 3,
        zIndex: 9999,
        pointerEvents: 'none',
      }}
    >
      <div
        style={{
          height: '100%',
          width: `${progress}%`,
          background: 'linear-gradient(90deg, #0ea5e9, #38bdf8)',
          transition:
            progress === 0
              ? 'none'
              : progress === 100
              ? 'width 200ms ease-out'
              : 'width 400ms ease-out',
          opacity: progress === 100 ? 0 : 1,
          boxShadow: '0 0 8px rgba(14, 165, 233, 0.4)',
        }}
      />
    </div>
  );
};

export default GlobalProgressBar;
