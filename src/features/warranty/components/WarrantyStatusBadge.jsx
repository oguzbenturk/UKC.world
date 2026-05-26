import React from 'react';
import { Tag } from 'antd';
import { useTranslation } from 'react-i18next';
import { STATUS_PALETTE } from '../constants';

export default function WarrantyStatusBadge({ status, mode = 'public', size = 'default' }) {
  const { t } = useTranslation(['public', 'admin']);
  const palette = STATUS_PALETTE[status] || STATUS_PALETTE.submitted;
  const label = t(`public:warranty.status.${status}`, status);

  if (mode === 'admin') {
    return <Tag color={palette.tag}>{label}</Tag>;
  }

  const padding = size === 'lg' ? 'px-4 py-1.5 text-sm' : 'px-3 py-1 text-xs';

  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full ${palette.bg} ${palette.text} font-medium ${padding}`}
    >
      <span className={`inline-block h-2 w-2 rounded-full ${palette.dot}`} />
      {label}
    </span>
  );
}
