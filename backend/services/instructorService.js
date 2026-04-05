import { pool } from '../db.js';
import { toNumber } from '../utils/instructorEarnings.js';
import { cacheService } from './cacheService.js';
import {
  getInstructorEarningsData,
  getInstructorPaymentsSummary,
  getInstructorPayrollHistory,
} from './instructorFinanceService.js';

const PAYOUT_THRESHOLD = Number(process.env.INSTRUCTOR_PAYOUT_THRESHOLD || 200);
const INACTIVE_STUDENT_WINDOW_DAYS = Number(process.env.INSTRUCTOR_INACTIVE_WINDOW_DAYS || 30);
const WEEKS_IN_TIMESERIES = 12;
const DASHBOARD_CACHE_TTL_SECONDS = Number(process.env.INSTRUCTOR_DASHBOARD_TTL || 60);

const dashboardCacheKey = (instructorId) => `instructor:dashboard:${instructorId}`;

const invalidateInstructorDashboardCache = async (instructorId) => {
  try {
    await cacheService.del(dashboardCacheKey(instructorId));
  } catch (error) {
    console.warn('Failed to invalidate instructor dashboard cache', { instructorId, error: error?.message });
  }
};

async function ensureStudentAccess(client, instructorId, studentId) {
  const studentRes = await client.query(
    `SELECT u.id, u.first_name, u.last_name,
            COALESCE(NULLIF(TRIM(u.first_name || ' ' || u.last_name), ''), u.name) AS full_name,
            u.email, u.phone, u.level, u.notes,
            u.created_at, u.updated_at
       FROM users u
       JOIN roles r ON r.id = u.role_id
      WHERE u.id = $1 AND r.name = 'student'`,
    [studentId]
  );

  if (!studentRes.rows.length) {
    const err = new Error('Student not found');
    err.status = 404;
    throw err;
  }

  const [bookingAccess, progressAccess] = await Promise.all([
    client.query(
      `SELECT 1
         FROM bookings
        WHERE instructor_user_id = $1
          AND student_user_id = $2
          AND deleted_at IS NULL
        LIMIT 1`,
      [instructorId, studentId]
    ),
    client.query(
      `SELECT 1
         FROM student_progress
        WHERE instructor_id = $1
          AND student_id = $2
        LIMIT 1`,
      [instructorId, studentId]
    )
  ]);

  if (!bookingAccess.rows.length && !progressAccess.rows.length) {
    const err = new Error('Student is not assigned to this instructor');
    err.status = 403;
    throw err;
  }

  return studentRes.rows[0];
}

/**
 * Get aggregated student metrics for the instructor.
 * - Aggregates bookings (non-cancelled) where instructor is assigned.
 * - Excludes rows without a student_user_id.
 * - Uses users.level as skill level.
 */
