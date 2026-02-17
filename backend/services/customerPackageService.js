import {
  recordLegacyTransaction,
  recordTransaction as recordWalletTransaction,
  getWalletAccountSummary
} from './walletService.js';
import { logger } from '../middlewares/errorHandler.js';

function normalizePackageRow(row) {
  if (!row) {
    return null;
  }

  const toNumber = (value) => {
    if (value === null || value === undefined) {
      return null;
    }
    const parsed = Number.parseFloat(value);
    return Number.isNaN(parsed) ? null : parsed;
  };

  const totalHours = toNumber(row.total_hours) || 0;
  const usedHours = toNumber(row.used_hours) || 0;
  const remainingHours = toNumber(row.remaining_hours) || 0;
  const purchasePrice = toNumber(row.purchase_price) || 0;
  const pricePerHour = totalHours > 0 ? purchasePrice / totalHours : 0;
  const usageSummary = {
    totalHours,
    usedHours,
    remainingHours,
    purchasePrice,
    pricePerHour,
    usedAmount: usedHours * pricePerHour,
    remainingAmount: remainingHours * pricePerHour
  };

  return {
    id: row.id,
    customerId: row.customer_id,
    servicePackageId: row.service_package_id,
    packageName: row.package_name,
    lessonServiceName: row.lesson_service_name,
    totalHours,
    usedHours,
    remainingHours,
    purchasePrice,
    currency: row.currency || 'EUR',
    purchaseDate: row.purchase_date,
    expiryDate: row.expiry_date,
    status: row.status,
    notes: row.notes,
    lastUsedDate: row.last_used_date,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    pricePerHour,
    usageSummary
  };
}

export async function fetchCustomerPackagesByIds(client, packageIds = []) {
  if (!client || !Array.isArray(packageIds) || packageIds.length === 0) {
    return [];
  }

  const { rows } = await client.query(
    `SELECT * FROM customer_packages WHERE id = ANY($1)`,
    [packageIds]
  );

  return rows.map(normalizePackageRow);
}

