import { jest, describe, beforeAll, afterEach, test, expect } from '@jest/globals';

let ratingService;
let pool;

const instructorId = '11111111-1111-1111-1111-111111111111';

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
    ratingService = await import('../services/ratingService.js');
  });

  const db = await import('../db.js');
  pool = db.pool;
});

afterEach(() => {
  jest.clearAllMocks();
});

describe('ratingService.getInstructorRatings', () => {
  test('applies service filter and maps anonymous students', async () => {
    pool.query.mockResolvedValueOnce({
      rows: [
        {
          id: 'rate-1',
          booking_id: 'b-1',
          student_id: 'stu-1',
          service_type: 'rental',
          rating: 4,
          feedback_text: 'Nice session',
          is_anonymous: true,
          metadata: { level: 'advanced' },
          created_at: '2025-09-01T10:00:00.000Z',
          updated_at: '2025-09-02T10:00:00.000Z',
          student_name: 'Real Name'
        }
      ]
    });

    const result = await ratingService.getInstructorRatings(instructorId, {
      serviceType: 'Rental',
      limit: 10,
      offset: 5
    });

    expect(pool.query).toHaveBeenCalledTimes(1);
    const [, params] = pool.query.mock.calls[0];
    expect(params).toEqual([
      instructorId,
      'rental',
      10,
      5
    ]);

    expect(result).toEqual([
      expect.objectContaining({
        id: 'rate-1',
        bookingId: 'b-1',
        studentId: 'stu-1',
        studentName: 'Anonymous student',
        serviceType: 'rental',
        rating: 4,
        feedbackText: 'Nice session',
        isAnonymous: true,
        metadata: { level: 'advanced' },
        createdAt: '2025-09-01T10:00:00.000Z',
        updatedAt: '2025-09-02T10:00:00.000Z'
      })
    ]);
  });
});

describe('ratingService.getInstructorRatingOverview', () => {
  test('aggregates distribution and breakdown', async () => {
    pool.query.mockResolvedValueOnce({
      rows: [
        {
          instructor_id: instructorId,
          instructor_name: '  Jane Doe  ',
          instructor_avatar: 'https://cdn/avatar.png',
          total_ratings: '15',
          average_rating: '4.80',
          last_rating_at: '2025-09-05T12:34:56.000Z',
          stars_5: '10',
          stars_4: '3',
          stars_3: '2',
          stars_2: '0',
          stars_1: '0',
          lesson_ratings: '9',
          lesson_average: '4.9',
          rental_ratings: '4',
          rental_average: '4.4',
          accommodation_ratings: '2',
          accommodation_average: '4.7'
        }
      ]
    });

    const payload = {
      serviceType: 'lesson',
      limit: 25,
      offset: 4,
      sortBy: 'count'
    };

    const rows = await ratingService.getInstructorRatingOverview(payload);

    expect(pool.query).toHaveBeenCalledTimes(1);
    const [, params] = pool.query.mock.calls[0];
    expect(params).toEqual(['lesson', 25, 4]);

    expect(rows).toEqual([
      {
        instructorId,
        instructorName: 'Jane Doe',
        instructorAvatar: 'https://cdn/avatar.png',
        averageRating: 4.8,
        totalRatings: 15,
        lastRatingAt: '2025-09-05T12:34:56.000Z',
        distribution: { 5: 10, 4: 3, 3: 2, 2: 0, 1: 0 },
        breakdown: {
          lesson: { count: 9, average: 4.9 },
          rental: { count: 4, average: 4.4 },
          accommodation: { count: 2, average: 4.7 }
        }
      }
    ]);
  });
});
