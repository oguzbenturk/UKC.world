import express from 'express';
import { authorizeRoles } from '../middlewares/authorize.js';
import {
  getInstructorStudents,
  getInstructorDashboard,
  getInstructorStudentProfile,
  updateInstructorStudentProfile,
  addInstructorStudentProgress,
  removeInstructorStudentProgress
} from '../services/instructorService.js';
import {
  listInstructorNotes,
  createInstructorNote,
  updateInstructorNote,
  deleteInstructorNote
} from '../services/instructorNotesService.js';

const router = express.Router();

router.get('/me/students', authorizeRoles(['instructor']), async (req, res, next) => {
  try {
    const data = await getInstructorStudents(req.user.id);
    res.json(data);
  } catch (err) { next(err); }
});

router.get('/me/students/:studentId/profile', authorizeRoles(['instructor']), async (req, res, next) => {
  try {
    const data = await getInstructorStudentProfile(req.user.id, req.params.studentId);
    res.json(data);
  } catch (err) { next(err); }
});

router.patch('/me/students/:studentId/profile', authorizeRoles(['instructor']), async (req, res, next) => {
  try {
    const updated = await updateInstructorStudentProfile(req.user.id, req.params.studentId, req.body || {});
    res.json(updated);
  } catch (err) { next(err); }
});

router.post('/me/students/:studentId/progress', authorizeRoles(['instructor']), async (req, res, next) => {
  try {
    const created = await addInstructorStudentProgress(req.user.id, req.params.studentId, req.body || {});
    res.status(201).json(created);
  } catch (err) { next(err); }
});

router.delete('/me/students/:studentId/progress/:progressId', authorizeRoles(['instructor']), async (req, res, next) => {
  try {
    await removeInstructorStudentProgress(req.user.id, req.params.studentId, req.params.progressId);
    res.status(204).send();
  } catch (err) { next(err); }
});

router.get('/me/students/:studentId/notes', authorizeRoles(['instructor']), async (req, res, next) => {
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

router.post('/me/students/:studentId/notes', authorizeRoles(['instructor']), async (req, res, next) => {
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

router.put('/me/notes/:noteId', authorizeRoles(['instructor']), async (req, res, next) => {
  try {
    const note = await updateInstructorNote(req.user.id, req.params.noteId, req.body || {});
    res.json(note);
  } catch (err) {
    next(err);
  }
});

router.delete('/me/notes/:noteId', authorizeRoles(['instructor']), async (req, res, next) => {
  try {
    await deleteInstructorNote(req.user.id, req.params.noteId);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

router.get('/me/dashboard', authorizeRoles(['instructor']), async (req, res, next) => {
  try {
    const data = await getInstructorDashboard(req.user.id);
    res.json(data);
  } catch (err) { next(err); }
});

export default router;
