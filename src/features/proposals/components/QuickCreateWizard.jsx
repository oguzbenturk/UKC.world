import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Modal, Tabs, Input, Select, DatePicker, InputNumber, Button, Space, Tag, List,
  Empty, Typography, Row, Col, message, Spin, Divider,
} from 'antd';
import { DeleteOutlined, ThunderboltOutlined, FileTextOutlined, FileAddOutlined, PlusOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { useTranslation } from 'react-i18next';
import { useCurrency } from '@/shared/contexts/CurrencyContext';
import i18n from '@/i18n';
import apiClient from '@/shared/services/apiClient';
import * as svc from '../services/proposalsService';
import { OUTPUT_LANGUAGES, buildDefaultContent } from '../constants';
import { loadProposalLabels } from '../hooks/useProposalLabels';
import { generateProposalContent } from '../utils/generateProposal';
import CatalogPicker from './CatalogPicker';

const { Text, Paragraph } = Typography;

const DEFAULT_QTY = { accommodation: 5, service: 6, rental: 1, package: 1 };
const QTY_UNIT = { accommodation: 'nights', service: 'hours', rental: 'count', package: 'count' };
const asArray = (d) => (Array.isArray(d) ? d : (d?.items || d?.data || []));

export default function QuickCreateWizard({ open, onClose }) {
  const { t } = useTranslation('proposal');
  const navigate = useNavigate();
  const { currencies, baseCurrency } = useCurrency();

  const initialLang = OUTPUT_LANGUAGES.some((l) => l.code === i18n.language) ? i18n.language : 'tr';
  const [tab, setTab] = useState('generate');
  const [busy, setBusy] = useState(false);

  // header / pricing inputs
  const [preparedFor, setPreparedFor] = useState('');
  const [customerId, setCustomerId] = useState(null);
  const [genLang, setGenLang] = useState(initialLang);
  const [currencyCode, setCurrencyCode] = useState(baseCurrency?.currency_code || 'EUR');
  const [startDate, setStartDate] = useState(dayjs());
  const [discountPct, setDiscountPct] = useState(10);
  const [validDays, setValidDays] = useState(7);
  const [hoursPerDay, setHoursPerDay] = useState(2);
  const [people, setPeople] = useState(1);

  // inline service pickers
  const [packageId, setPackageId] = useState(null);
  const [packageQty, setPackageQty] = useState(1);
  const [accomId, setAccomId] = useState(null);
  const [accomNights, setAccomNights] = useState(5);
  const [lessonId, setLessonId] = useState(null);
  const [lessonHours, setLessonHours] = useState(6);
  const [rentalId, setRentalId] = useState(null);
  const [rentalQty, setRentalQty] = useState(1);
  const [extras, setExtras] = useState([]);
  const [pickerOpen, setPickerOpen] = useState(false);

  // catalog data
  const [packages, setPackages] = useState([]);
  const [accomUnits, setAccomUnits] = useState([]);
  const [lessonServices, setLessonServices] = useState([]);
  const [rentalServices, setRentalServices] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [templates, setTemplates] = useState(null);

  useEffect(() => {
    if (!open) return;
    Promise.all([
      apiClient.get('/accommodation/units').then((r) => asArray(r.data)).catch(() => []),
      apiClient.get('/services').then((r) => asArray(r.data)).catch(() => []),
      apiClient.get('/services/packages').then((r) => asArray(r.data)).catch(() => []),
      apiClient.get('/users', { params: { role: 'student' } }).then((r) => asArray(r.data)).catch(() => []),
    ]).then(([acc, services, pkgs, cust]) => {
      setAccomUnits(acc);
      setLessonServices(services.filter((s) => s.service_type !== 'rental'));
      setRentalServices(services.filter((s) => s.service_type === 'rental'));
      setPackages(pkgs);
      setCustomers(cust);
    });
  }, [open]);

  useEffect(() => {
    if (open && tab === 'template' && templates === null) {
      svc.listTemplates().then(setTemplates).catch(() => setTemplates([]));
    }
  }, [open, tab, templates]);

  const customerOptions = useMemo(() => customers.map((c) => ({
    value: c.id,
    label: `${c.first_name || ''} ${c.last_name || ''}`.trim() + (c.email ? ` (${c.email})` : ''),
    name: `${c.first_name || ''} ${c.last_name || ''}`.trim(),
  })), [customers]);

  const packageOptions = useMemo(() => packages.map((p) => ({ value: p.id, label: p.name })), [packages]);
  const accomOptions = useMemo(() => accomUnits.map((u) => ({
    value: u.id, label: `${u.name || u.unit_name || '—'}${u.capacity ? ` · ${u.capacity}p` : ''}`,
  })), [accomUnits]);
  const lessonOptions = useMemo(() => lessonServices.map((s) => ({ value: s.id, label: s.name })), [lessonServices]);
  const rentalOptions = useMemo(() => rentalServices.map((s) => ({ value: s.id, label: s.name })), [rentalServices]);

  const reset = () => {
    setPreparedFor(''); setCustomerId(null); setDiscountPct(10); setValidDays(7);
    setHoursPerDay(2); setPeople(1); setStartDate(dayjs());
    setPackageId(null); setPackageQty(1); setAccomId(null); setAccomNights(5);
    setLessonId(null); setLessonHours(6); setRentalId(null); setRentalQty(1);
    setExtras([]); setTab('generate'); setTemplates(null);
  };
  const close = () => { reset(); onClose(); };

  const buildSelections = () => {
    const sels = [];
    const pkg = packages.find((p) => p.id === packageId);
    if (pkg) sels.push({ type: 'package', entity: pkg, qty: packageQty });
    const accom = accomUnits.find((u) => u.id === accomId);
    if (accom) sels.push({ type: 'accommodation', entity: accom, qty: accomNights });
    const lesson = lessonServices.find((s) => s.id === lessonId);
    if (lesson) sels.push({ type: 'service', entity: lesson, qty: lessonHours });
    const rental = rentalServices.find((s) => s.id === rentalId);
    if (rental) sels.push({ type: 'rental', entity: rental, qty: rentalQty });
    sels.push(...extras);
    return sels;
  };

  const onGenerate = async () => {
    const selections = buildSelections();
    if (!selections.length) { message.warning(t('wizard.noServices')); return; }
    setBusy(true);
    try {
      const tp = await loadProposalLabels(genLang);
      const { content, totals } = generateProposalContent(selections, {
        startDate: startDate ? startDate.format('YYYY-MM-DD') : undefined,
        discountPct: Number(discountPct) || 0,
        hoursPerDay: Number(hoursPerDay) || 2,
        people: Number(people) || 1,
        lang: genLang,
        currencyCode,
        validDays: Number(validDays) || 0,
        tp,
      });
      const title = `${preparedFor || t('wizard.title')} — ${(startDate || dayjs()).format('DD MMM')}`;
      const validUntil = validDays ? dayjs().add(Number(validDays), 'day').format('YYYY-MM-DD') : null;
      const created = await svc.createProposal({
        title,
        prepared_for: preparedFor || null,
        customer_id: customerId || null,
        language: genLang,
        currency_code: currencyCode,
        valid_until: validUntil,
        content,
        regular_total: totals.regularTotal,
        savings_total: totals.savings,
        cash_total: totals.cashTotal,
      });
      close();
      navigate(`/proposals/${created.id}`);
    } catch (e) {
      message.error('Generate failed');
    } finally {
      setBusy(false);
    }
  };

  const useTemplate = async (templateId) => {
    setBusy(true);
    try {
      const created = await svc.duplicateProposal(templateId);
      close();
      navigate(`/proposals/${created.id}`);
    } catch { message.error('Failed'); } finally { setBusy(false); }
  };

  const createBlank = async () => {
    setBusy(true);
    try {
      const created = await svc.createProposal({ title: 'Untitled Proposal', content: buildDefaultContent(), language: genLang, currency_code: currencyCode });
      close();
      navigate(`/proposals/${created.id}`);
    } catch { message.error('Failed'); } finally { setBusy(false); }
  };

  const serviceRow = (label, options, value, onValue, qtyLabel, qtyValue, onQty) => (
    <Row gutter={8} align="bottom" style={{ marginBottom: 10 }}>
      <Col flex="auto">
        <Text type="secondary" style={{ fontSize: 12 }}>{label}</Text>
        <Select showSearch allowClear style={{ width: '100%' }} value={value || undefined}
          options={options} optionFilterProp="label" onChange={(v) => onValue(v || null)}
          placeholder={t('wizard.selectService')} />
      </Col>
      <Col flex="none">
        <Text type="secondary" style={{ fontSize: 12, display: 'block' }}>&nbsp;</Text>
        <InputNumber min={1} value={qtyValue} onChange={onQty} addonAfter={qtyLabel} style={{ width: 150 }} disabled={!value} />
      </Col>
    </Row>
  );

  const generateTab = (
    <Space direction="vertical" style={{ width: '100%' }} size="middle">
      <Row gutter={[12, 12]}>
        <Col xs={24} md={12}>
          <Text type="secondary" style={{ fontSize: 12 }}>{t('wizard.preparedFor')}</Text>
          <Input value={preparedFor} onChange={(e) => setPreparedFor(e.target.value)} placeholder="Ahmet Yılmaz" />
        </Col>
        <Col xs={24} md={12}>
          <Text type="secondary" style={{ fontSize: 12 }}>{t('wizard.customer')}</Text>
          <Select showSearch allowClear style={{ width: '100%' }} value={customerId || undefined}
            options={customerOptions} optionFilterProp="label"
            onChange={(val, opt) => { setCustomerId(val || null); if (val && !preparedFor) setPreparedFor(opt?.name || ''); }}
            placeholder="—" />
        </Col>
      </Row>

      <Divider orientation="left" style={{ margin: '4px 0' }}>{t('wizard.services')}</Divider>
      {serviceRow(t('wizard.package'), packageOptions, packageId, setPackageId, t('wizard.qty.count'), packageQty, setPackageQty)}
      {serviceRow(t('wizard.accommodation'), accomOptions, accomId, setAccomId, t('wizard.qty.nights'), accomNights, setAccomNights)}
      {serviceRow(t('wizard.lesson'), lessonOptions, lessonId, setLessonId, t('wizard.qty.hours'), lessonHours, setLessonHours)}
      {serviceRow(t('wizard.rental'), rentalOptions, rentalId, setRentalId, t('wizard.qty.count'), rentalQty, setRentalQty)}

      {extras.length > 0 && (
        <List size="small" dataSource={extras} renderItem={(s, i) => (
          <List.Item actions={[
            <InputNumber key="q" size="small" min={1} value={s.qty} onChange={(v) => setExtras((p) => p.map((x, idx) => (idx === i ? { ...x, qty: v } : x)))} addonAfter={t(`wizard.qty.${QTY_UNIT[s.type]}`)} style={{ width: 120 }} />,
            <Button key="d" size="small" danger icon={<DeleteOutlined />} onClick={() => setExtras((p) => p.filter((_, idx) => idx !== i))} />,
          ]}>
            <Space><Tag color="blue">{s.type}</Tag>{s.entity.name || s.entity.unit_name || s.entity.title}</Space>
          </List.Item>
        )} />
      )}
      <Button size="small" type="dashed" icon={<PlusOutlined />} onClick={() => setPickerOpen(true)}>{t('wizard.addOther')}</Button>

      <Divider style={{ margin: '4px 0' }} />
      <Row gutter={[12, 12]}>
        <Col xs={12} md={6}>
          <Text type="secondary" style={{ fontSize: 12 }}>{t('wizard.people')}</Text>
          <InputNumber style={{ width: '100%' }} min={1} max={50} value={people} onChange={setPeople} />
        </Col>
        <Col xs={12} md={6}>
          <Text type="secondary" style={{ fontSize: 12 }}>{t('wizard.startDate')}</Text>
          <DatePicker style={{ width: '100%' }} value={startDate} onChange={setStartDate} allowClear={false} />
        </Col>
        <Col xs={12} md={6}>
          <Text type="secondary" style={{ fontSize: 12 }}>{t('wizard.discount')}</Text>
          <InputNumber style={{ width: '100%' }} min={0} max={100} value={discountPct} onChange={setDiscountPct} addonAfter="%" />
        </Col>
        <Col xs={12} md={6}>
          <Text type="secondary" style={{ fontSize: 12 }}>{t('wizard.hoursPerDay')}</Text>
          <InputNumber style={{ width: '100%' }} min={1} max={12} value={hoursPerDay} onChange={setHoursPerDay} />
        </Col>
        <Col xs={12} md={6}>
          <Text type="secondary" style={{ fontSize: 12 }}>{t('wizard.language')}</Text>
          <Select style={{ width: '100%' }} value={genLang} onChange={setGenLang}
            options={OUTPUT_LANGUAGES.map((l) => ({ value: l.code, label: l.label }))} />
        </Col>
        <Col xs={12} md={6}>
          <Text type="secondary" style={{ fontSize: 12 }}>{t('wizard.currency')}</Text>
          <Select style={{ width: '100%' }} value={currencyCode} onChange={setCurrencyCode} showSearch
            options={(currencies || []).map((c) => ({ value: c.currency_code, label: c.currency_code }))} />
        </Col>
        <Col xs={12} md={6}>
          <Text type="secondary" style={{ fontSize: 12 }}>{t('wizard.validDays')}</Text>
          <InputNumber style={{ width: '100%' }} min={0} max={365} value={validDays} onChange={setValidDays} />
        </Col>
      </Row>

      <Button type="primary" size="large" block icon={<ThunderboltOutlined />} loading={busy} onClick={onGenerate}>
        {t('wizard.generate')}
      </Button>
    </Space>
  );

  const templateTab = (
    templates === null ? <div style={{ textAlign: 'center', padding: 40 }}><Spin /></div>
      : templates.length === 0 ? <Empty description={t('wizard.template.empty')} />
        : (
          <List dataSource={templates} renderItem={(tpl) => (
            <List.Item actions={[<Button key="u" type="primary" size="small" loading={busy} onClick={() => useTemplate(tpl.id)}>{t('wizard.template.use')}</Button>]}>
              <List.Item.Meta title={tpl.title} description={tpl.prepared_for || ''} />
            </List.Item>
          )} />
        )
  );

  const blankTab = (
    <div style={{ textAlign: 'center', padding: '24px 0' }}>
      <Paragraph type="secondary">{t('wizard.blank.desc')}</Paragraph>
      <Button icon={<FileAddOutlined />} loading={busy} onClick={createBlank}>{t('wizard.blank.create')}</Button>
    </div>
  );

  return (
    <>
      <Modal title={<Space><ThunderboltOutlined />{t('wizard.title')}</Space>} open={open} onCancel={close} footer={null} width={760} destroyOnClose>
        <Tabs activeKey={tab} onChange={setTab} items={[
          { key: 'generate', label: <Space><ThunderboltOutlined />{t('wizard.tab.generate')}</Space>, children: generateTab },
          { key: 'template', label: <Space><FileTextOutlined />{t('wizard.tab.template')}</Space>, children: templateTab },
          { key: 'blank', label: <Space><FileAddOutlined />{t('wizard.tab.blank')}</Space>, children: blankTab },
        ]} />
      </Modal>
      <CatalogPicker open={pickerOpen} onClose={() => setPickerOpen(false)} currencyCode={currencyCode}
        onAdd={(type, entity) => { setExtras((p) => [...p, { type, entity, qty: DEFAULT_QTY[type] || 1 }]); setPickerOpen(false); }} />
    </>
  );
}
