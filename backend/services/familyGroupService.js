// Family group service — adult peer-linked customer accounts.
// One Organizer per group, members can be switched-to from the navbar.
// Distinct from familyService.js (minor children under 18).

import { pool } from '../db.js';
import { logger } from '../middlewares/errorHandler.js';

const memberFields = `
  u.id,
  u.first_name,
  u.last_name,
  u.email,
  u.phone,
  u.profile_image_url,
  u.role_id,
  r.name AS role
`;

async function getGroupById(groupId, client = pool) {
  const groupRes = await client.query(
    `SELECT id, name, organizer_user_id, created_by, created_at, updated_at
       FROM family_groups
      WHERE id = $1 AND deleted_at IS NULL`,
    [groupId]
  );
  if (groupRes.rows.length === 0) return null;
  const group = groupRes.rows[0];
  const membersRes = await client.query(
    `SELECT fgm.is_organizer, fgm.joined_at, ${memberFields}
       FROM family_group_members fgm
       JOIN users u ON u.id = fgm.user_id
  LEFT JOIN roles r ON r.id = u.role_id
      WHERE fgm.group_id = $1
   ORDER BY fgm.is_organizer DESC, fgm.joined_at ASC`,
    [groupId]
  );
  return { ...group, members: membersRes.rows };
}

export async function getGroupByUserId(userId) {
  const res = await pool.query(
    `SELECT group_id FROM family_group_members WHERE user_id = $1`,
    [userId]
  );
  if (res.rows.length === 0) return null;
  return getGroupById(res.rows[0].group_id);
}

export async function createGroup({ organizerUserId, memberUserIds = [], name = null, createdBy = null }) {
  if (!organizerUserId) throw new Error('organizerUserId is required');
  const allMemberIds = Array.from(new Set([organizerUserId, ...memberUserIds]));
  if (allMemberIds.length < 2) throw new Error('A family group needs at least 2 members');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const existing = await client.query(
      `SELECT user_id FROM family_group_members WHERE user_id = ANY($1::uuid[])`,
      [allMemberIds]
    );
    if (existing.rows.length > 0) {
      const ids = existing.rows.map((r) => r.user_id).join(', ');
      throw new Error(`User(s) already in a family group: ${ids}`);
    }

    const groupRes = await client.query(
      `INSERT INTO family_groups (name, organizer_user_id, created_by)
       VALUES ($1, $2, $3)
       RETURNING id`,
      [name, organizerUserId, createdBy]
    );
    const groupId = groupRes.rows[0].id;

    for (const userId of allMemberIds) {
      await client.query(
        `INSERT INTO family_group_members (group_id, user_id, is_organizer)
         VALUES ($1, $2, $3)`,
        [groupId, userId, userId === organizerUserId]
      );
    }

    await client.query('COMMIT');
    return getGroupById(groupId);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function addMember(groupId, userId) {
  const existing = await pool.query(
    `SELECT group_id FROM family_group_members WHERE user_id = $1`,
    [userId]
  );
  if (existing.rows.length > 0) {
    throw new Error('User is already in a family group');
  }
  await pool.query(
    `INSERT INTO family_group_members (group_id, user_id, is_organizer)
     VALUES ($1, $2, FALSE)`,
    [groupId, userId]
  );
  await pool.query(`UPDATE family_groups SET updated_at = NOW() WHERE id = $1`, [groupId]);
  return getGroupById(groupId);
}

export async function removeMember(groupId, userId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const memberRes = await client.query(
      `SELECT is_organizer FROM family_group_members WHERE group_id = $1 AND user_id = $2`,
      [groupId, userId]
    );
    if (memberRes.rows.length === 0) {
      throw new Error('Member not found in this group');
    }
    if (memberRes.rows[0].is_organizer) {
      throw new Error('Cannot remove the Organizer. Transfer the organizer role first.');
    }

    await client.query(
      `DELETE FROM family_group_members WHERE group_id = $1 AND user_id = $2`,
      [groupId, userId]
    );

    const remaining = await client.query(
      `SELECT COUNT(*)::int AS c FROM family_group_members WHERE group_id = $1`,
      [groupId]
    );
    if (remaining.rows[0].c < 2) {
      await client.query(
        `UPDATE family_groups SET deleted_at = NOW() WHERE id = $1`,
        [groupId]
      );
      await client.query(`DELETE FROM family_group_members WHERE group_id = $1`, [groupId]);
      await client.query('COMMIT');
      return { disbanded: true };
    }

    await client.query(`UPDATE family_groups SET updated_at = NOW() WHERE id = $1`, [groupId]);
    await client.query('COMMIT');
    return getGroupById(groupId);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function changeOrganizer(groupId, newOrganizerUserId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const memberRes = await client.query(
      `SELECT 1 FROM family_group_members WHERE group_id = $1 AND user_id = $2`,
      [groupId, newOrganizerUserId]
    );
    if (memberRes.rows.length === 0) {
      throw new Error('New organizer must be a member of the group');
    }
    await client.query(
      `UPDATE family_group_members SET is_organizer = (user_id = $2) WHERE group_id = $1`,
      [groupId, newOrganizerUserId]
    );
    await client.query(
      `UPDATE family_groups SET organizer_user_id = $2, updated_at = NOW() WHERE id = $1`,
      [groupId, newOrganizerUserId]
    );
    await client.query('COMMIT');
    return getGroupById(groupId);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function disbandGroup(groupId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`DELETE FROM family_group_members WHERE group_id = $1`, [groupId]);
    await client.query(`UPDATE family_groups SET deleted_at = NOW() WHERE id = $1`, [groupId]);
    await client.query('COMMIT');
    return { disbanded: true };
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error('Failed to disband family group', { groupId, err });
    throw err;
  } finally {
    client.release();
  }
}

export default {
  getGroupById,
  getGroupByUserId,
  createGroup,
  addMember,
  removeMember,
  changeOrganizer,
  disbandGroup,
};
