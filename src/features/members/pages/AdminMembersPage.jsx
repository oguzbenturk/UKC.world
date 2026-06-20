// src/features/members/pages/AdminMembersPage.jsx
// Admin page to view all member purchases and assign memberships

import { useState, useMemo, lazy, Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Card, Table, Tag, Button, Space, Tooltip,
  Modal, Input, Select, DatePicker, Spin,
  Avatar, Descriptions, Form,
  message, Empty, Grid
} from 'antd';
import {
  CrownOutlined,
  StarOutlined,
  TrophyOutlined,
  EyeOutlined,
  EditOutlined,
  DeleteOutlined,
  PercentageOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  CloseCircleOutlined,
  SearchOutlined,
  PlusOutlined,
  UserOutlined,
  ReloadOutlined
} from '@ant-design/icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCurrency } from '@/shared/contexts/CurrencyContext';
import { useAuth } from '@/shared/hooks/useAuth';
import apiClient from '@/shared/services/apiClient';
import dayjs from 'dayjs';
import QuickMembershipModal from '@/features/dashboard/components/QuickMembershipModal';
import ApplyDiscountModal from '@/features/customers/components/ApplyDiscountModal';

const EnhancedCustomerDetailModal = lazy(() => import('@/features/customers/components/EnhancedCustomerDetailModal'));

const { RangePicker } = DatePicker;
const { useBreakpoint } = Grid;

const getMemberIcon = (name) => {
  const n = (name || '').toLowerCase();
  if (n.includes('platinum') || n.includes('bundle')) return <TrophyOutlined style={{ color: '#a855f7' }} />;
  if (n.includes('vip') || n.includes('beach')) return <CrownOutlined style={{ color: '#f59e0b' }} />;
  return <StarOutlined style={{ color: '#10b981' }} />;
};

// --- Membership type filters (category + duration) ---
// The member_offerings.period column is unreliable (e.g. a "Storage + Beach — Week"
// offering is stored with period='day'), so derive the duration bucket from the offering
// NAME first and only fall back to period. This keeps the "daily / weekly" filter honest.
const DURATION_ORDER = ['day', 'week', 'month', 'season', 'year', 'other'];
const DURATION_LABELS = { day: 'Daily', week: 'Weekly', month: 'Monthly', season: 'Seasonal', year: 'Yearly', other: 'Other' };
const CATEGORY_LABELS = { storage: 'Storage', membership: 'Membership', freerider: 'Freerider' };
const titleCase = (s) => (s || '').charAt(0).toUpperCase() + (s || '').slice(1);

const deriveDuration = (purchase) => {
  const name = (purchase.offering_name || purchase.current_offering_name || '').toLowerCase();
  if (/week/.test(name)) return 'week';
  if (/day|daily/.test(name)) return 'day';
  if (/month/.test(name)) return 'month';
  if (/season/.test(name)) return 'season';
  if (/year|annual/.test(name)) return 'year';
  const per = (purchase.offering_period || '').toLowerCase();
  return DURATION_ORDER.includes(per) ? per : 'other';
};

