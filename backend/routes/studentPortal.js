import express from 'express';
import { authorizeRoles } from '../middlewares/authorize.js';
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

const requireStudent = authorizeRoles(['student']);

router.get('/dashboard', requireStudent, async (req, res, next) => {
  try {
    const overview = await getStudentOverview(req.user.id, { fallbackUser: req.user });
    res.json(overview);
  } catch (error) {
    next(error);
  }
});

router.get('/schedule', requireStudent, async (req, res, next) => {
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

router.patch('/bookings/:bookingId', requireStudent, async (req, res, next) => {
  try {
    const result = await updateStudentBooking(req.user.id, req.params.bookingId, req.body || {});
    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.get('/courses', requireStudent, async (req, res, next) => {
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

router.get('/invoices', requireStudent, async (req, res, next) => {
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

router.post('/support/request', requireStudent, async (req, res, next) => {
  try {
    const ticket = await createStudentSupportRequest(req.user.id, req.body || {});
    res.status(201).json(ticket);
  } catch (error) {
    next(error);
  }
});

router.get('/profile', requireStudent, async (req, res, next) => {
  try {
    const overview = await getStudentOverview(req.user.id, { fallbackUser: req.user });
    res.json(overview.student);
  } catch (error) {
    next(error);
  }
});

router.put('/profile', requireStudent, async (req, res, next) => {
  try {
    const profile = await updateStudentProfile(req.user.id, req.body || {});
    res.json(profile);
  } catch (error) {
    next(error);
  }
});

router.get('/preferences', requireStudent, async (req, res, next) => {
  try {
    const preferences = await getStudentPreferences(req.user.id);
    res.json(preferences);
  } catch (error) {
    next(error);
  }
});

router.put('/preferences', requireStudent, async (req, res, next) => {
  try {
    const settings = await updateStudentNotificationSettings(req.user.id, req.body || {});
    res.json(settings);
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
