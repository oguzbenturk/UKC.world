// scripts/run-all-tests.js
/**
 * Master Test Runner
 * Runs all automated tests in sequence:
 *   1. Database Integrity Check
 *   2. Production API Tests
 *   3. E2E Browser Tests (Playwright)
 * 
 * Usage:
 *   npm run test:all          # Run everything
 *   npm run test:all -- --quick   # Skip E2E (faster)
 *   npm run test:all -- --api     # API tests only
 */
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Parse args
const args = process.argv.slice(2);
const quick = args.includes('--quick');
const apiOnly = args.includes('--api');

const colors = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  cyan: "\x1b[36m",
  bold: "\x1b[1m"
};

function runCommand(command, cmdArgs, name) {
  return new Promise((resolve, reject) => {
    console.log(`${colors.blue}${colors.bold}▶ Running ${name}...${colors.reset}`);
    const start = Date.now();

    const child = spawn(command, cmdArgs, {
      stdio: 'inherit',
      shell: true,
      cwd: path.resolve(__dirname, '..')
    });

    child.on('close', (code) => {
      const duration = ((Date.now() - start) / 1000).toFixed(2);
      if (code === 0) {
        console.log(`${colors.green}✔ ${name} passed (${duration}s)${colors.reset}\n`);
        resolve({ name, code, duration, status: 'passed' });
      } else {
        console.log(`${colors.red}✖ ${name} failed with exit code ${code} (${duration}s)${colors.reset}\n`);
        resolve({ name, code, duration, status: 'failed' });
      }
    });

    child.on('error', (err) => {
      console.error(`${colors.red}Error starting ${name}: ${err.message}${colors.reset}`);
      resolve({ name, code: -1, duration: 0, status: 'error' });
    });
  });
}

async function main() {
  console.log();
  console.log(`${colors.cyan}${colors.bold}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}`);
  console.log(`${colors.cyan}${colors.bold}  🚀 MASTER TEST RUNNER${colors.reset}`);
  console.log(`${colors.cyan}${colors.bold}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}`);
  if (quick) console.log(`${colors.yellow}  Mode: Quick (skipping E2E)${colors.reset}`);
  if (apiOnly) console.log(`${colors.yellow}  Mode: API tests only${colors.reset}`);
  console.log();

  const results = [];

  // Test 1: Database Integrity
  const dbCheck = await runCommand('node', ['scripts/check-integrity.mjs'], '1️⃣ Database Integrity Check');
  results.push(dbCheck);

  // Test 2: Production API Tests (if backend is running)
  if (!apiOnly || args.includes('--api')) {
    const apiTest = await runCommand('node', ['scripts/test-production.mjs'], '2️⃣ Production API Tests');
    results.push(apiTest);
  }

  // Test 3: E2E Tests (unless quick mode)
  if (!quick && !apiOnly) {
    const e2eTests = await runCommand('npx', ['playwright', 'test', '--reporter=list'], '3️⃣ E2E Browser Tests');
    results.push(e2eTests);
  }

  // Summary
  console.log(`${colors.cyan}${colors.bold}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}`);
  console.log(`${colors.cyan}${colors.bold}  📊 TEST SUMMARY${colors.reset}`);
  console.log(`${colors.cyan}${colors.bold}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}`);
  console.log();
  
  let failed = false;
  let passed = 0;

  results.forEach(res => {
    if (res.status === 'passed') {
      console.log(`  ${colors.green}✅ ${res.name}: PASSED (${res.duration}s)${colors.reset}`);
      passed++;
    } else {
      console.log(`  ${colors.red}❌ ${res.name}: FAILED${colors.reset}`);
      failed = true;
    }
  });

  console.log();
  console.log(`${colors.cyan}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}`);
  
  if (failed) {
    console.log(`${colors.red}${colors.bold}  ❌ SOME TESTS FAILED${colors.reset}`);
    console.log();
    process.exit(1);
  } else {
    console.log(`${colors.green}${colors.bold}  ✅ ALL ${passed} TESTS PASSED! 🎉${colors.reset}`);
    console.log();
    process.exit(0);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
