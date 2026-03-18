import { useState, useEffect, useCallback, forwardRef, useImperativeHandle } from 'react';
import {
  Spin, Table, Button, Modal, Form, Input, InputNumber, DatePicker,
  Select, Segmented, Popconfirm, Empty, Tag
} from 'antd';
import { message } from '@/shared/utils/antdStatic';
import {
  DollarOutlined, PlusOutlined, MinusOutlined,
  EditOutlined, DeleteOutlined, CheckCircleOutlined,
  UserOutlined, CrownOutlined
} from '@ant-design/icons';
import { formatCurrency } from '@/shared/utils/formatters';
import {
  getManagerPaymentHistory,
  createManagerPayment,
  updateManagerPayment,
  deleteManagerPayment,
  getManagerSummaryAdmin,
} from '../services/managerCommissionApi';
import { useData } from '@/shared/hooks/useData';
import Decimal from 'decimal.js';
import dayjs from 'dayjs';

const { TextArea } = Input;

const sumPayments = (payments) => {
  let paid = new Decimal(0);
  let deducted = new Decimal(0);
  for (const p of payments) {
    const amt = parseFloat(p.amount || 0);
    if (amt >= 0) paid = paid.plus(amt);
    else deducted = deducted.plus(Math.abs(amt));
  }
  return { paid: paid.toNumber(), deducted: deducted.toNumber(), net: paid.minus(deducted).toNumber() };
};

const buildPayload = (values, type, record, managerName) => {
  const isDeduction = type === 'deduction' || (type === 'edit' && record && parseFloat(record.amount) < 0);
  const amount = isDeduction ? -Math.abs(values.amount) : Math.abs(values.amount);
  return {
    amount,
    isDeduction,
    role: values.role || 'manager',
    description: values.notes || `${isDeduction ? 'Deduction' : 'Payment'} for ${managerName}`,
    payment_date: values.payment_date.format('YYYY-MM-DD'),
    payment_method: values.payment_method || 'cash',
  };
};

