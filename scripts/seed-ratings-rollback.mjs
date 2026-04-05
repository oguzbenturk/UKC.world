/**
 * Rollback Script: Undo ratings created by seed-ratings.mjs
 *
 * Usage:  node scripts/seed-ratings-rollback.mjs
 *
 * Reads scripts/seed-ratings-manifest.json and deletes instructor_ratings
 * by ID using a direct database connection.
 * (No DELETE /ratings API endpoint exists, so we use pg directly.)
 */

import { readFileSync, existsSync, renameSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';
import pg from 'pg';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MANIFEST_PATH = resolve(__dirname, 'seed-ratings-manifest.json');

// Load backend env for DATABASE_URL
config({ path: resolve(__dirname, '..', 'backend', '.env') });

async function main() {
  console.log('🔄 Rollback: undoing seed-ratings\n');

  if (!existsSync(MANIFEST_PATH)) {
    console.error('❌ No manifest found at', MANIFEST_PATH);
    console.error('   Run seed-ratings.mjs first, or the manifest was already rolled back.');
    process.exit(1);
  }

  const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf-8'));
  const ratingIds = manifest.ratingIds || [];

  console.log(`   Manifest created: ${manifest.createdAt}`);
  console.log(`   Ratings to delete: ${ratingIds.length}`);
  console.log(`   Students involved: ${manifest.studentEmails?.length || 0}\n`);

  if (ratingIds.length === 0) {
    console.log('   Nothing to rollback.');
    process.exit(0);
  }

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('❌ DATABASE_URL not found. Set it in backend/.env or as environment variable.');
    process.exit(1);
  }

  const pool = new pg.Pool({ connectionString });

  try {
    // Delete ratings in batches of 50
    const batchSize = 50;
    let deleted = 0;

    for (let i = 0; i < ratingIds.length; i += batchSize) {
      const batch = ratingIds.slice(i, i + batchSize);
      const placeholders = batch.map((_, idx) => `$${idx + 1}`).join(', ');
      const result = await pool.query(
        `DELETE FROM instructor_ratings WHERE id IN (${placeholders})`,
        batch
      );
      deleted += result.rowCount;
      if (i + batchSize < ratingIds.length) {
        console.log(`   ... ${Math.min(i + batchSize, ratingIds.length)}/${ratingIds.length} processed`);
      }
    }

    console.log(`\n✅ Deleted ${deleted}/${ratingIds.length} ratings from database.`);

    // Archive the manifest
    const archivePath = MANIFEST_PATH.replace('.json', `.rolled-back-${Date.now()}.json`);
    renameSync(MANIFEST_PATH, archivePath);

    console.log(`   Manifest archived: ${archivePath}`);
    console.log('\n═══════════════════════════════════════════════');
    console.log('✅ ROLLBACK COMPLETE');
    console.log('═══════════════════════════════════════════════');
  } catch (error) {
    console.error('❌ Database error:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error('Fatal:', e.message);
  process.exit(1);
});
