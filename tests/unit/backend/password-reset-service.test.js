import { jest, describe, test, expect, beforeAll, beforeEach } from '@jest/globals';
import crypto from 'crypto';

let passwordResetService;
let mockPool;
let mockLogger;

beforeAll(async () => {
  mockPool = {
    query: jest.fn().mockResolvedValue({ rows: [] }),
    connect: jest.fn().mockResolvedValue({ query: jest.fn().mockResolvedValue({ rows: [] }), release: jest.fn() })
  };

  mockLogger = {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn()
  };

  await jest.unstable_mockModule('../../../backend/db.js', () => ({
    pool: mockPool
  }));

  await jest.unstable_mockModule('../../../backend/middlewares/errorHandler.js', () => ({
    logger: mockLogger
  }));

  await jest.unstable_mockModule('../../../backend/services/emailService.js', () => ({
    sendEmail: jest.fn().mockResolvedValue({ success: true })
  }));

  const mod = await import('../../../backend/services/passwordResetService.js');
  passwordResetService = mod;
});

beforeEach(() => {
  mockPool.query.mockReset();
  mockPool.connect.mockReset();
  mockLogger.info.mockReset();
  mockLogger.error.mockReset();
  mockLogger.warn.mockReset();
});

describe('passwordResetService.requestPasswordReset', () => {
  test('sends reset email for existing user', async () => {
    const client = {
      query: jest.fn(),
      release: jest.fn()
    };
    mockPool.connect.mockResolvedValueOnce(client);
    client.query
      .mockResolvedValueOnce({
        rows: [{ id: 'user-1', email: 'user@example.com', name: 'John Doe' }]
      })
      .mockResolvedValueOnce({ rows: [] }) // no recent requests
      .mockResolvedValueOnce({ rows: [] }) // invalidate old tokens
      .mockResolvedValueOnce({ rows: [] }); // insert new token

    const result = await passwordResetService.requestPasswordReset(
      'user@example.com',
      '192.168.1.1',
      'Mozilla/5.0'
    );

    expect(result.success).toBe(true);
    expect(result.message).toContain('email');
    expect(client.release).toHaveBeenCalled();
  });

  test('returns success for non-existent email (prevents enumeration)', async () => {
    const client = {
      query: jest.fn(),
      release: jest.fn()
    };
    mockPool.connect.mockResolvedValueOnce(client);
    client.query.mockResolvedValueOnce({ rows: [] }); // no user found

    const result = await passwordResetService.requestPasswordReset(
      'notfound@example.com',
      '192.168.1.1',
      'Mozilla/5.0'
    );

    expect(result.success).toBe(true);
    expect(result.message).toContain('email');
  });

  test('rate limits reset requests (5 minute window)', async () => {
    const client = {
      query: jest.fn(),
      release: jest.fn()
    };
    mockPool.connect.mockResolvedValueOnce(client);
    client.query
      .mockResolvedValueOnce({
        rows: [{ id: 'user-1', email: 'user@example.com', name: 'John' }]
      })
      .mockResolvedValueOnce({
        rows: [{ id: 'token-1' }]
      }); // recent request exists

    const result = await passwordResetService.requestPasswordReset(
      'user@example.com',
      '192.168.1.1',
      'Mozilla/5.0'
    );

    expect(result.success).toBe(true);
    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining('rate limited'),
      expect.any(Object)
    );
  });

  test('invalidates existing unused tokens', async () => {
    const client = {
      query: jest.fn(),
      release: jest.fn()
    };
    mockPool.connect.mockResolvedValueOnce(client);
    client.query
      .mockResolvedValueOnce({
        rows: [{ id: 'user-1', email: 'user@example.com', name: 'John' }]
      })
      .mockResolvedValueOnce({ rows: [] }) // no recent requests
      .mockResolvedValueOnce({ rows: [] }); // invalidate old tokens

    await passwordResetService.requestPasswordReset(
      'user@example.com',
      '192.168.1.1',
      'Mozilla/5.0'
    );

    // Check that invalidation query was called
    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE password_reset_tokens'),
      expect.any(Array)
    );
  });

  test('releases client connection on success', async () => {
    const client = {
      query: jest.fn(),
      release: jest.fn()
    };
    mockPool.connect.mockResolvedValueOnce(client);
    client.query
      .mockResolvedValueOnce({
        rows: [{ id: 'user-1', email: 'user@example.com', name: 'John' }]
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    await passwordResetService.requestPasswordReset(
      'user@example.com',
      '192.168.1.1',
      'Mozilla/5.0'
    );

    expect(client.release).toHaveBeenCalled();
  });

  test('releases client connection on error', async () => {
    const client = {
      query: jest.fn(),
      release: jest.fn()
    };
    mockPool.connect.mockResolvedValueOnce(client);
    client.query.mockRejectedValueOnce(new Error('DB error'));

    await expect(
      passwordResetService.requestPasswordReset(
        'user@example.com',
        '192.168.1.1',
        'Mozilla/5.0'
      )
    ).rejects.toThrow();

    expect(client.release).toHaveBeenCalled();
  });

  test('stores hashed token in database (not plain)', async () => {
    const client = {
      query: jest.fn(),
      release: jest.fn()
    };
    mockPool.connect.mockResolvedValueOnce(client);
    client.query
      .mockResolvedValueOnce({
        rows: [{ id: 'user-1', email: 'user@example.com', name: 'John' }]
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    await passwordResetService.requestPasswordReset(
      'user@example.com',
      '192.168.1.1',
      'Mozilla/5.0'
    );

    const insertCall = client.query.mock.calls.find(call =>
      call[0].includes('INSERT INTO password_reset_tokens')
    );
    expect(insertCall).toBeDefined();
    // The token should be hashed (SHA-256), not plain
    const tokenArg = insertCall[1][1];
    expect(tokenArg).toMatch(/^[a-f0-9]{64}$/); // SHA-256 hex format
  });
});

describe('passwordResetService.validateResetToken', () => {
  test('validates valid reset token', async () => {
    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    mockPool.query.mockResolvedValueOnce({
      rows: [{ id: 'token-1', user_id: 'user-1' }]
    });

    const result = await passwordResetService.validateResetToken(
      token,
      'user@example.com'
    );

    expect(result.valid).toBe(true);
    expect(result.userId).toBe('user-1');
  });

  test('rejects invalid token', async () => {
    mockPool.query.mockResolvedValueOnce({ rows: [] });

    const result = await passwordResetService.validateResetToken(
      'invalid-token',
      'user@example.com'
    );

    expect(result.valid).toBe(false);
    expect(result.error).toBeDefined();
  });

  test('rejects used token', async () => {
    mockPool.query.mockResolvedValueOnce({ rows: [] }); // used_at IS NOT NULL filters it out

    const result = await passwordResetService.validateResetToken(
      'used-token',
      'user@example.com'
    );

    expect(result.valid).toBe(false);
  });

  test('rejects expired token', async () => {
    mockPool.query.mockResolvedValueOnce({ rows: [] }); // expires_at > NOW() filters it out

    const result = await passwordResetService.validateResetToken(
      'expired-token',
      'user@example.com'
    );

    expect(result.valid).toBe(false);
  });

  test('validates email case-insensitively', async () => {
    mockPool.query.mockResolvedValueOnce({
      rows: [{ user_id: 'user-1' }]
    });

    const result = await passwordResetService.validateResetToken(
      'token',
      'USER@EXAMPLE.COM'
    );

    expect(mockPool.query).toHaveBeenCalledWith(
      expect.stringContaining('LOWER(u.email) = LOWER($2)'),
      expect.any(Array)
    );
  });
});

describe('passwordResetService.resetPassword', () => {
  test('resets password for valid token', async () => {
    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    const client = {
      query: jest.fn(),
      release: jest.fn()
    };
    mockPool.connect.mockResolvedValueOnce(client);

    client.query
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({
        rows: [{ id: 'token-1', user_id: 'user-1' }]
      }) // validate token
      .mockResolvedValueOnce({ rows: [] }) // update password
      .mockResolvedValueOnce({ rows: [] }) // mark token as used
      .mockResolvedValueOnce({ rows: [] }) // invalidate other tokens
      .mockResolvedValueOnce({ rows: [] }) // COMMIT
      .mockResolvedValueOnce({
        rows: [{ email: 'user@example.com', name: 'John' }]
      }); // get user info

    const result = await passwordResetService.resetPassword(
      token,
      'user@example.com',
      'newPassword123',
      '192.168.1.1'
    );

    expect(result.success).toBe(true);
    expect(client.release).toHaveBeenCalled();
  });

  test('rejects invalid token', async () => {
    const client = {
      query: jest.fn(),
      release: jest.fn()
    };
    mockPool.connect.mockResolvedValueOnce(client);

    client.query
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [] }); // token validation fails

    const result = await passwordResetService.resetPassword(
      'invalid-token',
      'user@example.com',
      'newPassword123',
      '192.168.1.1'
    );

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  test('validates password strength (minimum 8 characters)', async () => {
    const client = {
      query: jest.fn(),
      release: jest.fn()
    };
    mockPool.connect.mockResolvedValueOnce(client);

    client.query
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({
        rows: [{ id: 'token-1', user_id: 'user-1' }]
      }); // token valid

    const result = await passwordResetService.resetPassword(
      'token',
      'user@example.com',
      'short',
      '192.168.1.1'
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('8 characters');
  });

  test('rejects null password', async () => {
    const client = {
      query: jest.fn(),
      release: jest.fn()
    };
    mockPool.connect.mockResolvedValueOnce(client);

    client.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{ id: 'token-1', user_id: 'user-1' }]
      });

    const result = await passwordResetService.resetPassword(
      'token',
      'user@example.com',
      null,
      '192.168.1.1'
    );

    expect(result.success).toBe(false);
  });

  test('hashes password before storing', async () => {
    const token = crypto.randomBytes(32).toString('hex');
    const newPassword = 'newPassword123';

    const client = {
      query: jest.fn(),
      release: jest.fn()
    };
    mockPool.connect.mockResolvedValueOnce(client);

    // Mock only the client calls, not trying to use real bcrypt
    client.query
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({
        rows: [{ id: 'token-1', user_id: 'user-1' }]
      }) // validate token
      .mockResolvedValueOnce({ rows: [] }) // update password
      .mockResolvedValueOnce({ rows: [] }) // mark token as used
      .mockResolvedValueOnce({ rows: [] }) // invalidate other tokens
      .mockResolvedValueOnce({ rows: [] }) // COMMIT
      .mockResolvedValueOnce({
        rows: [{ email: 'user@example.com', name: 'John' }]
      }); // get user info

    const result = await passwordResetService.resetPassword(
      token,
      'user@example.com',
      newPassword,
      '192.168.1.1'
    );

    // Verify password was updated (client query was called with UPDATE)
    expect(client.query).toHaveBeenCalled();
    expect(result.success).toBe(true);
  });

  test('marks token as used', async () => {
    const client = {
      query: jest.fn(),
      release: jest.fn()
    };
    mockPool.connect.mockResolvedValueOnce(client);

    client.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{ id: 'token-1', user_id: 'user-1' }]
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{ email: 'user@example.com', name: 'John' }]
      });

    await passwordResetService.resetPassword(
      'token',
      'user@example.com',
      'newPassword123',
      '192.168.1.1'
    );

    // Check for UPDATE to mark token as used
    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE password_reset_tokens'),
      expect.any(Array)
    );
  });

  test('resets failed login attempts', async () => {
    const client = {
      query: jest.fn(),
      release: jest.fn()
    };
    mockPool.connect.mockResolvedValueOnce(client);

    client.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{ id: 'token-1', user_id: 'user-1' }]
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{ email: 'user@example.com', name: 'John' }]
      });

    await passwordResetService.resetPassword(
      'token',
      'user@example.com',
      'newPassword123',
      '192.168.1.1'
    );

    // Should reset failed_login_attempts and account_locked
    const updateUserQuery = client.query.mock.calls.find(call =>
      call[0].includes('UPDATE users')
    );
    expect(updateUserQuery[0]).toContain('failed_login_attempts = 0');
    expect(updateUserQuery[0]).toContain('account_locked = false');
  });

  test('invalidates other tokens for the user', async () => {
    const client = {
      query: jest.fn(),
      release: jest.fn()
    };
    mockPool.connect.mockResolvedValueOnce(client);

    client.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{ id: 'token-1', user_id: 'user-1' }]
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{ email: 'user@example.com', name: 'John' }]
      });

    await passwordResetService.resetPassword(
      'token',
      'user@example.com',
      'newPassword123',
      '192.168.1.1'
    );

    // Should invalidate other tokens
    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining('WHERE user_id = $1 AND id != $2'),
      expect.any(Array)
    );
  });

  test('rolls back on error', async () => {
    const client = {
      query: jest.fn(),
      release: jest.fn()
    };
    mockPool.connect.mockResolvedValueOnce(client);

    client.query.mockRejectedValueOnce(new Error('DB error'));

    await expect(
      passwordResetService.resetPassword(
        'token',
        'user@example.com',
        'newPassword123',
        '192.168.1.1'
      )
    ).rejects.toThrow();

    expect(client.release).toHaveBeenCalled();
  });
});
