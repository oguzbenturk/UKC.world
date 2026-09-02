// backend/constants/transactions.js
// Standardized transaction type groupings for cash-basis calculations + the
// stringly-typed enums used across wallet / booking flows.

export const PAYMENT_TYPES = [
  'payment',          // generic incoming payment
  'service_payment',  // lesson/service payment
  'rental_payment',   // rental payment
  'accommodation_payment' // accommodation payment (future-proof)
];

export const REFUND_TYPES = [
  'refund',
  'booking_cancelled_refund',
  'booking_deleted_refund',
  'rental_cancelled_refund',
  'package_refund'
];

// Types that represent charges/debits we should exclude from revenue sums
export const EXCLUDED_REVENUE_TYPES = [
  'charge',
  'rental_charge'
];

// Optional mapping from serviceType to specific payment types
export const SERVICE_TYPE_TO_PAYMENT_TYPES = {
  lesson: ['service_payment'],
  rental: ['rental_payment'],
  accommodation: ['accommodation_payment']
};

// Wallet ledger transaction_type values used by recordTransaction /
// recordLegacyTransaction throughout the codebase.
export const TRANSACTION_TYPE = Object.freeze({
  PAYMENT: 'payment',
  DEDUCTION: 'deduction',
  PACKAGE_PURCHASE: 'package_purchase',
  PACKAGE_PRICE_ADJUSTMENT: 'package_price_adjustment',
  ACCOMMODATION_CHARGE_ADJUSTMENT: 'accommodation_charge_adjustment',
  BOOKING_CHARGE_ADJUSTMENT: 'booking_charge_adjustment',
  DISCOUNT_ADJUSTMENT: 'discount_adjustment',
  // Posted when a booking is DELETED while a participant still holds a net
  // CREDIT on it (discount credit larger than their own charge, or an orphaned
  // price-edit credit). Zeroes the deleted booking's wallet footprint. The
  // _reversal suffix keeps it out of revenue stats, which already exclude
  // right(transaction_type, 9) = '_reversal'.
  BOOKING_DELETED_CREDIT_REVERSAL: 'booking_deleted_credit_reversal',
});

// Canonical entity-type strings shared by wallet_transactions.entity_type,
// discounts.entity_type, and any other table that references these domain
// objects by string. Keeping one source of truth means a rename here cascades
// to every consumer.
export const WALLET_ENTITY_TYPE = Object.freeze({
  MANAGER_PAYMENT: 'manager_payment',
  INSTRUCTOR_PAYMENT: 'instructor_payment',
  CUSTOMER_PACKAGE: 'customer_package',
  ACCOMMODATION_BOOKING: 'accommodation_booking',
  BOOKING: 'booking',
  RENTAL: 'rental',
});

// wallet_transactions.status values.
export const WALLET_TX_STATUS = Object.freeze({
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
  PENDING: 'pending',
  FAILED: 'failed',
});

// bookings.status / accommodation_bookings.status values.
export const BOOKING_STATUS = Object.freeze({
  PENDING: 'pending',
  CONFIRMED: 'confirmed',
  CANCELLED: 'cancelled',
  COMPLETED: 'completed',
});

// bookings.payment_status / accommodation_bookings.payment_status values.
export const PAYMENT_STATUS = Object.freeze({
  PAID: 'paid',
  UNPAID: 'unpaid',
  PENDING: 'pending',
  PENDING_PAYMENT: 'pending_payment',
  FAILED: 'failed',
  PACKAGE: 'package',
  PARTIAL: 'partial',
  REFUNDED: 'refunded',
  COMPLETED: 'completed',
});

// payment_method values.
export const PAYMENT_METHOD = Object.freeze({
  WALLET: 'wallet',
  PAY_LATER: 'pay_later',
  CREDIT_CARD: 'credit_card',
  CASH: 'cash',
  // Bank transfer is a PROMISE to pay: the sale posts the full price as a real
  // receivable (negative balance) and each admin-approved receipt posts a credit
  // against it, so a part-paid "deposit now, rest on arrival" sale shows the
  // remainder on the customer's balance instead of only in a note.
  BANK_TRANSFER: 'bank_transfer',
  PACKAGE_PRICE_ADJUSTMENT: 'package_price_adjustment',
});

// Credit-leg transaction_type for an instantly-settled non-wallet payment
// ("Paid" with a method on the membership / rental / sale forms). Each such
// payment is a two-row pair: a DEBIT charge + one of these CREDIT rows, both
// availableDelta 0 — the wallet balance never moves, but Payment History shows
// the charge AND the method-payment, and the credit counts as income (these
// types must stay in finances.js INCOME_TX_TYPES and dailyOperationsService
// DAILY_INCOME_TYPES, like bank_transfer_payment).
export const METHOD_PAYMENT_TX_TYPE = Object.freeze({
  cash: 'cash_payment',
  card: 'card_payment',
  credit_card: 'card_payment',
  transfer: 'bank_transfer_payment',
  bank_transfer: 'bank_transfer_payment',
});

// Wallet transaction direction.
export const TX_DIRECTION = Object.freeze({
  CREDIT: 'credit',
  DEBIT: 'debit',
});
