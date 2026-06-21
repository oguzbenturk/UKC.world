// One-off: backfill prices for shop order items that were sold at EUR0 because the
// product had no catalog price at sale time. Uses the SAME service the drawer
// pencil-edit uses, so wallet (customer balance/financial history), order totals,
// discounts and manager commission all stay consistent. settleWallet=true posts
// the charge so each customer correctly owes the item price.
//
// Runs against whatever backend/.env points to (local dev DB in normal operation).
// Idempotent-ish: re-running would charge again, so run ONCE per environment.

import { pool } from '../db.js';
import { updateShopOrderItemPrice } from '../services/shopOrderPriceService.js';

const targets = [
  { orderId: 25, itemId: 32, price: 122, name: 'Ocean Sunglasses' },
  { orderId: 24, itemId: 30, price: 193, name: 'IOW Static 3/2 Back Zip Women' },
  { orderId: 23, itemId: 29, price: 260, name: 'Seek Core 4/3 Overknee LS Front Zip' },
  { orderId: 13, itemId: 19, price: 486, name: 'Harness Waist Kite Riot Curv' },
  { orderId: 8,  itemId: 14, price: 375, name: 'Wetsuit Amaze Core 4/3 Back Zip' },
];

const client = await pool.connect();
try {
  await client.query('BEGIN');
  for (const t of targets) {
    const r = await updateShopOrderItemPrice({
      client,
      orderId: t.orderId,
      itemId: t.itemId,
      newUnitPrice: t.price,
      settleWallet: true,
      reason: 'Backfill price for item sold at EUR0 (product unpriced at sale time)',
      actorId: null,
    });
    console.log(`OK  ${t.name}: 0 -> ${r.newUnitPrice} ${r.currency} | orderTotal=${r.totalAmount} | delta=${r.delta} | wallet=${JSON.stringify(r.walletAdjustment)} | commission=${JSON.stringify(r.commission)}`);
  }
  await client.query('COMMIT');
  console.log('COMMITTED OK');
} catch (e) {
  await client.query('ROLLBACK');
  console.error('ROLLED BACK:', e && e.message ? e.message : e);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
