import { useState, useEffect, forwardRef, useImperativeHandle, useCallback, useRef } from 'react';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import { Select, Spin, Alert, Table, Tag, Empty, Button, Dropdown } from 'antd';
import {
  DollarCircleOutlined, CalendarOutlined, ClockCircleOutlined,
  DownloadOutlined
} from '@ant-design/icons';
import { utils as xlsxUtils, writeFile as writeXlsxFile } from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { useData } from '@/shared/hooks/useData';
import { formatCurrency } from '@/shared/utils/formatters';
import { useCurrency } from '@/shared/contexts/CurrencyContext';
import moment from 'moment';

const { Option } = Select;

const latinize = (value) => {
  if (!value) return 'N/A';
  return value
    .replace(/ğ/g, 'g').replace(/Ğ/g, 'G')
    .replace(/ü/g, 'u').replace(/Ü/g, 'U')
    .replace(/ş/g, 's').replace(/Ş/g, 'S')
    .replace(/ı/g, 'i').replace(/İ/g, 'I')
    .replace(/ö/g, 'o').replace(/Ö/g, 'O')
    .replace(/ç/g, 'c').replace(/Ç/g, 'C');
};

const CATEGORY_COLORS = { private: 'blue', group: 'green', supervision: 'orange', 'semi-private': 'purple' };