export async function forceDeleteCustomerPackage({
  client,
  packageId,
  actorId = null,
  issueRefund = true,
  expectedCustomerId = null,
  includeWalletSummary = true,
  usageSettlement = null
}) {
  if (!client) {
    throw new Error('Database client is required to delete customer package');
  }

  const packageResult = await client.query(
    'SELECT * FROM customer_packages WHERE id = $1 FOR UPDATE',
    [packageId]
  );

  if (packageResult.rows.length === 0) {
    const error = new Error('Customer package not found');
    error.statusCode = 404;
    throw error;
  }

  const customerPackage = packageResult.rows[0];

  // CRITICAL: Check if package was actually paid (has a completed wallet transaction)
  // If pay_later or never paid, don't issue refund - there's nothing to refund
  let wasActuallyPaid = false;
  if (issueRefund) {
    const paymentCheck = await client.query(
      `SELECT id FROM wallet_transactions 
       WHERE related_entity_id = $1 
         AND related_entity_type = 'customer_package'
         AND transaction_type = 'package_purchase'
         AND status = 'completed'
         AND amount < 0
       LIMIT 1`,
      [packageId]
    );
    wasActuallyPaid = paymentCheck.rows.length > 0;
    
    // Also check notes for pay_later indication
    if (!wasActuallyPaid && customerPackage.notes?.toLowerCase()?.includes('pay later')) {
      logger.info('Package was purchased with pay_later - skipping refund', { packageId });
    }
    
    // Override issueRefund if package was never actually paid
    if (!wasActuallyPaid) {
      logger.info('No payment transaction found for package - skipping refund', { packageId });
      issueRefund = false;
    }
  }

  if (expectedCustomerId && customerPackage.customer_id !== expectedCustomerId) {
    const error = new Error('Package does not belong to the transaction user');
    error.statusCode = 400;
    throw error;
  }

  const cleanup = {
    participantReferencesCleared: 0,
    bookingReferencesCleared: 0
  };

  const { rows: participantUpdates } = await client.query(
    `UPDATE booking_participants
        SET customer_package_id = NULL
      WHERE customer_package_id = $1
      RETURNING id, booking_id`,
    [packageId]
  );

  cleanup.participantReferencesCleared = participantUpdates.length;

  const { rows: bookingUpdates } = await client.query(
    `UPDATE bookings
        SET customer_package_id = NULL
      WHERE customer_package_id = $1
      RETURNING id`,
    [packageId]
  );

  cleanup.bookingReferencesCleared = bookingUpdates.length;

  const { rows: deletedRows } = await client.query(
    'DELETE FROM customer_packages WHERE id = $1 RETURNING *',
    [packageId]
  );

  const deletedPackage = deletedRows[0];

  const totalHours = Number.parseFloat(deletedPackage.total_hours) || 0;
  const usedHours = Number.parseFloat(deletedPackage.used_hours) || 0;
  const remainingHours = Number.parseFloat(deletedPackage.remaining_hours) || 0;
  const purchasePrice = Number.parseFloat(deletedPackage.purchase_price) || 0;
  const pricePerHour = totalHours > 0 ? purchasePrice / totalHours : 0;
  const usedAmount = usedHours * pricePerHour;
  const partialRefundAmount = remainingHours * pricePerHour;

  let walletTransaction = null;
  let walletSummary = null;
  let usageSettlementTransaction = null;

  if (issueRefund && partialRefundAmount > 0) {
    try {
      walletTransaction = await recordLegacyTransaction({
        client,
        userId: deletedPackage.customer_id,
        amount: partialRefundAmount,
        transactionType: 'package_refund',
        status: 'completed',
        direction: 'credit',
        description: `Package Partial Refund: ${deletedPackage.package_name} (${remainingHours}h/${totalHours}h unused)`,
        currency: deletedPackage.currency || 'EUR',
        paymentMethod: 'package_refund',
        referenceNumber: deletedPackage.id,
        metadata: {
          packageId: deletedPackage.id,
          packageName: deletedPackage.package_name,
          totalHours,
          usedHours,
          remainingHours,
          pricePerHour,
          source: issueRefund ? 'services:customer-packages:force-delete' : 'finances:transaction-cascade'
        },
        entityType: 'customer_package',
        relatedEntityType: 'customer_package',
        relatedEntityId: deletedPackage.id,
        createdBy: actorId || null
      });
    } catch (walletError) {
      logger.error('Failed to record package refund transaction', {
        packageId,
        customerId: deletedPackage.customer_id,
        error: walletError?.message
      });
      throw walletError;
    }
  } else if (!issueRefund && partialRefundAmount > 0) {
    logger.info('Skipping automatic package refund because refund handled by parent operation', {
      packageId,
      partialRefundAmount: partialRefundAmount.toFixed(2)
    });
  }

  if (usageSettlement?.mode === 'charge-used' && usedAmount > 0) {
    const settlementAmount = Number.isFinite(usageSettlement?.chargeAmount)
      ? Math.abs(Number(usageSettlement.chargeAmount))
      : Math.abs(usedAmount);
    const settlementDebitAmount = settlementAmount > 0 ? -settlementAmount : 0;

    if (settlementDebitAmount < 0) {
      try {
        usageSettlementTransaction = await recordWalletTransaction({
          client,
          userId: deletedPackage.customer_id,
          amount: settlementDebitAmount,
          availableDelta: settlementDebitAmount,
          transactionType: 'package_usage_settlement',
          status: 'completed',
          direction: 'debit',
          description: `Charge for used hours from package ${deletedPackage.package_name}`,
          currency: deletedPackage.currency || 'EUR',
          paymentMethod: 'package_usage_settlement',
          referenceNumber: deletedPackage.id,
          metadata: {
            packageId: deletedPackage.id,
            packageName: deletedPackage.package_name,
            totalHours,
            usedHours,
            remainingHours,
            pricePerHour,
            settlementAmount,
            source: 'finances:transaction-cascade',
            requestedBy: usageSettlement?.requestedBy || actorId || null
          },
          entityType: 'customer_package',
          relatedEntityType: 'customer_package',
          relatedEntityId: deletedPackage.id,
          createdBy: actorId || null,
          allowNegative: usageSettlement?.allowNegative !== false
        });
      } catch (walletError) {
        logger.error('Failed to record package usage settlement', {
          packageId,
          customerId: deletedPackage.customer_id,
          error: walletError?.message
        });
        throw walletError;
      }
    }
  }

  if (includeWalletSummary) {
    try {
      walletSummary = await getWalletAccountSummary(deletedPackage.customer_id);
    } catch (summaryError) {
      logger.debug?.('Failed to load wallet summary after package deletion', {
        customerId: deletedPackage.customer_id,
        error: summaryError.message
      });
    }
  }

  return {
    package: normalizePackageRow(deletedPackage),
    cleanup,
    refundDetails: {
      totalHours,
      usedHours,
      remainingHours,
      originalPrice: purchasePrice,
      refundAmount: issueRefund ? partialRefundAmount : 0,
      calculatedRefundAmount: partialRefundAmount,
      refundIssued: issueRefund && partialRefundAmount > 0
    },
    usageSummary: {
      totalHours,
      usedHours,
      remainingHours,
      pricePerHour,
      purchasePrice,
      usedAmount,
      remainingAmount: partialRefundAmount
    },
    walletTransaction,
    usageSettlementTransaction,
    walletSummary
  };
}

export function mapWalletTransactionForResponse(walletTransaction) {
  if (!walletTransaction) {
    return null;
  }

  return {
    id: walletTransaction.id,
    userId: walletTransaction.user_id,
    balanceId: walletTransaction.balance_id,
    transactionType: walletTransaction.transaction_type,
    status: walletTransaction.status,
    direction: walletTransaction.direction,
    currency: walletTransaction.currency,
    amount:
      walletTransaction.amount != null ? Number(walletTransaction.amount) : null,
    availableDelta:
      walletTransaction.available_delta != null
        ? Number(walletTransaction.available_delta)
        : null,
    pendingDelta:
      walletTransaction.pending_delta != null ? Number(walletTransaction.pending_delta) : null,
    nonWithdrawableDelta:
      walletTransaction.non_withdrawable_delta != null
        ? Number(walletTransaction.non_withdrawable_delta)
        : null,
    balanceAvailableAfter:
      walletTransaction.balance_available_after != null
        ? Number(walletTransaction.balance_available_after)
        : null,
    balancePendingAfter:
      walletTransaction.balance_pending_after != null
        ? Number(walletTransaction.balance_pending_after)
        : null,
    balanceNonWithdrawableAfter:
      walletTransaction.balance_non_withdrawable_after != null
        ? Number(walletTransaction.balance_non_withdrawable_after)
        : null,
    description: walletTransaction.description,
    relatedEntityType: walletTransaction.related_entity_type,
    relatedEntityId: walletTransaction.related_entity_id,
    createdBy: walletTransaction.created_by,
    transactionDate: walletTransaction.transaction_date,
    createdAt: walletTransaction.created_at,
    metadata: walletTransaction.metadata
  };
}
