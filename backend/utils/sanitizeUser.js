// Columns of the `users` table that must never leave the backend (API JSON or
// socket payloads). Any route that reads `u.*` / `SELECT * FROM users` /
// `RETURNING *` on users must pass the row(s) through sanitizeUser(s).
const SENSITIVE_FIELDS = [
  'password_hash', 'two_factor_secret', 'two_factor_backup_codes',
  'iyzico_card_user_key', 'last_login_ip', 'failed_login_attempts',
  'account_locked', 'account_locked_at', 'email_verification_token_hash'
];

export function sanitizeUser(user) {
  if (!user) return user;
  const clean = { ...user };
  for (const field of SENSITIVE_FIELDS) delete clean[field];
  return clean;
}

export function sanitizeUsers(users) {
  return Array.isArray(users) ? users.map(sanitizeUser) : users;
}

export { SENSITIVE_FIELDS as SENSITIVE_USER_FIELDS };
