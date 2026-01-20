import { pool } from '../db.js';
import { resolveSettings, pickPaymentFee as pickFee } from './financialSettingsService.js';

async function getTotalInstructorEarnings(client, { dateStart, dateEnd, serviceType }) {
  try {
    // Get ALL instructor earnings from the database for the date range
    // This should include ALL earnings regardless of when bookings were created
    const { rows } = await client.query(`
      SELECT 
        COALESCE(SUM(ie.total_earnings), 0) as total_actual_earnings,
        COUNT(ie.id) as earnings_records_count,
        COUNT(DISTINCT ie.instructor_id) as unique_instructors
      FROM instructor_earnings ie
      WHERE ie.created_at >= $1 AND ie.created_at <= $2
    `, [dateStart, dateEnd + ' 23:59:59']);
    
    const actualEarnings = Number(rows[0]?.total_actual_earnings || 0);
    const recordsCount = Number(rows[0]?.earnings_records_count || 0);
    const uniqueInstructors = Number(rows[0]?.unique_instructors || 0);
    
    return {
      total: actualEarnings,
      method: recordsCount > 0 ? 'actual_earnings' : 'no_earnings_data',
      fallback_used: recordsCount === 0,
      records_count: recordsCount,
      unique_instructors: uniqueInstructors
    };
  } catch (error) {
    console.error('Error fetching total instructor earnings:', error);
    return {
      total: 0,
      method: 'error_fallback',
      fallback_used: true,
      records_count: 0,
      unique_instructors: 0
    };
  }
}

export async function computeCashNetRevenue({ dateStart, dateEnd, serviceType }) {
  const { PAYMENT_TYPES, SERVICE_TYPE_TO_PAYMENT_TYPES, REFUND_TYPES } = await import('../constants/transactions.js');
  const includeTypes = selectIncludeTypes({ PAYMENT_TYPES, SERVICE_TYPE_TO_PAYMENT_TYPES, serviceType });

  const client = await pool.connect();
  try {
    const txRows = await fetchTransactions(client, { dateStart, dateEnd, includeTypes });
    const refundsTotal = await fetchRefundsTotal(client, { dateStart, dateEnd, REFUND_TYPES });
    
    // Get actual instructor earnings for the period
    const totalInstructorEarnings = await getTotalInstructorEarnings(client, { dateStart, dateEnd, serviceType });
    
    const { bookingsMap, earningsMap, commissionsMap } = await buildLookups(client, txRows);
    const getSettings = makeSettingsCache(client);

    let totals = initTotals();
    for (const tx of txRows) {
      totals = await accumulateForTransaction({ tx, totals, bookingsMap, earningsMap, commissionsMap, getSettings, fallbackServiceType: serviceType, totalInstructorEarnings });
    }
    
    const items_count = txRows.length;
    // Use actual instructor earnings instead of calculated commission for net total
    const net_total = totals.gross_total - refundsTotal - (totalInstructorEarnings.total + totals.tax_total + totals.insurance_total + totals.equipment_total + totals.payment_fee_total);
    
    return { 
      ...totals, 
      instructor_earnings_total: totalInstructorEarnings.total,
      instructor_earnings_method: totalInstructorEarnings.method,
      instructor_earnings_records: totalInstructorEarnings.records_count,
      instructor_earnings_instructors: totalInstructorEarnings.unique_instructors,
      commission_total: totalInstructorEarnings.total, // Keep for UI compatibility
      fallback_used: totalInstructorEarnings.fallback_used,
      net_total, 
      items_count 
    };
  } finally {
    client.release();
  }
}

function selectIncludeTypes({ PAYMENT_TYPES, SERVICE_TYPE_TO_PAYMENT_TYPES, serviceType }) {
  return (serviceType && serviceType !== 'all')
    ? (SERVICE_TYPE_TO_PAYMENT_TYPES[serviceType] || PAYMENT_TYPES)
    : PAYMENT_TYPES;
}

async function fetchTransactions(client, { dateStart, dateEnd, includeTypes }) {
  const { rows } = await client.query(
    `SELECT id, amount, transaction_type AS type, payment_method, booking_id, rental_id, transaction_date
     FROM wallet_transactions
     WHERE transaction_date >= $1::date AND transaction_date <= $2::date
       AND transaction_type = ANY($3)
       AND status = 'completed'`,
    [dateStart, dateEnd, includeTypes]
  );
  return rows;
}

