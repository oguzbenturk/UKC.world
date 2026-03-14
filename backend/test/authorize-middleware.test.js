import { jest, describe, test, expect, beforeAll, beforeEach } from '@jest/globals';

/**
 * Authorization Middleware Tests
 * 
 * Tests the authorizeRoles middleware logic:
 * - Direct role matching
 * - Owner auto-grant for elevated roles
 * - trusted_customer inherits student access
 * - JSONB permission-based fallback for custom roles
 * - Permission checking: wildcards, scope:action, write-implies-read
 */

let authorizeRoles;
let mockPool;

beforeAll(async () => {
  mockPool = {
    query: jest.fn(async () => ({ rows: [] }))
  };

  await jest.unstable_mockModule('../db.js', () => ({
    pool: mockPool,
    default: mockPool
  }));

  const mod = await import('../middlewares/authorize.js');
  authorizeRoles = mod.authorizeRoles;
});

beforeEach(() => {
  mockPool.query.mockReset();
  // Default: no permissions from DB
  mockPool.query.mockResolvedValue({ rows: [] });
});

// Helper to create a mock request/response/next
function createMockReqRes({ role, method = 'GET', path = '/api/bookings' } = {}) {
  const req = {
    user: role ? { role } : null,
    method,
    originalUrl: path,
    path
  };
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis()
  };
  const next = jest.fn();
  return { req, res, next };
}

