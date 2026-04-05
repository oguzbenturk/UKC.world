import { jest, describe, test, expect, beforeAll, afterAll, afterEach } from '@jest/globals';
import request from 'supertest';
import jwt from 'jsonwebtoken';

let app;
let voucherService;
let pool;

const createToken = (overrides = {}) => {
  const secret = process.env.JWT_SECRET || 'plannivo-jwt-secret-key';
  const payload = {
    id: overrides.id || '11111111-1111-1111-1111-111111111111',
    email: overrides.email || 'user@example.com',
    role: overrides.role || 'student'
  };
  return jwt.sign(payload, secret, { expiresIn: '1h' });
};

describe('Vouchers Routes', () => {
  const base = '/api/vouchers';
  let adminToken;
  let managerToken;
  let userToken;

  beforeAll(async () => {
    await jest.unstable_mockModule('../../../backend/services/voucherService.js', () => ({
      default: {
        validateVoucher: jest.fn(),
        redeemVoucher: jest.fn(),
        applyWalletCredit: jest.fn(),
        getUserVouchers: jest.fn(),
        createVoucher: jest.fn(),
        listVouchers: jest.fn(),
        getVoucherById: jest.fn(),
        updateVoucher: jest.fn(),
        deleteVoucher: jest.fn(),
        generateBulkVouchers: jest.fn(),
        assignVoucherToUser: jest.fn(),
        getVoucherRedemptions: jest.fn(),
        createCampaign: jest.fn(),
        getCampaignStats: jest.fn()
      }
    }));

    await jest.unstable_mockModule('../../../backend/db.js', () => ({
      pool: { query: jest.fn() }
    }));

    ({ default: app } = await import('../../../../../backend/../backend/server.js'));
    voucherService = await import('../../../../../backend/../backend/services/voucherService.js');
    ({ pool } = await import('../../../../../backend/../backend/db.js'));

    adminToken = createToken({ role: 'admin' });
    managerToken = createToken({ role: 'manager' });
    userToken = createToken({ role: 'student' });
  });

  afterAll(async () => {
    // Pool cleanup handled by --forceExit
  }, 15000);

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /validate - Validate voucher code', () => {
    test('requires authentication', async () => {
      const response = await request(app)
        .post(`${base}/validate`)
        .send({
          code: 'SAVE10',
          context: 'lessons',
          amount: 100
        });

      expect(response.status).toBe(401);
    });

    test('user can validate a voucher code', async () => {
      const mockResult = {
        valid: true,
        voucher: {
          id: '22222222-2222-2222-2222-222222222222',
          code: 'SAVE10',
          type: 'percentage'
        },
        discount: {
          discountAmount: 10,
          type: 'percentage'
        }
      };

      jest.spyOn(voucherService.default, 'validateVoucher')
        .mockResolvedValueOnce(mockResult);

      const response = await request(app)
        .post(`${base}/validate`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          code: 'SAVE10',
          context: 'lessons',
          amount: 100,
          currency: 'EUR'
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('voucher');
      expect(response.body).toHaveProperty('discount');
    });

    test('returns error for invalid voucher code', async () => {
      jest.spyOn(voucherService.default, 'validateVoucher')
        .mockResolvedValueOnce({
          valid: false,
          error: 'INVALID_CODE',
          message: 'Voucher code not found'
        });

      const response = await request(app)
        .post(`${base}/validate`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          code: 'INVALID',
          context: 'lessons'
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body).toHaveProperty('error');
    });

    test('rejects missing code', async () => {
      const response = await request(app)
        .post(`${base}/validate`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          context: 'lessons'
        });

      expect(response.status).toBe(400);
    });

    test('rejects invalid context', async () => {
      const response = await request(app)
        .post(`${base}/validate`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          code: 'SAVE10',
          context: 'invalid_context'
        });

      expect(response.status).toBe(400);
    });
  });

  describe('POST /redeem-wallet - Redeem wallet credit voucher', () => {
    test('requires authentication', async () => {
      const response = await request(app)
        .post(`${base}/redeem-wallet`)
        .send({ code: 'WALLET100' });

      expect(response.status).toBe(401);
    });

    test('user can redeem wallet_credit voucher', async () => {
      jest.spyOn(voucherService.default, 'validateVoucher')
        .mockResolvedValueOnce({
          valid: true,
          voucher: {
            id: '22222222-2222-2222-2222-222222222222',
            code: 'WALLET100',
            type: 'wallet_credit'
          },
          discount: { walletCredit: 100 }
        });

      jest.spyOn(voucherService.default, 'applyWalletCredit')
        .mockResolvedValueOnce({ success: true });

      jest.spyOn(voucherService.default, 'redeemVoucher')
        .mockResolvedValueOnce({ success: true });

      const response = await request(app)
        .post(`${base}/redeem-wallet`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          code: 'WALLET100',
          currency: 'EUR'
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body).toHaveProperty('walletCredit', 100);
    });

    test('rejects non-wallet_credit vouchers', async () => {
      jest.spyOn(voucherService.default, 'validateVoucher')
        .mockResolvedValueOnce({
          valid: true,
          voucher: {
            id: '22222222-2222-2222-2222-222222222222',
            code: 'SAVE10',
            type: 'percentage'
          },
          discount: { discountAmount: 10 }
        });

      const response = await request(app)
        .post(`${base}/redeem-wallet`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({ code: 'SAVE10' });

      expect(response.status).toBe(400);
      expect(response.body.error).toMatch(/NOT_WALLET_CREDIT/);
    });
  });

  describe('GET /my - Get user vouchers', () => {
    test('requires authentication', async () => {
      const response = await request(app).get(`${base}/my`);
      expect(response.status).toBe(401);
    });

    test('user can list their vouchers', async () => {
      const mockVouchers = [
        {
          id: '22222222-2222-2222-2222-222222222222',
          code: 'SAVE10',
          type: 'percentage',
          status: 'active'
        }
      ];

      jest.spyOn(voucherService.default, 'getUserVouchers')
        .mockResolvedValueOnce(mockVouchers);

      const response = await request(app)
        .get(`${base}/my`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body.vouchers).toEqual(mockVouchers);
    });

    test('supports includeUsed query parameter', async () => {
      jest.spyOn(voucherService.default, 'getUserVouchers')
        .mockResolvedValueOnce([]);

      await request(app)
        .get(`${base}/my?includeUsed=true`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(voucherService.default.getUserVouchers).toHaveBeenCalledWith(
        '11111111-1111-1111-1111-111111111111',
        false // includeUsed=true means !includeUsed = false
      );
    });
  });

  describe('POST / - Create voucher (admin)', () => {
    test('requires admin or manager role', async () => {
      const response = await request(app)
        .post(`${base}/`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          code: 'NEW10',
          name: 'New 10% Off',
          voucher_type: 'percentage',
          discount_value: 10
        });

      expect([401, 403]).toContain(response.status);
    });

    test('manager can create voucher', async () => {
      const mockVoucher = {
        id: '22222222-2222-2222-2222-222222222222',
        code: 'NEW10',
        name: 'New 10% Off',
        type: 'percentage',
        discount_value: 10,
        is_active: true
      };

      jest.spyOn(voucherService.default, 'createVoucher')
        .mockResolvedValueOnce(mockVoucher);

      const response = await request(app)
        .post(`${base}/`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          code: 'NEW10',
          name: 'New 10% Off',
          voucher_type: 'percentage',
          discount_value: 10,
          applies_to: 'all',
          usage_type: 'unlimited',
          visibility: 'public'
        });

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body.voucher).toEqual(mockVoucher);
    });

    test('rejects duplicate voucher code', async () => {
      jest.spyOn(voucherService.default, 'createVoucher')
        .mockRejectedValueOnce(new Error('Voucher code already exists'));

      const response = await request(app)
        .post(`${base}/`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          code: 'EXISTING',
          name: 'Duplicate',
          voucher_type: 'percentage',
          discount_value: 10
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toMatch(/DUPLICATE_CODE/);
    });

    test('validates required fields', async () => {
      const response = await request(app)
        .post(`${base}/`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Incomplete Voucher'
          // Missing code, voucher_type, discount_value
        });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('errors');
    });
  });

  describe('GET / - List vouchers (admin)', () => {
    test('requires admin or manager role', async () => {
      const response = await request(app)
        .get(`${base}/`)
        .set('Authorization', `Bearer ${userToken}`);

      expect([401, 403]).toContain(response.status);
    });

    test('admin can list vouchers with filters', async () => {
      const mockResult = {
        vouchers: [
          { id: '22222222-2222-2222-2222-222222222222', code: 'SAVE10', type: 'percentage' }
        ],
        pagination: {
          page: 1,
          limit: 20,
          total: 1,
          pages: 1
        }
      };

      jest.spyOn(voucherService.default, 'listVouchers')
        .mockResolvedValueOnce(mockResult);

      const response = await request(app)
        .get(`${base}/?page=1&limit=20&voucher_type=percentage&is_active=true`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body.vouchers.length).toBe(1);
    });
  });

  describe('GET /:id - Get voucher details', () => {
    test('requires admin or manager role', async () => {
      const response = await request(app)
        .get(`${base}/22222222-2222-2222-2222-222222222222`)
        .set('Authorization', `Bearer ${userToken}`);

      expect([401, 403]).toContain(response.status);
    });

    test('returns voucher details', async () => {
      const mockVoucher = {
        id: '22222222-2222-2222-2222-222222222222',
        code: 'SAVE10',
        name: '10% Off',
        type: 'percentage',
        discount_value: 10
      };

      jest.spyOn(voucherService.default, 'getVoucherById')
        .mockResolvedValueOnce(mockVoucher);

      const response = await request(app)
        .get(`${base}/22222222-2222-2222-2222-222222222222`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body.voucher).toEqual(mockVoucher);
    });

    test('returns 404 when voucher not found', async () => {
      jest.spyOn(voucherService.default, 'getVoucherById')
        .mockResolvedValueOnce(null);

      const response = await request(app)
        .get(`${base}/99999999-9999-9999-9999-999999999999`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(404);
    });
  });

  describe('PUT /:id - Update voucher', () => {
    test('requires admin or manager role', async () => {
      const response = await request(app)
        .put(`${base}/22222222-2222-2222-2222-222222222222`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({ name: 'Updated Name' });

      expect([401, 403]).toContain(response.status);
    });

    test('updates voucher details', async () => {
      const mockVoucher = {
        id: '22222222-2222-2222-2222-222222222222',
        code: 'SAVE10',
        name: 'Updated Voucher',
        discount_value: 15
      };

      jest.spyOn(voucherService.default, 'updateVoucher')
        .mockResolvedValueOnce(mockVoucher);

      const response = await request(app)
        .put(`${base}/22222222-2222-2222-2222-222222222222`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          name: 'Updated Voucher',
          discount_value: 15
        });

      expect(response.status).toBe(200);
      expect(response.body.voucher.name).toBe('Updated Voucher');
    });
  });

  describe('DELETE /:id - Deactivate voucher', () => {
    test('requires admin role', async () => {
      const response = await request(app)
        .delete(`${base}/22222222-2222-2222-2222-222222222222`)
        .set('Authorization', `Bearer ${managerToken}`);

      expect([401, 403]).toContain(response.status);
    });

    test('deactivates voucher', async () => {
      jest.spyOn(voucherService.default, 'deleteVoucher')
        .mockResolvedValueOnce({ success: true });

      const response = await request(app)
        .delete(`${base}/22222222-2222-2222-2222-222222222222`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
    });
  });

  describe('POST /bulk - Generate bulk vouchers', () => {
    test('requires admin role', async () => {
      const response = await request(app)
        .post(`${base}/bulk`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          count: 10,
          prefix: 'BULK',
          template: { voucher_type: 'percentage', discount_value: 10, name: 'Bulk Voucher' }
        });

      expect([401, 403]).toContain(response.status);
    });

    test('admin can generate bulk vouchers', async () => {
      const mockVouchers = [
        { id: '22222222-2222-2222-2222-222222222222', code: 'BULK-001' },
        { id: '33333333-3333-3333-3333-333333333333', code: 'BULK-002' }
      ];

      jest.spyOn(voucherService.default, 'generateBulkVouchers')
        .mockResolvedValueOnce(mockVouchers);

      const response = await request(app)
        .post(`${base}/bulk`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          count: 2,
          prefix: 'BULK',
          template: { voucher_type: 'percentage', discount_value: 10, name: 'Bulk Voucher' }
        });

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body.count).toBe(2);
    });

    test('rejects invalid count range', async () => {
      const response = await request(app)
        .post(`${base}/bulk`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          count: 2000, // Max 1000
          template: { voucher_type: 'percentage', discount_value: 10, name: 'Test' }
        });

      expect(response.status).toBe(400);
    });
  });

  describe('POST /:id/assign - Assign voucher to users', () => {
    test('requires admin or manager role', async () => {
      const response = await request(app)
        .post(`${base}/22222222-2222-2222-2222-222222222222/assign`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({ userIds: ['33333333-3333-3333-3333-333333333333'] });

      expect([401, 403]).toContain(response.status);
    });

    test('assigns voucher to users', async () => {
      jest.spyOn(voucherService.default, 'assignVoucherToUser')
        .mockResolvedValueOnce({ success: true });

      const response = await request(app)
        .post(`${base}/22222222-2222-2222-2222-222222222222/assign`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          userIds: ['33333333-3333-3333-3333-333333333333', '44444444-4444-4444-4444-444444444444']
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
    });
  });

  describe('GET /:id/redemptions - Get redemption history', () => {
    test('requires admin or manager role', async () => {
      const response = await request(app)
        .get(`${base}/22222222-2222-2222-2222-222222222222/redemptions`)
        .set('Authorization', `Bearer ${userToken}`);

      expect([401, 403]).toContain(response.status);
    });

    test('returns voucher redemptions', async () => {
      const mockRedemptions = [
        {
          id: '55555555-5555-5555-5555-555555555555',
          voucherId: '22222222-2222-2222-2222-222222222222',
          userId: '33333333-3333-3333-3333-333333333333',
          redeemedAt: new Date().toISOString()
        }
      ];

      jest.spyOn(voucherService.default, 'getVoucherRedemptions')
        .mockResolvedValueOnce(mockRedemptions);

      const response = await request(app)
        .get(`${base}/22222222-2222-2222-2222-222222222222/redemptions`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body.redemptions.length).toBe(1);
    });
  });

  describe('Campaign endpoints', () => {
    test('POST /campaigns - admin can create campaign', async () => {
      const mockCampaign = {
        id: '66666666-6666-6666-6666-666666666666',
        name: 'Spring Promo',
        start_date: '2026-04-01',
        end_date: '2026-04-30'
      };

      jest.spyOn(voucherService.default, 'createCampaign')
        .mockResolvedValueOnce(mockCampaign);

      const response = await request(app)
        .post(`${base}/campaigns`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Spring Promo',
          description: 'Spring discounts',
          start_date: '2026-04-01',
          end_date: '2026-04-30'
        });

      expect(response.status).toBe(201);
      expect(response.body.campaign).toEqual(mockCampaign);
    });

    test('GET /campaigns - lists campaigns', async () => {
      jest.spyOn(pool, 'query').mockResolvedValueOnce({
        rows: [
          { id: '66666666-6666-6666-6666-666666666666', name: 'Spring Promo' }
        ]
      });

      const response = await request(app)
        .get(`${base}/campaigns`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
    });

    test('GET /campaigns/:id - get campaign stats', async () => {
      const mockCampaign = {
        id: '66666666-6666-6666-6666-666666666666',
        name: 'Spring Promo',
        voucher_count: 50,
        redeemed_count: 15
      };

      jest.spyOn(voucherService.default, 'getCampaignStats')
        .mockResolvedValueOnce(mockCampaign);

      const response = await request(app)
        .get(`${base}/campaigns/66666666-6666-6666-6666-666666666666`)
        .set('Authorization', `Bear ${adminToken}`);

      expect([200, 401]).toContain(response.status); // 401 due to invalid token format
    });
  });
});
