import { useCallback, useEffect, useState } from 'react';
import { Button, Modal, Form, Input, Select } from 'antd';
import { message } from '@/shared/utils/antdStatic';
import UnifiedTable from '@/shared/components/tables/UnifiedTable';
import { listSpareParts, createSparePart, updateSparePart, deleteSparePart } from '../api/sparePartsApi';

export default function SparePartsOrders() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const [form] = Form.useForm();

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const data = await listSpareParts({ status: status || undefined, q: q || undefined });
      setOrders(data);
    } catch {
      message.error('Failed to load orders');
    } finally {
      setLoading(false);
    }
  }, [status, q]);

  useEffect(() => { load(); }, [load]);

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
      <UnifiedTable title="Orders" density="comfortable">
        <div className="overflow-auto">
          <table className="min-w-full text-left border-separate border-spacing-0">
            <thead>
              <tr>
                <th className="border-b px-3 py-2">Part</th>
                <th className="border-b px-3 py-2">Quantity</th>
                <th className="border-b px-3 py-2">Supplier</th>
                <th className="border-b px-3 py-2">Status</th>
                <th className="border-b px-3 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td className="px-3 py-8 text-center text-gray-500" colSpan={5}>Loading...</td>
                </tr>
              )}
              {orders.map((o) => (
                <tr key={o.id} className="odd:bg-white even:bg-slate-50">
                  <td className="border-b px-3 py-2">{o.partName}</td>
                  <td className="border-b px-3 py-2">{o.quantity}</td>
                  <td className="border-b px-3 py-2">{o.supplier || '—'}</td>
                  <td className="border-b px-3 py-2 capitalize">{o.status}</td>
                  <td className="border-b px-3 py-2">
                    <div className="flex gap-2">
                      {o.status !== 'ordered' && (
                        <Button size="small" onClick={() => updateStatus(o, 'ordered')} disabled={loading}>Mark Ordered</Button>
                      )}
                      {o.status !== 'received' && (
                        <Button size="small" onClick={() => updateStatus(o, 'received')} disabled={loading}>Mark Received</Button>
                      )}
                      <Button size="small" danger onClick={() => onDelete(o)} disabled={loading}>Delete</Button>
                    </div>
                  </td>
                </tr>
              ))}
              {!loading && orders.length === 0 && (
                <tr>
                  <td className="px-3 py-8 text-center text-gray-500" colSpan={5}>No orders yet</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </UnifiedTable>

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
