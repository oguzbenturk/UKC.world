/**
 * Booking Update Cascade Service
 * Ensures data consistency when booking price or commission changes
 * All related financial data is properly updated
 */

import Decimal from 'decimal.js';
import { pool } from '../db.js';
import { logger } from '../middlewares/errorHandler.js';
import { writeLessonSnapshot } from './revenueSnapshotService.js';
import { deriveLessonAmount, partialLessonValue, deriveEffectivePackageHours } from '../utils/instructorEarnings.js';
import { getActiveDiscountAmount } from '../utils/discountAmounts.js';
import { recordTransaction as recordWalletTransaction } from './walletService.js';
import {
  TRANSACTION_TYPE,
  TX_DIRECTION,
  WALLET_ENTITY_TYPE,
  WALLET_TX_STATUS,
} from '../constants/transactions.js';

class BookingUpdateCascadeService {
  /**
   * Pre-fetch all package-level data needed by computeLessonAmount, so a
   * cascade that recomputes earnings for every booking on a package can
   * pass the same context in instead of re-querying per booking.
   */
  static async loadPackageContext(client, packageId) {
    if (!packageId) return null;
    const { rows } = await client.query(
      `SELECT cp.purchase_price, cp.total_hours, cp.remaining_hours, cp.used_hours,
              cp.service_package_id,
              sp.total_hours        AS sp_total_hours,
              sp.sessions_count     AS sp_sessions_count,
              sp.rental_service_id  AS sp_rental_service_id,
              sp.accommodation_unit_id AS sp_accommodation_unit_id,
              sp.rental_days        AS sp_rental_days,
              sp.accommodation_nights AS sp_accommodation_nights,
              sp.package_hourly_rate AS sp_package_hourly_rate,
              (SELECT COALESCE(SUM(amount), 0) FROM discounts
                 WHERE entity_type = 'customer_package' AND entity_id = cp.id::text) AS discount_amount,
              (SELECT price FROM services WHERE id = sp.rental_service_id) AS rental_price,
              (SELECT price_per_night FROM accommodation_units WHERE id = sp.accommodation_unit_id) AS accom_price_per_night
         FROM customer_packages cp
         LEFT JOIN service_packages sp ON sp.id = cp.service_package_id
        WHERE cp.id = $1`,
      [packageId]
    );
    if (!rows.length) return null;
    const r = rows[0];
    return {
      packageId,
      pkg: {
        purchase_price: r.purchase_price,
        total_hours: r.total_hours,
        remaining_hours: r.remaining_hours,
        used_hours: r.used_hours,
        service_package_id: r.service_package_id,
      },
      servicePackage: r.service_package_id ? {
        total_hours: r.sp_total_hours,
        sessions_count: r.sp_sessions_count,
        rental_service_id: r.sp_rental_service_id,
        accommodation_unit_id: r.sp_accommodation_unit_id,
        rental_days: r.sp_rental_days,
        accommodation_nights: r.sp_accommodation_nights,
        package_hourly_rate: r.sp_package_hourly_rate,
      } : null,
      discountAmount: r.discount_amount,
      rentalPrice: r.rental_price,
      accomPricePerNight: r.accom_price_per_night,
    };
  }

  /**
   * Lesson-only portion of a package's price (discount-adjusted, with combo
   * rental/accommodation cost removed). Single source of truth for both
   * computeLessonAmount and computeEffectivePackageHourlyRate.
   */
  static _deriveEffectivePackagePrice(ctx) {
    const { pkg, servicePackage, discountAmount, rentalPrice, accomPricePerNight } = ctx;

    // Treat any active per-package discount as effectively reducing the
    // purchase price for downstream commission math.
    let basePrice = new Decimal(pkg.purchase_price || 0);
    if (discountAmount != null) {
      basePrice = Decimal.max(new Decimal(0), basePrice.sub(new Decimal(discountAmount || 0)));
    }

    let effectivePackagePrice = basePrice;
    if (servicePackage) {
      const storedHourlyRate = new Decimal(servicePackage.package_hourly_rate || 0);
      const pkgTotalHours = new Decimal(pkg.total_hours || servicePackage.total_hours || 0);
      if (storedHourlyRate.gt(0) && pkgTotalHours.gt(0)) {
        // Stored per-hour lesson rate, scaled by the discount ratio so a package
        // discount still flows through (ratio = 1 with no discount).
        const fullPrice = new Decimal(pkg.purchase_price || 0);
        const ratio = fullPrice.gt(0) ? basePrice.div(fullPrice) : new Decimal(1);
        effectivePackagePrice = storedHourlyRate.mul(pkgTotalHours).mul(ratio);
      } else {
        const rentalDays = parseInt(servicePackage.rental_days) || 0;
        const accomNights = parseInt(servicePackage.accommodation_nights) || 0;
        const rentalCost = rentalDays > 0 && servicePackage.rental_service_id
          ? new Decimal(rentalDays).mul(new Decimal(rentalPrice || 0))
          : new Decimal(0);
        const accomCost = accomNights > 0 && servicePackage.accommodation_unit_id
          ? new Decimal(accomNights).mul(new Decimal(accomPricePerNight || 0))
          : new Decimal(0);
        const deductions = rentalCost.add(accomCost);
        if (deductions.gt(0)) {
          const fullPrice = new Decimal(pkg.purchase_price || 0);
          const ratio = fullPrice.gt(0) ? basePrice.div(fullPrice) : new Decimal(0);
          const scaledDeductions = deductions.mul(ratio);
          effectivePackagePrice = Decimal.max(new Decimal(0), effectivePackagePrice.sub(scaledDeductions));
        }
      }
    }
    return effectivePackagePrice;
  }

