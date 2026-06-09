import { pool } from '../db.js';
import { logger } from '../middlewares/errorHandler.js';
import { sendEmail } from './emailService.js';
import { dispatchNotification } from './notificationDispatcherUnified.js';
import * as warrantyService from './warrantyService.js';
import { buildWarrantyClaimSubmittedEmail } from './emailTemplates/warrantyClaimSubmitted.js';
import {
  buildWarrantyStatusChangeEmail,
  buildWarrantyCustomerUpdateEmail
} from './emailTemplates/warrantyStatusChange.js';
import { buildWarrantyStaffLinkEmail } from './emailTemplates/warrantyStaffLink.js';
import { buildWarrantyClaimClosedEmail } from './emailTemplates/warrantyClaimClosed.js';
import { buildWarrantyActivityDigestEmail } from './emailTemplates/warrantyActivityDigest.js';

// Customer-facing emails — claimant is NOT a registered user, so we go
// straight through sendEmail and force skipConsentCheck. These are all
// transactional (claim status, link, closure), never marketing.
async function emailCustomer(claim, { subject, html, text, notificationType }) {
  if (!claim?.customer_email) return null;
  try {
    return await sendEmail({
      to: claim.customer_email,
      subject,
      html,
      text,
      notificationType,
      skipConsentCheck: true
    });
  } catch (err) {
    logger.error('Warranty: customer email failed', {
      claimId: claim.id, notificationType, error: err.message
    });
    return null;
  }
}

export async function notifyClaimSubmittedToCustomer(claim) {
  const { subject, html, text } = buildWarrantyClaimSubmittedEmail({ claim });
  return emailCustomer(claim, {
    subject, html, text, notificationType: 'warranty_claim_submitted_customer'
  });
}

export async function resendCustomerLink(claim) {
  const { subject, html, text } = buildWarrantyClaimSubmittedEmail({ claim, resend: true });
  return emailCustomer(claim, {
    subject, html, text, notificationType: 'warranty_link_resent_customer'
  });
}

export async function notifyStatusChangeToCustomer(claim, { previous, next, note = null }) {
  if (next === 'closed') {
    return notifyClaimClosedToCustomer(claim);
  }
  const { subject, html, text } = buildWarrantyStatusChangeEmail({ claim, previous, next, note });
  return emailCustomer(claim, {
    subject, html, text, notificationType: 'warranty_status_change_customer'
  });
}

export async function notifyClaimClosedToCustomer(claim) {
  const { subject, html, text } = buildWarrantyClaimClosedEmail({ claim });
  return emailCustomer(claim, {
    subject, html, text, notificationType: 'warranty_claim_closed_customer'
  });
}

export async function notifyCustomerUpdate(claim, { body }) {
  const { subject, html, text } = buildWarrantyCustomerUpdateEmail({ claim, body });
  return emailCustomer(claim, {
    subject, html, text, notificationType: 'warranty_customer_update'
  });
}

// Staff portal invite — recipient is an external warranty contact, addressed
// only by email. Same transactional rules as customer emails.
export async function notifyStaffLinkSent(claim, staffLink) {
  if (!staffLink?.staff_email) return null;
  const { subject, html, text } = buildWarrantyStaffLinkEmail({ claim, staffLink });
  try {
    return await sendEmail({
      to: staffLink.staff_email,
      subject,
      html,
      text,
      notificationType: 'warranty_staff_link_sent',
      skipConsentCheck: true
    });
  } catch (err) {
    logger.error('Warranty: staff link email failed', {
      claimId: claim.id, staffLinkId: staffLink.id, error: err.message
    });
    return null;
  }
}

