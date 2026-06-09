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
  // mockReset() (not just clearAllMocks) so queued mockResolvedValueOnce values
  // never leak between tests — e.g. the retry-exhaustion test queues one more
  // value than it consumes.
  pool.query.mockReset();
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

describe('warrantyService.setStaffClaimNumber — ownership lock', () => {
  test('locks the field when another staff link set the number', async () => {
    mockClient.query
      .mockResolvedValueOnce({})                                                                 // BEGIN
      .mockResolvedValueOnce({ rows: [{ id: 'link1', claim_id: 'c1', staff_name: 'A', staff_user_id: null }] }) // SELECT link
      .mockResolvedValueOnce({ rows: [{ id: 'c1', external_claim_number: 'RMA-1', external_claim_number_set_by_staff_link_id: 'link2' }] }); // SELECT claim

    await expect(
      warrantyService.setStaffClaimNumber('link1', { claimNumberExternal: 'RMA-9' })
    ).rejects.toThrow(/locked/i);
  });

  test('lets the original staff link update its own number', async () => {
    mockClient.query
      .mockResolvedValueOnce({})                                                                 // BEGIN
      .mockResolvedValueOnce({ rows: [{ id: 'link1', claim_id: 'c1', staff_name: 'A', staff_user_id: null }] }) // SELECT link
      .mockResolvedValueOnce({ rows: [{ id: 'c1', external_claim_number: 'RMA-1', external_claim_number_set_by_staff_link_id: 'link1' }] }) // SELECT claim (owned by me)
      .mockResolvedValueOnce({})                                                                 // UPDATE staff_links
      .mockResolvedValueOnce({ rows: [{ id: 'c1', external_claim_number: 'RMA-9' }] })           // UPDATE claims
      .mockResolvedValueOnce({})                                                                 // INSERT event
      .mockResolvedValueOnce({});                                                                // COMMIT
    pool.query.mockResolvedValueOnce({ rows: [{ id: 'link1', claim_number_external: 'RMA-9' }] }); // re-read link

    const result = await warrantyService.setStaffClaimNumber('link1', { claimNumberExternal: 'RMA-9' });
    expect(result.claim.external_claim_number).toBe('RMA-9');
    expect(result.link.claim_number_external).toBe('RMA-9');
  });

  test('allows the first set when no number exists yet', async () => {
    mockClient.query
      .mockResolvedValueOnce({})                                                                 // BEGIN
      .mockResolvedValueOnce({ rows: [{ id: 'link1', claim_id: 'c1', staff_name: 'A', staff_user_id: null }] }) // SELECT link
      .mockResolvedValueOnce({ rows: [{ id: 'c1', external_claim_number: null, external_claim_number_set_by_staff_link_id: null }] }) // SELECT claim
      .mockResolvedValueOnce({})                                                                 // UPDATE staff_links
      .mockResolvedValueOnce({ rows: [{ id: 'c1', external_claim_number: 'RMA-1' }] })           // UPDATE claims
      .mockResolvedValueOnce({})                                                                 // INSERT event
      .mockResolvedValueOnce({});                                                                // COMMIT
    pool.query.mockResolvedValueOnce({ rows: [{ id: 'link1', claim_number_external: 'RMA-1' }] });

    const result = await warrantyService.setStaffClaimNumber('link1', { claimNumberExternal: 'RMA-1' });
    expect(result.claim.external_claim_number).toBe('RMA-1');
  });
});

describe('warrantyService.setAdminClaimNumber — admin override', () => {
  test('overrides a staff-set number and flags the override', async () => {
    mockClient.query
      .mockResolvedValueOnce({})                                                                 // BEGIN
      .mockResolvedValueOnce({ rows: [{ id: 'c1', external_claim_number: 'RMA-1', external_claim_number_set_by_name: 'StaffA' }] }) // SELECT claim
      .mockResolvedValueOnce({ rows: [{ name: 'AdminBob' }] })                                   // SELECT user name
      .mockResolvedValueOnce({ rows: [{ id: 'c1', external_claim_number: 'RMA-9' }] })           // UPDATE
      .mockResolvedValueOnce({})                                                                 // INSERT event
      .mockResolvedValueOnce({});                                                                // COMMIT

    const result = await warrantyService.setAdminClaimNumber('c1', {
      claimNumberExternal: 'RMA-9', actorUserId: 'u-admin'
    });
    expect(result.overrode).toBe(true);
    expect(result.claim.external_claim_number).toBe('RMA-9');
  });
});

describe('warrantyService.listClaimRecipients', () => {
  test('returns active staff links only (no admins) and dedups by email', async () => {
    pool.query.mockResolvedValueOnce({ rows: [
      { staff_link_id: 'l1', staff_token: 'T1', staff_name: 'A', staff_email: 'a@x.com', staff_user_id: null },
      { staff_link_id: 'l2', staff_token: 'T2', staff_name: 'B', staff_email: 'b@x.com', staff_user_id: 'u-staff' }
    ] });

    const recipients = await warrantyService.listClaimRecipients('c1');
    expect(recipients).toHaveLength(2);
    expect(recipients.every((r) => r.channel === 'staff')).toBe(true);
    const a = recipients.find((r) => r.email === 'a@x.com');
    expect(a.staffLinkId).toBe('l1');
    const b = recipients.find((r) => r.email === 'b@x.com');
    expect(b.userId).toBe('u-staff');
  });
});
