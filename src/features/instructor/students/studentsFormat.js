// Pure helpers for the instructor "My students" list and student profile (no React).
import dayjs from 'dayjs';
import { formatStartHour, toLocalDate } from '../earnings/earningsFormat';

export const LOW_HOURS = 2;
export const INACTIVE_DAYS = 30;

export const FILTERS = ['all', 'upcoming', 'lowHours', 'inactive'];
export const SORTS = ['next', 'recent', 'hours', 'name'];

/** Whole days between two dates (calendar days, local). */
const daysBetween = (from, to) => to.startOf('day').diff(from.startOf('day'), 'day');

export const daysSince = (date, now = dayjs()) => {
  const d = toLocalDate(date);
  return d ? daysBetween(d, now) : null;
};

export const hasPackage = (student) => Number(student?.packageHours?.totalHours || 0) > 0;

export const remainingHours = (student) => Number(student?.packageHours?.remainingHours || 0);

/** Flags that drive the filter chips and the row hints. */
export function studentFlags(student, now = dayjs()) {
  const upcoming = Boolean(student?.nextLesson?.date);
  const lowHours = hasPackage(student) && remainingHours(student) <= LOW_HOURS;
  const since = daysSince(student?.lastLessonDate, now);
  const inactive = !upcoming && (since == null || since > INACTIVE_DAYS);
  return { upcoming, lowHours, inactive };
}

const matchesQuery = (student, q) => {
  if (!q) return true;
  const hay = [student.name, student.skillLevel, student.phone].filter(Boolean).join(' ').toLocaleLowerCase();
  return q.toLocaleLowerCase().split(/\s+/).filter(Boolean).every((part) => hay.includes(part));
};

export function countByFilter(students = [], now = dayjs()) {
  const counts = { all: students.length, upcoming: 0, lowHours: 0, inactive: 0 };
  students.forEach((s) => {
    const f = studentFlags(s, now);
    if (f.upcoming) counts.upcoming += 1;
    if (f.lowHours) counts.lowHours += 1;
    if (f.inactive) counts.inactive += 1;
  });
  return counts;
}

const nextKey = (s) => (s.nextLesson?.date
  ? `${s.nextLesson.date} ${formatStartHour(s.nextLesson.startHour) || '99:99'}`
  : '9999-99-99');

const COMPARE = {
  next: (a, b) => nextKey(a).localeCompare(nextKey(b))
    || String(b.lastLessonDate || '').localeCompare(String(a.lastLessonDate || '')),
  recent: (a, b) => String(b.lastLessonDate || '').localeCompare(String(a.lastLessonDate || ''))
    || nextKey(a).localeCompare(nextKey(b)),
  hours: (a, b) => Number(b.totalHours || 0) - Number(a.totalHours || 0),
  name: (a, b) => String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base' }),
};

export function selectStudents(students = [], { query = '', filter = 'all', sort = 'next' } = {}, now = dayjs()) {
  const list = students.filter((s) => matchesQuery(s, query.trim())
    && (filter === 'all' || studentFlags(s, now)[filter]));
  return list.sort((a, b) => (COMPARE[sort] || COMPARE.next)(a, b)
    || String(a.name || '').localeCompare(String(b.name || '')));
}

/** Bucket of the next lesson: today / tomorrow / week (next 7 days) / later / none. */
export function nextBucket(student, now = dayjs()) {
  const d = toLocalDate(student?.nextLesson?.date);
  if (!d) return 'none';
  const diff = daysBetween(now, d);
  if (diff <= 0) return 'today';
  if (diff === 1) return 'tomorrow';
  if (diff < 7) return 'week';
  return 'later';
}

const BUCKETS = ['today', 'tomorrow', 'week', 'later', 'none'];

/** Sections for the list. Only the "next lesson" sort is grouped by day. */
export function groupStudents(list = [], sort = 'next', now = dayjs()) {
  if (sort !== 'next') return [{ key: 'all', items: list }];
  const map = new Map(BUCKETS.map((k) => [k, []]));
  list.forEach((s) => map.get(nextBucket(s, now)).push(s));
  return BUCKETS.filter((k) => map.get(k).length).map((key) => ({ key, items: map.get(key) }));
}

