/**
 * Forms List Page
 * Displays all form templates with management actions
 */

import { useState, useEffect, useCallback } from 'react';
import { 
  Card, 
  Table, 
  Button, 
  Input, 
  Select, 
  Space, 
  Tag, 
  Dropdown, 
  Modal, 
  message, 
  Typography,
  Row,
  Col,
  Statistic,
  Empty,
  Tooltip,
  Form
} from 'antd';
import { 
  PlusOutlined, 
  SearchOutlined, 
  EditOutlined, 
  CopyOutlined, 
  DeleteOutlined, 
  EyeOutlined,
  MoreOutlined,
  FormOutlined,
  BarChartOutlined,
  FileTextOutlined,
  InboxOutlined
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import * as formService from '../services/formService';
import { FORM_CATEGORIES } from '../constants/fieldTypes';

const { Title, Text } = Typography;
const { Search } = Input;

const FormsListPage = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [templates, setTemplates] = useState([]);
  const [pagination, setPagination] = useState({
    current: 1,
    pageSize: 20,
    total: 0,
    totalPages: 0
  });
  const [filters, setFilters] = useState({
    category: undefined,
    is_active: undefined,
    search: '',
  });
  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [duplicateModalVisible, setDuplicateModalVisible] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [selectedRowKeys, setSelectedRowKeys] = useState([]);
  const [bulkActionLoading, setBulkActionLoading] = useState(false);
  const [form] = Form.useForm();
  const [duplicateForm] = Form.useForm();

  // Fetch templates when filters or pagination change
  useEffect(() => {
    const fetchTemplates = async () => {
      try {
        setLoading(true);
        const result = await formService.getFormTemplates({
          ...filters,
          page: pagination.current,
          limit: pagination.pageSize
        });
        setTemplates(result.data);
        setPagination(prev => ({
          ...prev,
          total: result.total,
          totalPages: result.totalPages
        }));
      } catch (err) {
        message.error('Failed to load form templates');
        // eslint-disable-next-line no-console
        console.error('Error fetching templates:', err);
      } finally {
        setLoading(false);
      }
    };
    
    fetchTemplates();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters, pagination.current, pagination.pageSize]);

  // Manual fetch function for create/update operations
  const fetchTemplates = useCallback(async () => {
    try {
      setLoading(true);
      const result = await formService.getFormTemplates({
        ...filters,
        page: pagination.current,
        limit: pagination.pageSize
      });
      setTemplates(result.data);
      setPagination(prev => ({
        ...prev,
        total: result.total,
        totalPages: result.totalPages
      }));
    } catch (err) {
      message.error('Failed to load form templates');
      // eslint-disable-next-line no-console
      console.error('Error fetching templates:', err);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters, pagination.current, pagination.pageSize]);

  // Handle search
  const handleSearch = (value) => {
    setFilters(prev => ({ ...prev, search: value }));
    setPagination(prev => ({ ...prev, current: 1 })); // Reset to page 1 on search
    // Debounced search - handled by the filter change
  };

  // Create new template
  const handleCreate = async (values) => {
    try {
      const template = await formService.createFormTemplate({
        ...values,
        is_active: true,
      });
      message.success('Form template created');
      setCreateModalVisible(false);
      form.resetFields();
      navigate(`/forms/builder/${template.id}`);
    } catch (err) {
      message.error('Failed to create template');
      // eslint-disable-next-line no-console
      console.error('Error creating template:', err);
    }
  };

  // Duplicate template
  const handleDuplicate = async (values) => {
    try {
      await formService.duplicateFormTemplate(selectedTemplate.id, values.name);
      message.success('Form template duplicated');
      setDuplicateModalVisible(false);
      duplicateForm.resetFields();
      setSelectedTemplate(null);
      fetchTemplates();
    } catch (err) {
      message.error('Failed to duplicate template');
      // eslint-disable-next-line no-console
      console.error('Error duplicating template:', err);
    }
  };

  // Delete template
  const handleDelete = (template) => {
    Modal.confirm({
      title: 'Delete Form Template',
      content: `Are you sure you want to delete "${template.name}"? This action cannot be undone.`,
      okText: 'Delete',
      okType: 'danger',
      onOk: async () => {
        try {
          await formService.deleteFormTemplate(template.id);
          message.success('Form template deleted');
          fetchTemplates();
        } catch (deleteErr) {
          message.error(deleteErr.response?.data?.error || 'Failed to delete template');
        }
      },
    });
  };

  // Toggle active status
  const handleToggleActive = async (template) => {
    try {
      await formService.updateFormTemplate(template.id, { 
        is_active: !template.is_active 
      });
      message.success(`Form ${template.is_active ? 'deactivated' : 'activated'}`);
      fetchTemplates();
    } catch {
      message.error('Failed to update template');
    }
  };

  // Bulk activate selected forms
  const handleBulkActivate = async () => {
    if (selectedRowKeys.length === 0) return;
    
    Modal.confirm({
      title: 'Activate Forms',
      content: `Are you sure you want to activate ${selectedRowKeys.length} form(s)?`,
      onOk: async () => {
        try {
          setBulkActionLoading(true);
          await Promise.all(
            selectedRowKeys.map(id => 
              formService.updateFormTemplate(id, { is_active: true })
            )
          );
          message.success(`${selectedRowKeys.length} form(s) activated`);
          setSelectedRowKeys([]);
          fetchTemplates();
        } catch {
          message.error('Failed to activate some forms');
        } finally {
          setBulkActionLoading(false);
        }
      },
    });
  };

  // Bulk deactivate selected forms
  const handleBulkDeactivate = async () => {
    if (selectedRowKeys.length === 0) return;
    
    Modal.confirm({
      title: 'Deactivate Forms',
      content: `Are you sure you want to deactivate ${selectedRowKeys.length} form(s)?`,
      onOk: async () => {
        try {
          setBulkActionLoading(true);
          await Promise.all(
            selectedRowKeys.map(id => 
              formService.updateFormTemplate(id, { is_active: false })
            )
          );
          message.success(`${selectedRowKeys.length} form(s) deactivated`);
          setSelectedRowKeys([]);
          fetchTemplates();
        } catch {
          message.error('Failed to deactivate some forms');
        } finally {
          setBulkActionLoading(false);
        }
      },
    });
  };

  // Bulk delete selected forms
  const handleBulkDelete = async () => {
    if (selectedRowKeys.length === 0) return;
    
    Modal.confirm({
      title: 'Delete Forms',
      content: `Are you sure you want to delete ${selectedRowKeys.length} form(s)? This action cannot be undone.`,
      okText: 'Delete',
      okType: 'danger',
      onOk: async () => {
        try {
          setBulkActionLoading(true);
          await Promise.all(
            selectedRowKeys.map(id => formService.deleteFormTemplate(id))
          );
          message.success(`${selectedRowKeys.length} form(s) deleted`);
          setSelectedRowKeys([]);
          fetchTemplates();
        } catch {
          message.error('Failed to delete some forms');
        } finally {
          setBulkActionLoading(false);
        }
      },
    });
  };

  // Table row selection
  const rowSelection = {
    selectedRowKeys,
    onChange: (keys) => setSelectedRowKeys(keys),
  };

  // Table columns
  const columns = [
    {
      title: 'Name',
      dataIndex: 'name',
      key: 'name',
      render: (text, record) => (
        <Space direction="vertical" size={0}>
          <Text strong>{text}</Text>
          {record.description && (
            <Text type="secondary" style={{ fontSize: 12 }}>{record.description}</Text>
          )}
        </Space>
      ),
    },
    {
      title: 'Category',
      dataIndex: 'category',
      key: 'category',
      width: 140,
      render: (category) => {
        const cat = FORM_CATEGORIES.find(c => c.value === category);
        return cat ? <Tag>{cat.label}</Tag> : <Tag>{category}</Tag>;
      },
    },
    {
      title: 'Status',
      dataIndex: 'is_active',
      key: 'is_active',
      width: 100,
      render: (isActive) => (
        <Tag color={isActive ? 'green' : 'default'}>
          {isActive ? 'Active' : 'Inactive'}
        </Tag>
      ),
    },
    {
      title: 'Steps',
      dataIndex: 'step_count',
      key: 'step_count',
      width: 80,
      align: 'center',
      render: (count) => count || 0,
    },
    {
      title: 'Fields',
      dataIndex: 'field_count',
      key: 'field_count',
      width: 80,
      align: 'center',
      render: (count) => count || 0,
    },
    {
      title: 'Submissions',
      dataIndex: 'submission_count',
      key: 'submission_count',
      width: 100,
      align: 'center',
      render: (count) => count || 0,
    },
    {
      title: 'Created',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 120,
      render: (date) => new Date(date).toLocaleDateString(),
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 120,
      fixed: 'right',
      render: (_, record) => {
        const items = [
          {
            key: 'edit',
            icon: <EditOutlined />,
            label: 'Edit Form',
            onClick: () => navigate(`/forms/builder/${record.id}`),
          },
          {
            key: 'preview',
            icon: <EyeOutlined />,
            label: 'Preview',
            onClick: () => navigate(`/forms/preview/${record.id}`),
          },
          {
            key: 'duplicate',
            icon: <CopyOutlined />,
            label: 'Duplicate',
            onClick: () => {
              setSelectedTemplate(record);
              duplicateForm.setFieldsValue({ name: `${record.name} (Copy)` });
              setDuplicateModalVisible(true);
            },
          },
          {
            key: 'submissions',
            icon: <FileTextOutlined />,
            label: 'View Submissions',
            onClick: () => navigate(`/forms/${record.id}/responses`),
          },
          {
            key: 'analytics',
            icon: <BarChartOutlined />,
            label: 'Analytics',
            onClick: () => navigate(`/forms/${record.id}/analytics`),
          },
          {
            type: 'divider',
          },
          {
            key: 'toggle',
            icon: record.is_active ? <EyeOutlined /> : <EyeOutlined />,
            label: record.is_active ? 'Deactivate' : 'Activate',
            onClick: () => handleToggleActive(record),
          },
          {
            key: 'delete',
            icon: <DeleteOutlined />,
            label: 'Delete',
            danger: true,
            onClick: () => handleDelete(record),
          },
        ];

        return (
          <Space>
            <Tooltip title="Edit Form">
              <Button 
                type="primary" 
                size="small" 
                icon={<EditOutlined />}
                onClick={() => navigate(`/forms/builder/${record.id}`)}
              />
            </Tooltip>
            <Dropdown menu={{ items }} trigger={['click']}>
              <Button size="small" icon={<MoreOutlined />} />
            </Dropdown>
          </Space>
        );
      },
    },
  ];

  // Stats
  const stats = {
    total: templates.length,
    active: templates.filter(t => t.is_active).length,
    totalSubmissions: templates.reduce((sum, t) => sum + (t.submission_count || 0), 0),
  };

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <Title level={2} className="mb-0">
            <FormOutlined className="mr-2" />
            Form Builder
          </Title>
          <Text type="secondary">Create and manage custom forms for your Quick Links</Text>
        </div>
        <Button 
          type="primary" 
          icon={<PlusOutlined />}
          size="large"
          onClick={() => setCreateModalVisible(true)}
        >
          Create New Form
        </Button>
      </div>

      {/* Stats Cards */}
      <Row gutter={16} className="mb-6">
        <Col span={8}>
          <Card>
            <Statistic 
              title="Total Forms" 
              value={stats.total} 
              prefix={<FormOutlined />}
            />
          </Card>
        </Col>
        <Col span={8}>
          <Card>
            <Statistic 
              title="Active Forms" 
              value={stats.active} 
              valueStyle={{ color: '#52c41a' }}
            />
          </Card>
        </Col>
        <Col span={8}>
          <Card>
            <Statistic 
              title="Total Submissions" 
              value={stats.totalSubmissions}
              prefix={<FileTextOutlined />}
            />
          </Card>
        </Col>
      </Row>

      {/* Filters */}
      <Card className="mb-4">
        <Space wrap>
          <Search
            placeholder="Search forms..."
            allowClear
            style={{ width: 250 }}
            prefix={<SearchOutlined />}
            onSearch={handleSearch}
            onChange={(e) => setFilters(prev => ({ ...prev, search: e.target.value }))}
          />
          <Select
            placeholder="Category"
            allowClear
            style={{ width: 180 }}
            options={FORM_CATEGORIES}
            onChange={(value) => {
              setFilters(prev => ({ ...prev, category: value }));
              setPagination(prev => ({ ...prev, current: 1 }));
            }}
          />
          <Select
            placeholder="Status"
            allowClear
            style={{ width: 120 }}
            options={[
              { value: 'true', label: 'Active' },
              { value: 'false', label: 'Inactive' },
            ]}
            onChange={(value) => {
              setFilters(prev => ({ ...prev, is_active: value }));
              setPagination(prev => ({ ...prev, current: 1 }));
            }}
          />
        </Space>
      </Card>

      {/* Bulk Actions Bar */}
      {selectedRowKeys.length > 0 && (
        <Card className="mb-4 bg-blue-50">
          <div className="flex justify-between items-center">
            <Text strong>{selectedRowKeys.length} form(s) selected</Text>
            <Space>
              <Button
                icon={<EyeOutlined />}
                onClick={handleBulkActivate}
                loading={bulkActionLoading}
              >
                Activate
              </Button>
              <Button
                icon={<InboxOutlined />}
                onClick={handleBulkDeactivate}
                loading={bulkActionLoading}
              >
                Deactivate
              </Button>
              <Button
                danger
                icon={<DeleteOutlined />}
                onClick={handleBulkDelete}
                loading={bulkActionLoading}
              >
                Delete
              </Button>
              <Button onClick={() => setSelectedRowKeys([])}>
                Clear Selection
              </Button>
            </Space>
          </div>
        </Card>
      )}

      {/* Table */}
      <Card>
        <Table
          columns={columns}
          dataSource={templates}
          rowKey="id"
          loading={loading}
          rowSelection={rowSelection}
          pagination={{
            current: pagination.current,
            pageSize: pagination.pageSize,
            total: pagination.total,
            showSizeChanger: true,
            showTotal: (total) => `${total} forms`,
            pageSizeOptions: ['10', '20', '50', '100'],
            onChange: (page, pageSize) => {
              setPagination(prev => ({ 
                ...prev, 
                current: page, 
                pageSize: pageSize 
              }));
            }
          }}
          scroll={{ x: 1200 }}
          locale={{
            emptyText: (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description="No form templates yet"
              >
                <Button 
                  type="primary" 
                  icon={<PlusOutlined />}
                  onClick={() => setCreateModalVisible(true)}
                >
                  Create Your First Form
                </Button>
              </Empty>
            ),
          }}
        />
      </Card>

      {/* Create Modal */}
      <Modal
        title="Create New Form"
        open={createModalVisible}
        onCancel={() => {
          setCreateModalVisible(false);
          form.resetFields();
        }}
        footer={null}
        width={500}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleCreate}
        >
          <Form.Item
            name="name"
            label="Form Name"
            rules={[{ required: true, message: 'Please enter a form name' }]}
          >
            <Input placeholder="e.g., Kite Lesson Registration" />
          </Form.Item>
          
          <Form.Item
            name="description"
            label="Description"
          >
            <Input.TextArea 
              rows={3} 
              placeholder="Brief description of what this form is for..."
            />
          </Form.Item>

          <Form.Item
            name="category"
            label="Category"
            rules={[{ required: true, message: 'Please select a category' }]}
          >
            <Select
              placeholder="Select category"
              options={FORM_CATEGORIES}
            />
          </Form.Item>

          <Form.Item className="mb-0 text-right">
            <Space>
              <Button onClick={() => {
                setCreateModalVisible(false);
                form.resetFields();
              }}>
                Cancel
              </Button>
              <Button type="primary" htmlType="submit" icon={<PlusOutlined />}>
                Create & Open Builder
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      {/* Duplicate Modal */}
      <Modal
        title="Duplicate Form"
        open={duplicateModalVisible}
        onCancel={() => {
          setDuplicateModalVisible(false);
          duplicateForm.resetFields();
          setSelectedTemplate(null);
        }}
        footer={null}
        width={400}
      >
        <Form
          form={duplicateForm}
          layout="vertical"
          onFinish={handleDuplicate}
        >
          <Form.Item
            name="name"
            label="New Form Name"
            rules={[{ required: true, message: 'Please enter a name for the copy' }]}
          >
            <Input placeholder="Enter name for the duplicate" />
          </Form.Item>

          <Form.Item className="mb-0 text-right">
            <Space>
              <Button onClick={() => {
                setDuplicateModalVisible(false);
                duplicateForm.resetFields();
                setSelectedTemplate(null);
              }}>
                Cancel
              </Button>
              <Button type="primary" htmlType="submit" icon={<CopyOutlined />}>
                Duplicate
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default FormsListPage;
