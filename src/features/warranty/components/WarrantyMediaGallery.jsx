import React from 'react';
import { Button, Image, Popconfirm, Tag } from 'antd';
import { DeleteOutlined, FilePdfOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { useTranslation } from 'react-i18next';
import { formatBytes } from '../constants';

const GALLERY_VARIANTS = {
  light: {
    empty: 'text-slate-500',
    card: 'border-slate-200 bg-white shadow-sm',
    frame: 'bg-slate-50',
    sizeText: 'text-slate-500',
    nameText: 'text-slate-700',
    heading: 'text-slate-500',
    docIcon: 'text-rose-500',
    docLabel: 'text-slate-500'
  },
  dark: {
    empty: 'text-white/40',
    card: 'border-white/[0.08] bg-white/[0.03]',
    frame: 'bg-black/40',
    sizeText: 'text-white/40',
    nameText: 'text-white/75',
    heading: 'text-white/50',
    docIcon: 'text-rose-300',
    docLabel: 'text-white/55'
  }
};

// Per-file uploader attribution. Customer uploads never carry a name (privacy);
// staff/admin uploads show the team member's name when the caller exposes it.
function UploaderTag({ item }) {
  const kind = item.uploaded_by_kind;
  if (!kind) return null;
  const name = item.uploader_name;
  const color = kind === 'customer' ? 'blue' : kind === 'admin' ? 'green' : 'purple';
  const base = kind === 'customer' ? 'Customer' : kind === 'admin' ? 'Admin' : 'Staff';
  const label = name && kind !== 'customer' ? `${base} · ${name}` : base;
  return <Tag color={color} className="!m-0">{label}</Tag>;
}

function DocumentFrame({ item, url, tokens, onOpenDocument, t }) {
  const inner = (
    <div className="flex flex-col items-center justify-center gap-2 px-2 text-center">
      <FilePdfOutlined style={{ fontSize: 42 }} className={tokens.docIcon} />
      <span className={`text-[11px] font-semibold uppercase tracking-wide ${tokens.docLabel}`}>
        {t('public:warranty.media.viewDocument', 'View PDF')}
      </span>
    </div>
  );
  const className = 'flex h-full w-full items-center justify-center transition hover:opacity-75';
  // Admin contexts pass onOpenDocument (the file is behind a JWT endpoint and
  // must be fetched as a blob); staff contexts have a token-in-URL link that
  // works as a plain anchor.
  if (onOpenDocument) {
    return (
      <button type="button" onClick={() => onOpenDocument(item)} className={className}>
        {inner}
      </button>
    );
  }
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className={className}>
      {inner}
    </a>
  );
}

function MediaCard({ item, url, tokens, canDelete, onDelete, showUploader, onOpenDocument, t }) {
  return (
    <div className={`group relative overflow-hidden rounded-xl border ${tokens.card}`}>
      <div className={`aspect-square flex items-center justify-center overflow-hidden ${tokens.frame}`}>
        {item.kind === 'photo' ? (
          <Image
            src={url}
            alt={item.original_name}
            className="h-full w-full object-cover"
            preview={{ src: url }}
            fallback="data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI2MCIgaGVpZ2h0PSI2MCIgZmlsbD0iI2NiZDVlMSI+PHJlY3Qgd2lkdGg9IjYwIiBoZWlnaHQ9IjYwIiByeD0iMTAiLz48L3N2Zz4="
          />
        ) : item.kind === 'document' ? (
          <DocumentFrame item={item} url={url} tokens={tokens} onOpenDocument={onOpenDocument} t={t} />
        ) : (
          <video
            src={url}
            controls
            preload="metadata"
            className="h-full w-full bg-black object-contain"
          />
        )}
      </div>
      <div className="p-2 text-xs">
        <div className="flex items-center justify-between gap-2">
          <Tag color={item.kind === 'photo' ? 'blue' : item.kind === 'document' ? 'orange' : 'purple'} className="!m-0">
            {item.kind}
          </Tag>
          <span className={tokens.sizeText}>{formatBytes(item.size_bytes)}</span>
        </div>
        {showUploader && (
          <div className="mt-1">
            <UploaderTag item={item} />
          </div>
        )}
        <p className={`mt-1 truncate ${tokens.nameText}`} title={item.original_name}>
          {item.original_name}
        </p>
        {item.created_at && (
          <p className={`mt-0.5 text-[11px] ${tokens.sizeText}`}>
            {dayjs(item.created_at).format('YYYY-MM-DD HH:mm')}
          </p>
        )}
        {canDelete && (
          <Popconfirm
            title={t('admin:warranty.media.deletePrompt', 'Delete this file permanently?')}
            okText={t('admin:warranty.actions.delete', 'Delete')}
            cancelText={t('admin:warranty.actions.cancel', 'Cancel')}
            okButtonProps={{ danger: true }}
            onConfirm={() => onDelete?.(item.id)}
          >
            <Button danger size="small" type="text" icon={<DeleteOutlined />} block>
              {t('admin:warranty.actions.delete', 'Delete')}
            </Button>
          </Popconfirm>
        )}
      </div>
    </div>
  );
}

export default function WarrantyMediaGallery({
  media = [],
  mediaUrlFor,
  onDelete,
  canDelete = false,
  emptyMessage,
  variant = 'light',
  grouped = false,
  showUploader = false,
  headerExtra = null,
  customerSectionLabel,
  teamSectionLabel,
  onOpenDocument
}) {
  const { t } = useTranslation(['public', 'admin']);
  const tokens = GALLERY_VARIANTS[variant] || GALLERY_VARIANTS.light;

  const renderGrid = (items) => (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {items.map((item) => (
        <MediaCard
          key={item.id}
          item={item}
          url={mediaUrlFor?.(item.id)}
          tokens={tokens}
          canDelete={canDelete}
          onDelete={onDelete}
          showUploader={showUploader}
          onOpenDocument={onOpenDocument}
          t={t}
        />
      ))}
    </div>
  );

  const header = headerExtra ? <div className="mb-3 flex justify-end">{headerExtra}</div> : null;

  if (!media.length) {
    return (
      <>
        {header}
        <p className={`text-sm ${tokens.empty}`}>
          {emptyMessage || t('public:warranty.media.empty', 'No photos or videos uploaded yet.')}
        </p>
      </>
    );
  }

  if (!grouped) {
    return (
      <>
        {header}
        {renderGrid(media)}
      </>
    );
  }

  const customerItems = media.filter((m) => m.uploaded_by_kind === 'customer');
  const teamItems = media.filter((m) => m.uploaded_by_kind && m.uploaded_by_kind !== 'customer');
  const untagged = media.filter((m) => !m.uploaded_by_kind);

  const Section = ({ title, items }) =>
    items.length ? (
      <section className="space-y-2">
        <h4 className={`text-[11px] font-semibold uppercase tracking-[0.16em] ${tokens.heading}`}>
          {title} ({items.length})
        </h4>
        {renderGrid(items)}
      </section>
    ) : null;

  return (
    <div className="space-y-5">
      {header}
      <Section
        title={customerSectionLabel || t('public:warranty.media.customerSection', 'Customer uploads')}
        items={customerItems}
      />
      <Section
        title={teamSectionLabel || t('public:warranty.media.teamSection', 'Team uploads')}
        items={teamItems}
      />
      <Section title={t('public:warranty.media.otherSection', 'Other')} items={untagged} />
    </div>
  );
}
