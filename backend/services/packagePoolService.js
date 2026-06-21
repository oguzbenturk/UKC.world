/**
 * Package Pool Service
 *
 * Single source of truth for "which of a customer's packages may fund a given
 * lesson". Used by the booking create paths (for FIFO cross-package spillover),
 * by GET /users/:id/packages (so the booking UI's pool matches the backend),
 * and by the consumption service.
 *
 * Pool rule (owner decision): packages chain only when they match the lesson's
 * lesson TYPE (private/semi-private/group) AND discipline (kite/wing/foil/surf).
 * Untagged legacy packages are permissively included; when the service itself
 * carries no tags we fall back to the historical lesson_service_name match.
 */

/**
 * @param {object} client - pg client / pool
 * @param {object} opts
 * @param {string} opts.customerId
 * @param {string} [opts.serviceName]          - booking service name (legacy fallback match)
 * @param {string} [opts.lessonCategoryTag]    - service lesson_category_tag (private/semi-private/group/supervision)
 * @param {string} [opts.disciplineTag]        - service discipline_tag (kite/wing/foil/surf)
 * @param {string} [opts.asOfDate]             - when provided, exclude packages expired before this date
 * @param {boolean} [opts.allowWaitingPayment] - include bank-transfer-pending packages (default true; matches create)
 * @returns {Promise<Array>} eligible packages ordered FIFO (purchase_date ASC), each with
 *          { id, package_name, total_hours, used_hours, remaining_hours, live_remaining,
 *            purchase_price, currency, status, lesson_service_name, lesson_category_tag, discipline_tag }
 */
export async function getEligiblePackagesForLesson(client, {
  customerId,
  serviceName = null,
  lessonCategoryTag = null,
  disciplineTag = null,
  asOfDate = null,
  allowWaitingPayment = true,
} = {}) {
  if (!customerId) return [];

  const statuses = allowWaitingPayment ? `('active', 'waiting_payment')` : `('active')`;
  const params = [customerId];
  const conditions = [];

  if (asOfDate) {
    params.push(asOfDate);
    conditions.push(`(cp.expiry_date IS NULL OR cp.expiry_date >= $${params.length})`);
  }

  // Type compatibility: same lesson_category_tag (NULL-permissive) or a name hint.
  if (lessonCategoryTag) {
    params.push(lessonCategoryTag);
    const tagIdx = params.length;
    params.push(`%${lessonCategoryTag}%`);
    const likeIdx = params.length;
    conditions.push(`(
      sp.lesson_category_tag IS NULL
      OR sp.lesson_category_tag = $${tagIdx}
      OR LOWER(cp.lesson_service_name) LIKE LOWER($${likeIdx})
      OR LOWER(cp.package_name) LIKE LOWER($${likeIdx})
    )`);
  }

  // Discipline compatibility: same discipline_tag (NULL-permissive) or a name hint.
  if (disciplineTag) {
    params.push(disciplineTag);
    const discIdx = params.length;
    params.push(`%${disciplineTag}%`);
    const discLikeIdx = params.length;
    conditions.push(`(
      sp.discipline_tag IS NULL
      OR LOWER(sp.discipline_tag) = LOWER($${discIdx})
      OR LOWER(cp.lesson_service_name) LIKE LOWER($${discLikeIdx})
      OR LOWER(cp.package_name) LIKE LOWER($${discLikeIdx})
    )`);
  }

  // Legacy fallback: service has no structured tags — match by lesson_service_name
  // exactly as the original single-package selection did.
  if (!lessonCategoryTag && !disciplineTag && serviceName) {
    params.push(serviceName);
    const nameIdx = params.length;
    conditions.push(`(
      cp.lesson_service_name IS NULL
      OR LOWER(cp.lesson_service_name) = LOWER($${nameIdx})
      OR LOWER(RTRIM(cp.lesson_service_name, 's')) = LOWER(RTRIM($${nameIdx}, 's'))
      OR LOWER(sp.lesson_service_name) = LOWER($${nameIdx})
      OR LOWER(RTRIM(sp.lesson_service_name, 's')) = LOWER(RTRIM($${nameIdx}, 's'))
    )`);
  }

  const extra = conditions.length ? ` AND ${conditions.join(' AND ')}` : '';

  const sql = `
    SELECT cp.id, cp.package_name, cp.total_hours, cp.used_hours, cp.remaining_hours,
           COALESCE(cp.remaining_hours, cp.total_hours - COALESCE(cp.used_hours, 0)) AS live_remaining,
           cp.purchase_price, cp.currency, cp.status, cp.lesson_service_name,
           sp.lesson_category_tag, sp.discipline_tag
      FROM customer_packages cp
      LEFT JOIN service_packages sp ON sp.id = cp.service_package_id
     WHERE cp.customer_id = $1
       AND cp.status IN ${statuses}
       AND COALESCE(cp.remaining_hours, cp.total_hours - COALESCE(cp.used_hours, 0)) > 0
       ${extra}
     ORDER BY cp.purchase_date ASC, cp.created_at ASC
  `;

  const { rows } = await client.query(sql, params);
  return rows;
}

export default { getEligiblePackagesForLesson };
