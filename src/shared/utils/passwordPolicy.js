// Password policy — single source of truth (frontend).
//
// Owner decision (2026-07-05): passwords only need to be at least 8 characters.
// No uppercase / lowercase / number / special-character requirement, so customers
// self-registering via /join (who set their password on the reset-password page
// reached from the welcome email) can choose a simple 8+ character password.
// Kept in sync with the backend checks in backend/routes/auth.js.
export const MIN_PASSWORD_LENGTH = 8;

export function isPasswordValid(pwd = '') {
  return typeof pwd === 'string' && pwd.length >= MIN_PASSWORD_LENGTH;
}

// Regex form of the same rule, for antd Form `pattern` rules / `.test()` callers.
export const PASSWORD_STRENGTH_REGEX = /^.{8,}$/;

export function getPasswordChecks(pwd = '') {
  return {
    length: (pwd || '').length >= MIN_PASSWORD_LENGTH,
  };
}
