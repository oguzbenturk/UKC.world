/* eslint-disable max-depth */
import pg from 'pg';
import { performance } from 'node:perf_hooks';
import crypto from 'crypto';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';
import { logger } from './middlewares/errorHandler.js';

// Get correct path to .env file
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envPath = path.join(__dirname, '.env');
// Load .env if present (non-blocking)
dotenv.config({ path: envPath, override: true });

const { Pool } = pg;

let pool;

const parseNumericEnv = (value, fallback) => {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
};

const DEFAULT_POOL_WARN_WAITING = parseNumericEnv(process.env.DB_POOL_WARN_MAX_WAITING, 18);
const DEFAULT_POOL_WARN_ACQUIRE_MS = parseNumericEnv(process.env.DB_POOL_WARN_ACQUIRE_MS, 2000);
const DEFAULT_POOL_WARN_DEBOUNCE_MS = parseNumericEnv(process.env.DB_POOL_WARN_DEBOUNCE_MS, 60000);
const DEFAULT_SLOW_QUERY_THRESHOLD_MS = parseNumericEnv(process.env.DB_SLOW_QUERY_THRESHOLD_MS, 1500);
const DEFAULT_POOL_METRICS_INTERVAL_MS = parseNumericEnv(process.env.DB_POOL_METRICS_INTERVAL_MS, 60000);

const poolGuardrailConfig = {
  warnWaiting: DEFAULT_POOL_WARN_WAITING,
  warnAcquireMs: DEFAULT_POOL_WARN_ACQUIRE_MS,
  debounceMs: DEFAULT_POOL_WARN_DEBOUNCE_MS,
  slowQueryMs: DEFAULT_SLOW_QUERY_THRESHOLD_MS,
  metricsIntervalMs: DEFAULT_POOL_METRICS_INTERVAL_MS
};

const formatSqlPreview = (sqlText) => {
  if (!sqlText) {
    return '<no-sql>'; // intentionally short to avoid leaking params
  }

  const condensed = String(sqlText)
    .replace(/\s+/g, ' ')
    .trim();

  if (!condensed) {
    return '<blank-sql>';
  }

  if (condensed.length > 160) {
    return `${condensed.slice(0, 160)}…`;
  }

  return condensed;
};

const extractQueryDetails = (args) => {
  if (!args || !args.length) {
    return { text: '<unknown>', paramsCount: 0 };
  }

  const [first, second] = args;

  if (typeof first === 'string') {
    return {
      text: first,
      paramsCount: Array.isArray(second) ? second.length : 0
    };
  }

  if (first && typeof first === 'object') {
    const text = typeof first.text === 'string' ? first.text : '<object-sql>';
    const paramsCount = Array.isArray(first.values) ? first.values.length : 0;
    return { text, paramsCount };
  }

  return { text: String(first), paramsCount: 0 };
};

let lastQueueWarningAt = 0;

const maybeWarnQueueSaturation = (context = {}) => {
  if (!pool || !poolGuardrailConfig.warnWaiting) {
    return;
  }

  if (pool.waitingCount < poolGuardrailConfig.warnWaiting) {
    return;
  }

  const now = Date.now();
  if (now - lastQueueWarningAt < poolGuardrailConfig.debounceMs) {
    return;
  }

  lastQueueWarningAt = now;

  logger.warn('Database pool backlog detected', {
    waitingCount: pool.waitingCount,
    totalCount: pool.totalCount,
    idleCount: pool.idleCount,
    ...context
  });
};

const maybeLogSlowQuery = (durationMs, source, args) => {
  if (!poolGuardrailConfig.slowQueryMs || durationMs < poolGuardrailConfig.slowQueryMs) {
    return;
  }

  const { text, paramsCount } = extractQueryDetails(args);

  logger.warn('Slow database query detected', {
    durationMs: Math.round(durationMs),
    source,
    paramsCount,
    sqlPreview: formatSqlPreview(text),
    totalCount: pool?.totalCount ?? null,
    idleCount: pool?.idleCount ?? null,
    waitingCount: pool?.waitingCount ?? null
  });
};

