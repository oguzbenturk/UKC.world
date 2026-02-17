/**
 * Seed Waiver Versions Script
 * 
 * Populates the waiver_versions table with initial waiver content.
 * Run this script after database migrations are complete.
 * 
 * Usage:
 *   node backend/db/scripts/seed-waiver-versions.js
 * 
 * Or from root:
 *   node backend/db/scripts/seed-waiver-versions.js
 */

import pkg from 'pg';
const { Pool } = pkg;
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

// Load environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Try both backend/.env and root .env
const backendEnvPath = resolve(__dirname, '../../.env');
const rootEnvPath = resolve(__dirname, '../../../.env');

// Load backend .env first (priority)
dotenv.config({ path: backendEnvPath });
// Then load root .env (if different)
dotenv.config({ path: rootEnvPath });

// Import waiver content
import waiverContentModule from '../../config/waiverContent.js';
const { 
  getFormattedWaiverText, 
  WAIVER_VERSION,
  WAIVER_LANGUAGE,
  COMPANY_NAME 
} = waiverContentModule;

// Database connection
// Use LOCAL_DATABASE_URL for running locally against production database
const connectionString = process.env.LOCAL_DATABASE_URL || process.env.DATABASE_URL;

if (!connectionString) {
  console.error('❌ Error: No database connection string found!');
  console.error('   Please set LOCAL_DATABASE_URL or DATABASE_URL in backend/.env');
  process.exit(1);
}

const pool = new Pool({
  connectionString,
  ssl: false, // Disable SSL for local connection to production DB
});

/**
 * Check if waiver version already exists
 */
async function checkWaiverExists(client, versionNumber, languageCode) {
  const result = await client.query(
    `SELECT id, version_number, language_code, is_active 
     FROM waiver_versions 
     WHERE version_number = $1 AND language_code = $2`,
    [versionNumber, languageCode]
  );
  return result.rows[0] || null;
}

/**
 * Deactivate all previous waiver versions for a given language
 */
async function deactivatePreviousVersions(client, languageCode) {
  const result = await client.query(
    `UPDATE waiver_versions 
     SET is_active = false 
     WHERE language_code = $1 AND is_active = true
     RETURNING id, version_number`,
    [languageCode]
  );
  
  if (result.rowCount > 0) {
    console.log(`  ℹ️  Deactivated ${result.rowCount} previous version(s) for language: ${languageCode}`);
    result.rows.forEach(row => {
      console.log(`     - Version ${row.version_number} (ID: ${row.id})`);
    });
  }
}

/**
 * Insert waiver version into database
 */
async function insertWaiverVersion(client, versionData) {
  const query = `
    INSERT INTO waiver_versions (
      version_number,
      language_code,
      content,
      is_active,
      effective_date,
      created_by
    ) VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING id, version_number, language_code, is_active, effective_date
  `;

  const values = [
    versionData.versionNumber,
    versionData.languageCode,
    versionData.content,
    versionData.isActive,
    versionData.effectiveDate,
    versionData.createdBy || null, // NULL for system-seeded waivers
  ];

  const result = await client.query(query, values);
  return result.rows[0];
}

/**
 * Main seeding function
 */
