import { pool } from '../db.js';
import { logger } from '../middlewares/errorHandler.js';
import { resolveAccrualSettings, pickPaymentFee as pickFee } from './financialSettingsService.js';

// Simple feature flag via env
const NET_REVENUE_ENABLED = process.env.NET_REVENUE_ENABLED === 'true';
const SNAPSHOT_CANARY_PCT = Math.max(0, Math.min(100, parseInt(process.env.SNAPSHOT_CANARY_PCT || '100')));

// Helper wrapper for fee selection
function pickPaymentFee(fees, method) {
  return pickFee(fees, method);
}

export async function writeLessonSnapshot(booking, _options = {}) {
  if (!NET_REVENUE_ENABLED) return { skipped: true, reason: 'flag_disabled' };

  // Canary sampling
  if (Math.random() * 100 > SNAPSHOT_CANARY_PCT) {
    return { skipped: true, reason: 'canary_skip' };
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

  const inferredMethod = booking.payment_method || (booking.payment_status === 'package' ? 'package' : (booking.payment_status === 'paid' ? 'card' : 'cash'));
  // Use accrual-specific settings for revenue snapshots
  const settings = await resolveAccrualSettings({ serviceType: 'lesson', serviceId: booking.service_id, paymentMethod: inferredMethod }, client);
    if (!settings) {
      await client.query('ROLLBACK');
      return { skipped: true, reason: 'no_settings' };
    }

    const gross = Number(booking.final_amount || booking.amount || 0);

    // Commission: use instructor_earnings if present; else 50% default
    let commissionAmount = 0;
    try {
      const er = await client.query(
        'SELECT total_earnings FROM instructor_earnings WHERE booking_id = $1 LIMIT 1',
        [booking.id]
      );
      commissionAmount = er.rows.length ? Number(er.rows[0].total_earnings || 0) : gross * 0.5;
    } catch {
      commissionAmount = gross * 0.5;
    }

    const tax = gross * (Number(settings.tax_rate_pct) / 100);
    const insurance = gross * (Number(settings.insurance_rate_pct) / 100);
    const equipment = gross * (Number(settings.equipment_rate_pct) / 100);

    // Payment fee: infer from booking.payment_status
  const paymentMethod = inferredMethod;
  const feeCfg = pickPaymentFee(settings.payment_method_fees, paymentMethod);
    const paymentFeeAmount = gross * (feeCfg.pct / 100) + (feeCfg.fixed || 0);

    const net = gross - (commissionAmount + tax + insurance + equipment + paymentFeeAmount);

    const payload = {
      entity_type: 'booking',
      entity_id: booking.id,
      service_type: 'lesson',
      service_id: booking.service_id || null,
      category_id: null,
      fulfillment_date: booking.date,
      currency: 'EUR',
      exchange_rate: null,
      gross_amount: gross,
      commission_amount: commissionAmount,
      tax_amount: tax,
      insurance_amount: insurance,
      equipment_amount: equipment,
      payment_method: paymentMethod,
      payment_fee_pct: feeCfg.pct,
      payment_fee_fixed: feeCfg.fixed,
      payment_fee_amount: paymentFeeAmount,
      custom_costs: {},
      net_amount: net,
      settings_version_id: settings.id,
      components: {}
    };

    await client.query(
      `INSERT INTO revenue_items (
        entity_type, entity_id, service_type, service_id, category_id, fulfillment_date,
        currency, exchange_rate, gross_amount, commission_amount, tax_amount, insurance_amount,
        equipment_amount, payment_method, payment_fee_pct, payment_fee_fixed, payment_fee_amount,
        custom_costs, net_amount, settings_version_id, components
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21
      )
      ON CONFLICT (entity_type, entity_id)
      DO UPDATE SET
        service_type = EXCLUDED.service_type,
        service_id = EXCLUDED.service_id,
        category_id = EXCLUDED.category_id,
        fulfillment_date = EXCLUDED.fulfillment_date,
        currency = EXCLUDED.currency,
        exchange_rate = EXCLUDED.exchange_rate,
        gross_amount = EXCLUDED.gross_amount,
        commission_amount = EXCLUDED.commission_amount,
        tax_amount = EXCLUDED.tax_amount,
        insurance_amount = EXCLUDED.insurance_amount,
        equipment_amount = EXCLUDED.equipment_amount,
        payment_method = EXCLUDED.payment_method,
        payment_fee_pct = EXCLUDED.payment_fee_pct,
        payment_fee_fixed = EXCLUDED.payment_fee_fixed,
        payment_fee_amount = EXCLUDED.payment_fee_amount,
        custom_costs = EXCLUDED.custom_costs,
        net_amount = EXCLUDED.net_amount,
        settings_version_id = EXCLUDED.settings_version_id,
        components = EXCLUDED.components,
        updated_at = NOW()
    `,
      [
        payload.entity_type,
        payload.entity_id,
        payload.service_type,
        payload.service_id,
        payload.category_id,
        payload.fulfillment_date,
        payload.currency,
        payload.exchange_rate,
        payload.gross_amount,
        payload.commission_amount,
        payload.tax_amount,
        payload.insurance_amount,
        payload.equipment_amount,
        payload.payment_method,
        payload.payment_fee_pct,
        payload.payment_fee_fixed,
        payload.payment_fee_amount,
        payload.custom_costs,
        payload.net_amount,
        payload.settings_version_id,
        payload.components
      ]
    );

    await client.query('COMMIT');
    logger.info('📈 Revenue snapshot written', { bookingId: booking.id, net: net.toFixed(2) });
    return { success: true, payload };
  } catch (err) {
    await client.query('ROLLBACK');
    logger.warn('Snapshot write failed (non-blocking):', err.message);
    return { success: false, error: err.message };
  } finally {
    client.release();
  }
}