const logQueryError = (durationMs, source, args, error) => {
  const { text, paramsCount } = extractQueryDetails(args);

  logger.error('Database query failed', {
    durationMs: Math.round(durationMs),
    source,
    paramsCount,
    sqlPreview: formatSqlPreview(text),
    error: error?.message ?? error
  });
};

const instrumentQueryRunner = (runner, sourceLabel) => {
  return async function instrumentedQuery(...args) {
    const started = performance.now();
    try {
      const result = await runner.apply(this, args);
      maybeLogSlowQuery(performance.now() - started, sourceLabel, args);
      return result;
    } catch (error) {
      logQueryError(performance.now() - started, sourceLabel, args, error);
      throw error;
    }
  };
};

const instrumentClient = (client) => {
  if (!client || client._plannivoGuardrailsApplied) {
    return client;
  }

  client._plannivoGuardrailsApplied = true;

  if (typeof client.query === 'function') {
    const originalClientQuery = client.query.bind(client);
    client.query = instrumentQueryRunner(originalClientQuery, 'client');
  }

  return client;
};

const buildConnectionString = () => {
  if (process.env.LOCAL_DATABASE_URL) {
    return { value: process.env.LOCAL_DATABASE_URL, source: 'LOCAL_DATABASE_URL' };
  }

  if (process.env.DATABASE_URL) {
    return { value: process.env.DATABASE_URL, source: 'DATABASE_URL' };
  }

  const host = process.env.DB_HOST;
  const port = process.env.DB_PORT || 5432;
  const name = process.env.DB_NAME;
  const user = process.env.DB_USER;
  const pass = process.env.DB_PASS;

  if (host && name && user) {
    const passwordPart = pass ? `:${encodeURIComponent(pass)}` : '';
    return {
      value: `postgresql://${user}${passwordPart}@${host}:${port}/${name}`,
      source: 'DB_HOST/DB_NAME/DB_USER vars'
    };
  }

  return { value: null, source: 'undefined' };
};

