/**
 * Voucher Management Page
 * 
 * Admin interface for managing voucher codes, promo codes, and gift vouchers.
 * Includes CRUD operations, bulk generation, and redemption history.
 */

import { useCallback, useEffect, useState } from 'react';
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
  Statistic,
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

// Voucher type configurations
const VOUCHER_TYPES = {
  percentage: { label: 'Percentage Discount', icon: <PercentageOutlined />, color: 'blue' },
  fixed_amount: { label: 'Fixed Amount', icon: <TagOutlined />, color: 'green' },
  wallet_credit: { label: 'Wallet Credit', icon: <WalletOutlined />, color: 'gold' },
  free_service: { label: 'Free Service', icon: <GiftOutlined />, color: 'purple' },
  package_upgrade: { label: 'Package Upgrade', icon: <GiftOutlined />, color: 'magenta' }
};

const APPLIES_TO_OPTIONS = [
  { value: 'all', label: 'All Services', description: 'Works everywhere — lessons, shop, rentals, etc.', icon: '🌐' },
  { value: 'shop', label: 'Shop Only', description: 'Physical products and merchandise', icon: '🛍️' },
  { value: 'lessons', label: 'Lessons Only', description: 'Lesson bookings and training sessions', icon: '🏄' },
  { value: 'rentals', label: 'Rentals Only', description: 'Equipment rental bookings', icon: '🔧' },
  { value: 'accommodation', label: 'Accommodation Only', description: 'Room and accommodation bookings', icon: '🏠' },
  { value: 'packages', label: 'Packages Only', description: 'Package deals and bundles', icon: '📦' },
  { value: 'wallet', label: 'Wallet Deposits', description: 'Wallet top-up transactions', icon: '💰' }
];

const VISIBILITY_OPTIONS = [
  { value: 'public', label: 'Public (Anyone can use)' },
  { value: 'private', label: 'Private (Assigned users only)' },
  { value: 'role_based', label: 'Role-Based' }
];

const USAGE_TYPE_OPTIONS = [
  { value: 'single_global', label: 'Single Use (Total)' },
  { value: 'single_per_user', label: 'Single Use Per User' },
  { value: 'multi_limited', label: 'Limited Uses' },
  { value: 'multi_per_user', label: 'Limited Per User' },
  { value: 'unlimited', label: 'Unlimited' }
];

const CURRENCY_OPTIONS = [
  { value: 'EUR', label: 'EUR (€)' },
  { value: 'USD', label: 'USD ($)' },
  { value: 'TRY', label: 'TRY (₺)' },
  { value: 'GBP', label: 'GBP (£)' }
];

const formatDate = (value) => (value ? dayjs(value).format('YYYY-MM-DD HH:mm') : '—');

const VOUCHER_TYPE_DESCRIPTIONS = {
  percentage: 'Discount by a percentage of the total. Great for sales & promos.',
  fixed_amount: 'Flat amount off the order. Simple and clear.',
  wallet_credit: 'Adds credit to the user\'s wallet. Good for referrals.',
  free_service: 'Unlock a free service for the customer.',
  package_upgrade: 'Upgrade the customer\'s package tier.'
};

// Controlled card-grid selectors — receive value/onChange from Form.Item
const VoucherTypeCards = ({ value, onChange }) => (
  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
    {Object.entries(VOUCHER_TYPES).map(([key, config]) => {
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
              {config.label}
            </Text>
          </div>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {VOUCHER_TYPE_DESCRIPTIONS[key]}
          </Text>
        </div>
      );
    })}
  </div>
);

const AppliesToCards = ({ value, onChange }) => (
  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
    {APPLIES_TO_OPTIONS.map(opt => {
      const selected = value === opt.value;
      return (
        <div
          key={opt.value}
          onClick={() => onChange?.(opt.value)}
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
            <span style={{ fontSize: 16 }}>{opt.icon}</span>
            <Text strong style={{ fontSize: 13, color: selected ? '#1890ff' : '#333' }}>
              {opt.label}
            </Text>
          </div>
          <Text type="secondary" style={{ fontSize: 11, display: 'block', marginTop: 2, marginLeft: 24 }}>
            {opt.description}
          </Text>
        </div>
      );
    })}
  </div>
);

