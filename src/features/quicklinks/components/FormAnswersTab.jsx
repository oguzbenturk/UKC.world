import { Card, Table, Button, Tag, Space, Select, Input, Empty, Popconfirm, Typography } from 'antd';
import {
  EyeOutlined,
  DeleteOutlined,
  ReloadOutlined,
  FormOutlined,
  UserOutlined,
  MessageOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { getSubmitterName, getSubmitterEmail } from '../utils/formHelpers';
import * as formService from '../../forms/services/formService';

const { Text, Title } = Typography;
const { Option } = Select;

const FormAnswersTab = ({
  formSubmissions,
  formSubmissionsLoading,
  submissionFilters,
  setSubmissionFilters,
  allFormTemplates,
  formTemplatesLoading,
  fetchFormSubmissions,
  onDeleteSubmission,
  onViewSubmission,
  onCreateUserFromSubmission,
}) => {
  const handleViewClick = async (record) => {
    try {
      const fullSubmission = await formService.getFormSubmission(record.id);
      onViewSubmission(fullSubmission);
    } catch {
      onViewSubmission(record);
    }
  };

  const columns = [
    {
      title: 'Submitted By',
      key: 'submitter',
      render: (_, record) => (
        <div>
          <div className="flex items-center gap-2">
            <UserOutlined className="text-gray-400" />
            <Text strong>{getSubmitterName(record)}</Text>
          </div>
          {getSubmitterEmail(record) && (
            <div className="text-xs text-gray-500 ml-5">{getSubmitterEmail(record)}</div>
          )}
        </div>
      )
    },
    {
      title: 'Form',
      key: 'form',
      render: (_, record) => (
        <Tag color="blue" icon={<FormOutlined />}>{record.form_name || 'Unknown Form'}</Tag>
      )
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 120,
      render: (status) => {
        const config = {
          pending: { color: 'orange', text: 'Pending Review' },
          reviewed: { color: 'blue', text: 'Reviewed' },
          approved: { color: 'green', text: 'Approved' },
          rejected: { color: 'red', text: 'Rejected' },
          submitted: { color: 'cyan', text: 'Submitted' }
        };
        const c = config[status] || config.pending;
        return <Tag color={c.color}>{c.text}</Tag>;
      }
    },
    {
      title: '',
      dataIndex: 'notes',
      key: 'notes',
      width: 40,
      render: (notes) => notes ? (
        <MessageOutlined className="text-blue-500" title="Has notes" />
      ) : null
    },
    {
      title: 'Submitted',
      dataIndex: 'submitted_at',
      key: 'date',
      width: 150,
      render: (date) => date ? dayjs(date).format('MMM D, YYYY h:mm A') : '-'
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 200,
      render: (_, record) => (
        <Space size="small">
          <Button 
            type="primary" 
            size="small"
            icon={<EyeOutlined />}
            onClick={() => handleViewClick(record)}
          >
            View
          </Button>
          <Button 
            size="small"
            icon={<UserOutlined />}
            onClick={() => onCreateUserFromSubmission(record)}
            title="Create User Account"
          >
            User
          </Button>
          <Popconfirm
            title="Delete submission"
            description="Are you sure you want to delete this submission? This cannot be undone."
            onConfirm={() => onDeleteSubmission(record.id)}
            okText="Delete"
            cancelText="Cancel"
            okButtonProps={{ danger: true }}
          >
            <Button danger size="small" icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      )
    }
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <Title level={4} className="!mb-1">Form Responses</Title>
          <Text type="secondary">Review and manage submissions from your custom forms</Text>
        </div>
        <Button icon={<ReloadOutlined />} onClick={fetchFormSubmissions}>
          Refresh
        </Button>
      </div>

      {/* Filters */}
      <Card size="small">
        <div className="flex flex-wrap items-center gap-3">
          <Input
            placeholder="Search by name or email..."
            allowClear
            className="w-full sm:w-64"
            value={submissionFilters.search}
            onChange={(e) => setSubmissionFilters(prev => ({ ...prev, search: e.target.value }))}
          />
          
          <Select 
            placeholder="Status"
            allowClear
            className="w-full sm:w-40"
            value={submissionFilters.status}
            onChange={(value) => setSubmissionFilters(prev => ({ ...prev, status: value || 'all' }))}
          >
            <Option value="all">All Statuses</Option>
            <Option value="submitted">Submitted</Option>
            <Option value="pending">Pending</Option>
            <Option value="reviewed">Reviewed</Option>
            <Option value="approved">Approved</Option>
            <Option value="rejected">Rejected</Option>
          </Select>
          
          <Select 
            placeholder="Filter by Form"
            allowClear
            className="w-full sm:w-64"
            value={submissionFilters.formId}
            onChange={(value) => setSubmissionFilters(prev => ({ ...prev, formId: value }))}
            loading={formTemplatesLoading}
            popupMatchSelectWidth={false}
          >
            {allFormTemplates.map(t => (
              <Option key={t.id} value={t.id}>{t.name}</Option>
            ))}
          </Select>

          <Button onClick={() => setSubmissionFilters({ status: 'all', formId: null, search: '' })}>
            Reset
          </Button>
        </div>
      </Card>

      {/* Table */}
      <Card>
        <Table
          dataSource={formSubmissions}
          rowKey="id"
          columns={columns}
          scroll={{ x: 1000 }}
          loading={formSubmissionsLoading}
          pagination={{ pageSize: 15 }}
          locale={{
            emptyText: (
              <Empty description="No form submissions found matching your filters." />
            )
          }}
        />
      </Card>
    </div>
  );
};

export default FormAnswersTab;
