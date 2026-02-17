// backend/constants/transactions.js
// Standardized transaction type groupings for cash-basis calculations

export const PAYMENT_TYPES = [
  'payment',          // generic incoming payment
  'service_payment',  // lesson/service payment
  'rental_payment',   // rental payment
  'accommodation_payment' // accommodation payment (future-proof)
];

export const REFUND_TYPES = [
  'refund',
  'booking_cancelled_refund'
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
