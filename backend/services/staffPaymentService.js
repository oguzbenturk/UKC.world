// Shared CRUD for staff payouts (instructor + manager). Both flows share the
// same cancel + cache-resync + re-record cascade; per-kind differences (entity
// types, reference prefix, error strings, metadata schema, allowNegative
// semantics) live in STAFF_KIND_CONFIG so the routes stay thin wrappers.
//
// Errors are thrown as { statusCode, message } so callers map them to HTTP.

import { pool } from '../db.js';
import {
  recordLegacyTransaction,
  getTransactionById as getWalletTransactionById,
  resolveStoredAvailableDelta,
} from './walletService.js';
import {
  TRANSACTION_TYPE,
  WALLET_ENTITY_TYPE,
  WALLET_TX_STATUS,
  TX_DIRECTION,
} from '../constants/transactions.js';

const httpError = (statusCode, message) => Object.assign(new Error(message), { statusCode });

export const STAFF_KIND = Object.freeze({
  INSTRUCTOR: 'instructor',
  MANAGER: 'manager',
});

const STAFF_KIND_CONFIG = Object.freeze({
  [STAFF_KIND.INSTRUCTOR]: Object.freeze({
    relatedEntityType: 'instructor',
    walletEntityType: WALLET_ENTITY_TYPE.INSTRUCTOR_PAYMENT,
    referencePrefix: 'INST_',
    sourcePrefix: 'finances:instructor-payments',
    notFoundMessage: 'Instructor payment not found in wallet ledger',
    typeNotAllowedUpdateMessage: 'Only instructor payment transactions can be updated with this endpoint.',
    typeNotAllowedDeleteMessage: 'Only instructor payment transactions can be deleted with this endpoint.',
    // Instructor POST never sets allowNegative; manager POST sets it to true.
    postAllowNegative: undefined,
    buildUpdateCancellationMetadata: ({ actorId, transactionType, paymentDate }) => ({
      updatedAt: new Date().toISOString(),
      updatedBy: actorId,
      updateOrigin: 'finances:instructor-payments:update',
      replacedByTransactionType: transactionType,
      replacedAt: paymentDate.toISOString(),
    }),
    buildDeleteCancellationMetadata: ({ actorId }) => ({
      cancelledAt: new Date().toISOString(),
      cancelledBy: actorId,
      cancellationOrigin: 'finances:instructor-payments:delete',
    }),
    buildPostMetadataExtras: ({ requestedType }) => ({ requestedType: requestedType ?? null }),
    buildPutMetadataExtras: ({ transactionType }) => ({ requestedType: transactionType }),
  }),
  [STAFF_KIND.MANAGER]: Object.freeze({
    relatedEntityType: 'manager',
    walletEntityType: WALLET_ENTITY_TYPE.MANAGER_PAYMENT,
    referencePrefix: 'MGR_',
    sourcePrefix: 'manager-commissions:payments',
    notFoundMessage: 'Payment not found',
    typeNotAllowedUpdateMessage: 'Only payment/deduction transactions can be updated',
    typeNotAllowedDeleteMessage: 'Only payment/deduction transactions can be deleted',
    postAllowNegative: true,
    buildUpdateCancellationMetadata: ({ actorId }) => ({
      updatedBy: actorId,
      updatedAt: new Date().toISOString(),
    }),
    buildDeleteCancellationMetadata: ({ actorId }) => ({
      cancelledBy: actorId,
      cancelledAt: new Date().toISOString(),
    }),
    buildPostMetadataExtras: () => ({}),
    buildPutMetadataExtras: () => ({}),
  }),
});

function getKindConfig(kind) {
  const cfg = STAFF_KIND_CONFIG[kind];
  if (!cfg) throw new Error(`Unsupported staff payment kind: ${kind}`);
  return cfg;
}

function deriveTransactionType(amount) {
  return amount < 0 ? TRANSACTION_TYPE.DEDUCTION : TRANSACTION_TYPE.PAYMENT;
}

function deriveDirection(amount) {
  return amount >= 0 ? TX_DIRECTION.CREDIT : TX_DIRECTION.DEBIT;
}

function snapshotDeltas(transaction) {
  return {
    originalAmount: Number.parseFloat(transaction.amount) || 0,
    availableDelta: resolveStoredAvailableDelta(transaction),
    pendingDelta: Number.parseFloat(transaction.pending_delta) || 0,
    nonWithdrawableDelta: Number.parseFloat(transaction.non_withdrawable_delta) || 0,
  };
}

async function cancelOriginal(client, paymentId, cancellationMetadata) {
  await client.query(
    `UPDATE wallet_transactions
        SET status = 'cancelled',
            metadata = COALESCE(metadata, '{}'::jsonb) || $2::jsonb,
            updated_at = NOW()
      WHERE id = $1`,
    [paymentId, JSON.stringify(cancellationMetadata)]
  );
}