/* eslint-disable complexity */
const ManagerPayments = forwardRef(({ manager, onPaymentSuccess }, ref) => {
  const { apiClient } = useData();
  const [loading, setLoading] = useState(true);

  // Manager commission data
  const [mgrCommissionTotal, setMgrCommissionTotal] = useState(0);
  const [mgrPayments, setMgrPayments] = useState([]);

  // Instructor earnings data
  const [instrEarningsTotal, setInstrEarningsTotal] = useState(0);
  const [instrPayments, setInstrPayments] = useState([]);

  // Modal
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [modalConfig, setModalConfig] = useState({ type: 'payment', role: 'manager', record: null });
  const [form] = Form.useForm();

  const fetchData = useCallback(async () => {
    if (!manager?.id) return;
    setLoading(true);
    try {
      const [mgrPayRes, mgrSummaryRes, instrRes] = await Promise.allSettled([
        getManagerPaymentHistory(manager.id),
        getManagerSummaryAdmin(manager.id),
        apiClient.get(`/finances/instructor-earnings/${manager.id}`),
      ]);

      // Manager commission payments
      let mPay = [];
      if (mgrPayRes.status === 'fulfilled' && mgrPayRes.value?.success) {
        mPay = (mgrPayRes.value.data || []).map(p => ({ ...p, _role: 'manager' }));
      }
      setMgrPayments(mPay);

      let mCommTotal = 0;
      if (mgrSummaryRes.status === 'fulfilled' && mgrSummaryRes.value?.success) {
        mCommTotal = parseFloat(mgrSummaryRes.value.data?.totalEarned ?? 0);
      }
      setMgrCommissionTotal(mCommTotal);

      // Instructor earnings + payments
      let iPay = [];
      let iTotal = 0;
      if (instrRes.status === 'fulfilled') {
        const d = instrRes.value?.data;
        const earnings = d?.earnings || [];
        iTotal = earnings.reduce((s, e) => s.plus(parseFloat(e.total_earnings || 0)), new Decimal(0)).toNumber();
        iPay = (d?.payrollHistory || []).map(p => ({ ...p, _role: 'instructor' }));
      }
      setInstrEarningsTotal(iTotal);
      setInstrPayments(iPay);
    } catch {
      /* best effort */
    } finally {
      setLoading(false);
    }
  }, [manager?.id, apiClient]);

  useEffect(() => { fetchData(); }, [fetchData]);
  useImperativeHandle(ref, () => ({ refreshData: fetchData }));

  // Combined calculations
  const mgrTotals = sumPayments(mgrPayments);
  const instrTotals = sumPayments(instrPayments);
  const totalEarned = new Decimal(mgrCommissionTotal).plus(instrEarningsTotal).toNumber();
  const totalPaid = new Decimal(mgrTotals.net).plus(instrTotals.net).toNumber();
  const totalBalance = new Decimal(totalEarned).minus(totalPaid).toNumber();

  // Combined payment history — merge and sort by date descending
  const allPayments = [...mgrPayments, ...instrPayments]
    .sort((a, b) => new Date(b.payment_date || 0) - new Date(a.payment_date || 0));

  const managerName = manager?.name || `${manager?.first_name || ''} ${manager?.last_name || ''}`.trim() || 'Manager';

  // ── Modal handlers ──
  const showModal = (type, role = 'manager', record = null) => {
    setModalConfig({ type, role: record?._role || role, record });
    setIsModalVisible(true);
  };

  const handleModalOpen = (open) => {
    if (!open) return;
    form.resetFields();
    const { type, role, record } = modalConfig;
    const isEdit = type === 'edit' && record;
    form.setFieldsValue(isEdit ? {
      amount: Math.abs(parseFloat(record.amount || 0)),
      payment_date: record.payment_date ? dayjs(record.payment_date) : dayjs(),
      payment_method: record.payment_method || 'cash',
      role: record._role || 'manager',
      notes: record.description || record.notes || '',
    } : {
      amount: type === 'payment' ? Math.max(totalBalance, 0) : undefined,
      payment_date: dayjs(),
      payment_method: 'cash',
      role,
    });
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      setIsSubmitting(true);

      const { type, record } = modalConfig;
      const p = buildPayload(values, type, record, managerName);

      if (type === 'edit' && record) {
        if (record._role === 'instructor') {
          await apiClient.put(`/finances/instructor-payments/${record.id}`, {
            amount: p.amount, payment_date: p.payment_date,
            instructor_id: manager.id, description: p.description,
            payment_method: p.payment_method,
          });
        } else {
          await updateManagerPayment(manager.id, record.id, {
            amount: p.amount, description: p.description,
            payment_date: p.payment_date, payment_method: p.payment_method,
          });
        }
        message.success('Payment updated');
      } else if (p.role === 'instructor') {
        await apiClient.post('/finances/instructor-payments', {
          instructor_id: manager.id, amount: p.amount,
          payment_date: p.payment_date, description: p.description,
          payment_method: p.payment_method,
        });
        message.success(`${p.isDeduction ? 'Deduction' : 'Payment'} recorded`);
      } else {
        await createManagerPayment(manager.id, {
          amount: p.amount, description: p.description,
          payment_date: p.payment_date, payment_method: p.payment_method,
        });
        message.success(`${p.isDeduction ? 'Deduction' : 'Payment'} recorded`);
      }

      setIsModalVisible(false);
      await fetchData();
      onPaymentSuccess?.();
    } catch (error) {
      if (!error.errorFields) message.error(error.message || 'Failed to save payment');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (record) => {
    try {
      if (record._role === 'instructor') {
        await apiClient.delete(`/finances/instructor-payments/${record.id}`);
      } else {
        await deleteManagerPayment(manager.id, record.id);
      }
      message.success('Payment deleted');
      await fetchData();
      onPaymentSuccess?.();
    } catch (error) {
      message.error(error.message || 'Failed to delete payment');
    }
  };

  // ── Table columns ──
  const paymentColumns = [
    {
      title: 'Date', dataIndex: 'payment_date', key: 'date', width: 100,
      render: val => val ? dayjs(val).format('DD/MM/YYYY') : '—',
    },
    {
      title: 'Role', key: 'role', width: 90, align: 'center',
      render: (_, r) => r._role === 'instructor'
        ? <Tag icon={<UserOutlined />} color="blue" bordered={false} className="rounded-full m-0">Instructor</Tag>
        : <Tag icon={<CrownOutlined />} color="purple" bordered={false} className="rounded-full m-0">Manager</Tag>,
    },
    {
      title: 'Amount', dataIndex: 'amount', key: 'amount', width: 100, align: 'right',
      render: val => {
        const amt = parseFloat(val || 0);
        return (
          <span className={`font-semibold ${amt >= 0 ? 'text-green-600' : 'text-red-500'}`}>
            {amt >= 0 ? '+' : ''}{formatCurrency(amt, 'EUR')}
          </span>
        );
      },
    },
    {
      title: 'Type', key: 'type', width: 90, align: 'center',
      render: (_, r) => parseFloat(r.amount || 0) >= 0
        ? <Tag color="green" bordered={false} className="rounded-full m-0">Payment</Tag>
        : <Tag color="red" bordered={false} className="rounded-full m-0">Deduction</Tag>,
    },
    {
      title: 'Method', dataIndex: 'payment_method', key: 'method', width: 90,
      render: val => val ? <span className="capitalize text-gray-600">{val}</span> : '—',
    },
    {
      title: 'Notes', key: 'notes', ellipsis: true,
      render: (_, r) => <span className="text-gray-500 text-xs">{r.description || r.notes || '—'}</span>,
    },
    {
      title: '', key: 'actions', width: 80, align: 'center',
      render: (_, record) => (
        <div className="flex items-center gap-1">
          <Button type="text" size="small" icon={<EditOutlined />} onClick={() => showModal('edit', record._role, record)} />
          <Popconfirm title="Delete this payment?" onConfirm={() => handleDelete(record)} okText="Delete" cancelText="Cancel">
            <Button type="text" size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </div>
      ),
    },
  ];

  if (loading) return <Spin className="flex justify-center py-12" />;

  return (
    <div className="space-y-5">
      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-gray-100 bg-white p-4">
          <div className="text-xs text-gray-400 mb-2">Earnings Breakdown</div>
          <div className="flex items-center gap-2 mb-1">
            <CrownOutlined className="text-purple-500" />
            <span className="text-xs text-gray-500">Manager Commission</span>
            <span className="ml-auto font-semibold text-purple-600">{formatCurrency(mgrCommissionTotal, 'EUR')}</span>
          </div>
          <div className="flex items-center gap-2">
            <UserOutlined className="text-blue-500" />
            <span className="text-xs text-gray-500">Instructor Earnings</span>
            <span className="ml-auto font-semibold text-blue-600">{formatCurrency(instrEarningsTotal, 'EUR')}</span>
          </div>
          <div className="border-t border-gray-100 mt-2 pt-2 flex items-center justify-between">
            <span className="text-xs font-medium text-gray-600">Total Earned</span>
            <span className="text-lg font-bold text-gray-800">{formatCurrency(totalEarned, 'EUR')}</span>
          </div>
        </div>
        <div className="rounded-xl border border-gray-100 bg-white p-4">
          <div className="text-xs text-gray-400 mb-2">Payment Summary</div>
          <div className="flex items-center gap-2 mb-1">
            <CheckCircleOutlined className="text-green-500" />
            <span className="text-xs text-gray-500">Total Paid Out</span>
            <span className="ml-auto font-semibold text-green-600">{formatCurrency(totalPaid, 'EUR')}</span>
          </div>
          <div className="border-t border-gray-100 mt-2 pt-2 flex items-center justify-between">
            <span className="text-xs font-medium text-gray-600">Balance Owed</span>
            <span className={`text-lg font-bold ${totalBalance > 0 ? 'text-amber-600' : 'text-gray-400'}`}>
              {formatCurrency(totalBalance, 'EUR')}
            </span>
          </div>
        </div>
      </div>

      {/* Combined Payment History */}
      <div className="rounded-xl border border-gray-100 bg-white overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <DollarOutlined className="text-indigo-500" />
            <h4 className="text-sm font-semibold text-gray-800">Payment History</h4>
            {allPayments.length > 0 && <Tag bordered={false} className="rounded-full ml-1">{allPayments.length}</Tag>}
          </div>
          <div className="flex gap-2">
            <Button size="small" type="primary" icon={<PlusOutlined />} onClick={() => showModal('payment')}>
              Pay
            </Button>
            <Button size="small" danger icon={<MinusOutlined />} onClick={() => showModal('deduction')}>
              Deduct
            </Button>
          </div>
        </div>

        {allPayments.length === 0 ? (
          <div className="px-5 py-6">
            <Empty description="No payments recorded yet" image={Empty.PRESENTED_IMAGE_SIMPLE} />
          </div>
        ) : (
          <Table
            columns={paymentColumns}
            dataSource={allPayments}
            rowKey={(r) => `${r._role}-${r.id}`}
            size="small"
            pagination={{ pageSize: 10, size: 'small', hideOnSinglePage: true }}
            scroll={{ x: 'max-content' }}
          />
        )}
      </div>

      {/* Payment/Deduction Modal */}
      <Modal
        title={modalConfig.type === 'edit' ? 'Edit Payment' : modalConfig.type === 'deduction' ? `Record Deduction — ${managerName}` : `Record Payment — ${managerName}`}
        open={isModalVisible}
        onCancel={() => setIsModalVisible(false)}
        onOk={handleSubmit}
        confirmLoading={isSubmitting}
        okText={modalConfig.type === 'edit' ? 'Update' : modalConfig.type === 'deduction' ? 'Record Deduction' : 'Record Payment'}
        okButtonProps={{ danger: modalConfig.type === 'deduction' }}
        afterOpenChange={handleModalOpen}
      >
        <Form form={form} layout="vertical" className="mt-4">
          <Form.Item name="role" label="Payment For" rules={[{ required: true, message: 'Select role' }]}>
            <Select disabled={modalConfig.type === 'edit'}>
              <Select.Option value="manager"><CrownOutlined className="mr-1" /> Manager Commission</Select.Option>
              <Select.Option value="instructor"><UserOutlined className="mr-1" /> Instructor Earnings</Select.Option>
            </Select>
          </Form.Item>
          <Form.Item name="amount" label="Amount (€)" rules={[{ required: true, message: 'Enter amount' }, { type: 'number', min: 0.01, message: 'Must be > 0' }]}>
            <InputNumber min={0.01} step={10} style={{ width: '100%' }} placeholder="0.00" addonAfter="€" size="large" />
          </Form.Item>
          <Form.Item name="payment_date" label="Date" rules={[{ required: true, message: 'Select date' }]}>
            <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
          </Form.Item>
          <Form.Item name="payment_method" label="Payment Method">
            <Segmented
              block
              options={[
                { label: 'Cash', value: 'cash' },
                { label: 'Bank Transfer', value: 'bank_transfer' },
                { label: 'Check', value: 'check' },
                { label: 'Other', value: 'other' },
              ]}
            />
          </Form.Item>
          <Form.Item name="notes" label="Notes">
            <TextArea rows={2} placeholder="Optional notes..." />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
});

ManagerPayments.displayName = 'ManagerPayments';
export default ManagerPayments;
