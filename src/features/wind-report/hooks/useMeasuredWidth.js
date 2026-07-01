import React from 'react';

/**
 * Measure an element's live pixel width via ResizeObserver. Used by the SVG charts so
 * they render at their real width (crisp text, round dots) at any container size.
 * @returns {[React.RefObject, number]} [ref, width]
 */
export const useMeasuredWidth = () => {
  const ref = React.useRef(null);
  const [w, setW] = React.useState(0);
  React.useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver((entries) => {
      const cw = entries[0]?.contentRect?.width;
      if (cw) setW(cw);
    });
    ro.observe(el);
    setW(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
};

export default useMeasuredWidth;