try {
  const { value: connectionString, source: connectionSource } = buildConnectionString();

  if (!connectionString) {
    throw new Error('Database connection details are missing. Set LOCAL_DATABASE_URL, DATABASE_URL, or DB_HOST/DB_NAME/DB_USER.');
  }

  logger.info(`Using connection string from ${connectionSource} (masked user:pass)`);

  let dbHost = '';
  try {
    dbHost = new URL(connectionString).hostname || '';
  } catch {
    dbHost = process.env.DB_HOST || '';
  }

  const isLocalDbHost = /^(localhost|127\.|db$)/i.test(dbHost);
  const explicitDbSsl = process.env.DB_SSL;
  const dbSslEnabled = explicitDbSsl
    ? explicitDbSsl === 'true'
    : (process.env.NODE_ENV === 'production' && !isLocalDbHost);

  const dbSslRejectUnauthorized = process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false';

  // Force UTC interpretation for TIMESTAMP WITHOUT TIME ZONE columns (OID 1114)
  // Without this, the pg driver interprets bare timestamps as local time,
  // causing offsets (e.g. "3 hours ago" for just-created records in UTC+3).
  pg.types.setTypeParser(1114, (str) => new Date(str + 'Z'));

  pool = new Pool({
    connectionString,
    ssl: dbSslEnabled ? { rejectUnauthorized: dbSslRejectUnauthorized } : false,
    
    // Optimization settings for better performance
    max: 40, // Maximum number of clients in pool (increased for better concurrency)
    min: 10,  // Minimum number of clients in pool (increased for better availability)
    idleTimeoutMillis: 30000, // Close idle clients after 30s
    connectionTimeoutMillis: 10000, // Return error after 10s if connection cannot be established
    acquireTimeoutMillis: 10000, // Return error if no connection available after 10s
  // Keep connections alive to avoid intermediary (Docker/WiFi) idling out sockets
  keepAlive: true,
  keepAliveInitialDelayMillis: 10000,
  // Recycle clients periodically to avoid long-lived sockets causing unexpected terminations
  maxUses: 7500,
    
    // Enable better connection management
    allowExitOnIdle: false,
  });

  pool.on('connect', (client) => {
    logger.info('🔗 New database connection established');
    instrumentClient(client);
  });

  pool.on('error', (err) => {
    logger.error('❌ Database pool error:', err);
  });

  pool.on('acquire', (client) => {
    logger.info('📊 Database connection acquired from pool');
    instrumentClient(client);
    maybeWarnQueueSaturation({ event: 'pool.acquire' });
  });

  pool.on('release', () => {
    logger.info('📤 Database connection released back to pool');
  });

  const originalPoolQuery = pool.query.bind(pool);
  pool.query = instrumentQueryRunner(originalPoolQuery, 'pool');

  const originalConnect = pool.connect.bind(pool);
  pool.connect = async (...args) => {
    const started = performance.now();
    maybeWarnQueueSaturation({ event: 'pool.connect' });

    try {
      const client = await originalConnect(...args);
      const elapsed = performance.now() - started;

      if (poolGuardrailConfig.warnAcquireMs && elapsed > poolGuardrailConfig.warnAcquireMs) {
        logger.warn('Slow database connection acquisition', {
          durationMs: Math.round(elapsed),
          waitingCount: pool.waitingCount,
          totalCount: pool.totalCount,
          idleCount: pool.idleCount
        });
      }

      return instrumentClient(client);
    } catch (error) {
      const elapsed = performance.now() - started;
      logger.error('Failed to acquire database connection', {
        durationMs: Math.round(elapsed),
        waitingCount: pool.waitingCount,
        totalCount: pool.totalCount,
        error: error?.message ?? error
      });
      throw error;
    }
  };

  if (poolGuardrailConfig.metricsIntervalMs > 0) {
    const interval = setInterval(() => {
      if (!pool) {
        return;
      }

      const totalCount = pool.totalCount ?? 0;
      const idleCount = pool.idleCount ?? 0;
      const waitingCount = pool.waitingCount ?? 0;
      const inUseCount = Math.max(totalCount - idleCount, 0);
      const utilization = totalCount > 0 ? inUseCount / totalCount : 0;

      if (waitingCount === 0 && utilization < 0.5) {
        return;
      }

      logger.info('Database pool snapshot', {
        totalCount,
        idleCount,
        waitingCount,
        inUseCount,
        utilizationPct: Number((utilization * 100).toFixed(1))
      });
    }, poolGuardrailConfig.metricsIntervalMs);

    if (typeof interval.unref === 'function') {
      interval.unref();
    }
  }

  // Test the connection
  (async () => {
    try {
    const client = await pool.connect();
    logger.info('Successfully connected to the database and acquired a client.');
    await client.query('SELECT NOW()');
    logger.info('Test query successful');
      client.release();
    } catch (err) {
    logger.error('Error connecting to the database or running test query:', err);
      // If connection fails, we might want to exit or handle it gracefully
      // For now, just logging the error. The app might not work correctly.
    }
  })();

} catch (error) {
  logger.error('Failed to create a new Pool instance:', error);
  // Fallback or error handling if pool creation itself fails
  // This could be due to misconfiguration or environment issues
  // For now, we'll set pool to null or a mock, and the app will likely fail at DB operations
  pool = null; 
  logger.error('Database pool could not be initialized. Application might not work as expected.');
}

