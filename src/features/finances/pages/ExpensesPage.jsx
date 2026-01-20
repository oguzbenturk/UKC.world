import { useState, useCallback } from 'react';
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
} from 'antd';
import { message } from '@/shared/utils/antdStatic';
import {
  SearchOutlined,
  DownloadOutlined,
  DollarOutlined,
  FilterOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import apiClient from '@/shared/services/apiClient';
import { useCurrency } from '@/shared/contexts/CurrencyContext';

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;

const ExpensesPage = () => {
  const { formatCurrency } = useCurrency();
  const [loading, setLoading] = useState(false);
  const [expenses, setExpenses] = useState([]);
  const [categories, setCategories] = useState([]);
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

  const fetchExpenses = useCallback(async (page = 1, pageSize = 20) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        limit: pageSize,
        offset: (page - 1) * pageSize,
      });

      if (filters.dateRange && filters.dateRange[0] && filters.dateRange[1]) {
        params.append('start_date', filters.dateRange[0].startOf('day').toISOString());
        params.append('end_date', filters.dateRange[1].endOf('day').toISOString());
      }

      if (filters.category) {
        params.append('category', filters.category);
      }

      if (filters.search) {
        params.append('search', filters.search);
      }

      const response = await apiClient.get(`/finances/expenses?${params.toString()}`);
      
      setExpenses(response.data.expenses || []);
      setCategories(response.data.categories || []);
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

  const handleRefresh = useCallback(() => {
    fetchExpenses(1, pagination.pageSize);
  }, [fetchExpenses, pagination.pageSize]);

  // Initial load
  useState(() => {
    handleRefresh();
  }, []);

  const handleTableChange = (paginationConfig) => {
    fetchExpenses(paginationConfig.current, paginationConfig.pageSize);
  };

  const handleSearch = (value) => {
    setFilters(prev => ({ ...prev, search: value }));
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
    // Create CSV content
    const headers = ['Date', 'Description', 'Category', 'Amount', 'Payment Method', 'Reference'];
    const rows = expenses.map(expense => [
      dayjs(expense.created_at).format('YYYY-MM-DD HH:mm'),
      expense.description || '-',
      expense.transaction_type || '-',
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
    a.download = `expenses_${dayjs().format('YYYY-MM-DD')}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
    message.success('Expenses exported successfully');
  };

  const getCategoryColor = (type) => {
    const colors = {
      salary: 'blue',
      operating_cost: 'orange',
      refund: 'red',
      withdrawal: 'purple',
      expense: 'volcano',
      adjustment: 'cyan',
    };
    return colors[type] || 'default';
  };

  const formatCategoryLabel = (type) => {
    if (!type) return 'Other';
    return type
      .replace(/_/g, ' ')
      .replace(/\b\w/g, l => l.toUpperCase());
  };

  const columns = [
    {
      title: 'Date',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 160,
      render: (date) => (
        <Text>{dayjs(date).format('MMM DD, YYYY HH:mm')}</Text>
      ),
      responsive: ['md'],
    },
    {
      title: 'Date',
      dataIndex: 'created_at',
      key: 'created_at_mobile',
      render: (date) => (
        <Text>{dayjs(date).format('MMM DD')}</Text>
      ),
      responsive: ['xs', 'sm'],
    },
    {
      title: 'Description',
      dataIndex: 'description',
      key: 'description',
      ellipsis: true,
      render: (text, record) => (
        <div>
          <Text strong>{text || 'No description'}</Text>
          {record.user_name && (
            <div>
              <Text type="secondary" style={{ fontSize: 12 }}>
                {record.user_name}
              </Text>
            </div>
          )}
        </div>
      ),
    },
    {
      title: 'Category',
      dataIndex: 'transaction_type',
      key: 'transaction_type',
      width: 140,
      render: (type) => (
        <Tag color={getCategoryColor(type)}>
          {formatCategoryLabel(type)}
        </Tag>
      ),
      responsive: ['sm'],
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
      title: 'Payment Method',
      dataIndex: 'payment_method',
      key: 'payment_method',
      width: 130,
      render: (method) => (
        <Text type="secondary">{method || '-'}</Text>
      ),
      responsive: ['lg'],
    },
    {
      title: 'Reference',
      dataIndex: 'reference_number',
      key: 'reference_number',
      width: 140,
      ellipsis: true,
      render: (ref) => (
        <Text copyable={!!ref} type="secondary">
          {ref || '-'}
        </Text>
      ),
      responsive: ['xl'],
    },
  ];

  const totalExpenses = categories.reduce((sum, cat) => sum + parseFloat(cat.total || 0), 0);
  const totalCount = categories.reduce((sum, cat) => sum + parseInt(cat.count || 0), 0);

  return (
    <div className="p-4 md:p-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-6">
        <Title level={3} className="mb-4 md:mb-0">
          Expenses
        </Title>
        <Space wrap>
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
              value={totalExpenses}
              prefix={<DollarOutlined />}
              formatter={(value) => formatCurrency(value)}
              valueStyle={{ color: '#cf1322' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="Total Transactions"
              value={totalCount}
            />
          </Card>
        </Col>
        {categories.slice(0, 2).map((cat) => (
          <Col xs={24} sm={12} lg={6} key={cat.transaction_type}>
            <Card>
              <Statistic
                title={formatCategoryLabel(cat.transaction_type)}
                value={cat.total}
                formatter={(value) => formatCurrency(value)}
                valueStyle={{ color: getCategoryColor(cat.transaction_type) === 'blue' ? '#1890ff' : '#fa8c16' }}
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
              placeholder="Search description or reference..."
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
              options={[
                { value: 'salary', label: 'Salary' },
                { value: 'operating_cost', label: 'Operating Cost' },
                { value: 'refund', label: 'Refund' },
                { value: 'withdrawal', label: 'Withdrawal' },
                { value: 'expense', label: 'Expense' },
                { value: 'adjustment', label: 'Adjustment' },
              ]}
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
                description="No expenses found"
                image={Empty.PRESENTED_IMAGE_SIMPLE}
              />
            ),
          }}
        />
      </Card>
    </div>
  );
};

export default ExpensesPage;
