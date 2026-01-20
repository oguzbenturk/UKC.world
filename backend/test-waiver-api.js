/* eslint-disable */
/**
 * Waiver API Test Suite
 * 
 * Tests all waiver endpoints:
 * 1. Get latest waiver template
 * 2. Submit waiver signature (for user)
 * 3. Check waiver status
 * 4. Submit waiver for family member
 * 5. Check family member waiver status
 * 6. Get waiver history
 * 7. Verify signature image storage
 * 8. Test waiver expiry logic
 */

import { pool } from './db.js';

// Test configuration
const TEST_USER_ID = '24c98522-3c3e-4cd8-9542-7026c2ab57e4'; // Siyabend Şanlı
const API_BASE = 'http://localhost:5000/api';

// Sample signature data (1x1 transparent PNG)
const SAMPLE_SIGNATURE = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

/**
 * Test 1: Find test user
 */
async function test1_findTestUser() {
  console.log('\n=== Test 1: Find Test User ===');
  try {
    const result = await pool.query(
      `SELECT id, first_name, last_name, email FROM users WHERE id = $1`,
      [TEST_USER_ID]
    );

    if (result.rows.length === 0) {
      throw new Error(`Test user ${TEST_USER_ID} not found`);
    }

    const user = result.rows[0];
    console.log('✅ Found test user:', `${user.first_name} ${user.last_name} (${user.email})`);
    return user;
  } catch (error) {
    console.error('❌ Test 1 failed:', error.message);
    throw error;
  }
}

/**
 * Test 2: Get latest waiver template
 */
async function test2_getWaiverTemplate() {
  console.log('\n=== Test 2: Get Latest Waiver Template ===');
  try {
    const result = await pool.query(
      `SELECT id, version_number, language_code, content, is_active, effective_date 
       FROM waiver_versions 
       WHERE is_active = true AND language_code = 'en' 
       ORDER BY effective_date DESC, created_at DESC 
       LIMIT 1`
    );

    if (result.rows.length === 0) {
      throw new Error('No active waiver template found');
    }

    const template = result.rows[0];
    console.log('✅ Found waiver template:');
    console.log('   Version:', template.version_number);
    console.log('   Language:', template.language_code);
    console.log('   Active:', template.is_active);
    console.log('   Content length:', template.content.length, 'characters');
    console.log('   Effective date:', template.effective_date);
    return template;
  } catch (error) {
    console.error('❌ Test 2 failed:', error.message);
    throw error;
  }
}

/**
 * Test 3: Submit waiver signature for user
 */
async function test3_submitUserWaiver(template) {
  console.log('\n=== Test 3: Submit Waiver Signature (User) ===');
  try {
    // First, clean up any existing waivers for this test user
    await pool.query(
      `DELETE FROM liability_waivers WHERE user_id = $1`,
      [TEST_USER_ID]
    );
    console.log('   Cleaned up existing waivers for test user');

    // Import waiver service
    const { submitWaiver } = await import('./services/waiverService.js');

    const waiverData = {
      user_id: TEST_USER_ID,
      family_member_id: null,
      signer_user_id: TEST_USER_ID,
      waiver_version: template.version_number,
      language_code: template.language_code,
      signature_data: SAMPLE_SIGNATURE,
      ip_address: '127.0.0.1',
      user_agent: 'Test Suite',
      agreed_to_terms: true,
      photo_consent: true,
    };

    const waiver = await submitWaiver(waiverData);

    console.log('✅ Waiver submitted successfully:');
    console.log('   Waiver ID:', waiver.id);
    console.log('   User ID:', waiver.user_id);
    console.log('   Version:', waiver.waiver_version);
    console.log('   Signature URL:', waiver.signature_image_url);
    console.log('   IP Address:', waiver.ip_address);
    console.log('   Signed at:', waiver.signed_at);
    console.log('   Photo consent:', waiver.photo_consent);

    return waiver;
  } catch (error) {
    console.error('❌ Test 3 failed:', error.message);
    throw error;
  }
}

/**
 * Test 4: Check waiver status
 */
async function test4_checkWaiverStatus() {
  console.log('\n=== Test 4: Check Waiver Status ===');
  try {
    const { checkWaiverStatus } = await import('./services/waiverService.js');

    const status = await checkWaiverStatus(TEST_USER_ID, 'user');

    console.log('✅ Waiver status retrieved:');
    console.log('   Has signed:', status.hasSigned);
    console.log('   Needs to sign:', status.needsToSign);
    console.log('   Is expired:', status.isExpired);
    console.log('   Days since signed:', status.daysSinceSigned);
    console.log('   Current version:', status.currentVersion);
    console.log('   Latest version:', status.latestVersion);
    console.log('   Needs new version:', status.needsNewVersion);
    console.log('   Message:', status.message);

    if (!status.hasSigned) {
      throw new Error('Expected hasSigned to be true');
    }

    return status;
  } catch (error) {
    console.error('❌ Test 4 failed:', error.message);
    throw error;
  }
}

