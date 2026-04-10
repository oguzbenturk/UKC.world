import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useIsFetching } from '@tanstack/react-query';

const GlobalProgressBar = () => {
  const location = useLocation();
  const isFetching = useIsFetching();
  const [progress, setProgress] = useState(0);
  const [visible, setVisible] = useState(false);
  const timerRef = useRef(null);
  const completeRef = useRef(null);

  // Start bar on route change
  useEffect(() => {
    setProgress(15);
    setVisible(true);

    // Ramp to ~85% over time
    timerRef.current = setTimeout(() => setProgress(45), 100);
    const t2 = setTimeout(() => setProgress(65), 300);
    const t3 = setTimeout(() => setProgress(85), 800);

    return () => {
      clearTimeout(timerRef.current);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, [location.pathname]);

  // Complete when no active fetches
  useEffect(() => {
    if (visible && isFetching === 0) {
      clearTimeout(completeRef.current);
      completeRef.current = setTimeout(() => {
        setProgress(100);
        setTimeout(() => {
          setVisible(false);
          setProgress(0);
        }, 200);
      }, 150);
    }
    return () => clearTimeout(completeRef.current);
  }, [isFetching, visible]);

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
          transition: progress === 0 ? 'none' : progress === 100 ? 'width 200ms ease-out, opacity 200ms ease-out' : 'width 400ms ease-out',
          opacity: progress === 100 ? 0 : 1,
          boxShadow: '0 0 8px rgba(14, 165, 233, 0.4)',
        }}
      />
    </div>
  );
};

export default GlobalProgressBar;
