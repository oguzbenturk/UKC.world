import { jest } from '@jest/globals';

const mockConnect = jest.fn();

jest.unstable_mockModule('../db.js', () => ({
  pool: {
    connect: mockConnect
  }
}));

const warnSpy = jest.fn();
const infoSpy = jest.fn();
const errorSpy = jest.fn();
const debugSpy = jest.fn();

jest.unstable_mockModule('../middlewares/errorHandler.js', () => ({
  logger: {
    warn: warnSpy,
    info: infoSpy,
    error: errorSpy,
    debug: debugSpy
  },
  NotFoundError: class NotFoundError extends Error {}
}));

const { getStudentOverview } = await import('../services/studentPortalService.js');

describe('getStudentOverview fallback behaviour', () => {
  beforeEach(() => {
    mockConnect.mockReset();
    warnSpy.mockReset();
    infoSpy.mockReset();
    errorSpy.mockReset();
    debugSpy.mockReset();
  });

  test('returns a fallback overview when database host cannot be resolved', async () => {
    const connectionError = new Error('getaddrinfo ENOTFOUND db');
    connectionError.code = 'ENOTFOUND';

    mockConnect.mockRejectedValueOnce(connectionError);

    const fallbackUser = {
      id: '00ce21b8-d345-43ac-9ae8-215e0755e15b',
      firstName: 'Bugra',
      lastName: 'Benturk',
      email: 'bugrabenturk@gmail.com'
    };

    const result = await getStudentOverview(fallbackUser.id, { fallbackUser });

    expect(mockConnect).toHaveBeenCalledTimes(1);
    expect(result.student.id).toBe(fallbackUser.id);
    expect(result.student.name).toBe('Bugra Benturk');
    expect(result.metrics.totalHours).toBe(0);
    expect(result.payments).toEqual([]);
    expect(warnSpy).toHaveBeenCalledWith(
      'Unable to acquire DB connection for student overview, returning fallback',
      expect.objectContaining({
        code: 'ENOTFOUND',
        studentId: fallbackUser.id
      })
    );
  });
});