  /**
   * Effective lesson-only price PER HOUR for a package — the value frozen into
   * the spillover consumption ledger (rate_per_hour). Equals what one hour of
   * this package contributes to computeLessonAmount, so a spillover booking's
   * Σ(hours × rate) reproduces the legacy single-package valuation exactly when
   * only one package is involved.
   */
  static async computeEffectivePackageHourlyRate(client, packageId, pkgContext = null) {
    if (!packageId) return 0;
    const ctx = pkgContext && pkgContext.packageId === packageId
      ? pkgContext
      : await this.loadPackageContext(client, packageId);
    if (!ctx) return 0;
    const { pkg, servicePackage } = ctx;
    const effectivePackagePrice = this._deriveEffectivePackagePrice(ctx);
    const effectiveHours = deriveEffectivePackageHours({
      packageTotalHours: pkg.total_hours || servicePackage?.total_hours,
      packageRemainingHours: pkg.remaining_hours,
      packageUsedHours: pkg.used_hours,
      packageSessionsCount: servicePackage?.sessions_count,
      fallbackSessionDuration: (servicePackage?.total_hours && servicePackage?.sessions_count
        ? servicePackage.total_hours / servicePackage.sessions_count : null),
    });
    if (effectiveHours > 0) {
      return effectivePackagePrice.div(effectiveHours).toDecimalPlaces(4).toNumber();
    }
    return 0;
  }

  /**
   * Compute the effective lesson amount for a booking (package-aware).
   * `pkgContext` (optional) is the result of `loadPackageContext` for the
   * booking's customer_package — pass it when recomputing many bookings on
   * the same package to avoid re-querying invariant data per iteration.
   */
  static async computeLessonAmount(client, booking, pkgContext = null) {
    const baseAmount = new Decimal(booking.final_amount || booking.amount || 0);

    // For non-package bookings without a package reference, use the base amount (with service price fallback)
    if (!booking.customer_package_id || (booking.payment_status !== 'package' && booking.payment_status !== 'partial')) {
      if (baseAmount.gt(0)) return baseAmount.toNumber();
      // Fallback: derive from service price when booking has no amount
      if (booking.service_id) {
        try {
          const { rows: svcRows } = await client.query(
            'SELECT price, duration FROM services WHERE id = $1', [booking.service_id]
          );
          if (svcRows.length > 0) {
            const svcPrice = new Decimal(svcRows[0].price || 0);
            const svcDuration = new Decimal(svcRows[0].duration || 1);
            const bkgDuration = new Decimal(booking.duration || 1);
            if (svcPrice.gt(0)) return svcPrice.div(svcDuration).mul(bkgDuration).toDecimalPlaces(2).toNumber();
          }
        } catch { /* ignore */ }
      }
      return baseAmount.toNumber();
    }

    try {
      // ── Ledger-first (cross-package spillover) ──────────────────────────
      // A spillover booking records exact per-package draws in
      // booking_package_consumption with a FROZEN per-hour rate. Its realized
      // value = Σ(hours_i × rate_i) + the cash overflow leg. Legacy bookings
      // have no ledger rows and fall through to the single-package derivation.
      const participantId = booking._participantId || null;
      const { rows: ledger } = await client.query(
        `SELECT bpc.hours_used,
                COALESCE(bpc.rate_per_hour,
                         CASE WHEN cp.total_hours > 0 THEN cp.purchase_price / cp.total_hours ELSE 0 END) AS rate
           FROM booking_package_consumption bpc
           JOIN customer_packages cp ON cp.id = bpc.customer_package_id
          WHERE bpc.booking_id = $1 AND bpc.released_at IS NULL
            AND (($2::uuid IS NULL AND bpc.participant_id IS NULL) OR bpc.participant_id = $2)`,
        [booking.id, participantId]
      );
      if (ledger.length > 0) {
        let pkgValue = new Decimal(0);
        for (const r of ledger) {
          pkgValue = pkgValue.add(new Decimal(r.hours_used || 0).mul(new Decimal(r.rate || 0)));
        }
        // For a 'partial' spillover booking the package pool covered only some
        // hours; final_amount holds the cash leg for the overflow. Add it on top
        // (it's already priced at the cash rate — no double-count with pkgValue).
        const cashLeg = booking.payment_status === 'partial' ? baseAmount : new Decimal(0);
        return pkgValue.add(cashLeg).toDecimalPlaces(2).toNumber();
      }

      const ctx = pkgContext && pkgContext.packageId === booking.customer_package_id
        ? pkgContext
        : await this.loadPackageContext(client, booking.customer_package_id);

      if (!ctx) {
        logger.warn('[computeLessonAmount] Package not found: ' + booking.customer_package_id);
        return baseAmount.toNumber();
      }

      const { pkg, servicePackage } = ctx;

      // Lesson-only portion of the package price (discount-adjusted, rental/accom
      // deducted). Shared with computeEffectivePackageHourlyRate so the per-hour
      // rate frozen into the spillover ledger matches this valuation exactly.
      const effectivePackagePrice = BookingUpdateCascadeService._deriveEffectivePackagePrice(ctx);

      // For partial bookings, force package derivation (use paymentStatus 'package' and baseAmount 0
      // so deriveLessonAmount uses the package hourly rate, not the cash amount)
      const isPartial = booking.payment_status === 'partial';
      const lessonAmount = deriveLessonAmount({
        paymentStatus: 'package',
        duration: booking.duration,
        baseAmount: 0,
        packagePrice: effectivePackagePrice.toNumber(),
        packageTotalHours: pkg.total_hours || servicePackage?.total_hours,
        packageRemainingHours: pkg.remaining_hours,
        packageUsedHours: pkg.used_hours,
        packageSessionsCount: servicePackage?.sessions_count,
        fallbackSessionDuration: (servicePackage?.total_hours && servicePackage?.sessions_count ? servicePackage.total_hours / servicePackage.sessions_count : null) || booking.duration,
      });

      // For a 'partial' booking the package covers only SOME of the booked hours
      // and the rest is settled in cash. `lessonAmount` is the package-rate value
      // of the FULL duration; adding the whole cash on top double-counted the
      // cash-covered hour (it inflated both the manager commission base and any
      // percentage instructor's earnings). `partialLessonValue` attributes the
      // cash to the hours it pays for and values only the package-drawn hours at
      // the package rate.
      if (isPartial && baseAmount.gt(0)) {
        return partialLessonValue({
          packageValueFullDuration: lessonAmount,
          duration: booking.duration,
          cashAmount: baseAmount.toNumber(),
        });
      }

      return lessonAmount;
    } catch (error) {
      logger.warn('computeLessonAmount fallback due to error: ' + error?.message);
      return baseAmount.toNumber();
    }
  }

