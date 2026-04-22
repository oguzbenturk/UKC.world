// Shared colour/skill bands for wind speed in knots.
// Keep in sync with the DailyView calendar (same thresholds) so users recognise the palette.

export const BAND_LEVELS = ['flat', 'light', 'beginner', 'ideal', 'strong', 'expert'];

export const getWindBand = (kn) => {
  if (kn == null) return null;
  if (kn < 8) return 'flat';
  if (kn < 12) return 'light';
  if (kn < 16) return 'beginner';
  if (kn < 20) return 'ideal';
  if (kn < 25) return 'strong';
  return 'expert';
};

// Tailwind classes — vibrant on the hour cells.
export const BAND_BG = {
  flat:     'bg-slate-300',
  light:    'bg-sky-400',
  beginner: 'bg-green-500',
  ideal:    'bg-lime-500',
  strong:   'bg-amber-500',
  expert:   'bg-rose-500',
};
export const BAND_BG_SOFT = {
  flat:     'bg-slate-100',
  light:    'bg-sky-100',
  beginner: 'bg-green-100',
  ideal:    'bg-lime-100',
  strong:   'bg-amber-100',
  expert:   'bg-rose-100',
};
export const BAND_TEXT = {
  flat:     'text-slate-700',
  light:    'text-sky-900',
  beginner: 'text-green-900',
  ideal:    'text-lime-900',
  strong:   'text-amber-900',
  expert:   'text-rose-900',
};
export const BAND_DOT = {
  flat:     'bg-slate-400',
  light:    'bg-sky-500',
  beginner: 'bg-green-500',
  ideal:    'bg-lime-500',
  strong:   'bg-amber-500',
  expert:   'bg-rose-500',
};
