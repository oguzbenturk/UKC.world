// constants/roles.js
// NOTE: Role UUIDs are intentionally NOT kept here — they differ per environment
// and drift on reseed, which caused orphaned role_id + broken logins when assigned.
// Resolve role ids by NAME from the DB at runtime instead (e.g. SELECT id FROM roles
// WHERE name = $1). Role logic here is keyed by name only.

// Roles that can use "Pay at Center" option
export const PAY_AT_CENTER_ALLOWED_ROLES = ['admin', 'manager', 'trusted_customer'];

// Canonical "front-desk seller" list: who may sell/book ON BEHALF of a customer
// and push that customer's wallet NEGATIVE (sell/book without sufficient balance)
// on the shop + accommodation desk-sale flows. Kept in one place because this rule
// has silently drifted/regressed several times (see WORK-LOG / frontdesk overhaul).
//
// 'front_desk' and 'receptionist' are two names for the SAME desk role and MUST
// always appear together: migration 261 renamed 'Recepsion' -> 'receptionist',
// while 'front_desk' is the legacy code-level alias. `req.user.role` from the JWT
// is the lowercase role name.
//
// NOTE: bookings.js and rentals.js intentionally keep their own variants of this
// list (they additionally allow 'instructor' for lessons/rentals).
export const STAFF_NEGATIVE_BALANCE_ROLES = [
  'admin',
  'manager',
  'owner',
  'super_admin',
  'front_desk',
  'receptionist',
];

// Tolerant membership test: lower-cases and normalises dashes/spaces to
// underscores so 'Front Desk' / 'front-desk' both match 'front_desk'.
export const isStaffNegativeBalanceRole = (role) =>
  STAFF_NEGATIVE_BALANCE_ROLES.includes(
    String(role || '').toLowerCase().replace(/[-\s]+/g, '_').trim(),
  );

// Booking visibility (deny-by-default, see middlewares/bookingOwnership.js).
// Staff roles that see EVERY booking (calendar, lists, deleted/list, pending
// transfers, full socket payloads). Anything not listed here and not
// instructor-scoped (instructor/freelancer) is CUSTOMER-SCOPED: it only sees
// bookings it is a party to — including custom roles created in the UI. Add a
// custom desk role here (by name) if it must see the whole calendar.
// 'front_desk' and 'receptionist' are aliases and MUST stay together.
export const BOOKING_STAFF_ROLES = Object.freeze([
  'admin',
  'manager',
  'owner',
  'super_admin',
  'developer',
  'receptionist',
  'front_desk',
]);

// Built-in customer roles. authorizeRoles() never lets these through via the
// roles.permissions JSONB fallback (their `bookings:read` / `services:read`
// flags exist for the UI, not to open staff-only routes) — they must be named
// explicitly in a route's allow-list.
export const BUILTIN_CUSTOMER_ROLES = Object.freeze([
  'student',
  'outsider',
  'trusted_customer',
  'customer',
]);

export const normalizeRoleName = (role) =>
  String(role || '').trim().toLowerCase().replace(/[\s-]+/g, '_');

export const isBookingStaffRole = (role) => BOOKING_STAFF_ROLES.includes(normalizeRoleName(role));

export const isBuiltinCustomerRole = (role) => BUILTIN_CUSTOMER_ROLES.includes(normalizeRoleName(role));
