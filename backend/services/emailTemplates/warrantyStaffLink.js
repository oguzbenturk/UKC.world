import { buildBrandedEmail } from './brandedLayout.js';
import { staffPortalUrl, statusLabel, SUPPORT_EMAIL } from './warrantyShared.js';

export function buildWarrantyStaffLinkEmail({ claim, staffLink }) {
  const lang = (claim?.preferred_language === 'tr') ? 'tr' : 'en';
  const url = staffPortalUrl(staffLink.staff_token);
  const customer = claim.customer_name || (lang === 'tr' ? 'müşteri' : 'customer');

  const isTr = lang === 'tr';

  const subject = isTr
    ? `Garanti dosyası size atandı — ${claim.product_name}`
    : `Warranty case assigned to you — ${claim.product_name}`;

  const eyebrow = isTr ? 'UKC.Care · Garanti ekibi' : 'UKC.Care · Warranty team';
  const title = isTr ? 'Bir garanti dosyası size iletildi' : 'A warranty case is assigned to you';
  const greeting = isTr ? `Merhaba ${staffLink.staff_name},` : `Hi ${staffLink.staff_name},`;
  const intro = isTr
    ? 'Aşağıdaki bağlantı üzerinden dosyayı inceleyebilir, üretici takip numarasını girebilir, not ekleyebilir ve ek belgeleri yükleyebilirsiniz. Bağlantı, admin ekibi devre dışı bırakana kadar geçerli kalır.'
    : 'Use the link below to review the case, record the manufacturer claim number, add notes, and upload supporting documents. The link stays active until the admin team revokes it.';

  const labelProduct = isTr ? 'Ürün' : 'Product';
  const labelCustomer = isTr ? 'Müşteri' : 'Customer';
  const labelStatus   = isTr ? 'Mevcut durum' : 'Current status';
  const labelIssue    = isTr ? 'Sorun özeti' : 'Issue summary';
  const ctaLabel      = isTr ? 'Garanti portalını aç' : 'Open warranty portal';

  const issueSummary = (claim.issue_description || '').slice(0, 240);

  const html = buildBrandedEmail({
    preheader: title,
    eyebrow,
    title,
    greeting,
    bodyParagraphs: [intro],
    details: [
      { label: labelProduct,  value: claim.product_name },
      { label: labelCustomer, value: customer },
      { label: labelStatus,   value: statusLabel(claim.status, lang) },
      { label: labelIssue,    value: issueSummary }
    ],
    ctaLabel,
    ctaUrl: url,
    fineprint: [
      isTr ? 'Bu bağlantı size özeldir — başkalarıyla paylaşmayın.' : 'This link is unique to you — please do not share it.',
      `${isTr ? 'Sorularınız için' : 'Questions?'} ${SUPPORT_EMAIL}`
    ]
  });

  const text = [
    greeting,
    '',
    intro,
    '',
    `${labelProduct}: ${claim.product_name}`,
    `${labelCustomer}: ${customer}`,
    `${labelStatus}: ${statusLabel(claim.status, lang)}`,
    `${labelIssue}: ${issueSummary}`,
    '',
    `${ctaLabel}: ${url}`
  ].join('\n');

  return { subject, html, text };
}

export default { buildWarrantyStaffLinkEmail };
