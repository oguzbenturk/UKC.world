import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Button, Card, Input, Select, DatePicker, Space, Tag, message, Spin, Segmented,
  Checkbox, Row, Col, Typography, Tooltip,
} from 'antd';
import {
  ArrowLeftOutlined, SaveOutlined, FilePdfOutlined, EyeOutlined, LinkOutlined,
  GlobalOutlined, SnippetsOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { useTranslation } from 'react-i18next';
import { useCurrency } from '@/shared/contexts/CurrencyContext';
import apiClient from '@/shared/services/apiClient';
import * as svc from '../services/proposalsService';
import { buildDefaultContent, OUTPUT_LANGUAGES, SECTION_ORDER } from '../constants';
import { withSyncedTotals, computeProposalTotals } from '../utils/totals';
import { catalogToLineItem } from '../utils/catalogToLineItem';
import ProposalPreview from '../components/preview/ProposalPreview';
import CatalogPicker from '../components/CatalogPicker';
import MultilangInput from '../components/MultilangInput';
import {
  PackageItemsEditor, PriceSummaryEditor, IncludedEditor, ScheduleEditor,
  BenefitsEditor, TermsEditor,
} from '../components/editors/SectionEditors';
import { exportProposalPdf } from '../pdf/proposalPdfExport';

const { Title, Text } = Typography;
const STATUSES = ['draft', 'sent', 'accepted', 'expired', 'declined'];

export default function ProposalBuilderPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { t } = useTranslation('proposal');
  const { currencies } = useCurrency();

  const [proposal, setProposal] = useState(null);
  const [editLang, setEditLang] = useState('en');
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [customers, setCustomers] = useState([]);
  const saveTimer = useRef(null);

  // ── Load ────────────────────────────────────────────────────────────────────
  useEffect(() => {
    let active = true;
    if (!id) { navigate('/proposals', { replace: true }); return undefined; }
    svc.getProposal(id)
      .then((p) => {
        if (!active) return;
        setProposal(p);
        setEditLang(p.language || 'en');
      })
      .catch(() => message.error('Failed to load proposal'));
    return () => { active = false; };
  }, [id, navigate]);

  // Lazy-load customers for the optional link field.
  useEffect(() => {
    apiClient.get('/users', { params: { role: 'student' } })
      .then((res) => setCustomers(Array.isArray(res.data) ? res.data : []))
      .catch(() => setCustomers([]));
  }, []);

  // ── Save plumbing ───────────────────────────────────────────────────────────
  const persist = useCallback(async (next) => {
    if (!next?.id) return;
    setSaving(true);
    try {
      const totals = computeProposalTotals(next.content, next.currency_code);
      await svc.updateProposal(next.id, {
        title: next.title,
        prepared_for: next.prepared_for,
        customer_id: next.customer_id || null,
        language: next.language,
        currency_code: next.currency_code,
        status: next.status,
        valid_until: next.valid_until || null,
        content: next.content,
        regular_total: totals.regularTotal,
        savings_total: totals.savings,
        cash_total: totals.cashPrice,
      });
      setDirty(false);
    } catch {
      message.error('Failed to save');
    } finally {
      setSaving(false);
    }
  }, []);

  const scheduleSave = useCallback((next) => {
    setDirty(true);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => persist(next), 1200);
  }, [persist]);

  const updateProposal = useCallback((patch) => {
    setProposal((prev) => {
      const next = typeof patch === 'function' ? patch(prev) : { ...prev, ...patch };
      scheduleSave(next);
      return next;
    });
  }, [scheduleSave]);

  const setContent = useCallback((updater) => {
    updateProposal((prev) => {
      const nextContent = withSyncedTotals(
        typeof updater === 'function' ? updater(prev.content) : updater,
        prev.currency_code,
      );
      return { ...prev, content: nextContent };
    });
  }, [updateProposal]);

  const setSection = (key, value) => setContent((c) => ({ ...c, [key]: value }));
  const toggleSection = (key, on) => setContent((c) => ({ ...c, sections: { ...c.sections, [key]: on } }));

  // Flush pending save on unmount; warn on unsaved close.
  useEffect(() => () => { if (saveTimer.current) clearTimeout(saveTimer.current); }, []);
  useEffect(() => {
    const handler = (e) => { if (dirty) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);

  const saveNow = async () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    await persist(proposal);
    message.success(t('builder.saved'));
  };

  // ── PDF / link actions ──────────────────────────────────────────────────────
  const pdfArgs = () => ({
    content: proposal.content,
    lang: editLang,
    preparedFor: proposal.prepared_for || '',
    quoteDate: proposal.created_at,
    currencyCode: proposal.currency_code,
    fileName: proposal.title || 'teklif',
  });
  const previewPdf = async () => {
    try {
      const url = await exportProposalPdf({ ...pdfArgs(), output: 'bloburl' });
      if (url) window.open(url, '_blank');
    } catch (e) { message.error('PDF failed'); }
  };
  const downloadPdf = async () => {
    try { await exportProposalPdf({ ...pdfArgs(), output: 'save' }); }
    catch (e) { message.error('PDF failed'); }
  };
  const publicUrl = proposal?.share_code ? `${window.location.origin}/teklif/${proposal.share_code}` : '';
  const copyLink = async () => {
    try { await navigator.clipboard.writeText(publicUrl); message.success(t('builder.linkCopied')); }
    catch { message.error('Copy failed'); }
  };
  const saveAsTemplate = async () => {
    try { await svc.saveAsTemplate(proposal.id); message.success(t('wizard.savedTemplate')); }
    catch { message.error('Failed'); }
  };

  const customerOptions = useMemo(() => customers.map((c) => ({
    value: c.id,
    label: `${c.first_name || ''} ${c.last_name || ''}`.trim() + (c.email ? ` (${c.email})` : ''),
    name: `${c.first_name || ''} ${c.last_name || ''}`.trim(),
  })), [customers]);

  if (!proposal) {
    return <div style={{ textAlign: 'center', padding: 80 }}><Spin size="large" /></div>;
  }

  const content = proposal.content || buildDefaultContent();
  const sections = content.sections || {};

  return (
    <div style={{ padding: 16, maxWidth: 1500, margin: '0 auto' }}>
      {/* Top bar */}
      <Row align="middle" justify="space-between" style={{ marginBottom: 12 }} gutter={[8, 8]}>
        <Col>
          <Space>
            <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/proposals')}>{t('builder.back')}</Button>
            <Title level={4} style={{ margin: 0 }}>{t('builder.editTitle')}</Title>
            <Tag color={proposal.status === 'accepted' ? 'green' : proposal.status === 'sent' ? 'blue' : 'default'}>
              {t(`status.${proposal.status}`)}
            </Tag>
          </Space>
        </Col>
        <Col>
          <Space wrap>
            <Text type="secondary">{saving ? t('builder.saving') : dirty ? t('builder.unsaved') : t('builder.saved')}</Text>
            <Button icon={<SaveOutlined />} onClick={saveNow} loading={saving}>{t('builder.save')}</Button>
            <Button icon={<EyeOutlined />} onClick={previewPdf}>{t('builder.previewPdf')}</Button>
            <Button type="primary" icon={<FilePdfOutlined />} onClick={downloadPdf}>{t('builder.downloadPdf')}</Button>
            <Tooltip title={publicUrl}><Button icon={<LinkOutlined />} onClick={copyLink}>{t('builder.copyLink')}</Button></Tooltip>
            <Button icon={<GlobalOutlined />} onClick={() => window.open(publicUrl, '_blank')}>{t('builder.openPublic')}</Button>
            <Tooltip title={t('wizard.saveAsTemplate')}><Button icon={<SnippetsOutlined />} onClick={saveAsTemplate} /></Tooltip>
          </Space>
        </Col>
      </Row>

      <Row gutter={16}>
        {/* Editors */}
        <Col xs={24} lg={13}>
          <Space direction="vertical" style={{ width: '100%' }} size="middle">
            {/* Meta */}
            <Card size="small">
              <Row gutter={[12, 12]}>
                <Col xs={24} md={12}>
                  <Text type="secondary" style={{ fontSize: 12 }}>{t('builder.meta.title')}</Text>
                  <Input value={proposal.title} onChange={(e) => updateProposal({ title: e.target.value })} placeholder={t('builder.meta.titlePlaceholder')} />
                </Col>
                <Col xs={24} md={12}>
                  <Text type="secondary" style={{ fontSize: 12 }}>{t('builder.meta.preparedFor')}</Text>
                  <Input value={proposal.prepared_for || ''} onChange={(e) => updateProposal({ prepared_for: e.target.value })} placeholder={t('builder.meta.preparedForPlaceholder')} />
                </Col>
                <Col xs={24} md={12}>
                  <Text type="secondary" style={{ fontSize: 12 }}>{t('builder.meta.customer')}</Text>
                  <Select
                    showSearch allowClear style={{ width: '100%' }}
                    value={proposal.customer_id || undefined}
                    options={customerOptions}
                    optionFilterProp="label"
                    onChange={(val, opt) => updateProposal((p) => ({
                      ...p, customer_id: val || null,
                      prepared_for: p.prepared_for || opt?.name || '',
                    }))}
                    placeholder="—"
                  />
                </Col>
                <Col xs={12} md={6}>
                  <Text type="secondary" style={{ fontSize: 12 }}>{t('builder.meta.language')}</Text>
                  <Select style={{ width: '100%' }} value={proposal.language}
                    onChange={(v) => updateProposal({ language: v })}
                    options={OUTPUT_LANGUAGES.map((l) => ({ value: l.code, label: l.label }))} />
                </Col>
                <Col xs={12} md={6}>
                  <Text type="secondary" style={{ fontSize: 12 }}>{t('builder.meta.currency')}</Text>
                  <Select style={{ width: '100%' }} value={proposal.currency_code}
                    onChange={(v) => updateProposal({ currency_code: v })}
                    options={(currencies || []).map((c) => ({ value: c.currency_code, label: c.currency_code }))}
                    showSearch />
                </Col>
                <Col xs={12} md={6}>
                  <Text type="secondary" style={{ fontSize: 12 }}>{t('builder.meta.validUntil')}</Text>
                  <DatePicker style={{ width: '100%' }}
                    value={proposal.valid_until ? dayjs(proposal.valid_until) : null}
                    onChange={(d) => updateProposal({ valid_until: d ? d.format('YYYY-MM-DD') : null })} />
                </Col>
                <Col xs={12} md={6}>
                  <Text type="secondary" style={{ fontSize: 12 }}>{t('builder.meta.status')}</Text>
                  <Select style={{ width: '100%' }} value={proposal.status}
                    onChange={(v) => updateProposal({ status: v })}
                    options={STATUSES.map((s) => ({ value: s, label: t(`status.${s}`) }))} />
                </Col>
              </Row>
            </Card>

            {/* Editing language + section toggles */}
            <Card size="small">
              <Space direction="vertical" style={{ width: '100%' }} size="small">
                <div>
                  <Text type="secondary" style={{ fontSize: 12, marginRight: 8 }}>{t('builder.contentLanguage')}</Text>
                  <Segmented value={editLang} onChange={setEditLang}
                    options={OUTPUT_LANGUAGES.map((l) => ({ value: l.code, label: l.code.toUpperCase() }))} />
                </div>
                <div>
                  {SECTION_ORDER.map((key) => (
                    <Checkbox key={key} checked={sections[key] !== false}
                      onChange={(e) => toggleSection(key, e.target.checked)} style={{ marginRight: 12 }}>
                      {t(`builder.sections.${key}`)}
                    </Checkbox>
                  ))}
                </div>
              </Space>
            </Card>

            {sections.intro !== false && (
              <Card size="small" title={t('builder.sections.intro')}>
                <MultilangInput value={content.intro} lang={editLang} textarea rows={4}
                  placeholder={t('builder.intro.placeholder')}
                  onChange={(v) => setSection('intro', v)} />
              </Card>
            )}
            {sections.package_items !== false && (
              <PackageItemsEditor items={content.package_items} lang={editLang} currencyCode={proposal.currency_code}
                onChange={(v) => setSection('package_items', v)} onAddFromCatalog={() => setCatalogOpen(true)} />
            )}
            {sections.price_summary !== false && (
              <PriceSummaryEditor ps={content.price_summary} lang={editLang}
                onChange={(v) => setSection('price_summary', v)} />
            )}
            {sections.included !== false && (
              <IncludedEditor list={content.included} lang={editLang} onChange={(v) => setSection('included', v)} />
            )}
            {sections.schedule !== false && (
              <ScheduleEditor list={content.schedule} lang={editLang} note={content.schedule_note}
                onChange={(v) => setSection('schedule', v)} onNoteChange={(v) => setSection('schedule_note', v)} />
            )}
            {sections.benefits !== false && (
              <BenefitsEditor list={content.benefits} lang={editLang} onChange={(v) => setSection('benefits', v)} />
            )}
            {sections.terms !== false && (
              <TermsEditor list={content.terms} lang={editLang} onChange={(v) => setSection('terms', v)} />
            )}
          </Space>
        </Col>

        {/* Live preview */}
        <Col xs={24} lg={11}>
          <div style={{ position: 'sticky', top: 12 }}>
            <Text type="secondary" style={{ fontSize: 12 }}>{t('builder.preview')} · {editLang.toUpperCase()}</Text>
            <div style={{ marginTop: 6, maxHeight: 'calc(100vh - 120px)', overflow: 'auto', background: '#eef1f4', padding: 10, borderRadius: 8 }}>
              <ProposalPreview content={content} lang={editLang} preparedFor={proposal.prepared_for}
                quoteDate={proposal.created_at} currencyCode={proposal.currency_code} />
            </div>
          </div>
        </Col>
      </Row>

      <CatalogPicker
        open={catalogOpen}
        onClose={() => setCatalogOpen(false)}
        currencyCode={proposal.currency_code}
        onAdd={(type, entity) => {
          setContent((c) => ({
            ...c,
            package_items: [...(c.package_items || []), catalogToLineItem({ type, entity, lang: editLang, currencyCode: proposal.currency_code })],
          }));
          message.success(t('catalog.add'));
        }}
      />
    </div>
  );
}
