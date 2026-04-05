/**
 * API verification: after package lesson bookings exist as pending, mark them completed
 * and assert instructor earnings + manager commission rows (see backend: bookings PUT + cascade, managerCommissionService).
 */
import { expect, type Page } from '@playwright/test';
import { ADMIN_EMAIL, ADMIN_PASSWORD, API_URL } from '../../helpers';

/**
 * Backend mounts Express under `/api` (e.g. POST /api/auth/login). `apiJson` paths are
 * like `/auth/login`, so the base must end with `/api`. Many envs set `API_URL` to the
 * bare host (`http://localhost:4000`) and omit `/api`, which yields 404 + empty body.
 */
function normalizeApiBase(raw: string): string {
  const s = raw.replace(/\/$/, '');
  if (/\/api$/i.test(s)) return s;
  return `${s}/api`;
}

/** Prefer `process.env.API_URL` (normalized); else page origin + `/api` (Vite proxy); else helpers `API_URL`. */
function apiBaseUrl(page: Page): string {
  const fromEnv = process.env.API_URL?.trim();
  if (fromEnv) return normalizeApiBase(fromEnv);
  try {
    const u = new URL(page.url());
    if (u.protocol === 'http:' || u.protocol === 'https:') return `${u.origin}/api`;
  } catch {
    /* ignore */
  }
  return normalizeApiBase(API_URL);
}

function parseAcademyBookingDates(): string[] {
  const raw = process.env.ACADEMY_KITE_BOOKING_DATES?.trim();
  if (raw) return raw.split(',').map((s) => s.trim()).filter(Boolean);
  return ['2026-04-01', '2026-04-02', '2026-04-03'];
}

function academySessionCount(): number {
  const raw = process.env.ACADEMY_KITE_BOOKING_DATES?.trim();
  if (raw) return raw.split(',').map((s) => s.trim()).filter(Boolean).length;
  return 3;
}

/**
 * Override how many pending sessions the poll expects (e.g. only 2 dates left bookable).
 * Backend GET /bookings omits `status = pending_payment` entirely — those rows never appear here.
 */
function commissionVerifyExpectedSessions(): number {
  const raw = process.env.COMMISSION_VERIFY_EXPECTED_SESSIONS?.trim();
  if (raw !== undefined && raw !== '') {
    const n = Number(raw);
    if (!Number.isNaN(n) && n >= 1) return n;
  }
  return academySessionCount();
}

