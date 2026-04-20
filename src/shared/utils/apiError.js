/**
 * Extract a user-facing error message from an axios error.
 *
 * Resolution order:
 *   1. `err.translatedMessage` attached by the apiClient response interceptor
 *      (backend responses with a known `code`).
 *   2. `err.response.data.error` or `.message` — legacy backend responses.
 *   3. `err.message` — network / generic axios errors.
 *   4. The supplied `fallback` key (translated) or literal string.
 */

import i18n from '@/i18n';

export const getErrorMessage = (err, fallback = 'errors:internalError') => {
  if (!err) {
    return typeof fallback === 'string' && fallback.includes(':')
      ? i18n.t(fallback, { defaultValue: 'Something went wrong' })
      : fallback;
  }

  if (err.translatedMessage) return err.translatedMessage;

  const data = err.response?.data;
  if (typeof data?.error === 'string') return data.error;
  if (typeof data?.message === 'string') return data.message;

  if (err.message) return err.message;

  return typeof fallback === 'string' && fallback.includes(':')
    ? i18n.t(fallback, { defaultValue: 'Something went wrong' })
    : fallback;
};

export const getErrorCode = (err) => err?.response?.data?.code || null;