// Internal staff fan-out (in-app + Telegram + email) — uses the unified
// dispatcher so each user's per-channel preferences are respected. Email
// piggybacks on dispatchNotification's in-app insert; we also send a direct
// branded email so admins/managers receive a properly formatted message
// even if their telegram is disabled and they don't habitually open the
// in-app notifications drawer.
export async function notifyClaimSubmittedToAdmins(claim) {
  let rows = [];
  try {
    const result = await pool.query(
      `SELECT u.id, u.email, u.name
       FROM users u
       JOIN roles r ON r.id = u.role_id
       WHERE r.name IN ('admin', 'manager', 'owner')
         AND u.deleted_at IS NULL`
    );
    rows = result.rows;
  } catch (err) {
    logger.error('Warranty: failed to load admin recipients', { error: err.message });
    return { notified: 0, skipped: 0 };
  }

  const dispatchData = {
    claimId:           claim.id,
    customerName:      claim.customer_name,
    customerEmail:     claim.customer_email,
    productName:       claim.product_name,
    issueDescription:  claim.issue_description,
    photoCount:        claim.photo_count || 0,
    videoCount:        claim.video_count || 0,
    cta: { label: 'Open claim', href: `/admin/warranty/${claim.id}` }
  };

  const title = `New warranty claim · ${claim.product_name}`;
  const message = `${claim.customer_name} submitted a warranty claim for ${claim.product_name}.`;

  let notified = 0;
  let skipped = 0;
  for (const user of rows) {
    try {
      const result = await dispatchNotification({
        userId: user.id,
        type: 'warranty_claim_submitted',
        title,
        message,
        data: dispatchData,
        idempotencyKey: `warranty:${claim.id}:submitted:${user.id}`,
        checkPreference: false
      });
      if (result?.sent) notified += 1; else skipped += 1;
    } catch (err) {
      logger.warn('Warranty: in-app dispatch failed', { userId: user.id, error: err.message });
      skipped += 1;
    }

    // Direct branded email to the staff member as well (transactional).
    if (user.email) {
      try {
        const subjectLine = `New warranty claim — ${claim.product_name}`;
        const greetingName = user.name || 'team';
        const messageHtml = [
          `<p>${greetingName}, a new warranty claim was just submitted.</p>`,
          `<p><strong>Customer:</strong> ${claim.customer_name} (${claim.customer_email})</p>`,
          `<p><strong>Product:</strong> ${claim.product_name}</p>`,
          claim.issue_description
            ? `<p><strong>Issue:</strong> ${escapeHtml(claim.issue_description).slice(0, 600)}</p>`
            : '',
          `<p><a href="${frontendBase()}/admin/warranty/${claim.id}">Open claim in admin →</a></p>`
        ].filter(Boolean).join('\n');

        await sendEmail({
          to: user.email,
          subject: subjectLine,
          html: messageHtml,
          text: `New warranty claim from ${claim.customer_name} for ${claim.product_name}. Open: ${frontendBase()}/admin/warranty/${claim.id}`,
          userId: user.id,
          notificationType: 'warranty_claim_submitted_admin',
          skipConsentCheck: true
        });
      } catch (err) {
        logger.warn('Warranty: admin email failed', { userId: user.id, error: err.message });
      }
    }
  }
  return { notified, skipped };
}

function frontendBase() {
  return (
    process.env.APP_BASE_URL
    || process.env.FRONTEND_URL
    || process.env.PUBLIC_APP_URL
    || 'https://ukc.plannivo.com'
  ).replace(/\/$/, '');
}

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ─── Activity digest (assigned staff + admins) ───────────────────────────────
//
// Every claim change (status, note, media, manufacturer claim number, staff
// assignment…) queues a digest for the claim. Changes within a short debounce
// window are bundled into ONE email per recipient — a customer who uploads a
// video and writes an explanation in one sitting produces a single notification,
// not three. Recipients never get their own actions back.
//
// Robustness: the watermark (warranty_claims.last_activity_notified_at) is the
// source of truth for "what has been emailed". The in-memory timer is only a
// scheduler — if the process restarts and a timer is lost, the next activity's
// flush still picks up the un-watermarked events. Worst case is a delayed
// internal email, never a lost customer-facing one (those are separate).

const DIGEST_DEBOUNCE_MS = Number(process.env.WARRANTY_DIGEST_DEBOUNCE_MS) || 180_000; // 3 min
const _digestTimers = new Map(); // claimId -> NodeJS.Timeout

