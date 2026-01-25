/**
 * Form Responses Page
 * Displays and manages form submissions
 */

import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Card,
  Table,
  Button,
  Space,
  Tag,
  Input,
  Select,
  DatePicker,
  Dropdown,
  Modal,
  Descriptions,
  Typography,
  Tooltip,
  Empty,
  Drawer,
  Row,
  Col
} from 'antd';
import { message } from '@/shared/utils/antdStatic';
import {
  ArrowLeftOutlined,
  SearchOutlined,
  DownloadOutlined,
  DeleteOutlined,
  EyeOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  InboxOutlined,
  MoreOutlined,
  ReloadOutlined
} from '@ant-design/icons';
import dayjs from 'dayjs';
import * as formService from '../services/formService';
import { logger } from '@/shared/utils/logger';

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;

const STATUS_CONFIG = {
  pending: { color: 'gold', icon: <ClockCircleOutlined />, label: 'Pending' },
  processed: { color: 'green', icon: <CheckCircleOutlined />, label: 'Processed' },
  archived: { color: 'default', icon: <InboxOutlined />, label: 'Archived' }
};

// eslint-disable-next-line complexity
const FormResponsesPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(null);
  const [submissions, setSubmissions] = useState([]);
  const [pagination, setPagination] = useState({ current: 1, pageSize: 20, total: 0 });
  const [filters, setFilters] = useState({
    status: undefined,
    search: '',
    dateRange: null
  });
  const [selectedRows, setSelectedRows] = useState([]);
  const [detailDrawer, setDetailDrawer] = useState({ visible: false, submission: null });
  const [exporting, setExporting] = useState(false);

  const fetchForm = useCallback(async () => {
    try {
      const data = await formService.getFormById(id);
      setForm(data);
    } catch (err) {
      logger.error('Error fetching form:', err);
      message.error('Failed to load form');
    }
  }, [id]);

  const fetchSubmissions = useCallback(async () => {
    try {
      setLoading(true);
      const params = {
        form_template_id: id,
        page: pagination.current,
        limit: pagination.pageSize,
        status: filters.status,
        search: filters.search || undefined,
        start_date: filters.dateRange?.[0]?.toISOString(),
        end_date: filters.dateRange?.[1]?.toISOString()
      };

      const data = await formService.getSubmissions(params);
      setSubmissions(data.submissions || []);
      setPagination(prev => ({
        ...prev,
        total: data.total || 0
      }));
    } catch (err) {
      logger.error('Error fetching submissions:', err);
      message.error('Failed to load submissions');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, filters]);

  useEffect(() => {
    fetchForm();
  }, [fetchForm]);

  useEffect(() => {
    fetchSubmissions();
  }, [fetchSubmissions]);

  const handleTableChange = (pag) => {
    setPagination(prev => ({
      ...prev,
      current: pag.current,
      pageSize: pag.pageSize
    }));
  };

  const handleStatusChange = async (submissionId, newStatus) => {
    try {
      await formService.updateSubmissionStatus(submissionId, newStatus);
      message.success(`Submission marked as ${newStatus}`);
      fetchSubmissions();
    } catch (err) {
      logger.error('Error updating status:', err);
      message.error('Failed to update status');
    }
  };

  const handleBulkProcess = async () => {
    try {
      await formService.bulkProcessSubmissions(selectedRows);
      message.success(`${selectedRows.length} submissions processed`);
      setSelectedRows([]);
      fetchSubmissions();
    } catch (err) {
      logger.error('Error bulk processing:', err);
      message.error('Failed to process submissions');
    }
  };

  const handleDelete = async (submissionId) => {
    try {
      await formService.deleteSubmission(submissionId);
      message.success('Submission deleted');
      fetchSubmissions();
    } catch (err) {
      logger.error('Error deleting submission:', err);
      message.error('Failed to delete submission');
    }
  };

  const handleExport = async (format) => {
    try {
      setExporting(true);
      const blob = await formService.exportSubmissions(id, format, {
        status: filters.status,
        start_date: filters.dateRange?.[0]?.toISOString(),
        end_date: filters.dateRange?.[1]?.toISOString()
      });
      
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${form?.form_name || 'submissions'}_${dayjs().format('YYYY-MM-DD')}.${format}`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      message.success('Export downloaded');
    } catch (err) {
      logger.error('Error exporting:', err);
      message.error('Failed to export submissions');
    } finally {
      setExporting(false);
    }
  };

  const showDetail = (submission) => {
    setDetailDrawer({ visible: true, submission });
  };

  const formatValue = (value) => {
    if (value === null || value === undefined) return '-';
    if (Array.isArray(value)) return value.join(', ');
    if (typeof value === 'object') {
      return Object.entries(value)
        .filter(([, v]) => v)
        .map(([k, v]) => `${k}: ${v}`)
        .join(', ');
    }
    if (typeof value === 'boolean') return value ? 'Yes' : 'No';
    return String(value);
  };

  const columns = [
    {
      title: 'ID',
      dataIndex: 'id',
      key: 'id',
      width: 80,
      render: (id) => <Text code>#{id}</Text>
    },
    {
      title: 'Submitted',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 160,
      sorter: true,
      render: (date) => (
        <Tooltip title={dayjs(date).format('YYYY-MM-DD HH:mm:ss')}>
          {dayjs(date).format('MMM D, YYYY HH:mm')}
        </Tooltip>
      )
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 120,
      render: (status) => {
        const config = STATUS_CONFIG[status] || STATUS_CONFIG.pending;
        return (
          <Tag color={config.color} icon={config.icon}>
            {config.label}
          </Tag>
        );
      }
    },
    {
      title: 'Preview',
      key: 'preview',
      ellipsis: true,
      render: (_, record) => {
        const data = record.submission_data || {};
        const preview = Object.entries(data)
          .slice(0, 3)
          .map(([k, v]) => `${k}: ${formatValue(v)}`)
          .join(' | ');
        return (
          <Text type="secondary" ellipsis>
            {preview || 'No data'}
          </Text>
        );
      }
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 150,
      fixed: 'right',
      render: (_, record) => (
        <Space>
          <Tooltip title="View Details">
            <Button
              type="text"
              size="small"
              icon={<EyeOutlined />}
              onClick={() => showDetail(record)}
            />
          </Tooltip>
          <Dropdown
            menu={{
              items: [
                {
                  key: 'process',
                  label: 'Mark as Processed',
                  icon: <CheckCircleOutlined />,
                  onClick: () => handleStatusChange(record.id, 'processed'),
                  disabled: record.status === 'processed'
                },
                {
                  key: 'archive',
                  label: 'Archive',
                  icon: <InboxOutlined />,
                  onClick: () => handleStatusChange(record.id, 'archived')
                },
                { type: 'divider' },
                {
                  key: 'delete',
                  label: 'Delete',
                  icon: <DeleteOutlined />,
                  danger: true,
                  onClick: () => {
                    Modal.confirm({
                      title: 'Delete Submission?',
                      content: 'This action cannot be undone.',
                      okText: 'Delete',
                      okType: 'danger',
                      onOk: () => handleDelete(record.id)
                    });
                  }
                }
              ]
            }}
          >
            <Button type="text" size="small" icon={<MoreOutlined />} />
          </Dropdown>
        </Space>
      )
    }
  ];

  if (!form && !loading) {
    return (
      <Empty
        description="Form not found"
        extra={
          <Button type="primary" onClick={() => navigate('/forms')}>
            Back to Forms
          </Button>
        }
      />
    );
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Button
            icon={<ArrowLeftOutlined />}
            onClick={() => navigate('/forms')}
          >
            Back
          </Button>
          <div>
            <Title level={4} className="mb-0">{form?.form_name || 'Loading...'}</Title>
            <Text type="secondary">
              {pagination.total} submission{pagination.total !== 1 ? 's' : ''}
            </Text>
          </div>
        </div>
        <Space>
          <Button
            icon={<ReloadOutlined />}
            onClick={fetchSubmissions}
            loading={loading}
          >
            Refresh
          </Button>
          <Dropdown
            menu={{
              items: [
                { key: 'csv', label: 'Export as CSV', onClick: () => handleExport('csv') },
                { key: 'xlsx', label: 'Export as Excel', onClick: () => handleExport('xlsx') }
              ]
            }}
          >
            <Button icon={<DownloadOutlined />} loading={exporting}>
              Export
            </Button>
          </Dropdown>
        </Space>
      </div>

      {/* Filters */}
      <Card className="mb-4">
        <Row gutter={[16, 16]} align="middle">
          <Col xs={24} sm={8}>
            <Input
              placeholder="Search submissions..."
              prefix={<SearchOutlined />}
              value={filters.search}
              onChange={(e) => setFilters(prev => ({ ...prev, search: e.target.value }))}
              allowClear
            />
          </Col>
          <Col xs={12} sm={6}>
            <Select
              placeholder="Status"
              value={filters.status}
              onChange={(value) => setFilters(prev => ({ ...prev, status: value }))}
              allowClear
              className="w-full"
              options={[
                { value: 'pending', label: 'Pending' },
                { value: 'processed', label: 'Processed' },
                { value: 'archived', label: 'Archived' }
              ]}
            />
          </Col>
          <Col xs={12} sm={10}>
            <RangePicker
              value={filters.dateRange}
              onChange={(dates) => setFilters(prev => ({ ...prev, dateRange: dates }))}
              className="w-full"
            />
          </Col>
        </Row>
      </Card>

      {/* Bulk Actions */}
      {selectedRows.length > 0 && (
        <Card className="mb-4 bg-blue-50">
          <Space>
            <Text strong>{selectedRows.length} selected</Text>
            <Button
              type="primary"
              size="small"
              icon={<CheckCircleOutlined />}
              onClick={handleBulkProcess}
            >
              Mark as Processed
            </Button>
            <Button size="small" onClick={() => setSelectedRows([])}>
              Clear Selection
            </Button>
          </Space>
        </Card>
      )}

      {/* Table */}
      <Card>
        <Table
          columns={columns}
          dataSource={submissions}
          rowKey="id"
          loading={loading}
          pagination={{
            ...pagination,
            showSizeChanger: true,
            showQuickJumper: true,
            showTotal: (total) => `Total ${total} submissions`
          }}
          onChange={handleTableChange}
          rowSelection={{
            selectedRowKeys: selectedRows,
            onChange: setSelectedRows
          }}
          scroll={{ x: 800 }}
          locale={{
            emptyText: (
              <Empty
                description="No submissions yet"
                image={Empty.PRESENTED_IMAGE_SIMPLE}
              />
            )
          }}
        />
      </Card>

      {/* Detail Drawer */}
      <Drawer
        title={`Submission #${detailDrawer.submission?.id}`}
        placement="right"
        width={500}
        open={detailDrawer.visible}
        onClose={() => setDetailDrawer({ visible: false, submission: null })}
        extra={
          <Space>
            <Tag color={STATUS_CONFIG[detailDrawer.submission?.status]?.color}>
              {STATUS_CONFIG[detailDrawer.submission?.status]?.label}
            </Tag>
          </Space>
        }
      >
        {detailDrawer.submission && (
          <div className="space-y-6">
            <Descriptions column={1} size="small" bordered>
              <Descriptions.Item label="Submitted">
                {dayjs(detailDrawer.submission.created_at).format('MMMM D, YYYY HH:mm:ss')}
              </Descriptions.Item>
              <Descriptions.Item label="Session ID">
                <Text code>{detailDrawer.submission.session_id}</Text>
              </Descriptions.Item>
            </Descriptions>

            <div>
              <Title level={5}>Submission Data</Title>
              <Descriptions column={1} size="small" bordered>
                {Object.entries(detailDrawer.submission.submission_data || {}).map(([key, value]) => (
                  <Descriptions.Item
                    key={key}
                    label={key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                  >
                    {formatValue(value)}
                  </Descriptions.Item>
                ))}
              </Descriptions>
            </div>

            {detailDrawer.submission.metadata && (
              <div>
                <Title level={5}>Metadata</Title>
                <Descriptions column={1} size="small">
                  {detailDrawer.submission.metadata.user_agent && (
                    <Descriptions.Item label="Browser">
                      <Text type="secondary" ellipsis>
                        {detailDrawer.submission.metadata.user_agent}
                      </Text>
                    </Descriptions.Item>
                  )}
                  {detailDrawer.submission.metadata.referrer && (
                    <Descriptions.Item label="Referrer">
                      {detailDrawer.submission.metadata.referrer}
                    </Descriptions.Item>
                  )}
                </Descriptions>
              </div>
            )}

            <Space className="w-full justify-center">
              <Button
                type="primary"
                icon={<CheckCircleOutlined />}
                onClick={() => {
                  handleStatusChange(detailDrawer.submission.id, 'processed');
                  setDetailDrawer({ visible: false, submission: null });
                }}
                disabled={detailDrawer.submission.status === 'processed'}
              >
                Mark as Processed
              </Button>
            </Space>
          </div>
        )}
      </Drawer>
    </div>
  );
};

export default FormResponsesPage;
