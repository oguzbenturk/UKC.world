import { useCallback, useEffect, useState } from 'react';
import { Button, Modal, Form, Input, Select, Result, Card, Tag, Space } from 'antd';
import { message } from '@/shared/utils/antdStatic';
import UnifiedTable from '@/shared/components/tables/UnifiedTable';
import { UnifiedResponsiveTable } from '@/components/ui/ResponsiveTableV2';
import { listSpareParts, createSparePart, updateSparePart, deleteSparePart } from '../api/sparePartsApi';
import { useAuth } from '@/shared/hooks/useAuth';

const SparePartMobileCard = ({ record, onAction }) => (
  <Card size="small" className="mb-2">
    <div className="flex justify-between items-start mb-2">
       <div>
          <div className="font-medium">{record.partName}</div>
          <div className="text-xs text-gray-500">Supplier: {record.supplier || '—'}</div>
       </div>
       <Tag className="capitalize">{record.status}</Tag>
    </div>
    <div className="flex justify-between items-center">
       <div className="text-sm">Qty: {record.quantity}</div>
       <Space size="small">
          {record.status !== 'ordered' && <Button size="small" onClick={() => onAction('ordered', record)}>Ordered</Button>}
          {record.status !== 'received' && <Button size="small" onClick={() => onAction('received', record)}>Recv</Button>}
          <Button size="small" danger onClick={() => onAction('delete', record)}>Del</Button>
       </Space>
    </div>
  </Card>
);

export default function SparePartsOrders() {
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
      message.error('Failed to load orders');
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
        subTitle="Sorry, you are not authorized to access this page."
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
      message.error('Failed to create order');
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
      message.success(`Status updated to ${status}`);
    } catch {
      message.error('Failed to update status');
    }
  };

  const onDelete = async (o) => {
    try {
      await deleteSparePart(o.id);
      setOrders((prev) => prev.filter((it) => it.id !== o.id));
  message.success('Order deleted');
    } catch {
      message.error('Failed to delete order');
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
          <h1 className="text-2xl font-bold text-gray-800">Spare Parts Orders</h1>
          <div className="flex gap-2">
            <Button onClick={load} loading={loading}>Refresh</Button>
            <Button onClick={exportCsv} disabled={loading}>Export CSV</Button>
            <Button type="primary" onClick={() => setOpen(true)} disabled={loading}>New Order</Button>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <Select
            placeholder="Status"
            value={status}
            onChange={(v) => setStatus(v)}
            allowClear
            style={{ width: 160 }}
            options={[
              { value: 'pending', label: 'Pending' },
              { value: 'ordered', label: 'Ordered' },
              { value: 'received', label: 'Received' },
              { value: 'cancelled', label: 'Cancelled' },
            ]}
          />
          <Input
            placeholder="Search part or supplier..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onPressEnter={load}
            style={{ width: 260 }}
            allowClear
          />
          <Button onClick={load} disabled={loading}>Apply</Button>
        </div>
      </div>
      <UnifiedResponsiveTable 
        title="Orders" 
        density="comfortable"
        loading={loading}
        dataSource={orders}
        rowKey="id"
        columns={[
          { title: 'Part', dataIndex: 'partName', key: 'partName' },
          { title: 'Quantity', dataIndex: 'quantity', key: 'quantity' },
          { title: 'Supplier', dataIndex: 'supplier', key: 'supplier', render: (val) => val || '—' },
          { title: 'Status', dataIndex: 'status', key: 'status', render: (val) => <Tag className="capitalize">{val}</Tag> },
          { 
             title: 'Actions', 
             key: 'actions', 
             render: (_, o) => (
                <div className="flex gap-2">
                  {o.status !== 'ordered' && (
                    <Button size="small" onClick={() => updateStatus(o, 'ordered')} disabled={loading}>Mark Ordered</Button>
                  )}
                  {o.status !== 'received' && (
                    <Button size="small" onClick={() => updateStatus(o, 'received')} disabled={loading}>Mark Received</Button>
                  )}
                  <Button size="small" danger onClick={() => onDelete(o)} disabled={loading}>Delete</Button>
                </div>
             )
          }
        ]}
        mobileCardRenderer={(props) => (
           <SparePartMobileCard 
              {...props} 
              onAction={(action, record) => {
                 if (action === 'delete') onDelete(record);
                 else updateStatus(record, action);
              }} 
           />
        )}
      />

      <Modal title="New Spare Part Order" open={open} onCancel={() => setOpen(false)} onOk={() => form.submit()} okText="Create">
  <Form form={form} layout="vertical" onFinish={onCreate}>
          <Form.Item name="partName" label="Part" rules={[{ required: true, message: 'Part name is required' }]}>
            <Input placeholder="e.g., Brake pads" />
          </Form.Item>
          <Form.Item name="quantity" label="Quantity" rules={[{ required: true, message: 'Quantity is required' }]}>
            <Input type="number" min={1} placeholder="e.g., 2" />
          </Form.Item>
          <Form.Item name="supplier" label="Supplier">
            <Input placeholder="e.g., ACME Supplies" />
          </Form.Item>
          <Form.Item name="status" label="Status" initialValue="pending">
            <Select options={[
              { value: 'pending', label: 'Pending' },
              { value: 'ordered', label: 'Ordered' },
              { value: 'received', label: 'Received' },
            ]} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
