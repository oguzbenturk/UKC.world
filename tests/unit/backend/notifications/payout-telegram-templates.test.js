import { describe, test, expect, beforeAll, afterEach } from '@jest/globals';

let buildTelegramMessageForType;
let NOTIFICATION_TYPES;
let PREFERENCE_MAP;

beforeAll(async () => {
  ({ buildTelegramMessageForType } = await import('../../../../backend/services/telegramTemplates/index.js'));
  ({ NOTIFICATION_TYPES, PREFERENCE_MAP } = await import('../../../../backend/services/notificationDispatcherUnified.js'));
});

afterEach(() => {
  delete process.env.TELEGRAM_DEFAULT_LOCALE;
});

describe('payout request notification types', () => {
  test('are registered and gated by payment_notifications', () => {
    for (const type of ['payout_request_created', 'payout_request_paid', 'payout_request_rejected']) {
      expect(NOTIFICATION_TYPES.has(type)).toBe(true);
      expect(PREFERENCE_MAP[type]).toBe('payment_notifications');
    }
  });
});

describe('payout Telegram templates (EN/TR)', () => {
  const created = {
    instructorName: 'Alice <b>', amount: 300, available: 420, currency: 'EUR', preferredMethod: 'bank_transfer', note: 'Rent',
    cta: { href: '/finance/payout-requests' },
  };

  test('staff alert (EN) escapes HTML and links to the requests list', () => {
    const text = buildTelegramMessageForType('payout_request_created', created);
    expect(text).toContain('Payout request');
    expect(text).toContain('Alice &lt;b&gt; requests <b>€300.00</b> (available €420.00)');
    expect(text).toContain('bank transfer');
    expect(text).toContain('/finance/payout-requests');
  });

  test('staff alert (TR via data.locale)', () => {
    const text = buildTelegramMessageForType('payout_request_created', { ...created, locale: 'tr' });
    expect(text).toContain('Ödeme talebi');
    expect(text).toContain('banka havalesi');
  });

  test('paid + rejected messages for the instructor', () => {
    const paid = buildTelegramMessageForType('payout_request_paid', { amount: 300, currency: 'EUR', paymentMethod: 'cash', referenceNumber: 'TR-1' });
    expect(paid).toContain('Your payout of <b>€300.00</b> was paid (cash).');
    expect(paid).toContain('TR-1');
    const rejected = buildTelegramMessageForType('payout_request_rejected', { amount: 300, currency: 'EUR', reason: 'Too early' });
    expect(rejected).toContain('Your payout request of <b>€300.00</b> was declined: Too early');
  });

  test('TELEGRAM_DEFAULT_LOCALE=tr switches the default language', () => {
    process.env.TELEGRAM_DEFAULT_LOCALE = 'tr';
    const rejected = buildTelegramMessageForType('payout_request_rejected', { amount: 50, reason: 'Eksik' });
    expect(rejected).toContain('reddedildi: Eksik');
  });
});
