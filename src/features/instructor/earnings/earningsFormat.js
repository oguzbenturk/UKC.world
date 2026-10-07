// Formatting + money helpers for the instructor earnings page.
// All client-side money math goes through Decimal.js (never float arithmetic).
import { useCallback, useMemo } from 'react';
import Decimal from 'decimal.js';
import dayjs from 'dayjs';
import { useTranslation } from 'react-i18next';
import { useCurrency } from '@/shared/contexts/CurrencyContext';

export const dec = (value) => {
  try {
    const d = new Decimal(value ?? 0);
    return d.isFinite() ? d : new Decimal(0);
  } catch {
    return new Decimal(0);
  }
};

// Share of `value` relative to `max` as a 0–100 number (for bar widths / progress).
export const percentOf = (value, max) => {
  const m = dec(max);
  if (m.lte(0)) return 0;
  return Decimal.min(Decimal.max(dec(value).div(m).times(100), 0), 100).toDecimalPlaces(1).toNumber();
};

export const formatHours = (hours, locale) => {
  const n = dec(hours).toDecimalPlaces(2).toNumber();
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(n);
};

// Plain dates (YYYY-MM-DD) are parsed as local dates — never via `new Date()`,
// which would treat them as UTC midnight and shift the day west of Greenwich.
export const toLocalDate = (value) => {
  if (!value) return null;
  const parsed = dayjs(typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00` : value);
  return parsed.isValid() ? parsed : null;
};

export const dayKey = (value) => toLocalDate(value)?.format('YYYY-MM-DD') ?? '';

export const formatShortDate = (value, locale) => {
  const d = toLocalDate(value);
  if (!d) return '';
  return new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric' }).format(d.toDate());
};

export const formatMonthName = (value, locale, opts = { month: 'short' }) => {
  const d = toLocalDate(value);
  if (!d) return '';
  return new Intl.DateTimeFormat(locale, opts).format(d.toDate());
};

// startHour may come back as "10:30", "10:30:00" or a decimal hour (10.5).
export const formatStartHour = (startHour) => {
  if (startHour == null || startHour === '') return '';
  if (typeof startHour === 'string' && startHour.includes(':')) return startHour.slice(0, 5);
  const n = Number(startHour);
  if (!Number.isFinite(n)) return '';
  const h = Math.floor(n);
  const m = Math.round((n - h) * 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};

export const initials = (name = '') => name
  .split(/\s+/)
  .filter(Boolean)
  .slice(0, 2)
  .map((part) => part[0]?.toUpperCase())
  .join('') || '·';

export const formatRelativeTime = (value, locale, now = Date.now()) => {
  const d = toLocalDate(value);
  if (!d) return '';
  const diffSec = Math.round((d.valueOf() - now) / 1000);
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  const abs = Math.abs(diffSec);
  if (abs < 60) return rtf.format(0, 'minute');
  if (abs < 3600) return rtf.format(Math.round(diffSec / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(diffSec / 3600), 'hour');
  return rtf.format(Math.round(diffSec / 86400), 'day');
};

// "Month" period label like "October 2026", week as a date range, year as "2026".
export const formatPeriodLabel = (period, locale, t) => {
  if (!period) return '';
  const start = toLocalDate(period.start);
  if (period.key === 'all' || !start) return period.key === 'all' ? t('instructor:earnings.period.all') : (period.label || '');
  if (period.key === 'month') return new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(start.toDate());
  if (period.key === 'year') return String(start.year());
  const end = toLocalDate(period.end);
  return end ? `${formatShortDate(start, locale)} – ${formatShortDate(end, locale)}` : formatShortDate(start, locale);
};

/**
 * Currency-aware money formatting built on the app's useCurrency().formatCurrency.
 * Instructors are a staff role, so the display currency is always the business
 * currency the API reports (no dual-currency rendering needed).
 */
export function useMoney(currency = 'EUR') {
  const { formatCurrency } = useCurrency();
  const { i18n } = useTranslation();
  const locale = i18n?.language || 'en';

  const money = useCallback((amount, { signed = false } = {}) => {
    const d = dec(amount);
    const body = formatCurrency(d.abs().toFixed(2), currency);
    if (d.isNegative() && !d.isZero()) return `−${body}`;
    if (signed && d.gt(0)) return `+${body}`;
    return body;
  }, [formatCurrency, currency]);

  // Splits "€428.57" into ["€428", ".57"] for the hero figure.
  const splitMoney = useCallback((amount) => {
    const text = money(amount);
    const match = text.match(/^(.*?)([.,]\d+)(\D*)$/);
    return match ? [match[1], match[2] + match[3]] : [text, ''];
  }, [money]);

  return useMemo(() => ({ money, splitMoney, locale }), [money, splitMoney, locale]);
}

export const formatRate = (commissionType, rate, money, t) => {
  if (rate == null) return '';
  if (commissionType === 'percentage') return t('instructor:earnings.rate.percent', { value: dec(rate).toDecimalPlaces(2).toString() });
  if (commissionType === 'fixed_per_lesson') return t('instructor:earnings.rate.perLesson', { amount: money(rate) });
  return t('instructor:earnings.rate.perHour', { amount: money(rate) });
};

const KNOWN_METHODS = ['bank_transfer', 'cash', 'other', 'card', 'wallet', 'credit_card', 'paypal'];

export const formatMethod = (method, t) => {
  if (!method) return '';
  const key = String(method).toLowerCase();
  if (KNOWN_METHODS.includes(key)) return t(`instructor:earnings.methods.${key}`);
  return key.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
};

// Derives the request-button state from the summary contract.
export const getPayoutState = (summary) => {
  const available = dec(summary?.balances?.available);
  const pending = summary?.pendingRequest ?? null;
  const meets = Boolean(summary?.threshold?.meets) && available.gt(0);
  if (pending) return { kind: 'pending', pending, available };
  if (meets) return { kind: 'ready', available };
  return { kind: 'below', available };
};

export const parseAmount = (raw) => {
  const text = String(raw ?? '').trim().replace(/\s/g, '').replace(',', '.');
  if (!text) return { empty: true };
  if (!/^\d+(\.\d{0,2})?$/.test(text)) return { invalid: true };
  return { value: dec(text) };
};

// Returns an i18n error descriptor for the amount, or null when valid.
export const validatePayoutAmount = (raw, { available, minimum }) => {
  const parsed = parseAmount(raw);
  if (parsed.empty) return { key: 'required' };
  if (parsed.invalid || parsed.value.lte(0)) return { key: 'invalid' };
  if (parsed.value.gt(dec(available))) return { key: 'max' };
  if (minimum != null && parsed.value.lt(dec(minimum))) return { key: 'min' };
  return null;
};
