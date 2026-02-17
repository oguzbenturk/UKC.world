#!/usr/bin/env node

/**
 * Student Portal Balance Investigation
 * Investigating why getStudentOverview returns NULL for balance
 */

import { pool } from '../db.js';
import { getStudentOverview } from '../services/studentPortalService.js';

const BUGRA_USER_ID = '00ce21b8-d345-43ac-9ae8-215e0755e15b';

async function investigateStudentPortal() {
    console.log('🔍 Investigating Student Portal Balance Issue\n');
    
    try {
        // Step 1: Call getStudentOverview and check the raw response
        console.log('📊 Getting Student Overview...');
        const overviewData = await getStudentOverview(BUGRA_USER_ID);
        
        console.log('Raw overview data structure:');
        console.log(JSON.stringify(overviewData, null, 2));
        
        // Step 2: Check if student_accounts table exists and has data
        console.log('\n🔍 Checking student_accounts table directly...');
        const accountCheck = await pool.query(
            'SELECT * FROM student_accounts WHERE user_id = $1',
            [BUGRA_USER_ID]
        );
        
        console.log('Direct student_accounts query result:');
        console.log(accountCheck.rows[0] || 'No record found');
        
        // Step 3: Check the table existence query from the service
        console.log('\n🔍 Checking table existence...');
        const tableCheck = await pool.query(`
            SELECT
                to_regclass('student_accounts') AS student_accounts,
                to_regclass('customer_packages') AS customer_packages,
                to_regclass('student_progress') AS student_progress,
                to_regclass('notifications') AS notifications,
                to_regclass('payment_intents') AS payment_intents,
                to_regclass('transactions') AS transactions,
                to_regclass('booking_participants') AS booking_participants,
                to_regclass('student_support_requests') AS student_support_requests
        `);
        
        console.log('Table existence check:');
        console.log(tableCheck.rows[0]);
        
        // Step 4: Try the profile query manually
        console.log('\n🔍 Testing profile query manually...');
        const profileQuery = `SELECT u.id,
                u.name,
                u.first_name,
                u.last_name,
                u.email,
                u.phone,
                u.level,
                u.profile_image_url,
                u.notes,
                NULL::text AS preferred_currency,
                NULL::numeric AS package_hours,
                NULL::numeric AS remaining_hours,
                NULL::text AS language,
                u.created_at,
                u.updated_at,
                NULL::json AS emergency_contact,
                NULL::json AS communication_preferences,
                sa.balance,
                sa.total_spent,
                sa.last_payment_date,
                sa.user_id AS account_user_id
           FROM users u
          LEFT JOIN student_accounts sa ON sa.user_id = u.id
          WHERE u.id = $1`;
          
        const profileResult = await pool.query(profileQuery, [BUGRA_USER_ID]);
        
        console.log('Manual profile query result:');
        console.log(profileResult.rows[0] || 'No record found');
        
    } catch (error) {
        console.error('❌ Investigation failed:', error.message);
        console.error(error.stack);
    }
}

investigateStudentPortal().then(() => {
    console.log('\n✅ Investigation completed!');
}).catch(error => {
    console.error('💥 Investigation failed:', error);
    throw error;
});