import React from 'react';
import { BAND_BG, getWindBand } from '../utils/windBands';

// Arrow rotated +180 (shows direction of travel, not origin)
const Arrow = ({ deg = 0, size = 9 }) => {
  const rot = ((Number(deg) || 0) + 180) % 360;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" style={{ transform: `rotate(${rot}deg)` }}>
      <path d="M12 3l5 7h-3v9h-4v-9H7L12 3z" fill="currentColor" />
    </svg>
  );
};

const HourCell = ({ hour, selected, onSelect }) => {
  const band = getWindBand(hour.wspdKn);
  const bgClass = band ? BAND_BG[band] : 'bg-slate-200';

  // Use dark text for light backgrounds (flat, light) and white text for saturated ones.
  const useDarkText = band === 'flat' || band === 'light';

  return (
    <button
      type="button"
      onClick={() => onSelect?.(hour)}
      className={`group relative flex w-[40px] shrink-0 flex-col items-center gap-0.5 rounded-md py-1.5 transition-all focus:outline-none
        ${bgClass}
        ${selected
          ? 'ring-2 ring-slate-900 ring-offset-1 ring-offset-white z-10 scale-[1.06]'
          : 'ring-1 ring-black/5 hover:ring-slate-900/40'}`}
      title={`${hour.timeLocal} · ${hour.wspdKn ?? '—'}kn ${hour.dirText ?? ''} · gust ${hour.gustKn ?? '—'}kn · ${hour.tempC ?? '—'}°C`}
    >
      {/* Hour label */}
      <span className={`text-[9px] font-gotham-medium leading-none tabular-nums ${useDarkText ? 'text-slate-700' : 'text-white/85'}`}>
        {String(hour.hour).padStart(2, '0')}
      </span>

      {/* Wind speed */}
      <span className={`font-duotone-bold-extended text-[15px] leading-none tabular-nums ${useDarkText ? 'text-slate-900' : 'text-white drop-shadow-sm'}`}>
        {hour.wspdKn ?? '–'}
      </span>

      {/* Direction arrow */}
      <span className={useDarkText ? 'text-slate-700' : 'text-white/95'}>
        <Arrow deg={hour.dirDeg} size={10} />
      </span>

      {/* Gust */}
      <span className={`text-[8px] font-gotham-medium leading-none tabular-nums ${useDarkText ? 'text-slate-500' : 'text-white/80'}`}>
        {hour.gustKn ?? '–'}
      </span>
    </button>
  );
};

export default HourCell;