async function fetchRefundsTotal(client, { dateStart, dateEnd, REFUND_TYPES }) {
  const { rows } = await client.query(
    `SELECT COALESCE(SUM(amount),0) as total_refunds
     FROM wallet_transactions
     WHERE transaction_date >= $1::date AND transaction_date <= $2::date
       AND transaction_type = ANY($3)
       AND status = 'completed'`,
    [dateStart, dateEnd, REFUND_TYPES]
  );
  return Number(rows[0]?.total_refunds || 0);
}

async function buildLookups(client, txRows) {
  const bookingIds = Array.from(new Set(txRows.map(r => r.booking_id).filter(Boolean)));
  const bookingsMap = await buildBookingsMap(client, bookingIds);
  const earningsMap = await buildEarningsMap(client, bookingIds);
  const commissionsMap = await buildCommissionsMap(client, bookingIds);
  return { bookingsMap, earningsMap, commissionsMap };
}

function makeSettingsCache(client) {
  const cache = new Map();
  return async (ctx) => {
    const key = JSON.stringify(ctx);
    if (cache.has(key)) return cache.get(key);
    const s = await resolveSettings(ctx, client);
    cache.set(key, s);
    return s;
  };
}

function initTotals() {
  return { gross_total: 0, commission_total: 0, tax_total: 0, insurance_total: 0, equipment_total: 0, payment_fee_total: 0, fallback_used: false };
}

async function getDefaultCommissionRate(client) {
  try {
    // Get all instructors with their default commission rates and recent business volume
    const { rows } = await client.query(`
      WITH instructor_volumes AS (
        SELECT 
          b.instructor_user_id as instructor_id,
          idc.commission_value as default_rate,
          COALESCE(SUM(b.amount), 0) as total_volume,
          COUNT(b.id) as booking_count
        FROM instructor_default_commissions idc
        LEFT JOIN bookings b ON b.instructor_user_id = idc.instructor_id 
          AND b.created_at >= NOW() - INTERVAL '6 months'
        GROUP BY b.instructor_user_id, idc.commission_value
      )
      SELECT 
        instructor_id,
        default_rate,
        total_volume,
        booking_count,
        CASE 
          WHEN SUM(total_volume) OVER() = 0 THEN 1.0 / COUNT(*) OVER()
          ELSE total_volume / NULLIF(SUM(total_volume) OVER(), 0)
        END as weight
      FROM instructor_volumes
      WHERE default_rate IS NOT NULL
      ORDER BY total_volume DESC
    `);

    if (rows.length > 0) {
      // Calculate weighted average commission rate
      let weightedSum = 0;
      let totalWeight = 0;
      let hasConfiguredRates = false;
      
      for (const row of rows) {
        const rate = Number(row.default_rate) / 100;
        const weight = Number(row.weight);
        weightedSum += rate * weight;
        totalWeight += weight;
        hasConfiguredRates = true;
      }
      
      const weightedAverage = totalWeight > 0 ? weightedSum / totalWeight : weightedSum;
      
      return {
        rate: weightedAverage || 0.5,
        isConfigured: hasConfiguredRates,
        method: 'weighted_average',
        instructorCount: rows.length
      };
    } else {
      return {
        rate: 0.5,
        isConfigured: false,
        method: 'hardcoded_fallback',
        instructorCount: 0
      };
    }
  } catch (error) {
    console.error('Error fetching weighted commission rate:', error);
    return {
      rate: 0.5,
      isConfigured: false,
      method: 'error_fallback',
      instructorCount: 0
    };
  }
}

async function accumulateForTransaction({ tx, totals, bookingsMap, earningsMap, commissionsMap, getSettings, fallbackServiceType, totalInstructorEarnings }) {
  const gross = Number(tx.amount || 0);
  if (gross <= 0) return totals;
  const st = inferServiceType(tx, fallbackServiceType);
  const serviceId = tx.booking_id ? (bookingsMap[tx.booking_id]?.service_id || null) : null;
  const method = tx.payment_method || 'card';
  const settings = await getSettings({ serviceType: st, serviceId, paymentMethod: method });

  const taxRate = Number(settings?.tax_rate_pct || 0) / 100;
  const insRate = Number(settings?.insurance_rate_pct || 0) / 100;
  const eqRate = Number(settings?.equipment_rate_pct || 0) / 100;
  const fee = pickFee(settings?.payment_method_fees || {}, method);

  // Use actual instructor earnings from the database - 100% accurate, no calculations
  let commission = 0;
  if (st === 'lesson' && earningsMap[tx.booking_id] != null) {
    // Use actual recorded earnings for this specific booking
    commission = Number(earningsMap[tx.booking_id]);
  }
  // Note: For transactions without bookings, we rely on the total instructor earnings 
  // calculated separately in getTotalInstructorEarnings, so no individual commission is added here
  
  const tax = gross * taxRate;
  const insurance = gross * insRate;
  const equipment = gross * eqRate;
  const paymentFee = gross * (Number(fee.pct || 0) / 100) + Number(fee.fixed || 0);

  return {
    gross_total: totals.gross_total + gross,
    commission_total: totals.commission_total + commission,
    tax_total: totals.tax_total + tax,
    insurance_total: totals.insurance_total + insurance,
    equipment_total: totals.equipment_total + equipment,
    payment_fee_total: totals.payment_fee_total + paymentFee,
    fallback_used: totalInstructorEarnings.fallback_used
  };
}

