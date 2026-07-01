import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { getWindBand } from '../utils/windBands';
import { RIDEABLE_KN } from '../utils/verdict';
import { WR_HEX, BRAND_CYAN } from '../utils/bandTheme';
import { useMeasuredWidth } from '../hooks/useMeasuredWidth';
import { segmentsByBand, lineD, areaD, bandPoint, splitLines } from '../utils/curveGeometry';
import { DataLabel } from './Typo';

// Recorded live-station history drawn the same way as the forecast curve: a pure-SVG,
// band-coloured wind line (+ soft filled bands) with the gust line on top. Time is the
// x-axis; wind is fixed 0–MAX_KN so it reads the same as the forecast. Offline periods
// are real GAPS in the line (Windguru-style) — no interpolation across them.

const MAX_KN = 35;

const RANGE_MS = {
  '6h': 6 * 60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
};
// A break longer than this between consecutive readings = the station was offline.
const GAP_MS = 20 * 60 * 1000;
// Axis tick spacing per range.
const TICK_MS = { '6h': 60 * 60 * 1000, '24h': 4 * 60 * 60 * 1000, '7d': 24 * 60 * 60 * 1000 };

// Full card vs. compact hero sparkline.
const DIMS = {
  full: { top: 12, plotH: 128, axisH: 20, showAxis: true, showGust: true, showRef: true, stroke: 2.25 },
  spark: { top: 3, plotH: 40, axisH: 0, showAxis: false, showGust: false, showRef: false, stroke: 2 },
};

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
  // Anchor "now" to the server fetch time (passed in, stable across renders) so the memo
  // caches and the curve doesn't creep every frame; fall back to a mount-time clock read.
  const spanMs = RANGE_MS[range] || RANGE_MS['24h'];
  const t1 = React.useMemo(() => nowMs || Date.now(), [nowMs]);
  const t0 = t1 - spanMs;

  const geom = React.useMemo(() => {
    const xAt = (ms) => ((Math.max(t0, Math.min(t1, ms)) - t0) / (t1 - t0)) * W;
    const yAt = (v) => d.top + (1 - Math.max(0, Math.min(MAX_KN, v)) / MAX_KN) * d.plotH;

    const windPts = [];
    const gustPts = [];
    let prevTs = null;
    let latest = null;
    for (const r of readings) {
      const ts = Date.parse(r.observedAt);
      if (!Number.isFinite(ts) || ts < t0 || ts > t1) continue; // keep strictly inside the window
      if (prevTs != null && ts - prevTs > GAP_MS) { windPts.push(null); gustPts.push(null); }
      const x = xAt(ts);
      windPts.push(bandPoint(x, r.windAvgKts, yAt));
      gustPts.push(r.windGustKts == null ? null : { x, y: yAt(r.windGustKts) });
      if (r.windAvgKts != null) latest = { x, y: yAt(r.windAvgKts), kn: r.windAvgKts, band: getWindBand(r.windAvgKts) };
      prevTs = ts;
    }
    return {
      windRuns: segmentsByBand(windPts),
      gustLines: d.showGust ? splitLines(gustPts) : [],
      refY: yAt(RIDEABLE_KN),
      latest,
    };
  }, [readings, range, W, t0, t1, d]);

  const { windRuns, gustLines, refY, latest } = geom;

  const ticks = React.useMemo(() => {
    if (!d.showAxis) return [];
    const step = TICK_MS[range] || TICK_MS['24h'];
    const out = [];
    for (let tk = Math.ceil(t0 / step) * step; tk <= t1; tk += step) out.push(tk);
    return out;
  }, [range, t0, t1, d.showAxis]);

  const fmtTick = (ms) => {
    const dt = new Date(ms);
    if (range === '7d') return dt.toLocaleDateString(locale, { weekday: 'short' });
    return `${String(dt.getHours()).padStart(2, '0')}:00`;
  };

  const isEmpty = !windRuns.length;

  return (
    <div ref={ref} className="relative w-full" aria-hidden={variant === 'spark'}>
      <svg width={W} height={totalH} className="block">
        {/* rideable reference line */}
        {d.showRef && (
          <line x1="0" y1={refY} x2={W} y2={refY} stroke="#cbd5e1" strokeWidth="1" strokeDasharray="2 4" />
        )}

        {/* wind — filled bands + band-coloured line */}
        {windRuns.map((run, i) => (
          <path key={`wa${i}`} d={areaD(run.pts, BASE_Y)} fill={WR_HEX[run.band] || BRAND_CYAN} fillOpacity="0.20" />
        ))}
        {windRuns.map((run, i) => (
          <motion.path
            key={`wl${i}`}
            d={lineD(run.pts)}
            fill="none"
            stroke={WR_HEX[run.band] || BRAND_CYAN}
            strokeWidth={d.stroke}
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={reduce ? false : { pathLength: 0, opacity: 0.4 }}
            animate={{ pathLength: 1, opacity: 1 }}
            transition={{ duration: reduce ? 0 : 0.6, ease: [0.22, 1, 0.36, 1], delay: reduce ? 0 : i * 0.04 }}
          />
        ))}

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
