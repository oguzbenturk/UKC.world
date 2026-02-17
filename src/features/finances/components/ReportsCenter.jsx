// src/features/finances/components/ReportsCenter.jsx
import { useState, useEffect } from 'react';
import { 
  Card, 
  Tabs, 
  Button, 
  Select, 
  DatePicker, 
  Form, 
  Input, 
  Row, 
  Col, 
  Table, 
  Tag, 
  Space, 
  Modal, 
  Tooltip,
  Dropdown,
  Menu,
  Switch,
  TimePicker,
  Grid
} from 'antd';
import { message } from '@/shared/utils/antdStatic';
import {
  DownloadOutlined,
  ScheduleOutlined,
  FileTextOutlined,
  FilePdfOutlined,
  FileExcelOutlined,
  SettingOutlined,
  PlayCircleOutlined,
  DeleteOutlined,
  EyeOutlined,
  EditOutlined,
  PlusOutlined
} from '@ant-design/icons';
import ReportingService from '../services/reportingService';
import { formatDate } from '@/shared/utils/formatters';
import UnifiedTable from '@/shared/components/tables/UnifiedTable';

const { Option } = Select;
const { RangePicker } = DatePicker;
const { TextArea } = Input;

function ReportsCenter() {
  const screens = Grid.useBreakpoint();
  const isMobile = !screens.md;
  const [loading, setLoading] = useState(false);
  const [scheduledReports, setScheduledReports] = useState([]);
  const [reportHistory, setReportHistory] = useState([]);
  const [generateModalVisible, setGenerateModalVisible] = useState(false);
  const [scheduleModalVisible, setScheduleModalVisible] = useState(false);
  const [selectedReport, setSelectedReport] = useState(null);
  const [form] = Form.useForm();
  const [scheduleForm] = Form.useForm();

  // Report types configuration
  const reportTypes = [
    {
      key: 'financial-summary',
      name: 'Financial Summary',
      description: 'Complete financial overview with revenue, expenses, and profit analysis',
      icon: <FileTextOutlined />,
      formats: ['pdf', 'excel', 'csv']
    },
    {
      key: 'revenue-analytics',
      name: 'Revenue Analytics',
      description: 'Detailed revenue analysis with trends and forecasting',
      icon: <FileTextOutlined />,
      formats: ['pdf', 'excel']
    },
    {
      key: 'customer-analytics',
      name: 'Customer Analytics',
      description: 'Customer behavior, CLV, and segmentation analysis',
      icon: <FileTextOutlined />,
      formats: ['pdf', 'excel', 'csv']
    },
    {
      key: 'operational-metrics',
      name: 'Operational Metrics',
      description: 'Efficiency, utilization, and performance metrics',
      icon: <FileTextOutlined />,
      formats: ['pdf', 'excel']
    },
    {
      key: 'instructor-performance',
      name: 'Instructor Performance',
      description: 'Individual instructor metrics and commissions',
      icon: <FileTextOutlined />,
      formats: ['pdf', 'excel', 'csv']
    },
    {
      key: 'outstanding-balances',
      name: 'Outstanding Balances',
      description: 'Customer debt and credit analysis',
      icon: <FileTextOutlined />,
      formats: ['pdf', 'excel', 'csv']
    },
    {
      key: 'inventory-valuation',
      name: 'Inventory Valuation',
      description: 'Equipment and inventory financial analysis',
      icon: <FileTextOutlined />,
      formats: ['pdf', 'excel']
    },
    {
      key: 'tax-report',
      name: 'Tax Report',
      description: 'Tax-ready financial statements and summaries',
      icon: <FileTextOutlined />,
      formats: ['pdf', 'excel']
    }
  ];

  // Fetch data
  useEffect(() => {
    fetchReportData();
  }, []);

  const fetchReportData = async () => {
    try {
      setLoading(true);
      const [scheduled, history] = await Promise.all([
        ReportingService.getScheduledReports(),
        ReportingService.getReportHistory()
      ]);
      setScheduledReports(scheduled || []);
      setReportHistory(history || []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  // Generate report immediately
  const handleGenerateReport = async (values) => {
    try {
      setLoading(true);
      const reportConfig = {
        type: values.reportType,
        format: values.format,
        dateRange: {
          startDate: values.dateRange[0].format('YYYY-MM-DD'),
          endDate: values.dateRange[1].format('YYYY-MM-DD')
        },
        filters: values.filters || {},
        includeCharts: values.includeCharts || false,
        includeDetails: values.includeDetails || true
      };

      const reportUrl = await ReportingService.generateReport(reportConfig);
      
      // Download the report
      const link = document.createElement('a');
      link.href = reportUrl;
      link.download = `${values.reportType}-${new Date().toISOString().split('T')[0]}.${values.format}`;
      link.click();
      
      message.success('Report generated successfully');
      setGenerateModalVisible(false);
      form.resetFields();
      fetchReportData();
  } catch {
      message.error('Failed to generate report');
    } finally {
      setLoading(false);
    }
  };

  // Schedule report
  const handleScheduleReport = async (values) => {
    try {
      setLoading(true);
      const scheduleConfig = {
        name: values.name,
        type: values.reportType,
        format: values.format,
        frequency: values.frequency,
        time: values.time?.format('HH:mm'),
        dayOfWeek: values.dayOfWeek,
        dayOfMonth: values.dayOfMonth,
        recipients: values.recipients?.split(',').map(email => email.trim()),
        includeCharts: values.includeCharts || false,
        includeDetails: values.includeDetails || true,
        active: true
      };

      await ReportingService.scheduleReport(scheduleConfig);
      
      message.success('Report scheduled successfully');
      setScheduleModalVisible(false);
      scheduleForm.resetFields();
      fetchReportData();
  } catch {
      message.error('Failed to schedule report');
    } finally {
      setLoading(false);
    }
  };

  // Toggle scheduled report
  const handleToggleSchedule = async (reportId, active) => {
    try {
      await ReportingService.updateScheduledReport(reportId, { active });
      message.success(`Report ${active ? 'activated' : 'paused'}`);
      fetchReportData();
  } catch {
      message.error('Failed to update report schedule');
    }
  };

  // Delete scheduled report
  const handleDeleteSchedule = async (reportId) => {
    try {
      await ReportingService.deleteScheduledReport(reportId);
      message.success('Scheduled report deleted');
      fetchReportData();
  } catch {
      message.error('Failed to delete scheduled report');
    }
  };

  // Download from history
  const handleDownloadFromHistory = async (reportId) => {
    try {
      const downloadUrl = await ReportingService.downloadReport(reportId);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.click();
  } catch {
      message.error('Failed to download report');
    }
  };

  // Column helpers extracted to lower component complexity
  const renderFormat = (format) => {
    const icons = {
      pdf: <FilePdfOutlined style={{ color: '#ff4d4f' }} />,
      excel: <FileExcelOutlined style={{ color: 'var(--brand-success)' }} />,
      csv: <FileTextOutlined style={{ color: 'var(--brand-primary)' }} />
    };
    return (
      <Space>
        {icons[format]}
        {format?.toUpperCase() || 'Unknown'}
      </Space>
    );
  };

  const renderFrequency = (frequency, record) => {
    const freqMap = {
      daily: 'Daily',
      weekly: `Weekly (${record.dayOfWeek})`,
      monthly: `Monthly (${record.dayOfMonth}th)`,
      quarterly: 'Quarterly',
      yearly: 'Yearly'
    };
    return freqMap[frequency] || frequency;
  };

  // Scheduled reports table columns
  const scheduledColumns = [
    {
      title: 'Report Name',
      dataIndex: 'name',
      key: 'name',
      render: (name, record) => (
        <div>
          <div className="font-medium">{name}</div>
          <div className="text-sm text-gray-500">{record.type}</div>
        </div>
      )
    },
  { title: 'Frequency', dataIndex: 'frequency', key: 'frequency', render: renderFrequency },
    {
      title: 'Format',
      dataIndex: 'format',
      key: 'format',
      render: renderFormat
    },
    {
      title: 'Recipients',
      dataIndex: 'recipients',
      key: 'recipients',
      render: (recipients) => (
        <Tooltip title={recipients?.join(', ')}>
          <Tag>{recipients?.length || 0} recipients</Tag>
        </Tooltip>
      )
    },
    {
      title: 'Next Run',
      dataIndex: 'nextRun',
      key: 'nextRun',
      render: (date) => (date ? formatDate(date) : 'Not scheduled')
    },
    {
      title: 'Status',
      dataIndex: 'active',
      key: 'active',
      render: (active, record) => (
        <Switch
          checked={active}
          onChange={(checked) => handleToggleSchedule(record.id, checked)}
          checkedChildren="Active"
          unCheckedChildren="Paused"
        />
      )
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_, record) => {
        const menu = (
          <Menu>
            <Menu.Item 
              key="edit" 
              icon={<EditOutlined />}
              onClick={() => {
                setSelectedReport(record);
                scheduleForm.setFieldsValue(record);
                setScheduleModalVisible(true);
              }}
            >
              Edit
            </Menu.Item>
            <Menu.Item 
              key="run" 
              icon={<PlayCircleOutlined />}
              onClick={() => handleRunNow(record)}
            >
              Run Now
            </Menu.Item>
            <Menu.Divider />
            <Menu.Item 
              key="delete" 
              icon={<DeleteOutlined />}
              danger
              onClick={() => handleDeleteSchedule(record.id)}
            >
              Delete
            </Menu.Item>
          </Menu>
        );

        return (
          <Dropdown overlay={menu} trigger={["click"]}>
            <Button type="text" icon={<SettingOutlined />} />
          </Dropdown>
        );
      }
    }
  ];

  // Report history table columns
  const historyColumns = [
    {
      title: 'Report',
      dataIndex: 'name',
      key: 'name',
      render: (name, record) => (
        <div>
          <div className="font-medium">{name}</div>
          <div className="text-sm text-gray-500">{record.type}</div>
        </div>
      )
    },
    {
      title: 'Generated',
      dataIndex: 'createdAt',
      key: 'createdAt',
      render: (date) => formatDate(date),
      sorter: (a, b) => new Date(a.createdAt) - new Date(b.createdAt)
    },
    {
      title: 'Period',
      key: 'period',
      render: (_, record) => `${formatDate(record.startDate)} - ${formatDate(record.endDate)}`
    },
    {
      title: 'Format',
      dataIndex: 'format',
      key: 'format',
      render: renderFormat
    },
    {
      title: 'Size',
      dataIndex: 'fileSize',
      key: 'fileSize',
      render: (size) => `${(size / 1024).toFixed(1)} KB`
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      render: (status) => {
        const statusColors = {
          completed: 'success',
          failed: 'error',
          processing: 'processing'
        };
        return <Tag color={statusColors[status]}>{status.toUpperCase()}</Tag>;
      }
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_, record) => (
        <Space>
          <Button 
            type="text" 
            icon={<DownloadOutlined />}
            onClick={() => handleDownloadFromHistory(record.id)}
            disabled={record.status !== 'completed'}
          >
            Download
          </Button>
          <Button 
            type="text" 
            icon={<EyeOutlined />}
            onClick={() => handlePreviewReport(record)}
            disabled={record.status !== 'completed'}
          >
            Preview
          </Button>
        </Space>
      )
    }
  ];

  const handleRunNow = async (report) => {
    try {
      await ReportingService.runScheduledReport(report.id);
      message.success('Report generation started');
      fetchReportData();
    } catch {
      message.error('Failed to run report');
    }
  };

  const handlePreviewReport = (_report) => {
    // Implement report preview functionality
    message.info('Preview functionality coming soon');
  };

  // Tabs items generator (extracted to lower component complexity)
  const getTabsItems = () => ([
    {
      key: 'scheduled',
      label: 'Scheduled Reports',
      children: (
        <UnifiedTable density={isMobile ? 'compact' : 'comfortable'}>
          <Table
            size={isMobile ? 'small' : 'middle'}
            columns={scheduledColumns}
            dataSource={scheduledReports}
            rowKey="id"
            loading={loading}
            pagination={{
              showSizeChanger: true,
              showQuickJumper: true
            }}
            scroll={{ x: isMobile ? 'max-content' : undefined }}
          />
        </UnifiedTable>
      )
    },
    {
      key: 'history',
      label: 'Report History',
      children: (
        <UnifiedTable density={isMobile ? 'compact' : 'comfortable'}>
          <Table
            size={isMobile ? 'small' : 'middle'}
            columns={historyColumns}
            dataSource={reportHistory}
            rowKey="id"
            loading={loading}
            pagination={{
              showSizeChanger: true,
              showQuickJumper: true,
              showTotal: (total, range) => 
                `${range[0]}-${range[1]} of ${total} reports`
            }}
            scroll={{ x: isMobile ? 'max-content' : undefined }}
          />
        </UnifiedTable>
      )
    }
  ]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className={`w-full ${isMobile ? 'flex flex-col gap-2 items-start' : 'flex justify-between items-center'}`}>
        <h2 className={`${isMobile ? 'text-lg' : 'text-xl'} font-semibold text-gray-800`}>Reports Center</h2>
        <Space wrap size={isMobile ? 'small' : 'middle'} className={`${isMobile ? 'w-full justify-start' : ''}`}>
          <Button 
            size={isMobile ? 'small' : 'middle'}
            type="primary" 
            icon={<PlusOutlined />}
            onClick={() => setGenerateModalVisible(true)}
          >
            {isMobile ? 'Generate' : 'Generate Report'}
          </Button>
          <Button 
            size={isMobile ? 'small' : 'middle'}
            icon={<ScheduleOutlined />}
            onClick={() => setScheduleModalVisible(true)}
          >
            {isMobile ? 'Schedule' : 'Schedule Report'}
          </Button>
        </Space>
      </div>

      {/* Report Types Grid */}
      <Card title="Available Reports">
        <Row gutter={[16, 16]}>
          {reportTypes.map(report => (
            <Col xs={24} sm={12} lg={8} xl={6} key={report.key}>
              <Card 
                size="small" 
                hoverable
                className="h-full"
                actions={[
                  <Button 
                    key={`generate-${report.key}`}
                    type="text" 
                    icon={<PlayCircleOutlined />}
                    onClick={() => {
                      form.setFieldValue('reportType', report.key);
                      setGenerateModalVisible(true);
                    }}
                  >
                    Generate
                  </Button>
                ]}
              >
                <div className="text-center">
                  <div className="text-2xl mb-2">{report.icon}</div>
                  <div className="font-medium mb-1">{report.name}</div>
                  <div className="text-sm text-gray-500">{report.description}</div>
                  <div className="mt-2">
                    <Space size="small">
                      {report.formats.map(format => (
                        <Tag key={format} size="small">
                          {format?.toUpperCase() || 'Unknown'}
                        </Tag>
                      ))}
                    </Space>
                  </div>
                </div>
              </Card>
            </Col>
          ))}
        </Row>
      </Card>

      {/* Tabs for Scheduled Reports and History */}
      <Card>
          <Tabs 
            defaultActiveKey="scheduled"
            items={getTabsItems()}
          />
      </Card>

      {/* Generate Report Modal */}
      <Modal
        title="Generate Report"
        open={generateModalVisible}
        onCancel={() => {
          setGenerateModalVisible(false);
          form.resetFields();
        }}
        footer={null}
        width={600}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleGenerateReport}
        >
          <Form.Item
            name="reportType"
            label="Report Type"
            rules={[{ required: true, message: 'Please select a report type' }]}
          >
            <Select placeholder="Select report type">
              {reportTypes.map(report => (
                <Option key={report.key} value={report.key}>
                  {report.name}
                </Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item
            name="dateRange"
            label="Date Range"
            rules={[{ required: true, message: 'Please select date range' }]}
          >
            <RangePicker style={{ width: '100%' }} />
          </Form.Item>

          <Form.Item
            name="format"
            label="Format"
            rules={[{ required: true, message: 'Please select format' }]}
          >
            <Select placeholder="Select format">
              <Option value="pdf">PDF</Option>
              <Option value="excel">Excel</Option>
              <Option value="csv">CSV</Option>
            </Select>
          </Form.Item>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="includeCharts" valuePropName="checked">
                <Switch /> Include Charts
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="includeDetails" valuePropName="checked" initialValue={true}>
                <Switch /> Include Details
              </Form.Item>
            </Col>
          </Row>

          <Form.Item>
            <Space className="w-full justify-end">
              <Button onClick={() => setGenerateModalVisible(false)}>
                Cancel
              </Button>
              <Button type="primary" htmlType="submit" loading={loading}>
                Generate Report
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      {/* Schedule Report Modal */}
      <Modal
        title="Schedule Report"
        open={scheduleModalVisible}
        onCancel={() => {
          setScheduleModalVisible(false);
          scheduleForm.resetFields();
          setSelectedReport(null);
        }}
        footer={null}
        width={700}
      >
        <Form
          form={scheduleForm}
          layout="vertical"
          onFinish={handleScheduleReport}
        >
          <Form.Item
            name="name"
            label="Report Name"
            rules={[{ required: true, message: 'Please enter report name' }]}
          >
            <Input placeholder="Enter report name" />
          </Form.Item>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="reportType"
                label="Report Type"
                rules={[{ required: true, message: 'Please select a report type' }]}
              >
                <Select placeholder="Select report type">
                  {reportTypes.map(report => (
                    <Option key={report.key} value={report.key}>
                      {report.name}
                    </Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
            
            <Col span={12}>
              <Form.Item
                name="format"
                label="Format"
                rules={[{ required: true, message: 'Please select format' }]}
              >
                <Select placeholder="Select format">
                  <Option value="pdf">PDF</Option>
                  <Option value="excel">Excel</Option>
                  <Option value="csv">CSV</Option>
                </Select>
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="frequency"
                label="Frequency"
                rules={[{ required: true, message: 'Please select frequency' }]}
              >
                <Select placeholder="Select frequency">
                  <Option value="daily">Daily</Option>
                  <Option value="weekly">Weekly</Option>
                  <Option value="monthly">Monthly</Option>
                  <Option value="quarterly">Quarterly</Option>
                  <Option value="yearly">Yearly</Option>
                </Select>
              </Form.Item>
            </Col>
            
            <Col span={12}>
              <Form.Item
                name="time"
                label="Time"
                rules={[{ required: true, message: 'Please select time' }]}
              >
                <TimePicker style={{ width: '100%' }} format="HH:mm" />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item
            name="recipients"
            label="Email Recipients"
            rules={[{ required: true, message: 'Please enter email recipients' }]}
          >
            <TextArea 
              placeholder="Enter email addresses separated by commas"
              rows={2}
            />
          </Form.Item>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="includeCharts" valuePropName="checked">
                <Switch /> Include Charts
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="includeDetails" valuePropName="checked" initialValue={true}>
                <Switch /> Include Details
              </Form.Item>
            </Col>
          </Row>

          <Form.Item>
            <Space className="w-full justify-end">
              <Button onClick={() => setScheduleModalVisible(false)}>
                Cancel
              </Button>
              <Button type="primary" htmlType="submit" loading={loading}>
                {selectedReport ? 'Update Schedule' : 'Schedule Report'}
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

export default ReportsCenter;
