import { Card, Table, Button, Tag, Select, Empty, Typography } from 'antd';
import {
  ReloadOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  CloseCircleOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { useTranslation } from 'react-i18next';

const { Text, Title } = Typography;
const { Option } = Select;

const RegistrationsTab = ({
  allRegistrations,
  registrationsLoading,
  onRefresh,
  onUpdateRegistration,
}) => {
  const { t } = useTranslation(['manager']);
  const columns = [
    {
      title: t('manager:quicklinks.registrations.customer'),
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
      title: t('manager:quicklinks.registrations.service'),
      key: 'service',
      render: (_, record) => (
        <div>
          <Text>{record.link_name}</Text>
          <div className="text-xs text-gray-400">
            {record.service_type || t('manager:quicklinks.registrations.general')}
          </div>
        </div>
      )
    },
    {
      title: t('manager:quicklinks.registrations.status'),
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
      title: t('manager:quicklinks.registrations.date'),
      dataIndex: 'created_at',
      key: 'date',
      width: 150,
      render: (date) => dayjs(date).format('MMM D, YYYY h:mm A')
    },
    {
      title: t('manager:quicklinks.registrations.actions'),
      key: 'actions',
      width: 150,
      render: (_, record) => (
        <Select
          value={record.status}
          style={{ width: 120 }}
          size="small"
          onChange={(value) => onUpdateRegistration(record.id, value)}
        >
          <Option value="pending">{t('manager:quicklinks.registrations.pending')}</Option>
          <Option value="confirmed">{t('manager:quicklinks.registrations.confirm')}</Option>
          <Option value="cancelled">{t('manager:quicklinks.registrations.cancel')}</Option>
        </Select>
      )
    }
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <Title level={4} className="!mb-1">{t('manager:quicklinks.registrations.heading')}</Title>
          <Text type="secondary">{t('manager:quicklinks.registrations.headingDesc')}</Text>
        </div>
        <Button
          icon={<ReloadOutlined />}
          onClick={onRefresh}
          className="w-full sm:w-auto"
        >
          {t('manager:quicklinks.registrations.refresh')}
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
              <Empty description={t('manager:quicklinks.registrations.noRegistrations')} />
            )
          }}
        />
      </Card>
    </div>
  );
};

export default RegistrationsTab;
