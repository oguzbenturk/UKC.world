import { useTranslation } from 'react-i18next';
import { Button, Tooltip } from 'antd';
import { CheckCircleOutlined, ToolOutlined } from '@ant-design/icons';

// One click moves a unit into or out of maintenance. Only two statuses are used
// in practice, so a toggle beats a menu.
export default function UnitStatusButton({ unit, pending, onToggle, size = 'small', block = false }) {
  const { t } = useTranslation(['common']);
  const toMaintenance = unit.status !== 'maintenance';
  const label = toMaintenance
    ? t('common:inventory.markMaintenance', { defaultValue: 'Send to maintenance' })
    : t('common:inventory.markAvailable', { defaultValue: 'Mark available' });
  return (
    <Tooltip title={label}>
      <Button
        type="text"
        size={size}
        loading={pending}
        aria-label={label}
        icon={toMaintenance ? <ToolOutlined /> : <CheckCircleOutlined />}
        className={toMaintenance ? 'text-amber-600' : 'text-emerald-600'}
        onClick={(e) => {
          e.stopPropagation();
          onToggle(unit, toMaintenance ? 'maintenance' : 'available');
        }}
      >
        {block ? label : null}
      </Button>
    </Tooltip>
  );
}
