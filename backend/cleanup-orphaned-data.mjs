import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
});

async function cleanupOrphanedData() {
  const client = await pool.connect();
  
  try {
    console.log('🧹 Starting cleanup of orphaned user data...\n');
    
    await client.query('BEGIN');
    
    const tables = [
      { name: 'api_keys', column: 'user_id' },
      { name: 'audit_logs', column: 'user_id' },
      { name: 'booking_custom_commissions', column: 'instructor_id' },
      { name: 'booking_participants', column: 'user_id' },
      { name: 'bookings', column: 'customer_user_id' },
      { name: 'bookings', column: 'instructor_user_id' },
      { name: 'bookings', column: 'student_user_id' },
      { name: 'customer_packages', column: 'customer_id' },
      { name: 'event_registrations', column: 'user_id' },
      { name: 'family_members', column: 'parent_user_id' },
      { name: 'financial_events', column: 'user_id' },
      { name: 'instructor_service_commissions', column: 'instructor_id' },
      { name: 'instructor_services', column: 'instructor_id' },
      { name: 'instructor_earnings', column: 'instructor_id' },
      { name: 'liability_waivers', column: 'user_id' },
      { name: 'member_purchases', column: 'user_id' },
      { name: 'notifications', column: 'user_id' },
      { name: 'password_reset_tokens', column: 'user_id' },
      { name: 'payment_intents', column: 'user_id' },
      { name: 'rentals', column: 'user_id' },
      { name: 'student_accounts', column: 'user_id' },
      { name: 'transactions', column: 'user_id' },
      { name: 'user_consents', column: 'user_id' },
      { name: 'user_preferences', column: 'user_id' },
      { name: 'user_sessions', column: 'user_id' },
      { name: 'wallet_balances', column: 'user_id' },
      { name: 'wallet_transactions', column: 'user_id' },
    ];
    
    let totalOrphaned = 0;
    
    for (const table of tables) {
      const checkQuery = `
        SELECT COUNT(*) as count 
        FROM ${table.name} 
        WHERE ${table.column} NOT IN (SELECT id FROM users)
      `;
      
      const checkResult = await client.query(checkQuery);
      const orphanedCount = parseInt(checkResult.rows[0].count);
      
      if (orphanedCount > 0) {
        console.log(`📊 Found ${orphanedCount} orphaned records in ${table.name}`);
        
        const deleteQuery = `
          DELETE FROM ${table.name} 
          WHERE ${table.column} NOT IN (SELECT id FROM users)
        `;
        
        const deleteResult = await client.query(deleteQuery);
        console.log(`   ✅ Deleted ${deleteResult.rowCount} records from ${table.name}`);
        totalOrphaned += deleteResult.rowCount;
      } else {
        console.log(`✓ No orphaned records in ${table.name}`);
      }
    }
    
    // Special case: bookings (multiple user columns)
    console.log('\n📊 Checking bookings for orphaned references...');
    const bookingsQuery = `
      DELETE FROM bookings 
      WHERE customer_user_id NOT IN (SELECT id FROM users)
         OR student_user_id NOT IN (SELECT id FROM users)
         OR instructor_user_id NOT IN (SELECT id FROM users)
      RETURNING id
    `;
    const bookingsResult = await client.query(bookingsQuery);
    if (bookingsResult.rowCount > 0) {
      console.log(`   ✅ Deleted ${bookingsResult.rowCount} orphaned bookings`);
      totalOrphaned += bookingsResult.rowCount;
    } else {
      console.log('✓ No orphaned bookings');
    }
    
    // Special case: instructor_earnings
    console.log('\n📊 Checking instructor_earnings...');
    const earningsQuery = `
      DELETE FROM instructor_earnings 
      WHERE instructor_id NOT IN (SELECT id FROM users)
         OR booking_id NOT IN (SELECT id FROM bookings)
      RETURNING id
    `;
    const earningsResult = await client.query(earningsQuery);
    if (earningsResult.rowCount > 0) {
      console.log(`   ✅ Deleted ${earningsResult.rowCount} orphaned instructor_earnings`);
      totalOrphaned += earningsResult.rowCount;
    } else {
      console.log('✓ No orphaned instructor_earnings');
    }
    
    // Special case: audit_logs (two user columns)
    console.log('\n📊 Checking audit_logs...');
    const auditQuery = `
      DELETE FROM audit_logs 
      WHERE user_id NOT IN (SELECT id FROM users)
         OR target_user_id NOT IN (SELECT id FROM users)
      RETURNING id
    `;
    const auditResult = await client.query(auditQuery);
    if (auditResult.rowCount > 0) {
      console.log(`   ✅ Deleted ${auditResult.rowCount} orphaned audit_logs`);
      totalOrphaned += auditResult.rowCount;
    } else {
      console.log('✓ No orphaned audit_logs');
    }
    
    await client.query('COMMIT');
    
    console.log(`\n✨ Cleanup complete! Total orphaned records removed: ${totalOrphaned}`);
    
    // Check for soft-deleted users that might need attention
    console.log('\n📋 Checking for soft-deleted users...');
    const softDeletedQuery = `
      SELECT id, email, deleted_at, original_email 
      FROM users 
      WHERE deleted_at IS NOT NULL
      ORDER BY deleted_at DESC
      LIMIT 10
    `;
    const softDeleted = await client.query(softDeletedQuery);
    
    if (softDeleted.rows.length > 0) {
      console.log(`\n⚠️  Found ${softDeleted.rows.length} soft-deleted users (showing up to 10):`);
      softDeleted.rows.forEach(user => {
        console.log(`   - ID: ${user.id}`);
        console.log(`     Email: ${user.email}`);
        console.log(`     Original: ${user.original_email || 'N/A'}`);
        console.log(`     Deleted: ${user.deleted_at}`);
        console.log('');
      });
      console.log('💡 These are soft-deleted and will allow email reuse for new registrations.');
    } else {
      console.log('✓ No soft-deleted users found');
    }
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error during cleanup:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

cleanupOrphanedData()
  .then(() => {
    console.log('\n✅ Cleanup script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Cleanup script failed:', error);
    process.exit(1);
  });
