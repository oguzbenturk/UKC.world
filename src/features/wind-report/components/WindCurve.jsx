import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { getWindBand } from '../utils/windBands';
import { DAY_START, DAY_END, RIDEABLE_KN } from '../utils/verdict';
import { WR_HEX, BRAND_CYAN } from '../utils/bandTheme';
import { useMeasuredWidth } from '../hooks/useMeasuredWidth';
import { segmentsByBand, lineD, areaD, bandPoint, splitLines } from '../utils/curveGeometry';

// One day of forecast drawn as a wind+gust curve instead of a row of number cells.
// Pure SVG, no charting dep. The SVG is rendered at the container's MEASURED pixel
// width (not viewBox-scaled) so axis text stays crisp and dots stay round at any size
// — from a 300px phone column to the wide featured card. Fixed 0–MAX_KN y-domain so
// every spot's curve is visually comparable. Tap/keyboard targets live in an HTML
// overlay above the SVG.

const MAX_KN = 35;
const PLOT_TOP = 8;
const PLOT_H = 64;
const BASE_Y = PLOT_TOP + PLOT_H;
const AXIS_H = 22;
const TOTAL_H = BASE_Y + AXIS_H;

const HOURS = Array.from({ length: DAY_END - DAY_START + 1 }, (_, i) => DAY_START + i);
const N = HOURS.length;

