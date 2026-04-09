import express from 'express';
import { authorizeRoles } from '../middlewares/authorize.js';
import { authenticateJWT } from './auth.js';
import { pool } from '../db.js';
import {
  getInstructorStudents,
  getInstructorDashboard,
  getInstructorStudentProfile,
  updateInstructorStudentProfile,
  addInstructorStudentProgress,
  removeInstructorStudentProgress,
  createStudentRecommendation,
  deleteStudentRecommendation
} from '../services/instructorService.js';
import {
  listInstructorNotes,
  createInstructorNote,
  updateInstructorNote,
  deleteInstructorNote
} from '../services/instructorNotesService.js';

const router = express.Router();

router.get('/me/students', authorizeRoles(['instructor', 'manager']), async (req, res, next) => {
  try {
    const data = await getInstructorStudents(req.user.id);
    res.json(data);
  } catch (err) { next(err); }
});

router.get('/me/students/:studentId/profile', authorizeRoles(['instructor', 'manager']), async (req, res, next) => {
  try {
    const data = await getInstructorStudentProfile(req.user.id, req.params.studentId);
    res.json(data);
  } catch (err) { next(err); }
});

router.patch('/me/students/:studentId/profile', authorizeRoles(['instructor', 'manager']), async (req, res, next) => {
  try {
    const updated = await updateInstructorStudentProfile(req.user.id, req.params.studentId, req.body || {});
    res.json(updated);
  } catch (err) { next(err); }
});

router.post('/me/students/:studentId/progress', authorizeRoles(['instructor', 'manager']), async (req, res, next) => {
  try {
    const created = await addInstructorStudentProgress(req.user.id, req.params.studentId, req.body || {});
    res.status(201).json(created);
  } catch (err) { next(err); }
});

router.delete('/me/students/:studentId/progress/:progressId', authorizeRoles(['instructor', 'manager']), async (req, res, next) => {
  try {
    await removeInstructorStudentProgress(req.user.id, req.params.studentId, req.params.progressId);
    res.status(204).send();
  } catch (err) { next(err); }
});

router.get('/me/students/:studentId/notes', authorizeRoles(['instructor', 'manager']), async (req, res, next) => {
  try {
    const notes = await listInstructorNotes(req.user.id, req.params.studentId, {
      includePrivate: req.query.includePrivate === 'true' || req.query.includePrivate === '1',
      limit: req.query.limit,
      offset: req.query.offset
    });
    res.json({ notes });
  } catch (err) {
    next(err);
  }
});

router.post('/me/students/:studentId/notes', authorizeRoles(['instructor', 'manager']), async (req, res, next) => {
  try {
    const payload = req.body || {};
    const note = await createInstructorNote(req.user.id, req.params.studentId, {
      bookingId: payload.bookingId,
      note: payload.note,
      visibility: payload.visibility,
      isPinned: payload.isPinned,
      metadata: payload.metadata
    });
    res.status(201).json(note);
  } catch (err) {
    next(err);
  }
});

router.put('/me/notes/:noteId', authorizeRoles(['instructor', 'manager']), async (req, res, next) => {
  try {
    const note = await updateInstructorNote(req.user.id, req.params.noteId, req.body || {});
    res.json(note);
  } catch (err) {
    next(err);
  }
});

router.delete('/me/notes/:noteId', authorizeRoles(['instructor', 'manager']), async (req, res, next) => {
  try {
    await deleteInstructorNote(req.user.id, req.params.noteId);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

router.post('/me/students/:studentId/recommendations', authorizeRoles(['instructor', 'manager']), async (req, res, next) => {
  try {
    const rec = await createStudentRecommendation(req.user.id, req.params.studentId, req.body || {});
    res.status(201).json(rec);
  } catch (err) { next(err); }
});

router.delete('/me/students/:studentId/recommendations/:recId', authorizeRoles(['instructor', 'manager']), async (req, res, next) => {
  try {
    await deleteStudentRecommendation(req.user.id, req.params.studentId, req.params.recId);
    res.status(204).send();
  } catch (err) { next(err); }
});

router.get('/me/dashboard', authorizeRoles(['instructor', 'manager']), async (req, res, next) => {
  try {
    const data = await getInstructorDashboard(req.user.id);
    res.json(data);
  } catch (err) { next(err); }
});

// Instructor preferences (table: instructor_preferences)
router.get('/me/preferences', authenticateJWT, authorizeRoles(['instructor', 'manager', 'admin']), async (req, res, next) => {
  try {
    const result = await pool.query(
      'SELECT * FROM instructor_preferences WHERE user_id = $1',
      [req.user.id]
    );
    res.json(result.rows[0] || {});
  } catch (error) {
    next(error);
  }
});

router.put('/me/preferences', authenticateJWT, authorizeRoles(['instructor', 'manager', 'admin']), async (req, res, next) => {
  try {
    const {
      max_group_size,
      preferred_durations,
      teaching_languages,
      auto_accept_bookings,
      note_template
    } = req.body;

    const result = await pool.query(`
      INSERT INTO instructor_preferences (
        user_id, max_group_size, preferred_durations, teaching_languages,
        auto_accept_bookings, note_template, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, NOW())
      ON CONFLICT (user_id) DO UPDATE SET
        max_group_size = EXCLUDED.max_group_size,
        preferred_durations = EXCLUDED.preferred_durations,
        teaching_languages = EXCLUDED.teaching_languages,
        auto_accept_bookings = EXCLUDED.auto_accept_bookings,
        note_template = EXCLUDED.note_template,
        updated_at = NOW()
      RETURNING *
    `, [
      req.user.id,
      max_group_size ?? 4,
      preferred_durations || [],
      teaching_languages || [],
      auto_accept_bookings ?? false,
      note_template || null
    ]);

    res.json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

// Instructor weekly working hours (table: instructor_working_hours)
router.get('/me/working-hours', authenticateJWT, authorizeRoles(['instructor', 'manager', 'admin']), async (req, res, next) => {
  try {
    const result = await pool.query(
      'SELECT * FROM instructor_working_hours WHERE instructor_id = $1 ORDER BY day_of_week',
      [req.user.id]
    );
    res.json(result.rows);
  } catch (error) {
    next(error);
  }
});

router.put('/me/working-hours', authenticateJWT, authorizeRoles(['instructor', 'manager', 'admin']), async (req, res, next) => {
  try {
    // Expects array of { day_of_week, is_working, start_time, end_time }
    const days = req.body;
    if (!Array.isArray(days)) {
      return res.status(400).json({ error: 'Body must be an array of working hour entries' });
    }

    const results = [];
    for (const day of days) {
      const { day_of_week, is_working, start_time, end_time } = day;
      const result = await pool.query(`
        INSERT INTO instructor_working_hours (
          instructor_id, day_of_week, is_working, start_time, end_time, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, NOW())
        ON CONFLICT (instructor_id, day_of_week) DO UPDATE SET
          is_working = EXCLUDED.is_working,
          start_time = EXCLUDED.start_time,
          end_time = EXCLUDED.end_time,
          updated_at = NOW()
        RETURNING *
      `, [
        req.user.id,
        day_of_week,
        is_working ?? true,
        start_time || '09:00',
        end_time || '17:00'
      ]);
      results.push(result.rows[0]);
    }

    res.json(results);
  } catch (error) {
    next(error);
  }
});

export default router;
