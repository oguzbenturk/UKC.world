// src/features/services/pages/Categories.jsx
import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Table,
  Button,
  Modal,
  Form,
  Input,
  Select,
  Tag,
  Space,
  Card,
  Typography,
  Popconfirm,
  Tooltip
} from 'antd';
import { message } from '@/shared/utils/antdStatic';
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  TagsOutlined,
  BookOutlined,
  HomeOutlined,
  CarOutlined,
  ShoppingCartOutlined,
  TrophyOutlined,
  CheckCircleOutlined
} from '@ant-design/icons';
import { useData } from '@/shared/hooks/useData';
import UnifiedTable from '@/shared/components/tables/UnifiedTable';

const { Title } = Typography;
const { Option } = Select;

const formatStatValue = (value) => (
  typeof value === 'number'
    ? Number(value || 0).toLocaleString('en-US')
    : value
);

const accentStyles = {
  indigo: { bg: 'bg-indigo-50', text: 'text-indigo-600' },
  emerald: { bg: 'bg-emerald-50', text: 'text-emerald-600' },
  sky: { bg: 'bg-sky-50', text: 'text-sky-600' },
  amber: { bg: 'bg-amber-50', text: 'text-amber-600' },
  violet: { bg: 'bg-violet-50', text: 'text-violet-600' },
};

