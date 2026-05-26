import React from 'react';
import { Button, Image, Popconfirm, Tag } from 'antd';
import { DeleteOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { formatBytes } from '../constants';

const GALLERY_VARIANTS = {
  light: {
    empty: 'text-slate-500',
    card: 'border-slate-200 bg-white shadow-sm',
    frame: 'bg-slate-50',
    sizeText: 'text-slate-500',
    nameText: 'text-slate-700'
  },
  dark: {
    empty: 'text-white/40',
    card: 'border-white/[0.08] bg-white/[0.03]',
    frame: 'bg-black/40',
    sizeText: 'text-white/40',
    nameText: 'text-white/75'
  }
};

export default function WarrantyMediaGallery({
  media = [],
  mediaUrlFor,
  onDelete,
  canDelete = false,
  emptyMessage,
  variant = 'light'
}) {
  const { t } = useTranslation(['public', 'admin']);
  const tokens = GALLERY_VARIANTS[variant] || GALLERY_VARIANTS.light;

  if (!media.length) {
    return (
      <p className={`text-sm ${tokens.empty}`}>
        {emptyMessage || t('public:warranty.media.empty', 'No photos or videos uploaded yet.')}
      </p>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {media.map((item) => {
        const url = mediaUrlFor?.(item.id);
        return (
          <div
            key={item.id}
            className={`group relative overflow-hidden rounded-xl border ${tokens.card}`}
          >
            <div className={`aspect-square flex items-center justify-center overflow-hidden ${tokens.frame}`}>
              {item.kind === 'photo' ? (
                <Image
                  src={url}
                  alt={item.original_name}
                  className="h-full w-full object-cover"
                  preview={{ src: url }}
                  fallback="data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI2MCIgaGVpZ2h0PSI2MCIgZmlsbD0iI2NiZDVlMSI+PHJlY3Qgd2lkdGg9IjYwIiBoZWlnaHQ9IjYwIiByeD0iMTAiLz48L3N2Zz4="
                />
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
                <Tag color={item.kind === 'photo' ? 'blue' : 'purple'} className="!m-0">
                  {item.kind}
                </Tag>
                <span className={tokens.sizeText}>{formatBytes(item.size_bytes)}</span>
              </div>
              <p className={`mt-1 truncate ${tokens.nameText}`} title={item.original_name}>
                {item.original_name}
              </p>
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
      })}
    </div>
  );
}