// ============================================
// 1. Direct role matching
// ============================================
describe('Direct role matching', () => {
  test('allows manager when manager is in allowedRoles', async () => {
    const { req, res, next } = createMockReqRes({ role: 'manager' });
    await authorizeRoles(['admin', 'manager'])(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  test('allows admin when admin is in allowedRoles', async () => {
    const { req, res, next } = createMockReqRes({ role: 'admin' });
    await authorizeRoles(['admin', 'manager'])(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  test('allows front_desk when front_desk is in allowedRoles', async () => {
    const { req, res, next } = createMockReqRes({ role: 'front_desk' });
    await authorizeRoles(['admin', 'manager', 'front_desk'])(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  test('denies student when not in allowedRoles and no JSONB permissions', async () => {
    const { req, res, next } = createMockReqRes({ role: 'student' });
    await authorizeRoles(['admin', 'manager'])(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
  });

  test('denies unauthenticated (no user)', async () => {
    const { req, res, next } = createMockReqRes({ role: null });
    await authorizeRoles(['admin'])(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
  });
});

// ============================================
// 2. Owner auto-grant
// ============================================
describe('Owner auto-grant', () => {
  test('owner is auto-granted access when admin is in allowedRoles', async () => {
    const { req, res, next } = createMockReqRes({ role: 'owner' });
    await authorizeRoles(['admin', 'manager'])(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  test('owner is auto-granted access when instructor is in allowedRoles', async () => {
    const { req, res, next } = createMockReqRes({ role: 'owner' });
    await authorizeRoles(['instructor'])(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  test('owner is NOT auto-granted when only student is in allowedRoles', async () => {
    const { req, res, next } = createMockReqRes({ role: 'owner' });
    await authorizeRoles(['student'])(req, res, next);
    expect(next).not.toHaveBeenCalled();
  });
});

// ============================================
// 3. trusted_customer inherits student access
// ============================================
describe('trusted_customer inherits student', () => {
  test('trusted_customer can access student-allowed routes', async () => {
    const { req, res, next } = createMockReqRes({ role: 'trusted_customer' });
    await authorizeRoles(['student'])(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  test('trusted_customer cannot access admin-only routes', async () => {
    const { req, res, next } = createMockReqRes({ role: 'trusted_customer' });
    await authorizeRoles(['admin'])(req, res, next);
    expect(next).not.toHaveBeenCalled();
  });
});

// ============================================
// 4. JSONB permission-based fallback (custom roles)
// ============================================
describe('JSONB permission fallback for custom roles', () => {
  // NOTE: Each test uses a unique role name to avoid the middleware's internal
  // permission cache (5min TTL) interfering across tests.

  test('custom role with bookings:read permission can access GET /api/bookings', async () => {
    mockPool.query.mockResolvedValue({
      rows: [{ permissions: { 'bookings:read': true, 'bookings:write': true } }]
    });

    const { req, res, next } = createMockReqRes({
      role: 'custom_booking_reader',
      method: 'GET',
      path: '/api/bookings'
    });
    await authorizeRoles(['admin', 'manager'])(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  test('custom role with finances:read can access GET /api/business-expenses', async () => {
    mockPool.query.mockResolvedValue({
      rows: [{ permissions: { 'finances:read': true, 'finances:write': true } }]
    });

    const { req, res, next } = createMockReqRes({
      role: 'custom_finance_reader',
      method: 'GET',
      path: '/api/business-expenses'
    });
    await authorizeRoles(['admin', 'manager'])(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  test('custom role WITHOUT finances permission is denied from finance routes', async () => {
    mockPool.query.mockResolvedValue({
      rows: [{ permissions: { 'bookings:read': true } }]
    });

    const { req, res, next } = createMockReqRes({
      role: 'custom_no_finance',
      method: 'GET',
      path: '/api/finances/transactions'
    });
    await authorizeRoles(['admin', 'manager'])(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
  });

  test('custom role with wildcard * permission can access anything', async () => {
    mockPool.query.mockResolvedValue({
      rows: [{ permissions: { '*': true } }]
    });

    const { req, res, next } = createMockReqRes({
      role: 'super_custom_wildcard',
      method: 'DELETE',
      path: '/api/users/123'
    });
    await authorizeRoles(['admin'])(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  test('scope wildcard (e.g., bookings:*) grants all actions on that scope', async () => {
    mockPool.query.mockResolvedValue({
      rows: [{ permissions: { 'bookings:*': true } }]
    });

    const { req, res, next } = createMockReqRes({
      role: 'custom_booking_wildcard',
      method: 'DELETE',
      path: '/api/bookings/123'
    });
    await authorizeRoles(['admin'])(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  test('write permission implies read access', async () => {
    mockPool.query.mockResolvedValue({
      rows: [{ permissions: { 'finances:write': true } }]
    });

    const { req, res, next } = createMockReqRes({
      role: 'custom_write_implies_read',
      method: 'GET',
      path: '/api/finances/summary'
    });
    await authorizeRoles(['admin'])(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  test('read permission does NOT grant write/delete access', async () => {
    mockPool.query.mockResolvedValue({
      rows: [{ permissions: { 'finances:read': true } }]
    });

    const { req, res, next } = createMockReqRes({
      role: 'custom_readonly',
      method: 'POST',
      path: '/api/finances/transactions'
    });
    await authorizeRoles(['admin'])(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
  });
});

// ============================================
// 5. Route scope mapping
// ============================================
describe('Route path → permission scope mapping', () => {
  test('/api/business-expenses maps to finances scope', async () => {
    mockPool.query.mockResolvedValue({
      rows: [{ permissions: { 'finances:read': true } }]
    });

    const { req, res, next } = createMockReqRes({
      role: 'scope_test_finances',
      method: 'GET',
      path: '/api/business-expenses'
    });
    await authorizeRoles(['admin'])(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  test('/api/accommodation maps to services scope', async () => {
    mockPool.query.mockResolvedValue({
      rows: [{ permissions: { 'services:read': true } }]
    });

    const { req, res, next } = createMockReqRes({
      role: 'scope_test_services',
      method: 'GET',
      path: '/api/accommodation/units'
    });
    await authorizeRoles(['admin'])(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  test('/api/wallet maps to wallet scope (not finances)', async () => {
    mockPool.query.mockResolvedValue({
      rows: [{ permissions: { 'wallet:read': true } }]
    });

    const { req, res, next } = createMockReqRes({
      role: 'scope_test_wallet',
      method: 'GET',
      path: '/api/wallet/admin/deposits'
    });
    await authorizeRoles(['admin'])(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  test('/api/settings maps to settings scope', async () => {
    mockPool.query.mockResolvedValue({
      rows: [{ permissions: { 'settings:read': true } }]
    });

    const { req, res, next } = createMockReqRes({
      role: 'scope_test_settings',
      method: 'GET',
      path: '/api/settings'
    });
    await authorizeRoles(['admin'])(req, res, next);
    expect(next).toHaveBeenCalled();
  });
});

// ============================================
// 6. Explicit requiredPermission parameter
// ============================================
describe('Explicit requiredPermission parameter', () => {
  test('requiredPermission overrides auto-derived scope', async () => {
    mockPool.query.mockResolvedValue({
      rows: [{ permissions: { 'custom:special': true } }]
    });

    const { req, res, next } = createMockReqRes({
      role: 'explicit_perm_role',
      method: 'GET',
      path: '/api/some-path'
    });
    await authorizeRoles(['admin'], 'custom:special')(req, res, next);
    expect(next).toHaveBeenCalled();
  });
});
