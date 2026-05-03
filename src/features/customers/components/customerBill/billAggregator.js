// Pure normalizers that flatten each customer-activity dataset into a unified
// `BillLineItem` shape, plus totals computation. No React, no I/O — easy to
// reason about and to feed into both the on-screen bill and the PDF export.
//
// BillLineItem:
//   {
//     id, category, date, description, detail,
//     qty, unit, unitPrice, amount, currency,
//     status: 'paid' | 'unpaid' | 'package' | 'cancelled' | 'refunded',
//     paymentMethod,
//     // Polymorphic ref into the discounts table — set by every normalizer
//     // so the post-processor can apply per-entity manual discounts.
//     entityType, entityId,
//     // Filled in by `applyDiscounts`; absent / 0 when no discount.
//     originalAmount, discountAmount, discountPercent, discountId,
//   }

const num = (v, fallback = 0) => {
  const n = Number.parseFloat(v);
  return Number.isFinite(n) ? n : fallback;
};

const safeDate = (v) => {
  if (!v) return null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v;
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) {
    const [y, m, d] = v.split('-').map(Number);
    return new Date(y, m - 1, d);
  }
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
};

const SUPERVISION_RE = /supervision/i;

const isSupervisionBooking = (b) => {
  if (!b) return false;
  const tag = String(b.lesson_category_tag || b.lesson_category || b.booking_type || '').toLowerCase();
  if (tag.includes('supervision')) return true;
  return SUPERVISION_RE.test(String(b.service_name || b.serviceName || ''));
};

// Pull out a customer package's remaining hours, tolerating the multiple
// shapes the API returns (camelCase / snake_case, raw fields / usageSummary).
const packageRemainingHours = (pkg) => {
  if (!pkg) return null;
  const usage = pkg.usageSummary || {};
  const total = num(pkg.totalHours ?? pkg.total_hours ?? usage.totalHours ?? usage.total_hours, 0);
  const used = num(pkg.usedHours ?? pkg.used_hours ?? usage.usedHours ?? usage.used_hours, 0);
  const raw = pkg.remainingHours ?? pkg.remaining_hours ?? usage.remainingHours ?? usage.remaining_hours;
  return num(raw, Math.max(0, total - used));
};

const formatHoursLabel = (h) => `${h % 1 === 0 ? h : h.toFixed(1)}h`;

// Build a Set of "(entityType, entityId)" keys from the wallet transactions
// where money actually moved IN (debit-direction charges or completed
// payments tied to the entity). Used by the booking/rental/package
// normalizers to trust evidence over the often-unreliable `payment_status`
// column on the entity row itself — backends sometimes default that column
// to 'paid' on entity creation even when no money changed hands, which made
// the bill mis-report unpaid items as Paid.
const buildPaidEntityIndex = (transactions = []) => {
  const set = new Set();
  for (const t of transactions || []) {
    if (t.status && t.status !== 'completed') continue;
    const dir = String(t.direction || '').toLowerCase();
    const type = String(t.type || '').toLowerCase();
    // Reversals don't count as evidence of payment.
    if (type.includes('reversal')) continue;
    // A debit (charge) tied to an entity is evidence the customer was
    // billed for it — so the entity is "paid for from the wallet".
    // A credit linked to an entity is a refund and shouldn't count.
    if (dir !== 'debit') continue;
    // pay_later charges record the debt without any incoming money — staff /
    // trusted_customer flows allow the wallet to go negative. Treating them
    // as paid would tell the customer "you owe €0" when they actually owe.
    const paymentMethod = String(t.paymentMethod || t.payment_method || '').toLowerCase();
    if (paymentMethod === 'pay_later') continue;
    const entityType = String(t.relatedEntityType || t.entity_type || '').toLowerCase();
    const entityId = t.relatedEntityId || t.entity_id || t.booking_id || null;
    if (!entityType || !entityId) continue;
    set.add(`${entityType}:${entityId}`);
  }
  return set;
};

