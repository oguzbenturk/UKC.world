import { useState, useEffect } from 'react';
import { Card, Table, Button, Modal, Input, InputNumber, Tag, message, Space, Tooltip, Empty } from 'antd';
import { ExclamationCircleOutlined, UndoOutlined, SearchOutlined, EuroOutlined } from '@ant-design/icons';
import { useAuth } from '@/shared/hooks/useAuth';
import { formatCurrency } from '@/shared/utils/formatters';
import apiClient from '@/shared/services/apiClient';
import dayjs from 'dayjs';

const { confirm } = Modal;
const { TextArea } = Input;

/**
 * Iyzico Payment Refunds Management Page
 * Admin/Manager only - allows refunding Iyzico card payments
 */
const PaymentRefunds = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [refundableTransactions, setRefundableTransactions] = useState([]);
  const [refundHistory, setRefundHistory] = useState([]);
  const [activeTab, setActiveTab] = useState('refundable');
  const [pagination, setPagination] = useState({ current: 1, pageSize: 20, total: 0 });
  const [searchUserId, setSearchUserId] = useState('');

  // Refund modal state
  const [refundModal, setRefundModal] = useState({ visible: false, transaction: null });
  const [refundAmount, setRefundAmount] = useState(null);
  const [refundReason, setRefundReason] = useState('');
  const [refundLoading, setRefundLoading] = useState(false);

  // Fetch refundable transactions
  const fetchRefundableTransactions = async (page = 1) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        limit: pagination.pageSize,
        offset: (page - 1) * pagination.pageSize
      });
      if (searchUserId) params.append('userId', searchUserId);

      const response = await apiClient.get(`/wallet/admin/refundable-transactions?${params}`);
      setRefundableTransactions(response.data.transactions || []);
      setPagination(prev => ({
        ...prev,
        current: page,
        total: response.data.pagination?.total || 0
      }));
    } catch (error) {
      message.error('Failed to load refundable transactions');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  // Fetch refund history
  const fetchRefundHistory = async (page = 1) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        limit: pagination.pageSize,
        offset: (page - 1) * pagination.pageSize
      });

      const response = await apiClient.get(`/wallet/admin/refund-history?${params}`);
      setRefundHistory(response.data.refunds || []);
      setPagination(prev => ({
        ...prev,
        current: page,
        total: response.data.refunds?.length || 0
      }));
    } catch (error) {
      message.error('Failed to load refund history');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'refundable') {
      fetchRefundableTransactions();
    } else {
      fetchRefundHistory();
    }
  }, [activeTab]);

  // Open refund modal
  const openRefundModal = (transaction) => {
    setRefundModal({ visible: true, transaction });
    setRefundAmount(transaction.amount);
    setRefundReason('');
  };

  // Process refund
  const processRefund = async () => {
    const { transaction } = refundModal;
    if (!transaction) return;

    // Confirm before proceeding
    confirm({
      title: 'Confirm Refund',
      icon: <ExclamationCircleOutlined />,
      content: (
        <div>
          <p>Are you sure you want to refund this payment?</p>
          <p><strong>Customer:</strong> {transaction.userName} ({transaction.userEmail})</p>
          <p><strong>Amount:</strong> {formatCurrency(refundAmount, transaction.currency)}</p>
          {refundAmount < transaction.amount && (
            <Tag color="orange">Partial Refund</Tag>
          )}
          <p className="mt-2 text-gray-500 text-sm">
            This will refund the money to the customer's original payment method (card).
          </p>
        </div>
      ),
      okText: 'Yes, Process Refund',
      okType: 'danger',
      cancelText: 'Cancel',
      onOk: async () => {
        setRefundLoading(true);
        try {
          const response = await apiClient.post('/wallet/admin/refund', {
            transactionId: transaction.id,
            amount: refundAmount < transaction.amount ? refundAmount : undefined,
            reason: refundReason || 'Admin refund'
          });

          message.success(
            response.data.refund?.isPartialRefund 
              ? 'Partial refund processed successfully' 
              : 'Full refund processed successfully'
          );
          
          setRefundModal({ visible: false, transaction: null });
          fetchRefundableTransactions(pagination.current);
        } catch (error) {
          message.error(error.response?.data?.details || error.response?.data?.error || 'Refund failed');
          console.error('Refund error:', error);
        } finally {
          setRefundLoading(false);
        }
      }
    });
  };

  // Refundable transactions columns
  const refundableColumns = [
    {
      title: 'Date',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 160,
      render: (date) => dayjs(date).format('DD MMM YYYY HH:mm')
    },
    {
      title: 'Customer',
      key: 'customer',
      render: (_, record) => (
        <div>
          <div className="font-medium">{record.userName}</div>
          <div className="text-xs text-gray-500">{record.userEmail}</div>
        </div>
      )
    },
    {
      title: 'Amount',
      dataIndex: 'amount',
      key: 'amount',
      width: 120,
      render: (amount, record) => (
        <span className="font-semibold text-green-600">
          {formatCurrency(amount, record.currency)}
        </span>
      )
    },
    {
      title: 'Payment ID',
      dataIndex: 'paymentId',
      key: 'paymentId',
      width: 120,
      render: (id) => (
        <Tooltip title={id}>
          <span className="text-xs font-mono">{id?.slice(0, 10)}...</span>
        </Tooltip>
      )
    },
    {
      title: 'Action',
      key: 'action',
      width: 120,
      render: (_, record) => (
        <Button
          type="primary"
          danger
          icon={<UndoOutlined />}
          onClick={() => openRefundModal(record)}
        >
          Refund
        </Button>
      )
    }
  ];

  // Refund history columns
  const historyColumns = [
    {
      title: 'Date',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 160,
      render: (date) => dayjs(date).format('DD MMM YYYY HH:mm')
    },
    {
      title: 'Customer',
      key: 'customer',
      render: (_, record) => (
        <div>
          <div className="font-medium">{record.userName}</div>
          <div className="text-xs text-gray-500">{record.userEmail}</div>
        </div>
      )
    },
    {
      title: 'Amount',
      dataIndex: 'amount',
      key: 'amount',
      width: 120,
      render: (amount, record) => (
        <span className="font-semibold text-red-600">
          -{formatCurrency(amount, record.currency)}
        </span>
      )
    },
    {
      title: 'Type',
      key: 'type',
      width: 100,
      render: (_, record) => (
        <Tag color={record.isPartialRefund ? 'orange' : 'red'}>
          {record.isPartialRefund ? 'Partial' : 'Full'}
        </Tag>
      )
    },
    {
      title: 'Reason',
      dataIndex: 'reason',
      key: 'reason',
      ellipsis: true,
      render: (reason) => reason || '-'
    },
    {
      title: 'Processed By',
      dataIndex: 'adminName',
      key: 'adminName',
      width: 150
    }
  ];

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Payment Refunds</h1>
        <p className="text-gray-500 mt-1">Manage Iyzico card payment refunds</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-4 mb-6">
        <Button
          type={activeTab === 'refundable' ? 'primary' : 'default'}
          onClick={() => setActiveTab('refundable')}
        >
          Refundable Payments
        </Button>
        <Button
          type={activeTab === 'history' ? 'primary' : 'default'}
          onClick={() => setActiveTab('history')}
        >
          Refund History
        </Button>
      </div>

      {activeTab === 'refundable' && (
        <Card>
          {/* Search */}
          <div className="mb-4">
            <Input
              placeholder="Filter by User ID"
              prefix={<SearchOutlined />}
              value={searchUserId}
              onChange={(e) => setSearchUserId(e.target.value)}
              onPressEnter={() => fetchRefundableTransactions(1)}
              style={{ width: 300 }}
              allowClear
            />
            <Button 
              className="ml-2" 
              onClick={() => fetchRefundableTransactions(1)}
            >
              Search
            </Button>
          </div>

          <Table
            columns={refundableColumns}
            dataSource={refundableTransactions}
            rowKey="id"
            loading={loading}
            pagination={{
              ...pagination,
              onChange: (page) => fetchRefundableTransactions(page),
              showSizeChanger: false,
              showTotal: (total) => `Total ${total} transactions`
            }}
            locale={{
              emptyText: (
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description="No refundable Iyzico payments found"
                />
              )
            }}
          />
        </Card>
      )}

      {activeTab === 'history' && (
        <Card>
          <Table
            columns={historyColumns}
            dataSource={refundHistory}
            rowKey="id"
            loading={loading}
            pagination={{
              ...pagination,
              onChange: (page) => fetchRefundHistory(page),
              showSizeChanger: false
            }}
            locale={{
              emptyText: (
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description="No refunds processed yet"
                />
              )
            }}
          />
        </Card>
      )}

      {/* Refund Modal */}
      <Modal
        title="Process Refund"
        open={refundModal.visible}
        onCancel={() => setRefundModal({ visible: false, transaction: null })}
        footer={[
          <Button key="cancel" onClick={() => setRefundModal({ visible: false, transaction: null })}>
            Cancel
          </Button>,
          <Button
            key="refund"
            type="primary"
            danger
            loading={refundLoading}
            onClick={processRefund}
            icon={<UndoOutlined />}
          >
            Process Refund
          </Button>
        ]}
      >
        {refundModal.transaction && (
          <div className="space-y-4">
            <div className="bg-gray-50 p-4 rounded-lg">
              <p className="text-sm text-gray-500">Customer</p>
              <p className="font-medium">{refundModal.transaction.userName}</p>
              <p className="text-sm text-gray-500">{refundModal.transaction.userEmail}</p>
            </div>

            <div className="bg-gray-50 p-4 rounded-lg">
              <p className="text-sm text-gray-500">Original Payment</p>
              <p className="font-semibold text-lg text-green-600">
                {formatCurrency(refundModal.transaction.amount, refundModal.transaction.currency)}
              </p>
              <p className="text-xs text-gray-400">
                {dayjs(refundModal.transaction.createdAt).format('DD MMM YYYY HH:mm')}
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Refund Amount
              </label>
              <InputNumber
                value={refundAmount}
                onChange={setRefundAmount}
                min={0.01}
                max={refundModal.transaction.amount}
                precision={2}
                addonAfter={refundModal.transaction.currency}
                style={{ width: '100%' }}
              />
              {refundAmount < refundModal.transaction.amount && (
                <p className="text-orange-500 text-sm mt-1">
                  This will be a partial refund
                </p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Reason (Optional)
              </label>
              <TextArea
                value={refundReason}
                onChange={(e) => setRefundReason(e.target.value)}
                placeholder="Enter reason for refund..."
                rows={3}
                maxLength={500}
              />
            </div>

            <div className="bg-yellow-50 border border-yellow-200 p-3 rounded-lg">
              <p className="text-yellow-800 text-sm">
                <strong>Note:</strong> The refund will be processed through Iyzico and 
                returned to the customer's original payment method. This may take 3-10 
                business days to appear on their statement.
              </p>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default PaymentRefunds;
