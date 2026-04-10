import { useState, useEffect } from 'react';
import { App, Button, Card, Form, Input, Segmented, Select } from 'antd';
import { useOutletContext } from 'react-router-dom';
import { useStudentSupportMutation } from '../hooks/useStudentMutations';
import { useStudentDashboard } from '../hooks/useStudentDashboard';
import SupportChannelPicker from '../components/support/SupportChannelPicker';
import TicketHistoryList from '../components/support/TicketHistoryList';
import TicketDetailDrawer from '../components/support/TicketDetailDrawer';

const priorityOptions = [
  { value: 'low', label: 'Low' },
  { value: 'normal', label: 'Normal' },
  { value: 'high', label: 'High' },
];

const accentColors = {
  total: 'border-l-slate-400',
  open: 'border-l-amber-400',
  resolved: 'border-l-emerald-400',
};

const StatPill = ({ label, value, accentKey }) => (
  <div
    className={`min-w-[120px] shrink-0 rounded-2xl border border-slate-100 border-l-[3px] bg-white px-4 py-3 shadow-sm ${accentColors[accentKey] || 'border-l-slate-300'}`}
  >
    <p className="font-gotham-medium text-[10px] uppercase tracking-widest text-slate-400">{label}</p>
    <p className="mt-1 font-duotone-bold text-xl text-slate-900">{value}</p>
  </div>
);

const StudentSupport = () => {
  const { message, notification } = App.useApp();
  const [form] = Form.useForm();
  const context = useOutletContext();
  const { data: overview } = useStudentDashboard();
  const mutation = useStudentSupportMutation();

  const [activeTab, setActiveTab] = useState('new-ticket');
  const [selectedTicket, setSelectedTicket] = useState(null);

  const tickets = overview?.supportTickets ?? context?.overview?.supportTickets;
  const openCount = Array.isArray(tickets)
    ? tickets.filter((t) => String(t?.status || '').toLowerCase() === 'open').length
    : 0;
  const resolvedCount = Array.isArray(tickets)
    ? tickets.filter((t) => String(t?.status || '').toLowerCase() === 'resolved').length
    : 0;

  useEffect(() => {
    if (mutation.isError && mutation.error) {
      notification.error({ message: 'Unable to send request', description: mutation.error.message });
    }
  }, [mutation.error, mutation.isError, notification]);

  const handleSubmit = async (values) => {
    try {
      await mutation.mutateAsync({
        subject: values.subject,
        message: values.message,
        priority: values.priority,
        channel: 'portal',
      });
      message.success('Support request sent');
      form.resetFields();
      setActiveTab('my-tickets');
    } catch (err) {
      notification.error({ message: 'Unable to send request', description: err.message });
    }
  };

  return (
    <div className="space-y-6">
      {/* Stats strip */}
      <div className="flex gap-3 overflow-x-auto scrollbar-none pb-1">
        <StatPill label="Total Tickets" value={tickets?.length ?? 0} accentKey="total" />
        <StatPill label="Open" value={openCount} accentKey="open" />
        <StatPill label="Resolved" value={resolvedCount} accentKey="resolved" />
      </div>

      {/* Channel picker */}
      <SupportChannelPicker onOpenTicketForm={() => setActiveTab('new-ticket')} />

      {/* Tabbed content */}
      <div>
        <Segmented
          value={activeTab}
          onChange={setActiveTab}
          options={[
            { value: 'new-ticket', label: 'New Ticket' },
            { value: 'my-tickets', label: 'My Tickets' },
          ]}
          className="mb-4"
        />

        {activeTab === 'new-ticket' && (
          <Card className="rounded-2xl border border-slate-100 shadow-sm" variant="borderless">
            <p className="mb-4 text-sm text-slate-500">
              Need help with bookings, payments, or gear? Send us a quick note and our team will get back to
              you.
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
                <Input.TextArea rows={5} placeholder="Write your message for the school" />
              </Form.Item>
              <Form.Item className="mb-0">
                <Button type="primary" htmlType="submit" loading={mutation.isLoading}>
                  {mutation.isLoading ? 'Sending…' : 'Send request'}
                </Button>
              </Form.Item>
            </Form>
          </Card>
        )}

        {activeTab === 'my-tickets' && (
          <TicketHistoryList tickets={tickets} onSelect={setSelectedTicket} />
        )}
      </div>

      <TicketDetailDrawer
        ticket={selectedTicket}
        open={!!selectedTicket}
        onClose={() => setSelectedTicket(null)}
      />
    </div>
  );
};

export default StudentSupport;
