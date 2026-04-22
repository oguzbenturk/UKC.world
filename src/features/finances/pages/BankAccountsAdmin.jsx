import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation(['manager']);
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
      message.error(t('manager:financePages.bankAccounts.loadError'));
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
      message.success(editingAccount ? t('manager:financePages.bankAccounts.messages.updated') : t('manager:financePages.bankAccounts.messages.created'));
      setModalOpen(false);
      form.resetFields();
      setEditingAccount(null);
      fetchAccounts();
    } catch (error) {
      console.error('Failed to save bank account:', error);
      message.error(error.response?.data?.error || t('manager:financePages.bankAccounts.messages.saveFailed'));
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
      message.success(t('manager:financePages.bankAccounts.messages.statusUpdated', { status: account.isActive ? 'deactivated' : 'activated' }));
      fetchAccounts();
    } catch (error) {
      console.error('Failed to toggle bank account status:', error);
      message.error(t('manager:financePages.bankAccounts.messages.statusFailed'));
    }
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    message.success(t('manager:financePages.bankAccounts.messages.copied'));
  };

  const columns = [
    {
      title: t('manager:financePages.bankAccounts.columns.bank'),
      key: 'bank',
      render: (_, record) => (
        <div>
          <div className="font-semibold text-gray-900">{record.bankName || '—'}</div>
          <div className="text-xs text-gray-500">{record.accountHolder || '—'}</div>
        </div>
      ),
    },
    {
      title: t('manager:financePages.bankAccounts.columns.ibanAccount'),
      key: 'iban',
      render: (_, record) => (
        <div className="flex items-center gap-1.5">
          <code className="text-xs bg-gray-50 px-2 py-0.5 rounded font-mono">
            {record.iban || record.accountNumber || '—'}
          </code>
          {(record.iban || record.accountNumber) && (
            <Tooltip title={t('manager:financePages.bankAccounts.messages.copyTooltip')}>
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
      title: t('manager:financePages.bankAccounts.columns.currency'),
      dataIndex: 'currency',
      key: 'currency',
      width: 90,
      render: (currency) => <Tag>{currency}</Tag>,
    },
    {
      title: t('manager:financePages.bankAccounts.columns.swift'),
      dataIndex: 'swiftCode',
      key: 'swiftCode',
      width: 120,
      render: (text) => text ? <code className="text-xs">{text}</code> : <span className="text-gray-300">—</span>,
    },
    {
      title: t('manager:financePages.bankAccounts.columns.primary'),
      dataIndex: 'isPrimary',
      key: 'isPrimary',
      width: 80,
      align: 'center',
      render: (isPrimary) => isPrimary
        ? <CheckCircleOutlined className="text-blue-500 text-base" />
        : <span className="text-gray-300">—</span>,
    },
    {
      title: t('manager:financePages.bankAccounts.columns.status'),
      dataIndex: 'isActive',
      key: 'isActive',
      width: 100,
      render: (isActive) => (
        <Tag color={isActive ? 'green' : 'default'} icon={isActive ? <CheckCircleOutlined /> : <CloseCircleOutlined />}>
          {isActive ? t('manager:financePages.bankAccounts.statusLabels.active') : t('manager:financePages.bankAccounts.statusLabels.inactive')}
        </Tag>
      ),
    },
    {
      title: t('manager:financePages.bankAccounts.columns.actions'),
      key: 'actions',
      width: 160,
      render: (_, record) => (
        <Space size="small">
          <Button
            size="small"
            icon={<EditOutlined />}
            onClick={() => openEditModal(record)}
          >
            {t('manager:financePages.bankAccounts.actions.edit')}
          </Button>
          <Button
            size="small"
            danger={record.isActive}
            onClick={() => handleToggleStatus(record)}
          >
            {record.isActive ? t('manager:financePages.bankAccounts.actions.disable') : t('manager:financePages.bankAccounts.actions.enable')}
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
            <BankOutlined /> {t('manager:financePages.bankAccounts.title')}
          </h1>
          <p className="text-gray-500 mt-1">
            {t('manager:financePages.bankAccounts.subtitle')}
          </p>
        </div>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={fetchAccounts} loading={loading}>
            {t('manager:financePages.bankAccounts.refresh')}
          </Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreateModal} className="bg-blue-600">
            {t('manager:financePages.bankAccounts.addAccount')}
          </Button>
        </Space>
      </div>

      {accounts.length === 0 && !loading && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-4 text-sm text-amber-800">
          {t('manager:financePages.bankAccounts.noBankAccounts')}
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
        title={editingAccount ? t('manager:financePages.bankAccounts.modal.editTitle') : t('manager:financePages.bankAccounts.modal.addTitle')}
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
            label={t('manager:financePages.bankAccounts.modal.fields.bankName')}
            rules={[{ required: true, message: t('manager:financePages.bankAccounts.modal.validation.bankNameRequired') }]}
          >
            <Input placeholder={t('manager:financePages.bankAccounts.modal.placeholders.bankName')} />
          </Form.Item>

          <Form.Item
            name="accountHolder"
            label={t('manager:financePages.bankAccounts.modal.fields.accountHolder')}
            rules={[{ required: true, message: t('manager:financePages.bankAccounts.modal.validation.accountHolderRequired') }]}
          >
            <Input placeholder={t('manager:financePages.bankAccounts.modal.placeholders.accountHolder')} />
          </Form.Item>

          <div className="grid grid-cols-2 gap-3">
            <Form.Item
              name="iban"
              label={t('manager:financePages.bankAccounts.modal.fields.iban')}
              rules={[{ required: true, message: t('manager:financePages.bankAccounts.modal.validation.ibanRequired') }]}
            >
              <Input placeholder={t('manager:financePages.bankAccounts.modal.placeholders.iban')} className="font-mono" />
            </Form.Item>

            <Form.Item name="currency" label={t('manager:financePages.bankAccounts.modal.fields.currency')} rules={[{ required: true }]}>
              <Select>
                {CURRENCIES.map((c) => (
                  <Option key={c.value} value={c.value}>{c.label}</Option>
                ))}
              </Select>
            </Form.Item>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Form.Item name="swiftCode" label={t('manager:financePages.bankAccounts.modal.fields.swift')}>
              <Input placeholder={t('manager:financePages.bankAccounts.modal.placeholders.swift')} className="font-mono" />
            </Form.Item>

            <Form.Item name="accountNumber" label={t('manager:financePages.bankAccounts.modal.fields.accountNumber')}>
              <Input placeholder={t('manager:financePages.bankAccounts.modal.placeholders.accountNumber')} />
            </Form.Item>
          </div>

          <Form.Item name="routingNumber" label={t('manager:financePages.bankAccounts.modal.fields.routingNumber')}>
            <Input placeholder={t('manager:financePages.bankAccounts.modal.placeholders.routingNumber')} />
          </Form.Item>

          <Form.Item name="instructions" label={t('manager:financePages.bankAccounts.modal.fields.instructions')}>
            <Input.TextArea
              placeholder={t('manager:financePages.bankAccounts.modal.placeholders.instructions')}
              rows={2}
            />
          </Form.Item>

          <div className="grid grid-cols-3 gap-3">
            <Form.Item name="isActive" label={t('manager:financePages.bankAccounts.modal.fields.isActive')} valuePropName="checked">
              <Switch checkedChildren="Yes" unCheckedChildren="No" />
            </Form.Item>

            <Form.Item name="isPrimary" label={t('manager:financePages.bankAccounts.modal.fields.isPrimary')} valuePropName="checked">
              <Switch checkedChildren="Yes" unCheckedChildren="No" />
            </Form.Item>

            <Form.Item name="displayOrder" label={t('manager:financePages.bankAccounts.modal.fields.displayOrder')}>
              <InputNumber min={0} className="w-full" />
            </Form.Item>
          </div>

          <div className="pt-3 border-t border-gray-100 flex justify-end gap-2">
            <Button onClick={() => { setModalOpen(false); setEditingAccount(null); }}>
              {t('manager:financePages.bankAccounts.actions.cancel')}
            </Button>
            <Button type="primary" htmlType="submit" loading={saving} className="bg-blue-600">
              {editingAccount ? t('manager:financePages.bankAccounts.actions.update') : t('manager:financePages.bankAccounts.actions.create')}
            </Button>
          </div>
        </Form>
      </Modal>
    </div>
  );
}
