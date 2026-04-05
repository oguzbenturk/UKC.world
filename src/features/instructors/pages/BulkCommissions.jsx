import { useMemo, useState } from 'react';
import { Button, Checkbox, Form, InputNumber, Radio, Upload, Tooltip } from 'antd';
import { message } from '@/shared/utils/antdStatic';
import { UploadOutlined, FileTextOutlined } from '@ant-design/icons';
import UnifiedTable from '@/shared/components/tables/UnifiedTable';
import { useData } from '@/shared/hooks/useData';

export default function BulkCommissions() {
  const { instructors = [], apiClient } = useData();
  const [selected, setSelected] = useState([]);
  const [form] = Form.useForm();
  const allSelected = useMemo(() => selected.length && selected.length === instructors.length, [selected, instructors.length]);

  const toggleAll = (checked) => {
    setSelected(checked ? instructors.map((i) => i.id) : []);
  };

  const toggleOne = (id, checked) => {
    setSelected((prev) => (checked ? [...new Set([...prev, id])] : prev.filter((x) => x !== id)));
  };

  const applyBulk = async () => {
    try {
      const values = await form.validateFields();
      if (!selected.length) {
        message.warning('Select at least one instructor');
        return;
      }
      const payload = {
        type: values.type,
        value: Number(values.value),
      };
      let success = 0;
      for (const id of selected) {
        try {
          await apiClient.put(`/instructor-commissions/instructors/${id}/default-commission`, {
            type: payload.type,
            value: payload.value,
          });
          success += 1;
        } catch {
          // continue
        }
      }
      if (success) message.success(`Updated ${success} instructor(s)`);
      if (success < selected.length) message.warning(`${selected.length - success} failed`);
    } catch {
      // validation handled by antd
    }
  };

  const downloadTemplate = () => {
    const rows = [['instructor_id', 'type', 'value']];
    const csv = rows.map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'bulk-commissions-template.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleCsv = async (file) => {
    try {
      const text = await file.text();
      const [headerLine, ...lines] = text.split(/\r?\n/).filter(Boolean);
      const headers = headerLine.split(',').map(h => h.trim().toLowerCase());
      const idIdx = headers.indexOf('instructor_id');
      const typeIdx = headers.indexOf('type');
      const valueIdx = headers.indexOf('value');
      if (idIdx === -1 || typeIdx === -1 || valueIdx === -1) {
        message.error('CSV must contain instructor_id,type,value columns');
        return Upload.LIST_IGNORE;
      }
      let success = 0; let failed = 0;
      for (const line of lines) {
        const cells = line.split(',');
        if (!cells.length) continue;
        const id = cells[idIdx]?.trim();
        const type = cells[typeIdx]?.trim();
        const val = Number(cells[valueIdx]);
        if (!id || !type || Number.isNaN(val)) { failed++; continue; }
        try {
          await apiClient.put(`/instructor-commissions/instructors/${id}/default-commission`, { type, value: val });
          success++;
        } catch {
          failed++;
        }
      }
      if (success) message.success(`CSV applied to ${success} instructor(s)`);
      if (failed) message.warning(`${failed} row(s) failed`);
  } catch {
      message.error('Failed to read CSV');
    }
    return Upload.LIST_IGNORE;
  };

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-gray-800">Bulk Commission Assignment</h1>
        <div className="flex gap-2">
          <Button onClick={() => window.history.back()}>Back</Button>
          <Upload beforeUpload={handleCsv} showUploadList={false} accept=".csv">
            <Button icon={<UploadOutlined />}>Import CSV</Button>
          </Upload>
          <Tooltip title="Download CSV header: instructor_id,type,value">
            <Button icon={<FileTextOutlined />} onClick={downloadTemplate}>Template</Button>
          </Tooltip>
          <Button type="primary" onClick={applyBulk}>Apply to Selected</Button>
        </div>
      </div>

      <UnifiedTable
        title={
          <div className="flex items-center justify-between w-full">
            <span>Default Commission</span>
          </div>
        }
        actions={
          <Form form={form} layout="inline" className="gap-2">
            <Form.Item name="type" initialValue="percentage" rules={[{ required: true }]}> 
              <Radio.Group>
                <Radio value="percentage">Percentage</Radio>
                <Radio value="fixed">Fixed</Radio>
              </Radio.Group>
            </Form.Item>
            <Form.Item name="value" rules={[{ required: true, message: 'Enter value' }]}>
              <InputNumber placeholder="Value" min={0} max={100} />
            </Form.Item>
          </Form>
        }
        density="comfortable"
      >
        <div className="overflow-auto">
          <table className="min-w-full text-left border-separate border-spacing-0">
            <thead>
              <tr>
                <th className="border-b px-3 py-2 w-10">
                  <Checkbox checked={!!allSelected} indeterminate={selected.length && selected.length < instructors.length} onChange={(e) => toggleAll(e.target.checked)} />
                </th>
                <th className="border-b px-3 py-2">Name</th>
                <th className="border-b px-3 py-2">Email</th>
                <th className="border-b px-3 py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {instructors.map((i) => (
                <tr key={i.id} className="odd:bg-white even:bg-slate-50">
                  <td className="border-b px-3 py-2">
                    <Checkbox checked={selected.includes(i.id)} onChange={(e) => toggleOne(i.id, e.target.checked)} />
                  </td>
                  <td className="border-b px-3 py-2 font-medium">{i.name}</td>
                  <td className="border-b px-3 py-2">{i.email}</td>
                  <td className="border-b px-3 py-2 capitalize">{i.status || 'active'}</td>
                </tr>
              ))}
              {!instructors.length && (
                <tr>
                  <td colSpan={4} className="px-3 py-8 text-center text-gray-500">No instructors</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </UnifiedTable>
    </div>
  );
}
