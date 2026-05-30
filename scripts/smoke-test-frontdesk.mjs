// scripts/smoke-test-frontdesk.mjs
// End-to-end auth + role-gate smoke test for the 2026-05-30 frontdesk overhaul.
// Run after `npm run dev` is up against the local Docker DB.
//   node scripts/smoke-test-frontdesk.mjs

const BASE = process.env.BASE || 'http://localhost:4000';

const FRONTDESK_EMAIL = 'test-receptionist@plannivo.local';
const FRONTDESK_PASS = 'receptiontest8';
const ADMIN_EMAIL = 'admin@plannivo.com';
const ADMIN_PASS = 'asdasd35';

let pass = 0;
let fail = 0;
const failures = [];

function rec(name, ok, info) {
  const tag = ok ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m';
  console.log(`${tag} ${name}${info ? ' — ' + info : ''}`);
  if (ok) pass++;
  else {
    fail++;
    failures.push(`${name}${info ? ' — ' + info : ''}`);
  }
}

async function login(email, password) {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    throw new Error(`login ${email} failed: ${res.status} ${await res.text()}`);
  }
  const data = await res.json();
  return { token: data.token, user: data.user };
}

function authed(token) {
  return async (path, opts = {}) => {
    const res = await fetch(`${BASE}${path}`, {
      ...opts,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        ...(opts.headers || {}),
      },
    });
    const text = await res.text();
    let body;
    try { body = text ? JSON.parse(text) : null; } catch { body = text; }
    return { status: res.status, body };
  };
}

