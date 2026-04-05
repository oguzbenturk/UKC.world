import { pool } from '../db.js';
import { logger } from '../middlewares/errorHandler.js';

const VALID_VISIBILITY = new Set(['student_visible', 'instructor_only']);

const normalizeVisibility = (value) => {
  const normalized = (value || '').toLowerCase();
  return VALID_VISIBILITY.has(normalized) ? normalized : 'student_visible';
};

const toIso = (value) => {
  if (!value) return null;
  try {
    return new Date(value).toISOString();
  } catch (error) {
    return null;
  }
};

const mapNoteRow = (row) => {
  const instructorName = (row.instructor_name || '').trim();
  return {
    id: row.id,
    instructorId: row.instructor_id,
    studentId: row.student_id,
    bookingId: row.booking_id,
    note: row.note_text,
    visibility: row.visibility || 'student_visible',
    isPinned: Boolean(row.is_pinned),
    metadata: row.metadata ?? {},
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
    instructor: row.instructor_id
      ? {
          id: row.instructor_id,
          name: instructorName || 'Instructor',
          avatar: row.instructor_avatar || null
        }
      : null
  };
};

async function ensureInstructorStudentRelationship(client, instructorId, studentId) {
  const { rows } = await client.query(
    `SELECT 1
       FROM bookings
      WHERE instructor_user_id = $1
        AND (student_user_id = $2 OR customer_user_id = $2)
        AND deleted_at IS NULL
      LIMIT 1`,
    [instructorId, studentId]
  );

  if (!rows.length) {
    const error = new Error('Instructor does not have access to this student');
    error.status = 403;
    throw error;
  }
}

async function ensureBookingAssociation(client, instructorId, studentId, bookingId) {
  if (!bookingId) return;
  const { rows } = await client.query(
    `SELECT 1
       FROM bookings
      WHERE id = $1
        AND instructor_user_id = $2
        AND (student_user_id = $3 OR customer_user_id = $3)
        AND deleted_at IS NULL
      LIMIT 1`,
    [bookingId, instructorId, studentId]
  );

  if (!rows.length) {
    const error = new Error('Booking does not belong to this instructor/student pair');
    error.status = 400;
    throw error;
  }
}

export async function listInstructorNotes(instructorId, studentId, { includePrivate = false, limit = 50, offset = 0 } = {}) {
  if (!instructorId || !studentId) {
    throw new Error('instructorId and studentId are required');
  }

  const client = await pool.connect();
  try {
    await ensureInstructorStudentRelationship(client, instructorId, studentId);

    const params = [instructorId, studentId];
    const conditions = ['n.instructor_id = $1', 'n.student_id = $2'];

    if (!includePrivate) {
      conditions.push(`COALESCE(n.visibility, 'student_visible') = 'student_visible'`);
    }

    params.push(Math.max(1, Math.min(Number(limit) || 50, 100)));
    params.push(Math.max(0, Number(offset) || 0));

    const { rows } = await client.query(
      `SELECT n.id,
              n.instructor_id,
              n.student_id,
              n.booking_id,
              n.note_text,
              n.visibility,
              n.is_pinned,
              n.metadata,
              n.created_at,
              n.updated_at,
              COALESCE(i.name, CONCAT(COALESCE(i.first_name,''),' ',COALESCE(i.last_name,''))) AS instructor_name,
              i.profile_image_url AS instructor_avatar
         FROM instructor_student_notes n
    LEFT JOIN users i ON i.id = n.instructor_id
        WHERE ${conditions.join(' AND ')}
     ORDER BY n.is_pinned DESC, n.created_at DESC
        LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    return rows.map(mapNoteRow);
  } finally {
    client.release();
  }
}

export async function createInstructorNote(instructorId, studentId, {
  bookingId,
  note,
  visibility = 'student_visible',
  isPinned = false,
  metadata = {}
}) {
  if (!instructorId || !studentId) {
    const error = new Error('instructorId and studentId are required');
    error.status = 400;
    throw error;
  }

  const trimmedNote = (note || '').trim();
  if (!trimmedNote) {
    const error = new Error('note text is required');
    error.status = 400;
    throw error;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await ensureInstructorStudentRelationship(client, instructorId, studentId);
    await ensureBookingAssociation(client, instructorId, studentId, bookingId);

    const { rows } = await client.query(
      `INSERT INTO instructor_student_notes (
         instructor_id,
         student_id,
         booking_id,
         note_text,
         visibility,
         is_pinned,
         metadata
       ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
       RETURNING *`,
      [
        instructorId,
        studentId,
        bookingId || null,
        trimmedNote,
        normalizeVisibility(visibility),
        Boolean(isPinned),
        JSON.stringify(metadata || {})
      ]
    );

    await client.query('COMMIT');
    const row = rows[0];

    return mapNoteRow(row);
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Failed to create instructor note', {
      instructorId,
      studentId,
      bookingId,
      error: error.message
    });
    throw error;
  } finally {
    client.release();
  }
}

export async function updateInstructorNote(instructorId, noteId, {
  note,
  visibility,
  isPinned,
  metadata
}) {
  if (!instructorId || !noteId) {
    const error = new Error('instructorId and noteId are required');
    error.status = 400;
    throw error;
  }

  const fields = [];
  const params = [instructorId, noteId];

  if (note !== undefined) {
    const trimmed = (note || '').trim();
    if (!trimmed) {
      const error = new Error('note text cannot be empty');
      error.status = 400;
      throw error;
    }
    fields.push(`note_text = $${params.length + 1}`);
    params.push(trimmed);
  }

  if (visibility !== undefined) {
    fields.push(`visibility = $${params.length + 1}`);
    params.push(normalizeVisibility(visibility));
  }

  if (isPinned !== undefined) {
    fields.push(`is_pinned = $${params.length + 1}`);
    params.push(Boolean(isPinned));
  }

  if (metadata !== undefined) {
    fields.push(`metadata = $${params.length + 1}::jsonb`);
    params.push(JSON.stringify(metadata || {}));
  }

  if (!fields.length) {
    const error = new Error('No updates provided');
    error.status = 400;
    throw error;
  }

  fields.push('updated_at = NOW()');

  const { rows } = await pool.query(
    `UPDATE instructor_student_notes
        SET ${fields.join(', ')}
      WHERE instructor_id = $1
        AND id = $2
      RETURNING *`,
    params
  );

  if (!rows.length) {
    const error = new Error('Note not found');
    error.status = 404;
    throw error;
  }

  return mapNoteRow(rows[0]);
}

export async function deleteInstructorNote(instructorId, noteId) {
  if (!instructorId || !noteId) {
    const error = new Error('instructorId and noteId are required');
    error.status = 400;
    throw error;
  }

  const { rows } = await pool.query(
    `DELETE FROM instructor_student_notes
      WHERE instructor_id = $1
        AND id = $2
      RETURNING id` ,
    [instructorId, noteId]
  );

  if (!rows.length) {
    const error = new Error('Note not found');
    error.status = 404;
    throw error;
  }

  return { success: true };
}