const WindCurve = ({
  dateLocal,
  rows = [],
  selectedKey,
  onSelectHour,
  bestStartHour,
  bestEndHour,
  peakHour,
  nowHour = null,
  showAxis = false,
  t,
}) => {
  const reduce = useReducedMotion();
  const [ref, width] = useMeasuredWidth();

  const cells = React.useMemo(() => {
    const byHour = new Map(rows.map((r) => [r.hour, r]));
    return HOURS.map((h) => byHour.get(h) || { hour: h, wspdKn: null, gustKn: null, dirDeg: null, dirText: '—', tempC: null });
  }, [rows]);

  const W = width || 480; // fallback before first measure
  const colW = W / N;
  const xAt = (idx) => idx * colW + colW / 2;
  const yAt = (v) => PLOT_TOP + (1 - Math.max(0, Math.min(MAX_KN, v)) / MAX_KN) * PLOT_H;

  // Band-tagged points + path strings depend only on the data and the measured width,
  // so keep them out of the per-selection re-render path.
  const { windPts, windRuns, gustLines } = React.useMemo(() => {
    const wp = cells.map((c, i) => bandPoint(xAt(i), c.wspdKn, yAt));
    const gp = cells.map((c, i) => (c.gustKn == null ? null : { x: xAt(i), y: yAt(c.gustKn) }));
    return { windPts: wp, windRuns: segmentsByBand(wp), gustLines: splitLines(gp) };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- xAt/yAt derive purely from W
  }, [cells, W]);

  const refY = yAt(RIDEABLE_KN);
  const peakIdx = peakHour != null ? peakHour - DAY_START : -1;
  const peakCell = peakIdx >= 0 ? cells[peakIdx] : null;
  const selIdx = selectedKey && selectedKey.startsWith(`${dateLocal}:`)
    ? Number(selectedKey.split(':')[1]) - DAY_START
    : -1;
  const nowIdx = nowHour != null ? nowHour - DAY_START : -1;

  const bestX = bestStartHour != null ? (bestStartHour - DAY_START) * colW : null;
  const bestW = bestStartHour != null ? (bestEndHour - bestStartHour + 1) * colW : 0;
  const totalH = showAxis ? TOTAL_H : BASE_Y + 6;

  return (
    <div ref={ref} className="relative w-full">
      <svg width={W} height={totalH} className="block" aria-hidden="true">
        {/* best rideable window */}
        {bestX != null && (
          <>
            <rect x={bestX} y={PLOT_TOP} width={bestW} height={PLOT_H} fill="#10b981" fillOpacity="0.12" />
            <line x1={bestX} y1={PLOT_TOP} x2={bestX + bestW} y2={PLOT_TOP} stroke="#10b981" strokeOpacity="0.5" strokeWidth="1.5" strokeDasharray="3 3" />
          </>
        )}

        {/* rideable reference line */}
        <line x1="0" y1={refY} x2={W} y2={refY} stroke="#cbd5e1" strokeWidth="1" strokeDasharray="2 4" />

        {/* wind — area + line coloured by wind band ("colour = how windy") */}
        {windRuns.map((run, i) => (
          <path key={`wa${i}`} d={areaD(run.pts, BASE_Y)} fill={WR_HEX[run.band] || BRAND_CYAN} fillOpacity="0.20" />
        ))}
        {windRuns.map((run, i) => (
          <motion.path
            key={`wl${i}`}
            d={lineD(run.pts)}
            fill="none"
            stroke={WR_HEX[run.band] || BRAND_CYAN}
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={reduce ? false : { pathLength: 0, opacity: 0.4 }}
            animate={{ pathLength: 1, opacity: 1 }}
            transition={{ duration: reduce ? 0 : 0.6, ease: [0.22, 1, 0.36, 1], delay: reduce ? 0 : i * 0.06 }}
          />
        ))}

        {/* gust line */}
        {gustLines.map((d, i) => (
          <path key={`g${i}`} d={d} fill="none" stroke="#94a3b8" strokeWidth="1.25" strokeDasharray="4 3" strokeLinecap="round" />
        ))}

        {/* now marker (today only) */}
        {nowIdx >= 0 && (
          <line x1={xAt(nowIdx)} y1={PLOT_TOP} x2={xAt(nowIdx)} y2={BASE_Y} stroke="#0f172a" strokeWidth="1" strokeDasharray="1 3" strokeOpacity="0.35" />
        )}

        {/* selected plumb line + dot */}
        {selIdx >= 0 && (
          <line x1={xAt(selIdx)} y1={PLOT_TOP} x2={xAt(selIdx)} y2={BASE_Y} stroke={BRAND_CYAN} strokeWidth="1.25" />
        )}
        {selIdx >= 0 && windPts[selIdx] && (
          <circle cx={windPts[selIdx].x} cy={windPts[selIdx].y} r="3.5" fill={WR_HEX[windPts[selIdx].band] || BRAND_CYAN} stroke="#fff" strokeWidth="1.5" />
        )}

        {/* peak gust value (muted, above the gust line) */}
        {peakCell && peakCell.gustKn != null && (
          <text
            x={xAt(peakIdx)}
            y={Math.max(10, yAt(peakCell.gustKn) - 5)}
            textAnchor="middle"
            fontSize="10.5"
            fontWeight="600"
            fill="#64748b"
            stroke="#ffffff"
            strokeWidth="2.5"
            paintOrder="stroke"
            fontFamily="inherit"
          >
            {peakCell.gustKn}
          </text>
        )}

        {/* peak dot */}
        {peakCell && peakCell.wspdKn != null && (
          <circle cx={xAt(peakIdx)} cy={yAt(peakCell.wspdKn)} r="3.25" fill={WR_HEX[getWindBand(peakCell.wspdKn)] || BRAND_CYAN} stroke="#fff" strokeWidth="1.5" />
        )}

        {/* wind value labels — the readable numbers (white halo so they pop over the fill) */}
        {cells.map((c, i) => {
          if (c.wspdKn == null) return null;
          const step = colW >= 40 ? 1 : 2; // every hour on wide cards, every 2nd on a phone
          const isPeak = i === peakIdx;
          const isSel = i === selIdx;
          if (!isPeak && !isSel && c.hour % step !== 0) return null;
          const y = yAt(c.wspdKn);
          // Push the peak's wind number below its point so it can't collide with the
          // peak gust number sitting above the gust line at the same x.
          const forceBelow = isPeak && peakCell && peakCell.gustKn != null;
          const above = !forceBelow && y > PLOT_TOP + 18;
          return (
            <text
              key={`v${c.hour}`}
              x={xAt(i)}
              y={above ? y - 8 : y + 15}
              textAnchor="middle"
              fontSize={isPeak || isSel ? 14 : 13}
              fontWeight="700"
              fill={isPeak ? BRAND_CYAN : '#0f172a'}
              stroke="#ffffff"
              strokeWidth="3.25"
              paintOrder="stroke"
              fontFamily="inherit"
            >
              {c.wspdKn}
            </text>
          );
        })}

        {/* hour axis — shown under every day row, high-contrast: tick every 2h, HH:00 label every 4h */}
        {showAxis && HOURS.map((h, i) => {
          if (h % 2 !== 0) return null;
          return (
            <g key={`ax${h}`}>
              <line x1={xAt(i)} y1={BASE_Y + 2} x2={xAt(i)} y2={BASE_Y + 6} stroke="#94a3b8" strokeWidth="1" />
              {h % 4 === 0 && (
                <text x={xAt(i)} y={BASE_Y + 17} textAnchor="middle" fontSize="12" fontWeight="600" fill="#334155" fontFamily="inherit">
                  {`${String(h).padStart(2, '0')}:00`}
                </text>
              )}
            </g>
          );
        })}
      </svg>

      {/* a11y + tap overlay — one button per hour column */}
      <div className="absolute inset-x-0 top-0 flex" style={{ height: BASE_Y }}>
        {cells.map((c) => {
          const key = `${dateLocal}:${c.hour}`;
          const band = getWindBand(c.wspdKn);
          const has = c.wspdKn != null;
          const selected = key === selectedKey;
          return (
            <button
              key={key}
              type="button"
              disabled={!has}
              onClick={() => has && onSelectHour?.({ ...c, dateLocal })}
              aria-pressed={selected}
              aria-label={has
                ? t('windReport.a11y.hourCell', {
                  time: `${String(c.hour).padStart(2, '0')}:00`,
                  wind: c.wspdKn,
                  gust: c.gustKn ?? '—',
                  dir: c.dirText || '',
                  band: t(`windReport.skill.${band}`, { defaultValue: band }),
                  defaultValue: `${String(c.hour).padStart(2, '0')}:00, ${c.wspdKn} knots, gusts ${c.gustKn ?? '—'}, ${c.dirText || ''}`,
                })
                : `${String(c.hour).padStart(2, '0')}:00 — no data`}
              className="min-w-0 flex-1 rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-[#00a8c4] disabled:cursor-default"
            />
          );
        })}
      </div>
    </div>
  );
};

export default WindCurve;