const VoucherManagement = () => {
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
      message.error('Failed to load vouchers');
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
      message.error('Failed to load redemptions');
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
        message.success('Voucher created successfully');
        setIsCreateModalOpen(false);
        setWizardStep(0);
        form.resetFields();
        fetchVouchers();
      }
    } catch (error) {
      if (error.response?.data?.error === 'DUPLICATE_CODE') {
        message.error('A voucher with this code already exists');
      } else {
        message.error('Failed to create voucher');
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
        message.success('Voucher updated successfully');
        setIsCreateModalOpen(false);
        setIsEditing(false);
        setWizardStep(0);
        form.resetFields();
        fetchVouchers();
      }
    } catch (error) {
      message.error('Failed to update voucher');
    }
  };

  // Delete voucher
  const handleDeleteVoucher = async (id) => {
    try {
      await api.delete(`/vouchers/${id}`);
      message.success('Voucher deactivated');
      fetchVouchers();
    } catch (error) {
      message.error('Failed to delete voucher');
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
        message.success(`Generated ${response.data.count} voucher codes`);
        setIsBulkModalOpen(false);
        bulkForm.resetFields();
        fetchVouchers();
      }
    } catch (error) {
      message.error('Failed to generate vouchers');
    }
  };

  // Copy code to clipboard
  const copyCode = (code) => {
    navigator.clipboard.writeText(code);
    message.success('Code copied to clipboard');
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
  const columns = [
    {
      title: 'Code',
      dataIndex: 'code',
      key: 'code',
      width: 150,
      render: (code, record) => (
        <Space>
          <Tag color={record.is_active ? 'blue' : 'default'} style={{ fontFamily: 'monospace', fontSize: 13 }}>
            {code}
          </Tag>
          <Tooltip title="Copy code">
            <Button type="text" size="small" icon={<CopyOutlined />} onClick={() => copyCode(code)} />
          </Tooltip>
        </Space>
      )
    },
    {
      title: 'Name',
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
      title: 'Type',
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
      title: 'Value',
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
      title: 'Usage',
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
      title: 'Validity',
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
                Until: {formatDate(validUntil)}
              </Text>
            )}
          </div>
        );
      }
    },
    {
      title: 'Status',
      dataIndex: 'is_active',
      key: 'is_active',
      width: 80,
      render: (isActive) => (
        <Tag color={isActive ? 'green' : 'default'}>{isActive ? 'Active' : 'Inactive'}</Tag>
      )
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 120,
      fixed: 'right',
      render: (_, record) => (
        <Space size="small">
          <Tooltip title="View Details">
            <Button type="text" size="small" icon={<EyeOutlined />} onClick={() => openViewDrawer(record)} />
          </Tooltip>
          <Tooltip title="Edit">
            <Button type="text" size="small" icon={<EditOutlined />} onClick={() => openEditModal(record)} />
          </Tooltip>
          <Popconfirm
            title="Deactivate this voucher?"
            description="Users will no longer be able to use this code."
            onConfirm={() => handleDeleteVoucher(record.id)}
            okText="Deactivate"
            cancelText="Cancel"
          >
            <Tooltip title="Deactivate">
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
      title: 'User',
      key: 'user',
      render: (_, record) => `${record.first_name} ${record.last_name}`
    },
    {
      title: 'Email',
      dataIndex: 'email',
      key: 'email'
    },
    {
      title: 'Original Amount',
      dataIndex: 'original_amount',
      key: 'original_amount',
      render: (val, record) => `${val} ${record.currency}`
    },
    {
      title: 'Discount Applied',
      dataIndex: 'discount_applied',
      key: 'discount_applied',
      render: (val, record) => <Text type="success">-{val} {record.currency}</Text>
    },
    {
      title: 'Reference',
      key: 'reference',
      render: (_, record) => (
        <Tag>{record.reference_type}: {record.reference_id?.slice(0, 8)}...</Tag>
      )
    },
    {
      title: 'Date',
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
               <div>Valid Until:</div>
               <div className="text-slate-700 font-medium">{formatDate(record.valid_until)}</div>
             </div>
             <div>
               <div>Usage:</div>
               <div className="text-slate-700 font-medium">{record.total_uses || 0} / {record.max_total_uses || '∞'}</div>
             </div>
         </div>
         
         <div className="flex justify-end gap-2 border-t pt-2">
            <Button size="small" icon={<EyeOutlined />} onClick={() => openViewDrawer(record)} />
            <Button size="small" icon={<EditOutlined />} onClick={() => openEditModal(record)} />
            <Popconfirm
              title="Deactivate?"
              onConfirm={() => handleDeleteVoucher(record.id)}
            >
              <Button size="small" danger icon={<DeleteOutlined />} />
            </Popconfirm>
         </div>
      </Card>
    );
  };

  return (
    <div style={{ padding: 24 }}>
      <Row justify="space-between" align="middle" style={{ marginBottom: 24 }}>
        <Col>
          <Title level={2} style={{ margin: 0 }}>
            <GiftOutlined style={{ marginRight: 12 }} />
            Voucher Management
          </Title>
          <Text type="secondary">Create and manage discount codes, gift vouchers, and promotional offers</Text>
        </Col>
        <Col>
          <Space>
            <Button icon={<ReloadOutlined />} onClick={fetchVouchers}>Refresh</Button>
            <Button onClick={() => setIsBulkModalOpen(true)}>Bulk Generate</Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => {
              setIsEditing(false);
              setSelectedVoucher(null);
              setWizardStep(0);
              form.resetFields();
              setIsCreateModalOpen(true);
            }}>
              Create Voucher
            </Button>
          </Space>
        </Col>
      </Row>

      {/* Statistics */}
      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col span={6}>
          <Card>
            <Statistic title="Total Vouchers" value={stats.totalVouchers} prefix={<TagOutlined />} />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic title="Active Vouchers" value={stats.activeVouchers} valueStyle={{ color: '#3f8600' }} />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic title="Total Redemptions" value={stats.totalRedemptions} />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic title="Total Discount Given" value={stats.totalDiscountGiven} prefix="€" precision={2} />
          </Card>
        </Col>
      </Row>

      {/* Filters */}
      <Card style={{ marginBottom: 16 }}>
        <Row gutter={16}>
          <Col span={8}>
            <Input
              placeholder="Search by code or name..."
              value={filters.search}
              onChange={(e) => setFilters(prev => ({ ...prev, search: e.target.value }))}
              allowClear
            />
          </Col>
          <Col span={6}>
            <Select
              placeholder="Filter by type"
              value={filters.voucher_type}
              onChange={(value) => setFilters(prev => ({ ...prev, voucher_type: value }))}
              allowClear
              style={{ width: '100%' }}
            >
              {Object.entries(VOUCHER_TYPES).map(([key, config]) => (
                <Select.Option key={key} value={key}>{config.label}</Select.Option>
              ))}
            </Select>
          </Col>
          <Col span={6}>
            <Select
              placeholder="Status"
              value={filters.is_active}
              onChange={(value) => setFilters(prev => ({ ...prev, is_active: value }))}
              style={{ width: '100%' }}
            >
              <Select.Option value="active">Active Only</Select.Option>
              <Select.Option value="inactive">Inactive Only</Select.Option>
              <Select.Option value="all">All</Select.Option>
            </Select>
          </Col>
        </Row>
      </Card>

      {/* Vouchers Table */}
      <UnifiedResponsiveTable
        columns={columns}
        dataSource={vouchers}
        rowKey="id"
        loading={loading}
        pagination={{
            ...pagination,
            showSizeChanger: true,
            showTotal: (total) => `Total ${total} vouchers`
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
            {isEditing ? '✏️ Edit Voucher' : '🎁 Create Voucher'}
          </Title>
          <Text type="secondary">
            {isEditing 
              ? 'Update voucher settings' 
              : 'Set up a new discount code in a few easy steps'}
          </Text>
        </div>

        {!isEditing && (
          <Steps
            current={wizardStep}
            size="small"
            style={{ marginBottom: 28 }}
            items={[
              { title: 'Type' },
              { title: 'Value & Scope' },
              { title: 'Rules' },
              { title: 'Code & Review' },
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
                  What kind of voucher do you want to create?
                </Text>
              )}
              
              <Form.Item name="voucher_type" label={isEditing ? 'Voucher Type' : undefined} rules={[{ required: true }]} style={isEditing ? {} : { marginBottom: 0 }}>
                {isEditing ? (
                  <Select>
                    {Object.entries(VOUCHER_TYPES).map(([key, config]) => (
                      <Select.Option key={key} value={key}>
                        {config.icon} {config.label}
                      </Select.Option>
                    ))}
                  </Select>
                ) : (
                  <VoucherTypeCards />
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
                        {vType === 'percentage' && '💰 How much percent off?'}
                        {vType === 'fixed_amount' && '💰 How much off the total?'}
                        {vType === 'wallet_credit' && '💰 How much wallet credit?'}
                        {vType === 'free_service' && '🎁 Free service details'}
                        {vType === 'package_upgrade' && '⬆️ Package upgrade details'}
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
                            label={isPercentage ? 'Percentage (%)' : vType === 'wallet_credit' ? 'Credit Amount' : 'Discount Amount'}
                            rules={[{ required: true, type: 'number', min: 0.01, message: 'Enter a value' }]}
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
                            <Form.Item name="currency" label="Currency">
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
                            <Form.Item name="currency" label="Currency">
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
                        <Form.Item name="max_discount" label="Maximum Discount Cap" extra="Optional — limits the discount for high-value orders">
                          <InputNumber style={{ width: '100%' }} min={0} placeholder="No cap" />
                        </Form.Item>
                      )}

                      <Form.Item name="min_purchase_amount" label="Minimum Purchase Amount" extra="Customer must spend at least this much to use the code">
                        <InputNumber style={{ width: '100%' }} min={0} placeholder="No minimum" />
                      </Form.Item>
                    </>
                  );
                }}
              </Form.Item>

              <Divider style={{ margin: '16px 0' }} />

              <Text strong style={{ display: 'block', marginBottom: 12, fontSize: 14 }}>
                Where can this voucher be used?
              </Text>

              <Form.Item name="applies_to" rules={[{ required: true }]}>
                {isEditing ? (
                  <Select>
                    {APPLIES_TO_OPTIONS.map(opt => (
                      <Select.Option key={opt.value} value={opt.value}>{opt.icon} {opt.label}</Select.Option>
                    ))}
                  </Select>
                ) : (
                  <AppliesToCards />
                )}
              </Form.Item>
            </div>

          {isEditing && <Divider style={{ margin: '12px 0' }} />}

          {/* ====== STEP 2: Rules & Limits ====== */}
            <div style={{ display: (isEditing || wizardStep === 2) ? 'block' : 'none' }}>
              {!isEditing && (
                <Text strong style={{ display: 'block', marginBottom: 16, fontSize: 15 }}>
                  📋 Set usage rules and restrictions
                </Text>
              )}

              <Text strong style={{ display: 'block', marginBottom: 8, fontSize: 13 }}>Usage Limits</Text>

              <Form.Item name="usage_type" label="How many times can this be used?">
                <Select size="large">
                  {USAGE_TYPE_OPTIONS.map(opt => (
                    <Select.Option key={opt.value} value={opt.value}>{opt.label}</Select.Option>
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
                          <Form.Item name="max_total_uses" label="Max Total Uses" rules={[{ required: true, type: 'number', min: 1 }]}>
                            <InputNumber style={{ width: '100%' }} min={1} placeholder="e.g., 100" />
                          </Form.Item>
                        </Col>
                      )}
                      {showMaxPerUser && (
                        <Col span={showMaxTotal ? 12 : 24}>
                          <Form.Item name="max_uses_per_user" label="Max Uses Per User">
                            <InputNumber style={{ width: '100%' }} min={1} />
                          </Form.Item>
                        </Col>
                      )}
                    </Row>
                  );
                }}
              </Form.Item>

              <Divider style={{ margin: '16px 0' }} />
              <Text strong style={{ display: 'block', marginBottom: 8, fontSize: 13 }}>Validity Period</Text>

              <Form.Item name="validDates" label="Valid Date Range" extra="Leave empty for no time restriction">
                <RangePicker 
                  showTime 
                  style={{ width: '100%' }}
                  size="large"
                  placeholder={['Start Date', 'End Date']}
                />
              </Form.Item>

              <Divider style={{ margin: '16px 0' }} />
              <Text strong style={{ display: 'block', marginBottom: 8, fontSize: 13 }}>Access Control</Text>

              <Form.Item name="visibility" label="Who can use this voucher?">
                <Select size="large">
                  {VISIBILITY_OPTIONS.map(opt => (
                    <Select.Option key={opt.value} value={opt.value}>{opt.label}</Select.Option>
                  ))}
                </Select>
              </Form.Item>

              <Row gutter={16}>
                <Col span={8}>
                  <Form.Item name="requires_first_purchase" valuePropName="checked" label="First Purchase Only">
                    <Switch />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item name="can_combine" valuePropName="checked" label="Can Combine">
                    <Switch />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item name="is_active" valuePropName="checked" label="Active on Create">
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
                  🏷️ Name your voucher and review
                </Text>
              )}

              <Row gutter={16}>
                <Col span={12}>
                  <Form.Item
                    name="code"
                    label="Voucher Code"
                    rules={[
                      { required: !isEditing, message: 'Code is required' },
                      { min: 3, message: 'Min 3 characters' },
                      { max: 50, message: 'Max 50 characters' },
                      { pattern: /^[A-Za-z0-9_-]+$/, message: 'Only letters, numbers, - and _' }
                    ]}
                    extra="Customers type this code at checkout"
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
                    label="Display Name"
                    rules={[{ required: true, message: 'Name is required' }]}
                    extra="Internal name (shown to customer on apply)"
                  >
                    <Input placeholder="e.g., Summer Sale 20% Off" size="large" />
                  </Form.Item>
                </Col>
              </Row>

              <Form.Item name="description" label="Internal Description">
                <TextArea rows={2} placeholder="Optional notes about this voucher" />
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
                    const scopeOpt = APPLIES_TO_OPTIONS.find(o => o.value === appliesTo);
                    const usageOpt = USAGE_TYPE_OPTIONS.find(o => o.value === usageType);

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
                          <Text strong style={{ fontSize: 14 }}>Review Summary</Text>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 24px' }}>
                          <div>
                            <Text type="secondary" style={{ fontSize: 11 }}>TYPE</Text>
                            <div>
                              <Tag color={config?.color}>{config?.icon} {config?.label}</Tag>
                            </div>
                          </div>
                          <div>
                            <Text type="secondary" style={{ fontSize: 11 }}>VALUE</Text>
                            <div>
                              <Text strong style={{ fontSize: 16 }}>
                                {vType === 'percentage' ? `${value}%` : `${value} ${currency}`}
                              </Text>
                              {maxDiscount && <Text type="secondary"> (max {maxDiscount} {currency})</Text>}
                            </div>
                          </div>
                          <div>
                            <Text type="secondary" style={{ fontSize: 11 }}>APPLIES TO</Text>
                            <div><Text>{scopeOpt?.icon} {scopeOpt?.label}</Text></div>
                          </div>
                          <div>
                            <Text type="secondary" style={{ fontSize: 11 }}>USAGE</Text>
                            <div><Text>{usageOpt?.label}</Text></div>
                          </div>
                          {minPurchase > 0 && (
                            <div>
                              <Text type="secondary" style={{ fontSize: 11 }}>MIN PURCHASE</Text>
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
                Back
              </Button>
            )}
            
            <Space>
              <Button onClick={() => {
                setIsCreateModalOpen(false);
                setIsEditing(false);
                setWizardStep(0);
                form.resetFields();
              }}>
                Cancel
              </Button>

              {isEditing ? (
                <Button type="primary" htmlType="submit">
                  Update Voucher
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
                  {wizardStep === 2 ? 'Review' : 'Next'}
                </Button>
              ) : (
                <Button type="primary" htmlType="submit" icon={<CheckCircleOutlined />} size="large">
                  Create Voucher
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
          <Title level={4} style={{ margin: 0, marginBottom: 4 }}>📦 Bulk Generate Codes</Title>
          <Text type="secondary">Generate multiple unique voucher codes with the same settings</Text>
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
                label="Number of Codes"
                rules={[{ required: true, type: 'number', min: 1, max: 1000 }]}
              >
                <InputNumber style={{ width: '100%' }} min={1} max={1000} size="large" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="prefix" label="Code Prefix" extra="e.g., GIFT → GIFT-A1B2C3">
                <Input placeholder="e.g., GIFT" maxLength={10} style={{ textTransform: 'uppercase', fontFamily: 'monospace' }} size="large" />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item
            name="name"
            label="Voucher Name"
            rules={[{ required: true }]}
          >
            <Input placeholder="e.g., Holiday Gift Voucher" size="large" />
          </Form.Item>

          <Row gutter={16}>
            <Col span={8}>
              <Form.Item name="voucher_type" label="Type" rules={[{ required: true }]}>
                <Select>
                  {Object.entries(VOUCHER_TYPES).map(([key, config]) => (
                    <Select.Option key={key} value={key}>{config.icon} {config.label}</Select.Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="discount_value" label="Value" rules={[{ required: true, type: 'number', min: 0.01 }]}>
                <InputNumber style={{ width: '100%' }} min={0.01} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="applies_to" label="Scope">
                <Select>
                  {APPLIES_TO_OPTIONS.map(opt => (
                    <Select.Option key={opt.value} value={opt.value}>{opt.icon} {opt.label}</Select.Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
          </Row>

          <Form.Item name="validDates" label="Valid Date Range" extra="Leave empty for no time restriction">
            <RangePicker showTime style={{ width: '100%' }} placeholder={['Start Date', 'End Date']} />
          </Form.Item>

          <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: 16, borderTop: '1px solid #f0f0f0' }}>
            <Space>
              <Button onClick={() => {
                setIsBulkModalOpen(false);
                bulkForm.resetFields();
              }}>
                Cancel
              </Button>
              <Button type="primary" htmlType="submit">
                Generate Codes
              </Button>
            </Space>
          </div>
        </Form>
      </Modal>

      {/* View Details Drawer */}
      <Drawer
        title={`Voucher Details: ${selectedVoucher?.code || ''}`}
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
            <Card title="Voucher Information" style={{ marginBottom: 16 }}>
              <Row gutter={[16, 16]}>
                <Col span={12}>
                  <Text type="secondary">Code</Text>
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
                  <Text type="secondary">Status</Text>
                  <div>
                    <Tag color={selectedVoucher.is_active ? 'green' : 'red'}>
                      {selectedVoucher.is_active ? 'Active' : 'Inactive'}
                    </Tag>
                  </div>
                </Col>
                <Col span={12}>
                  <Text type="secondary">Type</Text>
                  <div>
                    <Tag color={VOUCHER_TYPES[selectedVoucher.voucher_type]?.color}>
                      {VOUCHER_TYPES[selectedVoucher.voucher_type]?.label}
                    </Tag>
                  </div>
                </Col>
                <Col span={12}>
                  <Text type="secondary">Value</Text>
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
                  <Text type="secondary">Usage</Text>
                  <div>
                    <Text strong>
                      {selectedVoucher.total_uses || 0} / {selectedVoucher.max_total_uses || '∞'}
                    </Text>
                  </div>
                </Col>
                <Col span={12}>
                  <Text type="secondary">Applies To</Text>
                  <div>
                    <Text>{APPLIES_TO_OPTIONS.find(o => o.value === selectedVoucher.applies_to)?.label}</Text>
                  </div>
                </Col>
                <Col span={12}>
                  <Text type="secondary">Valid From</Text>
                  <div><Text>{formatDate(selectedVoucher.valid_from)}</Text></div>
                </Col>
                <Col span={12}>
                  <Text type="secondary">Valid Until</Text>
                  <div><Text>{formatDate(selectedVoucher.valid_until)}</Text></div>
                </Col>
                <Col span={24}>
                  <Text type="secondary">Created</Text>
                  <div>
                    <Text>
                      {formatDate(selectedVoucher.created_at)}
                      {selectedVoucher.created_by_name && ` by ${selectedVoucher.created_by_name}`}
                    </Text>
                  </div>
                </Col>
              </Row>
            </Card>

            <Card title="Redemption History">
              <Table
                columns={redemptionColumns}
                dataSource={redemptions}
                rowKey="id"
                loading={redemptionsLoading}
                pagination={false}
                size="small"
                locale={{ emptyText: 'No redemptions yet' }}
              />
            </Card>
          </>
        )}
      </Drawer>
    </div>
  );
};

export default VoucherManagement;
