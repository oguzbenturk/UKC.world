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
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation(['manager']);
  const columns = [
    {
      title: t('manager:quicklinks.links.linkName'),
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
      title: t('manager:quicklinks.links.url'),
      key: 'url',
      render: (_, record) => (
        <Text copyable={{ text: getPublicUrl(record.link_code) }} className="text-xs font-mono">
          /f/{record.link_code}
        </Text>
      )
    },
    {
      title: t('manager:quicklinks.links.type'),
      key: 'type',
      width: 140,
      render: (_, record) => {
        if (record.link_type === 'form') {
          return <Tag icon={<FormOutlined />} color="purple">{t('manager:quicklinks.links.typeForm')}</Tag>;
        }
        if (record.require_payment) {
          return <Tag icon={<CreditCardOutlined />} color="gold">{t('manager:quicklinks.links.typeServiceBuy')}</Tag>;
        }
        if (record.link_type === 'service') {
          return <Tag icon={<LinkOutlined />} color="blue">{t('manager:quicklinks.links.typeService')}</Tag>;
        }
        return <Tag icon={<UserAddOutlined />} color="cyan">{t('manager:quicklinks.links.typeRegistration')}</Tag>;
      }
    },
    {
      title: t('manager:quicklinks.links.status'),
      key: 'status',
      width: 100,
      render: (_, record) => (
        record.is_active
          ? <Tag color="green" icon={<CheckCircleOutlined />}>{t('manager:quicklinks.links.statusActive')}</Tag>
          : <Tag color="red" icon={<CloseCircleOutlined />}>{t('manager:quicklinks.links.statusInactive')}</Tag>
      )
    },
    {
      title: t('manager:quicklinks.links.uses'),
      dataIndex: 'use_count',
      key: 'uses',
      width: 80,
      render: (count, record) => (
        <Text>{count || 0}{record.max_uses ? ` / ${record.max_uses}` : ''}</Text>
      )
    },
    {
      title: t('manager:quicklinks.links.expires'),
      dataIndex: 'expires_at',
      key: 'expires',
      width: 130,
      render: (date) => date ? dayjs(date).format('MMM D, YYYY') : <Text type="secondary">{t('manager:quicklinks.links.never')}</Text>
    },
    {
      title: t('manager:quicklinks.links.actions'),
      key: 'actions',
      width: 200,
      render: (_, record) => (
        <Space size="small">
          <Button size="small" icon={<EditOutlined />} onClick={() => onEditLink(record)}>
            {t('manager:quicklinks.links.edit')}
          </Button>
          <Button size="small" icon={<CopyOutlined />} onClick={() => copyLink(record.link_code)}>
            {t('manager:quicklinks.links.copy')}
          </Button>
          <Button size="small" icon={<GlobalOutlined />} href={getPublicUrl(record.link_code)} target="_blank">
            {t('manager:quicklinks.links.open')}
          </Button>
          <Popconfirm
            title={t('manager:quicklinks.links.deleteConfirm')}
            onConfirm={() => onDeleteLink(record.id)}
            okText={t('manager:quicklinks.links.delete')}
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
          <Title level={4} className="!mb-1">{t('manager:quicklinks.links.heading')}</Title>
          <Text type="secondary">{t('manager:quicklinks.links.headingDesc')}</Text>
        </div>
        <Space className="w-full sm:w-auto">
          <Button
            type="primary"
            icon={<PlusOutlined />}
            size="large"
            className="flex-1 sm:flex-none"
            onClick={onCreateLink}
          >
            {t('manager:quicklinks.links.createLink')}
          </Button>
          <Button
            icon={<ReloadOutlined />}
            onClick={fetchLinks}
          >
            {t('manager:quicklinks.links.refresh')}
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
                description={t('manager:quicklinks.links.noLinks')}
              >
                <Button type="primary" icon={<PlusOutlined />} onClick={onCreateLink}>
                  {t('manager:quicklinks.links.createFirstLink')}
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
