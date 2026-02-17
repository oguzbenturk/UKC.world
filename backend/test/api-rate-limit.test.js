import request from 'supertest';
import jwt from 'jsonwebtoken';
import { jest } from '@jest/globals';

process.env.API_RATE_LIMIT_MAX = '5';
process.env.API_RATE_LIMIT_WINDOW_MS = '60000';
process.env.SKIP_RATE_LIMIT = 'false';

let app;
let familyService;
let mockedSubmitWaiver;

const getJwtSecret = () => process.env.JWT_SECRET || 'plannivo-jwt-secret-key';

const createToken = ({ id, role, email }) => jwt.sign({ id, role, email }, getJwtSecret(), { expiresIn: '1h' });

const validFamilyPayload = {
  full_name: 'Test Child',
  date_of_birth: '2015-01-01',
  relationship: 'child',
  gender: 'other'
};

const buildWaiverPayload = (userId) => ({
  user_id: userId,
  waiver_version: '1.0',
  language_code: 'en',
  signature_data: 'data:image/png;base64,iVBORw0KGgo=',
  agreed_to_terms: true,
  photo_consent: false
});

describe('API rate limiting', () => {
  jest.setTimeout(20000);

  beforeAll(async () => {
    jest.resetModules();

    mockedSubmitWaiver = jest.fn().mockResolvedValue({
      id: 'waiver-id',
      user_id: 'placeholder-user',
      signer_user_id: 'placeholder-user',
      waiver_version: '1.0',
      language_code: 'en',
      signature_image_url: '/uploads/signatures/mock.png',
      signature_public_url: '/uploads/signatures/mock.png',
      agreed_to_terms: true,
      photo_consent: false,
      signed_at: new Date().toISOString(),
      created_at: new Date().toISOString()
    });

    jest.unstable_mockModule('../services/waiverService.js', () => ({
      submitWaiver: mockedSubmitWaiver,
      checkWaiverStatus: jest.fn(),
      getWaiverHistory: jest.fn(),
      getWaiverVersion: jest.fn(),
      getLatestActiveVersion: jest.fn(),
      needsToSignWaiver: jest.fn(),
      deleteWaiversForFamilyMember: jest.fn(),
      deleteWaiversForUser: jest.fn(),
      generateSignaturePublicUrl: jest.fn((path) => path || '')
    }));

    ({ default: app } = await import('../server.js'));
    ({ default: familyService } = await import('../services/familyService.js'));
  });

  afterAll(() => {
    delete process.env.API_RATE_LIMIT_MAX;
    delete process.env.API_RATE_LIMIT_WINDOW_MS;
    delete process.env.SKIP_RATE_LIMIT;
  });

  afterEach(() => {
    jest.restoreAllMocks();
    mockedSubmitWaiver.mockClear();
  });

  it('throttles repeated family member creation requests', async () => {
    const userId = '11111111-1111-1111-1111-111111111111';
    const token = createToken({ id: userId, role: 'student', email: 'student@example.com' });
    const testingIp = '10.0.0.101';

    const familySpy = jest.spyOn(familyService, 'createFamilyMember').mockResolvedValue({
      id: 'family-member-id',
      full_name: validFamilyPayload.full_name,
      warnings: []
    });

    for (let i = 0; i < 5; i += 1) {
      const response = await request(app)
        .post(`/api/students/${userId}/family`)
        .set('Authorization', `Bearer ${token}`)
        .set('X-Forwarded-For', testingIp)
        .send(validFamilyPayload);

      expect(response.status).toBe(201);
    }

    const limitedResponse = await request(app)
      .post(`/api/students/${userId}/family`)
      .set('Authorization', `Bearer ${token}`)
      .set('X-Forwarded-For', testingIp)
      .send(validFamilyPayload);

    expect(limitedResponse.status).toBe(429);
    expect(limitedResponse.body).toHaveProperty('error');
    expect(familySpy).toHaveBeenCalledTimes(5);
  });

  it('throttles repeated waiver submissions', async () => {
    const userId = '22222222-2222-2222-2222-222222222222';
    const token = createToken({ id: userId, role: 'student', email: 'student-two@example.com' });
    const testingIp = '10.0.0.202';

    mockedSubmitWaiver.mockResolvedValue({
      id: 'waiver-id',
      user_id: userId,
      signer_user_id: userId,
      waiver_version: '1.0',
      language_code: 'en',
      signature_image_url: '/uploads/signatures/mock.png',
      signature_public_url: '/uploads/signatures/mock.png',
      agreed_to_terms: true,
      photo_consent: false,
      signed_at: new Date().toISOString(),
      created_at: new Date().toISOString()
    });

    const payload = buildWaiverPayload(userId);

    for (let i = 0; i < 5; i += 1) {
      const response = await request(app)
        .post('/api/waivers/submit')
        .set('Authorization', `Bearer ${token}`)
        .set('X-Forwarded-For', testingIp)
        .send(payload);

      expect(response.status).toBe(201);
    }

    const limitedResponse = await request(app)
      .post('/api/waivers/submit')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Forwarded-For', testingIp)
      .send(payload);

    expect(limitedResponse.status).toBe(429);
    expect(limitedResponse.body).toHaveProperty('error');
    expect(mockedSubmitWaiver).toHaveBeenCalledTimes(5);
  });
});
