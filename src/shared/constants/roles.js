// src/constants/roles.js
// Role UUIDs are NOT hardcoded: they differ per environment and drift on reseed.
// Always resolve the live id from the GET /roles list via resolveRoleIdByName().
// (The old stale ROLE_IDS export was removed — it caused orphaned role_id + broken
// logins when assigned. See useInstructorRoleId.js for the correct pattern.)

/** Resolve a role UUID from an API /roles list by canonical name (case-insensitive). */
export function resolveRoleIdByName(roles, name) {
  if (!Array.isArray(roles) || !name) return null;
  const n = String(name).toLowerCase();
  const row = roles.find((r) => String(r.name || '').toLowerCase() === n);
  return row?.id ?? null;
}
