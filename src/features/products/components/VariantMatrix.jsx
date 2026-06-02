// src/features/products/components/VariantMatrix.jsx
// Color x Size stock grid for the product form.
//
// Rows = the product's colours (the same list authored on the Product tab,
// each with its own photo bucket). Columns = sizes. Each cell holds the stock
// quantity for that colour+size combination -- e.g. "3 x XS Blue". Price and
// cost are set once per size (they rarely vary by colour), shown as summary
// rows beneath the grid.
//
// The pure (color x size) <-> variants[] conversion lives in
// ../utils/variantMatrix.js so it can be unit tested without React/antd.

import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { Table, InputNumber, Input, Button, Tooltip } from 'antd';
import { message } from '@/shared/utils/antdStatic';
import { CloseOutlined, InboxOutlined } from '@ant-design/icons';
import { useCurrency } from '@/shared/contexts/CurrencyContext';
import { useTranslation } from 'react-i18next';
import { cellKey as ck, hydrateMatrix, buildVariants } from '../utils/variantMatrix';

// Size presets per product category (mirrors VariantTable).
const SIZE_PRESETS = {
  kitesurf: ['5m', '6m', '7m', '8m', '9m', '10m', '11m', '12m', '13m', '14m', '15m'],
  wingfoil: ['3m', '4m', '5m', '6m', '7m', '80L', '100L', '120L'],
  efoil: ['S', 'M', 'L'],
  ion: ['XS', 'S', 'M', 'L', 'XL', 'XXL'],
  'ukc-shop': ['XS', 'S', 'M', 'L', 'XL', 'XXL'],
  secondwind: ['7m', '9m', '10m', '12m', '14m'],
  _default: ['XS', 'S', 'M', 'L', 'XL', 'XXL'],
};
const getPresetSizes = (category) => SIZE_PRESETS[category] || SIZE_PRESETS._default;

// Colour swatch rendering (mirrors the storefront ProductVariantSelector).
const COLOR_MAP = {
  black: '#1a1a1a', white: '#fafafa', red: '#e53935', blue: '#1e88e5',
  green: '#43a047', yellow: '#fdd835', orange: '#fb8c00', purple: '#8e24aa',
  pink: '#d81b60', gray: '#757575', grey: '#757575', navy: '#1a237e',
  mint: '#26a69a', coral: '#ff7043', lime: '#c0ca33', turquoise: '#00acc1',
  slate: '#546e7a', silver: '#9e9e9e', gold: '#ffb300', brown: '#6d4c41',
  beige: '#d7ccc8', tan: '#bcaaa4', olive: '#827717', teal: '#00897b',
  heron: '#607d8b', dark: '#424242', petrol: '#006064', sand: '#c2b280',
};
const getColorHex = (name) => {
  const lower = String(name).toLowerCase().trim();
  if (COLOR_MAP[lower]) return COLOR_MAP[lower];
  for (const [key, value] of Object.entries(COLOR_MAP)) {
    if (lower.includes(key)) return value;
  }
  return '#9e9e9e';
};
const getSwatchBackground = (color) => {
  const isDual = color.includes('/') || (color.includes('-') && !color.toLowerCase().startsWith('dark'));
  if (isDual) {
    const sep = color.includes('/') ? '/' : '-';
    const parts = color.split(sep).map((c) => c.trim());
    if (parts.length >= 2) return `linear-gradient(135deg, ${getColorHex(parts[0])} 50%, ${getColorHex(parts[1])} 50%)`;
  }
  return getColorHex(color);
};