async function seedWaiverVersions() {
  const client = await pool.connect();
  
  try {
    console.log('\n🌱 Seeding Waiver Versions...\n');
    console.log(`📋 Company: ${COMPANY_NAME}`);
    console.log(`📄 Version: ${WAIVER_VERSION}`);
    console.log(`🌐 Language: ${WAIVER_LANGUAGE}\n`);

    await client.query('BEGIN');

    // Generate full waiver text with all sections
    const waiverText = getFormattedWaiverText(true); // Include minor section

    // Check if waiver already exists
    const existingWaiver = await checkWaiverExists(
      client, 
      WAIVER_VERSION, 
      WAIVER_LANGUAGE
    );

    if (existingWaiver) {
      console.log(`⚠️  Waiver version ${WAIVER_VERSION} (${WAIVER_LANGUAGE}) already exists!`);
      console.log(`   ID: ${existingWaiver.id}`);
      console.log(`   Active: ${existingWaiver.is_active ? 'Yes' : 'No'}`);
      console.log('\n❓ What would you like to do?');
      console.log('   1. Skip (keep existing waiver)');
      console.log('   2. Update content (keep same version)');
      console.log('   3. Abort\n');
      
      // For now, skip if exists (in production, implement interactive prompt)
      console.log('   → Skipping (waiver already exists)\n');
      await client.query('ROLLBACK');
      return { skipped: true, reason: 'Waiver already exists' };
    }

    // Deactivate previous versions before inserting new one
    await deactivatePreviousVersions(client, WAIVER_LANGUAGE);

    // Prepare waiver data
    const waiverData = {
      versionNumber: WAIVER_VERSION,
      languageCode: WAIVER_LANGUAGE,
      content: waiverText,
      isActive: true,
      effectiveDate: new Date('2025-11-01'), // Update this date as needed
      createdBy: null, // System-created waiver (no user)
    };

    // Insert English waiver
    console.log(`\n✅ Inserting waiver version ${WAIVER_VERSION} (${WAIVER_LANGUAGE})...`);
    const insertedWaiver = await insertWaiverVersion(client, waiverData);
    
    console.log('\n✨ Waiver Inserted Successfully!');
    console.log(`   ID: ${insertedWaiver.id}`);
    console.log(`   Version: ${insertedWaiver.version_number}`);
    console.log(`   Language: ${insertedWaiver.language_code}`);
    console.log(`   Active: ${insertedWaiver.is_active ? 'Yes' : 'No'}`);
    console.log(`   Effective Date: ${insertedWaiver.effective_date.toISOString().split('T')[0]}`);
    console.log(`   Content Length: ${waiverText.length} characters\n`);

    // TODO: Add Turkish translation when available
    // const turkishWaiverExists = await checkWaiverExists(client, WAIVER_VERSION, 'tr');
    // if (!turkishWaiverExists) {
    //   console.log('📝 Turkish translation not yet available.');
    //   console.log('   Update backend/config/waiverContent.js to add Turkish content.\n');
    // }

    await client.query('COMMIT');
    
    console.log('✅ Seeding Complete!\n');
    console.log('📊 Summary:');
    console.log(`   - Inserted: 1 waiver version`);
    console.log(`   - Active: Yes`);
    console.log(`   - Language: English (en)`);
    console.log('\n🔍 Verification Steps:');
    console.log('   1. Run: SELECT * FROM waiver_versions WHERE is_active = true;');
    console.log('   2. Verify content length matches expected');
    console.log('   3. Check effective_date is correct');
    console.log('   4. Test waiver retrieval via API: GET /api/compliance/waiver-template\n');

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('\n❌ Error seeding waiver versions:', error);
    console.error('\nStack trace:', error.stack);
    process.exit(1);
  } finally {
    client.release();
    // Don't close pool here - will be closed after verification
  }
}

/**
 * Verify waiver was inserted correctly
 */
async function verifyWaiver() {
  const client = await pool.connect();
  
  try {
    console.log('\n🔍 Verifying Waiver in Database...\n');
    
    const result = await client.query(
      `SELECT 
        id, 
        version_number, 
        language_code, 
        is_active, 
        effective_date,
        LENGTH(content) as content_length,
        created_at
       FROM waiver_versions 
       WHERE version_number = $1 AND language_code = $2`,
      [WAIVER_VERSION, WAIVER_LANGUAGE]
    );

    if (result.rows.length === 0) {
      console.log('❌ Waiver not found in database!\n');
      return false;
    }

    const waiver = result.rows[0];
    console.log('✅ Waiver Found:');
    console.log(`   ID: ${waiver.id}`);
    console.log(`   Version: ${waiver.version_number}`);
    console.log(`   Language: ${waiver.language_code}`);
    console.log(`   Active: ${waiver.is_active ? 'Yes ✓' : 'No ✗'}`);
    console.log(`   Effective Date: ${waiver.effective_date.toISOString().split('T')[0]}`);
    console.log(`   Content Length: ${waiver.content_length} characters`);
    console.log(`   Created At: ${waiver.created_at.toISOString()}\n`);

    // Check if it's the active version
    const activeCheck = await client.query(
      `SELECT COUNT(*) as active_count 
       FROM waiver_versions 
       WHERE language_code = $1 AND is_active = true`,
      [WAIVER_LANGUAGE]
    );

    const activeCount = parseInt(activeCheck.rows[0].active_count, 10);
    if (activeCount === 1) {
      console.log(`✅ Exactly 1 active waiver for language '${WAIVER_LANGUAGE}' (correct)\n`);
    } else {
      console.log(`⚠️  Warning: ${activeCount} active waivers found for language '${WAIVER_LANGUAGE}'`);
      console.log(`   Expected: 1\n`);
    }

    return true;

  } catch (error) {
    console.error('❌ Error verifying waiver:', error);
    return false;
  } finally {
    client.release();
  }
}

// Run seeding
console.log('═══════════════════════════════════════════════════════════');
console.log('  Plannivo Waiver Versions Seeding Script');
console.log('═══════════════════════════════════════════════════════════');

seedWaiverVersions()
  .then((result) => {
    if (result && result.skipped) {
      console.log(`\n✅ Waiver already exists in database. No action needed.\n`);
      return verifyWaiver();
    }
    return verifyWaiver();
  })
  .then((verified) => {
    if (verified) {
      console.log('✅ Seeding and Verification Complete!\n');
      process.exit(0);
    } else {
      console.log('⚠️  Seeding complete but verification failed.\n');
      process.exit(1);
    }
  })
  .catch((error) => {
    console.error('\n💥 Fatal error:', error);
    process.exit(1);
  })
  .finally(() => {
    pool.end();
  });