export async function getInstructorStudents(instructorId) {
  const client = await pool.connect();
  try {
    const query = `
      WITH lesson_data AS (
        SELECT 
          b.student_user_id AS student_id,
          COUNT(b.id) FILTER (WHERE b.status NOT IN ('cancelled')) AS total_lessons,
          COALESCE(SUM(b.duration),0) AS total_hours,
          MAX( (b.date::timestamptz + (b.start_hour * INTERVAL '1 hour')) ) FILTER (WHERE (b.date::timestamptz + (b.start_hour * INTERVAL '1 hour')) < NOW()) AS last_lesson_ts,
          MIN( (b.date::timestamptz + (b.start_hour * INTERVAL '1 hour')) ) FILTER (WHERE (b.date::timestamptz + (b.start_hour * INTERVAL '1 hour')) > NOW()) AS upcoming_lesson_ts
        FROM bookings b
        WHERE b.instructor_user_id = $1
          AND b.student_user_id IS NOT NULL
          AND (b.status IS NULL OR b.status <> 'archived')
        GROUP BY b.student_user_id
      ), progress_counts AS (
        SELECT student_id, COUNT(*) AS progress_events
        FROM student_progress
        WHERE instructor_id = $1
        GROUP BY student_id
      )
      SELECT 
        u.id AS student_id,
        COALESCE(u.name, CONCAT(COALESCE(u.first_name,''),' ',COALESCE(u.last_name,''))) AS name,
        u.level AS skill_level,
        ld.total_lessons,
        ld.total_hours,
        ld.last_lesson_ts,
        ld.upcoming_lesson_ts,
        COALESCE(pc.progress_events,0) AS progress_events
      FROM lesson_data ld
      JOIN users u ON u.id = ld.student_id
      LEFT JOIN progress_counts pc ON pc.student_id = ld.student_id
      ORDER BY ld.upcoming_lesson_ts NULLS LAST, ld.last_lesson_ts DESC NULLS LAST
      LIMIT 200;
    `;
    const { rows } = await client.query(query, [instructorId]);

    // Derive progress percent (basic heuristic: assume 20hr milestone)
    return rows.map(r => ({
      studentId: r.student_id,
      name: r.name?.trim() || 'Unnamed',
      skillLevel: r.skill_level || null,
      totalLessonCount: Number(r.total_lessons) || 0,
      totalHours: Number(r.total_hours) || 0,
      lastLessonAt: r.last_lesson_ts ? r.last_lesson_ts.toISOString() : null,
      upcomingLessonAt: r.upcoming_lesson_ts ? r.upcoming_lesson_ts.toISOString() : null,
      progressPercent: Math.min(100, Math.round(((Number(r.total_hours) || 0) / 20) * 100)),
      progressEvents: Number(r.progress_events) || 0
    }));
  } finally {
    client.release();
  }
}

export async function getInstructorStudentProfile(instructorId, studentId) {
  const client = await pool.connect();
  try {
    const studentRow = await ensureStudentAccess(client, instructorId, studentId);

    const [statsRes, progressRes, levelsRes, skillsRes, lessonsRes] = await Promise.all([
      client.query(
        `SELECT COUNT(*) FILTER (WHERE b.status IS NULL OR b.status <> 'cancelled') AS total_lessons,
                COALESCE(SUM(b.duration), 0) AS total_hours,
                MAX((b.date::timestamptz + (b.start_hour * INTERVAL '1 hour'))) FILTER (WHERE (b.date::timestamptz + (b.start_hour * INTERVAL '1 hour')) < NOW()) AS last_lesson_ts,
                MIN((b.date::timestamptz + (b.start_hour * INTERVAL '1 hour'))) FILTER (WHERE (b.date::timestamptz + (b.start_hour * INTERVAL '1 hour')) > NOW()) AS next_lesson_ts
           FROM bookings b
          WHERE b.instructor_user_id = $1
            AND b.student_user_id = $2
            AND b.deleted_at IS NULL`,
        [instructorId, studentId]
      ),
      client.query(
        `SELECT sp.id,
                sp.skill_id,
                sp.date_achieved,
                sp.notes,
                sp.created_at,
                s.name        AS skill_name,
                sl.name       AS skill_level_name
           FROM student_progress sp
           LEFT JOIN skills s ON s.id = sp.skill_id
           LEFT JOIN skill_levels sl ON sl.id = s.skill_level_id
          WHERE sp.student_id = $2
            AND sp.instructor_id = $1
          ORDER BY sp.date_achieved DESC, sp.created_at DESC`,
        [instructorId, studentId]
      ),
      client.query(
        `SELECT id, name, description, order_index
           FROM skill_levels
          ORDER BY order_index NULLS LAST, name ASC`
      ),
      client.query(
        `SELECT id, name, description, skill_level_id
           FROM skills
          ORDER BY name ASC`
      ),
      client.query(
        `SELECT b.id,
                (b.date::timestamptz + (b.start_hour * INTERVAL '1 hour')) AS start_ts,
                (b.date::timestamptz + (b.start_hour * INTERVAL '1 hour') + (COALESCE(b.duration,1) * INTERVAL '1 hour')) AS end_ts,
                b.duration,
                b.status
           FROM bookings b
          WHERE b.instructor_user_id = $1
            AND b.student_user_id = $2
            AND b.deleted_at IS NULL
          ORDER BY start_ts DESC
          LIMIT 6`,
        [instructorId, studentId]
      )
    ]);

    const statsRow = statsRes.rows[0] || {};

    const profile = {
      student: {
        id: studentRow.id,
        firstName: studentRow.first_name,
        lastName: studentRow.last_name,
        name: studentRow.full_name?.trim() || 'Unnamed',
        email: studentRow.email,
        phone: studentRow.phone,
        level: studentRow.level,
        notes: studentRow.notes,
        createdAt: studentRow.created_at ? studentRow.created_at.toISOString() : null,
        updatedAt: studentRow.updated_at ? studentRow.updated_at.toISOString() : null
      },
      stats: {
        totalLessons: Number(statsRow.total_lessons || 0),
        totalHours: Number(statsRow.total_hours || 0),
        lastLessonAt: statsRow.last_lesson_ts ? statsRow.last_lesson_ts.toISOString() : null,
        nextLessonAt: statsRow.next_lesson_ts ? statsRow.next_lesson_ts.toISOString() : null
      },
      progress: progressRes.rows.map((row) => ({
        id: row.id,
        skillId: row.skill_id,
        skillName: row.skill_name || 'Skill removed',
        skillLevelName: row.skill_level_name || null,
        dateAchieved: row.date_achieved ? row.date_achieved.toISOString().split('T')[0] : null,
        notes: row.notes,
        createdAt: row.created_at ? row.created_at.toISOString() : null
      })),
      skillLevels: levelsRes.rows.map((row) => ({
        id: row.id,
        name: row.name,
        description: row.description,
        orderIndex: row.order_index
      })),
      skills: skillsRes.rows.map((row) => ({
        id: row.id,
        name: row.name,
        description: row.description,
        skillLevelId: row.skill_level_id
      })),
      recentLessons: lessonsRes.rows.map((row) => ({
        id: row.id,
        startTime: row.start_ts ? row.start_ts.toISOString() : null,
        endTime: row.end_ts ? row.end_ts.toISOString() : null,
        durationHours: Number(row.duration || 0),
        status: row.status || 'pending'
      }))
    };

    return profile;
  } finally {
    client.release();
  }
}