export async function writeRentalSnapshot(rental) {
  if (!NET_REVENUE_ENABLED) return { skipped: true, reason: 'flag_disabled' };
  if (Math.random() * 100 > SNAPSHOT_CANARY_PCT) return { skipped: true, reason: 'canary_skip' };

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

  const paymentMethod = rental.payment_method || (rental.payment_status === 'paid' ? 'card' : 'cash');
    // Use accrual-specific settings for revenue snapshots
    const settings = await resolveAccrualSettings({ serviceType: 'rental', paymentMethod }, client);
    if (!settings) {
      await client.query('ROLLBACK');
      return { skipped: true, reason: 'no_settings' };
    }

    const gross = Number(rental.total_price || 0);
    // Rentals: no instructor commission by default
    const commissionAmount = 0;
    const tax = gross * (Number(settings.tax_rate_pct) / 100);
    const insurance = gross * (Number(settings.insurance_rate_pct) / 100);
    const equipment = gross * (Number(settings.equipment_rate_pct) / 100);
    const feeCfg = pickPaymentFee(settings.payment_method_fees, paymentMethod);
    const paymentFeeAmount = gross * (feeCfg.pct / 100) + (feeCfg.fixed || 0);
    const net = gross - (commissionAmount + tax + insurance + equipment + paymentFeeAmount);

    const payload = {
      entity_type: 'rental',
      entity_id: rental.id,
      service_type: 'rental',
      service_id: null,
      category_id: null,
      fulfillment_date: (rental.end_date || rental.rental_date || new Date()).toString().slice(0,10),
      currency: 'EUR',
      exchange_rate: null,
      gross_amount: gross,
      commission_amount: commissionAmount,
      tax_amount: tax,
      insurance_amount: insurance,
      equipment_amount: equipment,
      payment_method: paymentMethod,
      payment_fee_pct: feeCfg.pct,
      payment_fee_fixed: feeCfg.fixed,
      payment_fee_amount: paymentFeeAmount,
      custom_costs: {},
      net_amount: net,
      settings_version_id: settings.id,
      components: { equipment_ids: rental.equipment_ids || [] }
    };

    await client.query(
      `INSERT INTO revenue_items (
        entity_type, entity_id, service_type, service_id, category_id, fulfillment_date,
        currency, exchange_rate, gross_amount, commission_amount, tax_amount, insurance_amount,
        equipment_amount, payment_method, payment_fee_pct, payment_fee_fixed, payment_fee_amount,
        custom_costs, net_amount, settings_version_id, components
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21
      )
      ON CONFLICT (entity_type, entity_id)
      DO UPDATE SET
        service_type = EXCLUDED.service_type,
        service_id = EXCLUDED.service_id,
        category_id = EXCLUDED.category_id,
        fulfillment_date = EXCLUDED.fulfillment_date,
        currency = EXCLUDED.currency,
        exchange_rate = EXCLUDED.exchange_rate,
        gross_amount = EXCLUDED.gross_amount,
        commission_amount = EXCLUDED.commission_amount,
        tax_amount = EXCLUDED.tax_amount,
        insurance_amount = EXCLUDED.insurance_amount,
        equipment_amount = EXCLUDED.equipment_amount,
        payment_method = EXCLUDED.payment_method,
        payment_fee_pct = EXCLUDED.payment_fee_pct,
        payment_fee_fixed = EXCLUDED.payment_fee_fixed,
        payment_fee_amount = EXCLUDED.payment_fee_amount,
        custom_costs = EXCLUDED.custom_costs,
        net_amount = EXCLUDED.net_amount,
        settings_version_id = EXCLUDED.settings_version_id,
        components = EXCLUDED.components,
        updated_at = NOW()
    `,
      [
        payload.entity_type,
        payload.entity_id,
        payload.service_type,
        payload.service_id,
        payload.category_id,
        payload.fulfillment_date,
        payload.currency,
        payload.exchange_rate,
        payload.gross_amount,
        payload.commission_amount,
        payload.tax_amount,
        payload.insurance_amount,
        payload.equipment_amount,
        payload.payment_method,
        payload.payment_fee_pct,
        payload.payment_fee_fixed,
        payload.payment_fee_amount,
        payload.custom_costs,
        payload.net_amount,
        payload.settings_version_id,
        payload.components
      ]
    );

    await client.query('COMMIT');
    logger.info('📈 Rental revenue snapshot written', { rentalId: rental.id, net: net.toFixed(2) });
    return { success: true, payload };
  } catch (err) {
    await client.query('ROLLBACK');
    logger.warn('Rental snapshot write failed (non-blocking):', err.message);
    return { success: false, error: err.message };
  } finally {
    client.release();
  }
}