const isEntityPaid = (paidIndex, entityType, entityId) =>
  !!entityId && paidIndex.has(`${String(entityType || '').toLowerCase()}:${entityId}`);

// ── Lessons / Supervision ───────────────────────────────────────────────────
const normalizeBooking = (b, instructors = [], packagesById = new Map(), paidIndex = new Set()) => {
  const date = safeDate(b.date || b.formatted_date || b.start_time);
  const duration = num(b.duration);
  const amount = num(b.final_amount ?? b.total_price ?? b.amount);
  const status = String(b.status || '').toLowerCase();

  const instId = b.instructor_user_id || b.instructor_id;
  const inst = b.instructor_name
    || instructors.find(i => i.id === instId)?.name
    || (instructors.find(i => i.id === instId)
      ? `${instructors.find(i => i.id === instId).first_name || ''} ${instructors.find(i => i.id === instId).last_name || ''}`.trim()
      : null);

  const ps = String(b.payment_status || '').toLowerCase();
  const paidByPackage = ps === 'package'
    || (b.payment_method_display && /package/i.test(b.payment_method_display));
  // Trust the wallet ledger over the booking row's payment_status flag —
  // the latter is sometimes stamped 'paid' on creation regardless of whether
  // money moved. We only mark "Paid" when there's an actual debit-direction
  // wallet transaction tied to this booking.
  const hasWalletEvidence = isEntityPaid(paidIndex, 'booking', b.id);
  let billStatus = 'unpaid';
  if (status === 'cancelled') billStatus = 'cancelled';
  else if (paidByPackage) billStatus = 'package';
  else if (hasWalletEvidence) billStatus = 'paid';
  // No fallback to ps='paid' alone — if the wallet has no record of payment,
  // the row is unpaid no matter what the booking flag says.

  // Build the detail line. Lesson start time is intentionally omitted — the
  // bill is a financial record, not a calendar; the date is sufficient context.
  const detailParts = [];
  if (duration) detailParts.push(formatHoursLabel(duration));
  if (inst) detailParts.push(`with ${inst}`);

  // For package-paid lessons, surface the linked package's current state so
  // staff reading the bill can see at a glance how many hours are left
  // (e.g. "1h · with Dinçer Yazgan · Supervision 4H (0.5h left)").
  if (paidByPackage && b.customer_package_id) {
    const pkg = packagesById.get(b.customer_package_id);
    if (pkg) {
      const remaining = packageRemainingHours(pkg) ?? 0;
      const pkgName = pkg.packageName || pkg.package_name
        || pkg.lessonServiceName || pkg.lesson_service_name || 'Package';
      const remainingLabel = remaining > 0 ? `${formatHoursLabel(remaining)} left` : 'fully used';
      detailParts.push(`${pkgName} (${remainingLabel})`);
    }
  }

  const description = b.service_name
    || b.serviceName
    || `${(b.booking_type || 'Lesson').replace(/^./, c => c.toUpperCase())}`;

  return {
    id: `lesson-${b.id}`,
    category: isSupervisionBooking(b) ? 'supervision' : 'lessons',
    date,
    description,
    detail: detailParts.join(' · ') || null,
    qty: 1,
    unit: 'session',
    unitPrice: duration > 0 && amount > 0 ? amount / duration : null,
    amount: billStatus === 'cancelled' ? 0 : (paidByPackage ? 0 : amount),
    currency: b.currency || null,
    status: billStatus,
    paymentMethod: b.payment_method_display || (paidByPackage ? 'Package' : null),
    entityType: 'booking',
    entityId: b.id,
  };
};

export const normalizeBookings = (bookings = [], instructors = [], packages = [], transactions = []) => {
  const packagesById = new Map((packages || []).map(p => [p.id, p]));
  const paidIndex = buildPaidEntityIndex(transactions);
  return bookings.map(b => normalizeBooking(b, instructors, packagesById, paidIndex));
};

