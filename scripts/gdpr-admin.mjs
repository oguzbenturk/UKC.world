#!/usr/bin/env node

/**
 * GDPR Admin Tool
 * Helper script for processing GDPR requests via CLI
 * 
 * Usage:
 *   node scripts/gdpr-admin.mjs export user@example.com
 *   node scripts/gdpr-admin.mjs delete user@example.com
 *   node scripts/gdpr-admin.mjs status user@example.com
 */

import { pool } from '../backend/db.js';
import gdprDataExportService from '../backend/services/gdprDataExportService.js';
import fs from 'fs/promises';
import path from 'path';

const [,, command, email] = process.argv;

async function getUserByEmail(email) {
  const { rows } = await pool.query(
    'SELECT id, email, name FROM users WHERE email = $1',
    [email]
  );
  return rows[0];
}

async function exportUserData(email) {
  console.log(`📦 Exporting data for: ${email}`);
  
  const user = await getUserByEmail(email);
  if (!user) {
    console.error('❌ User not found');
    process.exit(1);
  }

  const dataPackage = await gdprDataExportService.exportUserData(user.id);
  
  const filename = `gdpr_export_${user.id}_${Date.now()}.json`;
  const filepath = path.join(process.cwd(), 'exports', filename);
  
  // Ensure exports directory exists
  await fs.mkdir(path.join(process.cwd(), 'exports'), { recursive: true });
  
  await fs.writeFile(filepath, JSON.stringify(dataPackage, null, 2));
  
  console.log('✅ Export completed');
  console.log(`📄 File: ${filepath}`);
  console.log(`📊 Records: ${dataPackage.metadata.recordsIncluded}`);
}

async function deleteUserData(email) {
  console.log(`🗑️  Anonymizing data for: ${email}`);
  console.warn('⚠️  This action is IRREVERSIBLE!');
  
  const user = await getUserByEmail(email);
  if (!user) {
    console.error('❌ User not found');
    process.exit(1);
  }

  console.log(`👤 User: ${user.name} (${user.email})`);
  console.log('');
  console.log('Type "CONFIRM DELETE" to proceed:');
  
  // Read from stdin
  const readline = await import('readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  rl.question('> ', async (answer) => {
    if (answer.trim() === 'CONFIRM DELETE') {
      try {
        const result = await gdprDataExportService.anonymizeUserData(user.id);
        console.log('✅ User data anonymized');
        console.log(`🕐 Anonymized at: ${result.anonymizedAt}`);
        console.log(`📝 Message: ${result.message}`);
      } catch (error) {
        console.error('❌ Anonymization failed:', error.message);
        process.exit(1);
      }
    } else {
      console.log('❌ Deletion cancelled');
    }
    rl.close();
    process.exit(0);
  });
}

async function getUserStatus(email) {
  console.log(`📊 GDPR Status for: ${email}`);
  
  const user = await getUserByEmail(email);
  if (!user) {
    console.error('❌ User not found');
    process.exit(1);
  }

  console.log('');
  console.log('👤 User Information:');
  console.log(`   ID: ${user.id}`);
  console.log(`   Email: ${user.email}`);
  console.log(`   Name: ${user.name}`);
  console.log('');

  // Get consent status
  const { rows: consents } = await pool.query(
    'SELECT * FROM user_consents WHERE user_id = $1',
    [user.id]
  );

  if (consents.length > 0) {
    const consent = consents[0];
    console.log('📜 Consent Status:');
    console.log(`   Terms Version: ${consent.terms_version}`);
    console.log(`   Accepted: ${consent.terms_accepted_at}`);
    console.log(`   Email Marketing: ${consent.marketing_email_opt_in ? '✅' : '❌'}`);
    console.log(`   SMS Marketing: ${consent.marketing_sms_opt_in ? '✅' : '❌'}`);
    console.log(`   WhatsApp Marketing: ${consent.marketing_whatsapp_opt_in ? '✅' : '❌'}`);
  } else {
    console.log('📜 Consent Status: No consent record found');
  }
  console.log('');

  // Get record counts
  const { rows: bookingCount } = await pool.query(
    'SELECT COUNT(*) as count FROM bookings WHERE student_id = $1 OR instructor_id = $1',
    [user.id]
  );
  
  const { rows: transactionCount } = await pool.query(
    'SELECT COUNT(*) as count FROM transactions WHERE customer_id = $1 OR instructor_id = $1',
    [user.id]
  );

  console.log('📊 Data Summary:');
  console.log(`   Bookings: ${bookingCount[0].count}`);
  console.log(`   Transactions: ${transactionCount[0].count}`);
  console.log('');
}

async function main() {
  if (!command || !email) {
    console.log('GDPR Admin Tool');
    console.log('');
    console.log('Usage:');
    console.log('  node scripts/gdpr-admin.mjs export user@example.com');
    console.log('  node scripts/gdpr-admin.mjs delete user@example.com');
    console.log('  node scripts/gdpr-admin.mjs status user@example.com');
    console.log('');
    process.exit(1);
  }

  try {
    switch (command.toLowerCase()) {
      case 'export':
        await exportUserData(email);
        break;
      case 'delete':
        await deleteUserData(email);
        return; // Exit handled by readline
      case 'status':
        await getUserStatus(email);
        break;
      default:
        console.error(`❌ Unknown command: ${command}`);
        process.exit(1);
    }
    
    await pool.end();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    await pool.end();
    process.exit(1);
  }
}

main();
