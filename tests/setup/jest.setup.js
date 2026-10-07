import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Setup environment for testing
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load test environment variables
try {
  dotenv.config({ path: path.join(__dirname, '../../backend', '.env.test') });
} catch (e) {
  // .env.test might not exist - that's okay
}

// Also load the local dev env (no override): suites that mock backend/db.js
// never trigger db.js's own dotenv load, yet server.js imports still need
// JWT_SECRET etc. (socketService throws at import time without it).
try {
  dotenv.config({ path: path.join(__dirname, '../../backend', '.env') });
} catch (e) {
  // backend/.env might not exist - that's okay
}

// SAFETY: backend tests write to the database. `push-all` temporarily swaps
// backend/.env to production credentials, so refuse to run unless the DB is
// local. (db.js re-reads backend/.env with override, so checking the file's
// value here covers what the pool will actually connect to.)
const assertLocalDatabase = () => {
  const parsed = dotenv.config({ path: path.join(__dirname, '../../backend', '.env'), processEnv: {} }).parsed || {};
  const candidates = [process.env.DATABASE_URL, parsed.DATABASE_URL].filter(Boolean);
  for (const url of candidates) {
    let host = '';
    try {
      host = new URL(url).hostname;
    } catch {
      host = '';
    }
    if (!['localhost', '127.0.0.1', '::1', '[::1]', 'postgres', 'db'].includes(host) && process.env.ALLOW_NONLOCAL_TEST_DB !== 'true') {
      throw new Error(`Refusing to run backend tests against non-local database host "${host || 'unparseable'}". Point backend/.env at the local docker DB (npm run db:dev:up).`);
    }
  }
};
assertLocalDatabase();

// Set test-specific environment variables
process.env.NODE_ENV = 'test';
process.env.REDIS_HOST = process.env.REDIS_HOST || 'localhost';
process.env.REDIS_PORT = process.env.REDIS_PORT || '6379';
process.env.EMAIL_TRANSPORT = process.env.EMAIL_TRANSPORT || 'stream';
process.env.FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';
