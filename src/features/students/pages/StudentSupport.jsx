import { useEffect } from 'react';
import { App, Button, Card, Empty, Form, Input, Select, Tag } from 'antd';
import { CustomerServiceOutlined, MailOutlined, TeamOutlined } from '@ant-design/icons';
import { useOutletContext } from 'react-router-dom';
import { useStudentSupportMutation } from '../hooks/useStudentMutations';
import { useStudentDashboard } from '../hooks/useStudentDashboard';

const priorityOptions = [
  { value: 'low', label: 'Low' },
  { value: 'normal', label: 'Normal' },
  { value: 'high', label: 'High' }
];

const ticketStatusColors = {
  open: 'gold',
  resolved: 'green',
  pending: 'blue'
};

const SupportTickets = ({ tickets }) => {
  if (!tickets?.length) {
    return <Empty description="You have no support requests" />;
  }

  return (
    <ul className="grid gap-3 text-sm sm:grid-cols-2">
      {tickets.map((ticket) => (
        <li
          key={ticket.id}
          className="flex h-full flex-col gap-3 rounded-xl border border-slate-200 p-3 shadow-sm dark:border-slate-700"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="font-semibold text-slate-800">Ticket #{ticket.id}</p>
              <p className="text-xs text-slate-500">Opened {ticket.createdAt?.split('T')[0]}</p>
            </div>
            <Tag color={ticketStatusColors[ticket.status] ?? 'default'}>{ticket.status}</Tag>
          </div>
          {ticket.priority && <Tag className="w-max capitalize">{ticket.priority}</Tag>}
        </li>
      ))}
    </ul>
  );
};

const StudentSupport = () => {
  const { message, notification } = App.useApp();
  const [form] = Form.useForm();
  const context = useOutletContext();
  const { data: overview } = useStudentDashboard();
  const mutation = useStudentSupportMutation();

  const tickets = overview?.supportTickets ?? context?.overview?.supportTickets;
  const openTickets = Array.isArray(tickets)
    ? tickets.filter((ticket) => String(ticket?.status || '').toLowerCase() === 'open')
    : [];
  const resolvedTickets = Array.isArray(tickets)
    ? tickets.filter((ticket) => String(ticket?.status || '').toLowerCase() === 'resolved')
    : [];

  useEffect(() => {
    if (mutation.isError && mutation.error) {
      notification.error({
        message: 'Unable to send request',
        description: mutation.error.message
      });
    }
  }, [mutation.error, mutation.isError, notification]);

  const handleSubmit = async (values) => {
    try {
      await mutation.mutateAsync({
        subject: values.subject,
        message: values.message,
        priority: values.priority,
        channel: 'portal'
      });
      message.success('Support request sent');
      form.resetFields();
    } catch (err) {
      notification.error({
        message: 'Unable to send request',
        description: err.message
      });
    }
  };

  return (
    <div className="space-y-6">
      <div className="overflow-hidden rounded-3xl bg-gradient-to-br from-sky-500 via-sky-600 to-indigo-600 p-6 text-white shadow-[0_18px_42px_rgba(29,78,216,0.28)]">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-stretch lg:justify-between">
          <div className="flex-1 space-y-5">
            <div className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.25em] text-white/80 shadow-sm">
              <CustomerServiceOutlined /> Support Center
            </div>
            <div className="space-y-3">
              <h2 className="text-3xl font-semibold leading-tight">We&apos;re here to help</h2>
              <p className="text-sm text-white/75 max-w-xl">
                Reach out to the team for booking adjustments, payment questions, or anything else that keeps you moving.
              </p>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-2xl border border-white/20 bg-white/12 p-3 text-center shadow-[0_10px_24px_rgba(24,64,192,0.24)] backdrop-blur">
                <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-white/85">Total Tickets</p>
                <p className="mt-2 text-2xl font-semibold text-white">{tickets?.length ?? 0}</p>
                <p className="mt-1 text-[10px] text-white/70">All requests you&apos;ve sent</p>
              </div>
              <div className="rounded-2xl border border-white/18 bg-white/10 p-3 text-center shadow-[0_10px_24px_rgba(13,139,255,0.24)] backdrop-blur">
                <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-white/85">Open</p>
                <p className="mt-2 text-2xl font-semibold text-white">{openTickets.length}</p>
                <p className="mt-1 text-[10px] text-white/70">In progress with the team</p>
              </div>
              <div className="rounded-2xl border border-white/18 bg-white/10 p-3 text-center shadow-[0_10px_24px_rgba(53,231,138,0.24)] backdrop-blur">
                <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-white/85">Resolved</p>
                <p className="mt-2 text-2xl font-semibold text-white">{resolvedTickets.length}</p>
                <p className="mt-1 text-[10px] text-white/70">Completed conversations</p>
              </div>
            </div>
          </div>
          <div className="mt-6 flex w-full max-w-xs flex-col gap-3 rounded-3xl border border-white/18 bg-white/14 p-5 backdrop-blur-xl shadow-[0_16px_36px_rgba(14,58,190,0.32)] lg:mt-0 lg:w-80">
            <p className="text-sm text-white/80">Need faster help? Check the knowledge base or email the front desk directly.</p>
            <Button
              type="primary"
              icon={<MailOutlined />}
              className="h-11 rounded-2xl border-0 bg-white text-sky-600 shadow-[0_10px_25px_rgba(11,78,240,0.35)] transition hover:bg-slate-100"
              href="mailto:hello@plannivo.com"
            >
              Email support
            </Button>
            <Button
              ghost
              icon={<TeamOutlined />}
              onClick={() => form.scrollToField?.('subject')}
              className="h-11 rounded-2xl border-white/45 text-white shadow-[0_8px_22px_rgba(255,255,255,0.22)] hover:bg-white/15"
            >
              Open ticket form
            </Button>
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="rounded-3xl border border-slate-200/70 shadow-sm" title="Contact support" variant="borderless">
          <p className="mb-4 text-sm text-slate-600">
            Need help with bookings, payments, or gear? Send us a quick note and our team will get back to you.
          </p>
          <Form layout="vertical" form={form} onFinish={handleSubmit} disabled={mutation.isLoading}>
            <Form.Item
              label="Subject"
              name="subject"
              rules={[{ required: true, message: 'Tell us how we can help' }]}
            >
              <Input placeholder="e.g. Need to adjust my lesson" />
            </Form.Item>
            <Form.Item label="Priority" name="priority" initialValue="normal">
              <Select options={priorityOptions} />
            </Form.Item>
            <Form.Item
              label="Message"
              name="message"
              rules={[{ required: true, message: 'Provide a bit more detail' }]}
            >
              <Input.TextArea rows={6} placeholder="Write your message for the school" />
            </Form.Item>
            <Form.Item>
              <Button type="primary" htmlType="submit" loading={mutation.isLoading}>
                {mutation.isLoading ? 'Sending…' : 'Send request'}
              </Button>
            </Form.Item>
          </Form>
        </Card>

        <Card className="rounded-3xl border border-slate-200/70 shadow-sm" title="Your recent tickets">
          <SupportTickets tickets={tickets} />
        </Card>
      </div>
    </div>
  );
};

export default StudentSupport;