async function buildBookingsMap(client, bookingIds) {
  if (!bookingIds.length) return {};
  const { rows } = await client.query(
    `SELECT id, service_id FROM bookings WHERE id = ANY($1)`,
    [bookingIds]
  );
  return rows.reduce((acc, r) => { acc[r.id] = r; return acc; }, {});
}

async function buildCommissionsMap(client, bookingIds) {
  if (!bookingIds.length) return {};
  try {
    // Get commission data for bookings with priority order:
    // 1. Booking-specific commissions
    // 2. Instructor-service specific commissions  
    // 3. Instructor default commissions
    const { rows } = await client.query(`
      SELECT DISTINCT
        b.id as booking_id,
        b.instructor_user_id as instructor_id,
        b.service_id,
        b.amount as booking_amount,
        b.duration,
        -- Priority 1: Booking-specific commission
        bcc.commission_type as booking_commission_type,
        bcc.commission_value as booking_commission_value,
        -- Priority 2: Instructor-service commission
        isc.commission_type as service_commission_type, 
        isc.commission_value as service_commission_value,
        -- Priority 3: Instructor default commission
        idc.commission_type as default_commission_type,
        idc.commission_value as default_commission_value
      FROM bookings b
      LEFT JOIN booking_custom_commissions bcc ON b.id = bcc.booking_id
      LEFT JOIN instructor_service_commissions isc ON b.instructor_user_id = isc.instructor_id AND b.service_id = isc.service_id
      LEFT JOIN instructor_default_commissions idc ON b.instructor_user_id = idc.instructor_id
      WHERE b.id = ANY($1)
    `, [bookingIds]);

    return rows.reduce((acc, r) => {
      // Determine which commission to use (priority order)
      let commissionType, commissionValue;
      if (r.booking_commission_type && r.booking_commission_value) {
        commissionType = r.booking_commission_type;
        commissionValue = r.booking_commission_value;
      } else if (r.service_commission_type && r.service_commission_value) {
        commissionType = r.service_commission_type; 
        commissionValue = r.service_commission_value;
      } else if (r.default_commission_type && r.default_commission_value) {
        commissionType = r.default_commission_type;
        commissionValue = r.default_commission_value;
      } else {
        // No commission rates configured, will use fallback
        commissionType = null;
        commissionValue = null;
      }

      acc[r.booking_id] = {
        commissionType,
        commissionValue,
        bookingAmount: Number(r.booking_amount || 0),
        duration: Number(r.duration || 1)
      };
      return acc;
    }, {});
  } catch (error) {
    console.error('Error building commissions map:', error);
    return {};
  }
}

function calculateCommissionAmount(commissionType, commissionValue, amount, duration) {
  if (!commissionType || commissionValue == null) return null;
  
  switch (commissionType) {
    case 'percentage':
      return (amount * Number(commissionValue)) / 100;
    case 'fixed':  // 'fixed' from UI is treated as fixed per hour (e.g., €20/hour * 0.5h = €10)
    case 'fixed_per_hour':
      return Number(commissionValue) * Number(duration);
    case 'fixed_per_lesson':
      return Number(commissionValue);
    default:
      return null;
  }
}

async function buildEarningsMap(client, bookingIds) {
  if (!bookingIds.length) return {};
  try {
    const { rows } = await client.query(
      `SELECT booking_id, total_earnings FROM instructor_earnings WHERE booking_id = ANY($1)`,
      [bookingIds]
    );
    return rows.reduce((acc, r) => { acc[r.booking_id] = Number(r.total_earnings || 0); return acc; }, {});
  } catch {
    return {};
  }
}

function inferServiceType(tx, fallback) {
  if (tx.type === 'service_payment' || tx.booking_id) return 'lesson';
  if (tx.type === 'rental_payment' || tx.rental_id) return 'rental';
  if (tx.type === 'accommodation_payment') return 'accommodation';
  return (fallback && fallback !== 'all') ? fallback : 'lesson';
}
