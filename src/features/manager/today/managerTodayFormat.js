// Pure helpers for the manager "Today" dashboard (no React).
import Decimal from 'decimal.js';

/** Instructors on a day above this count switch the dashboard to its busy-season layout. */
export const BUSY_INSTRUCTOR_COUNT = 10;
/** Timeline span on the "Instructors today" card: 08:00 → 20:00. */
export const TIMELINE_START = 8 * 60;
export const TIMELINE_END = 20 * 60;

/** Whole-percent change, or null when there is nothing to compare with. */
export function percentChange(current, previous) {
  const prev = new Decimal(previous || 0);
  if (prev.lte(0)) return null;
  return new Decimal(current || 0).minus(prev).div(prev).times(100).toDecimalPlaces(0).toNumber();
}

/** Calendar deep link that opens the booking. */
export const bookingHref = (item) => {
  const params = new URLSearchParams({ view: 'daily' });
  if (item?.date) params.set('date', item.date);
  if (item?.bookingId) params.set('bookingId', item.bookingId);
  return `/calendars/lessons?${params.toString()}`;
};

export const toMinutes = (hhmm) => {
  if (!hhmm || typeof hhmm !== 'string' || !hhmm.includes(':')) return null;
  const [h, m] = hhmm.split(':').map(Number);
  return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : null;
};

/** Position of a lesson on the 08–20 track as CSS percentages (clamped). */
export function trackPosition(start, end) {
  const s = toMinutes(start);
  const e = toMinutes(end);
  if (s === null || e === null) return null;
  const span = TIMELINE_END - TIMELINE_START;
  const from = Math.min(Math.max(s, TIMELINE_START), TIMELINE_END);
  const to = Math.min(Math.max(e, TIMELINE_START), TIMELINE_END);
  if (to <= from) return null;
  return { left: ((from - TIMELINE_START) / span) * 100, width: ((to - from) / span) * 100 };
}

export const isBusySeason = (data) => (data?.instructors?.length || 0) > BUSY_INSTRUCTOR_COUNT;

/** Total "needs action" count shown in the queue header. */
export function actionCount(actions) {
  if (!actions) return 0;
  return ['toConfirm', 'unassigned', 'waivers', 'notClosed', 'payoutRequests', 'overbooked']
    .reduce((n, key) => n + (Number(actions[key]?.count) || 0), 0);
}

export const firstNameOf = (name) => String(name || '').trim().split(/\s+/)[0] || '';

export const greetingKey = (hour) => {
  if (hour < 12) return 'morning';
  if (hour < 18) return 'afternoon';
  return 'evening';
};
