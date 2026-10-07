/**
 * Booking visibility & ownership — DENY-BY-DEFAULT role model.
 *
 * Every request falls into exactly one of three scopes (by `req.user.role`):
 *
 *  1. STAFF (`BOOKING_STAFF_ROLES` in constants/roles.js: admin, manager, owner,
 *     super_admin, developer, receptionist/front_desk) — see every booking;
 *     every helper here is a no-op for them.
 *  2. INSTRUCTOR-SCOPED (`INSTRUCTOR_SCOPED_ROLES`: instructor, freelancer) —
 *     may read/modify only the lessons they TEACH
 *     (`bookings.instructor_user_id = req.user.id`) and read the ones they attend.
 *  3. CUSTOMER-SCOPED — EVERY other role (student, outsider, trusted_customer,
 *     customer, and any custom/unknown role) — may only READ bookings they are a
 *     party to: student (`student_user_id`), payer (`customer_user_id`),
 *     participant (`booking_participants.user_id`) or the parent of the family
 *     member (child) the booking is for (`family_members.parent_user_id`). They
 *     never write through the staff booking routes, and their responses are
 *     stripped of staff e-mails, commission data and other participants'
 *     contact details (`sanitizeBookingForViewer`).
 *
 * Why this exists: `authorizeRoles()` falls back to `roles.permissions` JSONB when
 * the role name is not in the allow-list (instructor has `bookings:read` +
 * `bookings:write`, student/customer `bookings:read`), and several read routes
 * (`GET /bookings`, `/bookings/:id`, `/bookings/calendar`) had no role gate at
 * all — so instructors saw/edited colleagues' lessons and self-registered
 * `outsider`s received the whole calendar with names, notes and phone numbers.
 *
 * There is no secondary/assistant instructor concept on bookings (the only
 * instructor column is `bookings.instructor_user_id`; `group_bookings.instructor_id`
 * mirrors it for the Model B master row), so ownership = that single column.
 * Family groups (adult peer accounts, familyGroupService) switch INTO the other
 * account rather than sharing bookings, so they need no rule here.
 */
import { pool } from '../db.js';
import { logger } from './errorHandler.js';
import {
  BOOKING_STAFF_ROLES,
  isBookingStaffRole,
  normalizeRoleName,
} from '../constants/roles.js';

export { BOOKING_STAFF_ROLES, isBookingStaffRole };

/** Roles whose booking access is limited to their own lessons. Single source of truth. */
export const INSTRUCTOR_SCOPED_ROLES = Object.freeze(['instructor', 'freelancer']);

/**
 * PUT /bookings/:id fields an instructor-scoped role may NOT change, even on their
 * own lesson (money, funding, commission and re-assignment are staff decisions).
 * Sending the CURRENT value back unchanged is allowed (forms echo fields).
 */
export const INSTRUCTOR_BLOCKED_BOOKING_FIELDS = Object.freeze([
  'amount',
  'final_amount',
  'payment_status',
  'instructor_commission',
  'instructor_commission_type',
  'student_user_id',
  'instructor_user_id',
  'service_id',
]);

export const NOT_YOUR_BOOKING = 'NOT_YOUR_BOOKING';

export const isInstructorScopedRole = (role) =>
  INSTRUCTOR_SCOPED_ROLES.includes(normalizeRoleName(role));

export const isInstructorScopedRequest = (req) => isInstructorScopedRole(req?.user?.role);

export const isBookingStaffRequest = (req) => isBookingStaffRole(req?.user?.role);

/** Deny-by-default: every role that is neither staff nor instructor-scoped. */
export const isCustomerScopedRole = (role) =>
  !isBookingStaffRole(role) && !isInstructorScopedRole(role);

export const isCustomerScopedRequest = (req) => isCustomerScopedRole(req?.user?.role);

const sameId = (a, b) => a != null && b != null && String(a) === String(b);

const notYourBooking = (res, customer = false) =>
  res.status(403).json({
    error: customer
      ? 'You can only access your own bookings'
      : 'You can only access bookings where you are the assigned instructor',
    code: NOT_YOUR_BOOKING,
  });

const staffOnly = (res, code = 'STAFF_ONLY') =>
  res.status(403).json({
    error: 'This booking action is restricted to staff',
    code,
  });

/**
 * Instructor filter for list endpoints: instructor-scoped callers are always
 * pinned to their own id (any other `instructor_id` query value is ignored);
 * everyone else gets the requested value through unchanged.
 */
export const resolveInstructorFilter = (req, requestedInstructorId) =>
  (isInstructorScopedRequest(req) ? req.user.id : requestedInstructorId);

/**
 * SQL predicate restricting a bookings query to what an instructor-scoped caller
 * may READ: lessons they teach, plus bookings they personally attend (as student,
 * customer or participant — keeps the freelancer's previous "own bookings" view).
 * @param {string} alias  bookings table alias, e.g. 'b'
 * @param {string} param  positional placeholder holding req.user.id, e.g. '$3'
 */
