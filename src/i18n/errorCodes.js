/**
 * Maps backend error codes to i18n keys in the `errors` namespace.
 *
 * Backend responses of shape `{ error, code, errorParams? }` are unwrapped
 * by the axios interceptor; the code is looked up here and translated via
 * `i18n.t('errors:' + key, errorParams)`.
 */

export const ERROR_KEY_MAP = {
  // Auth
  AUTH_CREDENTIALS_REQUIRED: 'authCredentialsRequired',
  AUTH_INVALID_CREDENTIALS: 'authInvalidCredentials',
  AUTH_ACCOUNT_LOCKED: 'authAccountLocked',
  AUTH_ACCOUNT_EXPIRED: 'authAccountExpired',
  AUTH_2FA_REQUIRED: 'auth2faRequired',
  AUTH_TOKEN_MISSING: 'authTokenMissing',
  AUTH_TOKEN_INVALID: 'authTokenInvalid',
  AUTH_TOKEN_EXPIRED: 'authTokenExpired',
  AUTH_TOKEN_REVOKED: 'authTokenRevoked',
  AUTH_PERMISSION_DENIED: 'authPermissionDenied',
  AUTH_USER_NOT_FOUND: 'authUserNotFound',
  AUTH_PASSWORD_INCORRECT: 'authPasswordIncorrect',
  AUTH_LOGIN_FAILED: 'authLoginFailed',

  // Already in use
  LOGIN_DISABLED: 'loginDisabled',
  DB_UNAVAILABLE: 'dbUnavailable',
  VOUCHER_INVALID: 'voucherInvalid',
  VOUCHER_ERROR: 'voucherError',
  HAS_RELATED_DATA: 'hasRelatedData',
  FOREIGN_KEY_CONSTRAINT: 'foreignKeyConstraint',
  DATES_REQUIRED: 'datesRequired',
  NO_UNIT_ASSIGNED: 'noUnitAssigned',
  UNIT_NOT_FOUND: 'unitNotFound',
  UNIT_UNAVAILABLE: 'unitUnavailable',
  DATES_UNAVAILABLE: 'datesUnavailable',
  PRO_RATA_NOT_ALLOWED: 'proRataNotAllowed',

  // Generic
  VALIDATION_FAILED: 'validationFailed',
  NOT_FOUND: 'notFound',
  CONFLICT: 'conflict',
  RATE_LIMIT_EXCEEDED: 'rateLimitExceeded',
  INTERNAL_ERROR: 'internalError',
};

export const resolveErrorKey = (code) =>
  code && ERROR_KEY_MAP[code] ? ERROR_KEY_MAP[code] : null;
