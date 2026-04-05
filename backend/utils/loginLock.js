/**
 * Emergency lock: reject password login, public registration, 2FA completion, and
 * all API access with existing JWTs (except POST /auth/logout). Socket JWT auth is also rejected.
 *
 * Env resolution:
 * - After normal dotenv loads, `applyDisableLoginEnvPrecedence()` re-applies DISABLE_LOGIN from
 *   files so project **root** `.env` wins over `backend/.env` (db.js uses override:true on backend
 *   and would otherwise freeze `DISABLE_LOGIN=false` from .env.example).
 * - `DISABLE_LOGIN_FORCE=true` in the process environment (e.g. Docker/host) always enables the lock.
 */

import fs from 'fs';
import path from 'path';

function readDisableLoginValueFromEnvFile(filePath) {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const m = trimmed.match(/^DISABLE_LOGIN\s*=\s*(.*)$/);
      if (m) {
        return m[1].trim().replace(/^['"]|['"]$/g, '');
      }
    }
  } catch {
    // missing or unreadable
  }
  return undefined;
}

/**
 * Re-apply DISABLE_LOGIN from env files: **root `.env` overrides `backend/.env`** when both define it.
 * Call once at server startup after `dotenv.config` (and after `db.js` has loaded).
 */
export function applyDisableLoginEnvPrecedence(backendDirname) {
  const backendPath = path.join(backendDirname, '.env');
  const rootPath = path.join(backendDirname, '..', '.env');
  const fromRoot = readDisableLoginValueFromEnvFile(rootPath);
  const fromBackend = readDisableLoginValueFromEnvFile(backendPath);
  if (fromRoot !== undefined) {
    process.env.DISABLE_LOGIN = fromRoot;
  } else if (fromBackend !== undefined) {
    process.env.DISABLE_LOGIN = fromBackend;
  }
}

export function isAuthCreationDisabled() {
  const force = String(process.env.DISABLE_LOGIN_FORCE || '').trim().toLowerCase();
  if (force === 'true' || force === '1' || force === 'yes' || force === 'on') {
    return true;
  }
  const v = String(process.env.DISABLE_LOGIN || '').trim().toLowerCase();
  return v === 'true' || v === '1' || v === 'yes' || v === 'on';
}
