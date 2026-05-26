import { pool } from '../db.js';
import { logger } from '../middlewares/errorHandler.js';
import { sendEmail } from './emailService.js';
import { dispatchNotification } from './notificationDispatcherUnified.js';
import { buildWarrantyClaimSubmittedEmail } from './emailTemplates/warrantyClaimSubmitted.js';
import {
  buildWarrantyStatusChangeEmail,
  buildWarrantyCustomerUpdateEmail
} from './emailTemplates/warrantyStatusChange.js';
import { buildWarrantyStaffLinkEmail } from './emailTemplates/warrantyStaffLink.js';
import { buildWarrantyClaimClosedEmail } from './emailTemplates/warrantyClaimClosed.js';

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

export default {
  notifyClaimSubmittedToCustomer,
  resendCustomerLink,
  notifyStatusChangeToCustomer,
  notifyClaimClosedToCustomer,
  notifyCustomerUpdate,
  notifyStaffLinkSent,
  notifyClaimSubmittedToAdmins
};
