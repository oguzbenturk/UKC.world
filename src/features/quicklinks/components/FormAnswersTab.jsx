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
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation(['manager']);
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
      title: t('manager:quicklinks.formAnswers.submittedBy'),
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
      title: t('manager:quicklinks.formAnswers.form'),
      key: 'form',
      render: (_, record) => (
        <Tag color="blue" icon={<FormOutlined />}>{record.form_name || t('manager:quicklinks.formAnswers.unknownForm')}</Tag>
      )
    },
    {
      title: t('manager:quicklinks.formAnswers.status'),
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
      title: t('manager:quicklinks.formAnswers.date'),
      dataIndex: 'submitted_at',
      key: 'date',
      width: 150,
      render: (date) => date ? dayjs(date).format('MMM D, YYYY h:mm A') : '-'
    },
    {
      title: t('manager:quicklinks.formAnswers.actions'),
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
            {t('manager:quicklinks.formAnswers.view')}
          </Button>
          <Button
            size="small"
            icon={<UserOutlined />}
            onClick={() => onCreateUserFromSubmission(record)}
            title={t('manager:quicklinks.formAnswers.createUser')}
          >
            {t('manager:quicklinks.formAnswers.createUser')}
          </Button>
          <Popconfirm
            title={t('manager:quicklinks.formAnswers.delete')}
            onConfirm={() => onDeleteSubmission(record.id)}
            okText={t('manager:quicklinks.formAnswers.delete')}
            cancelText={t('manager:products.confirm.deleteCancel')}
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
          <Title level={4} className="!mb-1">{t('manager:quicklinks.tabs.formAnswers')}</Title>
          <Text type="secondary">{t('manager:quicklinks.formAnswers.submittedBy')}</Text>
        </div>
        <Button icon={<ReloadOutlined />} onClick={fetchFormSubmissions}>
          {t('manager:quicklinks.links.refresh')}
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
            placeholder={t('manager:quicklinks.formAnswers.filterByForm')}
            allowClear
            className="w-full sm:w-64"
            value={submissionFilters.formId}
            onChange={(value) => setSubmissionFilters(prev => ({ ...prev, formId: value }))}
            loading={formTemplatesLoading}
            popupMatchSelectWidth={false}
          >
            {allFormTemplates.map(form => (
              <Option key={form.id} value={form.id}>{form.name}</Option>
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
              <Empty description={t('manager:quicklinks.formAnswers.noSubmissions')} />
            )
          }}
        />
      </Card>
    </div>
  );
};

export default FormAnswersTab;