// ── Rentals ─────────────────────────────────────────────────────────────────
const normalizeRental = (r, paidIndex = new Set()) => {
  const date = safeDate(r.rental_date || r.start_date || r.created_at);
  const total = num(r.total_price);
  const isPackage = !!r.customer_package_id || r.payment_status === 'package';
  const status = String(r.status || '').toLowerCase();

  let description = 'Rental';
  if (r.equipment && Array.isArray(r.equipment) && r.equipment.length) {
    description = r.equipment.length === 1
      ? (r.equipment[0].name || 'Equipment rental')
      : `${r.equipment.length} items`;
  } else if (r.equipment_name) {
    description = r.equipment_name;
  }

  // Trust the wallet ledger over r.payment_status — backend often defaults
  // payment_status='paid' on rental creation regardless of actual payment.
  const ps = String(r.payment_status || '').toLowerCase();
  const hasWalletEvidence = isEntityPaid(paidIndex, 'rental', r.id);
  let billStatus = 'unpaid';
  if (status === 'cancelled') billStatus = 'cancelled';
  else if (isPackage || ps === 'package') billStatus = 'package';
  else if (hasWalletEvidence) billStatus = 'paid';

  const detail = (() => {
    const start = safeDate(r.start_date || r.rental_date);
    const end = safeDate(r.end_date || r.return_date);
    if (start && end) {
      const days = Math.max(1, Math.round((end - start) / 86400000));
      return `${days} day${days === 1 ? '' : 's'}`;
    }
    return null;
  })();

  return {
    id: `rental-${r.id}`,
    category: 'rentals',
    date,
    description,
    detail,
    qty: 1,
    unit: 'rental',
    unitPrice: null,
    amount: billStatus === 'cancelled' ? 0 : (isPackage ? 0 : total),
    currency: r.currency || null,
    status: billStatus,
    paymentMethod: isPackage ? 'Package' : null,
    entityType: 'rental',
    entityId: r.id,
  };
};

export const normalizeRentals = (rentals = [], transactions = []) => {
  const paidIndex = buildPaidEntityIndex(transactions);
  return rentals.map(r => normalizeRental(r, paidIndex));
};

// ── Accommodation ───────────────────────────────────────────────────────────
// Mirrors the merge logic already used in EnhancedCustomerDetailModal.jsx so
// the bill matches what staff see in the Accommodation tab.
const normalizeAccommodationRow = (row) => {
  const date = safeDate(row.check_in_date);
  const checkIn = safeDate(row.check_in_date);
  const checkOut = safeDate(row.check_out_date);
  const nights = (() => {
    if (checkIn && checkOut) {
      const n = Math.round((checkOut - checkIn) / 86400000);
      return n > 0 ? n : (row._nights_total || null);
    }
    return row._nights_total || null;
  })();
  const total = num(row.total_price);
  const fromPackage = row._source === 'package';
  const status = String(row.status || '').toLowerCase();
  const ps = String(row.payment_status || '').toLowerCase();

  // Same default-to-unpaid rule as bookings/rentals.
  let billStatus = 'unpaid';
  if (status === 'cancelled') billStatus = 'cancelled';
  else if (fromPackage) billStatus = 'package';
  else if (ps === 'paid' || ps === 'completed') billStatus = 'paid';

  const description = row.unit_name || row._package_name || 'Accommodation';
  const detailParts = [];
  if (checkIn && checkOut) {
    detailParts.push(`${checkIn.toLocaleDateString()} - ${checkOut.toLocaleDateString()}`);
  } else if (checkIn) {
    detailParts.push(`From ${checkIn.toLocaleDateString()}`);
  }
  if (nights) detailParts.push(`${nights} night${nights === 1 ? '' : 's'}`);

  return {
    id: `accom-${row.id}`,
    category: 'accommodation',
    date,
    description,
    detail: detailParts.join(' · ') || null,
    qty: nights || 1,
    unit: 'night',
    unitPrice: nights && total ? total / nights : null,
    amount: billStatus === 'cancelled' ? 0 : (fromPackage ? 0 : total),
    currency: row.currency || null,
    status: billStatus,
    paymentMethod: fromPackage ? 'Package' : null,
    // Package-sourced rows aren't a discountable accommodation_booking; only
    // standalone rows have a real accommodation_bookings.id.
    entityType: fromPackage ? null : 'accommodation_booking',
    entityId: fromPackage ? null : row.id,
  };
};

