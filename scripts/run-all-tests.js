// scripts/run-all-tests.js
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const colors = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  bold: "\x1b[1m"
};

function runCommand(command, args, name) {
  return new Promise((resolve, reject) => {
    console.log(`${colors.blue}${colors.bold}▶ Running ${name}...${colors.reset}`);
    const start = Date.now();

    const child = spawn(command, args, {
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
  console.log(`${colors.bold}🚀 Starting Master Test Runner${colors.reset}\n`);

  const privacyCheck = await runCommand('node', ['scripts/check-integrity.mjs'], 'Database Integrity Check');
  const e2eTests = await runCommand('npx', ['playwright', 'test'], 'E2E Tests (Playwright)');

  console.log(`${colors.bold}📊 Test Summary${colors.reset}`);
  console.log('-----------------------------------');
  
  const results = [privacyCheck, e2eTests];
  let failed = false;

  results.forEach(res => {
    if (res.status === 'passed') {
      console.log(`${colors.green}✅ ${res.name}: PASSED${colors.reset}`);
    } else {
      console.log(`${colors.red}❌ ${res.name}: FAILED${colors.reset}`);
      failed = true;
    }
  });

  console.log('-----------------------------------');
  if (failed) {
    console.log(`${colors.red}${colors.bold}Tests Failed!${colors.reset}`);
    process.exit(1);
  } else {
    console.log(`${colors.green}${colors.bold}All Tests Passed! 🎊${colors.reset}`);
    process.exit(0);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
