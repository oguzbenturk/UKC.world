import { useState, useEffect, forwardRef, useImperativeHandle, useCallback, useRef } from 'react';
import Decimal from 'decimal.js';
import {
  Spin, Alert, Table, Button, Modal, Form, Input, InputNumber, DatePicker,
  Select, Popconfirm, Empty, Tag
} from 'antd';
import { message } from '@/shared/utils/antdStatic';
import {
  DownloadOutlined, DollarCircleOutlined, CheckCircleOutlined,
  ArrowUpOutlined, EditOutlined
} from '@ant-design/icons';
import { useData } from '@/shared/hooks/useData';
import { formatCurrency } from '@/shared/utils/formatters';
import { useCurrency } from '@/shared/contexts/CurrencyContext';
import moment from 'moment';
import jsPDF from 'jspdf';
import 'jspdf-autotable';

const { Option } = Select;

const InstructorPayments = forwardRef(({ instructor, onPaymentSuccess, readOnly = false }, ref) => {
  const { apiClient } = useData();
  const { businessCurrency, getCurrencySymbol } = useCurrency();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const managementEnabled = !readOnly;
  const hasFetchedRef = useRef(false);

  const [payrollHistory, setPayrollHistory] = useState([]);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [modalConfig, setModalConfig] = useState({ type: 'payment', record: null });
  const [form] = Form.useForm();

  const [totalEarnings, setTotalEarnings] = useState(0);
  const [totalPaid, setTotalPaid] = useState(0);
  const [unpaidEarnings, setUnpaidEarnings] = useState([]);

  const [isCommissionModalVisible, setIsCommissionModalVisible] = useState(false);
  const [selectedBooking, setSelectedBooking] = useState(null);
  const [commissionForm] = Form.useForm();
  const [isUpdatingCommission, setIsUpdatingCommission] = useState(false);
  const [earningsSearch, setEarningsSearch] = useState('');

  const fetchPayrollData = useCallback(async () => {
    if (!instructor?.id) return;
    setIsLoading(true);
    setError(null);

    try {
      const response = await apiClient.get(`/finances/instructor-earnings/${instructor.id}`);
      const { earnings = [], payrollHistory: history = [] } = response.data;

      let calcEarnings = new Decimal(0);
      const processed = earnings.map(e => {
        const commAmt = parseFloat(e.total_earnings || 0);
        calcEarnings = calcEarnings.plus(commAmt);
        return {
          ...e,
          duration: parseFloat(e.lesson_duration || 0),
          lesson_amount: parseFloat(e.lesson_amount || 0),
          commission_amount: commAmt,
          service_name: e.service_name || 'Lesson',
          student_name: e.student_name || 'Student',
          group_size: parseInt(e.group_size) || 1,
          participant_names: e.participant_names || null,
          booking_id: e.booking_id,
        };
      });

      let paidTotal = new Decimal(0);
      for (const p of history) paidTotal = paidTotal.plus(new Decimal(p.amount || 0));

      const balance = calcEarnings.minus(paidTotal);

      setTotalEarnings(calcEarnings.toNumber());
      setTotalPaid(paidTotal.toNumber());
      setPayrollHistory(history);
      setUnpaidEarnings(balance.greaterThan(0) ? processed : []);
    } catch (err) {
      setError(err.response?.status === 404
        ? 'Instructor earnings data not found.'
        : err.response?.data?.message || 'Failed to load payroll data.');
    } finally {
      setIsLoading(false);
    }
  }, [apiClient, instructor?.id]);

  useEffect(() => {
    if (instructor?.id && !hasFetchedRef.current) {
      hasFetchedRef.current = true;
      fetchPayrollData();
    }
  }, [instructor?.id, fetchPayrollData]);

  useImperativeHandle(ref, () => ({
    refreshData: () => { hasFetchedRef.current = false; fetchPayrollData(); }
  }));

  const fmt = (v) => formatCurrency(Number(v) || 0, businessCurrency || 'EUR');
  const availableBalance = new Decimal(totalEarnings || 0).minus(new Decimal(totalPaid || 0)).toNumber();

  // ── Actions ──
  const refresh = async () => {
    if (onPaymentSuccess) await onPaymentSuccess();
    else await fetchPayrollData();
  };

  const showModal = (type, record = null) => {
    if (!managementEnabled) return;
    setModalConfig({ type, record });
    setIsModalVisible(true);
  };

  const handleModalSubmit = async (values) => {
    if (!managementEnabled) return;
    setIsSubmitting(true);
    const { type, record } = modalConfig;
    const payload = {
      ...values,
      amount: type === 'deduction' ? -Math.abs(values.amount) : Math.abs(values.amount),
      payment_date: values.payment_date.format('YYYY-MM-DD'),
      instructor_id: instructor.id,
      description: values.notes || `${type === 'deduction' ? 'Deduction' : 'Payment'} for ${instructor.name}`,
    };
    try {
      if (type === 'edit' && record) {
        await apiClient.put(`/finances/instructor-payments/${record.id}`, payload);
        message.success('Payment updated!');
      } else {
        await apiClient.post('/finances/instructor-payments', payload);
        message.success(`${type === 'deduction' ? 'Deduction' : 'Payment'} recorded!`);
      }
      await refresh();
      setIsModalVisible(false);
    } catch (err) {
      message.error(err.response?.data?.message || `Failed to record ${type}.`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeletePayment = async (paymentId) => {
    if (!managementEnabled) return;
    try {
      await apiClient.delete(`/finances/instructor-payments/${paymentId}`);
      message.success('Payment deleted!');
      await refresh();
    } catch (err) {
      message.error(err.response?.data?.message || 'Failed to delete payment.');
    }
  };

  const handleCommissionUpdate = async (values) => {
    if (!managementEnabled || !selectedBooking || !instructor?.id) return;
    setIsUpdatingCommission(true);
    try {
      await apiClient.put(
        `/finances/instructor-earnings/${instructor.id}/${selectedBooking.booking_id}/commission`,
        { commissionRate: values.commissionRate }
      );
      const rate = parseFloat(values.commissionRate) / 100;
      setUnpaidEarnings(prev => prev.map(e =>
        e.booking_id === selectedBooking.booking_id
          ? { ...e, commission_rate: parseFloat(values.commissionRate), commission_amount: e.lesson_amount * rate }
          : e
      ));
      message.success('Commission rate updated');
      setIsCommissionModalVisible(false);
      await refresh();
    } catch (err) {
      message.error(err.response?.data?.message || 'Failed to update commission rate');
    } finally {
      setIsUpdatingCommission(false);
      setSelectedBooking(null);
      commissionForm.resetFields();
    }
  };

  const exportToPDF = () => {
    const doc = new jsPDF();
    const cols = ['Date', 'Amount', 'Type', 'Method', 'Notes'];
    const rows = payrollHistory.map(p => [
      p.payment_date ? moment(p.payment_date).format('YYYY-MM-DD') : '—',
      formatCurrency(p.amount), p.amount >= 0 ? 'Payment' : 'Deduction',
      p.payment_method || '—', p.notes || '',
    ]);
    doc.text(`Payment History — ${instructor.name}`, 14, 15);
    doc.autoTable(cols, rows, { startY: 20 });
    doc.save(`${instructor.name}_payments.pdf`);
  };

  // ── Render ──
  if (isLoading) return <div className="flex justify-center items-center h-48"><Spin size="large"><div className="p-8">Loading payroll...</div></Spin></div>;
  if (error) return <Alert message="Error" description={error} type="error" showIcon action={<Button size="small" type="primary" onClick={() => { hasFetchedRef.current = false; fetchPayrollData(); }}>Retry</Button>} />;

  return (
    <Spin spinning={isSubmitting}>
      <div className="space-y-5">
        {/* ── Summary cards ── */}
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: 'Lifetime Earnings', value: fmt(totalEarnings), icon: <DollarCircleOutlined />, color: 'text-emerald-600', bg: 'bg-emerald-50' },
            { label: 'Total Paid Out', value: fmt(totalPaid), icon: <ArrowUpOutlined />, color: 'text-red-500', bg: 'bg-red-50' },
            { label: 'Balance Owed', value: fmt(availableBalance), icon: <CheckCircleOutlined />, color: 'text-blue-600', bg: 'bg-blue-50' },
          ].map(s => (
            <div key={s.label} className="rounded-lg border border-gray-100 bg-white p-2.5">
              <div className={`inline-flex items-center justify-center w-6 h-6 rounded-md ${s.bg} ${s.color} text-xs mb-1.5`}>{s.icon}</div>
              <div className={`text-sm font-bold ${s.color} leading-tight`}>{s.value}</div>
              <div className="text-[10px] text-gray-400 mt-0.5 leading-tight">{s.label}</div>
            </div>
          ))}
        </div>

        {/* ── Unpaid Earnings ── */}
        <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between gap-2">
            <h4 className="text-sm font-semibold text-gray-800">Unpaid Earnings</h4>
            <Input.Search
              size="small"
              placeholder="Search…"
              allowClear
              value={earningsSearch}
              onChange={e => setEarningsSearch(e.target.value)}
              className="w-36"
            />
          </div>
          <Table
            columns={[
              { title: 'Date', dataIndex: 'lesson_date', key: 'date', render: t => t ? moment(t).format('YYYY-MM-DD') : '—', width: 110 },
              { title: 'Student', dataIndex: 'student_name', key: 'student', ellipsis: true,
                render: (t, r) => {
                  const name = r.participant_names || t;
                  return r.group_size > 1
                    ? <span>{name} <Tag color="purple" bordered={false} className="rounded-full m-0 text-xs">{r.group_size}ppl</Tag></span>
                    : name;
                }
              },
              { title: 'Service', dataIndex: 'service_name', key: 'service', ellipsis: true },
              { title: 'Amount', dataIndex: 'lesson_amount', key: 'amt', render: (t, r) => formatCurrency(t || 0, r.currency || businessCurrency || 'EUR'), width: 100 },
              { title: 'Rate', dataIndex: 'commission_rate', key: 'rate', width: 90,
                render: (v, r) => {
                  const rv = typeof v === 'number' ? v : parseFloat(v || '0');
                  return r.commission_type === 'fixed'
                    ? formatCurrency(rv, r.currency || businessCurrency || 'EUR') + '/h'
                    : `${(rv < 1 ? rv * 100 : rv).toFixed(1)}%`;
                }
              },
              { title: 'Commission', dataIndex: 'commission_amount', key: 'comm',
                render: (t, r) => <span className="font-medium text-emerald-700">{formatCurrency(t || 0, r.currency || businessCurrency || 'EUR')}</span>, width: 110 },
              ...(managementEnabled ? [{
                title: '', key: 'actions', width: 50,
                render: (_, r) => <Button type="text" size="small" icon={<EditOutlined />} onClick={() => { setSelectedBooking(r); setIsCommissionModalVisible(true); }} />,
              }] : []),
            ]}
            dataSource={earningsSearch.trim()
              ? unpaidEarnings.filter(e => {
                  const q = earningsSearch.toLowerCase();
                  return (
                    (e.student_name || '').toLowerCase().includes(q) ||
                    (e.participant_names || '').toLowerCase().includes(q) ||
                    (e.service_name || '').toLowerCase().includes(q) ||
                    (e.lesson_date || '').includes(q)
                  );
                })
              : unpaidEarnings
            }
            rowKey="booking_id"
            pagination={{ pageSize: 6, size: 'small', hideOnSinglePage: true }}
            size="small"
            scroll={{ x: 'max-content' }}
            locale={{ emptyText: <Empty description="No unpaid earnings." image={Empty.PRESENTED_IMAGE_SIMPLE} /> }}
          />
        </div>

        {/* ── Payment History ── */}
        <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <h4 className="text-sm font-semibold text-gray-800">Payment History</h4>
            <div className="flex items-center gap-2">
              {managementEnabled && (
                <>
                  <Button size="small" type="primary" onClick={() => showModal('payment')}>Pay</Button>
                  <Button size="small" onClick={() => showModal('deduction')}>Deduct</Button>
                </>
              )}
              <Button size="small" icon={<DownloadOutlined />} onClick={exportToPDF}>PDF</Button>
            </div>
          </div>
          <Table
            columns={[
              { title: 'Date', dataIndex: 'payment_date', key: 'date', render: t => t ? moment(t).format('YYYY-MM-DD') : '—', width: 110 },
              { title: 'Amount', dataIndex: 'amount', key: 'amount', render: t => fmt(t), width: 110 },
              { title: 'Type', dataIndex: 'amount', key: 'type', width: 100,
                render: a => a >= 0
                  ? <Tag color="green" bordered={false} className="rounded-full m-0">Payment</Tag>
                  : <Tag color="red" bordered={false} className="rounded-full m-0">Deduction</Tag>
              },
              { title: 'Method', dataIndex: 'payment_method', key: 'method', render: t => t || '—', width: 110 },
              { title: 'Notes', dataIndex: 'notes', key: 'notes', ellipsis: true },
              ...(managementEnabled ? [{
                title: '', key: 'actions', width: 100,
                render: (_, r) => (
                  <span className="flex gap-1">
                    <Button type="text" size="small" onClick={() => showModal('edit', r)}>Edit</Button>
                    <Popconfirm title="Delete this payment?" onConfirm={() => handleDeletePayment(r.id)} okText="Yes" cancelText="No">
                      <Button type="text" size="small" danger>Del</Button>
                    </Popconfirm>
                  </span>
                ),
              }] : []),
            ]}
            dataSource={payrollHistory}
            rowKey="id"
            pagination={{ pageSize: 6, size: 'small', hideOnSinglePage: true }}
            size="small"
            scroll={{ x: 'max-content' }}
            locale={{ emptyText: <Empty description="No payments yet." image={Empty.PRESENTED_IMAGE_SIMPLE} /> }}
          />
        </div>

        {/* ── Payment / Deduction Modal ── */}
        {managementEnabled && (
          <Modal
            title={`${modalConfig.type === 'edit' ? 'Edit' : 'New'} ${modalConfig.type === 'deduction' ? 'Deduction' : 'Payment'}`}
            open={isModalVisible}
            onCancel={() => setIsModalVisible(false)}
            footer={null}
            destroyOnHidden
            afterOpenChange={(open) => {
              if (open && modalConfig) {
                form.resetFields();
                if (modalConfig.record) {
                  form.setFieldsValue({ ...modalConfig.record, payment_date: moment(modalConfig.record.payment_date) });
                } else {
                  form.setFieldsValue({
                    amount: modalConfig.type === 'payment' && availableBalance > 0 ? availableBalance : null,
                    payment_date: moment(), payment_method: 'bank_transfer', notes: '', reference: '',
                  });
                }
              }
            }}
          >
            <Form form={form} layout="vertical" onFinish={handleModalSubmit} initialValues={{ payment_date: moment(), payment_method: 'bank_transfer' }}>
              <Form.Item name="amount" label="Amount" rules={[{ required: true, message: 'Enter the amount' }]}>
                <InputNumber prefix={getCurrencySymbol(businessCurrency || 'EUR')} style={{ width: '100%' }}
                  formatter={v => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')} parser={v => v.replace(/[^0-9.\-]/g, '')} />
              </Form.Item>
              <Form.Item name="payment_date" label="Payment Date" rules={[{ required: true }]}>
                <DatePicker style={{ width: '100%' }} />
              </Form.Item>
              <Form.Item name="payment_method" label="Method" rules={[{ required: true }]}>
                <Select getPopupContainer={trigger => trigger.parentElement}>
                  <Option value="bank_transfer">Bank Transfer</Option>
                  <Option value="cash">Cash</Option>
                  <Option value="paypal">PayPal</Option>
                  <Option value="other">Other</Option>
                </Select>
              </Form.Item>
              <Form.Item name="reference" label="Reference"><Input /></Form.Item>
              <Form.Item name="notes" label="Notes"><Input.TextArea rows={2} /></Form.Item>
              <Form.Item><Button type="primary" htmlType="submit" loading={isSubmitting} block>{modalConfig.type === 'edit' ? 'Update' : 'Submit'}</Button></Form.Item>
            </Form>
          </Modal>
        )}

        {/* ── Commission Edit Modal ── */}
        {managementEnabled && (
          <Modal title="Edit Commission Rate" open={isCommissionModalVisible}
            onCancel={() => { setIsCommissionModalVisible(false); setSelectedBooking(null); commissionForm.resetFields(); }}
            footer={null} destroyOnHidden
            afterOpenChange={(open) => {
              if (open && selectedBooking) {
                commissionForm.resetFields();
                commissionForm.setFieldsValue({ commissionRate: selectedBooking.commission_rate * 100 });
              }
            }}
          >
            <Form form={commissionForm} layout="vertical" onFinish={handleCommissionUpdate}>
              {selectedBooking && (
                <>
                  <div className="mb-4 rounded-lg bg-gray-50 p-3 text-sm space-y-1">
                    <div className="flex justify-between"><span className="text-gray-500">Date</span><span>{moment(selectedBooking.lesson_date).format('YYYY-MM-DD')}</span></div>
                    <div className="flex justify-between"><span className="text-gray-500">Student</span><span>{selectedBooking.student_name || '—'}</span></div>
                    <div className="flex justify-between"><span className="text-gray-500">Service</span><span>{selectedBooking.service_name || '—'}</span></div>
                    <div className="flex justify-between"><span className="text-gray-500">Amount</span><span>{formatCurrency(selectedBooking.lesson_amount || 0)}</span></div>
                  </div>
                  <Form.Item name="commissionRate" label="Commission Rate (%)"
                    rules={[{ required: true, message: 'Enter commission rate' }, { type: 'number', min: 0, max: 100, message: '0-100%' }]}>
                    <InputNumber min={0} max={100} step={0.5} precision={2} style={{ width: '100%' }}
                      formatter={v => `${v}%`} parser={v => v.replace('%', '')} />
                  </Form.Item>
                  <Form.Item><Button type="primary" htmlType="submit" loading={isUpdatingCommission} block>Update</Button></Form.Item>
                </>
              )}
            </Form>
          </Modal>
        )}
      </div>
    </Spin>
  );
});

export default InstructorPayments;
