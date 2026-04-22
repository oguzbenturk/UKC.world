// src/features/finances/components/ReportsCenter.jsx
import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation(['manager']);
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
    { key: 'financial-summary', formats: ['pdf', 'excel', 'csv'] },
    { key: 'revenue-analytics', formats: ['pdf', 'excel'] },
    { key: 'customer-analytics', formats: ['pdf', 'excel', 'csv'] },
    { key: 'operational-metrics', formats: ['pdf', 'excel'] },
    { key: 'instructor-performance', formats: ['pdf', 'excel', 'csv'] },
    { key: 'outstanding-balances', formats: ['pdf', 'excel', 'csv'] },
    { key: 'inventory-valuation', formats: ['pdf', 'excel'] },
    { key: 'tax-report', formats: ['pdf', 'excel'] },
  ].map((r) => ({
    ...r,
    name: t(`manager:reportsCenter.reportTypes.${r.key}`),
    description: t(`manager:reportsCenter.reportDescriptions.${r.key}`),
    icon: <FileTextOutlined />,
  }));

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
      
      message.success(t('manager:reportsCenter.messages.generated'));
      setGenerateModalVisible(false);
      form.resetFields();
      fetchReportData();
  } catch {
      message.error(t('manager:reportsCenter.messages.generateError'));
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
      
      message.success(t('manager:reportsCenter.messages.scheduled'));
      setScheduleModalVisible(false);
      scheduleForm.resetFields();
      fetchReportData();
  } catch {
      message.error(t('manager:reportsCenter.messages.scheduleError'));
    } finally {
      setLoading(false);
    }
  };

  // Toggle scheduled report
  const handleToggleSchedule = async (reportId, active) => {
    try {
      await ReportingService.updateScheduledReport(reportId, { active });
      message.success(active ? t('manager:reportsCenter.messages.activated') : t('manager:reportsCenter.messages.paused'));
      fetchReportData();
  } catch {
      message.error(t('manager:reportsCenter.messages.toggleError'));
    }
  };

  // Delete scheduled report
  const handleDeleteSchedule = async (reportId) => {
    try {
      await ReportingService.deleteScheduledReport(reportId);
      message.success(t('manager:reportsCenter.messages.deleted'));
      fetchReportData();
  } catch {
      message.error(t('manager:reportsCenter.messages.deleteError'));
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
      message.error(t('manager:reportsCenter.messages.downloadError'));
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
      daily: t('manager:reportsCenter.frequency.daily'),
      weekly: t('manager:reportsCenter.frequency.weekly', { day: record.dayOfWeek }),
      monthly: t('manager:reportsCenter.frequency.monthly', { day: record.dayOfMonth }),
      quarterly: t('manager:reportsCenter.frequency.quarterly'),
      yearly: t('manager:reportsCenter.frequency.yearly'),
    };
    return freqMap[frequency] || frequency;
  };

  // Scheduled reports table columns
  const scheduledColumns = [
    {
      title: t('manager:reportsCenter.columns.reportName'),
      dataIndex: 'name',
      key: 'name',
      render: (name, record) => (
        <div>
          <div className="font-medium">{name}</div>
          <div className="text-sm text-gray-500">{record.type}</div>
        </div>
      )
    },
  { title: t('manager:reportsCenter.columns.frequency'), dataIndex: 'frequency', key: 'frequency', render: renderFrequency },
    {
      title: t('manager:reportsCenter.columns.format'),
      dataIndex: 'format',
      key: 'format',
      render: renderFormat
    },
    {
      title: t('manager:reportsCenter.columns.recipients'),
      dataIndex: 'recipients',
      key: 'recipients',
      render: (recipients) => (
        <Tooltip title={recipients?.join(', ')}>
          <Tag>{t('manager:reportsCenter.recipients', { count: recipients?.length || 0 })}</Tag>
        </Tooltip>
      )
    },
    {
      title: t('manager:reportsCenter.columns.nextRun'),
      dataIndex: 'nextRun',
      key: 'nextRun',
      render: (date) => (date ? formatDate(date) : t('manager:reportsCenter.notScheduled'))
    },
    {
      title: t('manager:reportsCenter.columns.status'),
      dataIndex: 'active',
      key: 'active',
      render: (active, record) => (
        <Switch
          checked={active}
          onChange={(checked) => handleToggleSchedule(record.id, checked)}
          checkedChildren={t('manager:reportsCenter.switchStatus.active')}
          unCheckedChildren={t('manager:reportsCenter.switchStatus.paused')}
        />
      )
    },
    {
      title: t('manager:reportsCenter.columns.actions'),
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
              {t('manager:reportsCenter.edit')}
            </Menu.Item>
            <Menu.Item
              key="run"
              icon={<PlayCircleOutlined />}
              onClick={() => handleRunNow(record)}
            >
              {t('manager:reportsCenter.runNow')}
            </Menu.Item>
            <Menu.Divider />
            <Menu.Item
              key="delete"
              icon={<DeleteOutlined />}
              danger
              onClick={() => handleDeleteSchedule(record.id)}
            >
              {t('manager:reportsCenter.delete')}
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
      title: t('manager:reportsCenter.columns.report'),
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
      title: t('manager:reportsCenter.columns.generated'),
      dataIndex: 'createdAt',
      key: 'createdAt',
      render: (date) => formatDate(date),
      sorter: (a, b) => new Date(a.createdAt) - new Date(b.createdAt)
    },
    {
      title: t('manager:reportsCenter.columns.period'),
      key: 'period',
      render: (_, record) => `${formatDate(record.startDate)} - ${formatDate(record.endDate)}`
    },
    {
      title: t('manager:reportsCenter.columns.format'),
      dataIndex: 'format',
      key: 'format',
      render: renderFormat
    },
    {
      title: t('manager:reportsCenter.columns.size'),
      dataIndex: 'fileSize',
      key: 'fileSize',
      render: (size) => `${(size / 1024).toFixed(1)} KB`
    },
    {
      title: t('manager:reportsCenter.columns.status'),
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
      title: t('manager:reportsCenter.columns.actions'),
      key: 'actions',
      render: (_, record) => (
        <Space>
          <Button
            type="text"
            icon={<DownloadOutlined />}
            onClick={() => handleDownloadFromHistory(record.id)}
            disabled={record.status !== 'completed'}
          >
            {t('manager:reportsCenter.download')}
          </Button>
          <Button
            type="text"
            icon={<EyeOutlined />}
            onClick={() => handlePreviewReport(record)}
            disabled={record.status !== 'completed'}
          >
            {t('manager:reportsCenter.preview')}
          </Button>
        </Space>
      )
    }
  ];

  const handleRunNow = async (report) => {
    try {
      await ReportingService.runScheduledReport(report.id);
      message.success(t('manager:reportsCenter.messages.runStarted'));
      fetchReportData();
    } catch {
      message.error(t('manager:reportsCenter.messages.runError'));
    }
  };

  const handlePreviewReport = (_report) => {
    // Implement report preview functionality
    message.info(t('manager:reportsCenter.messages.previewComingSoon'));
  };

  // Tabs items generator (extracted to lower component complexity)
  const getTabsItems = () => ([
    {
      key: 'scheduled',
      label: t('manager:reportsCenter.scheduledReports'),
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
      label: t('manager:reportsCenter.reportHistory'),
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
                t('manager:reportsCenter.pagination.showTotal', { start: range[0], end: range[1], total })
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
        <h2 className={`${isMobile ? 'text-lg' : 'text-xl'} font-semibold text-gray-800`}>{t('manager:reportsCenter.title')}</h2>
        <Space wrap size={isMobile ? 'small' : 'middle'} className={`${isMobile ? 'w-full justify-start' : ''}`}>
          <Button
            size={isMobile ? 'small' : 'middle'}
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => setGenerateModalVisible(true)}
          >
            {isMobile ? t('manager:reportsCenter.generateShort') : t('manager:reportsCenter.generateReport')}
          </Button>
          <Button
            size={isMobile ? 'small' : 'middle'}
            icon={<ScheduleOutlined />}
            onClick={() => setScheduleModalVisible(true)}
          >
            {isMobile ? t('manager:reportsCenter.scheduleShort') : t('manager:reportsCenter.scheduleReport')}
          </Button>
        </Space>
      </div>

      {/* Report Types Grid */}
      <Card title={t('manager:reportsCenter.availableReports')}>
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
                    {t('manager:reportsCenter.generate')}
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
        title={t('manager:reportsCenter.generateReport')}
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
            label={t('manager:reportsCenter.form.reportType')}
            rules={[{ required: true, message: t('manager:reportsCenter.form.validation.selectReportType') }]}
          >
            <Select placeholder={t('manager:reportsCenter.form.selectReportType')}>
              {reportTypes.map(report => (
                <Option key={report.key} value={report.key}>
                  {report.name}
                </Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item
            name="dateRange"
            label={t('manager:reportsCenter.form.dateRange')}
            rules={[{ required: true, message: t('manager:reportsCenter.form.validation.selectDateRange') }]}
          >
            <RangePicker style={{ width: '100%' }} />
          </Form.Item>

          <Form.Item
            name="format"
            label={t('manager:reportsCenter.form.format')}
            rules={[{ required: true, message: t('manager:reportsCenter.form.validation.selectFormat') }]}
          >
            <Select placeholder={t('manager:reportsCenter.form.selectFormat')}>
              <Option value="pdf">PDF</Option>
              <Option value="excel">Excel</Option>
              <Option value="csv">CSV</Option>
            </Select>
          </Form.Item>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="includeCharts" valuePropName="checked">
                <Switch /> {t('manager:reportsCenter.form.includeCharts')}
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="includeDetails" valuePropName="checked" initialValue={true}>
                <Switch /> {t('manager:reportsCenter.form.includeDetails')}
              </Form.Item>
            </Col>
          </Row>

          <Form.Item>
            <Space className="w-full justify-end">
              <Button onClick={() => setGenerateModalVisible(false)}>
                {t('manager:reportsCenter.cancel')}
              </Button>
              <Button type="primary" htmlType="submit" loading={loading}>
                {t('manager:reportsCenter.generateReport')}
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      {/* Schedule Report Modal */}
      <Modal
        title={t('manager:reportsCenter.scheduleReport')}
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
            label={t('manager:reportsCenter.form.reportName')}
            rules={[{ required: true, message: t('manager:reportsCenter.form.validation.enterName') }]}
          >
            <Input placeholder={t('manager:reportsCenter.form.enterReportName')} />
          </Form.Item>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="reportType"
                label={t('manager:reportsCenter.form.reportType')}
                rules={[{ required: true, message: t('manager:reportsCenter.form.validation.selectReportType') }]}
              >
                <Select placeholder={t('manager:reportsCenter.form.selectReportType')}>
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
                label={t('manager:reportsCenter.form.format')}
                rules={[{ required: true, message: t('manager:reportsCenter.form.validation.selectFormat') }]}
              >
                <Select placeholder={t('manager:reportsCenter.form.selectFormat')}>
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
                label={t('manager:reportsCenter.columns.frequency')}
                rules={[{ required: true, message: t('manager:reportsCenter.form.validation.selectFrequency') }]}
              >
                <Select placeholder={t('manager:reportsCenter.form.selectFrequency')}>
                  <Option value="daily">{t('manager:reportsCenter.frequency.daily')}</Option>
                  <Option value="weekly">{t('manager:reportsCenter.frequency.weekly', { day: '' }).trim()}</Option>
                  <Option value="monthly">{t('manager:reportsCenter.frequency.monthly', { day: '' }).trim()}</Option>
                  <Option value="quarterly">{t('manager:reportsCenter.frequency.quarterly')}</Option>
                  <Option value="yearly">{t('manager:reportsCenter.frequency.yearly')}</Option>
                </Select>
              </Form.Item>
            </Col>

            <Col span={12}>
              <Form.Item
                name="time"
                label={t('manager:reportsCenter.form.time')}
                rules={[{ required: true, message: t('manager:reportsCenter.form.validation.selectTime') }]}
              >
                <TimePicker style={{ width: '100%' }} format="HH:mm" />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item
            name="recipients"
            label={t('manager:reportsCenter.form.emailRecipients')}
            rules={[{ required: true, message: t('manager:reportsCenter.form.validation.enterRecipients') }]}
          >
            <TextArea
              placeholder={t('manager:reportsCenter.form.recipientsPlaceholder')}
              rows={2}
            />
          </Form.Item>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="includeCharts" valuePropName="checked">
                <Switch /> {t('manager:reportsCenter.form.includeCharts')}
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="includeDetails" valuePropName="checked" initialValue={true}>
                <Switch /> {t('manager:reportsCenter.form.includeDetails')}
              </Form.Item>
            </Col>
          </Row>

          <Form.Item>
            <Space className="w-full justify-end">
              <Button onClick={() => setScheduleModalVisible(false)}>
                {t('manager:reportsCenter.cancel')}
              </Button>
              <Button type="primary" htmlType="submit" loading={loading}>
                {selectedReport ? t('manager:reportsCenter.updateSchedule') : t('manager:reportsCenter.scheduleReport')}
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

export default ReportsCenter;
