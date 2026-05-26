import { buildBrandedEmail } from './brandedLayout.js';
import { customerTrackUrl, statusLabel, SUPPORT_EMAIL } from './warrantyShared.js';

const COPY = {
  tr: {
    subject: (productName) => `Garanti talebiniz alındı — ${productName}`,
    eyebrow: 'UKC.Care · Garanti',
    title: 'Garanti talebiniz alındı',
    greeting: (name) => `Merhaba ${name},`,
    intro: 'Garanti talebiniz başarıyla kaydedildi. Talebinizin durumunu aşağıdaki bağlantıdan istediğiniz zaman takip edebilirsiniz; bu bağlantı, ekibimiz talebi kapatana kadar aktif kalır.',
    detailsLabel: { product: 'Ürün', code: 'Takip kodu', status: 'Mevcut durum' },
    cta: 'Talebimi takip et',
    fineprint: [
      'Bu bağlantıyı saklayın — talep boyunca size sadece bu sayfa üzerinden ulaşılacak güncellemeler olacak.',
      `Sorularınız için ${SUPPORT_EMAIL} adresinden bize yazabilirsiniz.`
    ]
  },
  en: {
    subject: (productName) => `We received your warranty claim — ${productName}`,
    eyebrow: 'UKC.Care · Warranty',
    title: 'Your warranty claim was received',
    greeting: (name) => `Hi ${name},`,
    intro: 'Thank you for submitting your warranty claim. You can follow its progress at any time using the link below — it stays active until our team closes the claim.',
    detailsLabel: { product: 'Product', code: 'Tracking code', status: 'Current status' },
    cta: 'Open my claim',
    fineprint: [
      'Save this link — most updates from our team will appear on this page.',
      `Questions? Contact ${SUPPORT_EMAIL} and reference your tracking code.`
    ]
  }
};

const isResend = (resend) => Boolean(resend);

export function buildWarrantyClaimSubmittedEmail({
  claim,
  resend = false
}) {
  const lang = (claim?.preferred_language === 'tr') ? 'tr' : 'en';
  const copy = COPY[lang];
  const url = customerTrackUrl(claim.customer_token);

  const subject = isResend(resend)
    ? (lang === 'tr'
        ? `Talep takip bağlantınız — ${claim.product_name}`
        : `Your warranty tracking link — ${claim.product_name}`)
    : copy.subject(claim.product_name);

  const greetingName = claim.customer_name || (lang === 'tr' ? 'müşterimiz' : 'there');
  const title = isResend(resend)
    ? (lang === 'tr' ? 'Takip bağlantınız' : 'Your tracking link')
    : copy.title;

  const html = buildBrandedEmail({
    preheader: copy.title,
    eyebrow: copy.eyebrow,
    title,
    greeting: copy.greeting(greetingName),
    bodyParagraphs: [copy.intro],
    details: [
      { label: copy.detailsLabel.product, value: claim.product_name },
      { label: copy.detailsLabel.code,    value: claim.customer_token },
      { label: copy.detailsLabel.status,  value: statusLabel(claim.status, lang) }
    ],
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
    `${copy.detailsLabel.status}: ${statusLabel(claim.status, lang)}`,
    '',
    `${copy.cta}: ${url}`,
    '',
    ...copy.fineprint
  ].join('\n');

  return { subject, html, text };
}

export default { buildWarrantyClaimSubmittedEmail };
