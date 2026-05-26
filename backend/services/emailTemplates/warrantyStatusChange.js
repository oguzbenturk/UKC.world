import { buildBrandedEmail } from './brandedLayout.js';
import { customerTrackUrl, statusLabel, SUPPORT_EMAIL } from './warrantyShared.js';

const COPY = {
  tr: {
    subject: (status) => `Garanti talebiniz: ${statusLabel(status, 'tr')}`,
    eyebrow: 'UKC.Care · Güncelleme',
    titleFor: (status) => `Durum: ${statusLabel(status, 'tr')}`,
    greeting: (name) => `Merhaba ${name},`,
    intro: 'Garanti talebinizin durumunda bir güncelleme var.',
    detailsLabel: { product: 'Ürün', code: 'Takip kodu', from: 'Önceki durum', to: 'Yeni durum' },
    noteLabel: 'Ekibimizden not',
    cta: 'Talebimi aç',
    fineprint: [`Sorularınız için: ${SUPPORT_EMAIL}`]
  },
  en: {
    subject: (status) => `Your warranty claim: ${statusLabel(status, 'en')}`,
    eyebrow: 'UKC.Care · Update',
    titleFor: (status) => `Status: ${statusLabel(status, 'en')}`,
    greeting: (name) => `Hi ${name},`,
    intro: 'There is an update on your warranty claim.',
    detailsLabel: { product: 'Product', code: 'Tracking code', from: 'Previous status', to: 'New status' },
    noteLabel: 'A note from our team',
    cta: 'Open my claim',
    fineprint: [`Questions? Contact ${SUPPORT_EMAIL}`]
  }
};

export function buildWarrantyStatusChangeEmail({ claim, previous, next, note = null }) {
  const lang = (claim?.preferred_language === 'tr') ? 'tr' : 'en';
  const copy = COPY[lang];
  const url = customerTrackUrl(claim.customer_token);
  const greetingName = claim.customer_name || (lang === 'tr' ? 'müşterimiz' : 'there');

  const details = [
    { label: copy.detailsLabel.product, value: claim.product_name },
    { label: copy.detailsLabel.code,    value: claim.customer_token },
    { label: copy.detailsLabel.from,    value: statusLabel(previous, lang) },
    { label: copy.detailsLabel.to,      value: statusLabel(next, lang) }
  ];

  const paragraphs = [copy.intro];
  if (note && note.trim()) {
    paragraphs.push(`<strong>${copy.noteLabel}:</strong><br>${note.trim().replace(/\n/g, '<br>')}`);
  }

  const html = buildBrandedEmail({
    preheader: copy.titleFor(next),
    eyebrow: copy.eyebrow,
    title: copy.titleFor(next),
    greeting: copy.greeting(greetingName),
    bodyParagraphs: paragraphs,
    details,
    ctaLabel: copy.cta,
    ctaUrl: url,
    fineprint: copy.fineprint
  });

  const text = [
    copy.greeting(greetingName),
    '',
    copy.intro,
    '',
    `${copy.detailsLabel.product}: ${claim.product_name}`,
    `${copy.detailsLabel.code}: ${claim.customer_token}`,
    `${copy.detailsLabel.from}: ${statusLabel(previous, lang)}`,
    `${copy.detailsLabel.to}: ${statusLabel(next, lang)}`,
    note ? `\n${copy.noteLabel}:\n${note}` : '',
    '',
    `${copy.cta}: ${url}`
  ].filter(Boolean).join('\n');

  return { subject: copy.subject(next), html, text };
}

export function buildWarrantyCustomerUpdateEmail({ claim, body }) {
  const lang = (claim?.preferred_language === 'tr') ? 'tr' : 'en';
  const copy = COPY[lang];
  const url = customerTrackUrl(claim.customer_token);
  const greetingName = claim.customer_name || (lang === 'tr' ? 'müşterimiz' : 'there');

  const subject = lang === 'tr'
    ? `Garanti talebinizle ilgili güncelleme — ${claim.product_name}`
    : `Update on your warranty claim — ${claim.product_name}`;

  const titleText = lang === 'tr' ? 'Ekibimizden mesaj' : 'A message from our team';

  const html = buildBrandedEmail({
    preheader: titleText,
    eyebrow: copy.eyebrow,
    title: titleText,
    greeting: copy.greeting(greetingName),
    bodyParagraphs: [body.replace(/\n/g, '<br>')],
    details: [
      { label: copy.detailsLabel.product, value: claim.product_name },
      { label: copy.detailsLabel.code,    value: claim.customer_token },
      { label: copy.detailsLabel.to,      value: statusLabel(claim.status, lang) }
    ],
    ctaLabel: copy.cta,
    ctaUrl: url,
    fineprint: copy.fineprint
  });

  const text = [
    copy.greeting(greetingName),
    '',
    body,
    '',
    `${copy.cta}: ${url}`
  ].join('\n');

  return { subject, html, text };
}

export default { buildWarrantyStatusChangeEmail, buildWarrantyCustomerUpdateEmail };