  /**
   * Compute the booking's total realized lesson value: per-person amount from
   * `computeLessonAmount`, scaled to total for group bookings, with any active
   * manual discount on the booking subtracted. This is THE single source of
   * truth used by both manager commission and instructor earnings paths so
   * they stay aligned no matter what discount changes.
   *
   * Per-booking discounts (entity-wide AND per-participant rows are summed by
   * `getActiveDiscountAmount`) apply at the BOOKING level — i.e. against the
   * group total — so we subtract after the group_size multiplication, never
   * before, to avoid scaling a participant's per-share discount up by group
   * size.
   */
  static async computeBookingTotalAmount(client, booking, pkgContext = null) {
    let total;

    // Multi-participant bookings: value each participant by THEIR OWN package
    // rate + their own cash, summed. The old code valued the whole group at the
    // PRIMARY participant's per-hour rate × group_size (ignoring that each
    // participant draws from a differently-priced package — G3) and, for partial
    // groups, fed one person's package value + the WHOLE group's cash into
    // partialLessonValue (whose single-person cash floor then swallowed the
    // package hours — P4). Per-participant valuation fixes both.
    const { rows: participants } = await client.query(
      `SELECT id, user_id, payment_status, payment_amount, customer_package_id,
              package_hours_used, cash_hours_used
         FROM booking_participants WHERE booking_id = $1`,
      [booking.id]
    );

    if (participants.length > 1) {
      let sum = new Decimal(0);
      for (const p of participants) {
        if (p.payment_status === 'refunded') continue;
        // Each participant attends the full booking duration but pays via their
        // own package / cash. Build a pseudo-booking and reuse computeLessonAmount
        // so package-rate, partial (partialLessonValue) and cash are all valued
        // exactly as they are for a single booking.
        const perParticipant = {
          id: booking.id,
          _participantId: p.id, // scopes the spillover ledger query to this participant
          duration: booking.duration,
          service_id: booking.service_id,
          currency: booking.currency,
          group_size: 1,
          customer_package_id: p.customer_package_id,
          payment_status: p.payment_status,
          final_amount: p.payment_amount,
          amount: p.payment_amount,
          package_hours_used: p.package_hours_used,
          cash_hours_used: p.cash_hours_used,
        };
        const v = await this.computeLessonAmount(client, perParticipant, null);
        sum = sum.add(new Decimal(v || 0));
      }
      total = sum.toDecimalPlaces(2).toNumber();
    } else {
      total = await this.computeLessonAmount(client, booking, pkgContext);
      const groupSize = Math.max(1, parseInt(booking.group_size) || 1);
      // Single-row "group" (group_size>1 but no participant rows): keep the
      // legacy package × group_size convention. 'partial' already had its cash
      // folded inside computeLessonAmount, so we don't multiply it.
      if (booking.payment_status === 'package' && groupSize > 1) {
        total = new Decimal(total).mul(groupSize).toDecimalPlaces(2).toNumber();
      }
    }

    const bookingDiscount = await getActiveDiscountAmount(client, WALLET_ENTITY_TYPE.BOOKING, booking.id);
    if (bookingDiscount > 0) {
      total = Math.max(0, new Decimal(total).sub(bookingDiscount).toDecimalPlaces(2).toNumber());
    }
    return total;
  }

  /**
   * Compute instructor earnings amount from commission settings
   */
  static computeInstructorEarnings(commissionType, commissionValue, lessonAmount, duration) {
    const dur = new Decimal(duration || 1);
    const commission = new Decimal(commissionValue);
    const lesson = new Decimal(lessonAmount);
    if (commissionType === 'percentage') return lesson.mul(commission).div(100).toDecimalPlaces(2).toNumber();
    // 'fixed' from UI is treated as fixed per hour (e.g., €20/hour * 0.5h = €10)
    if (commissionType === 'fixed' || commissionType === 'fixed_per_hour') return commission.mul(dur).toDecimalPlaces(2).toNumber();
    if (commissionType === 'fixed_per_lesson') return commission.toDecimalPlaces(2).toNumber();
    return 0;
  }
  
