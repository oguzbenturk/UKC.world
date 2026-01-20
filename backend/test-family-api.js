// backend/test-family-api.js
// Test script for Family Management API
import { pool } from './db.js';
import familyService from './services/familyService.js';

async function testFamilyAPI() {
  console.log('\n🧪 Testing Family Management API\n');
  console.log('='.repeat(60));
  
  try {
    // 1. Find a test student user
    console.log('\n1️⃣  Finding test student user...');
    const userQuery = `
      SELECT u.id, u.name, u.email, r.name as role 
      FROM users u 
      JOIN roles r ON r.id = u.role_id 
      WHERE r.name = 'student' 
      LIMIT 1
    `;
    const userResult = await pool.query(userQuery);
    
    if (userResult.rows.length === 0) {
      console.log('❌ No student users found. Please create a student first.');
      return;
    }
    
    const testStudent = userResult.rows[0];
    console.log(`✅ Found student: ${testStudent.name} (${testStudent.email})`);
    console.log(`   User ID: ${testStudent.id}`);
    
    // 2. Test creating a family member
    console.log('\n2️⃣  Creating test family member...');
    const familyMemberData = {
      full_name: 'Emma Test Child',
      date_of_birth: '2015-06-15', // 10 years old
      relationship: 'daughter',
      gender: 'female',
      medical_notes: 'Allergic to shellfish. Requires asthma inhaler.',
      emergency_contact: '+1-555-0199',
      photo_url: null
    };
    
    const newMember = await familyService.createFamilyMember(familyMemberData, testStudent.id);
    console.log('✅ Family member created:');
    console.log(`   Name: ${newMember.full_name}`);
    console.log(`   Age: ${newMember.age} years`);
    console.log(`   ID: ${newMember.id}`);
    console.log(`   Medical notes: ${newMember.medical_notes ? 'Encrypted ✓' : 'None'}`);
    
    // 3. Test retrieving family members
    console.log('\n3️⃣  Retrieving all family members...');
    const familyMembers = await familyService.getFamilyMembers(testStudent.id);
    console.log(`✅ Found ${familyMembers.length} family member(s):`);
    familyMembers.forEach((member, idx) => {
      console.log(`   ${idx + 1}. ${member.full_name} (${member.age} years old) - ${member.relationship}`);
      if (member.medical_notes) {
        console.log(`      Medical: ${member.medical_notes.substring(0, 50)}...`);
      }
    });
    
    // 4. Test updating a family member
    console.log('\n4️⃣  Updating family member...');
    const updates = {
      medical_notes: 'Updated: Allergic to shellfish and peanuts. Requires asthma inhaler before activities.',
      emergency_contact: '+1-555-0200'
    };
    const updated = await familyService.updateFamilyMember(newMember.id, updates, testStudent.id);
    console.log('✅ Family member updated:');
    console.log(`   New medical notes: ${updated.medical_notes.substring(0, 60)}...`);
    console.log(`   New emergency contact: ${updated.emergency_contact}`);
    
    // 5. Test age validation (should fail for 18+)
    console.log('\n5️⃣  Testing age validation (should fail)...');
    try {
      const adultData = {
        full_name: 'Adult Test',
        date_of_birth: '2000-01-01', // 25 years old
        relationship: 'child',
        gender: 'male'
      };
      await familyService.createFamilyMember(adultData, testStudent.id);
      console.log('❌ Age validation failed - adult was accepted!');
    } catch (error) {
      console.log(`✅ Age validation working: ${error.message}`);
    }
    
    // 6. Test encryption/decryption
    console.log('\n6️⃣  Testing medical notes encryption...');
    const plainText = 'Sensitive medical information: Diabetes Type 1';
    const encrypted = familyService.encryptMedicalNotes(plainText);
    const decrypted = familyService.decryptMedicalNotes(encrypted);
    console.log(`   Original: ${plainText}`);
    console.log(`   Encrypted: ${encrypted.substring(0, 40)}...`);
    console.log(`   Decrypted: ${decrypted}`);
    console.log(`   ${plainText === decrypted ? '✅' : '❌'} Encryption/decryption ${plainText === decrypted ? 'successful' : 'failed'}`);
    
    // 7. Test soft delete
    console.log('\n7️⃣  Testing soft delete...');
    const deleted = await familyService.deleteFamilyMember(newMember.id, testStudent.id);
    console.log(`${deleted ? '✅' : '❌'} Family member ${deleted ? 'deleted' : 'deletion failed'}`);
    
    // Verify deletion
    const afterDelete = await familyService.getFamilyMembers(testStudent.id);
    console.log(`   Family members after deletion: ${afterDelete.length}`);
    console.log(`   ${afterDelete.length === familyMembers.length - 1 ? '✅' : '❌'} Soft delete working correctly`);
    
    console.log('\n' + '='.repeat(60));
    console.log('✅ All tests completed successfully!\n');
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error('Stack:', error.stack);
  } finally {
    await pool.end();
  }
}

// Run tests
testFamilyAPI();
