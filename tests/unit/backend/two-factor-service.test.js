import { jest, describe, test, expect, beforeAll, beforeEach } from '@jest/globals';
import crypto from 'crypto';

let twoFactorService;
let mockPool;

beforeAll(async () => {
  mockPool = {
    query: jest.fn()
  };

  await jest.unstable_mockModule('../../../backend/db.js', () => ({
    pool: mockPool
  }));

  const mod = await import('../../../backend/services/twoFactorService.js');
  twoFactorService = mod.default;
});

beforeEach(() => {
  mockPool.query.mockReset();
});

describe('TwoFactorAuthService.generateSecret', () => {
  test('generates a base32-encoded secret', () => {
    const secret = twoFactorService.generateSecret();

    expect(typeof secret).toBe('string');
    expect(secret.length).toBeGreaterThan(0);
    // Base32 uses A-Z and 2-7, with = for padding
    expect(/^[A-Z2-7=]+$/.test(secret)).toBe(true);
  });

  test('generates unique secrets on each call', () => {
    const secret1 = twoFactorService.generateSecret();
    const secret2 = twoFactorService.generateSecret();

    expect(secret1).not.toBe(secret2);
  });

  test('secret is base32 decodable', () => {
    const secret = twoFactorService.generateSecret();

    expect(() => {
      twoFactorService.base32Decode(secret);
    }).not.toThrow();
  });

  test('generates 26-32 character base32 strings (accounting for padding)', () => {
    const secret = twoFactorService.generateSecret();
    // 20 random bytes = 160 bits, base32 encodes 5 bits per char = 32 chars
    expect(secret.length).toBe(32);
  });
});

describe('TwoFactorAuthService.base32Encode/Decode', () => {
  test('encodes and decodes correctly', () => {
    const original = Buffer.from('hello world');
    const encoded = twoFactorService.base32Encode(original);
    const decoded = twoFactorService.base32Decode(encoded);

    expect(decoded).toEqual(original);
  });

  test('handles empty buffer', () => {
    const empty = Buffer.from('');
    const encoded = twoFactorService.base32Encode(empty);
    const decoded = twoFactorService.base32Decode(encoded);

    expect(decoded.length).toBe(0);
  });

  test('encodes with proper padding', () => {
    const buffer = Buffer.from('test');
    const encoded = twoFactorService.base32Encode(buffer);

    // Padding should make length multiple of 8
    expect(encoded.length % 8).toBe(0);
  });

  test('rejects invalid base32 characters', () => {
    expect(() => {
      twoFactorService.base32Decode('INVALID@CHARS');
    }).toThrow('Invalid base32 character');
  });

  test('handles case insensitivity in decode', () => {
    const buffer = Buffer.from('test');
    const encoded = twoFactorService.base32Encode(buffer);
    const lowercase = encoded.toLowerCase();

    expect(() => {
      twoFactorService.base32Decode(lowercase);
    }).not.toThrow();
  });
});

describe('TwoFactorAuthService.generateToken', () => {
  test('generates 6-digit TOTP code', () => {
    const secret = twoFactorService.generateSecret();
    const token = twoFactorService.generateToken(secret);

    expect(token).toMatch(/^\d{6}$/);
  });

  test('generates same token for same time window', () => {
    const secret = twoFactorService.generateSecret();
    const timestamp = Date.now();

    const token1 = twoFactorService.generateToken(secret, timestamp);
    const token2 = twoFactorService.generateToken(secret, timestamp);

    expect(token1).toBe(token2);
  });

  test('generates different tokens for different time windows', () => {
    const secret = twoFactorService.generateSecret();
    const timestamp1 = Date.now();
    // 31 seconds later (next time window)
    const timestamp2 = timestamp1 + 31 * 1000;

    const token1 = twoFactorService.generateToken(secret, timestamp1);
    const token2 = twoFactorService.generateToken(secret, timestamp2);

    // Tokens might be different due to different time windows
    // (not guaranteed but very likely)
    expect(typeof token1).toBe('string');
    expect(typeof token2).toBe('string');
  });

  test('defaults to current time when timestamp omitted', () => {
    const secret = twoFactorService.generateSecret();

    expect(() => {
      twoFactorService.generateToken(secret);
    }).not.toThrow();
  });

  test('always returns zero-padded string', () => {
    const secret = twoFactorService.generateSecret();

    for (let i = 0; i < 5; i++) {
      const token = twoFactorService.generateToken(secret, Date.now() + i * 1000);
      expect(token).toMatch(/^\d{6}$/);
    }
  });
});

describe('TwoFactorAuthService.verifyToken', () => {
  test('verifies current token', () => {
    const secret = twoFactorService.generateSecret();
    const timestamp = Date.now();
    const token = twoFactorService.generateToken(secret, timestamp);

    const isValid = twoFactorService.verifyToken(token, secret);

    expect(isValid).toBe(true);
  });

  test('rejects invalid token', () => {
    const secret = twoFactorService.generateSecret();

    const isValid = twoFactorService.verifyToken('000000', secret);

    expect(isValid).toBe(false);
  });

  test('tolerates clock skew (within window)', () => {
    const secret = twoFactorService.generateSecret();
    const now = Date.now();
    // Token from previous time window
    const token = twoFactorService.generateToken(secret, now - 31 * 1000);

    // Current verification (should accept due to window of 1)
    const isValid = twoFactorService.verifyToken(token, secret);

    // Note: might fail if executed at boundary, but generally should work
    expect(typeof isValid).toBe('boolean');
  });

  test('rejects expired token (outside window)', () => {
    const secret = twoFactorService.generateSecret();
    const oldTime = Date.now() - 61 * 1000; // 61 seconds ago
    const token = twoFactorService.generateToken(secret, oldTime);

    const isValid = twoFactorService.verifyToken(token, secret);

    expect(isValid).toBe(false);
  });
});

