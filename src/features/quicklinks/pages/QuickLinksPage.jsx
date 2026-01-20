import { useState, useEffect, useCallback } from 'react';
import {
  Card,
  Table,
  Button,
  Modal,
  Form,
  Input,
  Select,
  Switch,
  DatePicker,
  InputNumber,
  Space,
  Tag,
  Tooltip,
  Popconfirm,
  Typography,
  Row,
  Col,
  Empty,
  Alert,
  Divider,
  Badge
} from 'antd';
import { message } from '@/shared/utils/antdStatic';
import {
  PlusOutlined,
  LinkOutlined,
  CopyOutlined,
  DeleteOutlined,
  EditOutlined,
  ReloadOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  CloseCircleOutlined,
  HomeOutlined,
  BookOutlined,
  ShoppingCartOutlined,
  CarOutlined,
  EyeOutlined,
  ExclamationCircleOutlined,
  WhatsAppOutlined,
  PhoneOutlined,
  MailOutlined,
  UserAddOutlined
} from '@ant-design/icons';
import dayjs from 'dayjs';
import * as quickLinksService from '../services/quickLinksService';

const { Text } = Typography;
const { Option } = Select;
const { TextArea } = Input;

const SERVICE_TYPES = [
  { value: 'accommodation', label: 'Accommodation', icon: <HomeOutlined />, color: 'blue' },
  { value: 'lesson', label: 'Lessons', icon: <BookOutlined />, color: 'green' },
  { value: 'rental', label: 'Rentals', icon: <CarOutlined />, color: 'orange' },
  { value: 'shop', label: 'Shop', icon: <ShoppingCartOutlined />, color: 'purple' }
];

