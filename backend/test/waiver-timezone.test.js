import { jest } from '@jest/globals';
import { checkWaiverStatus } from '../services/waiverService.js';
import { pool } from '../db.js';

describe('Waiver timestamp timezone handling', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it('computes daysSinceSigned correctly for offset timestamps', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2025-10-12T03:30:01.000Z'));

    const querySpy = jest.spyOn(pool, 'query').mockImplementation((sql) => {
      if (sql.includes('FROM liability_waivers') && sql.includes('ORDER BY signed_at DESC')) {
        return Promise.resolve({
          rows: [
            {
              id: 'waiver-123',
              user_id: 'user-123',
              family_member_id: null,
              signer_user_id: 'user-123',
              waiver_version: '1.0',
              language_code: 'en',
              signature_image_url: '/uploads/signatures/mock.png',
              ip_address: '203.0.113.10',
              agreed_to_terms: true,
              photo_consent: false,
              signed_at: '2025-10-10T23:30:00-04:00',
              created_at: '2025-10-10T23:35:00-04:00'
            }
          ]
        });
      }

      if (sql.includes('FROM waiver_versions')) {
        return Promise.resolve({ rows: [{ version_number: '1.0' }] });
      }

      return Promise.resolve({ rows: [] });
    });

    const status = await checkWaiverStatus('user-123', 'user');

    expect(status.hasSigned).toBe(true);
    expect(status.needsToSign).toBe(false);
    expect(status.isExpired).toBe(false);
    expect(status.daysSinceSigned).toBe(1);
    expect(new Date(status.lastSigned).toISOString()).toBe('2025-10-11T03:30:00.000Z');

    expect(querySpy).toHaveBeenCalled();
  });
});
