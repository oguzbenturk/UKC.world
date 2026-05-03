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
  DISCOUNT_ADJUSTMENT: 'discount_adjustment',
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
  PACKAGE_PRICE_ADJUSTMENT: 'package_price_adjustment',
});

// Wallet transaction direction.
export const TX_DIRECTION = Object.freeze({
  CREDIT: 'credit',
  DEBIT: 'debit',
});
