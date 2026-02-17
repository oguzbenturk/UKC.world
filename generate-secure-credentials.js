#!/usr/bin/env node

/**
 * Security Credential Generator
 * 
 * Generates cryptographically secure random credentials for:
 * - JWT secrets
 * - Database passwords
 * - Redis passwords
 * - API keys
 * 
 * Usage: node generate-secure-credentials.js
 */

import crypto from 'crypto';

console.log('\n='.repeat(70));
console.log('  PLANNIVO SECURE CREDENTIAL GENERATOR');
console.log('='.repeat(70));
console.log('\nGenerating cryptographically secure credentials...\n');

// Generate JWT Secret (256-bit / 32 bytes for HMAC-SHA256)
const jwtSecret = crypto.randomBytes(32).toString('hex');

// Generate Database Password (256-bit, base64 for easier handling)
const dbPassword = crypto.randomBytes(32).toString('base64');

// Generate Redis Password (256-bit, hex format)
const redisPassword = crypto.randomBytes(32).toString('hex');

// Generate Generic API Key (192-bit, base64url for API usage)
const apiKey = crypto.randomBytes(24).toString('base64url');

console.log('┌─────────────────────────────────────────────────────────────────────┐');
console.log('│ JWT SECRET (HMAC-SHA256 - 256 bits)                                │');
console.log('├─────────────────────────────────────────────────────────────────────┤');
console.log(`│ ${jwtSecret} │`);
console.log('└─────────────────────────────────────────────────────────────────────┘');
console.log('\nUse for: JWT_SECRET in backend/.env.production\n');

console.log('┌─────────────────────────────────────────────────────────────────────┐');
console.log('│ DATABASE PASSWORD (256 bits, base64)                               │');
console.log('├─────────────────────────────────────────────────────────────────────┤');
console.log(`│ ${dbPassword}              │`);
console.log('└─────────────────────────────────────────────────────────────────────┘');
console.log('\nUse for: POSTGRES_PASSWORD in backend/.env.production\n');

console.log('┌─────────────────────────────────────────────────────────────────────┐');
console.log('│ REDIS PASSWORD (256 bits, hex)                                     │');
console.log('├─────────────────────────────────────────────────────────────────────┤');
console.log(`│ ${redisPassword} │`);
console.log('└─────────────────────────────────────────────────────────────────────┘');
console.log('\nUse for: REDIS_PASSWORD in backend/.env.production\n');

console.log('┌─────────────────────────────────────────────────────────────────────┐');
console.log('│ GENERIC API KEY (192 bits, base64url)                              │');
console.log('├─────────────────────────────────────────────────────────────────────┤');
console.log(`│ ${apiKey}                       │`);
console.log('└─────────────────────────────────────────────────────────────────────┘');
console.log('\nUse for: Third-party API keys or session secrets\n');

console.log('='.repeat(70));
console.log('  IMPORTANT SECURITY NOTES');
console.log('='.repeat(70));
console.log('\n1. Copy these credentials to a SECURE PASSWORD MANAGER immediately');
console.log('2. Update backend/.env.production with the new values');
console.log('3. NEVER commit .env.production to Git (check .gitignore)');
console.log('4. Rotate these credentials if they are ever exposed');
console.log('5. Keep backup copies in multiple secure locations');
console.log('6. When rotating JWT_SECRET, all users will need to log in again');
console.log('7. When rotating DB password, update both PostgreSQL and .env files');
console.log('\n' + '='.repeat(70) + '\n');

// Output example .env format
console.log('Example backend/.env.production format:\n');
console.log('# Generated on:', new Date().toISOString());
console.log('JWT_SECRET=' + jwtSecret);
console.log('POSTGRES_PASSWORD=' + dbPassword);
console.log('REDIS_PASSWORD=' + redisPassword);
console.log('\n# Remember to also update the DATABASE_URL connection string:');
console.log('DATABASE_URL=postgresql://plannivo:' + dbPassword + '@db:5432/plannivo');
console.log('\n');
