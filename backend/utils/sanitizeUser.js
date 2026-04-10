const SENSITIVE_FIELDS = [
  'password_hash', 'two_factor_secret', 'two_factor_backup_codes',
  'iyzico_card_user_key', 'last_login_ip', 'failed_login_attempts',
  'account_locked', 'account_locked_at'
];

export function sanitizeUser(user) {
  if (!user) return user;
  const clean = { ...user };
  for (const field of SENSITIVE_FIELDS) delete clean[field];
  return clean;
}