export const normalizeAccommodation = (standaloneBookings = [], packages = []) => {
  const packageRows = (packages || [])
    .filter(p => p.includes_accommodation || p.includesAccommodation
      || num(p.accommodation_nights_total ?? p.accommodationNightsTotal) > 0)
    .map(p => ({
      id: `pkg-${p.id}`,
      _source: 'package',
      _package_name: p.packageName || p.package_name || p.lessonType || '—',
      _nights_total: num(p.accommodation_nights_total ?? p.accommodationNightsTotal) || null,
      unit_name: p.accommodationUnitName || p.accommodation_unit_name || '—',
      check_in_date: p.checkInDate || p.check_in_date || null,
      check_out_date: p.checkOutDate || p.check_out_date || null,
      total_price: 0, // package rows always show as included
      status: p.status || 'active',
    }));

  const standaloneCheckIns = new Set(
    (standaloneBookings || []).map(b => b.check_in_date).filter(Boolean)
  );
  const filteredPackageRows = packageRows
    .filter(r => !r.check_in_date || !standaloneCheckIns.has(r.check_in_date));

  return [
    ...(standaloneBookings || []).map(b => ({ ...b, _source: 'booking' })),
    ...filteredPackageRows,
  ].map(normalizeAccommodationRow);
};

// ── Packages ────────────────────────────────────────────────────────────────
// Packages are a *purchase* line — they show as one item priced at purchase price.
// The lessons consumed against them appear separately as `package`-paid lines.
const normalizePackage = (p, paidIndex = new Set()) => {
  const date = safeDate(p.createdAt || p.created_at || p.purchasedAt || p.purchase_date);
  const total = num(p.purchasePrice ?? p.purchase_price ?? p.price);
  const totalHours = num(p.totalHours ?? p.total_hours);
  const status = String(p.status || '').toLowerCase();

  // Trust the wallet ledger first — if there's a debit-direction transaction
  // tied to this package, the customer paid for it. Falling back to
  // payment_method only when no transaction evidence exists is too lenient:
  // packages can be created with a payment_method placeholder ('cash')
  // without any money actually changing hands, so we require evidence.
  const hasWalletEvidence = isEntityPaid(paidIndex, 'customer_package', p.id)
    || isEntityPaid(paidIndex, 'package', p.id);
  let billStatus = 'unpaid';
  if (status === 'cancelled' || status === 'expired') billStatus = 'cancelled';
  else if (hasWalletEvidence) billStatus = 'paid';

  const detailParts = [];
  if (totalHours > 0) detailParts.push(`${totalHours}h package`);
  const usedHours = num(p.usedHours ?? p.used_hours);
  const remHours = num(p.remainingHours ?? p.remaining_hours, Math.max(0, totalHours - usedHours));
  if (totalHours > 0) detailParts.push(`${remHours}h remaining`);

  return {
    id: `pkg-${p.id}`,
    category: 'packages',
    date,
    description: p.packageName || p.package_name || p.lessonServiceName || p.lesson_service_name || 'Package',
    detail: detailParts.join(' · ') || null,
    // For packages, Qty is the package's hour count rather than "1 row" — a
    // 6h package shows "6h", a 4h package "4h", etc. The math then reads
    // naturally: 6h × €40/h = €240. `qtyDisplay` overrides the numeric `qty`
    // wherever the UI/PDF renders the column; `qty` itself stays numeric so
    // any future arithmetic keeps working.
    qty: totalHours > 0 ? totalHours : 1,
    qtyDisplay: totalHours > 0 ? formatHoursLabel(totalHours) : null,
    unit: 'package',
    unitPrice: totalHours > 0 ? total / totalHours : null,
    amount: billStatus === 'cancelled' ? 0 : total,
    currency: p.currency || null,
    status: billStatus,
    paymentMethod: null,
    entityType: 'customer_package',
    entityId: p.id,
  };
};

