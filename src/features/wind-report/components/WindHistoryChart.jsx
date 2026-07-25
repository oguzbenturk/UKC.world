import React from 'react';
import { useReducedMotion } from 'framer-motion';
import { getWindBand } from '../utils/windBands';
import { RIDEABLE_KN } from '../utils/verdict';
import { WR_HEX, BRAND_CYAN } from '../utils/bandTheme';
import { useMeasuredWidth } from '../hooks/useMeasuredWidth';
import { segmentsByBand, bandPoint, splitLines } from '../utils/curveGeometry';
import { RANGE_MS, TICK_MS, LABEL_MS, GAP_MS } from '../utils/historyConfig';
import WindBandPaths from './WindBandPaths';
import { DataLabel } from './Typo';

// Recorded live-station history: a pure-SVG, band-coloured wind line (+ soft filled
// bands) with the gust line on top. Time is the x-axis; wind is 0-anchored on an
// adaptive y-axis whose TOP hugs the window's peak, so a normal session fills the
// plot and its ups/downs read sharp (colour still encodes absolute intensity).
// Offline periods are real GAPS in the line (Windguru-style) — no interpolation.

// Full card vs. compact hero sparkline.
const DIMS = {
  full: { top: 18, plotH: 128, axisH: 20, showAxis: true, showGust: true, showRef: true, showLabels: true, stroke: 2.25 },
  spark: { top: 3, plotH: 40, axisH: 0, showAxis: false, showGust: false, showRef: false, showLabels: false, stroke: 2 },
};

// Smallest y-axis ceiling (knots). The domain is 0-anchored (so height still reads
// as absolute speed — a nuking day stays tall) but its TOP hugs the window's peak
// instead of a fixed 35, so a normal 12–20 kt session fills the plot and its
// ups/downs read sharp rather than as gentle ripples in the lower third. This floor
// stops a dead-calm window from being stretched into fake drama.
const MIN_TOP_KN = 20;

// Round a raw peak up to a clean axis ceiling: a small fixed headroom (so the
// gust point never touches the top edge) then round up to the next 5 kt. Tight
// enough that a 20–28 kt gust day lands on a 25–30 top, not a wasteful 35.
const niceCeil = (peak) => {
  const padded = Math.max(MIN_TOP_KN, peak + 2);
  return Math.ceil(padded / 5) * 5;
};

// Gridline / label step for a given domain ceiling.
const gridStep = (top) => (top <= 20 ? 5 : top <= 45 ? 10 : 15);

