#!/usr/bin/env node
/**
 * Kai Eval — Report Generator
 *
 * Compares the two most recent eval runs and shows what improved / regressed.
 *
 * Usage:
 *   node scripts/kai-eval/report.js           # compare last 2 runs
 *   node scripts/kai-eval/report.js --all     # show all runs summary table
 */

import { readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));
const resultsDir = join(__dir, 'results');

const args = process.argv.slice(2);
const showAll = args.includes('--all');

// ── Load result files ─────────────────────────────────────────────────────────
let files;
try {
  files = readdirSync(resultsDir)
    .filter((f) => f.startsWith('eval-') && f.endsWith('.json'))
    .sort()
    .reverse(); // newest first
} catch {
  console.error('No results found. Run: node scripts/kai-eval/run-eval.js first.');
  process.exit(1);
}

if (files.length === 0) {
  console.log('No eval results found. Run: node scripts/kai-eval/run-eval.js');
  process.exit(0);
}

const load = (f) => JSON.parse(readFileSync(join(resultsDir, f), 'utf8'));

// ── --all: Summary table of all runs ─────────────────────────────────────────
if (showAll) {
  console.log('\n📊 All Kai Eval Runs\n');
  console.log('Date                  | Total | Pass | Fail | Err | Rate  | Avg ms');
  console.log('─'.repeat(70));
  for (const f of files) {
    const r = load(f);
    const date = r.timestamp?.slice(0, 19).replace('T', ' ') || f.slice(5, 24);
    console.log(
      `${date} |  ${String(r.total).padStart(3)}  |  ${String(r.passed).padStart(3)} |  ${String(r.failed).padStart(3)} |  ${String(r.errored).padStart(2)} | ${r.passRate.padStart(4)}  | ${r.avgLatencyMs}ms`
    );
  }
  console.log();
  process.exit(0);
}

// ── Compare latest two runs ───────────────────────────────────────────────────
if (files.length < 2) {
  console.log('Only one eval run found. Need at least 2 to compare.\n');
  const r = load(files[0]);
  console.log(`Run: ${r.timestamp} | ${r.passRate} (${r.passed}/${r.total})\n`);
  r.results.filter((x) => !x.passed).forEach((x) => {
    console.log(`  ❌ [${x.id}] ${x.input.slice(0, 50)}`);
    if (x.keywordsMissing?.length) console.log(`     Missing: ${x.keywordsMissing.join(', ')}`);
    if (x.forbiddenFound?.length)  console.log(`     Forbidden: ${x.forbiddenFound.join(', ')}`);
    if (x.error) console.log(`     Error: ${x.error}`);
  });
  process.exit(0);
}

const [newRun, oldRun] = [load(files[0]), load(files[1])];

const newById = Object.fromEntries(newRun.results.map((r) => [r.id, r]));
const oldById = Object.fromEntries(oldRun.results.map((r) => [r.id, r]));

const improved  = [];
const regressed = [];
const unchanged_fail = [];
const unchanged_pass = [];

for (const id of new Set([...Object.keys(newById), ...Object.keys(oldById)])) {
  const n = newById[id];
  const o = oldById[id];
  if (!n || !o) continue;
  if (!o.passed && n.passed)  improved.push(n);
  else if (o.passed && !n.passed) regressed.push(n);
  else if (!n.passed) unchanged_fail.push(n);
  else unchanged_pass.push(n);
}

const rateChange = (newRun.passed - oldRun.passed);
const arrow = rateChange > 0 ? '▲' : rateChange < 0 ? '▼' : '─';

console.log(`\n📊 Kai Eval Comparison\n`);
console.log(`Old: ${oldRun.timestamp?.slice(0, 19)} — ${oldRun.passRate} (${oldRun.passed}/${oldRun.total})`);
console.log(`New: ${newRun.timestamp?.slice(0, 19)} — ${newRun.passRate} (${newRun.passed}/${newRun.total})  ${arrow} ${Math.abs(rateChange)} case(s)\n`);

if (improved.length) {
  console.log(`✅ Improved (${improved.length}):`);
  improved.forEach((r) => console.log(`   + [${r.id}] ${r.input.slice(0, 55)}`));
  console.log();
}

if (regressed.length) {
  console.log(`❌ Regressed (${regressed.length}):`);
  regressed.forEach((r) => {
    console.log(`   - [${r.id}] ${r.input.slice(0, 55)}`);
    if (r.keywordsMissing?.length) console.log(`     Missing keywords: ${r.keywordsMissing.join(', ')}`);
    if (r.forbiddenFound?.length)  console.log(`     Forbidden found: ${r.forbiddenFound.join(', ')}`);
  });
  console.log();
}

if (unchanged_fail.length) {
  console.log(`⚠  Still failing (${unchanged_fail.length}):`);
  unchanged_fail.forEach((r) => console.log(`   ~ [${r.id}] ${r.input.slice(0, 55)}`));
  console.log();
}

const latencyDelta = newRun.avgLatencyMs - oldRun.avgLatencyMs;
const latencyArrow = latencyDelta > 0 ? '▲ slower' : '▼ faster';
console.log(`Latency: ${oldRun.avgLatencyMs}ms → ${newRun.avgLatencyMs}ms  (${latencyArrow} by ${Math.abs(latencyDelta)}ms)\n`);
