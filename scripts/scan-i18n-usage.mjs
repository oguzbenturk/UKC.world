#!/usr/bin/env node
// Scans .jsx/.js files under src/ for broken i18n usage:
//   1. File calls `t(...)` but never calls `useTranslation()` → guaranteed crash.
//   2. File has multiple top-level components using `t(...)` but `t` is only destructured
//      in some → inner components will crash when rendered.
//
// Usage: node scripts/scan-i18n-usage.mjs

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', 'src');

/** Recursively list .jsx/.js files under a dir, skipping node_modules. */
const walk = (dir, out = []) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '__tests__') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(jsx|js)$/.test(entry.name)) out.push(full);
  }
  return out;
};

/** Match `t(` as a call, not `.t(` (method) or `let(...)` etc. */
const T_CALL_RE = /(?<![A-Za-z0-9_$.])t\s*\(/g;
const USE_TRANSLATION_CALL_RE = /\buseTranslation\s*\(/;
const DESTRUCTURE_T_RE = /\bconst\s*\{\s*[^}]*\bt\b[^}]*\}\s*=\s*useTranslation\s*\(/g;

/** Extract top-level component/function starts. Skips lazy-wrapped imports.
 * Returns opening signature (up to arrow/body) so we can detect `t` as a prop. */
const componentStarts = (src) => {
  const lines = src.split('\n');
  const starts = [];
  // PascalCase: starts uppercase AND contains at least one lowercase letter.
  const nameRe = /^(?:export\s+(?:default\s+)?)?(?:const|function)\s+([A-Z][A-Za-z0-9_]*[a-z][A-Za-z0-9_]*)\b/;
  for (let i = 0; i < lines.length; i += 1) {
    const m = lines[i].match(nameRe);
    if (!m) continue;
    // Capture up to 20 lines to read the signature (multi-line prop destructuring).
    let sig = lines[i];
    for (let k = 1; k < 20 && i + k < lines.length; k += 1) {
      sig += ' ' + lines[i + k];
      if (/=>|\{/.test(lines[i + k])) break;
    }
    // Skip lazy()-wrapped imports and similar HOC one-liners (not component bodies).
    if (/=\s*(?:React\.)?lazy\s*\(/.test(sig)) continue;
    starts.push({ name: m[1], line: i, signature: sig });
  }
  return starts;
};

/** Does the opening signature destructure `t` from props? */
const receivesTProp = (signature) => {
  const m = signature.match(/\(\s*\{([^}]*)\}/);
  if (!m) return false;
  return /(^|[,\s])t\s*(?:[,=}:]|$)/.test(m[1]);
};

/** Given a file, return indexes of `t(` uses and `const { t } = useTranslation()` destructures, by line. */
const analyse = (src) => {
  const lines = src.split('\n');
  const tCalls = [];
  const destructures = [];
  lines.forEach((line, idx) => {
    // Skip comments
    const stripped = line.replace(/\/\/.*$/, '').replace(/\/\*.*?\*\//g, '');
    if (T_CALL_RE.test(stripped)) tCalls.push(idx);
    T_CALL_RE.lastIndex = 0;
    if (DESTRUCTURE_T_RE.test(stripped)) destructures.push(idx);
    DESTRUCTURE_T_RE.lastIndex = 0;
  });
  const hasUseTranslationCall = USE_TRANSLATION_CALL_RE.test(src);
  return { tCalls, destructures, hasUseTranslationCall };
};

/** Group t-call lines by which component block they belong to (whichever componentStart precedes them). */
const groupByComponent = (tCallLines, compStarts) => {
  const groups = new Map();
  for (const line of tCallLines) {
    let owner = null;
    for (const c of compStarts) {
      if (c.line <= line) owner = c;
      else break;
    }
    if (owner) {
      if (!groups.has(owner.name)) groups.set(owner.name, { start: owner.line, lines: [] });
      groups.get(owner.name).lines.push(line);
    } else {
      if (!groups.has('__module__')) groups.set('__module__', { start: 0, lines: [] });
      groups.get('__module__').lines.push(line);
    }
  }
  return groups;
};

const files = walk(ROOT);
const issues = [];

for (const file of files) {
  const src = fs.readFileSync(file, 'utf8');
  const { tCalls, destructures, hasUseTranslationCall } = analyse(src);

  if (tCalls.length === 0) continue;

  // Check 1: uses t() but never calls useTranslation()
  if (!hasUseTranslationCall) {
    issues.push({
      severity: 'error',
      file: path.relative(ROOT, file),
      kind: 'no-useTranslation',
      message: `Uses t() (${tCalls.length}×) but never calls useTranslation(). First use at line ${tCalls[0] + 1}.`,
    });
    continue;
  }

  // Check 2: multiple component blocks, t() used in a block that has no local destructure AND no destructure before it at module scope
  const compStarts = componentStarts(src);
  if (compStarts.length <= 1) continue; // Single component, parent scope enough.

  const groups = groupByComponent(tCalls, compStarts);
  for (const [compName, info] of groups) {
    if (compName === '__module__') continue;
    // Find the component's block end: start of next component (or EOF).
    const nextComp = compStarts.find((c) => c.line > info.start);
    const endLine = nextComp ? nextComp.line : Infinity;
    // Accept if the component: (a) has its own useTranslation destructure, OR (b) receives `t` as a prop.
    const hasOwnDestructure = destructures.some((d) => d >= info.start && d < endLine);
    const comp = compStarts.find((c) => c.line === info.start);
    const getsTViaProps = comp ? receivesTProp(comp.signature) : false;
    if (!hasOwnDestructure && !getsTViaProps) {
      issues.push({
        severity: 'error',
        file: path.relative(ROOT, file),
        kind: 'component-missing-destructure',
        component: compName,
        message: `Component \`${compName}\` (line ${info.start + 1}) uses t() but has no local \`const { t } = useTranslation()\`. First use at line ${info.lines[0] + 1}.`,
      });
    }
  }
}

if (issues.length === 0) {
  console.log('✅ No i18n usage issues found across', files.length, 'files.');
  process.exit(0);
}

// Group by file for a cleaner report.
const byFile = new Map();
for (const i of issues) {
  if (!byFile.has(i.file)) byFile.set(i.file, []);
  byFile.get(i.file).push(i);
}

console.log(`Found ${issues.length} issue(s) across ${byFile.size} file(s):\n`);
for (const [file, list] of byFile) {
  console.log(`  ${file}`);
  for (const i of list) {
    console.log(`    - [${i.kind}] ${i.message}`);
  }
}
process.exit(1);