const WindHistoryChart = ({
  readings = [],
  range = '24h',
  variant = 'full',
  nowMs,
  locale = 'en',
  t = (k, o) => (o && o.defaultValue) || k,
}) => {
  const reduce = useReducedMotion();
  const [ref, width] = useMeasuredWidth();

  const d = DIMS[variant] || DIMS.full;
  const BASE_Y = d.top + d.plotH;
  const totalH = BASE_Y + (d.showAxis ? d.axisH : 4);
  const W = width || 480;

  // Fixed window [now - range, now] so "now" sits at the right edge and the axis reads.
  // "now" is the server fetch time (passed in, stable across renders); it only falls back
  // to a live clock read in the empty/loading state, where nothing is plotted anyway.
  const spanMs = RANGE_MS[range] || RANGE_MS['24h'];
  const t1 = nowMs ?? Date.now();
  const t0 = t1 - spanMs;

  const geom = React.useMemo(() => {
    const xAt = (ms) => ((Math.max(t0, Math.min(t1, ms)) - t0) / (t1 - t0)) * W;

    // Rows strictly inside the window, in order, with a parsed timestamp.
    const rows = [];
    for (const r of readings) {
      const ts = Date.parse(r.observedAt);
      if (!Number.isFinite(ts) || ts < t0 || ts > t1) continue;
      rows.push({ ts, ...r });
    }

    // Adaptive, 0-anchored y-domain: top hugs the window's peak (gust preferred).
    let peak = 0;
    for (const r of rows) {
      const v = r.windGustKts ?? r.windAvgKts;
      if (v != null && v > peak) peak = v;
    }
    const domainTop = niceCeil(peak);
    const yAt = (v) => d.top + (1 - Math.max(0, Math.min(domainTop, v)) / domainTop) * d.plotH;

    const windPts = [];
    const gustPts = [];
    let prevTs = null;
    let latest = null;
    for (const r of rows) {
      if (prevTs != null && r.ts - prevTs > GAP_MS) { windPts.push(null); gustPts.push(null); }
      const x = xAt(r.ts);
      windPts.push(bandPoint(x, r.windAvgKts, yAt));
      gustPts.push(r.windGustKts == null ? null : { x, y: yAt(r.windGustKts) });
      if (r.windAvgKts != null) latest = { x, y: yAt(r.windAvgKts), kn: r.windAvgKts, band: getWindBand(r.windAvgKts) };
      prevTs = r.ts;
    }

    // Inline value labels: at each LABEL_MS step, tag the nearest reading (within
    // half a step, so gaps stay unlabelled) with its rounded avg. Skip the one
    // closest to "now" — the latest-reading number already sits there.
    const labelPts = [];
    if (d.showLabels) {
      const labelStep = LABEL_MS[range] || LABEL_MS['24h'];
      const tol = labelStep / 2;
      const withAvg = rows.filter((r) => r.windAvgKts != null);
      const seen = new Set();
      for (let tk = Math.ceil(t0 / labelStep) * labelStep; tk <= t1; tk += labelStep) {
        let best = null;
        for (const r of withAvg) {
          const dist = Math.abs(r.ts - tk);
          if (dist <= tol && (!best || dist < best.dist)) best = { r, dist };
        }
        if (!best || seen.has(best.r.ts)) continue;
        seen.add(best.r.ts);
        const x = xAt(best.r.ts);
        if (latest && Math.abs(x - latest.x) < 26) continue; // don't clash with the live number
        labelPts.push({ x, y: yAt(best.r.kn ?? best.r.windAvgKts), kn: Math.round(best.r.windAvgKts), band: getWindBand(best.r.windAvgKts) });
      }
    }

    return {
      windRuns: segmentsByBand(windPts),
      gustLines: d.showGust ? splitLines(gustPts) : [],
      refY: yAt(RIDEABLE_KN),
      domainTop,
      labelPts,
      latest,
    };
  }, [readings, range, W, t0, t1, d]);

  const { windRuns, gustLines, refY, domainTop, labelPts, latest } = geom;

  const ticks = React.useMemo(() => {
    if (!d.showAxis) return [];
    const step = TICK_MS[range] || TICK_MS['24h'];
    const out = [];
    for (let tk = Math.ceil(t0 / step) * step; tk <= t1; tk += step) out.push(tk);
    return out;
  }, [range, t0, t1, d.showAxis]);

  // Knots (y) axis: 0-anchored but auto-scaled to the window's peak (see domainTop),
  // so the curve uses the full plot height and its ups/downs read sharp. Gridlines
  // step by a clean interval derived from the domain.
  const knTicks = React.useMemo(() => {
    if (!d.showAxis) return [];
    const y = (v) => d.top + (1 - Math.max(0, Math.min(domainTop, v)) / domainTop) * d.plotH;
    const step = gridStep(domainTop);
    const out = [];
    for (let kn = step; kn < domainTop; kn += step) out.push({ kn, y: y(kn) });
    return out;
  }, [d, domainTop]);

  const fmtTick = (ms) => {
    const dt = new Date(ms);
    if (range === '7d') return dt.toLocaleDateString(locale, { weekday: 'short' });
    if (range === '1h') return `${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}`;
    return `${String(dt.getHours()).padStart(2, '0')}:00`;
  };

  const isEmpty = !windRuns.length;

  return (
    <div ref={ref} className="relative w-full" aria-hidden={variant === 'spark'}>
      <svg width={W} height={totalH} className="block">
        {/* knots scale — faint horizontal gridlines behind the curve */}
        {knTicks.map(({ kn, y }) => (
          <line key={`kg${kn}`} x1="0" y1={y} x2={W} y2={y} stroke="#f1f5f9" strokeWidth="1" />
        ))}

        {/* rideable reference line */}
        {d.showRef && (
          <line x1="0" y1={refY} x2={W} y2={refY} stroke="#cbd5e1" strokeWidth="1" strokeDasharray="2 4" />
        )}

        {/* wind — filled bands + band-coloured line */}
        <WindBandPaths runs={windRuns} baseY={BASE_Y} strokeWidth={d.stroke} stagger={0.04} reduce={reduce} />

        {/* gust line (full only) */}
        {gustLines.map((path, i) => (
          <path key={`g${i}`} d={path} fill="none" stroke="#94a3b8" strokeWidth="1.25" strokeDasharray="4 3" strokeLinecap="round" />
        ))}

        {/* latest point — the live edge */}
        {latest && (
          <>
            <line x1={latest.x} y1={d.top} x2={latest.x} y2={BASE_Y} stroke={WR_HEX[latest.band] || BRAND_CYAN} strokeWidth="1" strokeOpacity="0.4" />
            <circle cx={latest.x} cy={latest.y} r={variant === 'spark' ? 3 : 4} fill={WR_HEX[latest.band] || BRAND_CYAN} stroke="#fff" strokeWidth="1.5" />
          </>
        )}

        {/* knots scale labels + unit (over the curve, white halo so they stay readable) */}
        {knTicks.map(({ kn, y }) => (
          <text
            key={`kt${kn}`}
            x="3"
            y={y - 3}
            fontSize="10"
            fontWeight="600"
            fill="#94a3b8"
            stroke="#ffffff"
            strokeWidth="2.5"
            paintOrder="stroke"
            fontFamily="inherit"
          >
            {kn}
          </text>
        ))}
        {d.showAxis && (
          <text
            x="3"
            y={d.top + 3}
            fontSize="9.5"
            fontWeight="700"
            fill="#cbd5e1"
            stroke="#ffffff"
            strokeWidth="2.5"
            paintOrder="stroke"
            fontFamily="inherit"
          >
            kts
          </text>
        )}

        {/* inline wind-speed value labels along the curve (every LABEL_MS) */}
        {labelPts.map((p) => (
          <text
            key={`vl${p.x.toFixed(0)}`}
            x={p.x}
            y={Math.max(d.top + 9, p.y - 8)}
            textAnchor="middle"
            fontSize="10.5"
            fontWeight="700"
            fill={WR_HEX[p.band] || BRAND_CYAN}
            stroke="#ffffff"
            strokeWidth="2.75"
            paintOrder="stroke"
            fontFamily="inherit"
          >
            {p.kn}
          </text>
        ))}

        {/* latest reading — the current live wind, in knots */}
        {latest && d.showAxis && (
          <text
            x={Math.max(20, latest.x - 8)}
            y={Math.min(BASE_Y - 5, Math.max(d.top + 12, latest.y - 9))}
            textAnchor="end"
            fontSize="13"
            fontWeight="700"
            fill={WR_HEX[latest.band] || BRAND_CYAN}
            stroke="#ffffff"
            strokeWidth="3"
            paintOrder="stroke"
            fontFamily="inherit"
          >
            {Math.round(latest.kn)}
          </text>
        )}

        {/* time axis (full only) */}
        {d.showAxis && ticks.map((tk) => {
          const x = ((tk - t0) / (t1 - t0)) * W;
          return (
            <text key={`t${tk}`} x={x} y={BASE_Y + 15} textAnchor="middle" fontSize="11" fontWeight="600" fill="#475569" fontFamily="inherit">
              {fmtTick(tk)}
            </text>
          );
        })}
      </svg>

      {/* empty state — the graph starts blank and fills as the recorder runs */}
      {isEmpty && variant === 'full' && (
        <div className="absolute inset-0 flex items-center justify-center px-4 text-center">
          <DataLabel className="not-italic text-slate-400">
            {t('windReport.history.empty', { defaultValue: 'Recording — the history fills in as the station reports.' })}
          </DataLabel>
        </div>
      )}
    </div>
  );
};

export default WindHistoryChart;
