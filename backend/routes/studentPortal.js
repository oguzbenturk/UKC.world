import express from 'express';
import { authorizeRoles } from '../middlewares/authorize.js';
import { pool } from '../db.js';
import { cacheMiddleware, cacheInvalidationMiddleware } from '../middlewares/cache.js';
import {
  getStudentOverview,
  getStudentSchedule,
  updateStudentBooking,
  getStudentCourses,
  getStudentResources,
  getStudentInvoices,
  createStudentSupportRequest,
  getStudentPreferences,
  updateStudentProfile,
  updateStudentNotificationSettings,
  getStudentRecommendations
} from '../services/studentPortalService.js';

const router = express.Router();

const requireStudent = authorizeRoles(['student', 'trusted_customer', 'outsider']);

const studentKey = (suffix) => (req) =>
  `api:student:${req.user?.id}:${typeof suffix === 'function' ? suffix(req) : suffix}`;
const studentInvalidate = [(req) => `api:student:${req.user?.id}:*`];

router.get('/dashboard', requireStudent, cacheMiddleware(60, studentKey('dashboard')), async (req, res, next) => {
  try {
    const overview = await getStudentOverview(req.user.id, { fallbackUser: req.user });
    res.json(overview);
  } catch (error) {
    next(error);
  }
});

router.get('/schedule', requireStudent, cacheMiddleware(60, studentKey(req => `schedule:${req.query.startDate || 'all'}:${req.query.endDate || 'all'}`)), async (req, res, next) => {
  try {
    const schedule = await getStudentSchedule(req.user.id, {
      startDate: req.query.startDate,
      endDate: req.query.endDate,
      limit: req.query.limit ? Number(req.query.limit) : undefined
    });
    res.json(schedule);
  } catch (error) {
    next(error);
  }
});

