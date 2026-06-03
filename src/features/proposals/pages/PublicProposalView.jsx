import React, { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Button, Select, Spin, Result, Alert, Space, message } from 'antd';
import { FilePdfOutlined, CheckCircleOutlined } from '@ant-design/icons';
import * as svc from '../services/proposalsService';
import { OUTPUT_LANGUAGES } from '../constants';
import { useProposalLabels } from '../hooks/useProposalLabels';
import ProposalPreview from '../components/preview/ProposalPreview';
import { exportProposalPdf } from '../pdf/proposalPdfExport';

export default function PublicProposalView() {
  const { code } = useParams();
  const [proposal, setProposal] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [lang, setLang] = useState('en');
  const [accepting, setAccepting] = useState(false);
  const [accepted, setAccepted] = useState(false);

  const tp = useProposalLabels(lang);

  useEffect(() => {
    let active = true;
    svc.getPublicProposal(code)
      .then((p) => {
        if (!active) return;
        setProposal(p);
        setLang(p.language || 'en');
        setAccepted(p.status === 'accepted');
      })
      .catch(() => setError(true))
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [code]);

  const download = async () => {
    try {
      await exportProposalPdf({
        content: proposal.content,
        lang,
        preparedFor: proposal.prepared_for || '',
        currencyCode: proposal.currency_code,
        fileName: `teklif-${code}`,
        output: 'save',
      });
    } catch { message.error('PDF failed'); }
  };

  const accept = async () => {
    setAccepting(true);
    try {
      await svc.acceptPublicProposal(code);
      setAccepted(true);
      message.success(tp('public.accepted'));
    } catch { message.error('Failed'); }
    finally { setAccepting(false); }
  };

  const langOptions = useMemo(() => OUTPUT_LANGUAGES.map((l) => ({ value: l.code, label: l.label })), []);

  if (loading) return <div style={{ textAlign: 'center', padding: 80 }}><Spin size="large" /></div>;
  if (error || !proposal) {
    return <div style={{ padding: 40 }}><Result status="404" title={tp('public.notFound')} /></div>;
  }

  const expired = proposal.is_expired && proposal.status !== 'accepted';

  return (
    <div style={{ minHeight: '100vh', background: '#eef1f4', padding: '24px 12px' }}>
      <div style={{ maxWidth: 860, margin: '0 auto' }}>
        {/* Toolbar */}
        <Space style={{ width: '100%', justifyContent: 'space-between', marginBottom: 16 }} wrap>
          <Select value={lang} onChange={setLang} options={langOptions} style={{ width: 160 }} />
          <Space wrap>
            <Button type="primary" icon={<FilePdfOutlined />} onClick={download}>{tp('public.downloadPdf')}</Button>
            {!expired && (
              <Button icon={<CheckCircleOutlined />} type={accepted ? 'default' : 'primary'} ghost={!accepted}
                disabled={accepted} loading={accepting} onClick={accept}>
                {accepted ? tp('public.accepted') : tp('public.accept')}
              </Button>
            )}
          </Space>
        </Space>

        {expired && (
          <Alert type="warning" showIcon style={{ marginBottom: 16 }}
            message={tp('public.expired')} description={tp('public.expiredHint')} />
        )}
        {accepted && !expired && (
          <Alert type="success" showIcon style={{ marginBottom: 16 }} message={tp('public.accepted')} />
        )}

        <ProposalPreview
          content={proposal.content}
          lang={lang}
          preparedFor={proposal.prepared_for}
          currencyCode={proposal.currency_code}
        />
      </div>
    </div>
  );
}