  /**
   * Handle all cascade updates when a booking is modified
   * @param {Object} booking - Updated booking data
   * @param {Object} changes - What fields were changed
   */
  static async cascadeBookingUpdate(booking, changes, options = {}) {
    // When `options.client` is supplied, run inside the caller's transaction so
    // the booking edit and ALL of its financial side-effects (discount rebase,
    // instructor earnings, manager commission, customer wallet settlement) commit
    // atomically — no split-brain, no fire-and-forget retry, no window where the
    // UI refetches pre-cascade values. In that mode `strict` defaults true so any
    // sub-step failure rolls the whole edit back instead of silently committing a
    // stale earnings/commission/discount row. Standalone callers (booking
    // creation, status patch) keep the legacy own-transaction + warn-and-continue
    // behaviour so a non-critical cascade hiccup never undoes an already-committed
    // booking.
    const externalClient = options.client || null;
    const client = externalClient || await pool.connect();
    const ownTxn = !externalClient;
    const strict = options.strict !== undefined ? options.strict : !ownTxn;

    try {
      if (ownTxn) await client.query('BEGIN');

      // Track what needs updating
      const needsFinancialUpdate = this.needsFinancialUpdate(changes);
      const needsCommissionUpdate = this.needsCommissionUpdate(changes);
      const needsEarningsCreation = this.needsEarningsCreation(changes);

      if (needsFinancialUpdate || needsCommissionUpdate || needsEarningsCreation) {
        // 0. Rebase any booking discount(s) against the NEW price BEFORE the
        // salary recompute, so both the manager commission and instructor
        // earnings read the corrected post-edit discount. Covers ALL bookings
        // (package / group / multi-participant) — previously the rebase sat
        // inside updateCustomerBalance behind early-returns, so those edits left
        // a stale discount that both salaries subtracted (H8/H9/F7).
        if (changes.final_amount !== undefined || changes.amount !== undefined || changes.duration !== undefined) {
          // Duration is included because for package/partial bookings the lesson
          // value is duration-derived — a duration-only edit changes the base a
          // percentage discount must rebase against, which both salaries then read.
          try {
            const { recomputeBookingDiscountsForPriceEdit } = await import('./discountService.js');
            await recomputeBookingDiscountsForPriceEdit(client, { booking, createdBy: booking.updated_by || null });
          } catch (discErr) {
            // In strict (in-transaction) mode a stale discount must not be
            // committed alongside salaries computed from it — fail the edit.
            if (strict) throw discErr;
            logger.warn('Booking discount rebase during cascade failed', { bookingId: booking.id, error: discErr.message });
          }
        }

  // log: updating instructor earnings
        // 1. Update instructor earnings (or create if booking just completed)
        await this.updateInstructorEarnings(client, booking);

        // 1b. Keep the manager commission snapshot in lockstep with the booking's
        // current price/duration. Historically this cascade only refreshed
        // instructor earnings, so a later price/duration edit never reached
        // manager_commissions.source_amount — the manager salary kept showing the
        // value frozen at booking completion. Mirror the earnings recompute here.
        // Dynamic import avoids a static cycle (managerCommissionService imports
        // this module). The recompute no-ops cleanly for paid-out / missing rows.
        try {
          const { recomputeManagerCommissionForEntity } = await import('./managerCommissionService.js');
          await recomputeManagerCommissionForEntity(client, WALLET_ENTITY_TYPE.BOOKING, booking.id);
        } catch (mcErr) {
          if (strict) throw mcErr;
          logger.warn('Manager commission recompute during booking cascade failed', {
            bookingId: booking.id, error: mcErr.message,
          });
        }

        // 2. Update revenue snapshots
        await this.updateRevenueSnapshots(client, booking);
        
        // 3. Update customer balance (if price changed)
        if (changes.final_amount !== undefined || changes.amount !== undefined) {
          await this.updateCustomerBalance(client, booking, changes);
        }
        
        // 4. Keep a package booking's displayed price (final_amount) in lockstep
        // with its lesson value when the DURATION changes — e.g. a 2h package
        // lesson checked out at 1.5h. The reconcile updates package hours but
        // leaves final_amount stale; without this the row keeps showing the 2h
        // price. No wallet movement — package bookings are paid in hours
        // (updateCustomerBalance skips payment_status='package'). Works for
        // legacy single-package AND spillover (computeLessonAmount is ledger-first).
        // NOTE: the legacy updatePackageCalculations() call was removed — it only
        // INSERTed into a non-existent `package_usage_log` table, and that failed
        // query silently poisoned the surrounding transaction.
        if (booking.payment_status === 'package' && booking.customer_package_id
            && (changes.duration !== undefined || changes.final_amount !== undefined)) {
          await this.syncBookingFinalAmountFromPackage(client, booking);
        }
        
        // 5. Invalidate cached analytics
        await this.invalidateAnalyticsCache(booking);
        
  // log: cascade update completed
      } else {
  // log: no cascade updates needed
      }
      
      if (ownTxn) await client.query('COMMIT');

    } catch (error) {
      // Only roll back a transaction we own; when running inside the caller's
      // transaction, re-throw and let the caller's catch ROLLBACK the whole edit.
      if (ownTxn) await client.query('ROLLBACK');
  logger.error('Cascade update failed', error);
      throw error;
    } finally {
      if (ownTxn) client.release();
    }
  }

  /**
   * Check if changes require financial updates
   */
  static needsFinancialUpdate(changes) {
    return changes.final_amount !== undefined || 
           changes.amount !== undefined || 
           changes.duration !== undefined ||
           changes.instructor_user_id !== undefined;
  }

  /**
   * Check if booking status changed to completed (earnings should be created)
   */
  static needsEarningsCreation(changes) {
    const COMPLETED_STATUSES = ['completed', 'done', 'checked_out'];
    const previousStatus = changes._previous?.status?.toLowerCase();
    const newStatus = changes.status?.toLowerCase();
    
    // Trigger earnings creation when transitioning TO a completed status
    return newStatus && 
           COMPLETED_STATUSES.includes(newStatus) && 
           !COMPLETED_STATUSES.includes(previousStatus || '');
  }
  
