import dayjs from 'dayjs';

/** Two-letter initials for an avatar fallback. */
export function initials(name) {
  if (!name) return '?';
  const parts = String(name).trim().split(/\s+/);
  const first = parts[0]?.[0] || '';
  const second = parts[1]?.[0] || '';
  return (first + second).toUpperCase() || '?';
}

// A small palette of light, on-brand avatar colors chosen deterministically by name.
const AVATAR_COLORS = [
  'bg-sky-100 text-sky-700',
  'bg-emerald-100 text-emerald-700',
  'bg-violet-100 text-violet-700',
  'bg-amber-100 text-amber-700',
  'bg-rose-100 text-rose-700',
  'bg-cyan-100 text-cyan-700',
];

export function avatarColor(name) {
  const key = String(name || '');
  let hash = 0;
  for (let i = 0; i < key.length; i += 1) {
    hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  }
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

/** HH:mm for today, otherwise "DD MMM". */
export function shortTime(ts) {
  if (!ts) return '';
  const d = dayjs(ts);
  if (!d.isValid()) return '';
  return d.isSame(dayjs(), 'day') ? d.format('HH:mm') : d.format('DD MMM');
}
