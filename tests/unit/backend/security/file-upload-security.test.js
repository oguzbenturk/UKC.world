import request from 'supertest';
import jwt from 'jsonwebtoken';
import path from 'path';
import fs from 'fs';
import app from '../../../../backend/server.js';

/**
 * File Upload Security Tests (Integration)
 *
 * Tests the upload endpoints for:
 * - MIME type + extension validation
 * - File size limits
 * - Auth requirements
 * - Path traversal prevention
 * - Public upload token protection
 * - Cross-user upload prevention
 */

const JWT_SECRET = process.env.JWT_SECRET || 'plannivo-jwt-secret-key';

const createToken = ({ id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', role = 'admin', email = 'admin@test.local' } = {}) =>
  jwt.sign({ id, role, email }, JWT_SECRET, { expiresIn: '1h' });

// Create a tiny valid PNG (1x1 pixel)
const VALID_PNG_BYTES = Buffer.from([
  0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, // PNG signature
  0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52, // IHDR chunk
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, // 1x1
  0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53, 0xDE, // bit depth, color type, CRC
  0x00, 0x00, 0x00, 0x0C, 0x49, 0x44, 0x41, 0x54, // IDAT chunk
  0x08, 0xD7, 0x63, 0xF8, 0xCF, 0xC0, 0x00, 0x00, 0x00, 0x02, 0x00, 0x01,
  0xE2, 0x21, 0xBC, 0x33,
  0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82  // IEND chunk
]);

// ============================================
// 1. Image upload — auth required
// ============================================
describe('Image upload — /api/upload/image', () => {
  test('rejects unauthenticated requests', async () => {
    const res = await request(app)
      .post('/api/upload/image')
      .attach('image', VALID_PNG_BYTES, 'test.png');
    expect(res.status).toBe(401);
  });

  test('rejects non-admin/non-manager roles', async () => {
    const studentToken = createToken({ role: 'student', email: 'student@test.local' });
    const res = await request(app)
      .post('/api/upload/image')
      .set('Authorization', `Bearer ${studentToken}`)
      .attach('image', VALID_PNG_BYTES, 'test.png');
    expect([401, 403]).toContain(res.status);
  });

  test('allows admin to upload images', async () => {
    const adminToken = createToken({ role: 'admin' });
    const res = await request(app)
      .post('/api/upload/image')
      .set('Authorization', `Bearer ${adminToken}`)
      .attach('image', VALID_PNG_BYTES, 'test.png');
    // Should succeed (200) or at least not be auth error
    expect([401, 403]).not.toContain(res.status);
  });
});

// ============================================
// 2. Dangerous file type rejection
// ============================================
describe('File type validation', () => {
  test('rejects executable file disguised as image', async () => {
    const adminToken = createToken({ role: 'admin' });
    const exeContent = Buffer.from('MZ\x90\x00'); // EXE magic bytes
    const res = await request(app)
      .post('/api/upload/image')
      .set('Authorization', `Bearer ${adminToken}`)
      .attach('image', exeContent, 'malware.exe');
    // Should be rejected — either by multer (400) or validation
    expect([200]).not.toContain(res.status);
  });

  test('rejects PHP file upload', async () => {
    const adminToken = createToken({ role: 'admin' });
    const phpContent = Buffer.from('<?php echo "hacked"; ?>');
    const res = await request(app)
      .post('/api/upload/image')
      .set('Authorization', `Bearer ${adminToken}`)
      .attach('image', phpContent, 'shell.php');
    expect([200]).not.toContain(res.status);
  });

  test('rejects HTML file (XSS vector)', async () => {
    const adminToken = createToken({ role: 'admin' });
    const htmlContent = Buffer.from('<script>alert("xss")</script>');
    const res = await request(app)
      .post('/api/upload/image')
      .set('Authorization', `Bearer ${adminToken}`)
      .attach('image', htmlContent, 'xss.html');
    expect([200]).not.toContain(res.status);
  });

  test('rejects SVG file (potential XSS)', async () => {
    const adminToken = createToken({ role: 'admin' });
    const svgContent = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
    const res = await request(app)
      .post('/api/upload/image')
      .set('Authorization', `Bearer ${adminToken}`)
      .attach('image', svgContent, 'evil.svg');
    expect([200]).not.toContain(res.status);
  });
});

// ============================================
// 3. Path traversal prevention
// ============================================
describe('Path traversal prevention', () => {
  test('rejects filename with directory traversal', async () => {
    const adminToken = createToken({ role: 'admin' });
    const res = await request(app)
      .post('/api/upload/image')
      .set('Authorization', `Bearer ${adminToken}`)
      .attach('image', VALID_PNG_BYTES, '../../../../backend/../../etc/passwd.png');
    // The upload should either reject the filename or sanitize it
    if (res.status === 200 && res.body.url) {
      // If it succeeds, the URL must NOT contain traversal sequences
      expect(res.body.url).not.toContain('..');
      expect(res.body.url).not.toContain('etc/passwd');
    }
  });

  test('rejects null byte in filename', async () => {
    const adminToken = createToken({ role: 'admin' });
    const res = await request(app)
      .post('/api/upload/image')
      .set('Authorization', `Bearer ${adminToken}`)
      .attach('image', VALID_PNG_BYTES, 'test\x00.exe.png');
    if (res.status === 200 && res.body.url) {
      expect(res.body.url).not.toContain('\x00');
      expect(res.body.url).not.toContain('.exe');
    }
  });
});

// ============================================
// 4. Public upload token protection
// ============================================
describe('Public form upload — token protection', () => {
  test('rejects form submission upload without token', async () => {
    const res = await request(app)
      .post('/api/upload/form-submission')
      .attach('file', VALID_PNG_BYTES, 'form-photo.png');
    // Should be 401 (no token) or 503 (token not configured)
    expect([401, 503]).toContain(res.status);
  });

  test('rejects form submission with wrong token', async () => {
    const res = await request(app)
      .post('/api/upload/form-submission')
      .set('x-form-upload-token', 'wrong-token-123')
      .attach('file', VALID_PNG_BYTES, 'form-photo.png');
    expect([401, 503]).toContain(res.status);
  });
});

// ============================================
// 5. Chat file upload types
// ============================================
describe('Chat file upload — /api/upload/chat-file', () => {
  test('requires authentication', async () => {
    const res = await request(app)
      .post('/api/upload/chat-file')
      .attach('file', Buffer.from('test content'), 'doc.pdf');
    expect(res.status).toBe(401);
  });
});

// ============================================
// 6. Voice message upload
// ============================================
describe('Voice message upload — /api/upload/voice-message', () => {
  test('requires authentication', async () => {
    const res = await request(app)
      .post('/api/upload/voice-message')
      .attach('audio', Buffer.from([0, 0, 0]), 'voice.webm');
    expect(res.status).toBe(401);
  });
});

// ============================================
// 7. Avatar cross-user protection (per existing test extension)
// ============================================
describe('Avatar upload — cross-user protection', () => {
  test('student cannot upload avatar for another user', async () => {
    const studentToken = createToken({
      id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
      role: 'student',
      email: 'student@test.local'
    });
    const res = await request(app)
      .post('/api/users/upload-avatar')
      .set('Authorization', `Bearer ${studentToken}`)
      .field('targetUserId', 'cccccccc-cccc-cccc-cccc-cccccccccccc')
      .attach('avatar', VALID_PNG_BYTES, 'avatar.png');
    expect(res.status).toBe(403);
  });

  test('admin can upload avatar for another user', async () => {
    const adminToken = createToken({ role: 'admin', email: 'admin@test.local' });
    const res = await request(app)
      .post('/api/users/upload-avatar')
      .set('Authorization', `Bearer ${adminToken}`)
      .field('targetUserId', 'cccccccc-cccc-cccc-cccc-cccccccccccc')
      .attach('avatar', VALID_PNG_BYTES, 'avatar.png');
    // Should not be 403 — may be 200 or 500 (user not found in DB)
    expect(res.status).not.toBe(403);
  });
});
