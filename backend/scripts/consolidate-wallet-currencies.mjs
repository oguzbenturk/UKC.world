/**
 * Consolidate Wallet Currency Script
 * 
 * This script fixes transactions/balances that were incorrectly stored in non-EUR currencies.
 * Background: Before the currency fix, admin add-funds were storing amounts using user's 
 * preferred currency instead of the base currency (EUR). This caused:
 * - 50€ entered → stored as 50 TRY (wrong!)
 * - 150€ entered → stored as 150 EUR (correct, after fix)
 * 
 * This script finds all non-EUR balances and converts the transactions back to EUR.
 * 
 * Usage:
 *   DRY RUN (see what would be changed):  node scripts/consolidate-wallet-currencies.mjs
 *   APPLY CHANGES:                        node scripts/consolidate-wallet-currencies.mjs --apply
 */

import { pool } from '../db.js';

const DRY_RUN = !process.argv.includes('--apply');

async function consolidateWalletCurrencies() {
  const client = await pool.connect();
  
  try {
    console.log('='.repeat(70));
    console.log(DRY_RUN ? '🔍 DRY RUN MODE - No changes will be made' : '⚠️  APPLY MODE - Changes will be committed');
    console.log('='.repeat(70));
    console.log('\n📊 Scanning for non-EUR wallet balances...\n');

    // Find all users with non-EUR balances
    const { rows: nonEurBalances } = await client.query(`
      SELECT 
        wb.user_id,
        wb.currency,
        wb.available_amount,
        wb.pending_amount,
        wb.non_withdrawable_amount,
        u.name as user_name,
        u.email,
        u.preferred_currency
      FROM wallet_balances wb
      JOIN users u ON u.id = wb.user_id
      WHERE wb.currency != 'EUR'
        AND (wb.available_amount != 0 OR wb.pending_amount != 0 OR wb.non_withdrawable_amount != 0)
      ORDER BY wb.user_id
    `);

    if (nonEurBalances.length === 0) {
      console.log('✅ No non-EUR balances found. All wallets are correctly in EUR.');
      return;
    }

    console.log(`Found ${nonEurBalances.length} non-EUR balance(s):\n`);

    for (const balance of nonEurBalances) {
      console.log(`  User: ${balance.user_name} (${balance.email})`);
      console.log(`  Currency: ${balance.currency}`);
      console.log(`  Available: ${balance.available_amount}`);
      console.log(`  Pending: ${balance.pending_amount}`);
      console.log(`  Non-withdrawable: ${balance.non_withdrawable_amount}`);
      console.log('');
    }

    // Group by user for processing
    const userIds = [...new Set(nonEurBalances.map(b => b.user_id))];

    for (const userId of userIds) {
      console.log(`\n📝 Processing user ID: ${userId}`);

      // Get all transactions for this user in non-EUR currencies
      const { rows: nonEurTransactions } = await client.query(`
        SELECT 
          id,
          amount,
          currency,
          transaction_type,
          description,
          created_at,
          metadata
        FROM wallet_transactions
        WHERE user_id = $1 AND currency != 'EUR'
        ORDER BY created_at
      `, [userId]);

      console.log(`   Found ${nonEurTransactions.length} non-EUR transaction(s)`);

      for (const tx of nonEurTransactions) {
        console.log(`   - ${tx.transaction_type}: ${tx.amount} ${tx.currency} - "${tx.description}" (${tx.created_at.toISOString().split('T')[0]})`);
      }

      if (!DRY_RUN) {
        await client.query('BEGIN');

        try {
          // Update transactions to EUR
          const updateTxResult = await client.query(`
            UPDATE wallet_transactions
            SET 
              currency = 'EUR',
              metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('originalCurrency', currency, 'currencyConsolidatedAt', NOW())
            WHERE user_id = $1 AND currency != 'EUR'
            RETURNING id, amount, transaction_type
          `, [userId]);

          console.log(`   ✅ Updated ${updateTxResult.rowCount} transaction(s) to EUR`);

          // Recalculate EUR balance for this user
          // First, ensure EUR balance row exists
          await client.query(`
            INSERT INTO wallet_balances (user_id, currency, available_amount, pending_amount, non_withdrawable_amount)
            VALUES ($1, 'EUR', 0, 0, 0)
            ON CONFLICT (user_id, currency) DO NOTHING
          `, [userId]);

          // Calculate total from all transactions (now all should be EUR)
          const { rows: [totals] } = await client.query(`
            SELECT 
              COALESCE(SUM(CASE WHEN status = 'completed' THEN amount ELSE 0 END), 0) as available,
              COALESCE(SUM(CASE WHEN status = 'pending' THEN amount ELSE 0 END), 0) as pending
            FROM wallet_transactions
            WHERE user_id = $1 AND currency = 'EUR'
          `, [userId]);

          // Update EUR balance
          await client.query(`
            UPDATE wallet_balances
            SET 
              available_amount = $2,
              pending_amount = $3,
              updated_at = NOW()
            WHERE user_id = $1 AND currency = 'EUR'
          `, [userId, totals.available || 0, totals.pending || 0]);

          console.log(`   ✅ Recalculated EUR balance: Available=${totals.available}, Pending=${totals.pending}`);

          // Zero out the old non-EUR balances
          await client.query(`
            UPDATE wallet_balances
            SET 
              available_amount = 0,
              pending_amount = 0,
              non_withdrawable_amount = 0,
              updated_at = NOW()
            WHERE user_id = $1 AND currency != 'EUR'
          `, [userId]);

          console.log(`   ✅ Zeroed out non-EUR balance rows`);

          await client.query('COMMIT');
          console.log(`   ✅ Changes committed for user ${userId}`);

        } catch (txError) {
          await client.query('ROLLBACK');
          console.error(`   ❌ Error processing user ${userId}:`, txError.message);
        }
      }
    }

    console.log('\n' + '='.repeat(70));
    if (DRY_RUN) {
      console.log('🔍 DRY RUN COMPLETE - No changes were made.');
      console.log('   Run with --apply flag to make changes:');
      console.log('   node scripts/consolidate-wallet-currencies.mjs --apply');
    } else {
      console.log('✅ CONSOLIDATION COMPLETE');
    }
    console.log('='.repeat(70));

  } catch (error) {
    console.error('❌ Error during consolidation:', error);
    throw error;
  } finally {
    client.release();
  }
}

// Run the script
consolidateWalletCurrencies()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Script failed:', err);
    process.exit(1);
  });