// Re-derive the wallet cache from completed ledger rows after the original
// payment row was cancelled. Replaces the old "post a counter-delta reversal
// row" approach: cancelling the original already removes its delta from every
// completed-only SUM, so a reversal row on top double-undid the payment and
// pushed legacy staff wallets below their true balance (Dinçer -522,
// Siyabend -316, May 2026 — same disease as the Erkan Özgen +390 phantom).
async function resyncWalletAfterCancel(client, { transaction, deltas }) {
  const { availableDelta, pendingDelta, nonWithdrawableDelta } = deltas;
  const noBalanceDeltas =
    Math.abs(availableDelta) === 0
    && Math.abs(pendingDelta) === 0
    && Math.abs(nonWithdrawableDelta) === 0;
  // Modern payout rows carry availableDelta 0 — nothing to resync.
  if (noBalanceDeltas) return null;

  const txCurrency = transaction.currency || 'EUR';
  await client.query(`SELECT set_config('wallet.allow_negative', 'true', false)`);
  await client.query(
    `UPDATE wallet_balances
        SET available_amount = COALESCE((
              SELECT SUM(available_delta) FROM wallet_transactions
               WHERE user_id = $1 AND currency = $2 AND status = 'completed'), 0),
            pending_amount = COALESCE((
              SELECT SUM(pending_delta) FROM wallet_transactions
               WHERE user_id = $1 AND currency = $2 AND status = 'completed'), 0),
            non_withdrawable_amount = COALESCE((
              SELECT SUM(non_withdrawable_delta) FROM wallet_transactions
               WHERE user_id = $1 AND currency = $2 AND status = 'completed'), 0),
            updated_at = NOW()
      WHERE user_id = $1 AND currency = $2`,
    [transaction.user_id, txCurrency]
  );
  return { resynced: true };
}

export async function createStaffPayment({
  kind,
  userId,
  amount,
  description,
  paymentDate,
  paymentMethod,
  actorId,
  requestedType = null,
}) {
  const cfg = getKindConfig(kind);
  const transactionAmount = parseFloat(amount);
  const transactionType = deriveTransactionType(transactionAmount);
  const dt = paymentDate || new Date();
  const referenceNumber = `${cfg.referencePrefix}${Date.now()}`;

  const payload = {
    userId,
    amount: transactionAmount,
    transactionType,
    status: WALLET_TX_STATUS.COMPLETED,
    direction: deriveDirection(transactionAmount),
    description,
    paymentMethod: paymentMethod || null,
    referenceNumber,
    // Salary/commission payouts must not affect the staff member's wallet
    // balance — the wallet is for customer-style credit, not payroll.
    availableDelta: 0,
    metadata: {
      source: `${cfg.sourcePrefix}:create`,
      paymentDate: dt.toISOString(),
      referenceNumber,
      ...cfg.buildPostMetadataExtras({ requestedType }),
    },
    entityType: cfg.walletEntityType,
    relatedEntityType: cfg.relatedEntityType,
    relatedEntityId: userId,
    createdBy: actorId || null,
  };
  if (cfg.postAllowNegative !== undefined) {
    payload.allowNegative = cfg.postAllowNegative;
  }

  const transactionRecord = await recordLegacyTransaction(payload);
  return { transactionRecord, transactionType };
}

export async function updateStaffPayment({
  kind,
  paymentId,
  amount,
  description,
  paymentDate,
  paymentMethod,
  actorId,
}) {
  const cfg = getKindConfig(kind);
  const newAmount = parseFloat(amount);
  const transactionType = deriveTransactionType(newAmount);
  const dt = paymentDate || new Date();

  const transaction = await getWalletTransactionById(paymentId);
  if (!transaction) {
    throw httpError(404, cfg.notFoundMessage);
  }
  if (![TRANSACTION_TYPE.PAYMENT, TRANSACTION_TYPE.DEDUCTION].includes(transaction.transaction_type)) {
    throw httpError(400, cfg.typeNotAllowedUpdateMessage);
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const deltas = snapshotDeltas(transaction);
    const cancellationMetadata = cfg.buildUpdateCancellationMetadata({
      actorId,
      transactionType,
      paymentDate: dt,
    });
    await cancelOriginal(client, paymentId, cancellationMetadata);
    await resyncWalletAfterCancel(client, { transaction, deltas });

    const updatedTransaction = await recordLegacyTransaction({
      userId: transaction.user_id,
      amount: newAmount,
      transactionType,
      status: WALLET_TX_STATUS.COMPLETED,
      direction: deriveDirection(newAmount),
      description,
      paymentMethod: paymentMethod || null,
      referenceNumber: transaction.reference_number || `${cfg.referencePrefix}${Date.now()}`,
      availableDelta: 0,
      metadata: {
        source: `${cfg.sourcePrefix}:update`,
        replacesTransactionId: transaction.id,
        paymentDate: dt.toISOString(),
        previousAmount: deltas.originalAmount,
        ...cfg.buildPutMetadataExtras({ transactionType }),
      },
      entityType: cfg.walletEntityType,
      relatedEntityType: cfg.relatedEntityType,
      relatedEntityId: transaction.user_id,
      createdBy: actorId,
      client,
    });

    await client.query('COMMIT');
    return { updatedTransaction, replacedTransactionId: transaction.id };
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (_) {}
    throw err;
  } finally {
    client.release();
  }
}

export async function deleteStaffPayment({ kind, paymentId, actorId }) {
  const cfg = getKindConfig(kind);

  const transaction = await getWalletTransactionById(paymentId);
  if (!transaction) {
    throw httpError(404, cfg.notFoundMessage);
  }
  if (![TRANSACTION_TYPE.PAYMENT, TRANSACTION_TYPE.DEDUCTION].includes(transaction.transaction_type)) {
    throw httpError(400, cfg.typeNotAllowedDeleteMessage);
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const deltas = snapshotDeltas(transaction);
    const cancellationMetadata = cfg.buildDeleteCancellationMetadata({ actorId });
    await cancelOriginal(client, paymentId, cancellationMetadata);
    await resyncWalletAfterCancel(client, { transaction, deltas });

    await client.query('COMMIT');
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (_) {}
    throw err;
  } finally {
    client.release();
  }
}
