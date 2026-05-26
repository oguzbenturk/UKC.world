// One-shot data fix: reverse orphaned customer_package discount adjustments.
//
// Targets discount rows whose entity_type='customer_package' but the
// referenced package no longer exists in customer_packages. Same bug Damla
// hit — the +140 EUR discount_adjustment credit was never reversed when the
// package was force-deleted, leaving a phantom credit on the wallet.
//
// Uses discountService.deleteDiscount which posts a discount_adjustment_reversal
// and removes the discount row in one transaction.

import { pool } from './db.js';
import { deleteDiscount } from './services/discountService.js';

// Each entry MUST exactly match what's in the discounts table — the script
// refuses to act on any mismatch so a stale list can't silently corrupt data.
const TARGETS = [
  { discountId: 30, customerId: '2fb4df13-0b4b-411e-8dab-884b23a71834', pkgId: '0f7435e7-88fe-45ee-bc13-b3233a9453e2', amount: 140, name: 'Mert Köse' },
  { discountId: 31, customerId: 'c02c3643-4243-4d2f-ba78-2613a75d1b2b', pkgId: '506308a4-677b-4d18-a1ac-bdc0e42a978e', amount: 140, name: 'Anıl Akay' },
  { discountId: 32, customerId: '4f9df6ee-031e-4618-9b00-288bcc151ff3', pkgId: 'c3ac7233-e239-4e5f-9237-1393382547a8', amount: 140, name: 'Yener Yunusoğlu' },
  { discountId: 34, customerId: 'e10ccef8-6b8a-421f-95cd-70e7681daea7', pkgId: 'e88914e4-b487-4ee0-befa-90d57174e37a', amount: 140, name: 'Mehmet Oğuzhan' },
];

const client = await pool.connect();
let exitCode = 0;
try {
  await client.query('BEGIN');

  for (const t of TARGETS) {
    const before = await client.query(
      `SELECT id, customer_id, entity_type, entity_id, amount
         FROM discounts WHERE id = $1 FOR UPDATE`,
      [t.discountId]
    );
    if (!before.rows.length) {
      throw new Error(`Discount ${t.discountId} (${t.name}) not found — aborting`);
    }
    const d = before.rows[0];
    if (d.customer_id !== t.customerId) {
      throw new Error(`Discount ${t.discountId}: customer mismatch — aborting`);
    }
    if (d.entity_type !== 'customer_package' || d.entity_id !== t.pkgId) {
      throw new Error(`Discount ${t.discountId}: entity mismatch — aborting`);
    }
    if (Number(d.amount) !== t.amount) {
      throw new Error(`Discount ${t.discountId}: amount mismatch (expected ${t.amount}, got ${d.amount}) — aborting`);
    }

    // Confirm the package really is gone — if it's not, we'd be removing a
    // live discount which is out of scope for this fix.
    const pkgExists = await client.query(
      `SELECT 1 FROM customer_packages WHERE id = $1`,
      [t.pkgId]
    );
    if (pkgExists.rows.length) {
      throw new Error(`Discount ${t.discountId}: package ${t.pkgId} still exists — refusing to act`);
    }

    const balBefore = await client.query(
      `SELECT available_amount FROM wallet_balances WHERE user_id = $1 AND currency = $2`,
      [t.customerId, 'EUR']
    );
    const beforeAmt = balBefore.rows[0]?.available_amount ?? null;

    const removed = await deleteDiscount(client, t.discountId, { createdBy: null });
    if (!removed) {
      throw new Error(`Discount ${t.discountId}: deleteDiscount returned false — aborting`);
    }

    const balAfter = await client.query(
      `SELECT available_amount FROM wallet_balances WHERE user_id = $1 AND currency = $2`,
      [t.customerId, 'EUR']
    );
    const afterAmt = balAfter.rows[0]?.available_amount ?? null;

    console.log(`${t.name.padEnd(20)} disc=${t.discountId}  balance ${beforeAmt} → ${afterAmt}`);
  }

  await client.query('COMMIT');
  console.log('\nCOMMITTED — all 4 customers fixed.');
} catch (e) {
  console.error('Error, rolling back:', e.message);
  await client.query('ROLLBACK');
  exitCode = 1;
} finally {
  client.release();
  await pool.end();
  process.exit(exitCode);
}