export const normalizePackages = (packages = [], transactions = []) => {
  const paidIndex = buildPaidEntityIndex(transactions);
  return packages.map(p => normalizePackage(p, paidIndex));
};

// ── Shop orders ─────────────────────────────────────────────────────────────
// One line per order (not per item) to keep the bill scannable. The detail
// line lists the products inside.
const normalizeShopOrder = (o, paidIndex = new Set()) => {
  const date = safeDate(o.created_at);
  const total = num(o.total_amount);
  const status = String(o.status || '').toLowerCase();
  const paymentStatus = String(o.payment_status || '').toLowerCase();

  // Trust the wallet ledger over the row's payment_status — same rule as
  // bookings/rentals/packages, since the column can be stamped on creation
  // independent of whether money actually moved.
  const hasWalletEvidence = isEntityPaid(paidIndex, 'shop_order', o.id);
  let billStatus = 'unpaid';
  if (status === 'cancelled') billStatus = 'cancelled';
  else if (status === 'refunded' || paymentStatus === 'refunded') billStatus = 'refunded';
  else if (hasWalletEvidence) billStatus = 'paid';

  const items = Array.isArray(o.items) ? o.items : [];
  const itemCount = items.reduce((s, i) => s + num(i.quantity, 1), 0);
  const names = items.map(i => i.product_name).filter(Boolean);
  const summary = names.length === 0
    ? 'Shop order'
    : names.length <= 2
      ? names.join(', ')
      : `${names.slice(0, 2).join(', ')} +${names.length - 2}`;

  return {
    id: `shop-${o.id}`,
    category: 'shop',
    date,
    description: summary,
    detail: o.order_number ? `Order ${o.order_number} · ${itemCount} item${itemCount === 1 ? '' : 's'}` : `${itemCount} item${itemCount === 1 ? '' : 's'}`,
    qty: itemCount || 1,
    unit: 'item',
    unitPrice: itemCount > 0 ? total / itemCount : null,
    amount: billStatus === 'cancelled' ? 0 : total,
    currency: o.currency || null,
    status: billStatus,
    paymentMethod: o.payment_method || null,
    entityType: 'shop_order',
    entityId: o.id,
  };
};

export const normalizeShopOrders = (orders = [], transactions = []) => {
  const paidIndex = buildPaidEntityIndex(transactions);
  return orders.map(o => normalizeShopOrder(o, paidIndex));
};

// ── Memberships ─────────────────────────────────────────────────────────────
const normalizeMembership = (m, paidIndex = new Set()) => {
  const date = safeDate(m.purchased_at);
  const total = num(m.offering_price ?? m.price);
  const status = String(m.status || '').toLowerCase();
  const paymentStatus = String(m.payment_status || '').toLowerCase();

  // Trust the wallet ledger over m.payment_status — the member_purchases
  // table defaults payment_status to 'completed' on creation regardless of
  // whether money actually changed hands, which would otherwise inflate the
  // bill's "Payments received" total.
  const hasWalletEvidence = isEntityPaid(paidIndex, 'member_purchase', m.id);
  let billStatus = 'unpaid';
  if (paymentStatus === 'refunded') billStatus = 'refunded';
  else if (status === 'cancelled') billStatus = 'cancelled';
  else if (hasWalletEvidence) billStatus = 'paid';

  const expires = safeDate(m.expires_at);
  const detail = expires ? `Expires ${expires.toLocaleDateString()}` : (m.period || null);

  return {
    id: `member-${m.id}`,
    category: 'memberships',
    date,
    description: m.offering_name || m.name || 'Membership',
    detail,
    qty: 1,
    unit: 'membership',
    unitPrice: null,
    amount: billStatus === 'cancelled' ? 0 : total,
    currency: m.offering_currency || m.currency || null,
    status: billStatus,
    paymentMethod: null,
    entityType: 'member_purchase',
    entityId: m.id,
  };
};

