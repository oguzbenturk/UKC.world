import { getWindBand } from './windBands';

// Daylight window shown in the timeline (night hours hidden — nobody rides at 3am)
export const DAY_START = 8;
export const DAY_END = 20;

// Rideable session window (highlighted with amber band)
export const SESSION_START = 10;
export const SESSION_END = 19;

// A session is "rideable" at or above this many knots — drives the best-window shade.
export const RIDEABLE_KN = 12;

// Gust/avg ratio above which a session reads as "gusty" — single source of truth
// shared by the daily verdict and the live station.
export const GUST_FACTOR_THRESHOLD = 1.4;

// "HH:00" from an hour number — the shared time formatter for the wind-report UI.
export const hhmm = (h) => `${String(h).padStart(2, '0')}:00`;

export const isInSession = (hour) => hour >= SESSION_START && hour <= SESSION_END;
export const isInDayWindow = (hour) => hour >= DAY_START && hour <= DAY_END;

// Longest contiguous run of rideable (>= RIDEABLE_KN) daylight hours. Returns
// { startHour, endHour } (inclusive) or null when nothing is rideable that day.
export const bestWindow = (hoursForDay) => {
  const rows = (hoursForDay || [])
    .filter((h) => isInDayWindow(h.hour))
    .sort((a, b) => a.hour - b.hour);
  let best = null;
  let run = null;
  for (const r of rows) {
    if (r.wspdKn != null && r.wspdKn >= RIDEABLE_KN) {
      if (!run) run = { startHour: r.hour, endHour: r.hour };
      else run.endHour = r.hour;
      const len = run.endHour - run.startHour;
      const bestLen = best ? best.endHour - best.startHour : -1;
      if (len > bestLen) best = { ...run };
    } else {
      run = null;
    }
  }
  return best;
};

// Single comparable number for ranking spots "best today". Higher = go here.
export const rideabilityScore = (summary) => {
  if (!summary) return -Infinity;
  let s = summary.peakKn || 0;
  if (summary.key === 'tooLight') s -= 40;
  if (summary.gustFactor > GUST_FACTOR_THRESHOLD) s -= 6;
  return s;
};

export const dailySummary = (hoursForDay) => {
  if (!hoursForDay?.length) return null;
  const session = hoursForDay.filter((h) => isInSession(h.hour) && h.wspdKn != null);
  const window = session.length ? session : hoursForDay.filter((h) => h.wspdKn != null);
  if (!window.length) return null;

  const speeds = window.map((h) => h.wspdKn);
  const gusts = window.map((h) => h.gustKn ?? h.wspdKn);
  const dirs = window.map((h) => h.dirDeg).filter((d) => d != null);

  const avgKn = Math.round(speeds.reduce((a, b) => a + b, 0) / speeds.length);
  const peakKn = Math.max(...speeds);
  const peakHour = window[speeds.indexOf(peakKn)]?.hour ?? null;
  const endKn = speeds[speeds.length - 1];
  const startKn = speeds[0];
  const peakGustKn = Math.max(...gusts);

  // Circular mean for direction
  const rad = dirs.map((d) => (d * Math.PI) / 180);
  const sumSin = rad.reduce((a, r) => a + Math.sin(r), 0);
  const sumCos = rad.reduce((a, r) => a + Math.cos(r), 0);
  const meanDeg = ((Math.atan2(sumSin, sumCos) * 180) / Math.PI + 360) % 360;

  const gustFactor = avgKn > 0 ? peakGustKn / avgKn : 0;
  const deltaSession = endKn - startKn;
  const slope = deltaSession / window.length;
  const avgCloud = Math.round(
    window.reduce((a, h) => a + (h.cloudHighPct ?? 0) + (h.cloudMidPct ?? 0) + (h.cloudLowPct ?? 0), 0) /
      (window.length * 3)
  );

  // Verdict key selection
  let key;
  if (peakKn < 10) key = 'tooLight';
  else if (slope > 0.6) key = 'rising';
  else if (slope < -0.6) key = 'falling';
  else if (gustFactor > GUST_FACTOR_THRESHOLD) key = 'gusty';
  else key = 'steady';

  // Skill band based on peak
  const skillBand = getWindBand(peakKn);

  // Dominant direction as 16-point cardinal
  const dirs16 = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  const dirText = dirs16[Math.round(meanDeg / 22.5) % 16];

  // Best rideable window across the whole daylight span (not just the session band).
  const win = bestWindow(hoursForDay);

  return {
    key,
    skillBand,
    avgKn,
    peakKn,
    peakHour,
    startKn,
    endKn,
    peakGustKn,
    gustFactor: Math.round(gustFactor * 100) / 100,
    dirDeg: Math.round(meanDeg),
    dirText,
    avgCloudPct: avgCloud,
    isoDate: hoursForDay[0].dateLocal,
    bestStartHour: win ? win.startHour : null,
    bestEndHour: win ? win.endHour : null,
  };
};

export const groupByDay = (hours) => {
  const map = new Map();
  for (const h of hours) {
    if (!map.has(h.dateLocal)) map.set(h.dateLocal, []);
    map.get(h.dateLocal).push(h);
  }
  return [...map.entries()].map(([dateLocal, rows]) => ({ dateLocal, rows }));
};
