// Instructor earnings summary / activity / statement + payout requests.
// Spec: docs/specs/instructor-earnings-payouts.md (§2 API, §4 data fixes).
//
// Ledger model (same sources as the dashboard / payroll so every surface
// reconciles):
//   * earnings  = getInstructorEarningsData() — completed/done/checked_out
//                 lessons, per-lesson commission via the shared mapEarningRow chain.
//   * payouts   = wallet_transactions rows with transaction_type payment|deduction
//                 and entity_type instructor_payment (or legacy NULL), status !=
//                 cancelled — exactly the rows getInstructorPaymentsSummary sums.
//                 Payments are stored positive, deductions negative.
//   * paidOutGross = Σ positive rows, deductionsTotal = Σ |negative rows|,
//     paidOutNet = gross − deductions, available = max(totalEarned − paidOutNet, 0)
//     (identical to the dashboard's pending = totalEarned − netPayments).
//
// Money is Decimal.js end-to-end; numbers are produced only at the JSON boundary
// (2 dp, half-up). Non-EUR wallet rows are converted with currency_settings
// (exchange_rate = units per 1 EUR), like the finance routes do. Lesson dates are
// handled as plain 'YYYY-MM-DD' strings (pg DATE parser returns strings) — never
// through a UTC Date — so a lesson never shifts a day.

import Decimal from 'decimal.js';
import { pool } from '../db.js';
import { logger } from '../middlewares/errorHandler.js';
import { getInstructorEarningsData } from './instructorFinanceService.js';
import { recordInstructorPayment } from './staffPaymentService.js';
import { invalidateInstructorDashboardCache } from './instructorService.js';
import { dispatchNotification, dispatchToStaff } from './notificationDispatcherUnified.js';
import { formatPayoutMoney } from './telegramTemplates/payout.js';
import socketService from './socketService.js';

export const BASE_CURRENCY = 'EUR';
const BUSINESS_TZ = process.env.BUSINESS_TIMEZONE || 'Europe/Istanbul';
const WEEKS_IN_SERIES = 12;
const MONTHS_IN_SERIES = 6;
const MAX_REQUEST_AMOUNT = new Decimal(1_000_000);
export const PERIOD_KEYS = ['week', 'month', 'year', 'all'];
export const ACTIVITY_TYPES = ['all', 'lessons', 'payouts'];
export const ACTIVITY_STATUSES = ['all', 'pending', 'paid'];
export const REQUEST_STATUSES = ['pending', 'paid', 'rejected', 'cancelled'];
export const PAYOUT_METHODS = ['bank_transfer', 'cash', 'card', 'other'];
export const PAYOUT_SOCKET_EVENT = 'payout_request:updated';
const ADMIN_REQUESTS_HREF = '/finance/payout-requests';
const INSTRUCTOR_EARNINGS_HREF = '/finance';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const httpError = (statusCode, message, code) => Object.assign(new Error(message), { statusCode, code });

/** Read at call time so ops (and tests) can tune it without a restart of the module graph. */
export function getPayoutThreshold() {
  const raw = process.env.INSTRUCTOR_PAYOUT_THRESHOLD;
  const n = raw === undefined || raw === '' ? NaN : Number(raw);
  return new Decimal(Number.isFinite(n) && n >= 0 ? n : 200);
}

// ─── Money helpers ────────────────────────────────────────────────────────────

const dec = (value) => {
  if (value instanceof Decimal) return value;
  if (value === null || value === undefined || value === '') return new Decimal(0);
  try {
    const d = new Decimal(value);
    return d.isFinite() ? d : new Decimal(0);
  } catch {
    return new Decimal(0);
  }
};

const num = (value) => dec(value).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber();
const sum = (list, pick = (x) => x) => list.reduce((acc, item) => acc.plus(pick(item)), new Decimal(0));

async function loadRates(executor = pool) {
  const { rows } = await executor.query(
    'SELECT currency_code, exchange_rate FROM currency_settings WHERE is_active = true',
  );
  const map = new Map();
  for (const row of rows) map.set(String(row.currency_code).toUpperCase(), dec(row.exchange_rate));
  return map;
}

/** Convert an amount in `currency` to EUR (exchange_rate = units per 1 EUR). Unknown rate → face value, like the finance routes' COALESCE(rate, 1). */
function toBase(amount, currency, rates) {
  const code = String(currency || BASE_CURRENCY).toUpperCase();
  if (code === BASE_CURRENCY) return dec(amount);
  const rate = rates.get(code);
  if (!rate || rate.lte(0)) return dec(amount);
  return dec(amount).div(rate);
}

// ─── Plain-date helpers (YYYY-MM-DD strings, business timezone) ───────────────

const dateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: BUSINESS_TZ, year: 'numeric', month: '2-digit', day: '2-digit',
});

