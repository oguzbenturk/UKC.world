import React, { useState } from 'react';
import { Modal, Form, Input, Row, Col, Typography, Tag, Button } from 'antd';
import { message } from '@/shared/utils/antdStatic';
import { EditOutlined, DeleteOutlined } from '@ant-design/icons';
import DataService from '@/shared/services/dataService';
import dayjs from 'dayjs';
import { formatCurrency } from '@/shared/utils/formatters';
import { useCurrency } from '@/shared/contexts/CurrencyContext';
import { logger } from '@/shared/utils/logger';

const { Text } = Typography;

const TransactionDetailModal = ({ visible, onClose, transaction, onTransactionUpdated, onTransactionDeleted, onRequestDelete }) => {
  const [form] = Form.useForm();
  const { businessCurrency } = useCurrency();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  React.useEffect(() => {
    if (visible && transaction) {
      form.setFieldsValue({
        description: transaction.description
      });
    }
  }, [visible, transaction, form]);

  const handleSave = async () => {
    try {
      setSaving(true);
      const values = await form.validateFields();
      
      const updatedTransaction = await DataService.updateTransaction(transaction.id, values);
      message.success('Transaction updated successfully');
      setEditing(false);
      
      if (onTransactionUpdated) {
        onTransactionUpdated(updatedTransaction);
      }
      
    } catch (error) {
      logger.error('Error updating transaction', { error: String(error) });
      if (error.response?.status === 404) {
        message.error('Transaction not found');
      } else if (error.response?.status === 400) {
        message.error(`Failed to update transaction: ${error.response?.data?.message || 'Invalid data'}`);
      } else {
        message.error('Failed to update transaction');
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!transaction) {
      return;
    }

    if (onRequestDelete) {
      onRequestDelete(transaction, { closeDetailModal: true });
      return;
    }

    // Show enhanced delete modal with hard delete option
    const isReversalChain = transaction.transaction_type?.toLowerCase().includes('reversal');
    
    Modal.confirm({
      title: 'Delete Transaction',
      width: 500,
      content: (
        <div>
          <p>Are you sure you want to delete this transaction?</p>
          <p className="mt-2 text-gray-600">
            Amount: <strong>{formatCurrency(Math.abs(parseFloat(transaction.amount || 0)), businessCurrency || 'EUR')}</strong>
          </p>
          {isReversalChain && (
            <div className="mt-3 p-3 bg-orange-50 border border-orange-200 rounded">
              <p className="text-orange-700 font-medium">⚠️ This is a reversal transaction</p>
              <p className="text-orange-600 text-sm">Normal deletion will create another reversal. Use Hard Delete to permanently remove.</p>
            </div>
          )}
          <div className="mt-4 p-3 bg-gray-50 rounded">
            <p className="font-medium mb-2">Delete Options:</p>
            <ul className="text-sm space-y-1 text-gray-600">
              <li>• <strong>Normal Delete:</strong> Creates a reversal transaction to balance the books</li>
              <li>• <strong>Hard Delete:</strong> Permanently removes without creating reversal (recommended for corrupted data)</li>
            </ul>
          </div>
        </div>
      ),
      okText: 'Hard Delete',
      okType: 'danger',
      cancelText: 'Cancel',
      onOk: async () => {
        try {
          const result = await DataService.deleteTransaction(transaction.id, { hardDelete: true });
          message.success('Transaction permanently deleted');
          
          if (onTransactionDeleted) {
            onTransactionDeleted(transaction.id);
          }
          
          onClose();
        } catch (error) {
          logger.error('Error deleting transaction', { error: String(error) });
          message.error(`Failed to delete: ${error.response?.data?.message || error.message}`);
        }
      },
      footer: (_, { OkBtn, CancelBtn }) => (
        <>
          <CancelBtn />
          <Button
            onClick={async () => {
              Modal.destroyAll();
              try {
                const result = await DataService.deleteTransaction(transaction.id);
                message.success(`Transaction deleted. Balance adjusted by ${formatCurrency(result.balanceAdjustment || 0, businessCurrency || 'EUR')}`);
                
                if (onTransactionDeleted) {
                  onTransactionDeleted(transaction.id);
                }
                
                onClose();
              } catch (error) {
                logger.error('Error deleting transaction', { error: String(error) });
                message.error(`Failed to delete: ${error.response?.data?.message || error.message}`);
              }
            }}
          >
            Normal Delete
          </Button>
          <OkBtn />
        </>
      )
    });
  };

  const handleCancel = () => {
    if (editing) {
      // Reset form to original values
      if (transaction) {
        form.setFieldsValue({
          description: transaction.description
        });
      }
      setEditing(false);
    } else {
      onClose();
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    try {
      return dayjs(dateString).format('YYYY-MM-DD HH:mm:ss');
  } catch {
      return 'N/A';
    }
  };

  const formatAmount = (amount, type) => {
    const isCredit = type === 'payment' || type === 'credit' || type === 'refund';
    const prefix = isCredit ? '+' : '-';
    return (
      <span className={isCredit ? 'text-green-600' : 'text-red-600'}>
        {prefix}{formatCurrency(Math.abs(parseFloat(amount || 0)), businessCurrency || 'EUR')}
      </span>
    );
  };

  const getStatusTag = (status) => {
    const color = status === 'completed' ? 'green' : status === 'pending' ? 'orange' : 'red';
    return <Tag color={color}>{status?.toUpperCase() || 'N/A'}</Tag>;
  };

  const getTypeTag = (type) => {
    const isCredit = type === 'payment' || type === 'credit' || type === 'refund';
    return (
      <Tag color={isCredit ? 'green' : 'volcano'}>
        {type?.toUpperCase() || 'N/A'}
      </Tag>
    );
  };

  return (
    <Modal
      title={
        <div className="flex justify-between items-center">
          <span>Transaction Details</span>
          {!editing && (
            <div>
              <Button 
                type="text" 
                icon={<EditOutlined />} 
                onClick={() => setEditing(true)}
                className="mr-2"
              >
                Edit
              </Button>
              <Button 
                type="text" 
                danger
                icon={<DeleteOutlined />} 
                onClick={handleDelete}
              >
                Delete
              </Button>
            </div>
          )}
        </div>
      }
      open={visible}
      onCancel={handleCancel}
      footer={editing ? [
        <Button key="cancel" onClick={handleCancel}>
          Cancel
        </Button>,
        <Button key="save" type="primary" loading={saving} onClick={handleSave}>
          Save Changes
        </Button>
      ] : [
        <Button key="close" onClick={onClose}>
          Close
        </Button>
      ]}
      width={700}
      destroyOnHidden
    >
      {transaction ? (
        <div>
          {/* Read-only transaction details */}
          <Row gutter={16} className="mb-4">
            <Col span={12}>
              <Text strong>Date:</Text>
              <div>{formatDate(transaction.transaction_date || transaction.created_at)}</div>
            </Col>
            <Col span={12}>
              <Text strong>Transaction ID:</Text>
              <div className="font-mono text-sm">{transaction.id}</div>
            </Col>
          </Row>

          <Row gutter={16} className="mb-4">
            <Col span={8}>
              <Text strong>Amount:</Text>
              <div>{formatAmount(transaction.amount, transaction.type)}</div>
              {transaction.original_currency && transaction.original_currency !== transaction.currency && (
                <div className="text-xs text-gray-400 mt-1">
                  Originally: {transaction.original_amount} {transaction.original_currency}
                  {transaction.transaction_exchange_rate && ` (Rate: ${transaction.transaction_exchange_rate})`}
                </div>
              )}
            </Col>
            <Col span={8}>
              <Text strong>Type:</Text>
              <div>{getTypeTag(transaction.type)}</div>
            </Col>
            <Col span={8}>
              <Text strong>Status:</Text>
              <div>{getStatusTag(transaction.status)}</div>
            </Col>
          </Row>

          {transaction.payment_method && (
            <Row gutter={16} className="mb-4">
              <Col span={12}>
                <Text strong>Payment Method:</Text>
                <div>{transaction.payment_method.replace('_', ' ').toUpperCase()}</div>
              </Col>
              <Col span={12}>
                <Text strong>Reference:</Text>
                <div className="font-mono text-sm">{transaction.reference_number || 'N/A'}</div>
              </Col>
            </Row>
          )}

          {/* Editable fields */}
          <Form form={form} layout="vertical" disabled={!editing}>
            <Form.Item
              label="Description"
              name="description"
              rules={[{ required: true, message: 'Please enter a description' }]}
            >
              <Input />
            </Form.Item>
          </Form>
        </div>
      ) : (
        <div className="text-center py-8">
          <Text type="secondary">No transaction data available</Text>
        </div>
      )}
    </Modal>
  );
};

export default TransactionDetailModal;