function Categories() {
  const { apiClient } = useData();
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(false);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [editingCategory, setEditingCategory] = useState(null);
  const [form] = Form.useForm();

  // Default categories to ensure important ones exist
  const defaultCategories = useMemo(() => ([
    {
      name: 'Lessons',
      type: 'lessons',
      description: 'Kitesurfing lessons and instruction services',
      status: 'active'
    }
  ]), []);

  // Ensure default categories exist
  const ensureDefaultCategories = useCallback(async (existingCategories) => {
    try {
      for (const defaultCategory of defaultCategories) {
        const exists = existingCategories.some(cat => 
          cat.name.toLowerCase() === defaultCategory.name.toLowerCase() ||
          (cat.type === defaultCategory.type && cat.name.toLowerCase().includes(defaultCategory.name.toLowerCase().split(' ')[0]))
        );
        
        if (!exists) {
          await apiClient.post('/services/categories', defaultCategory);
        }
      }
      
      // Reload categories if any were created
      const hasNewCategories = defaultCategories.some(defaultCategory => 
        !existingCategories.some(cat => 
          cat.name.toLowerCase() === defaultCategory.name.toLowerCase() ||
          (cat.type === defaultCategory.type && cat.name.toLowerCase().includes(defaultCategory.name.toLowerCase().split(' ')[0]))
        )
      );
      
      if (hasNewCategories) {
        // Refresh the list to show newly created categories
        const response = await apiClient.get('/services/categories');
        setCategories(response.data);
        message.success('Default categories have been created');
      }
    } catch (error) {
      void error; // Don't show error message as this is background setup
    }
  }, [apiClient, defaultCategories]);

  // Load categories and ensure defaults
  const loadCategories = useCallback(async () => {
    setLoading(true);
    try {
      const response = await apiClient.get('/services/categories');
      setCategories(response.data);
      
      // Check if default categories exist, if not, create them
      await ensureDefaultCategories(response.data);
    } catch (error) {
      void error;
      message.error('Failed to load categories');
    } finally {
      setLoading(false);
    }
  }, [apiClient, ensureDefaultCategories]);

  // Trigger initial load after callbacks are defined
  useEffect(() => {
    if (apiClient) {
      loadCategories();
    }
  }, [apiClient, loadCategories]);

  const handleEdit = (category) => {
    setEditingCategory(category);
    form.setFieldsValue({
      name: category.name,
      type: category.type,
      description: category.description,
      status: category.status || 'active'
    });
    setIsModalVisible(true);
  };

  const handleDelete = async (categoryId) => {
    try {
      await apiClient.delete(`/services/categories/${categoryId}`);
      message.success('Category deleted successfully');
      loadCategories();
    } catch (error) {
      void error;
      message.error(error.response?.data?.message || 'Failed to delete category');
    }
  };

  const handleModalOk = async () => {
    try {
      const values = await form.validateFields();
      
      if (editingCategory) {
        await apiClient.put(`/services/categories/${editingCategory.id}`, values);
        message.success('Category updated successfully');
      } else {
        await apiClient.post('/services/categories', values);
        message.success('Category created successfully');
      }

      setIsModalVisible(false);
      setEditingCategory(null);
      form.resetFields();
      loadCategories();
    } catch (error) {
      message.error(error.response?.data?.message || 'Failed to save category');
    }
  };

  const handleModalCancel = () => {
    setIsModalVisible(false);
    setEditingCategory(null);
    form.resetFields();
  };

  const getTypeIcon = (type) => {
    const icons = {
      accommodation: <HomeOutlined />,
      lessons: <BookOutlined />,
      rentals: <CarOutlined />,
      sales: <ShoppingCartOutlined />,
      sessions: <TrophyOutlined />,
    };
    return icons[type] || <TagsOutlined />;
  };

  const getTypeColor = (type) => {
    const colors = {
      accommodation: 'blue',
      lessons: 'green',
      rentals: 'orange',
      sales: 'purple',
      sessions: 'red',
    };
    return colors[type] || 'default';
  };

  const columns = [
    {
      title: 'Name',
      dataIndex: 'name',
      key: 'name',
      render: (text, record) => (
        <div>
          <div className="font-medium flex items-center">
            {getTypeIcon(record.type)}
            <span className="ml-2">{text}</span>
            {record.name.toLowerCase().includes('lesson') && (
              <Tag color="gold" size="small" className="ml-2">Core</Tag>
            )}
          </div>
          {record.description && (
            <div className="text-sm text-gray-500 mt-1">{record.description}</div>
          )}
        </div>
      ),
    },
    {
      title: 'Type',
      dataIndex: 'type',
      key: 'type',
      render: (type) => (
        <Tag color={getTypeColor(type)} icon={getTypeIcon(type)}>
          {type?.charAt(0).toUpperCase() + type?.slice(1)}
        </Tag>
      ),
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      render: (status) => (
        <Tag color={status === 'active' ? 'green' : 'red'}>
          {status?.charAt(0).toUpperCase() + status?.slice(1)}
        </Tag>
      ),
    },
    {
      title: 'Created',
      dataIndex: 'created_at',
      key: 'created_at',
      render: (date) => date ? new Date(date).toLocaleDateString() : '-',
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_, record) => (
        <Space>
          <Tooltip title="Edit">
            <Button 
              type="text" 
              icon={<EditOutlined />} 
              onClick={() => handleEdit(record)}
            />
          </Tooltip>
          <Popconfirm
            title="Are you sure you want to delete this category?"
            onConfirm={() => handleDelete(record.id)}
            okText="Yes"
            cancelText="No"
          >
            <Tooltip title="Delete">
              <Button type="text" danger icon={<DeleteOutlined />} />
            </Tooltip>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const dashboardStats = useMemo(() => {
    const activeCount = categories.filter((cat) => cat.status === 'active').length;
    const describedCount = categories.filter((cat) => cat.description?.trim()).length;
    const uniqueTypes = new Set(categories.map((cat) => cat.type)).size;
    const coreLessonsCategory = categories.find((cat) => cat.type === 'lessons');

    return [
      {
        key: 'core-lessons',
        label: 'Lessons core category',
        value: coreLessonsCategory ? 'Ready' : 'Missing',
        icon: <BookOutlined />,
        helper: coreLessonsCategory
          ? 'Students can be booked into lessons immediately'
          : 'Create at least one lesson category to keep onboarding smooth',
        accent: coreLessonsCategory ? 'indigo' : 'amber',
      },
      {
        key: 'active',
        label: 'Active categories',
        value: activeCount,
        icon: <CheckCircleOutlined />,
        helper: 'Available for scheduling right now',
        accent: 'emerald',
      },
      {
        key: 'coverage',
        label: 'Service type coverage',
        value: uniqueTypes,
        icon: <TagsOutlined />,
        helper: `${formatStatValue(describedCount)} with descriptions`,
        accent: 'sky',
      },
    ];
  }, [categories]);

  return (
    <div className="space-y-6 p-6">
      <Card className="rounded-3xl border border-slate-200/70 bg-gradient-to-br from-indigo-50 via-white to-white shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <Title level={2} className="!mb-2">Service Categories</Title>
            <p className="max-w-xl text-sm text-slate-600">
              Organize how services appear across bookings and internal tooling. Keep the lessons category healthy so instructors stay bookable.
            </p>
          </div>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => setIsModalVisible(true)}
          >
            New Category
          </Button>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {dashboardStats.map((stat) => {
            const accent = accentStyles[stat.accent] || accentStyles.indigo;

            return (
              <div
                key={stat.key}
                className="rounded-2xl border border-slate-200/70 bg-white/90 p-4 shadow-sm backdrop-blur"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      {stat.label}
                    </p>
                    <p className="mt-2 text-2xl font-semibold text-slate-900">
                      {formatStatValue(stat.value)}
                    </p>
                  </div>
                  <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${accent.bg} ${accent.text}`}>
                    {stat.icon}
                  </div>
                </div>
                {stat.helper ? (
                  <p className="mt-3 text-xs text-slate-500">{stat.helper}</p>
                ) : null}
              </div>
            );
          })}
        </div>
      </Card>

      <Card className="rounded-3xl border border-slate-200/70 shadow-sm">
        <UnifiedTable density="comfortable">
          <Table
            columns={columns}
            dataSource={categories}
            loading={loading}
            rowKey="id"
            pagination={{
              pageSize: 10,
              showSizeChanger: true,
              showQuickJumper: true,
            }}
          />
        </UnifiedTable>
      </Card>

      {/* Category Form Modal */}
      <Modal
        title={editingCategory ? 'Edit Category' : 'New Category'}
        open={isModalVisible}
        onOk={handleModalOk}
        onCancel={handleModalCancel}
        width={600}
        destroyOnHidden
      >
        <Form
          form={form}
          layout="vertical"
          preserve={false}
        >
          <Form.Item
            name="name"
            label="Category Name"
            rules={[
              { required: true, message: 'Please enter category name' },
              { min: 2, message: 'Category name must be at least 2 characters' }
            ]}
          >
            <Input placeholder="Enter category name" />
          </Form.Item>

          <Form.Item
            name="type"
            label="Service Type"
            rules={[{ required: true, message: 'Please select service type' }]}
          >
            <Select placeholder="Select service type">
              <Option value="accommodation">
                <HomeOutlined /> Accommodation
              </Option>
              <Option value="lessons">
                <BookOutlined /> Lessons
              </Option>
              <Option value="rentals">
                <CarOutlined /> Rentals
              </Option>
              <Option value="sales">
                <ShoppingCartOutlined /> Shop
              </Option>
              <Option value="sessions">
                <TrophyOutlined /> Sessions
              </Option>
            </Select>
          </Form.Item>

          <Form.Item
            name="description"
            label="Description"
          >
            <Input.TextArea 
              rows={3} 
              placeholder="Optional description for this category"
            />
          </Form.Item>

          <Form.Item
            name="status"
            label="Status"
            initialValue="active"
          >
            <Select>
              <Option value="active">Active</Option>
              <Option value="inactive">Inactive</Option>
            </Select>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

export default Categories;
