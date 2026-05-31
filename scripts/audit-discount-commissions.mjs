/**
 * audit-discount-commissions.mjs
 *
 * Read-only diagnostic. Finds every booking that (a) has an instructor_earnings
 * row and (b) is affected by a discount (on the booking itself or on its
 * customer_package), then compares the STORED commission against a recomputed
 * discount-aware value.
 *
 * It surfaces two distinct problems:
 *   1. STALE  — the stored commission was computed on the full pre-discount
 *               price. If the booking is payroll-locked the instructor was
 *               OVERPAID by (stored - correct).
 *   2. IGNORED — the package has a stored hourly rate (service_packages.
 *               package_hourly_rate). For those, BOTH the cascade and the
 *               fixed report pin the lesson value to hourly_rate * total_hours,
 *               so the package discount never reaches the commission at all.
 *               This is a behaviour question, not a stale row.
 *
 * Usage:
 *   node scripts/audit-discount-commissions.mjs          # read-only audit
 *   node scripts/audit-discount-commissions.mjs --fix    # also recompute STALE rows
 *
 * --fix recomputes every STALE instructor_earnings row through the same cascade
 * the discount UI uses (BookingUpdateCascadeService) — payroll-locked rows are
 * skipped automatically. Runs against whatever backend/.env points at.
 */
import { pool } from '../backend/db.js';
import { deriveLessonAmount, toNumber as num, partialLessonValue } from '../backend/utils/instructorEarnings.js';
import BookingUpdateCascadeService from '../backend/services/bookingUpdateCascadeService.js';

const FIX = process.argv.includes('--fix');

const round2 = (n) => Number.parseFloat((Number(n) || 0).toFixed(2));
const eur = (n) => `${round2(n).toFixed(2)}`;

// Faithful JS port of BookingUpdateCascadeService.computeLessonAmount — the
// logic that wrote the instructor_earnings rows. Uses raw (package-currency)
// prices, exactly like the cascade. `applyDiscount` toggles the package
// discount so we can compute the value with and without it.
function computeLessonAmount(row, { applyDiscount }) {
  const baseAmount = num(row.final_amount) || num(row.amount) || 0;
  const isPackage = row.customer_package_id
    && (row.payment_status === 'package' || row.payment_status === 'partial');

  if (!isPackage) {
    if (baseAmount > 0) return baseAmount;
    if (num(row.service_price) > 0) {
      const svcDur = num(row.service_duration) || 1;
      return round2((num(row.service_price) / svcDur) * (num(row.duration) || 1));
    }
    return baseAmount;
  }

  let basePrice = num(row.purchase_price);
  if (applyDiscount) basePrice = Math.max(0, basePrice - num(row.cp_discount));

  let effectivePackagePrice = basePrice;
  const storedHourlyRate = num(row.pkg_hourly_rate);
  const pkgTotalHours = num(row.package_total_hours) || num(row.sp_total_hours);
  if (storedHourlyRate > 0 && pkgTotalHours > 0) {
    // Hourly rate overrides the (discounted) price entirely.
    effectivePackagePrice = storedHourlyRate * pkgTotalHours;
  } else {
    const rentalDays = parseInt(row.sp_rental_days, 10) || 0;
    const accomNights = parseInt(row.sp_accommodation_nights, 10) || 0;
    const rentalCost = rentalDays > 0 && row.sp_rental_service_id
      ? rentalDays * num(row.rental_price) : 0;
    const accomCost = accomNights > 0 && row.sp_accommodation_unit_id
      ? accomNights * num(row.accom_price_per_night) : 0;
    const deductions = rentalCost + accomCost;
    if (deductions > 0) {
      const fullPrice = num(row.purchase_price);
      const ratio = fullPrice > 0 ? basePrice / fullPrice : 0;
      effectivePackagePrice = Math.max(0, effectivePackagePrice - deductions * ratio);
    }
  }

  const lessonAmount = deriveLessonAmount({
    paymentStatus: 'package',
    duration: num(row.duration),
    baseAmount: 0,
    packagePrice: effectivePackagePrice,
    packageTotalHours: num(row.package_total_hours) || num(row.sp_total_hours),
    packageRemainingHours: num(row.package_remaining_hours),
    packageUsedHours: num(row.package_used_hours),
    packageSessionsCount: num(row.sp_sessions_count),
    fallbackSessionDuration: (num(row.sp_total_hours) && num(row.sp_sessions_count)
      ? num(row.sp_total_hours) / num(row.sp_sessions_count) : null) || num(row.duration),
  });

  if (row.payment_status === 'partial' && baseAmount > 0) {
    // Mirror the cascade fix: value only the package-drawn hours + cash instead
    // of stacking the full cash on the full-duration package value.
    return partialLessonValue({
      packageValueFullDuration: lessonAmount,
      duration: num(row.duration),
      cashAmount: baseAmount,
    });
  }
  return lessonAmount;
}

