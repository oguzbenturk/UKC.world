import { jest, describe, beforeAll, afterEach, test, expect } from '@jest/globals';

let bookingNotificationService;
let pool;
let dispatcherMock;
let metricsMock;

const createDispatcherMock = () => ({
  enqueue: jest.fn(),
  enqueueMany: jest.fn(),
  releaseIdempotencyKey: jest.fn(),
  awaitIdle: jest.fn(),
  clearCaches: jest.fn()
});

const createMetricsMock = () => ({
  recordQueued: jest.fn(),
  recordProcessed: jest.fn(),
  recordFailed: jest.fn(),
  recordRetry: jest.fn(),
  recordRetryScheduled: jest.fn(),
  recordDeduplicated: jest.fn(),
  recordDropped: jest.fn(),
  updateQueueDepth: jest.fn(),
  updateActiveJobs: jest.fn(),
  reset: jest.fn(),
  logSnapshot: jest.fn()
});

beforeAll(async () => {
  dispatcherMock = createDispatcherMock();
  metricsMock = createMetricsMock();

  await jest.unstable_mockModule('../services/notificationDispatcher.js', () => ({
    default: dispatcherMock,
    notificationDispatcher: dispatcherMock
  }));

  await jest.unstable_mockModule('../services/metrics/notificationMetrics.js', () => ({
    default: metricsMock,
    notificationMetrics: metricsMock
  }));

  await jest.unstable_mockModule('../db.js', () => ({
    pool: {
      connect: jest.fn(),
      query: jest.fn()
    }
  }));

  await jest.isolateModulesAsync(async () => {
    const module = await import('../services/bookingNotificationService.js');
    bookingNotificationService = module.default;
  });

  ({ pool } = await import('../db.js'));
});

afterEach(() => {
  jest.clearAllMocks();
  // Ensure subsequent tests operate on the same dispatcher mock instance
  bookingNotificationService.configureQueue({ enabled: false, dispatcher: dispatcherMock });
});

describe('bookingNotificationService queue integration', () => {
  test('enqueues lesson completion job when queue is enabled', async () => {
    const bookingId = 'book-queue-1';

    bookingNotificationService.configureQueue({ enabled: true, dispatcher: dispatcherMock });

    await bookingNotificationService.sendLessonCompleted({ bookingId });

    expect(dispatcherMock.enqueue).toHaveBeenCalledTimes(1);
    const job = dispatcherMock.enqueue.mock.calls[0][0];
    expect(job).toMatchObject({
      meta: { type: 'lesson-completed', bookingIds: [bookingId] },
      idempotencyKey: `lesson-completed:${bookingId}`,
      tenantKey: `booking:${bookingId}`
    });
    expect(typeof job.execute).toBe('function');
  });
});

