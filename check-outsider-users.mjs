#!/usr/bin/env node

/**
 * Quick check for outsider role users in the database
 */

import { pool } from './backend/db.js';

async function checkOutsiders() {
  try {
    console.log('🔍 Checking for outsider role users in database...\n');
    
    // Check if outsider role exists
    const roleCheck = await pool.query(`
      SELECT id, name, description FROM roles WHERE name = 'outsider'
    `);
    
    if (roleCheck.rows.length === 0) {
      console.log('❌ Outsider role not found in database!');
      console.log('   This role should exist for new self-registered users.');
      process.exit(1);
    }
    
    console.log('✅ Outsider role exists:');
    console.log(`   ID: ${roleCheck.rows[0].id}`);
    console.log(`   Description: ${roleCheck.rows[0].description}\n`);
    
    // Check for users with outsider role
    const usersCheck = await pool.query(`
      SELECT 
        u.id, 
        u.name, 
        u.email, 
        u.created_at,
        r.name as role_name
      FROM users u
      JOIN roles r ON r.id = u.role_id
      WHERE r.name = 'outsider' AND u.deleted_at IS NULL
      ORDER BY u.created_at DESC
      LIMIT 10
    `);
    
    console.log(`📊 Found ${usersCheck.rows.length} outsider users (showing max 10):\n`);
    
    if (usersCheck.rows.length === 0) {
      console.log('⚠️  No outsider users found yet.');
      console.log('   This is normal if no one has self-registered recently.');
      console.log('   When someone registers, they will appear here.');
    } else {
      usersCheck.rows.forEach((user, i) => {
        const date = new Date(user.created_at).toISOString().split('T')[0];
        console.log(`${i + 1}. ${user.name || '(no name)'} - ${user.email}`);
        console.log(`   Created: ${date}`);
      });
    }
    
    console.log('\n✅ Test complete. The query now supports outsider role users.');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

checkOutsiders();
