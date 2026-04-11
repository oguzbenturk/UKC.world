#!/usr/bin/env node
/**
 * Kai Eval — Test Runner
 *
 * Sends each test case to the local Kai assistant API and saves results.
 *
 * Usage:
 *   node scripts/kai-eval/run-eval.js                  # all cases
 *   node scripts/kai-eval/run-eval.js --role=admin     # specific role
 *   node scripts/kai-eval/run-eval.js --id=admin-001   # single case
 *
 * Requires: local server running (npm run dev:backend)
 *           JWT_SECRET in backend/.env for generating test tokens
 */

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import http from 'http';
import https from 'https';

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT  = join(__dir, '..', '..');

// ── Config ────────────────────────────────────────────────────────────────────
const API_BASE  = process.env.KAI_EVAL_URL  || 'http://localhost:4000';
const DELAY_MS  = parseInt(process.env.KAI_EVAL_DELAY || '1500', 10); // avoid rate limit
const TIMEOUT   = 35000;

// ── Load test cases ───────────────────────────────────────────────────────────
const rawCases = JSON.parse(
  readFileSync(join(__dir, 'test-cases.json'), 'utf8')
    .replace(/\/\/ .*$/gm, '') // strip comments from "JSON"
);

const args = process.argv.slice(2);
const roleFilter = args.find((a) => a.startsWith('--role='))?.split('=')[1];
const idFilter   = args.find((a) => a.startsWith('--id='))?.split('=')[1];

const cases = rawCases.filter((c) => {
  if (idFilter)   return c.id === idFilter;
  if (roleFilter) return c.role === roleFilter;
  return true;
});

console.log(`\n🔍 Kai Eval — running ${cases.length} test case(s)\n`);

// ── HTTP helper ───────────────────────────────────────────────────────────────
function post(url, payload, token) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload);
    const parsed = new URL(url);
    const lib = parsed.protocol === 'https:' ? https : http;
    const req = lib.request({
      hostname: parsed.hostname,
      port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
      path: parsed.pathname + (parsed.search || ''),
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
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

// ── Generate a test JWT for a role ───────────────────────────────────────────
async function getTestToken(role, userId) {
  // Skip token for guests/outsiders
  if (role === 'outsider' || userId === 'guest') return null;

  try {
    // Lazy-import jwt — only available in Node
    const { default: jwt } = await import('jsonwebtoken');
    const envPath = join(ROOT, 'backend', '.env');
    const env = readFileSync(envPath, 'utf8');
    const secretMatch = env.match(/JWT_SECRET\s*=\s*(.+)/);
    const secret = secretMatch?.[1]?.trim();
    if (!secret) {
      console.warn('  ⚠ JWT_SECRET not found in backend/.env — sending without auth token');
      return null;
    }
    // Map role to DB role name
    const roleMap = { student: 'customer', trusted_customer: 'trusted_customer', instructor: 'instructor', admin: 'super_admin', manager: 'manager' };
    return jwt.sign({ id: userId, role: roleMap[role] || role }, secret, { expiresIn: '10m' });
  } catch (e) {
    console.warn('  ⚠ Could not generate JWT:', e.message);
    return null;
  }
}

// ── Run ───────────────────────────────────────────────────────────────────────
const results = [];
let passed = 0, failed = 0, errored = 0;

for (const tc of cases) {
  process.stdout.write(`  [${tc.id}] ${tc.input.slice(0, 50)}... `);

  const token = await getTestToken(tc.role, tc.userId);
  const startMs = Date.now();

  let result = {
    id: tc.id,
    role: tc.role,
    input: tc.input,
    response: null,
    latencyMs: null,
    keywordsFound: [],
    keywordsMissing: [],
    forbiddenFound: [],
    passed: false,
    error: null,
    securityTest: tc.securityTest || false,
    policyTest: tc.policyTest || false,
  };

  try {
    const res = await post(`${API_BASE}/api/assistant`, {
      message: tc.input,
      userName: `eval-${tc.role}`,
      sessionId: `eval-${tc.id}-${Date.now()}`,
    }, token);

    result.latencyMs = Date.now() - startMs;
    result.httpStatus = res.status;

    if (res.status !== 200) {
      result.error = `HTTP ${res.status}: ${JSON.stringify(res.body).slice(0, 200)}`;
      errored++;
      console.log('❌ HTTP error');
    } else {
      const response = res.body?.response || '';
      result.response = response;
      const lc = response.toLowerCase();

      // Check expected keywords
      result.keywordsFound   = (tc.expectedKeywords || []).filter((k) => lc.includes(k.toLowerCase()));
      result.keywordsMissing = (tc.expectedKeywords || []).filter((k) => !lc.includes(k.toLowerCase()));
      result.forbiddenFound  = (tc.notExpected || []).filter((k) => lc.includes(k.toLowerCase()));

      const ok = result.keywordsMissing.length === 0 && result.forbiddenFound.length === 0;
      result.passed = ok;

      if (ok) { passed++; console.log(`✅ (${result.latencyMs}ms)`); }
      else {
        failed++;
        const issues = [];
        if (result.keywordsMissing.length) issues.push(`missing: ${result.keywordsMissing.join(', ')}`);
        if (result.forbiddenFound.length)  issues.push(`forbidden: ${result.forbiddenFound.join(', ')}`);
        console.log(`❌ ${issues.join(' | ')}`);
      }
    }
  } catch (e) {
    result.latencyMs = Date.now() - startMs;
    result.error = e.message;
    errored++;
    console.log(`❌ Error: ${e.message}`);
  }

  results.push(result);
  if (cases.indexOf(tc) < cases.length - 1) await sleep(DELAY_MS);
}

// ── Save results ──────────────────────────────────────────────────────────────
const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const outDir  = join(__dir, 'results');
const outFile = join(outDir, `eval-${timestamp}.json`);
mkdirSync(outDir, { recursive: true });

const summary = {
  timestamp: new Date().toISOString(),
  total: cases.length,
  passed,
  failed,
  errored,
  passRate: `${Math.round((passed / cases.length) * 100)}%`,
  avgLatencyMs: Math.round(results.filter((r) => r.latencyMs).reduce((s, r) => s + r.latencyMs, 0) / results.filter((r) => r.latencyMs).length),
  results,
};

writeFileSync(outFile, JSON.stringify(summary, null, 2));

console.log(`\n${'─'.repeat(50)}`);
console.log(`Results: ${passed}✅  ${failed}❌  ${errored}⚠  — Pass rate: ${summary.passRate}`);
console.log(`Avg latency: ${summary.avgLatencyMs}ms`);
console.log(`Saved: ${outFile}\n`);
