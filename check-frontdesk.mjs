import { pool } from './backend/db.js';

async function main() {
  try {
    // 1. Check all roles
    console.log('\n=== ALL ROLES ===');
    const roles = await pool.query('SELECT id, name, description, permissions FROM roles ORDER BY name');
    roles.rows.forEach(row => {
      console.log(`Role: ${row.name} (${row.id})`);
      console.log(`  Permissions: ${row.permissions ? Object.keys(row.permissions).length : 0} permissions`);
      if (row.permissions) {
        Object.keys(row.permissions).forEach(p => console.log(`    - ${p}: ${row.permissions[p]}`));
      }
    });

    // 2. Check Front Desk users
    console.log('\n=== FRONT DESK USERS ===');
    const users = await pool.query(`
      SELECT u.id, u.email, u.first_name, u.last_name, u.role_id, r.name as role_name 
      FROM users u 
      LEFT JOIN roles r ON u.role_id = r.id 
      WHERE r.name ILIKE '%front%'
    `);
    if (users.rows.length === 0) {
      console.log('NO USERS FOUND with Front Desk role!');
    } else {
      users.rows.forEach(row => {
        console.log(`User: ${row.email} (${row.first_name} ${row.last_name})`);
        console.log(`  User ID: ${row.id}`);
        console.log(`  Role ID: ${row.role_id}`);
        console.log(`  Role Name: ${row.role_name}`);
      });
    }

    // 3. Check what role column contains in users table
    console.log('\n=== CHECKING USER TABLE STRUCTURE ===');
    const columns = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'users' AND column_name IN ('role', 'role_id')
    `);
    columns.rows.forEach(row => {
      console.log(`Column: ${row.column_name} (${row.data_type})`);
    });

    // 4. Check if there's a 'role' column with old data
    console.log('\n=== CHECKING FOR OLD ROLE COLUMN ===');
    try {
      const oldRoles = await pool.query(`
        SELECT DISTINCT role FROM users WHERE role IS NOT NULL LIMIT 10
      `);
      if (oldRoles.rows.length > 0) {
        console.log('OLD role column values found:');
        oldRoles.rows.forEach(row => console.log(`  - ${row.role}`));
      }
    } catch (e) {
      console.log('No "role" column exists (using role_id foreign key)');
    }

    // 5. Check the specific user that's having issues
    console.log('\n=== RECENT LOGINS ===');
    const recentLogins = await pool.query(`
      SELECT u.id, u.email, u.first_name, r.name as role_name, u.last_login_at
      FROM users u 
      LEFT JOIN roles r ON u.role_id = r.id 
      ORDER BY u.last_login_at DESC NULLS LAST
      LIMIT 5
    `);
    recentLogins.rows.forEach(row => {
      console.log(`${row.email} - Role: ${row.role_name} - Last login: ${row.last_login_at}`);
    });

    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

main();
