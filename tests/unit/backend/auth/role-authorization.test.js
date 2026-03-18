import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../../../../backend/server.js';

/**
 * Role-Based Authorization Tests
 * 
 * Tests that key endpoints correctly grant/deny access for:
 * - manager role
 * - front_desk role (custom role, relies on JSONB permissions for some routes)
 * - student role (should be denied from staff endpoints)
 * - unauthenticated requests
 *
 * These are integration tests that hit the real Express middleware chain.
 * We accept 200 or 500 (DB may not have data) but NEVER 401/403 for allowed roles,
 * and ALWAYS 401/403 for denied roles.
 */

const JWT_SECRET = process.env.JWT_SECRET || 'plannivo-jwt-secret-key';

const createToken = ({ id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', role, email } = {}) =>
  jwt.sign({ id, role, email }, JWT_SECRET, { expiresIn: '1h' });

// Test role tokens
const tokens = {};

beforeAll(() => {
  tokens.admin = createToken({ role: 'admin', email: 'admin@test.local' });
  tokens.manager = createToken({ role: 'manager', email: 'manager@test.local' });
  tokens.front_desk = createToken({ role: 'front_desk', email: 'frontdesk@test.local' });
  tokens.instructor = createToken({ role: 'instructor', email: 'instructor@test.local' });
  tokens.student = createToken({ role: 'student', email: 'student@test.local' });
});

// Helper: assert role is allowed (status is NOT 401 or 403)
const expectAllowed = (res) => {
  expect([401, 403]).not.toContain(res.status);
};

// Helper: assert role is denied (status IS 401 or 403)
const expectDenied = (res) => {
  expect([401, 403]).toContain(res.status);
};

// ============================================
// 1. MANAGER ROLE — Finance endpoints
// ============================================
describe('Manager role — finance access', () => {
  test('GET /api/finances/transactions allows manager', async () => {
    const res = await request(app)
      .get('/api/finances/transactions')
      .set('Authorization', `Bearer ${tokens.manager}`);
    expectAllowed(res);
  });

  test('GET /api/finances/summary allows manager', async () => {
    const res = await request(app)
      .get('/api/finances/summary')
      .set('Authorization', `Bearer ${tokens.manager}`);
    expectAllowed(res);
  });

  test('GET /api/finances/revenue-analytics allows manager', async () => {
    const res = await request(app)
      .get('/api/finances/revenue-analytics')
      .set('Authorization', `Bearer ${tokens.manager}`);
    expectAllowed(res);
  });

  test('GET /api/finances/outstanding-balances allows manager', async () => {
    const res = await request(app)
      .get('/api/finances/outstanding-balances')
      .set('Authorization', `Bearer ${tokens.manager}`);
    expectAllowed(res);
  });

  test('GET /api/finances/expenses allows manager', async () => {
    const res = await request(app)
      .get('/api/finances/expenses')
      .set('Authorization', `Bearer ${tokens.manager}`);
    expectAllowed(res);
  });

  test('student is denied from finance', async () => {
    const res = await request(app)
      .get('/api/finances/transactions')
      .set('Authorization', `Bearer ${tokens.student}`);
    expectDenied(res);
  });
});

// ============================================
// 2. MANAGER ROLE — Wallet endpoints
// ============================================
describe('Manager role — wallet access', () => {
  test('GET /api/wallet/admin/deposits allows manager', async () => {
    const res = await request(app)
      .get('/api/wallet/admin/deposits')
      .set('Authorization', `Bearer ${tokens.manager}`);
    expectAllowed(res);
  });

  test('GET /api/wallet/admin/settings allows manager', async () => {
    const res = await request(app)
      .get('/api/wallet/admin/settings')
      .set('Authorization', `Bearer ${tokens.manager}`);
    expectAllowed(res);
  });

  test('student is denied from wallet admin', async () => {
    const res = await request(app)
      .get('/api/wallet/admin/deposits')
      .set('Authorization', `Bearer ${tokens.student}`);
    expectDenied(res);
  });
});

// ============================================
// 3. MANAGER ROLE — Accommodation endpoints
// ============================================
describe('Manager role — accommodation access', () => {
  test('GET /api/accommodation/bookings allows manager', async () => {
    const res = await request(app)
      .get('/api/accommodation/bookings')
      .set('Authorization', `Bearer ${tokens.manager}`);
    expectAllowed(res);
  });

  test('student is denied from accommodation updates', async () => {
    const res = await request(app)
      .put('/api/accommodation/units/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${tokens.student}`)
      .send({ name: 'Hacked Unit' });
    expectDenied(res);
  });
});

// ============================================
// 4. MANAGER ROLE — Rental endpoints
// ============================================
describe('Manager role — rental access', () => {
  test('GET /api/rentals/active allows manager', async () => {
    const res = await request(app)
      .get('/api/rentals/active')
      .set('Authorization', `Bearer ${tokens.manager}`);
    expectAllowed(res);
  });

  test('GET /api/rentals/overdue allows manager', async () => {
    const res = await request(app)
      .get('/api/rentals/overdue')
      .set('Authorization', `Bearer ${tokens.manager}`);
    expectAllowed(res);
  });

  test('student is denied from rental management', async () => {
    const res = await request(app)
      .get('/api/rentals/active')
      .set('Authorization', `Bearer ${tokens.student}`);
    expectDenied(res);
  });
});

// ============================================
// 5. MANAGER ROLE — User/Student management
// ============================================
describe('Manager role — user management access', () => {
  test('GET /api/users allows manager', async () => {
    const res = await request(app)
      .get('/api/users')
      .set('Authorization', `Bearer ${tokens.manager}`);
    expectAllowed(res);
  });

  test('GET /api/users/students allows manager', async () => {
    const res = await request(app)
      .get('/api/users/students')
      .set('Authorization', `Bearer ${tokens.manager}`);
    expectAllowed(res);
  });

  test('GET /api/students allows manager', async () => {
    const res = await request(app)
      .get('/api/students')
      .set('Authorization', `Bearer ${tokens.manager}`);
    expectAllowed(res);
  });

  test('student is denied from user management', async () => {
    const res = await request(app)
      .get('/api/users')
      .set('Authorization', `Bearer ${tokens.student}`);
    expectDenied(res);
  });

  test('student is denied from student listing', async () => {
    const res = await request(app)
      .get('/api/students')
      .set('Authorization', `Bearer ${tokens.student}`);
    expectDenied(res);
  });
});

// ============================================
// 6. MANAGER ROLE — Shop orders
// ============================================
describe('Manager role — shop orders access', () => {
  test('GET /api/shop-orders/admin/all allows manager', async () => {
    const res = await request(app)
      .get('/api/shop-orders/admin/all')
      .set('Authorization', `Bearer ${tokens.manager}`);
    expectAllowed(res);
  });

  test('GET /api/shop-orders/admin/stats allows manager', async () => {
    const res = await request(app)
      .get('/api/shop-orders/admin/stats')
      .set('Authorization', `Bearer ${tokens.manager}`);
    expectAllowed(res);
  });

  test('student is denied from shop admin', async () => {
    const res = await request(app)
      .get('/api/shop-orders/admin/all')
      .set('Authorization', `Bearer ${tokens.student}`);
    expectDenied(res);
  });
});

// ============================================
// 7. MANAGER ROLE — Dashboard
// ============================================
describe('Manager role — dashboard access', () => {
  test('GET /api/dashboard/summary allows manager', async () => {
    const res = await request(app)
      .get('/api/dashboard/summary')
      .set('Authorization', `Bearer ${tokens.manager}`);
    expectAllowed(res);
  });

  test('student is denied from dashboard summary', async () => {
    const res = await request(app)
      .get('/api/dashboard/summary')
      .set('Authorization', `Bearer ${tokens.student}`);
    expectDenied(res);
  });
});

// ============================================
// 8. MANAGER ROLE — Equipment
// ============================================
describe('Manager role — equipment access', () => {
  test('GET /api/equipment allows manager', async () => {
    const res = await request(app)
      .get('/api/equipment')
      .set('Authorization', `Bearer ${tokens.manager}`);
    expectAllowed(res);
  });
});

// ============================================
// 9. FRONT_DESK ROLE — Allowed endpoints
// ============================================
describe('Front desk role — allowed endpoints', () => {
  test('POST /api/shop-orders/admin/quick-sale allows front_desk', async () => {
    const res = await request(app)
      .post('/api/shop-orders/admin/quick-sale')
      .set('Authorization', `Bearer ${tokens.front_desk}`)
      .send({ items: [], customerEmail: 'test@test.com' });
    // May get 400 (bad data) but NOT 401/403
    expect([401, 403]).not.toContain(res.status);
  });

  test('GET /api/business-expenses allows front_desk', async () => {
    const res = await request(app)
      .get('/api/business-expenses')
      .set('Authorization', `Bearer ${tokens.front_desk}`);
    expectAllowed(res);
  });

  test('GET /api/business-expenses/:id allows front_desk', async () => {
    const res = await request(app)
      .get('/api/business-expenses/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${tokens.front_desk}`);
    // 404 (not found) is acceptable, but NOT 401/403
    expect([401, 403]).not.toContain(res.status);
  });

  test('POST /api/business-expenses allows front_desk', async () => {
    const res = await request(app)
      .post('/api/business-expenses')
      .set('Authorization', `Bearer ${tokens.front_desk}`)
      .send({
        amount: 25.00,
        category: 'utilities',
        description: 'Test expense from front desk'
      });
    // May get 400/500 but NOT 401/403
    expect([401, 403]).not.toContain(res.status);
  });
});

// ============================================
// 10. FRONT_DESK ROLE — Denied endpoints
// ============================================
describe('Front desk role — denied endpoints', () => {
  test('front_desk is denied from finance transactions', async () => {
    const res = await request(app)
      .get('/api/finances/transactions')
      .set('Authorization', `Bearer ${tokens.front_desk}`);
    expectDenied(res);
  });

  test('front_desk is denied from finance summary', async () => {
    const res = await request(app)
      .get('/api/finances/summary')
      .set('Authorization', `Bearer ${tokens.front_desk}`);
    expectDenied(res);
  });

  test('front_desk is denied from wallet admin', async () => {
    const res = await request(app)
      .get('/api/wallet/admin/deposits')
      .set('Authorization', `Bearer ${tokens.front_desk}`);
    expectDenied(res);
  });

  test('front_desk is denied from user create', async () => {
    const res = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${tokens.front_desk}`)
      .send({ email: 'test@test.com', name: 'Test' });
    expectDenied(res);
  });

  test('front_desk is denied from user deletion (admin-only)', async () => {
    const res = await request(app)
      .delete('/api/users/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${tokens.front_desk}`);
    expectDenied(res);
  });

  test('front_desk is denied from booking deletion', async () => {
    const res = await request(app)
      .delete('/api/bookings/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${tokens.front_desk}`);
    expectDenied(res);
  });

  test('front_desk is denied from business expense delete', async () => {
    const res = await request(app)
      .delete('/api/business-expenses/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${tokens.front_desk}`);
    expectDenied(res);
  });

  test('front_desk is denied from business expense update', async () => {
    const res = await request(app)
      .put('/api/business-expenses/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${tokens.front_desk}`)
      .send({ amount: 50, category: 'utilities', description: 'Updated' });
    expectDenied(res);
  });
});

// ============================================
// 11. UNAUTHENTICATED — Denied from everything
// ============================================
describe('Unauthenticated requests — denied', () => {
  test('GET /api/finances/transactions requires auth', async () => {
    const res = await request(app).get('/api/finances/transactions');
    expect(res.status).toBe(401);
  });

  test('GET /api/users requires auth', async () => {
    const res = await request(app).get('/api/users');
    expect(res.status).toBe(401);
  });

  test('GET /api/bookings requires auth', async () => {
    const res = await request(app).get('/api/bookings');
    expect(res.status).toBe(401);
  });

  test('GET /api/wallet/admin/deposits requires auth', async () => {
    const res = await request(app).get('/api/wallet/admin/deposits');
    expect(res.status).toBe(401);
  });

  test('GET /api/business-expenses requires auth', async () => {
    const res = await request(app).get('/api/business-expenses');
    expect(res.status).toBe(401);
  });
});

// ============================================
// 12. ADMIN — Everything allowed
// ============================================
describe('Admin role — allowed everywhere', () => {
  test('GET /api/finances/transactions allows admin', async () => {
    const res = await request(app)
      .get('/api/finances/transactions')
      .set('Authorization', `Bearer ${tokens.admin}`);
    expectAllowed(res);
  });

  test('GET /api/users allows admin', async () => {
    const res = await request(app)
      .get('/api/users')
      .set('Authorization', `Bearer ${tokens.admin}`);
    expectAllowed(res);
  });

  test('GET /api/wallet/admin/deposits allows admin', async () => {
    const res = await request(app)
      .get('/api/wallet/admin/deposits')
      .set('Authorization', `Bearer ${tokens.admin}`);
    expectAllowed(res);
  });

  test('GET /api/dashboard/summary allows admin', async () => {
    const res = await request(app)
      .get('/api/dashboard/summary')
      .set('Authorization', `Bearer ${tokens.admin}`);
    expectAllowed(res);
  });
});
