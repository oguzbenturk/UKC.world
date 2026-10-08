// Staff earnings as a spendable balance ("Pay with my earnings").
// Spec: owner decisions 2026-10-08 (staff wallet): earnings = closed lessons /
// recorded commissions; a staff purchase paid from earnings is stored as a
// normal staff payout row (positive 'payment', available_delta 0) with
// payment_method 'earnings' and metadata { kind, sourceType, sourceId }, so
// every owed/payroll figure reduces it exactly like a cash payout.

/** payment_method on the staff payout row written for an in-app purchase. */
export const STAFF_EARNINGS_PAYMENT_METHOD = 'earnings';

/** metadata.kind on that payout row. */
export const STAFF_EARNINGS_SPEND_KIND = 'in_app_purchase';

/**
 * Roles that have an earnings balance. Receptionist / front desk have no
 * earnings source in the system (owner decision 3) — they keep wallet credit only.
 */
export const STAFF_EARNINGS_ROLES = Object.freeze(['instructor', 'freelancer', 'manager']);

export const hasStaffEarnings = (role) =>
  STAFF_EARNINGS_ROLES.includes(String(role || '').toLowerCase().trim());

/**
 * Cut-off for the feature (owner decision 8): before this date staff purchases
 * were settled by hand (wallet "add funds" + payroll deduction). Those rows stay
 * as history and are NOT converted. "Pay with my earnings" only exists from this
 * date on, and My Wallet shows the note for anything older.
 * Override per environment with STAFF_EARNINGS_WALLET_START=YYYY-MM-DD; set it to
 * the deploy date when shipping.
 */
export const STAFF_EARNINGS_WALLET_START = process.env.STAFF_EARNINGS_WALLET_START || '2026-10-08';
