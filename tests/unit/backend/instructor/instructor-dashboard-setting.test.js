// settings key `instructor_dashboard` = { wind_spot, wind_min_kn, wind_max_kn }
// (backend/routes/settings.js) — the instructor "My day" wind card. Admin /
// manager only, validated (known spot, 5–40 kn, min < max), and GET /settings
// returns the new value right after the save (cache dropped before answering).
// Integration suite against the LOCAL dev DB; the original row is restored.
import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';

let app;
let pool;
let settingsRoute;
let original = null;

const RUN = crypto.randomBytes(4).toString('hex');
const token = (role) =>
  jwt.sign({ id: crypto.randomUUID(), email: `${role}-${RUN}@setting.test`, role }, process.env.JWT_SECRET || 'plannivo-jwt-secret-key', { expiresIn: '1h' });
const auth = (role) => ({ Authorization: `Bearer ${token(role)}` });
const put = (role, value) => request(app).put('/api/settings/instructor_dashboard').set(auth(role)).send({ value });

beforeAll(async () => {
  ({ default: app } = await import('../../../../backend/server.js'));
  ({ pool } = await import('../../../../backend/db.js'));
  settingsRoute = await import('../../../../backend/routes/settings.js');
  const { rows } = await pool.query(`SELECT value FROM settings WHERE key = 'instructor_dashboard'`);
  original = rows[0] ? rows[0].value : null;
});

afterAll(async () => {
  if (!pool) return;
  if (original === null) {
    await pool.query(`DELETE FROM settings WHERE key = 'instructor_dashboard'`);
  } else {
    await pool.query(`UPDATE settings SET value = $1 WHERE key = 'instructor_dashboard'`, [JSON.stringify(original)]);
  }
  try {
    const { cacheService } = await import('../../../../backend/services/cacheService.js');
    await cacheService.del('api:GET:/api/settings*');
  } catch { /* cache optional */ }
});

describe('PUT /api/settings/instructor_dashboard', () => {
  test('admin saves a valid value; GET /settings returns it immediately', async () => {
    const res = await put('admin', { wind_spot: 'alacati', wind_min_kn: '14', wind_max_kn: 28 });
    expect(res.status).toBe(200);
    expect(res.body.setting.value).toEqual({ wind_spot: 'alacati', wind_min_kn: 14, wind_max_kn: 28 });

    const read = await request(app).get('/api/settings').set(auth('instructor'));
    expect(read.status).toBe(200);
    expect(read.body.instructor_dashboard).toEqual({ wind_spot: 'alacati', wind_min_kn: 14, wind_max_kn: 28 });

    const again = await put('manager', { wind_spot: 'gulbahce', wind_min_kn: 10, wind_max_kn: 22 });
    expect(again.status).toBe(200);
    const reread = await request(app).get('/api/settings').set(auth('instructor'));
    expect(reread.body.instructor_dashboard).toEqual({ wind_spot: 'gulbahce', wind_min_kn: 10, wind_max_kn: 22 });
  });

  test.each([
    [{ wind_spot: 'gulbahce', wind_min_kn: 25, wind_max_kn: 12 }, /lower than/],
    [{ wind_spot: 'gulbahce', wind_min_kn: 20, wind_max_kn: 20 }, /lower than/],
    [{ wind_spot: 'gulbahce', wind_min_kn: 4, wind_max_kn: 25 }, /between 5 and 40/],
    [{ wind_spot: 'gulbahce', wind_min_kn: 12, wind_max_kn: 41 }, /between 5 and 40/],
    [{ wind_spot: 'gulbahce', wind_min_kn: 'abc', wind_max_kn: 25 }, /between 5 and 40/],
    [{ wind_spot: 'nowhere', wind_min_kn: 12, wind_max_kn: 25 }, /wind_spot must be one of/],
    [null, /must be an object/],
  ])('rejects invalid value %j with 400', async (value, message) => {
    const res = await put('admin', value);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(message);
  });

  test.each(['instructor', 'receptionist', 'student'])('%s cannot change it (403)', async (role) => {
    const res = await put(role, { wind_spot: 'gulbahce', wind_min_kn: 12, wind_max_kn: 25 });
    expect(res.status).toBe(403);
  });
});

describe('validateInstructorDashboardSetting (unit)', () => {
  test('normalises numbers and trims the spot', () => {
    expect(settingsRoute.validateInstructorDashboardSetting({ wind_spot: ' gokceada ', wind_min_kn: '5', wind_max_kn: '40' }))
      .toEqual({ value: { wind_spot: 'gokceada', wind_min_kn: 5, wind_max_kn: 40 } });
    expect(settingsRoute.INSTRUCTOR_DASHBOARD_DEFAULTS).toEqual({ wind_spot: 'gulbahce', wind_min_kn: 12, wind_max_kn: 25 });
  });
});