/** "Today · 15:30" / "Tomorrow · 09:00" / "Sat 12 Oct · 10:30". */
export function formatLessonWhen(date, startHour, { locale, t, now = dayjs() }) {
  const d = toLocalDate(date);
  if (!d) return '';
  const time = formatStartHour(startHour);
  const diff = daysBetween(now, d);
  let day;
  if (diff === 0) day = t('instructor:students.when.today');
  else if (diff === 1) day = t('instructor:students.when.tomorrow');
  else if (diff === -1) day = t('instructor:students.when.yesterday');
  else {
    const opts = { weekday: 'short', day: 'numeric', month: 'short' };
    if (d.year() !== now.year()) opts.year = 'numeric';
    day = new Intl.DateTimeFormat(locale, opts).format(d.toDate());
  }
  return time ? `${day} · ${time}` : day;
}

/** "today" / "yesterday" / "12 days ago" via Intl.RelativeTimeFormat. */
export function formatDaysAgo(date, locale, now = dayjs()) {
  const since = daysSince(date, now);
  if (since == null) return '';
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  if (since < 31) return rtf.format(-since, 'day');
  if (since < 365) return rtf.format(-Math.round(since / 30), 'month');
  return rtf.format(-Math.round(since / 365), 'year');
}

const DONE = new Set(['completed', 'done', 'checked_out', 'checked-out']);
const CANCELLED = new Set(['cancelled', 'canceled', 'archived']);
const NO_SHOW = new Set(['no_show', 'no-show']);

/** Booking status → completed / cancelled / noShow / booked (status chip). */
export const lessonKind = (status) => {
  const s = String(status || '').toLowerCase();
  if (DONE.has(s)) return 'completed';
  if (CANCELLED.has(s)) return 'cancelled';
  if (NO_SHOW.has(s)) return 'noShow';
  return 'booked';
};

export const capitalize = (value) => {
  const s = String(value || '').trim();
  return s ? s.charAt(0).toLocaleUpperCase() + s.slice(1) : '';
};

// Avatar tints (bg + text both pass AA). Stable per name.
const TONES = [
  'bg-cyan-50 text-[#00687a]',
  'bg-indigo-50 text-indigo-800',
  'bg-amber-50 text-amber-900',
  'bg-emerald-50 text-emerald-800',
  'bg-rose-50 text-rose-800',
  'bg-violet-50 text-violet-800',
  'bg-sky-50 text-sky-800',
];

export const avatarTone = (seed = '') => {
  let h = 0;
  for (let i = 0; i < seed.length; i += 1) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return TONES[h % TONES.length];
};

/** Digits for tel: / wa.me links ("+90 544 324 99 45" → "905443249945"). */
export const phoneDigits = (phone) => String(phone || '').replace(/[^\d+]/g, '').replace(/^\+/, '');

export const telHref = (phone) => (phoneDigits(phone) ? `tel:+${phoneDigits(phone)}` : null);
export const whatsappHref = (phone) => (phoneDigits(phone) ? `https://wa.me/${phoneDigits(phone)}` : null);

/**
 * Skill path: every skill level with its skills, marked achieved when a
 * progress entry exists (latest entry wins). Levels keep their order_index.
 */
export function buildSkillPath(skillLevels = [], skills = [], progress = []) {
  const achieved = new Map();
  progress.forEach((p) => {
    if (p.skillId && !achieved.has(p.skillId)) achieved.set(p.skillId, p);
  });
  const levels = [...skillLevels].sort((a, b) => (a.orderIndex ?? 999) - (b.orderIndex ?? 999));
  const known = new Set(levels.map((l) => l.id));
  const groups = levels.map((level) => ({ level, skills: [] }));
  const other = { level: null, skills: [] };
  skills.forEach((skill) => {
    const entry = { skill, progress: achieved.get(skill.id) || null };
    const group = known.has(skill.skillLevelId) ? groups.find((g) => g.level.id === skill.skillLevelId) : other;
    group.skills.push(entry);
  });
  const all = [...groups, other].filter((g) => g.skills.length);
  const total = skills.length;
  const done = all.reduce((n, g) => n + g.skills.filter((s) => s.progress).length, 0);
  return { groups: all, total, done };
}