// Mirror of computeBookingTotalAmount: group scaling + booking-level discount.
function computeTotal(row, { applyDiscount }) {
  let total = computeLessonAmount(row, { applyDiscount });
  const groupSize = Math.max(1, parseInt(row.group_size, 10) || 1);
  if (row.payment_status === 'package' && groupSize > 1) {
    total = round2(total * groupSize);
  }
  if (applyDiscount && num(row.booking_discount) > 0) {
    total = Math.max(0, round2(total - num(row.booking_discount)));
  }
  return total;
}

const SQL = `
  SELECT
    b.id                       AS booking_id,
    b.date                     AS booking_date,
    b.status                   AS booking_status,
    b.payment_status,
    b.duration,
    b.group_size,
    b.final_amount,
    b.amount,
    b.customer_package_id,
    COALESCE(ui.name, ui.first_name || ' ' || ui.last_name, '?') AS instructor_name,
    COALESCE(us.name, us.first_name || ' ' || us.last_name, '?') AS student_name,
    (us.self_student_of_instructor_id = b.instructor_user_id)    AS is_self_student,
    cp.purchase_price,
    cp.total_hours             AS package_total_hours,
    cp.remaining_hours         AS package_remaining_hours,
    cp.used_hours              AS package_used_hours,
    cp.currency                AS package_currency,
    sp.total_hours             AS sp_total_hours,
    sp.sessions_count          AS sp_sessions_count,
    sp.rental_days             AS sp_rental_days,
    sp.accommodation_nights    AS sp_accommodation_nights,
    sp.rental_service_id       AS sp_rental_service_id,
    sp.accommodation_unit_id   AS sp_accommodation_unit_id,
    sp.package_hourly_rate     AS pkg_hourly_rate,
    rental_srv.price           AS rental_price,
    accom_unit.price_per_night AS accom_price_per_night,
    srv.price                  AS service_price,
    srv.duration               AS service_duration,
    COALESCE(cpd.amt, 0)       AS cp_discount,
    COALESCE(bd.amt, 0)        AS booking_discount,
    cpd.pct                    AS cp_discount_pct,
    bd.pct                     AS booking_discount_pct,
    ie.total_earnings          AS stored_earnings,
    ie.lesson_amount           AS stored_lesson_amount,
    ie.base_rate               AS stored_base_rate,
    ie.lesson_duration         AS stored_duration,
    ie.payroll_id,
    -- Authoritative commission type, resolved from the config tables the same
    -- way getCommissionRate does (self-student > booking > service > category
    -- > default). Fixed-rate instructors are price-independent: a discount
    -- never changes their pay.
    COALESCE(
      CASE WHEN us.self_student_of_instructor_id = b.instructor_user_id THEN 'percentage' END,
      bcc.commission_type, isc.commission_type, icr.rate_type, idc.commission_type, 'fixed'
    )                          AS resolved_commission_type
  FROM bookings b
  JOIN instructor_earnings ie       ON ie.booking_id = b.id
  LEFT JOIN users ui                ON ui.id = b.instructor_user_id
  LEFT JOIN users us                ON us.id = b.student_user_id
  LEFT JOIN customer_packages cp    ON cp.id = b.customer_package_id
  LEFT JOIN service_packages sp     ON sp.id = cp.service_package_id
  LEFT JOIN services srv            ON srv.id = b.service_id
  LEFT JOIN services rental_srv     ON rental_srv.id = sp.rental_service_id
  LEFT JOIN accommodation_units accom_unit ON accom_unit.id = sp.accommodation_unit_id
  LEFT JOIN booking_custom_commissions bcc      ON bcc.booking_id = b.id
  LEFT JOIN instructor_service_commissions isc  ON isc.instructor_id = b.instructor_user_id
                                               AND isc.service_id = b.service_id
  LEFT JOIN instructor_category_rates icr       ON icr.instructor_id = b.instructor_user_id
    AND icr.lesson_category = CASE
      WHEN srv.lesson_category_tag = 'supervision' AND COALESCE(b.group_size, 1) > 1
        THEN 'semi-private-supervision'
      ELSE srv.lesson_category_tag
    END
  LEFT JOIN instructor_default_commissions idc  ON idc.instructor_id = b.instructor_user_id
  LEFT JOIN LATERAL (
    SELECT COALESCE(SUM(amount), 0) AS amt, MAX(percent) AS pct
      FROM discounts WHERE entity_type = 'customer_package' AND entity_id = cp.id::text
  ) cpd ON TRUE
  LEFT JOIN LATERAL (
    SELECT COALESCE(SUM(amount), 0) AS amt, MAX(percent) AS pct
      FROM discounts WHERE entity_type = 'booking' AND entity_id = b.id::text
  ) bd ON TRUE
  WHERE b.deleted_at IS NULL
    AND (COALESCE(cpd.amt, 0) > 0 OR COALESCE(bd.amt, 0) > 0)
  ORDER BY ui.name, b.date
`;

