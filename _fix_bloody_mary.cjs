const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://plannivo:WHMgux86@217.154.201.29:5432/plannivo' });

const USER_ID = '21764418-1ab1-482b-9b60-5332ee919e91';
const GROUP_TXN_ID = 'fea8b086-2823-4f94-9c65-0d943d735308'; // group booking payment (amount was +14335.16 but should be -14335.16)
const PKG_PURCHASE_TXN_ID = 'ccf2c2fb-433e-4e23-9938-ac9372b7f142'; // package purchase, related_entity_id = customer_package
const PKG_CUSTOMER_PACKAGE_ID = 'b11def4d-0698-4b61-a19e-199002167a39';
const REFUND_AMOUNT = 35837.90; // same as the package purchase amount (in TRY)

async function main() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Fix group booking payment amount sign (was stored as positive, should be negative)
    const grpFix = await client.query(
      `UPDATE wallet_transactions SET amount = -ABS(amount) WHERE id = $1 AND amount > 0 RETURNING id, amount`,
      [GROUP_TXN_ID]
    );
    if (grpFix.rows.length > 0) {
      console.log('Fixed group booking payment amount:', grpFix.rows[0]);
    } else {
      console.log('Group booking payment amount was already correct (already negative or not found)');
    }

    // 2. Insert package_refund transaction
    const refundInsert = await client.query(
      `INSERT INTO wallet_transactions (
        user_id, transaction_type, amount, available_delta, pending_delta, non_withdrawable_delta,
        balance_available_after, balance_pending_after, balance_non_withdrawable_after,
        direction, status, currency, description,
        related_entity_id, related_entity_type, payment_method,
        metadata, transaction_date, created_at, updated_at
      )
      SELECT
        $1, 'package_refund', $2, $2, 0, 0,
        wb.available_amount + $2, wb.pending_amount, wb.non_withdrawable_amount,
        'credit', 'completed', 'TRY',
        $5,
        $3, 'customer_package', 'package_refund',
        $4::jsonb, NOW(), NOW(), NOW()
      FROM wallet_balances wb
      WHERE wb.user_id = $1 AND wb.currency = 'TRY'
      RETURNING id, amount, balance_available_after`,
      [
        USER_ID,
        REFUND_AMOUNT,
        PKG_CUSTOMER_PACKAGE_ID,
        JSON.stringify({
          packageId: PKG_CUSTOMER_PACKAGE_ID,
          packageName: '10h – Rider Progression Pack',
          totalHours: 10,
          usedHours: 10,
          remainingHours: 10,
          pricePerHour: 70,
          forceFullRefund: true,
          source: 'manual-db-fix:admin-refund-not-issued',
          note: 'Refund was not issued automatically because remaining_hours=0. Admin intended full refund.'
        }),
        'Package Refund (Admin): 10h \u2013 Rider Progression Pack (full refund)'
      ]
    );
    console.log('\nInserted package_refund transaction:', refundInsert.rows[0]);

    // 3. Update wallet balance
    const balUpdate = await client.query(
      `UPDATE wallet_balances SET available_amount = available_amount + $1, updated_at = NOW()
       WHERE user_id = $2 AND currency = 'TRY'
       RETURNING available_amount`,
      [REFUND_AMOUNT, USER_ID]
    );
    console.log('\nUpdated wallet balance:', balUpdate.rows[0]);

    // 4. Mirror to users.balance (legacy)
    await client.query(
      `UPDATE users SET balance = (SELECT available_amount FROM wallet_balances WHERE user_id = $1 AND currency = 'TRY'), updated_at = NOW() WHERE id = $1`,
      [USER_ID]
    );

    await client.query('COMMIT');
    console.log('\n✅ All DB fixes committed successfully');

    // Show final state
    const finalTx = await pool.query(
      `SELECT transaction_type, amount, available_delta, direction, description, currency, transaction_date FROM wallet_transactions WHERE user_id = $1 ORDER BY transaction_date DESC`,
      [USER_ID]
    );
    console.log('\n=== FINAL TRANSACTIONS ===');
    finalTx.rows.forEach(r => console.log(`  ${r.transaction_type}: ${r.amount} ${r.currency} (${r.direction}) - ${r.description}`));

    const finalBal = await pool.query(
      `SELECT currency, available_amount FROM wallet_balances WHERE user_id = $1`,
      [USER_ID]
    );
    console.log('\n=== FINAL BALANCE ===');
    console.log(JSON.stringify(finalBal.rows, null, 2));

  } catch (e) {
    await client.query('ROLLBACK');
    console.error('❌ Error — rolled back:', e.message);
    throw e;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(e => { console.error(e.message); process.exit(1); });
