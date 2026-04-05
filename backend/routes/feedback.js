import express from 'express';
import { body, validationResult } from 'express-validator';
import { authorizeRoles } from '../middlewares/authorize.js';
import { pool } from '../db.js';
import { logger } from '../middlewares/errorHandler.js';

const router = express.Router();

// Submit feedback
router.post('/', 
  authorizeRoles(['student', 'admin', 'manager']),
  [
    body('bookingId').isInt().withMessage('Booking ID must be an integer'),
    body('rating').isInt({ min: 1, max: 5 }).withMessage('Rating must be between 1 and 5'),
    body('comment').optional().isLength({ max: 1000 }).withMessage('Comment must be less than 1000 characters'),
    body('skillLevel').optional().isIn(['beginner', 'intermediate', 'advanced']).withMessage('Invalid skill level'),
    body('progressNotes').optional().isLength({ max: 500 }).withMessage('Progress notes must be less than 500 characters')
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { bookingId, rating, comment, skillLevel, progressNotes } = req.body;
      const userId = req.user.id;

      // Check if booking exists and belongs to user
      const bookingResult = await pool.query(
        'SELECT * FROM bookings WHERE id = $1 AND student_id = $2',
        [bookingId, userId]
      );

      if (bookingResult.rows.length === 0) {
        return res.status(404).json({ error: 'Booking not found or not authorized' });
      }

      const booking = bookingResult.rows[0];

      // Check if feedback already exists
      const existingFeedback = await pool.query(
        'SELECT * FROM feedback WHERE booking_id = $1',
        [bookingId]
      );

      if (existingFeedback.rows.length > 0) {
        return res.status(409).json({ error: 'Feedback already submitted for this booking' });
      }

      // Insert feedback
      const feedbackResult = await pool.query(`
        INSERT INTO feedback (booking_id, student_id, instructor_id, rating, comment, skill_level, progress_notes, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
        RETURNING *
      `, [bookingId, userId, booking.instructor_id, rating, comment, skillLevel, progressNotes]);

      // Update student skill level if provided
      if (skillLevel) {
        await pool.query(
          'UPDATE users SET skill_level = $1 WHERE id = $2',
          [skillLevel, userId]
        );
      }

      // Check for achievements
      const achievements = await checkAchievements(userId, rating);

      res.status(201).json({
        feedback: feedbackResult.rows[0],
        achievements
      });

    } catch (error) {
      logger.error('Error submitting feedback:', error);
      res.status(500).json({ error: 'Failed to submit feedback' });
    }
  }
);

// Get feedback for a booking
router.get('/booking/:bookingId', authorizeRoles(['admin', 'manager', 'instructor', 'student']), async (req, res) => {
  try {
    const { bookingId } = req.params;
    const userId = req.user.id;
    const userRole = req.user.role;

    let query = `
      SELECT f.*, u.name as student_name, i.name as instructor_name
      FROM feedback f
      JOIN users u ON f.student_id = u.id
      JOIN users i ON f.instructor_id = i.id
      WHERE f.booking_id = $1
    `;
    let params = [bookingId];

    // Students can only see their own feedback
    if (userRole === 'student') {
      query += ' AND f.student_id = $2';
      params.push(userId);
    }

    const result = await pool.query(query, params);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Feedback not found' });
    }

    res.json(result.rows[0]);

  } catch (error) {
    logger.error('Error fetching feedback:', error);
    res.status(500).json({ error: 'Failed to fetch feedback' });
  }
});

// Get instructor feedback summary
router.get('/instructor/:instructorId/summary', authorizeRoles(['admin', 'manager', 'instructor']), async (req, res) => {
  try {
    const { instructorId } = req.params;
    const userId = req.user.id;
    const userRole = req.user.role;

    // Instructors can only see their own summary
    if (userRole === 'instructor' && parseInt(instructorId) !== userId) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    const result = await pool.query(`
      SELECT 
        COUNT(*) as total_feedback,
        AVG(rating) as average_rating,
        COUNT(CASE WHEN rating = 5 THEN 1 END) as five_star_count,
        COUNT(CASE WHEN rating = 4 THEN 1 END) as four_star_count,
        COUNT(CASE WHEN rating = 3 THEN 1 END) as three_star_count,
        COUNT(CASE WHEN rating = 2 THEN 1 END) as two_star_count,
        COUNT(CASE WHEN rating = 1 THEN 1 END) as one_star_count
      FROM feedback 
      WHERE instructor_id = $1
    `, [instructorId]);

    const recentFeedback = await pool.query(`
      SELECT f.*, u.name as student_name, b.lesson_date
      FROM feedback f
      JOIN users u ON f.student_id = u.id
      JOIN bookings b ON f.booking_id = b.id
      WHERE f.instructor_id = $1
      ORDER BY f.created_at DESC
      LIMIT 10
    `, [instructorId]);

    res.json({
      summary: result.rows[0],
      recentFeedback: recentFeedback.rows
    });

  } catch (error) {
    logger.error('Error fetching instructor feedback summary:', error);
    res.status(500).json({ error: 'Failed to fetch feedback summary' });
  }
});

