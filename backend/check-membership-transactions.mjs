import { pool } from './db.js';

async function checkMembershipTransactions() {
  try {
    console.log('\n📊 Checking membership transactions...\n');

    // Check member_purchases table
    console.log('1. Member Purchases (VIP Memberships):');
    const memberPurchases = await pool.query(`
      SELECT 
        mp.id,
        mp.user_id,
        u.name as user_name,
        mp.offering_name,
        mp.offering_price,
        mp.offering_currency,
        mp.purchased_at,
        mp.payment_status,
        mp.payment_method
      FROM member_purchases mp
      JOIN users u ON u.id = mp.user_id
      WHERE mp.purchased_at >= '2026-01-01'
      ORDER BY mp.purchased_at DESC
      LIMIT 10
    `);
    console.log(`   Found ${memberPurchases.rows.length} member purchases in 2026`);
    if (memberPurchases.rows.length > 0) {
      console.log(JSON.stringify(memberPurchases.rows, null, 2));
    }

    // Check customer_packages table
    console.log('\n2. Customer Packages (Lesson Packages):');
    const customerPackages = await pool.query(`
      SELECT 
        cp.id,
        cp.customer_id,
        u.name as customer_name,
        cp.package_name,
        cp.purchase_price,
        cp.currency,
        cp.purchase_date,
        cp.status
      FROM customer_packages cp
      JOIN users u ON u.id = cp.customer_id
      WHERE cp.purchase_date >= '2026-01-01'
      ORDER BY cp.purchase_date DESC
      LIMIT 10
    `);
    console.log(`   Found ${customerPackages.rows.length} package purchases in 2026`);
    if (customerPackages.rows.length > 0) {
      console.log(JSON.stringify(customerPackages.rows, null, 2));
    }

    // Check wallet_transactions for membership/package related transactions
    console.log('\n3. Wallet Transactions (membership/package):');
    const walletTransactions = await pool.query(`
      SELECT 
        wt.id,
        wt.user_id,
        u.name as user_name,
        wt.transaction_type,
        wt.amount,
        wt.currency,
        wt.description,
        wt.transaction_date,
        wt.status
      FROM wallet_transactions wt
      JOIN users u ON u.id = wt.user_id
      WHERE wt.transaction_date >= '2026-01-01'
        AND (
          wt.transaction_type = 'package_purchase'
          OR wt.description ILIKE '%membership%'
          OR wt.description ILIKE '%package%'
        )
      ORDER BY wt.transaction_date DESC
      LIMIT 10
    `);
    console.log(`   Found ${walletTransactions.rows.length} membership/package wallet transactions in 2026`);
    if (walletTransactions.rows.length > 0) {
      console.log(JSON.stringify(walletTransactions.rows, null, 2));
    }

    // Check how the finance page filters transactions
    console.log('\n4. What the frontend receives (loadPaymentsData):');
    console.log('   Frontend calls: GET /transactions/payments with startDate and endDate');
    console.log('   ⚠️  But there is NO /transactions/payments endpoint in the backend!');
    console.log('   This explains why the table is always empty.');

    console.log('\n✅ Analysis complete!');
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await pool.end();
  }
}

checkMembershipTransactions();
