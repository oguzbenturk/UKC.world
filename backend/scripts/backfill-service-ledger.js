#!/usr/bin/env node
import process from 'node:process';
import { syncServiceRevenueLedger } from '../services/serviceRevenueLedger.js';
import { pool } from '../db.js';

function parseArg(value) {
  if (!value || value === 'null') {
    return undefined;
  }
  return value;
}

async function main() {
  const [, , startArg, endArg] = process.argv;
  const dateStart = parseArg(startArg);
  const dateEnd = parseArg(endArg);

  const rangeLabel = `${dateStart ?? '1900-01-01'} → ${dateEnd ?? '2100-01-01'}`;

  console.log(`⏳ Backfilling service revenue ledger for ${rangeLabel}`);
  try {
     await syncServiceRevenueLedger({ dateStart, dateEnd, truncate: true });
    console.log('✅ Service revenue ledger backfill complete');
  } catch (error) {
    console.error('❌ Failed to backfill service revenue ledger:', error?.message || error);
    process.exitCode = 1;
  } finally {
    await pool.end().catch(() => {});
  }
}

main();
