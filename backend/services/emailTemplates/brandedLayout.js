// Shared dark-mode email layout for UKC• Duotone Pro Center Urla.
// Built to render consistently in Gmail, Outlook, Apple Mail, and mobile clients —
// table-based, inline-styled, no external CSS, no SVG (some clients block it).

const escapeHtml = (value = '') =>
  String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const COLOR = {
  bg: '#0f1013',
  card: '#16181f',
  cardBorder: '#23262f',
  innerBorder: '#1e2129',
  text: '#e5e7eb',
  textMuted: '#9ca3af',
  textFaint: '#6b7280',
  accent: '#00a8c4',
  accentText: '#04222a',
  divider: '#23262f'
};

const FONT_STACK =
  "'Helvetica Neue', Helvetica, Arial, 'Segoe UI', system-ui, -apple-system, sans-serif";

const renderBrandMark = () => `
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto;">
    <tr>
      <td style="font-family:${FONT_STACK};color:#ffffff;font-size:34px;font-weight:800;letter-spacing:-0.02em;line-height:1;padding:0;">
        UKC<span style="display:inline-block;width:9px;height:9px;background:${COLOR.accent};border-radius:50%;margin-left:3px;vertical-align:middle;position:relative;top:-2px;"></span>
      </td>
    </tr>
    <tr>
      <td style="font-family:${FONT_STACK};color:${COLOR.textFaint};font-size:10px;letter-spacing:0.28em;text-transform:uppercase;padding-top:8px;text-align:center;">
        Duotone Pro Center · Urla
      </td>
    </tr>
  </table>
`;

const renderCta = (label, url) => {
  if (!label || !url) return '';
  const safeUrl = escapeHtml(url);
  const safeLabel = escapeHtml(label);
  return `
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:32px auto;">
    <tr>
      <td style="border-radius:10px;background:${COLOR.accent};">
        <a href="${safeUrl}" style="display:inline-block;padding:14px 36px;font-family:${FONT_STACK};font-size:13px;font-weight:700;letter-spacing:0.18em;text-transform:uppercase;color:${COLOR.accentText};text-decoration:none;border-radius:10px;">
          ${safeLabel}
        </a>
      </td>
    </tr>
  </table>
  `;
};

const renderRawLink = (url) => {
  if (!url) return '';
  const safeUrl = escapeHtml(url);
  return `
  <p style="margin:0 0 4px;font-family:${FONT_STACK};color:${COLOR.textFaint};font-size:11px;letter-spacing:0.12em;text-transform:uppercase;">
    Or paste this link
  </p>
  <p style="margin:0 0 24px;font-family:${FONT_STACK};color:${COLOR.accent};font-size:12px;word-break:break-all;line-height:1.5;">
    <a href="${safeUrl}" style="color:${COLOR.accent};text-decoration:none;">${safeUrl}</a>
  </p>
  `;
};

const renderDetailsTable = (details) => {
  if (!details || !details.length) return '';
  const rows = details
    .filter((row) => row && row.value)
    .map(
      ({ label, value }) => `
        <tr>
          <td style="padding:10px 0;border-bottom:1px solid ${COLOR.innerBorder};font-family:${FONT_STACK};color:${COLOR.textFaint};font-size:11px;letter-spacing:0.18em;text-transform:uppercase;width:110px;">
            ${escapeHtml(label)}
          </td>
          <td style="padding:10px 0;border-bottom:1px solid ${COLOR.innerBorder};font-family:${FONT_STACK};color:#ffffff;font-size:14px;font-weight:600;">
            ${escapeHtml(value)}
          </td>
        </tr>
      `
    )
    .join('');
  if (!rows) return '';
  return `
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:24px 0 8px;border-collapse:collapse;">
    ${rows}
  </table>
  `;
};

/**
 * Build a fully styled HTML email body.
 *
 * @param {Object} opts
 * @param {string} [opts.preheader]      Hidden preview text (shown next to subject in inbox lists).
 * @param {string} [opts.eyebrow]        Small uppercase label above the title.
 * @param {string} opts.title            Main heading.
 * @param {string} [opts.greeting]       Salutation line ("Hi Alice,").
 * @param {string[]} [opts.bodyParagraphs] HTML-allowed paragraphs.
 * @param {Array<{label:string,value:string}>} [opts.details] Rendered as a label/value table.
 * @param {string} [opts.ctaLabel]       Button text.
 * @param {string} [opts.ctaUrl]         Button URL.
 * @param {boolean} [opts.includeRawLink=true] Render the raw link below the CTA for clients that strip buttons.
 * @param {string[]} [opts.fineprint]    Lines rendered as small muted text under the body.
 */
