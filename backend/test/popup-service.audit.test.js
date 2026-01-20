import { jest, describe, beforeAll, afterEach, test, expect } from '@jest/globals';

let popupService;
let pool;

const actorId = '00000000-0000-0000-0000-000000000001';
const userId = '00000000-0000-0000-0000-000000000002';

beforeAll(async () => {
  await jest.unstable_mockModule('../db.js', () => ({
    pool: {
      query: jest.fn(),
      connect: jest.fn(async () => ({
        query: jest.fn(),
        release: jest.fn()
      }))
    }
  }));

  await jest.isolateModulesAsync(async () => {
    popupService = (await import('../services/popupService.js')).default;
  });

  const db = await import('../db.js');
  pool = db.pool;
});

afterEach(() => {
  jest.clearAllMocks();
});

describe('popupService audit trail stamping', () => {
  test('recordUserInteraction stores created_by for the acting user', async () => {
    pool.query.mockResolvedValue({ rows: [{ id: 42 }] });
    const analyticsSpy = jest.spyOn(popupService, 'updatePopupAnalytics').mockResolvedValue(undefined);

    const interactionData = { sessionId: 'sess-123', pageUrl: '/dashboard' };

    await popupService.recordUserInteraction(15, userId, 'viewed', interactionData, 1, actorId);

    expect(pool.query).toHaveBeenCalledTimes(1);
    const [query, params] = pool.query.mock.calls[0];
    expect(query).toContain('INSERT INTO popup_user_interactions');
    expect(query).toContain('created_by');
    expect(params[params.length - 1]).toBe(actorId);

    analyticsSpy.mockRestore();
  });

  test('trackPopupEvent stores created_by when stamping events', async () => {
    pool.query.mockResolvedValue({ rows: [{ id: 7 }] });

    await popupService.trackPopupEvent(22, userId, 'view', { foo: 'bar' }, actorId);

    expect(pool.query).toHaveBeenCalledTimes(1);
    const [query, params] = pool.query.mock.calls[0];
    expect(query).toContain('INSERT INTO popup_user_interactions');
    expect(query).toContain('created_by');
    expect(params[params.length - 1]).toBe(actorId);
  });
});
