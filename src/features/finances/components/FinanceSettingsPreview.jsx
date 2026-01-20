// src/features/finances/components/FinanceSettingsPreview.jsx
import { useState } from 'react';
import { Card, Form, Select, InputNumber, Space, Button, Table, Alert } from 'antd';
import FinancialAnalyticsService from '../services/financialAnalytics';
import UnifiedTable from '@/shared/components/tables/UnifiedTable';

const methodColumns = [
  { title: 'Yöntem', dataIndex: 'method', key: 'method' },
  { title: '%', dataIndex: 'pct', key: 'pct', render: (v) => (v != null ? `${v}%` : '-') },
  { title: 'Sabit', dataIndex: 'fixed', key: 'fixed' },
  { title: 'Para Birimi', dataIndex: 'currency', key: 'currency' },
  { title: 'Aktif', dataIndex: 'active', key: 'active', render: (v) => (v ? '✓' : '-') }
];

function FinanceSettingsPreview() {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  const onPreview = async () => {
    try {
      setLoading(true);
      const values = await form.validateFields();
      const { serviceType, serviceId, categoryId, paymentMethod } = values;
      const data = await FinancialAnalyticsService.previewFinanceSettings({ serviceType, serviceId, categoryId, paymentMethod });
      setResult(data);
  } catch {
      // no-op, AntD will show inline validation errors
    } finally {
      setLoading(false);
    }
  };

  const fees = result?.resolved?.payment_method_fees || {};
  const rows = Object.keys(fees).map((k) => ({ key: k, method: k, ...fees[k] }));

  return (
    <Card title="Finance Settings Preview" extra={<Button onClick={onPreview} loading={loading}>Preview</Button>}>
      <Form form={form} layout="inline" initialValues={{ serviceType: 'lesson' }}>
        <Form.Item name="serviceType" label="Service Type">
          <Select style={{ width: 180 }} options={[
            { value: 'lesson', label: 'Lesson' },
            { value: 'rental', label: 'Rental' },
            { value: 'accommodation', label: 'Accommodation' }
          ]} />
        </Form.Item>
        <Form.Item name="serviceId" label="Service ID">
          <InputNumber style={{ width: 140 }} min={1} />
        </Form.Item>
        <Form.Item name="categoryId" label="Category ID">
          <InputNumber style={{ width: 140 }} min={1} />
        </Form.Item>
        <Form.Item name="paymentMethod" label="Payment Method">
          <Select allowClear style={{ width: 180 }} options={[
            { value: 'card', label: 'Card' },
            { value: 'pos', label: 'POS' },
            { value: 'mobile_wallet', label: 'Mobile Wallet' },
            { value: 'cash', label: 'Cash' },
            { value: 'bank_transfer', label: 'Bank Transfer' },
            { value: 'wire', label: 'Wire' }
          ]} />
        </Form.Item>
      </Form>

      {result?.success === false && (
        <Alert type="error" showIcon message="Preview failed" description={result?.error || 'Unknown error'} style={{ marginTop: 16 }} />
      )}

      {result?.success && (
        <div style={{ marginTop: 16 }}>
          <Space direction="vertical" size="middle" style={{ width: '100%' }}>
            <Alert type="success" showIcon message="Resolved settings loaded" description={
              <div>
                <div>Tax %: <strong>{result.resolved.tax_rate_pct ?? 0}</strong></div>
                <div>Insurance %: <strong>{result.resolved.insurance_rate_pct ?? 0}</strong></div>
                <div>Equipment %: <strong>{result.resolved.equipment_rate_pct ?? 0}</strong></div>
              </div>
            } />
            <UnifiedTable title="Payment Method Settings" density="compact">
              <Table size="small" columns={methodColumns} dataSource={rows} pagination={false} />
            </UnifiedTable>
          </Space>
        </div>
      )}
    </Card>
  );
}

export default FinanceSettingsPreview;
