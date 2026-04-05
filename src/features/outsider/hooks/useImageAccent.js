import { useEffect, useState } from 'react';

/** Tailwind-aligned fallbacks when there is no image, load fails, or canvas is tainted */
const THEME_BOTTOM_HEX = {
  blue: '#1a3558',
  cyan: '#0c3d4d',
  purple: '#2a1f48',
  yellow: '#3d3510',
  green: '#153d28',
};

function fallbackForTheme(themeKey) {
  const k = THEME_BOTTOM_HEX[themeKey] ? themeKey : 'blue';
  return { bottomHex: THEME_BOTTOM_HEX[k], sampled: false };
}

function rgbToHex(r, g, b) {
  const clamp = (n) => Math.max(0, Math.min(255, Math.round(n)));
  return `#${[clamp(r), clamp(g), clamp(b)]
    .map((x) => x.toString(16).padStart(2, '0'))
    .join('')}`;
}

/** Pull sampled RGB toward darker tones for white text on footer */
function panelRgbFromSample(r, g, b) {
  const f = 0.78;
  return {
    r: r * f,
    g: g * f,
    b: b * f,
  };
}

/**
 * Samples the lower ~32% of the image (small canvas) for a footer / gradient accent.
 * @param {string} imageSrc Resolved URL or empty
 * @param {string} themeColorKey pkg.color — used when sampling is unavailable
 */
export function useImageAccent(imageSrc, themeColorKey = 'blue') {
  const [state, setState] = useState(() => fallbackForTheme(themeColorKey));

  useEffect(() => {
    const trimmed = String(imageSrc || '').trim();
    if (!trimmed) {
      setState(fallbackForTheme(themeColorKey));
      return;
    }

    let cancelled = false;
    const img = new Image();

    const trySample = () => {
      try {
        const maxW = 96;
        const natW = img.naturalWidth || img.width;
        const natH = img.naturalHeight || img.height;
        if (!natW || !natH) throw new Error('no dims');

        const w = maxW;
        const h = Math.max(24, Math.round((natH / natW) * w));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) throw new Error('no ctx');

        ctx.drawImage(img, 0, 0, w, h);
        const bandStart = Math.floor(h * 0.68);
        const bandH = h - bandStart;
        if (bandH < 1) throw new Error('thin band');

        const { data } = ctx.getImageData(0, bandStart, w, bandH);
        let r = 0;
        let g = 0;
        let b = 0;
        let n = 0;
        for (let i = 0; i < data.length; i += 4) {
          r += data[i];
          g += data[i + 1];
          b += data[i + 2];
          n += 1;
        }
        if (!n) throw new Error('empty');

        r /= n;
        g /= n;
        b /= n;
        const p = panelRgbFromSample(r, g, b);
        const bottomHex = rgbToHex(p.r, p.g, p.b);

        if (!cancelled) {
          setState({ bottomHex, sampled: true });
        }
      } catch {
        if (!cancelled) {
          setState(fallbackForTheme(themeColorKey));
        }
      }
    };

    img.onload = trySample;
    img.onerror = () => {
      if (!cancelled) setState(fallbackForTheme(themeColorKey));
    };

    // Same-origin / proxied uploads: avoid crossOrigin so we are not tainted unnecessarily
    img.decoding = 'async';
    img.src = trimmed;

    return () => {
      cancelled = true;
    };
  }, [imageSrc, themeColorKey]);

  return state;
}

export { THEME_BOTTOM_HEX, fallbackForTheme };
