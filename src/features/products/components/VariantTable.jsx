// src/features/products/components/VariantTable.jsx
// Component for managing product variants (size + quantity + pricing)
// Includes size preset chips and live stock summary

import { useState, useEffect, useMemo } from 'react';
import { Table, Button, InputNumber, Input, Popconfirm, Tag, Space } from 'antd';
import { message } from '@/shared/utils/antdStatic';
import { PlusOutlined, DeleteOutlined, InboxOutlined } from '@ant-design/icons';
import { useCurrency } from '@/shared/contexts/CurrencyContext';
import { useTranslation } from 'react-i18next';

// ── Size presets per product category ──────────────────────────────
const SIZE_PRESETS = {
  kitesurf: {
    label: 'Kite sizes',
    sizes: ['5m', '6m', '7m', '8m', '9m', '10m', '11m', '12m', '13m', '14m', '15m'],
  },
  wingfoil: {
    label: 'Wing / Board sizes',
    sizes: ['3m', '4m', '5m', '6m', '7m', '80L', '100L', '120L'],
  },
  efoil: {
    label: 'E-Foil sizes',
    sizes: ['S', 'M', 'L'],
  },
  ion: {
    label: 'Apparel sizes',
    sizes: ['XS', 'S', 'M', 'L', 'XL', 'XXL'],
  },
  'ukc-shop': {
    label: 'Apparel sizes',
    sizes: ['XS', 'S', 'M', 'L', 'XL', 'XXL'],
  },
  secondwind: {
    label: 'Kite sizes',
    sizes: ['7m', '9m', '10m', '12m', '14m'],
  },
  _default: {
    label: 'Common sizes',
    sizes: ['XS', 'S', 'M', 'L', 'XL', 'XXL'],
  },
};

const getPresets = (category) =>
  SIZE_PRESETS[category] || SIZE_PRESETS._default;

