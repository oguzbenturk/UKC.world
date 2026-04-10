import { useState, useMemo } from 'react';
import { Segmented, Drawer, Tag, Button, Space, message } from 'antd';
import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  ExclamationCircleOutlined,
  MessageOutlined,
  SyncOutlined,
} from '@ant-design/icons';
import UnifiedResponsiveTable from '@/components/ui/ResponsiveTableV2';
import SupportDashboardStats from '../components/support/SupportDashboardStats';
import TicketFilters from '../components/support/TicketFilters';
import TicketInbox from '../components/support/TicketInbox';
import TicketConversationPanel from '../components/support/TicketConversationPanel';
import {
  useSupportTickets,
  useSupportStatistics,
  useUpdateTicketStatus,
  useAddTicketNote,
} from '../hooks/useSupportTickets';

/* ── helpers shared by table view ── */

const getPriorityColor = (p) => ({ urgent: 'red', high: 'orange', normal: 'blue', low: 'default' })[p] || 'default';
const getStatusColor = (s) => ({ open: 'orange', in_progress: 'blue', resolved: 'green', closed: 'default' })[s] || 'default';
const getStatusIcon = (s) => ({
  open: <ExclamationCircleOutlined />,
  in_progress: <SyncOutlined spin />,
  resolved: <CheckCircleOutlined />,
  closed: <ClockCircleOutlined />,
})[s] || null;

/* ── Mobile card for table view ── */

const MobileCard = ({ record, onSelect }) => (
  <button
    type="button"
    onClick={() => onSelect(record)}
    className="w-full text-left rounded-xl border border-slate-100 bg-white p-3 shadow-sm mb-3"
  >
    <div className="flex justify-between items-start mb-2">
      <div>
        <p className="font-semibold text-sm text-slate-800">{record.student_name}</p>
        <p className="text-xs text-slate-500">{record.student_email}</p>
      </div>
      <div className="flex flex-col items-end gap-1">
        <Tag color={getPriorityColor(record.priority)}>{record.priority?.toUpperCase()}</Tag>
        <Tag icon={getStatusIcon(record.status)} color={getStatusColor(record.status)}>
          {record.status?.replace('_', ' ').toUpperCase()}
        </Tag>
      </div>
    </div>
    <p className="text-sm text-slate-700 truncate">{record.subject}</p>
    <div className="flex justify-between items-center mt-2 text-xs text-slate-400">
      <Tag className="m-0">{record.channel}</Tag>
      <span>{new Date(record.created_at).toLocaleDateString()}</span>
    </div>
  </button>
);

/* ── Page ── */

