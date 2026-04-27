// Shared light-mode email layout for UKC. (powered by Plannivo).
// Built for cross-client rendering (Gmail, Outlook, Apple Mail, mobile) —
// table-based, fully inline-styled, no external assets, no @media reliance,
// no SVG. The brand mark is HTML-only: "UKC" letterforms + a circular emerald dot.

const escapeHtml = (value = '') =>
  String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

// ---------- Tokens ----------
const COLOR = {
  // Surfaces
  page: '#f1f5f9',         // slate-100
  card: '#ffffff',
  inset: '#f8fafc',        // slate-50 — details panel
  // Lines
  hairline: '#e2e8f0',     // slate-200
  divider: '#e2e8f0',
  // Text
  ink: '#0f172a',          // slate-900 — headings, value cells
  body: '#334155',          // slate-700 — paragraphs
  muted: '#64748b',         // slate-500 — fineprint, labels
  faint: '#94a3b8',         // slate-400 — taglines
  // Brand
  brand: '#34d399',         // emerald-400 — the dot, hairline, accents
  brandStrong: '#10b981',   // emerald-500 — primary CTA fill
  brandDeep: '#047857',     // emerald-700 — link text
  brandTint: '#059669',     // emerald-600 — eyebrow
  white: '#ffffff'
};

// Web fonts won't reliably load in mail clients — Gotham is custom-licensed and
// not deliverable. Fall back to a tightly-spec'd sans stack that renders close
// to the in-app Gotham wordmark in modern OS fonts.
const FONT_DISPLAY = "'Gotham Bold','Helvetica Neue',Helvetica,Arial,sans-serif";
const FONT_BODY    = "'Helvetica Neue',Helvetica,Arial,'Segoe UI',sans-serif";

// ---------- Brand mark ----------
// Renders the literal letters "UKC" + a perfect-circle emerald dot.
// Sizes are in PX (em is unreliable in Outlook for inline circles).
const renderWordmark = ({ size = 'lg' } = {}) => {
  const cfg = size === 'sm'
    ? { letter: 14, dot: 4,  gap: 2,  track: '0.1em', lift: 0 }
    : { letter: 30, dot: 8,  gap: 3,  track: '0.1em', lift: 1 }; // header default
  return `
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto;border-collapse:collapse;">
    <tr>
      <td style="font-family:${FONT_DISPLAY};font-weight:800;font-size:${cfg.letter}px;line-height:1;color:${COLOR.ink};letter-spacing:${cfg.track};padding:0;">UKC</td>
      <td style="padding:0 0 0 ${cfg.gap}px;line-height:1;vertical-align:bottom;">
        <span style="display:inline-block;width:${cfg.dot}px;height:${cfg.dot}px;background:${COLOR.brand};border-radius:${cfg.dot}px;line-height:${cfg.dot}px;font-size:1px;position:relative;top:-${cfg.lift}px;mso-line-height-rule:exactly;"></span>
      </td>
    </tr>
  </table>`;
};

// Distant horizon — 32×2 emerald rule centered above the wordmark.
// A single decorative element. No illustrations.
const renderHorizon = () => `
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto 18px;">
    <tr>
      <td style="width:32px;height:2px;background:${COLOR.brand};font-size:1px;line-height:2px;mso-line-height-rule:exactly;">&nbsp;</td>
    </tr>
  </table>`;

const renderHeaderBlock = () => `
  ${renderHorizon()}
  ${renderWordmark({ size: 'lg' })}
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:14px auto 0;">
    <tr>
      <td style="font-family:${FONT_BODY};color:${COLOR.faint};font-size:10px;font-weight:600;letter-spacing:0.32em;text-transform:uppercase;text-align:center;">
        Duotone Pro Center · Urla
      </td>
    </tr>
  </table>`;

// ---------- Body parts ----------
const renderCta = (label, url) => {
  if (!label || !url) return '';
  const safeUrl = escapeHtml(url);
  const safeLabel = escapeHtml(label);
  return `
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:32px auto 8px;">
    <tr>
      <td bgcolor="${COLOR.brandStrong}" style="background:${COLOR.brandStrong};border-radius:999px;box-shadow:0 6px 20px rgba(16,185,129,0.28);">
        <a href="${safeUrl}" target="_blank" rel="noopener" style="display:inline-block;padding:15px 40px;font-family:${FONT_BODY};font-size:13px;font-weight:700;letter-spacing:0.16em;text-transform:uppercase;color:${COLOR.white};text-decoration:none;border-radius:999px;line-height:1;">${safeLabel}</a>
      </td>
    </tr>
  </table>`;
};

const renderRawLink = (url) => {
  if (!url) return '';
  const safeUrl = escapeHtml(url);
  return `
  <p style="margin:18px 0 4px;font-family:${FONT_BODY};color:${COLOR.muted};font-size:11px;letter-spacing:0.16em;text-transform:uppercase;font-weight:600;">
    Or paste this link
  </p>
  <p style="margin:0 0 8px;font-family:${FONT_BODY};color:${COLOR.brandDeep};font-size:12px;line-height:1.55;word-break:break-all;">
    <a href="${safeUrl}" target="_blank" rel="noopener" style="color:${COLOR.brandDeep};text-decoration:underline;">${safeUrl}</a>
  </p>`;
};

