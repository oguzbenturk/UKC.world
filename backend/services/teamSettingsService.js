import { pool } from '../db.js';
import { logger } from '../middlewares/errorHandler.js';

export async function getTeamSettings() {
  const membersQuery = `
    SELECT
      tms.id,
      tms.instructor_id,
      tms.visible,
      tms.display_order,
      tms.featured,
      tms.custom_bio,
      u.name,
      u.first_name,
      u.last_name,
      u.profile_image_url,
      u.avatar_url,
      u.email
    FROM team_member_settings tms
    JOIN users u ON u.id = tms.instructor_id
    WHERE u.deleted_at IS NULL
    ORDER BY tms.display_order ASC
  `;

  const globalQuery = `
    SELECT visible_fields, booking_link_enabled
    FROM team_global_settings
    LIMIT 1
  `;

  const [membersResult, globalResult] = await Promise.all([
    pool.query(membersQuery),
    pool.query(globalQuery),
  ]);

  return {
    members: membersResult.rows,
    global: globalResult.rows[0] || {
      visible_fields: ['bio', 'specializations', 'languages', 'experience'],
      booking_link_enabled: true,
    },
  };
}

export async function saveTeamSettings({ members, global: globalSettings }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    if (members && members.length > 0) {
      for (const m of members) {
        await client.query(
          `INSERT INTO team_member_settings (instructor_id, visible, display_order, featured, custom_bio, updated_at)
           VALUES ($1, $2, $3, $4, $5, NOW())
           ON CONFLICT (instructor_id) DO UPDATE SET
             visible = EXCLUDED.visible,
             display_order = EXCLUDED.display_order,
             featured = EXCLUDED.featured,
             custom_bio = EXCLUDED.custom_bio,
             updated_at = NOW()`,
          [m.instructor_id, m.visible ?? true, m.display_order ?? 0, m.featured ?? false, m.custom_bio ?? null]
        );
      }
    }

    if (globalSettings) {
      await client.query(
        `UPDATE team_global_settings
         SET visible_fields = $1, booking_link_enabled = $2, updated_at = NOW()
         WHERE id = (SELECT id FROM team_global_settings LIMIT 1)`,
        [JSON.stringify(globalSettings.visible_fields), globalSettings.booking_link_enabled ?? true]
      );
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error('Failed to save team settings', err);
    throw err;
  } finally {
    client.release();
  }
}