  /**
   * Check if changes require commission updates
   */
  static needsCommissionUpdate(changes) {
    return changes.instructor_commission !== undefined ||
           changes.instructor_user_id !== undefined ||
           changes.service_id !== undefined ||
           changes._custom_commission_changed; // Added flag for custom commission changes
  }
  
  /**
   * Update instructor earnings based on booking changes.
   * `pkgContext` is forwarded to computeLessonAmount when present.
   */
  static async updateInstructorEarnings(client, booking, pkgContext = null) {
    // A soft-deleted booking must never (re-)gain an earnings snapshot — the
    // delete flow just removed it, and re-creating it here resurrects the
    // orphan rows the 2026-06-10 cleanup purged.
    if (booking.deleted_at) {
      return { skipped: 'deleted_booking' };
    }

    // A cancelled / no-show / declined booking must NOT carry instructor
    // earnings. Without this, a status→cancelled edit that ALSO changes
    // duration/amount re-created a non-zero earnings row (computeLessonAmount
    // never checked status, S4). Drop the unpaid snapshot and stop.
    const CANCELLED_EARNING_STATUSES = ['cancelled', 'canceled', 'no_show', 'no-show', 'noshow', 'declined', 'rejected'];
    if (CANCELLED_EARNING_STATUSES.includes(String(booking.status || '').toLowerCase().trim())) {
      await client.query(
        `DELETE FROM instructor_earnings WHERE booking_id = $1 AND payroll_id IS NULL`,
        [booking.id]
      );
      return { skipped: 'cancelled_status' };
    }

    // Get current earnings record (need payroll_id to enforce immutable history)
    const existingEarnings = await client.query(
      'SELECT id, payroll_id, lesson_amount, total_earnings FROM instructor_earnings WHERE booking_id = $1',
      [booking.id]
    );

    if (existingEarnings.rows.length === 0) {
      const created = await this.createInstructorEarnings(client, booking, pkgContext);
      return created
        ? { created: true, lessonAmount: created.lesson_amount, totalEarnings: created.total_earnings }
        : { skipped: 'no_instructor_or_zero_amount' };
    }

    // Once an earnings row has been included in a payroll run we treat it as
    // immutable history — paying out then changing the underlying number
    // would leave the instructor over- or under-paid relative to what was
    // settled. Skip silently rather than throwing so cascades don't fail.
    if (existingEarnings.rows[0].payroll_id) {
      return { skipped: 'paid_out' };
    }

    const oldLessonAmount = Number(existingEarnings.rows[0].lesson_amount) || 0;
    const oldTotalEarnings = Number(existingEarnings.rows[0].total_earnings) || 0;

    // Recalculate commission. computeBookingTotalAmount returns the post-
    // discount, group-scaled total — same number used by manager commission.
    const { commissionType, commissionValue } = await this.getCommissionRate(client, booking);
    const lessonAmount = await this.computeBookingTotalAmount(client, booking, pkgContext);
    const instructorEarnings = this.computeInstructorEarnings(commissionType, commissionValue, lessonAmount, booking.duration);
    const bookingCurrency = booking.currency || 'EUR';

    // C1: when a booking is reassigned to a different instructor, re-point the
    // earnings row to the NEW instructor. Historically only the amount was
    // recomputed (from the new instructor's rate) while instructor_id stayed on
    // the OLD instructor — so payroll credited the wrong person. COALESCE keeps
    // the existing instructor_id when the booking has no instructor set (removal
    // is handled elsewhere), so a transient null never wipes the credit.
    const { rows } = await client.query(`
      UPDATE instructor_earnings
      SET commission_rate = $1,
          total_earnings  = $2,
          lesson_amount   = $3,
          lesson_duration = $4,
          currency        = $5,
          instructor_id   = COALESCE($7, instructor_id),
          updated_at      = NOW()
      WHERE booking_id = $6 AND payroll_id IS NULL
      RETURNING lesson_amount, total_earnings
    `, [
      commissionValue / 100,
      instructorEarnings,
      lessonAmount,
      booking.duration || 1,
      bookingCurrency,
      booking.id,
      booking.instructor_user_id || null,
    ]);

    return {
      updated: rows.length > 0,
      oldLessonAmount,
      oldTotalEarnings,
      lessonAmount: rows[0] ? Number(rows[0].lesson_amount) : oldLessonAmount,
      totalEarnings: rows[0] ? Number(rows[0].total_earnings) : oldTotalEarnings,
    };
  }
  
  /**
   * Create new instructor earnings record
   */
  static async createInstructorEarnings(client, booking, pkgContext = null) {
    if (!booking.instructor_user_id) return null;

    const { commissionType, commissionValue } = await this.getCommissionRate(client, booking);
    // Use the same total-amount helper as updates so creation and recompute
    // stay in lockstep. Includes group_size scaling AND active booking
    // discounts (entity-wide + per-participant).
    const lessonAmount = await this.computeBookingTotalAmount(client, booking, pkgContext);
    const instructorEarnings = this.computeInstructorEarnings(commissionType, commissionValue, lessonAmount, booking.duration);
    const bookingCurrency = booking.currency || 'EUR';

    if (lessonAmount <= 0) return null;

    const { rows } = await client.query(`
      INSERT INTO instructor_earnings
        (instructor_id, booking_id, base_rate, commission_rate, total_earnings, lesson_amount, lesson_date, lesson_duration, currency)
      VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7, CURRENT_DATE), $8, $9)
      RETURNING lesson_amount, total_earnings
    `, [
      booking.instructor_user_id,
      booking.id,
      commissionValue,
      commissionValue / 100,
      instructorEarnings,
      lessonAmount,
      booking.date,
      booking.duration || 1,
      bookingCurrency,
    ]);
    return rows[0] || null;
  }
  