export const normalizeMemberships = (memberships = [], transactions = []) => {
  const paidIndex = buildPaidEntityIndex(transactions);
  return memberships.map(m => normalizeMembership(m, paidIndex));
};

// ── Period filtering ────────────────────────────────────────────────────────
// `period` is `[startDate, endDate]` or `null` for "all time".
export const filterByPeriod = (items, period) => {
  if (!period || !period[0] || !period[1]) return items;
  const [start, end] = period;
  const startMs = +safeDate(start);
  // Make end inclusive of the whole day.
  const endDate = safeDate(end);
  const endMs = endDate ? endDate.getTime() + 86400000 - 1 : Number.MAX_SAFE_INTEGER;
  return items.filter(it => {
    if (!it.date) return false;
    const t = it.date.getTime();
    return t >= startMs && t <= endMs;
  });
};

// ── Totals ──────────────────────────────────────────────────────────────────
// Section subtotals reflect what the customer was *charged* in the period
// (excludes cancelled rows; package-funded rows are zero).
//
// `paymentsReceived` and `refundsIssued` are computed from the wallet
// transactions array, NOT from the line items. This avoids double-counting:
// a lesson + the wallet charge that paid for it would otherwise both contribute.
//
//   transactions of type 'payment' or direction 'credit' → paymentsReceived
//   transactions of type 'refund'                       → refundsIssued
//
// Multi-currency transactions are converted via the caller-supplied
// `convertToBase(amount, fromCurrency)` helper (from CurrencyContext).

const CATEGORY_ORDER = ['accommodation', 'lessons', 'supervision', 'rentals', 'packages', 'shop', 'memberships'];

