import { Input, Select, Button } from 'antd';
import { SearchOutlined, SyncOutlined } from '@ant-design/icons';

const statusOptions = [
  { value: 'open', label: 'Open' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'closed', label: 'Closed' },
];

const priorityOptions = [
  { value: 'urgent', label: 'Urgent' },
  { value: 'high', label: 'High' },
  { value: 'normal', label: 'Normal' },
  { value: 'low', label: 'Low' },
];

const channelOptions = [
  { value: 'portal', label: 'Portal' },
  { value: 'email', label: 'Email' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'chat', label: 'Chat' },
];

const TicketFilters = ({ filters, onChange, onRefresh, search, onSearchChange }) => (
  <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-100 bg-white p-3 shadow-sm">
    <Input
      allowClear
      placeholder="Search name or subject…"
      prefix={<SearchOutlined className="text-slate-400" />}
      value={search}
      onChange={(e) => onSearchChange(e.target.value)}
      className="w-48"
    />
    <Select
      allowClear
      placeholder="Status"
      className="w-36"
      value={filters.status}
      onChange={(v) => onChange({ ...filters, status: v })}
      options={statusOptions}
    />
    <Select
      allowClear
      placeholder="Priority"
      className="w-36"
      value={filters.priority}
      onChange={(v) => onChange({ ...filters, priority: v })}
      options={priorityOptions}
    />
    <Select
      allowClear
      placeholder="Channel"
      className="w-36"
      value={filters.channel}
      onChange={(v) => onChange({ ...filters, channel: v })}
      options={channelOptions}
    />
    <Button icon={<SyncOutlined />} onClick={onRefresh}>
      Refresh
    </Button>
  </div>
);

export default TicketFilters;
