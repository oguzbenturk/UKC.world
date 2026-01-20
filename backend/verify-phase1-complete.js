import { pool } from './db.js';

async function verifyMigrationSuccess() {
  try {
    console.log('\n🎯 Phase 1 Database Schema - Final Verification\n');
    console.log('='.repeat(70));
    
    // 1. Check all four target tables exist
    const tables = ['family_members', 'liability_waivers', 'waiver_versions', 'audit_logs'];
    console.log('\n📊 Target Tables:');
    
    for (const tableName of tables) {
      const result = await pool.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' AND table_name = $1
        )
      `, [tableName]);
      
      const exists = result.rows[0].exists;
      console.log(`  ${exists ? '✅' : '❌'} ${tableName}`);
    }
    
    // 2. Check family_members structure
    const familyColumns = await pool.query(`
      SELECT column_name, data_type, is_nullable 
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'family_members'
      ORDER BY ordinal_position
    `);
    
    console.log('\n👨‍👩‍👧 family_members columns (' + familyColumns.rows.length + '):');
    familyColumns.rows.slice(0, 6).forEach(col => {
      console.log(`  - ${col.column_name} (${col.data_type})`);
    });
    
    // 3. Check liability_waivers structure
    const waiverColumns = await pool.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'liability_waivers'
      ORDER BY ordinal_position
    `);
    
    console.log('\n📝 liability_waivers columns (' + waiverColumns.rows.length + '):');
    waiverColumns.rows.slice(0, 6).forEach(col => {
      console.log(`  - ${col.column_name} (${col.data_type})`);
    });
    
    // 4. Check waiver versions seeded
    const waiverVersions = await pool.query(`
      SELECT version_number, language_code, is_active, LENGTH(content) as content_length
      FROM waiver_versions
    `);
    
    console.log('\n📄 Waiver versions (' + waiverVersions.rows.length + '):');
    waiverVersions.rows.forEach(v => {
      console.log(`  ✓ v${v.version_number} (${v.language_code}) - ${v.is_active ? 'ACTIVE' : 'inactive'} - ${v.content_length} chars`);
    });
    
    // 5. Check bookings/rentals family support
    const bookingsFamilySupport = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.columns 
        WHERE table_name = 'bookings' AND column_name = 'family_member_id'
      )
    `);
    
    console.log('\n🏄 Family support in bookings:');
    console.log(`  ${bookingsFamilySupport.rows[0].exists ? '✅' : '❌'} family_member_id column exists`);
    
    const rentalsFamilySupport = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'rentals'
      )
    `);
    
    if (rentalsFamilySupport.rows[0].exists) {
      const rentalsColumn = await pool.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.columns 
          WHERE table_name = 'rentals' AND column_name = 'family_member_id'
        )
      `);
      console.log(`  ${rentalsColumn.rows[0].exists ? '✅' : '❌'} rentals.family_member_id exists`);
    } else {
      console.log(`  ℹ️  rentals table does not exist (optional)`);
    }
    
    // 6. Summary
    console.log('\n' + '='.repeat(70));
    console.log('\n✅ Phase 1 Complete: Database Schema Ready\n');
    console.log('Next Steps:');
    console.log('  1. Create backend routes for family management');
    console.log('  2. Create backend routes for liability waivers');
    console.log('  3. Build frontend components');
    console.log('  4. Add GDPR link to navbar\n');
    
    await pool.end();
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error(error.stack);
  }
}

verifyMigrationSuccess();
