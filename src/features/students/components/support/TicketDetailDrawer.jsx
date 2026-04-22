import { Drawer, Tag, Timeline } from 'antd';
import {
  ExclamationCircleOutlined,
  SyncOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { useTranslation } from 'react-i18next';

const buildStatusConfig = (t) => ({
  open: { color: 'gold', icon: <ExclamationCircleOutlined />, label: t('student:support.ticketDetail.statusLabels.open') },
  in_progress: { color: 'blue', icon: <SyncOutlined />, label: t('student:support.ticketDetail.statusLabels.in_progress') },
  resolved: { color: 'green', icon: <CheckCircleOutlined />, label: t('student:support.ticketDetail.statusLabels.resolved') },
  closed: { color: 'default', icon: <ClockCircleOutlined />, label: t('student:support.ticketDetail.statusLabels.closed') },
  pending: { color: 'blue', icon: <ClockCircleOutlined />, label: t('student:support.ticketDetail.statusLabels.pending') },
});

const priorityColors = { urgent: 'red', high: 'orange', normal: 'blue', low: 'default' };

const TicketDetailDrawer = ({ ticket, open, onClose }) => {
  const { t } = useTranslation(['student']);
  if (!ticket) return null;

  const statusConfig = buildStatusConfig(t);
  const st = statusConfig[ticket.status] || statusConfig.open;
  const createdDate = ticket.created_at || ticket.createdAt;

  const timelineItems = [
    {
      color: 'blue',
      children: (
        <div>
          <p className="text-xs font-medium text-slate-700">{t('student:support.ticketDetail.timeline.ticketOpened')}</p>
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
      children: <p className="text-xs font-medium text-slate-700">{t('student:support.ticketDetail.timeline.beingReviewed')}</p>,
    });
  }
  if (ticket.status === 'resolved' || ticket.status === 'closed') {
    timelineItems.push({
      color: 'green',
      children: (
        <div>
          <p className="text-xs font-medium text-slate-700">{t('student:support.ticketDetail.timeline.resolved')}</p>
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
            {t('student:support.ticketDetail.yourMessage')}
          </p>
          <div className="rounded-xl border border-slate-100 bg-slate-50 p-4 text-sm text-slate-700 whitespace-pre-wrap">
            {ticket.message || t('student:support.ticketDetail.noMessage')}
          </div>
        </div>

        <div>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 mb-2">
            {t('student:support.ticketDetail.statusTimeline')}
          </p>
          <Timeline items={timelineItems} />
        </div>

        {ticket.metadata?.notes?.filter((n) => n.type === 'reply').length > 0 && (
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 mb-2">
              {t('student:support.ticketDetail.teamReplies')}
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
          {t('student:support.ticketDetail.timeline.openedOn', { date: createdDate ? dayjs(createdDate).format('MMMM D, YYYY') : '' })}
        </p>
      </div>
    </Drawer>
  );
};

export default TicketDetailDrawer;
