#!/usr/bin/env node
/**
 * RESET DATA ONLY - Keeps Schema, Clears All Data
 * 
 * ⚠️  WARNING: This will DELETE ALL DATA in the database!
 * Make sure you're NOT connected to production!
 * 
 * Usage: node reset-data-only.mjs
 */

import pg from 'pg';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';

const { Pool } = pg;

// Database connection from environment or defaults
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'plannivo',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
});

// Admin credentials
const ADMIN_EMAIL = 'admin@plannivo.com';
const ADMIN_PASSWORD = 'asdasd35';

async function resetDatabase() {
  const client = await pool.connect();
  
  try {
    console.log('');
    console.log('╔════════════════════════════════════════════════════════════════╗');
    console.log('║            DATABASE DATA RESET (SCHEMA PRESERVED)              ║');
    console.log('╚════════════════════════════════════════════════════════════════╝');
    console.log('');
    
    // Show current database info
    const dbInfo = await client.query('SELECT current_database(), current_user');
    console.log(`   📦 Database: ${dbInfo.rows[0].current_database}`);
    console.log(`   👤 User: ${dbInfo.rows[0].current_user}`);
    console.log('');
    
    // Safety check - count existing users
    const userCount = await client.query('SELECT COUNT(*) FROM users');
    console.log(`   ⚠️  Current users in database: ${userCount.rows[0].count}`);
    console.log('');
    
    // Get all tables
    const tablesResult = await client.query(`
      SELECT tablename FROM pg_tables 
      WHERE schemaname = 'public' 
      AND tablename NOT LIKE 'pg_%'
      AND tablename NOT LIKE 'migrations%'
      ORDER BY tablename
    `);
    
    const tables = tablesResult.rows.map(r => r.tablename);
    console.log(`   📋 Found ${tables.length} tables to truncate`);
    console.log('');
    
    await client.query('BEGIN');
    
    // Disable triggers temporarily
    await client.query('SET session_replication_role = replica');
    
    // Truncate all tables
    console.log('   🗑️  Truncating tables...');
    for (const table of tables) {
      try {
        await client.query(`TRUNCATE TABLE "${table}" CASCADE`);
        process.stdout.write('.');
      } catch (err) {
        // Skip if table doesn't exist or other issues
      }
    }
    console.log(' Done!');
    
    // Re-enable triggers
    await client.query('SET session_replication_role = DEFAULT');
    
    // Reset all sequences
    console.log('   🔄 Resetting sequences...');
    const sequencesResult = await client.query(`
      SELECT sequence_name FROM information_schema.sequences 
      WHERE sequence_schema = 'public'
    `);
    for (const seq of sequencesResult.rows) {
      try {
        await client.query(`ALTER SEQUENCE "${seq.sequence_name}" RESTART WITH 1`);
      } catch (err) {
        // Skip if issues
      }
    }
    console.log('   ✅ Sequences reset');
    
    // ═══════════════════════════════════════════════════════════════
    // CREATE DEFAULT ROLES
    // ═══════════════════════════════════════════════════════════════
    console.log('');
    console.log('   👥 Creating default roles...');
    
    const roles = [
      { id: uuidv4(), name: 'admin', description: 'Full system access' },
      { id: uuidv4(), name: 'manager', description: 'Business management access' },
      { id: uuidv4(), name: 'instructor', description: 'Instructor access' },
      { id: uuidv4(), name: 'student', description: 'Student access' },
      { id: uuidv4(), name: 'outsider', description: 'New/unverified user' },
      { id: uuidv4(), name: 'trusted_customer', description: 'Verified trusted customer' },
    ];
    
    let adminRoleId = null;
    for (const role of roles) {
      await client.query(
        `INSERT INTO roles (id, name, description, created_at, updated_at) 
         VALUES ($1, $2, $3, NOW(), NOW())
         ON CONFLICT (name) DO UPDATE SET description = $3`,
        [role.id, role.name, role.description]
      );
      if (role.name === 'admin') adminRoleId = role.id;
    }
    
    // Get admin role ID if it was already there
    if (!adminRoleId) {
      const roleResult = await client.query("SELECT id FROM roles WHERE name = 'admin'");
      adminRoleId = roleResult.rows[0]?.id;
    }
    
    console.log('   ✅ Roles created: admin, manager, instructor, student, outsider, trusted_customer');
    
    // ═══════════════════════════════════════════════════════════════
    // CREATE ADMIN USER
    // ═══════════════════════════════════════════════════════════════
    console.log('');
    console.log('   👑 Creating admin user...');
    
    const hashedPassword = await bcrypt.hash(ADMIN_PASSWORD, 10);
    const adminId = uuidv4();
    
    await client.query(`
      INSERT INTO users (
        id, email, password_hash, first_name, last_name, 
        role_id, is_active, email_verified, preferred_currency,
        created_at, updated_at
      ) VALUES (
        $1, $2, $3, 'System', 'Administrator',
        $4, true, true, 'EUR',
        NOW(), NOW()
      )
    `, [adminId, ADMIN_EMAIL, hashedPassword, adminRoleId]);
    
    console.log(`   ✅ Admin created: ${ADMIN_EMAIL}`);
    console.log(`   🔑 Password: ${ADMIN_PASSWORD}`);
    
    // ═══════════════════════════════════════════════════════════════
    // CREATE DEFAULT SETTINGS
    // ═══════════════════════════════════════════════════════════════
    console.log('');
    console.log('   ⚙️  Creating default settings...');
    
    // Check if settings table exists and create default business settings
    try {
      await client.query(`
        INSERT INTO settings (id, key, value, category, created_at, updated_at)
        VALUES 
          ($1, 'business_name', '"Plannivo Water Sports"', 'business', NOW(), NOW()),
          ($2, 'business_email', '"info@plannivo.com"', 'business', NOW(), NOW()),
          ($3, 'default_currency', '"EUR"', 'business', NOW(), NOW()),
          ($4, 'supported_currencies', '["EUR", "TRY", "USD", "GBP"]', 'business', NOW(), NOW()),
          ($5, 'booking_requires_approval', 'false', 'booking', NOW(), NOW()),
          ($6, 'working_hours_start', '8', 'business', NOW(), NOW()),
          ($7, 'working_hours_end', '18', 'business', NOW(), NOW())
        ON CONFLICT (key) DO NOTHING
      `, [uuidv4(), uuidv4(), uuidv4(), uuidv4(), uuidv4(), uuidv4(), uuidv4()]);
      console.log('   ✅ Default settings created');
    } catch (err) {
      console.log('   ⚠️  Settings table may not exist or has different schema');
    }
    
    // ═══════════════════════════════════════════════════════════════
    // CREATE DEFAULT WAIVER TEMPLATE
    // ═══════════════════════════════════════════════════════════════
    console.log('');
    console.log('   📝 Creating default waiver template...');
    
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
        ON CONFLICT DO NOTHING
      `, [uuidv4()]);
      console.log('   ✅ Waiver template created (v1.0)');
    } catch (err) {
      console.log('   ⚠️  Waiver template may already exist');
    }
    
    await client.query('COMMIT');
    
    console.log('');
    console.log('╔════════════════════════════════════════════════════════════════╗');
    console.log('║                    RESET COMPLETE! 🎉                          ║');
    console.log('╚════════════════════════════════════════════════════════════════╝');
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
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('');
    console.error('❌ Reset failed:', error.message);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

// Run
resetDatabase().catch(err => {
  console.error(err);
  process.exit(1);
});