export async function updateInstructorStudentProfile(instructorId, studentId, payload) {
  const { level, notes } = payload || {};
  const client = await pool.connect();
  try {
    await ensureStudentAccess(client, instructorId, studentId);

    const updates = [];
    const values = [];

    if (level !== undefined) {
      updates.push(`level = $${updates.length + 1}`);
      values.push(level === null ? null : String(level).trim());
    }

    if (notes !== undefined) {
      updates.push(`notes = $${updates.length + 1}`);
      values.push(notes === null ? null : String(notes).trim());
    }

    if (!updates.length) {
      const err = new Error('No fields provided');
      err.status = 400;
      throw err;
    }

    updates.push(`updated_at = NOW()`);
    values.push(studentId);

    const updateQuery = `
      UPDATE users
         SET ${updates.join(', ')}
       WHERE id = $${values.length}
       RETURNING id, first_name, last_name,
                 COALESCE(NULLIF(TRIM(first_name || ' ' || last_name), ''), name) AS full_name,
                 email, phone, level, notes, updated_at`;

    const updateRes = await client.query(updateQuery, values);

    const row = updateRes.rows[0];

    await invalidateInstructorDashboardCache(instructorId);

    return {
      id: row.id,
      name: row.full_name?.trim() || 'Unnamed',
      level: row.level,
      notes: row.notes,
      email: row.email,
      phone: row.phone,
      updatedAt: row.updated_at ? row.updated_at.toISOString() : null
    };
  } finally {
    client.release();
  }
}

