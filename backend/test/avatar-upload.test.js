import request from 'supertest';
import jwt from 'jsonwebtoken';
import fs from 'fs';
import path from 'path';
import { jest } from '@jest/globals';
import app from '../server.js';
import { pool } from '../db.js';

const JWT_SECRET = process.env.JWT_SECRET || 'plannivo-jwt-secret-key';
const endpoint = '/api/users/upload-avatar';

function createToken({ id, role, email }) {
  return jwt.sign({ id, role, email }, JWT_SECRET, { expiresIn: '1h' });
}

function removeUploadedFile(relativeUrl) {
  if (!relativeUrl) return;
  try {
    const localPath = path.resolve(process.cwd(), relativeUrl.replace('/uploads/', 'uploads/'));
    if (fs.existsSync(localPath)) {
      fs.unlinkSync(localPath);
    }
  } catch (err) {
    // ignore cleanup errors in test env
  }
}

describe('POST /api/users/upload-avatar', () => {
  const sampleBuffer = Buffer.from('avatar-bytes');
  let querySpy;

  beforeAll(() => {
    querySpy = jest.spyOn(pool, 'query').mockImplementation((text, params) => {
      const sql = typeof text === 'string' ? text : '';
      if (sql.includes('UPDATE users SET profile_image_url')) {
        return Promise.resolve({
          rowCount: 1,
          rows: [
            {
              id: params?.[1] ?? 'unknown-id',
              profile_image_url: params?.[0] ?? '/uploads/avatars/mock.png',
              role_id: null,
              email: 'mock@example.com',
              first_name: 'Mock',
              last_name: 'User'
            }
          ]
        });
      }
      if (sql.includes('SELECT name FROM roles')) {
        return Promise.resolve({ rows: [{ name: 'student' }] });
      }
      return Promise.resolve({ rows: [], rowCount: 0 });
    });
  });

  afterAll(() => {
    querySpy?.mockRestore?.();
  });

  it('rejects cross-user uploads for non-admin roles', async () => {
    const token = createToken({ id: 'student-test', role: 'student', email: 'student@test.local' });
    const res = await request(app)
      .post(endpoint)
      .set('Authorization', `Bearer ${token}`)
      .field('targetUserId', 'other-user-id')
      .attach('avatar', sampleBuffer, 'avatar.png');

    expect(res.status).toBe(403);
    expect(res.body).toHaveProperty('error');
  });

  it('allows admin to upload avatars for another user and surfaces target metadata', async () => {
    const token = createToken({ id: 'admin-test', role: 'admin', email: 'admin@test.local' });
    const targetId = '11111111-1111-1111-1111-111111111111';

    const res = await request(app)
      .post(endpoint)
      .set('Authorization', `Bearer ${token}`)
      .field('targetUserId', targetId)
      .attach('avatar', sampleBuffer, 'avatar.png');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('url');
    expect(res.body).toHaveProperty('targetUserId', targetId);
    expect(res.body).toHaveProperty('updatedForSelf', false);

    removeUploadedFile(res.body?.url);
  });
});
