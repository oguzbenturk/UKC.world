#!/usr/bin/env node

import process from 'node:process';
import { pool } from '../db.js';
import { computeTransactionAggregates } from '../services/studentPortalService.js';

const args = new Set(process.argv.slice(2));
const APPLY_CHANGES = args.has('--apply');

const userArg = process.argv.find((arg) => arg.startsWith('--user='));
const TARGET_USER_ID = userArg ? userArg.split('=')[1] : null;

const TWO_DECIMAL_TOLERANCE = 0.01;

const toNumber = (value, fallback = 0) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
};

const toIsoUtc = (value) => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

async function reconcileStudentAccounts() {
  const client = await pool.connect();
  const stats = {
    scanned: 0,
    skippedNoTransactions: 0,
    unchanged: 0,
    wouldUpdate: 0,
    updated: 0
  };

  try {
    const { rows: tableCheckRows } = await client.query(`
      SELECT
        to_regclass('student_accounts') AS student_accounts,
        to_regclass('transactions') AS transactions
    `);

    const tableCheck = tableCheckRows[0] || {};
    if (!tableCheck.student_accounts) {
      console.error('❌ student_accounts table does not exist. Nothing to reconcile.');
      return;
    }

    if (!tableCheck.transactions) {
      console.error('❌ transactions table does not exist. Cannot compute balances.');
      return;
    }

    const accountQueryParts = ['SELECT user_id, balance, total_spent, last_payment_date FROM student_accounts'];
    const queryParams = [];
    if (TARGET_USER_ID) {
      queryParams.push(TARGET_USER_ID);
      accountQueryParts.push('WHERE user_id = $1');
    }
    accountQueryParts.push('ORDER BY user_id');

    const { rows: accountRows } = await client.query(accountQueryParts.join('\n'), queryParams);

    if (!accountRows.length) {
      console.log(TARGET_USER_ID ? `ℹ️ No student_accounts rows found for user ${TARGET_USER_ID}` : 'ℹ️ student_accounts table is empty.');
      return;
    }

    console.log(`🔍 Reconciling ${accountRows.length} student account${accountRows.length === 1 ? '' : 's'}${TARGET_USER_ID ? ` (filtered to user ${TARGET_USER_ID})` : ''}${APPLY_CHANGES ? ' with APPLY mode enabled' : ''}.`);

    if (APPLY_CHANGES) {
      await client.query('BEGIN');
    }

    for (const account of accountRows) {
      stats.scanned += 1;
      const userId = account.user_id;

      const { rows: transactionRows } = await client.query(
        `SELECT amount, type, COALESCE(transaction_date, created_at) AS created_at
           FROM transactions
          WHERE user_id = $1
       ORDER BY COALESCE(transaction_date, created_at, created_at) ASC`,
        [userId]
      );

      if (!transactionRows.length) {
        stats.skippedNoTransactions += 1;
        continue;
      }

      const aggregates = computeTransactionAggregates(
        transactionRows.map((row) => ({
          amount: toNumber(row.amount),
          type: row.type,
          createdAt: row.created_at
        }))
      );

      const resolvedBalance = toNumber(aggregates.balance);
      const resolvedTotalSpent = toNumber(aggregates.totalSpent);
      const resolvedLastPaymentAt = aggregates.lastPaymentAt ? aggregates.lastPaymentAt.toISOString() : null;

      const existingBalance = toNumber(account.balance);
      const existingTotalSpent = toNumber(account.total_spent);
      const existingLastPaymentAt = toIsoUtc(account.last_payment_date);

      const balanceDiff = Math.abs(existingBalance - resolvedBalance);
      const totalSpentDiff = Math.abs(existingTotalSpent - resolvedTotalSpent);
      const lastPaymentChanged = existingLastPaymentAt !== resolvedLastPaymentAt;

      if (
        balanceDiff <= TWO_DECIMAL_TOLERANCE &&
        totalSpentDiff <= TWO_DECIMAL_TOLERANCE &&
        !lastPaymentChanged
      ) {
        stats.unchanged += 1;
        continue;
      }

      const summary = {
        userId,
        existing: {
          balance: existingBalance,
          totalSpent: existingTotalSpent,
          lastPaymentAt: existingLastPaymentAt
        },
        resolved: {
          balance: resolvedBalance,
          totalSpent: resolvedTotalSpent,
          lastPaymentAt: resolvedLastPaymentAt
        }
      };

      if (APPLY_CHANGES) {
        await client.query(
          `UPDATE student_accounts
              SET balance = $1,
                  total_spent = $2,
                  last_payment_date = $3,
                  updated_at = NOW()
            WHERE user_id = $4`,
          [resolvedBalance, resolvedTotalSpent, resolvedLastPaymentAt, userId]
        );
        stats.updated += 1;
        console.log(`✅ Updated ${userId}:`, summary);
      } else {
        stats.wouldUpdate += 1;
        console.log(`➕ Would update ${userId}:`, summary);
      }
    }

    if (APPLY_CHANGES) {
      await client.query('COMMIT');
    }

    console.log('\n📈 Reconciliation summary:');
    console.log(`   Scanned: ${stats.scanned}`);
    console.log(`   Skipped (no transactions): ${stats.skippedNoTransactions}`);
    console.log(`   Unchanged: ${stats.unchanged}`);
    if (APPLY_CHANGES) {
      console.log(`   Updated: ${stats.updated}`);
    } else {
      console.log(`   Would update: ${stats.wouldUpdate}`);
      console.log('   (Run with --apply to persist changes)');
    }
  } catch (error) {
    if (APPLY_CHANGES) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackError) {
        console.error('❌ Failed to rollback transaction:', rollbackError);
      }
    }
    console.error('❌ Reconciliation failed:', error);
  } finally {
    client.release();
    await pool.end().catch(() => {});
  }
}

reconcileStudentAccounts();
