import { pool } from '../db.js';
import { logger } from '../middlewares/errorHandler.js';

const COMPLETED_BOOKING_STATUSES = ['completed', 'done', 'checked_out'];
const COMPLETED_RENTAL_STATUSES = ['completed', 'returned', 'closed', 'active', 'done'];
const COMPLETED_ACCOMMODATION_STATUSES = ['completed', 'checked_out', 'closed', 'active', 'confirmed'];

const SERVICE_TYPES = ['booking', 'rental', 'accommodation'];

const NEGATIVE_STATUSES = new Set([
  'cancelled',
  'canceled',
  'refunded',
  'pending_refund',
  'void',
  'voided',
  'chargeback',
  'disputed',
  'no_show',
  'deleted'
]);

const STATUS_NORMALIZATION_REGEX = /[^a-z0-9]+/g;

const normalizeStatusValue = (value) => {
  if (!value) {
    return '';
  }
  return String(value).trim().toLowerCase().replace(STATUS_NORMALIZATION_REGEX, '_');
};

const NORMALIZED_BOOKING_STATUSES = COMPLETED_BOOKING_STATUSES.map(normalizeStatusValue);
const NORMALIZED_RENTAL_STATUSES = COMPLETED_RENTAL_STATUSES.map(normalizeStatusValue);
const NORMALIZED_ACCOMMODATION_STATUSES = COMPLETED_ACCOMMODATION_STATUSES.map(normalizeStatusValue);

export const LEDGER_COMPLETED_BOOKING_STATUSES = NORMALIZED_BOOKING_STATUSES;
export const LEDGER_NEGATIVE_STATUSES = Array.from(NEGATIVE_STATUSES);

const BOOKING_STATUS_SQL = `regexp_replace(LOWER(TRIM(b.status)), '[^a-z0-9]+', '_', 'g')`;
const RENTAL_STATUS_SQL = `regexp_replace(LOWER(TRIM(r.status)), '[^a-z0-9]+', '_', 'g')`;
const ACCOMMODATION_STATUS_SQL = `regexp_replace(LOWER(TRIM(ab.status)), '[^a-z0-9]+', '_', 'g')`;

const DEFAULT_START_DATE = '1900-01-01';
const DEFAULT_END_DATE = '2100-01-01';