const VariantTable = ({ value = [], onChange, currency = 'EUR', category = null }) => {
  const { t } = useTranslation(['manager']);
  const [variants, setVariants] = useState(value);
  const { getCurrencySymbol } = useCurrency();

  useEffect(() => {
    setVariants(value);
  }, [value]);

  // ── Stock summary ────────────────────────────────────────────────
  const stockSummary = useMemo(() => {
    const total = variants.reduce((sum, v) => sum + (v.quantity || 0), 0);
    const withStock = variants.filter(v => (v.quantity || 0) > 0);
    return { total, sizeCount: withStock.length, variantCount: variants.length };
  }, [variants]);

  // ── CRUD helpers ─────────────────────────────────────────────────
  const push = (updated) => {
    setVariants(updated);
    onChange?.(updated);
  };

  const handleAdd = (label = '') => {
    if (label && variants.some(v => v.label === label)) {
      message.warning(`"${label}" is already added`);
      return;
    }
    const newVariant = {
      key: Date.now() + Math.random(),
      label,
      quantity: 0,
      price: null,
      price_final: null,
      cost_price: null,
    };
    push([...variants, newVariant]);
  };

  const handleDelete = (key) => {
    push(variants.filter(v => v.key !== key));
    message.success(t('manager:products.variantTable.variantRemoved'));
  };

  const handleChange = (key, field, val) => {
    push(variants.map(v => (v.key === key ? { ...v, [field]: val } : v)));
  };

  // ── Preset chips ─────────────────────────────────────────────────
  const presets = getPresets(category);
  const existingLabels = new Set(variants.map(v => v.label));

  const handlePresetClick = (size) => {
    if (existingLabels.has(size)) {
      push(variants.filter(v => v.label !== size));
    } else {
      handleAdd(size);
    }
  };

  const handleAddAllPresets = () => {
    const missing = presets.sizes.filter(s => !existingLabels.has(s));
    if (missing.length === 0) {
      message.info(t('manager:products.variantTable.allSizesAdded'));
      return;
    }
    const newVariants = missing.map(label => ({
      key: Date.now() + Math.random(),
      label,
      quantity: 0,
      price: null,
      price_final: null,
      cost_price: null,
    }));
    push([...variants, ...newVariants]);
    message.success(t('manager:products.variantTable.sizesAdded', { count: missing.length }));
  };

  // ── Columns ──────────────────────────────────────────────────────
  const columns = [
    {
      title: t('manager:products.variantTable.sizeVariant'),
      dataIndex: 'label',
      key: 'label',
      width: '20%',
      render: (text, record) => (
        <Input
          value={text}
          onChange={(e) => handleChange(record.key, 'label', e.target.value)}
          placeholder="e.g., XL or 12m"
          size="middle"
        />
      ),
    },
    {
      title: t('manager:products.variantTable.qty'),
      dataIndex: 'quantity',
      key: 'quantity',
      width: '12%',
      render: (text, record) => (
        <InputNumber
          value={text}
          onChange={(val) => handleChange(record.key, 'quantity', val)}
          min={0}
          style={{ width: '100%' }}
          placeholder="0"
          size="middle"
        />
      ),
    },
    {
      title: t('manager:products.variantTable.cost'),
      dataIndex: 'cost_price',
      key: 'cost_price',
      width: '20%',
      render: (text, record) => (
        <InputNumber
          value={text}
          onChange={(val) => handleChange(record.key, 'cost_price', val)}
          min={0}
          step={0.01}
          precision={2}
          prefix={getCurrencySymbol(currency)}
          style={{ width: '100%' }}
          placeholder="0.00"
          size="middle"
        />
      ),
    },
    {
      title: t('manager:products.variantTable.sellingPrice'),
      dataIndex: 'price',
      key: 'price',
      width: '22%',
      render: (text, record) => (
        <InputNumber
          value={text}
          onChange={(val) => handleChange(record.key, 'price', val)}
          min={0}
          step={0.01}
          precision={2}
          prefix={getCurrencySymbol(currency)}
          style={{ width: '100%' }}
          placeholder="0.00"
          size="middle"
        />
      ),
    },
    {
      title: '',
      key: 'action',
      width: '8%',
      render: (_, record) => (
        <Popconfirm
          title={t('manager:products.variantTable.deleteConfirm')}
          onConfirm={() => handleDelete(record.key)}
          okText={t('manager:products.confirm.deleteOk')}
          cancelText={t('manager:products.confirm.deleteCancel')}
        >
          <Button danger icon={<DeleteOutlined />} size="small" type="text" />
        </Popconfirm>
      ),
    },
  ];

  const dataSource = variants.map((v, idx) => ({
    ...v,
    key: v.key || `variant-${idx}`,
  }));

  return (
    <div>
      {/* ── Size Preset Chips ─────────────────────────────────── */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <span style={{ fontSize: 12, color: '#8c8c8c', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            {presets.label}
          </span>
          <Button
            type="link"
            size="small"
            onClick={handleAddAllPresets}
            style={{ fontSize: 12, padding: 0 }}
          >
            {t('manager:products.variantTable.addAll')}
          </Button>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {presets.sizes.map((size) => {
            const active = existingLabels.has(size);
            return (
              <Tag
                key={size}
                onClick={() => handlePresetClick(size)}
                style={{
                  cursor: 'pointer',
                  borderRadius: 16,
                  padding: '2px 12px',
                  fontSize: 13,
                  fontWeight: 500,
                  userSelect: 'none',
                  transition: 'all 0.15s',
                  background: active ? '#1677ff' : '#fafafa',
                  color: active ? '#fff' : '#595959',
                  border: active ? '1px solid #1677ff' : '1px solid #d9d9d9',
                }}
              >
                {size}
              </Tag>
            );
          })}
        </div>
      </div>

      {/* ── Variant Table ─────────────────────────────────────── */}
      <Table
        dataSource={dataSource}
        columns={columns}
        pagination={false}
        size="small"
        locale={{ emptyText: t('manager:products.variantTable.emptyHint') }}
      />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
        <Button
          type="dashed"
          onClick={() => handleAdd('')}
          icon={<PlusOutlined />}
        >
          {t('manager:products.variantTable.addVariant')}
        </Button>

        {/* ── Stock Summary Badge ───────────────────────────── */}
        {stockSummary.variantCount > 0 && (
          <Space size={4} style={{
            background: '#f0f5ff',
            border: '1px solid #d6e4ff',
            borderRadius: 20,
            padding: '4px 14px',
          }}>
            <InboxOutlined style={{ color: '#1677ff' }} />
            <span style={{ fontWeight: 600, color: '#1677ff', fontSize: 14 }}>
              {stockSummary.total}
            </span>
            <span style={{ color: '#8c8c8c', fontSize: 12 }}>
              {stockSummary.sizeCount !== 1
                ? t('manager:products.variantTable.unitsAcrossSizesPlural', { count: stockSummary.sizeCount })
                : t('manager:products.variantTable.unitsAcrossSizes', { count: stockSummary.sizeCount })}
            </span>
          </Space>
        )}
      </div>
    </div>
  );
};

export default VariantTable;
