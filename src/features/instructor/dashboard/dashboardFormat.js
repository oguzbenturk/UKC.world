// Pure helpers for the instructor "My day" dashboard (no React).
import dayjs from 'dayjs';

export const DEFAULT_WIND = Object.freeze({ spot: 'gulbahce', minKn: 12, maxKn: 25 });
export const WIND_BAR_HOURS = [9, 11, 13, 15, 17, 19];

const DONE_STATUSES = new Set(['completed', 'done', 'checked-out', 'checked_out', 'no_show', 'no-show']);
const DONE_CHECKOUT = new Set(['checked-out', 'early-checkout']);

export const isLessonDone = (lesson) => DONE_STATUSES.has(String(lesson?.status || '').toLowerCase())
  || DONE_CHECKOUT.has(String(lesson?.checkoutStatus || '').toLowerCase());

export const isCheckedIn = (lesson) => String(lesson?.checkinStatus || '').toLowerCase() === 'checked-in';

/** "10:30" → 630 (minutes since midnight). */
export const toMinutes = (hhmm) => {
  if (!hhmm || typeof hhmm !== 'string' || !hhmm.includes(':')) return null;
  const [h, m] = hhmm.split(':').map(Number);
  return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : null;
};

export const fromMinutes = (minutes) => {
  if (minutes == null) return '';
  const total = ((Math.round(minutes) % 1440) + 1440) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
};

export const lessonEnd = (lesson) => {
  const start = toMinutes(lesson?.startHour);
  if (start == null) return '';
  return fromMinutes(start + Math.round(Number(lesson.durationHours || 0) * 60));
};

/**
 * Timeline state of every lesson: done → now (checked in) → next → unclosed
 * (earlier lesson nobody checked out) → later.
 */
export function lessonStates(lessons = [], nextLessonId = null) {
  const nextIndex = lessons.findIndex((l) => l.id === nextLessonId);
  const states = {};
  lessons.forEach((lesson, index) => {
    if (isLessonDone(lesson)) states[lesson.id] = 'done';
    else if (isCheckedIn(lesson)) states[lesson.id] = 'now';
    else if (lesson.id === nextLessonId) states[lesson.id] = 'next';
    else if (nextIndex === -1 || index < nextIndex) states[lesson.id] = 'unclosed';
    else states[lesson.id] = 'later';
  });
  return states;
}

/** Whole minutes from `now` until the lesson starts (negative once started). */
export const minutesUntil = (date, startHour, now = dayjs()) => {
  if (!date || !startHour) return null;
  const start = dayjs(`${date}T${startHour}:00`);
  return start.isValid() ? Math.round(start.diff(now, 'minute', true)) : null;
};

export const greetingKey = (hour) => {
  if (hour < 12) return 'morning';
  if (hour < 18) return 'afternoon';
  return 'evening';
};

export const firstName = (user) => {
  if (!user) return '';
  if (user.first_name) return String(user.first_name).trim();
  const name = String(user.name || '').trim();
  return name.split(/\s+/)[0] || '';
};

export const participantLabel = (lesson) => {
  const names = (lesson?.participants || []).map((p) => p.name).filter(Boolean);
  return { first: names[0] || null, others: Math.max((lesson?.groupSize || names.length || 1) - 1, names.length - 1, 0) };
};

// ─── Wind ────────────────────────────────────────────────────────────────────

const num = (value, fallback) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

/** settings.instructor_dashboard → { spot, minKn, maxKn } with safe defaults. */
export function resolveWindSettings(raw) {
  const spot = typeof raw?.wind_spot === 'string' && raw.wind_spot.trim() ? raw.wind_spot.trim() : DEFAULT_WIND.spot;
  let minKn = num(raw?.wind_min_kn, DEFAULT_WIND.minKn);
  let maxKn = num(raw?.wind_max_kn, DEFAULT_WIND.maxKn);
  if (minKn > maxKn) [minKn, maxKn] = [DEFAULT_WIND.minKn, DEFAULT_WIND.maxKn];
  return { spot, minKn, maxKn };
}

export const windVerdict = (speedKn, { minKn, maxKn }) => {
  if (speedKn == null || !Number.isFinite(Number(speedKn))) return null;
  if (speedKn < minKn) return 'light';
  if (speedKn > maxKn) return 'strong';
  return 'good';
};

/**
 * From a /weather/report payload pick the "now" hour and the 09–19 bars for
 * `date` (local date of the spot). Returns null when the day isn't covered.
 */
export function pickWind(report, date, nowHour) {
  const hours = (report?.forecast?.hours || []).filter((h) => h.dateLocal === date && h.wspdKn != null);
  if (!hours.length) return null;
  const nearest = (target) => hours.reduce((best, h) => (
    Math.abs(h.hour - target) < Math.abs(best.hour - target) ? h : best
  ), hours[0]);
  const pastOrNow = hours.filter((h) => h.hour <= nowHour);
  const current = pastOrNow.length ? pastOrNow[pastOrNow.length - 1] : hours[0];
  const bars = WIND_BAR_HOURS.map((hour) => {
    const h = nearest(hour);
    return Math.abs(h.hour - hour) <= 1 ? { hour, speedKn: Math.round(h.wspdKn) } : { hour, speedKn: null };
  });
  return {
    current: {
      speedKn: Math.round(current.wspdKn),
      gustKn: current.gustKn == null ? null : Math.round(current.gustKn),
      dirDeg: current.dirDeg ?? null,
      dirText: current.dirText || null,
    },
    bars,
  };
}

export const isAllDayGood = (bars, settings) => {
  const known = bars.filter((b) => b.speedKn != null);
  return known.length > 0 && known.every((b) => windVerdict(b.speedKn, settings) === 'good');
};