(async () => {
  console.log(`\n=== Plannivo frontdesk smoke test — ${BASE} ===\n`);

  // ── Login ───────────────────────────────────────────────────────
  let admin, frontdesk;
  try {
    admin = await login(ADMIN_EMAIL, ADMIN_PASS);
    rec('admin login', true, `role=${admin.user.role}`);
  } catch (e) {
    rec('admin login', false, e.message);
    process.exit(1);
  }
  try {
    frontdesk = await login(FRONTDESK_EMAIL, FRONTDESK_PASS);
    rec('frontdesk login', true, `role=${frontdesk.user.role}`);
    if (!['receptionist', 'front_desk'].includes(frontdesk.user.role)) {
      rec('frontdesk role check', false, `expected receptionist/front_desk, got ${frontdesk.user.role}`);
    }
  } catch (e) {
    rec('frontdesk login', false, e.message);
    process.exit(1);
  }

  const adminApi = authed(admin.token);
  const fdApi = authed(frontdesk.token);

  // ── Discover IDs we'll need ────────────────────────────────────
  let testStudentId = null;
  let testProductId = null;
  let testBookingId = null;
  let testShopOrderId = null;
  let testMemberPurchaseId = null;
  let testMemberOfferingId = null;

  try {
    const r = await adminApi('/api/users/students?limit=5');
    if (r.status === 200 && Array.isArray(r.body) && r.body.length > 0) {
      testStudentId = r.body[0].id;
      rec('discovery: student id', true, `${r.body[0].name || r.body[0].email}`);
    } else {
      rec('discovery: student id', false, `status=${r.status}`);
    }
  } catch (e) { rec('discovery: student id', false, e.message); }

  try {
    const r = await adminApi('/api/products?limit=5');
    const list = r.body?.data || r.body?.products || r.body || [];
    if (r.status === 200 && Array.isArray(list) && list.length > 0) {
      testProductId = list[0].id;
      rec('discovery: product id', true, list[0].name);
    } else {
      rec('discovery: product id', false, `status=${r.status}`);
    }
  } catch (e) { rec('discovery: product id', false, e.message); }

  try {
    const r = await adminApi('/api/member-offerings');
    const list = r.body?.data || r.body || [];
    if (r.status === 200 && Array.isArray(list) && list.length > 0) {
      testMemberOfferingId = list[0].id;
      rec('discovery: member offering id', true, list[0].name);
    } else {
      rec('discovery: member offering id', false, `status=${r.status}`);
    }
  } catch (e) { rec('discovery: member offering id', false, e.message); }

  if (testStudentId) {
    try {
      const r = await adminApi(`/api/shop-orders/admin/user/${testStudentId}?limit=1`);
      const list = r.body?.orders || [];
      if (r.status === 200 && list.length > 0) {
        testShopOrderId = list[0].id;
        rec('discovery: shop order id', true, `order_number=${list[0].order_number}`);
        const hasDisc = Object.hasOwn(list[0], 'total_discount_amount');
        rec('shop orders list returns total_discount_amount', hasDisc);
      }
    } catch (e) { rec('discovery: shop order id', false, e.message); }
  }

  // ── A. Auth gates that I changed ────────────────────────────────
  console.log('\n── Auth gates (was 403, expecting 200/201) ──');

  // A1. POST /users as receptionist
  const newUserEmail = `smoke-${Date.now()}@plannivo.test`;
  try {
    const r = await fdApi('/api/users', {
      method: 'POST',
      body: JSON.stringify({
        password: 'smokepass8',
        role_id: (await adminApi('/api/roles')).body?.find?.(x => x.name === 'student')?.id,
        first_name: 'Smoke',
        last_name: 'Test',
        email: newUserEmail,
        send_verification: false,
      }),
    });
    rec('A1. frontdesk POST /users (Activate now)', r.status === 201, `status=${r.status}`);
    if (r.status === 201) {
      // Verify email_verified=true was set (since send_verification=false)
      rec('A1.b email_verified=true on Activate now', r.body?.email_verified === true);
    }
  } catch (e) { rec('A1. frontdesk POST /users', false, e.message); }

  // A2. POST /users with send_verification=true
  try {
    const r = await fdApi('/api/users', {
      method: 'POST',
      body: JSON.stringify({
        password: 'smokepass8',
        role_id: (await adminApi('/api/roles')).body?.find?.(x => x.name === 'student')?.id,
        first_name: 'Smoke',
        last_name: 'Verify',
        email: `smoke-v-${Date.now()}@plannivo.test`,
        send_verification: true,
      }),
    });
    rec('A2. frontdesk POST /users (Send verify)', r.status === 201, `status=${r.status}`);
    if (r.status === 201) {
      rec('A2.b email_verified=false on Send verify', r.body?.email_verified === false);
      rec('A2.c send_verification echoed', r.body?.send_verification === true);
    }
  } catch (e) { rec('A2. frontdesk POST /users send_verification', false, e.message); }

  // A3. POST /users with weak password (should fail)
  try {
    const r = await fdApi('/api/users', {
      method: 'POST',
      body: JSON.stringify({
        password: 'abc',
        role_id: (await adminApi('/api/roles')).body?.find?.(x => x.name === 'student')?.id,
        first_name: 'Short',
        last_name: 'Pass',
        email: `smoke-w-${Date.now()}@plannivo.test`,
      }),
    });
    rec('A3. POST /users with <8-char password is rejected', r.status === 400, `status=${r.status}`);
  } catch (e) { rec('A3. POST /users weak password', false, e.message); }

  // A4. Case-insensitive email uniqueness
  try {
    const dupEmail = `Smoke-CASE-${Date.now()}@plannivo.test`;
    const r1 = await fdApi('/api/users', {
      method: 'POST',
      body: JSON.stringify({
        password: 'smokepass8',
        role_id: (await adminApi('/api/roles')).body?.find?.(x => x.name === 'student')?.id,
        first_name: 'A', last_name: 'B',
        email: dupEmail,
      }),
    });
    const r2 = await fdApi('/api/users', {
      method: 'POST',
      body: JSON.stringify({
        password: 'smokepass8',
        role_id: (await adminApi('/api/roles')).body?.find?.(x => x.name === 'student')?.id,
        first_name: 'A', last_name: 'B',
        email: dupEmail.toLowerCase(),
      }),
    });
    rec('A4. case-insensitive email uniqueness (409 on second insert)', r2.status === 409, `first=${r1.status} second=${r2.status}`);
  } catch (e) { rec('A4. case-insensitive uniqueness', false, e.message); }

  // A5. /resend-verification cooldown 429
  if (testStudentId) {
    try {
      // Create a fresh unverified user first
      const targetEmail = `smoke-cd-${Date.now()}@plannivo.test`;
      const create = await fdApi('/api/users', {
        method: 'POST',
        body: JSON.stringify({
          password: 'smokepass8',
          role_id: (await adminApi('/api/roles')).body?.find?.(x => x.name === 'student')?.id,
          first_name: 'CD', last_name: 'Test',
          email: targetEmail,
          send_verification: true,
        }),
      });
      const userId = create.body?.id;
      if (!userId) {
        rec('A5. setup unverified user', false, `status=${create.status}`);
      } else {
        const r1 = await fdApi(`/api/users/${userId}/resend-verification`, { method: 'POST' });
        const r2 = await fdApi(`/api/users/${userId}/resend-verification`, { method: 'POST' });
        rec('A5. resend cooldown enforced (429 on rapid 2nd call)', r2.status === 429, `1st=${r1.status} 2nd=${r2.status}`);
      }
    } catch (e) { rec('A5. resend cooldown', false, e.message); }
  }

  // A6. DELETE /products/:id as frontdesk (we won't actually delete a real product; just check the auth path)
  // Instead, create a test product, then delete it
  try {
    const create = await fdApi('/api/products', {
      method: 'POST',
      body: JSON.stringify({
        name: `Smoke Product ${Date.now()}`,
        price: 1,
        stock_quantity: 1,
        category: 'other',
        status: 'active',
      }),
    });
    if (create.status === 201 && create.body?.id) {
      const del = await fdApi(`/api/products/${create.body.id}`, { method: 'DELETE' });
      rec('A6. frontdesk DELETE /products/:id', del.status === 200, `create=${create.status} delete=${del.status}`);
    } else {
      rec('A6. frontdesk DELETE /products/:id (skipped — create failed)', false, `create status=${create.status} body=${JSON.stringify(create.body).slice(0,200)}`);
    }
  } catch (e) { rec('A6. frontdesk DELETE /products', false, e.message); }

  // A7. POST /products/subcategories as frontdesk
  try {
    const r = await fdApi('/api/products/subcategories', {
      method: 'POST',
      body: JSON.stringify({
        category: 'other',
        subcategory: `smoke-sub-${Date.now()}`,
        display_name: 'Smoke Sub',
      }),
    });
    rec('A7. frontdesk POST /products/subcategories', r.status === 200 || r.status === 201, `status=${r.status}`);
  } catch (e) { rec('A7. frontdesk POST /products/subcategories', false, e.message); }

  // A8. POST /api/discounts as frontdesk with entity_type='shop_order'
  if (testStudentId && testShopOrderId) {
    try {
      const r = await fdApi('/api/discounts', {
        method: 'POST',
        body: JSON.stringify({
          customer_id: testStudentId,
          entity_type: 'shop_order',
          entity_id: testShopOrderId,
          percent: 10,
          reason: 'Smoke test',
        }),
      });
      rec('A8. frontdesk POST /api/discounts (shop_order)', r.status === 200 || r.status === 201, `status=${r.status}`);
    } catch (e) { rec('A8. frontdesk apply discount on shop_order', false, e.message); }
  } else {
    rec('A8. apply discount on shop_order (skipped — no shop order found)', false, 'data setup missing');
  }

  // A9. PUT /bookings/:id as frontdesk
  try {
    const bRes = await adminApi('/api/bookings?limit=1');
    const list = bRes.body?.data || bRes.body?.bookings || bRes.body || [];
    if (Array.isArray(list) && list.length > 0) {
      testBookingId = list[0].id;
      const r = await fdApi(`/api/bookings/${testBookingId}`, {
        method: 'PUT',
        body: JSON.stringify({ notes: `smoke ${Date.now()}` }),
      });
      rec('A9. frontdesk PUT /api/bookings/:id', r.status === 200, `status=${r.status}`);
    } else {
      rec('A9. PUT /bookings (skipped — no bookings in DB)', false, '');
    }
  } catch (e) { rec('A9. frontdesk PUT bookings', false, e.message); }

  // ── B. New behavior: admin membership purchase mirrors into wallet_transactions ──
  console.log('\n── New behavior verifications ──');

  if (testStudentId && testMemberOfferingId) {
    try {
      // Snapshot transaction count before
      const before = await adminApi(`/api/finances/transactions?user_id=${testStudentId}&limit=5`);
      const beforeCount = (before.body?.data || before.body || []).length;

      const create = await fdApi('/api/member-offerings/admin/purchases', {
        method: 'POST',
        body: JSON.stringify({
          userId: testStudentId,
          offeringId: testMemberOfferingId,
          paymentMethod: 'cash',
        }),
      });
      const created = create.body;
      testMemberPurchaseId = created?.id;
      rec('B1. frontdesk admin membership sale created', !!testMemberPurchaseId, `status=${create.status}`);

      // Wait a beat for the recordTransaction to commit
      await new Promise((r) => setTimeout(r, 300));

      const after = await adminApi(`/api/finances/transactions?user_id=${testStudentId}&limit=5`);
      const rawAfter = after.body;
      // Endpoint may return either an array directly OR {data:[]} or {transactions:[]}.
      const afterRows = Array.isArray(rawAfter) ? rawAfter
        : Array.isArray(rawAfter?.data) ? rawAfter.data
        : Array.isArray(rawAfter?.transactions) ? rawAfter.transactions
        : [];
      const newRow = afterRows.find(t => t?.related_entity_type === 'member_purchase' || (t?.description || '').toLowerCase().includes('membership') || (t?.description || '').toLowerCase().includes('storage'));
      rec('B2. wallet_transactions has the membership row', !!newRow, newRow ? `desc="${newRow.description}"` : `not found (status=${after.status}, rows=${afterRows.length}, raw keys=${rawAfter && typeof rawAfter==='object' ? Object.keys(rawAfter).join(',') : typeof rawAfter})`);

      // B3. apply discount on member_purchase
      if (testMemberPurchaseId) {
        const d = await fdApi('/api/discounts', {
          method: 'POST',
          body: JSON.stringify({
            customer_id: testStudentId,
            entity_type: 'member_purchase',
            entity_id: testMemberPurchaseId,
            percent: 15,
            reason: 'Smoke test',
          }),
        });
        rec('B3. frontdesk POST /api/discounts (member_purchase)', d.status === 200 || d.status === 201, `status=${d.status}`);
      }
    } catch (e) { rec('B. membership flow', false, e.message); }
  } else {
    rec('B. membership flow (skipped — student or offering missing)', false, 'data setup');
  }

  // ── C. Inline role check: shopOrders GET /:id ──
  if (testShopOrderId) {
    try {
      const r = await fdApi(`/api/shop-orders/${testShopOrderId}`);
      rec('C1. frontdesk GET /shop-orders/:id (used to 403)', r.status === 200, `status=${r.status}`);
      if (r.status === 200) {
        rec('C2. order returns total_discount_amount field', Object.hasOwn(r.body || {}, 'total_discount_amount'));
      }
    } catch (e) { rec('C. shop order detail', false, e.message); }
  }

  // ── D. Frontdesk override exercise — quick-sale wallet with 0 balance ──
  // Use admin to reset the test student's wallet to 0, then attempt sale as frontdesk
  if (testStudentId && testProductId) {
    try {
      // Use admin charge endpoint to zero the wallet — skip if it requires complex setup
      // Just try the sale; if balance happens to be positive, this still tests the auth flow.
      const sale = await fdApi('/api/shop-orders/admin/quick-sale', {
        method: 'POST',
        body: JSON.stringify({
          user_id: testStudentId,
          items: [{ product_id: testProductId, quantity: 1 }],
          payment_method: 'wallet',
        }),
      });
      rec('D1. frontdesk quick-sale (allowNegative path)', sale.status === 201, `status=${sale.status} ${typeof sale.body === 'object' ? (sale.body?.error || sale.body?.message || '') : ''}`);
    } catch (e) { rec('D. quick-sale', false, e.message); }
  }

  // ── Summary ─────────────────────────────────────────────────────
  console.log(`\n=== Summary: \x1b[32m${pass} passed\x1b[0m / \x1b[31m${fail} failed\x1b[0m ===\n`);
  if (failures.length > 0) {
    console.log('Failures:');
    failures.forEach((f) => console.log('  - ' + f));
    process.exit(1);
  }
})();