export function queueClaimActivityDigest(claimId) {
  if (!claimId) return;
  const existing = _digestTimers.get(claimId);
  if (existing) clearTimeout(existing);
  const timer = setTimeout(() => {
    _digestTimers.delete(claimId);
    flushClaimActivityDigest(claimId).catch((err) =>
      logger.error('Warranty: activity digest flush failed', { claimId, error: err.message })
    );
  }, DIGEST_DEBOUNCE_MS);
  // Don't keep the event loop alive solely for a pending digest.
  if (typeof timer.unref === 'function') timer.unref();
  _digestTimers.set(claimId, timer);
}

function recipientAuthored(event, recipient) {
  if (recipient.staffLinkId && event.actor_staff_link_id === recipient.staffLinkId) return true;
  if (recipient.userId && event.actor_user_id === recipient.userId) return true;
  return false;
}

function digestSummaryLine(events) {
  const n = events.length;
  if (n === 1) {
    const e = events[0];
    if (e.event_type === 'status_change') return `Status: ${e.metadata?.from || ''} → ${e.metadata?.to || ''}`;
    if (e.event_type === 'note') return 'New note added';
    if (e.event_type === 'media_added') return 'New file uploaded';
    if (e.event_type === 'claim_number_set') return 'Manufacturer claim # recorded';
    return 'Case updated';
  }
  return `${n} updates on this case`;
}

export async function flushClaimActivityDigest(claimId) {
  const data = await warrantyService.getActivityForDigest(claimId);
  if (!data || !data.claim) return { sent: 0 };
  const { claim, events, latestTs } = data;
  if (!events.length) return { sent: 0 };

  // Don't notify about deleted claims.
  if (claim.deleted_at) {
    await warrantyService.markActivityNotified(claimId, latestTs);
    return { sent: 0 };
  }

  const recipients = await warrantyService.listClaimRecipients(claimId);
  if (!recipients.length) {
    await warrantyService.markActivityNotified(claimId, latestTs);
    return { sent: 0 };
  }

  let sent = 0;
  for (const recipient of recipients) {
    if (!recipient.email) continue;
    // Exclude the recipient's own actions — you don't get emailed about what you did.
    const relevant = events.filter((event) => !recipientAuthored(event, recipient));
    if (!relevant.length) continue;

    try {
      const { subject, html, text } = buildWarrantyActivityDigestEmail({ claim, events: relevant, recipient });
      await sendEmail({
        to: recipient.email,
        subject,
        html,
        text,
        userId: recipient.userId || null,
        notificationType: 'warranty_claim_activity',
        skipConsentCheck: true
      });
      sent += 1;
    } catch (err) {
      logger.warn('Warranty: activity digest email failed', {
        claimId, email: recipient.email, error: err.message
      });
    }

    // Internal users also get an in-app (and, where enabled, Telegram) ping.
    if (recipient.userId) {
      dispatchNotification({
        userId: recipient.userId,
        type: 'warranty_claim_activity',
        title: `Warranty update · ${claim.product_name}`,
        message: digestSummaryLine(relevant),
        data: {
          claimId: claim.id,
          cta: { label: 'Open claim', href: `/admin/warranty/${claim.id}` }
        },
        idempotencyKey: `warranty:${claim.id}:activity:${latestTs}:${recipient.userId}`,
        checkPreference: false
      }).catch((err) =>
        logger.warn('Warranty: activity in-app dispatch failed', {
          userId: recipient.userId, error: err.message
        })
      );
    }
  }

  await warrantyService.markActivityNotified(claimId, latestTs);
  return { sent };
}

export default {
  notifyClaimSubmittedToCustomer,
  resendCustomerLink,
  notifyStatusChangeToCustomer,
  notifyClaimClosedToCustomer,
  notifyCustomerUpdate,
  notifyStaffLinkSent,
  notifyClaimSubmittedToAdmins,
  queueClaimActivityDigest,
  flushClaimActivityDigest
};
