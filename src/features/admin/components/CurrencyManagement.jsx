// src/features/admin/components/CurrencyManagement.jsx
import React, { useState, useEffect } from 'react';
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
      message.error('Failed to load currencies');
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
      message.error('Failed to load registration settings');
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
        message.success('Registration currencies updated');
        setAllowedRegistrationCurrencies(currencies);
      } else {
        message.error('Failed to update registration currencies');
      }
    } catch (error) {
      message.error('Failed to update registration currencies');
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
        message.success(`Currency ${editingCurrency ? 'updated' : 'added'} successfully`);
        setModalVisible(false);
        setEditingCurrency(null);
        form.resetFields();
        loadAllCurrencies();
        loadCurrencies(); // Refresh global currency context
      } else {
        const error = await response.json();
        message.error(error.error || 'Failed to save currency');
      }
    } catch (error) {
      message.error('Failed to save currency');
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
        message.success(`Currency ${isActive ? 'activated' : 'deactivated'}`);
        loadAllCurrencies();
        loadCurrencies();
      }
    } catch (error) {
      message.error('Failed to update currency status');
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
        message.success('Base currency updated');
        loadAllCurrencies();
        loadCurrencies();
      }
    } catch (error) {
      message.error('Failed to set base currency');
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
        message.success('Exchange rate updated');
        loadAllCurrencies();
        loadCurrencies();
      }
    } catch (error) {
      message.error('Failed to update exchange rate');
    }
  };

  const columns = [
    {
      title: 'Currency',
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
      title: 'Name',
      dataIndex: 'currency_name',
      key: 'currency_name'
    },
    {
      title: 'Exchange Rate',
      dataIndex: 'exchange_rate',
      key: 'exchange_rate',
      render: (rate, record) => (
        record.base_currency ? (
          <Tag color="gold">Base (1.0000)</Tag>
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
      title: 'Status',
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
      title: 'Actions',
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
              title="Set as base currency?"
              description="This will make all other currencies relative to this one"
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
          <Title level={3}>Currency Management</Title>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => {
              setEditingCurrency(null);
              form.resetFields();
              setModalVisible(true);
            }}
          >
            Add Currency
          </Button>
        </div>

        <div style={{ marginBottom: 16, padding: 12, background: '#f0f9ff', borderRadius: 8, border: '1px solid #bae6fd' }}>
          <Text type="secondary">
            <strong>Note:</strong> To control which currencies users can select during registration, go to <strong>Settings {'>'} Currency Settings</strong>.
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
        title={editingCurrency ? 'Edit Currency' : 'Add Currency'}
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
            label="Currency Code"
            rules={[{ required: true, message: 'Please enter currency code' }]}
          >
            <Input
              placeholder="USD"
              maxLength={3}
              disabled={!!editingCurrency}
              style={{ textTransform: 'uppercase' }}
            />
          </Form.Item>

          <Form.Item
            name="currency_name"
            label="Currency Name"
            rules={[{ required: true, message: 'Please enter currency name' }]}
          >
            <Input placeholder="US Dollar" />
          </Form.Item>

          <Form.Item
            name="symbol"
            label="Symbol"
            rules={[{ required: true, message: 'Please enter currency symbol' }]}
          >
            <Input placeholder="$" maxLength={5} />
          </Form.Item>

          {!editingCurrency && (
            <Form.Item
              name="exchange_rate"
              label="Exchange Rate"
              rules={[{ required: true, message: 'Please enter exchange rate' }]}
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
            label="Active"
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
                {editingCurrency ? 'Update' : 'Add'} Currency
              </Button>
              <Button
                onClick={() => {
                  setModalVisible(false);
                  setEditingCurrency(null);
                  form.resetFields();
                }}
              >
                Cancel
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default CurrencyManagement;
