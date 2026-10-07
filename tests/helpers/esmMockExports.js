/**
 * ESM mock helper for Jest `unstable_mockModule`.
 *
 * Under ESM a mock factory must provide EVERY named export that any importer
 * (directly or transitively) asks for — otherwise linking fails with
 * "does not provide an export named X" and the whole suite dies. Hand-written
 * factories go stale whenever the real module gains an export.
 *
 * `stubExports(absPath, overrides)` reads the real module's source, finds its
 * named exports and returns `{ name: jest.fn(), ..., ...overrides }`, so a
 * suite only spells out the exports it actually cares about.
 */
import fs from 'fs';
import { jest } from '@jest/globals';

export function listNamedExports(absPath) {
  const src = fs.readFileSync(absPath, 'utf8');
  const names = new Set();
  const declRe = /^export\s+(?:async\s+)?(?:function\*?|const|let|var|class)\s+([A-Za-z_$][\w$]*)/gm;
  let m;
  while ((m = declRe.exec(src))) names.add(m[1]);
  const listRe = /^export\s*\{([^}]*)\}/gm;
  while ((m = listRe.exec(src))) {
    for (const part of m[1].split(',')) {
      const seg = part.trim();
      if (!seg) continue;
      const alias = seg.split(/\s+as\s+/).pop().trim();
      if (alias && alias !== 'default') names.add(alias);
    }
  }
  return [...names];
}

export function stubExports(absPath, overrides = {}) {
  const stubs = {};
  for (const name of listNamedExports(absPath)) {
    stubs[name] = jest.fn();
  }
  return { ...stubs, default: {}, ...overrides };
}
