/**
 * FORCE RESET - Clears ALL data, creates admin
 * Run from backend folder: node force-reset.cjs
 */

const pg = require('pg');
const bcrypt = require('bcrypt');
const { v4: uuidv4 } = require('uuid');

const connectionString = 'postgresql://plannivo:WHMgux86@plannivo.com:5432/plannivo';
const pool = new pg.Pool({ connectionString });

const ADMIN_EMAIL = 'admin@plannivo.com';
const ADMIN_PASSWORD = 'asdasd35';

async function forceReset() {
  console.log('');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('              FORCE DATABASE RESET                              ');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('');
  
  // Step 1: Get all tables
  console.log('📋 Getting tables...');
  const tablesResult = await pool.query(`
    SELECT tablename FROM pg_tables 
    WHERE schemaname = 'public' 
    AND tablename NOT IN ('migrations', 'schema_migrations')
  `);
  const tables = tablesResult.rows.map(r => r.tablename);
  console.log(`   Found ${tables.length} tables`);
  
  // Step 2: Disable FK and truncate
  console.log('');
  console.log('🗑️  Truncating all tables...');
  await pool.query('SET session_replication_role = replica');
  
  for (const table of tables) {
    try {
      await pool.query(`TRUNCATE TABLE "${table}" CASCADE`);
      process.stdout.write('.');
    } catch (e) {
      process.stdout.write('x');
    }
  }
  console.log(' Done!');
  
  await pool.query('SET session_replication_role = DEFAULT');
  
  // Verify truncation
  const userCount = await pool.query('SELECT COUNT(*) FROM users');
  console.log(`   Users after truncate: ${userCount.rows[0].count}`);
  
  // Step 3: Reset sequences
  console.log('');
  console.log('🔄 Resetting sequences...');
  const seqResult = await pool.query(`
    SELECT sequence_name FROM information_schema.sequences 
    WHERE sequence_schema = 'public'
  `);
  for (const seq of seqResult.rows) {
    try {
      await pool.query(`ALTER SEQUENCE "${seq.sequence_name}" RESTART WITH 1`);
    } catch (e) {}
  }
  console.log('   ✅ Done');
  
  // Step 4: Create roles
  console.log('');
  console.log('👥 Creating roles...');
  const roles = ['admin', 'manager', 'instructor', 'student', 'outsider', 'trusted_customer'];
  for (const roleName of roles) {
    try {
      await pool.query(
        `INSERT INTO roles (id, name, description, created_at, updated_at) 
         VALUES ($1, $2, $3, NOW(), NOW()) 
         ON CONFLICT (name) DO NOTHING`,
        [uuidv4(), roleName, `${roleName} role`]
      );
    } catch (e) {}
  }
  console.log('   ✅ Roles created');
  
  // Step 5: Get admin role ID
  const adminRole = await pool.query("SELECT id FROM roles WHERE name = 'admin'");
  if (adminRole.rows.length === 0) {
    console.error('❌ Could not find admin role!');
    await pool.end();
    return;
  }
  const adminRoleId = adminRole.rows[0].id;
  
  // Step 6: Create admin user
  console.log('');
  console.log('👑 Creating admin user...');
  const hashedPassword = await bcrypt.hash(ADMIN_PASSWORD, 10);
  
  await pool.query(`
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
  
  // Step 7: Create waiver template (optional)
  console.log('');
  console.log('📝 Creating waiver template...');
  try {
    await pool.query(`
      INSERT INTO waiver_templates (
        id, version_number, language_code, title, content, 
        is_active, created_at, updated_at
      ) VALUES (
        $1, '1.0', 'en', 'Liability Waiver',
        'I acknowledge that water sports activities involve inherent risks.',
        true, NOW(), NOW()
      )
    `, [uuidv4()]);
    console.log('   ✅ Created');
  } catch (e) {
    console.log('   ⚠️  Skipped (may already exist)');
  }
  
  // Final count
  const finalCount = await pool.query('SELECT COUNT(*) FROM users');
  console.log('');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('                    RESET COMPLETE! 🎉                          ');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('');
  console.log(`   Total users now: ${finalCount.rows[0].count}`);
  console.log('');
  console.log('   Login with:');
  console.log(`      📧 Email: ${ADMIN_EMAIL}`);
  console.log(`      🔑 Password: ${ADMIN_PASSWORD}`);
  console.log('');
  
  await pool.end();
}

forceReset().catch(err => {
  console.error('❌ Error:', err.message);
  pool.end();
  process.exit(1);
});
