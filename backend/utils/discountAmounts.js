// Tiny helper shared by services that need the active discount total for an
// entity. Lives outside managerCommissionService and bookingUpdateCascadeService
// to break what would otherwise be a circular import between them.
//
// Returns the SUM of every active discount row for (entity_type, entity_id),
// covering both entity-wide rows (participant_user_id IS NULL) and per-
// participant rows (participant_user_id IS NOT NULL). Used by every cascade
// path so the post-discount total is consistent across manager commissions,
// instructor earnings, and bill totals.

import { toNumber } from './instructorEarnings.js';

export async function getActiveDiscountAmount(client, entityType, entityId) {
  if (entityType == null || entityId == null) return 0;
  const { rows } = await client.query(
    `SELECT COALESCE(SUM(amount), 0) AS total
       FROM discounts
      WHERE entity_type = $1 AND entity_id = $2`,
    [entityType, String(entityId)]
  );
  return rows.length ? toNumber(rows[0].total) : 0;
}
