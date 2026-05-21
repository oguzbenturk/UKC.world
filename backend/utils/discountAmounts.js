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

// SQL fragment helper for aggregate report queries that sum price columns.
// Returns a `LEFT JOIN LATERAL ( ... ) <alias> ON TRUE` clause exposing
// `<alias>.amt` — the active discount total for the given entity. Use it so
// reports subtract discounts the same way the cascade services do, instead of
// summing raw price columns. `entityIdExpr` is the SQL expression for the row's
// id (e.g. 'b.id', 'cp.id'); it is cast to text to match discounts.entity_id.
export function discountSumLateral(alias, entityType, entityIdExpr) {
  return `LEFT JOIN LATERAL (
      SELECT COALESCE(SUM(amount), 0) AS amt
        FROM discounts
       WHERE entity_type = '${entityType}'
         AND entity_id = (${entityIdExpr})::text
    ) ${alias} ON TRUE`;
}