function toNumber(value) {
  if (value === null || value === undefined) {
    return 0;
  }
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

async function withClient(client, task) {
  let activeClient = client;
  let shouldRelease = false;

  if (!activeClient) {
    activeClient = await pool.connect();
    shouldRelease = true;
  }

  try {
    return await task(activeClient);
  } finally {
    if (shouldRelease) {
      activeClient.release();
    }
  }
}

async function ensureLedgerTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS service_revenue_ledger (
      id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
      entity_type text NOT NULL,
      entity_id uuid NOT NULL,
      service_type text NOT NULL,
      service_subtype text,
      service_id uuid,
      customer_id uuid,
      amount numeric(12,2) NOT NULL CHECK (amount >= 0),
      currency varchar(3) NOT NULL DEFAULT 'EUR',
      occurred_at timestamptz NOT NULL,
      status text NOT NULL,
      metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
      instructor_commission_amount numeric(12,2) NOT NULL DEFAULT 0,
      instructor_commission_type text,
      instructor_commission_value numeric(12,2),
      instructor_commission_source text,
      recorded_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (entity_type, entity_id)
    );
  `);

  await client.query('CREATE INDEX IF NOT EXISTS idx_service_revenue_ledger_range ON service_revenue_ledger (occurred_at)');
  await client.query('CREATE INDEX IF NOT EXISTS idx_service_revenue_ledger_type ON service_revenue_ledger (service_type)');
  await client.query('CREATE INDEX IF NOT EXISTS idx_service_revenue_ledger_status ON service_revenue_ledger (status)');

  await client.query(`
    ALTER TABLE service_revenue_ledger
      ADD COLUMN IF NOT EXISTS instructor_commission_amount numeric(12,2) NOT NULL DEFAULT 0
  `);

  await client.query(`
    ALTER TABLE service_revenue_ledger
      ADD COLUMN IF NOT EXISTS instructor_commission_type text
  `);

  await client.query(`
    ALTER TABLE service_revenue_ledger
      ADD COLUMN IF NOT EXISTS instructor_commission_value numeric(12,2)
  `);

  await client.query(`
    ALTER TABLE service_revenue_ledger
      ADD COLUMN IF NOT EXISTS instructor_commission_source text
  `);
}

async function clearLedgerRange(client, dateStart, dateEnd) {
  await client.query(
    `DELETE FROM service_revenue_ledger
      WHERE entity_type = ANY($3::text[])
        AND occurred_at::date BETWEEN $1::date AND $2::date`,
    [dateStart, dateEnd, SERVICE_TYPES]
  );
}

async function upsertBookings(client, dateStart, dateEnd) {
  const params = [dateStart, dateEnd, NORMALIZED_BOOKING_STATUSES];
  await client.query(
    `WITH booking_data AS (
        SELECT
          b.id AS entity_id,
          s.category AS service_subtype,
          b.service_id,
          COALESCE(b.student_user_id, b.customer_user_id) AS customer_id,
          COALESCE(
            NULLIF(b.final_amount, 0),
            NULLIF(b.amount, 0),
            COALESCE(inst.hourly_rate, 0) * COALESCE(b.duration, 0),
            0
          ) AS calculated_amount,
          COALESCE(b.currency, 'EUR') AS currency,
          COALESCE(b.checkout_time, b.date::timestamptz) AS occurred_at,
          ${BOOKING_STATUS_SQL} AS normalized_status,
          jsonb_strip_nulls(jsonb_build_object(
            'payment_status', b.payment_status,
            'instructor_id', b.instructor_user_id,
            'instructor_hourly_rate', inst.hourly_rate,
            'service_name', s.name,
            'start_hour', b.start_hour,
            'duration', b.duration
          )) AS base_metadata,
          b.duration,
          inst.hourly_rate,
          b.payment_status,
          b.instructor_user_id,
          b.amount,
          b.final_amount,
          s.name AS service_name,
          b.start_hour,
          b.date,
          COALESCE(
            NULLIF(b.final_amount, 0),
            NULLIF(b.amount, 0),
            COALESCE(inst.hourly_rate, 0) * COALESCE(b.duration, 0),
            0
          ) AS revenue_amount,
          CASE
            WHEN bcc.commission_type IS NOT NULL THEN bcc.commission_type
            WHEN isc.commission_type IS NOT NULL THEN isc.commission_type
            WHEN idc.commission_type IS NOT NULL THEN idc.commission_type
            ELSE NULL
          END AS commission_type,
          CASE
            WHEN bcc.commission_type IS NOT NULL THEN bcc.commission_value
            WHEN isc.commission_type IS NOT NULL THEN isc.commission_value
            WHEN idc.commission_type IS NOT NULL THEN idc.commission_value
            ELSE NULL
          END AS commission_value,
          CASE
            WHEN bcc.commission_type IS NOT NULL THEN 'booking'
            WHEN isc.commission_type IS NOT NULL THEN 'service'
            WHEN idc.commission_type IS NOT NULL THEN 'default'
            ELSE NULL
          END AS commission_source,
          ROUND(
            CASE
              WHEN bcc.commission_type IS NOT NULL THEN
                CASE bcc.commission_type
                  WHEN 'percentage' THEN COALESCE(
                    NULLIF(b.final_amount, 0),
                    NULLIF(b.amount, 0),
                    COALESCE(inst.hourly_rate, 0) * COALESCE(b.duration, 0),
                    0
                  ) * bcc.commission_value / 100
                  WHEN 'fixed_per_lesson' THEN bcc.commission_value
                  WHEN 'fixed_per_hour' THEN COALESCE(NULLIF(b.duration, 0), 1) * bcc.commission_value
                  ELSE 0
                END
              WHEN isc.commission_type IS NOT NULL THEN
                CASE isc.commission_type
                  WHEN 'percentage' THEN COALESCE(
                    NULLIF(b.final_amount, 0),
                    NULLIF(b.amount, 0),
                    COALESCE(inst.hourly_rate, 0) * COALESCE(b.duration, 0),
                    0
                  ) * isc.commission_value / 100
                  WHEN 'fixed_per_lesson' THEN isc.commission_value
                  WHEN 'fixed_per_hour' THEN COALESCE(NULLIF(b.duration, 0), 1) * isc.commission_value
                  ELSE 0
                END
              WHEN idc.commission_type IS NOT NULL THEN
                CASE idc.commission_type
                  WHEN 'percentage' THEN COALESCE(
                    NULLIF(b.final_amount, 0),
                    NULLIF(b.amount, 0),
                    COALESCE(inst.hourly_rate, 0) * COALESCE(b.duration, 0),
                    0
                  ) * idc.commission_value / 100
                  WHEN 'fixed_per_lesson' THEN idc.commission_value
                  WHEN 'fixed_per_hour' THEN COALESCE(NULLIF(b.duration, 0), 1) * idc.commission_value
                  ELSE 0
                END
              ELSE 0
            END
          , 2) AS commission_amount
        FROM bookings b
        LEFT JOIN services s ON s.id = b.service_id
        LEFT JOIN users inst ON inst.id = b.instructor_user_id
        LEFT JOIN booking_custom_commissions bcc ON b.id = bcc.booking_id
        LEFT JOIN instructor_service_commissions isc ON b.instructor_user_id = isc.instructor_id AND b.service_id = isc.service_id
        LEFT JOIN instructor_default_commissions idc ON b.instructor_user_id = idc.instructor_id
        WHERE b.deleted_at IS NULL
          AND b.date BETWEEN $1::date AND $2::date
      )
      INSERT INTO service_revenue_ledger (
        entity_type,
        entity_id,
        service_type,
        service_subtype,
        service_id,
        customer_id,
        amount,
        currency,
        occurred_at,
        status,
        metadata,
        instructor_commission_amount,
        instructor_commission_type,
        instructor_commission_value,
        instructor_commission_source,
        updated_at
      )
      SELECT
        'booking' AS entity_type,
        bd.entity_id,
        'lesson' AS service_type,
        bd.service_subtype,
        bd.service_id,
        bd.customer_id,
        bd.calculated_amount AS amount,
        bd.currency,
        bd.occurred_at,
        bd.normalized_status AS status,
        jsonb_strip_nulls(
          COALESCE(bd.base_metadata, '{}'::jsonb) || jsonb_build_object(
            'commission_type', bd.commission_type,
            'commission_value', bd.commission_value,
            'commission_source', bd.commission_source,
            'commission_amount', bd.commission_amount
          )
        ) AS metadata,
        bd.commission_amount,
        bd.commission_type,
        bd.commission_value,
        bd.commission_source,
        NOW()
      FROM booking_data bd
      WHERE bd.normalized_status = ANY($3::text[])
        AND bd.calculated_amount > 0
      ON CONFLICT (entity_type, entity_id)
      DO UPDATE SET
        service_type = EXCLUDED.service_type,
        service_subtype = EXCLUDED.service_subtype,
        service_id = EXCLUDED.service_id,
        customer_id = EXCLUDED.customer_id,
        amount = EXCLUDED.amount,
        currency = EXCLUDED.currency,
        occurred_at = EXCLUDED.occurred_at,
        status = EXCLUDED.status,
        metadata = COALESCE(service_revenue_ledger.metadata, '{}'::jsonb) || COALESCE(EXCLUDED.metadata, '{}'::jsonb),
        instructor_commission_amount = EXCLUDED.instructor_commission_amount,
        instructor_commission_type = EXCLUDED.instructor_commission_type,
        instructor_commission_value = EXCLUDED.instructor_commission_value,
        instructor_commission_source = EXCLUDED.instructor_commission_source,
        updated_at = NOW();
    `,
    params
  );
}

async function upsertRentals(client, dateStart, dateEnd) {
  const params = [dateStart, dateEnd, NORMALIZED_RENTAL_STATUSES];
  await client.query(
    `INSERT INTO service_revenue_ledger (
        entity_type,
        entity_id,
        service_type,
        service_id,
        customer_id,
        amount,
        currency,
        occurred_at,
        status,
        metadata,
        updated_at
      )
      SELECT
        'rental' AS entity_type,
        r.id AS entity_id,
        'rental' AS service_type,
        NULL::uuid AS service_id,
        r.user_id AS customer_id,
        COALESCE(r.total_price, 0) AS amount,
        'EUR' AS currency,
        COALESCE(r.updated_at, r.end_date, r.start_date, r.rental_date::timestamptz) AS occurred_at,
        ${RENTAL_STATUS_SQL} AS status,
        jsonb_strip_nulls(jsonb_build_object(
          'payment_status', r.payment_status,
          'equipment_ids', r.equipment_ids,
          'rental_date', r.rental_date
        )) AS metadata,
        NOW()
      FROM rentals r
      WHERE ${RENTAL_STATUS_SQL} = ANY($3::text[])
        AND COALESCE(r.total_price, 0) > 0
        AND COALESCE(r.end_date, r.start_date, r.rental_date::timestamptz)::date BETWEEN $1::date AND $2::date
      ON CONFLICT (entity_type, entity_id)
      DO UPDATE SET
        service_type = EXCLUDED.service_type,
        customer_id = EXCLUDED.customer_id,
        amount = EXCLUDED.amount,
        currency = EXCLUDED.currency,
        occurred_at = EXCLUDED.occurred_at,
        status = EXCLUDED.status,
        metadata = COALESCE(service_revenue_ledger.metadata, '{}'::jsonb) || COALESCE(EXCLUDED.metadata, '{}'::jsonb),
        updated_at = NOW();
    `,
    params
  );
}

async function upsertAccommodations(client, dateStart, dateEnd) {
  const params = [dateStart, dateEnd, NORMALIZED_ACCOMMODATION_STATUSES];
  await client.query(
    `INSERT INTO service_revenue_ledger (
        entity_type,
        entity_id,
        service_type,
        service_subtype,
        service_id,
        customer_id,
        amount,
        currency,
        occurred_at,
        status,
        metadata,
        updated_at
      )
      SELECT
        'accommodation' AS entity_type,
        ab.id AS entity_id,
        'accommodation' AS service_type,
        au.type AS service_subtype,
        ab.unit_id AS service_id,
        ab.guest_id AS customer_id,
        COALESCE(ab.total_price, 0) AS amount,
        'EUR' AS currency,
        COALESCE(ab.updated_at, ab.check_out_date::timestamptz, ab.check_in_date::timestamptz) AS occurred_at,
        ${ACCOMMODATION_STATUS_SQL} AS status,
        jsonb_strip_nulls(jsonb_build_object(
          'guests_count', ab.guests_count,
          'notes', ab.notes,
          'unit_name', au.name
        )) AS metadata,
        NOW()
      FROM accommodation_bookings ab
      LEFT JOIN accommodation_units au ON au.id = ab.unit_id
      WHERE ${ACCOMMODATION_STATUS_SQL} = ANY($3::text[])
        AND COALESCE(ab.total_price, 0) > 0
        AND COALESCE(ab.check_out_date, ab.check_in_date)::date BETWEEN $1::date AND $2::date
      ON CONFLICT (entity_type, entity_id)
      DO UPDATE SET
        service_type = EXCLUDED.service_type,
        service_subtype = EXCLUDED.service_subtype,
        service_id = EXCLUDED.service_id,
        customer_id = EXCLUDED.customer_id,
        amount = EXCLUDED.amount,
        currency = EXCLUDED.currency,
        occurred_at = EXCLUDED.occurred_at,
        status = EXCLUDED.status,
        metadata = COALESCE(service_revenue_ledger.metadata, '{}'::jsonb) || COALESCE(EXCLUDED.metadata, '{}'::jsonb),
        updated_at = NOW();
    `,
    params
  );
}

export async function syncServiceRevenueLedger({ dateStart, dateEnd, truncate = true, client } = {}) {
  const start = dateStart || DEFAULT_START_DATE;
  const end = dateEnd || DEFAULT_END_DATE;

  return withClient(client, async (activeClient) => {
    await ensureLedgerTable(activeClient);

    if (truncate) {
      await clearLedgerRange(activeClient, start, end);
    }

    await upsertBookings(activeClient, start, end);
    await upsertRentals(activeClient, start, end);
    await upsertAccommodations(activeClient, start, end);
  }).catch((error) => {
    logger.warn('Failed to sync service revenue ledger', {
      error: error?.message,
      dateStart: start,
      dateEnd: end
    });
    throw error;
  });
}

export async function getServiceLedgerTotals({ dateStart, dateEnd, client } = {}) {
  const start = dateStart || DEFAULT_START_DATE;
  const end = dateEnd || DEFAULT_END_DATE;

  return withClient(client, async (activeClient) => {
    const { rows } = await activeClient.query(
      `SELECT service_type,
              COUNT(*) AS entry_count,
              COALESCE(SUM(amount), 0) AS total_amount,
              COALESCE(SUM(instructor_commission_amount), 0) AS total_commission
         FROM service_revenue_ledger
        WHERE occurred_at::date BETWEEN $1::date AND $2::date
          AND NOT (status = ANY($3::text[]))
        GROUP BY service_type`,
      [start, end, Array.from(NEGATIVE_STATUSES)]
    );

    const expectedByService = {};
    const countsByService = {};
    const commissionByService = {};
    let expectedTotal = 0;
    let entryCount = 0;
    let commissionTotal = 0;

    for (const row of rows) {
      const key = row.service_type || 'unknown';
      const amount = toNumber(row.total_amount);
      const count = Number.parseInt(row.entry_count, 10) || 0;
      const commissionAmount = toNumber(row.total_commission);
      expectedByService[key] = amount;
      countsByService[key] = count;
      commissionByService[key] = commissionAmount;
      expectedTotal += amount;
      entryCount += count;
      commissionTotal += commissionAmount;
    }

    const statusRows = await activeClient.query(
      `SELECT status, COUNT(*) AS entry_count, COALESCE(SUM(amount), 0) AS total_amount
         FROM service_revenue_ledger
        WHERE occurred_at::date BETWEEN $1::date AND $2::date
        GROUP BY status`,
      [start, end]
    );

    const statusBreakdown = {};
    let refundedTotal = 0;

    for (const row of statusRows.rows) {
      const status = normalizeStatusValue(row.status || 'unknown');
      const amount = toNumber(row.total_amount);
      const count = Number.parseInt(row.entry_count, 10) || 0;
      statusBreakdown[status] = { amount, count };
      if (NEGATIVE_STATUSES.has(status)) {
        refundedTotal += amount;
      }
    }

    return {
      expectedTotal,
      expectedByService,
      countsByService,
      commissionByService,
      commissionTotal,
      commissionRate: expectedTotal > 0 ? commissionTotal / expectedTotal : 0,
      entryCount,
      refundedTotal,
      statusBreakdown,
      currency: 'EUR',
      syncedAt: new Date().toISOString()
    };
  }).catch((error) => {
    logger.warn('Failed to compute service revenue ledger totals', {
      error: error?.message,
      dateStart: start,
      dateEnd: end
    });
    throw error;
  });
}
