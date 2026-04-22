import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Checkbox, Form, InputNumber, Radio, Upload, Tooltip } from 'antd';
import { message } from '@/shared/utils/antdStatic';
import { UploadOutlined, FileTextOutlined } from '@ant-design/icons';
import UnifiedTable from '@/shared/components/tables/UnifiedTable';
import { useData } from '@/shared/hooks/useData';

export default function BulkCommissions() {
  const { t } = useTranslation(['instructor']);
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
        message.warning(t('instructor:bulkCommissions.selectAtLeastOne'));
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
      if (success) message.success(t('instructor:bulkCommissions.updatedCount', { count: success }));
      if (success < selected.length) message.warning(t('instructor:bulkCommissions.failedCount', { count: selected.length - success }));
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
        message.error(t('instructor:bulkCommissions.csvColumns'));
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
      if (success) message.success(t('instructor:bulkCommissions.csvApplied', { count: success }));
      if (failed) message.warning(t('instructor:bulkCommissions.csvRowsFailed', { count: failed }));
  } catch {
      message.error(t('instructor:bulkCommissions.failedToReadCsv'));
    }
    return Upload.LIST_IGNORE;
  };

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-gray-800">{t('instructor:bulkCommissions.title')}</h1>
        <div className="flex gap-2">
          <Button onClick={() => window.history.back()}>{t('instructor:bulkCommissions.back')}</Button>
          <Upload beforeUpload={handleCsv} showUploadList={false} accept=".csv">
            <Button icon={<UploadOutlined />}>{t('instructor:bulkCommissions.importCsv')}</Button>
          </Upload>
          <Tooltip title={t('instructor:bulkCommissions.templateTooltip')}>
            <Button icon={<FileTextOutlined />} onClick={downloadTemplate}>{t('instructor:bulkCommissions.template')}</Button>
          </Tooltip>
          <Button type="primary" onClick={applyBulk}>{t('instructor:bulkCommissions.applyToSelected')}</Button>
        </div>
      </div>

      <UnifiedTable
        title={
          <div className="flex items-center justify-between w-full">
            <span>{t('instructor:bulkCommissions.defaultCommission')}</span>
          </div>
        }
        actions={
          <Form form={form} layout="inline" className="gap-2">
            <Form.Item name="type" initialValue="percentage" rules={[{ required: true }]}> 
              <Radio.Group>
                <Radio value="percentage">{t('instructor:bulkCommissions.percentage')}</Radio>
                <Radio value="fixed">{t('instructor:bulkCommissions.fixed')}</Radio>
              </Radio.Group>
            </Form.Item>
            <Form.Item name="value" rules={[{ required: true, message: t('instructor:bulkCommissions.enterValue') }]}>
              <InputNumber placeholder={t('instructor:bulkCommissions.value')} min={0} max={100} />
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
                <th className="border-b px-3 py-2">{t('instructor:bulkCommissions.columns.name')}</th>
                <th className="border-b px-3 py-2">{t('instructor:bulkCommissions.columns.email')}</th>
                <th className="border-b px-3 py-2">{t('instructor:bulkCommissions.columns.status')}</th>
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
                  <td colSpan={4} className="px-3 py-8 text-center text-gray-500">{t('instructor:bulkCommissions.noInstructors')}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </UnifiedTable>
    </div>
  );
}
