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
  Switch,
  Table,
  Tabs,
  Tag,
  Tooltip,
  Typography
} from 'antd';
import {
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
  { value: 'all', label: 'All Services' },
  { value: 'lessons', label: 'Lessons Only' },
  { value: 'rentals', label: 'Rentals Only' },
  { value: 'accommodation', label: 'Accommodation Only' },
  { value: 'packages', label: 'Packages Only' },
  { value: 'wallet', label: 'Wallet Deposits' }
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
        code: values.code.toUpperCase(),
        valid_from: values.validDates?.[0]?.toISOString(),
        valid_until: values.validDates?.[1]?.toISOString()
      };
      delete payload.validDates;
      
      const response = await api.post('/vouchers', payload);
      
      if (response.data.success) {
        message.success('Voucher created successfully');
        setIsCreateModalOpen(false);
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
      
      const response = await api.put(`/vouchers/${selectedVoucher.id}`, payload);
      
      if (response.data.success) {
        message.success('Voucher updated successfully');
        setIsCreateModalOpen(false);
        setIsEditing(false);
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
      <Card>
        <Table
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
          scroll={{ x: 1200 }}
        />
      </Card>

      {/* Create/Edit Modal */}
      <Modal
        title={isEditing ? 'Edit Voucher' : 'Create Voucher'}
        open={isCreateModalOpen}
        onCancel={() => {
          setIsCreateModalOpen(false);
          setIsEditing(false);
          form.resetFields();
        }}
        footer={null}
        width={700}
      >
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
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="code"
                label="Voucher Code"
                rules={[
                  { required: !isEditing, message: 'Code is required' },
                  { min: 3, message: 'Minimum 3 characters' },
                  { max: 50, message: 'Maximum 50 characters' }
                ]}
              >
                <Input 
                  placeholder="e.g., SUMMER20" 
                  style={{ textTransform: 'uppercase' }}
                  disabled={isEditing}
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="name"
                label="Display Name"
                rules={[{ required: true, message: 'Name is required' }]}
              >
                <Input placeholder="e.g., Summer Sale 20% Off" />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item name="description" label="Description">
            <TextArea rows={2} placeholder="Optional description for internal use" />
          </Form.Item>

          <Divider orientation="left">Discount Settings</Divider>

          <Row gutter={16}>
            <Col span={8}>
              <Form.Item
                name="voucher_type"
                label="Type"
                rules={[{ required: true }]}
              >
                <Select>
                  {Object.entries(VOUCHER_TYPES).map(([key, config]) => (
                    <Select.Option key={key} value={key}>
                      {config.icon} {config.label}
                    </Select.Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item
                name="discount_value"
                label="Value"
                rules={[{ required: true, type: 'number', min: 0 }]}
              >
                <InputNumber style={{ width: '100%' }} min={0} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="currency" label="Currency">
                <Select>
                  {CURRENCY_OPTIONS.map(opt => (
                    <Select.Option key={opt.value} value={opt.value}>{opt.label}</Select.Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="max_discount" label="Max Discount (for %)">
                <InputNumber 
                  style={{ width: '100%' }} 
                  min={0} 
                  placeholder="Leave empty for no cap"
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="min_purchase_amount" label="Minimum Purchase">
                <InputNumber 
                  style={{ width: '100%' }} 
                  min={0} 
                  placeholder="Leave empty for no minimum"
                />
              </Form.Item>
            </Col>
          </Row>

          <Divider orientation="left">Applicability</Divider>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="applies_to" label="Applies To">
                <Select>
                  {APPLIES_TO_OPTIONS.map(opt => (
                    <Select.Option key={opt.value} value={opt.value}>{opt.label}</Select.Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="visibility" label="Visibility">
                <Select>
                  {VISIBILITY_OPTIONS.map(opt => (
                    <Select.Option key={opt.value} value={opt.value}>{opt.label}</Select.Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
          </Row>

          <Divider orientation="left">Usage Limits</Divider>

          <Row gutter={16}>
            <Col span={8}>
              <Form.Item name="usage_type" label="Usage Type">
                <Select>
                  {USAGE_TYPE_OPTIONS.map(opt => (
                    <Select.Option key={opt.value} value={opt.value}>{opt.label}</Select.Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="max_total_uses" label="Max Total Uses">
                <InputNumber style={{ width: '100%' }} min={1} placeholder="Unlimited" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="max_uses_per_user" label="Max Per User">
                <InputNumber style={{ width: '100%' }} min={1} />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item name="validDates" label="Valid Date Range">
            <RangePicker 
              showTime 
              style={{ width: '100%' }}
              placeholder={['Start Date', 'End Date']}
            />
          </Form.Item>

          <Row gutter={16}>
            <Col span={8}>
              <Form.Item name="is_active" valuePropName="checked" label="Active">
                <Switch />
              </Form.Item>
            </Col>
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
          </Row>

          <Divider />

          <Row justify="end">
            <Space>
              <Button onClick={() => {
                setIsCreateModalOpen(false);
                setIsEditing(false);
                form.resetFields();
              }}>
                Cancel
              </Button>
              <Button type="primary" htmlType="submit">
                {isEditing ? 'Update' : 'Create'} Voucher
              </Button>
            </Space>
          </Row>
        </Form>
      </Modal>

      {/* Bulk Generate Modal */}
      <Modal
        title="Bulk Generate Voucher Codes"
        open={isBulkModalOpen}
        onCancel={() => {
          setIsBulkModalOpen(false);
          bulkForm.resetFields();
        }}
        footer={null}
        width={500}
      >
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
          <Form.Item
            name="count"
            label="Number of Codes"
            rules={[{ required: true, type: 'number', min: 1, max: 1000 }]}
          >
            <InputNumber style={{ width: '100%' }} min={1} max={1000} />
          </Form.Item>

          <Form.Item name="prefix" label="Code Prefix">
            <Input placeholder="e.g., GIFT" maxLength={10} style={{ textTransform: 'uppercase' }} />
          </Form.Item>

          <Form.Item
            name="name"
            label="Voucher Name"
            rules={[{ required: true }]}
          >
            <Input placeholder="e.g., Holiday Gift Voucher" />
          </Form.Item>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="voucher_type" label="Type" rules={[{ required: true }]}>
                <Select>
                  {Object.entries(VOUCHER_TYPES).map(([key, config]) => (
                    <Select.Option key={key} value={key}>{config.label}</Select.Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="discount_value" label="Value" rules={[{ required: true }]}>
                <InputNumber style={{ width: '100%' }} min={0} />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item name="validDates" label="Valid Date Range">
            <RangePicker showTime style={{ width: '100%' }} />
          </Form.Item>

          <Divider />

          <Row justify="end">
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
          </Row>
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