  /**
   * Get commission rate for booking
   */
  static async getCommissionRate(client, booking) {
    let commissionType = 'percentage';
    // L2: an instructor with NO commission config earns €0 (require an explicit
    // config). This matches the live read paths (instructorFinanceService /
    // dashboardSummaryService), which already default to 0 — the snapshot writer
    // previously defaulted to 50%, so the two disagreed. Verified safe: no current
    // instructor relies on this fallback (all have a config). An unconfigured
    // instructor surfaces as €0 so an admin knows to set their commission.
    let commissionValue = 0; // Default fallback — no config ⇒ €0 (set a commission)

    // 0. Self-student override: if the student is personally linked to THIS instructor,
    //    use the instructor's configured self-student commission (default 45%).
    if (booking.student_user_id && booking.instructor_user_id) {
      const selfStudent = await client.query(
        `SELECT u.self_student_of_instructor_id,
                COALESCE(idc.self_student_commission_rate, 45) AS rate
           FROM users u
           LEFT JOIN instructor_default_commissions idc
                  ON idc.instructor_id = $2
          WHERE u.id = $1`,
        [booking.student_user_id, booking.instructor_user_id]
      );
      const row = selfStudent.rows[0];
      if (row && row.self_student_of_instructor_id === booking.instructor_user_id) {
        return {
          commissionType: 'percentage',
          commissionValue: new Decimal(row.rate).toNumber(),
        };
      }
    }

    // 1. Check for booking-specific custom commission first (this is the primary source)
    const customCommission = await client.query(
      'SELECT commission_type, commission_value FROM booking_custom_commissions WHERE booking_id = $1',
      [booking.id]
    );
    
    if (customCommission.rows.length > 0) {
      commissionType = customCommission.rows[0].commission_type;
      commissionValue = new Decimal(customCommission.rows[0].commission_value).toNumber();
    } else {
      // 2. Check for service-specific commission
      const serviceCommission = await client.query(
        'SELECT commission_type, commission_value FROM instructor_service_commissions WHERE instructor_id = $1 AND service_id = $2',
        [booking.instructor_user_id, booking.service_id]
      );

      if (serviceCommission.rows.length > 0) {
        commissionType = serviceCommission.rows[0].commission_type;
        commissionValue = new Decimal(serviceCommission.rows[0].commission_value).toNumber();
      } else {
        // 3. Check for lesson-category-level rate
        let foundCategoryRate = false;
        if (booking.service_id) {
          const groupSize = Math.max(1, Number(booking.group_size) || 1);
          const categoryRate = await client.query(
            `SELECT icr.rate_type, icr.rate_value
             FROM instructor_category_rates icr
             JOIN services s ON icr.lesson_category = (
               CASE
                 WHEN s.lesson_category_tag = 'supervision' AND $3::int > 1
                   THEN 'semi-private-supervision'
                 ELSE s.lesson_category_tag
               END
             )
             WHERE icr.instructor_id = $1 AND s.id = $2`,
            [booking.instructor_user_id, booking.service_id, groupSize]
          );
          if (categoryRate.rows.length > 0) {
            commissionType = categoryRate.rows[0].rate_type;
            commissionValue = new Decimal(categoryRate.rows[0].rate_value).toNumber();
            foundCategoryRate = true;
          }
        }

        if (!foundCategoryRate) {
          // 4. Fallback to default commission
          const defaultCommission = await client.query(
            'SELECT commission_type, commission_value FROM instructor_default_commissions WHERE instructor_id = $1',
            [booking.instructor_user_id]
          );

          if (defaultCommission.rows.length > 0) {
            commissionType = defaultCommission.rows[0].commission_type;
            commissionValue = new Decimal(defaultCommission.rows[0].commission_value).toNumber();
          }
        }
      }
    }
    
    return { commissionType, commissionValue };
  }
  
  /**
   * Refresh `bookings.final_amount` for a single package booking from the
   * current package state. Used by package-level cascades so that displays
   * (which read final_amount as the lesson value) stay in sync after a
   * package price edit or a customer_package discount change.
   *
   * Only touches package-paid bookings — non-package bookings are owned by
   * their own update flows. Skips silently when there's no instructor_user_id
   * or when the computed value is unchanged. Returns true if a write happened.
   */
  static async syncBookingFinalAmountFromPackage(client, booking, pkgContext = null) {
    if (!booking?.customer_package_id || booking?.payment_status !== 'package') return false;
    const newAmount = await this.computeLessonAmount(client, booking, pkgContext);
    const current = Number(booking.final_amount);
    if (Number.isFinite(current) && Math.abs(current - newAmount) < 0.005) return false;
    await client.query(
      `UPDATE bookings
          SET final_amount = $1,
              amount       = COALESCE($1, amount),
              updated_at   = NOW()
        WHERE id = $2`,
      [newAmount, booking.id]
    );
    return true;
  }

