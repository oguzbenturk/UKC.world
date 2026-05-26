import React, { useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { Skeleton } from 'antd';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { useTranslation } from 'react-i18next';
import {
  MessageOutlined,
  ClockCircleOutlined,
  PictureOutlined,
  InfoCircleOutlined,
  LockOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  ArrowRightOutlined
} from '@ant-design/icons';
import WarrantyBrandShell from '../components/WarrantyBrandShell';
import WarrantyMediaGallery from '../components/WarrantyMediaGallery';
import { useTrackingClaim } from '../hooks/useWarranty';
import { customerMediaUrl } from '../services/warrantyApi';
import { STATUS_PALETTE } from '../constants';

dayjs.extend(relativeTime);

// Event types the customer should treat as a message FROM the team.
const MESSAGE_TYPES = new Set(['customer_update', 'note']);

// Everything else (status changes, media events, link resent, closed/deleted)
// goes to the activity log so the conversation thread stays clean.
function isMessage(event) {
  return MESSAGE_TYPES.has(event.event_type) && event.visible_to_customer;
}

// ─── Atoms ───────────────────────────────────────────────────────────────────

function StatusPill({ status, size = 'md' }) {
  const { t } = useTranslation(['public']);
  const palette = STATUS_PALETTE[status] || STATUS_PALETTE.submitted;
  const pad = size === 'lg' ? 'px-5 py-2 text-sm' : 'px-3 py-1 text-xs';
  return (
    <span
      className={`inline-flex items-center gap-2.5 rounded-full font-duotone-bold uppercase tracking-[0.2em] ${pad}`}
      style={{
        background: 'rgba(0,168,196,0.10)',
        border: '1px solid rgba(0,168,196,0.35)',
        color: '#5be7ff'
      }}
    >
      <span
        className="inline-block h-2 w-2 rounded-full"
        style={{
          background: status === 'closed' ? '#94a3b8' : status === 'rejected' ? '#f87171' : '#00a8c4',
          boxShadow: status === 'closed' ? 'none' : '0 0 12px rgba(0,168,196,0.7)'
        }}
      />
      {t(`public:warranty.status.${status}`, status)}
    </span>
  );
}

function TabButton({ active, onClick, icon, label, count }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative flex items-center gap-2 px-4 sm:px-5 py-3 text-xs sm:text-sm font-duotone-bold uppercase tracking-[0.18em] transition-colors ${
        active ? 'text-white' : 'text-white/40 hover:text-white/70'
      }`}
    >
      {icon} {label}
      {typeof count === 'number' && count > 0 && (
        <span className={`ml-1 text-[10px] font-duotone-regular rounded-full px-1.5 py-0.5 ${
          active ? 'bg-[#00a8c4]/25 text-[#5be7ff]' : 'bg-white/[0.06] text-white/40'
        }`}>
          {count}
        </span>
      )}
      {active && (
        <span
          className="absolute -bottom-px left-0 right-0 h-[2px]"
          style={{ background: '#00a8c4', boxShadow: '0 0 12px rgba(0,168,196,0.7)' }}
        />
      )}
    </button>
  );
}

function MessageBubble({ event }) {
  const actorLabel = event.actor_kind === 'staff' ? 'Warranty team' : 'UKC.Care';
  const initial = event.actor_kind === 'staff' ? 'W' : 'U';
  return (
    <article className="flex items-start gap-3 sm:gap-4">
      <span
        className="shrink-0 flex h-10 w-10 sm:h-11 sm:w-11 items-center justify-center rounded-full font-duotone-bold text-base text-[#5be7ff]"
        style={{ background: 'rgba(0,168,196,0.15)', border: '1px solid rgba(0,168,196,0.35)' }}
      >
        {initial}
      </span>
      <div className="flex-1 min-w-0">
        <div className="mb-1 flex flex-wrap items-baseline gap-3 text-[10px] uppercase tracking-[0.22em]">
          <span className="font-duotone-bold text-white/85">{actorLabel}</span>
          <span className="text-white/30 font-duotone-regular">
            {dayjs(event.created_at).format('MMM D · HH:mm')}
          </span>
          <span className="text-white/20 font-duotone-regular">{dayjs(event.created_at).fromNow()}</span>
        </div>
        <div
          className="rounded-2xl px-4 py-3 sm:px-5 sm:py-4 text-[15px] leading-relaxed text-white/85 whitespace-pre-wrap"
          style={{
            background: 'linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0.02))',
            border: '1px solid rgba(255,255,255,0.07)'
          }}
        >
          {event.body || '—'}
        </div>
      </div>
    </article>
  );
}

function ActivityRow({ event }) {
  const { t } = useTranslation(['public']);
  const meta = event.metadata || {};

  const formatted = (() => {
    switch (event.event_type) {
      case 'submitted':
        return { icon: <ArrowRightOutlined />, body: t('public:warranty.timeline.submitted', 'Claim submitted.') };
      case 'status_change': {
        const from = meta.from ? t(`public:warranty.status.${meta.from}`, meta.from) : '';
        const to = meta.to ? t(`public:warranty.status.${meta.to}`, meta.to) : '';
        return { icon: <ArrowRightOutlined />, body: `${from} → ${to}`, accent: true };
      }
      case 'media_added':
        return {
          icon: <PictureOutlined />,
          body: t('public:warranty.timeline.mediaAdded', 'New {{kind}} uploaded: {{name}}', {
            kind: meta.kind || 'file', name: meta.original_name || ''
          })
        };
      case 'media_removed':
        return {
          icon: <PictureOutlined />,
          body: t('public:warranty.timeline.mediaRemoved', 'Removed {{kind}}: {{name}}', {
            kind: meta.kind || 'file', name: meta.original_name || ''
          })
        };
      case 'link_resent':
        return { icon: <MessageOutlined />, body: t('public:warranty.timeline.linkResent', 'Tracking link re-sent.') };
      case 'claim_closed':
        return { icon: <CheckCircleOutlined />, body: t('public:warranty.timeline.closed', 'Claim closed.') };
      case 'claim_deleted':
        return { icon: <CloseCircleOutlined />, body: t('public:warranty.timeline.deleted', 'Claim deleted.') };
      default:
        return { icon: <ClockCircleOutlined />, body: event.body || event.event_type };
    }
  })();

  return (
    <li className="flex items-baseline gap-4 py-3 border-b border-white/[0.05] last:border-b-0">
      <span
        className={`mt-0.5 shrink-0 ${formatted.accent ? 'text-[#5be7ff]' : 'text-white/30'}`}
        style={{ fontSize: 12 }}
      >
        {formatted.icon}
      </span>
      <div className="flex-1 min-w-0">
        <p className={`text-sm leading-snug ${formatted.accent ? 'text-white' : 'text-white/55'} truncate`}>
          {formatted.body}
        </p>
      </div>
      <time className="shrink-0 text-[10px] font-duotone-regular uppercase tracking-[0.18em] text-white/25">
        {dayjs(event.created_at).format('MMM D · HH:mm')}
      </time>
    </li>
  );
}

function MetaRow({ label, value }) {
  if (value === null || value === undefined || value === '') return null;
  return (
    <div className="grid grid-cols-1 sm:grid-cols-[160px_1fr] gap-1 sm:gap-4 py-3 border-b border-white/[0.05] last:border-b-0">
      <dt className="text-[10px] font-duotone-bold uppercase tracking-[0.22em] text-white/40">
        {label}
      </dt>
      <dd className="text-sm font-duotone-regular text-white/85 break-words">{value}</dd>
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function WarrantyTrackPage() {
  const { code } = useParams();
  const [searchParams] = useSearchParams();
  const isNew = searchParams.get('new') === '1';
  const { t } = useTranslation(['public']);
  const query = useTrackingClaim(code);
  const [tab, setTab] = useState('updates');

  const messages = useMemo(() => {
    if (!query.data?.events) return [];
    return query.data.events
      .filter(isMessage)
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  }, [query.data]);

  const activity = useMemo(() => {
    if (!query.data?.events) return [];
    return query.data.events
      .filter((e) => !isMessage(e))
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  }, [query.data]);

  if (query.isLoading) {
    return (
      <WarrantyBrandShell>
        <div className="max-w-3xl mx-auto px-6 py-16">
          <Skeleton active paragraph={{ rows: 8 }} className="!opacity-30" />
        </div>
      </WarrantyBrandShell>
    );
  }

  if (query.isError) {
    return (
      <WarrantyBrandShell>
        <section className="max-w-2xl mx-auto px-6 py-16 text-center warranty-fade-up">
          <p className="text-[10px] font-duotone-bold uppercase tracking-[0.4em] text-[#00a8c4]/70">
            {t('public:warranty.track.eyebrow', 'UKC.Care · Tracking')}
          </p>
          <h1 className="mt-6 font-duotone-bold-extended uppercase text-3xl sm:text-5xl text-white tracking-tight">
            {t('public:warranty.track.notFoundTitle', 'Claim not available')}
          </h1>
          <p className="mt-6 text-white/55 font-duotone-regular max-w-md mx-auto">
            {t('public:warranty.track.notFound',
              'This tracking link does not match an active claim. The case may have been closed or removed.')}
          </p>
        </section>
      </WarrantyBrandShell>
    );
  }

  const { claim, media } = query.data;
  const closed = ['closed', 'rejected'].includes(claim.status);
  const latestMessage = messages[0] || null;
  const lang = claim.preferred_language || 'en';

  return (
    <WarrantyBrandShell>

      {/* ── HERO ─────────────────────────────────────────────────────── */}
      <section className="max-w-5xl mx-auto px-6 pt-12 sm:pt-16 pb-10 sm:pb-14 warranty-fade-up">
        <p className="text-[10px] font-duotone-bold uppercase tracking-[0.4em] text-[#00a8c4]/70 text-center">
          {t('public:warranty.track.eyebrow', 'UKC.Care · Tracking')}
        </p>

        <h1 className="mt-6 font-duotone-bold-extended uppercase tracking-tight text-white text-center text-3xl sm:text-5xl md:text-6xl leading-[0.95]">
          {claim.product_name}
        </h1>

        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <StatusPill status={claim.status} size="lg" />
          <span
            className="inline-flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.04] px-4 py-2 font-duotone-regular text-xs uppercase tracking-[0.22em] text-white/55"
          >
            <span className="text-white/30">Claim</span>
            <code className="font-mono text-white">{claim.customer_token}</code>
          </span>
          <span className="text-[10px] font-duotone-regular uppercase tracking-[0.22em] text-white/35">
            {t('public:warranty.track.updated', 'Last updated {{when}}', {
              when: dayjs(claim.updated_at).fromNow()
            })}
          </span>
        </div>

        {isNew && (
          <div
            className="mx-auto mt-10 max-w-xl rounded-2xl border border-[#00a8c4]/25 bg-gradient-to-br from-[#00a8c4]/[0.10] to-transparent px-5 py-4 warranty-fade-up"
            style={{ animationDelay: '160ms' }}
          >
            <p className="text-[10px] font-duotone-bold uppercase tracking-[0.3em] text-[#5be7ff]">
              {t('public:warranty.track.savedTitle', 'Save this link')}
            </p>
            <p className="mt-2 text-sm text-white/65 font-duotone-regular">
              {t('public:warranty.track.savedBody',
                'We also emailed you the link. This page stays available until our team closes the claim.')}
            </p>
          </div>
        )}
      </section>

      {/* ── LATEST MESSAGE (featured) ───────────────────────────────── */}
      {latestMessage && (
        <section
          className="max-w-3xl mx-auto px-6 mb-10 warranty-fade-up"
          style={{ animationDelay: '120ms' }}
        >
          <div className="flex items-baseline justify-between gap-3 mb-3">
            <p className="text-[10px] font-duotone-bold uppercase tracking-[0.4em] text-[#00a8c4]/80">
              {t('public:warranty.track.latestMessage', 'Latest from our team')}
            </p>
            {messages.length > 1 && (
              <button
                type="button"
                onClick={() => setTab('updates')}
                className="text-[10px] font-duotone-bold uppercase tracking-[0.22em] text-white/45 hover:text-[#5be7ff] transition-colors"
              >
                {t('public:warranty.track.viewAllMessages', 'View all messages ({{n}})', { n: messages.length })} →
              </button>
            )}
          </div>
          <MessageBubble event={latestMessage} />
        </section>
      )}

      {/* ── TABS ─────────────────────────────────────────────────────── */}
      <section className="max-w-3xl mx-auto px-6">
        <div className="flex items-end border-b border-white/[0.08] overflow-x-auto">
          <TabButton
            active={tab === 'updates'}
            onClick={() => setTab('updates')}
            icon={<MessageOutlined />}
            label={t('public:warranty.track.tabs.updates', 'Messages')}
            count={messages.length}
          />
          <TabButton
            active={tab === 'activity'}
            onClick={() => setTab('activity')}
            icon={<ClockCircleOutlined />}
            label={t('public:warranty.track.tabs.activity', 'Activity')}
            count={activity.length}
          />
          <TabButton
            active={tab === 'files'}
            onClick={() => setTab('files')}
            icon={<PictureOutlined />}
            label={t('public:warranty.track.tabs.files', 'Files')}
            count={media.length}
          />
          <TabButton
            active={tab === 'about'}
            onClick={() => setTab('about')}
            icon={<InfoCircleOutlined />}
            label={t('public:warranty.track.tabs.about', 'Details')}
          />
        </div>

        <div className="py-8 pb-20 min-h-[300px]">
          {tab === 'updates' && (
            <>
              {messages.length === 0 ? (
                <EmptyState
                  icon={<MessageOutlined style={{ fontSize: 28 }} />}
                  title={t('public:warranty.track.noMessagesTitle', 'No messages yet')}
                  body={t('public:warranty.track.noMessagesBody',
                    'When our team writes you, it shows up here and we send an email.')}
                />
              ) : (
                <div className="space-y-8">
                  {messages.map((event) => (
                    <MessageBubble key={event.id} event={event} />
                  ))}
                </div>
              )}
            </>
          )}

          {tab === 'activity' && (
            <>
              {activity.length === 0 ? (
                <EmptyState
                  icon={<ClockCircleOutlined style={{ fontSize: 28 }} />}
                  title={t('public:warranty.track.noActivityTitle', 'No activity yet')}
                  body={t('public:warranty.track.noActivityBody',
                    'Status changes, uploads, and other system events will appear here.')}
                />
              ) : (
                <ul className="rounded-2xl border border-white/[0.07] bg-white/[0.02] px-5 sm:px-6">
                  {activity.map((event) => (
                    <ActivityRow key={event.id} event={event} />
                  ))}
                </ul>
              )}
            </>
          )}

          {tab === 'files' && (
            <>
              {closed ? (
                <div className="rounded-2xl border border-amber-400/25 bg-amber-500/[0.06] px-5 py-5 flex items-start gap-3">
                  <LockOutlined className="text-amber-300 mt-1 shrink-0" />
                  <div>
                    <p className="font-duotone-bold uppercase tracking-[0.2em] text-amber-200 text-xs">
                      {t('public:warranty.track.mediaPurgedTitle', 'Media has been removed')}
                    </p>
                    <p className="mt-2 text-sm text-white/65 font-duotone-regular">
                      {t('public:warranty.track.mediaPurgedBody',
                        'Photos and videos are deleted once a claim is closed or rejected to protect your privacy.')}
                    </p>
                  </div>
                </div>
              ) : (
                <WarrantyMediaGallery
                  variant="dark"
                  media={media}
                  mediaUrlFor={(id) => customerMediaUrl(code, id)}
                  emptyMessage={t('public:warranty.track.mediaEmpty', 'You did not attach any photos or videos.')}
                />
              )}
            </>
          )}

          {tab === 'about' && (
            <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] px-5 sm:px-6">
              <dl>
                <MetaRow label={t('public:warranty.track.fields.customer', 'Submitted by')} value={claim.customer_name} />
                <MetaRow label={t('public:warranty.track.fields.product', 'Product')} value={claim.product_name} />
                <MetaRow label={t('public:warranty.track.fields.brand', 'Brand')} value={claim.product_brand} />
                <MetaRow label={t('public:warranty.track.fields.model', 'Model')} value={claim.product_model} />
                <MetaRow label={t('public:warranty.track.fields.serial', 'Serial number')} value={claim.product_serial} />
                <MetaRow
                  label={t('public:warranty.track.fields.purchaseDate', 'Purchase date')}
                  value={claim.purchase_date ? dayjs(claim.purchase_date).format('YYYY-MM-DD') : null}
                />
                <MetaRow label={t('public:warranty.track.fields.purchaseLocation', 'Bought at')} value={claim.purchase_location} />
                <MetaRow label={t('public:warranty.track.fields.claimNumber', 'Manufacturer claim #')} value={claim.external_claim_number} />
                <MetaRow
                  label={t('public:warranty.track.fields.submittedAt', 'Submitted')}
                  value={`${dayjs(claim.created_at).format('YYYY-MM-DD HH:mm')} · ${lang.toUpperCase()}`}
                />
                <MetaRow
                  label={t('public:warranty.track.fields.issue', 'Issue')}
                  value={<span className="whitespace-pre-wrap leading-relaxed">{claim.issue_description}</span>}
                />
              </dl>
            </div>
          )}
        </div>
      </section>

      {/* ── PROMISE FOOTER ───────────────────────────────────────────── */}
      <footer className="border-t border-white/[0.06] mt-4">
        <div className="max-w-4xl mx-auto px-6 py-12 text-center">
          <div className="flex items-center gap-4 max-w-md mx-auto warranty-meridian">
            <span className="text-[10px] font-duotone-bold uppercase tracking-[0.4em] text-white/35 whitespace-nowrap">
              Duotone Pro Center · Urla
            </span>
          </div>
          <p className="mt-5 text-white/40 italic max-w-xl mx-auto leading-relaxed text-[14px]">
            {t('public:warranty.submit.promise',
              '“Every product we put in your hands is built to withstand the elements. When something goes wrong, we make it right.”')}
          </p>
        </div>
      </footer>
    </WarrantyBrandShell>
  );
}

function EmptyState({ icon, title, body }) {
  return (
    <div className="rounded-2xl border border-dashed border-white/[0.10] bg-white/[0.02] px-6 py-12 text-center">
      <div className="mx-auto mb-3 inline-flex h-12 w-12 items-center justify-center rounded-full bg-white/[0.04] text-white/40">
        {icon}
      </div>
      <p className="font-duotone-bold uppercase tracking-[0.22em] text-white/75 text-sm">{title}</p>
      <p className="mt-2 text-sm text-white/40 font-duotone-regular max-w-sm mx-auto">{body}</p>
    </div>
  );
}
