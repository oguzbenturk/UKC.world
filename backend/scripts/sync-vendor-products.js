// backend/scripts/sync-vendor-products.js
// CLI helper to sync ION / Duotone product catalogs into the local database.

import 'dotenv/config';
import { syncVendorProducts } from '../services/vendorProductSyncService.js';
import { pool } from '../db.js';

const parseVendorArg = (value) => {
  if (!value) return undefined;
  if (Array.isArray(value)) {
    return value.map((item) => String(item).toLowerCase());
  }
  return String(value)
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
};

const buildArgMap = () => {
  const args = process.argv.slice(2);
  const map = {};
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg.startsWith('--')) {
      const key = arg.replace(/^--/, '');
      const next = args[i + 1];
      if (next && !next.startsWith('-')) {
        map[key] = next;
        i += 1;
      } else {
        map[key] = true;
      }
    } else if (arg.startsWith('-')) {
      const key = arg.replace(/^-/, '');
      const next = args[i + 1];
      if (next && !next.startsWith('-')) {
        map[key] = next;
        i += 1;
      } else {
        map[key] = true;
      }
    }
  }
  return map;
};

const argvMap = buildArgMap();

const vendorArg = argvMap.vendors || argvMap.vendor || argvMap.v;
const dryRunFlag = argvMap['dry-run'] || argvMap.dryRun || argvMap.d;

const parseBoolean = (value) => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    return ['true', '1', 'yes', 'y'].includes(value.toLowerCase());
  }
  return Boolean(value);
};

const vendorKeys = parseVendorArg(vendorArg);
const dryRun = parseBoolean(dryRunFlag);

(async () => {
  console.log('🔄 Starting vendor product sync', {
    vendorKeys,
    dryRun
  });

  try {
    const result = await syncVendorProducts({ vendorKeys, dryRun });
    console.log('✅ Vendor sync complete:', JSON.stringify(result, null, 2));
  } catch (error) {
    console.error('❌ Vendor sync failed:', error.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();