/* eslint-disable complexity, max-depth */
// Utility: split a SQL file into executable statements, respecting quotes and dollar-quoting
const splitSqlStatements = (sql) => {
  const stmts = [];
  let buf = '';
  let inSingle = false;
  let inDouble = false;
  let inLineComment = false;
  let inBlockComment = false;
  let dollarTag = null; // e.g. $func$ ... $func$

  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i];
    const next = sql[i + 1];

    // Handle end of line comment
    if (inLineComment) {
      buf += ch;
      if (ch === '\n') inLineComment = false;
      continue;
    }

    // Handle end of block comment
    if (inBlockComment) {
      buf += ch;
      if (ch === '*' && next === '/') {
        buf += next; i++;
        inBlockComment = false;
      }
      continue;
    }

    // Start comments (only when not in quotes or dollar-quote)
    if (!inSingle && !inDouble && !dollarTag) {
      if (ch === '-' && next === '-') { inLineComment = true; buf += ch; continue; }
      if (ch === '/' && next === '*') { inBlockComment = true; buf += ch; continue; }
    }

    // Handle dollar-quoting start/end
    if (!inSingle && !inDouble) {
      if (!dollarTag) {
        // detect $tag$
        if (ch === '$') {
          // find next $
          let j = i + 1;
          while (j < sql.length && /[A-Za-z0-9_]/.test(sql[j])) j++;
          if (j < sql.length && sql[j] === '$') {
            dollarTag = sql.slice(i, j + 1); // like $tag$
            buf += dollarTag;
            i = j;
            continue;
          }
        }
      } else {
        // inside dollar-quote, look for closing tag
        if (sql.startsWith(dollarTag, i)) {
          buf += dollarTag;
          i += dollarTag.length - 1;
          dollarTag = null;
          continue;
        }
        buf += ch;
        continue;
      }
    }

    // Handle quotes
    if (!dollarTag) {
      if (!inDouble && ch === "'" && !inSingle) { inSingle = true; buf += ch; continue; }
      if (inSingle) { buf += ch; if (ch === "'" && sql[i - 1] !== '\\') inSingle = false; continue; }
      if (!inSingle && ch === '"' && !inDouble) { inDouble = true; buf += ch; continue; }
      if (inDouble) { buf += ch; if (ch === '"' && sql[i - 1] !== '\\') inDouble = false; continue; }
    }

    // Statement boundary
    if (!inSingle && !inDouble && !dollarTag && ch === ';') {
      const stmt = buf.trim();
      if (stmt) stmts.push(stmt);
      buf = '';
      continue;
    }

    buf += ch;
  }

  const tail = buf.trim();
  if (tail) stmts.push(tail);
  return stmts;
};
/* eslint-enable complexity, max-depth */

