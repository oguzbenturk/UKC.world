#!/usr/bin/env node
/**
 * Rollback Population Script
 * Removes test users created by populate_2000_users script
 * 
 * Usage:
 *   node rollback_population.mjs                    # Use manifest file
 *   node rollback_population.mjs --pattern-fallback # Use email pattern matching
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const API_BASE = process.env.API_BASE || 'http://localhost:3001/api';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@plannivo.com';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';
const MANIFEST_FILE = path.join(__dirname, 'population_manifest.json');

// Parse command line arguments
const usePatternFallback = process.argv.includes('--pattern-fallback');

// Helper to make authenticated requests
async function apiRequest(endpoint, options = {}) {
  const url = `${API_BASE}${endpoint}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
  
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`API Error ${response.status}: ${text}`);
  }
  
  const contentType = response.headers.get('content-type');
  if (contentType && contentType.includes('application/json')) {
    return response.json();
  }
  return response.text();
}

// Get admin token
async function getAdminToken() {
  console.log('🔐 Authenticating as admin...');
  try {
    const result = await apiRequest('/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        email: ADMIN_EMAIL,
        password: ADMIN_PASSWORD,
      }),
    });
    console.log('✅ Admin authentication successful');
    return result.token;
  } catch (error) {
    console.error('❌ Admin authentication failed:', error.message);
    throw error;
  }
}

// Delete a single user
async function deleteUser(token, userId) {
  try {
    await apiRequest(`/users/${userId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    return true;
  } catch (error) {
    return false;
  }
}

// Get users from manifest only (pattern fallback no longer supported for real emails)
async function getUsersFromManifest() {
  if (fs.existsSync(MANIFEST_FILE)) {
    console.log('📄 Loading manifest file...');
    const manifest = JSON.parse(fs.readFileSync(MANIFEST_FILE, 'utf-8'));
    return manifest.users || [];
  }
  return [];
}

// Main rollback function
async function rollback() {
  console.log('');
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║           PLANNIVO ROLLBACK POPULATION SCRIPT              ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log('');
  
  // Get admin token
  const token = await getAdminToken();
  
  let userIdsToDelete = [];
  
  if (!usePatternFallback && fs.existsSync(MANIFEST_FILE)) {
    // Use manifest file
    console.log('📄 Loading manifest file...');
    const manifest = JSON.parse(fs.readFileSync(MANIFEST_FILE, 'utf-8'));
    userIdsToDelete = manifest.users || [];
    console.log(`📋 Found ${userIdsToDelete.length} users in manifest`);
  } else {
    // Pattern fallback
    console.log('⚠️  No manifest found or --pattern-fallback specified');
    console.log('🔍 Using email pattern matching...');
    const users = await getUsersByPattern(token);
    userIdsToDelete = users.map(u => u.id);
  }
  
  if (userIdsToDelete.length === 0) {
    console.log('');
    console.log('✅ No test users found to delete. Database is clean.');
    return;
  }
  
  console.log('');
  console.log(`🗑️  Deleting ${userIdsToDelete.length} test users...`);
  console.log('');
  
  let deleted = 0;
  let failed = 0;
  
  for (let i = 0; i < userIdsToDelete.length; i++) {
    const userId = userIdsToDelete[i];
    const success = await deleteUser(token, userId);
    
    if (success) {
      deleted++;
    } else {
      failed++;
    }
    
    // Progress update every 100 users
    if ((i + 1) % 100 === 0 || i === userIdsToDelete.length - 1) {
      const pct = ((i + 1) / userIdsToDelete.length * 100).toFixed(1);
      process.stdout.write(`\r   Progress: ${i + 1}/${userIdsToDelete.length} (${pct}%) - Deleted: ${deleted}, Failed: ${failed}`);
    }
  }
  
  console.log('');
  console.log('');
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║                    ROLLBACK COMPLETE                       ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log('');
  console.log(`   ✅ Successfully deleted: ${deleted}`);
  console.log(`   ❌ Failed to delete: ${failed}`);
  console.log('');
  
  // Remove manifest file after successful rollback
  if (fs.existsSync(MANIFEST_FILE) && deleted > 0) {
    fs.unlinkSync(MANIFEST_FILE);
    console.log('   🗑️  Manifest file removed');
  }
}

// Run
rollback().catch(error => {
  console.error('');
  console.error('❌ Rollback failed:', error.message);
  process.exit(1);
});
