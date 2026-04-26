import { buildBrandedEmail } from './brandedLayout.js';

export function buildVerificationEmail({ recipientName, verificationUrl, expiryHours = 24 }) {
  const greetingName = recipientName || 'there';
  const subject = 'Verify your UKC• account';

  const text = `Hi ${greetingName},

Welcome to UKC• Duotone Pro Center Urla. Please verify your email address to activate your account:

${verificationUrl}

This link expires in ${expiryHours} hours. If you didn't create an account, you can safely ignore this email.

— UKC• Duotone Pro Center Urla`;

  const html = buildBrandedEmail({
    preheader: 'Confirm your email to activate your UKC• account',
    eyebrow: 'Welcome',
    title: 'Verify your email',
    greeting: `Hi ${greetingName},`,
    bodyParagraphs: [
      'Welcome to <strong>UKC•</strong> Duotone Pro Center Urla. Tap the button below to confirm your email address — this is the last step before you can sign in.'
    ],
    ctaLabel: 'Verify email',
    ctaUrl: verificationUrl,
    fineprint: [
      `This link expires in ${expiryHours} hour${expiryHours === 1 ? '' : 's'}.`,
      'If you didn\'t create a UKC• account, you can safely ignore this email.'
    ]
  });

  return { subject, html, text };
}

export default { buildVerificationEmail };