const VariantMatrix = ({
  value = [],
  onChange,
  colorNames = [],
  colorImageCounts = {},
  currency = 'EUR',
  category = null,
}) => {
  const { t } = useTranslation(['manager']);
  const { getCurrencySymbol } = useCurrency();
  const symbol = getCurrencySymbol(currency);

  // One-shot init from the incoming variants; thereafter the grid owns its
  // state and pushes changes up via onChange (parent remounts via `key` on
  // product change, so a fresh edit always re-hydrates).
  const [init] = useState(() => hydrateMatrix(value));
  const [sizes, setSizes] = useState(init.sizes);
  const [cells, setCells] = useState(init.cells);
  const [sizePrice, setSizePrice] = useState(init.sizePrice);
  const [sizeCost, setSizeCost] = useState(init.sizeCost);
  const legacyBySize = init.legacyBySize;

  // Apply a state change AND emit the recomputed variants in one step.
  const commit = useCallback(
    (ns, nc, nsp, nsc) => {
      setSizes(ns);
      setCells(nc);
      setSizePrice(nsp);
      setSizeCost(nsc);
      onChange?.(buildVariants(colorNames, ns, nc, nsp, nsc));
    },
    [colorNames, onChange],
  );

  // Re-emit when the colour list changes (colours are authored on the other
  // tab). Removed colours drop out; newly added colours appear as empty rows.
  const firstRun = useRef(true);
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    onChange?.(buildVariants(colorNames, sizes, cells, sizePrice, sizeCost));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [colorNames]);

  // Handlers
  const setCell = (color, size, val) =>
    commit(sizes, { ...cells, [ck(color, size)]: val == null ? 0 : val }, sizePrice, sizeCost);

  const addSize = (raw) => {
    const size = String(raw).trim();
    if (!size) return;
    if (sizes.includes(size)) {
      message.warning(t('manager:products.variantMatrix.sizeExists', { defaultValue: `"{{size}}" is already a column`, size }));
      return;
    }
    commit([...sizes, size], cells, sizePrice, sizeCost);
  };

  const removeSize = (size) => {
    const nextCells = { ...cells };
    for (const color of colorNames) delete nextCells[ck(color, size)];
    const nextPrice = { ...sizePrice };
    const nextCost = { ...sizeCost };
    delete nextPrice[size];
    delete nextCost[size];
    commit(sizes.filter((s) => s !== size), nextCells, nextPrice, nextCost);
  };

  const togglePreset = (size) => (sizes.includes(size) ? removeSize(size) : addSize(size));

  const addAllPresets = () => {
    const missing = getPresetSizes(category).filter((s) => !sizes.includes(s));
    if (missing.length === 0) {
      message.info(t('manager:products.variantMatrix.allSizesAdded', { defaultValue: 'All preset sizes already added' }));
      return;
    }
    commit([...sizes, ...missing], cells, sizePrice, sizeCost);
  };

  const setPrice = (size, val) => commit(sizes, cells, { ...sizePrice, [size]: val }, sizeCost);
  const setCost = (size, val) => commit(sizes, cells, sizePrice, { ...sizeCost, [size]: val });

  // Derived totals
  const rowTotal = useCallback(
    (color) => sizes.reduce((sum, s) => sum + (cells[ck(color, s)] || 0), 0),
    [sizes, cells],
  );
  const grandTotal = useMemo(
    () => colorNames.reduce((sum, color) => sum + rowTotal(color), 0),
    [colorNames, rowTotal],
  );

  const [sizeInput, setSizeInput] = useState('');
  const presetSizes = getPresetSizes(category);

  // Columns: colour row-header + one per size + per-row total
  const columns = [
    {
      title: t('manager:products.variantMatrix.colorHeader', { defaultValue: 'Colour' }),
      dataIndex: 'color',
      key: 'color',
      fixed: 'left',
      width: 170,
      render: (color) => {
        const photos = colorImageCounts[color] || 0;
        return (
          <div className="flex items-center gap-2">
            <span
              className="inline-block rounded"
              style={{ width: 18, height: 18, background: getSwatchBackground(color), border: '1px solid #e2e8f0', flexShrink: 0 }}
            />
            <span className="text-xs font-semibold text-slate-700 capitalize truncate">{color}</span>
            <Tooltip title={t('manager:products.variantMatrix.photoTip', { defaultValue: 'Photos linked to this colour (shown on the storefront when selected)' })}>
              <span className="text-[10px] text-slate-400 whitespace-nowrap">📷 {photos}</span>
            </Tooltip>
          </div>
        );
      },
    },
    ...sizes.map((size) => ({
      title: (
        <div className="flex items-center justify-between gap-1">
          <span className="text-xs font-semibold">{size}</span>
          <button
            type="button"
            onClick={() => removeSize(size)}
            className="text-slate-300 hover:text-red-500 transition-colors"
            title={t('manager:products.variantMatrix.removeSize', { defaultValue: 'Remove this size column' })}
          >
            <CloseOutlined style={{ fontSize: 10 }} />
          </button>
        </div>
      ),
      dataIndex: size,
      key: size,
      width: 84,
      align: 'center',
      render: (_, record) => (
        <InputNumber
          value={cells[ck(record.color, size)] ?? null}
          onChange={(val) => setCell(record.color, size, val)}
          min={0}
          precision={0}
          size="small"
          placeholder="0"
          style={{ width: '100%' }}
          controls={false}
        />
      ),
    })),
    {
      title: t('manager:products.variantMatrix.rowTotal', { defaultValue: 'Total' }),
      key: '__total',
      fixed: 'right',
      width: 64,
      align: 'center',
      render: (_, record) => (
        <span className="text-xs font-semibold text-slate-500">{rowTotal(record.color)}</span>
      ),
    },
  ];

  const dataSource = colorNames.map((color) => ({ key: color, color }));

  // Empty states
  if (colorNames.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50/40 px-4 py-6 text-center">
        <p className="text-xs text-slate-400">
          {t('manager:products.variantMatrix.addColorsFirst', {
            defaultValue: 'Add at least one colour on the Product tab to build the colour x size stock grid.',
          })}
        </p>
      </div>
    );
  }

  return (
    <div>
      {/* Size column manager */}
      <div className="mb-3">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-[11px] font-medium uppercase tracking-wider text-slate-400">
            {t('manager:products.variantMatrix.sizesLabel', { defaultValue: 'Sizes (columns)' })}
          </span>
          <Button type="link" size="small" onClick={addAllPresets} style={{ fontSize: 12, padding: 0 }}>
            {t('manager:products.variantMatrix.addAll', { defaultValue: 'Add all presets' })}
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {presetSizes.map((size) => {
            const active = sizes.includes(size);
            return (
              <button
                key={size}
                type="button"
                onClick={() => togglePreset(size)}
                className="rounded-full px-3 py-0.5 text-xs font-medium transition-colors"
                style={{
                  background: active ? '#1677ff' : '#f8fafc',
                  color: active ? '#fff' : '#475569',
                  border: active ? '1px solid #1677ff' : '1px solid #e2e8f0',
                }}
              >
                {size}
              </button>
            );
          })}
          <Input
            value={sizeInput}
            onChange={(e) => setSizeInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                e.stopPropagation();
                addSize(sizeInput);
                setSizeInput('');
              }
            }}
            placeholder={t('manager:products.variantMatrix.customSize', { defaultValue: 'Custom size...' })}
            size="small"
            style={{ width: 110 }}
          />
        </div>
      </div>

      {sizes.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50/40 px-4 py-6 text-center">
          <p className="text-xs text-slate-400">
            {t('manager:products.variantMatrix.addSizesHint', {
              defaultValue: 'Pick the sizes you stock above to build the grid, then enter how many of each colour you have.',
            })}
          </p>
        </div>
      ) : (
        <>
          <Table
            dataSource={dataSource}
            columns={columns}
            pagination={false}
            size="small"
            scroll={{ x: 'max-content' }}
            bordered
            summary={() => (
              <Table.Summary fixed>
                <Table.Summary.Row>
                  <Table.Summary.Cell index={0}>
                    <span className="text-[11px] font-medium text-slate-400">
                      {t('manager:products.variantMatrix.pricePerSize', { defaultValue: 'Selling price / size' })}
                    </span>
                  </Table.Summary.Cell>
                  {sizes.map((size, i) => (
                    <Table.Summary.Cell index={i + 1} key={size}>
                      <InputNumber
                        value={sizePrice[size] ?? null}
                        onChange={(val) => setPrice(size, val)}
                        min={0}
                        step={0.01}
                        precision={2}
                        size="small"
                        placeholder="0.00"
                        prefix={symbol}
                        style={{ width: '100%' }}
                        controls={false}
                      />
                    </Table.Summary.Cell>
                  ))}
                  <Table.Summary.Cell index={sizes.length + 1} />
                </Table.Summary.Row>
                <Table.Summary.Row>
                  <Table.Summary.Cell index={0}>
                    <span className="text-[11px] font-medium text-slate-400">
                      {t('manager:products.variantMatrix.costPerSize', { defaultValue: 'Cost price / size' })}
                    </span>
                  </Table.Summary.Cell>
                  {sizes.map((size, i) => (
                    <Table.Summary.Cell index={i + 1} key={size}>
                      <InputNumber
                        value={sizeCost[size] ?? null}
                        onChange={(val) => setCost(size, val)}
                        min={0}
                        step={0.01}
                        precision={2}
                        size="small"
                        placeholder="0.00"
                        prefix={symbol}
                        style={{ width: '100%' }}
                        controls={false}
                      />
                    </Table.Summary.Cell>
                  ))}
                  <Table.Summary.Cell index={sizes.length + 1} />
                </Table.Summary.Row>
              </Table.Summary>
            )}
          />

          {/* Legacy notice: colour-less stock from an older edit cannot be placed in a cell. */}
          {Object.keys(legacyBySize).length > 0 && (
            <p className="mt-2 text-[11px] text-amber-600">
              {t('manager:products.variantMatrix.legacyNotice', {
                defaultValue:
                  'Heads up: this product had stock that was not tied to a colour. Re-enter the quantities per colour above. The old per-size totals were: {{summary}}.',
                summary: Object.entries(legacyBySize).map(([s, q]) => `${s}: ${q}`).join(', '),
              })}
            </p>
          )}

          <div className="mt-3 flex justify-end">
            <span
              className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-1"
              style={{ background: '#f0f5ff', border: '1px solid #d6e4ff' }}
            >
              <InboxOutlined style={{ color: '#1677ff' }} />
              <span className="font-semibold text-sm" style={{ color: '#1677ff' }}>{grandTotal}</span>
              <span className="text-xs text-slate-500">
                {t('manager:products.variantMatrix.totalUnits', { defaultValue: 'units in stock' })}
              </span>
            </span>
          </div>
        </>
      )}
    </div>
  );
};

export default VariantMatrix;