export async function addInstructorStudentProgress(instructorId, studentId, payload) {
  const { skillId, dateAchieved, notes } = payload || {};

  if (!skillId) {
    const err = new Error('skillId is required');
    err.status = 400;
    throw err;
  }

  const parsedDate = dateAchieved ? new Date(dateAchieved) : new Date();
  if (Number.isNaN(parsedDate.getTime())) {
    const err = new Error('Invalid date');
    err.status = 400;
    throw err;
  }

  const client = await pool.connect();
  try {
    await ensureStudentAccess(client, instructorId, studentId);

    const skillRes = await client.query(
      `SELECT s.id, s.name, sl.name AS level_name
         FROM skills s
         LEFT JOIN skill_levels sl ON sl.id = s.skill_level_id
        WHERE s.id = $1`,
      [skillId]
    );

    if (!skillRes.rows.length) {
      const err = new Error('Skill not found');
      err.status = 400;
      throw err;
    }

    const insertRes = await client.query(
      `INSERT INTO student_progress (student_id, skill_id, instructor_id, date_achieved, notes)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, date_achieved, notes, created_at`,
      [studentId, skillId, instructorId, parsedDate.toISOString().split('T')[0], notes ? String(notes).trim() : null]
    );

  const row = insertRes.rows[0];

  await invalidateInstructorDashboardCache(instructorId);

  return {
      id: row.id,
      skillId,
      skillName: skillRes.rows[0].name,
      skillLevelName: skillRes.rows[0].level_name || null,
      dateAchieved: row.date_achieved ? row.date_achieved.toISOString().split('T')[0] : null,
      notes: row.notes,
      createdAt: row.created_at ? row.created_at.toISOString() : null
    };
  } finally {
    client.release();
  }
}

export async function removeInstructorStudentProgress(instructorId, studentId, progressId) {
  const client = await pool.connect();
  try {
    await ensureStudentAccess(client, instructorId, studentId);

    const deleteRes = await client.query(
      `DELETE FROM student_progress
        WHERE id = $1
          AND student_id = $2
          AND instructor_id = $3
        RETURNING id`,
      [progressId, studentId, instructorId]
    );

    if (!deleteRes.rows.length) {
      const err = new Error('Progress record not found');
      err.status = 404;
      throw err;
    }

    await invalidateInstructorDashboardCache(instructorId);

    return { success: true };
  } finally {
    client.release();
  }
}

/**
 * Dashboard aggregation for instructor: finance summary + upcoming lessons + student stats.
 */
