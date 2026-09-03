import { useTranslation } from 'react-i18next';
import { Button, Tooltip } from 'antd';
import { AppstoreOutlined, PlusOutlined, ReloadOutlined } from '@ant-design/icons';

// Compact header bar in the same shape as the Instructors / Products pages: icon
// tile, title, inline counts that double as filters, and the two actions.
const StatChip = ({ label, value, dot, tone = 'text-slate-500', active, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    aria-pressed={active}
    className={`inline-flex items-center gap-1.5 rounded-md px-1.5 py-0.5 text-[11px] font-medium transition ${tone} ${
      active ? 'bg-slate-100 ring-1 ring-slate-300' : 'hover:bg-slate-50'
    }`}
  >
    <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
    <span className="font-semibold tabular-nums">{value}</span>
    {label}
  </button>
);

export default function InventoryHeader({ stats, activeStat, onStat, onRefresh, loading, canManage, onAdd }) {
  const { t } = useTranslation(['common']);
  return (
    <div className="mx-4 mb-4 mt-4 flex flex-col gap-4 rounded-xl border border-slate-200 bg-white px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
      <div className="flex min-w-0 items-center gap-4">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200">
          <AppstoreOutlined className="text-sm text-slate-500" />
        </div>
        <div className="min-w-0">
          <h1 className="font-duotone-bold-extended text-lg uppercase leading-tight tracking-tight text-slate-800">
            {t('common:inventory.title')}
          </h1>
          <div className="-ml-1.5 mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1">
            <StatChip
              label={t('common:inventory.statUnits', { defaultValue: 'units' })}
              value={stats.total}
              dot="bg-slate-400"
              active={activeStat === 'all'}
              onClick={() => onStat('all')}
            />
            <StatChip
              label={t('common:inventory.statAvailable', { defaultValue: 'available' })}
              value={stats.available}
              dot="bg-emerald-500"
              tone="text-emerald-600"
              active={activeStat === 'available'}
              onClick={() => onStat('available')}
            />
            <StatChip
              label={t('common:inventory.statMaintenance', { defaultValue: 'in maintenance' })}
              value={stats.maintenance}
              dot="bg-amber-500"
              tone="text-amber-600"
              active={activeStat === 'maintenance'}
              onClick={() => onStat('maintenance')}
            />
            <StatChip
              label={t('common:inventory.statPoor', { defaultValue: 'worn out' })}
              value={stats.poor}
              dot="bg-red-500"
              tone="text-red-600"
              active={activeStat === 'poor'}
              onClick={() => onStat('poor')}
            />
          </div>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Tooltip title={t('common:inventory.refresh')}>
          <Button
            type="text"
            aria-label={t('common:inventory.refresh')}
            icon={<ReloadOutlined spin={loading} />}
            onClick={onRefresh}
            className="text-slate-500 hover:text-slate-800"
          />
        </Tooltip>
        {canManage && (
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={onAdd}
            className="h-9 w-full shrink-0 rounded-lg border-0 bg-slate-900 px-5 text-[12px] font-semibold hover:bg-slate-800 sm:w-auto"
          >
            {t('common:inventory.addEquipment')}
          </Button>
        )}
      </div>
    </div>
  );
}
