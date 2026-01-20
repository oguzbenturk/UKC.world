import express from 'express';
import { body } from 'express-validator';
import { authorizeRoles } from '../middlewares/authorize.js';
import { validateInput, sanitizeInput } from '../middlewares/security.js';
import {
  createRating,
  getUnratedBookings,
  getInstructorRatings,
  getInstructorAverageRating,
  getInstructorRatingStats,
  hasRatingForBooking,
  getInstructorRatingOverview
} from '../services/ratingService.js';

const router = express.Router();

const requireStudent = authorizeRoles(['student']);
const requireInstructorOrAdmin = authorizeRoles(['instructor', 'admin', 'manager']);
const requireAdminOrManager = authorizeRoles(['admin', 'manager']);

router.post(
  '/',
  requireStudent,
  validateInput([
    body('bookingId').isUUID().withMessage('bookingId must be a valid UUID'),
    body('rating').isInt({ min: 1, max: 5 }).withMessage('rating must be between 1 and 5'),
    body('feedbackText').optional({ nullable: true }).isString().isLength({ max: 2000 }).withMessage('feedbackText must be under 2000 characters'),
    body('isAnonymous').optional({ nullable: true }).isBoolean().withMessage('isAnonymous must be boolean'),
    body('serviceType').optional({ nullable: true }).isString().isIn(['lesson', 'rental', 'accommodation', 'Lesson', 'Rental', 'Accommodation', 'LESSON', 'RENTAL', 'ACCOMMODATION']).withMessage('serviceType is not supported'),
    body('metadata').optional({ nullable: true }).isObject().withMessage('metadata must be an object')
  ]),
  sanitizeInput(['feedbackText']),
  async (req, res, next) => {
  try {
    const { bookingId, rating, feedbackText, isAnonymous, serviceType, metadata } = req.body || {};

    const result = await createRating({
      bookingId,
      studentId: req.user.id,
      rating,
      feedbackText,
      isAnonymous,
      serviceType,
      metadata
    });

    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
  }
);

router.get('/unrated', requireStudent, async (req, res, next) => {
  try {
    const limit = req.query.limit ? Number(req.query.limit) : undefined;
    const bookings = await getUnratedBookings(req.user.id, { limit });
    res.json({ bookings });
  } catch (error) {
    next(error);
  }
});

router.get('/instructor/:instructorId', requireInstructorOrAdmin, async (req, res, next) => {
  try {
    const { instructorId } = req.params;
    const requesterRole = req.user?.role;

    if (requesterRole === 'instructor' && req.user.id !== instructorId) {
      return res.status(403).json({ error: 'Instructors can only view their own ratings' });
    }

    const serviceType = req.query.serviceType;
    const limit = req.query.limit ? Number(req.query.limit) : undefined;
    const offset = req.query.offset ? Number(req.query.offset) : undefined;

    const ratings = await getInstructorRatings(instructorId, {
      serviceType,
      limit,
      offset
    });

    const summary = await getInstructorAverageRating(instructorId, { serviceType });

    res.json({ ratings, summary });
  } catch (error) {
    next(error);
  }
});

router.get('/stats/:instructorId', requireInstructorOrAdmin, async (req, res, next) => {
  try {
    const { instructorId } = req.params;
    const requesterRole = req.user?.role;

    if (requesterRole === 'instructor' && req.user.id !== instructorId) {
      return res.status(403).json({ error: 'Instructors can only view their own rating stats' });
    }

    const serviceType = req.query.serviceType;
    const stats = await getInstructorRatingStats(instructorId, { serviceType });
    res.json(stats);
  } catch (error) {
    next(error);
  }
});

router.get('/overview', requireAdminOrManager, async (req, res, next) => {
  try {
    const { serviceType, limit, offset, sortBy } = req.query;
    const instructors = await getInstructorRatingOverview({
      serviceType,
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
      sortBy
    });

    res.json({ instructors });
  } catch (error) {
    next(error);
  }
});

router.get('/bookings/:bookingId/exists', requireStudent, async (req, res, next) => {
  try {
    const { bookingId } = req.params;
    const exists = await hasRatingForBooking(bookingId);
    res.json({ bookingId, hasRating: exists });
  } catch (error) {
    next(error);
  }
});

export default router;
