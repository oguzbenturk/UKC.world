import React, { useMemo } from 'react';
import { Timeline, Tag } from 'antd';
import dayjs from 'dayjs';
import { useTranslation } from 'react-i18next';
import { STATUS_PALETTE } from '../constants';

const EVENT_DOT_COLOR = {
  submitted:        '#3b82f6',
  status_change:    '#06b6d4',
  note:             '#64748b',
  customer_update:  '#10b981',
  media_added:      '#0ea5e9',
  media_removed:    '#f43f5e',
  staff_assigned:   '#8b5cf6',
  staff_revoked:    '#a78bfa',
  link_resent:      '#0ea5e9',
  claim_number_set: '#0891b2',
  claim_closed:     '#475569',
  claim_deleted:    '#dc2626'
};

function formatEventBody(event, t) {
  switch (event.event_type) {
    case 'submitted':
      return t('public:warranty.timeline.submitted', 'Claim submitted.');
    case 'status_change': {
      const from = event.metadata?.from
        ? t(`public:warranty.status.${event.metadata.from}`, event.metadata.from) : '';
      const to = event.metadata?.to
        ? t(`public:warranty.status.${event.metadata.to}`, event.metadata.to) : '';
      const head = `${from} → ${to}`;
      return event.body ? `${head} — ${event.body}` : head;
    }
    case 'note':
      return event.body || t('public:warranty.timeline.noteAdded', 'Note added.');
    case 'customer_update':
      return event.body || t('public:warranty.timeline.customerUpdate', 'Update from our team.');
    case 'media_added':
      return t('public:warranty.timeline.mediaAdded', 'New {{kind}} uploaded: {{name}}', {
        kind: event.metadata?.kind || 'file',
        name: event.metadata?.original_name || ''
      });
    case 'media_removed':
      return t('public:warranty.timeline.mediaRemoved', 'Removed {{kind}}: {{name}}', {
        kind: event.metadata?.kind || 'file',
        name: event.metadata?.original_name || ''
      });
    case 'claim_number_set':
      return t('public:warranty.timeline.claimNumberSet', 'Manufacturer claim # recorded: {{value}}', {
        value: event.metadata?.claim_number_external || (event.body || '')
      });
    case 'staff_assigned':
      return t('public:warranty.timeline.staffAssigned', 'Warranty team member assigned.');
    case 'staff_revoked':
      return t('public:warranty.timeline.staffRevoked', 'Warranty team access revoked.');
    case 'link_resent':
      return t('public:warranty.timeline.linkResent', 'Tracking link re-sent.');
    case 'claim_closed':
      return t('public:warranty.timeline.closed', 'Claim closed.');
    case 'claim_deleted':
      return t('public:warranty.timeline.deleted', 'Claim deleted.');
    default:
      return event.body || event.event_type;
  }
}

function ActorBadge({ actorKind, actorName }) {
  if (!actorKind) return null;
  const color = actorKind === 'admin' ? 'green'
    : actorKind === 'staff' ? 'purple'
    : actorKind === 'customer' ? 'blue'
    : 'default';
  const label = actorKind === 'admin' ? 'UKC.Care team'
    : actorKind === 'staff' ? 'Warranty team'
    : actorKind === 'customer' ? 'Customer'
    : 'System';
  return <Tag color={color} style={{ marginLeft: 8 }}>{actorName ? `${label} · ${actorName}` : label}</Tag>;
}

export default function WarrantyTimeline({ events = [], mode = 'public' }) {
  const { t } = useTranslation(['public']);
  const filtered = useMemo(() => {
    if (mode === 'public') return events.filter((e) => e.visible_to_customer);
    return events;
  }, [events, mode]);

  if (filtered.length === 0) {
    return (
      <p className="text-sm text-slate-500">
        {t('public:warranty.timeline.empty', 'No updates yet.')}
      </p>
    );
  }

  const items = filtered
    .slice()
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .map((event) => ({
      color: EVENT_DOT_COLOR[event.event_type] || '#94a3b8',
      children: (
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <time>{dayjs(event.created_at).format('YYYY-MM-DD HH:mm')}</time>
            {mode !== 'public' && (
              <>
                {!event.visible_to_customer && <Tag color="default">Internal</Tag>}
                <ActorBadge actorKind={event.actor_kind} actorName={event.actor_name} />
              </>
            )}
          </div>
          <div className="text-sm text-slate-800 whitespace-pre-wrap">
            {formatEventBody(event, t)}
          </div>
          {event.event_type === 'status_change' && event.metadata?.to && (
            <div className="pt-1">
              <Tag color={STATUS_PALETTE[event.metadata.to]?.tag || 'default'}>
                {t(`public:warranty.status.${event.metadata.to}`, event.metadata.to)}
              </Tag>
            </div>
          )}
        </div>
      )
    }));

  return <Timeline items={items} mode="left" />;
}
