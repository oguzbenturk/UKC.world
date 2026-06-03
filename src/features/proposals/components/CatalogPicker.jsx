import React, { useEffect, useMemo, useState } from 'react';
import { Modal, Tabs, Input, List, Button, Empty, Spin, Tag } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import apiClient from '@/shared/services/apiClient';
import { formatMoney } from '../utils/money';

// Each tab loads from an existing catalog endpoint. Picking a row calls onAdd(type, entity).
const TABS = [
  { key: 'package', labelKey: 'catalog.packages', url: '/services/packages' },
  { key: 'service', labelKey: 'catalog.services', url: '/services', filter: (e) => e.service_type !== 'rental' },
  { key: 'accommodation', labelKey: 'catalog.accommodation', url: '/accommodation/units' },
  { key: 'rental', labelKey: 'catalog.rentals', url: '/services', filter: (e) => e.service_type === 'rental' },
];

const priceOf = (e) => Number(
  e.price ?? e.price_per_night ?? e.nightly_rate ?? e.daily_rate ?? e.rental_price ?? e.price_per_session ?? 0,
) || 0;

export default function CatalogPicker({ open, onClose, onAdd, currencyCode = 'EUR' }) {
  const { t } = useTranslation('proposal');
  const [active, setActive] = useState('package');
  const [data, setData] = useState({});
  const [loading, setLoading] = useState({});
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (!open) return;
    const tab = TABS.find((tb) => tb.key === active);
    if (!tab || data[active] !== undefined) return;
    setLoading((l) => ({ ...l, [active]: true }));
    apiClient.get(tab.url)
      .then((res) => {
        const rows = Array.isArray(res.data) ? res.data : (res.data?.items || res.data?.data || []);
        setData((d) => ({ ...d, [active]: rows }));
      })
      .catch(() => setData((d) => ({ ...d, [active]: [] })))
      .finally(() => setLoading((l) => ({ ...l, [active]: false })));
  }, [open, active]); // eslint-disable-line react-hooks/exhaustive-deps

  const rows = useMemo(() => {
    const tab = TABS.find((tb) => tb.key === active);
    let list = data[active] || [];
    if (tab?.filter) list = list.filter(tab.filter);
    const q = query.trim().toLowerCase();
    if (!q) return list;
    return list.filter((e) => `${e.name || e.unit_name || e.title || ''}`.toLowerCase().includes(q));
  }, [data, active, query]);

  const items = TABS.map((tb) => ({
    key: tb.key,
    label: t(tb.labelKey),
    children: loading[tb.key] ? (
      <div style={{ textAlign: 'center', padding: 40 }}><Spin /></div>
    ) : rows.length === 0 ? (
      <Empty description={t('catalog.empty')} />
    ) : (
      <List
        dataSource={rows}
        style={{ maxHeight: 420, overflow: 'auto' }}
        renderItem={(e) => {
          const price = priceOf(e);
          return (
            <List.Item
              actions={[
                <Button key="add" type="primary" size="small" icon={<PlusOutlined />}
                  onClick={() => { onAdd(tb.key, e); }}>
                  {t('catalog.add')}
                </Button>,
              ]}
            >
              <List.Item.Meta
                title={e.name || e.unit_name || e.title || '—'}
                description={[e.category, e.type, e.discipline_tag].filter(Boolean).join(' • ')}
              />
              {price > 0 && <Tag color="blue">{formatMoney(price, e.currency || currencyCode)}</Tag>}
            </List.Item>
          );
        }}
      />
    ),
  }));

  return (
    <Modal
      title={t('catalog.title')}
      open={open}
      onCancel={onClose}
      footer={null}
      width={680}
      destroyOnClose
    >
      <Input.Search
        placeholder={t('catalog.search')}
        allowClear
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        style={{ marginBottom: 12 }}
      />
      <Tabs activeKey={active} onChange={(k) => { setActive(k); setQuery(''); }} items={items} />
    </Modal>
  );
}