export const instructorReadScopeSql = (alias, param) => `(
  ${alias}.instructor_user_id = ${param}
  OR ${alias}.student_user_id = ${param}
  OR ${alias}.customer_user_id = ${param}
  OR EXISTS (SELECT 1 FROM booking_participants bp_scope
             WHERE bp_scope.booking_id = ${alias}.id AND bp_scope.user_id = ${param})
)`;

/**
 * SQL predicate restricting a bookings query to what a CUSTOMER-scoped caller may
 * read: bookings where they are the student, the payer, a participant, or the
 * parent of the family member (child) the booking is for.
 * @param {string} alias  bookings table alias, e.g. 'b'
 * @param {string} param  positional placeholder holding req.user.id, e.g. '$3'
 */
export const customerReadScopeSql = (alias, param) => `(
  ${alias}.student_user_id = ${param}
  OR ${alias}.customer_user_id = ${param}
  OR EXISTS (SELECT 1 FROM booking_participants bp_cscope
             WHERE bp_cscope.booking_id = ${alias}.id AND bp_cscope.user_id = ${param})
  OR EXISTS (SELECT 1 FROM family_members fm_cscope
             WHERE fm_cscope.id = ${alias}.family_member_id AND fm_cscope.parent_user_id = ${param})
)`;

/**
 * Read-scope predicate for the caller, or null for staff (no restriction).
 * Use on every booking list/calendar query: `if (sql) query += ' AND ' + sql`.
 */
export const bookingReadScopeSql = (req, alias, param) => {
  if (isBookingStaffRequest(req)) return null;
  if (isInstructorScopedRequest(req)) return instructorReadScopeSql(alias, param);
  return customerReadScopeSql(alias, param);
};

async function loadBookingParties(bookingId, userId, db = pool) {
  const { rows } = await db.query(
    `SELECT b.id, b.instructor_user_id, b.student_user_id, b.customer_user_id,
            EXISTS (SELECT 1 FROM booking_participants bp
                    WHERE bp.booking_id = b.id AND bp.user_id = $2) AS is_participant,
            EXISTS (SELECT 1 FROM family_members fm
                    WHERE fm.id = b.family_member_id AND fm.parent_user_id = $2) AS is_family_parent
       FROM bookings b
      WHERE b.id = $1`,
    [bookingId, userId]
  );
  return rows[0] || null;
}

/**
 * Route middleware enforcing the scope model on a single booking (`:id`):
 *  - staff: no-op;
 *  - instructor-scoped: must be the assigned instructor (`access: 'write'`,
 *    default) or at least a party to it (`access: 'read'`);
 *  - customer-scoped: `read` only when they are a party (student / payer /
 *    participant / parent of the family member); `write` is always STAFF_ONLY.
 * Unknown/invalid ids fall through so the route keeps its own 404/400 behaviour.
 */
export function requireBookingOwnership({ param = 'id', access = 'write' } = {}) {
  return async (req, res, next) => {
    if (isBookingStaffRequest(req)) return next();
    const customer = !isInstructorScopedRequest(req);
    if (customer && access !== 'read') return staffOnly(res);
    const bookingId = req.params?.[param];
    if (!bookingId) return next();
    try {
      const booking = await loadBookingParties(bookingId, req.user.id);
      if (!booking) return next(); // route returns its own 404
      const teaches = sameId(booking.instructor_user_id, req.user.id);
      const attends = sameId(booking.student_user_id, req.user.id)
        || sameId(booking.customer_user_id, req.user.id)
        || booking.is_participant === true;
      if (customer) {
        if (attends || booking.is_family_parent === true) return next();
        return notYourBooking(res, true);
      }
      if (teaches || (access === 'read' && attends)) return next();
      return notYourBooking(res);
    } catch (err) {
      if (err?.code === '22P02') return next(); // malformed uuid — let the route answer
      logger.error('Booking ownership check failed', { bookingId, error: err?.message });
      return res.status(500).json({ error: 'Ownership check failed' });
    }
  };
}

/**
 * Route middleware for STAFF-ONLY booking routes (deleted/list, pending bank
 * transfers, cancel, bulk delete/undo/restore, funding switch, group master
 * edits...). Only `BOOKING_STAFF_ROLES` pass; instructor-scoped AND
 * customer-scoped roles (incl. custom roles that reach the route through the
 * JSONB `bookings:*` fallback in authorizeRoles) get 403 `code`.
 * **Put this on every new staff-only booking route.**
 */
export function requireBookingStaff(code = 'STAFF_ONLY') {
  return (req, res, next) => {
    if (isBookingStaffRequest(req)) return next();
    return staffOnly(res, code);
  };
}

/** @deprecated old name (instructor-only era) — identical to requireBookingStaff. */
export const denyInstructorScopedRoles = requireBookingStaff;

const CUSTOMER_HIDDEN_BOOKING_FIELDS = [
  'created_by_email', 'updated_by_email', 'createdByEmail', 'updatedByEmail',
  'instructor_email', 'instructorEmail',
  'instructor_commission', 'commission_type', 'instructorCommission', 'commissionType',
];
const PARTICIPANT_PRIVATE_FIELDS = [
  'userEmail', 'userPhone', 'email', 'phone', 'user_email', 'user_phone', 'notes',
];

