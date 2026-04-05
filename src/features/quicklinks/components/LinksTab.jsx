import { Card, Table, Button, Tag, Space, Empty, Popconfirm, Typography } from 'antd';
import {
  PlusOutlined,
  LinkOutlined,
  CopyOutlined,
  DeleteOutlined,
  EditOutlined,
  ReloadOutlined,
  GlobalOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  UserAddOutlined,
  CreditCardOutlined,
  FormOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { getPublicUrl } from '../utils/formHelpers';

const { Text, Title } = Typography;

const LinksTab = ({
  links,
  loading,
  fetchLinks,
  onEditLink,
  onDeleteLink,
  copyLink,
  onCreateLink,
}) => {
  const columns = [
    {
      title: 'Link Name',
      dataIndex: 'name',
      key: 'name',
      render: (text, record) => (
        <div>
          <Text strong>{text}</Text>
          {record.description && (
            <div className="text-xs text-gray-500 mt-1">{record.description}</div>
          )}
        </div>
      )
    },
    {
      title: 'URL',
      key: 'url',
      render: (_, record) => (
        <Text copyable={{ text: getPublicUrl(record.link_code) }} className="text-xs font-mono">
          /f/{record.link_code}
        </Text>
      )
    },
    {
      title: 'Type',
      key: 'type',
      width: 140,
      render: (_, record) => {
        if (record.link_type === 'form') {
          return <Tag icon={<FormOutlined />} color="purple">Form</Tag>;
        }
        if (record.require_payment) {
          return <Tag icon={<CreditCardOutlined />} color="gold">Service Buy</Tag>;
        }
        if (record.link_type === 'service') {
          return <Tag icon={<LinkOutlined />} color="blue">Service</Tag>;
        }
        return <Tag icon={<UserAddOutlined />} color="cyan">Registration</Tag>;
      }
    },
    {
      title: 'Status',
      key: 'status',
      width: 100,
      render: (_, record) => (
        record.is_active 
          ? <Tag color="green" icon={<CheckCircleOutlined />}>Active</Tag>
          : <Tag color="red" icon={<CloseCircleOutlined />}>Inactive</Tag>
      )
    },
    {
      title: 'Uses',
      dataIndex: 'use_count',
      key: 'uses',
      width: 80,
      render: (count, record) => (
        <Text>{count || 0}{record.max_uses ? ` / ${record.max_uses}` : ''}</Text>
      )
    },
    {
      title: 'Expires',
      dataIndex: 'expires_at',
      key: 'expires',
      width: 130,
      render: (date) => date ? dayjs(date).format('MMM D, YYYY') : <Text type="secondary">Never</Text>
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 200,
      render: (_, record) => (
        <Space size="small">
          <Button size="small" icon={<EditOutlined />} onClick={() => onEditLink(record)}>
            Edit
          </Button>
          <Button size="small" icon={<CopyOutlined />} onClick={() => copyLink(record.link_code)}>
            Copy
          </Button>
          <Button size="small" icon={<GlobalOutlined />} href={getPublicUrl(record.link_code)} target="_blank">
            Open
          </Button>
          <Popconfirm
            title="Delete this link?"
            onConfirm={() => onDeleteLink(record.id)}
            okText="Delete"
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
          <Title level={4} className="!mb-1">Shareable Links</Title>
          <Text type="secondary">Direct booking and registration links for your services</Text>
        </div>
        <Space className="w-full sm:w-auto">
          <Button 
            type="primary" 
            icon={<PlusOutlined />}
            size="large"
            className="flex-1 sm:flex-none"
            onClick={onCreateLink}
          >
            Create Link
          </Button>
          <Button 
            icon={<ReloadOutlined />} 
            onClick={fetchLinks}
          >
            Refresh
          </Button>
        </Space>
      </div>

      {/* Links Table */}
      <Card>
        <Table
          dataSource={links}
          columns={columns}
          rowKey="id"
          loading={loading}
          scroll={{ x: 800 }}
          pagination={{ pageSize: 10 }}
          locale={{
            emptyText: (
              <Empty 
                image={<LinkOutlined style={{ fontSize: 48, color: '#d9d9d9' }} />}
                description="No links yet. Create one to share with customers."
              >
                <Button type="primary" icon={<PlusOutlined />} onClick={onCreateLink}>
                  Create Your First Link
                </Button>
              </Empty>
            )
          }}
        />
      </Card>
    </div>
  );
};

export default LinksTab;