// Ensure that the database schema is up-to-date and consistent across environments
// IMPORTANT: Some statements like CREATE INDEX CONCURRENTLY cannot run inside a transaction block.
// We therefore apply each migration file separately and only wrap safe parts in a transaction.
/* eslint-disable complexity, max-depth */
const _runMigrations = async () => {
  if (process.env.RUN_DB_MIGRATIONS !== 'true') {
    logger.info('DB migrations disabled (set RUN_DB_MIGRATIONS=true to enable)');
    return;
  }
  const client = await pool.connect();
  try {
    // Ensure migrations ledger exists
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id SERIAL PRIMARY KEY,
        filename TEXT,
        checksum TEXT,
        applied_at TIMESTAMPTZ DEFAULT NOW()
      );
      -- Backfill/ensure columns for existing installs
      ALTER TABLE schema_migrations ADD COLUMN IF NOT EXISTS filename TEXT;
      ALTER TABLE schema_migrations ADD COLUMN IF NOT EXISTS checksum TEXT;
      ALTER TABLE schema_migrations ADD COLUMN IF NOT EXISTS applied_at TIMESTAMPTZ DEFAULT NOW();
      -- Legacy support: some environments have migration_name/ executed_at
      ALTER TABLE schema_migrations ADD COLUMN IF NOT EXISTS migration_name TEXT;
      ALTER TABLE schema_migrations ADD COLUMN IF NOT EXISTS executed_at TIMESTAMPTZ;
      -- Relax legacy NOT NULL on migration_name if present and backfill values
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'schema_migrations'
            AND column_name = 'migration_name'
            AND is_nullable = 'NO'
        ) THEN
          EXECUTE 'ALTER TABLE schema_migrations ALTER COLUMN migration_name DROP NOT NULL';
        END IF;
      END $$;
      UPDATE schema_migrations
        SET migration_name = COALESCE(migration_name, filename)
      WHERE migration_name IS NULL;
      -- Ensure uniqueness on filename (supports multiple NULLs which is fine)
      CREATE UNIQUE INDEX IF NOT EXISTS schema_migrations_filename_idx ON schema_migrations(filename);
    `);
    const migrationsPath = path.join(__dirname, 'db', 'migrations');
  const dirents = await fs.readdir(migrationsPath, { withFileTypes: true }).catch(() => []);
    const allFiles = dirents
      .filter((d) => d.isFile())
      .map((d) => d.name)
      .sort();

    // Only process SQL-based migrations; ignore helper scripts like *.js that accompany manual runs
    const allSqlFiles = allFiles.filter((name) => name.toLowerCase().endsWith('.sql'));

    // Skip deprecated/disabled performance index migrations entirely
    const skipPatterns = [/performance_indexes/i, /^001_add_performance_indexes\.sql$/i, /^003_performance_indexes\.sql$/i];
    const migrationFiles = allSqlFiles.filter((name) => !skipPatterns.some((rx) => rx.test(name)));
    const skipped = allSqlFiles.filter((name) => !migrationFiles.includes(name));
    for (const s of skipped) {
      logger.info(`Skipping disabled migration file: ${s}`);
    }

    if (!migrationFiles.length) {
      logger.info('No migration files found, skipping.');
      return;
    }

    for (const file of migrationFiles) {
      const fullPath = path.join(migrationsPath, file);
      const sql = await fs.readFile(fullPath, 'utf8');
      const statements = splitSqlStatements(sql);
      if (!statements.length) {
        logger.info(`Skipping empty migration file: ${file}`);
        // Record as applied so it won't be retried repeatedly
        const checksum = crypto.createHash('sha256').update(sql).digest('hex');
        await client.query(
          'INSERT INTO schema_migrations (filename, checksum, migration_name) VALUES ($1, $2, $3) ON CONFLICT (filename) DO NOTHING',
          [file, checksum, file]
        );
        continue;
      }
      const checksum = crypto.createHash('sha256').update(sql).digest('hex');

      // Skip if already applied (by filename). If checksum differs, log a warning.
      const { rows: existingRows } = await client.query(
        'SELECT checksum, filename, migration_name FROM schema_migrations WHERE filename = $1 OR migration_name = $1',
        [file]
      );
      if (existingRows.length) {
        const prev = existingRows[0]?.checksum;
        if (prev && prev !== checksum) {
          logger.warn(`Migration ${file} already applied but checksum differs. Skipping re-apply. Stored=${prev.substring(0,8)} current=${checksum.substring(0,8)}`);
        } else {
          logger.info(`Skipping already applied migration: ${file}`);
        }
        continue;
      }

      const fileHasConcurrent = statements.some((s) => /\bCONCURRENTLY\b/i.test(s));

      try {
    if (fileHasConcurrent) {
          logger.info(`Applying non-transactional migration: ${file}`);
          // Use a fresh client to guarantee no open transaction context
          const nonTxClient = await pool.connect();
          try {
            for (const stmt of statements) {
              const trimmed = stmt.trim();
              if (!trimmed) continue;
              if (/^BEGIN\b|^COMMIT\b|^ROLLBACK\b/i.test(trimmed)) continue;
              try {
                await nonTxClient.query(trimmed);
              } catch (e) {
                // If table or column doesn't exist and this is an index creation, skip gracefully
                if (e && /CREATE\s+INDEX/i.test(trimmed) && (e.code === '42P01' || e.code === '42703')) {
                  const reason = e.code === '42P01' ? 'missing table' : 'missing column';
                  logger.warn(`Skipping index creation due to ${reason} (may be created later by another migration): ${file}`);
                  continue;
                }
                // If FK type mismatch (42804), skip just this statement
                if (e && e.code === '42804') {
                  logger.error(`Skipping statement due to type mismatch (likely FK columns incompatible): ${trimmed.slice(0,120)}...`);
                  continue;
                }
                throw e;
              }
            }
      await client.query(
        'INSERT INTO schema_migrations (filename, checksum, migration_name) VALUES ($1, $2, $3) ON CONFLICT (filename) DO NOTHING',
        [file, checksum, file]
      );
          } finally {
            nonTxClient.release();
          }
        } else {
          logger.info(`Applying transactional migration: ${file}`);
          await client.query('BEGIN');
          try {
            for (const stmt of statements) {
              const trimmed = stmt.trim();
              if (!trimmed) continue;
              if (/^BEGIN\b|^COMMIT\b|^ROLLBACK\b/i.test(trimmed)) continue;
              try {
                await client.query(trimmed);
              } catch (e) {
                if (e && /CREATE\s+INDEX/i.test(trimmed) && (e.code === '42P01' || e.code === '42703')) {
                  const reason = e.code === '42P01' ? 'missing table' : 'missing column';
                  logger.warn(`Skipping index creation due to ${reason} (may be created later by another migration): ${file}`);
                  continue;
                }
                if (e && e.code === '42804') {
                  logger.error(`Skipping statement due to type mismatch (likely FK columns incompatible): ${trimmed.slice(0,120)}...`);
                  continue;
                }
                throw e;
              }
            }
            await client.query('COMMIT');
      await client.query(
        'INSERT INTO schema_migrations (filename, checksum, migration_name) VALUES ($1, $2, $3) ON CONFLICT (filename) DO NOTHING',
        [file, checksum, file]
      );
          } catch (innerErr) {
            await client.query('ROLLBACK');
            throw innerErr;
          }
        }
      } catch (fileErr) {
        // Ensure no open transaction remains
        try { await client.query('ROLLBACK'); } catch (_) {}
        logger.error(`Error applying migration file ${file}:`, fileErr);
        throw fileErr;
      }
    }

    logger.info('Database migrations applied successfully');
  } catch (err) {
    logger.error('Error applying database migrations:', err);
  } finally {
    client.release();
  }
};

// Run migrations on startup
// Apply SQL migrations on startup to ensure required tables/seeds exist (idempotent)
export const runDbMigrations = _runMigrations;

// Store the promise so migrate.js can await it
let _migrationPromise = null;
export const getMigrationPromise = () => _migrationPromise;

// Auto-run migrations on import if RUN_DB_MIGRATIONS is already set
if (process.env.RUN_DB_MIGRATIONS === 'true' && !process.env.MIGRATION_CLI_MODE) {
  _migrationPromise = _runMigrations().catch((err) => {
    logger.error('Failed running startup DB migrations:', err);
  });
}

// Export pool stats function for monitoring
export const getPoolStats = () => {
  if (!pool) {
    return {
      totalCount: 0,
      idleCount: 0,
      waitingCount: 0,
      inUseCount: 0,
      saturationPct: 0
    };
  }

  const totalCount = pool.totalCount ?? 0;
  const idleCount = pool.idleCount ?? 0;
  const waitingCount = pool.waitingCount ?? 0;
  const inUseCount = Math.max(totalCount - idleCount, 0);
  const saturationPct = totalCount > 0 ? Number(((inUseCount / totalCount) * 100).toFixed(1)) : 0;

  return {
    totalCount,
    idleCount,
    waitingCount,
    inUseCount,
    saturationPct
  };
};

export { pool };