const PayrollDashboard = forwardRef(({ instructor }, ref) => {
  const { apiClient } = useData();
  const { businessCurrency } = useCurrency();
  const [summaryData, setSummaryData] = useState(null);
  const [earnings, setEarnings] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedPeriod, setSelectedPeriod] = useState('current_month');
  const [autoExpanded, setAutoExpanded] = useState(false);
  const hasFetchedRef = useRef(false);

  const computeDateRange = (period) => {
    const now = new Date();
    switch (period) {
      case 'all_time':
        return { startDate: undefined, endDate: undefined };
      case 'last_month': {
        const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        return { startDate: format(startOfMonth(lastMonth), 'yyyy-MM-dd'), endDate: format(endOfMonth(lastMonth), 'yyyy-MM-dd') };
      }
      case 'last_3_months': {
        const d = new Date(now.getFullYear(), now.getMonth() - 3, 1);
        return { startDate: format(startOfMonth(d), 'yyyy-MM-dd'), endDate: format(endOfMonth(now), 'yyyy-MM-dd') };
      }
      case 'last_6_months': {
        const d = new Date(now.getFullYear(), now.getMonth() - 6, 1);
        return { startDate: format(startOfMonth(d), 'yyyy-MM-dd'), endDate: format(endOfMonth(now), 'yyyy-MM-dd') };
      }
      case 'current_year':
        return { startDate: format(new Date(now.getFullYear(), 0, 1), 'yyyy-MM-dd'), endDate: format(now, 'yyyy-MM-dd') };
      case 'current_month':
      default:
        return { startDate: format(startOfMonth(now), 'yyyy-MM-dd'), endDate: format(endOfMonth(now), 'yyyy-MM-dd') };
    }
  };

  const mapEarning = (earning) => ({
    id: earning.booking_id || earning.id,
    lesson_date: earning.lesson_date,
    service_name: earning.service_name || 'Private Lessons',
    lesson_duration: parseFloat(earning.lesson_duration || 0),
    commission_amount: parseFloat(earning.total_earnings || 0),
    lesson_amount: parseFloat(earning.lesson_amount || 0),
    commission_rate: parseFloat(earning.commission_rate || 0),
    commission_type: earning.commission_type || 'percentage',
    student_name: earning.student_name,
    status: earning.booking_status || 'completed',
    lesson_category: earning.lesson_category || null,
  });

  const fetchDashboardData = useCallback(async () => {
    if (!instructor?.id) return;
    setIsLoading(true);
    setError(null);
    const { startDate, endDate } = computeDateRange(selectedPeriod);

    try {
      let url = `/finances/instructor-earnings/${instructor.id}`;
      if (startDate && endDate) url += `?startDate=${startDate}&endDate=${endDate}`;
      const response = await apiClient.get(url);
      const rawEarnings = response.data.earnings || [];

      let filteredEarnings = rawEarnings;
      if (selectedPeriod !== 'all_time' && startDate && endDate) {
        filteredEarnings = rawEarnings.filter(earning => {
          if (!earning.lesson_date) return false;
          const d = moment.utc(earning.lesson_date);
          return d.isBetween(moment.utc(startDate, 'YYYY-MM-DD').startOf('day'), moment.utc(endDate, 'YYYY-MM-DD').endOf('day'), undefined, '[]');
        });
      }

      const earningsData = filteredEarnings.map(mapEarning);
      setEarnings(earningsData);

      if (earningsData.length === 0 && selectedPeriod === 'current_month' && !autoExpanded) {
        setAutoExpanded(true);
        setSelectedPeriod('last_3_months');
      }
    } catch {
      setError('Failed to load dashboard data.');
    } finally {
      setIsLoading(false);
    }
  }, [apiClient, instructor?.id, selectedPeriod, autoExpanded]);

  const calculateSummary = useCallback((earningsData) => {
    const totalEarnings = earningsData.reduce((sum, e) => sum + (parseFloat(e.commission_amount) || 0), 0);
    const totalLessons = earningsData.length;
    const totalHours = earningsData.reduce((sum, e) => sum + (parseFloat(e.lesson_duration) || 0), 0);
    const averagePerLesson = totalLessons > 0 ? totalEarnings / totalLessons : 0;
    const serviceHours = earningsData.reduce((acc, e) => {
      const key = latinize(e.service_name || 'Private Lessons');
      acc[key] = (acc[key] || 0) + (parseFloat(e.lesson_duration) || 0);
      return acc;
    }, {});
    setSummaryData({ totalEarnings, totalLessons, totalHours, averagePerLesson, serviceHours });
  }, []);

  useEffect(() => {
    if (instructor?.id) {
      // Reset the flag when period changes so we refetch
      hasFetchedRef.current = false;
    }
  }, [selectedPeriod, instructor?.id]);

  useEffect(() => {
    if (instructor?.id && !hasFetchedRef.current) {
      hasFetchedRef.current = true;
      fetchDashboardData();
    }
  }, [instructor?.id, fetchDashboardData]);

  useEffect(() => {
    if (earnings) calculateSummary(earnings);
  }, [earnings, calculateSummary]);

  useImperativeHandle(ref, () => ({
    refreshData: () => { hasFetchedRef.current = false; fetchDashboardData(); }
  }));

  // ── Export helpers ──
  const buildExportRows = () => earnings.map(e => ({
    Date: e.lesson_date ? moment.utc(e.lesson_date).format('YYYY-MM-DD') : 'N/A',
    Student: latinize(e.student_name || 'N/A'),
    Service: latinize(e.service_name || 'Private Lessons'),
    Duration: `${e.lesson_duration || 0}h`,
    'Lesson Amount': formatCurrency(parseFloat(e.lesson_amount) || 0, businessCurrency || 'EUR'),
    'Commission Rate': e.commission_type === 'fixed'
      ? `${formatCurrency(Number.parseFloat(e.commission_rate) || 0, businessCurrency || 'EUR')}/h`
      : `${Number.parseFloat(e.commission_rate || 0).toFixed(2)}%`,
    Commission: formatCurrency(parseFloat(e.commission_amount) || 0, businessCurrency || 'EUR'),
    Status: (e.status || 'pending').toUpperCase(),
  }));

  const buildSummaryLines = (exportedAt) => {
    if (!summaryData) return [];
    const lines = [
      ['Exported At', exportedAt],
      ['Total Lessons', summaryData.totalLessons],
      ['Total Hours', `${(summaryData.totalHours || 0).toFixed(1)}h`],
      ['Total Commission', formatCurrency(Number(summaryData.totalEarnings) || 0, businessCurrency || 'EUR')],
      ['Average Per Lesson', formatCurrency(Number(summaryData.averagePerLesson) || 0, businessCurrency || 'EUR')],
    ];
    if (summaryData.serviceHours) {
      lines.push(['Service Hours', '']);
      Object.entries(summaryData.serviceHours).forEach(([service, hours]) => {
        lines.push([`  ${service}`, `${hours.toFixed(1)}h`]);
      });
    }
    return lines;
  };

  const safeName = () => latinize(instructor?.name || 'instructor').replace(/\s+/g, '_');

  const exportCsv = () => {
    if (!earnings.length) return;
    const ts = moment().format('YYYY-MM-DD HH:mm:ss');
    const rows = buildExportRows();
    const summaryLines = buildSummaryLines(ts);
    const csv = [
      Object.keys(rows[0]).join(','),
      ...rows.map(r => Object.values(r).map(v => `${v}`.replace(/,/g, ' ')).join(',')),
      '', 'Summary,Value',
      ...summaryLines.map(l => l.map(v => `${v}`.replace(/,/g, ' ')).join(',')),
    ].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${safeName()}_earnings_${selectedPeriod}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const exportExcel = () => {
    if (!earnings.length) return;
    const ts = moment().format('YYYY-MM-DD HH:mm:ss');
    const ws = xlsxUtils.json_to_sheet(buildExportRows());
    const ss = xlsxUtils.aoa_to_sheet([['Summary', 'Value'], ...buildSummaryLines(ts)]);
    const wb = xlsxUtils.book_new();
    xlsxUtils.book_append_sheet(wb, ws, 'Earnings');
    xlsxUtils.book_append_sheet(wb, ss, 'Totals');
    writeXlsxFile(wb, `${safeName()}_earnings_${selectedPeriod}.xlsx`);
  };

  const exportPdf = () => {
    if (!earnings.length) return;
    const ts = moment().format('YYYY-MM-DD HH:mm:ss');
    const rows = buildExportRows();
    const doc = new jsPDF({ orientation: 'landscape' });
    doc.text(`${latinize(instructor?.name || 'Instructor')} Earnings (${selectedPeriod.replaceAll('_', ' ')})`, 14, 14);
    doc.text(`Exported: ${ts}`, 14, 20);
    autoTable(doc, { head: [Object.keys(rows[0])], body: rows.map(r => Object.values(r)), startY: 26, styles: { fontSize: 8 } });
    autoTable(doc, { head: [['Summary', 'Value']], body: buildSummaryLines(ts), startY: doc.lastAutoTable.finalY + 6, styles: { fontSize: 8 } });
    doc.save(`${safeName()}_earnings_${selectedPeriod}.pdf`);
  };

  const handleExport = ({ key }) => { if (key === 'csv') exportCsv(); if (key === 'excel') exportExcel(); if (key === 'pdf') exportPdf(); };

  if (isLoading) return <div className="flex justify-center items-center h-48"><Spin size="large"><div className="p-8">Loading earnings...</div></Spin></div>;
  if (error) return <Alert message="Error" description={error} type="error" showIcon action={<Button size="small" type="primary" onClick={() => { hasFetchedRef.current = false; fetchDashboardData(); }}>Retry</Button>} />;

  const fmt = (v) => formatCurrency(Number(v) || 0, businessCurrency || 'EUR');

  return (
    <div className="space-y-5">
      {/* ── Summary cards ── */}
      {summaryData && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Total Commission', value: fmt(summaryData.totalEarnings), icon: <DollarCircleOutlined />, color: 'text-emerald-600', bg: 'bg-emerald-50' },
            { label: 'Total Lessons', value: summaryData.totalLessons, icon: <CalendarOutlined />, color: 'text-blue-600', bg: 'bg-blue-50' },
            { label: 'Total Hours', value: `${(summaryData.totalHours || 0).toFixed(1)}h`, icon: <ClockCircleOutlined />, color: 'text-amber-600', bg: 'bg-amber-50' },
            { label: 'Avg / Lesson', value: fmt(summaryData.averagePerLesson), icon: <DollarCircleOutlined />, color: 'text-purple-600', bg: 'bg-purple-50' },
          ].map(s => (
            <div key={s.label} className="rounded-xl border border-gray-100 bg-white p-4">
              <div className={`inline-flex items-center justify-center w-8 h-8 rounded-lg ${s.bg} ${s.color} text-base mb-2`}>{s.icon}</div>
              <div className={`text-xl font-bold ${s.color}`}>{s.value}</div>
              <div className="text-xs text-gray-400 mt-0.5">{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Service hours breakdown */}
      {summaryData?.serviceHours && Object.keys(summaryData.serviceHours).length > 0 && (
        <div className="rounded-xl border border-gray-100 bg-white p-4">
          <div className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">Hours by Service</div>
          <div className="flex flex-wrap gap-2">
            {Object.entries(summaryData.serviceHours).map(([service, hours]) => (
              <span key={service} className="inline-flex items-center gap-1.5 rounded-full bg-gray-50 px-3 py-1 text-xs text-gray-700">
                <span className="font-medium">{service}</span> <span className="text-gray-400">{hours.toFixed(1)}h</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* ── Earnings table ── */}
      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <h4 className="text-sm font-semibold text-gray-800">Earnings Details</h4>
          <div className="flex items-center gap-2">
            <Dropdown menu={{ items: [{ key: 'csv', label: 'CSV' }, { key: 'excel', label: 'Excel' }, { key: 'pdf', label: 'PDF' }], onClick: handleExport }}>
              <Button size="small" icon={<DownloadOutlined />}>Export</Button>
            </Dropdown>
            <Select value={selectedPeriod} onChange={(v) => { setAutoExpanded(false); setSelectedPeriod(v); }} size="small" className="w-36">
              <Option value="current_month">This Month</Option>
              <Option value="last_month">Last Month</Option>
              <Option value="last_3_months">Last 3 Months</Option>
              <Option value="last_6_months">Last 6 Months</Option>
              <Option value="current_year">This Year</Option>
              <Option value="all_time">All Time</Option>
            </Select>
          </div>
        </div>

        {earnings.length === 0 && (
          <div className="px-5 py-2">
            <Alert type="info" showIcon message={
              selectedPeriod === 'all_time' ? 'No earnings recorded.' : 'No earnings for this period — try a wider range.'
            } banner className="rounded-lg" />
          </div>
        )}

        <Table
          columns={[
            { title: 'Date', dataIndex: 'lesson_date', key: 'date', render: t => t ? moment.utc(t).format('YYYY-MM-DD') : '—', width: 110 },
            { title: 'Student', dataIndex: 'student_name', key: 'student', render: t => latinize(t), ellipsis: true },
            { title: 'Service', dataIndex: 'service_name', key: 'service', render: t => latinize(t || 'Private Lessons'), ellipsis: true },
            { title: 'Category', dataIndex: 'lesson_category', key: 'category', width: 100,
              render: cat => cat ? <Tag color={CATEGORY_COLORS[cat] || 'default'} bordered={false} className="rounded-full capitalize m-0">{cat}</Tag> : <span className="text-gray-300">—</span> },
            { title: 'Duration', dataIndex: 'lesson_duration', key: 'dur', render: t => `${t || 0}h`, width: 80 },
            { title: 'Amount', dataIndex: 'lesson_amount', key: 'amt', render: t => fmt(t), width: 100 },
            { title: 'Rate', dataIndex: 'commission_rate', key: 'rate', width: 90,
              render: (v, r) => r.commission_type === 'fixed' ? `${fmt(v)}/h` : `${Number.parseFloat(v ?? 0).toFixed(1)}%` },
            { title: 'Commission', dataIndex: 'commission_amount', key: 'comm', render: t => <span className="font-medium text-emerald-700">{fmt(t)}</span>, width: 110 },
            { title: 'Status', dataIndex: 'status', key: 'status', width: 100,
              render: s => <Tag color={s === 'completed' ? 'green' : s === 'confirmed' ? 'blue' : 'orange'} bordered={false} className="rounded-full capitalize m-0">{s || 'pending'}</Tag> },
          ]}
          dataSource={earnings}
          rowKey="id"
          pagination={{ pageSize: 8, size: 'small', hideOnSinglePage: true }}
          size="small"
          locale={{ emptyText: <Empty description="No earnings for this period." image={Empty.PRESENTED_IMAGE_SIMPLE} /> }}
        />
      </div>
    </div>
  );
});

export default PayrollDashboard;