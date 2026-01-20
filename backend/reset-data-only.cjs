/**
 * RESET DATA ONLY - Keeps Schema, Clears All Data
 * Run from backend folder: node reset-data-only.cjs
 */

const pg = require('pg');
const bcrypt = require('bcrypt');
const { v4: uuidv4 } = require('uuid');

// Use DATABASE_URL from environment or the production connection
const connectionString = process.env.DATABASE_URL || 'postgresql://plannivo:WHMgux86@plannivo.com:5432/plannivo';

const pool = new pg.Pool({
  connectionString,
  ssl: false // Add ssl: { rejectUnauthorized: false } if needed
});

const ADMIN_EMAIL = 'admin@plannivo.com';
const ADMIN_PASSWORD = 'asdasd35';

async function reset() {
  const client = await pool.connect();
  try {
    console.log('');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('         DATABASE DATA RESET (SCHEMA PRESERVED)                 ');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('');
    
    const dbInfo = await client.query('SELECT current_database(), current_user');
    console.log('   📦 Database:', dbInfo.rows[0].current_database);
    console.log('   👤 User:', dbInfo.rows[0].current_user);
    
    const userCount = await client.query('SELECT COUNT(*) FROM users');
    console.log('   📊 Current users:', userCount.rows[0].count);
    console.log('');
    
    // Get all tables except migrations
    const tablesResult = await client.query(`
      SELECT tablename FROM pg_tables 
      WHERE schemaname = 'public' 
      AND tablename NOT LIKE 'pg_%'
      AND tablename NOT IN ('migrations', 'schema_migrations')
      ORDER BY tablename
    `);
    
    const tables = tablesResult.rows.map(r => r.tablename);
    console.log('   📋 Tables to truncate:', tables.length);
    console.log('');
    
    await client.query('BEGIN');
    
    // Disable foreign key checks
    await client.query('SET session_replication_role = replica');
    
    // Truncate all tables
    console.log('   🗑️  Truncating tables...');
    for (const table of tables) {
      try {
        await client.query(`TRUNCATE TABLE "${table}" CASCADE`);
        process.stdout.write('.');
      } catch (e) {
        // Skip errors
      }
    }
    console.log(' Done!');
    
    // Re-enable foreign key checks
    await client.query('SET session_replication_role = DEFAULT');
    
    // Reset sequences
    console.log('   🔄 Resetting sequences...');
    const seqResult = await client.query(`
      SELECT sequence_name FROM information_schema.sequences 
      WHERE sequence_schema = 'public'
    `);
    for (const seq of seqResult.rows) {
      try {
        await client.query(`ALTER SEQUENCE "${seq.sequence_name}" RESTART WITH 1`);
      } catch (e) {}
    }
    console.log('   ✅ Sequences reset');
    
    // Create roles
    console.log('');
    console.log('   👥 Creating default roles...');
    const roles = [
      { name: 'admin', desc: 'Full system access' },
      { name: 'manager', desc: 'Business management access' },
      { name: 'instructor', desc: 'Instructor access' },
      { name: 'student', desc: 'Student access' },
      { name: 'outsider', desc: 'New/unverified user' },
      { name: 'trusted_customer', desc: 'Verified trusted customer' },
    ];
    
    for (const role of roles) {
      await client.query(
        `INSERT INTO roles (id, name, description, created_at, updated_at) 
         VALUES ($1, $2, $3, NOW(), NOW()) 
         ON CONFLICT (name) DO UPDATE SET description = $3`,
        [uuidv4(), role.name, role.desc]
      );
    }
    console.log('   ✅ Roles created');
    
    // Get admin role ID
    const adminRole = await client.query("SELECT id FROM roles WHERE name = 'admin'");
    const adminRoleId = adminRole.rows[0].id;
    
    // Create admin user
    console.log('');
    console.log('   👑 Creating admin user...');
    const hashedPassword = await bcrypt.hash(ADMIN_PASSWORD, 10);
    
    await client.query(`
      INSERT INTO users (
        id, name, email, password_hash, first_name, last_name, 
        role_id, account_status, preferred_currency,
        created_at, updated_at
      ) VALUES (
        $1, 'System Administrator', $2, $3, 'System', 'Administrator',
        $4, 'active', 'EUR',
        NOW(), NOW()
      )
    `, [uuidv4(), ADMIN_EMAIL, hashedPassword, adminRoleId]);
    
    console.log(`   ✅ Admin created: ${ADMIN_EMAIL}`);
    
    // Create waiver template
    console.log('');
    console.log('   📝 Creating waiver template...');
    try {
      await client.query(`
        INSERT INTO waiver_templates (
          id, version_number, language_code, title, content, 
          is_active, created_at, updated_at
        ) VALUES (
          $1, '1.0', 'en', 'Liability Waiver',
          'I acknowledge that water sports activities involve inherent risks. I agree to follow all safety instructions and release the facility from liability for any injuries sustained during activities.',
          true, NOW(), NOW()
        )
      `, [uuidv4()]);
      console.log('   ✅ Waiver template created');
    } catch (e) {
      console.log('   ⚠️  Waiver already exists or table missing');
    }
    
    await client.query('COMMIT');
    
    console.log('');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('                    RESET COMPLETE! 🎉                          ');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('');
    console.log('   🚀 Your database is ready for a fresh start!');
    console.log('');
    console.log('   Login with:');
    console.log(`      📧 Email: ${ADMIN_EMAIL}`);
    console.log(`      🔑 Password: ${ADMIN_PASSWORD}`);
    console.log('');
    console.log('   Next steps as business owner:');
    console.log('      1. Login to the app');
    console.log('      2. Set up your business profile');
    console.log('      3. Add instructors');
    console.log('      4. Create services & packages');
    console.log('      5. Add equipment for rentals');
    console.log('');
    
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('');
    console.error('❌ Reset failed:', err.message);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

reset().catch(err => {
  console.error(err);
  process.exit(1);
});
