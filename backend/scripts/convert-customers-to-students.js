#!/usr/bin/env node

/**
 * Convert customers with bookings to student role
 * Any user who has booked a lesson or rental service should be a student
 */

import { pool } from '../db.js';

async function convertCustomersToStudents() {
  const client = await pool.connect();
  
  try {
    console.log('🔍 Finding customers who should be students...');
    
    // Get the student role ID
    const { rows: [studentRole] } = await client.query(`
      SELECT id FROM roles WHERE name = 'student'
    `);
    
    if (!studentRole) {
      console.error('❌ Student role not found in database!');
      throw new Error('Student role not found');
    }
    
    console.log(`✅ Student role ID: ${studentRole.id}`);
    
    // Find all users who have bookings but are not students
    const { rows: customersWithBookings } = await client.query(`
      SELECT DISTINCT 
        u.id,
        u.email,
        u.name,
        r.name as current_role,
        COUNT(b.id) as booking_count
      FROM users u
      LEFT JOIN roles r ON r.id = u.role_id
      LEFT JOIN bookings b ON b.student_user_id = u.id
      WHERE r.name != 'student'
        AND r.name != 'instructor'
        AND r.name != 'manager'
        AND r.name != 'admin'
        AND b.id IS NOT NULL
      GROUP BY u.id, u.email, u.name, r.name
      ORDER BY u.name
    `);
    
    if (customersWithBookings.length === 0) {
      console.log('✅ No customers need to be converted to students');
      return;
    }
    
    console.log(`\n📋 Found ${customersWithBookings.length} customers with bookings:\n`);
    customersWithBookings.forEach(user => {
      console.log(`   ${user.name} (${user.email}) - ${user.booking_count} bookings - Current role: ${user.current_role}`);
    });
    
    console.log('\n🔄 Converting to student role...\n');
    
    // Update all these users to student role
    const userIds = customersWithBookings.map(u => u.id);
    
    const { rowCount } = await client.query(`
      UPDATE users
      SET role_id = $1,
          updated_at = NOW()
      WHERE id = ANY($2::uuid[])
    `, [studentRole.id, userIds]);
    
    console.log(`✅ Converted ${rowCount} users to student role\n`);
    
    // Also check for any users with rental bookings
    const { rows: customersWithRentals } = await client.query(`
      SELECT DISTINCT 
        u.id,
        u.email,
        u.name,
        r.name as current_role,
        COUNT(er.id) as rental_count
      FROM users u
      LEFT JOIN roles r ON r.id = u.role_id
      LEFT JOIN equipment_rentals er ON er.customer_id = u.id
      WHERE r.name != 'student'
        AND r.name != 'instructor'
        AND r.name != 'manager'
        AND r.name != 'admin'
        AND er.id IS NOT NULL
        AND u.id != ALL($1::uuid[])
      GROUP BY u.id, u.email, u.name, r.name
      ORDER BY u.name
    `, [userIds]);
    
    if (customersWithRentals.length > 0) {
      console.log(`📋 Found ${customersWithRentals.length} additional customers with rentals:\n`);
      customersWithRentals.forEach(user => {
        console.log(`   ${user.name} (${user.email}) - ${user.rental_count} rentals - Current role: ${user.current_role}`);
      });
      
      const rentalUserIds = customersWithRentals.map(u => u.id);
      
      const { rowCount: rentalRowCount } = await client.query(`
        UPDATE users
        SET role_id = $1,
            updated_at = NOW()
        WHERE id = ANY($2::uuid[])
      `, [studentRole.id, rentalUserIds]);
      
      console.log(`\n✅ Converted ${rentalRowCount} rental customers to student role\n`);
    }
    
    // Show summary
    console.log('\n📊 Summary:');
    
    const { rows: roleCounts } = await client.query(`
      SELECT 
        r.name as role,
        COUNT(*) as user_count
      FROM users u
      LEFT JOIN roles r ON r.id = u.role_id
      GROUP BY r.name
      ORDER BY 
        CASE r.name
          WHEN 'admin' THEN 1
          WHEN 'manager' THEN 2
          WHEN 'instructor' THEN 3
          WHEN 'student' THEN 4
          ELSE 5
        END
    `);
    
    console.log('\nUser distribution by role:');
    roleCounts.forEach(rc => {
      console.log(`   ${rc.role}: ${rc.user_count} users`);
    });
    
    console.log('\n✨ Done!\n');
    
  } catch (error) {
    console.error('❌ Error converting customers to students:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

// Run the conversion
convertCustomersToStudents()
  .then(() => {
    console.log('Script completed successfully');
  })
  .catch(err => {
    console.error('Fatal error:', err);
    throw err;
  });
