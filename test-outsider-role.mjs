#!/usr/bin/env node

/**
 * Test script to verify outsider role users are included in booking user selection
 */

import fetch from 'node-fetch';

const API_BASE = 'http://localhost:4000/api';

async function testOutsiderRoleInclusion() {
  try {
    console.log('🔍 Testing outsider role inclusion in user selection...\n');
    
    // Login as admin first
    console.log('1️⃣  Logging in as admin...');
    const loginResponse = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'kaansahin@thesurfoffice.com',
        password: 'Kaan2014'
      })
    });
    
    if (!loginResponse.ok) {
      throw new Error(`Login failed: ${loginResponse.status}`);
    }
    
    const loginData = await loginResponse.json();
    const token = loginData.token;
    console.log('✅ Login successful\n');
    
    // Fetch students endpoint
    console.log('2️⃣  Fetching users from /api/users/students endpoint...');
    const studentsResponse = await fetch(`${API_BASE}/users/students`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    if (!studentsResponse.ok) {
      throw new Error(`Students endpoint failed: ${studentsResponse.status}`);
    }
    
    const students = await studentsResponse.json();
    console.log(`✅ Fetched ${students.length} users\n`);
    
    // Count by role
    const roleCounts = students.reduce((acc, user) => {
      const role = user.role_name || user.role || 'unknown';
      acc[role] = (acc[role] || 0) + 1;
      return acc;
    }, {});
    
    console.log('📊 User counts by role:');
    Object.entries(roleCounts).forEach(([role, count]) => {
      console.log(`   ${role}: ${count} users`);
    });
    console.log('');
    
    // Check if outsiders are included
    const outsiderCount = roleCounts.outsider || 0;
    if (outsiderCount > 0) {
      console.log('✅ SUCCESS: Outsider role users are included!');
      console.log(`   Found ${outsiderCount} outsider(s) in the user list`);
      console.log('');
      
      // Show some examples
      const outsiderExamples = students
        .filter(u => (u.role_name || u.role) === 'outsider')
        .slice(0, 3)
        .map(u => `   - ${u.name || u.email} (${u.email})`);
      
      if (outsiderExamples.length > 0) {
        console.log('📋 Example outsider users:');
        outsiderExamples.forEach(ex => console.log(ex));
      }
    } else {
      console.log('❌ ISSUE: No outsider role users found');
      console.log('   This might be normal if there are no outsiders in the database');
      console.log('   But the query should now support them when they exist');
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

testOutsiderRoleInclusion();
