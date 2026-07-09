import { degToCardinal } from './cardinal.js';

// UKC Mix = per-hour blend of the local/short-range models the owner trusts (GFS is
// deliberately excluded — it reads wrong for the Gülbahçe lagoon). Wind/gust/temp/
// cloud/rain are medians (robust to one model drifting); direction is a vector mean.
export const MIX_MODELS = ['wrf3', 'wrf9', 'icon7', 'ifs9'];

export const median = (nums) => {
  const a = nums.filter((n) => n != null).sort((x, y) => x - y);
  if (!a.length) return null;
  const mid = Math.floor(a.length / 2);
  return a.length % 2 ? a[mid] : (a[mid - 1] + a[mid]) / 2;
};

export const circularMeanDeg = (degs) => {
  const ds = degs.filter((d) => d != null);
  if (!ds.length) return null;
  let s = 0, c = 0;
  for (const d of ds) { const r = (d * Math.PI) / 180; s += Math.sin(r); c += Math.cos(r); }
  return ((Math.atan2(s, c) * 180) / Math.PI + 360) % 360;
};

const round1 = (n) => (n == null ? null : Math.round(n * 10) / 10);
const rain = (h) => (h.precip1hMm != null ? h.precip1hMm : (h.precip3hMm != null ? h.precip3hMm / 3 : null));

/**
 * @param {Array<{key:string, hours:Array}>} models
 * @returns {{hours:Array, contributors:string[]}}
 */
export const buildMix = (models) => {
  const byKey = Object.fromEntries(models.map((m) => [m.key, m]));
  const present = MIX_MODELS.filter((k) => byKey[k]);
  const slots = new Map(); // `${dateLocal} ${hour}` → { base, samples[] }

  for (const key of present) {
    for (const h of byKey[key].hours) {
      const id = `${h.dateLocal} ${h.hour}`;
      if (!slots.has(id)) slots.set(id, { base: h, samples: [] });
      slots.get(id).samples.push({ key, h });
    }
  }

  const hours = [];
  for (const { base, samples } of slots.values()) {
    const dirDeg = circularMeanDeg(samples.map((s) => s.h.dirDeg));
    hours.push({
      dateLocal: base.dateLocal, timeLocal: base.timeLocal, dayName: base.dayName, day: base.day, hour: base.hour,
      wspdKn: round1(median(samples.map((s) => s.h.wspdKn))),
      gustKn: round1(median(samples.map((s) => s.h.gustKn))),
      dirDeg: dirDeg == null ? null : Math.round(dirDeg),
      dirText: degToCardinal(dirDeg),
      tempC: round1(median(samples.map((s) => s.h.tempC))),
      pressureHpa: round1(median(samples.map((s) => s.h.pressureHpa))),
      cloudHighPct: round1(median(samples.map((s) => s.h.cloudHighPct))),
      cloudMidPct: round1(median(samples.map((s) => s.h.cloudMidPct))),
      cloudLowPct: round1(median(samples.map((s) => s.h.cloudLowPct))),
      precip3hMm: null,
      precip1hMm: round1(median(samples.map((s) => rain(s.h)))),
      humidityPct: round1(median(samples.map((s) => s.h.humidityPct))),
      sources: MIX_MODELS.filter((k) => samples.some((s) => s.key === k)),
    });
  }

  hours.sort((a, b) => (a.dateLocal < b.dateLocal ? -1 : a.dateLocal > b.dateLocal ? 1 : a.hour - b.hour));
  return { hours, contributors: present };
};