export const computeTotals = (items, transactions, period, baseCurrency, convertToBase) => {
  const inPeriod = filterByPeriod(items, period);
  const conv = (amount, currency) => {
    if (!amount) return 0;
    if (!currency || currency === baseCurrency) return amount;
    if (typeof convertToBase === 'function') return convertToBase(amount, currency);
    return amount;
  };

  const subtotalsByCategory = {};
  for (const cat of CATEGORY_ORDER) subtotalsByCategory[cat] = 0;
  for (const item of inPeriod) {
    if (item.status === 'cancelled' || item.status === 'refunded') continue;
    if (item.status === 'package') continue; // already reflected in the package purchase line
    subtotalsByCategory[item.category] = (subtotalsByCategory[item.category] || 0)
      + conv(item.amount, item.currency || baseCurrency);
  }
  const subtotal = Object.values(subtotalsByCategory).reduce((s, v) => s + v, 0);

  // Filter transactions to the same period.
  const txInPeriod = (transactions || []).filter(t => {
    const d = safeDate(t.createdAt || t.created_at || t.transaction_date);
    if (!d) return false;
    if (!period || !period[0] || !period[1]) return true;
    const startMs = +safeDate(period[0]);
    const endMs = +safeDate(period[1]) + 86400000 - 1;
    return d >= startMs && d <= endMs;
  });

  // The per-line `payment_status` column is the canonical "did the customer
  // pay for this" flag. Sum every line item already marked paid — that IS the
  // money that has come in for items in this period, so the identity
  // `subtotal = paymentsReceived + balanceDue` holds and the per-row "Paid"
  // pill agrees with the totals block.
  //
  // Wallet transactions (deposits / top-ups) are layered on top: they only
  // contribute when they aren't already represented by a paid line item, so
  // a customer who pre-paid into the wallet without yet booking anything
  // still sees that credit reflected. Reversals, refund-back-to-wallet
  // credits, and discount-adjustment pairs remain internal motion.
  let paidLineTotal = 0;
  for (const item of inPeriod) {
    if (item.status === 'paid') {
      paidLineTotal += conv(item.amount, item.currency || baseCurrency);
    }
  }

  let grossDeposits = 0;
  let depositReversals = 0;

  for (const t of txInPeriod) {
    if (t.status && t.status !== 'completed') continue;
    const type = String(t.type || '').toLowerCase();
    const dir = String(t.direction || '').toLowerCase();
    const amt = Math.abs(num(t.amount));
    const currency = t.currency || baseCurrency;
    const converted = conv(amt, currency);
    const isReversal = type.includes('reversal');
    const isRefund = type.includes('refund');
    // Internal reconciliation entries: manual percentage discounts post a
    // credit + reversal pair (`discount_adjustment` / `discount_adjustment_reversal`),
    // package price edits post `package_price_adjustment` credits (price down)
    // or debits (price up), and soft-delete restores post `*_adjustment` entries.
    // None of these represent new money coming in — the affected line item's
    // amount already reflects the change — so counting them as payments would
    // double-count.
    const isInternalAdjustment = type.includes('adjustment');
    // Skip wallet credits that pay for line items we've already counted via
    // `paidLineTotal` — those are recorded against a specific entity (booking,
    // rental, package, etc.) and would double-count. Match either explicit
    // *_id columns or the generic relatedEntityType+id pair (the only field
    // populated for non-booking/non-rental entities).
    const tiedEntityType = String(t.entity_type || t.relatedEntityType || '').toLowerCase();
    const tiedEntityId = t.relatedEntityId ?? t.entity_id ?? null;
    const tiedToPaidLine = !!(t.booking_id || t.bookingId
      || t.rental_id || t.rentalId
      || t.accommodation_booking_id || t.accommodationBookingId
      || t.customer_package_id || t.customerPackageId
      || t.shop_order_id || t.shopOrderId
      || t.member_purchase_id || t.memberPurchaseId
      || (tiedEntityType && tiedEntityId));

    if (isInternalAdjustment) continue;

    if (dir === 'credit') {
      if (isReversal) continue;
      if (isRefund) continue;
      if (tiedToPaidLine) continue;
      grossDeposits += converted;
    } else if (dir === 'debit') {
      if (isReversal) depositReversals += converted;
    } else if (!dir) {
      if (type === 'payment' || type === 'deposit') grossDeposits += converted;
    }
  }

  const walletNet = Math.max(0, grossDeposits - depositReversals);
  const paymentsReceived = paidLineTotal + walletNet;
  // Refunds line is intentionally retired: the data layer can't reliably
  // distinguish real customer refunds from admin mistake-corrections, so any
  // number we'd put here would be wrong some of the time. Real refunds reduce
  // the customer's effective outstanding balance through the line items they
  // cancel (which already show as `cancelled` and contribute €0).
  const refundsIssued = 0;

  const balanceDue = subtotal - paymentsReceived + refundsIssued;

  return { subtotalsByCategory, subtotal, paymentsReceived, refundsIssued, balanceDue, periodItems: inPeriod };
};

// ── Discount application ────────────────────────────────────────────────────
// `discountsByEntity` is a Map keyed by `${entityType}:${entityId}`. For each
// item, if the map has a matching discount AND the item is a real charge
// (not status='package' / 'cancelled' — those are zero-amount lines), the
// item's `amount` is reduced and `originalAmount` / `discountAmount` /
// `discountPercent` / `discountId` are populated for display.
//
// Pass-through if no discounts. Pure: returns a new array of new objects.
export const applyDiscounts = (items, discountsByEntity) => {
  if (!discountsByEntity || (discountsByEntity.size ?? 0) === 0) {
    return items.map(it => ({ ...it, originalAmount: it.amount }));
  }
  return items.map(it => {
    const key = it.entityType && it.entityId != null ? `${it.entityType}:${it.entityId}` : null;
    const discount = key ? discountsByEntity.get(key) : null;
    if (!discount || it.status === 'cancelled' || it.status === 'package') {
      return { ...it, originalAmount: it.amount };
    }
    const discountAmount = num(discount.amount);
    const discounted = Math.max(0, it.amount - discountAmount);
    return {
      ...it,
      originalAmount: it.amount,
      amount: discounted,
      discountAmount,
      discountPercent: num(discount.percent),
      discountId: discount.id,
    };
  });
};

