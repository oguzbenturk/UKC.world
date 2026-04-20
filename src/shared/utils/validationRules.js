/**
 * i18n-aware AntD Form rule builders.
 *
 * Usage inside a Form.Item:
 *   <Form.Item rules={[req(), email()]}>
 *   <Form.Item rules={[req(), minLen(8)]}>
 *   <Form.Item rules={[req('common:validation.required'), pattern(/^\d+$/)]}>
 *
 * All rules return fresh objects on every call so they pick up the current
 * i18n language at render time.
 */

import i18n from '@/i18n';

const tr = (key, vars, fallback) =>
  i18n.t(key, { ...(vars || {}), defaultValue: fallback ?? key });

export const req = (overrideKey) => ({
  required: true,
  message: overrideKey
    ? tr(overrideKey, null, 'Required')
    : tr('common:validation.required', null, 'Required'),
});

export const email = (overrideKey) => ({
  type: 'email',
  message: overrideKey
    ? tr(overrideKey, null, 'Enter a valid email')
    : tr('common:validation.email', null, 'Enter a valid email'),
});

export const minLen = (count, overrideKey) => ({
  min: count,
  message: overrideKey
    ? tr(overrideKey, { count }, `At least ${count} characters`)
    : tr('common:validation.minLen', { count }, `At least ${count} characters`),
});

export const maxLen = (count, overrideKey) => ({
  max: count,
  message: overrideKey
    ? tr(overrideKey, { count }, `At most ${count} characters`)
    : tr('common:validation.maxLen', { count }, `At most ${count} characters`),
});

export const pattern = (regex, overrideKey) => ({
  pattern: regex,
  message: overrideKey
    ? tr(overrideKey, null, 'Invalid format')
    : tr('common:validation.pattern', null, 'Invalid format'),
});

export const phone = (overrideKey) => ({
  pattern: /^\+?[0-9\s\-()]{6,}$/,
  message: overrideKey
    ? tr(overrideKey, null, 'Enter a valid phone number')
    : tr('common:validation.phone', null, 'Enter a valid phone number'),
});
