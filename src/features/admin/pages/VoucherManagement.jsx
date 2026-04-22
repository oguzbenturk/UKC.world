/**
 * Voucher Management Page
 * 
 * Admin interface for managing voucher codes, promo codes, and gift vouchers.
 * Includes CRUD operations, bulk generation, and redemption history.
 */

import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  App,
  Badge,
  Button,
  Card,
  Col,
  DatePicker,
  Divider,
  Drawer,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Row,
  Select,
  Space,
  Steps,
  Switch,
  Table,
  Tag,
  Tooltip,
  Typography
} from 'antd';
import {
  ArrowLeftOutlined,
  ArrowRightOutlined,
  CheckCircleOutlined,
  CopyOutlined,
  DeleteOutlined,
  EditOutlined,
  EyeOutlined,
  GiftOutlined,
  PercentageOutlined,
  PlusOutlined,
  ReloadOutlined,
  TagOutlined,
  WalletOutlined
} from '@ant-design/icons';
import dayjs from 'dayjs';
import api from '@/shared/services/apiClient';
import UnifiedResponsiveTable from '@/components/ui/ResponsiveTableV2';

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;
const { TextArea } = Input;

// Voucher type icon map (labels come from i18n)
const VOUCHER_TYPE_ICONS = {
  percentage: { icon: <PercentageOutlined />, color: 'blue' },
  fixed_amount: { icon: <TagOutlined />, color: 'green' },
  wallet_credit: { icon: <WalletOutlined />, color: 'gold' },
  free_service: { icon: <GiftOutlined />, color: 'purple' },
  package_upgrade: { icon: <GiftOutlined />, color: 'magenta' }
};

const APPLIES_TO_KEYS = ['all', 'shop', 'lessons', 'rentals', 'accommodation', 'packages', 'wallet'];
const APPLIES_TO_ICONS = { all: '🌐', shop: '🛍️', lessons: '🏄', rentals: '🔧', accommodation: '🏠', packages: '📦', wallet: '💰' };

const VISIBILITY_KEYS = ['public', 'private', 'role_based'];
const USAGE_TYPE_KEYS = ['single_global', 'single_per_user', 'multi_limited', 'multi_per_user', 'unlimited'];

const CURRENCY_OPTIONS = [
  { value: 'EUR', label: 'EUR (€)' },
  { value: 'USD', label: 'USD ($)' },
  { value: 'TRY', label: 'TRY (₺)' },
  { value: 'GBP', label: 'GBP (£)' }
];

const formatDate = (value) => (value ? dayjs(value).format('YYYY-MM-DD HH:mm') : '—');

