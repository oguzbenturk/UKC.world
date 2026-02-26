import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Table, Tag, Button, Space, message, Modal, Typography,
  Image, Segmented, Select, Card, Row, Col, Avatar, Input, Tooltip, Badge, Grid, Spin,
} from 'antd';
import {
  CheckCircleOutlined, CloseCircleOutlined, EyeOutlined,
  ReloadOutlined, BankOutlined, ClockCircleOutlined,
  UserOutlined, ExclamationCircleOutlined,
} from '@ant-design/icons';

const { useBreakpoint } = Grid;
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import apiClient from '@/shared/services/apiClient';
import { useCurrency } from '@/shared/contexts/CurrencyContext';
import { useRealTimeSync } from '@/shared/hooks/useRealTime';

dayjs.extend(relativeTime);

const { Text } = Typography;
const { TextArea } = Input;

const VIEWS = { PENDING: 'pending', ALL: 'all' };

const STATUS_STYLES = {
  pending:   { bg: 'bg-orange-50',  text: 'text-orange-700',  border: 'border-orange-200',  icon: <ClockCircleOutlined />  },
  completed: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', icon: <CheckCircleOutlined />  },
  failed:    { bg: 'bg-red-50',     text: 'text-red-700',     border: 'border-red-200',     icon: <CloseCircleOutlined /> },
  cancelled: { bg: 'bg-slate-50',   text: 'text-slate-500',   border: 'border-slate-200',   icon: null                    },
};

