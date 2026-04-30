import { buildBrandedEmail } from './brandedLayout.js';

const FRONTEND_URL = process.env.FRONTEND_URL || 'https://ukc.plannivo.com';

export function buildWelcomeEmail({ recipientName, passwordResetUrl, resetExpiryHours = 1 } = {}) {
  const greetingName = recipientName || 'there';
  const subject = 'Welcome to the Duotone Pro Center Urla family';
  const loginUrl = `${FRONTEND_URL.replace(/\/$/, '')}/login`;

  const hasReset = Boolean(passwordResetUrl);
  const ctaUrl = hasReset ? passwordResetUrl : loginUrl;
  const ctaLabel = hasReset ? 'Set your password' : 'Log in to the app';

  const text = hasReset
    ? `Hi ${greetingName},

Welcome to the Duotone Pro Center Urla family — we're thrilled to have you on board.

Before you log in, please set your password using the secure link below:

${passwordResetUrl}

This link expires in ${resetExpiryHours} hour${resetExpiryHours === 1 ? '' : 's'}. If it expires, you can request a new one from the login screen.

Once your password is set, you'll have access to lessons, equipment rentals, community events and member-only offerings — everything you need to get on the water.

If you have any questions, just reply to this email or reach us at info@plannivo.com — a real human will get back to you.

See you on the water,
— The Duotone Pro Center Urla team`
    : `Hi ${greetingName},

Welcome to the Duotone Pro Center Urla family — we're thrilled to have you on board.

Your account is set up and ready to go. From kitesurf lessons and equipment rentals to community events and member-only offerings, everything you need to get on the water lives inside the app.

Log in here: ${loginUrl}

If you have any questions, just reply to this email or reach us at info@plannivo.com — a real human will get back to you.

See you on the water,
— The Duotone Pro Center Urla team`;

  const bodyParagraphs = hasReset
    ? [
        "We're thrilled to welcome you to the <strong>Duotone Pro Center Urla</strong> family. Your account is ready — there's just one thing left.",
        'Before you sign in for the first time, please <strong>set your password</strong> using the secure link below. Once that\'s done, you\'ll have full access to lessons, equipment rentals, community events and member-only offerings.'
      ]
    : [
        "We're thrilled to welcome you to the <strong>Duotone Pro Center Urla</strong> family. Your account is set up and ready to go.",
        'From lessons and equipment rentals to community events and member-only offerings, everything you need to get on the water lives inside the app.'
      ];

  const fineprint = hasReset
    ? [
        `This password setup link expires in ${resetExpiryHours} hour${resetExpiryHours === 1 ? '' : 's'}. If it expires, you can request a new one from the login screen.`,
        'Have a question or need a hand? Reply to this email or reach us at info@plannivo.com — a real human will get back to you.'
      ]
    : [
        'Have a question or need a hand? Reply to this email or reach us at info@plannivo.com — a real human will get back to you.'
      ];

  const html = buildBrandedEmail({
    preheader: "Welcome to the Duotone Pro Center Urla family — set your password to get started.",
    eyebrow: 'Welcome aboard',
    title: 'Welcome to the family',
    greeting: `Hi ${greetingName},`,
    bodyParagraphs,
    ctaLabel,
    ctaUrl,
    fineprint
  });

  return { subject, html, text };
}

export default { buildWelcomeEmail };
