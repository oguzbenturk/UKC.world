import { pool } from '../db.js';

async function verifyUserFinancials(email) {
  try {
    // Get user info
    const userQuery = await pool.query('SELECT id, name, email FROM users WHERE email = $1', [email]);
    const user = userQuery.rows[0];
    
    if (!user) {
      console.log(`❌ User not found: ${email}`);
      return;
    }
    
    console.log(`\n👤 User: ${user.name} (${user.email})`);
    console.log(`📧 ID: ${user.id}`);
    
    // Get all transactions
    const transQuery = await pool.query(`
      SELECT amount, type, description, status,
             COALESCE(transaction_date, created_at) as date,
             created_at
      FROM transactions 
      WHERE user_id = $1 
      ORDER BY date DESC
    `, [user.id]);
    
    console.log(`\n💳 Transactions (${transQuery.rows.length} total):`);
    
    let calculatedBalance = 0;
    let calculatedTotalSpent = 0;
    
    transQuery.rows.forEach((t, i) => {
      const amount = parseFloat(t.amount);
      calculatedBalance += amount;
      
      // Track spending using EXACT same logic as studentPortalService.js
      const type = (t.type || '').toLowerCase();
      
      switch (type) {
        case 'payment':
        case 'credit':
          if (amount !== 0) {
            calculatedTotalSpent += Math.abs(amount);
          }
          break;
        case 'package_refund':
        case 'refund':
        case 'booking_deleted_refund':
          // These don't count as "spent" - they're money coming back
          break;
        case 'package_purchase':
        case 'booking_charge':
        case 'charge':
        case 'debit':
        case 'service_payment':
        case 'rental_payment':
          // These don't count as "spent" in the current logic
          break;
        default:
          if (amount > 0) {
            calculatedTotalSpent += amount;
          }
      }
      
      const date = t.date ? t.date.toISOString().split('T')[0] : 'No date';
      console.log(`   ${i+1}. €${amount} (${t.type || 'no type'}) - ${t.description || 'No description'} [${date}]`);
    });
    
    // Round to 2 decimal places
    calculatedBalance = Math.round(calculatedBalance * 100) / 100;
    calculatedTotalSpent = Math.round(calculatedTotalSpent * 100) / 100;
    
    console.log(`\n🧮 Manual Calculation:`);
    console.log(`   Balance: €${calculatedBalance}`);
    console.log(`   Total Spent: €${calculatedTotalSpent}`);
    
    // Get stored values
    const accountQuery = await pool.query(`
      SELECT balance, total_spent, last_payment_date, created_at, updated_at
      FROM student_accounts 
      WHERE user_id = $1
    `, [user.id]);
    
    const account = accountQuery.rows[0];
    if (account) {
      console.log(`\n💾 Stored Values:`);
      console.log(`   Balance: €${account.balance}`);
      console.log(`   Total Spent: €${account.total_spent}`);
      console.log(`   Last Payment: ${account.last_payment_date ? account.last_payment_date.toISOString().split('T')[0] : 'None'}`);
      console.log(`   Updated: ${account.updated_at ? account.updated_at.toISOString() : 'Never'}`);
      
      // Check if they match
      const balanceMatch = Math.abs(calculatedBalance - parseFloat(account.balance)) < 0.01;
      const spentMatch = Math.abs(calculatedTotalSpent - parseFloat(account.total_spent)) < 0.01;
      
      console.log(`\n✅ Verification:`);
      console.log(`   Balance Match: ${balanceMatch ? '✅ YES' : '❌ NO'}`);
      console.log(`   Total Spent Match: ${spentMatch ? '✅ YES' : '❌ NO'}`);
      
      if (balanceMatch && spentMatch) {
        console.log(`\n🎉 PERFECT MATCH - Data is correct!`);
      } else {
        console.log(`\n⚠️  MISMATCH DETECTED`);
        if (!balanceMatch) {
          console.log(`   Balance diff: €${Math.abs(calculatedBalance - parseFloat(account.balance))}`);
        }
        if (!spentMatch) {
          console.log(`   Total spent diff: €${Math.abs(calculatedTotalSpent - parseFloat(account.total_spent))}`);
        }
      }
    } else {
      console.log(`\n❌ No student_accounts record found!`);
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

// Test multiple users
const testUsers = [
  'ozibenturk@gmail.com',
  'bugrabenturk@gmail.com', 
  'caganer@gmail.com',
  'hulyaaysel@gmail.com'
];

async function main() {
  for (const email of testUsers) {
    await verifyUserFinancials(email);
    console.log('\n' + '='.repeat(80));
  }
}

main().catch(console.error);