// src/features/products/components/ColorTable.jsx
// Component for managing product color variants

import { useState, useEffect } from 'react';
import { Table, Button, Input, InputNumber, Popconfirm, message } from 'antd';
import { PlusOutlined, DeleteOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';

const ColorTable = ({ value = [], onChange }) => {
  const { t } = useTranslation(['manager']);
  const [colors, setColors] = useState(value);

  useEffect(() => {
    setColors(value);
  }, [value]);

  const handleAdd = () => {
    const newColor = {
      key: Date.now(),
      code: '',
      name: '',
      imageCount: 0
    };
    const updated = [...colors, newColor];
    setColors(updated);
    onChange?.(updated);
  };

  const handleDelete = (key) => {
    const updated = colors.filter(c => c.key !== key);
    setColors(updated);
    onChange?.(updated);
    message.success(t('manager:products.colorTable.colorRemoved'));
  };

  const handleChange = (key, field, val) => {
    const updated = colors.map(c => 
      c.key === key ? { ...c, [field]: val } : c
    );
    setColors(updated);
    onChange?.(updated);
  };

  const columns = [
    {
      title: t('manager:products.colorTable.colorCode'),
      dataIndex: 'code',
      key: 'code',
      width: '25%',
      render: (text, record) => (
        <Input
          value={text}
          onChange={(e) => handleChange(record.key, 'code', e.target.value)}
          placeholder="e.g., C01, C02"
          maxLength={10}
        />
      )
    },
    {
      title: t('manager:products.colorTable.colorName'),
      dataIndex: 'name',
      key: 'name',
      width: '45%',
      render: (text, record) => (
        <Input
          value={text}
          onChange={(e) => handleChange(record.key, 'name', e.target.value)}
          placeholder="e.g., 623 sage-grey, yellow"
        />
      )
    },
    {
      title: t('manager:products.colorTable.imageCount'),
      dataIndex: 'imageCount',
      key: 'imageCount',
      width: '20%',
      render: (text, record) => (
        <InputNumber
          value={text}
          onChange={(val) => handleChange(record.key, 'imageCount', val)}
          min={0}
          style={{ width: '100%' }}
          placeholder="0"
        />
      )
    },
    {
      title: t('manager:products.colorTable.action'),
      key: 'action',
      width: '10%',
      render: (_, record) => (
        <Popconfirm
          title={t('manager:products.colorTable.deleteConfirm')}
          onConfirm={() => handleDelete(record.key)}
          okText={t('manager:products.confirm.deleteOk')}
          cancelText={t('manager:products.confirm.deleteCancel')}
        >
          <Button danger icon={<DeleteOutlined />} size="small" />
        </Popconfirm>
      )
    }
  ];

  const dataSource = colors.map((c, idx) => ({ 
    ...c, 
    key: c.key || `color-${idx}` 
  }));

  return (
    <div>
      <Table
        dataSource={dataSource}
        columns={columns}
        pagination={false}
        size="small"
        locale={{ emptyText: t('manager:products.colorTable.noColors') }}
      />
      <Button
        type="dashed"
        onClick={handleAdd}
        icon={<PlusOutlined />}
        style={{ width: '100%', marginTop: 16 }}
      >
        {t('manager:products.colorTable.addColor')}
      </Button>
    </div>
  );
};

export default ColorTable;