/**
 * Strip a booking row for a CUSTOMER-scoped viewer: staff e-mails, commission
 * data, the student's e-mail when the viewer is not the student, and every
 * OTHER participant's e-mail/phone/notes. Returns a new object.
 */
export function sanitizeBookingForCustomer(booking, viewerId) {
  if (!booking || typeof booking !== 'object') return booking;
  const out = { ...booking };
  for (const f of CUSTOMER_HIDDEN_BOOKING_FIELDS) delete out[f];
  if (!sameId(out.student_user_id, viewerId)) {
    delete out.student_email;
    delete out.studentEmail;
  }
  if (Array.isArray(out.participants)) {
    out.participants = out.participants.map((p) => {
      if (!p || typeof p !== 'object') return p;
      if (sameId(p.userId ?? p.user_id, viewerId)) return p;
      const clean = { ...p };
      for (const f of PARTICIPANT_PRIVATE_FIELDS) delete clean[f];
      return clean;
    });
  }
  return out;
}

/** sanitizeBookingForCustomer for customer-scoped requests; unchanged otherwise. */
export function sanitizeBookingForViewer(booking, req) {
  if (!isCustomerScopedRequest(req)) return booking;
  return sanitizeBookingForCustomer(booking, req.user?.id);
}

/**
 * The only booking fields that may go to a broad audience (e.g. the socket
 * `general` channel): no names, notes, e-mails, phones or money.
 */
export const pickPublicBookingFields = (booking) => ({
  id: booking?.id,
  date: booking?.date,
  start_hour: booking?.start_hour,
  duration: booking?.duration,
  instructor_user_id: booking?.instructor_user_id ?? booking?.instructorId ?? null,
  status: booking?.status,
});

const numericChanged = (next, current) => {
  const a = Number(next);
  const b = Number(current ?? 0);
  if (!Number.isFinite(a)) return true;
  return Math.abs(a - b) > 0.0001;
};

/**
 * PUT /bookings/:id body check for instructor-scoped callers (call it with the
 * row already locked FOR UPDATE). Returns the list of blocked fields the request
 * tries to CHANGE; empty array = allowed. Always [] for non-scoped roles.
 */
export function findBlockedInstructorFieldChanges(req, currentBooking, body = req.body || {}) {
  if (!isInstructorScopedRequest(req)) return [];
  const blocked = [];
  const provided = (f) => body[f] !== undefined && body[f] !== null && body[f] !== '';

  for (const f of ['amount', 'final_amount']) {
    if (provided(f) && numericChanged(body[f], currentBooking[f])) blocked.push(f);
  }
  if (provided('payment_status')
      && String(body.payment_status) !== String(currentBooking.payment_status ?? '')) {
    blocked.push('payment_status');
  }
  // Commission overrides are never the instructor's call (the UI only sends them
  // when staff edited the field, so any value here is a deliberate override).
  for (const f of ['instructor_commission', 'instructor_commission_type']) {
    if (provided(f)) blocked.push(f);
  }
  for (const f of ['student_user_id', 'instructor_user_id', 'service_id']) {
    if (provided(f) && !sameId(body[f], currentBooking[f])) blocked.push(f);
  }
  return blocked;
}

/**
 * Swap guard (POST /bookings/swap, /swap-with-parking, /swap-auto). An
 * instructor-scoped caller may only swap two lessons that are BOTH theirs and
 * both must stay theirs — i.e. re-ordering their own day. Moving a colleague's
 * lesson (or handing one of theirs to someone else) is a re-assignment, which is
 * staff-only exactly like `instructor_user_id` on PUT.
 */
export function requireSwapOwnership() {
  return async (req, res, next) => {
    if (isBookingStaffRequest(req)) return next();
    if (!isInstructorScopedRequest(req)) return staffOnly(res);
    const { a_id, b_id, a, b } = req.body || {};
    if (!a_id || !b_id || !a || !b) return next(); // route answers 400
    const me = req.user.id;
    try {
      const { rows } = await pool.query(
        'SELECT id, instructor_user_id FROM bookings WHERE id = ANY($1::uuid[])',
        [[a_id, b_id]]
      );
      if (rows.length !== 2) return next(); // route answers 404
      if (!rows.every((r) => sameId(r.instructor_user_id, me))) return notYourBooking(res);
      const targets = [a.instructor_user_id || a.instructorId, b.instructor_user_id || b.instructorId];
      if (targets.some((t) => t && !sameId(t, me))) {
        return res.status(403).json({
          error: 'Instructors cannot move lessons to another instructor',
          code: 'INSTRUCTOR_REASSIGNMENT_FORBIDDEN',
        });
      }
      return next();
    } catch (err) {
      if (err?.code === '22P02') return next();
      logger.error('Swap ownership check failed', { error: err?.message });
      return res.status(500).json({ error: 'Ownership check failed' });
    }
  };
}