export function buildBrandedEmail({
  preheader = '',
  eyebrow = '',
  title,
  greeting = '',
  bodyParagraphs = [],
  details = [],
  ctaLabel = '',
  ctaUrl = '',
  includeRawLink = true,
  fineprint = []
}) {
  const safePreheader = escapeHtml(preheader);
  const safeEyebrow = escapeHtml(eyebrow);
  const safeTitle = escapeHtml(title);
  const safeGreeting = escapeHtml(greeting);

  const paragraphs = bodyParagraphs
    .filter(Boolean)
    .map(
      (p) => `
      <p style="margin:0 0 16px;font-family:${FONT_STACK};color:${COLOR.text};font-size:15px;line-height:1.65;">
        ${p}
      </p>`
    )
    .join('');

  const fineprintHtml = fineprint
    .filter(Boolean)
    .map(
      (line) => `
      <p style="margin:0 0 6px;font-family:${FONT_STACK};color:${COLOR.textFaint};font-size:12px;line-height:1.6;">
        ${escapeHtml(line)}
      </p>`
    )
    .join('');

  const ctaHtml = renderCta(ctaLabel, ctaUrl);
  const rawLinkHtml = includeRawLink ? renderRawLink(ctaUrl) : '';
  const detailsHtml = renderDetailsTable(details);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="dark">
  <meta name="supported-color-schemes" content="dark">
  <title>${safeTitle}</title>
</head>
<body style="margin:0;padding:0;background:${COLOR.bg};">
  <span style="display:none !important;visibility:hidden;opacity:0;color:transparent;height:0;width:0;overflow:hidden;mso-hide:all;">
    ${safePreheader}
  </span>

  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:${COLOR.bg};">
    <tr>
      <td align="center" style="padding:40px 16px;">

        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:560px;">

          <tr>
            <td align="center" style="padding:8px 0 28px;">
              ${renderBrandMark()}
            </td>
          </tr>

          <tr>
            <td style="background:${COLOR.card};border:1px solid ${COLOR.cardBorder};border-radius:20px;padding:40px 36px;">

              ${
                safeEyebrow
                  ? `<p style="margin:0 0 12px;font-family:${FONT_STACK};color:${COLOR.accent};font-size:11px;letter-spacing:0.28em;text-transform:uppercase;font-weight:700;">
                       ${safeEyebrow}
                     </p>`
                  : ''
              }

              <h1 style="margin:0 0 24px;font-family:${FONT_STACK};color:#ffffff;font-size:26px;font-weight:700;letter-spacing:-0.01em;line-height:1.25;">
                ${safeTitle}
              </h1>

              ${
                safeGreeting
                  ? `<p style="margin:0 0 16px;font-family:${FONT_STACK};color:${COLOR.text};font-size:15px;line-height:1.65;">
                       ${safeGreeting}
                     </p>`
                  : ''
              }

              ${paragraphs}

              ${detailsHtml}

              ${ctaHtml}

              ${rawLinkHtml}

              ${
                fineprintHtml
                  ? `<div style="margin-top:24px;padding-top:20px;border-top:1px solid ${COLOR.divider};">
                       ${fineprintHtml}
                     </div>`
                  : ''
              }

            </td>
          </tr>

          <tr>
            <td align="center" style="padding:24px 16px 8px;">
              <p style="margin:0 0 6px;font-family:${FONT_STACK};color:${COLOR.textFaint};font-size:11px;letter-spacing:0.18em;text-transform:uppercase;">
                UKC<span style="color:${COLOR.accent};">·</span> Duotone Pro Center Urla
              </p>
              <p style="margin:0;font-family:${FONT_STACK};color:${COLOR.textFaint};font-size:11px;line-height:1.6;">
                Plannivo · ${new Date().getFullYear()}
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export default { buildBrandedEmail };
