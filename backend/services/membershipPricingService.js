// Membership-aware pricing helpers.
//
// Rescue boat services give customers with an ACTIVE membership an automatic
// discount (owner rule: 50%, stored per-service in services.member_discount_percent).
// These helpers are the single source of truth for "is this customer a member"
// and "what discount does a rescue service give them", so booking creation, the
// public price preview and the cards all agree.

export const RESCUE_DISCIPLINE = 'rescue_boat';

/**
 * True when the user currently holds an active, non-expired membership.
 * @param {{query: Function}} db - a pg pool or client
 */
export async function hasActiveMembership(db, userId) {
  if (!db || !userId) return false;
  const { rows } = await db.query(
    `SELECT 1
       FROM member_purchases
      WHERE user_id = $1
        AND status = 'active'
        AND (expires_at IS NULL OR expires_at >= NOW())
      LIMIT 1`,
    [userId]
  );
  return rows.length > 0;
}

/** A service is a rescue service when its discipline is rescue_boat. */
export function isRescueService(service) {
  const tag = service?.discipline_tag ?? service?.disciplineTag ?? null;
  return tag === RESCUE_DISCIPLINE;
}

/** The configured member discount % for a service (0 when none / not rescue). */
export function rescueMemberDiscountPercent(service) {
  if (!isRescueService(service)) return 0;
  const pct = Number(service?.member_discount_percent ?? service?.memberDiscountPercent ?? 0);
  return Number.isFinite(pct) && pct > 0 ? pct : 0;
}

/**
 * Compute the active-membership discount on a rescue service.
 * @returns {{applies:boolean, percent:number, discountAmount:number, netAmount:number}}
 */
export function computeRescueMemberDiscount(service, grossAmount, isMember) {
  const pct = rescueMemberDiscountPercent(service);
  const gross = Number(grossAmount) || 0;
  if (!isMember || pct <= 0 || gross <= 0) {
    return { applies: false, percent: 0, discountAmount: 0, netAmount: gross };
  }
  const discountAmount = Math.round(((gross * pct) / 100) * 100) / 100;
  return {
    applies: true,
    percent: pct,
    discountAmount,
    netAmount: Math.round((gross - discountAmount) * 100) / 100,
  };
}
