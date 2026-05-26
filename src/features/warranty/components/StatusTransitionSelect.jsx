import React from 'react';
import { Select } from 'antd';
import { useTranslation } from 'react-i18next';
import { legalNextStatuses } from '../constants';

export default function StatusTransitionSelect({
  currentStatus,
  isStaff = false,
  value,
  onChange,
  placeholder
}) {
  const { t } = useTranslation(['public']);
  const options = legalNextStatuses(currentStatus, { isStaff }).map((status) => ({
    value: status,
    label: t(`public:warranty.status.${status}`, status)
  }));

  return (
    <Select
      value={value}
      onChange={onChange}
      options={options}
      placeholder={placeholder || t('public:warranty.statusSelect.placeholder', 'Change status…')}
      style={{ width: '100%' }}
      disabled={options.length === 0}
    />
  );
}