export async function getInstructorDashboard(instructorId) {
  const cacheKey = dashboardCacheKey(instructorId);
  try {
    const cached = await cacheService.get(cacheKey);
    if (cached) {
      return cached;
    }
  } catch (error) {
    console.warn('Failed to read instructor dashboard cache', { instructorId, error: error?.message });
  }

  const client = await pool.connect();
  try {
    const upcomingLessonsQuery = `
      SELECT b.id,
             (b.date::timestamptz + (b.start_hour * INTERVAL '1 hour')) AS start_ts,
             b.duration,
             b.status,
             COALESCE(s.name, CONCAT(COALESCE(s.first_name,''),' ',COALESCE(s.last_name,''))) AS student_name
      FROM bookings b
      LEFT JOIN users s ON s.id = b.student_user_id
      WHERE b.instructor_user_id = $1
        AND (b.date::timestamptz + (b.start_hour * INTERVAL '1 hour')) > NOW()
        AND (b.status IS NULL OR b.status NOT IN ('cancelled'))
      ORDER BY start_ts ASC
      LIMIT 8;
    `;

    const inactiveStudentsQuery = `
      WITH lesson_activity AS (
        SELECT 
          b.student_user_id AS student_id,
          MAX(b.date::timestamptz + (b.start_hour * INTERVAL '1 hour')) AS last_lesson_ts,
          COUNT(*) FILTER (WHERE b.status = 'completed') AS completed_lessons,
          SUM(b.duration) AS total_hours
        FROM bookings b
        WHERE b.instructor_user_id = $1
          AND b.student_user_id IS NOT NULL
          AND b.deleted_at IS NULL
        GROUP BY b.student_user_id
      )
      SELECT 
        u.id,
        COALESCE(u.name, CONCAT(COALESCE(u.first_name,''),' ',COALESCE(u.last_name,''))) AS name,
        la.last_lesson_ts AS last_lesson_ts,
        la.completed_lessons,
        la.total_hours
      FROM lesson_activity la
      JOIN users u ON u.id = la.student_id
      WHERE la.last_lesson_ts IS NULL
         OR la.last_lesson_ts < (NOW() - ($2 || ' days')::interval)
      ORDER BY la.last_lesson_ts NULLS FIRST
      LIMIT 10;
    `;

    const lessonStatusBreakdownQuery = `
      SELECT 
        COALESCE(NULLIF(TRIM(b.status), ''), 'unspecified') AS status,
        COUNT(*) AS count
      FROM bookings b
      WHERE b.instructor_user_id = $1
        AND b.deleted_at IS NULL
      GROUP BY status
      ORDER BY status;
    `;

    const studentStatsQuery = `
      WITH base AS (
        SELECT DISTINCT b.student_user_id AS sid
        FROM bookings b
        WHERE b.instructor_user_id = $1 AND b.student_user_id IS NOT NULL
      ), month_active AS (
        SELECT DISTINCT b.student_user_id AS sid
        FROM bookings b
        WHERE b.instructor_user_id = $1 
          AND b.student_user_id IS NOT NULL
          AND date_trunc('month', b.date) = date_trunc('month', NOW())
      ), level_dist AS (
        SELECT u.level, COUNT(*) cnt
        FROM bookings b
        JOIN users u ON u.id = b.student_user_id
        WHERE b.instructor_user_id = $1 AND b.student_user_id IS NOT NULL AND u.level IS NOT NULL
        GROUP BY u.level
      )
      SELECT 
        (SELECT COUNT(*) FROM base) AS unique_students,
        (SELECT COUNT(*) FROM month_active) AS active_this_month,
        (SELECT level FROM level_dist ORDER BY cnt DESC, level ASC LIMIT 1) AS most_common_level;
    `;

    const [financeData, paymentsSummary, payrollHistory, upcomingRes, statsRes, inactiveRes, statusRes] = await Promise.all([
      getInstructorEarningsData(instructorId),
      getInstructorPaymentsSummary(instructorId),
      getInstructorPayrollHistory(instructorId, { limit: 5 }),
      client.query(upcomingLessonsQuery, [instructorId]),
      client.query(studentStatsQuery, [instructorId]),
      client.query(inactiveStudentsQuery, [instructorId, INACTIVE_STUDENT_WINDOW_DAYS]),
      client.query(lessonStatusBreakdownQuery, [instructorId])
    ]);

    const toWeekStart = (date) => {
      const weekStart = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
      const day = weekStart.getUTCDay();
      const diff = (day + 6) % 7; // Monday as start of week
      weekStart.setUTCDate(weekStart.getUTCDate() - diff);
      weekStart.setUTCHours(0, 0, 0, 0);
      return weekStart;
    };

    const { earnings, totals } = financeData;
    const earningsForStats = earnings.map((entry) => ({
      lessonDate: entry.lesson_date ? new Date(entry.lesson_date) : null,
      lessonDuration: entry.lesson_duration || 0,
      totalEarnings: entry.total_earnings || 0,
    }));

    const totalEarned = totals.totalEarnings || 0;
    const totalHours = totals.totalHours || 0;
    const now = new Date();

    const monthToDate = earningsForStats.reduce((sum, entry) => {
      if (!entry.lessonDate || Number.isNaN(entry.lessonDate.getTime())) {
        return sum;
      }
      return entry.lessonDate.getUTCFullYear() === now.getUTCFullYear() &&
        entry.lessonDate.getUTCMonth() === now.getUTCMonth()
        ? sum + entry.totalEarnings
        : sum;
    }, 0);

    const weekTotals = earningsForStats.reduce((acc, entry) => {
      if (!entry.lessonDate || Number.isNaN(entry.lessonDate.getTime())) {
        return acc;
      }
      const weekStart = toWeekStart(entry.lessonDate).toISOString();
      acc.set(weekStart, (acc.get(weekStart) || 0) + entry.totalEarnings);
      return acc;
    }, new Map());

    const currentWeekStart = toWeekStart(now);
    const earningsTimeseries = [];
    for (let i = WEEKS_IN_TIMESERIES - 1; i >= 0; i -= 1) {
      const weekStart = new Date(currentWeekStart);
      weekStart.setUTCDate(weekStart.getUTCDate() - (i * 7));
      const key = weekStart.toISOString();
      const total = weekTotals.get(key) || 0;
      earningsTimeseries.push({
        weekStart: key,
        total: Number(total.toFixed(2)),
      });
    }

    const { netPayments, totalPaid, lastPayment } = paymentsSummary;
    const pendingBalance = totalEarned - netPayments;

    const toTwoDecimals = (value) => Number(Number(value || 0).toFixed(2));

    const recentEarnings = earnings.slice(0, 5).map((entry) => ({
      bookingId: entry.booking_id,
      lessonDate: entry.lesson_date,
      studentName: entry.student_name,
      durationHours: toTwoDecimals(entry.lesson_duration),
      amount: toTwoDecimals(entry.total_earnings),
      status: entry.booking_status || 'completed',
    }));

    const recentPayments = payrollHistory.map((row) => ({
      id: row.id,
      amount: Number(toNumber(row.amount).toFixed(2)),
      type: row.type,
      description: row.description,
      method: row.payment_method || null,
      referenceNumber: row.reference_number || null,
      paymentDate: row.payment_date ? new Date(row.payment_date).toISOString() : null,
    }));

    const statsRow = statsRes.rows[0] || { unique_students: 0, active_this_month: 0, most_common_level: null };

    const inactiveStudents = inactiveRes.rows.map((row) => ({
      studentId: row.id,
      name: row.name?.trim() || 'Unnamed',
      lastLessonAt: row.last_lesson_ts ? row.last_lesson_ts.toISOString() : null,
      completedLessons: Number(row.completed_lessons || 0),
      totalHours: Number(row.total_hours || 0),
    }));

    const lessonStatusBreakdown = statusRes.rows.map((row) => ({
      status: row.status,
      count: Number(row.count || 0),
    }));

    const result = {
      finance: {
        totalEarned: Number(totalEarned.toFixed(2)),
        pending: Number(Math.max(pendingBalance, 0).toFixed(2)),
        monthToDate: Number(monthToDate.toFixed(2)),
        totalPaid: Number(totalPaid.toFixed(2)),
        totalHours: Number(totalHours.toFixed(2)),
        netPayments: Number(netPayments.toFixed(2)),
        pendingThreshold: {
          amount: Number(PAYOUT_THRESHOLD.toFixed(2)),
          meetsThreshold: pendingBalance >= PAYOUT_THRESHOLD,
          shortfall: Number(Math.max(PAYOUT_THRESHOLD - pendingBalance, 0).toFixed(2)),
        },
        timeseries: earningsTimeseries,
        lastPayout: lastPayment ? {
          amount: Number(toNumber(lastPayment.amount).toFixed(2)),
          paymentDate: lastPayment.created_at ? lastPayment.created_at.toISOString() : null,
          payrollId: null,
        } : null,
        recentEarnings,
        recentPayments,
      },
      upcomingLessons: upcomingRes.rows.map(r => ({
        id: r.id,
        studentName: r.student_name || '—',
        startTime: r.start_ts ? r.start_ts.toISOString() : null,
        durationHours: Number(r.duration || 0),
        status: r.status || 'pending'
      })),
      studentStats: {
        uniqueStudents: Number(statsRow.unique_students || 0),
        activeThisMonth: Number(statsRow.active_this_month || 0),
        averageSkillLevel: statsRow.most_common_level || null
      },
      lessonInsights: {
        inactiveStudents,
        inactiveWindowDays: INACTIVE_STUDENT_WINDOW_DAYS,
        statusBreakdown: lessonStatusBreakdown,
      }
    };

    try {
      await cacheService.set(cacheKey, result, DASHBOARD_CACHE_TTL_SECONDS);
    } catch (error) {
      console.warn('Failed to write instructor dashboard cache', { instructorId, error: error?.message });
    }
    return result;
  } finally {
    client.release();
  }
}

