// src/features/products/components/VariantTable.jsx
// Component for managing product variants (sizes with different prices)

import { useState, useEffect } from 'react';
import { Table, Button, InputNumber, Input, Popconfirm, message, Space } from 'antd';
import { PlusOutlined, DeleteOutlined } from '@ant-design/icons';
import { useCurrency } from '@/shared/contexts/CurrencyContext';

const VariantTable = ({ value = [], onChange, currency = 'EUR' }) => {
  const [variants, setVariants] = useState(value);
  const { getCurrencySymbol } = useCurrency();

  useEffect(() => {
    setVariants(value);
  }, [value]);

  const handleAdd = () => {
    const newVariant = {
      key: Date.now(),
      label: '',
      price: null,
      price_final: null,
      cost_price: null
    };
    const updated = [...variants, newVariant];
    setVariants(updated);
    onChange?.(updated);
  };

  const handleDelete = (key) => {
    const updated = variants.filter(v => v.key !== key);
    setVariants(updated);
    onChange?.(updated);
    message.success('Variant removed');
  };

  const handleChange = (key, field, val) => {
    const updated = variants.map(v => 
      v.key === key ? { ...v, [field]: val } : v
    );
    setVariants(updated);
    onChange?.(updated);
  };

  const columns = [
    {
      title: 'Variant/Size',
      dataIndex: 'label',
      key: 'label',
      width: '25%',
      render: (text, record) => (
        <Input
          value={text}
          onChange={(e) => handleChange(record.key, 'label', e.target.value)}
          placeholder="e.g., Size 14.0 or 46/XS"
        />
      )
    },
    {
      title: 'Base Price',
      dataIndex: 'price',
      key: 'price',
      width: '20%',
      render: (text, record) => (
        <InputNumber
          value={text}
          onChange={(val) => handleChange(record.key, 'price', val)}
          min={0}
          step={0.01}
          precision={2}
          prefix={getCurrencySymbol(currency)}
          style={{ width: '100%' }}
          placeholder="0.00"
        />
      )
    },
    {
      title: 'Final Price',
      dataIndex: 'price_final',
      key: 'price_final',
      width: '20%',
      render: (text, record) => (
        <InputNumber
          value={text}
          onChange={(val) => handleChange(record.key, 'price_final', val)}
          min={0}
          step={0.01}
          precision={2}
          prefix={getCurrencySymbol(currency)}
          style={{ width: '100%' }}
          placeholder="0.00"
        />
      )
    },
    {
      title: 'Cost Price',
      dataIndex: 'cost_price',
      key: 'cost_price',
      width: '20%',
      render: (text, record) => (
        <InputNumber
          value={text}
          onChange={(val) => handleChange(record.key, 'cost_price', val)}
          min={0}
          step={0.01}
          precision={2}
          prefix={getCurrencySymbol(currency)}
          style={{ width: '100%' }}
          placeholder="0.00"
        />
      )
    },
    {
      title: 'Action',
      key: 'action',
      width: '15%',
      render: (_, record) => (
        <Popconfirm
          title="Delete this variant?"
          onConfirm={() => handleDelete(record.key)}
          okText="Yes"
          cancelText="No"
        >
          <Button danger icon={<DeleteOutlined />} size="small">
            Delete
          </Button>
        </Popconfirm>
      )
    }
  ];

  // Add unique key if missing
  const dataSource = variants.map((v, idx) => ({ 
    ...v, 
    key: v.key || `variant-${idx}` 
  }));

  return (
    <div>
      <Table
        dataSource={dataSource}
        columns={columns}
        pagination={false}
        size="small"
        locale={{ emptyText: 'No variants added. Click "Add Variant" to create one.' }}
      />
      <Button
        type="dashed"
        onClick={handleAdd}
        icon={<PlusOutlined />}
        style={{ width: '100%', marginTop: 16 }}
      >
        Add Variant
      </Button>
    </div>
  );
};

export default VariantTable;
