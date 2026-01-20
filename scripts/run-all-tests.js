#!/usr/bin/env node
/**
 * 🚀 Plannivo Automated Test Runner
 * 
 * Runs all tests in sequence and generates a report
 * Usage: node scripts/run-all-tests.js [options]
 * 
 * Options:
 *   --quick     Run only smoke tests
 *   --api       Run only API tests
 *   --e2e       Run only E2E UI tests
 *   --full      Run all tests (default)
 */

import { spawn } from 'child_process';
import { writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = join(__dirname, '..');

// Test configuration
const TESTS = {
  smoke: {
    name: '🔥 Smoke Tests',
    command: 'npx',
    args: ['playwright', 'test', 'tests/e2e/smoke.spec.ts', '--reporter=list'],
    timeout: 120000,
  },
  apiHealth: {
    name: '🏥 API Health Checks',
    command: 'npx',
    args: ['playwright', 'test', 'tests/e2e/api-health.spec.ts', '--reporter=list'],
    timeout: 60000,
  },
  financial: {
    name: '💰 Financial Accuracy',
    command: 'npx',
    args: ['playwright', 'test', 'tests/e2e/financial-accuracy.spec.ts', '--reporter=list'],
    timeout: 60000,
  },
  booking: {
    name: '📅 Booking Flow',
    command: 'npx',
    args: ['playwright', 'test', 'tests/e2e/booking-flow.spec.ts', '--reporter=list'],
    timeout: 120000,
  },
  lint: {
    name: '🔍 Linting',
    command: 'npm',
    args: ['run', 'lint'],
    timeout: 60000,
  },
};

// Results storage
const results = [];
const startTime = new Date();

// Color codes
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function runCommand(config) {
  return new Promise((resolve) => {
    const startMs = Date.now();
    log(`\n${'='.repeat(60)}`, 'cyan');
    log(`Running: ${config.name}`, 'bright');
    log(`Command: ${config.command} ${config.args.join(' ')}`, 'blue');
    log(`${'='.repeat(60)}`, 'cyan');

    const proc = spawn(config.command, config.args, {
      cwd: ROOT_DIR,
      shell: true,
      stdio: 'inherit',
    });

    const timeout = setTimeout(() => {
      proc.kill();
      resolve({
        name: config.name,
        status: 'timeout',
        duration: Date.now() - startMs,
        error: `Timeout after ${config.timeout}ms`,
      });
    }, config.timeout);

    proc.on('close', (code) => {
      clearTimeout(timeout);
      const duration = Date.now() - startMs;
      
      resolve({
        name: config.name,
        status: code === 0 ? 'passed' : 'failed',
        duration,
        exitCode: code,
      });
    });

    proc.on('error', (err) => {
      clearTimeout(timeout);
      resolve({
        name: config.name,
        status: 'error',
        duration: Date.now() - startMs,
        error: err.message,
      });
    });
  });
}

async function runTests(testKeys) {
  log('\n🚀 Starting Plannivo Test Suite\n', 'bright');
  log(`Time: ${startTime.toISOString()}`, 'blue');
  log(`Tests to run: ${testKeys.join(', ')}\n`, 'blue');

  for (const key of testKeys) {
    const config = TESTS[key];
    if (!config) {
      log(`⚠️ Unknown test: ${key}`, 'yellow');
      continue;
    }

    const result = await runCommand(config);
    results.push(result);

    if (result.status === 'passed') {
      log(`\n✅ ${result.name}: PASSED (${(result.duration / 1000).toFixed(1)}s)`, 'green');
    } else {
      log(`\n❌ ${result.name}: ${result.status.toUpperCase()} (${(result.duration / 1000).toFixed(1)}s)`, 'red');
    }
  }

  return results;
}

function generateReport(results) {
  const endTime = new Date();
  const totalDuration = endTime - startTime;
  
  const passed = results.filter(r => r.status === 'passed').length;
  const failed = results.filter(r => r.status !== 'passed').length;

  log('\n' + '='.repeat(60), 'cyan');
  log('📊 TEST RESULTS SUMMARY', 'bright');
  log('='.repeat(60), 'cyan');
  
  for (const result of results) {
    const icon = result.status === 'passed' ? '✅' : '❌';
    const color = result.status === 'passed' ? 'green' : 'red';
    log(`${icon} ${result.name}: ${result.status.toUpperCase()}`, color);
  }

  log('\n' + '-'.repeat(60), 'cyan');
  log(`Total: ${results.length} | Passed: ${passed} | Failed: ${failed}`, 'bright');
  log(`Duration: ${(totalDuration / 1000).toFixed(1)}s`, 'blue');
  log('-'.repeat(60), 'cyan');

  // Write JSON report
  const reportDir = join(ROOT_DIR, 'test-results');
  if (!existsSync(reportDir)) {
    mkdirSync(reportDir, { recursive: true });
  }

  const report = {
    timestamp: startTime.toISOString(),
    duration: totalDuration,
    summary: { total: results.length, passed, failed },
    results,
  };

  const reportPath = join(reportDir, `test-report-${Date.now()}.json`);
  writeFileSync(reportPath, JSON.stringify(report, null, 2));
  log(`\n📄 Report saved: ${reportPath}`, 'blue');

  return failed === 0;
}

// Main execution
async function main() {
  const args = process.argv.slice(2);
  
  let testKeys;
  
  if (args.includes('--quick')) {
    testKeys = ['lint', 'smoke'];
  } else if (args.includes('--api')) {
    testKeys = ['apiHealth', 'financial'];
  } else if (args.includes('--e2e')) {
    testKeys = ['smoke', 'booking'];
  } else {
    // Full test suite
    testKeys = ['lint', 'smoke', 'apiHealth', 'financial', 'booking'];
  }

  try {
    const testResults = await runTests(testKeys);
    const success = generateReport(testResults);
    
    process.exit(success ? 0 : 1);
  } catch (error) {
    log(`\n💥 Test runner error: ${error.message}`, 'red');
    process.exit(1);
  }
}

main();
