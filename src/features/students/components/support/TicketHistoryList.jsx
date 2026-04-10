import { Empty, Tag } from 'antd';
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
  open: { color: 'gold', icon: <ExclamationCircleOutlined />, label: 'Open' },
  in_progress: { color: 'blue', icon: <SyncOutlined spin />, label: 'In Progress' },
  resolved: { color: 'green', icon: <CheckCircleOutlined />, label: 'Resolved' },
  closed: { color: 'default', icon: <ClockCircleOutlined />, label: 'Closed' },
  pending: { color: 'blue', icon: <ClockCircleOutlined />, label: 'Pending' },
};

const priorityColors = { urgent: 'red', high: 'orange', normal: 'blue', low: 'default' };

const TicketHistoryList = ({ tickets, onSelect }) => {
  if (!tickets?.length) {
    return <Empty description="You have no support requests yet" className="py-8" />;
  }

  return (
    <ul className="space-y-3">
      {tickets.map((ticket) => {
        const st = statusConfig[ticket.status] || statusConfig.open;
        return (
          <li key={ticket.id}>
            <button
              type="button"
              onClick={() => onSelect?.(ticket)}
              className="w-full text-left rounded-2xl border border-slate-100 bg-white p-4 shadow-sm transition hover:shadow-md hover:border-sky-200"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-sm text-slate-800 truncate">
                    {ticket.subject || `Ticket #${ticket.id}`}
                  </p>
                  {ticket.message && (
                    <p className="mt-1 text-xs text-slate-500 line-clamp-2">{ticket.message}</p>
                  )}
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <Tag icon={st.icon} color={st.color} className="m-0">
                    {st.label}
                  </Tag>
                  {ticket.priority && (
                    <Tag color={priorityColors[ticket.priority] || 'default'} className="m-0 capitalize">
                      {ticket.priority}
                    </Tag>
                  )}
                </div>
              </div>
              <p className="mt-2 text-[10px] text-slate-400">
                {ticket.created_at || ticket.createdAt
                  ? dayjs(ticket.created_at || ticket.createdAt).fromNow()
                  : ''}
              </p>
            </button>
          </li>
        );
      })}
    </ul>
  );
};

export default TicketHistoryList;
