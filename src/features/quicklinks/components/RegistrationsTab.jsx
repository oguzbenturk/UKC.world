import { Card, Table, Button, Tag, Select, Empty, Typography } from 'antd';
import {
  ReloadOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  CloseCircleOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';

const { Text, Title } = Typography;
const { Option } = Select;

const RegistrationsTab = ({
  allRegistrations,
  registrationsLoading,
  onRefresh,
  onUpdateRegistration,
}) => {
  const columns = [
    {
      title: 'Customer',
      key: 'customer',
      render: (_, record) => (
        <div>
          <Text strong>{record.first_name} {record.last_name}</Text>
          <div className="text-xs text-gray-500">{record.email}</div>
          {record.phone && <div className="text-xs text-gray-400">{record.phone}</div>}
        </div>
      )
    },
    {
      title: 'Service',
      key: 'service',
      render: (_, record) => (
        <div>
          <Text>{record.link_name}</Text>
          <div className="text-xs text-gray-400">
            {record.service_type || 'General'}
          </div>
        </div>
      )
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 120,
      render: (status) => {
        const config = {
          pending: { color: 'orange', icon: <ClockCircleOutlined /> },
          confirmed: { color: 'green', icon: <CheckCircleOutlined /> },
          cancelled: { color: 'red', icon: <CloseCircleOutlined /> }
        };
        const c = config[status] || config.pending;
        return <Tag color={c.color} icon={c.icon}>{status?.toUpperCase()}</Tag>;
      }
    },
    {
      title: 'Date',
      dataIndex: 'created_at',
      key: 'date',
      width: 150,
      render: (date) => dayjs(date).format('MMM D, YYYY h:mm A')
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 150,
      render: (_, record) => (
        <Select
          value={record.status}
          style={{ width: 120 }}
          size="small"
          onChange={(value) => onUpdateRegistration(record.id, value)}
        >
          <Option value="pending">Pending</Option>
          <Option value="confirmed">Confirm</Option>
          <Option value="cancelled">Cancel</Option>
        </Select>
      )
    }
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <Title level={4} className="!mb-1">Link Registrations</Title>
          <Text type="secondary">Service registrations from your shareable links</Text>
        </div>
        <Button 
          icon={<ReloadOutlined />} 
          onClick={onRefresh}
          className="w-full sm:w-auto"
        >
          Refresh
        </Button>
      </div>

      {/* Registrations Table */}
      <Card>
        <Table
          dataSource={allRegistrations}
          rowKey="id"
          columns={columns}
          scroll={{ x: 1000 }}
          loading={registrationsLoading}
          pagination={{ pageSize: 15 }}
          locale={{
            emptyText: (
              <Empty description="No registrations yet. Share your links to receive sign-ups." />
            )
          }}
        />
      </Card>
    </div>
  );
};

export default RegistrationsTab;
