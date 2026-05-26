import { buildBrandedEmail } from './brandedLayout.js';
import { customerTrackUrl, statusLabel, SUPPORT_EMAIL } from './warrantyShared.js';

export function buildWarrantyClaimClosedEmail({ claim }) {
  const lang = (claim?.preferred_language === 'tr') ? 'tr' : 'en';
  const url = customerTrackUrl(claim.customer_token);
  const greetingName = claim.customer_name || (lang === 'tr' ? 'müşterimiz' : 'there');
  const isTr = lang === 'tr';

  const subject = isTr
    ? `Garanti talebiniz kapatıldı — ${claim.product_name}`
    : `Your warranty claim is closed — ${claim.product_name}`;
  const eyebrow = isTr ? 'UKC.Care · Kapatıldı' : 'UKC.Care · Closed';
  const title = isTr ? 'Talebiniz kapatıldı' : 'Your claim has been closed';
  const greeting = isTr ? `Merhaba ${greetingName},` : `Hi ${greetingName},`;
  const intro = isTr
    ? 'Garanti talebinizin işlemleri tamamlandı ve dosya kapatılmıştır. Sayfa açık kalacak, ancak yüklediğiniz fotoğraf ve videolar gizlilik gereği sunucudan silinmiştir.'
    : 'Your warranty claim has been completed and the file is now closed. The tracking page stays available, but the photos and videos you uploaded have been removed from our servers for privacy.';
  const labelProduct = isTr ? 'Ürün' : 'Product';
  const labelCode    = isTr ? 'Takip kodu' : 'Tracking code';
  const labelOutcome = isTr ? 'Sonuç' : 'Outcome';
  const labelTeam    = isTr ? 'Bizimle iletişim' : 'Contact us';
  const ctaLabel     = isTr ? 'Talebi görüntüle' : 'View claim';

  const html = buildBrandedEmail({
    preheader: title,
    eyebrow,
    title,
    greeting,
    bodyParagraphs: [intro],
    details: [
      { label: labelProduct, value: claim.product_name },
      { label: labelCode,    value: claim.customer_token },
      { label: labelOutcome, value: statusLabel(claim.status, lang) },
      { label: labelTeam,    value: SUPPORT_EMAIL }
    ],
    ctaLabel,
    ctaUrl: url,
    fineprint: [
      isTr
        ? 'Aynı ürün için yeni bir sorun yaşarsanız yeni bir talep oluşturabilirsiniz.'
        : 'If you experience a new issue with this product, please open a new claim.',
      `${isTr ? 'Sorularınız için' : 'Questions?'} ${SUPPORT_EMAIL}`
    ]
  });

  const text = [
    greeting,
    '',
    intro,
    '',
    `${labelProduct}: ${claim.product_name}`,
    `${labelCode}: ${claim.customer_token}`,
    `${labelOutcome}: ${statusLabel(claim.status, lang)}`,
    '',
    `${ctaLabel}: ${url}`
  ].join('\n');

  return { subject, html, text };
}

export default { buildWarrantyClaimClosedEmail };
