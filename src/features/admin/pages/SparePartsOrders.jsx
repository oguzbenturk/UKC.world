import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Modal, Form, Input, Select, Result, Card, Tag, Space } from 'antd';
import { message } from '@/shared/utils/antdStatic';
import UnifiedTable from '@/shared/components/tables/UnifiedTable';
import { UnifiedResponsiveTable } from '@/components/ui/ResponsiveTableV2';
import { listSpareParts, createSparePart, updateSparePart, deleteSparePart } from '../api/sparePartsApi';
import { useAuth } from '@/shared/hooks/useAuth';

const SparePartMobileCard = ({ record, onAction, t }) => (
  <Card size="small" className="mb-2">
    <div className="flex justify-between items-start mb-2">
       <div>
          <div className="font-medium">{record.partName}</div>
          <div className="text-xs text-gray-500">{t('admin:spareParts.mobileCard.supplierLabel', { supplier: record.supplier || '—' })}</div>
       </div>
       <Tag className="capitalize">{record.status}</Tag>
    </div>
    <div className="flex justify-between items-center">
       <div className="text-sm">{t('admin:spareParts.mobileCard.qty', { qty: record.quantity })}</div>
       <Space size="small">
          {record.status !== 'ordered' && <Button size="small" onClick={() => onAction('ordered', record)}>{t('admin:spareParts.mobileCard.ordered')}</Button>}
          {record.status !== 'received' && <Button size="small" onClick={() => onAction('received', record)}>{t('admin:spareParts.mobileCard.recv')}</Button>}
          <Button size="small" danger onClick={() => onAction('delete', record)}>{t('admin:spareParts.mobileCard.del')}</Button>
       </Space>
    </div>
  </Card>
);

