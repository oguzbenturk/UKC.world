// src/features/finances/components/OutstandingBalancesManager.jsx
import { useTranslation } from 'react-i18next';
import Decimal from 'decimal.js';
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
  const { t } = useTranslation(['manager']);
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
      message.error(t('manager:outstandingBalances.messages.loadError'));
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
        const balance = new Decimal(item.outstanding_balance || 0).toNumber();
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
      const aBalance = new Decimal(a.outstanding_balance || 0).toNumber();
      const bBalance = new Decimal(b.outstanding_balance || 0).toNumber();
      return sortOrder === 'desc' ? bBalance - aBalance : aBalance - bBalance;
    });

    setFilteredData(filtered);
  }, [data, searchText, statusFilter, sortOrder]);

  // Get risk level based on balance and days overdue
  const getRiskLevel = (balance, daysOverdue) => {
    const amount = new Decimal(balance || 0).toNumber();
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
      
      message.success(t('manager:outstandingBalances.messages.paymentRecorded'));
      setPaymentModalVisible(false);
      form.resetFields();
      fetchData();
  } catch {
      message.error(t('manager:outstandingBalances.messages.paymentError'));
    }
  };

  // Bulk operations
  const handleBulkEmail = async () => {
    if (selectedRows.length === 0) {
      message.warning(t('manager:outstandingBalances.messages.selectCustomers'));
      return;
    }

    try {
      await FinancialAnalyticsService.sendReminderEmails(selectedRows);
      message.success(t('manager:outstandingBalances.messages.bulkReminderSent', { count: selectedRows.length }));
  } catch {
      message.error(t('manager:outstandingBalances.messages.bulkReminderError'));
    }
  };

  const handleExportData = async () => {
    try {
      const exportData = selectedRows.length > 0 
        ? filteredData.filter(item => selectedRows.includes(item.customer_id))
        : filteredData;
      
      await ReportingService.exportToCSV(exportData, 'outstanding-balances');
      message.success(t('manager:outstandingBalances.messages.exportSuccess'));
  } catch {
      message.error(t('manager:outstandingBalances.messages.exportError'));
    }
  };

  // Table columns
  const columns = [
    {
      title: t('manager:outstandingBalances.columns.customer'),
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
      title: t('manager:outstandingBalances.columns.outstandingBalance'),
      dataIndex: 'outstanding_balance',
      key: 'outstanding_balance',
      render: (balance) => {
        const amount = new Decimal(balance || 0).toNumber();
        return (
          <span className={amount > 0 ? 'text-red-600 font-semibold' : 'text-green-600'}>
            {formatCurrency(amount)}
          </span>
        );
      },
      sorter: (a, b) => new Decimal(a.outstanding_balance || 0).minus(new Decimal(b.outstanding_balance || 0)).toNumber(),
    },
    {
      title: t('manager:outstandingBalances.columns.daysOverdue'),
      dataIndex: 'days_overdue',
      key: 'days_overdue',
      render: (days) => {
        if (days <= 0) return <span className="text-gray-500">-</span>;
        const daysText = t('manager:outstandingBalances.days', { count: days });
        if (days <= 7) return <Badge status="processing" text={daysText} />;
        if (days <= 30) return <Badge status="warning" text={daysText} />;
        return <Badge status="error" text={daysText} />;
      },
      sorter: (a, b) => a.days_overdue - b.days_overdue,
    },
    {
      title: t('manager:outstandingBalances.columns.riskLevel'),
      key: 'risk_level',
      render: (_, record) => {
        const risk = getRiskLevel(record.outstanding_balance, record.days_overdue);
        return (
          <Badge
            color={risk.color}
            text={t(`manager:outstandingBalances.riskLevels.${risk.level}`)}
          />
        );
      },
    },
    {
      title: t('manager:outstandingBalances.columns.lastPayment'),
      dataIndex: 'last_payment_date',
      key: 'last_payment_date',
      render: (date) => date ? formatDate(date) : t('manager:outstandingBalances.noPayments'),
    },
    {
      title: t('manager:outstandingBalances.columns.totalBookings'),
      dataIndex: 'total_bookings',
      key: 'total_bookings',
      render: (count, record) => (
        <Tooltip title={`Total value: ${formatCurrency(record.total_booking_value)}`}>
          <span>{count}</span>
        </Tooltip>
      ),
    },
    {
      title: t('manager:outstandingBalances.columns.actions'),
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
              {t('manager:outstandingBalances.actions.recordPayment')}
            </Menu.Item>
            <Menu.Item
              key="email"
              icon={<MailOutlined />}
              onClick={() => handleSendReminder(record)}
            >
              {t('manager:outstandingBalances.actions.sendReminder')}
            </Menu.Item>
            <Menu.Item
              key="call"
              icon={<PhoneOutlined />}
              onClick={() => handleCallCustomer(record)}
            >
              {t('manager:outstandingBalances.actions.callCustomer')}
            </Menu.Item>
            <Menu.Item
              key="view"
              icon={<EyeOutlined />}
              onClick={() => handleViewCustomer(record)}
            >
              {t('manager:outstandingBalances.actions.viewProfile')}
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
      message.success(t('manager:outstandingBalances.messages.reminderSent'));
  } catch {
      message.error(t('manager:outstandingBalances.messages.reminderError'));
    }
  };

  const handleCallCustomer = (customer) => {
    if (customer.customer_phone) {
      window.open(`tel:${customer.customer_phone}`);
    } else {
      message.warning(t('manager:outstandingBalances.noPhone'));
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
        <h2 className="text-xl font-semibold text-gray-800">{t('manager:outstandingBalances.title')}</h2>
        <Button
          icon={<ReloadOutlined />}
          onClick={fetchData}
          loading={loading}
        >
          {t('manager:outstandingBalances.refresh')}
        </Button>
      </div>

      {/* Summary Cards */}
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title={t('manager:outstandingBalances.stats.totalOutstanding')}
              value={parseFloat(summary.total_outstanding) || 0}
              formatter={(value) => formatCurrency(value)}
              valueStyle={{ color: '#cf1322' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title={t('manager:outstandingBalances.stats.customersWithDebt')}
              value={summary.customers_with_debt || 0}
              suffix={`/ ${summary.total_customers || 0}`}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title={t('manager:outstandingBalances.stats.averageDebt')}
              value={parseFloat(summary.average_debt) || 0}
              formatter={(value) => formatCurrency(value)}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title={t('manager:outstandingBalances.stats.criticalCases')}
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
              placeholder={t('manager:outstandingBalances.searchPlaceholder')}
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
              <Option value="all">{t('manager:outstandingBalances.allStatuses')}</Option>
              <Option value="positive">{t('manager:outstandingBalances.positiveBalance')}</Option>
              <Option value="negative">{t('manager:outstandingBalances.creditBalance')}</Option>
              <Option value="overdue">{t('manager:outstandingBalances.overdue')}</Option>
              <Option value="recent">{t('manager:outstandingBalances.recent')}</Option>
              <Option value="critical">{t('manager:outstandingBalances.critical', { symbol: getCurrencySymbol(businessCurrency || 'EUR') })}</Option>
            </Select>

            <Select
              value={sortOrder}
              onChange={setSortOrder}
              style={{ width: 150 }}
            >
              <Option value="desc">{t('manager:outstandingBalances.highestFirst')}</Option>
              <Option value="asc">{t('manager:outstandingBalances.lowestFirst')}</Option>
            </Select>
          </div>

          <Space>
            <Button
              icon={<MailOutlined />}
              onClick={handleBulkEmail}
              disabled={selectedRows.length === 0}
            >
              {t('manager:outstandingBalances.sendReminders', { count: selectedRows.length })}
            </Button>
            <Button
              icon={<DownloadOutlined />}
              onClick={handleExportData}
            >
              {t('manager:outstandingBalances.export')}
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
              t('manager:outstandingBalances.pagination.showTotal', { start: range[0], end: range[1], total }),
          }}
          scroll={{ x: 1000 }}
        />
      </UnifiedTable>

      {/* Payment Recording Modal */}
      <Modal
        title={t('manager:outstandingBalances.paymentModal.title', { name: selectedCustomer?.customer_name })}
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
            label={t('manager:outstandingBalances.paymentModal.amount')}
            rules={[
              { required: true, message: t('manager:outstandingBalances.paymentModal.validation.enterAmount') },
              { type: 'number', min: 0.01, message: t('manager:outstandingBalances.paymentModal.validation.amountMin') }
            ]}
          >
            <InputNumber
              style={{ width: '100%' }}
              addonBefore={getCurrencySymbol(businessCurrency || 'EUR')}
            />
          </Form.Item>

          <Form.Item
            name="paymentDate"
            label={t('manager:outstandingBalances.paymentModal.date')}
            rules={[{ required: true, message: t('manager:outstandingBalances.paymentModal.validation.selectDate') }]}
          >
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>

          <Form.Item
            name="method"
            label={t('manager:outstandingBalances.paymentModal.method')}
            rules={[{ required: true, message: t('manager:outstandingBalances.paymentModal.validation.selectMethod') }]}
          >
            <Select>
              <Option value="cash">{t('manager:outstandingBalances.paymentModal.methods.cash')}</Option>
              <Option value="card">{t('manager:outstandingBalances.paymentModal.methods.card')}</Option>
              <Option value="bank_transfer">{t('manager:outstandingBalances.paymentModal.methods.bank_transfer')}</Option>
              <Option value="online">{t('manager:outstandingBalances.paymentModal.methods.online')}</Option>
              <Option value="other">{t('manager:outstandingBalances.paymentModal.methods.other')}</Option>
            </Select>
          </Form.Item>

          <Form.Item
            name="notes"
            label={t('manager:outstandingBalances.paymentModal.notes')}
          >
            <Input.TextArea rows={3} />
          </Form.Item>

          <Form.Item>
            <Space className="w-full justify-end">
              <Button onClick={() => setPaymentModalVisible(false)}>
                {t('manager:outstandingBalances.paymentModal.cancel')}
              </Button>
              <Button type="primary" htmlType="submit">
                {t('manager:outstandingBalances.paymentModal.submit')}
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

export default OutstandingBalancesManager;