// Controlled card-grid selectors — receive value/onChange from Form.Item
const VoucherTypeCards = ({ value, onChange, t }) => (
  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
    {Object.entries(VOUCHER_TYPE_ICONS).map(([key, config]) => {
      const selected = value === key;
      return (
        <div
          key={key}
          onClick={() => onChange?.(key)}
          style={{
            border: `2px solid ${selected ? '#1890ff' : '#e8e8e8'}`,
            borderRadius: 12,
            padding: '16px 18px',
            cursor: 'pointer',
            background: selected ? '#e6f7ff' : '#fafafa',
            transition: 'all 0.2s',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <span style={{ fontSize: 20, color: selected ? '#1890ff' : '#666' }}>
              {config.icon}
            </span>
            <Text strong style={{ fontSize: 14, color: selected ? '#1890ff' : '#333' }}>
              {t(`admin:vouchers.voucherTypes.${key}.label`)}
            </Text>
          </div>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {t(`admin:vouchers.voucherTypes.${key}.description`)}
          </Text>
        </div>
      );
    })}
  </div>
);

const AppliesToCards = ({ value, onChange, t }) => (
  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
    {APPLIES_TO_KEYS.map(key => {
      const selected = value === key;
      return (
        <div
          key={key}
          onClick={() => onChange?.(key)}
          style={{
            border: `2px solid ${selected ? '#1890ff' : '#e8e8e8'}`,
            borderRadius: 10,
            padding: '10px 14px',
            cursor: 'pointer',
            background: selected ? '#e6f7ff' : '#fafafa',
            transition: 'all 0.2s',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 16 }}>{APPLIES_TO_ICONS[key]}</span>
            <Text strong style={{ fontSize: 13, color: selected ? '#1890ff' : '#333' }}>
              {t(`admin:vouchers.appliesTo.${key}.label`)}
            </Text>
          </div>
          <Text type="secondary" style={{ fontSize: 11, display: 'block', marginTop: 2, marginLeft: 24 }}>
            {t(`admin:vouchers.appliesTo.${key}.description`)}
          </Text>
        </div>
      );
    })}
  </div>
);

const VoucherManagement = () => {
  const { t } = useTranslation(['admin']);
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [bulkForm] = Form.useForm();
  
  // State
  const [vouchers, setVouchers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [pagination, setPagination] = useState({ current: 1, pageSize: 20, total: 0 });
  const [filters, setFilters] = useState({ search: '', voucher_type: null, is_active: 'active' });
  
  // Modal/Drawer states
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);
  const [isViewDrawerOpen, setIsViewDrawerOpen] = useState(false);
  const [selectedVoucher, setSelectedVoucher] = useState(null);
  const [redemptions, setRedemptions] = useState([]);
  const [redemptionsLoading, setRedemptionsLoading] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [wizardStep, setWizardStep] = useState(0);
  
  // Statistics
  const [stats, setStats] = useState({
    totalVouchers: 0,
    activeVouchers: 0,
    totalRedemptions: 0,
    totalDiscountGiven: 0
  });

  // Fetch vouchers
  const fetchVouchers = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: pagination.current,
        limit: pagination.pageSize,
        ...(filters.search && { search: filters.search }),
        ...(filters.voucher_type && { voucher_type: filters.voucher_type }),
        ...(filters.is_active !== 'all' && { is_active: filters.is_active === 'active' })
      });
      
      const response = await api.get(`/vouchers?${params}`);
      
      if (response.data.success) {
        setVouchers(response.data.vouchers);
        setPagination(prev => ({
          ...prev,
          total: response.data.pagination.total
        }));
        
        // Calculate stats from current page (could also be a separate API call)
        setStats({
          totalVouchers: response.data.pagination.total,
          activeVouchers: response.data.vouchers.filter(v => v.is_active).length,
          totalRedemptions: response.data.vouchers.reduce((sum, v) => sum + (v.total_uses || 0), 0),
          totalDiscountGiven: 0 // Would need aggregation from backend
        });
      }
    } catch (error) {
      message.error(t('admin:vouchers.toast.loadError'));
    } finally {
      setLoading(false);
    }
  }, [pagination.current, pagination.pageSize, filters, message]);

  useEffect(() => {
    fetchVouchers();
  }, [fetchVouchers]);

  // Fetch redemption history
  const fetchRedemptions = async (voucherId) => {
    setRedemptionsLoading(true);
    try {
      const response = await api.get(`/vouchers/${voucherId}/redemptions`);
      if (response.data.success) {
        setRedemptions(response.data.redemptions);
      }
    } catch (error) {
      message.error(t('admin:vouchers.toast.redemptionsError'));
    } finally {
      setRedemptionsLoading(false);
    }
  };

  // Create voucher
  const handleCreateVoucher = async (values) => {
    try {
      const payload = {
        ...values,
        code: (values.code || '').toUpperCase().trim(),
        valid_from: values.validDates?.[0]?.toISOString(),
        valid_until: values.validDates?.[1]?.toISOString()
      };
      delete payload.validDates;
      // Strip null/undefined values — Ant Design sends null for empty InputNumber/DatePicker
      Object.keys(payload).forEach(k => { if (payload[k] == null) delete payload[k]; });
      
      const response = await api.post('/vouchers', payload);
      
      if (response.data.success) {
        message.success(t('admin:vouchers.toast.created'));
        setIsCreateModalOpen(false);
        setWizardStep(0);
        form.resetFields();
        fetchVouchers();
      }
    } catch (error) {
      if (error.response?.data?.error === 'DUPLICATE_CODE') {
        message.error(t('admin:vouchers.toast.duplicateCode'));
      } else {
        message.error(t('admin:vouchers.toast.createError'));
      }
    }
  };

  // Update voucher
  const handleUpdateVoucher = async (values) => {
    try {
      const payload = {
        ...values,
        valid_from: values.validDates?.[0]?.toISOString(),
        valid_until: values.validDates?.[1]?.toISOString()
      };
      delete payload.validDates;
      delete payload.code; // Code cannot be changed
      // Strip null/undefined values — Ant Design sends null for empty InputNumber/DatePicker
      Object.keys(payload).forEach(k => { if (payload[k] == null) delete payload[k]; });

      const response = await api.put(`/vouchers/${selectedVoucher.id}`, payload);

      if (response.data.success) {
        message.success(t('admin:vouchers.toast.updated'));
        setIsCreateModalOpen(false);
        setIsEditing(false);
        setWizardStep(0);
        form.resetFields();
        fetchVouchers();
      }
    } catch (error) {
      message.error(t('admin:vouchers.toast.updateError'));
    }
  };

  // Delete voucher
  const handleDeleteVoucher = async (id) => {
    try {
      await api.delete(`/vouchers/${id}`);
      message.success(t('admin:vouchers.toast.deactivated'));
      fetchVouchers();
    } catch (error) {
      message.error(t('admin:vouchers.toast.deleteError'));
    }
  };

  // Bulk generate
  const handleBulkGenerate = async (values) => {
    try {
      const payload = {
        count: values.count,
        prefix: values.prefix || '',
        template: {
          name: values.name,
          voucher_type: values.voucher_type,
          discount_value: values.discount_value,
          currency: values.currency || 'EUR',
          applies_to: values.applies_to || 'all',
          usage_type: 'single_per_user',
          max_uses_per_user: 1,
          valid_from: values.validDates?.[0]?.toISOString(),
          valid_until: values.validDates?.[1]?.toISOString(),
          visibility: 'public'
        }
      };
      
      const response = await api.post('/vouchers/bulk', payload);
      
      if (response.data.success) {
        message.success(t('admin:vouchers.toast.bulkGenerated', { count: response.data.count }));
        setIsBulkModalOpen(false);
        bulkForm.resetFields();
        fetchVouchers();
      }
    } catch (error) {
      message.error(t('admin:vouchers.toast.bulkError'));
    }
  };

  // Copy code to clipboard
  const copyCode = (code) => {
    navigator.clipboard.writeText(code);
    message.success(t('admin:vouchers.toast.codeCopied'));
  };

  // View voucher details
  const openViewDrawer = (voucher) => {
    setSelectedVoucher(voucher);
    setIsViewDrawerOpen(true);
    fetchRedemptions(voucher.id);
  };

  // Edit voucher
  const openEditModal = (voucher) => {
    setSelectedVoucher(voucher);
    setIsEditing(true);
    setWizardStep(0);
    form.setFieldsValue({
      ...voucher,
      validDates: voucher.valid_from || voucher.valid_until 
        ? [voucher.valid_from ? dayjs(voucher.valid_from) : null, voucher.valid_until ? dayjs(voucher.valid_until) : null]
        : null
    });
    setIsCreateModalOpen(true);
  };

  // Table columns
  const VOUCHER_TYPES = Object.fromEntries(
    Object.entries(VOUCHER_TYPE_ICONS).map(([key, cfg]) => [key, { ...cfg, label: t(`admin:vouchers.voucherTypes.${key}.label`) }])
  );

  const columns = [
    {
      title: t('admin:vouchers.table.code'),
      dataIndex: 'code',
      key: 'code',
      width: 150,
      render: (code, record) => (
        <Space>
          <Tag color={record.is_active ? 'blue' : 'default'} style={{ fontFamily: 'monospace', fontSize: 13 }}>
            {code}
          </Tag>
          <Tooltip title={t('admin:vouchers.table.copyCode')}>
            <Button type="text" size="small" icon={<CopyOutlined />} onClick={() => copyCode(code)} />
          </Tooltip>
        </Space>
      )
    },
    {
      title: t('admin:vouchers.table.name'),
      dataIndex: 'name',
      key: 'name',
      ellipsis: true,
      render: (name, record) => (
        <div>
          <Text strong>{name}</Text>
          {record.description && (
            <Text type="secondary" style={{ display: 'block', fontSize: 12 }}>{record.description}</Text>
          )}
        </div>
      )
    },
    {
      title: t('admin:vouchers.table.type'),
      dataIndex: 'voucher_type',
      key: 'voucher_type',
      width: 150,
      render: (type) => {
        const config = VOUCHER_TYPES[type];
        return (
          <Tag icon={config?.icon} color={config?.color}>
            {config?.label || type}
          </Tag>
        );
      }
    },
    {
      title: t('admin:vouchers.table.value'),
      key: 'value',
      width: 120,
      render: (_, record) => {
        if (record.voucher_type === 'percentage') {
          return <Text strong>{record.discount_value}%</Text>;
        }
        return <Text strong>{record.discount_value} {record.currency || 'EUR'}</Text>;
      }
    },
    {
      title: t('admin:vouchers.table.usage'),
      key: 'usage',
      width: 100,
      render: (_, record) => (
        <Tooltip title={`${record.total_uses || 0} of ${record.max_total_uses || '∞'} uses`}>
          <Badge
            count={`${record.total_uses || 0}/${record.max_total_uses || '∞'}`}
            style={{ backgroundColor: record.total_uses > 0 ? '#52c41a' : '#d9d9d9' }}
          />
        </Tooltip>
      )
    },
    {
      title: t('admin:vouchers.table.validity'),
      key: 'validity',
      width: 180,
      render: (_, record) => {
        const now = dayjs();
        const validFrom = record.valid_from ? dayjs(record.valid_from) : null;
        const validUntil = record.valid_until ? dayjs(record.valid_until) : null;

        let status = 'active';
        if (validFrom && validFrom.isAfter(now)) status = 'pending';
        if (validUntil && validUntil.isBefore(now)) status = 'expired';

        const statusColors = { active: 'green', pending: 'orange', expired: 'red' };

        return (
          <div>
            <Tag color={statusColors[status]}>{status.toUpperCase()}</Tag>
            {validUntil && (
              <Text type="secondary" style={{ fontSize: 11, display: 'block' }}>
                {t('admin:vouchers.table.validUntil', { date: formatDate(validUntil) })}
              </Text>
            )}
          </div>
        );
      }
    },
    {
      title: t('admin:vouchers.table.status'),
      dataIndex: 'is_active',
      key: 'is_active',
      width: 80,
      render: (isActive) => (
        <Tag color={isActive ? 'green' : 'default'}>{isActive ? t('admin:vouchers.table.active') : t('admin:vouchers.table.inactive')}</Tag>
      )
    },
    {
      title: t('admin:vouchers.table.actions'),
      key: 'actions',
      width: 120,
      render: (_, record) => (
        <Space size="small">
          <Tooltip title={t('admin:vouchers.detail.voucherInfo')}>
            <Button type="text" size="small" icon={<EyeOutlined />} onClick={() => openViewDrawer(record)} />
          </Tooltip>
          <Tooltip title={t('admin:vouchers.actions.updateVoucher')}>
            <Button type="text" size="small" icon={<EditOutlined />} onClick={() => openEditModal(record)} />
          </Tooltip>
          <Popconfirm
            title={t('admin:vouchers.popconfirm.deactivateTitle')}
            description={t('admin:vouchers.popconfirm.deactivateDescription')}
            onConfirm={() => handleDeleteVoucher(record.id)}
            okText={t('admin:vouchers.popconfirm.deactivateOk')}
            cancelText={t('admin:vouchers.popconfirm.cancel')}
          >
            <Tooltip title={t('admin:vouchers.popconfirm.deactivateOk')}>
              <Button type="text" size="small" danger icon={<DeleteOutlined />} />
            </Tooltip>
          </Popconfirm>
        </Space>
      )
    }
  ];

  // Redemption history columns
  const redemptionColumns = [
    {
      title: t('admin:vouchers.detail.redemptionColumns.user'),
      key: 'user',
      render: (_, record) => `${record.first_name} ${record.last_name}`
    },
    {
      title: t('admin:vouchers.detail.redemptionColumns.email'),
      dataIndex: 'email',
      key: 'email'
    },
    {
      title: t('admin:vouchers.detail.redemptionColumns.originalAmount'),
      dataIndex: 'original_amount',
      key: 'original_amount',
      render: (val, record) => `${val} ${record.currency}`
    },
    {
      title: t('admin:vouchers.detail.redemptionColumns.discountApplied'),
      dataIndex: 'discount_applied',
      key: 'discount_applied',
      render: (val, record) => <Text type="success">-{val} {record.currency}</Text>
    },
    {
      title: t('admin:vouchers.detail.redemptionColumns.reference'),
      key: 'reference',
      render: (_, record) => (
        <Tag>{record.reference_type}: {record.reference_id?.slice(0, 8)}...</Tag>
      )
    },
    {
      title: t('admin:vouchers.detail.redemptionColumns.date'),
      dataIndex: 'redeemed_at',
      key: 'redeemed_at',
      render: formatDate
    }
  ];

  const VoucherMobileCard = ({ record }) => {
    const config = VOUCHER_TYPES[record.voucher_type];
    
    // Status logic from columns
    const now = dayjs();
    const validFrom = record.valid_from ? dayjs(record.valid_from) : null;
    const validUntil = record.valid_until ? dayjs(record.valid_until) : null;
    
    let status = 'active';
    if (validFrom && validFrom.isAfter(now)) status = 'pending';
    if (validUntil && validUntil.isBefore(now)) status = 'expired';

    return (
      <Card styles={{ body: { padding: 12 } }} className="mb-3 border-slate-200 shadow-sm border">
         <div className="flex justify-between items-start">
             <div>
                <div className="flex items-center gap-2 mb-1">
                   {config?.icon && <span style={{ color: config.color }}>{config.icon}</span>}
                   <Tag color={record.is_active ? 'blue' : 'default'} style={{ fontFamily: 'monospace', margin: 0 }}>
                      {record.code}
                   </Tag>
                </div>
                <div className="font-medium text-slate-800">{record.name}</div>
             </div>
             <div className="text-right">
                <div className="font-bold text-lg">
                   {record.voucher_type === 'percentage' 
                      ? `${record.discount_value}%` 
                      : `${record.discount_value} ${record.currency || 'EUR'}`}
                </div>
                <Tag color={status === 'active' ? 'green' : status === 'pending' ? 'orange' : 'red'}>
                   {status.toUpperCase()}
                </Tag>
             </div>
         </div>
         
         <div className="my-2 border-t pt-2 grid grid-cols-2 gap-2 text-xs text-slate-500">
             <div>
               <div>{t('admin:vouchers.mobileCard.validUntil')}</div>
               <div className="text-slate-700 font-medium">{formatDate(record.valid_until)}</div>
             </div>
             <div>
               <div>{t('admin:vouchers.mobileCard.usage')}</div>
               <div className="text-slate-700 font-medium">{record.total_uses || 0} / {record.max_total_uses || '∞'}</div>
             </div>
         </div>
         
         <div className="flex justify-end gap-2 border-t pt-2">
            <Button size="small" icon={<EyeOutlined />} onClick={() => openViewDrawer(record)} />
            <Button size="small" icon={<EditOutlined />} onClick={() => openEditModal(record)} />
            <Popconfirm
              title={t('admin:vouchers.popconfirm.deactivateMobile')}
              onConfirm={() => handleDeleteVoucher(record.id)}
            >
              <Button size="small" danger icon={<DeleteOutlined />} />
            </Popconfirm>
         </div>
      </Card>
    );
  };

  return (
    <div className="min-h-screen bg-slate-50 p-4 sm:p-6 space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-2 border-b border-slate-200/60">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight mb-1 flex items-center gap-2">
            <GiftOutlined className="text-purple-500" /> {t('admin:vouchers.title')}
          </h1>
          <p className="text-sm text-slate-500">{t('admin:vouchers.subtitle')}</p>
        </div>
        <Space wrap>
          <Button icon={<ReloadOutlined />} onClick={fetchVouchers}>{t('admin:vouchers.actions.refresh')}</Button>
          <Button onClick={() => setIsBulkModalOpen(true)}>{t('admin:vouchers.actions.bulkGenerate')}</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => {
            setIsEditing(false);
            setSelectedVoucher(null);
            setWizardStep(0);
            form.resetFields();
            setIsCreateModalOpen(true);
          }}>
            {t('admin:vouchers.actions.createVoucher')}
          </Button>
        </Space>
      </div>

      {/* Statistics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: t('admin:vouchers.stats.totalVouchers'), value: stats.totalVouchers, icon: <TagOutlined />, accent: 'text-slate-700' },
          { label: t('admin:vouchers.stats.activeVouchers'), value: stats.activeVouchers, accent: 'text-emerald-600' },
          { label: t('admin:vouchers.stats.totalRedemptions'), value: stats.totalRedemptions, accent: 'text-blue-600' },
          { label: t('admin:vouchers.stats.totalDiscountGiven'), value: `€${(stats.totalDiscountGiven || 0).toFixed(2)}`, accent: 'text-purple-600' },
        ].map((s) => (
          <div key={s.label} className="rounded-2xl border border-slate-200/70 bg-white p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{s.label}</p>
            <p className={`mt-2 text-2xl font-semibold ${s.accent}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <Input
          placeholder={t('admin:vouchers.filters.searchPlaceholder')}
          value={filters.search}
          onChange={(e) => setFilters(prev => ({ ...prev, search: e.target.value }))}
          allowClear
          className="sm:max-w-xs"
          size="large"
        />
        <Select
          placeholder={t('admin:vouchers.filters.filterByType')}
          value={filters.voucher_type}
          onChange={(value) => setFilters(prev => ({ ...prev, voucher_type: value }))}
          allowClear
          className="sm:w-48"
          size="large"
        >
          {Object.entries(VOUCHER_TYPES).map(([key, config]) => (
            <Select.Option key={key} value={key}>{config.label}</Select.Option>
          ))}
        </Select>
        <Select
          placeholder={t('admin:vouchers.table.status')}
          value={filters.is_active}
          onChange={(value) => setFilters(prev => ({ ...prev, is_active: value }))}
          className="sm:w-40"
          size="large"
        >
          <Select.Option value="active">{t('admin:vouchers.filters.activeOnly')}</Select.Option>
          <Select.Option value="inactive">{t('admin:vouchers.filters.inactiveOnly')}</Select.Option>
          <Select.Option value="all">{t('admin:vouchers.filters.all')}</Select.Option>
        </Select>
      </div>

      {/* Vouchers Table */}
      <UnifiedResponsiveTable
        columns={columns}
        dataSource={vouchers}
        rowKey="id"
        loading={loading}
        pagination={{
            ...pagination,
            showSizeChanger: true,
            showTotal: (total) => t('admin:vouchers.table.totalVouchers', { total })
        }}
        onChange={(pag) => setPagination(pag)}
        mobileCardRenderer={(props) => <VoucherMobileCard {...props} />}
      />

      {/* Create/Edit Wizard Modal */}
      <Modal
        title={null}
        open={isCreateModalOpen}
        onCancel={() => {
          setIsCreateModalOpen(false);
          setIsEditing(false);
          setWizardStep(0);
          form.resetFields();
        }}
        footer={null}
        width={720}
        forceRender
        styles={{ body: { padding: '16px 24px 24px' } }}
      >
        {/* Wizard Header */}
        <div style={{ marginBottom: 20 }}>
          <Title level={4} style={{ margin: 0, marginBottom: 4 }}>
            {isEditing ? t('admin:vouchers.wizard.editTitle') : t('admin:vouchers.wizard.createTitle')}
          </Title>
          <Text type="secondary">
            {isEditing
              ? t('admin:vouchers.wizard.editSubtitle')
              : t('admin:vouchers.wizard.createSubtitle')}
          </Text>
        </div>

        {!isEditing && (
          <Steps
            current={wizardStep}
            size="small"
            style={{ marginBottom: 28 }}
            items={[
              { title: t('admin:vouchers.wizard.steps.type') },
              { title: t('admin:vouchers.wizard.steps.valueScope') },
              { title: t('admin:vouchers.wizard.steps.rules') },
              { title: t('admin:vouchers.wizard.steps.codeReview') },
            ]}
          />
        )}

        <Form
          form={form}
          layout="vertical"
          onFinish={isEditing ? handleUpdateVoucher : handleCreateVoucher}
          initialValues={{
            voucher_type: 'percentage',
            discount_value: 10,
            currency: 'EUR',
            applies_to: 'all',
            usage_type: 'single_per_user',
            max_uses_per_user: 1,
            visibility: 'public',
            is_active: true,
            can_combine: false,
            requires_first_purchase: false
          }}
        >
          {/* ====== STEP 0: Voucher Type ====== */}
            <div style={{ display: (isEditing || wizardStep === 0) ? 'block' : 'none' }}>
              {!isEditing && (
                <Text strong style={{ display: 'block', marginBottom: 16, fontSize: 15 }}>
                  {t('admin:vouchers.wizard.step0.prompt')}
                </Text>
              )}
              
              <Form.Item name="voucher_type" label={isEditing ? t('admin:vouchers.detail.type') : undefined} rules={[{ required: true }]} style={isEditing ? {} : { marginBottom: 0 }}>
                {isEditing ? (
                  <Select>
                    {Object.entries(VOUCHER_TYPES).map(([key, config]) => (
                      <Select.Option key={key} value={key}>
                        {config.icon} {config.label}
                      </Select.Option>
                    ))}
                  </Select>
                ) : (
                  <VoucherTypeCards t={t} />
                )}
              </Form.Item>
            </div>

          {isEditing && <Divider style={{ margin: '12px 0' }} />}

          {/* ====== STEP 1: Value & Scope ====== */}
            <div style={{ display: (isEditing || wizardStep === 1) ? 'block' : 'none' }}>
              {!isEditing && (
                <Form.Item noStyle shouldUpdate={(prev, curr) => prev.voucher_type !== curr.voucher_type}>
                  {({ getFieldValue }) => {
                    const vType = getFieldValue('voucher_type');
                    return (
                      <Text strong style={{ display: 'block', marginBottom: 16, fontSize: 15 }}>
                        {vType === 'percentage' && t('admin:vouchers.wizard.step1.promptPercentage')}
                        {vType === 'fixed_amount' && t('admin:vouchers.wizard.step1.promptFixed')}
                        {vType === 'wallet_credit' && t('admin:vouchers.wizard.step1.promptWallet')}
                        {vType === 'free_service' && t('admin:vouchers.wizard.step1.promptFreeService')}
                        {vType === 'package_upgrade' && t('admin:vouchers.wizard.step1.promptPackageUpgrade')}
                      </Text>
                    );
                  }}
                </Form.Item>
              )}

              <Form.Item noStyle shouldUpdate={(prev, curr) => prev.voucher_type !== curr.voucher_type}>
                {({ getFieldValue }) => {
                  const vType = getFieldValue('voucher_type');
                  const isPercentage = vType === 'percentage';
                  const showCurrency = ['fixed_amount', 'wallet_credit'].includes(vType);
                  const showMaxDiscount = vType === 'percentage';

                  return (
                    <>
                      <Row gutter={16}>
                        <Col span={showCurrency ? 12 : 16}>
                          <Form.Item
                            name="discount_value"
                            label={isPercentage ? t('admin:vouchers.wizard.step1.percentageLabel') : vType === 'wallet_credit' ? t('admin:vouchers.wizard.step1.creditAmountLabel') : t('admin:vouchers.wizard.step1.discountAmountLabel')}
                            rules={[{ required: true, type: 'number', min: 0.01, message: t('admin:vouchers.validation.enterValue') }]}
                          >
                            <InputNumber 
                              style={{ width: '100%' }} 
                              min={0.01}
                              max={isPercentage ? 100 : undefined}
                              addonAfter={isPercentage ? '%' : undefined}
                              placeholder={isPercentage ? 'e.g., 15' : 'e.g., 10.00'}
                              size="large"
                            />
                          </Form.Item>
                        </Col>
                        {showCurrency && (
                          <Col span={12}>
                            <Form.Item name="currency" label={t('admin:vouchers.wizard.step1.currencyLabel')}>
                              <Select size="large">
                                {CURRENCY_OPTIONS.map(opt => (
                                  <Select.Option key={opt.value} value={opt.value}>{opt.label}</Select.Option>
                                ))}
                              </Select>
                            </Form.Item>
                          </Col>
                        )}
                        {!showCurrency && (
                          <Col span={8}>
                            <Form.Item name="currency" label={t('admin:vouchers.wizard.step1.currencyLabel')}>
                              <Select size="large">
                                {CURRENCY_OPTIONS.map(opt => (
                                  <Select.Option key={opt.value} value={opt.value}>{opt.label}</Select.Option>
                                ))}
                              </Select>
                            </Form.Item>
                          </Col>
                        )}
                      </Row>

                      {showMaxDiscount && (
                        <Form.Item name="max_discount" label={t('admin:vouchers.wizard.step1.maxDiscountLabel')} extra={t('admin:vouchers.wizard.step1.maxDiscountExtra')}>
                          <InputNumber style={{ width: '100%' }} min={0} placeholder="No cap" />
                        </Form.Item>
                      )}

                      <Form.Item name="min_purchase_amount" label={t('admin:vouchers.wizard.step1.minPurchaseLabel')} extra={t('admin:vouchers.wizard.step1.minPurchaseExtra')}>
                        <InputNumber style={{ width: '100%' }} min={0} placeholder="No minimum" />
                      </Form.Item>
                    </>
                  );
                }}
              </Form.Item>

              <Divider style={{ margin: '16px 0' }} />

              <Text strong style={{ display: 'block', marginBottom: 12, fontSize: 14 }}>
                {t('admin:vouchers.wizard.step1.whereUsed')}
              </Text>

              <Form.Item name="applies_to" rules={[{ required: true }]}>
                {isEditing ? (
                  <Select>
                    {APPLIES_TO_KEYS.map(key => (
                      <Select.Option key={key} value={key}>{APPLIES_TO_ICONS[key]} {t(`admin:vouchers.appliesTo.${key}.label`)}</Select.Option>
                    ))}
                  </Select>
                ) : (
                  <AppliesToCards t={t} />
                )}
              </Form.Item>
            </div>

          {isEditing && <Divider style={{ margin: '12px 0' }} />}

          {/* ====== STEP 2: Rules & Limits ====== */}
            <div style={{ display: (isEditing || wizardStep === 2) ? 'block' : 'none' }}>
              {!isEditing && (
                <Text strong style={{ display: 'block', marginBottom: 16, fontSize: 15 }}>
                  {t('admin:vouchers.wizard.step2.prompt')}
                </Text>
              )}

              <Text strong style={{ display: 'block', marginBottom: 8, fontSize: 13 }}>{t('admin:vouchers.wizard.step2.usageLimits')}</Text>

              <Form.Item name="usage_type" label={t('admin:vouchers.wizard.step2.howManyTimes')}>
                <Select size="large">
                  {USAGE_TYPE_KEYS.map(key => (
                    <Select.Option key={key} value={key}>{t(`admin:vouchers.usageType.${key}`)}</Select.Option>
                  ))}
                </Select>
              </Form.Item>

              <Form.Item noStyle shouldUpdate={(prev, curr) => prev.usage_type !== curr.usage_type}>
                {({ getFieldValue }) => {
                  const usageType = getFieldValue('usage_type');
                  const showMaxTotal = ['multi_limited'].includes(usageType);
                  const showMaxPerUser = ['multi_per_user', 'single_per_user', 'multi_limited'].includes(usageType);

                  return (
                    <Row gutter={16}>
                      {showMaxTotal && (
                        <Col span={12}>
                          <Form.Item name="max_total_uses" label={t('admin:vouchers.wizard.step2.maxTotalUses')} rules={[{ required: true, type: 'number', min: 1 }]}>
                            <InputNumber style={{ width: '100%' }} min={1} placeholder="e.g., 100" />
                          </Form.Item>
                        </Col>
                      )}
                      {showMaxPerUser && (
                        <Col span={showMaxTotal ? 12 : 24}>
                          <Form.Item name="max_uses_per_user" label={t('admin:vouchers.wizard.step2.maxUsesPerUser')}>
                            <InputNumber style={{ width: '100%' }} min={1} />
                          </Form.Item>
                        </Col>
                      )}
                    </Row>
                  );
                }}
              </Form.Item>

              <Divider style={{ margin: '16px 0' }} />
              <Text strong style={{ display: 'block', marginBottom: 8, fontSize: 13 }}>{t('admin:vouchers.wizard.step2.validityPeriod')}</Text>

              <Form.Item name="validDates" label={t('admin:vouchers.wizard.step2.validDateRange')} extra={t('admin:vouchers.wizard.step2.validDateExtra')}>
                <RangePicker
                  showTime
                  style={{ width: '100%' }}
                  size="large"
                  placeholder={[t('admin:vouchers.wizard.step2.startDate'), t('admin:vouchers.wizard.step2.endDate')]}
                />
              </Form.Item>

              <Divider style={{ margin: '16px 0' }} />
              <Text strong style={{ display: 'block', marginBottom: 8, fontSize: 13 }}>{t('admin:vouchers.wizard.step2.accessControl')}</Text>

              <Form.Item name="visibility" label={t('admin:vouchers.wizard.step2.whoCanUse')}>
                <Select size="large">
                  {VISIBILITY_KEYS.map(key => (
                    <Select.Option key={key} value={key}>{t(`admin:vouchers.visibility.${key}`)}</Select.Option>
                  ))}
                </Select>
              </Form.Item>

              <Row gutter={16}>
                <Col span={8}>
                  <Form.Item name="requires_first_purchase" valuePropName="checked" label={t('admin:vouchers.wizard.step2.firstPurchaseOnly')}>
                    <Switch />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item name="can_combine" valuePropName="checked" label={t('admin:vouchers.wizard.step2.canCombine')}>
                    <Switch />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item name="is_active" valuePropName="checked" label={t('admin:vouchers.wizard.step2.activeOnCreate')}>
                    <Switch />
                  </Form.Item>
                </Col>
              </Row>
            </div>

          {isEditing && <Divider style={{ margin: '12px 0' }} />}

          {/* ====== STEP 3: Code & Review ====== */}
            <div style={{ display: (isEditing || wizardStep === 3) ? 'block' : 'none' }}>
              {!isEditing && (
                <Text strong style={{ display: 'block', marginBottom: 16, fontSize: 15 }}>
                  {t('admin:vouchers.wizard.step3.prompt')}
                </Text>
              )}

              <Row gutter={16}>
                <Col span={12}>
                  <Form.Item
                    name="code"
                    label={t('admin:vouchers.wizard.step3.voucherCode')}
                    rules={[
                      { required: !isEditing, message: t('admin:vouchers.validation.codeRequired') },
                      { min: 3, message: t('admin:vouchers.validation.codeMin') },
                      { max: 50, message: t('admin:vouchers.validation.codeMax') },
                      { pattern: /^[A-Za-z0-9_-]+$/, message: t('admin:vouchers.validation.codePattern') }
                    ]}
                    extra={t('admin:vouchers.wizard.step3.voucherCodeExtra')}
                  >
                    <Input 
                      placeholder="e.g., SUMMER20" 
                      size="large"
                      style={{ textTransform: 'uppercase', fontFamily: 'monospace', fontSize: 16, letterSpacing: 1 }}
                      disabled={isEditing}
                    />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item
                    name="name"
                    label={t('admin:vouchers.wizard.step3.displayName')}
                    rules={[{ required: true, message: t('admin:vouchers.validation.nameRequired') }]}
                    extra={t('admin:vouchers.wizard.step3.displayNameExtra')}
                  >
                    <Input placeholder="e.g., Summer Sale 20% Off" size="large" />
                  </Form.Item>
                </Col>
              </Row>

              <Form.Item name="description" label={t('admin:vouchers.wizard.step3.internalDescription')}>
                <TextArea rows={2} placeholder={t('admin:vouchers.wizard.step3.descriptionPlaceholder')} />
              </Form.Item>

              {/* Review Summary */}
              {!isEditing && (
                <Form.Item noStyle shouldUpdate>
                  {({ getFieldValue }) => {
                    const vType = getFieldValue('voucher_type');
                    const value = getFieldValue('discount_value');
                    const currency = getFieldValue('currency') || 'EUR';
                    const appliesTo = getFieldValue('applies_to');
                    const usageType = getFieldValue('usage_type');
                    const maxDiscount = getFieldValue('max_discount');
                    const minPurchase = getFieldValue('min_purchase_amount');
                    const config = VOUCHER_TYPES[vType];
                    // scopeOpt/usageOpt replaced by direct t() lookups below

                    return (
                      <div style={{
                        background: '#f6ffed',
                        border: '1px solid #b7eb8f',
                        borderRadius: 12,
                        padding: 20,
                        marginTop: 8
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                          <CheckCircleOutlined style={{ color: '#52c41a', fontSize: 18 }} />
                          <Text strong style={{ fontSize: 14 }}>{t('admin:vouchers.wizard.step3.reviewSummary')}</Text>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 24px' }}>
                          <div>
                            <Text type="secondary" style={{ fontSize: 11 }}>{t('admin:vouchers.wizard.step3.type')}</Text>
                            <div>
                              <Tag color={config?.color}>{config?.icon} {config?.label}</Tag>
                            </div>
                          </div>
                          <div>
                            <Text type="secondary" style={{ fontSize: 11 }}>{t('admin:vouchers.wizard.step3.value')}</Text>
                            <div>
                              <Text strong style={{ fontSize: 16 }}>
                                {vType === 'percentage' ? `${value}%` : `${value} ${currency}`}
                              </Text>
                              {maxDiscount && <Text type="secondary"> {t('admin:vouchers.wizard.step3.maxDiscount', { amount: maxDiscount, currency })}</Text>}
                            </div>
                          </div>
                          <div>
                            <Text type="secondary" style={{ fontSize: 11 }}>{t('admin:vouchers.wizard.step3.appliesTo')}</Text>
                            <div><Text>{APPLIES_TO_ICONS[appliesTo]} {t(`admin:vouchers.appliesTo.${appliesTo}.label`)}</Text></div>
                          </div>
                          <div>
                            <Text type="secondary" style={{ fontSize: 11 }}>{t('admin:vouchers.wizard.step3.usage')}</Text>
                            <div><Text>{t(`admin:vouchers.usageType.${usageType}`)}</Text></div>
                          </div>
                          {minPurchase > 0 && (
                            <div>
                              <Text type="secondary" style={{ fontSize: 11 }}>{t('admin:vouchers.wizard.step3.minPurchase')}</Text>
                              <div><Text>{minPurchase} {currency}</Text></div>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  }}
                </Form.Item>
              )}
            </div>

          {/* ====== Navigation / Submit Buttons ====== */}
          <div style={{ 
            display: 'flex', 
            justifyContent: isEditing ? 'flex-end' : 'space-between', 
            marginTop: 24,
            paddingTop: 16,
            borderTop: '1px solid #f0f0f0'
          }}>
            {!isEditing && (
              <Button
                icon={<ArrowLeftOutlined />}
                disabled={wizardStep === 0}
                onClick={() => setWizardStep(s => s - 1)}
              >
                {t('admin:vouchers.wizard.navigation.back')}
              </Button>
            )}
            
            <Space>
              <Button onClick={() => {
                setIsCreateModalOpen(false);
                setIsEditing(false);
                setWizardStep(0);
                form.resetFields();
              }}>
                {t('admin:vouchers.wizard.navigation.cancel')}
              </Button>

              {isEditing ? (
                <Button type="primary" htmlType="submit">
                  {t('admin:vouchers.actions.updateVoucher')}
                </Button>
              ) : wizardStep < 3 ? (
                <Button
                  type="primary"
                  icon={<ArrowRightOutlined />}
                  iconPosition="end"
                  onClick={() => {
                    // Validate current step fields before proceeding
                    const stepFields = {
                      0: ['voucher_type'],
                      1: ['discount_value', 'applies_to'],
                      2: ['usage_type'],
                    };
                    form.validateFields(stepFields[wizardStep] || [])
                      .then(() => setWizardStep(s => s + 1))
                      .catch(() => {});
                  }}
                >
                  {wizardStep === 2 ? t('admin:vouchers.wizard.navigation.review') : t('admin:vouchers.wizard.navigation.next')}
                </Button>
              ) : (
                <Button type="primary" htmlType="submit" icon={<CheckCircleOutlined />} size="large">
                  {t('admin:vouchers.wizard.navigation.createVoucher')}
                </Button>
              )}
            </Space>
          </div>
        </Form>
      </Modal>

      {/* Bulk Generate Modal */}
      <Modal
        title={null}
        open={isBulkModalOpen}
        onCancel={() => {
          setIsBulkModalOpen(false);
          bulkForm.resetFields();
        }}
        footer={null}
        width={520}
        forceRender
        styles={{ body: { padding: '16px 24px 24px' } }}
      >
        <div style={{ marginBottom: 16 }}>
          <Title level={4} style={{ margin: 0, marginBottom: 4 }}>{t('admin:vouchers.bulk.title')}</Title>
          <Text type="secondary">{t('admin:vouchers.bulk.subtitle')}</Text>
        </div>

        <Form
          form={bulkForm}
          layout="vertical"
          onFinish={handleBulkGenerate}
          initialValues={{
            count: 10,
            prefix: '',
            voucher_type: 'percentage',
            discount_value: 10,
            currency: 'EUR',
            applies_to: 'all'
          }}
        >
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="count"
                label={t('admin:vouchers.bulk.numberOfCodes')}
                rules={[{ required: true, type: 'number', min: 1, max: 1000 }]}
              >
                <InputNumber style={{ width: '100%' }} min={1} max={1000} size="large" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="prefix" label={t('admin:vouchers.bulk.codePrefix')} extra={t('admin:vouchers.bulk.codePrefixExtra')}>
                <Input placeholder="e.g., GIFT" maxLength={10} style={{ textTransform: 'uppercase', fontFamily: 'monospace' }} size="large" />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item
            name="name"
            label={t('admin:vouchers.bulk.voucherName')}
            rules={[{ required: true }]}
          >
            <Input placeholder="e.g., Holiday Gift Voucher" size="large" />
          </Form.Item>

          <Row gutter={16}>
            <Col span={8}>
              <Form.Item name="voucher_type" label={t('admin:vouchers.bulk.type')} rules={[{ required: true }]}>
                <Select>
                  {Object.entries(VOUCHER_TYPES).map(([key, config]) => (
                    <Select.Option key={key} value={key}>{config.icon} {config.label}</Select.Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="discount_value" label={t('admin:vouchers.bulk.value')} rules={[{ required: true, type: 'number', min: 0.01 }]}>
                <InputNumber style={{ width: '100%' }} min={0.01} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="applies_to" label={t('admin:vouchers.bulk.scope')}>
                <Select>
                  {APPLIES_TO_KEYS.map(key => (
                    <Select.Option key={key} value={key}>{APPLIES_TO_ICONS[key]} {t(`admin:vouchers.appliesTo.${key}.label`)}</Select.Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
          </Row>

          <Form.Item name="validDates" label={t('admin:vouchers.bulk.validDateRange')} extra={t('admin:vouchers.bulk.validDateExtra')}>
            <RangePicker showTime style={{ width: '100%' }} placeholder={[t('admin:vouchers.wizard.step2.startDate'), t('admin:vouchers.wizard.step2.endDate')]} />
          </Form.Item>

          <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: 16, borderTop: '1px solid #f0f0f0' }}>
            <Space>
              <Button onClick={() => {
                setIsBulkModalOpen(false);
                bulkForm.resetFields();
              }}>
                {t('admin:vouchers.bulk.cancel')}
              </Button>
              <Button type="primary" htmlType="submit">
                {t('admin:vouchers.bulk.generate')}
              </Button>
            </Space>
          </div>
        </Form>
      </Modal>

      {/* View Details Drawer */}
      <Drawer
        title={t('admin:vouchers.detail.drawerTitle', { code: selectedVoucher?.code || '' })}
        open={isViewDrawerOpen}
        onClose={() => {
          setIsViewDrawerOpen(false);
          setSelectedVoucher(null);
          setRedemptions([]);
        }}
        width={700}
      >
        {selectedVoucher && (
          <>
            <Card title={t('admin:vouchers.detail.voucherInfo')} style={{ marginBottom: 16 }}>
              <Row gutter={[16, 16]}>
                <Col span={12}>
                  <Text type="secondary">{t('admin:vouchers.detail.code')}</Text>
                  <div>
                    <Tag color="blue" style={{ fontSize: 16, padding: '4px 12px' }}>
                      {selectedVoucher.code}
                    </Tag>
                    <Button 
                      type="text" 
                      icon={<CopyOutlined />} 
                      onClick={() => copyCode(selectedVoucher.code)}
                    />
                  </div>
                </Col>
                <Col span={12}>
                  <Text type="secondary">{t('admin:vouchers.detail.status')}</Text>
                  <div>
                    <Tag color={selectedVoucher.is_active ? 'green' : 'red'}>
                      {selectedVoucher.is_active ? t('admin:vouchers.table.active') : t('admin:vouchers.table.inactive')}
                    </Tag>
                  </div>
                </Col>
                <Col span={12}>
                  <Text type="secondary">{t('admin:vouchers.detail.type')}</Text>
                  <div>
                    <Tag color={VOUCHER_TYPES[selectedVoucher.voucher_type]?.color}>
                      {VOUCHER_TYPES[selectedVoucher.voucher_type]?.label}
                    </Tag>
                  </div>
                </Col>
                <Col span={12}>
                  <Text type="secondary">{t('admin:vouchers.detail.value')}</Text>
                  <div>
                    <Text strong>
                      {selectedVoucher.voucher_type === 'percentage' 
                        ? `${selectedVoucher.discount_value}%`
                        : `${selectedVoucher.discount_value} ${selectedVoucher.currency}`
                      }
                    </Text>
                  </div>
                </Col>
                <Col span={12}>
                  <Text type="secondary">{t('admin:vouchers.detail.usage')}</Text>
                  <div>
                    <Text strong>
                      {selectedVoucher.total_uses || 0} / {selectedVoucher.max_total_uses || '∞'}
                    </Text>
                  </div>
                </Col>
                <Col span={12}>
                  <Text type="secondary">{t('admin:vouchers.detail.appliesTo')}</Text>
                  <div>
                    <Text>{t(`admin:vouchers.appliesTo.${selectedVoucher.applies_to}.label`)}</Text>
                  </div>
                </Col>
                <Col span={12}>
                  <Text type="secondary">{t('admin:vouchers.detail.validFrom')}</Text>
                  <div><Text>{formatDate(selectedVoucher.valid_from)}</Text></div>
                </Col>
                <Col span={12}>
                  <Text type="secondary">{t('admin:vouchers.detail.validUntil')}</Text>
                  <div><Text>{formatDate(selectedVoucher.valid_until)}</Text></div>
                </Col>
                <Col span={24}>
                  <Text type="secondary">{t('admin:vouchers.detail.created')}</Text>
                  <div>
                    <Text>
                      {formatDate(selectedVoucher.created_at)}
                      {selectedVoucher.created_by_name && ` by ${selectedVoucher.created_by_name}`}
                    </Text>
                  </div>
                </Col>
              </Row>
            </Card>

            <Card title={t('admin:vouchers.detail.redemptionHistory')}>
              <Table
                columns={redemptionColumns}
                dataSource={redemptions}
                rowKey="id"
                loading={redemptionsLoading}
                pagination={false}
                size="small"
                locale={{ emptyText: t('admin:vouchers.detail.noRedemptions') }}
              />
            </Card>
          </>
        )}
      </Drawer>
    </div>
  );
};

export default VoucherManagement;
