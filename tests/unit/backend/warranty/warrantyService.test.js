import { jest, describe, test, expect, beforeAll, beforeEach } from '@jest/globals';

let warrantyService;
let pool;
let mockClient;

beforeAll(async () => {
  mockClient = {
    query: jest.fn(),
    release: jest.fn()
  };

  await jest.unstable_mockModule('../../../../backend/db.js', () => ({
    pool: {
      query: jest.fn(),
      connect: jest.fn(async () => mockClient)
    }
  }));

  warrantyService = await import('../../../../backend/services/warrantyService.js');
  const dbModule = await import('../../../../backend/db.js');
  pool = dbModule.pool;
});

beforeEach(() => {
  jest.clearAllMocks();
  mockClient.query.mockReset();
  mockClient.release.mockReset();
});

describe('warrantyService — token generation', () => {
  test('generateCustomerToken returns an 8-char readable token on first try', async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });
    const token = await warrantyService.generateCustomerToken();
    expect(token).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$/);
    expect(pool.query).toHaveBeenCalledTimes(1);
  });

  test('generateStaffToken retries on collision and eventually returns a unique token', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [{ exists: 1 }] }) // collision
      .mockResolvedValueOnce({ rows: [] });             // unique
    const token = await warrantyService.generateStaffToken();
    expect(token).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$/);
    expect(pool.query).toHaveBeenCalledTimes(2);
  });

  test('generateCustomerToken throws AppError after 10 retries of collisions', async () => {
    for (let i = 0; i < 11; i += 1) pool.query.mockResolvedValueOnce({ rows: [{ exists: 1 }] });
    await expect(warrantyService.generateCustomerToken()).rejects.toThrow(/unique warranty code/);
  });
});

describe('warrantyService — status transitions', () => {
  test('isValidTransition allows submitted → under_review', () => {
    expect(warrantyService.isValidTransition('submitted', 'under_review')).toBe(true);
  });

  test('isValidTransition allows under_review → rejected', () => {
    expect(warrantyService.isValidTransition('under_review', 'rejected')).toBe(true);
  });

  test('isValidTransition rejects submitted → resolved', () => {
    expect(warrantyService.isValidTransition('submitted', 'resolved')).toBe(false);
  });

  test('isValidTransition rejects closed → anything', () => {
    expect(warrantyService.isValidTransition('closed', 'submitted')).toBe(false);
    expect(warrantyService.isValidTransition('closed', 'resolved')).toBe(false);
  });

  test('STAFF_ALLOWED_STATUSES excludes closed', () => {
    expect(warrantyService.STAFF_ALLOWED_STATUSES.has('closed')).toBe(false);
    expect(warrantyService.STAFF_ALLOWED_STATUSES.has('under_review')).toBe(true);
    expect(warrantyService.STAFF_ALLOWED_STATUSES.has('resolved')).toBe(true);
  });

  test('ALL_STATUSES contains the 8 expected values', () => {
    expect(new Set(warrantyService.ALL_STATUSES)).toEqual(new Set([
      'submitted','under_review','approved','with_manufacturer',
      'awaiting_customer','resolved','rejected','closed'
    ]));
  });
});

describe('warrantyService.updateClaimStatus', () => {
  test('throws ValidationError on unknown status', async () => {
    await expect(
      warrantyService.updateClaimStatus('claim-uuid', 'not-a-real-status', { actorUserId: 'u1' })
    ).rejects.toThrow(/Unknown status/);
  });

  test('throws when staff tries to set closed', async () => {
    await expect(
      warrantyService.updateClaimStatus('claim-uuid', 'closed', { actorKind: 'staff', actorStaffLinkId: 's1' })
    ).rejects.toThrow(/Staff users cannot set this status/);
  });

  test('throws when rejecting without a note', async () => {
    mockClient.query
      .mockResolvedValueOnce({ rows: [] })                                 // BEGIN
      .mockResolvedValueOnce({ rows: [{ status: 'under_review' }] });     // SELECT current

    await expect(
      warrantyService.updateClaimStatus('claim-uuid', 'rejected', { actorUserId: 'u1' })
    ).rejects.toThrow(/note is required when rejecting/);
  });

  test('throws ValidationError on illegal transition', async () => {
    mockClient.query
      .mockResolvedValueOnce({ rows: [] })                              // BEGIN
      .mockResolvedValueOnce({ rows: [{ status: 'closed' }] });        // SELECT current

    await expect(
      warrantyService.updateClaimStatus('claim-uuid', 'under_review', { actorUserId: 'u1' })
    ).rejects.toThrow(/Invalid status transition/);
  });
});
