import express from 'express';
import { pool } from '../db.js';
import { authenticateJWT } from './auth.js';
import { authorizeRoles } from '../middlewares/authorize.js';
import { logger } from '../middlewares/errorHandler.js';

const router = express.Router();

// ── GET /instructors/:id/skills ──────────────────────────────────────────────
// Returns all skill rows for a single instructor.
router.get(
  '/:id/skills',
  authenticateJWT,
  authorizeRoles(['admin', 'manager', 'instructor']),
  async (req, res) => {
    try {
      const { id } = req.params;

      // Instructors can only see their own skills
      if (req.user.role === 'instructor' && req.user.id !== id) {
        return res.status(403).json({ error: 'Access denied' });
      }

      const { rows } = await pool.query(
        `SELECT id, discipline_tag, lesson_categories, max_level, created_at, updated_at
         FROM instructor_skills
         WHERE instructor_id = $1
         ORDER BY discipline_tag`,
        [id]
      );

      res.json(rows);
    } catch (err) {
      logger.error('Error fetching instructor skills:', err);
      res.status(500).json({ error: 'Failed to fetch instructor skills' });
    }
  }
);

// ── PUT /instructors/:id/skills ──────────────────────────────────────────────
// Replaces all skill rows for an instructor with the provided set.
// Body: { skills: [{ discipline_tag, lesson_categories, max_level }] }
router.put(
  '/:id/skills',
  authenticateJWT,
  authorizeRoles(['admin', 'manager']),
  async (req, res) => {
    const client = await pool.connect();
    try {
      const { id } = req.params;
      const { skills = [] } = req.body;

      // Validate input
      const validDisciplines = new Set(['kite', 'wing', 'kite_foil', 'efoil', 'premium']);
      const validCategories = new Set(['private', 'semi-private', 'group', 'supervision', 'semi-private-supervision']);
      const validLevels = new Set(['beginner', 'intermediate', 'advanced']);

      for (const skill of skills) {
        if (!validDisciplines.has(skill.discipline_tag)) {
          return res.status(400).json({ error: `Invalid discipline: ${skill.discipline_tag}` });
        }
        if (!validLevels.has(skill.max_level)) {
          return res.status(400).json({ error: `Invalid level: ${skill.max_level}` });
        }
        if (!Array.isArray(skill.lesson_categories) || skill.lesson_categories.length === 0) {
          return res.status(400).json({ error: `lesson_categories must be a non-empty array for ${skill.discipline_tag}` });
        }
        for (const cat of skill.lesson_categories) {
          if (!validCategories.has(cat)) {
            return res.status(400).json({ error: `Invalid lesson category: ${cat}` });
          }
        }
      }

      await client.query('BEGIN');

      // Delete existing skills for this instructor
      await client.query('DELETE FROM instructor_skills WHERE instructor_id = $1', [id]);

      // Insert new skills
      for (const skill of skills) {
        await client.query(
          `INSERT INTO instructor_skills (instructor_id, discipline_tag, lesson_categories, max_level)
           VALUES ($1, $2, $3, $4)`,
          [id, skill.discipline_tag, skill.lesson_categories, skill.max_level]
        );
      }

      await client.query('COMMIT');

      // Return the updated skills
      const { rows } = await pool.query(
        `SELECT id, discipline_tag, lesson_categories, max_level, created_at, updated_at
         FROM instructor_skills
         WHERE instructor_id = $1
         ORDER BY discipline_tag`,
        [id]
      );

      res.json(rows);
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      logger.error('Error saving instructor skills:', err);
      res.status(500).json({ error: 'Failed to save instructor skills' });
    } finally {
      client.release();
    }
  }
);

// ── GET /instructors/qualified ───────────────────────────────────────────────
// Returns instructors qualified to teach a given service.
// Query params: service_id (required)
// Matches service.discipline_tag → instructor_skills.discipline_tag
// Optionally matches service.lesson_category_tag ∈ instructor_skills.lesson_categories
// Optionally matches service level_tag ≤ instructor_skills.max_level
router.get(
  '/qualified',
  authenticateJWT,
  async (req, res) => {
    try {
      const { service_id } = req.query;

      if (!service_id) {
        return res.status(400).json({ error: 'service_id query parameter is required' });
      }

      // Fetch the service's tags
      const svcResult = await pool.query(
        `SELECT discipline_tag, lesson_category_tag, level_tag FROM services WHERE id = $1`,
        [service_id]
      );

      if (svcResult.rows.length === 0) {
        return res.status(404).json({ error: 'Service not found' });
      }

      const service = svcResult.rows[0];

      // If service has no discipline_tag, return all instructors (e.g. rentals)
      if (!service.discipline_tag) {
        const { rows } = await pool.query(`
          SELECT u.id, u.name, u.first_name, u.last_name, u.email, u.phone,
                 u.profile_image_url, u.avatar_url, u.bio
          FROM users u
          JOIN roles r ON r.id = u.role_id
          WHERE r.name IN ('instructor', 'manager') AND u.deleted_at IS NULL
          ORDER BY u.name
        `);
        return res.json(rows.map(r => ({ ...r, qualified: true, matchReason: 'no_discipline_required' })));
      }

      // Level hierarchy for comparison
      const levelRank = { beginner: 1, intermediate: 2, advanced: 3 };
      const requiredLevelRank = levelRank[service.level_tag] || 1;

      // Find qualified instructors
      let query = `
        SELECT u.id, u.name, u.first_name, u.last_name, u.email, u.phone,
               u.profile_image_url, u.avatar_url, u.bio,
               isk.discipline_tag, isk.lesson_categories, isk.max_level
        FROM users u
        JOIN roles r ON r.id = u.role_id
        LEFT JOIN instructor_skills isk
          ON isk.instructor_id = u.id
          AND isk.discipline_tag = $1
        WHERE r.name IN ('instructor', 'manager') AND u.deleted_at IS NULL
        ORDER BY
          CASE WHEN isk.id IS NOT NULL THEN 0 ELSE 1 END,
          u.name
      `;
      const params = [service.discipline_tag];

      const { rows } = await pool.query(query, params);

      const result = rows.map(row => {
        if (!row.discipline_tag) {
          return { ...row, qualified: false, matchReason: 'no_skill_for_discipline' };
        }

        // Check lesson category match
        const categories = row.lesson_categories || [];
        const categoryTag = service.lesson_category_tag;
        const categoryMatch = !categoryTag || categories.includes(categoryTag);

        // Check level match
        const instructorLevelRank = levelRank[row.max_level] || 1;
        const levelMatch = instructorLevelRank >= requiredLevelRank;

        const qualified = categoryMatch && levelMatch;
        let matchReason = 'qualified';
        if (!categoryMatch) matchReason = 'category_mismatch';
        else if (!levelMatch) matchReason = 'level_insufficient';

        // Clean up join fields from response
        return {
          id: row.id,
          name: row.name,
          first_name: row.first_name,
          last_name: row.last_name,
          email: row.email,
          phone: row.phone,
          profile_image_url: row.profile_image_url,
          avatar_url: row.avatar_url,
          bio: row.bio,
          qualified,
          matchReason,
          skill: {
            discipline_tag: row.discipline_tag,
            lesson_categories: categories,
            max_level: row.max_level,
          },
        };
      });

      res.json(result);
    } catch (err) {
      logger.error('Error fetching qualified instructors:', err);
      res.status(500).json({ error: 'Failed to fetch qualified instructors' });
    }
  }
);

export default router;
