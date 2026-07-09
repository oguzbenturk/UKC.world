import { MODEL_LABEL } from './models';

// Display window for the grid columns (school hours + early/late sessions).
export const DISPLAY_START = 6;
export const DISPLAY_END = 22;

// Windguru-style quality stars from wind speed (kn): <8 none, 8–11 ★, 12–15 ★★, ≥16 ★★★.
export const starRating = (kn) => (kn == null || kn < 8 ? 0 : kn < 12 ? 1 : kn < 16 ? 2 : 3);

export const cloudPct = (h) => {
  const v = [h.cloudHighPct, h.cloudMidPct, h.cloudLowPct].filter((x) => x != null);
  return v.length ? Math.max(...v) : null;
};

export const rainMm = (h) =>
  h.precip1hMm != null ? h.precip1hMm : (h.precip3hMm != null ? h.precip3hMm / 3 : null);

// The hours a day renders: inside the display window, ascending. Far models are sparse
// (3–6 hourly) so each day simply renders the hours it actually has.
export const dayColumns = (rows) =>
  (rows || []).filter((r) => r.hour >= DISPLAY_START && r.hour <= DISPLAY_END).sort((a, b) => a.hour - b.hour);

// Day source chip. Raw-model rows carry no `sources` → show the model name. Mix rows
// carry `sources[]` → "<sharpest present> +N" (or just the label when only one).
const SOURCE_ORDER = ['wrf3', 'wrf9', 'icon7', 'ifs9', 'icon13', 'gfs13'];
export const daySourceLabel = (rows, modelName) => {
  const all = new Set();
  (rows || []).forEach((r) => (r.sources || []).forEach((s) => all.add(s)));
  if (!all.size) return modelName;
  const present = SOURCE_ORDER.filter((k) => all.has(k));
  const primary = MODEL_LABEL[present[0]] || present[0];
  return present.length === 1 ? primary : `${primary} +${present.length - 1}`;
};
