// src/features/admin/components/CurrencyManagement.jsx
import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Card,
  Table,
  Button,
  Modal,
  Form,
  Input,
  InputNumber,
  Switch,
  Popconfirm,
  Space,
  Tag,
  Typography
} from 'antd';
import { message } from '@/shared/utils/antdStatic';
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  CrownOutlined
} from '@ant-design/icons';
import { useCurrency } from '@/shared/contexts/CurrencyContext';

const { Title } = Typography;

const CurrencyManagement = () => {
  const { t } = useTranslation(['admin']);
  const [currencies, setCurrencies] = useState([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingCurrency, setEditingCurrency] = useState(null);
  const [form] = Form.useForm();

  const { loadCurrencies } = useCurrency();

  // Load all currencies (including inactive)
  const loadAllCurrencies = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/currencies', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        setCurrencies(data);
      }
    } catch (error) {
      message.error(t('admin:currency.toast.loadError'));
    } finally {
      setLoading(false);
    }
  };

  // Load registration currency settings
  const loadRegistrationSettings = async () => {
    try {
      const response = await fetch('/api/settings', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        setAllowedRegistrationCurrencies(data.allowed_registration_currencies || ['EUR', 'USD', 'TRY']);
      }
    } catch (error) {
      message.error(t('admin:currency.toast.registrationLoadError'));
    }
  };

  // Update registration currencies
  const updateRegistrationCurrencies = async (currencies) => {
    try {
      const response = await fetch('/api/settings/allowed_registration_currencies', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ value: currencies })
      });
      
      if (response.ok) {
        message.success(t('admin:currency.toast.registrationCurrenciesUpdated'));
        setAllowedRegistrationCurrencies(currencies);
      } else {
        message.error(t('admin:currency.toast.registrationUpdateError'));
      }
    } catch (error) {
      message.error(t('admin:currency.toast.registrationUpdateError'));
    }
  };

  // Add or update currency
  const handleSubmit = async (values) => {
    try {
      const url = editingCurrency 
        ? `/api/currencies/${editingCurrency.currency_code}`
        : '/api/currencies';
      
      const method = editingCurrency ? 'PUT' : 'POST';
      
      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify(values)
      });
      
      if (response.ok) {
        message.success(editingCurrency ? t('admin:currency.toast.updated') : t('admin:currency.toast.added'));
        setModalVisible(false);
        setEditingCurrency(null);
        form.resetFields();
        loadAllCurrencies();
        loadCurrencies(); // Refresh global currency context
      } else {
        const error = await response.json();
        message.error(error.error || t('admin:currency.toast.saveError'));
      }
    } catch (error) {
      message.error(t('admin:currency.toast.saveError'));
    }
  };

  // Toggle currency status
  const toggleCurrencyStatus = async (currencyCode, isActive) => {
    try {
      const response = await fetch(`/api/currencies/${currencyCode}/toggle`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ isActive })
      });
      
      if (response.ok) {
        message.success(isActive ? t('admin:currency.toast.activated') : t('admin:currency.toast.deactivated'));
        loadAllCurrencies();
        loadCurrencies();
      }
    } catch (error) {
      message.error(t('admin:currency.toast.toggleError'));
    }
  };

  // Set base currency
  const setBaseCurrency = async (currencyCode) => {
    try {
      const response = await fetch(`/api/currencies/base/${currencyCode}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      
      if (response.ok) {
        message.success(t('admin:currency.toast.baseCurrencyUpdated'));
        loadAllCurrencies();
        loadCurrencies();
      }
    } catch (error) {
      message.error(t('admin:currency.toast.baseError'));
    }
  };

  // Update exchange rate
  const updateExchangeRate = async (currencyCode, newRate) => {
    try {
      const response = await fetch(`/api/currencies/${currencyCode}/rate`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ exchangeRate: newRate })
      });
      
      if (response.ok) {
        message.success(t('admin:currency.toast.exchangeRateUpdated'));
        loadAllCurrencies();
        loadCurrencies();
      }
    } catch (error) {
      message.error(t('admin:currency.toast.rateError'));
    }
  };

  const columns = [
    {
      title: t('admin:currency.table.currency'),
      dataIndex: 'currency_code',
      key: 'currency_code',
      render: (code, record) => (
        <Space>
          <span style={{ fontWeight: 'bold' }}>{code}</span>
          <span>{record.symbol}</span>
          {record.base_currency && <CrownOutlined style={{ color: '#faad14' }} />}
        </Space>
      )
    },
    {
      title: t('admin:currency.table.name'),
      dataIndex: 'currency_name',
      key: 'currency_name'
    },
    {
      title: t('admin:currency.table.exchangeRate'),
      dataIndex: 'exchange_rate',
      key: 'exchange_rate',
      render: (rate, record) => (
        record.base_currency ? (
          <Tag color="gold">{t('admin:currency.table.baseCurrency')}</Tag>
        ) : (
          <InputNumber
            value={rate}
            precision={4}
            min={0.0001}
            step={0.0001}
            onBlur={(e) => {
              const newRate = parseFloat(e.target.value);
              if (newRate && newRate !== rate) {
                updateExchangeRate(record.currency_code, newRate);
              }
            }}
            style={{ width: 100 }}
          />
        )
      )
    },
    {
      title: t('admin:currency.table.status'),
      dataIndex: 'is_active',
      key: 'is_active',
      render: (isActive, record) => (
        <Switch
          checked={isActive}
          onChange={(checked) => toggleCurrencyStatus(record.currency_code, checked)}
          disabled={record.base_currency}
        />
      )
    },
    {
      title: t('admin:currency.table.actions'),
      key: 'actions',
      render: (_, record) => (
        <Space>
          <Button
            type="text"
            icon={<EditOutlined />}
            onClick={() => {
              setEditingCurrency(record);
              form.setFieldsValue(record);
              setModalVisible(true);
            }}
          />
          {!record.base_currency && (
            <Popconfirm
              title={t('admin:currency.popconfirm.setBase')}
              description={t('admin:currency.popconfirm.setBaseDescription')}
              onConfirm={() => setBaseCurrency(record.currency_code)}
            >
              <Button type="text" icon={<CrownOutlined />} />
            </Popconfirm>
          )}
        </Space>
      )
    }
  ];

  useEffect(() => {
    loadAllCurrencies();
  }, []);

  return (
    <div>
      <Card>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
          <Title level={3}>{t('admin:currency.title')}</Title>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => {
              setEditingCurrency(null);
              form.resetFields();
              setModalVisible(true);
            }}
          >
            {t('admin:currency.addCurrency')}
          </Button>
        </div>

        <div style={{ marginBottom: 16, padding: 12, background: '#f0f9ff', borderRadius: 8, border: '1px solid #bae6fd' }}>
          <Text type="secondary">
            {t('admin:currency.note')}
          </Text>
        </div>

        <Table
          columns={columns}
          dataSource={currencies}
          loading={loading}
          rowKey="currency_code"
          pagination={false}
        />
      </Card>

      <Modal
        title={editingCurrency ? t('admin:currency.modal.editTitle') : t('admin:currency.modal.addTitle')}
        open={modalVisible}
        onCancel={() => {
          setModalVisible(false);
          setEditingCurrency(null);
          form.resetFields();
        }}
        footer={null}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleSubmit}
        >
          <Form.Item
            name="currency_code"
            label={t('admin:currency.modal.currencyCode')}
            rules={[{ required: true, message: t('admin:currency.modal.currencyCodeRequired') }]}
          >
            <Input
              placeholder={t('admin:currency.modal.currencyCodePlaceholder')}
              maxLength={3}
              disabled={!!editingCurrency}
              style={{ textTransform: 'uppercase' }}
            />
          </Form.Item>

          <Form.Item
            name="currency_name"
            label={t('admin:currency.modal.currencyName')}
            rules={[{ required: true, message: t('admin:currency.modal.currencyNameRequired') }]}
          >
            <Input placeholder={t('admin:currency.modal.currencyNamePlaceholder')} />
          </Form.Item>

          <Form.Item
            name="symbol"
            label={t('admin:currency.modal.symbol')}
            rules={[{ required: true, message: t('admin:currency.modal.symbolRequired') }]}
          >
            <Input placeholder={t('admin:currency.modal.symbolPlaceholder')} maxLength={5} />
          </Form.Item>

          {!editingCurrency && (
            <Form.Item
              name="exchange_rate"
              label={t('admin:currency.modal.exchangeRate')}
              rules={[{ required: true, message: t('admin:currency.modal.exchangeRateRequired') }]}
            >
              <InputNumber
                placeholder="1.0000"
                precision={4}
                min={0.0001}
                step={0.0001}
                style={{ width: '100%' }}
              />
            </Form.Item>
          )}

          <Form.Item
            name="is_active"
            label={t('admin:currency.modal.active')}
            valuePropName="checked"
            initialValue={true}
          >
            <Switch />
          </Form.Item>

          <Form.Item>
            <Space>
              <Button
                type="primary"
                htmlType="submit"
              >
                {editingCurrency ? t('admin:currency.modal.updateButton') : t('admin:currency.modal.addButton')}
              </Button>
              <Button
                onClick={() => {
                  setModalVisible(false);
                  setEditingCurrency(null);
                  form.resetFields();
                }}
              >
                {t('admin:currency.modal.cancel')}
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default CurrencyManagement;
