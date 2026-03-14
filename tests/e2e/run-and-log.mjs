/**
 * E2E Test Runner with Structured Logging
 * 
 * Runs Playwright tests headed, captures results to a structured log file,
 * and outputs a JSON report for automated analysis.
 * 
 * Usage: node tests/e2e/run-and-log.mjs [--phase=1|2|all] [--project=chromium|mobile-chrome|all]
 */
import { execSync } from 'child_process';
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

const args = process.argv.slice(2);
const phase = args.find(a => a.startsWith('--phase='))?.split('=')[1] || 'all';
const project = args.find(a => a.startsWith('--project='))?.split('=')[1] || 'chromium';
const headed = args.includes('--headless') ? '' : '--headed';

const LOG_DIR = join(process.cwd(), 'tests', 'e2e', 'logs');
if (!existsSync(LOG_DIR)) mkdirSync(LOG_DIR, { recursive: true });

const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const logFile = join(LOG_DIR, `test-run-${timestamp}.md`);

const phases = {
  '1': 'tests/e2e/phase1-auth-smoke.spec.ts',
  '2': 'tests/e2e/phase2-admin-crud.spec.ts',
};

const projects = project === 'all' ? ['chromium', 'mobile-chrome'] : [project];
const phaseKeys = phase === 'all' ? Object.keys(phases) : [phase];

let report = `# E2E Test Run Report\n`;
report += `**Date:** ${new Date().toLocaleString()}\n`;
report += `**Projects:** ${projects.join(', ')}\n`;
report += `**Phases:** ${phaseKeys.join(', ')}\n`;
report += `**Mode:** ${headed ? 'Headed' : 'Headless'}\n\n`;

const allResults = [];

for (const proj of projects) {
  report += `---\n## Project: ${proj}\n\n`;

  for (const ph of phaseKeys) {
    const spec = phases[ph];
    if (!spec) continue;

    report += `### Phase ${ph}\n\n`;
    console.log(`\n🚀 Running Phase ${ph} on ${proj}...\n`);

    const cmd = `npx playwright test ${spec} --project=${proj} --workers=1 ${headed} --reporter=json 2>&1`;

    let output = '';
    let exitCode = 0;
    try {
      output = execSync(cmd, {
        cwd: process.cwd(),
        encoding: 'utf-8',
        maxBuffer: 10 * 1024 * 1024,
        timeout: 600_000,
        env: { ...process.env, PLAYWRIGHT_JSON_OUTPUT_NAME: '' },
      });
    } catch (err) {
      output = err.stdout || err.message;
      exitCode = err.status || 1;
    }

    // Parse JSON results from Playwright
    let jsonResult = null;
    try {
      jsonResult = JSON.parse(output);
    } catch {
      // Output wasn't pure JSON — extract test results from text
    }

    if (jsonResult && jsonResult.suites) {
      const tests = flattenSuites(jsonResult.suites);
      let passed = 0, failed = 0, skipped = 0;
      const failures = [];

      report += `| # | Test | Status | Duration |\n`;
      report += `|---|------|--------|----------|\n`;

      tests.forEach((t, i) => {
        const status = t.status === 'passed' ? '✅' :
                       t.status === 'failed' ? '❌' :
                       t.status === 'skipped' ? '⏭️' : '⚠️';
        const dur = t.duration ? `${(t.duration / 1000).toFixed(1)}s` : '-';
        report += `| ${i + 1} | ${t.title} | ${status} | ${dur} |\n`;

        if (t.status === 'passed') passed++;
        else if (t.status === 'failed') { failed++; failures.push(t); }
        else skipped++;

        allResults.push({
          phase: ph,
          project: proj,
          title: t.title,
          status: t.status,
          duration: t.duration,
          error: t.error || null,
        });
      });

      report += `\n**Summary:** ${passed} passed, ${failed} failed, ${skipped} skipped\n\n`;

      if (failures.length > 0) {
        report += `#### Failures\n\n`;
        for (const f of failures) {
          report += `**${f.title}**\n`;
          report += '```\n' + (f.error || 'No error message').slice(0, 500) + '\n```\n\n';
        }
      }
    } else {
      // Fallback: parse text output
      const lines = output.split('\n');
      const passLine = lines.find(l => /\d+ passed/.test(l));
      const failLine = lines.find(l => /\d+ failed/.test(l));
      report += `**Raw result:** ${passLine || ''} ${failLine || ''}\n\n`;

      // Extract individual test lines
      const testLines = lines.filter(l => /[✓✘×]|\[chromium\]|\[mobile/.test(l));
      if (testLines.length) {
        report += '```\n' + testLines.join('\n') + '\n```\n\n';
      }

      // Capture failure details
      const failBlocks = output.match(/\d+\).*?(?=\n\s*\d+\)|\n\s+\d+ (?:passed|failed))/gs);
      if (failBlocks) {
        report += `#### Failure Details\n\n`;
        for (const block of failBlocks) {
          report += '```\n' + block.slice(0, 800) + '\n```\n\n';
        }
      }
    }
  }
}

// Write report
writeFileSync(logFile, report, 'utf-8');
console.log(`\n📋 Report saved to: ${logFile}`);

// Write JSON for machine consumption
const jsonFile = logFile.replace('.md', '.json');
writeFileSync(jsonFile, JSON.stringify(allResults, null, 2), 'utf-8');
console.log(`📊 JSON data saved to: ${jsonFile}`);

// Print summary
const totalPassed = allResults.filter(r => r.status === 'passed').length;
const totalFailed = allResults.filter(r => r.status === 'failed').length;
console.log(`\n${'='.repeat(50)}`);
console.log(`TOTAL: ${totalPassed} passed, ${totalFailed} failed out of ${allResults.length} tests`);
console.log(`${'='.repeat(50)}\n`);

if (totalFailed > 0) {
  console.log('❌ FAILURES:');
  allResults.filter(r => r.status === 'failed').forEach(r => {
    console.log(`  [${r.project}] Phase ${r.phase}: ${r.title}`);
  });
  process.exit(1);
}

function flattenSuites(suites, prefix = '') {
  const tests = [];
  for (const suite of suites) {
    const name = prefix ? `${prefix} › ${suite.title}` : suite.title;
    if (suite.specs) {
      for (const spec of suite.specs) {
        for (const test of spec.tests || []) {
          const result = test.results?.[test.results.length - 1];
          tests.push({
            title: `${name} › ${spec.title}`,
            status: result?.status || test.status || 'unknown',
            duration: result?.duration || 0,
            error: result?.error?.message || null,
          });
        }
      }
    }
    if (suite.suites) {
      tests.push(...flattenSuites(suite.suites, name));
    }
  }
  return tests;
}
