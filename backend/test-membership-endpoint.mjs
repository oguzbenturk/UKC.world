import { pool } from './db.js';

async function testMembershipTransactionsEndpoint() {
  try {
    console.log('\n🧪 Testing Membership Transactions Endpoint Logic...\n');

    const startDate = '2026-01-01';
    const endDate = '2026-12-31';

    // Simulate what the new endpoint does
    console.log('1. Querying member_purchases (VIP memberships)...');
    const memberPurchasesQuery = `
      SELECT 
        mp.id::text as id,
        mp.user_id,
        u.name as user_name,
        u.email as user_email,
        'membership' as transaction_type,
        mp.offering_price as amount,
        mp.offering_currency as currency,
        mp.offering_name as description,
        mp.purchased_at as date,
        mp.payment_status as status,
        mp.payment_method
      FROM member_purchases mp
      JOIN users u ON u.id = mp.user_id
      WHERE mp.purchased_at >= $1::date AND mp.purchased_at <= $2::date
        AND mp.payment_status = 'completed'
      ORDER BY mp.purchased_at DESC
    `;

    const memberPurchases = await pool.query(memberPurchasesQuery, [startDate, endDate]);
    console.log(`   ✅ Found ${memberPurchases.rows.length} VIP membership purchases`);
    
    const membershipTotal = memberPurchases.rows.reduce((sum, p) => sum + parseFloat(p.amount), 0);
    console.log(`   💰 Total VIP Revenue: €${membershipTotal.toFixed(2)}\n`);

    console.log('2. Querying wallet_transactions (package purchases)...');
    const packageTransactionsQuery = `
      SELECT 
        wt.id::text as id,
        wt.user_id,
        u.name as user_name,
        u.email as user_email,
        wt.transaction_type,
        ABS(wt.amount) as amount,
        wt.currency,
        wt.description,
        wt.transaction_date as date,
        wt.status,
        wt.payment_method
      FROM wallet_transactions wt
      JOIN users u ON u.id = wt.user_id
      WHERE wt.transaction_date >= $1::date AND wt.transaction_date <= $2::date
        AND wt.status = 'completed'
        AND wt.transaction_type = 'package_purchase'
      ORDER BY wt.transaction_date DESC
    `;

    const packageTransactions = await pool.query(packageTransactionsQuery, [startDate, endDate]);
    console.log(`   ✅ Found ${packageTransactions.rows.length} package purchases`);
    
    const packageTotal = packageTransactions.rows.reduce((sum, p) => sum + parseFloat(p.amount), 0);
    console.log(`   💰 Total Package Revenue: €${packageTotal.toFixed(2)}\n`);

    // Combine
    const allPayments = [...memberPurchases.rows, ...packageTransactions.rows]
      .sort((a, b) => new Date(b.date) - new Date(a.date));

    console.log('3. Combined Results:');
    console.log(`   📊 Total Transactions: ${allPayments.length}`);
    console.log(`   💰 Total Revenue: €${(membershipTotal + packageTotal).toFixed(2)}`);
    console.log(`   📅 Date Range: ${startDate} to ${endDate}\n`);

    // Show sample
    console.log('4. Sample Transactions (first 5):');
    allPayments.slice(0, 5).forEach((payment, i) => {
      console.log(`   ${i + 1}. ${payment.user_name} - ${payment.description}`);
      console.log(`      Amount: €${parseFloat(payment.amount).toFixed(2)} | Date: ${new Date(payment.date).toISOString().split('T')[0]}`);
    });

    console.log('\n✅ Endpoint logic test successful!');
    console.log('The new /api/finances/transactions/payments endpoint will return this data.\n');
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await pool.end();
  }
}

testMembershipTransactionsEndpoint();