  /**
   * Recompute instructor_earnings snapshot rows for every completed booking
   * tied to a customer package. Called after the package's purchase_price is
   * edited or its discount changes so per-lesson lesson_amount + total_earnings
   * track the new per-hour value.
   *
   * Also refreshes each booking's `final_amount` so the displayed lesson
   * value stays in sync — without this, package-price edits left every
   * affected booking row showing the snapshot from creation time, which is
   * what staff were seeing in the customer-detail "Lesson History" tab and
   * any other surface that reads `final_amount` (display_amount in /bookings,
   * cashPortion math, etc.).
   *
   * Fixed-rate (and fixed_per_lesson) instructors are unaffected because
   * computeInstructorEarnings keys their earnings off duration, not lesson
   * amount — so even though we re-run, total_earnings stays the same for them.
   *
   * Returns { updated: number, skipped: number, finalAmountUpdated: number }.
   */
  static async recomputeEarningsForPackageBookings(client, packageId) {
    const summary = { updated: 0, skipped: 0, skippedPaidOut: 0, finalAmountUpdated: 0 };
    const pkgContext = await this.loadPackageContext(client, packageId);

    // Refresh final_amount for ALL non-deleted package bookings (not just
    // completed ones). Earnings cascade still only touches completed bookings
    // with an instructor — historical behaviour preserved.
    const { rows: allPkgBookings } = await client.query(
      `SELECT b.*
         FROM bookings b
        WHERE b.customer_package_id = $1
          AND b.deleted_at IS NULL
          AND b.payment_status = 'package'`,
      [packageId]
    );
    for (const booking of allPkgBookings) {
      try {
        const wrote = await this.syncBookingFinalAmountFromPackage(client, booking, pkgContext);
        if (wrote) summary.finalAmountUpdated += 1;
      } catch (err) {
        logger.warn('Failed to sync booking final_amount from package', {
          packageId, bookingId: booking.id, error: err.message
        });
      }
    }

    const { rows: bookings } = await client.query(
      `SELECT b.*
         FROM bookings b
        WHERE b.customer_package_id = $1
          AND b.deleted_at IS NULL
          AND LOWER(TRIM(COALESCE(b.status, ''))) IN ('completed', 'done', 'checked_out')
          AND b.instructor_user_id IS NOT NULL`,
      [packageId]
    );

    for (const booking of bookings) {
      try {
        // Pre-check payroll_id so we count paid-out skips explicitly. The
        // updateInstructorEarnings call also gates on payroll_id, so this
        // pre-check is purely for accurate summary reporting.
        const { rows: er } = await client.query(
          `SELECT payroll_id FROM instructor_earnings WHERE booking_id = $1`,
          [booking.id]
        );
        if (er[0]?.payroll_id) {
          summary.skippedPaidOut += 1;
          continue;
        }
        await this.updateInstructorEarnings(client, booking, pkgContext);
        summary.updated += 1;
      } catch (err) {
        summary.skipped += 1;
        logger.warn('Failed to recompute earnings for package booking', {
          packageId, bookingId: booking.id, error: err.message
        });
      }
    }

    return summary;
  }

  /**
   * Re-derive lesson_amount + total_earnings for a SINGLE booking after its
   * own discount changes. Mirrors `recomputeEarningsForPackageBookings` but
   * scoped to one entity, so the booking-level discount cascade has an
   * instructor-earnings counterpart to call.
   *
   * Only meaningful for entityType='booking' (rentals don't have instructor
   * earnings). Skips silently when:
   *   - entityType isn't 'booking'
   *   - booking row missing or soft-deleted
   *   - booking has no instructor
   *   - earnings row doesn't exist
   *   - earnings row already paid out (payroll_id IS NOT NULL)
   *
   * Runs inside the caller's transaction.
   */
  static async recomputeInstructorEarningsForEntity(client, entityType, entityId) {
    if (entityType !== WALLET_ENTITY_TYPE.BOOKING) return { skipped: 'unsupported_entity_type' };
    const { rows } = await client.query(
      `SELECT b.* FROM bookings b WHERE b.id = $1::uuid AND b.deleted_at IS NULL`,
      [String(entityId)]
    );
    if (!rows.length) return { skipped: 'booking_not_found' };
    const booking = rows[0];
    if (!booking.instructor_user_id) return { skipped: 'no_instructor' };

    const { rows: erows } = await client.query(
      `SELECT id, payroll_id FROM instructor_earnings WHERE booking_id = $1`,
      [booking.id]
    );
    if (!erows.length) return { skipped: 'no_earnings_row' };
    if (erows[0].payroll_id) return { skipped: 'paid_out' };

    try {
      await this.updateInstructorEarnings(client, booking);
      return { updated: true, earningsId: erows[0].id };
    } catch (err) {
      logger.warn('Failed to recompute instructor earnings for booking', {
        bookingId: booking.id, error: err.message,
      });
      return { skipped: 'error', error: err.message };
    }
  }

  /**
   * Update revenue snapshots
   */
  static async updateRevenueSnapshots(_client, _booking) {
  // Skipping revenue snapshot update due to UUID/integer schema mismatch
  // TODO: Fix revenue_items.entity_id to use UUID instead of integer
  // The revenue_items table expects integer entity_id but bookings use UUID
  return { skipped: true, reason: 'schema_mismatch' };
  }
  