describe('bookingNotificationService immediate execution', () => {
  test('writes student completion notification payload when executed immediately', async () => {
    const bookingId = 'book-immediate-1';
    const clientRelease = jest.fn();
    const insertPayloads = [];

    const queryMock = jest.fn(async (sql, params) => {
      if (sql.includes('FROM bookings')) {
        expect(params).toEqual([[bookingId]]);
        return {
          rows: [
            {
              id: bookingId,
              date: '2025-02-15',
              start_hour: 10,
              duration: 1.5,
              status: 'completed',
              service_id: 'service-1',
              customer_package_id: null,
              student_id: 'student-1',
              student_name: 'Sam Student',
              instructor_id: 'instructor-1',
              instructor_name: 'Ivy Instructor',
              service_name: 'Private Lesson',
              package_name: null
            }
          ]
        };
      }

      if (sql.includes('FROM booking_participants')) {
        expect(params).toEqual([[bookingId]]);
        return {
          rows: [
            { booking_id: bookingId, user_id: 'student-1', is_primary: true, name: 'Sam Student' }
          ]
        };
      }

      if (sql.startsWith('DELETE FROM notifications')) {
        return { rowCount: 1 };
      }

      if (sql.includes('INSERT INTO notifications')) {
        insertPayloads.push({
          userId: params[0],
          title: params[1],
          message: params[2],
          type: params[3],
          data: JSON.parse(params[4]),
          status: params[5],
          idempotencyKey: params[6]
        });
        return { rowCount: 1, rows: [{ id: `notif-${params[6] ?? Date.now()}` }] };
      }

      throw new Error(`Unexpected query: ${sql}`);
    });

    pool.connect.mockResolvedValueOnce({
      query: queryMock,
      release: clientRelease
    });

    await bookingNotificationService.sendLessonCompleted({ bookingId, immediate: true });

    expect(dispatcherMock.enqueue).not.toHaveBeenCalled();
    expect(pool.connect).toHaveBeenCalledTimes(1);
    expect(clientRelease).toHaveBeenCalled();

    expect(queryMock).toHaveBeenCalledWith(
      expect.stringContaining('DELETE FROM notifications'),
      ['student-1', bookingId]
    );

    const insertCall = insertPayloads[0];
    expect(insertCall).toBeDefined();
    expect(insertCall.userId).toBe('student-1');
    expect(insertCall.title).toBe('Lesson checked out');
    expect(insertCall.type).toBe('booking_completed_student');
    expect(insertCall.data.intent).toBe('rate_lesson');
    expect(insertCall.data.cta).toMatchObject({
      label: 'Rate your instructor',
      href: `/student/dashboard?rateBooking=${bookingId}`
    });
    expect(insertCall.data.ratingContext).toMatchObject({ bookingId });
    expect(insertCall.idempotencyKey).toBe(`lesson-completed:${bookingId}:student:student-1`);
  });

  test('batch completion fetches booking contexts once for multiple bookings', async () => {
    const bookingIds = ['book-batch-1', 'book-batch-2'];
    const clientRelease = jest.fn();
    const insertPayloads = [];

    const queryMock = jest.fn(async (sql, params) => {
      if (sql.includes('FROM bookings')) {
        expect(params).toEqual([bookingIds]);
        return {
          rows: [
            {
              id: bookingIds[0],
              date: '2025-03-01',
              start_hour: 9,
              duration: 1,
              status: 'completed',
              service_id: 'service-1',
              customer_package_id: null,
              student_id: 'student-a',
              student_name: 'Alex Student',
              instructor_id: 'instructor-1',
              instructor_name: 'Casey Coach',
              service_name: 'Group Lesson',
              package_name: null
            },
            {
              id: bookingIds[1],
              date: '2025-03-02',
              start_hour: 14,
              duration: 0.5,
              status: 'completed',
              service_id: 'service-2',
              customer_package_id: null,
              student_id: 'student-b',
              student_name: 'Blair Student',
              instructor_id: 'instructor-2',
              instructor_name: 'Taylor Trainer',
              service_name: 'Workshop',
              package_name: 'Spring Pack'
            }
          ]
        };
      }

      if (sql.includes('FROM booking_participants')) {
        expect(params).toEqual([bookingIds]);
        return {
          rows: [
            {
              booking_id: bookingIds[0],
              user_id: 'student-a',
              is_primary: true,
              name: 'Alex Student'
            },
            {
              booking_id: bookingIds[1],
              user_id: 'student-b',
              is_primary: true,
              name: 'Blair Student'
            }
          ]
        };
      }

      if (sql.startsWith('DELETE FROM notifications')) {
        return { rowCount: 1 };
      }

      if (sql.includes('INSERT INTO notifications')) {
        insertPayloads.push({
          userId: params[0],
          title: params[1],
          message: params[2],
          type: params[3],
          data: JSON.parse(params[4]),
          status: params[5],
          idempotencyKey: params[6]
        });
        return { rowCount: 1, rows: [{ id: `notif-${params[6] ?? Date.now()}` }] };
      }

      throw new Error(`Unexpected query: ${sql}`);
    });

    pool.connect.mockResolvedValueOnce({
      query: queryMock,
      release: clientRelease
    });

    await bookingNotificationService.sendLessonCompletedBatch({ bookingIds, immediate: true });

    expect(dispatcherMock.enqueue).not.toHaveBeenCalled();
    expect(pool.connect).toHaveBeenCalledTimes(1);
    expect(clientRelease).toHaveBeenCalled();

    const bookingSelectCalls = queryMock.mock.calls.filter(([sql]) => sql.includes('FROM bookings'));
    expect(bookingSelectCalls).toHaveLength(1);

    const participantSelectCalls = queryMock.mock.calls.filter(([sql]) =>
      sql.includes('FROM booking_participants')
    );
    expect(participantSelectCalls).toHaveLength(1);

    const deleteCalls = queryMock.mock.calls.filter(([sql]) =>
      sql.startsWith('DELETE FROM notifications')
    );
    expect(deleteCalls).toHaveLength(2);

    expect(insertPayloads).toHaveLength(2);
    const insertedIds = insertPayloads.map((payload) => payload.data.bookingId).sort();
    expect(insertedIds).toEqual([...bookingIds].sort());
    expect(insertPayloads.map((payload) => payload.idempotencyKey).sort()).toEqual(
      insertPayloads
        .map((payload) => `lesson-completed:${payload.data.bookingId}:student:${payload.data.student.id}`)
        .sort()
    );
  });
});