const AdminMembersPage = () => {
  const { t } = useTranslation(['admin']);
  const { formatCurrency } = useCurrency();
  const queryClient = useQueryClient();
  const { user: currentUser } = useAuth();
  const screens = useBreakpoint();
  const isMobile = !screens.md;
  // Deleting a membership posts a wallet refund, so it's gated to managers+ — matching
  // the backend cancel endpoint (authorizeRoles(['admin','manager','developer','owner'])).
  const canManage = ['admin', 'manager', 'developer', 'owner'].includes((currentUser?.role || '').toLowerCase());

  const statusConfig = {
    active: { color: 'green', icon: <CheckCircleOutlined />, label: t('admin:members.status.active') },
    pending: { color: 'gold', icon: <ClockCircleOutlined />, label: t('admin:members.status.pending') },
    expired: { color: 'default', icon: <CloseCircleOutlined />, label: t('admin:members.status.expired') },
    cancelled: { color: 'red', icon: <CloseCircleOutlined />, label: t('admin:members.status.cancelled') }
  };
  
  const [filters, setFilters] = useState({
    status: 'all',
    search: '',
    dateRange: null,
    category: 'all',
    duration: 'all'
  });
  const [selectedPurchase, setSelectedPurchase] = useState(null);
  const [detailModalVisible, setDetailModalVisible] = useState(false);
  const [assignModalVisible, setAssignModalVisible] = useState(false);
  // Edit purchase (status/notes/expires_at)
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editForm] = Form.useForm();
  const [editSaving, setEditSaving] = useState(false);
  // Apply discount to a member purchase
  const [discountTarget, setDiscountTarget] = useState(null);
  // Customer detail drawer
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [customerDrawerOpen, setCustomerDrawerOpen] = useState(false);

  const openCustomerDrawer = (record) => {
    if (!record?.user_id) return;
    setSelectedCustomer({
      id: record.user_id,
      name: record.user_name,
      email: record.user_email,
    });
    setCustomerDrawerOpen(true);
  };

  // Fetch all member purchases
  const { data: purchases = [], isLoading, refetch } = useQuery({
    queryKey: ['admin-member-purchases', filters],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filters.status !== 'all') params.append('status', filters.status);
      if (filters.dateRange?.[0]) params.append('from', filters.dateRange[0].toISOString());
      if (filters.dateRange?.[1]) params.append('to', filters.dateRange[1].toISOString());

      const { data } = await apiClient.get(`/member-offerings/admin/purchases?${params}`);
      // Use computed_status from backend which considers expiry dates
      return data.map(p => ({ ...p, status: p.computed_status || p.status }));
    },
    staleTime: 120_000,
  });

  // Fetch stats — derived from purchases, but cached independently
  const { data: stats } = useQuery({
    queryKey: ['admin-member-stats'],
    queryFn: async () => {
      const allPurchases = await apiClient.get('/member-offerings/admin/purchases');
      const data = allPurchases.data || [];
      // Use computed_status which considers expiry dates
      return {
        total: data.length,
        active: data.filter(p => (p.computed_status || p.status) === 'active').length,
        pending: data.filter(p => (p.computed_status || p.status) === 'pending').length,
        expired: data.filter(p => (p.computed_status || p.status) === 'expired').length
      };
    },
    staleTime: 300_000,
  });

  // Type-filter options, derived from the actual loaded purchases so they always match
  // reality (and never show a bucket nobody has).
  const categoryOptions = useMemo(() => {
    const set = new Set(purchases.map(p => p.offering_category).filter(Boolean));
    return Array.from(set).sort().map(c => ({ value: c, label: CATEGORY_LABELS[c] || titleCase(c) }));
  }, [purchases]);

  const durationOptions = useMemo(() => {
    const set = new Set(purchases.map(deriveDuration));
    return DURATION_ORDER.filter(d => set.has(d)).map(d => ({ value: d, label: DURATION_LABELS[d] }));
  }, [purchases]);

  // Filter purchases by search term + membership type (category) + duration
  const filteredPurchases = purchases.filter(p => {
    if (filters.category !== 'all' && p.offering_category !== filters.category) return false;
    if (filters.duration !== 'all' && deriveDuration(p) !== filters.duration) return false;
    if (!filters.search) return true;
    const search = filters.search.toLowerCase();
    return (
      p.user_name?.toLowerCase().includes(search) ||
      p.user_email?.toLowerCase().includes(search) ||
      p.offering_name?.toLowerCase().includes(search) ||
      p.current_offering_name?.toLowerCase().includes(search)
    );
  });

  const handleViewDetails = (purchase) => {
    setSelectedPurchase(purchase);
    setDetailModalVisible(true);
  };

  const handleEdit = (purchase) => {
    setSelectedPurchase(purchase);
    editForm.setFieldsValue({
      status: purchase.status || 'active',
      payment_status: purchase.payment_status || 'completed',
      expires_at: purchase.expires_at ? dayjs(purchase.expires_at) : null,
      notes: purchase.notes || '',
    });
    setEditModalVisible(true);
  };

  const handleSaveEdit = async () => {
    if (!selectedPurchase) return;
    try {
      const values = await editForm.validateFields();
      setEditSaving(true);
      await apiClient.put(`/member-offerings/admin/purchases/${selectedPurchase.id}`, {
        status: values.status,
        payment_status: values.payment_status,
        notes: values.notes || null,
        expires_at: values.expires_at ? values.expires_at.toISOString() : null,
      });
      message.success(t('admin:members.toast.updated', 'Membership updated'));
      setEditModalVisible(false);
      refetch();
      queryClient.invalidateQueries(['admin-member-stats']);
    } catch (err) {
      if (err?.errorFields) return; // form validation
      message.error(err?.response?.data?.error || t('admin:members.toast.updateFailed', 'Failed to update'));
    } finally {
      setEditSaving(false);
    }
  };

  const handleDelete = (purchase) => {
    const name = purchase.offering_name || purchase.current_offering_name || 'membership';
    Modal.confirm({
      title: t('admin:members.delete.title', 'Delete membership'),
      content: t('admin:members.delete.confirm', {
        name,
        defaultValue: `Delete "${name}"? Any wallet payment is refunded to the customer and the storage box is released. The membership is kept as "cancelled" for the record.`,
      }),
      okText: t('admin:members.actions.delete', 'Delete'),
      okButtonProps: { danger: true },
      cancelText: t('common:buttons.cancel', 'Cancel'),
      onOk: async () => {
        try {
          const { data } = await apiClient.post(`/member-offerings/admin/purchases/${purchase.id}/cancel`, { reason: 'admin_deleted' });
          if (data?.refunded) {
            message.success(t('admin:members.delete.refunded', {
              amount: formatCurrency(data.refundAmount || 0, data.refundCurrency || undefined),
              defaultValue: `Membership deleted · ${formatCurrency(data.refundAmount || 0, data.refundCurrency || undefined)} refunded to wallet`,
            }));
          } else {
            message.warning(t('admin:members.delete.noRefund', 'Membership deleted. No wallet charge was found to refund — adjust the balance manually if needed.'));
          }
          refetch();
          queryClient.invalidateQueries(['admin-member-stats']);
        } catch (err) {
          message.error(err?.response?.data?.error || t('admin:members.delete.failed', 'Failed to delete membership'));
        }
      },
    });
  };

  const handleDiscount = (purchase) => {
    setDiscountTarget({
      customerId: purchase.user_id,
      entityType: 'member_purchase',
      entityId: purchase.id,
      originalPrice: Number(purchase.offering_price) || 0,
      currency: purchase.currency || 'EUR',
      description: `${purchase.offering_name || purchase.current_offering_name || 'Membership'} — ${purchase.user_name || purchase.user_email || ''}`,
    });
  };

  const handleAssignSuccess = () => {
    setAssignModalVisible(false);
    refetch();
    queryClient.invalidateQueries(['admin-member-stats']);
    message.success(t('admin:members.toast.assigned'));
  };

  // Storage boxes held by more than one live purchase = shared across customers.
  // Matches the backend occupancy predicate (active/pending/pending_payment); 'expired'
  // (computed from expires_at) is excluded so a lapsed tenant doesn't keep the badge alive.
  const LIVE_PURCHASE_STATUSES = ['active', 'pending', 'pending_payment'];
  const sharedStorageUnits = (() => {
    const counts = {};
    purchases.forEach(p => {
      if (p.storage_unit != null && LIVE_PURCHASE_STATUSES.includes(p.status)) {
        counts[p.storage_unit] = (counts[p.storage_unit] || 0) + 1;
      }
    });
    return new Set(Object.keys(counts).filter(k => counts[k] > 1).map(Number));
  })();

  const columns = [
    {
      title: t('admin:members.table.member'),
      key: 'member',
      render: (_, record) => (
        <div
          className="flex items-center gap-2 cursor-pointer hover:bg-slate-50 rounded-md -mx-1 px-1 py-0.5 transition-colors"
          onClick={() => openCustomerDrawer(record)}
        >
          <Avatar size={28} icon={<UserOutlined />} style={{ backgroundColor: '#1890ff' }} />
          <div className="leading-tight">
            <span className="text-sm font-medium text-slate-800 hover:text-blue-600">{record.user_name || t('admin:members.detail.memberName')}</span>
            <br />
            <span className="text-[11px] text-slate-400">{record.user_email}</span>
          </div>
        </div>
      )
    },
    {
      title: t('admin:members.table.membership'),
      key: 'type',
      render: (_, record) => (
        <span className="flex items-center gap-1.5 text-sm">
          {getMemberIcon(record.offering_name || record.current_offering_name)}
          {record.offering_name || record.current_offering_name || 'Unknown'}
          {record.storage_unit != null && (
            <Tag
              color={sharedStorageUnits.has(Number(record.storage_unit)) ? 'gold' : 'blue'}
              className="m-0 ml-1"
            >
              Box #{record.storage_unit}{sharedStorageUnits.has(Number(record.storage_unit)) ? ' (shared)' : ''}
            </Tag>
          )}
        </span>
      )
    },
    {
      title: t('admin:members.table.status'),
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status) => {
        const config = statusConfig[status] || statusConfig.pending;
        return (
          <Tag color={config.color} icon={config.icon} className="m-0">
            {config.label}
          </Tag>
        );
      }
    },
    {
      title: t('admin:members.table.purchased'),
      dataIndex: 'purchased_at',
      key: 'purchased_at',
      width: 120,
      render: (date) => date ? <span className="text-sm text-slate-600">{dayjs(date).format('MMM D, YYYY')}</span> : '-',
      sorter: (a, b) => new Date(a.purchased_at) - new Date(b.purchased_at)
    },
    {
      title: t('admin:members.table.expires'),
      dataIndex: 'expires_at',
      key: 'expires_at',
      width: 120,
      render: (date) => {
        if (!date) return <span className="text-xs text-slate-400">{t('admin:members.table.never')}</span>;
        const expiry = dayjs(date);
        const isExpired = expiry.isBefore(dayjs());
        const isExpiringSoon = expiry.isBefore(dayjs().add(7, 'days'));
        return (
          <span className={`text-sm ${isExpired ? 'text-red-500' : isExpiringSoon ? 'text-amber-500' : 'text-slate-600'}`}>
            {expiry.format('MMM D, YYYY')}
          </span>
        );
      }
    },
    {
      title: t('admin:members.table.amount'),
      dataIndex: 'offering_price',
      key: 'offering_price',
      width: 90,
      render: (amount) => <span className="text-sm font-medium">{formatCurrency(amount || 0)}</span>,
      sorter: (a, b) => (a.offering_price || 0) - (b.offering_price || 0)
    },
    {
      title: t('admin:members.table.actions', 'Actions'),
      key: 'actions',
      width: 140,
      render: (_, record) => (
        <Space size={2}>
          <Tooltip title={t('admin:members.actions.view', 'View')}>
            <Button type="text" size="small" icon={<EyeOutlined />} onClick={() => handleViewDetails(record)} />
          </Tooltip>
          <Tooltip title={t('admin:members.actions.edit', 'Edit')}>
            <Button type="text" size="small" icon={<EditOutlined />} onClick={() => handleEdit(record)} />
          </Tooltip>
          <Tooltip title={t('admin:members.actions.discount', 'Apply discount')}>
            <Button type="text" size="small" icon={<PercentageOutlined />} onClick={() => handleDiscount(record)} />
          </Tooltip>
          {canManage && (
            <Tooltip title={t('admin:members.actions.delete', 'Delete')}>
              <Button type="text" danger size="small" icon={<DeleteOutlined />} onClick={() => handleDelete(record)} />
            </Tooltip>
          )}
        </Space>
      )
    }
  ];

  // Mobile card component for member display
  const MemberCard = ({ record }) => {
    const config = statusConfig[record.status] || statusConfig.pending;
    const expiry = record.expires_at ? dayjs(record.expires_at) : null;
    const isExpired = expiry?.isBefore(dayjs());
    
    return (
      <Card 
        className="rounded-xl border border-slate-200 shadow-sm mb-2"
        styles={{ body: { padding: 12 } }}
      >
        <div className="flex items-start justify-between mb-2">
          <div
            className="flex items-center gap-2 cursor-pointer"
            onClick={() => openCustomerDrawer(record)}
          >
            <Avatar size={28} icon={<UserOutlined />} style={{ backgroundColor: '#1890ff' }} />
            <div className="leading-tight">
              <span className="text-sm font-medium block hover:text-blue-600">{record.user_name || t('admin:members.detail.memberName')}</span>
              <span className="text-[11px] text-slate-400">{record.user_email}</span>
            </div>
          </div>
          <Tag color={config.color} icon={config.icon} className="m-0">
            {config.label}
          </Tag>
        </div>
        
        <div className="flex items-center gap-1.5 mb-2 text-sm text-slate-700">
          {getMemberIcon(record.offering_name || record.current_offering_name)}
          {record.offering_name || record.current_offering_name || 'Unknown'}
        </div>
        
        <div className="grid grid-cols-2 gap-1 text-xs text-slate-500 mb-2">
          <div>
            <span className="text-slate-400">{t('admin:members.table.purchased')}: </span>
            {record.purchased_at ? dayjs(record.purchased_at).format('MMM D, YYYY') : '-'}
          </div>
          <div>
            <span className="text-slate-400">{t('admin:members.table.expires')}: </span>
            <span className={isExpired ? 'text-red-500' : ''}>
              {expiry ? expiry.format('MMM D, YYYY') : t('admin:members.table.never')}
            </span>
          </div>
        </div>
        
        <div className="flex items-center justify-between pt-2 border-t border-slate-100">
          <span className="text-sm font-medium text-green-600">{formatCurrency(record.offering_price || 0)}</span>
          <Space size={2}>
            <Button
              type="text"
              size="small"
              icon={<EyeOutlined />}
              onClick={() => handleViewDetails(record)}
            />
            {canManage && (
              <Button
                type="text"
                danger
                size="small"
                icon={<DeleteOutlined />}
                onClick={() => handleDelete(record)}
              />
            )}
          </Space>
        </div>
      </Card>
    );
  };

  return (
    <div className="p-3 md:p-5 min-h-screen bg-slate-50">
      {/* Header */}
      <div className="mb-3 md:mb-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <h2 className="m-0 text-base md:text-lg font-semibold text-slate-800 flex items-center gap-2">
            <CrownOutlined className="text-amber-500" />
            {t('admin:members.title')}
          </h2>
          <Space size="small" wrap>
            <Button icon={<ReloadOutlined />} size="small" onClick={() => refetch()}>
              {!isMobile && t('admin:members.refresh')}
            </Button>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              size="small"
              onClick={() => setAssignModalVisible(true)}
            >
              {isMobile ? t('admin:members.assign') : t('admin:members.assignMembership')}
            </Button>
          </Space>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-slate-200 p-3 mb-3 shadow-sm">
        <div className="flex flex-col sm:flex-row gap-2">
          <Input
            placeholder={t('admin:members.filters.searchPlaceholder')}
            prefix={<SearchOutlined className="text-slate-400" />}
            value={filters.search}
            onChange={(e) => setFilters(f => ({ ...f, search: e.target.value }))}
            className="flex-1"
            size="middle"
            allowClear
          />
          <div className="flex gap-2 flex-wrap">
            <Select
              value={filters.status}
              onChange={(value) => setFilters(f => ({ ...f, status: value }))}
              style={{ minWidth: 110 }}
              size="middle"
            >
              <Select.Option value="all">{t('admin:members.filters.allStatus')}</Select.Option>
              <Select.Option value="active">{t('admin:members.filters.active')}</Select.Option>
              <Select.Option value="pending">{t('admin:members.filters.pending')}</Select.Option>
              <Select.Option value="expired">{t('admin:members.filters.expired')}</Select.Option>
              <Select.Option value="cancelled">{t('admin:members.filters.cancelled')}</Select.Option>
            </Select>
            {categoryOptions.length > 1 && (
              <Select
                value={filters.category}
                onChange={(value) => setFilters(f => ({ ...f, category: value }))}
                style={{ minWidth: 120 }}
                size="middle"
              >
                <Select.Option value="all">{t('admin:members.filters.allCategories', 'All types')}</Select.Option>
                {categoryOptions.map(o => (
                  <Select.Option key={o.value} value={o.value}>{o.label}</Select.Option>
                ))}
              </Select>
            )}
            {durationOptions.length > 1 && (
              <Select
                value={filters.duration}
                onChange={(value) => setFilters(f => ({ ...f, duration: value }))}
                style={{ minWidth: 120 }}
                size="middle"
              >
                <Select.Option value="all">{t('admin:members.filters.allDurations', 'All durations')}</Select.Option>
                {durationOptions.map(o => (
                  <Select.Option key={o.value} value={o.value}>{t(`admin:members.filters.duration.${o.value}`, o.label)}</Select.Option>
                ))}
              </Select>
            )}
            {!isMobile && (
              <RangePicker
                value={filters.dateRange}
                onChange={(dates) => setFilters(f => ({ ...f, dateRange: dates }))}
                placeholder={[t('admin:members.filters.from'), t('admin:members.filters.to')]}
                size="middle"
              />
            )}
            {(filters.search || filters.status !== 'all' || filters.dateRange || filters.category !== 'all' || filters.duration !== 'all') && (
              <Button
                onClick={() => setFilters({ status: 'all', search: '', dateRange: null, category: 'all', duration: 'all' })}
                size="middle"
              >
                {t('admin:members.clear')}
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Content - Table on desktop, Cards on mobile */}
      {isMobile ? (
        <div>
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Spin size="large" />
            </div>
          ) : filteredPurchases.length === 0 ? (
            <Card className="rounded-xl">
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description={t('admin:members.empty.noMembers')}
              >
                <Button type="primary" onClick={() => setAssignModalVisible(true)}>
                  {t('admin:members.assignFirst')}
                </Button>
              </Empty>
            </Card>
          ) : (
            <>
              <div className="text-xs text-slate-500 mb-2 px-1">
                {t('admin:members.count', { count: filteredPurchases.length })}
              </div>
              {filteredPurchases.map(purchase => (
                <MemberCard key={purchase.id} record={purchase} />
              ))}
            </>
          )}
        </div>
      ) : (
        <Card className="rounded-xl border border-slate-200 shadow-sm" styles={{ body: { padding: 0 } }}>
          <Table
            columns={columns}
            dataSource={filteredPurchases}
            rowKey="id"
            loading={isLoading}
            size="small"
            pagination={{
              pageSize: 25,
              showSizeChanger: true,
              showTotal: (total) => <span className="text-xs text-slate-500">{t('admin:members.totalMembers', { total })}</span>,
              size: 'small'
            }}
            scroll={{ x: 800 }}
            locale={{
              emptyText: (
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description={t('admin:members.empty.noMembers')}
                >
                  <Button type="primary" onClick={() => setAssignModalVisible(true)}>
                    {t('admin:members.assignFirst')}
                  </Button>
                </Empty>
              )
            }}
          />
        </Card>
      )}

      {/* Detail Modal */}
      <Modal
        title={
          <Space>
            {getMemberIcon(selectedPurchase?.offering_name)}
            <span>{t('admin:members.detail.title')}</span>
          </Space>
        }
        open={detailModalVisible}
        onCancel={() => setDetailModalVisible(false)}
        footer={[
          <Button key="close" onClick={() => setDetailModalVisible(false)}>
            {t('admin:members.detail.close')}
          </Button>
        ]}
        width={600}
      >
        {selectedPurchase && (
          <Descriptions bordered column={1} size="small">
            <Descriptions.Item label={t('admin:members.detail.memberName')}>
              <Space>
                <Avatar icon={<UserOutlined />} size="small" />
                {selectedPurchase.user_name}
              </Space>
            </Descriptions.Item>
            <Descriptions.Item label={t('admin:members.detail.email')}>
              {selectedPurchase.user_email}
            </Descriptions.Item>
            <Descriptions.Item label={t('admin:members.detail.membershipType')}>
              <Space>
                {getMemberIcon(selectedPurchase.offering_name)}
                {selectedPurchase.offering_name || selectedPurchase.current_offering_name}
              </Space>
            </Descriptions.Item>
            {selectedPurchase.storage_unit != null && (
              <Descriptions.Item label={t('admin:members.detail.storageBox', 'Storage Box')}>
                <Tag color={sharedStorageUnits.has(Number(selectedPurchase.storage_unit)) ? 'gold' : 'blue'}>
                  #{selectedPurchase.storage_unit}{sharedStorageUnits.has(Number(selectedPurchase.storage_unit)) ? ' (shared)' : ''}
                </Tag>
              </Descriptions.Item>
            )}
            <Descriptions.Item label={t('admin:members.detail.status')}>
              <Tag color={statusConfig[selectedPurchase.status]?.color || 'default'}>
                {statusConfig[selectedPurchase.status]?.label || selectedPurchase.status}
              </Tag>
            </Descriptions.Item>
            <Descriptions.Item label={t('admin:members.detail.purchaseDate')}>
              {selectedPurchase.purchased_at
                ? dayjs(selectedPurchase.purchased_at).format('MMMM D, YYYY h:mm A')
                : '-'}
            </Descriptions.Item>
            <Descriptions.Item label={t('admin:members.detail.expiryDate')}>
              {selectedPurchase.expires_at
                ? dayjs(selectedPurchase.expires_at).format('MMMM D, YYYY')
                : t('admin:members.detail.neverExpires')}
            </Descriptions.Item>
            <Descriptions.Item label={t('admin:members.detail.amountPaid')}>
              {formatCurrency(selectedPurchase.offering_price || 0)}
            </Descriptions.Item>
            <Descriptions.Item label={t('admin:members.detail.paymentMethod')}>
              {selectedPurchase.payment_method || '-'}
            </Descriptions.Item>
            {selectedPurchase.notes && (
              <Descriptions.Item label={t('admin:members.detail.notes')}>
                {selectedPurchase.notes}
              </Descriptions.Item>
            )}
          </Descriptions>
        )}
      </Modal>

      {/* Assign Membership Modal */}
      <QuickMembershipModal
        visible={assignModalVisible}
        onClose={() => setAssignModalVisible(false)}
        onSuccess={handleAssignSuccess}
      />

      {/* Edit Membership Modal */}
      <Modal
        open={editModalVisible}
        title={t('admin:members.edit.title', 'Edit membership')}
        onCancel={() => setEditModalVisible(false)}
        onOk={handleSaveEdit}
        okButtonProps={{ loading: editSaving }}
        okText={t('common:buttons.save', 'Save')}
        cancelText={t('common:buttons.cancel', 'Cancel')}
        destroyOnHidden
      >
        <Form form={editForm} layout="vertical">
          <Form.Item name="status" label={t('admin:members.edit.status', 'Status')} rules={[{ required: true }]}>
            <Select
              options={[
                { value: 'active', label: t('admin:members.status.active') },
                { value: 'pending', label: t('admin:members.status.pending') },
                { value: 'expired', label: t('admin:members.status.expired') },
                { value: 'cancelled', label: t('admin:members.status.cancelled') },
              ]}
            />
          </Form.Item>
          <Form.Item name="payment_status" label={t('admin:members.edit.paymentStatus', 'Payment status')}>
            <Select
              options={[
                { value: 'completed', label: 'Completed' },
                { value: 'pending', label: 'Pending' },
                { value: 'failed', label: 'Failed' },
                { value: 'refunded', label: 'Refunded' },
              ]}
            />
          </Form.Item>
          <Form.Item name="expires_at" label={t('admin:members.edit.expires', 'Expires at')}>
            <DatePicker style={{ width: '100%' }} format="YYYY-MM-DD" />
          </Form.Item>
          <Form.Item name="notes" label={t('admin:members.edit.notes', 'Notes')}>
            <Input.TextArea rows={3} />
          </Form.Item>
        </Form>
      </Modal>

      {/* Customer Detail Drawer */}
      <Suspense fallback={null}>
        <EnhancedCustomerDetailModal
          customer={selectedCustomer}
          isOpen={customerDrawerOpen}
          onClose={() => { setCustomerDrawerOpen(false); setSelectedCustomer(null); }}
          onUpdate={() => {
            refetch();
            queryClient.invalidateQueries(['admin-member-stats']);
          }}
        />
      </Suspense>

      {/* Apply Discount Modal */}
      <ApplyDiscountModal
        open={!!discountTarget}
        onClose={() => setDiscountTarget(null)}
        onSaved={() => {
          setDiscountTarget(null);
          refetch();
          queryClient.invalidateQueries(['admin-member-stats']);
        }}
        customerId={discountTarget?.customerId}
        entityType={discountTarget?.entityType}
        entityId={discountTarget?.entityId}
        originalPrice={discountTarget?.originalPrice}
        currency={discountTarget?.currency}
        description={discountTarget?.description}
      />
    </div>
  );
};

export default AdminMembersPage;