  /**
   * Update customer balance when booking price changes
   */
  static async updateCustomerBalance(client, booking, changes) {
    if (!booking.student_user_id) return;

    // A cancelled booking's money is owned by the cancellation cleanup
    // (refundBookingNetChargesPerUser), which already refunds the full net
    // charge. If a single edit BOTH cancels and changes the price, posting a
    // price-delta adjustment here on top of the full refund would over-credit
    // the customer — so never settle a price delta on a cancelled booking.
    if ((booking.status || '').toLowerCase() === 'cancelled') return;

    try {
      const oldAmount = new Decimal(changes._previous?.final_amount || changes._previous?.amount || 0);
      const newAmount = new Decimal(booking.final_amount || booking.amount || 0);
      const amountDifference = newAmount.sub(oldAmount);

      if (amountDifference.abs().gt(0.01)) {
        // Multi-participant bookings: the per-head share fan-out in
        // routes/bookings.js (`Price decrease/increase reconciliation for
        // shared booking`) already settles each participant's wallet. Posting
        // a second whole-booking adjustment here would double-credit the
        // primary participant for the entire delta.
        const { rows: pcRows } = await client.query(
          `SELECT COUNT(*)::int AS n FROM booking_participants WHERE booking_id = $1`,
          [booking.id]
        );
        if ((pcRows[0]?.n || 0) > 1) {
          return;
        }

        // Decide whether THIS path settles the cash delta:
        //  • If the duration changed on a booking that was package/partial BEFORE
        //    the edit, the synchronous reconcile path
        //    (reconcilePackageHoursOnDurationChange) already recomputed and
        //    settled the cash leg — even if it flipped the booking to 'paid' /
        //    'package'. Posting again here would double-count, so skip.
        //  • Package bookings move no cash on a price edit (paid in hours).
        //  • Everything else — a plain cash 'paid' booking, OR a price-ONLY edit
        //    on a 'partial' booking — is settled here (this is the gap that left
        //    partial price edits unsettled before).
        const durationChangedThisEdit = changes.duration !== undefined;
        const wasPackageOrPartial =
          changes._previousPaymentStatus === 'package' || changes._previousPaymentStatus === 'partial';
        const reconcileOwnsSettlement = durationChangedThisEdit && wasPackageOrPartial;
        if (!reconcileOwnsSettlement && booking.payment_status !== 'package') {
          // Single source of truth is the wallet ledger — the legacy raw
          // `users.balance` write + `transactions` insert were removed (they
          // double-credited against the wallet store; H16 / dual-ledger drift).
          // Mirror the price edit into the wallet ledger so the Financial
          // History view (which reads wallet_transactions) shows the new
          // price instead of the original booking_charge. Skips when the
          // booking was paid outside the wallet (cash / gateway) so we
          // don't post a phantom credit/debit.
          const { rows: chargeRows } = await client.query(
            `SELECT 1 FROM wallet_transactions
              WHERE booking_id = $1
                AND transaction_type IN ('booking_charge', 'charge')
                AND status = 'completed'
                AND amount < 0
              LIMIT 1`,
            [booking.id]
          );
          if (chargeRows.length) {
            const isCredit = amountDifference.lt(0);
            const absAmount = amountDifference.abs().toDecimalPlaces(2).toNumber();
            await recordWalletTransaction({
              client,
              userId: booking.student_user_id,
              amount: isCredit ? absAmount : -absAmount,
              availableDelta: isCredit ? absAmount : -absAmount,
              transactionType: TRANSACTION_TYPE.BOOKING_CHARGE_ADJUSTMENT,
              status: WALLET_TX_STATUS.COMPLETED,
              direction: isCredit ? TX_DIRECTION.CREDIT : TX_DIRECTION.DEBIT,
              currency: booking.currency || 'EUR',
              description: isCredit
                ? `Booking price reduced: €${absAmount}`
                : `Booking price increased: €${absAmount}`,
              entityType: WALLET_ENTITY_TYPE.BOOKING,
              relatedEntityType: WALLET_ENTITY_TYPE.BOOKING,
              relatedEntityId: booking.id,
              bookingId: booking.id,
              metadata: {
                bookingId: booking.id,
                oldAmount: oldAmount.toNumber(),
                newAmount: newAmount.toNumber(),
                delta: amountDifference.toNumber(),
              },
              allowNegative: true,
            });
          }

          // NOTE: discount rebasing moved to step 0 of cascadeBookingUpdate
          // (recomputeBookingDiscountsForPriceEdit), which runs for ALL bookings
          // before the salary recompute and handles entity-wide AND per-
          // participant rows. Doing it here too would double-post the wallet
          // discount credit, so it is intentionally not repeated.
        }
      }
      
    } catch (error) {
      throw error;
    }
  }
  
  /**
   * Update package calculations when price changes
   */
  static async updatePackageCalculations(client, booking, changes) {
    if (!booking.customer_package_id) return;
    
    try {
      // For package bookings, we may need to recalculate per-hour value
      const packageResult = await client.query(
        'SELECT * FROM customer_packages WHERE id = $1',
        [booking.customer_package_id]
      );
      
      if (packageResult.rows.length > 0) {
        const packageData = packageResult.rows[0];
        
        // Log the change for audit purposes
        await client.query(`
          INSERT INTO package_usage_log (package_id, booking_id, action, details, created_at)
          VALUES ($1, $2, $3, $4, NOW())
        `, [
          booking.customer_package_id,
          booking.id,
          'price_adjustment',
          JSON.stringify({
            old_amount: changes._previous?.final_amount || changes._previous?.amount,
            new_amount: booking.final_amount || booking.amount,
            package_name: packageData.package_name
          })
        ]);
      }
      
    } catch (error) {
      // Don't throw - this is non-critical
    }
  }
  
  /**
   * Invalidate cached analytics and trigger refresh
   */
  static async invalidateAnalyticsCache(_booking) {
    try {
      // In a production system, you'd invalidate Redis cache here
      // Could trigger background job to refresh analytics
      // await scheduleAnalyticsRefresh(['instructor_earnings', 'revenue_analytics', 'customer_analytics']);
      
    } catch (error) {
      // Don't throw - this is non-critical
    }
  }
}

export default BookingUpdateCascadeService;
