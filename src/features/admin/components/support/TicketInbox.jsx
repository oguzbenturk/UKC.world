import { useTranslation } from 'react-i18next';
import { Tag, Empty } from 'antd';
import {
  ExclamationCircleOutlined,
  SyncOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';

dayjs.extend(relativeTime);

const statusConfig = {
  open: { color: 'gold', icon: <ExclamationCircleOutlined /> },
  in_progress: { color: 'blue', icon: <SyncOutlined spin /> },
  resolved: { color: 'green', icon: <CheckCircleOutlined /> },
  closed: { color: 'default', icon: <ClockCircleOutlined /> },
};

const priorityColors = { urgent: 'red', high: 'orange', normal: 'blue', low: 'default' };

const TicketInbox = ({ tickets, selectedId, onSelect, loading }) => {
  const { t } = useTranslation(['admin']);

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-20 animate-pulse rounded-xl bg-slate-100" />
        ))}
      </div>
    );
  }

  if (!tickets?.length) {
    return <Empty description={t('admin:support.inbox.noTickets')} className="py-12" />;
  }

  return (
    <div className="space-y-2 overflow-y-auto max-h-[calc(100vh-320px)] pr-1">
      {tickets.map((ticket) => {
        const st = statusConfig[ticket.status] || statusConfig.open;
        const isSelected = ticket.id === selectedId;

        return (
          <button
            key={ticket.id}
            type="button"
            onClick={() => onSelect(ticket)}
            className={`w-full text-left rounded-xl border p-3 transition ${
              isSelected
                ? 'border-sky-200 bg-sky-50 shadow-sm'
                : 'border-slate-100 bg-white hover:border-slate-200 hover:bg-slate-50'
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-sm text-slate-800 truncate">
                  {ticket.student_name}
                </p>
                <p className="text-xs text-slate-500 truncate mt-0.5">
                  {ticket.subject}
                </p>
              </div>
              <span className="text-[10px] text-slate-400 shrink-0">
                {dayjs(ticket.created_at).fromNow()}
              </span>
            </div>
            <div className="flex items-center gap-1.5 mt-2">
              <Tag icon={st.icon} color={st.color} className="m-0 text-[10px]">
                {ticket.status?.replace('_', ' ')}
              </Tag>
              <Tag color={priorityColors[ticket.priority] || 'default'} className="m-0 text-[10px] capitalize">
                {ticket.priority}
              </Tag>
              {ticket.channel && (
                <Tag className="m-0 text-[10px]">{ticket.channel}</Tag>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
};

export default TicketInbox;