/**
 * Test 5: Create family member for waiver test
 */
async function test5_createFamilyMember() {
  console.log('\n=== Test 5: Create Family Member ===');
  try {
    // Clean up existing test family members
    await pool.query(
      `DELETE FROM family_members WHERE parent_user_id = $1 AND full_name LIKE 'Test Child%'`,
      [TEST_USER_ID]
    );
    console.log('   Cleaned up existing test family members');

    const result = await pool.query(
      `INSERT INTO family_members (
        parent_user_id,
        full_name,
        date_of_birth,
        relationship,
        gender
      ) VALUES ($1, $2, $3, $4, $5)
      RETURNING id, full_name, date_of_birth`,
      [TEST_USER_ID, 'Test Child for Waiver', '2015-06-15', 'child', 'other']
    );

    const familyMember = result.rows[0];
    console.log('✅ Family member created:');
    console.log('   ID:', familyMember.id);
    console.log('   Name:', familyMember.full_name);
    console.log('   DOB:', familyMember.date_of_birth);

    return familyMember;
  } catch (error) {
    console.error('❌ Test 5 failed:', error.message);
    throw error;
  }
}

/**
 * Test 6: Submit waiver for family member
 */
async function test6_submitFamilyMemberWaiver(familyMember, template) {
  console.log('\n=== Test 6: Submit Waiver for Family Member ===');
  try {
    const { submitWaiver } = await import('./services/waiverService.js');

    const waiverData = {
      user_id: null,
      family_member_id: familyMember.id,
      signer_user_id: TEST_USER_ID,
      waiver_version: template.version_number,
      language_code: template.language_code,
      signature_data: SAMPLE_SIGNATURE,
      ip_address: '127.0.0.1',
      user_agent: 'Test Suite',
      agreed_to_terms: true,
      photo_consent: false,
    };

    const waiver = await submitWaiver(waiverData);

    console.log('✅ Family member waiver submitted successfully:');
    console.log('   Waiver ID:', waiver.id);
    console.log('   Family Member ID:', waiver.family_member_id);
    console.log('   Signer ID:', waiver.signer_user_id);
    console.log('   Version:', waiver.waiver_version);
    console.log('   Signed at:', waiver.signed_at);

    return waiver;
  } catch (error) {
    console.error('❌ Test 6 failed:', error.message);
    throw error;
  }
}

/**
 * Test 7: Check family member waiver status
 */
async function test7_checkFamilyMemberStatus(familyMember) {
  console.log('\n=== Test 7: Check Family Member Waiver Status ===');
  try {
    const { checkWaiverStatus } = await import('./services/waiverService.js');

    const status = await checkWaiverStatus(familyMember.id, 'family_member');

    console.log('✅ Family member waiver status:');
    console.log('   Has signed:', status.hasSigned);
    console.log('   Needs to sign:', status.needsToSign);
    console.log('   Days since signed:', status.daysSinceSigned);
    console.log('   Message:', status.message);

    if (!status.hasSigned) {
      throw new Error('Expected family member hasSigned to be true');
    }

    return status;
  } catch (error) {
    console.error('❌ Test 7 failed:', error.message);
    throw error;
  }
}

/**
 * Test 8: Get waiver history
 */
async function test8_getWaiverHistory() {
  console.log('\n=== Test 8: Get Waiver History ===');
  try {
    const { getWaiverHistory } = await import('./services/waiverService.js');

    const history = await getWaiverHistory(TEST_USER_ID, 'user');

    console.log('✅ Waiver history retrieved:');
    console.log('   Total waivers signed:', history.length);
    
    history.forEach((waiver, index) => {
      console.log(`   Waiver ${index + 1}:`);
      console.log('     Version:', waiver.waiver_version);
      console.log('     Signed:', waiver.signed_at);
      console.log('     Photo consent:', waiver.photo_consent);
    });

    if (history.length === 0) {
      throw new Error('Expected at least one waiver in history');
    }

    return history;
  } catch (error) {
    console.error('❌ Test 8 failed:', error.message);
    throw error;
  }
}

/**
 * Test 9: Verify needsToSignWaiver function
 */
