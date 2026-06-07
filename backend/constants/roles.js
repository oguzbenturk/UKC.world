// constants/roles.js
// NOTE: Role UUIDs are intentionally NOT kept here — they differ per environment
// and drift on reseed, which caused orphaned role_id + broken logins when assigned.
// Resolve role ids by NAME from the DB at runtime instead (e.g. SELECT id FROM roles
// WHERE name = $1). Role logic here is keyed by name only.

// Roles that can use "Pay at Center" option
export const PAY_AT_CENTER_ALLOWED_ROLES = ['admin', 'manager', 'trusted_customer'];