const SupportTicketsPage = () => {
  const [viewMode, setViewMode] = useState('inbox');
  const [filters, setFilters] = useState({ status: null, priority: null, channel: null });
  const [search, setSearch] = useState('');
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);

  const { data: tickets = [], isLoading, refetch } = useSupportTickets(filters);
  const { data: statistics } = useSupportStatistics();
  const updateStatus = useUpdateTicketStatus();
  const addNote = useAddTicketNote();

  /* client-side filtering for search + channel (backend only filters status/priority) */
  const filteredTickets = useMemo(() => {
    let result = tickets;
    if (filters.channel) {
      result = result.filter((t) => t.channel === filters.channel);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (t) =>
          t.student_name?.toLowerCase().includes(q) ||
          t.subject?.toLowerCase().includes(q) ||
          t.student_email?.toLowerCase().includes(q)
      );
    }
    return result;
  }, [tickets, filters.channel, search]);

  const handleSelectTicket = (ticket) => {
    setSelectedTicket(ticket);
    if (window.innerWidth < 768) setMobileDrawerOpen(true);
  };

  /* Keep selectedTicket in sync with latest data */
  const activeTicket = useMemo(() => {
    if (!selectedTicket) return null;
    return filteredTickets.find((t) => t.id === selectedTicket.id) || selectedTicket;
  }, [selectedTicket, filteredTickets]);

  /* ── table columns ── */
  const columns = [
    {
      title: 'Priority',
      dataIndex: 'priority',
      key: 'priority',
      width: 100,
      render: (p) => <Tag color={getPriorityColor(p)}>{p?.toUpperCase()}</Tag>,
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 120,
      render: (s) => (
        <Tag icon={getStatusIcon(s)} color={getStatusColor(s)}>
          {s?.replace('_', ' ').toUpperCase()}
        </Tag>
      ),
    },
    {
      title: 'Student',
      key: 'student',
      width: 200,
      render: (_, r) => (
        <div>
          <p className="font-medium text-sm">{r.student_name}</p>
          <p className="text-xs text-slate-400">{r.student_email}</p>
        </div>
      ),
    },
    { title: 'Subject', dataIndex: 'subject', key: 'subject', ellipsis: true },
    { title: 'Channel', dataIndex: 'channel', key: 'channel', width: 100, render: (c) => <Tag>{c}</Tag> },
    {
      title: 'Created',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 160,
      render: (d) => new Date(d).toLocaleDateString(),
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 200,
      render: (_, record) => (
        <Space size="small" wrap>
          {record.status === 'open' && (
            <Button
              type="primary"
              size="small"
              loading={updateStatus.isPending}
              onClick={() =>
                updateStatus.mutate(
                  { ticketId: record.id, status: 'in_progress' },
                  { onSuccess: () => message.success('Started') }
                )
              }
            >
              Start
            </Button>
          )}
          {['open', 'in_progress'].includes(record.status) && (
            <Button
              size="small"
              className="border-emerald-300 text-emerald-600"
              loading={updateStatus.isPending}
              onClick={() =>
                updateStatus.mutate(
                  { ticketId: record.id, status: 'resolved' },
                  { onSuccess: () => message.success('Resolved') }
                )
              }
            >
              Resolve
            </Button>
          )}
          <Button size="small" icon={<MessageOutlined />} onClick={() => handleSelectTicket(record)}>
            View
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <div className="space-y-5 p-4 md:p-6">
      {/* Header */}
      <div>
        <h2 className="font-duotone-bold text-lg text-slate-900">Support Tickets</h2>
        <p className="text-sm text-slate-500">Manage support requests across all channels</p>
      </div>

      {/* Stats */}
      <SupportDashboardStats statistics={statistics} />

      {/* Filters */}
      <TicketFilters
        filters={filters}
        onChange={setFilters}
        onRefresh={refetch}
        search={search}
        onSearchChange={setSearch}
      />

      {/* View toggle */}
      <Segmented
        value={viewMode}
        onChange={setViewMode}
        options={[
          { value: 'inbox', label: 'Inbox' },
          { value: 'table', label: 'Table' },
        ]}
      />

      {/* Inbox view */}
      {viewMode === 'inbox' && (
        <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
          <div className="md:col-span-4">
            <TicketInbox
              tickets={filteredTickets}
              selectedId={activeTicket?.id}
              onSelect={handleSelectTicket}
              loading={isLoading}
            />
          </div>
          <div className="hidden md:block md:col-span-8">
            <TicketConversationPanel ticket={activeTicket} />
          </div>
        </div>
      )}

      {/* Table view */}
      {viewMode === 'table' && (
        <div className="rounded-2xl border border-slate-100 bg-white shadow-sm overflow-hidden">
          <UnifiedResponsiveTable
            dataSource={filteredTickets}
            columns={columns}
            rowKey="id"
            loading={isLoading}
            pagination={{
              pageSize: 20,
              showSizeChanger: true,
              showTotal: (total) => `Total ${total} tickets`,
            }}
            expandable={{
              expandedRowRender: (record) => (
                <div className="p-3 space-y-3">
                  <div>
                    <p className="text-xs font-medium text-slate-500 mb-1">Message</p>
                    <div className="rounded-lg bg-slate-50 p-3 text-sm text-slate-700">
                      {record.message}
                    </div>
                  </div>
                  {record.metadata?.notes?.length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-slate-500 mb-1">Notes</p>
                      {record.metadata.notes.map((n, i) => (
                        <div
                          key={i}
                          className={`mt-1 rounded-lg p-3 text-sm ${
                            n.type === 'reply'
                              ? 'bg-sky-50 border border-sky-100'
                              : 'bg-amber-50 border-l-2 border-amber-300'
                          }`}
                        >
                          <p className="text-[10px] text-slate-400 mb-1">
                            {n.type === 'reply' ? 'Reply' : 'Internal Note'} &middot;{' '}
                            {new Date(n.timestamp).toLocaleString()}
                          </p>
                          <p>{n.note}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ),
            }}
            mobileCardRenderer={(props) => (
              <MobileCard {...props} onSelect={handleSelectTicket} />
            )}
          />
        </div>
      )}

      {/* Mobile drawer for conversation */}
      <Drawer
        title={activeTicket?.subject || 'Ticket'}
        open={mobileDrawerOpen}
        onClose={() => setMobileDrawerOpen(false)}
        width="100%"
        placement="right"
        className="md:hidden"
      >
        <TicketConversationPanel ticket={activeTicket} />
      </Drawer>
    </div>
  );
};

export default SupportTicketsPage;
