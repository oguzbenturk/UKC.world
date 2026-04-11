#!/usr/bin/env node
/**
 * Kai Chat Simulator
 *
 * Sends each test case to Kai and prints the full Q&A conversation.
 * Designed for human review — shows full responses, pass/fail, and issues.
 *
 * Usage:
 *   node scripts/kai-eval/simulate.js                  # all cases
 *   node scripts/kai-eval/simulate.js --role=admin     # one role
 *   node scripts/kai-eval/simulate.js --id=admin-001   # single case
 */

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import http from 'http';
import https from 'https';

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT  = join(__dir, '..', '..');

const API_BASE    = process.env.KAI_EVAL_URL || 'http://localhost:4000';
const DELAY_MS    = parseInt(process.env.KAI_EVAL_DELAY || '2000', 10);
const TIMEOUT     = 40000;
// Guest rate limit is 5/60s — space out unauthenticated requests more
const GUEST_DELAY = 13000;

// ── Load test cases ────────────────────────────────────────────────────────────
const rawCases = JSON.parse(
  readFileSync(join(__dir, 'test-cases.json'), 'utf8').replace(/\/\/ .*$/gm, '')
);

const args       = process.argv.slice(2);
const roleFilter = args.find((a) => a.startsWith('--role='))?.split('=')[1];
const idFilter   = args.find((a) => a.startsWith('--id='))?.split('=')[1];

const cases = rawCases.filter((c) => {
  if (idFilter)   return c.id === idFilter;
  if (roleFilter) return c.role === roleFilter;
  return true;
});