async function main() {
  if (!pool) {
    console.error('No DB pool — is backend/.env configured and the DB running?');
    process.exit(1);
  }

  const { rows } = await pool.query(SQL);

  if (!rows.length) {
    console.log('\nNo discounted bookings with instructor earnings found. Nothing to audit.\n');
    await pool.end();
    return;
  }

  const findings = [];
  for (const row of rows) {
    const storedEarnings = num(row.stored_earnings);
    // instructor_earnings.base_rate holds the commission VALUE: a percentage
    // (e.g. 45) for percentage commissions, or a €/hour rate for fixed ones.
    const baseRate = num(row.stored_base_rate);
    const storedLesson = num(row.stored_lesson_amount);
    const storedDuration = num(row.stored_duration) || num(row.duration) || 1;

    // Commission type comes straight from the config tables (resolved in SQL).
    // Fixed-rate instructors are paid rate * hours, so a discount cannot change
    // their earnings — only percentage commissions are discount-sensitive.
    const isFixed = row.resolved_commission_type === 'fixed';
    void baseRate; // retained in SELECT for reference / future use

    // Recompute the lesson total with and without the discount, using the same
    // logic the cascade used to write the row.
    const correctTotal = computeTotal(row, { applyDiscount: true });
    const fullTotal = computeTotal(row, { applyDiscount: false });

    // The discount's *retention ratio*: what fraction of the lesson value
    // survives the discount. We apply this ratio to the STORED earnings rather
    // than replacing them — that isolates the discount's effect and cancels out
    // any unrelated drift between the stored figure and a fresh recompute.
    const ratio = fullTotal > 0 ? correctTotal / fullTotal : 1;
    const discountGap = fullTotal - correctTotal; // lesson € the discount should remove

    const hourlyOverride = num(row.pkg_hourly_rate) > 0
      && (num(row.package_total_hours) || num(row.sp_total_hours)) > 0;

    // Does the stored lesson_amount already reflect the discount?
    const distFull = Math.abs(storedLesson - fullTotal);
    const distCorrect = Math.abs(storedLesson - correctTotal);

    let status; // fixed | ignored | applied | stale | indeterminate
    let expectedEarnings = storedEarnings;
    if (isFixed) {
      status = 'fixed'; // fixed €/hour — discount cannot affect it
    } else if (discountGap < 0.01) {
      // Discount exists but has no effect on the commission base.
      status = (hourlyOverride && num(row.cp_discount) > 0) ? 'ignored' : 'no-effect';
    } else if (distCorrect <= distFull) {
      status = 'applied'; // stored value already discount-aware
    } else if (distFull <= discountGap + Math.max(1, fullTotal * 0.02)) {
      // Stored lesson tracks the full price (within the discount gap + 2% slack).
      status = 'stale';
      expectedEarnings = round2(storedEarnings * ratio);
    } else {
      status = 'indeterminate'; // stored value drifted from both — needs eyeballing
    }

    findings.push({
      row, isFixed, status, storedEarnings, expectedEarnings,
      paid: !!row.payroll_id,
      delta: round2(storedEarnings - expectedEarnings),
      fullTotal, correctTotal, storedLesson,
    });
  }

  // ---- Report ----
  console.log(`\n=== Discount commission audit — ${rows.length} discounted booking(s) with earnings ===\n`);

  const STATUS_LABEL = {
    fixed: 'fixed-rate — discount N/A',
    ignored: 'DISCOUNT IGNORED (hourly-rate package)',
    'no-effect': 'discount has no effect on commission base',
    applied: 'ok — discount already applied',
    stale: 'STALE — commission on full price',
    indeterminate: 'INDETERMINATE — review manually',
  };

  let curInstructor = null;
  for (const f of findings) {
    const r = f.row;
    if (r.instructor_name !== curInstructor) {
      curInstructor = r.instructor_name;
      console.log(`\n■ ${curInstructor}`);
    }
    const disc = num(r.cp_discount) > 0
      ? `pkg -${eur(r.cp_discount)}` : `bkg -${eur(r.booking_discount)}`;
    const flag = f.status === 'stale'
      ? `  → should be ${eur(f.expectedEarnings)} (${f.paid ? 'OVERPAID' : 'will mispay'} ${eur(f.delta)})`
      : '';
    console.log(
      `  ${String(r.booking_date).slice(0, 10)}  ${r.student_name}` +
      `${r.is_self_student ? ' [self]' : ''}  (${r.booking_status})  ${disc}`
    );
    console.log(
      `    stored earn ${eur(f.storedEarnings)} | lesson stored ${eur(f.storedLesson)}` +
      ` vs recomputed full ${eur(f.fullTotal)} / discounted ${eur(f.correctTotal)}` +
      ` | ${f.paid ? 'PAID' : 'unpaid'}`
    );
    console.log(`    → ${STATUS_LABEL[f.status]}${flag}`);
  }

  // ---- Summary ----
  const by = (s) => findings.filter((f) => f.status === s);
  const stale = by('stale');
  const stalePaid = stale.filter((f) => f.paid);
  const staleUnpaid = stale.filter((f) => !f.paid);
  const sum = (arr) => round2(arr.reduce((s, f) => s + f.delta, 0));

  console.log('\n=== Summary ===');
  console.log(`  Discounted bookings with earnings  : ${findings.length}`);
  console.log(`  fixed-rate (discount N/A)          : ${by('fixed').length}`);
  console.log(`  ok — discount already applied      : ${by('applied').length}`);
  console.log(`  STALE + already paid (OVERPAID)    : ${stalePaid.length}  → total overpaid ${eur(sum(stalePaid))}`);
  console.log(`  STALE + unpaid (fix before payroll): ${staleUnpaid.length}  → total ${eur(sum(staleUnpaid))}`);
  console.log(`  DISCOUNT IGNORED (hourly-rate pkg) : ${by('ignored').length}`);
  console.log(`  indeterminate (manual review)      : ${by('indeterminate').length}`);
  if (by('ignored').length) {
    console.log('    └ For "ignored" rows the package discount never reaches the commission');
    console.log('      in EITHER the cascade or the report — a separate behaviour decision.');
  }
  console.log('');

  // ---- Fix mode ----
  if (FIX && stale.length) {
    console.log('=== --fix : recomputing STALE instructor_earnings rows ===\n');
    const fixedIds = [];
    for (const f of stale) {
      const r = f.row;
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        // updateInstructorEarnings (called by both paths) subtracts package AND
        // booking discounts, so either entry point fully corrects the row.
        const result = (num(r.cp_discount) > 0 && r.customer_package_id)
          ? await BookingUpdateCascadeService.recomputeEarningsForPackageBookings(client, r.customer_package_id)
          : await BookingUpdateCascadeService.recomputeInstructorEarningsForEntity(client, 'booking', r.booking_id);
        await client.query('COMMIT');
        fixedIds.push(r.booking_id);
        console.log(`  ✓ ${r.instructor_name} — ${r.student_name} ${String(r.booking_date).slice(0, 10)}`,
          JSON.stringify(result));
      } catch (e) {
        await client.query('ROLLBACK');
        console.error(`  ✗ ${r.instructor_name} — ${r.student_name}: ${e.message}`);
      } finally {
        client.release();
      }
    }

    // Re-read the affected rows to confirm the new stored values.
    if (fixedIds.length) {
      const { rows: after } = await pool.query(
        `SELECT ie.booking_id, ie.total_earnings, ie.lesson_amount,
                COALESCE(us.name, '?') AS student
           FROM instructor_earnings ie
           JOIN bookings b ON b.id = ie.booking_id
           LEFT JOIN users us ON us.id = b.student_user_id
          WHERE ie.booking_id = ANY($1::uuid[])`,
        [fixedIds]
      );
      console.log('\n  After recompute:');
      for (const a of after) {
        console.log(`    ${a.student}: lesson ${eur(a.lesson_amount)}  →  commission ${eur(a.total_earnings)}`);
      }
    }
    console.log('');
  } else if (FIX) {
    console.log('--fix: no STALE rows to recompute.\n');
  }

  await pool.end();
}

main().catch(async (err) => {
  console.error('Audit failed:', err);
  try { await pool?.end(); } catch { /* ignore */ }
  process.exit(1);
});
