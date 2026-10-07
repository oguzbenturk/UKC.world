/**
 * Regression: staff-facing user endpoints used `SELECT u.*` / `RETURNING *` on
 * the users table and returned the raw row, leaking password_hash (and 2FA
 * secrets, iyzico card key, verification token hash...) in the JSON.
 * e.g. an admin calling GET /api/users?role=student received every password_hash.
 *
 * pool.query is stubbed so every users-table read returns a row carrying all
 * secret columns; each endpoint must strip them while keeping normal fields.
 */
import request from 'supertest';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { jest, describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import app from '../../../../backend/server.js';
import { pool } from '../../../../backend/db.js';
import { sanitizeUser, sanitizeUsers, SENSITIVE_USER_FIELDS } from '../../../../backend/utils/sanitizeUser.js';

const JWT_SECRET = process.env.JWT_SECRET || 'plannivo-jwt-secret-key';
const USER_ID = '11111111-1111-4111-8111-111111111111';
const ROLE_ID = '22222222-2222-4222-8222-222222222222';
const PLAIN_PASSWORD = 'Correct-Horse-1';
let PASSWORD_HASH;

const SECRET_COLUMNS = [
  'password_hash',
  'two_factor_secret',
  'two_factor_backup_codes',
  'iyzico_card_user_key',
  'email_verification_token_hash',
  'last_login_ip',
  'failed_login_attempts',
  'account_locked',
  'account_locked_at',
];

function userRow(overrides = {}) {
  return {
    id: USER_ID,
    name: 'Leaky Student',
    first_name: 'Leaky',
    last_name: 'Student',
    email: 'leaky@example.com',
    phone: '+900000000',
    role_id: ROLE_ID,
    role_name: 'student',
    role_permissions: {},
    balance: '0.00',
    preferred_currency: 'EUR',
    deleted_at: null,
    email_verified: true,
    account_expired_at: null,
    two_factor_enabled: false,
    password_hash: PASSWORD_HASH,
    two_factor_secret: 'JBSWY3DPEHPK3PXP',
    two_factor_backup_codes: ['backup-1', 'backup-2'],
    iyzico_card_user_key: 'card-user-key-secret',
    email_verification_token_hash: 'deadbeef-token-hash',
    last_login_ip: '10.0.0.1',
    failed_login_attempts: 0,
    account_locked: false,
    account_locked_at: null,
    ...overrides,
  };
}

function token(role = 'admin', id = '33333333-3333-4333-8333-333333333333') {
  return jwt.sign({ id, email: `${role}@test.local`, role }, JWT_SECRET, { expiresIn: '1h' });
}

function expectNoSecrets(obj) {
  for (const col of SECRET_COLUMNS) {
    expect(obj).not.toHaveProperty(col);
  }
}

describe('User secret columns never leave the API', () => {
  let querySpy;

  beforeAll(async () => {
    PASSWORD_HASH = await bcrypt.hash(PLAIN_PASSWORD, 4);
    querySpy = jest.spyOn(pool, 'query').mockImplementation((text) => {
      const sql = typeof text === 'string' ? text : (text?.text || '');
      if (/SELECT\s+u\.\*/i.test(sql) && /FROM\s+users\s+u/i.test(sql)) {
        return Promise.resolve({ rows: [userRow()], rowCount: 1 });
      }
      if (/INSERT INTO users[\s\S]*RETURNING \*/i.test(sql)) {
        return Promise.resolve({ rows: [userRow({ password_hash: null })], rowCount: 1 });
      }
      if (/SELECT id FROM roles WHERE name='student'/i.test(sql)) {
        return Promise.resolve({ rows: [{ id: ROLE_ID }], rowCount: 1 });
      }
      return Promise.resolve({ rows: [], rowCount: 0 });
    });
  });

  afterAll(() => {
    querySpy?.mockRestore?.();
  });

  test('sanitizeUser strips every secret column and keeps normal fields', () => {
    const clean = sanitizeUser(userRow());
    expectNoSecrets(clean);
    expect(clean).toMatchObject({ id: USER_ID, email: 'leaky@example.com', first_name: 'Leaky', balance: '0.00' });
    expect(SENSITIVE_USER_FIELDS).toEqual(expect.arrayContaining(SECRET_COLUMNS));
    expect(sanitizeUsers([userRow(), userRow()]).every((u) => !('password_hash' in u))).toBe(true);
    expect(sanitizeUser(null)).toBeNull();
  });

  test('GET /api/users?role=student (admin) does not return password_hash', async () => {
    const res = await request(app)
      .get('/api/users?role=student&limit=3')
      .set('Authorization', `Bearer ${token('admin')}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
    res.body.forEach(expectNoSecrets);
    expect(res.body[0]).toMatchObject({ id: USER_ID, email: 'leaky@example.com', role_name: 'student' });
  });

  test.each(['manager', 'receptionist'])('GET /api/users as %s does not return secrets', async (role) => {
    const res = await request(app).get('/api/users').set('Authorization', `Bearer ${token(role)}`);
    expect(res.status).toBe(200);
    res.body.forEach(expectNoSecrets);
  });

  test('GET /api/users/:id/student-details does not return secrets', async () => {
    const res = await request(app)
      .get(`/api/users/${USER_ID}/student-details`)
      .set('Authorization', `Bearer ${token('admin')}`);
    expect(res.status).toBe(200);
    expectNoSecrets(res.body);
    expect(res.body).toMatchObject({ id: USER_ID, email: 'leaky@example.com' });
    expect(res.body).toHaveProperty('bookings');
    expect(res.body).toHaveProperty('rentals');
  });

  test('GET /api/users/:id does not return secrets', async () => {
    const res = await request(app)
      .get(`/api/users/${USER_ID}`)
      .set('Authorization', `Bearer ${token('admin')}`);
    expect(res.status).toBe(200);
    expectNoSecrets(res.body);
  });

  test('POST /api/users/import-students is removed (no role can bulk-create users)', async () => {
    for (const role of ['student', 'admin']) {
      const res = await request(app)
        .post('/api/users/import-students')
        .set('Authorization', `Bearer ${token(role)}`)
        .send({ csvData: 'first_name,last_name,email,phone\nLeaky,Student,leaky@example.com,+900000000' });
      expect(res.status).not.toBe(200);
      expect(res.body?.users).toBeUndefined();
    }
  });

  test('GET /api/students and /api/students/:id (deprecated) do not return secrets', async () => {
    const list = await request(app).get('/api/students').set('Authorization', `Bearer ${token('admin')}`);
    expect(list.status).toBe(200);
    expect(list.body.length).toBeGreaterThan(0);
    list.body.forEach(expectNoSecrets);

    const one = await request(app).get(`/api/students/${USER_ID}`).set('Authorization', `Bearer ${token('admin')}`);
    expect(one.status).toBe(200);
    expectNoSecrets(one.body);
    expect(one.body).toMatchObject({ id: USER_ID });
  });

  test('POST /api/students/import does not echo secret columns', async () => {
    const res = await request(app)
      .post('/api/students/import')
      .set('Authorization', `Bearer ${token('admin')}`)
      .send({ csvData: 'name,email,phone\nLeaky Student,leaky@example.com,+900000000' });
    expect(res.status).toBe(200);
    expect(res.body.students.length).toBe(1);
    res.body.students.forEach(expectNoSecrets);
  });

  test('POST /api/auth/login response user has no secret columns', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'leaky@example.com', password: PLAIN_PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('token');
    expectNoSecrets(res.body.user);
    expect(res.body.user).toMatchObject({ id: USER_ID, email: 'leaky@example.com', role: 'student' });
  });
});