function normalizePersonName(s: string): string {
  return s.toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * Resolve the customer user id whose package bookings we verify (`/users/for-booking` works for manager JWT).
 * Prefer `COMMISSION_E2E_STUDENT_ID`; else search by `COMMISSION_E2E_STUDENT_SEARCH` (default "Mehmet Ural").
 */
async function resolveBookingOwnerUserId(page: Page, staffToken: string): Promise<string> {
  const fromEnv = process.env.COMMISSION_E2E_STUDENT_ID?.trim();
  if (fromEnv) return fromEnv;

  const search = process.env.COMMISSION_E2E_STUDENT_SEARCH?.trim() || 'Mehmet Ural';
  expect(search.length, 'COMMISSION_E2E_STUDENT_SEARCH must be non-empty when STUDENT_ID is unset').toBeGreaterThan(1);

  const res = await apiJson(
    page,
    'GET',
    `/users/for-booking?${new URLSearchParams({ q: search, limit: '80' })}`,
    staffToken,
  );
  expect(
    res.status,
    `GET /users/for-booking q="${search}": ${JSON.stringify(res.data).slice(0, 240)}`,
  ).toBe(200);
  const rows = Array.isArray(res.data) ? (res.data as Record<string, unknown>[]) : [];
  expect(
    rows.length,
    `No users for q="${search}". Set COMMISSION_E2E_STUDENT_ID to the booking owner's user id.`,
  ).toBeGreaterThan(0);

  if (rows.length === 1) return String(rows[0].id);

  const target = normalizePersonName(search);
  const scored = rows.map((raw) => {
    const fn = String(raw.first_name ?? '').trim();
    const ln = String(raw.last_name ?? '').trim();
    const fromParts = `${fn} ${ln}`.trim();
    const label = String((raw.name ?? fromParts) || raw.email || '').trim();
    const n = normalizePersonName(label);
    let score = 0;
    if (n === target) score = 100;
    else if (n.includes(target)) score = 70;
    else {
      const parts = target.split(' ').filter(Boolean);
      if (parts.length >= 2 && parts.every((p) => n.includes(p))) score = 65;
      else if (parts.some((p) => n.includes(p))) score = 40;
    }
    return { id: String(raw.id), label, score, role: String(raw.role_name ?? '') };
  });
  scored.sort((a, b) => b.score - a.score);
  const best = scored[0];
  expect(
    best.score >= 40,
    `Ambiguous name "${search}". Top matches: ${JSON.stringify(scored.slice(0, 8))}. Set COMMISSION_E2E_STUDENT_ID.`,
  ).toBeTruthy();
  return best.id;
}

/** Normalize `/auth/me` and JWT payloads — backends vary (flat user vs `{ user }` vs `{ data }`). */
function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const [, payload] = token.split('.');
    if (!payload) return null;
    const padded = payload + '='.repeat((4 - (payload.length % 4)) % 4);
    const b64 = padded.replace(/-/g, '+').replace(/_/g, '/');
    const json = Buffer.from(b64, 'base64').toString('utf8');
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function studentIdFromAuthContext(meBody: unknown, bearerToken: string): string | undefined {
  if (meBody && typeof meBody === 'object' && !Array.isArray(meBody)) {
    const o = meBody as Record<string, unknown>;
    const direct = o.id ?? o.user_id;
    if (direct != null && String(direct).length > 0) return String(direct);
    const nestedUser = o.user;
    if (nestedUser && typeof nestedUser === 'object' && !Array.isArray(nestedUser)) {
      const u = nestedUser as Record<string, unknown>;
      const uid = u.id ?? u.user_id;
      if (uid != null && String(uid).length > 0) return String(uid);
    }
    const nestedData = o.data;
    if (nestedData && typeof nestedData === 'object' && !Array.isArray(nestedData)) {
      const d = nestedData as Record<string, unknown>;
      const did = d.id ?? d.user_id;
      if (did != null && String(did).length > 0) return String(did);
    }
  }
  const claims = decodeJwtPayload(bearerToken);
  if (claims) {
    const cid = claims.id ?? claims.sub ?? claims.userId ?? claims.user_id;
    if (cid != null && String(cid).length > 0) return String(cid);
  }
  return undefined;
}

type ApiResult = { status: number; data: any };

async function apiJson(
  page: Page,
  method: string,
  path: string,
  token: string | null,
  body?: Record<string, unknown>,
): Promise<ApiResult> {
  const url = `${apiBaseUrl(page)}${path.startsWith('/') ? path : `/${path}`}`;
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body) headers['Content-Type'] = 'application/json';
  const opts: { headers: Record<string, string>; data?: string } = { headers };
  if (body) opts.data = JSON.stringify(body);

  let response;
  switch (method.toUpperCase()) {
    case 'POST':
      response = await page.request.post(url, opts);
      break;
    case 'PUT':
      response = await page.request.put(url, opts);
      break;
    case 'PATCH':
      response = await page.request.patch(url, opts);
      break;
    case 'DELETE':
      response = await page.request.delete(url, { headers });
      break;
    default:
      response = await page.request.get(url, { headers });
  }

  const status = response.status();
  try {
    const data = await response.json();
    return { status, data };
  } catch {
    return { status, data: await response.text() };
  }
}

async function loginApiToken(page: Page, email: string, password: string): Promise<string> {
  const res = await apiJson(page, 'POST', '/auth/login', null, {
    email,
    password,
  } as Record<string, unknown>);
  expect(res.status, `login failed for ${email}: ${JSON.stringify(res.data).slice(0, 200)}`).toBeLessThan(400);
  const token = res.data?.token;
  expect(token, 'auth login should return token').toBeTruthy();
  return token as string;
}