router.patch('/bookings/:bookingId', requireStudent, cacheInvalidationMiddleware(studentInvalidate), async (req, res, next) => {
  try {
    const result = await updateStudentBooking(req.user.id, req.params.bookingId, req.body || {});
    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.get('/courses', requireStudent, cacheMiddleware(300, studentKey('courses')), async (req, res, next) => {
  try {
    const courses = await getStudentCourses(req.user.id);
    res.json(courses);
  } catch (error) {
    next(error);
  }
});

router.get('/resources/:courseId', requireStudent, async (req, res, next) => {
  try {
    const resources = await getStudentResources(req.user.id, req.params.courseId);
    res.json(resources);
  } catch (error) {
    next(error);
  }
});

router.get('/invoices', requireStudent, cacheMiddleware(120, studentKey(req => `invoices:${req.query.page || 1}`)), async (req, res, next) => {
  try {
    const invoices = await getStudentInvoices(req.user.id, {
      page: req.query.page ? Number(req.query.page) : undefined,
      limit: req.query.limit ? Number(req.query.limit) : undefined
    });
    res.json(invoices);
  } catch (error) {
    next(error);
  }
});

router.post('/support/request', requireStudent, cacheInvalidationMiddleware(studentInvalidate), async (req, res, next) => {
  try {
    const ticket = await createStudentSupportRequest(req.user.id, req.body || {});
    res.status(201).json(ticket);
  } catch (error) {
    next(error);
  }
});

router.get('/profile', requireStudent, cacheMiddleware(300, studentKey('profile')), async (req, res, next) => {
  try {
    const overview = await getStudentOverview(req.user.id, { fallbackUser: req.user });
    res.json(overview.student);
  } catch (error) {
    next(error);
  }
});

router.put('/profile', requireStudent, cacheInvalidationMiddleware(studentInvalidate), async (req, res, next) => {
  try {
    const profile = await updateStudentProfile(req.user.id, req.body || {});
    res.json(profile);
  } catch (error) {
    next(error);
  }
});

router.get('/preferences', requireStudent, cacheMiddleware(300, studentKey('preferences')), async (req, res, next) => {
  try {
    const preferences = await getStudentPreferences(req.user.id);
    res.json(preferences);
  } catch (error) {
    next(error);
  }
});

router.put('/preferences', requireStudent, cacheInvalidationMiddleware(studentInvalidate), async (req, res, next) => {
  try {
    const settings = await updateStudentNotificationSettings(req.user.id, req.body || {});
    res.json(settings);
  } catch (error) {
    next(error);
  }
});

// Student booking preferences (new table: student_preferences)
router.get('/booking-preferences', requireStudent, cacheMiddleware(300, studentKey('booking-preferences')), async (req, res, next) => {
  try {
    const result = await pool.query(
      'SELECT * FROM student_preferences WHERE user_id = $1',
      [req.user.id]
    );
    res.json(result.rows[0] || {});
  } catch (error) {
    next(error);
  }
});

router.put('/booking-preferences', requireStudent, cacheInvalidationMiddleware(studentInvalidate), async (req, res, next) => {
  try {
    const {
      preferred_discipline,
      preferred_lesson_type,
      preferred_duration,
      preferred_time_slot,
      preferred_instructor_id,
      preferred_lesson_languages,
      auto_assign_instructor,
      pay_at_center_default
    } = req.body;

    const result = await pool.query(`
      INSERT INTO student_preferences (
        user_id, preferred_discipline, preferred_lesson_type, preferred_duration,
        preferred_time_slot, preferred_instructor_id, preferred_lesson_languages,
        auto_assign_instructor, pay_at_center_default, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
      ON CONFLICT (user_id) DO UPDATE SET
        preferred_discipline = EXCLUDED.preferred_discipline,
        preferred_lesson_type = EXCLUDED.preferred_lesson_type,
        preferred_duration = EXCLUDED.preferred_duration,
        preferred_time_slot = EXCLUDED.preferred_time_slot,
        preferred_instructor_id = EXCLUDED.preferred_instructor_id,
        preferred_lesson_languages = EXCLUDED.preferred_lesson_languages,
        auto_assign_instructor = EXCLUDED.auto_assign_instructor,
        pay_at_center_default = EXCLUDED.pay_at_center_default,
        updated_at = NOW()
      RETURNING *
    `, [
      req.user.id,
      preferred_discipline || null,
      preferred_lesson_type || null,
      preferred_duration || null,
      preferred_time_slot || null,
      preferred_instructor_id || null,
      preferred_lesson_languages || [],
      auto_assign_instructor ?? false,
      pay_at_center_default ?? false
    ]);

    res.json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

// Student safety info (new table: student_safety_info)
router.get('/safety', requireStudent, async (req, res, next) => {
  try {
    const result = await pool.query(
      'SELECT * FROM student_safety_info WHERE user_id = $1',
      [req.user.id]
    );
    res.json(result.rows[0] || {});
  } catch (error) {
    next(error);
  }
});

router.put('/safety', requireStudent, async (req, res, next) => {
  try {
    const {
      emergency_contact_name,
      emergency_contact_phone,
      emergency_contact_relationship,
      medical_notes,
      swimming_ability
    } = req.body;

    const result = await pool.query(`
      INSERT INTO student_safety_info (
        user_id, emergency_contact_name, emergency_contact_phone,
        emergency_contact_relationship, medical_notes, swimming_ability, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, NOW())
      ON CONFLICT (user_id) DO UPDATE SET
        emergency_contact_name = EXCLUDED.emergency_contact_name,
        emergency_contact_phone = EXCLUDED.emergency_contact_phone,
        emergency_contact_relationship = EXCLUDED.emergency_contact_relationship,
        medical_notes = EXCLUDED.medical_notes,
        swimming_ability = EXCLUDED.swimming_ability,
        updated_at = NOW()
      RETURNING *
    `, [
      req.user.id,
      emergency_contact_name || null,
      emergency_contact_phone || null,
      emergency_contact_relationship || null,
      medical_notes || null,
      swimming_ability || null
    ]);

    res.json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

router.get('/recommendations', requireStudent, async (req, res, next) => {
  try {
    const recommendations = await getStudentRecommendations(req.user.id);
    res.json(recommendations);
  } catch (error) {
    next(error);
  }
});

export default router;
