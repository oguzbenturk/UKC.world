// Wind-report-SCOPED colour ramp. The shared windBands.js BAND_BG is left untouched
// because it is also consumed by the DailyView booking calendar — we do NOT want to
// restyle the calendar. Everything on /wind-report (cells, curve, legend, live-state
// chip, skill chip) reads from THIS file so the page speaks one consistent language:
// "colour = how windy", anchored on brand cyan (#00a8c4) as the sweet spot ("ideal").
//
// Contrast discipline: saturated fills are never placed under small text. Small text
// uses the SOFT fill + dark TEXT token (all clear WCAG AA 4.5:1). The saturated FILL
// survives only as the curve area, a 3px accent, or a ≥18px chip with its dark text.

export const WR_BANDS = ['flat', 'light', 'beginner', 'ideal', 'strong', 'expert'];

// Saturated fill — chips ≥18px text, dots, accents (NOT under small text).
export const WR_FILL = {
  flat: 'bg-slate-300',
  light: 'bg-sky-300',
  beginner: 'bg-sky-400',
  ideal: 'bg-[#00a8c4]',
  strong: 'bg-amber-400',
  expert: 'bg-rose-500',
};

// Soft fill — the safe background for small numerals + dark text.
export const WR_SOFT = {
  flat: 'bg-slate-100',
  light: 'bg-sky-50',
  beginner: 'bg-sky-100',
  ideal: 'bg-cyan-50',
  strong: 'bg-amber-50',
  expert: 'bg-rose-50',
};

// Dark text token that clears AA on its SOFT fill.
export const WR_TEXT = {
  flat: 'text-slate-700',
  light: 'text-sky-800',
  beginner: 'text-sky-900',
  ideal: 'text-cyan-900',
  strong: 'text-amber-900',
  expert: 'text-rose-800',
};

// Dot / ring accents.
export const WR_DOT = {
  flat: 'bg-slate-400',
  light: 'bg-sky-400',
  beginner: 'bg-sky-500',
  ideal: 'bg-[#00a8c4]',
  strong: 'bg-amber-500',
  expert: 'bg-rose-500',
};

// Chip = soft bg + dark text + soft ring, in one string.
export const WR_CHIP = {
  flat: 'bg-slate-100 text-slate-700 ring-1 ring-slate-200',
  light: 'bg-sky-50 text-sky-800 ring-1 ring-sky-200',
  beginner: 'bg-sky-100 text-sky-900 ring-1 ring-sky-200',
  ideal: 'bg-cyan-50 text-cyan-900 ring-1 ring-cyan-200',
  strong: 'bg-amber-50 text-amber-900 ring-1 ring-amber-200',
  expert: 'bg-rose-50 text-rose-800 ring-1 ring-rose-200',
};

// Raw hex for SVG (curve fill/stroke/dots) — same ramp.
export const WR_HEX = {
  flat: '#94a3b8', // slate-400
  light: '#7dd3fc', // sky-300
  beginner: '#38bdf8', // sky-400
  ideal: '#00a8c4', // brand cyan
  strong: '#f59e0b', // amber-500
  expert: '#f43f5e', // rose-500
};

export const BRAND_CYAN = '#00a8c4';

// Live PWS "state" (calm/light/good/strong/extreme) → our wind band, so a "good"
// live reading is the SAME cyan as an "ideal" forecast cell.
export const STATE_TO_BAND = {
  calm: 'flat',
  light: 'light',
  good: 'ideal',
  strong: 'strong',
  extreme: 'expert',
  unknown: 'flat',
};

export const stateBand = (state) => STATE_TO_BAND[state] || 'flat';
