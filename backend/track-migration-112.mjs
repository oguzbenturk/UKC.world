// Quick script to manually add migration 112 to db
import { pool } from './db.js';
import fs from 'fs';
import crypto from 'crypto';

async function addMigration() {
  const fileName = '112_add_use_image_background_to_member_offerings.sql';
  const filePath = `./migrations/${fileName}`;
  const fileContent = fs.readFileSync(filePath, 'utf8');
  const checksum = crypto.createHash('md5').update(fileContent).digest('hex').slice(0, 8);

  try {
    await pool.query(`
      INSERT INTO schema_migrations (migration_name, checksum, applied_at)
      VALUES ($1, $2, NOW())
      ON CONFLICT (migration_name) DO NOTHING
    `, [fileName, checksum]);
    
    console.log(`✓ Migration ${fileName} tracked with checksum ${checksum}`);
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

addMigration();
