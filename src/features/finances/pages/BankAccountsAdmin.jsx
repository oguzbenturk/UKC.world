import { useState, useEffect, useCallback } from 'react';
import { Table, Tag, Button, Space, message, Modal, Form, Input, Select, Switch, InputNumber, Tooltip } from 'antd';
import {
  PlusOutlined, EditOutlined, ReloadOutlined, BankOutlined,
  CheckCircleOutlined, CloseCircleOutlined, CopyOutlined
} from '@ant-design/icons';
import apiClient from '@/shared/services/apiClient';

const { Option } = Select;

const CURRENCIES = [
  { value: 'EUR', label: 'EUR (€)' },
  { value: 'USD', label: 'USD ($)' },
  { value: 'GBP', label: 'GBP (£)' },
  { value: 'TRY', label: 'TRY (₺)' },
];

export default function BankAccountsAdmin() {
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState(null);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();

  const fetchAccounts = useCallback(async () => {
    setLoading(true);
    try {
      const response = await apiClient.get('/wallet/admin/bank-accounts', {
        params: { includeInactive: 'true' }
      });
      setAccounts(response.data.results || []);
    } catch (error) {
      console.error('Failed to fetch bank accounts:', error);
      message.error('Failed to load bank accounts');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAccounts();
  }, [fetchAccounts]);

  const openCreateModal = () => {
    setEditingAccount(null);
    form.resetFields();
    form.setFieldsValue({
      currency: 'EUR',
      isActive: true,
      isPrimary: false,
      displayOrder: 0,
    });
    setModalOpen(true);
  };

  const openEditModal = (account) => {
    setEditingAccount(account);
    form.setFieldsValue({
      bankName: account.bankName,
      accountHolder: account.accountHolder,
      iban: account.iban,
      accountNumber: account.accountNumber,
      swiftCode: account.swiftCode,
      routingNumber: account.routingNumber,
      currency: account.currency,
      instructions: account.instructions,
      isActive: account.isActive,
      isPrimary: account.isPrimary,
      displayOrder: account.displayOrder || 0,
    });
    setModalOpen(true);
  };

  const handleSave = async (values) => {
    setSaving(true);
    try {
      const payload = {
        ...values,
        scopeType: 'global',
      };
      if (editingAccount) {
        payload.id = editingAccount.id;
      }
      await apiClient.post('/wallet/admin/bank-accounts', payload);
      message.success(editingAccount ? 'Bank account updated' : 'Bank account created');
      setModalOpen(false);
      form.resetFields();
      setEditingAccount(null);
      fetchAccounts();
    } catch (error) {
      console.error('Failed to save bank account:', error);
      message.error(error.response?.data?.error || 'Failed to save bank account');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleStatus = async (account) => {
    try {
      await apiClient.post(`/wallet/admin/bank-accounts/${account.id}/status`, {
        isActive: !account.isActive,
        scopeType: 'global',
      });
      message.success(`Bank account ${account.isActive ? 'deactivated' : 'activated'}`);
      fetchAccounts();
    } catch (error) {
      console.error('Failed to toggle bank account status:', error);
      message.error('Failed to update bank account status');
    }
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    message.success('Copied to clipboard');
  };

  const columns = [
    {
      title: 'Bank',
      key: 'bank',
      render: (_, record) => (
        <div>
          <div className="font-semibold text-gray-900">{record.bankName || '—'}</div>
          <div className="text-xs text-gray-500">{record.accountHolder || '—'}</div>
        </div>
      ),
    },
    {
      title: 'IBAN / Account',
      key: 'iban',
      render: (_, record) => (
        <div className="flex items-center gap-1.5">
          <code className="text-xs bg-gray-50 px-2 py-0.5 rounded font-mono">
            {record.iban || record.accountNumber || '—'}
          </code>
          {(record.iban || record.accountNumber) && (
            <Tooltip title="Copy">
              <Button
                type="text"
                size="small"
                icon={<CopyOutlined />}
                onClick={() => copyToClipboard(record.iban || record.accountNumber)}
                className="text-gray-400 hover:text-blue-500"
              />
            </Tooltip>
          )}
        </div>
      ),
    },
    {
      title: 'Currency',
      dataIndex: 'currency',
      key: 'currency',
      width: 90,
      render: (currency) => <Tag>{currency}</Tag>,
    },
    {
      title: 'SWIFT',
      dataIndex: 'swiftCode',
      key: 'swiftCode',
      width: 120,
      render: (text) => text ? <code className="text-xs">{text}</code> : <span className="text-gray-300">—</span>,
    },
    {
      title: 'Primary',
      dataIndex: 'isPrimary',
      key: 'isPrimary',
      width: 80,
      align: 'center',
      render: (isPrimary) => isPrimary
        ? <CheckCircleOutlined className="text-blue-500 text-base" />
        : <span className="text-gray-300">—</span>,
    },
    {
      title: 'Status',
      dataIndex: 'isActive',
      key: 'isActive',
      width: 100,
      render: (isActive) => (
        <Tag color={isActive ? 'green' : 'default'} icon={isActive ? <CheckCircleOutlined /> : <CloseCircleOutlined />}>
          {isActive ? 'Active' : 'Inactive'}
        </Tag>
      ),
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 160,
      render: (_, record) => (
        <Space size="small">
          <Button
            size="small"
            icon={<EditOutlined />}
            onClick={() => openEditModal(record)}
          >
            Edit
          </Button>
          <Button
            size="small"
            danger={record.isActive}
            onClick={() => handleToggleStatus(record)}
          >
            {record.isActive ? 'Disable' : 'Enable'}
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <BankOutlined /> Bank Accounts
          </h1>
          <p className="text-gray-500 mt-1">
            Manage bank accounts that students can transfer funds to
          </p>
        </div>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={fetchAccounts} loading={loading}>
            Refresh
          </Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreateModal} className="bg-blue-600">
            Add Account
          </Button>
        </Space>
      </div>

      {accounts.length === 0 && !loading && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-4 text-sm text-amber-800">
          No bank accounts configured yet. Add one so students can make bank transfer deposits.
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <Table
          columns={columns}
          dataSource={accounts}
          rowKey="id"
          loading={loading}
          pagination={false}
          scroll={{ x: 900 }}
        />
      </div>

      {/* Create / Edit Modal */}
      <Modal
        open={modalOpen}
        title={editingAccount ? 'Edit Bank Account' : 'Add Bank Account'}
        onCancel={() => { setModalOpen(false); setEditingAccount(null); }}
        footer={null}
        width={520}
        destroyOnHidden
        centered
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleSave}
          requiredMark="optional"
          className="mt-4"
        >
          <Form.Item
            name="bankName"
            label="Bank Name"
            rules={[{ required: true, message: 'Bank name is required' }]}
          >
            <Input placeholder="e.g. Ziraat Bankası, Deutsche Bank" />
          </Form.Item>

          <Form.Item
            name="accountHolder"
            label="Account Holder"
            rules={[{ required: true, message: 'Account holder name is required' }]}
          >
            <Input placeholder="Account holder full name" />
          </Form.Item>

          <div className="grid grid-cols-2 gap-3">
            <Form.Item
              name="iban"
              label="IBAN"
              rules={[{ required: true, message: 'IBAN is required' }]}
            >
              <Input placeholder="TR00 0000 0000 0000 0000 00" className="font-mono" />
            </Form.Item>

            <Form.Item name="currency" label="Currency" rules={[{ required: true }]}>
              <Select>
                {CURRENCIES.map((c) => (
                  <Option key={c.value} value={c.value}>{c.label}</Option>
                ))}
              </Select>
            </Form.Item>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Form.Item name="swiftCode" label="SWIFT / BIC Code">
              <Input placeholder="e.g. TCZBTR2A" className="font-mono" />
            </Form.Item>

            <Form.Item name="accountNumber" label="Account Number">
              <Input placeholder="Optional account number" />
            </Form.Item>
          </div>

          <Form.Item name="routingNumber" label="Routing Number">
            <Input placeholder="For US banks (optional)" />
          </Form.Item>

          <Form.Item name="instructions" label="Transfer Instructions">
            <Input.TextArea
              placeholder="Special instructions for students (optional)"
              rows={2}
            />
          </Form.Item>

          <div className="grid grid-cols-3 gap-3">
            <Form.Item name="isActive" label="Active" valuePropName="checked">
              <Switch checkedChildren="Yes" unCheckedChildren="No" />
            </Form.Item>

            <Form.Item name="isPrimary" label="Primary" valuePropName="checked">
              <Switch checkedChildren="Yes" unCheckedChildren="No" />
            </Form.Item>

            <Form.Item name="displayOrder" label="Display Order">
              <InputNumber min={0} className="w-full" />
            </Form.Item>
          </div>

          <div className="pt-3 border-t border-gray-100 flex justify-end gap-2">
            <Button onClick={() => { setModalOpen(false); setEditingAccount(null); }}>
              Cancel
            </Button>
            <Button type="primary" htmlType="submit" loading={saving} className="bg-blue-600">
              {editingAccount ? 'Update' : 'Create'}
            </Button>
          </div>
        </Form>
      </Modal>
    </div>
  );
}