const QuickLinksPage = () => {
  const [links, setLinks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingLink, setEditingLink] = useState(null);
  const [allRegistrations, setAllRegistrations] = useState([]);
  const [registrationsLoading, setRegistrationsLoading] = useState(false);
  const [form] = Form.useForm();
  
  // New state for success modal
  const [successModal, setSuccessModal] = useState({ visible: false, link: null });

  const fetchLinks = useCallback(async () => {
    setLoading(true);
    try {
      const data = await quickLinksService.getQuickLinks();
      setLinks(data || []);
    } catch {
      message.error('Failed to load quick links');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchAllRegistrations = useCallback(async (linksList) => {
    if (!linksList || linksList.length === 0) {
      setAllRegistrations([]);
      return;
    }
    setRegistrationsLoading(true);
    try {
      const allRegs = [];
      for (const link of linksList) {
        try {
          const regs = await quickLinksService.getRegistrations(link.id);
          if (regs && regs.length > 0) {
            allRegs.push(...regs.map(r => ({
              ...r,
              link_name: link.name,
              link_code: link.link_code
            })));
          }
        } catch {
          // Skip failed fetches for individual links
        }
      }
      setAllRegistrations(allRegs);
    } catch {
      // Silently fail
    } finally {
      setRegistrationsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLinks();
  }, [fetchLinks]);

  useEffect(() => {
    if (links.length > 0) {
      fetchAllRegistrations(links);
    }
  }, [links, fetchAllRegistrations]);

  const handleCreate = () => {
    setEditingLink(null);
    form.resetFields();
    form.setFieldsValue({ is_active: true }); // Default to active
    setModalVisible(true);
  };

  const handleEdit = (record) => {
    setEditingLink(record);
    form.setFieldsValue({
      ...record,
      expires_at: record.expires_at ? dayjs(record.expires_at) : null
    });
    setModalVisible(true);
  };

  const handleSubmit = async (values) => {
    try {
      const data = {
        ...values,
        expires_at: values.expires_at ? values.expires_at.toISOString() : null,
        is_active: values.is_active !== false // Default to true
      };

      if (editingLink) {
        await quickLinksService.updateQuickLink(editingLink.id, data);
        message.success('Quick link updated successfully');
        setModalVisible(false);
      } else {
        const newLink = await quickLinksService.createQuickLink(data);
        setModalVisible(false);
        // Show success modal with the new link details
        setSuccessModal({ visible: true, link: newLink });
      }
      
      fetchLinks();
    } catch (error) {
      message.error(error.response?.data?.error || 'Operation failed');
    }
  };

  const handleDelete = async (id) => {
    try {
      await quickLinksService.deleteQuickLink(id);
      message.success('Quick link deleted');
      fetchLinks();
    } catch {
      message.error('Failed to delete quick link');
    }
  };

  const handleToggleActive = async (record) => {
    try {
      await quickLinksService.updateQuickLink(record.id, { is_active: !record.is_active });
      message.success(`Link ${record.is_active ? 'deactivated' : 'activated'}`);
      fetchLinks();
    } catch {
      message.error('Failed to update link status');
    }
  };

  const handleUpdateRegistration = async (id, status) => {
    try {
      await quickLinksService.updateRegistration(id, { status });
      message.success('Registration updated');
      fetchLinks();
    } catch {
      message.error('Failed to update registration');
    }
  };

  const handleCreateAccount = async (registration) => {
    Modal.confirm({
      title: 'Create User Account',
      icon: <UserAddOutlined style={{ color: '#1890ff' }} />,
      content: (
        <div>
          <p>Create an account for <strong>{registration.first_name} {registration.last_name}</strong>?</p>
          <p className="text-gray-500 text-sm mt-2">
            Email: {registration.email}<br/>
            Preferred Contact: {registration.additional_data?.contact_preference || 'email'}
          </p>
          <Alert 
            type="info" 
            className="mt-3"
            message="A temporary password will be generated. You'll need to share the login credentials with the user via their preferred contact method."
            showIcon
          />
        </div>
      ),
      okText: 'Create Account',
      cancelText: 'Cancel',
      onOk: async () => {
        try {
          const result = await quickLinksService.createAccountFromRegistration(registration.id);
          
          if (result.userCreated) {
            Modal.success({
              title: 'Account Created Successfully!',
              content: (
                <div>
                  <p>User account has been created for <strong>{registration.email}</strong></p>
                  <Alert
                    type="warning"
                    className="mt-3"
                    message="Temporary Password"
                    description={
                      <div>
                        <code className="bg-gray-100 px-2 py-1 rounded block mt-1 text-lg font-mono">
                          {result.tempPassword}
                        </code>
                        <p className="text-xs mt-2 text-gray-500">
                          Please share this with the user via their preferred contact method ({result.contactPreference}).
                          They should change this password after first login.
                        </p>
                      </div>
                    }
                    showIcon
                  />
                </div>
              ),
              okText: 'Got it',
              width: 500
            });
          } else {
            message.info(result.message);
          }
          
          fetchAllRegistrations(links);
        } catch (error) {
          message.error(error.response?.data?.error || 'Failed to create account');
        }
      }
    });
  };

  const getPublicUrl = (linkCode) => `${window.location.origin}/quick/${linkCode}`;


  const copyLink = (linkCode) => {
    const url = getPublicUrl(linkCode);
    navigator.clipboard.writeText(url);
    message.success('Link copied to clipboard!');
  };

  const openPreview = (linkCode) => {
    window.open(getPublicUrl(linkCode), '_blank');
  };

  const getServiceTypeConfig = (type) => {
    return SERVICE_TYPES.find(s => s.value === type) || SERVICE_TYPES[0];
  };

  // Check if link is valid (active, not expired, not maxed out)
  const isLinkValid = (link) => {
    if (!link.is_active) return { valid: false, reason: 'Inactive' };
    if (link.expires_at && dayjs(link.expires_at).isBefore(dayjs())) {
      return { valid: false, reason: 'Expired' };
    }
    if (link.max_uses && link.use_count >= link.max_uses) {
      return { valid: false, reason: 'Max uses reached' };
    }
    return { valid: true, reason: 'Active' };
  };

  // Active Links Table Columns
  const columns = [
    {
      title: 'Link',
      key: 'link_info',
      width: 280,
      render: (_, record) => {
        const validity = isLinkValid(record);
        const config = getServiceTypeConfig(record.service_type);
        return (
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Badge status={validity.valid ? 'success' : 'error'} />
              <Text strong>{record.name}</Text>
            </div>
            {record.description && (
              <Text type="secondary" className="text-xs block">{record.description}</Text>
            )}
            <div className="flex items-center gap-2 mt-1">
              <Tag color={config.color} icon={config.icon} className="text-xs">
                {config.label}
              </Tag>
              <code className="bg-blue-50 text-blue-600 px-2 py-0.5 rounded text-xs font-mono">
                {record.link_code}
              </code>
            </div>
          </div>
        );
      }
    },
    {
      title: 'Status',
      key: 'status',
      width: 120,
      render: (_, record) => {
        const validity = isLinkValid(record);
        return (
          <div className="space-y-1">
            <Switch
              checked={record.is_active}
              onChange={() => handleToggleActive(record)}
              checkedChildren="ON"
              unCheckedChildren="OFF"
              size="small"
            />
            {!validity.valid && (
              <div>
                <Tag color="red" className="text-xs">{validity.reason}</Tag>
              </div>
            )}
          </div>
        );
      }
    },
    {
      title: 'Usage',
      key: 'usage',
      width: 100,
      render: (_, record) => (
        <div className="text-center">
          <div className="text-lg font-bold text-purple-600">
            {record.registration_count || 0}
          </div>
          <Text type="secondary" className="text-xs">
            {record.max_uses ? `/ ${record.max_uses}` : 'unlimited'}
          </Text>
        </div>
      )
    },
    {
      title: 'Expires',
      dataIndex: 'expires_at',
      key: 'expires_at',
      width: 110,
      render: (date) => {
        if (!date) return <Text type="secondary">Never</Text>;
        const isExpired = dayjs(date).isBefore(dayjs());
        return (
          <Text type={isExpired ? 'danger' : 'secondary'}>
            {dayjs(date).format('MMM D, YYYY')}
          </Text>
        );
      }
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 160,
      render: (_, record) => {
        const validity = isLinkValid(record);
        return (
          <Space size={4}>
            <Tooltip title="Copy link">
              <Button
                type="text"
                size="small"
                icon={<CopyOutlined />}
                onClick={() => copyLink(record.link_code)}
              />
            </Tooltip>
            <Tooltip title={validity.valid ? 'Preview' : 'Link not active'}>
              <Button
                type="text"
                size="small"
                icon={<EyeOutlined />}
                onClick={() => openPreview(record.link_code)}
                disabled={!validity.valid}
              />
            </Tooltip>
            <Tooltip title="Edit">
              <Button
                type="text"
                size="small"
                icon={<EditOutlined />}
                onClick={() => handleEdit(record)}
              />
            </Tooltip>
            <Popconfirm
              title="Delete this quick link?"
              description="All registrations will also be deleted."
              onConfirm={() => handleDelete(record.id)}
              okText="Delete"
              cancelText="Cancel"
              okButtonProps={{ danger: true }}
            >
              <Button type="text" size="small" danger icon={<DeleteOutlined />} />
            </Popconfirm>
          </Space>
        );
      }
    }
  ];

  // Get contact preference display
  const getContactPreference = (record) => {
    const additionalData = record.additional_data || {};
    const pref = additionalData.contact_preference;
    const config = {
      whatsapp: { icon: <WhatsAppOutlined />, color: 'green', label: 'WhatsApp' },
      phone: { icon: <PhoneOutlined />, color: 'blue', label: 'Phone' },
      email: { icon: <MailOutlined />, color: 'purple', label: 'Email' }
    };
    return config[pref] || null;
  };

  // Registrations Table Columns
  const registrationColumns = [
    {
      title: 'Customer',
      key: 'customer',
      render: (_, record) => (
        <div>
          <div className="flex items-center gap-2">
            <Text strong>{record.first_name} {record.last_name}</Text>
            {record.user_id && (
              <Tooltip title="Account created">
                <UserAddOutlined className="text-green-500" />
              </Tooltip>
            )}
          </div>
          <div className="text-xs text-gray-500">{record.email}</div>
          {record.phone && <div className="text-xs text-gray-400">{record.phone}</div>}
        </div>
      )
    },
    {
      title: 'Preferred Contact',
      key: 'contact_preference',
      width: 130,
      render: (_, record) => {
        const pref = getContactPreference(record);
        if (!pref) return <Text type="secondary">-</Text>;
        return (
          <Tag color={pref.color} icon={pref.icon}>
            {pref.label}
          </Tag>
        );
      }
    },
    {
      title: 'From Link',
      key: 'link_name',
      render: (_, record) => (
        <div>
          <Text>{record.link_name}</Text>
          <div>
            <code className="text-xs text-gray-400">{record.link_code}</code>
          </div>
        </div>
      )
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 110,
      render: (status) => {
        const config = {
          pending: { color: 'orange', icon: <ClockCircleOutlined /> },
          confirmed: { color: 'green', icon: <CheckCircleOutlined /> },
          cancelled: { color: 'red', icon: <CloseCircleOutlined /> }
        };
        const c = config[status] || config.pending;
        return <Tag color={c.color} icon={c.icon}>{status?.toUpperCase()}</Tag>;
      }
    },
    {
      title: 'Date',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 100,
      render: (date) => (
        <Text type="secondary" className="text-xs">
          {dayjs(date).format('MMM D, HH:mm')}
        </Text>
      )
    },
    {
      title: 'Action',
      key: 'actions',
      width: 200,
      render: (_, record) => (
        <Space size="small">
          <Select
            size="small"
            value={record.status}
            style={{ width: 100 }}
            onChange={(value) => handleUpdateRegistration(record.id, value)}
          >
            <Option value="pending">Pending</Option>
            <Option value="confirmed">Confirm</Option>
            <Option value="cancelled">Cancel</Option>
          </Select>
          {!record.user_id && (
            <Tooltip title="Create user account">
              <Button
                size="small"
                type="primary"
                icon={<UserAddOutlined />}
                onClick={() => handleCreateAccount(record)}
              />
            </Tooltip>
          )}
        </Space>
      )
    }
  ];

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Header */}
      <div className="overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 p-6 text-white shadow-lg">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold uppercase tracking-wider">
              <LinkOutlined /> Quick Links
            </div>
            <h1 className="text-3xl font-semibold">Shareable Booking Links</h1>
            <p className="text-sm text-white/75">
              Create links that customers can use to register for your services without logging in
            </p>
          </div>
          <div className="flex gap-3">
            <Button
              icon={<ReloadOutlined />}
              onClick={fetchLinks}
              className="h-11 rounded-2xl bg-white/20 text-white border-white/30 hover:bg-white/30"
            >
              Refresh
            </Button>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={handleCreate}
              className="h-11 rounded-2xl bg-white text-purple-600 border-0 shadow-lg hover:bg-slate-100"
            >
              Create Link
            </Button>
          </div>
        </div>
      </div>

      {/* How It Works */}
      <Alert
        message="How Quick Links Work"
        description={
          <div className="text-sm">
            <ol className="list-decimal list-inside space-y-1">
              <li><strong>Create a link</strong> - Choose a service type and set options</li>
              <li><strong>Share the URL</strong> - Send to customers via email, SMS, WhatsApp, or social media</li>
              <li><strong>Customers register</strong> - They fill out a simple form (no account needed)</li>
              <li><strong>Manage registrations</strong> - Review and confirm/cancel from this page</li>
            </ol>
          </div>
        }
        type="info"
        showIcon
        closable
        className="rounded-2xl"
      />

      {/* Stats Row */}
      <Row gutter={[16, 16]}>
        <Col xs={12} sm={6}>
          <Card className="rounded-2xl text-center border-0 shadow-sm">
            <div className="text-2xl font-bold text-purple-500">{links.length}</div>
            <Text type="secondary">Total Links</Text>
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card className="rounded-2xl text-center border-0 shadow-sm">
            <div className="text-2xl font-bold text-green-500">
              {links.filter(l => isLinkValid(l).valid).length}
            </div>
            <Text type="secondary">Active Links</Text>
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card className="rounded-2xl text-center border-0 shadow-sm">
            <div className="text-2xl font-bold text-blue-500">{allRegistrations.length}</div>
            <Text type="secondary">Total Registrations</Text>
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card className="rounded-2xl text-center border-0 shadow-sm">
            <div className="text-2xl font-bold text-orange-500">
              {allRegistrations.filter(r => r.status === 'pending').length}
            </div>
            <Text type="secondary">Pending</Text>
          </Card>
        </Col>
      </Row>

      {/* Two Tables Side by Side */}
      <Row gutter={[16, 16]}>
        {/* Links Table */}
        <Col xs={24} xl={14}>
          <Card
            className="rounded-2xl border-0 shadow-sm"
            title={
              <div className="flex items-center gap-2">
                <LinkOutlined className="text-purple-500" />
                <span>Your Quick Links</span>
                <Tag color="purple">{links.length}</Tag>
              </div>
            }
          >
            <Table
              columns={columns}
              dataSource={links}
              rowKey="id"
              loading={loading}
              pagination={{ pageSize: 10, showSizeChanger: false }}
              size="small"
              scroll={{ x: 700 }}
              locale={{
                emptyText: (
                  <Empty
                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                    description={
                      <div className="space-y-2">
                        <p>No quick links yet</p>
                        <p className="text-xs text-gray-400">
                          Create a link to let customers register for your services
                        </p>
                      </div>
                    }
                  >
                    <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>
                      Create Your First Link
                    </Button>
                  </Empty>
                )
              }}
            />
          </Card>
        </Col>

        {/* Registrations Table */}
        <Col xs={24} xl={10}>
          <Card
            className="rounded-2xl border-0 shadow-sm"
            title={
              <div className="flex items-center gap-2">
                <CheckCircleOutlined className="text-green-500" />
                <span>Customer Registrations</span>
                <Tag color="green">{allRegistrations.length}</Tag>
              </div>
            }
          >
            <Table
              columns={registrationColumns}
              dataSource={allRegistrations}
              rowKey="id"
              loading={registrationsLoading}
              pagination={{ pageSize: 10, showSizeChanger: false }}
              size="small"
              scroll={{ x: 500 }}
              locale={{
                emptyText: (
                  <Empty
                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                    description={
                      <div className="space-y-2">
                        <p>No registrations yet</p>
                        <p className="text-xs text-gray-400">
                          Share your links to start receiving registrations
                        </p>
                      </div>
                    }
                  />
                )
              }}
            />
          </Card>
        </Col>
      </Row>

      {/* Create/Edit Modal */}
      <Modal
        title={
          <div className="flex items-center gap-2">
            {editingLink ? <EditOutlined /> : <PlusOutlined />}
            {editingLink ? 'Edit Quick Link' : 'Create New Quick Link'}
          </div>
        }
        open={modalVisible}
        onCancel={() => setModalVisible(false)}
        footer={null}
        width={550}
        destroyOnClose
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleSubmit}
          initialValues={{ is_active: true }}
          className="mt-4"
        >
          <Form.Item
            name="name"
            label="Link Name"
            rules={[{ required: true, message: 'Please enter a name' }]}
            tooltip="Give your link a descriptive name (customers will see this)"
          >
            <Input placeholder="e.g., Summer Camp 2026, Weekend Rentals" />
          </Form.Item>

          <Form.Item
            name="description"
            label="Internal Description"
            tooltip="Notes for your team (customers won't see this)"
          >
            <TextArea rows={2} placeholder="Optional notes for your reference" />
          </Form.Item>

          <Form.Item
            name="service_type"
            label="Service Type"
            rules={[{ required: true, message: 'Please select a service type' }]}
          >
            <Select placeholder="What are customers registering for?">
              {SERVICE_TYPES.map(type => (
                <Option key={type.value} value={type.value}>
                  <Space>
                    {type.icon}
                    {type.label}
                  </Space>
                </Option>
              ))}
            </Select>
          </Form.Item>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="expires_at"
                label="Expiration Date"
                tooltip="After this date, the link won't work"
              >
                <DatePicker
                  className="w-full"
                  placeholder="Never expires"
                  disabledDate={(current) => current && current < dayjs().startOf('day')}
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="max_uses"
                label="Max Registrations"
                tooltip="Leave empty for unlimited"
              >
                <InputNumber
                  className="w-full"
                  min={1}
                  placeholder="Unlimited"
                />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item
            name="is_active"
            valuePropName="checked"
            className="mb-2"
          >
            <Switch checkedChildren="Link Active" unCheckedChildren="Link Inactive" defaultChecked />
          </Form.Item>
          
          <Alert
            message={editingLink ? "Changes will apply immediately" : "The link will be active immediately after creation"}
            type="info"
            showIcon
            className="mb-4"
          />

          <div className="flex justify-end gap-2">
            <Button onClick={() => setModalVisible(false)}>Cancel</Button>
            <Button type="primary" htmlType="submit" icon={editingLink ? <CheckCircleOutlined /> : <LinkOutlined />}>
              {editingLink ? 'Save Changes' : 'Create Link'}
            </Button>
          </div>
        </Form>
      </Modal>

      {/* Success Modal - Shows after creating a new link */}
      <Modal
        title={
          <div className="flex items-center gap-2 text-green-600">
            <CheckCircleOutlined />
            Link Created Successfully!
          </div>
        }
        open={successModal.visible}
        onCancel={() => setSuccessModal({ visible: false, link: null })}
        footer={
          <div className="flex justify-end gap-2">
            <Button onClick={() => setSuccessModal({ visible: false, link: null })}>
              Close
            </Button>
            <Button 
              type="primary"
              icon={<EyeOutlined />}
              onClick={() => {
                openPreview(successModal.link?.link_code);
                setSuccessModal({ visible: false, link: null });
              }}
            >
              Preview Link
            </Button>
          </div>
        }
        width={550}
      >
        {successModal.link && (
          <div className="space-y-4 py-2">
            <Alert
              message="Your quick link is ready to share!"
              description="Copy the link below and send it to customers via email, SMS, WhatsApp, or social media."
              type="success"
              showIcon
            />
            
            <div className="bg-gray-50 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <Text type="secondary">Link Name:</Text>
                <Text strong>{successModal.link.name}</Text>
              </div>
              <div className="flex items-center justify-between">
                <Text type="secondary">Service Type:</Text>
                <Tag color={getServiceTypeConfig(successModal.link.service_type).color}>
                  {getServiceTypeConfig(successModal.link.service_type).label}
                </Tag>
              </div>
              <div className="flex items-center justify-between">
                <Text type="secondary">Link Code:</Text>
                <code className="bg-blue-50 text-blue-600 px-2 py-1 rounded font-mono">
                  {successModal.link.link_code}
                </code>
              </div>
            </div>

            <Divider className="my-3">Shareable URL</Divider>

            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
              <div className="flex items-center gap-2">
                <Input
                  value={getPublicUrl(successModal.link.link_code)}
                  readOnly
                  className="flex-1 font-mono text-sm"
                />
                <Button
                  type="primary"
                  icon={<CopyOutlined />}
                  onClick={() => {
                    copyLink(successModal.link.link_code);
                  }}
                >
                  Copy
                </Button>
              </div>
              <Text type="secondary" className="text-xs mt-2 block">
                Anyone with this link can register for your {getServiceTypeConfig(successModal.link.service_type).label.toLowerCase()}
              </Text>
            </div>

            <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-3 flex items-start gap-2">
              <ExclamationCircleOutlined className="text-yellow-600 mt-0.5" />
              <div className="text-sm">
                <Text strong>Tip: </Text>
                <Text>Test the link yourself before sharing it with customers!</Text>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default QuickLinksPage;
