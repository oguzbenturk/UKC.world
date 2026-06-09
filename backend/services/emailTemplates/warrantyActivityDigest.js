// Warranty activity-digest email — sent to assigned staff + admins/managers
// when a claim changes (status, note, media, manufacturer claim number, etc.).
// One email bundles every change in a short debounce window so a single "sitting"
// (e.g. a customer who uploads a video and writes an explanation) produces ONE
// email, not one-per-action. Recipients never receive their own actions back
// (the dispatcher filters those out before calling this builder).
//
// Internal team audience → English copy, matching the existing admin-facing
// warranty emails. Customer-facing warranty emails remain bilingual elsewhere.

import { buildBrandedEmail } from './brandedLayout.js';
import {
  FRONTEND_BASE, staffPortalUrl, statusLabel, SUPPORT_EMAIL
} from './warrantyShared.js';

const escapeHtml = (value = '') =>
  String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

function actorLabel(event) {
  if (event.actor_name) return event.actor_name;
  switch (event.actor_kind) {
    case 'admin':    return 'UKC.Care team';
    case 'staff':    return 'Warranty team';
    case 'customer': return 'Customer';
    default:         return 'System';
  }
}

function formatTimestamp(ts) {
  try {
    return new Date(ts).toISOString().slice(0, 16).replace('T', ' ') + ' UTC';
  } catch {
    return '';
  }
}

// Plain, human description of a single event (no actor — that's shown separately).
function describeEvent(event) {
  const meta = event.metadata || {};
  switch (event.event_type) {
    case 'submitted':
      return 'Claim submitted';
    case 'status_change': {
      const from = meta.from ? statusLabel(meta.from, 'en') : '';
      const to = meta.to ? statusLabel(meta.to, 'en') : '';
      const head = `Status changed: ${from} → ${to}`;
      return event.body ? `${head} — ${event.body}` : head;
    }
    case 'note':
      return `Note (${event.visible_to_customer ? 'shared with customer' : 'internal'}): ${event.body || ''}`.trim();
    case 'customer_update':
      return `Message sent to customer: ${event.body || ''}`.trim();
    case 'media_added':
      return `Uploaded ${meta.kind || 'file'}: ${meta.original_name || ''}`.trim();
    case 'media_removed':
      return `Removed ${meta.kind || 'file'}: ${meta.original_name || ''}`.trim();
    case 'staff_assigned':
      return meta.staff_name ? `Team member assigned: ${meta.staff_name}` : 'Team member assigned';
    case 'staff_revoked':
      return 'Team member access revoked';
    case 'link_resent':
      return 'Tracking link re-sent';
    case 'claim_closed':
      return 'Claim closed';
    case 'claim_number_set':
      return `Manufacturer claim # recorded: ${meta.claim_number_external || ''}`.trim();
    default:
      return event.body || event.event_type;
  }
}

/**
 * @param {Object}   opts
 * @param {Object}   opts.claim      warranty_claims row
 * @param {Object[]} opts.events     enriched events to include (already filtered
 *                                   so the recipient's own actions are removed)
 * @param {Object}   opts.recipient  { channel, name, token, userId }
 */
export function buildWarrantyActivityDigestEmail({ claim, events, recipient }) {
  const count = events.length;
  const isStaffLink = recipient?.channel === 'staff' && recipient?.token;
  const ctaUrl = isStaffLink
    ? staffPortalUrl(recipient.token)
    : `${FRONTEND_BASE}/admin/warranty/${claim.id}`;
  const ctaLabel = isStaffLink ? 'Open the case' : 'Open in admin';

  const subject = count === 1
    ? `Warranty update · ${claim.product_name} — ${describeEvent(events[0]).slice(0, 80)}`
    : `Warranty update · ${claim.product_name} — ${count} updates`;

  const intro = `Here is what changed on the warranty case for `
    + `<strong>${escapeHtml(claim.customer_name)}</strong> (${escapeHtml(claim.product_name)}).`;

  const eventParagraphs = events.map((event) => {
    const who = escapeHtml(actorLabel(event));
    const when = escapeHtml(formatTimestamp(event.created_at));
    const what = escapeHtml(describeEvent(event)).replace(/\n/g, '<br>');
    return `<strong>${who}</strong> · <span style="color:#64748b;font-size:13px;">${when}</span>`
      + `<br>${what}`;
  });

  const details = [
    { label: 'Product', value: claim.product_name },
    { label: 'Customer', value: claim.customer_name },
    { label: 'Tracking code', value: claim.customer_token },
    { label: 'Status', value: statusLabel(claim.status, 'en') }
  ];
  if (claim.external_claim_number) {
    details.push({ label: 'Manufacturer #', value: claim.external_claim_number });
  }

  const html = buildBrandedEmail({
    preheader: count === 1 ? describeEvent(events[0]) : `${count} updates on this warranty case`,
    eyebrow: 'UKC.Care · Activity',
    title: `Update on ${claim.product_name}`,
    greeting: `Hi ${recipient?.name || 'team'},`,
    bodyParagraphs: [intro, ...eventParagraphs],
    details,
    ctaLabel,
    ctaUrl,
    fineprint: [
      `You receive these because you are assigned to this warranty case.`,
      `Questions? Contact ${SUPPORT_EMAIL}`
    ]
  });

  const textLines = [
    `Hi ${recipient?.name || 'team'},`,
    '',
    `Update on the warranty case for ${claim.customer_name} (${claim.product_name}):`,
    '',
    ...events.map((event) => `• [${formatTimestamp(event.created_at)}] ${actorLabel(event)} — ${describeEvent(event)}`),
    '',
    `Product: ${claim.product_name}`,
    `Tracking code: ${claim.customer_token}`,
    `Status: ${statusLabel(claim.status, 'en')}`,
    claim.external_claim_number ? `Manufacturer #: ${claim.external_claim_number}` : '',
    '',
    `${ctaLabel}: ${ctaUrl}`
  ].filter((line) => line !== undefined);

  return { subject, html, text: textLines.join('\n') };
}

export default { buildWarrantyActivityDigestEmail };
