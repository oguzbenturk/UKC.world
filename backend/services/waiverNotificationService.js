import { pool } from '../db.js';
import { logger } from '../middlewares/errorHandler.js';
import { insertNotification } from './notificationWriter.js';
import { sendEmail } from './emailService.js';
import { buildWaiverConfirmationEmail } from './emailTemplates/waiverConfirmation.js';

const DASHBOARD_URL = (process.env.APP_BASE_URL
  || process.env.FRONTEND_URL
  || process.env.PUBLIC_APP_URL
  || 'https://app.plannivo.com').replace(/\/$/, '') + (process.env.WAIVER_PORTAL_PATH || '/student/family');

async function fetchUser(userId) {
  if (!userId) {
    return null;
  }

  const { rows } = await pool.query(
    `SELECT id, first_name, last_name, email FROM users WHERE id = $1 LIMIT 1`,
    [userId]
  );

  if (!rows.length) {
    return null;
  }

  const user = rows[0];
  return {
    id: user.id,
    firstName: user.first_name,
    lastName: user.last_name,
    email: user.email,
    displayName: [user.first_name, user.last_name].filter(Boolean).join(' ') || user.email || 'User'
  };
}

async function fetchFamilyMember(familyMemberId) {
  if (!familyMemberId) {
    return null;
  }

  const { rows } = await pool.query(
    `SELECT id, full_name, relationship FROM family_members WHERE id = $1 AND deleted_at IS NULL LIMIT 1`,
    [familyMemberId]
  );

  if (!rows.length) {
    return null;
  }

  return {
    id: rows[0].id,
    fullName: rows[0].full_name,
    relationship: rows[0].relationship
  };
}

function formatDateTime(timestamp) {
  if (!timestamp) {
    return 'just now';
  }

  try {
    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) {
      return 'just now';
    }

    const formatter = typeof globalThis !== 'undefined' && globalThis.Intl?.DateTimeFormat
      ? new globalThis.Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' })
      : null;

    return formatter ? formatter.format(date) : date.toISOString();
  } catch (error) {
    return 'just now';
  }
}

function buildMemberDescriptor({ familyMember, targetUser }) {
  if (familyMember) {
    const relationship = familyMember.relationship ? ` (${familyMember.relationship})` : '';
    return `${familyMember.fullName}${relationship}`;
  }

  if (targetUser) {
    return targetUser.displayName;
  }

  return 'your account';
}

export async function dispatchWaiverSigned({ waiver, signerUserId, targetUserId = null, familyMemberId = null }) {
  if (!signerUserId || !waiver?.id) {
    return;
  }

  const [signer, targetUser, familyMember] = await Promise.all([
    fetchUser(signerUserId),
    fetchUser(targetUserId),
    fetchFamilyMember(familyMemberId)
  ]);

  const memberDescriptor = buildMemberDescriptor({ familyMember, targetUser });
  const signedAtFormatted = formatDateTime(waiver.signed_at || waiver.signedAt);

  // Insert in-app notification for dashboard
  try {
    await insertNotification({
      userId: signerUserId,
      title: 'Waiver signed successfully',
      message: `Waiver version ${waiver.waiver_version} was signed on ${signedAtFormatted} for ${memberDescriptor}.`,
      type: 'waiver',
      data: {
        waiverId: waiver.id,
        waiverVersion: waiver.waiver_version,
        familyMemberId,
        targetUserId,
        signedAt: waiver.signed_at || waiver.signedAt,
        photoConsent: waiver.photo_consent || waiver.photoConsent,
        cta: {
          label: 'View in dashboard',
          href: DASHBOARD_URL
        }
      },
      idempotencyKey: `waiver-signed:${waiver.id}`
    });
  } catch (error) {
    logger.warn('Failed to insert waiver signed notification', {
      waiverId: waiver.id,
      signerUserId,
      error: error?.message
    });
  }

  // Send email confirmation
  const recipientEmail = signer?.email;
  if (!recipientEmail) {
    return;
  }

  const publicSignatureUrl = typeof waiver.signature_public_url === 'string'
    && /^https?:/i.test(waiver.signature_public_url)
    ? waiver.signature_public_url
    : null;

  const emailContent = buildWaiverConfirmationEmail({
    signerName: signer?.displayName,
    recipientEmail,
    waiverVersion: waiver.waiver_version,
    signedAt: waiver.signed_at || waiver.signedAt,
    familyMemberName: familyMember?.fullName,
    languageCode: waiver.language_code || 'en',
    photoConsent: waiver.photo_consent || waiver.photoConsent,
    waiverDashboardUrl: DASHBOARD_URL,
    signaturePreviewUrl: publicSignatureUrl
  });

  try {
    await sendEmail({
      to: recipientEmail,
      subject: emailContent.subject,
      html: emailContent.html,
      text: emailContent.text,
      userId: signerUserId,
      notificationType: 'waiver_signed', // Transactional - legal document confirmation
      skipConsentCheck: true, // Legal/waiver notifications are transactional
      headers: {
        'X-Notification-Reason': 'waiver-confirmation'
      }
    });
  } catch (error) {
    logger.error('Failed to send waiver confirmation email', {
      waiverId: waiver.id,
      signerUserId,
      to: recipientEmail,
      error: error?.message
    });
  }
}

export async function dispatchWaiverPendingReminder({
  userId,
  scope = 'user',
  latestVersion = 'current',
  message,
  ctaHref
} = {}) {
  if (!userId) {
    return;
  }

  const reminderMessage = message || 'Your liability waiver needs attention. Please review and sign to keep booking lessons.';

  try {
    await insertNotification({
      userId,
      title: 'Action needed: Waiver pending',
      message: reminderMessage,
      type: 'waiver',
      data: {
        scope,
        latestVersion,
        cta: {
          label: 'Review waiver requirements',
          href: ctaHref || DASHBOARD_URL
        }
      },
      idempotencyKey: `waiver-pending:${userId}:${scope}:${latestVersion}`
    });
  } catch (error) {
    logger.warn('Failed to insert waiver pending reminder', {
      userId,
      scope,
      error: error?.message
    });
  }
}

export default {
  dispatchWaiverSigned,
  dispatchWaiverPendingReminder
};
