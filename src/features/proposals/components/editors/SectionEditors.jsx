import React from 'react';
import { Button, Card, Input, Switch, Space, Row, Col, Tag, Typography, Tooltip } from 'antd';
import { PlusOutlined, DeleteOutlined, ShopOutlined, ArrowUpOutlined, ArrowDownOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import MultilangInput from '../MultilangInput';
import { parseMoney } from '../../utils/money';
import { blankLineItem } from '../../utils/catalogToLineItem';

const { Text } = Typography;

// Small helpers for editing arrays immutably.
const replaceAt = (arr, i, val) => arr.map((x, idx) => (idx === i ? val : x));
const removeAt = (arr, i) => arr.filter((_, idx) => idx !== i);
const moveItem = (arr, i, dir) => {
  const j = i + dir;
  if (j < 0 || j >= arr.length) return arr;
  const copy = [...arr];
  [copy[i], copy[j]] = [copy[j], copy[i]];
  return copy;
};

function RowControls({ list, index, onChange, t }) {
  return (
    <Space>
      <Tooltip title="↑"><Button size="small" icon={<ArrowUpOutlined />} disabled={index === 0} onClick={() => onChange(moveItem(list, index, -1))} /></Tooltip>
      <Tooltip title="↓"><Button size="small" icon={<ArrowDownOutlined />} disabled={index === list.length - 1} onClick={() => onChange(moveItem(list, index, 1))} /></Tooltip>
      <Button size="small" danger icon={<DeleteOutlined />} onClick={() => onChange(removeAt(list, index))}>{t('builder.items.remove')}</Button>
    </Space>
  );
}

// ── Package items ─────────────────────────────────────────────────────────────
export function PackageItemsEditor({ items = [], onChange, lang, currencyCode, onAddFromCatalog }) {
  const { t } = useTranslation('proposal');
  const setRow = (i, patch) => onChange(replaceAt(items, i, { ...items[i], ...patch }));
  const setPrice = (i, field, str) => {
    const amt = parseMoney(str);
    const row = items[i];
    setRow(i, { [field]: str, _amounts: { ...(row._amounts || {}), [field]: amt ?? 0, currency: currencyCode } });
  };
  return (
    <Card size="small" title={t('builder.items.title')} extra={(
      <Space>
        <Button size="small" icon={<ShopOutlined />} onClick={onAddFromCatalog}>{t('builder.items.fromCatalog')}</Button>
        <Button size="small" icon={<PlusOutlined />} onClick={() => onChange([...items, blankLineItem(lang, currencyCode)])}>{t('builder.items.addManual')}</Button>
      </Space>
    )}>
      {items.length === 0 && <Text type="secondary">{t('builder.items.empty')}</Text>}
      <Space direction="vertical" style={{ width: '100%' }} size="middle">
        {items.map((it, i) => (
          <Card key={i} size="small" type="inner" bodyStyle={{ padding: 12 }}>
            <Row gutter={[8, 8]}>
              <Col xs={24} md={8}>
                <Text type="secondary" style={{ fontSize: 11 }}>{t('builder.items.item')}</Text>
                <MultilangInput value={it.item} lang={lang} onChange={(v) => setRow(i, { item: v })} />
                {it._source && <Tag color="geekblue" style={{ marginTop: 4 }}>{t('builder.items.source')}</Tag>}
              </Col>
              <Col xs={24} md={8}>
                <Text type="secondary" style={{ fontSize: 11 }}>{t('builder.items.details')}</Text>
                <MultilangInput value={it.details} lang={lang} onChange={(v) => setRow(i, { details: v })} textarea rows={2} />
              </Col>
              <Col xs={12} md={4}>
                <Text type="secondary" style={{ fontSize: 11 }}>{t('builder.items.regular')}</Text>
                <Input value={it.regular || ''} onChange={(e) => setPrice(i, 'regular', e.target.value)} placeholder="250 EUR" />
              </Col>
              <Col xs={12} md={4}>
                <Text type="secondary" style={{ fontSize: 11 }}>{t('builder.items.cash')}</Text>
                <Input value={it.cash || ''} onChange={(e) => setPrice(i, 'cash', e.target.value)} placeholder="225 EUR" />
              </Col>
            </Row>
            <div style={{ marginTop: 8, textAlign: 'right' }}>
              <RowControls list={items} index={i} onChange={onChange} t={t} />
            </div>
          </Card>
        ))}
      </Space>
    </Card>
  );
}

// ── Price summary ─────────────────────────────────────────────────────────────
export function PriceSummaryEditor({ ps = {}, onChange, lang }) {
  const { t } = useTranslation('proposal');
  const auto = ps._auto || { regular_total: true, savings: true, cash_price: true };
  const setAuto = (key, val) => onChange({ ...ps, _auto: { ...auto, [key]: val } });
  const setValue = (key, str) => onChange({ ...ps, [key]: str, _amounts: { ...(ps._amounts || {}), [key]: parseMoney(str) ?? 0 } });
  const setSub = (key, v) => onChange({ ...ps, [key]: v });

  const block = (key, subKey, label) => {
    const isAuto = auto[key] !== false;
    return (
      <Col xs={24} md={8}>
        <Card size="small" type="inner" title={label} extra={(
          <Space size={4}>
            <Text type="secondary" style={{ fontSize: 11 }}>{isAuto ? t('builder.priceSummary.auto') : t('builder.priceSummary.manual')}</Text>
            <Switch size="small" checked={isAuto} onChange={(v) => setAuto(key, v)} />
          </Space>
        )}>
          <Input value={ps[key] || ''} disabled={isAuto} onChange={(e) => setValue(key, e.target.value)} placeholder="—" />
          <div style={{ marginTop: 8 }}>
            <Text type="secondary" style={{ fontSize: 11 }}>{t('builder.priceSummary.regularSub')}</Text>
            <MultilangInput value={ps[subKey]} lang={lang} onChange={(v) => setSub(subKey, v)} />
          </div>
        </Card>
      </Col>
    );
  };

  return (
    <Card size="small" title={t('builder.priceSummary.title')}>
      <Row gutter={[8, 8]}>
        {block('regular_total', 'regular_sub', t('builder.priceSummary.regularTotal'))}
        {block('savings', 'savings_sub', t('builder.priceSummary.savings'))}
        {block('cash_price', 'cash_sub', t('builder.priceSummary.cashPrice'))}
      </Row>
    </Card>
  );
}

// ── What's included ───────────────────────────────────────────────────────────
export function IncludedEditor({ list = [], onChange, lang }) {
  const { t } = useTranslation('proposal');
  const setRow = (i, patch) => onChange(replaceAt(list, i, { ...list[i], ...patch }));
  return (
    <Card size="small" title={t('builder.included.title')} extra={(
      <Button size="small" icon={<PlusOutlined />} onClick={() => onChange([...list, { title: {}, sub: {}, desc: {} }])}>{t('builder.included.add')}</Button>
    )}>
      {list.length === 0 && <Text type="secondary">{t('builder.included.empty')}</Text>}
      <Space direction="vertical" style={{ width: '100%' }} size="middle">
        {list.map((b, i) => (
          <Card key={i} size="small" type="inner" bodyStyle={{ padding: 12 }}>
            <Row gutter={[8, 8]}>
              <Col xs={24} md={8}>
                <Text type="secondary" style={{ fontSize: 11 }}>{t('builder.included.cardTitle')}</Text>
                <MultilangInput value={b.title} lang={lang} onChange={(v) => setRow(i, { title: v })} />
                <div style={{ marginTop: 6 }}>
                  <Text type="secondary" style={{ fontSize: 11 }}>{t('builder.included.sub')}</Text>
                  <MultilangInput value={b.sub} lang={lang} onChange={(v) => setRow(i, { sub: v })} />
                </div>
              </Col>
              <Col xs={24} md={16}>
                <Text type="secondary" style={{ fontSize: 11 }}>{t('builder.included.desc')}</Text>
                <MultilangInput value={b.desc} lang={lang} onChange={(v) => setRow(i, { desc: v })} textarea rows={3} />
              </Col>
            </Row>
            <div style={{ marginTop: 8, textAlign: 'right' }}>
              <RowControls list={list} index={i} onChange={onChange} t={t} />
            </div>
          </Card>
        ))}
      </Space>
    </Card>
  );
}

// ── Weekly schedule ───────────────────────────────────────────────────────────
export function ScheduleEditor({ list = [], onChange, lang, note, onNoteChange }) {
  const { t } = useTranslation('proposal');
  const setRow = (i, patch) => onChange(replaceAt(list, i, { ...list[i], ...patch }));
  return (
    <Card size="small" title={t('builder.schedule.title')} extra={(
      <Button size="small" icon={<PlusOutlined />} onClick={() => onChange([...list, { day: {}, date: {}, activity: {}, rental: '', cost: '', highlight: false }])}>{t('builder.schedule.add')}</Button>
    )}>
      {list.length === 0 && <Text type="secondary">{t('builder.schedule.empty')}</Text>}
      <Space direction="vertical" style={{ width: '100%' }} size="small">
        {list.map((d, i) => (
          <Card key={i} size="small" type="inner" bodyStyle={{ padding: 10 }}>
            <Row gutter={[8, 8]} align="middle">
              <Col xs={8} md={3}>
                <Text type="secondary" style={{ fontSize: 11 }}>{t('builder.schedule.day')}</Text>
                <MultilangInput value={d.day} lang={lang} onChange={(v) => setRow(i, { day: v })} size="small" />
              </Col>
              <Col xs={8} md={3}>
                <Text type="secondary" style={{ fontSize: 11 }}>{t('builder.schedule.date')}</Text>
                <MultilangInput value={d.date} lang={lang} onChange={(v) => setRow(i, { date: v })} size="small" />
              </Col>
              <Col xs={24} md={8}>
                <Text type="secondary" style={{ fontSize: 11 }}>{t('builder.schedule.activity')}</Text>
                <MultilangInput value={d.activity} lang={lang} onChange={(v) => setRow(i, { activity: v })} size="small" />
              </Col>
              <Col xs={8} md={3}>
                <Text type="secondary" style={{ fontSize: 11 }}>{t('builder.schedule.rental')}</Text>
                <Input value={d.rental || ''} onChange={(e) => setRow(i, { rental: e.target.value })} size="small" placeholder="-" />
              </Col>
              <Col xs={8} md={3}>
                <Text type="secondary" style={{ fontSize: 11 }}>{t('builder.schedule.cost')}</Text>
                <Input value={d.cost || ''} onChange={(e) => setRow(i, { cost: e.target.value })} size="small" placeholder="-" />
              </Col>
              <Col xs={8} md={4}>
                <Space>
                  <Tooltip title={t('builder.schedule.highlight')}>
                    <Switch size="small" checked={!!d.highlight} onChange={(v) => setRow(i, { highlight: v })} />
                  </Tooltip>
                  <Button size="small" danger icon={<DeleteOutlined />} onClick={() => onChange(removeAt(list, i))} />
                </Space>
              </Col>
            </Row>
          </Card>
        ))}
      </Space>
      <div style={{ marginTop: 10 }}>
        <Text type="secondary" style={{ fontSize: 11 }}>{t('builder.schedule.note')}</Text>
        <MultilangInput value={note} lang={lang} onChange={onNoteChange} textarea rows={2} />
      </div>
    </Card>
  );
}

// ── Benefits ──────────────────────────────────────────────────────────────────
export function BenefitsEditor({ list = [], onChange, lang }) {
  const { t } = useTranslation('proposal');
  const setRow = (i, patch) => onChange(replaceAt(list, i, { ...list[i], ...patch }));
  return (
    <Card size="small" title={t('builder.benefits.title')} extra={(
      <Button size="small" icon={<PlusOutlined />} onClick={() => onChange([...list, { title: {}, desc: {} }])}>{t('builder.benefits.add')}</Button>
    )}>
      {list.length === 0 && <Text type="secondary">{t('builder.benefits.empty')}</Text>}
      <Row gutter={[8, 8]}>
        {list.map((b, i) => (
          <Col xs={24} md={12} key={i}>
            <Card size="small" type="inner" bodyStyle={{ padding: 12 }}>
              <Text type="secondary" style={{ fontSize: 11 }}>{t('builder.benefits.benefitTitle')}</Text>
              <MultilangInput value={b.title} lang={lang} onChange={(v) => setRow(i, { title: v })} />
              <div style={{ marginTop: 6 }}>
                <Text type="secondary" style={{ fontSize: 11 }}>{t('builder.benefits.desc')}</Text>
                <MultilangInput value={b.desc} lang={lang} onChange={(v) => setRow(i, { desc: v })} textarea rows={2} />
              </div>
              <div style={{ marginTop: 8, textAlign: 'right' }}>
                <RowControls list={list} index={i} onChange={onChange} t={t} />
              </div>
            </Card>
          </Col>
        ))}
      </Row>
    </Card>
  );
}

// ── Terms ─────────────────────────────────────────────────────────────────────
export function TermsEditor({ list = [], onChange, lang }) {
  const { t } = useTranslation('proposal');
  return (
    <Card size="small" title={t('builder.terms.title')} extra={(
      <Button size="small" icon={<PlusOutlined />} onClick={() => onChange([...list, {}])}>{t('builder.terms.add')}</Button>
    )}>
      {list.length === 0 && <Text type="secondary">{t('builder.terms.empty')}</Text>}
      <Space direction="vertical" style={{ width: '100%' }} size="small">
        {list.map((term, i) => (
          <Row key={i} gutter={8} align="middle" wrap={false}>
            <Col flex="auto"><MultilangInput value={term} lang={lang} onChange={(v) => onChange(replaceAt(list, i, v))} /></Col>
            <Col flex="none"><Button danger icon={<DeleteOutlined />} onClick={() => onChange(removeAt(list, i))} /></Col>
          </Row>
        ))}
      </Space>
    </Card>
  );
}