function _num(v) { return Number(v || 0); }

export async function writeAccommodationSnapshot(accommodation) {
  if (!NET_REVENUE_ENABLED) return { skipped: true, reason: 'flag_disabled' };
  if (Math.random() * 100 > SNAPSHOT_CANARY_PCT) return { skipped: true, reason: 'canary_skip' };

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const paymentMethod = accommodation.payment_method || 'card';
    // Use accrual-specific settings for revenue snapshots
    const settings = await resolveAccrualSettings({ serviceType: 'accommodation', paymentMethod }, client);
    if (!settings) {
      await client.query('ROLLBACK');
      return { skipped: true, reason: 'no_settings' };
    }

  const gross = _num(accommodation.total_price || accommodation.amount);
  const commissionAmount = 0; // default no instructor commission for accommodation
  const tax = gross * (_num(settings.tax_rate_pct) / 100);
  const insurance = gross * (_num(settings.insurance_rate_pct) / 100);
  const equipment = gross * (_num(settings.equipment_rate_pct) / 100);
    const feeCfg = pickPaymentFee(settings.payment_method_fees, paymentMethod);
    const paymentFeeAmount = gross * (feeCfg.pct / 100) + (feeCfg.fixed || 0);
    const net = gross - (commissionAmount + tax + insurance + equipment + paymentFeeAmount);

    const payload = {
      entity_type: 'accommodation',
      entity_id: accommodation.id,
      service_type: 'accommodation',
      service_id: accommodation.service_id || null,
      category_id: accommodation.category_id || null,
      fulfillment_date: accommodation.end_date || accommodation.start_date || new Date(),
      currency: 'EUR',
      exchange_rate: null,
      gross_amount: gross,
      commission_amount: commissionAmount,
      tax_amount: tax,
      insurance_amount: insurance,
      equipment_amount: equipment,
      payment_method: paymentMethod,
      payment_fee_pct: feeCfg.pct,
      payment_fee_fixed: feeCfg.fixed,
      payment_fee_amount: paymentFeeAmount,
      custom_costs: accommodation.custom_costs || {},
      net_amount: net,
      settings_version_id: settings.id,
      components: { guests: accommodation.guests || null, nights: accommodation.nights || null }
    };

    await client.query(
      `INSERT INTO revenue_items (
        entity_type, entity_id, service_type, service_id, category_id, fulfillment_date,
        currency, exchange_rate, gross_amount, commission_amount, tax_amount, insurance_amount,
        equipment_amount, payment_method, payment_fee_pct, payment_fee_fixed, payment_fee_amount,
        custom_costs, net_amount, settings_version_id, components
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21
      )
      ON CONFLICT (entity_type, entity_id)
      DO UPDATE SET
        service_type = EXCLUDED.service_type,
        service_id = EXCLUDED.service_id,
        category_id = EXCLUDED.category_id,
        fulfillment_date = EXCLUDED.fulfillment_date,
        currency = EXCLUDED.currency,
        exchange_rate = EXCLUDED.exchange_rate,
        gross_amount = EXCLUDED.gross_amount,
        commission_amount = EXCLUDED.commission_amount,
        tax_amount = EXCLUDED.tax_amount,
        insurance_amount = EXCLUDED.insurance_amount,
        equipment_amount = EXCLUDED.equipment_amount,
        payment_method = EXCLUDED.payment_method,
        payment_fee_pct = EXCLUDED.payment_fee_pct,
        payment_fee_fixed = EXCLUDED.payment_fee_fixed,
        payment_fee_amount = EXCLUDED.payment_fee_amount,
        custom_costs = EXCLUDED.custom_costs,
        net_amount = EXCLUDED.net_amount,
        settings_version_id = EXCLUDED.settings_version_id,
        components = EXCLUDED.components,
        updated_at = NOW()
    `,
      [
        payload.entity_type,
        payload.entity_id,
        payload.service_type,
        payload.service_id,
        payload.category_id,
        payload.fulfillment_date,
        payload.currency,
        payload.exchange_rate,
        payload.gross_amount,
        payload.commission_amount,
        payload.tax_amount,
        payload.insurance_amount,
        payload.equipment_amount,
        payload.payment_method,
        payload.payment_fee_pct,
        payload.payment_fee_fixed,
        payload.payment_fee_amount,
        payload.custom_costs,
        payload.net_amount,
        payload.settings_version_id,
        payload.components
      ]
    );

    await client.query('COMMIT');
    logger.info('🏨 Accommodation revenue snapshot written', { id: accommodation.id, net: net.toFixed(2) });
    return { success: true, payload };
  } catch (err) {
    await client.query('ROLLBACK');
    logger.warn('Accommodation snapshot write failed (non-blocking):', err.message);
    return { success: false, error: err.message };
  } finally {
    client.release();
  }
}
