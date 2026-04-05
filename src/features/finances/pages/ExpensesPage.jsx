import { useState, useCallback, useEffect } from 'react';
import {
  Card,
  Table,
  Input,
  DatePicker,
  Select,
  Space,
  Tag,
  Typography,
  Row,
  Col,
  Statistic,
  Button,
  Empty,
  Modal,
  Form,
  InputNumber,
  Popconfirm,
} from 'antd';
import { message } from '@/shared/utils/antdStatic';
import {
  SearchOutlined,
  DownloadOutlined,
  DollarOutlined,
  FilterOutlined,
  ReloadOutlined,
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import apiClient from '@/shared/services/apiClient';
import { useCurrency } from '@/shared/contexts/CurrencyContext';

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;
const { TextArea } = Input;

// Expense categories
const EXPENSE_CATEGORIES = [
  { value: 'rent', label: 'Rent', color: 'blue' },
  { value: 'utilities', label: 'Utilities', color: 'cyan' },
  { value: 'salaries', label: 'Salaries', color: 'green' },
  { value: 'equipment', label: 'Equipment', color: 'purple' },
  { value: 'maintenance', label: 'Maintenance', color: 'orange' },
  { value: 'supplies', label: 'Supplies', color: 'gold' },
  { value: 'marketing', label: 'Marketing', color: 'magenta' },
  { value: 'insurance', label: 'Insurance', color: 'geekblue' },
  { value: 'professional_services', label: 'Professional Services', color: 'volcano' },
  { value: 'travel', label: 'Travel', color: 'lime' },
  { value: 'software_subscriptions', label: 'Software/Subscriptions', color: 'cyan' },
  { value: 'bank_fees', label: 'Bank Fees', color: 'red' },
  { value: 'taxes', label: 'Taxes', color: 'default' },
  { value: 'other', label: 'Other', color: 'default' },
];

const PAYMENT_METHODS = [
  { value: 'cash', label: 'Cash' },
  { value: 'bank_transfer', label: 'Bank Transfer' },
  { value: 'card', label: 'Card' },
  { value: 'wallet', label: 'Wallet' },
  { value: 'other', label: 'Other' },
];

const ExpensesPage = () => {
  const { formatCurrency } = useCurrency();
  const [loading, setLoading] = useState(false);
  const [expenses, setExpenses] = useState([]);
  const [summary, setSummary] = useState({ totalExpenses: 0, totalCount: 0, byCategory: [] });
  const [pagination, setPagination] = useState({
    current: 1,
    pageSize: 20,
    total: 0,
  });
  const [filters, setFilters] = useState({
    dateRange: null,
    category: null,
    search: '',
  });
  
  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState(null);
  const [form] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);

  const fetchExpenses = useCallback(async (page = 1, pageSize = 20) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page,
        limit: pageSize,
      });

      if (filters.dateRange && filters.dateRange[0] && filters.dateRange[1]) {
        params.append('start_date', filters.dateRange[0].format('YYYY-MM-DD'));
        params.append('end_date', filters.dateRange[1].format('YYYY-MM-DD'));
      }

      if (filters.category) {
        params.append('category', filters.category);
      }

      if (filters.search) {
        params.append('search', filters.search);
      }

      const response = await apiClient.get(`/business-expenses?${params.toString()}`);
      
      setExpenses(response.data.expenses || []);
      setSummary(response.data.summary || { totalExpenses: 0, totalCount: 0, byCategory: [] });
      setPagination(prev => ({
        ...prev,
        current: page,
        pageSize,
        total: response.data.total || 0,
      }));
    } catch {
      message.error('Failed to load expenses');
    } finally {
      setLoading(false);
    }
  }, [filters]);

  // Initial load
  useEffect(() => {
    fetchExpenses(1, pagination.pageSize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Refetch when filters change
  useEffect(() => {
    fetchExpenses(1, pagination.pageSize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.dateRange, filters.category]);

  const handleTableChange = (paginationConfig) => {
    fetchExpenses(paginationConfig.current, paginationConfig.pageSize);
  };

  const handleSearch = (value) => {
    setFilters(prev => ({ ...prev, search: value }));
    fetchExpenses(1, pagination.pageSize);
  };

  const handleDateRangeChange = (dates) => {
    setFilters(prev => ({ ...prev, dateRange: dates }));
  };

  const handleCategoryChange = (value) => {
    setFilters(prev => ({ ...prev, category: value }));
  };

  const handleReset = () => {
    setFilters({
      dateRange: null,
      category: null,
      search: '',
    });
  };

  const handleExport = () => {
    const headers = ['Date', 'Description', 'Category', 'Vendor', 'Amount', 'Payment Method', 'Reference'];
    const rows = expenses.map(expense => [
      dayjs(expense.expense_date).format('YYYY-MM-DD'),
      expense.description || '-',
      getCategoryLabel(expense.category),
      expense.vendor || '-',
      expense.amount,
      expense.payment_method || '-',
      expense.reference_number || '-',
    ]);

    const csvContent = [headers, ...rows]
      .map(row => row.map(cell => `"${cell}"`).join(','))
      .join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `business_expenses_${dayjs().format('YYYY-MM-DD')}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
    message.success('Expenses exported successfully');
  };

  const getCategoryColor = (category) => {
    return EXPENSE_CATEGORIES.find(c => c.value === category)?.color || 'default';
  };

  const getCategoryLabel = (category) => {
    return EXPENSE_CATEGORIES.find(c => c.value === category)?.label || category;
  };

  // Modal handlers
  const openAddModal = () => {
    setEditingExpense(null);
    form.resetFields();
    form.setFieldsValue({
      expense_date: dayjs(),
      currency: 'EUR',
    });
    setModalOpen(true);
  };

  const openEditModal = (record) => {
    setEditingExpense(record);
    form.setFieldsValue({
      ...record,
      expense_date: dayjs(record.expense_date),
    });
    setModalOpen(true);
  };

  const handleModalCancel = () => {
    setModalOpen(false);
    setEditingExpense(null);
    form.resetFields();
  };

  const handleModalSubmit = async () => {
    try {
      const values = await form.validateFields();
      setSubmitting(true);

      const payload = {
        ...values,
        expense_date: values.expense_date.format('YYYY-MM-DD'),
      };

      if (editingExpense) {
        await apiClient.put(`/business-expenses/${editingExpense.id}`, payload);
        message.success('Expense updated successfully');
      } else {
        await apiClient.post('/business-expenses', payload);
        message.success('Expense added successfully');
      }

      setModalOpen(false);
      setEditingExpense(null);
      form.resetFields();
      fetchExpenses(pagination.current, pagination.pageSize);
    } catch (error) {
      if (error.response?.data?.error) {
        message.error(error.response.data.error);
      } else if (error.errorFields) {
        // Form validation error
      } else {
        message.error('Failed to save expense');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id) => {
    try {
      await apiClient.delete(`/business-expenses/${id}`);
      message.success('Expense deleted successfully');
      fetchExpenses(pagination.current, pagination.pageSize);
    } catch {
      message.error('Failed to delete expense');
    }
  };

  const columns = [
    {
      title: 'Date',
      dataIndex: 'expense_date',
      key: 'expense_date',
      width: 120,
      render: (date) => (
        <Text>{dayjs(date).format('MMM DD, YYYY')}</Text>
      ),
    },
    {
      title: 'Description',
      dataIndex: 'description',
      key: 'description',
      ellipsis: true,
      render: (text, record) => (
        <div>
          <Text strong>{text || 'No description'}</Text>
          {record.vendor && (
            <div>
              <Text type="secondary" style={{ fontSize: 12 }}>
                {record.vendor}
              </Text>
            </div>
          )}
        </div>
      ),
    },
    {
      title: 'Category',
      dataIndex: 'category',
      key: 'category',
      width: 160,
      render: (category) => (
        <Tag color={getCategoryColor(category)}>
          {getCategoryLabel(category)}
        </Tag>
      ),
    },
    {
      title: 'Amount',
      dataIndex: 'amount',
      key: 'amount',
      width: 120,
      align: 'right',
      render: (amount) => (
        <Text strong style={{ color: '#cf1322' }}>
          -{formatCurrency(amount)}
        </Text>
      ),
    },
    {
      title: 'Payment',
      dataIndex: 'payment_method',
      key: 'payment_method',
      width: 120,
      render: (method) => (
        <Text type="secondary">{method ? method.replace('_', ' ') : '-'}</Text>
      ),
      responsive: ['lg'],
    },
    {
      title: 'Added By',
      key: 'created_by',
      width: 140,
      render: (_, record) => (
        <Text type="secondary" style={{ fontSize: 12 }}>
          {record.creator_first_name} {record.creator_last_name}
        </Text>
      ),
      responsive: ['xl'],
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 100,
      render: (_, record) => (
        <Space size="small">
          <Button
            type="text"
            icon={<EditOutlined />}
            onClick={() => openEditModal(record)}
            size="small"
          />
          <Popconfirm
            title="Delete expense?"
            description="This action cannot be undone."
            onConfirm={() => handleDelete(record.id)}
            okText="Delete"
            okButtonProps={{ danger: true }}
          >
            <Button
              type="text"
              icon={<DeleteOutlined />}
              danger
              size="small"
            />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  // Get top 2 categories for summary cards
  const topCategories = summary.byCategory?.slice(0, 2) || [];

  return (
    <div className="p-4 md:p-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-6">
        <Title level={3} className="mb-4 md:mb-0">
          Business Expenses
        </Title>
        <Space wrap>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={openAddModal}
          >
            Add Expense
          </Button>
          <Button
            icon={<ReloadOutlined />}
            onClick={() => fetchExpenses(pagination.current, pagination.pageSize)}
          >
            Refresh
          </Button>
          <Button
            icon={<DownloadOutlined />}
            onClick={handleExport}
            disabled={expenses.length === 0}
          >
            Export CSV
          </Button>
        </Space>
      </div>

      {/* Summary Cards */}
      <Row gutter={[16, 16]} className="mb-6">
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="Total Expenses"
              value={summary.totalExpenses}
              prefix={<DollarOutlined />}
              formatter={(value) => formatCurrency(value)}
              valueStyle={{ color: '#cf1322' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="Total Entries"
              value={summary.totalCount}
            />
          </Card>
        </Col>
        {topCategories.map((cat) => (
          <Col xs={24} sm={12} lg={6} key={cat.category}>
            <Card>
              <Statistic
                title={getCategoryLabel(cat.category)}
                value={cat.total_amount}
                formatter={(value) => formatCurrency(value)}
                valueStyle={{ color: getCategoryColor(cat.category) === 'red' ? '#cf1322' : '#1890ff' }}
              />
            </Card>
          </Col>
        ))}
      </Row>

      {/* Filters */}
      <Card className="mb-4">
        <Row gutter={[16, 16]} align="middle">
          <Col xs={24} sm={24} md={8} lg={6}>
            <Input.Search
              placeholder="Search description or vendor..."
              allowClear
              value={filters.search}
              onChange={(e) => setFilters(prev => ({ ...prev, search: e.target.value }))}
              onSearch={handleSearch}
              prefix={<SearchOutlined />}
            />
          </Col>
          <Col xs={24} sm={12} md={8} lg={6}>
            <RangePicker
              style={{ width: '100%' }}
              value={filters.dateRange}
              onChange={handleDateRangeChange}
              placeholder={['Start Date', 'End Date']}
            />
          </Col>
          <Col xs={24} sm={12} md={6} lg={4}>
            <Select
              style={{ width: '100%' }}
              placeholder="Category"
              allowClear
              value={filters.category}
              onChange={handleCategoryChange}
              options={EXPENSE_CATEGORIES}
            />
          </Col>
          <Col xs={24} sm={24} md={2} lg={2}>
            <Button 
              icon={<FilterOutlined />} 
              onClick={handleReset}
              block
            >
              Reset
            </Button>
          </Col>
        </Row>
      </Card>

      {/* Expenses Table */}
      <Card>
        <Table
          columns={columns}
          dataSource={expenses}
          rowKey="id"
          loading={loading}
          pagination={{
            ...pagination,
            showSizeChanger: true,
            showTotal: (total, range) => `${range[0]}-${range[1]} of ${total} expenses`,
            pageSizeOptions: ['10', '20', '50', '100'],
          }}
          onChange={handleTableChange}
          scroll={{ x: 800 }}
          locale={{
            emptyText: (
              <Empty
                description="No expenses found. Click 'Add Expense' to create one."
                image={Empty.PRESENTED_IMAGE_SIMPLE}
              />
            ),
          }}
        />
      </Card>

      {/* Add/Edit Modal */}
      <Modal
        title={editingExpense ? 'Edit Expense' : 'Add New Expense'}
        open={modalOpen}
        onCancel={handleModalCancel}
        onOk={handleModalSubmit}
        confirmLoading={submitting}
        okText={editingExpense ? 'Update' : 'Add'}
        width={600}
      >
        <Form
          form={form}
          layout="vertical"
          className="mt-4"
        >
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="amount"
                label="Amount"
                rules={[
                  { required: true, message: 'Please enter amount' },
                  { type: 'number', min: 0.01, message: 'Amount must be greater than 0' }
                ]}
              >
                <InputNumber
                  style={{ width: '100%' }}
                  prefix="€"
                  precision={2}
                  min={0.01}
                  placeholder="0.00"
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="expense_date"
                label="Date"
                rules={[{ required: true, message: 'Please select date' }]}
              >
                <DatePicker style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="category"
                label="Category"
                rules={[{ required: true, message: 'Please select category' }]}
              >
                <Select
                  placeholder="Select category"
                  options={EXPENSE_CATEGORIES}
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="payment_method"
                label="Payment Method"
              >
                <Select
                  placeholder="Select method"
                  options={PAYMENT_METHODS}
                  allowClear
                />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item
            name="description"
            label="Description"
            rules={[{ required: true, message: 'Please enter description' }]}
          >
            <TextArea
              rows={2}
              placeholder="What is this expense for?"
            />
          </Form.Item>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="vendor"
                label="Vendor/Supplier"
              >
                <Input placeholder="Company or person name" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="reference_number"
                label="Reference/Invoice #"
              >
                <Input placeholder="Invoice or receipt number" />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item
            name="notes"
            label="Additional Notes"
          >
            <TextArea
              rows={2}
              placeholder="Any additional information..."
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default ExpensesPage;