/** Calendar date (business TZ) of an instant. */
export function businessDate(instant = new Date()) {
  const d = instant instanceof Date ? instant : new Date(instant);
  if (Number.isNaN(d.getTime())) return null;
  return dateFormatter.format(d);
}

const plainDate = (value) => {
  if (!value) return null;
  if (value instanceof Date) return businessDate(value);
  const s = String(value);
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : businessDate(s);
};

const toUtc = (iso) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
};
const fromUtc = (date) => date.toISOString().slice(0, 10);
const addDays = (iso, days) => {
  const d = toUtc(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return fromUtc(d);
};
const startOfWeek = (iso) => {
  const d = toUtc(iso);
  const diff = (d.getUTCDay() + 6) % 7; // Monday-based
  d.setUTCDate(d.getUTCDate() - diff);
  return fromUtc(d);
};
const startOfMonth = (iso) => `${iso.slice(0, 7)}-01`;
const addMonths = (iso, months) => {
  const d = toUtc(startOfMonth(iso));
  d.setUTCMonth(d.getUTCMonth() + months);
  return fromUtc(d);
};
const endOfMonth = (iso) => addDays(addMonths(iso, 1), -1);
const inRange = (date, start, end) => !!date && (!start || date >= start) && (!end || date <= end);

/**
 * Resolve a period key into a plain-date range plus the comparable previous
 * period (calendar week Mon–Sun / calendar month / calendar year; 'all' has no
 * bounds and no previous period).
 *
 * The previous period is "to date": it covers the same number of elapsed days
 * as the current period so far (Oct 1–7 is compared with Sep 1–7, not with all
 * of September — a partial month against a full one made every month look like
 * a ~−80% drop).
 */
const minIso = (a, b) => (a <= b ? a : b);
const daysBetween = (a, b) => Math.round((toUtc(b) - toUtc(a)) / 86400000);
export function resolvePeriod(key = 'month', today = businessDate()) {
  const k = PERIOD_KEYS.includes(key) ? key : 'month';
  if (k === 'week') {
    const start = startOfWeek(today);
    const elapsed = daysBetween(start, today);
    const prevStart = addDays(start, -7);
    return {
      key: k, start, end: addDays(start, 6), label: `Week of ${start}`,
      previous: { start: prevStart, end: addDays(prevStart, elapsed) },
    };
  }
  if (k === 'month') {
    const start = startOfMonth(today);
    const label = toUtc(start).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
    const prevStart = addMonths(start, -1);
    const elapsed = daysBetween(start, today);
    return {
      key: k, start, end: endOfMonth(start), label,
      previous: { start: prevStart, end: minIso(addDays(prevStart, elapsed), endOfMonth(prevStart)) },
    };
  }
  if (k === 'year') {
    const y = Number(today.slice(0, 4));
    const prevStart = `${y - 1}-01-01`;
    const elapsed = daysBetween(`${y}-01-01`, today);
    return {
      key: k, start: `${y}-01-01`, end: `${y}-12-31`, label: String(y),
      previous: { start: prevStart, end: minIso(addDays(prevStart, elapsed), `${y - 1}-12-31`) },
    };
  }
  return { key: 'all', start: null, end: null, label: 'All time', previous: null };
}

// ─── Ledger ───────────────────────────────────────────────────────────────────

const normalizeCommissionType = (type) =>
  (['fixed', 'fixed_per_hour', 'fixed_per_lesson'].includes(String(type || 'fixed')) ? 'fixed' : 'percentage');

// byLessonType keys are stable slugs (lesson_category with '-' -> '_'); the UI
// translates by key and falls back to `label`.
const LESSON_TYPE_LABELS = {
  private: 'Private',
  semi_private: 'Semi-private',
  group: 'Group',
  supervision: 'Supervision',
  semi_private_supervision: 'Semi-private supervision',
  rescue_boat: 'Rescue boat',
  other: 'Other',
};
const lessonTypeKey = (category) => String(category || 'other').trim().toLowerCase().replace(/[-\s]+/g, '_') || 'other';

function mapLesson(earning, rates) {
  const commissionType = normalizeCommissionType(earning.commission_type);
  let amount = dec(earning.total_earnings);
  // Only a percentage commission on a cash-priced lesson is denominated in the
  // booking currency; fixed rates are EUR and package prices are already
  // converted to EUR inside getInstructorEarningsData.
  const currency = String(earning.currency || BASE_CURRENCY).toUpperCase();
  if (currency !== BASE_CURRENCY && commissionType === 'percentage'
      && !['package', 'partial'].includes(earning.payment_status)) {
    amount = toBase(amount, currency, rates);
  }
  return {
    id: earning.booking_id,
    date: plainDate(earning.lesson_date),
    startHour: earning.start_hour === null || earning.start_hour === undefined ? null : Number(earning.start_hour),
    student: earning.student_name || null,
    groupSize: Number(earning.group_size) || 1,
    lessonType: earning.service_name || null,
    lessonCategory: lessonTypeKey(earning.lesson_category),
    hours: dec(earning.lesson_duration),
    commissionType,
    rate: Number(earning.commission_rate) || 0,
    amount,
  };
}

function mapPayoutRow(row, rates) {
  const raw = dec(row.amount);
  const eur = toBase(raw.abs(), row.currency, rates);
  const metadata = row.metadata || {};
  const isDeduction = row.transaction_type === 'deduction' || raw.lt(0);
  return {
    id: row.id,
    kind: isDeduction ? 'deduction' : 'payout',
    date: plainDate(row.payment_ts),
    ts: row.payment_ts ? new Date(row.payment_ts).getTime() : 0,
    amount: eur,
    method: row.payment_method || metadata.paymentMethod || null,
    reference: metadata.externalReference || row.reference_number || null,
    description: row.description || null,
    payoutRequestId: metadata.payoutRequestId || null,
  };
}

const lessonOrderAsc = (a, b) =>
  (a.date || '').localeCompare(b.date || '')
  || (a.startHour ?? 0) - (b.startHour ?? 0)
  || String(a.id).localeCompare(String(b.id));

/**
 * FIFO paid/pending split: net payouts cover the OLDEST earnings first. Walking
 * lessons oldest → newest, a lesson is 'paid' while the remaining net payout
 * still covers its full amount; the first lesson that is not fully covered and
 * every later lesson are 'pending' (a partially covered lesson stays pending —
 * the leftover simply shows up in `available`). Returns Map(bookingId → status).
 */
export function deriveFifoStatuses(lessons, paidOutNet) {
  let remaining = Decimal.max(dec(paidOutNet), 0);
  let exhausted = false;
  const statuses = new Map();
  for (const lesson of [...lessons].sort(lessonOrderAsc)) {
    if (!exhausted && remaining.gte(lesson.amount)) {
      statuses.set(String(lesson.id), 'paid');
      remaining = remaining.minus(lesson.amount);
    } else {
      exhausted = true;
      statuses.set(String(lesson.id), 'pending');
    }
  }
  return statuses;
}

export function computeBalances(lessons, payouts) {
  const totalEarned = sum(lessons, (l) => l.amount);
  const paidOutGross = sum(payouts.filter((p) => p.kind === 'payout'), (p) => p.amount);
  const deductionsTotal = sum(payouts.filter((p) => p.kind === 'deduction'), (p) => p.amount);
  const paidOutNet = paidOutGross.minus(deductionsTotal);
  const available = Decimal.max(totalEarned.minus(paidOutNet), 0);
  return { totalEarned, paidOutGross, deductionsTotal, paidOutNet, available };
}

/** Load lessons + payouts (EUR) for one instructor. */
export async function loadInstructorLedger(instructorId, { executor = pool } = {}) {
  const [{ earnings }, rates, payoutRes] = await Promise.all([
    getInstructorEarningsData(instructorId, {}),
    loadRates(executor),
    executor.query(
      `SELECT id, amount, currency, transaction_type, description, payment_method,
              reference_number, metadata,
              COALESCE((metadata->>'paymentDate')::timestamptz, created_at) AS payment_ts
         FROM wallet_transactions
        WHERE user_id = $1
          AND transaction_type IN ('payment', 'deduction')
          AND (entity_type IS NULL OR entity_type = 'instructor_payment')
          AND status != 'cancelled'`,
      [instructorId],
    ),
  ]);
  const lessons = (earnings || []).map((e) => mapLesson(e, rates));
  const payouts = payoutRes.rows.map((r) => mapPayoutRow(r, rates));
  return { lessons, payouts, balances: computeBalances(lessons, payouts) };
}

const balancesJson = (b) => ({
  totalEarned: num(b.totalEarned),
  paidOutNet: num(b.paidOutNet),
  paidOutGross: num(b.paidOutGross),
  deductionsTotal: num(b.deductionsTotal),
  available: num(b.available),
});

// ─── Payout request rows ──────────────────────────────────────────────────────

const REQUEST_SELECT = `
  SELECT r.*,
         wt.amount AS paid_amount,
         COALESCE(NULLIF(TRIM(COALESCE(u.first_name, '') || ' ' || COALESCE(u.last_name, '')), ''), u.name, u.email) AS instructor_name,
         u.email AS instructor_email,
         u.profile_image_url AS instructor_avatar,
         COALESCE(NULLIF(TRIM(COALESCE(d.first_name, '') || ' ' || COALESCE(d.last_name, '')), ''), d.name, d.email) AS decided_by_name
    FROM instructor_payout_requests r
    JOIN users u ON u.id = r.instructor_id
    LEFT JOIN users d ON d.id = r.decided_by
    LEFT JOIN wallet_transactions wt ON wt.id = r.payment_id`;

const iso = (v) => (v ? new Date(v).toISOString() : null);

export function serializeRequest(row) {
  if (!row) return null;
  return {
    id: row.id,
    instructorId: row.instructor_id,
    amount: num(row.amount),
    currency: row.currency || BASE_CURRENCY,
    preferredMethod: row.preferred_method || null,
    note: row.note || null,
    status: row.status,
    adminNote: row.admin_note || null,
    decidedBy: row.decided_by || null,
    decidedByName: row.decided_by_name || null,
    decidedAt: iso(row.decided_at),
    paymentId: row.payment_id || null,
    paidAmount: row.paid_amount === null || row.paid_amount === undefined ? null : num(row.paid_amount),
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

async function fetchRequestById(id, executor = pool) {
  const { rows } = await executor.query(`${REQUEST_SELECT} WHERE r.id = $1`, [id]);
  return rows[0] || null;
}

async function fetchPendingRequest(instructorId, executor = pool) {
  const { rows } = await executor.query(
    `SELECT * FROM instructor_payout_requests WHERE instructor_id = $1 AND status = 'pending' LIMIT 1`,
    [instructorId],
  );
  return rows[0] || null;
}

// ─── Summary ──────────────────────────────────────────────────────────────────

export async function getEarningsSummary(instructorId, { period = 'month', today = businessDate() } = {}) {
  const p = resolvePeriod(period, today);
  const [{ lessons, payouts, balances }, pendingRow] = await Promise.all([
    loadInstructorLedger(instructorId),
    fetchPendingRequest(instructorId),
  ]);

  // Period figures are NET: lesson earnings - deductions dated in the range.
  const deductionRows = payouts.filter((x) => x.kind === 'deduction');
  const deductionsIn = (start, end) => sum(deductionRows.filter((x) => inRange(x.date, start, end)), (x) => x.amount);
  const netIn = (start, end) => sum(lessons.filter((l) => inRange(l.date, start, end)), (l) => l.amount).minus(deductionsIn(start, end));

  const periodLessons = lessons.filter((l) => inRange(l.date, p.start, p.end));
  const grossEarned = sum(periodLessons, (l) => l.amount);
  const previousEarned = p.previous ? netIn(p.previous.start, p.previous.end) : null;
  const hours = sum(periodLessons, (l) => l.hours);

  // Lesson-type breakdown; the shown rate/type is the most frequent combination.
  const groups = new Map();
  for (const l of periodLessons) {
    const key = l.lessonCategory;
    if (!groups.has(key)) groups.set(key, { key, lessons: 0, hours: new Decimal(0), amount: new Decimal(0), combos: new Map() });
    const g = groups.get(key);
    g.lessons += 1;
    g.hours = g.hours.plus(l.hours);
    g.amount = g.amount.plus(l.amount);
    const combo = `${l.commissionType}|${l.rate}`;
    g.combos.set(combo, (g.combos.get(combo) || 0) + 1);
  }
  const byLessonType = [...groups.values()]
    .map((g) => {
      const [commissionType, rate] = [...g.combos.entries()].sort((a, b) => b[1] - a[1])[0][0].split('|');
      return {
        key: g.key,
        label: LESSON_TYPE_LABELS[g.key] || g.key.replace(/[-_]/g, ' ').replace(/^\w/, (c) => c.toUpperCase()),
        commissionType,
        rate: Number(rate),
        hours: num(g.hours),
        lessons: g.lessons,
        amount: num(g.amount),
      };
    })
    .sort((a, b) => b.amount - a.amount);

  const deductions = deductionsIn(p.start, p.end);
  // earned = sum(byLessonType.amount) - deductions, computed from the ROUNDED
  // parts so the documented invariant holds to the cent.
  const earned = byLessonType
    .reduce((acc, g) => acc.plus(g.amount), new Decimal(0))
    .minus(num(deductions));
  const changePct = previousEarned && previousEarned.gt(0)
    ? earned.minus(previousEarned).div(previousEarned).times(100).toDecimalPlaces(1, Decimal.ROUND_HALF_UP).toNumber()
    : null;

  const currentWeek = startOfWeek(today);
  const weekly = [];
  for (let i = WEEKS_IN_SERIES - 1; i >= 0; i -= 1) {
    const weekStart = addDays(currentWeek, -7 * i);
    const weekEnd = addDays(weekStart, 6);
    weekly.push({ weekStart, total: num(netIn(weekStart, weekEnd)) });
  }
  const monthly = [];
  for (let i = MONTHS_IN_SERIES - 1; i >= 0; i -= 1) {
    const month = addMonths(today, -i).slice(0, 7);
    monthly.push({ month, total: num(netIn(`${month}-01`, endOfMonth(`${month}-01`))) });
  }

  const threshold = getPayoutThreshold();
  const lastPayoutRow = payouts.filter((x) => x.kind === 'payout').sort((a, b) => b.ts - a.ts)[0] || null;

  return {
    period: { key: p.key, start: p.start, end: p.end, label: p.label },
    currency: BASE_CURRENCY,
    earned: num(earned),
    previousEarned: previousEarned === null ? null : num(previousEarned),
    changePct,
    lessons: periodLessons.length,
    hours: num(hours),
    avgPerLesson: periodLessons.length ? num(grossEarned.div(periodLessons.length)) : 0, // gross lesson average
    byLessonType,
    deductions: num(deductions),
    weekly,
    monthly,
    balances: balancesJson(balances),
    threshold: {
      amount: num(threshold),
      meets: balances.available.gte(threshold),
      shortfall: num(Decimal.max(threshold.minus(balances.available), 0)),
    },
    lastPayout: lastPayoutRow
      ? { date: lastPayoutRow.date, amount: num(lastPayoutRow.amount), method: lastPayoutRow.method, reference: lastPayoutRow.reference }
      : null,
    pendingRequest: pendingRow
      ? {
        id: pendingRow.id,
        amount: num(pendingRow.amount),
        createdAt: iso(pendingRow.created_at),
        note: pendingRow.note || null,
        preferredMethod: pendingRow.preferred_method || null,
        currency: pendingRow.currency || BASE_CURRENCY,
      }
      : null,
    updatedAt: new Date().toISOString(),
  };
}

// ─── Activity ─────────────────────────────────────────────────────────────────

function buildActivityItems({ lessons, payouts, balances }, { start, end, type = 'all', search = '' }) {
  const statuses = deriveFifoStatuses(lessons, balances.paidOutNet);
  const q = String(search || '').trim().toLowerCase();
  const matches = (...fields) => !q || fields.some((f) => f && String(f).toLowerCase().includes(q));
  const items = [];

  if (type === 'all' || type === 'lessons') {
    for (const l of lessons) {
      if (!inRange(l.date, start, end)) continue;
      if (!matches(l.student, l.lessonType, l.lessonCategory)) continue;
      items.push({
        kind: 'lesson',
        id: l.id,
        date: l.date,
        startHour: l.startHour,
        student: l.student,
        groupSize: l.groupSize,
        lessonType: l.lessonType,
        lessonCategory: l.lessonCategory,
        hours: num(l.hours),
        commissionType: l.commissionType,
        rate: l.rate,
        amount: num(l.amount),
        status: statuses.get(String(l.id)) || 'pending',
        _sort: [l.date, l.startHour ?? 0],
      });
    }
  }
  if (type === 'all' || type === 'payouts') {
    for (const x of payouts) {
      if (!inRange(x.date, start, end)) continue;
      if (!matches(x.method, x.reference, x.description)) continue;
      if (x.kind === 'payout') {
        items.push({
          kind: 'payout', id: x.id, date: x.date, amount: num(x.amount), method: x.method,
          reference: x.reference, status: 'paid', _sort: [x.date, 24 + (x.ts % 86_400_000) / 3_600_000],
        });
      } else {
        items.push({
          kind: 'deduction', id: x.id, date: x.date, amount: num(x.amount), description: x.description,
          _sort: [x.date, 24 + (x.ts % 86_400_000) / 3_600_000],
        });
      }
    }
  }

  items.sort((a, b) => (b._sort[0] || '').localeCompare(a._sort[0] || '') || b._sort[1] - a._sort[1]);
  return items.map(({ _sort, ...rest }) => rest);
}

export async function getEarningsActivity(instructorId, {
  period = 'month', type = 'all', status = 'all', search = '', limit = 50, offset = 0, today = businessDate(),
} = {}) {
  const p = resolvePeriod(period, today);
  const ledger = await loadInstructorLedger(instructorId);
  // The status filter runs AFTER the FIFO derivation (statuses are computed over
  // the whole ledger) and BEFORE pagination, so `total` reflects it. It matches
  // item.status: lessons are paid|pending, payouts are always 'paid',
  // deductions carry no status (they only appear with status=all).
  const all = buildActivityItems(ledger, { start: p.start, end: p.end, type, search })
    .filter((item) => status === 'all' || item.status === status);
  return { items: all.slice(offset, offset + limit), total: all.length };
}

// ─── Monthly statement (CSV) ──────────────────────────────────────────────────

const csvCell = (value) => {
  if (value === null || value === undefined) return '';
  const s = String(value);
  return /[",\n\r;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export async function getEarningsStatementCsv(instructorId, { month }) {
  const start = `${month}-01`;
  const end = endOfMonth(start);
  const [ledger, userRes] = await Promise.all([
    loadInstructorLedger(instructorId),
    pool.query(
      `SELECT COALESCE(NULLIF(TRIM(COALESCE(first_name, '') || ' ' || COALESCE(last_name, '')), ''), name, email) AS name
         FROM users WHERE id = $1`,
      [instructorId],
    ),
  ]);
  const items = buildActivityItems(ledger, { start, end, type: 'all' }).reverse(); // chronological
  const monthLessons = ledger.lessons.filter((l) => inRange(l.date, start, end));
  const monthPayouts = ledger.payouts.filter((x) => inRange(x.date, start, end));
  const grossEarned = sum(monthLessons, (l) => l.amount);
  const paid = sum(monthPayouts.filter((x) => x.kind === 'payout'), (x) => x.amount);
  const deducted = sum(monthPayouts.filter((x) => x.kind === 'deduction'), (x) => x.amount);

  const lines = [
    ['Earnings statement', month],
    ['Instructor', userRes.rows[0]?.name || ''],
    ['Currency', BASE_CURRENCY],
    [],
    ['Date', 'Type', 'Student / description', 'Lesson type', 'Hours', 'Commission', 'Rate', 'Amount', 'Status', 'Method', 'Reference'],
  ];
  for (const it of items) {
    if (it.kind === 'lesson') {
      lines.push([it.date, 'lesson', it.student, it.lessonType, it.hours.toFixed(2), it.commissionType, it.rate, it.amount.toFixed(2), it.status, '', '']);
    } else if (it.kind === 'payout') {
      lines.push([it.date, 'payout', '', '', '', '', '', it.amount.toFixed(2), it.status, it.method, it.reference]);
    } else {
      lines.push([it.date, 'deduction', it.description, '', '', '', '', it.amount.toFixed(2), '', '', '']);
    }
  }
  lines.push(
    [],
    ['Lessons', monthLessons.length],
    ['Lesson earnings (gross)', num(grossEarned).toFixed(2)],
    ['Deductions', num(deducted).toFixed(2)],
    ['Earned (net)', num(grossEarned.minus(deducted)).toFixed(2)],
    ['Paid out (gross)', num(paid).toFixed(2)],
    ['Available balance (today)', num(ledger.balances.available).toFixed(2)],
  );
  // BOM so Excel opens UTF-8 names correctly.
  return `﻿${lines.map((row) => row.map(csvCell).join(',')).join('\r\n')}\r\n`;
}

// ─── Notifications + realtime ─────────────────────────────────────────────────

function emitPayoutUpdate(row, action) {
  try {
    const payload = { id: row.id, status: row.status, instructorId: row.instructor_id, amount: num(row.amount), action };
    socketService.emitToChannel(`user:${row.instructor_id}`, PAYOUT_SOCKET_EVENT, payload);
    socketService.emitToRole('admin', PAYOUT_SOCKET_EVENT, payload);
    socketService.emitToRole('manager', PAYOUT_SOCKET_EVENT, payload);
  } catch (error) {
    logger.warn('Failed to emit payout_request:updated', { id: row?.id, error: error?.message });
  }
}

async function getUserDisplayName(userId) {
  const { rows } = await pool.query(
    `SELECT COALESCE(NULLIF(TRIM(COALESCE(first_name, '') || ' ' || COALESCE(last_name, '')), ''), name, email) AS name
       FROM users WHERE id = $1`,
    [userId],
  );
  return rows[0]?.name || 'Instructor';
}

async function notifyStaffOfNewRequest(row, { available }) {
  try {
    const instructorName = await getUserDisplayName(row.instructor_id);
    const amountLabel = formatPayoutMoney(row.amount, row.currency);
    const availableLabel = formatPayoutMoney(available, row.currency);
    await dispatchToStaff({
      type: 'payout_request_created',
      roles: ['admin', 'manager'],
      excludeUserIds: [row.instructor_id],
      title: 'Payout request',
      message: `💸 Payout request: ${instructorName} requests ${amountLabel} (available ${availableLabel})`,
      data: {
        payoutRequestId: row.id,
        instructorId: row.instructor_id,
        instructorName,
        amount: num(row.amount),
        available: num(available),
        currency: row.currency,
        preferredMethod: row.preferred_method || null,
        note: row.note || null,
        link: ADMIN_REQUESTS_HREF,
        cta: { label: 'Open payout requests', href: ADMIN_REQUESTS_HREF },
      },
      idempotencyPrefix: `payout-request:${row.id}:created`,
    });
  } catch (error) {
    logger.warn('Failed to notify staff about payout request', { id: row.id, error: error?.message });
  }
}

async function notifyInstructorOfDecision(row, { kind, amount, paymentMethod, referenceNumber, reason }) {
  try {
    const amountLabel = formatPayoutMoney(amount, row.currency);
    const isPaid = kind === 'paid';
    const methodText = paymentMethod ? ` (${String(paymentMethod).replace(/_/g, ' ')})` : '';
    await dispatchNotification({
      userId: row.instructor_id,
      type: isPaid ? 'payout_request_paid' : 'payout_request_rejected',
      title: isPaid ? 'Payout paid' : 'Payout request declined',
      message: isPaid
        ? `✅ Your payout of ${amountLabel} was paid${methodText}.`
        : `Your payout request of ${amountLabel} was declined: ${reason}`,
      data: {
        payoutRequestId: row.id,
        amount: num(amount),
        currency: row.currency,
        paymentMethod: paymentMethod || null,
        referenceNumber: referenceNumber || null,
        reason: reason || null,
        recipientRole: 'instructor',
        link: INSTRUCTOR_EARNINGS_HREF,
        cta: { label: 'Open my earnings', href: INSTRUCTOR_EARNINGS_HREF },
      },
      idempotencyKey: `payout-request:${row.id}:${kind}:instructor`,
    });
  } catch (error) {
    logger.warn('Failed to notify instructor about payout decision', { id: row.id, kind, error: error?.message });
  }
}

// ─── Instructor actions ───────────────────────────────────────────────────────

export async function listOwnRequests(instructorId) {
  const { rows } = await pool.query(
    `${REQUEST_SELECT} WHERE r.instructor_id = $1 ORDER BY r.created_at DESC LIMIT 200`,
    [instructorId],
  );
  return rows.map(serializeRequest);
}

export async function createPayoutRequest({ instructorId, amount, preferredMethod = null, note = null }) {
  const requested = dec(amount).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  if (requested.lte(0) || requested.gt(MAX_REQUEST_AMOUNT)) {
    throw httpError(400, 'Amount must be greater than 0', 'INVALID_AMOUNT');
  }

  if (await fetchPendingRequest(instructorId)) {
    throw httpError(409, 'You already have a pending payout request', 'PENDING_EXISTS');
  }

  const { balances } = await loadInstructorLedger(instructorId);
  const threshold = getPayoutThreshold();
  if (balances.available.lt(threshold)) {
    throw httpError(400, `Available balance is below the payout threshold (${num(threshold)} ${BASE_CURRENCY})`, 'BELOW_THRESHOLD');
  }
  if (requested.lt(threshold)) {
    throw httpError(400, `Amount must be at least the payout threshold (${num(threshold)} ${BASE_CURRENCY})`, 'AMOUNT_BELOW_THRESHOLD');
  }
  if (requested.gt(balances.available.toDecimalPlaces(2, Decimal.ROUND_HALF_UP))) {
    throw httpError(400, 'Amount exceeds the available balance', 'AMOUNT_ABOVE_AVAILABLE');
  }

  let row;
  try {
    const { rows } = await pool.query(
      `INSERT INTO instructor_payout_requests (instructor_id, amount, currency, preferred_method, note)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [instructorId, requested.toFixed(2), BASE_CURRENCY, preferredMethod || null, note || null],
    );
    row = rows[0];
  } catch (error) {
    if (error?.code === '23505') {
      throw httpError(409, 'You already have a pending payout request', 'PENDING_EXISTS');
    }
    throw error;
  }

  await notifyStaffOfNewRequest(row, { available: balances.available });
  emitPayoutUpdate(row, 'created');
  return serializeRequest(await fetchRequestById(row.id));
}

export async function cancelPayoutRequest({ instructorId, requestId }) {
  if (!UUID_RE.test(String(requestId || ''))) throw httpError(404, 'Payout request not found', 'NOT_FOUND');
  const { rows } = await pool.query(
    `UPDATE instructor_payout_requests
        SET status = 'cancelled', updated_at = NOW()
      WHERE id = $1 AND instructor_id = $2 AND status = 'pending'
      RETURNING *`,
    [requestId, instructorId],
  );
  if (!rows[0]) {
    const existing = await pool.query(
      'SELECT status FROM instructor_payout_requests WHERE id = $1 AND instructor_id = $2',
      [requestId, instructorId],
    );
    if (!existing.rows[0]) throw httpError(404, 'Payout request not found', 'NOT_FOUND');
    throw httpError(409, `Payout request is already ${existing.rows[0].status}`, 'NOT_PENDING');
  }
  emitPayoutUpdate(rows[0], 'cancelled');
  return serializeRequest(await fetchRequestById(requestId));
}

// ─── Admin / manager actions ──────────────────────────────────────────────────

export async function listPayoutRequests({ status = 'all' } = {}) {
  const params = [];
  let where = '';
  if (status && status !== 'all') {
    params.push(status);
    where = 'WHERE r.status = $1';
  }
  const { rows } = await pool.query(
    `${REQUEST_SELECT} ${where}
     ORDER BY (r.status = 'pending') DESC, r.created_at DESC
     LIMIT 500`,
    params,
  );

  // Current available balance per distinct instructor (same ledger as the
  // instructor's own summary, so both sides see the same number).
  const instructorIds = [...new Set(rows.map((r) => r.instructor_id))];
  const availableById = new Map();
  await Promise.all(instructorIds.map(async (id) => {
    try {
      const { balances } = await loadInstructorLedger(id);
      availableById.set(id, num(balances.available));
    } catch (error) {
      logger.warn('Failed to compute available balance for payout list', { instructorId: id, error: error?.message });
      availableById.set(id, null);
    }
  }));

  return rows.map((row) => ({
    ...serializeRequest(row),
    instructorName: row.instructor_name,
    instructorEmail: row.instructor_email || null,
    instructorAvatar: row.instructor_avatar || null,
    available: availableById.get(row.instructor_id) ?? null,
  }));
}

export async function countPayoutRequests({ status = 'pending' } = {}) {
  const params = [];
  let where = '';
  if (status && status !== 'all') {
    params.push(status);
    where = 'WHERE status = $1';
  }
  const { rows } = await pool.query(`SELECT COUNT(*)::int AS count FROM instructor_payout_requests ${where}`, params);
  return rows[0]?.count || 0;
}

async function lockPendingRequest(client, requestId) {
  if (!UUID_RE.test(String(requestId || ''))) throw httpError(404, 'Payout request not found', 'NOT_FOUND');
  const { rows } = await client.query('SELECT * FROM instructor_payout_requests WHERE id = $1 FOR UPDATE', [requestId]);
  const row = rows[0];
  if (!row) throw httpError(404, 'Payout request not found', 'NOT_FOUND');
  if (row.status !== 'pending') throw httpError(409, `Payout request is already ${row.status}`, 'NOT_PENDING');
  return row;
}

/**
 * Pay a pending request: in ONE transaction record the instructor payment via
 * the shared recordInstructorPayment (same code path as POST
 * /finances/instructor-payments) and mark the request paid with payment_id.
 */
export async function payPayoutRequest({ requestId, actorId, amount, paymentMethod, referenceNumber = null, note = null }) {
  const client = await pool.connect();
  let row;
  let payAmount;
  let transactionRecord;
  try {
    await client.query('BEGIN');
    row = await lockPendingRequest(client, requestId);
    payAmount = (amount === undefined || amount === null || amount === '' ? dec(row.amount) : dec(amount))
      .toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
    if (payAmount.lte(0) || payAmount.gt(MAX_REQUEST_AMOUNT)) {
      throw httpError(400, 'Amount must be greater than 0', 'INVALID_AMOUNT');
    }

    const shortId = String(row.id).slice(0, 8);
    const description = `Payout request ${shortId}${note ? ` — ${note}` : ''}`;
    ({ transactionRecord } = await recordInstructorPayment({
      instructorId: row.instructor_id,
      amount: payAmount.toFixed(2),
      description,
      paymentDate: new Date(),
      paymentMethod,
      actorId,
      requestedType: 'payment',
      client,
      extraMetadata: {
        payoutRequestId: row.id,
        externalReference: referenceNumber || null,
        payoutNote: note || null,
      },
    }));

    const adminNote = [referenceNumber ? `Ref: ${referenceNumber}` : null, note || null].filter(Boolean).join(' · ') || null;
    const updated = await client.query(
      `UPDATE instructor_payout_requests
          SET status = 'paid', payment_id = $2, decided_by = $3, decided_at = NOW(),
              admin_note = $4, updated_at = NOW()
        WHERE id = $1
        RETURNING *`,
      [row.id, transactionRecord.id, actorId || null, adminNote],
    );
    row = updated.rows[0];
    await client.query('COMMIT');
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch { /* already settled */ }
    throw error;
  } finally {
    client.release();
  }

  await invalidateInstructorDashboardCache(row.instructor_id);
  await notifyInstructorOfDecision(row, { kind: 'paid', amount: payAmount, paymentMethod, referenceNumber });
  emitPayoutUpdate(row, 'paid');
  return { request: serializeRequest(await fetchRequestById(row.id)), paymentId: transactionRecord.id };
}

export async function rejectPayoutRequest({ requestId, actorId, reason }) {
  const trimmed = String(reason || '').trim();
  if (!trimmed) throw httpError(400, 'A reason is required', 'REASON_REQUIRED');
  const client = await pool.connect();
  let row;
  try {
    await client.query('BEGIN');
    await lockPendingRequest(client, requestId);
    const updated = await client.query(
      `UPDATE instructor_payout_requests
          SET status = 'rejected', admin_note = $2, decided_by = $3, decided_at = NOW(), updated_at = NOW()
        WHERE id = $1
        RETURNING *`,
      [requestId, trimmed, actorId || null],
    );
    row = updated.rows[0];
    await client.query('COMMIT');
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch { /* already settled */ }
    throw error;
  } finally {
    client.release();
  }

  await notifyInstructorOfDecision(row, { kind: 'rejected', amount: row.amount, reason: trimmed });
  emitPayoutUpdate(row, 'rejected');
  return serializeRequest(await fetchRequestById(row.id));
}
