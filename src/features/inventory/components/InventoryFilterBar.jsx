import { useTranslation } from 'react-i18next';
import { Button, Input, Select, Tooltip } from 'antd';
import { DownloadOutlined, FilePdfOutlined, SearchOutlined } from '@ant-design/icons';
import { FilterChip, ChipRail } from './FilterChip';
import { toggleIn } from '../utils/facets';

const countRenderer = (opt) => (
  <span className="flex items-center justify-between gap-3">
    <span>{opt.label}</span>
    <span className="tabular-nums text-slate-400">{opt.data.count}</span>
  </span>
);

const multiSelectProps = {
  mode: 'multiple',
  allowClear: true,
  maxTagCount: 'responsive',
  optionFilterProp: 'label',
  optionRender: countRenderer,
};

// Search + brand/condition/status selects on one row, then the category rail and,
// once a category is chosen, the size and sub-type rails for it. Every option and
// chip carries the count it would yield given the other active filters.
export default function InventoryFilterBar({
  filters,
  compact = false,
  active,
  summary,
  allCount,
  typeChips,
  sizeChips,
  subtypeChips,
  brandOptions,
  conditionOptions,
  statusOptions,
  onChange,
  onClear,
  onExport,
  onExportPdf,
}) {
  const { t } = useTranslation(['common']);
  // On phones the three selects share one row at a smaller size instead of
  // stacking into four tall inputs.
  const controlSize = compact ? 'middle' : 'large';
  return (
    <div className="mb-4 px-4">
      <div className="space-y-3 rounded-xl border border-slate-200/60 bg-white/80 px-4 py-3 shadow-sm backdrop-blur-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
          <Input
            size={controlSize}
            className="w-full !rounded-lg sm:max-w-sm"
            allowClear
            prefix={<SearchOutlined className="text-slate-400" />}
            placeholder={t('common:inventory.searchPlaceholder')}
            value={filters.q}
            onChange={(e) => onChange({ q: e.target.value }, { replace: true })}
          />
          <div className="hidden h-7 w-px bg-slate-200 sm:block" />
          <div className="grid grid-cols-3 gap-2 sm:contents">
            <Select
              {...multiSelectProps}
              size={controlSize}
              className="w-full sm:w-52"
              placeholder={t('common:inventory.filterBrand', { defaultValue: 'Brand' })}
              value={filters.brands}
              onChange={(brands) => onChange({ brands })}
              options={brandOptions}
            />
            <Select
              {...multiSelectProps}
              size={controlSize}
              className="w-full sm:w-48"
              placeholder={t('common:inventory.filterCondition', { defaultValue: 'Condition' })}
              value={filters.conditions}
              onChange={(conditions) => onChange({ conditions })}
              options={conditionOptions}
            />
            <Select
              {...multiSelectProps}
              size={controlSize}
              className="w-full sm:w-44"
              placeholder={t('common:inventory.filterStatus')}
              value={filters.statuses}
              onChange={(statuses) => onChange({ statuses })}
              options={statusOptions}
            />
          </div>
          {active && (
            <Button type="text" className="font-medium text-slate-500 hover:text-slate-800" onClick={onClear}>
              {t('common:inventory.clearFilters', { defaultValue: 'Clear filters' })}
            </Button>
          )}
          <div className="flex items-center gap-2 sm:ml-auto">
            <span className="whitespace-nowrap text-xs font-medium text-slate-400">{summary}</span>
            <Tooltip title={t('common:inventory.exportFiltered', { defaultValue: 'Export shown units (CSV)' })}>
              <Button
                type="text"
                size="small"
                icon={<DownloadOutlined />}
                aria-label={t('common:inventory.exportFiltered', { defaultValue: 'Export shown units (CSV)' })}
                onClick={onExport}
                className="text-slate-500 hover:text-slate-800"
              />
            </Tooltip>
            <Tooltip title={t('common:inventory.exportPdf', { defaultValue: 'Export PDF (Duotone Pro Center Urla)' })}>
              <Button
                type="text"
                size="small"
                icon={<FilePdfOutlined />}
                aria-label={t('common:inventory.exportPdf', { defaultValue: 'Export PDF (Duotone Pro Center Urla)' })}
                onClick={onExportPdf}
                className="text-slate-500 hover:text-slate-800"
              />
            </Tooltip>
          </div>
        </div>

        <ChipRail>
          <FilterChip
            active={!filters.type}
            label={t('common:inventory.allTypes')}
            count={allCount}
            onClick={() => onChange({ type: null, sizes: [], subtypes: [] })}
          />
          {typeChips.map((c) => (
            <FilterChip
              key={c.value}
              active={filters.type === c.value}
              label={c.label}
              count={c.count}
              onClick={() => onChange({ type: filters.type === c.value ? null : c.value, sizes: [], subtypes: [] })}
            />
          ))}
        </ChipRail>
        {sizeChips.length > 0 && (
          <ChipRail label={t('common:inventory.size')}>
            {sizeChips.map((s) => (
              <FilterChip
                small
                key={s.value}
                active={filters.sizes.includes(s.value)}
                label={s.label}
                count={s.count}
                onClick={() => onChange({ sizes: toggleIn(filters.sizes, s.value) })}
              />
            ))}
          </ChipRail>
        )}
        {subtypeChips.length > 0 && (
          <ChipRail label={t('common:inventory.subtype', { defaultValue: 'Sub-type' })}>
            {subtypeChips.map((s) => (
              <FilterChip
                small
                key={s.value}
                active={filters.subtypes.includes(s.value)}
                label={s.label}
                count={s.count}
                onClick={() => onChange({ subtypes: toggleIn(filters.subtypes, s.value) })}
              />
            ))}
          </ChipRail>
        )}
      </div>
    </div>
  );
}