const renderDetailsTable = (details) => {
  const rows = (details || [])
    .filter((row) => row && row.value)
    .map(({ label, value }, idx, arr) => {
      const isLast = idx === arr.length - 1;
      const border = isLast ? 'none' : `1px solid ${COLOR.hairline}`;
      return `
        <tr>
          <td style="padding:14px 18px;border-bottom:${border};font-family:${FONT_BODY};color:${COLOR.muted};font-size:10px;letter-spacing:0.22em;text-transform:uppercase;font-weight:700;width:130px;vertical-align:top;">
            ${escapeHtml(label)}
          </td>
          <td style="padding:14px 18px 14px 0;border-bottom:${border};font-family:${FONT_BODY};color:${COLOR.ink};font-size:14px;font-weight:600;line-height:1.5;">
            ${escapeHtml(value)}
          </td>
        </tr>`;
    })
    .join('');
  if (!rows) return '';
  return `
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:24px 0 4px;border-collapse:separate;background:${COLOR.inset};border:1px solid ${COLOR.hairline};border-radius:14px;">
    ${rows}
  </table>`;
};

// ---------- Public API ----------
/**
 * Build a fully styled HTML email body.
 *
 * @param {Object} opts
 * @param {string} [opts.preheader]      Hidden preview text shown next to subject in inbox lists.
 * @param {string} [opts.eyebrow]        Small uppercase label above the title.
 * @param {string} opts.title            Main heading.
 * @param {string} [opts.greeting]       Salutation line ("Hi Alice,").
 * @param {string[]} [opts.bodyParagraphs] HTML-allowed paragraphs.
 * @param {Array<{label:string,value:string}>} [opts.details] Rendered as a label/value table.
 * @param {string} [opts.ctaLabel]       Button text.
 * @param {string} [opts.ctaUrl]         Button URL.
 * @param {boolean} [opts.includeRawLink=true] Render the raw link below the CTA for clients that strip buttons.
 * @param {string[]} [opts.fineprint]    Lines rendered as small muted text under a hairline rule.
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
      <p style="margin:0 0 16px;font-family:${FONT_BODY};color:${COLOR.body};font-size:15px;line-height:1.65;">
        ${p}
      </p>`
    )
    .join('');

  const fineprintHtml = fineprint
    .filter(Boolean)
    .map(
      (line) => `
      <p style="margin:0 0 8px;font-family:${FONT_BODY};color:${COLOR.muted};font-size:12px;line-height:1.6;">
        ${escapeHtml(line)}
      </p>`
    )
    .join('');

  const ctaHtml = renderCta(ctaLabel, ctaUrl);
  const rawLinkHtml = includeRawLink ? renderRawLink(ctaUrl) : '';
  const detailsHtml = renderDetailsTable(details);
  const year = new Date().getFullYear();

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
  <title>${safeTitle}</title>
</head>
<body style="margin:0;padding:0;background:${COLOR.page};-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">
  <span style="display:none !important;visibility:hidden;opacity:0;color:transparent;height:0;width:0;overflow:hidden;mso-hide:all;">${safePreheader}</span>

  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:${COLOR.page};">
    <tr>
      <td align="center" style="padding:48px 16px 32px;">

        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:580px;">

          <!-- Header: distant horizon + UKC. wordmark + tagline -->
          <tr>
            <td align="center" style="padding:0 0 36px;">
              ${renderHeaderBlock()}
            </td>
          </tr>

          <!-- Card -->
          <tr>
            <td style="background:${COLOR.card};border:1px solid ${COLOR.hairline};border-radius:18px;padding:44px 40px 40px;">

              ${
                safeEyebrow
                  ? `<p style="margin:0 0 16px;font-family:${FONT_BODY};color:${COLOR.brandTint};font-size:11px;letter-spacing:0.26em;text-transform:uppercase;font-weight:700;">${safeEyebrow}</p>`
                  : ''
              }

              <h1 style="margin:0 0 20px;font-family:${FONT_DISPLAY};color:${COLOR.ink};font-size:28px;font-weight:800;letter-spacing:-0.015em;line-height:1.22;">
                ${safeTitle}
              </h1>

              ${
                safeGreeting
                  ? `<p style="margin:0 0 16px;font-family:${FONT_BODY};color:${COLOR.body};font-size:15px;line-height:1.65;">${safeGreeting}</p>`
                  : ''
              }

              ${paragraphs}

              ${detailsHtml}

              ${ctaHtml}

              ${rawLinkHtml}

              ${
                fineprintHtml
                  ? `<div style="margin-top:28px;padding-top:22px;border-top:1px solid ${COLOR.divider};">${fineprintHtml}</div>`
                  : ''
              }

            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td align="center" style="padding:32px 16px 8px;">
              ${renderWordmark({ size: 'sm' })}
              <p style="margin:14px 0 4px;font-family:${FONT_BODY};color:${COLOR.muted};font-size:11px;line-height:1.6;letter-spacing:0.04em;">
                Powered by Plannivo · ${year}
              </p>
              <p style="margin:8px 0 0;font-family:${FONT_BODY};color:${COLOR.faint};font-size:11px;line-height:1.65;">
                This is an automated message — please do not reply.<br>
                For questions, contact us at <a href="mailto:info@plannivo.com" style="color:${COLOR.brandDeep};text-decoration:none;">info@plannivo.com</a>.
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