// ── Aggregator entry point ──────────────────────────────────────────────────
// Builds the full BillLineItem[] from raw datasets, sorted by date desc within
// each category. Cancelled rows kept (they show struck-through in the UI).
//
// `discountsByEntity` (optional) — Map<`${type}:${id}`, discountRow> applied
// to every matching line. See `applyDiscounts`.
export const buildBillItems = ({
  bookings = [],
  rentals = [],
  accommodationBookings = [],
  packages = [],
  shopOrders = [],
  memberships = [],
  instructors = [],
  transactions = [],
  discountsByEntity = null,
} = {}) => {
  // Build the paid-entity index once and share it across normalizers — each
  // per-category wrapper would otherwise rescan `transactions` independently.
  const paidIndex = buildPaidEntityIndex(transactions);
  const packagesById = new Map((packages || []).map(p => [p.id, p]));
  const items = [
    ...bookings.map(b => normalizeBooking(b, instructors, packagesById, paidIndex)),
    ...rentals.map(r => normalizeRental(r, paidIndex)),
    ...normalizeAccommodation(accommodationBookings, packages),
    ...packages.map(p => normalizePackage(p, paidIndex)),
    ...shopOrders.map(o => normalizeShopOrder(o, paidIndex)),
    ...memberships.map(m => normalizeMembership(m, paidIndex)),
  ].sort((a, b) => (b.date?.getTime() || 0) - (a.date?.getTime() || 0));
  return applyDiscounts(items, discountsByEntity);
};

// Convenience: builds a Map<`${entityType}:${entityId}`, discountRow> from
// the array shape returned by `GET /api/discounts`.
export const indexDiscounts = (discounts = []) => {
  const map = new Map();
  for (const d of discounts || []) {
    if (!d?.entity_type || d.entity_id == null) continue;
    map.set(`${d.entity_type}:${d.entity_id}`, d);
  }
  return map;
};

// Categories whose rows should be partitioned so individually-paid items sit
// at the top and package-funded items cluster beneath them. Lessons and
// supervision are the natural fits — staff want a clean read of what was
// paid out-of-pocket vs. what was drawn down from a package.
const PARTITION_BY_PAYMENT = new Set(['lessons', 'supervision']);

export const groupByCategory = (items) => {
  const groups = {};
  for (const cat of CATEGORY_ORDER) groups[cat] = [];
  for (const item of items) {
    if (!groups[item.category]) groups[item.category] = [];
    groups[item.category].push(item);
  }
  // Within partitioned categories: individual (non-package, non-cancelled)
  // first, then package, then cancelled — preserving the date-desc order
  // already established by `buildBillItems` inside each bucket.
  const rank = (it) => {
    if (it.status === 'cancelled') return 2;
    if (it.status === 'package') return 1;
    return 0;
  };
  for (const cat of PARTITION_BY_PAYMENT) {
    if (groups[cat]?.length > 1) {
      groups[cat].sort((a, b) => {
        const r = rank(a) - rank(b);
        if (r !== 0) return r;
        return (b.date?.getTime() || 0) - (a.date?.getTime() || 0);
      });
    }
  }
  return groups;
};

export const CATEGORY_DISPLAY_ORDER = CATEGORY_ORDER;

export const CATEGORY_LABELS = {
  accommodation: 'Accommodation',
  lessons: 'Lessons',
  supervision: 'Supervision',
  rentals: 'Rentals',
  packages: 'Packages',
  shop: 'Shop',
  memberships: 'Memberships',
};