export type QuickBookingRow = {
  id: string;
  instructor_user_id?: string;
  instructorId?: string;
  notes?: string | null;
  status?: string | null;
  created_at?: string;
  createdAt?: string;
};

/** Matches QuickBookingModal notes: package uses `Booked via package: …`, standalone `Booked via academy: …`; legacy fallback `Quick Booking`. */
function isQuickBookingFlowNotes(notes: string): boolean {
  const n = notes.toLowerCase();
  return (
    n.includes('booked via package:') || n.includes('booked via academy:') || n.includes('quick booking')
  );
}

function bookingRowStatus(b: QuickBookingRow): string {
  const o = b as Record<string, unknown>;
  return String(
    o.status ?? o.bookingStatus ?? o.booking_status ?? o.checkInStatus ?? o.check_in_status ?? '',
  ).trim();
}

/** Lesson is still completable for commission cascade (exclude terminal / payment-gated rows). */
function isNonTerminalForCommissionCompletion(status: string): boolean {
  const st = String(status ?? '').toLowerCase().trim();
  if (!st) return false;
  const terminal = new Set([
    'completed',
    'done',
    'checked_out',
    'cancelled',
    'canceled',
    'no_show',
    'declined',
    'pending_payment', // excluded from GET /bookings list; guard if shape changes
  ]);
  return !terminal.has(st);
}