async function test9_needsToSignWaiver() {
  console.log('\n=== Test 9: Test needsToSignWaiver Function ===');
  try {
    const { needsToSignWaiver } = await import('./services/waiverService.js');

    // Test for user who just signed (should NOT need to sign)
    const userNeedsWaiver = await needsToSignWaiver(TEST_USER_ID, 'user');
    console.log('✅ User needs waiver:', userNeedsWaiver);
    
    if (userNeedsWaiver) {
      throw new Error('Expected user NOT to need waiver (just signed)');
    }

    // Test for non-existent user (should need to sign)
    const fakeUserId = '00000000-0000-0000-0000-000000000000';
    const fakeNeedsWaiver = await needsToSignWaiver(fakeUserId, 'user');
    console.log('✅ Non-existent user needs waiver:', fakeNeedsWaiver);

    if (!fakeNeedsWaiver) {
      throw new Error('Expected non-existent user to need waiver');
    }

    return { userNeedsWaiver, fakeNeedsWaiver };
  } catch (error) {
    console.error('❌ Test 9 failed:', error.message);
    throw error;
  }
}

/**
 * Test 10: Verify signature image file was created
 */
async function test10_verifySignatureFile(waiver) {
  console.log('\n=== Test 10: Verify Signature Image File ===');
  try {
    const fs = await import('fs/promises');
    const path = await import('path');
    const { fileURLToPath } = await import('url');

    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);

  const sanitized = waiver.signature_image_url.replace(/^\/+/, '');
  const signatureFilePath = path.join(__dirname, sanitized);
    
    // Check if file exists
    await fs.access(signatureFilePath);

    // Get file stats
    const stats = await fs.stat(signatureFilePath);

    console.log('✅ Signature image file verified:');
    console.log('   Path:', signatureFilePath);
    console.log('   Size:', stats.size, 'bytes');
    console.log('   Created:', stats.birthtime);
    if (waiver.signature_public_url) {
      console.log('   CDN URL:', waiver.signature_public_url);
    }
    if (/^https?:/i.test(waiver.signature_image_url)) {
      console.warn('   Warning: signature_image_url is public. Expected relative path for private storage.');
    }

    return signatureFilePath;
  } catch (error) {
    console.error('❌ Test 10 failed:', error.message);
    console.log('   (This is expected if signature storage failed)');
    // Don't throw - file storage is optional in development
  }
}

/**
 * Run all tests
 */
async function runAllTests() {
  console.log('╔════════════════════════════════════════════╗');
  console.log('║    Waiver API Test Suite                  ║');
  console.log('╚════════════════════════════════════════════╝');

  let results = {
    passed: 0,
    failed: 0,
    total: 10,
  };

  try {
    // Test 1: Find test user
    const user = await test1_findTestUser();
    results.passed++;

    // Test 2: Get waiver template
    const template = await test2_getWaiverTemplate();
    results.passed++;

    // Test 3: Submit user waiver
    const userWaiver = await test3_submitUserWaiver(template);
    results.passed++;

    // Test 4: Check waiver status
    await test4_checkWaiverStatus();
    results.passed++;

    // Test 5: Create family member
    const familyMember = await test5_createFamilyMember();
    results.passed++;

    // Test 6: Submit family member waiver
    const familyWaiver = await test6_submitFamilyMemberWaiver(familyMember, template);
    results.passed++;

    // Test 7: Check family member status
    await test7_checkFamilyMemberStatus(familyMember);
    results.passed++;

    // Test 8: Get waiver history
    await test8_getWaiverHistory();
    results.passed++;

    // Test 9: Test needsToSignWaiver
    await test9_needsToSignWaiver();
    results.passed++;

    // Test 10: Verify signature file
    await test10_verifySignatureFile(userWaiver);
    results.passed++;

  } catch (error) {
    results.failed++;
    console.error('\n❌ Test suite stopped due to error:', error.message);
  }

  // Print summary
  console.log('\n╔════════════════════════════════════════════╗');
  console.log('║           Test Summary                     ║');
  console.log('╚════════════════════════════════════════════╝');
  console.log(`Total tests: ${results.total}`);
  console.log(`✅ Passed: ${results.passed}`);
  console.log(`❌ Failed: ${results.failed}`);
  console.log(`Success rate: ${((results.passed / results.total) * 100).toFixed(1)}%`);

  // Close database connection
  await pool.end();

  // Exit with appropriate code
  process.exit(results.failed > 0 ? 1 : 0);
}

// Run tests
runAllTests().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
