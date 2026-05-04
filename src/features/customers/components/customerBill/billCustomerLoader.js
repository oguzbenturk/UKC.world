// Loads every dataset the bill needs for an arbitrary customer. Mirrors the
// parallel fetch in EnhancedCustomerDetailModal so combined bills stitch
// together cohorts without each one needing the full customer-detail screen
// to be open.
//
// Returns a normalized cohort entry consumable by buildCombinedBillItems /
// computeCombinedTotals. Always resolves — failed sub-fetches degrade to []
// rather than throwing, so a partial cohort still renders.

import DataService from '@/shared/services/dataService';
import FinancialService from '@/features/finances/services/financialService';
import { fetchCustomerDiscounts } from './discountApi';
import { indexDiscounts } from './billAggregator';

const headersFromToken = () => {
  try {
    const token = localStorage.getItem('access_token') || localStorage.getItem('token');
    return token ? { Authorization: `Bearer ${token}` } : {};
  } catch {
    return {};
  }
};

const settle = (p, fallback) => p.then(v => v ?? fallback).catch(() => fallback);

// Dedupe array entries by their `id`. The /bookings endpoint can return
// duplicate rows for the same booking when LEFT JOINs multiply (multiple
// commission rules, multiple wallet_transactions of type 'charge', or one
// row per booking_participants entry that the GROUP BY can't fully
// collapse). EnhancedCustomerDetailModal already does this dedupe on its
// own state (line 287 / 283); the cohort loader has to do it too, otherwise
// combined bills sum the same booking N times — staff saw a 2h supervision
// session show up four times and the merged line totalled €560 instead of
// €140. Keep the latest occurrence so any newer JOINed values win.
const dedupeById = (arr) => {
  if (!Array.isArray(arr)) return [];
  const map = new Map();
  for (const item of arr) {
    if (!item || item.id == null) continue;
    map.set(item.id, item);
  }
  return Array.from(map.values());
};

const customerDisplayName = (c) => {
  if (!c) return 'Customer';
  const first = c.first_name || c.firstName;
  const last = c.last_name || c.lastName;
  const joined = [first, last].filter(Boolean).join(' ');
  return joined || c.name || c.email || 'Customer';
};

export const loadBillCohort = async (customerId) => {
  if (!customerId) {
    return {
      customer: null,
      customerId: null,
      customerName: null,
      bookings: [], rentals: [], packages: [], accommodationBookings: [],
      transactions: [], shopOrders: [], memberships: [], instructors: [],
      discounts: [], discountsByEntity: null,
    };
  }

  const headers = headersFromToken();

  const [
    customer,
    bookings,
    rentals,
    instructors,
    transactions,
    packagesRaw,
    accommodationRaw,
    discounts,
    shopOrdersRaw,
    membershipsRaw,
  ] = await Promise.all([
    settle(DataService.getUserById(customerId), null),
    settle(DataService.getLessonsByUserId(customerId), []),
    settle(DataService.getRentalsByUserId(customerId), []),
    settle(DataService.getInstructors(), []),
    // Pull a wide window of transactions. The default API limit is 50 and
    // sorts most-recent-first, so an older deposit (e.g. a €155 booking
    // deposit from weeks ago) silently drops off the bill once 50 newer
    // transactions stack up — staff saw it "sometimes show, sometimes not".
    // Period filtering happens client-side in computeTotals, so over-fetching
    // is cheap; missing rows are not.
    settle(FinancialService.getUserTransactions(customerId, { limit: 1000 }), []),
    settle(
      fetch(`/api/services/customer-packages/${customerId}`, { headers })
        .then(r => r.ok ? r.json() : []),
      []
    ),
    settle(
      fetch(`/api/accommodation/bookings?guestId=${customerId}&limit=200`, { headers })
        .then(r => r.ok ? r.json() : []),
      []
    ),
    settle(fetchCustomerDiscounts(customerId), []),
    // Shop orders + memberships use the same endpoints as CustomerBillModal's
    // own follow-up fetch, kept in sync so the cohort picker doesn't diverge.
    settle(
      fetch(`/api/shop-orders/admin/user/${customerId}?page=1&limit=200`, { headers })
        .then(r => r.ok ? r.json() : { orders: [] }),
      { orders: [] }
    ),
    settle(
      fetch(`/api/member-offerings/user/${customerId}/purchases`, { headers })
        .then(r => r.ok ? r.json() : []),
      []
    ),
  ]);

  return {
    customer,
    customerId,
    customerName: customerDisplayName(customer),
    bookings: dedupeById(bookings),
    rentals: dedupeById(rentals),
    packages: dedupeById(packagesRaw),
    accommodationBookings: dedupeById(accommodationRaw),
    transactions: Array.isArray(transactions) ? transactions : [],
    shopOrders: dedupeById(Array.isArray(shopOrdersRaw?.orders) ? shopOrdersRaw.orders : []),
    memberships: dedupeById(membershipsRaw),
    instructors: Array.isArray(instructors) ? instructors : [],
    discounts: Array.isArray(discounts) ? discounts : [],
    discountsByEntity: indexDiscounts(Array.isArray(discounts) ? discounts : []),
  };
};
