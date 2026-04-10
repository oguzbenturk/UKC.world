import { Drawer, Tag, Timeline } from 'antd';
import {
  ExclamationCircleOutlined,
  SyncOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';

const statusConfig = {
  open: { color: 'gold', icon: <ExclamationCircleOutlined />, label: 'Open' },
  in_progress: { color: 'blue', icon: <SyncOutlined />, label: 'In Progress' },
  resolved: { color: 'green', icon: <CheckCircleOutlined />, label: 'Resolved' },
  closed: { color: 'default', icon: <ClockCircleOutlined />, label: 'Closed' },
  pending: { color: 'blue', icon: <ClockCircleOutlined />, label: 'Pending' },
};

const priorityColors = { urgent: 'red', high: 'orange', normal: 'blue', low: 'default' };

const TicketDetailDrawer = ({ ticket, open, onClose }) => {
  if (!ticket) return null;

  const st = statusConfig[ticket.status] || statusConfig.open;
  const createdDate = ticket.created_at || ticket.createdAt;

  const timelineItems = [
    {
      color: 'blue',
      children: (
        <div>
          <p className="text-xs font-medium text-slate-700">Ticket opened</p>
          <p className="text-[10px] text-slate-400">
            {createdDate ? dayjs(createdDate).format('MMM D, YYYY h:mm A') : ''}
          </p>
        </div>
      ),
    },
  ];

  if (ticket.status === 'in_progress' || ticket.status === 'resolved' || ticket.status === 'closed') {
    timelineItems.push({
      color: 'blue',
      children: <p className="text-xs font-medium text-slate-700">Being reviewed</p>,
    });
  }
  if (ticket.status === 'resolved' || ticket.status === 'closed') {
    timelineItems.push({
      color: 'green',
      children: (
        <div>
          <p className="text-xs font-medium text-slate-700">Resolved</p>
          {ticket.resolved_at && (
            <p className="text-[10px] text-slate-400">
              {dayjs(ticket.resolved_at).format('MMM D, YYYY h:mm A')}
            </p>
          )}
        </div>
      ),
    });
  }

  return (
    <Drawer
      title={ticket.subject || `Ticket #${ticket.id}`}
      open={open}
      onClose={onClose}
      width={480}
      className="[&_.ant-drawer-header]:border-b-slate-100"
    >
      <div className="space-y-5">
        <div className="flex flex-wrap gap-2">
          <Tag icon={st.icon} color={st.color}>{st.label}</Tag>
          {ticket.priority && (
            <Tag color={priorityColors[ticket.priority] || 'default'} className="capitalize">
              {ticket.priority}
            </Tag>
          )}
          {ticket.channel && <Tag>{ticket.channel}</Tag>}
        </div>

        <div>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 mb-1">
            Your message
          </p>
          <div className="rounded-xl border border-slate-100 bg-slate-50 p-4 text-sm text-slate-700 whitespace-pre-wrap">
            {ticket.message || 'No message provided.'}
          </div>
        </div>

        <div>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 mb-2">
            Status timeline
          </p>
          <Timeline items={timelineItems} />
        </div>

        {ticket.metadata?.notes?.filter((n) => n.type === 'reply').length > 0 && (
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 mb-2">
              Team replies
            </p>
            <div className="space-y-2">
              {ticket.metadata.notes
                .filter((n) => n.type === 'reply')
                .map((n, i) => (
                  <div
                    key={i}
                    className="rounded-xl border border-sky-100 bg-sky-50 p-3 text-sm text-slate-700"
                  >
                    <p>{n.note}</p>
                    <p className="mt-1 text-[10px] text-slate-400">
                      {dayjs(n.timestamp).format('MMM D, YYYY h:mm A')}
                    </p>
                  </div>
                ))}
            </div>
          </div>
        )}

        <p className="text-[10px] text-slate-400">
          Opened {createdDate ? dayjs(createdDate).format('MMMM D, YYYY') : ''}
        </p>
      </div>
    </Drawer>
  );
};

export default TicketDetailDrawer;
