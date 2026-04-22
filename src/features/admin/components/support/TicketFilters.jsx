import { useTranslation } from 'react-i18next';
import { Input, Select, Button } from 'antd';
import { SearchOutlined, SyncOutlined } from '@ant-design/icons';

const TicketFilters = ({ filters, onChange, onRefresh, search, onSearchChange }) => {
  const { t } = useTranslation(['admin']);

  const statusOptions = [
    { value: 'open', label: t('admin:support.filters.status.open') },
    { value: 'in_progress', label: t('admin:support.filters.status.in_progress') },
    { value: 'resolved', label: t('admin:support.filters.status.resolved') },
    { value: 'closed', label: t('admin:support.filters.status.closed') },
  ];

  const priorityOptions = [
    { value: 'urgent', label: t('admin:support.filters.priority.urgent') },
    { value: 'high', label: t('admin:support.filters.priority.high') },
    { value: 'normal', label: t('admin:support.filters.priority.normal') },
    { value: 'low', label: t('admin:support.filters.priority.low') },
  ];

  const channelOptions = [
    { value: 'portal', label: t('admin:support.filters.channel.portal') },
    { value: 'email', label: t('admin:support.filters.channel.email') },
    { value: 'whatsapp', label: t('admin:support.filters.channel.whatsapp') },
    { value: 'chat', label: t('admin:support.filters.channel.chat') },
  ];

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-100 bg-white p-3 shadow-sm">
      <Input
        allowClear
        placeholder={t('admin:support.filters.searchPlaceholder')}
        prefix={<SearchOutlined className="text-slate-400" />}
        value={search}
        onChange={(e) => onSearchChange(e.target.value)}
        className="w-48"
      />
      <Select
        allowClear
        placeholder={t('admin:support.filters.statusPlaceholder')}
        className="w-36"
        value={filters.status}
        onChange={(v) => onChange({ ...filters, status: v })}
        options={statusOptions}
      />
      <Select
        allowClear
        placeholder={t('admin:support.filters.priorityPlaceholder')}
        className="w-36"
        value={filters.priority}
        onChange={(v) => onChange({ ...filters, priority: v })}
        options={priorityOptions}
      />
      <Select
        allowClear
        placeholder={t('admin:support.filters.channelPlaceholder')}
        className="w-36"
        value={filters.channel}
        onChange={(v) => onChange({ ...filters, channel: v })}
        options={channelOptions}
      />
      <Button icon={<SyncOutlined />} onClick={onRefresh}>
        {t('admin:support.filters.refresh')}
      </Button>
    </div>
  );
};

export default TicketFilters;
