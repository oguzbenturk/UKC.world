/**
 * Centralized error-code catalog and response helper.
 *
 * All route handlers should use these codes instead of free-text error strings
 * so the frontend can translate messages into the user's chosen language.
 *
 * Response shape produced by `sendError`:
 *   { error: "<EN fallback>", code: "<ERROR_CODE>", errorParams?: {...} }
 *
 * - `error` remains a plain string so legacy call sites keep working.
 * - `code` is the stable machine-readable key used by the frontend i18n map.
 * - `errorParams` carries interpolation values for dynamic messages
 *   (e.g. { minutes: 30 } for "Account locked for {{minutes}} minutes").
 */

export const ERROR_CODES = Object.freeze({
  // Auth
  AUTH_CREDENTIALS_REQUIRED: 'AUTH_CREDENTIALS_REQUIRED',
  AUTH_INVALID_CREDENTIALS: 'AUTH_INVALID_CREDENTIALS',
  AUTH_ACCOUNT_LOCKED: 'AUTH_ACCOUNT_LOCKED',
  AUTH_ACCOUNT_EXPIRED: 'AUTH_ACCOUNT_EXPIRED',
  AUTH_2FA_REQUIRED: 'AUTH_2FA_REQUIRED',
  AUTH_TOKEN_MISSING: 'AUTH_TOKEN_MISSING',
  AUTH_TOKEN_INVALID: 'AUTH_TOKEN_INVALID',
  AUTH_TOKEN_EXPIRED: 'AUTH_TOKEN_EXPIRED',
  AUTH_TOKEN_REVOKED: 'AUTH_TOKEN_REVOKED',
  AUTH_PERMISSION_DENIED: 'AUTH_PERMISSION_DENIED',
  AUTH_USER_NOT_FOUND: 'AUTH_USER_NOT_FOUND',
  AUTH_PASSWORD_INCORRECT: 'AUTH_PASSWORD_INCORRECT',
  AUTH_LOGIN_FAILED: 'AUTH_LOGIN_FAILED',

  // Already in use elsewhere — preserved for compatibility
  LOGIN_DISABLED: 'LOGIN_DISABLED',
  DB_UNAVAILABLE: 'DB_UNAVAILABLE',
  VOUCHER_INVALID: 'VOUCHER_INVALID',
  VOUCHER_ERROR: 'VOUCHER_ERROR',
  HAS_RELATED_DATA: 'HAS_RELATED_DATA',
  FOREIGN_KEY_CONSTRAINT: 'FOREIGN_KEY_CONSTRAINT',
  DATES_REQUIRED: 'DATES_REQUIRED',
  NO_UNIT_ASSIGNED: 'NO_UNIT_ASSIGNED',
  UNIT_NOT_FOUND: 'UNIT_NOT_FOUND',
  UNIT_UNAVAILABLE: 'UNIT_UNAVAILABLE',
  DATES_UNAVAILABLE: 'DATES_UNAVAILABLE',
  PRO_RATA_NOT_ALLOWED: 'PRO_RATA_NOT_ALLOWED',

  // Generic
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
});

/**
 * Send a standardized error response.
 *
 * @param {import('express').Response} res
 * @param {number} status - HTTP status code
 * @param {string} code   - One of ERROR_CODES
 * @param {string} fallbackMessage - English message used as-is by legacy call sites
 * @param {object} [extra] - Additional fields merged into response body
 *                           (e.g. { errorParams: { minutes: 30 } }, { unlockTime: '...' })
 */
export const sendError = (res, status, code, fallbackMessage, extra = {}) => {
  return res.status(status).json({
    error: fallbackMessage,
    code,
    ...extra,
  });
};