function rowDateYmd(b: QuickBookingRow): string | null {
  const raw = (b as Record<string, unknown>).date ?? (b as Record<string, unknown>).formatted_date;
  if (raw == null) return null;
  const s = String(raw).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

function isPackagePaymentRow(b: QuickBookingRow): boolean {
  const o = b as Record<string, unknown>;
  const ps = String(o.payment_status ?? o.paymentStatus ?? '').toLowerCase();
  if (ps === 'package') return true;
  return o.isPackagePayment === true;
}

function bookingsRowsFromResponse(body: unknown): QuickBookingRow[] {
  if (Array.isArray(body)) return body as QuickBookingRow[];
  if (body && typeof body === 'object') {
    const o = body as Record<string, unknown>;
    if (Array.isArray(o.data)) return o.data as QuickBookingRow[];
    if (Array.isArray(o.bookings)) return o.bookings as QuickBookingRow[];
  }
  return [];
}

function buildStudentBookingsQuery(studentId: string, narrowByAcademyDates: boolean): string {
  const qs = new URLSearchParams({
    student_id: studentId,
    limit: '200',
  });
  if (narrowByAcademyDates) {
    const dates = parseAcademyBookingDates().filter(Boolean).sort();
    if (dates.length > 0) {
      qs.set('start_date', dates[0]);
      qs.set('end_date', dates[dates.length - 1]);
    }
  }
  return qs.toString();
}

type CandidateMode = 'strict' | 'lesson';

/**
 * Mirrors GET /bookings `service_type=lesson` when we omit that param.
 * Do not drop rows on `equipment` alone — backend only ties equipment to rental together with rental patterns;
 * lesson names often mention gear and would be falsely excluded.
 */
function filterLessonLikeServiceRows(rows: QuickBookingRow[]): QuickBookingRow[] {
  return rows.filter((b) => {
    const o = b as Record<string, unknown>;
    const cat = String(o.service_category ?? o.serviceCategory ?? '').toLowerCase();
    const stype = String(o.service_type ?? o.serviceType ?? '').toLowerCase();
    const name = String(o.service_name ?? o.serviceName ?? '').toLowerCase();
    if (cat.includes('rental') || stype.includes('rental') || name.includes('rental')) return false;
    if (cat.includes('accommodation') || stype.includes('accommodation') || name.includes('accommodation'))
      return false;
    return true;
  });
}

function filterCommissionCandidates(
  rows: QuickBookingRow[],
  mode: CandidateMode,
  allowedDates?: Set<string>,
): QuickBookingRow[] {
  return rows.filter((b: QuickBookingRow) => {
    const st = bookingRowStatus(b);
    if (!isNonTerminalForCommissionCompletion(st)) return false;
    if (mode === 'lesson') return true;
    const notes = String(b.notes ?? '');
    if (isQuickBookingFlowNotes(notes)) return true;
    const ymd = rowDateYmd(b);
    if (isPackagePaymentRow(b) && ymd && allowedDates?.has(ymd)) return true;
    return false;
  }) as QuickBookingRow[];
}

async function fetchBookingsPath(page: Page, path: string, token: string): Promise<QuickBookingRow[]> {
  const res = await apiJson(page, 'GET', path, token);
  expect(res.status, `GET bookings path failed ${path}: ${JSON.stringify(res.data).slice(0, 280)}`).toBe(200);
  return bookingsRowsFromResponse(res.data);
}

export async function listStudentQuickBookings(page: Page, studentToken: string, studentId: string): Promise<QuickBookingRow[]> {
  const rows = await fetchBookingsPath(page, `/bookings?${buildStudentBookingsQuery(studentId, true)}`, studentToken);
  return filterCommissionCandidates(rows, 'strict', new Set(parseAcademyBookingDates()));
}

/**
 * Prefer one instructor (largest group of candidates). When only one instructor exists, all picks match.
 */
export function pickLatestForDominantInstructor(rows: QuickBookingRow[], expectedCount: number): QuickBookingRow[] {
  const byI = new Map<string, QuickBookingRow[]>();
  for (const b of rows) {
    const i = String(b.instructor_user_id ?? b.instructorId ?? '');
    if (!i) continue;
    if (!byI.has(i)) byI.set(i, []);
    byI.get(i)!.push(b);
  }
  let pool: QuickBookingRow[] = rows;
  if (byI.size > 0) {
    let best: QuickBookingRow[] = [];
    for (const [, list] of byI) {
      if (list.length > best.length) best = list;
    }
    pool = best;
  }
  const sorted = [...pool].sort((a, b) => {
    const ca = String(a.created_at || a.createdAt || rowDateYmd(a) || '');
    const cb = String(b.created_at || b.createdAt || rowDateYmd(b) || '');
    return cb.localeCompare(ca);
  });
  return sorted.slice(0, expectedCount);
}

async function resolveCommissionBookingCandidates(
  page: Page,
  uiToken: string,
  /** Bookings `student_user_id` / participant id to find (package owner). */
  bookingOwnerStudentId: string,
  /** `/auth/me` id — only for `COMMISSION_E2E_INSTRUCTOR_ID` fallback when listing by instructor. */
  authUserId: string,
  expected: number,
  /** Admin or manager JWT (both can list/filter bookings on this backend). */
  apiToken: string,
): Promise<QuickBookingRow[]> {
  const allowedDates = new Set(parseAcademyBookingDates());

  const tryPool = (rows: QuickBookingRow[]) => pickLatestForDominantInstructor(rows, expected);

  let rows = filterCommissionCandidates(
    await fetchBookingsPath(
      page,
      `/bookings?${buildStudentBookingsQuery(bookingOwnerStudentId, true)}`,
      uiToken,
    ),
    'strict',
    allowedDates,
  );
  if (tryPool(rows).length >= expected) return tryPool(rows);

  rows = filterCommissionCandidates(
    await fetchBookingsPath(
      page,
      `/bookings?${buildStudentBookingsQuery(bookingOwnerStudentId, false)}`,
      uiToken,
    ),
    'strict',
    allowedDates,
  );
  if (tryPool(rows).length >= expected) return tryPool(rows);

  rows = filterCommissionCandidates(
    await fetchBookingsPath(
      page,
      `/bookings?${buildStudentBookingsQuery(bookingOwnerStudentId, false)}`,
      uiToken,
    ),
    'lesson',
  );
  if (tryPool(rows).length >= expected) return tryPool(rows);

  const instEnv = process.env.COMMISSION_E2E_INSTRUCTOR_ID?.trim();
  const instructorId = instEnv || authUserId;
  const instQs = new URLSearchParams({
    instructor_id: instructorId,
    limit: '500',
    service_type: 'lesson',
  });
  const instRes = await apiJson(page, 'GET', `/bookings?${instQs}`, uiToken);
  if (instRes.status === 200) {
    rows = filterCommissionCandidates(bookingsRowsFromResponse(instRes.data), 'lesson');
    if (tryPool(rows).length >= expected) return tryPool(rows);
  }

  // Admin + student_id, no service_type: avoids catalog quirks where lesson rows don't match `service_type=lesson`.
  const adminStudentQs = new URLSearchParams({ student_id: bookingOwnerStudentId, limit: '5000' });
  rows = filterLessonLikeServiceRows(
    filterCommissionCandidates(
      await fetchBookingsPath(page, `/bookings?${adminStudentQs}`, apiToken),
      'lesson',
    ),
  );
  if (tryPool(rows).length >= expected) return tryPool(rows);

  const adminQs = new URLSearchParams({ limit: '5000', service_type: 'lesson' });
  rows = filterCommissionCandidates(
    await fetchBookingsPath(page, `/bookings?${adminQs}`, apiToken),
    'lesson',
  );
  return tryPool(rows);
}

export async function pickLatestQuickBookings(
  rows: QuickBookingRow[],
  expectedCount: number,
): Promise<{ ids: string[]; instructorId: string }> {
  const slice = pickLatestForDominantInstructor(rows, expectedCount);
  expect(
    slice.length,
    `expected ${expectedCount} non-terminal lesson rows (same dominant instructor), got ${rows.length} raw candidates / ${slice.length} after pick`,
  ).toBe(expectedCount);
  const instructorId = String(slice[0].instructor_user_id ?? slice[0].instructorId ?? '');
  expect(instructorId, 'booking should have instructor_user_id / instructorId').toBeTruthy();
  for (const r of slice) {
    expect(String(r.instructor_user_id ?? r.instructorId)).toBe(instructorId);
  }
  return { ids: slice.map((r) => r.id), instructorId };
}

export async function completeBookingsAsAdmin(page: Page, adminToken: string, bookingIds: string[]): Promise<void> {
  for (const id of bookingIds) {
    const res = await apiJson(page, 'PUT', `/bookings/${id}`, adminToken, { status: 'completed' });
    expect(
      res.status,
      `PUT booking ${id} to completed failed: ${JSON.stringify(res.data).slice(0, 400)}`,
    ).toBeLessThan(400);
    await page.waitForTimeout(300);
  }
}

export async function fetchInstructorEarnings(page: Page, token: string, instructorId: string): Promise<{
  earnings: { booking_id: string; total_earnings?: number; commission_amount?: number }[];
  totals: { totalEarnings?: number; totalLessons?: number };
}> {
  const res = await apiJson(page, 'GET', `/finances/instructor-earnings/${instructorId}`, token);
  expect(res.status, `instructor-earnings failed: ${JSON.stringify(res.data).slice(0, 300)}`).toBe(200);
  return {
    earnings: res.data?.earnings ?? [],
    totals: res.data?.totals ?? {},
  };
}

export async function fetchFirstManagerId(page: Page, adminToken: string): Promise<string | null> {
  const res = await apiJson(page, 'GET', '/manager/commissions/admin/managers', adminToken);
  if (res.status !== 200) return null;
  const list = res.data?.data;
  if (!Array.isArray(list) || list.length === 0) return null;
  const id = list[0]?.id ?? list[0]?.user_id ?? list[0]?.manager_user_id;
  return id ? String(id) : null;
}

export async function fetchManagerBookingCommissions(
  page: Page,
  adminToken: string,
  managerId: string,
  bookingIds: string[],
): Promise<any[]> {
  const res = await apiJson(
    page,
    'GET',
    `/manager/commissions/admin/managers/${managerId}/commissions?sourceType=booking&limit=100`,
    adminToken,
  );
  if (res.status !== 200) return [];
  const data = res.data?.data;
  if (!Array.isArray(data)) return [];
  const idSet = new Set(bookingIds);
  return data.filter((row: { source_id?: string }) => idSet.has(String(row.source_id)));
}

/**
 * After UI login: staff JWT (manager or admin) in `page` localStorage.
 * Resolves **booking owner** via `COMMISSION_E2E_STUDENT_ID` or name search (`GET /users/for-booking`),
 * finds pending lesson rows, completes them with the same staff token, then polls finance APIs.
 *
 * Note: `/manager/commissions/admin/*` is **admin-only**; those assertions still use `TEST_ADMIN_*` login.
 */
export async function verifyCommissionsAfterQuickPackageBookings(page: Page): Promise<void> {
  const expectedSessions = commissionVerifyExpectedSessions();
  const staffToken = await page.evaluate(() => localStorage.getItem('token') || '');
  expect(staffToken.length).toBeGreaterThan(20);

  const me = await apiJson(page, 'GET', '/auth/me', staffToken);
  expect(me.status).toBe(200);
  const authUserId = studentIdFromAuthContext(me.data, staffToken);
  expect(
    authUserId,
    `/auth/me body must expose user id (or JWT must contain id). Got keys: ${
      me.data && typeof me.data === 'object' && !Array.isArray(me.data)
        ? Object.keys(me.data as object).join(',')
        : typeof me.data
    }`,
  ).toBeTruthy();

  const bookingOwnerStudentId = await resolveBookingOwnerUserId(page, staffToken);

  const adminToken = await loginApiToken(page, ADMIN_EMAIL, ADMIN_PASSWORD);

  let pending: QuickBookingRow[] = [];
  await expect
    .poll(
      async () => {
        pending = await resolveCommissionBookingCandidates(
          page,
          staffToken,
          bookingOwnerStudentId,
          authUserId as string,
          expectedSessions,
          staffToken,
        );
        return pending.length;
      },
      {
        timeout: 45_000,
        message: `pending lesson rows for booking-owner id=${bookingOwnerStudentId} (env STUDENT_ID or name search). expected>=${expectedSessions}`,
      },
    )
    .toBeGreaterThanOrEqual(expectedSessions);

  const { ids: bookingIds, instructorId } = await pickLatestQuickBookings(pending, expectedSessions);
  const beforeEarnings = await fetchInstructorEarnings(page, staffToken, instructorId);
  const beforeLessonCount = beforeEarnings.earnings.length;

  await completeBookingsAsAdmin(page, staffToken, bookingIds);

  await expect
    .poll(
      async () => {
        const { earnings } = await fetchInstructorEarnings(page, staffToken, instructorId);
        const have = new Set(earnings.map((e) => String(e.booking_id)));
        return bookingIds.every((id) => have.has(id));
      },
      { timeout: 45_000 },
    )
    .toBeTruthy();

  const afterEarnings = await fetchInstructorEarnings(page, staffToken, instructorId);
  expect(
    afterEarnings.earnings.length,
    'instructor earnings should list completed lessons',
  ).toBeGreaterThanOrEqual(beforeLessonCount + expectedSessions);

  for (const id of bookingIds) {
    const row = afterEarnings.earnings.find((e) => String(e.booking_id) === String(id));
    expect(row, `earning row for booking ${id}`).toBeTruthy();
    const amount = Number(row?.total_earnings ?? row?.commission_amount ?? 0);
    expect(amount, `instructor earning should be > 0 for booking ${id}`).toBeGreaterThan(0);
  }

  const managerId = await fetchFirstManagerId(page, adminToken);
  if (!managerId) {
    // eslint-disable-next-line no-console
    console.warn('[commissionVerification] No manager role user in DB — skipping manager commission assertions');
    return;
  }

  await expect
    .poll(
      async () => {
        const rows = await fetchManagerBookingCommissions(page, adminToken, managerId, bookingIds);
        return rows.length >= expectedSessions;
      },
      { timeout: 45_000 },
    )
    .toBeTruthy();

  const mgrRows = await fetchManagerBookingCommissions(page, adminToken, managerId, bookingIds);
  expect(mgrRows.length).toBe(expectedSessions);
  for (const row of mgrRows) {
    const amt = parseFloat(row.commission_amount ?? row.amount ?? '0');
    expect(amt, 'manager commission_amount should be positive').toBeGreaterThan(0);
    expect(String(row.source_type || '').toLowerCase()).toBe('booking');
  }
}