// ── HTTP helper ────────────────────────────────────────────────────────────────
function post(url, payload, token) {
  return new Promise((resolve, reject) => {
    const body   = JSON.stringify(payload);
    const parsed = new URL(url);
    const lib    = parsed.protocol === 'https:' ? https : http;
    const req = lib.request({
      hostname: parsed.hostname,
      port:     parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
      path:     parsed.pathname + (parsed.search || ''),
      method:   'POST',
      headers: {
        'Content-Type':   'application/json',
        'Content-Length': Buffer.byteLength(body),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      timeout: TIMEOUT,
    }, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Request timed out')); });
    req.write(body);
    req.end();
  });
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

// ── JWT helper ─────────────────────────────────────────────────────────────────
// jsonwebtoken lives in backend/node_modules — use createRequire to load it from there
const backendRequire = createRequire(join(ROOT, 'backend', 'package.json'));
const jwt = backendRequire('jsonwebtoken');

function getTestToken(role, userId) {
  if (role === 'outsider' || userId === 'guest') return null;
  try {
    const env         = readFileSync(join(ROOT, 'backend', '.env'), 'utf8');
    const secretMatch = env.match(/JWT_SECRET\s*=\s*(.+)/);
    const secret      = secretMatch?.[1]?.trim();
    if (!secret) { console.warn('  ⚠ JWT_SECRET not found'); return null; }
    const roleMap = {
      student: 'customer', trusted_customer: 'trusted_customer',
      instructor: 'instructor', admin: 'super_admin', manager: 'manager',
    };
    return jwt.sign({ id: userId, role: roleMap[role] || role }, secret, { expiresIn: '10m' });
  } catch (e) {
    console.warn('  ⚠ JWT error:', e.message);
    return null;
  }
}

// ── Pretty print ───────────────────────────────────────────────────────────────
const ROLE_COLORS = {
  outsider:   '\x1b[36m',   // cyan
  student:    '\x1b[32m',   // green
  instructor: '\x1b[33m',   // yellow
  admin:      '\x1b[35m',   // magenta
  manager:    '\x1b[34m',   // blue
};
const RESET  = '\x1b[0m';
const BOLD   = '\x1b[1m';
const DIM    = '\x1b[2m';
const RED    = '\x1b[31m';
const GREEN  = '\x1b[32m';

function separator(char = '─', len = 72) { return char.repeat(len); }

function printCase(tc, response, latencyMs, passed, issues) {
  const color = ROLE_COLORS[tc.role] || '';
  console.log(`\n${separator()}`);
  console.log(`${BOLD}${color}[${tc.id}] ${tc.role.toUpperCase()}${RESET}${DIM}  ${tc.language || ''}  ${tc.securityTest ? '🔒 SECURITY' : tc.policyTest ? '📋 POLICY' : ''}${RESET}`);
  console.log(`${BOLD}Q: ${RESET}${tc.input}`);
  console.log(`${BOLD}A: ${RESET}${response || '(no response)'}`);
  console.log();

  if (passed) {
    console.log(`${GREEN}✅ PASS${RESET}  ${DIM}${latencyMs}ms${RESET}`);
  } else {
    console.log(`${RED}❌ FAIL${RESET}  ${DIM}${latencyMs}ms${RESET}`);
    if (issues.missing.length)   console.log(`   ${RED}Missing keywords:${RESET}  ${issues.missing.join(', ')}`);
    if (issues.forbidden.length) console.log(`   ${RED}Forbidden found:${RESET}   ${issues.forbidden.join(', ')}`);
    if (issues.error)            console.log(`   ${RED}Error:${RESET}             ${issues.error}`);
  }
}

// ── Run ────────────────────────────────────────────────────────────────────────
console.log(`\n${'═'.repeat(72)}`);
console.log(`${BOLD}  Kai Chat Simulator — ${cases.length} case(s)${RESET}`);
console.log(`${'═'.repeat(72)}`);

let currentRole = null;
let passed = 0, failed = 0, errored = 0;
const results = [];

for (const tc of cases) {
  // Role header
  if (tc.role !== currentRole) {
    currentRole = tc.role;
    const color = ROLE_COLORS[tc.role] || '';
    console.log(`\n${separator('═')}`);
    console.log(`${BOLD}${color}  ROLE: ${tc.role.toUpperCase()}${RESET}`);
    console.log(separator('═'));
  }

  const token   = await getTestToken(tc.role, tc.userId);
  let startMs = Date.now();

  let response = '', latencyMs = 0, cPassed = false;
  const issues = { missing: [], forbidden: [], error: null };

  try {
    let res;
    // Retry once on 429 (rate limit) with a 65-second back-off
    for (let attempt = 0; attempt < 2; attempt++) {
      res = await post(`${API_BASE}/api/assistant`, {
        message:   tc.input,
        userName:  `sim-${tc.role}`,
        sessionId: `sim-${tc.id}-${Date.now()}`,
      }, token);
      if (res.status === 429 && attempt === 0) {
        process.stdout.write(`  [rate-limited — waiting 65s] `);
        await sleep(65000);
        startMs = Date.now(); // reset latency
      } else break;
    }

    latencyMs = Date.now() - startMs;

    if (res.status !== 200) {
      issues.error = `HTTP ${res.status}: ${JSON.stringify(res.body).slice(0, 150)}`;
      errored++;
    } else {
      response = res.body?.response || '';
      const lc = response.toLowerCase();
      issues.missing   = (tc.expectedKeywords || []).filter((k) => !lc.includes(k.toLowerCase()));
      issues.forbidden = (tc.notExpected     || []).filter((k) =>  lc.includes(k.toLowerCase()));
      cPassed = issues.missing.length === 0 && issues.forbidden.length === 0;
      if (cPassed) passed++; else failed++;
    }
  } catch (e) {
    latencyMs     = Date.now() - startMs;
    issues.error  = e.message;
    errored++;
  }

  printCase(tc, response, latencyMs, cPassed, issues);
  results.push({ id: tc.id, role: tc.role, input: tc.input, response, latencyMs, passed: cPassed, ...issues });

  // Guest requests: space out to stay under 5/60s rate limit
  const delay = (!token) ? GUEST_DELAY : DELAY_MS;
  if (cases.indexOf(tc) < cases.length - 1) await sleep(delay);
}

// ── Summary ────────────────────────────────────────────────────────────────────
const total = cases.length;
const rate  = Math.round((passed / total) * 100);

console.log(`\n${'═'.repeat(72)}`);
console.log(`${BOLD}  RESULTS: ${GREEN}${passed}✅${RESET}  ${RED}${failed}❌${RESET}  ⚠${errored}  —  Pass rate: ${BOLD}${rate}%${RESET}`);
console.log(`${'═'.repeat(72)}\n`);

// Save for later comparison
const outDir  = join(__dir, 'results');
const outFile = join(outDir, `sim-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.json`);
mkdirSync(outDir, { recursive: true });
writeFileSync(outFile, JSON.stringify({ timestamp: new Date().toISOString(), total, passed, failed, errored, passRate: `${rate}%`, results }, null, 2));
console.log(`${DIM}Full transcript saved: ${outFile}${RESET}\n`);
