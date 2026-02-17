// src/features/finances/components/FinanceSettingsView.jsx
import { useEffect, useMemo, useState } from 'react';
import { Alert, Card, Col, Row, Form, InputNumber, Button, Switch, Space, Select, Typography, Tag, Tabs, Skeleton } from 'antd';
import { message } from '@/shared/utils/antdStatic';
import { SettingOutlined, DollarOutlined, PercentageOutlined, CreditCardOutlined, SaveOutlined, ReloadOutlined, PlusOutlined } from '@ant-design/icons';
import apiClient from '@/shared/services/apiClient';
import { useCurrency } from '@/shared/contexts/CurrencyContext';

const { Text } = Typography;

function FinanceSettingsView() {
  const [form] = Form.useForm();
  const [overrideForm] = Form.useForm();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [settings, setSettings] = useState(null);
  const [activeTab, setActiveTab] = useState('cash');

  const { businessCurrency, getSupportedCurrencies, getCurrencySymbol } = useCurrency();
  const currencyOptions = useMemo(() => (getSupportedCurrencies?.() || ['EUR', 'USD', 'GBP']).map((code) => ({ value: code, label: `${getCurrencySymbol?.(code) || ''} ${code}` })), [getSupportedCurrencies, getCurrencySymbol]);

  const toList = (feesObj) => {
    if (!feesObj || typeof feesObj !== 'object') return [];
    return Object.entries(feesObj).map(([method, v]) => ({ method, ...(v || {}) }));
  };

  const toObject = (feesList) => {
    const out = {};
    (feesList || []).forEach((item) => {
      if (item?.method) {
        const { method, ...rest } = item;
        out[String(method)] = rest;
      }
    });
    return out;
  };

  const loadFinanceSettings = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await apiClient.get('/finance-settings/active');
      const s = data?.settings || null;
      setSettings(s);
      if (s) {
        form.setFieldsValue({
          tax_rate_pct: s.tax_rate_pct ?? 0,
          insurance_rate_pct: s.insurance_rate_pct ?? 0,
          equipment_rate_pct: s.equipment_rate_pct ?? 0,
          payment_fees: toList(s.payment_method_fees)
        });
      } else {
        form.resetFields();
      }
    } catch (e) {
      setError(e?.message || 'Failed to load finance settings');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadFinanceSettings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const saveSettings = async () => {
    try {
      setSaving(true);
      const values = await form.validateFields();
      const payload = {
        tax_rate_pct: Number(values.tax_rate_pct ?? 0),
        insurance_rate_pct: Number(values.insurance_rate_pct ?? 0),
        equipment_rate_pct: Number(values.equipment_rate_pct ?? 0),
        payment_method_fees: toObject(values.payment_fees)
      };
      if (settings?.id) {
        await apiClient.patch(`/finance-settings/${settings.id}`, payload);
      } else {
        const { data } = await apiClient.post('/finance-settings', { ...payload, active: true });
        setSettings(data?.settings || null);
      }
      message.success('Finance settings saved');
      await loadFinanceSettings();
    } catch (e) {
      if (e?.errorFields) return; // antd validation
      message.error(e?.message || 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const items = [
    {
      key: 'cash',
      label: (
        <span className="flex items-center gap-2">
          <DollarOutlined />
          Cash Mode
          <Tag color="blue">Real-time</Tag>
        </span>
      ),
      children: (
        <div className="space-y-6">
          <Card
            title={
              <div className="flex items-center gap-2">
                <PercentageOutlined className="text-blue-500" />
                <span>Calculation Rates</span>
              </div>
            }
            className="shadow-sm"
          >
            <Text type="secondary" className="block mb-4">
              These rates are applied to real-time cash flow calculations based on actual transactions.
            </Text>
            <Row gutter={[16, 16]}>
              <Col xs={24} md={8}>
                <Form.Item name="tax_rate_pct" label={<span className="font-medium">Tax Rate (%)</span>} rules={[{ required: true, message: 'Tax rate is required' }]}>
                  <InputNumber min={0} max={100} step={0.01} addonAfter="%" style={{ width: '100%' }} placeholder="20.00" size="large" />
                </Form.Item>
              </Col>
              <Col xs={24} md={8}>
                <Form.Item name="insurance_rate_pct" label={<span className="font-medium">Insurance Rate (%)</span>} rules={[{ required: true, message: 'Insurance rate is required' }]}>
                  <InputNumber min={0} max={100} step={0.01} addonAfter="%" style={{ width: '100%' }} placeholder="0.50" size="large" />
                </Form.Item>
              </Col>
              <Col xs={24} md={8}>
                <Form.Item name="equipment_rate_pct" label={<span className="font-medium">Equipment Rate (%)</span>} rules={[{ required: true, message: 'Equipment rate is required' }]}>
                  <InputNumber min={0} max={100} step={0.01} addonAfter="%" style={{ width: '100%' }} placeholder="0.50" size="large" />
                </Form.Item>
              </Col>
            </Row>
          </Card>

          <Card
            title={
              <div className="flex items-center justify-between w-full">
                <div className="flex items-center gap-2">
                  <CreditCardOutlined className="text-blue-500" />
                  <span>Payment Method Fees</span>
                </div>
              </div>
            }
            className="shadow-sm"
          >
            <Text type="secondary" className="block mb-4">
              Configure processing fees for different payment methods.
            </Text>
            <Form.List name="payment_fees">
              {(fields, { add, remove }) => (
                <div className="space-y-4">
                  <div className="flex justify-end pb-2">
                    <Button type="dashed" icon={<PlusOutlined />} onClick={() => add({ method: 'card', pct: 0, fixed: 0, currency: businessCurrency || 'EUR', active: true })}>
                      Add Method
                    </Button>
                  </div>
                  {fields.map((field) => (
                    <Card key={field.key} className="bg-gray-50 border-dashed">
                      <Row gutter={[12, 12]} align="middle">
                        <Col xs={24} sm={6}>
                          <Form.Item name={[field.name, 'method']} label="Payment Method" rules={[{ required: true, message: 'Method required' }]} className="mb-0">
                            <Select placeholder="Select method" options={[{ value: 'card', label: 'Credit Card' }, { value: 'cash', label: 'Cash' }, { value: 'bank_transfer', label: 'Bank Transfer' }, { value: 'pos', label: 'POS Terminal' }, { value: 'mobile_wallet', label: 'Mobile Wallet' }, { value: 'wire', label: 'Wire Transfer' }]} />
                          </Form.Item>
                        </Col>
                        <Col xs={12} sm={3}>
                          <Form.Item name={[field.name, 'pct']} label="Percentage (%)" className="mb-0">
                            <InputNumber min={0} max={100} step={0.01} addonAfter="%" style={{ width: '100%' }} />
                          </Form.Item>
                        </Col>
                        <Col xs={12} sm={3}>
                          <Form.Item name={[field.name, 'fixed']} label="Fixed Fee" className="mb-0">
                            <InputNumber min={0} step={0.01} style={{ width: '100%' }} placeholder="0.30" />
                          </Form.Item>
                        </Col>
                        <Col xs={12} sm={4}>
                          <Form.Item name={[field.name, 'currency']} label="Currency" className="mb-0">
                            <Select showSearch optionFilterProp="label" placeholder={businessCurrency || 'EUR'} options={currencyOptions} />
                          </Form.Item>
                        </Col>
                        <Col xs={12} sm={3}>
                          <Form.Item name={[field.name, 'active']} label="Active" valuePropName="checked" className="mb-0">
                            <Switch />
                          </Form.Item>
                        </Col>
                        <Col xs={24} sm={6}>
                          <Button danger onClick={() => remove(field.name)} className="w-full sm:w-auto">
                            Remove
                          </Button>
                        </Col>
                      </Row>
                    </Card>
                  ))}
                </div>
              )}
            </Form.List>
          </Card>

          <div className="flex justify-end">
            <Button type="primary" size="large" icon={<SaveOutlined />} loading={saving} onClick={saveSettings} className="bg-blue-600 hover:bg-blue-700">
              Save Settings
            </Button>
          </div>
        </div>
      )
    },
    {
      key: 'overrides',
      label: (
        <span className="flex items-center gap-2">
          <SettingOutlined />
          Service Overrides
          <Tag color="orange">Advanced</Tag>
        </span>
      ),
      children: (
        <Card title="Per-Service Rate Overrides" className="shadow-sm">
          <Text type="secondary" className="block mb-6">
            Create custom rate overrides for specific services. These override the base settings for targeted services only.
          </Text>
          <Form form={overrideForm} layout="vertical">
            <Row gutter={[16, 16]}>
              <Col xs={24} md={8}>
                <Form.Item name="serviceId" label="Service ID" rules={[{ required: true, message: 'Service ID required' }]}>
                  <InputNumber min={1} style={{ width: '100%' }} />
                </Form.Item>
              </Col>
              <Col xs={24} md={8}>
                <Form.Item name={['fields', 'tax_rate_pct']} label="Tax Rate (%)">
                  <InputNumber min={0} max={100} step={0.01} addonAfter="%" style={{ width: '100%' }} />
                </Form.Item>
              </Col>
              <Col xs={24} md={8}>
                <Form.Item name={['fields', 'insurance_rate_pct']} label="Insurance Rate (%)">
                  <InputNumber min={0} max={100} step={0.01} addonAfter="%" style={{ width: '100%' }} />
                </Form.Item>
              </Col>
            </Row>
            <Row gutter={[16, 16]}>
              <Col xs={24} md={8}>
                <Form.Item name={['fields', 'equipment_rate_pct']} label="Equipment Rate (%)">
                  <InputNumber min={0} max={100} step={0.01} addonAfter="%" style={{ width: '100%' }} />
                </Form.Item>
              </Col>
            </Row>
            <div className="mt-6">
              <Space>
                <Button type="primary" icon={<SaveOutlined />} onClick={async () => {
                  try {
                    const values = await overrideForm.validateFields();
                    if (!settings?.id) throw new Error('No active settings');
                    await apiClient.post(`/finance-settings/${settings.id}/overrides`, {
                      scope_type: 'service_id',
                      scope_value: String(values.serviceId),
                      fields: values.fields || {},
                      precedence: 100,
                      active: true
                    });
                    message.success('Override saved');
                    overrideForm.resetFields();
                  } catch (e) {
                    message.error(e?.message || 'Failed to save override');
                  }
                }}>
                  Save Override
                </Button>
                <Button onClick={() => overrideForm.resetFields()}>Reset</Button>
              </Space>
            </div>
          </Form>
        </Card>
      )
    }
  ];

  return (
    <div className="finance-settings-container">
      {error && (
        <div className="mb-3">
          <Alert type="error" message="Failed to load settings" description={error} showIcon />
        </div>
      )}

      {loading ? (
        <Skeleton active />
      ) : (
        <Form form={form} layout="vertical" className="space-y-6">
          <Tabs activeKey={activeTab} onChange={setActiveTab} size="large" className="finance-settings-tabs" items={items} />
        </Form>
      )}

      {settings && (
        <Card size="small" className="bg-gray-50 mt-6">
          <div className="text-sm text-gray-600 flex flex-wrap items-center gap-4">
            <span>Settings ID: <strong>{settings.id}</strong></span>
            {settings.effective_from && (
              <span>Effective From: <strong>{new Date(settings.effective_from).toLocaleString()}</strong></span>
            )}
            {settings.active && <Tag color="green">Active</Tag>}
            <Button size="small" icon={<ReloadOutlined />} onClick={loadFinanceSettings} type="text">Refresh</Button>
          </div>
        </Card>
      )}
    </div>
  );
}

export default FinanceSettingsView;

