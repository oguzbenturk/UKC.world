const DEFAULT_BASE_URL = process.env.APP_BASE_URL
  || process.env.FRONTEND_URL
  || process.env.PUBLIC_APP_URL
  || 'https://app.plannivo.com';

const DEFAULT_DASHBOARD_PATH = process.env.WAIVER_PORTAL_PATH || '/student/family';
const GlobalIntl = typeof globalThis !== 'undefined' ? globalThis.Intl : null;

function formatSignedAt(timestamp) {
  if (!timestamp) {
    return 'just now';
  }

  try {
    const date = typeof timestamp === 'string' || typeof timestamp === 'number'
      ? new Date(timestamp)
      : timestamp;

    if (!GlobalIntl?.DateTimeFormat) {
      return date.toISOString();
    }

    return new GlobalIntl.DateTimeFormat('en-US', {
      dateStyle: 'full',
      timeStyle: 'short'
    }).format(date);
  } catch (error) {
    return 'just now';
  }
}

function escapeHtml(value = '') {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function buildWaiverConfirmationEmail({
  signerName,
  recipientEmail,
  waiverVersion,
  signedAt,
  familyMemberName = null,
  languageCode = 'en',
  photoConsent = false,
  waiverDashboardUrl,
  signaturePreviewUrl = null
} = {}) {
  const formattedDate = formatSignedAt(signedAt);
  const dashboardUrl = (waiverDashboardUrl || `${DEFAULT_BASE_URL.replace(/\/$/, '')}${DEFAULT_DASHBOARD_PATH}`);
  const subject = familyMemberName
    ? `Waiver confirmed for ${familyMemberName}`
    : 'Your liability waiver is confirmed';

  const greetingName = signerName || recipientEmail || 'there';
  const familyLine = familyMemberName
    ? `<p style="margin:0 0 16px;color:#1f2937;font-size:15px;">This confirmation covers <strong>${escapeHtml(familyMemberName)}</strong>.</p>`
    : '';

  const consentLine = photoConsent
    ? '<li>Photo & video consent was granted.</li>'
    : '<li>Photo & video consent was declined.</li>';

  const signaturePreview = signaturePreviewUrl
    ? `<div style="margin:24px 0;text-align:center;"><img src="${escapeHtml(signaturePreviewUrl)}" alt="Signature preview" style="max-width:320px;border:1px solid #e2e8f0;border-radius:8px;padding:12px;background-color:#f8fafc;"/></div>`
    : '';

  const html = `
  <div style="font-family:'Segoe UI',Tahoma,Verdana,Arial,sans-serif;background-color:#f1f5f9;padding:32px 0;">
    <table role="presentation" width="100%" style="max-width:640px;margin:0 auto;background-color:#ffffff;border-radius:12px;box-shadow:0 10px 40px rgba(15,23,42,0.1);overflow:hidden;">
      <tr>
        <td style="background:linear-gradient(135deg,#0ea5e9,#1d4ed8);padding:24px;color:#ffffff;">
          <h1 style="margin:0;font-size:22px;font-weight:600;">Liability Waiver Confirmation</h1>
          <p style="margin:8px 0 0;font-size:15px;opacity:0.9;">Version ${escapeHtml(waiverVersion || 'latest')} • ${escapeHtml(formattedDate)}</p>
        </td>
      </tr>
      <tr>
        <td style="padding:28px 24px 16px;color:#0f172a;">
          <p style="margin:0 0 16px;font-size:15px;color:#1f2937;">Hi ${escapeHtml(greetingName)},</p>
          <p style="margin:0 0 16px;color:#1f2937;font-size:15px;">Thank you for completing the Plannivo liability waiver. We've recorded your signature and stored the signed document securely.</p>
          ${familyLine}
          <ul style="margin:0 0 20px 20px;padding:0;color:#1f2937;font-size:15px;line-height:1.6;">
            <li>Signed on ${escapeHtml(formattedDate)}</li>
            <li>Waiver version: ${escapeHtml(waiverVersion || 'latest')} (${escapeHtml(languageCode.toUpperCase())})</li>
            ${consentLine}
          </ul>
          <p style="margin:0 0 16px;color:#1f2937;font-size:15px;">You can review or download your waiver at any time from the Family & Waivers section of your dashboard.</p>
          <div style="margin:24px 0;">
            <a href="${escapeHtml(dashboardUrl)}" style="display:inline-block;padding:12px 20px;background-color:#0ea5e9;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:600;">Open Family & Waivers</a>
          </div>
          ${signaturePreview}
          <p style="margin:0 0 8px;color:#1f2937;font-size:14px;">Need to make changes or spotted an issue? Reply to this email or contact our team and we’ll help right away.</p>
        </td>
      </tr>
      <tr>
        <td style="padding:20px 24px;background-color:#f8fafc;color:#475569;font-size:12px;line-height:1.6;">
          <p style="margin:0 0 6px;font-weight:600;color:#1e293b;">Plannivo Waiver Operations</p>
          <p style="margin:0;">We keep your signatures secure and compliant. This confirmation email is automatically generated—no further action required.</p>
        </td>
      </tr>
    </table>
  </div>
  `;

  const textLines = [
    `Hi ${greetingName},`,
    '',
    'Thanks for completing the Plannivo liability waiver.',
    familyMemberName ? `This confirmation covers ${familyMemberName}.` : undefined,
    `Signed on: ${formattedDate}`,
    `Waiver version: ${waiverVersion || 'latest'} (${languageCode.toUpperCase()})`,
    photoConsent ? 'Photo & video consent: granted' : 'Photo & video consent: declined',
    '',
    `View your waiver: ${dashboardUrl}`,
    '',
    'Keep this email for your records. No further action is required.'
  ].filter(Boolean);

  const text = textLines.join('\n');

  return {
    subject,
    html,
    text
  };
}

export default {
  buildWaiverConfirmationEmail
};
