import { getWindBand } from './windBands';

// Shared SVG-path geometry for the wind curves (forecast + live history). Kept out of
// the components so the forecast grid and WindHistoryChart draw identical, gap-aware, band-
// coloured lines from the same primitives.

// Shared y-axis ceiling (knots): the forecast curve and the history chart use the same
// vertical scale so they read as one visual language ("colour + height = how windy").
export const MAX_KN = 35;

// Polyline "d" from a run of points.
export const lineD = (pts) =>
  pts.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');

// Closed area "d" from a run of points down to a baseline y.
export const areaD = (pts, baseY) =>
  pts.length
    ? `${lineD(pts)} L${pts[pts.length - 1].x.toFixed(1)} ${baseY} L${pts[0].x.toFixed(1)} ${baseY} Z`
    : '';

/**
 * Split a polyline into consecutive runs of a single wind band, breaking on null
 * (offline / no-data → a visual gap, no interpolation). Adjacent bands share the
 * boundary point so the coloured line stays continuous across a band change.
 * @param {Array<{x:number,y:number,band:string}|null>} pts
 * @returns {Array<{band:string, pts:Array<{x:number,y:number}>}>}
 */
export const segmentsByBand = (pts) => {
  const runs = [];
  let cur = null;
  for (const p of pts) {
    if (p == null) {
      cur = null; // gap → break the run so the line stops here
      continue;
    }
    if (!cur || cur.band !== p.band) {
      if (cur) cur.pts.push({ x: p.x, y: p.y }); // bridge into the new colour
      cur = { band: p.band, pts: [{ x: p.x, y: p.y }] };
      runs.push(cur);
    } else {
      cur.pts.push({ x: p.x, y: p.y });
    }
  }
  return runs;
};

/**
 * Build the band-tagged point for a wind value, or null for a gap. `yAt` maps a value
 * to a screen y; keeps the band lookup in one place for both charts.
 */
export const bandPoint = (x, kn, yAt) =>
  kn == null ? null : { x, y: yAt(kn), band: getWindBand(kn) };

/**
 * Single-colour polyline broken into contiguous (non-null) runs → array of "d"
 * strings. Used for the gust line, which is one colour but must still break on gaps.
 */
export const splitLines = (pts) => {
  const lines = [];
  let seg = [];
  const flush = () => { if (seg.length) lines.push(lineD(seg)); seg = []; };
  pts.forEach((p) => { if (p == null) flush(); else seg.push(p); });
  flush();
  return lines;
};
