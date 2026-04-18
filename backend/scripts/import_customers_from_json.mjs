// Import customers from customers_registration.json into local dev DB.
//
// Usage: node backend/scripts/import_customers_from_json.mjs
//
// - Registers each entry as a `student` role user.
// - Positive per-currency balances -> wallet_balances rows (EUR/TRY/USD).
// - Negative balances -> users.balance (legacy column, all confirmed EUR).
// - Duplicate or missing emails get a deterministic synthetic email
//   so the unique-active-email constraint never fires.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import pg from 'pg';
import bcrypt from 'bcrypt';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');

dotenv.config({ path: path.join(repoRoot, 'backend', '.env') });

const JSON_PATH = path.join(repoRoot, 'customers_registration.json');
const DEFAULT_PASSWORD = 'customer123';

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

function normEmail(e) {
  return (e || '').toLowerCase().trim();
}

function syntheticEmail(niceId) {
  return `customer-${niceId}@imported.local`;
}

function suffixEmail(email, niceId) {
  const at = email.indexOf('@');
  if (at < 0) return syntheticEmail(niceId);
  return `${email.slice(0, at)}+n${niceId}${email.slice(at)}`;
}

async function main() {
  const raw = fs.readFileSync(JSON_PATH, 'utf-8');
  const customers = JSON.parse(raw);
  console.log(`Loaded ${customers.length} customers from JSON`);

  const client = await pool.connect();
  try {
    const roleRes = await client.query("SELECT id FROM roles WHERE name='student'");
    const studentRoleId = roleRes.rows[0]?.id;
    if (!studentRoleId) throw new Error('student role not found');

    const existingRes = await client.query(
      'SELECT lower(email) AS email FROM users WHERE deleted_at IS NULL'
    );
    const takenEmails = new Set(existingRes.rows.map((r) => r.email));

    const passwordHash = await bcrypt.hash(DEFAULT_PASSWORD, 10);

    let inserted = 0;
    let skipped = 0;
    let walletRows = 0;
    let negativeBalances = 0;
    const emailRewrites = [];
    const errors = [];

    await client.query('BEGIN');

    for (const c of customers) {
      const niceId = c.niceId;
      const rawEmail = normEmail(c.email);
      let email;
      if (!rawEmail) {
        email = syntheticEmail(niceId);
      } else if (takenEmails.has(rawEmail)) {
        email = suffixEmail(rawEmail, niceId);
        emailRewrites.push({ niceId, original: rawEmail, rewritten: email });
      } else {
        email = rawEmail;
      }
      if (takenEmails.has(email)) {
        email = syntheticEmail(niceId);
      }
      takenEmails.add(email);

      const list = c.rawData?.customerBalanceDto?.customerCurrencySummaryDtoList || [];
      const positives = list.filter((s) => Number(s.balance) > 0);
      const negatives = list.filter((s) => Number(s.balance) < 0);

      // Validate: all negatives must be EUR (legacy balance column is EUR only).
      for (const n of negatives) {
        if (n.currencyCode !== 'EUR') {
          throw new Error(
            `Customer niceId=${niceId} has a non-EUR negative balance in ${n.currencyCode}; schema can't represent this.`
          );
        }
      }

      const negativeEur = negatives.reduce((acc, n) => acc + Number(n.balance), 0);
      const preferredCurrency =
        list.find((s) => s.currencyCode === 'EUR')?.currencyCode
        || list[0]?.currencyCode
        || 'EUR';

      const name = [c.firstName, c.lastName].filter(Boolean).join(' ').trim() || `Customer ${niceId}`;
      const gender = (c.gender || '').toUpperCase();
      const allowedGender = ['MALE', 'FEMALE'].includes(gender) ? gender.toLowerCase() : null;

      try {
        const insertRes = await client.query(
          `INSERT INTO users (
             name, email, password_hash,
             first_name, last_name, phone,
             country, age, weight,
             preferred_currency, role_id,
             balance, notes, registration_source
           )
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
           ON CONFLICT (email) WHERE deleted_at IS NULL DO NOTHING
           RETURNING id`,
          [
            name,
            email,
            passwordHash,
            c.firstName || null,
            c.lastName || null,
            c.phone || null,
            c.country || null,
            Number.isFinite(c.age) && c.age > 0 ? c.age : null,
            Number.isFinite(c.weight) && c.weight > 0 ? c.weight : null,
            preferredCurrency,
            studentRoleId,
            negativeEur < 0 ? negativeEur : 0,
            c.medicalNote ? `Medical note: ${c.medicalNote}` : null,
            'legacy_import',
          ]
        );

        if (insertRes.rowCount === 0) {
          skipped++;
          continue;
        }
        const userId = insertRes.rows[0].id;
        inserted++;
        if (negativeEur < 0) negativeBalances++;

        for (const p of positives) {
          await client.query(
            `INSERT INTO wallet_balances (user_id, currency, available_amount)
             VALUES ($1, $2, $3)
             ON CONFLICT (user_id, currency)
             DO UPDATE SET available_amount = EXCLUDED.available_amount,
                           updated_at = now()`,
            [userId, p.currencyCode, Number(p.balance)]
          );
          walletRows++;
        }
      } catch (err) {
        errors.push({ niceId, email, error: err.message });
      }
    }

    if (errors.length > 0) {
      await client.query('ROLLBACK');
      console.error('\nFailures (rolled back):');
      errors.slice(0, 20).forEach((e) => console.error(' ', e));
      console.error(`Total failures: ${errors.length}`);
      process.exitCode = 1;
      return;
    }

    await client.query('COMMIT');

    console.log(`\nImport complete.`);
    console.log(`  Inserted:          ${inserted}`);
    console.log(`  Skipped (exists):  ${skipped}`);
    console.log(`  Wallet rows:       ${walletRows}`);
    console.log(`  Negative balances: ${negativeBalances} (stored in users.balance)`);
    console.log(`  Email rewrites:    ${emailRewrites.length}`);
    if (emailRewrites.length) {
      console.log('  (first 10 rewrites):');
      emailRewrites.slice(0, 10).forEach((r) =>
        console.log(`    niceId=${r.niceId} ${r.original} -> ${r.rewritten}`)
      );
    }
    console.log(`\nDefault password for all imported customers: ${DEFAULT_PASSWORD}`);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
