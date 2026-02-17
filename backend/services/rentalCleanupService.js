import { recordLegacyTransaction, getWalletAccountSummary } from './walletService.js';
import { logger } from '../middlewares/errorHandler.js';

function toNumber(value) {
  if (value === null || value === undefined) {
    return null;
  }

  const parsed = Number.parseFloat(value);
  return Number.isNaN(parsed) ? null : parsed;
}

function normalizeEquipmentList(row) {
  if (!row) {
    return [];
  }

  if (Array.isArray(row.equipment_list)) {
    return row.equipment_list.filter(Boolean).map((item) => ({
      id: item.id ?? item.equipmentId ?? item.equipment_id ?? null,
      serviceId: item.serviceId ?? item.service_id ?? item.id ?? null,
      name: item.name ?? null,
      serviceType: item.serviceType ?? item.service_type ?? null,
      dailyRate: toNumber(item.dailyRate ?? item.daily_rate) ?? null
    }));
  }

  if (row.equipment_details && typeof row.equipment_details === 'object') {
    return Object.values(row.equipment_details).map((item) => ({
      id: item.id ?? item.equipmentId ?? null,
      serviceId: item.serviceId ?? null,
      name: item.name ?? null,
      serviceType: item.serviceType ?? null,
      dailyRate: toNumber(item.dailyRate ?? item.price) ?? null
    }));
  }

  return [];
}

export function normalizeRentalRow(row) {
  if (!row) {
    return null;
  }

  const equipment = normalizeEquipmentList(row);

  return {
    id: row.id,
    customerId: row.user_id ?? row.customer_id ?? null,
    customerName: row.customer_name ?? null,
    customerEmail: row.customer_email ?? null,
    startDate: row.start_date ?? row.rental_date ?? null,
    endDate: row.end_date ?? null,
    status: row.status ?? null,
    paymentStatus: row.payment_status ?? null,
    totalPrice: toNumber(row.total_price) ?? 0,
    currency: row.currency || 'EUR',
    notes: row.notes ?? null,
    equipment,
    equipmentSummary: equipment.map((item) => item.name).filter(Boolean).join(', ') || null,
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? null
  };
}

export async function fetchRentalsByIds(client, rentalIds = []) {
  if (!client || !Array.isArray(rentalIds) || rentalIds.length === 0) {
    return [];
  }

  const { rows } = await client.query(
    `SELECT 
        r.*, 
        u.name AS customer_name,
        u.email AS customer_email,
        COALESCE(
          json_agg(
            json_build_object(
              'id', re.equipment_id,
              'serviceId', s.id,
              'name', s.name,
              'serviceType', s.service_type,
              'dailyRate', re.daily_rate
            )
          ) FILTER (WHERE re.id IS NOT NULL),
          '[]'::json
        ) AS equipment_list
       FROM rentals r
  LEFT JOIN users u ON u.id = r.user_id
  LEFT JOIN rental_equipment re ON re.rental_id = r.id
  LEFT JOIN services s ON s.id = re.equipment_id
      WHERE r.id = ANY($1)
   GROUP BY r.id, u.name, u.email`,
    [rentalIds]
  );

  return rows.map(normalizeRentalRow);
}

export async function forceDeleteRental({
  client,
  rentalId,
  actorId = null,
  issueRefund = true,
  expectedCustomerId = null,
  includeWalletSummary = true
}) {
  if (!client) {
    throw new Error('Database client is required to delete rental');
  }

  const rentalResult = await client.query(
    'SELECT * FROM rentals WHERE id = $1 FOR UPDATE',
    [rentalId]
  );

  if (rentalResult.rows.length === 0) {
    const error = new Error('Rental not found');
    error.statusCode = 404;
    throw error;
  }

  const rentalRow = rentalResult.rows[0];

  if (expectedCustomerId && rentalRow.user_id !== expectedCustomerId) {
    const error = new Error('Rental does not belong to the transaction user');
    error.statusCode = 400;
    throw error;
  }

  const { rows: equipmentRows } = await client.query(
    `SELECT 
        re.equipment_id AS id,
        re.equipment_id,
        s.id AS service_id,
        s.name,
        s.service_type,
        re.daily_rate
       FROM rental_equipment re
  LEFT JOIN services s ON s.id = re.equipment_id
      WHERE re.rental_id = $1`,
    [rentalId]
  );

  await client.query('DELETE FROM rental_equipment WHERE rental_id = $1', [rentalId]);

  const totalPrice = Math.abs(toNumber(rentalRow.total_price) ?? 0);

  let walletTransaction = null;
  let walletSummary = null;

  if (issueRefund && totalPrice > 0) {
    try {
      walletTransaction = await recordLegacyTransaction({
        client,
        userId: rentalRow.user_id,
        amount: totalPrice,
        transactionType: 'rental_refund',
        status: 'completed',
        direction: 'credit',
        description: `Refund for deleted rental ${rentalId}`,
        currency: rentalRow.currency || 'EUR',
        metadata: {
          rentalId,
          source: 'rentals:force-delete',
          originalAmount: totalPrice
        },
        entityType: 'rental',
        relatedEntityType: 'rental',
        relatedEntityId: rentalId,
        rentalId,
        createdBy: actorId || null
      });
    } catch (walletError) {
      logger.error('Failed to record rental refund transaction', {
        rentalId,
        userId: rentalRow.user_id,
        error: walletError?.message
      });
      throw walletError;
    }
  } else if (!issueRefund && totalPrice > 0) {
    logger.info('Skipping automatic rental refund because refund handled by parent operation', {
      rentalId,
      totalPrice
    });
  }

  const deleteResult = await client.query(
    'DELETE FROM rentals WHERE id = $1 RETURNING *',
    [rentalId]
  );

  const deletedRentalRow = deleteResult.rows[0] || rentalRow;

  if (includeWalletSummary) {
    try {
      walletSummary = await getWalletAccountSummary(rentalRow.user_id);
    } catch (summaryError) {
      logger.debug?.('Failed to load wallet summary after rental deletion', {
        rentalId,
        customerId: rentalRow.user_id,
        error: summaryError.message
      });
    }
  }

  const normalizedRental = normalizeRentalRow({
    ...deletedRentalRow,
    equipment_list: equipmentRows
  });

  return {
    rental: normalizedRental,
    cleanup: {
      equipmentReferencesCleared: equipmentRows.length
    },
    refundDetails: {
      originalAmount: totalPrice,
      refundAmount: issueRefund ? totalPrice : 0,
      refundIssued: issueRefund && totalPrice > 0
    },
    walletTransaction,
    walletSummary
  };
}