const AVATAR_COLORS = ['#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

function UserAvatar({ name }) {
  const color = name ? AVATAR_COLORS[name.charCodeAt(0) % AVATAR_COLORS.length] : '#94a3b8';
  return (
    <Avatar size={34} style={{ backgroundColor: color, flexShrink: 0 }}>
      {name ? name[0].toUpperCase() : <UserOutlined />}
    </Avatar>
  );
}

function StatusPill({ status }) {
  const s = STATUS_STYLES[status] || STATUS_STYLES.cancelled;
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${s.bg} ${s.text} ${s.border}`}>
      {s.icon}
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

/** Mobile card for a single deposit */
function DepositCard({ record, formatCurrency, onApprove, onReject, view }) {
  const isPending = record.status === 'pending';
  return (
    <div className={`rounded-2xl border p-4 mb-3 ${isPending ? 'border-orange-200 bg-orange-50/30' : 'border-slate-100 bg-white'}`}>
      {/* Top row: avatar + name + amount */}
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <UserAvatar name={record.user?.name} />
          <div className="min-w-0">
            <div className="font-semibold text-slate-900 truncate leading-tight">{record.user?.name || 'Unknown'}</div>
            <div className="text-xs text-slate-400 truncate">{record.user?.email}</div>
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className="text-lg font-bold text-slate-900">{formatCurrency(record.amount, record.currency)}</div>
          {record.createdAt && (
            <Tooltip title={dayjs(record.createdAt).format('DD MMM YYYY HH:mm')}>
              <div className="text-xs text-slate-400">{dayjs(record.createdAt).fromNow()}</div>
            </Tooltip>
          )}
        </div>
      </div>

      {/* Meta row */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <StatusPill status={record.status} />
        {view === VIEWS.ALL && (
          <Tag color={record.method === 'bank_transfer' ? 'blue' : record.method === 'credit_card' ? 'purple' : 'default'} className="m-0">
            {record.method === 'bank_transfer' ? 'Bank Transfer' : record.method === 'credit_card' ? 'Credit Card' : record.method}
          </Tag>
        )}
      </div>

      {/* Notes / reference */}
      {(record.notes || record.bankReferenceCode) && (
        <div className="mb-3 text-sm text-slate-600 bg-slate-50 rounded-xl px-3 py-2">
          {record.bankReferenceCode && (
            <div className="text-[11px] font-mono text-slate-400 mb-0.5">{record.bankReferenceCode}</div>
          )}
          {record.notes && <span>{record.notes}</span>}
        </div>
      )}

      {/* Receipt + actions */}
      <div className="flex items-center justify-between gap-2">
        {record.proofUrl ? (
          <Image
            width={48} height={48}
            className="rounded-xl object-cover border border-slate-200"
            src={record.proofUrl.startsWith('http') ? record.proofUrl : `${import.meta.env.VITE_BACKEND_URL || ''}${record.proofUrl}`}
            preview={{ mask: <EyeOutlined style={{ fontSize: 12 }} /> }}
          />
        ) : (
          <span className="text-xs text-slate-300 italic">No receipt</span>
        )}
        {isPending && (
          <div className="flex gap-2">
            <Button
              type="primary"
              icon={<CheckCircleOutlined />}
              onClick={() => onApprove(record.id)}
              className="!bg-emerald-600 hover:!bg-emerald-700 !border-0"
            >
              Approve
            </Button>
            <Button danger icon={<CloseCircleOutlined />} onClick={() => onReject(record.id)}>
              Reject
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function WalletDepositsAdmin() {
  const [deposits, setDeposits]     = useState([]);
  const [loading, setLoading]       = useState(false);
  const [view, setView]             = useState(VIEWS.PENDING);
  const [methodFilter, setMethodFilter] = useState(null);
  const [rejectModal, setRejectModal] = useState({ open: false, id: null, reason: '', saving: false });
  const { formatCurrency } = useCurrency();
  const screens = useBreakpoint();
  const isMobile = !screens.md;

  /* ── fetch ───────────────────────────────────────────── */
  const fetchDeposits = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (view === VIEWS.PENDING) {
        params.method = 'bank_transfer';
        params.status = 'pending';
      } else if (methodFilter) {
        params.method = methodFilter;
      }
      const res = await apiClient.get('/wallet/admin/deposits', { params });
      setDeposits(res.data.results || []);
    } catch (err) {
      console.error('Failed to fetch deposits:', err);
      message.error('Failed to load deposit requests');
    } finally {
      setLoading(false);
    }
  }, [view, methodFilter]);

  useEffect(() => { fetchDeposits(); }, [fetchDeposits]);

  useRealTimeSync('wallet:deposit_created', useCallback((data) => {
    if (data?.deposit) {
      message.info({ content: `New deposit from ${data.userName || 'a student'}`, icon: <BankOutlined /> });
      fetchDeposits();
    }
  }, [fetchDeposits]));

  /* ── stats ───────────────────────────────────────────── */
  const stats = useMemo(() => ({
    pending:     deposits.filter((d) => d.status === 'pending').length,
    completed:   deposits.filter((d) => d.status === 'completed').length,
    total:       deposits.length,
    totalAmount: deposits.filter((d) => d.status === 'completed').reduce((s, d) => s + Number(d.amount || 0), 0),
  }), [deposits]);

  /* ── actions ─────────────────────────────────────────── */
  const handleApprove = async (id) => {
    try {
      await apiClient.post(`/wallet/admin/deposits/${id}/approve`);
      message.success('Deposit approved — wallet credited');
      fetchDeposits();
    } catch (err) {
      console.error('Failed to approve deposit:', err);
      message.error(err.response?.data?.error || 'Failed to approve deposit');
    }
  };

  const openReject  = (id) => setRejectModal({ open: true, id, reason: '', saving: false });
  const closeReject = ()   => setRejectModal({ open: false, id: null, reason: '', saving: false });

  const handleReject = async () => {
    setRejectModal((p) => ({ ...p, saving: true }));
    try {
      await apiClient.post(`/wallet/admin/deposits/${rejectModal.id}/reject`, {
        failureReason: rejectModal.reason || undefined,
      });
      message.success('Deposit rejected');
      closeReject();
      fetchDeposits();
    } catch (err) {
      console.error('Failed to reject deposit:', err);
      message.error(err.response?.data?.error || 'Failed to reject deposit');
      setRejectModal((p) => ({ ...p, saving: false }));
    }
  };

  /* ── columns ─────────────────────────────────────────── */
  const columns = [
    {
      title: 'Date',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 130,
      render: (t) => t ? (
        <Tooltip title={dayjs(t).format('DD MMM YYYY HH:mm')}>
          <span className="text-sm text-slate-500 cursor-default">{dayjs(t).fromNow()}</span>
        </Tooltip>
      ) : '—',
    },
    {
      title: 'Student',
      key: 'user',
      render: (_, r) => (
        <div className="flex items-center gap-2.5 min-w-0">
          <UserAvatar name={r.user?.name} />
          <div className="min-w-0">
            <div className="font-medium text-slate-900 truncate leading-tight">{r.user?.name || 'Unknown'}</div>
            <div className="text-xs text-slate-400 truncate">{r.user?.email}</div>
          </div>
        </div>
      ),
    },
    {
      title: 'Amount',
      key: 'amount',
      width: 130,
      render: (_, r) => (
        <span className="text-base font-semibold text-slate-900">
          {formatCurrency(r.amount, r.currency)}
        </span>
      ),
    },
    ...(view === VIEWS.ALL ? [{
      title: 'Method',
      dataIndex: 'method',
      key: 'method',
      width: 130,
      render: (m) => (
        <Tag color={m === 'bank_transfer' ? 'blue' : m === 'credit_card' ? 'purple' : 'default'} className="capitalize">
          {m === 'bank_transfer' ? 'Bank Transfer' : m === 'credit_card' ? 'Credit Card' : (m || '—')}
        </Tag>
      ),
    }] : []),
    {
      title: 'Reference / Notes',
      key: 'notes',
      render: (_, r) => (
        <div className="max-w-[200px]">
          {r.bankReferenceCode && (
            <div className="text-[11px] font-mono text-slate-400 mb-0.5">{r.bankReferenceCode}</div>
          )}
          {r.notes
            ? <Text ellipsis={{ tooltip: r.notes }} className="text-sm text-slate-600">{r.notes}</Text>
            : <span className="text-slate-300 text-xs italic">—</span>}
        </div>
      ),
    },
    {
      title: 'Receipt',
      key: 'proof',
      width: 72,
      align: 'center',
      render: (_, r) => r.proofUrl ? (
        <Image
          width={44} height={44}
          className="rounded-lg object-cover border border-slate-200 cursor-pointer"
          src={r.proofUrl.startsWith('http') ? r.proofUrl : `${import.meta.env.VITE_BACKEND_URL || ''}${r.proofUrl}`}
          preview={{ mask: <EyeOutlined style={{ fontSize: 12 }} /> }}
        />
      ) : (
        <span className="text-slate-300 text-xs">None</span>
      ),
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 115,
      render: (s) => s ? <StatusPill status={s} /> : null,
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 165,
      fixed: 'right',
      render: (_, r) => {
        if (r.status !== 'pending') return null;
        return (
          <Space size={6}>
            <Button
              type="primary"
              size="small"
              icon={<CheckCircleOutlined />}
              onClick={() => handleApprove(r.id)}
              className="!bg-emerald-600 hover:!bg-emerald-700 !border-0 shadow-none"
            >
              Approve
            </Button>
            <Button
              size="small"
              danger
              icon={<CloseCircleOutlined />}
              onClick={() => openReject(r.id)}
            >
              Reject
            </Button>
          </Space>
        );
      },
    },
  ];

  const pendingCount = stats.pending;

  /* ── render ──────────────────────────────────────────── */
  return (
    <div className="min-h-screen bg-slate-50 p-3 sm:p-6 space-y-4">

      {/* Header card */}
      <Card
        className="rounded-2xl sm:rounded-3xl border border-slate-200/70 bg-gradient-to-br from-blue-50 via-white to-white shadow-sm"
        styles={{ body: { padding: isMobile ? '14px 16px' : '20px 24px' } }}
      >
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 mb-0.5">
              <BankOutlined className="text-blue-600 text-lg" />
              <h1 className={`${isMobile ? 'text-lg' : 'text-2xl'} font-semibold text-slate-900 m-0`}>Wallet Deposits</h1>
              {pendingCount > 0 && <Badge count={pendingCount} color="#f97316" />}
            </div>
            <p className="text-xs sm:text-sm text-slate-500 m-0">
              {view === VIEWS.PENDING
                ? 'Bank transfers awaiting manual approval'
                : 'Full deposit history across all payment methods'}
            </p>
          </div>
          <Button size={isMobile ? 'small' : 'middle'} icon={<ReloadOutlined />} onClick={fetchDeposits} loading={loading}>
            {!isMobile && 'Refresh'}
          </Button>
        </div>

        {/* Stat chips */}
        <Row gutter={[12, 12]} className="mt-5">
          {[
            { label: 'Pending',       value: stats.pending,     bg: 'bg-orange-50',  border: 'border-orange-100',  text: 'text-orange-700'  },
            { label: 'Approved',      value: stats.completed,   bg: 'bg-emerald-50', border: 'border-emerald-100', text: 'text-emerald-700' },
            { label: 'Total loaded',  value: stats.total,       bg: 'bg-white',      border: 'border-slate-200',   text: 'text-slate-700'   },
            {
              label: 'Credited value',
              value: formatCurrency(stats.totalAmount, 'EUR'),
              bg: 'bg-white', border: 'border-slate-200', text: 'text-slate-700',
            },
          ].map((s) => (
            <Col xs={12} sm={6} key={s.label}>
              <div className={`rounded-2xl border p-3.5 ${s.bg} ${s.border}`}>
                <p className={`text-xs font-semibold uppercase tracking-wide m-0 ${s.text} opacity-75`}>{s.label}</p>
                <p className={`mt-1.5 text-2xl font-semibold m-0 ${s.text}`}>{s.value}</p>
              </div>
            </Col>
          ))}
        </Row>
      </Card>

      {/* Filter bar */}
      <div className={`flex ${isMobile ? 'flex-col' : 'items-center flex-wrap'} gap-2`}>
        <Segmented
          value={view}
          onChange={(val) => { setView(val); setMethodFilter(null); }}
          className={`shadow-sm ${isMobile ? 'w-full' : ''}`}
          block={isMobile}
          options={[
            {
              label: (
                <span className="flex items-center justify-center gap-1.5 px-1">
                  Pending Approval
                  {pendingCount > 0 && (
                    <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-orange-500 text-white text-[10px] font-bold leading-none">
                      {pendingCount}
                    </span>
                  )}
                </span>
              ),
              value: VIEWS.PENDING,
            },
            { label: <span className="px-1">All Deposits</span>, value: VIEWS.ALL },
          ]}
        />
        {view === VIEWS.ALL && (
          <Select
            placeholder="All methods"
            allowClear
            value={methodFilter}
            onChange={setMethodFilter}
            className={isMobile ? 'w-full' : 'w-44'}
            options={[
              { label: 'Bank Transfer', value: 'bank_transfer' },
              { label: 'Credit Card',   value: 'credit_card'   },
              { label: 'Iyzico',        value: 'iyzico'        },
            ]}
          />
        )}
      </div>

      {/* Table (desktop) / Card list (mobile) */}
      {isMobile ? (
        <div>
          <Spin spinning={loading}>
            {deposits.length === 0 && !loading ? (
              <div className="py-12 flex flex-col items-center gap-3 text-slate-400">
                <BankOutlined style={{ fontSize: 40 }} />
                <p className="text-base font-medium m-0">
                  {view === VIEWS.PENDING ? 'No pending transfers to review' : 'No deposits found'}
                </p>
                <p className="text-sm m-0 text-center">
                  {view === VIEWS.PENDING ? 'New requests appear here automatically' : 'Try changing your filter'}
                </p>
              </div>
            ) : (
              deposits.map((r) => (
                <DepositCard
                  key={r.id}
                  record={r}
                  formatCurrency={formatCurrency}
                  onApprove={handleApprove}
                  onReject={openReject}
                  view={view}
                />
              ))
            )}
          </Spin>
        </div>
      ) : (
        <Card
          className="rounded-3xl border border-slate-200/70 shadow-sm overflow-hidden"
          styles={{ body: { padding: 0 } }}
        >
          <Table
            columns={columns}
            dataSource={deposits}
            rowKey="id"
            loading={loading}
            pagination={{
              pageSize: 20,
              showSizeChanger: false,
              showTotal: (total) => `${total} deposit${total !== 1 ? 's' : ''}`,
            }}
            scroll={{ x: 900 }}
            rowClassName={(r) =>
              r.status === 'pending'
                ? 'bg-orange-50/30 hover:bg-orange-50 transition-colors'
                : 'hover:bg-slate-50/70 transition-colors'
            }
            locale={{
              emptyText: (
                <div className="py-16 flex flex-col items-center gap-3 text-slate-400">
                  <BankOutlined style={{ fontSize: 44 }} />
                  <p className="text-base font-medium m-0">
                    {view === VIEWS.PENDING
                      ? 'No pending bank transfers to review'
                      : 'No deposits found'}
                  </p>
                  <p className="text-sm m-0">
                    {view === VIEWS.PENDING
                      ? 'New requests will appear here automatically'
                      : 'Try changing your filter'}
                  </p>
                </div>
              ),
            }}
          />
        </Card>
      )}

      {/* Reject modal */}
      <Modal
        open={rejectModal.open}
        title={
          <div className="flex items-center gap-2 text-red-600">
            <ExclamationCircleOutlined />
            Reject Deposit Request
          </div>
        }
        onCancel={closeReject}
        footer={
          <div className="flex justify-end gap-2">
            <Button onClick={closeReject}>Cancel</Button>
            <Button
              danger type="primary"
              loading={rejectModal.saving}
              icon={<CloseCircleOutlined />}
              onClick={handleReject}
            >
              Reject
            </Button>
          </div>
        }
        centered
        width={isMobile ? '95vw' : 420}
        style={isMobile ? { top: 'auto', bottom: 0, margin: 0, paddingBottom: 0 } : {}}
        destroyOnHidden
      >
        <p className="text-sm text-slate-600 mt-2 mb-3">
          The student will be notified that their deposit request was declined.
          You can optionally include a reason.
        </p>
        <TextArea
          placeholder="Reason for rejection (optional)"
          rows={3} maxLength={500} showCount
          value={rejectModal.reason}
          onChange={(e) => setRejectModal((p) => ({ ...p, reason: e.target.value }))}
        />
      </Modal>
    </div>
  );
}