export default function SparePartsOrders() {
  const { t } = useTranslation(['admin']);
  const { user } = useAuth();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const [form] = Form.useForm();

  const isAuthorized = user && ['admin', 'manager'].includes(user.role);

  const load = useCallback(async () => {
    // Skip loading if not authorized
    if (!isAuthorized) return; 
    
    try {
      setLoading(true);
      const data = await listSpareParts({ status: status || undefined, q: q || undefined });
      setOrders(data);
    } catch {
      message.error(t('admin:spareParts.toast.loadError'));
    } finally {
      setLoading(false);
    }
  }, [status, q, isAuthorized]);

  useEffect(() => { load(); }, [load]);

  if (!isAuthorized) {
    return (
      <Result
        status="403"
        title="403"
        subTitle={t('admin:spareParts.unauthorized')}
      />
    );
  }

  const onCreate = async (values) => {
    try {
      const created = await createSparePart(values);
      setOrders((prev) => [created, ...prev]);
      message.success('Order created');
      setOpen(false);
      form.resetFields();
    } catch {
      message.error(t('admin:spareParts.toast.createError'));
    }
  };

  const updateStatus = async (o, status) => {
    try {
      const ts = new Date().toISOString();
      const patch = { status };
      if (status === 'ordered') patch.orderedAt = ts;
      if (status === 'received') patch.receivedAt = ts;
      const updated = await updateSparePart(o.id, patch);
      setOrders((prev) => prev.map((it) => (it.id === o.id ? updated : it)));
      message.success(t('admin:spareParts.toast.statusUpdated', { status }));
    } catch {
      message.error(t('admin:spareParts.toast.statusError'));
    }
  };

  const onDelete = async (o) => {
    try {
      await deleteSparePart(o.id);
      setOrders((prev) => prev.filter((it) => it.id !== o.id));
      message.success(t('admin:spareParts.toast.deleted'));
    } catch {
      message.error(t('admin:spareParts.toast.deleteError'));
    }
  };

  const exportCsv = () => {
    const rows = [
      ['ID', 'Part', 'Quantity', 'Supplier', 'Status', 'OrderedAt', 'ReceivedAt', 'CreatedAt'],
      ...orders.map(o => [
        o.id,
        o.partName,
        o.quantity,
        o.supplier || '',
        o.status,
        o.orderedAt || '',
        o.receivedAt || '',
        o.createdAt || '',
      ])
    ];
    const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'spare-parts-orders.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="p-4">
      <div className="flex flex-col gap-3 mb-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-800">{t('admin:spareParts.title')}</h1>
          <div className="flex gap-2">
            <Button onClick={load} loading={loading}>{t('admin:spareParts.actions.refresh')}</Button>
            <Button onClick={exportCsv} disabled={loading}>{t('admin:spareParts.actions.exportCsv')}</Button>
            <Button type="primary" onClick={() => setOpen(true)} disabled={loading}>{t('admin:spareParts.actions.newOrder')}</Button>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <Select
            placeholder={t('admin:spareParts.filters.statusPlaceholder')}
            value={status}
            onChange={(v) => setStatus(v)}
            allowClear
            style={{ width: 160 }}
            options={[
              { value: 'pending', label: t('admin:spareParts.filters.status.pending') },
              { value: 'ordered', label: t('admin:spareParts.filters.status.ordered') },
              { value: 'received', label: t('admin:spareParts.filters.status.received') },
              { value: 'cancelled', label: t('admin:spareParts.filters.status.cancelled') },
            ]}
          />
          <Input
            placeholder={t('admin:spareParts.filters.searchPlaceholder')}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onPressEnter={load}
            style={{ width: 260 }}
            allowClear
          />
          <Button onClick={load} disabled={loading}>{t('admin:spareParts.actions.apply')}</Button>
        </div>
      </div>
      <UnifiedResponsiveTable 
        title="Orders" 
        density="comfortable"
        loading={loading}
        dataSource={orders}
        rowKey="id"
        columns={[
          { title: t('admin:spareParts.table.part'), dataIndex: 'partName', key: 'partName' },
          { title: t('admin:spareParts.table.quantity'), dataIndex: 'quantity', key: 'quantity' },
          { title: t('admin:spareParts.table.supplier'), dataIndex: 'supplier', key: 'supplier', render: (val) => val || '—' },
          { title: t('admin:spareParts.table.status'), dataIndex: 'status', key: 'status', render: (val) => <Tag className="capitalize">{val}</Tag> },
          {
             title: t('admin:spareParts.table.actions'),
             key: 'actions',
             render: (_, o) => (
                <div className="flex gap-2">
                  {o.status !== 'ordered' && (
                    <Button size="small" onClick={() => updateStatus(o, 'ordered')} disabled={loading}>{t('admin:spareParts.table.markOrdered')}</Button>
                  )}
                  {o.status !== 'received' && (
                    <Button size="small" onClick={() => updateStatus(o, 'received')} disabled={loading}>{t('admin:spareParts.table.markReceived')}</Button>
                  )}
                  <Button size="small" danger onClick={() => onDelete(o)} disabled={loading}>{t('admin:spareParts.table.delete')}</Button>
                </div>
             )
          }
        ]}
        mobileCardRenderer={(props) => (
           <SparePartMobileCard
              {...props}
              t={t}
              onAction={(action, record) => {
                 if (action === 'delete') onDelete(record);
                 else updateStatus(record, action);
              }} 
           />
        )}
      />

      <Modal title={t('admin:spareParts.modal.title')} open={open} onCancel={() => setOpen(false)} onOk={() => form.submit()} okText={t('admin:spareParts.modal.create')}>
  <Form form={form} layout="vertical" onFinish={onCreate}>
          <Form.Item name="partName" label={t('admin:spareParts.modal.partLabel')} rules={[{ required: true, message: t('admin:spareParts.modal.partRequired') }]}>
            <Input placeholder="e.g., Brake pads" />
          </Form.Item>
          <Form.Item name="quantity" label={t('admin:spareParts.modal.quantityLabel')} rules={[{ required: true, message: t('admin:spareParts.modal.quantityRequired') }]}>
            <Input type="number" min={1} placeholder="e.g., 2" />
          </Form.Item>
          <Form.Item name="supplier" label={t('admin:spareParts.modal.supplierLabel')}>
            <Input placeholder="e.g., ACME Supplies" />
          </Form.Item>
          <Form.Item name="status" label={t('admin:spareParts.modal.statusLabel')} initialValue="pending">
            <Select options={[
              { value: 'pending', label: t('admin:spareParts.filters.status.pending') },
              { value: 'ordered', label: t('admin:spareParts.filters.status.ordered') },
              { value: 'received', label: t('admin:spareParts.filters.status.received') },
            ]} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
