import React, { useState, useEffect } from 'react';
import { Modal, Alert, Spin, Typography, Table, Tag, Checkbox, Button, Divider, Collapse, Space } from 'antd';
import { message } from '@/shared/utils/antdStatic';
import { 
  ExclamationCircleOutlined, 
  DeleteOutlined, 
  DollarOutlined, 
  CalendarOutlined,
  ShoppingOutlined,
  CreditCardOutlined,
  WarningOutlined
} from '@ant-design/icons';
import DataService from '@/shared/services/dataService';
import { formatCurrency } from '@/shared/utils/formatters';
import { useCurrency } from '@/shared/contexts/CurrencyContext';
import dayjs from 'dayjs';

const { Text, Title, Paragraph } = Typography;

const CustomerDeleteModal = ({ 
  visible, 
  onClose, 
  userId, 
  userName,
  onDeleted 
}) => {
  const { businessCurrency } = useCurrency();
  const [loading, setLoading] = useState(false);
  const [relatedData, setRelatedData] = useState(null);
  const [error, setError] = useState(null);
  const [confirmChecked, setConfirmChecked] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteMode, setDeleteMode] = useState(null); // 'soft' or 'hard'

  useEffect(() => {
    if (visible && userId) {
      fetchRelatedData();
    }
  }, [visible, userId]);

  useEffect(() => {
    if (!visible) {
      // Reset state when modal closes
      setRelatedData(null);
      setError(null);
      setConfirmChecked(false);
      setDeleteMode(null);
    }
  }, [visible]);

  const fetchRelatedData = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await DataService.getUserRelatedData(userId);
      setRelatedData(data);
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Failed to fetch user data');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!confirmChecked) {
      message.warning('Please confirm that you want to delete this customer');
      return;
    }

    setDeleting(true);
    try {
      await DataService.deleteUser(userId, {
        force: true,
        deleteAllData: deleteMode === 'hard'
      });
      message.success(`Customer "${userName}" deleted successfully`);
      onDeleted?.();
      onClose();
    } catch (err) {
      const errorMsg = err.response?.data?.message || err.response?.data?.error || err.message || 'Failed to delete customer';
      message.error(errorMsg);
    } finally {
      setDeleting(false);
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    return dayjs(dateString).format('DD MMM YYYY HH:mm');
  };

  const renderWalletBalance = () => {
    if (!relatedData?.walletBalance) return null;
    const balance = relatedData.walletBalance;
    const total = parseFloat(balance.available_amount || 0) + parseFloat(balance.pending_amount || 0);
    
    if (total === 0) return null;

    return (
      <Alert
        type={total > 0 ? 'warning' : 'info'}
        icon={<DollarOutlined />}
        message={
          <span>
            Wallet Balance: <strong>{formatCurrency(total, balance.currency || businessCurrency)}</strong>
            {parseFloat(balance.pending_amount || 0) > 0 && (
              <span className="ml-2 text-orange-500">
                (Pending: {formatCurrency(balance.pending_amount, balance.currency || businessCurrency)})
              </span>
            )}
          </span>
        }
        description={total > 0 ? "This balance will be lost if you delete the customer." : null}
        className="mb-4"
      />
    );
  };

  const transactionColumns = [
    {
      title: 'Date',
      dataIndex: 'created_at',
      key: 'date',
      render: formatDate,
      width: 150
    },
    {
      title: 'Type',
      dataIndex: 'transaction_type',
      key: 'type',
      render: (type) => <Tag>{type?.replace(/_/g, ' ')?.toUpperCase() || 'N/A'}</Tag>,
      width: 120
    },
    {
      title: 'Amount',
      dataIndex: 'amount',
      key: 'amount',
      render: (amount, record) => (
        <span className={parseFloat(amount) >= 0 ? 'text-green-600' : 'text-red-600'}>
          {formatCurrency(Math.abs(parseFloat(amount || 0)), record.currency || businessCurrency)}
        </span>
      ),
      width: 100
    },
    {
      title: 'Description',
      dataIndex: 'description',
      key: 'description',
      ellipsis: true
    }
  ];

  const bookingColumns = [
    {
      title: 'Date',
      dataIndex: 'lesson_date',
      key: 'date',
      render: (date, record) => (
        <span>{dayjs(date).format('DD MMM YYYY')} {record.start_time}</span>
      ),
      width: 180
    },
    {
      title: 'Service',
      dataIndex: 'service_name',
      key: 'service',
      ellipsis: true
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      render: (status) => (
        <Tag color={status === 'confirmed' ? 'green' : status === 'pending' ? 'orange' : 'default'}>
          {status?.toUpperCase()}
        </Tag>
      ),
      width: 100
    }
  ];

  const packageColumns = [
    {
      title: 'Package',
      dataIndex: 'package_name',
      key: 'name',
      ellipsis: true
    },
    {
      title: 'Remaining',
      key: 'remaining',
      render: (_, record) => `${record.remaining_units}/${record.total_units}`,
      width: 100
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      render: (status) => (
        <Tag color={status === 'active' ? 'green' : status === 'expired' ? 'red' : 'default'}>
          {status?.toUpperCase()}
        </Tag>
      ),
      width: 100
    }
  ];

  const rentalColumns = [
    {
      title: 'Equipment',
      dataIndex: 'equipment_name',
      key: 'name',
      ellipsis: true
    },
    {
      title: 'Period',
      key: 'period',
      render: (_, record) => (
        <span>{dayjs(record.start_date).format('DD MMM')} - {dayjs(record.end_date).format('DD MMM YYYY')}</span>
      ),
      width: 180
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      render: (status) => (
        <Tag color={status === 'active' ? 'green' : status === 'returned' ? 'blue' : 'default'}>
          {status?.toUpperCase()}
        </Tag>
      ),
      width: 100
    }
  ];

  const renderContent = () => {
    if (loading) {
      return (
        <div className="text-center py-8">
          <Spin size="large" />
          <p className="mt-4 text-gray-500">Loading customer data...</p>
        </div>
      );
    }

    if (error) {
      return (
        <Alert
          type="error"
          message="Error Loading Data"
          description={error}
          showIcon
        />
      );
    }

    if (!relatedData) {
      return null;
    }

    const { counts, samples, hasAnyData } = relatedData;
    const totalRecords = counts.transactions + counts.walletTransactions + counts.bookings + counts.packages + counts.rentals;

    return (
      <div className="space-y-4">
        {/* User Info */}
        <div className="bg-gray-50 p-4 rounded-lg">
          <Title level={5} className="mb-2">Customer: {userName || relatedData.user?.name}</Title>
          <Text type="secondary">{relatedData.user?.email}</Text>
        </div>

        {/* Wallet Balance Warning */}
        {renderWalletBalance()}

        {/* Summary */}
        {hasAnyData ? (
          <>
            <Alert
              type="warning"
              icon={<WarningOutlined />}
              message="This customer has related data"
              description={
                <div className="mt-2">
                  <p className="mb-2">Found {totalRecords} related record(s):</p>
                  <ul className="list-disc pl-5 space-y-1">
                    {counts.walletTransactions > 0 && (
                      <li><CreditCardOutlined className="mr-2" />{counts.walletTransactions} wallet transaction(s)</li>
                    )}
                    {counts.transactions > 0 && (
                      <li><DollarOutlined className="mr-2" />{counts.transactions} legacy transaction(s)</li>
                    )}
                    {counts.bookings > 0 && (
                      <li><CalendarOutlined className="mr-2" />{counts.bookings} booking(s)</li>
                    )}
                    {counts.packages > 0 && (
                      <li><ShoppingOutlined className="mr-2" />{counts.packages} package(s)</li>
                    )}
                    {counts.rentals > 0 && (
                      <li>{counts.rentals} rental(s)</li>
                    )}
                  </ul>
                </div>
              }
            />

            {/* Detail Panels */}
            <Collapse 
              defaultActiveKey={[]} 
              className="mt-4"
              items={[
                ...(samples.walletTransactions?.length > 0 ? [{
                  key: 'wallet',
                  label: (
                    <span>
                      <CreditCardOutlined className="mr-2" />
                      Wallet Transactions ({counts.walletTransactions})
                    </span>
                  ),
                  children: (
                    <>
                      <Table
                        dataSource={samples.walletTransactions}
                        columns={transactionColumns}
                        rowKey="id"
                        pagination={false}
                        size="small"
                      />
                      {counts.walletTransactions > 10 && (
                        <Text type="secondary" className="mt-2 block">
                          Showing 10 of {counts.walletTransactions} transactions...
                        </Text>
                      )}
                    </>
                  )
                }] : []),
                ...(samples.bookings?.length > 0 ? [{
                  key: 'bookings',
                  label: (
                    <span>
                      <CalendarOutlined className="mr-2" />
                      Bookings ({counts.bookings})
                    </span>
                  ),
                  children: (
                    <>
                      <Table
                        dataSource={samples.bookings}
                        columns={bookingColumns}
                        rowKey="id"
                        pagination={false}
                        size="small"
                      />
                      {counts.bookings > 10 && (
                        <Text type="secondary" className="mt-2 block">
                          Showing 10 of {counts.bookings} bookings...
                        </Text>
                      )}
                    </>
                  )
                }] : []),
                ...(samples.packages?.length > 0 ? [{
                  key: 'packages',
                  label: (
                    <span>
                      <ShoppingOutlined className="mr-2" />
                      Packages ({counts.packages})
                    </span>
                  ),
                  children: (
                    <Table
                      dataSource={samples.packages}
                      columns={packageColumns}
                      rowKey="id"
                      pagination={false}
                      size="small"
                    />
                  )
                }] : []),
                ...(samples.rentals?.length > 0 ? [{
                  key: 'rentals',
                  label: `Rentals (${counts.rentals})`,
                  children: (
                    <Table
                      dataSource={samples.rentals}
                      columns={rentalColumns}
                      rowKey="id"
                      pagination={false}
                      size="small"
                    />
                  )
                }] : [])
              ]}
            />

            <Divider />

            {/* Delete Options */}
            <div className="space-y-3">
              <Title level={5}>Delete Options</Title>
              
              <div 
                className={`p-4 border rounded-lg cursor-pointer transition-all ${deleteMode === 'hard' ? 'border-red-500 bg-red-50' : 'border-gray-200 hover:border-red-300'}`}
                onClick={() => setDeleteMode('hard')}
              >
                <div className="flex items-start">
                  <input 
                    type="radio" 
                    checked={deleteMode === 'hard'} 
                    onChange={() => setDeleteMode('hard')}
                    className="mt-1 mr-3"
                  />
                  <div>
                    <Text strong className="text-red-600">Delete Everything (Recommended)</Text>
                    <Paragraph className="text-gray-500 mb-0 text-sm">
                      Permanently delete the customer and ALL related data including transactions, bookings, packages, and rentals.
                      This cannot be undone.
                    </Paragraph>
                  </div>
                </div>
              </div>
            </div>
          </>
        ) : (
          <Alert
            type="info"
            message="No Related Data"
            description="This customer has no related transactions, bookings, packages, or rentals. You can safely delete this customer."
            showIcon
          />
        )}

        {/* Confirmation */}
        <Divider />
        <Checkbox 
          checked={confirmChecked} 
          onChange={(e) => setConfirmChecked(e.target.checked)}
          className="text-red-600"
        >
          <Text strong>
            I understand this action is permanent and cannot be undone
          </Text>
        </Checkbox>
      </div>
    );
  };

  return (
    <Modal
      title={
        <div className="flex items-center gap-2 text-red-600">
          <ExclamationCircleOutlined />
          <span>Delete Customer</span>
        </div>
      }
      open={visible}
      onCancel={onClose}
      width={800}
      footer={[
        <Button key="cancel" onClick={onClose}>
          Cancel
        </Button>,
        <Button
          key="delete"
          type="primary"
          danger
          icon={<DeleteOutlined />}
          loading={deleting}
          disabled={!confirmChecked || loading || (relatedData?.hasAnyData && !deleteMode)}
          onClick={handleDelete}
        >
          {relatedData?.hasAnyData ? 'Delete Customer & All Data' : 'Delete Customer'}
        </Button>
      ]}
      destroyOnHidden
    >
      {renderContent()}
    </Modal>
  );
};

export default CustomerDeleteModal;
