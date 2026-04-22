import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Input, Tag, Space, Collapse, Empty, message as antMessage } from 'antd';
import {
  ExclamationCircleOutlined,
  SyncOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  MessageOutlined,
  FileTextOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { useUpdateTicketStatus, useAddTicketNote } from '../../hooks/useSupportTickets';

const { TextArea } = Input;

const statusConfig = {
  open: { color: 'gold', icon: <ExclamationCircleOutlined /> },
  in_progress: { color: 'blue', icon: <SyncOutlined /> },
  resolved: { color: 'green', icon: <CheckCircleOutlined /> },
  closed: { color: 'default', icon: <ClockCircleOutlined /> },
};

const priorityColors = { urgent: 'red', high: 'orange', normal: 'blue', low: 'default' };

const TicketConversationPanel = ({ ticket }) => {
  const { t } = useTranslation(['admin']);
  const [replyText, setReplyText] = useState('');
  const [noteText, setNoteText] = useState('');
  const updateStatus = useUpdateTicketStatus();
  const addNote = useAddTicketNote();

  if (!ticket) {
    return (
      <div className="flex items-center justify-center h-full min-h-[400px]">
        <Empty description={t('admin:support.conversation.selectTicket')} />
      </div>
    );
  }

  const st = statusConfig[ticket.status] || statusConfig.open;
  const notes = ticket.metadata?.notes || [];

  const handleReply = async () => {
    if (!replyText.trim()) return;
    try {
      await addNote.mutateAsync({ ticketId: ticket.id, note: replyText, type: 'reply' });
      antMessage.success(t('admin:support.toast.replySent'));
      setReplyText('');
    } catch {
      antMessage.error(t('admin:support.toast.replyError'));
    }
  };

  const handleNote = async () => {
    if (!noteText.trim()) return;
    try {
      await addNote.mutateAsync({ ticketId: ticket.id, note: noteText, type: 'internal' });
      antMessage.success(t('admin:support.toast.noteAdded'));
      setNoteText('');
    } catch {
      antMessage.error(t('admin:support.toast.noteError'));
    }
  };

  const handleStatusChange = async (newStatus) => {
    try {
      await updateStatus.mutateAsync({ ticketId: ticket.id, status: newStatus });
      antMessage.success(t('admin:support.toast.statusUpdated', { status: newStatus.replace('_', ' ') }));
    } catch {
      antMessage.error(t('admin:support.toast.statusError'));
    }
  };

  return (
    <div className="flex h-full flex-col rounded-2xl border border-slate-100 bg-white shadow-sm">
      {/* Header */}
      <div className="border-b border-slate-100 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="font-semibold text-slate-900 truncate">{ticket.subject}</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              {ticket.student_name} &middot; {ticket.student_email}
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5 shrink-0">
            <Tag icon={st.icon} color={st.color} className="capitalize">{ticket.status?.replace('_', ' ')}</Tag>
            <Tag color={priorityColors[ticket.priority] || 'default'} className="capitalize">
              {ticket.priority}
            </Tag>
            {ticket.channel && <Tag>{ticket.channel}</Tag>}
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-wrap gap-2 mt-3">
          {ticket.status === 'open' && (
            <Button
              size="small"
              type="primary"
              loading={updateStatus.isPending}
              onClick={() => handleStatusChange('in_progress')}
            >
              {t('admin:support.conversation.start')}
            </Button>
          )}
          {['open', 'in_progress'].includes(ticket.status) && (
            <Button
              size="small"
              className="border-emerald-300 text-emerald-600 hover:bg-emerald-50"
              loading={updateStatus.isPending}
              onClick={() => handleStatusChange('resolved')}
            >
              {t('admin:support.conversation.resolve')}
            </Button>
          )}
          {ticket.status === 'resolved' && (
            <Button
              size="small"
              loading={updateStatus.isPending}
              onClick={() => handleStatusChange('closed')}
            >
              {t('admin:support.conversation.close')}
            </Button>
          )}
        </div>
      </div>

      {/* Thread */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {/* Original message */}
        <div className="flex justify-start">
          <div className="max-w-[85%] rounded-2xl rounded-tl-sm border border-slate-100 bg-slate-50 p-3">
            <p className="text-sm text-slate-700 whitespace-pre-wrap">{ticket.message}</p>
            <p className="mt-1 text-[10px] text-slate-400">
              {ticket.student_name} &middot; {dayjs(ticket.created_at).format('MMM D, h:mm A')}
            </p>
          </div>
        </div>

        {/* Notes/replies chronologically */}
        {notes.map((n, i) => {
          const isReply = n.type === 'reply';
          return (
            <div key={i} className={`flex ${isReply ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[85%] rounded-2xl p-3 ${
                  isReply
                    ? 'rounded-tr-sm border border-sky-100 bg-sky-50'
                    : 'rounded-tl-sm border border-amber-100 bg-amber-50'
                }`}
              >
                {!isReply && (
                  <p className="text-[10px] font-medium text-amber-600 mb-1 flex items-center gap-1">
                    <FileTextOutlined /> {t('admin:support.table.internalNote')}
                  </p>
                )}
                <p className="text-sm text-slate-700 whitespace-pre-wrap">{n.note}</p>
                <p className="mt-1 text-[10px] text-slate-400">
                  {isReply ? t('admin:support.conversation.adminReply') : t('admin:support.conversation.adminNote')} &middot;{' '}
                  {dayjs(n.timestamp).format('MMM D, h:mm A')}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Reply + Note input */}
      <div className="border-t border-slate-100 p-4 space-y-3">
        <div className="flex gap-2">
          <TextArea
            rows={2}
            placeholder={t('admin:support.conversation.replyPlaceholder')}
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            className="flex-1"
          />
          <Button
            type="primary"
            icon={<MessageOutlined />}
            onClick={handleReply}
            loading={addNote.isPending}
            disabled={!replyText.trim()}
          >
            {t('admin:support.conversation.reply')}
          </Button>
        </div>

        <Collapse
          size="small"
          items={[
            {
              key: 'note',
              label: (
                <span className="text-xs text-amber-600">
                  <FileTextOutlined /> {t('admin:support.conversation.addInternalNote')}
                </span>
              ),
              children: (
                <div className="flex gap-2">
                  <TextArea
                    rows={2}
                    placeholder={t('admin:support.conversation.notePlaceholder')}
                    value={noteText}
                    onChange={(e) => setNoteText(e.target.value)}
                    className="flex-1"
                  />
                  <Button
                    onClick={handleNote}
                    loading={addNote.isPending}
                    disabled={!noteText.trim()}
                  >
                    {t('admin:support.conversation.add')}
                  </Button>
                </div>
              ),
            },
          ]}
        />
      </div>
    </div>
  );
};

export default TicketConversationPanel;
