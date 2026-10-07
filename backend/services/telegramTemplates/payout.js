// Telegram templates for instructor payout requests (EN + TR).
//
// Language: data.locale ('en' | 'tr'); falls back to TELEGRAM_DEFAULT_LOCALE
// and then English. Users have no stored language preference yet, so callers
// normally rely on the env default.

const FRONTEND_URL = (process.env.FRONTEND_URL || 'https://ukc.plannivo.com').replace(/\/$/, '');

const escapeHtml = (value = '') =>
  String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

const truncate = (str, max = 300) => {
  if (!str) return '';
  const s = String(str);
  return s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s;
};

const resolveLocale = (data = {}) => {
  const raw = String(data.locale || process.env.TELEGRAM_DEFAULT_LOCALE || 'en').toLowerCase();
  return raw.startsWith('tr') ? 'tr' : 'en';
};

const CURRENCY_SYMBOL = { EUR: '€', USD: '$', GBP: '£', TRY: '₺' };

export const formatPayoutMoney = (amount, currency = 'EUR') => {
  const n = Number(amount);
  const value = Number.isFinite(n) ? n.toFixed(2) : String(amount ?? '');
  const symbol = CURRENCY_SYMBOL[String(currency || 'EUR').toUpperCase()];
  return symbol ? `${symbol}${value}` : `${value} ${currency}`;
};

const METHOD_LABELS = {
  en: { bank_transfer: 'bank transfer', cash: 'cash', card: 'card', other: 'other' },
  tr: { bank_transfer: 'banka havalesi', cash: 'nakit', card: 'kart', other: 'diğer' },
};

const methodLabel = (method, locale) => {
  if (!method) return null;
  return METHOD_LABELS[locale]?.[method] || String(method).replace(/_/g, ' ');
};

const link = (href, label) => `<a href="${FRONTEND_URL}${href}">${escapeHtml(label)} →</a>`;

const STRINGS = {
  en: {
    createdTitle: '💸 <b>Payout request</b>',
    createdBody: (name, amount, available) => `${name} requests <b>${amount}</b> (available ${available})`,
    method: 'Preferred method',
    openRequests: 'Open payout requests',
    paidTitle: '✅ <b>Payout paid</b>',
    paidBody: (amount, method) => `Your payout of <b>${amount}</b> was paid${method ? ` (${method})` : ''}.`,
    reference: 'Reference',
    rejectedTitle: '❌ <b>Payout request declined</b>',
    rejectedBody: (amount, reason) => `Your payout request of <b>${amount}</b> was declined: ${reason}`,
    openEarnings: 'Open my earnings',
  },
  tr: {
    createdTitle: '💸 <b>Ödeme talebi</b>',
    createdBody: (name, amount, available) => `${name} <b>${amount}</b> ödeme talep ediyor (kullanılabilir ${available})`,
    method: 'Tercih edilen yöntem',
    openRequests: 'Ödeme taleplerini aç',
    paidTitle: '✅ <b>Ödeme yapıldı</b>',
    paidBody: (amount, method) => `<b>${amount}</b> tutarındaki ödemen yapıldı${method ? ` (${method})` : ''}.`,
    reference: 'Referans',
    rejectedTitle: '❌ <b>Ödeme talebi reddedildi</b>',
    rejectedBody: (amount, reason) => `<b>${amount}</b> tutarındaki ödeme talebin reddedildi: ${reason}`,
    openEarnings: 'Kazançlarımı aç',
  },
};

/** Staff (admin/manager) alert: an instructor asked for a payout. */
export function buildPayoutRequestCreated(data = {}) {
  const locale = resolveLocale(data);
  const s = STRINGS[locale];
  const currency = data.currency || 'EUR';
  const lines = [
    s.createdTitle,
    '',
    s.createdBody(
      escapeHtml(data.instructorName || '—'),
      formatPayoutMoney(data.amount, currency),
      formatPayoutMoney(data.available, currency),
    ),
  ];
  const method = methodLabel(data.preferredMethod, locale);
  if (method) lines.push(`💳 ${s.method}: ${escapeHtml(method)}`);
  if (data.note) lines.push('', `<i>${escapeHtml(truncate(data.note))}</i>`);
  lines.push('', link(data?.cta?.href || '/finance/payout-requests', s.openRequests));
  return lines.join('\n');
}

/** Instructor: their payout was paid. */
export function buildPayoutRequestPaid(data = {}) {
  const locale = resolveLocale(data);
  const s = STRINGS[locale];
  const lines = [
    s.paidTitle,
    '',
    s.paidBody(formatPayoutMoney(data.amount, data.currency || 'EUR'), escapeHtml(methodLabel(data.paymentMethod, locale) || '')),
  ];
  if (data.referenceNumber) lines.push(`🧾 ${s.reference}: ${escapeHtml(data.referenceNumber)}`);
  lines.push('', link(data?.cta?.href || '/finance', s.openEarnings));
  return lines.join('\n');
}

/** Instructor: their payout request was declined. */
export function buildPayoutRequestRejected(data = {}) {
  const locale = resolveLocale(data);
  const s = STRINGS[locale];
  return [
    s.rejectedTitle,
    '',
    s.rejectedBody(formatPayoutMoney(data.amount, data.currency || 'EUR'), escapeHtml(truncate(data.reason || '—'))),
    '',
    link(data?.cta?.href || '/finance', s.openEarnings),
  ].join('\n');
}

export default { buildPayoutRequestCreated, buildPayoutRequestPaid, buildPayoutRequestRejected };
