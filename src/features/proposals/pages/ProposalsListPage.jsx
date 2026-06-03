import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Table, Button, Input, Tag, Space, Popconfirm, message, Typography, Tooltip } from 'antd';
import {
  EditOutlined, CopyOutlined, LinkOutlined, DeleteOutlined, GlobalOutlined, ThunderboltOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { useTranslation } from 'react-i18next';
import { useCurrency } from '@/shared/contexts/CurrencyContext';
import * as svc from '../services/proposalsService';
import QuickCreateWizard from '../components/QuickCreateWizard';

const { Title } = Typography;

const STATUS_COLOR = {
  draft: 'default', sent: 'blue', accepted: 'green', expired: 'orange', declined: 'red',
};

export default function ProposalsListPage() {
  const { t } = useTranslation('proposal');
  const navigate = useNavigate();
  const location = useLocation();
  const { formatCurrency } = useCurrency();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [wizardOpen, setWizardOpen] = useState(location.pathname.endsWith('/new'));

  const closeWizard = () => {
    setWizardOpen(false);
    if (location.pathname.endsWith('/new')) navigate('/proposals', { replace: true });
  };

  const load = () => {
    setLoading(true);
    svc.listProposals()
      .then(setRows)
      .catch(() => message.error('Failed to load proposals'))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => `${r.title} ${r.prepared_for || ''}`.toLowerCase().includes(q));
  }, [rows, query]);

  const copyLink = async (code) => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/teklif/${code}`);
      message.success(t('list.actions.linkCopied'));
    } catch { message.error('Copy failed'); }
  };

  const duplicate = async (id) => {
    try { await svc.duplicateProposal(id); message.success(t('list.duplicated')); load(); }
    catch { message.error('Failed'); }
  };

  const remove = async (id) => {
    try { await svc.deleteProposal(id); message.success(t('list.deleted')); load(); }
    catch { message.error('Failed'); }
  };

  const columns = [
    {
      title: t('list.columns.title'),
      dataIndex: 'title',
      render: (val, r) => <a onClick={() => navigate(`/proposals/${r.id}`)}>{val}</a>,
    },
    { title: t('list.columns.preparedFor'), dataIndex: 'prepared_for', render: (v, r) => v || r.customer_name || '—' },
    {
      title: t('list.columns.status'),
      dataIndex: 'status',
      render: (s, r) => {
        const eff = r.is_expired && s !== 'accepted' ? 'expired' : s;
        return <Tag color={STATUS_COLOR[eff] || 'default'}>{t(`status.${eff}`)}</Tag>;
      },
    },
    {
      title: t('list.columns.total'),
      dataIndex: 'cash_total',
      align: 'right',
      render: (v, r) => formatCurrency(Number(v) || 0, r.currency_code),
    },
    {
      title: t('list.columns.validUntil'),
      dataIndex: 'valid_until',
      render: (v) => (v ? dayjs(v).format('DD MMM YYYY') : '—'),
    },
    { title: t('list.columns.views'), dataIndex: 'view_count', align: 'center' },
    {
      title: t('list.columns.updated'),
      dataIndex: 'updated_at',
      render: (v) => (v ? dayjs(v).format('DD MMM YYYY') : '—'),
    },
    {
      title: t('list.columns.actions'),
      key: 'actions',
      render: (_, r) => (
        <Space>
          <Tooltip title={t('list.actions.edit')}><Button size="small" icon={<EditOutlined />} onClick={() => navigate(`/proposals/${r.id}`)} /></Tooltip>
          <Tooltip title={t('list.actions.duplicate')}><Button size="small" icon={<CopyOutlined />} onClick={() => duplicate(r.id)} /></Tooltip>
          <Tooltip title={t('list.actions.copyLink')}><Button size="small" icon={<LinkOutlined />} onClick={() => copyLink(r.share_code)} /></Tooltip>
          <Tooltip title={t('list.actions.openPublic')}><Button size="small" icon={<GlobalOutlined />} onClick={() => window.open(`/teklif/${r.share_code}`, '_blank')} /></Tooltip>
          <Popconfirm title={t('list.confirmDelete')} onConfirm={() => remove(r.id)} okButtonProps={{ danger: true }}>
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div style={{ padding: 16 }}>
      <Space style={{ width: '100%', justifyContent: 'space-between', marginBottom: 16 }} wrap>
        <Title level={3} style={{ margin: 0 }}>{t('list.title')}</Title>
        <Space>
          <Input.Search placeholder={t('list.search')} allowClear value={query}
            onChange={(e) => setQuery(e.target.value)} style={{ width: 260 }} />
          <Button type="primary" icon={<ThunderboltOutlined />} onClick={() => setWizardOpen(true)}>{t('list.new')}</Button>
        </Space>
      </Space>
      <Table
        rowKey="id"
        loading={loading}
        dataSource={filtered}
        columns={columns}
        locale={{ emptyText: loading ? '' : t('list.empty') }}
        pagination={{ pageSize: 20, hideOnSinglePage: true }}
      />
      <QuickCreateWizard open={wizardOpen} onClose={closeWizard} />
    </div>
  );
}
