import { useState, useEffect, useCallback, forwardRef, useImperativeHandle } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Spin, Table, Button, Modal, Form, Input, InputNumber, DatePicker,
  Segmented, Popconfirm, Empty, Tag
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
    description: values.notes || `${isDeduction ? 'Deduction' : 'Payment'} for ${managerName}`,
    payment_date: values.payment_date.format('YYYY-MM-DD'),
    payment_method: values.payment_method || 'cash',
  };
};

/* eslint-disable complexity */
const ManagerPayments = forwardRef(({ manager, onPaymentSuccess }, ref) => {
  const { t } = useTranslation(['manager']);
  const { apiClient } = useData();
  const [loading, setLoading] = useState(true);

  // Manager commission data
  const [mgrCommissionTotal, setMgrCommissionTotal] = useState(0);
  const [payments, setPayments] = useState([]);

  // Instructor earnings data
  const [instrEarningsTotal, setInstrEarningsTotal] = useState(0);

  // Modal
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [modalConfig, setModalConfig] = useState({ type: 'payment', record: null });
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

      // Payments (single channel — manager payments)
      let mPay = [];
      if (mgrPayRes.status === 'fulfilled' && mgrPayRes.value?.success) {
        mPay = mgrPayRes.value.data || [];
      }
      setPayments(mPay);

      let mCommTotal = 0;
      if (mgrSummaryRes.status === 'fulfilled' && mgrSummaryRes.value?.success) {
        mCommTotal = parseFloat(mgrSummaryRes.value.data?.totalEarned ?? 0);
      }
      setMgrCommissionTotal(mCommTotal);

      // Instructor earnings (for display only — no separate payment channel)
      let iTotal = 0;
      if (instrRes.status === 'fulfilled') {
        const d = instrRes.value?.data;
        const earnings = d?.earnings || [];
        iTotal = earnings.reduce((s, e) => s.plus(parseFloat(e.total_earnings || 0)), new Decimal(0)).toNumber();
      }
      setInstrEarningsTotal(iTotal);
    } catch {
      /* best effort */
    } finally {
      setLoading(false);
    }
  }, [manager?.id, apiClient]);

  useEffect(() => { fetchData(); }, [fetchData]);
  useImperativeHandle(ref, () => ({ refreshData: fetchData }));

  // Calculations
  const payTotals = sumPayments(payments);
  const totalEarned = new Decimal(mgrCommissionTotal).plus(instrEarningsTotal).toNumber();
  const totalPaid = payTotals.net;
  const totalBalance = new Decimal(totalEarned).minus(totalPaid).toNumber();

  const managerName = manager?.name || `${manager?.first_name || ''} ${manager?.last_name || ''}`.trim() || 'Manager';

  // ── Modal handlers ──
  const showModal = (type, record = null) => {
    setModalConfig({ type, record });
    setIsModalVisible(true);
  };

  const handleModalOpen = (open) => {
    if (!open) return;
    form.resetFields();
    const { type, record } = modalConfig;
    const isEdit = type === 'edit' && record;
    form.setFieldsValue(isEdit ? {
      amount: Math.abs(parseFloat(record.amount || 0)),
      payment_date: record.payment_date ? dayjs(record.payment_date) : dayjs(),
      payment_method: record.payment_method || 'cash',
      notes: record.description || record.notes || '',
    } : {
      amount: type === 'payment' ? Math.max(totalBalance, 0) : undefined,
      payment_date: dayjs(),
      payment_method: 'cash',
    });
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      setIsSubmitting(true);

      const { type, record } = modalConfig;
      const p = buildPayload(values, type, record, managerName);

      if (type === 'edit' && record) {
        await updateManagerPayment(manager.id, record.id, {
          amount: p.amount, description: p.description,
          payment_date: p.payment_date, payment_method: p.payment_method,
        });
        message.success(t('manager:payments.messages.updated'));
      } else {
        await createManagerPayment(manager.id, {
          amount: p.amount, description: p.description,
          payment_date: p.payment_date, payment_method: p.payment_method,
        });
        message.success(t(p.isDeduction ? 'manager:payments.messages.deductionRecorded' : 'manager:payments.messages.paymentRecorded'));
      }

      setIsModalVisible(false);
      await fetchData();
      onPaymentSuccess?.();
    } catch (error) {
      if (!error.errorFields) message.error(error.message || t('manager:payments.messages.saveFailed'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (record) => {
    try {
      await deleteManagerPayment(manager.id, record.id);
      message.success(t('manager:payments.messages.deleted'));
      await fetchData();
      onPaymentSuccess?.();
    } catch (error) {
      message.error(error.message || t('manager:payments.messages.deleteFailed'));
    }
  };

  // ── Table columns ──
  const paymentColumns = [
    {
      title: t('manager:payments.columns.date'), dataIndex: 'payment_date', key: 'date', width: 100,
      render: val => val ? dayjs(val).format('DD/MM/YYYY') : '—',
    },
    {
      title: t('manager:payments.columns.amount'), dataIndex: 'amount', key: 'amount', width: 100, align: 'right',
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
      title: t('manager:payments.columns.type'), key: 'type', width: 90, align: 'center',
      render: (_, r) => parseFloat(r.amount || 0) >= 0
        ? <Tag color="green" bordered={false} className="rounded-full m-0">{t('manager:payments.paymentType')}</Tag>
        : <Tag color="red" bordered={false} className="rounded-full m-0">{t('manager:payments.deductionType')}</Tag>,
    },
    {
      title: t('manager:payments.columns.method'), dataIndex: 'payment_method', key: 'method', width: 90,
      render: val => val ? <span className="capitalize text-gray-600">{val}</span> : '—',
    },
    {
      title: t('manager:payments.columns.notes'), key: 'notes', ellipsis: true,
      render: (_, r) => <span className="text-gray-500 text-xs">{r.description || r.notes || '—'}</span>,
    },
    {
      title: '', key: 'actions', width: 80, align: 'center',
      render: (_, record) => (
        <div className="flex items-center gap-1">
          <Button type="text" size="small" icon={<EditOutlined />} onClick={() => showModal('edit', record)} />
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
          <div className="text-xs text-gray-400 mb-2">{t('manager:payments.earningsBreakdown')}</div>
          <div className="flex items-center gap-2 mb-1">
            <CrownOutlined className="text-purple-500" />
            <span className="text-xs text-gray-500">{t('manager:payments.managerCommission')}</span>
            <span className="ml-auto font-semibold text-purple-600">{formatCurrency(mgrCommissionTotal, 'EUR')}</span>
          </div>
          <div className="flex items-center gap-2">
            <UserOutlined className="text-blue-500" />
            <span className="text-xs text-gray-500">{t('manager:payments.instructorEarnings')}</span>
            <span className="ml-auto font-semibold text-blue-600">{formatCurrency(instrEarningsTotal, 'EUR')}</span>
          </div>
          <div className="border-t border-gray-100 mt-2 pt-2 flex items-center justify-between">
            <span className="text-xs font-medium text-gray-600">{t('manager:payments.totalEarned')}</span>
            <span className="text-lg font-bold text-gray-800">{formatCurrency(totalEarned, 'EUR')}</span>
          </div>
        </div>
        <div className="rounded-xl border border-gray-100 bg-white p-4">
          <div className="text-xs text-gray-400 mb-2">{t('manager:payments.paymentSummary')}</div>
          <div className="flex items-center gap-2 mb-1">
            <CheckCircleOutlined className="text-green-500" />
            <span className="text-xs text-gray-500">{t('manager:payments.totalPaidOut')}</span>
            <span className="ml-auto font-semibold text-green-600">{formatCurrency(totalPaid, 'EUR')}</span>
          </div>
          <div className="border-t border-gray-100 mt-2 pt-2 flex items-center justify-between">
            <span className="text-xs font-medium text-gray-600">{t('manager:payments.balanceOwed')}</span>
            <span className={`text-lg font-bold ${totalBalance > 0 ? 'text-amber-600' : 'text-gray-400'}`}>
              {formatCurrency(totalBalance, 'EUR')}
            </span>
          </div>
        </div>
      </div>

      {/* Payment History */}
      <div className="rounded-xl border border-gray-100 bg-white overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <DollarOutlined className="text-indigo-500" />
            <h4 className="text-sm font-semibold text-gray-800">{t('manager:payments.paymentHistory')}</h4>
            {payments.length > 0 && <Tag bordered={false} className="rounded-full ml-1">{payments.length}</Tag>}
          </div>
          <div className="flex gap-2">
            <Button size="small" type="primary" icon={<PlusOutlined />} onClick={() => showModal('payment')}>
              {t('manager:payments.pay')}
            </Button>
            <Button size="small" danger icon={<MinusOutlined />} onClick={() => showModal('deduction')}>
              {t('manager:payments.deduct')}
            </Button>
          </div>
        </div>

        {payments.length === 0 ? (
          <div className="px-5 py-6">
            <Empty description={t('manager:payments.noPayments')} image={Empty.PRESENTED_IMAGE_SIMPLE} />
          </div>
        ) : (
          <Table
            columns={paymentColumns}
            dataSource={payments}
            rowKey="id"
            size="small"
            pagination={{ pageSize: 10, size: 'small', hideOnSinglePage: true }}
            scroll={{ x: 'max-content' }}
          />
        )}
      </div>

      {/* Payment/Deduction Modal */}
      <Modal
        title={
          modalConfig.type === 'edit'
            ? t('manager:payments.editPayment')
            : modalConfig.type === 'deduction'
              ? t('manager:payments.recordDeduction', { name: managerName })
              : t('manager:payments.recordPayment', { name: managerName })
        }
        open={isModalVisible}
        onCancel={() => setIsModalVisible(false)}
        onOk={handleSubmit}
        confirmLoading={isSubmitting}
        okText={
          modalConfig.type === 'edit'
            ? t('manager:payments.actions.update')
            : modalConfig.type === 'deduction'
              ? t('manager:payments.actions.recordDeduction')
              : t('manager:payments.actions.recordPayment')
        }
        okButtonProps={{ danger: modalConfig.type === 'deduction' }}
        afterOpenChange={handleModalOpen}
      >
        <Form form={form} layout="vertical" className="mt-4">
          <Form.Item name="amount" label={t('manager:payments.form.amount')} rules={[{ required: true, message: t('manager:payments.form.validation.enterAmount') }, { type: 'number', min: 0.01, message: t('manager:payments.form.validation.mustBePositive') }]}>
            <InputNumber min={0.01} step={10} style={{ width: '100%' }} placeholder="0.00" addonAfter="€" size="large" />
          </Form.Item>
          <Form.Item name="payment_date" label={t('manager:payments.form.date')} rules={[{ required: true, message: t('manager:payments.form.validation.selectDate') }]}>
            <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
          </Form.Item>
          <Form.Item name="payment_method" label={t('manager:payments.form.paymentMethod')}>
            <Segmented
              block
              options={[
                { label: t('manager:payments.form.methods.cash'), value: 'cash' },
                { label: t('manager:payments.form.methods.bank_transfer'), value: 'bank_transfer' },
                { label: t('manager:payments.form.methods.check'), value: 'check' },
                { label: t('manager:payments.form.methods.other'), value: 'other' },
              ]}
            />
          </Form.Item>
          <Form.Item name="notes" label={t('manager:payments.form.notes')}>
            <TextArea rows={2} placeholder={t('manager:payments.form.notesPlaceholder')} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
});

ManagerPayments.displayName = 'ManagerPayments';
export default ManagerPayments;
