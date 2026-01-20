// src/features/finances/components/OutstandingBalancesManager.jsx
import { useState, useEffect } from 'react';
import { 
  Card, 
  Table, 
  Button, 
  Input, 
  Select, 
  Badge, 
  Space, 
  Modal, 
  Form, 
  InputNumber, 
  DatePicker, 
  Tooltip,
  Row,
  Col,
  Statistic,
  
  Dropdown,
  Menu
} from 'antd';
import { message } from '@/shared/utils/antdStatic';
import {
  SearchOutlined,
  ReloadOutlined,
  MailOutlined,
  PhoneOutlined,
  DollarOutlined,
  
  DownloadOutlined,
  MoreOutlined,
  
  EyeOutlined
} from '@ant-design/icons';
import FinancialAnalyticsService from '../services/financialAnalytics';
import ReportingService from '../services/reportingService';
import { formatCurrency, formatDate } from '@/shared/utils/formatters';
import { useCurrency } from '@/shared/contexts/CurrencyContext';
import UnifiedTable from '@/shared/components/tables/UnifiedTable';
 

const { Option } = Select;
const { Search } = Input;
 

function OutstandingBalancesManager() {
  const { businessCurrency, getCurrencySymbol } = useCurrency();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState([]);
  const [filteredData, setFilteredData] = useState([]);
  const [summary, setSummary] = useState({});
  const [searchText, setSearchText] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortOrder, setSortOrder] = useState('desc');
  const [selectedRows, setSelectedRows] = useState([]);
  const [paymentModalVisible, setPaymentModalVisible] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [form] = Form.useForm();

  // Fetch outstanding balances data
  const fetchData = async () => {
    try {
      setLoading(true);
      const response = await FinancialAnalyticsService.getOutstandingBalances();
      setData(response.details || []);
      setSummary(response.summary || {});
    } catch {
      message.error('Failed to load outstanding balances');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Filter and search data
  useEffect(() => {
    let filtered = data;

    // Apply search filter
    if (searchText) {
      filtered = filtered.filter(item =>
        item.customer_name?.toLowerCase().includes(searchText.toLowerCase()) ||
        item.customer_email?.toLowerCase().includes(searchText.toLowerCase()) ||
        item.customer_phone?.includes(searchText)
      );
    }

    // Apply status filter
    if (statusFilter !== 'all') {
      filtered = filtered.filter(item => {
        const balance = parseFloat(item.outstanding_balance) || 0;
        switch (statusFilter) {
          case 'overdue':
            return balance > 0 && item.days_overdue > 0;
          case 'recent':
            return balance > 0 && item.days_overdue <= 7;
          case 'critical':
            return balance > 100 && item.days_overdue > 30;
          case 'positive':
            return balance > 0;
          case 'negative':
            return balance < 0;
          default:
            return true;
        }
      });
    }

    // Apply sorting
    filtered.sort((a, b) => {
      const aBalance = parseFloat(a.outstanding_balance) || 0;
      const bBalance = parseFloat(b.outstanding_balance) || 0;
      return sortOrder === 'desc' ? bBalance - aBalance : aBalance - bBalance;
    });

    setFilteredData(filtered);
  }, [data, searchText, statusFilter, sortOrder]);

  // Get risk level based on balance and days overdue
  const getRiskLevel = (balance, daysOverdue) => {
    const amount = parseFloat(balance) || 0;
    if (amount <= 0) return { level: 'none', color: 'green' };
    if (amount < 50 && daysOverdue <= 7) return { level: 'low', color: 'blue' };
    if (amount < 100 && daysOverdue <= 30) return { level: 'medium', color: 'orange' };
    return { level: 'high', color: 'red' };
  };

  // Handle payment recording
  const handleRecordPayment = async (values) => {
    try {
      // This would integrate with your payment recording API
      await FinancialAnalyticsService.recordPayment({
        customerId: selectedCustomer.customer_id,
        amount: values.amount,
        paymentDate: values.paymentDate.format('YYYY-MM-DD'),
        method: values.method,
        notes: values.notes
      });
      
      message.success('Payment recorded successfully');
      setPaymentModalVisible(false);
      form.resetFields();
      fetchData();
  } catch {
      message.error('Failed to record payment');
    }
  };

  // Bulk operations
  const handleBulkEmail = async () => {
    if (selectedRows.length === 0) {
      message.warning('Please select customers to email');
      return;
    }
    
    try {
      await FinancialAnalyticsService.sendReminderEmails(selectedRows);
      message.success(`Reminder emails sent to ${selectedRows.length} customers`);
  } catch {
      message.error('Failed to send reminder emails');
    }
  };

  const handleExportData = async () => {
    try {
      const exportData = selectedRows.length > 0 
        ? filteredData.filter(item => selectedRows.includes(item.customer_id))
        : filteredData;
      
      await ReportingService.exportToCSV(exportData, 'outstanding-balances');
      message.success('Data exported successfully');
  } catch {
      message.error('Failed to export data');
    }
  };

  // Table columns
  const columns = [
    {
      title: 'Customer',
      dataIndex: 'customer_name',
      key: 'customer_name',
      render: (text, record) => (
        <div>
          <div className="font-medium">{text}</div>
          <div className="text-sm text-gray-500">{record.customer_email}</div>
          {record.customer_phone && (
            <div className="text-sm text-gray-500">{record.customer_phone}</div>
          )}
        </div>
      ),
    },
    {
      title: 'Outstanding Balance',
      dataIndex: 'outstanding_balance',
      key: 'outstanding_balance',
      render: (balance) => {
        const amount = parseFloat(balance) || 0;
        return (
          <span className={amount > 0 ? 'text-red-600 font-semibold' : 'text-green-600'}>
            {formatCurrency(amount)}
          </span>
        );
      },
      sorter: (a, b) => (parseFloat(a.outstanding_balance) || 0) - (parseFloat(b.outstanding_balance) || 0),
    },
    {
      title: 'Days Overdue',
      dataIndex: 'days_overdue',
      key: 'days_overdue',
      render: (days) => {
        if (days <= 0) return <span className="text-gray-500">-</span>;
        if (days <= 7) return <Badge status="processing" text={`${days} days`} />;
        if (days <= 30) return <Badge status="warning" text={`${days} days`} />;
        return <Badge status="error" text={`${days} days`} />;
      },
      sorter: (a, b) => a.days_overdue - b.days_overdue,
    },
    {
      title: 'Risk Level',
      key: 'risk_level',
      render: (_, record) => {
        const risk = getRiskLevel(record.outstanding_balance, record.days_overdue);
        return (
          <Badge 
            color={risk.color} 
            text={risk.level.toUpperCase()}
          />
        );
      },
    },
    {
      title: 'Last Payment',
      dataIndex: 'last_payment_date',
      key: 'last_payment_date',
      render: (date) => date ? formatDate(date) : 'No payments',
    },
    {
      title: 'Total Bookings',
      dataIndex: 'total_bookings',
      key: 'total_bookings',
      render: (count, record) => (
        <Tooltip title={`Total value: ${formatCurrency(record.total_booking_value)}`}>
          <span>{count}</span>
        </Tooltip>
      ),
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_, record) => {
        const menu = (
          <Menu>
            <Menu.Item 
              key="payment" 
              icon={<DollarOutlined />}
              onClick={() => {
                setSelectedCustomer(record);
                setPaymentModalVisible(true);
              }}
            >
              Record Payment
            </Menu.Item>
            <Menu.Item 
              key="email" 
              icon={<MailOutlined />}
              onClick={() => handleSendReminder(record)}
            >
              Send Reminder
            </Menu.Item>
            <Menu.Item 
              key="call" 
              icon={<PhoneOutlined />}
              onClick={() => handleCallCustomer(record)}
            >
              Call Customer
            </Menu.Item>
            <Menu.Item 
              key="view" 
              icon={<EyeOutlined />}
              onClick={() => handleViewCustomer(record)}
            >
              View Profile
            </Menu.Item>
          </Menu>
        );

        return (
          <Dropdown overlay={menu} trigger={['click']}>
            <Button type="text" icon={<MoreOutlined />} />
          </Dropdown>
        );
      },
    },
  ];

  const handleSendReminder = async (customer) => {
    try {
      await FinancialAnalyticsService.sendReminderEmail(customer.customer_id);
      message.success('Reminder email sent');
  } catch {
      message.error('Failed to send reminder email');
    }
  };

  const handleCallCustomer = (customer) => {
    if (customer.customer_phone) {
      window.open(`tel:${customer.customer_phone}`);
    } else {
      message.warning('No phone number available');
    }
  };

  const handleViewCustomer = (customer) => {
    // Navigate to customer profile - implement based on your routing
    window.open(`/customers/${customer.customer_id}`, '_blank');
  };

  // Row selection
  const rowSelection = {
    selectedRowKeys: selectedRows,
    onChange: setSelectedRows,
    getCheckboxProps: (record) => ({
      disabled: parseFloat(record.outstanding_balance) <= 0,
    }),
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold text-gray-800">Outstanding Balances</h2>
        <Button 
          icon={<ReloadOutlined />} 
          onClick={fetchData}
          loading={loading}
        >
          Refresh
        </Button>
      </div>

      {/* Summary Cards */}
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="Total Outstanding"
              value={parseFloat(summary.total_outstanding) || 0}
              formatter={(value) => formatCurrency(value)}
              valueStyle={{ color: '#cf1322' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="Customers with Debt"
              value={summary.customers_with_debt || 0}
              suffix={`/ ${summary.total_customers || 0}`}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="Average Debt"
              value={parseFloat(summary.average_debt) || 0}
              formatter={(value) => formatCurrency(value)}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="Critical Cases"
              value={summary.critical_cases || 0}
              valueStyle={{ color: summary.critical_cases > 0 ? '#cf1322' : '#3f8600' }}
            />
          </Card>
        </Col>
      </Row>

      {/* Filters and Actions */}
      <Card>
        <div className="flex flex-wrap gap-4 items-center justify-between">
          <div className="flex flex-wrap gap-4 items-center">
            <Search
              placeholder="Search customers..."
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              style={{ width: 250 }}
              prefix={<SearchOutlined />}
            />
            
            <Select
              value={statusFilter}
              onChange={setStatusFilter}
              style={{ width: 150 }}
            >
              <Option value="all">All Statuses</Option>
              <Option value="positive">Positive Balance</Option>
              <Option value="negative">Credit Balance</Option>
              <Option value="overdue">Overdue</Option>
              <Option value="recent">Recent (≤7 days)</Option>
              <Option value="critical">Critical (&gt;{getCurrencySymbol(businessCurrency || 'EUR')}100, &gt;30 days)</Option>
            </Select>
            
            <Select
              value={sortOrder}
              onChange={setSortOrder}
              style={{ width: 150 }}
            >
              <Option value="desc">Highest First</Option>
              <Option value="asc">Lowest First</Option>
            </Select>
          </div>

          <Space>
            <Button
              icon={<MailOutlined />}
              onClick={handleBulkEmail}
              disabled={selectedRows.length === 0}
            >
              Send Reminders ({selectedRows.length})
            </Button>
            <Button
              icon={<DownloadOutlined />}
              onClick={handleExportData}
            >
              Export
            </Button>
          </Space>
        </div>
      </Card>

      {/* Outstanding Balances Table */}
      <UnifiedTable title="Outstanding balances" density="comfortable">
        <Table
          columns={columns}
          dataSource={filteredData}
          rowKey="customer_id"
          loading={loading}
          rowSelection={rowSelection}
          pagination={{
            showSizeChanger: true,
            showQuickJumper: true,
            showTotal: (total, range) => 
              `${range[0]}-${range[1]} of ${total} customers`,
          }}
          scroll={{ x: 1000 }}
        />
      </UnifiedTable>

      {/* Payment Recording Modal */}
      <Modal
        title={`Record Payment - ${selectedCustomer?.customer_name}`}
        open={paymentModalVisible}
        onCancel={() => {
          setPaymentModalVisible(false);
          form.resetFields();
        }}
        footer={null}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleRecordPayment}
        >
          <Form.Item
            name="amount"
            label="Payment Amount"
            rules={[
              { required: true, message: 'Please enter payment amount' },
              { type: 'number', min: 0.01, message: 'Amount must be greater than 0' }
            ]}
          >
            <InputNumber
              style={{ width: '100%' }}
              addonBefore={getCurrencySymbol(businessCurrency || 'EUR')}
            />
          </Form.Item>

          <Form.Item
            name="paymentDate"
            label="Payment Date"
            rules={[{ required: true, message: 'Please select payment date' }]}
          >
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>

          <Form.Item
            name="method"
            label="Payment Method"
            rules={[{ required: true, message: 'Please select payment method' }]}
          >
            <Select>
              <Option value="cash">Cash</Option>
              <Option value="card">Card</Option>
              <Option value="bank_transfer">Bank Transfer</Option>
              <Option value="online">Online Payment</Option>
              <Option value="other">Other</Option>
            </Select>
          </Form.Item>

          <Form.Item
            name="notes"
            label="Notes"
          >
            <Input.TextArea rows={3} />
          </Form.Item>

          <Form.Item>
            <Space className="w-full justify-end">
              <Button onClick={() => setPaymentModalVisible(false)}>
                Cancel
              </Button>
              <Button type="primary" htmlType="submit">
                Record Payment
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

export default OutstandingBalancesManager;