// Get student achievements
router.get('/achievements/:studentId', authorizeRoles(['admin', 'manager', 'instructor', 'student']), async (req, res) => {
  try {
    const { studentId } = req.params;
    const userId = req.user.id;
    const userRole = req.user.role;

    // Students can only see their own achievements
    if (userRole === 'student' && parseInt(studentId) !== userId) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    const achievements = await pool.query(`
      SELECT * FROM student_achievements 
      WHERE student_id = $1 
      ORDER BY earned_at DESC
    `, [studentId]);

    res.json(achievements.rows);

  } catch (error) {
    logger.error('Error fetching achievements:', error);
    res.status(500).json({ error: 'Failed to fetch achievements' });
  }
});

// Helper function to check achievements
async function checkAchievements(studentId, rating) {
  const achievements = [];

  try {
    // Check for various achievements
    const feedbackCount = await pool.query(
      'SELECT COUNT(*) as count FROM feedback WHERE student_id = $1',
      [studentId]
    );

    const highRatingCount = await pool.query(
      'SELECT COUNT(*) as count FROM feedback WHERE student_id = $1 AND rating >= 4',
      [studentId]
    );

    const bookingCount = await pool.query(
      'SELECT COUNT(*) as count FROM bookings WHERE student_id = $1',
      [studentId]
    );

    const count = parseInt(feedbackCount.rows[0].count);
    const highCount = parseInt(highRatingCount.rows[0].count);
    const totalBookings = parseInt(bookingCount.rows[0].count);

    // First lesson achievement
    if (count === 1) {
      const achievement = await awardAchievement(studentId, 'first_lesson', 'First Lesson Complete!', 'Completed your first kitesurfing lesson');
      if (achievement) achievements.push(achievement);
    }

    // Perfect rating achievement
    if (rating === 5) {
      const achievement = await awardAchievement(studentId, 'perfect_rating', 'Perfect Score!', 'Received a 5-star rating from your instructor');
      if (achievement) achievements.push(achievement);
    }

    // Milestone achievements
    if (count === 5) {
      const achievement = await awardAchievement(studentId, 'five_lessons', 'Getting Started!', 'Completed 5 lessons');
      if (achievement) achievements.push(achievement);
    }

    if (count === 10) {
      const achievement = await awardAchievement(studentId, 'ten_lessons', 'Dedicated Learner!', 'Completed 10 lessons');
      if (achievement) achievements.push(achievement);
    }

    // High performer achievement
    if (highCount >= 5 && highCount / count >= 0.8) {
      const achievement = await awardAchievement(studentId, 'high_performer', 'High Performer!', 'Maintained excellent ratings across multiple lessons');
      if (achievement) achievements.push(achievement);
    }

  } catch (error) {
    logger.error('Error checking achievements:', error);
  }

  return achievements;
}

async function awardAchievement(studentId, type, title, description) {
  try {
    // Check if achievement already exists
    const existing = await pool.query(
      'SELECT * FROM student_achievements WHERE student_id = $1 AND achievement_type = $2',
      [studentId, type]
    );

    if (existing.rows.length > 0) {
      return null; // Achievement already awarded
    }

    // Award new achievement
    const result = await pool.query(`
      INSERT INTO student_achievements (student_id, achievement_type, title, description, earned_at)
      VALUES ($1, $2, $3, $4, NOW())
      RETURNING *
    `, [studentId, type, title, description]);

    return result.rows[0];
  } catch (error) {
    logger.error('Error awarding achievement:', error);
    return null;
  }
}

export default router;
