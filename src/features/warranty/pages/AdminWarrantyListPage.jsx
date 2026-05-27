import React, { useMemo, useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Card, Table, Input, Select, Button, Tag, Space, Tooltip, Empty } from 'antd';
import {
  ReloadOutlined, EyeOutlined, SearchOutlined, SafetyOutlined, ClockCircleOutlined,
  PlusOutlined
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { useTranslation } from 'react-i18next';
import WarrantyStatusBadge from '../components/WarrantyStatusBadge';
import AdminWarrantyDetailModal from '../components/AdminWarrantyDetailModal';
import AdminWarrantyCreateModal from '../components/AdminWarrantyCreateModal';
import { useAdminWarrantyList, useAdminWarrantyStats } from '../hooks/useWarranty';
import { STATUSES, formatBytes } from '../constants';

export default function AdminWarrantyListPage() {
  const { t } = useTranslation(['admin', 'public']);
  const navigate = useNavigate();
  const { id: routeId } = useParams();

  const [status, setStatus] = useState(undefined);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [openClaimId, setOpenClaimId] = useState(routeId || null);
  const [createOpen, setCreateOpen] = useState(false);

  useEffect(() => { setOpenClaimId(routeId || null); }, [routeId]);

  const queryParams = useMemo(() => ({
    page, pageSize,
    ...(status ? { status } : {}),
    ...(search ? { q: search } : {})
  }), [page, pageSize, status, search]);

  const listQuery = useAdminWarrantyList(queryParams);
  const statsQuery = useAdminWarrantyStats();

  const handleSearchSubmit = () => {
    setPage(1);
    setSearch(searchInput.trim());
  };

  const handleOpenClaim = (id) => {
    setOpenClaimId(id);
    navigate(`/admin/warranty/${id}`);
  };

  const handleCloseModal = () => {
    setOpenClaimId(null);
    navigate('/admin/warranty');
  };

  const columns = [
    {
      title: t('admin:warranty.list.columns.code', 'Code'),
      dataIndex: 'customer_token',
      key: 'code',
      width: 100,
      render: (token) => <code className="font-mono text-xs text-slate-700">{token}</code>
    },
    {
      title: t('admin:warranty.list.columns.customer', 'Customer'),
      key: 'customer',
      render: (_, row) => (
        <div className="leading-tight">
          <div className="font-medium text-slate-800">{row.customer_name}</div>
          <div className="text-xs text-slate-500">{row.customer_email}</div>
        </div>
      )
    },
    {
      title: t('admin:warranty.list.columns.product', 'Product'),
      key: 'product',
      render: (_, row) => (
        <div className="leading-tight">
          <div className="font-medium text-slate-800">{row.product_name}</div>
          {row.product_brand && (
            <div className="text-xs text-slate-500">{row.product_brand}{row.product_model ? ` · ${row.product_model}` : ''}</div>
          )}
        </div>
      )
    },
    {
      title: t('admin:warranty.list.columns.status', 'Status'),
      dataIndex: 'status',
      key: 'status',
      width: 170,
      render: (s) => <WarrantyStatusBadge status={s} mode="admin" />
    },
    {
      title: t('admin:warranty.list.columns.media', 'Media'),
      key: 'media',
      width: 140,
      render: (_, row) => (
        <Space size={4} wrap>
          <Tag color="blue">{row.photo_count} ph</Tag>
          <Tag color="purple">{row.video_count} vid</Tag>
          <Tooltip title={`${formatBytes(Number(row.total_bytes) || 0)}`}>
            <Tag>{formatBytes(Number(row.total_bytes) || 0)}</Tag>
          </Tooltip>
        </Space>
      )
    },
    {
      title: t('admin:warranty.list.columns.submitted', 'Submitted'),
      dataIndex: 'created_at',
      key: 'created_at',
      width: 180,
      render: (v) => (
        <div className="text-xs">
          <div>{dayjs(v).format('YYYY-MM-DD HH:mm')}</div>
          <div className="text-slate-500">{dayjs(v).fromNow ? dayjs(v).fromNow() : ''}</div>
        </div>
      )
    },
    {
      title: '',
      key: 'actions',
      width: 80,
      align: 'right',
      render: (_, row) => (
        <Button
          type="primary"
          icon={<EyeOutlined />}
          size="small"
          onClick={() => handleOpenClaim(row.id)}
        >
          {t('admin:warranty.actions.open', 'Open')}
        </Button>
      )
    }
  ];

  return (
    <div className="px-4 py-6 sm:px-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-emerald-600">
            UKC.Care
          </p>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            {t('admin:warranty.list.title', 'Warranty claims')}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <Button
            icon={<ReloadOutlined />}
            onClick={() => { listQuery.refetch(); statsQuery.refetch(); }}
          >
            {t('admin:warranty.actions.refresh', 'Refresh')}
          </Button>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => setCreateOpen(true)}
          >
            {t('admin:warranty.actions.newClaim', 'New claim')}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard
          icon={<SafetyOutlined />}
          label={t('admin:warranty.stats.open', 'Open claims')}
          value={statsQuery.data?.openCount ?? '—'}
          tone="emerald"
        />
        <StatCard
          icon={<ClockCircleOutlined />}
          label={t('admin:warranty.stats.last7', 'Last 7 days')}
          value={statsQuery.data?.last7d ?? '—'}
          tone="sky"
        />
        <StatCard
          label={t('admin:warranty.stats.awaitingCustomer', 'Awaiting customer')}
          value={statsQuery.data?.byStatus?.awaiting_customer ?? '—'}
          tone="amber"
        />
        <StatCard
          label={t('admin:warranty.stats.withManufacturer', 'With manufacturer')}
          value={statsQuery.data?.byStatus?.with_manufacturer ?? '—'}
          tone="violet"
        />
      </div>

      <Card className="!mt-6">
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <Input
            allowClear
            prefix={<SearchOutlined />}
            placeholder={t('admin:warranty.list.searchPlaceholder', 'Search by name, email, code, product…')}
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onPressEnter={handleSearchSubmit}
            onBlur={handleSearchSubmit}
            style={{ maxWidth: 360 }}
          />
          <Select
            allowClear
            placeholder={t('admin:warranty.list.statusFilter', 'All statuses')}
            value={status}
            onChange={(v) => { setStatus(v); setPage(1); }}
            options={STATUSES.map((s) => ({
              value: s,
              label: t(`public:warranty.status.${s}`, s)
            }))}
            style={{ minWidth: 200 }}
          />
        </div>

        <Table
          rowKey="id"
          dataSource={listQuery.data?.items || []}
          columns={columns}
          loading={listQuery.isFetching}
          locale={{
            emptyText: (
              <Empty description={t('admin:warranty.list.empty', 'No warranty claims yet.')} />
            )
          }}
          pagination={{
            current: page,
            pageSize,
            total: listQuery.data?.total || 0,
            showSizeChanger: true,
            pageSizeOptions: ['10', '25', '50', '100'],
            onChange: (nextPage, nextSize) => {
              setPage(nextPage);
              setPageSize(nextSize);
            }
          }}
        />
      </Card>

      {openClaimId && (
        <AdminWarrantyDetailModal
          claimId={openClaimId}
          open={!!openClaimId}
          onClose={handleCloseModal}
        />
      )}

      <AdminWarrantyCreateModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={(claim) => {
          listQuery.refetch();
          statsQuery.refetch();
          if (claim?.id) handleOpenClaim(claim.id);
        }}
      />
    </div>
  );
}

const TONE_STYLES = {
  emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  sky:     'bg-sky-50 text-sky-700 border-sky-200',
  amber:   'bg-amber-50 text-amber-700 border-amber-200',
  violet:  'bg-violet-50 text-violet-700 border-violet-200'
};

function StatCard({ icon, label, value, tone = 'sky' }) {
  return (
    <div className={`rounded-2xl border px-4 py-3 ${TONE_STYLES[tone]}`}>
      <div className="text-[10px] font-semibold uppercase tracking-[0.22em] opacity-70 flex items-center gap-1">
        {icon}
        {label}
      </div>
      <div className="mt-1 text-2xl font-bold">{value}</div>
    </div>
  );
}
