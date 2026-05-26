const FRONTEND_URL = (process.env.FRONTEND_URL || 'https://ukc.plannivo.com').replace(/\/$/, '');

const escapeHtml = (value = '') =>
  String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

const truncate = (str, max = 400) => {
  if (!str) return '';
  return str.length > max ? `${str.slice(0, max - 1).trimEnd()}…` : str;
};

const adminClaimLink = (claimId) =>
  `<a href="${FRONTEND_URL}/admin/warranty/${escapeHtml(claimId)}">Open in admin →</a>`;

export function buildWarrantyClaimSubmitted(data = {}) {
  const {
    claimId,
    customerName,
    customerEmail,
    productName,
    issueDescription,
    photoCount = 0,
    videoCount = 0
  } = data;

  const lines = [
    '🛟 <b>New warranty claim</b>',
    ''
  ];
  if (productName) lines.push(`📦 <b>${escapeHtml(productName)}</b>`);
  if (customerName) lines.push(`👤 ${escapeHtml(customerName)}${customerEmail ? ` · ${escapeHtml(customerEmail)}` : ''}`);
  if (photoCount || videoCount) {
    lines.push(`📎 ${photoCount} photo${photoCount === 1 ? '' : 's'}, ${videoCount} video${videoCount === 1 ? '' : 's'}`);
  }
  if (issueDescription) {
    lines.push('', `<i>${escapeHtml(truncate(issueDescription, 400))}</i>`);
  }
  if (claimId) lines.push('', adminClaimLink(claimId));
  return lines.join('\n');
}

export default { buildWarrantyClaimSubmitted };