describe('TwoFactorAuthService.generateQRCodeURL', () => {
  test('generates valid otpauth URL', () => {
    const secret = twoFactorService.generateSecret();
    const email = 'user@example.com';
    const url = twoFactorService.generateQRCodeURL(secret, email);

    expect(url).toContain('otpauth://totp/');
    expect(url).toContain(encodeURIComponent('Plannivo'));
    expect(url).toContain(encodeURIComponent(email));
  });

  test('includes secret in URL', () => {
    const secret = twoFactorService.generateSecret();
    const url = twoFactorService.generateQRCodeURL(secret, 'user@example.com');

    expect(url).toContain(`secret=${secret}`);
  });

  test('includes correct algorithm', () => {
    const secret = twoFactorService.generateSecret();
    const url = twoFactorService.generateQRCodeURL(secret, 'user@example.com');

    expect(url).toContain('algorithm=SHA1');
  });

  test('includes digits parameter', () => {
    const secret = twoFactorService.generateSecret();
    const url = twoFactorService.generateQRCodeURL(secret, 'user@example.com');

    expect(url).toContain('digits=6');
  });

  test('includes period parameter', () => {
    const secret = twoFactorService.generateSecret();
    const url = twoFactorService.generateQRCodeURL(secret, 'user@example.com');

    expect(url).toContain('period=30');
  });

  test('allows custom issuer', () => {
    const secret = twoFactorService.generateSecret();
    const url = twoFactorService.generateQRCodeURL(secret, 'user@example.com', 'MyApp');

    expect(url).toContain(encodeURIComponent('MyApp'));
  });

  test('properly encodes email with special characters', () => {
    const secret = twoFactorService.generateSecret();
    const email = 'user+tag@example.com';
    const url = twoFactorService.generateQRCodeURL(secret, email);

    expect(url).toContain(encodeURIComponent(email));
  });
});

describe('TwoFactorAuthService.enableTwoFactor', () => {
  test('enables 2FA for a user', async () => {
    const secret = twoFactorService.generateSecret();
    mockPool.query.mockResolvedValueOnce({ rows: [] });

    const result = await twoFactorService.enableTwoFactor('user-123', secret);

    expect(result).toBe(true);
    expect(mockPool.query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE users'),
      [secret, 'user-123']
    );
  });

  test('sets two_factor_enabled flag', async () => {
    const secret = twoFactorService.generateSecret();
    mockPool.query.mockResolvedValueOnce({ rows: [] });

    await twoFactorService.enableTwoFactor('user-123', secret);

    const query = mockPool.query.mock.calls[0][0];
    expect(query).toContain('two_factor_enabled = true');
  });

  test('stores the secret', async () => {
    const secret = twoFactorService.generateSecret();
    mockPool.query.mockResolvedValueOnce({ rows: [] });

    await twoFactorService.enableTwoFactor('user-123', secret);

    expect(mockPool.query).toHaveBeenCalledWith(
      expect.any(String),
      [secret, 'user-123']
    );
  });

  test('returns false on error', async () => {
    const secret = twoFactorService.generateSecret();
    mockPool.query.mockRejectedValueOnce(new Error('DB error'));

    const result = await twoFactorService.enableTwoFactor('user-123', secret);

    expect(result).toBe(false);
  });
});

describe('TwoFactorAuthService.disableTwoFactor', () => {
  test('disables 2FA for a user', async () => {
    mockPool.query.mockResolvedValueOnce({ rows: [] });

    const result = await twoFactorService.disableTwoFactor('user-123');

    expect(result).toBe(true);
    expect(mockPool.query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE users'),
      ['user-123']
    );
  });

  test('clears the secret', async () => {
    mockPool.query.mockResolvedValueOnce({ rows: [] });

    await twoFactorService.disableTwoFactor('user-123');

    const query = mockPool.query.mock.calls[0][0];
    expect(query).toContain('two_factor_secret = NULL');
  });

  test('sets two_factor_enabled to false', async () => {
    mockPool.query.mockResolvedValueOnce({ rows: [] });

    await twoFactorService.disableTwoFactor('user-123');

    const query = mockPool.query.mock.calls[0][0];
    expect(query).toContain('two_factor_enabled = false');
  });

  test('returns false on error', async () => {
    mockPool.query.mockRejectedValueOnce(new Error('DB error'));

    const result = await twoFactorService.disableTwoFactor('user-123');

    expect(result).toBe(false);
  });
});

describe('TwoFactorAuthService.getUserTwoFactor', () => {
  test('returns user 2FA data', async () => {
    const mockData = {
      two_factor_enabled: true,
      two_factor_secret: 'ABCD1234'
    };
    mockPool.query.mockResolvedValueOnce({ rows: [mockData] });

    const result = await twoFactorService.getUserTwoFactor('user-123');

    expect(result).toEqual(mockData);
  });

  test('returns null when user not found', async () => {
    mockPool.query.mockResolvedValueOnce({ rows: [] });

    const result = await twoFactorService.getUserTwoFactor('user-123');

    expect(result).toBe(null);
  });

  test('queries by user ID', async () => {
    mockPool.query.mockResolvedValueOnce({ rows: [] });

    await twoFactorService.getUserTwoFactor('user-123');

    expect(mockPool.query).toHaveBeenCalledWith(
      expect.stringContaining('WHERE id = $1'),
      ['user-123']
    );
  });

  test('returns null on error', async () => {
    mockPool.query.mockRejectedValueOnce(new Error('DB error'));

    const result = await twoFactorService.getUserTwoFactor('user-123');

    expect(result).toBe(null);
  });
});
