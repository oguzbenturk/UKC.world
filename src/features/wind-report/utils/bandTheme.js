// Wind-report-SCOPED colour ramp. The shared windBands.js BAND_BG is left untouched
// because it is also consumed by the DailyView booking calendar — we do NOT want to
// restyle the calendar. Everything on /wind-report (cells, curve, legend, live-state
// chip, skill chip) reads from THIS file so the page speaks one consistent language:
// "colour = how windy", anchored on brand cyan (#00a8c4) as the sweet spot ("ideal").
// Deliberately vivid (Windguru-style) — colour intensity is meant to read as excitement
// as wind climbs, not just a label. "flat" stays a neutral, unexciting grey by design.
//
// Contrast discipline, now with two separate roles (they're not interchangeable):
//   - WR_TEXT   = colour AS text, sitting on a plain WHITE page (the live verdict
//                 headline). Needs to look vividly hued itself, so it stays a dark-ish
//                 tint of its own hue (e.g. orange-900), not a neutral.
//   - WR_ON_FILL = dark text sitting ON TOP of a saturated WR_SOFT/WR_FILL background
//                 (grid cells, chips). A single near-black works here because every
//                 band's fill is light enough at this tier — verified WCAG AA (≥4.5:1)
//                 against all six fills, incl. brand cyan (7.4:1) and rose-500 (4.9:1,
//                 the tightest). That's also why "expert" stays at rose-500 rather than
//                 a darker rose-600+: one dark-text rule needs to hold everywhere.
// Colour is never the only signal: every consumer pairs a fill with its number/label.

export const WR_BANDS = ['flat', 'light', 'beginner', 'ideal', 'strong', 'expert'];

// Saturated fill — chips, dots, accents.
export const WR_FILL = {
  flat: 'bg-slate-300',
  light: 'bg-sky-400',
  beginner: 'bg-emerald-400',
  ideal: 'bg-[#00a8c4]',
  strong: 'bg-orange-500',
  expert: 'bg-rose-500',
};

// Grid-cell / chip background — full-strength, same ramp as WR_FILL (paired with
// WR_ON_FILL text, never with WR_TEXT).
export const WR_SOFT = {
  flat: 'bg-slate-300',
  light: 'bg-sky-400',
  beginner: 'bg-emerald-400',
  ideal: 'bg-[#00a8c4]',
  strong: 'bg-orange-500',
  expert: 'bg-rose-500',
};

// Colour-as-text on a WHITE page (the live verdict headline). Dark enough for AA on
// white, but still reads as its own hue.
export const WR_TEXT = {
  flat: 'text-slate-700',
  light: 'text-sky-800',
  beginner: 'text-emerald-900',
  ideal: 'text-cyan-900',
  strong: 'text-orange-900',
  expert: 'text-rose-800',
};

// Dark text for small numerals/labels sitting ON a saturated WR_SOFT/WR_FILL fill.
// One token for all six bands — verified AA against every fill above.
export const WR_ON_FILL = {
  flat: 'text-slate-900',
  light: 'text-slate-900',
  beginner: 'text-slate-900',
  ideal: 'text-slate-900',
  strong: 'text-slate-900',
  expert: 'text-slate-900',
};

// Dot accents.
export const WR_DOT = {
  flat: 'bg-slate-400',
  light: 'bg-sky-400',
  beginner: 'bg-emerald-500',
  ideal: 'bg-[#00a8c4]',
  strong: 'bg-orange-500',
  expert: 'bg-rose-500',
};

// Chip = saturated fill + dark on-fill text, in one string (a solid badge, not a tint).
export const WR_CHIP = {
  flat: 'bg-slate-300 text-slate-900',
  light: 'bg-sky-400 text-slate-900',
  beginner: 'bg-emerald-400 text-slate-900',
  ideal: 'bg-[#00a8c4] text-slate-900',
  strong: 'bg-orange-500 text-slate-900',
  expert: 'bg-rose-500 text-slate-900',
};

// Raw hex for SVG (curve fill/stroke/dots) — same ramp.
export const WR_HEX = {
  flat: '#94a3b8', // slate-400
  light: '#38bdf8', // sky-400
  beginner: '#34d399', // emerald-400
  ideal: '#00a8c4', // brand cyan
  strong: '#f97316', // orange-500
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
