// src/features/manager/pages/finance/ManagerPayouts.jsx
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Spin, Tag, Table, Empty, DatePicker } from 'antd';
import { message } from '@/shared/utils/antdStatic';
import { BankOutlined, CheckCircleOutlined } from '@ant-design/icons';
import { getManagerCommissionHistory } from '../../services/managerCommissionApi';
import StatBox from '../../components/finance/StatBox';
import { formatCurrency } from '@/shared/utils/formatters';
import { SOURCE_TAG } from '../../constants/commissionSources';
import dayjs from 'dayjs';

const { RangePicker } = DatePicker;

function ManagerPayouts() {
  const { t } = useTranslation(['manager']);
  const [loading, setLoading] = useState(true);
  const [paid, setPaid] = useState([]);
  const [dateRange, setDateRange] = useState(null);

  const fetchPaid = useCallback(async () => {
    setLoading(true);
    try {
      const options = { status: 'paid', limit: 200, page: 1 };
      if (dateRange?.length === 2) {
        options.startDate = dateRange[0].format('YYYY-MM-DD');
        options.endDate = dateRange[1].format('YYYY-MM-DD');
      }
      const response = await getManagerCommissionHistory(options);
      if (response.success) setPaid(response.data || []);
      else message.error(t('manager:errors.loadFailed'));
    } catch (error) {
      message.error(error.message || t('manager:errors.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [dateRange, t]);

  useEffect(() => { fetchPaid(); }, [fetchPaid]);

  // Group paid commissions by paid_at date → "payouts"
  const payouts = useMemo(() => {
    const buckets = {};
    for (const row of paid) {
      const payoutDate = row.paid_at || row.payment_date || row.updated_at || row.source_date || row.created_at;
      if (!payoutDate) continue;
      const key = dayjs(payoutDate).format('YYYY-MM-DD');
      if (!buckets[key]) {
        buckets[key] = {
          key,
          payoutDate,
          amount: 0,
          count: 0,
          method: row.payment_method || row.method || null,
          notes: row.payment_notes || row.notes || null,
          periodStart: row.source_date || row.created_at,
          periodEnd: row.source_date || row.created_at,
          rows: [],
        };
      }
      const b = buckets[key];
      b.amount += parseFloat(row.commission_amount || 0);
      b.count += 1;
      b.rows.push(row);
      const sd = row.source_date || row.created_at;
      if (sd && (!b.periodStart || sd < b.periodStart)) b.periodStart = sd;
      if (sd && (!b.periodEnd || sd > b.periodEnd)) b.periodEnd = sd;
    }
    return Object.values(buckets).sort((a, b) => (a.payoutDate < b.payoutDate ? 1 : -1));
  }, [paid]);

  const ytdTotal = useMemo(() => {
    const yearStart = dayjs().startOf('year');
    return paid
      .filter(r => {
        const d = dayjs(r.paid_at || r.payment_date || r.updated_at || r.created_at);
        return d.isValid() && d.isAfter(yearStart);
      })
      .reduce((sum, r) => sum + parseFloat(r.commission_amount || 0), 0);
  }, [paid]);

  const totalReceived = useMemo(
    () => paid.reduce((sum, r) => sum + parseFloat(r.commission_amount || 0), 0),
    [paid],
  );

  if (loading) {
    return <div className="flex justify-center items-center min-h-[400px]"><Spin size="large" /></div>;
  }

  const columns = [
    {
      title: t('manager:finance.payouts.columns.date'), key: 'date', width: 130,
      render: (_, r) => (
        <span className="font-medium text-slate-700">
          {dayjs(r.payoutDate).format('DD MMM YYYY')}
        </span>
      ),
    },
    {
      title: t('manager:finance.payouts.columns.amount'), key: 'amount', width: 130, align: 'right',
      render: (_, r) => (
        <span className="font-semibold text-green-600">
          {formatCurrency(r.amount, 'EUR')}
        </span>
      ),
    },
    {
      title: t('manager:finance.payouts.columns.period'), key: 'period',
      render: (_, r) => {
        if (!r.periodStart) return '—';
        const start = dayjs(r.periodStart).format('DD MMM');
        const end = dayjs(r.periodEnd).format('DD MMM YYYY');
        return <span className="text-xs text-slate-500">{start} – {end}</span>;
      },
    },
    {
      title: t('manager:finance.payouts.columns.relatedCount'), key: 'count', width: 110, align: 'center',
      render: (_, r) => (
        <Tag color="blue" bordered={false} className="rounded-full">
          {t('manager:finance.payouts.itemsCount', { count: r.count })}
        </Tag>
      ),
    },
    {
      title: t('manager:finance.payouts.columns.method'), key: 'method', width: 140,
      render: (_, r) => r.method ? <Tag color="default" className="capitalize">{r.method}</Tag> : <span className="text-slate-400 text-xs">—</span>,
    },
    {
      title: t('manager:finance.payouts.columns.notes'), key: 'notes', ellipsis: true,
      render: (_, r) => <span className="text-xs text-slate-500">{r.notes || '—'}</span>,
    },
  ];

  const expandedRowRender = (record) => (
    <div className="bg-slate-50/40 -m-2 p-3 rounded">
      <div className="text-xs font-semibold text-slate-500 mb-2">
        {t('manager:finance.payouts.includedCommissions')}
      </div>
      <div className="space-y-1">
        {record.rows.map((row) => {
          const d = row.source_details || row.metadata || {};
          const parts = [d.student_name, d.instructor_name, d.service_name].filter(Boolean);
          return (
            <div key={row.id} className="flex items-center gap-2 text-xs">
              <Tag color={SOURCE_TAG[row.source_type] || 'default'} className="capitalize" bordered={false}>
                {row.source_type || '—'}
              </Tag>
              <span className="text-slate-500 flex-1 truncate">
                {parts.join(' · ') || '—'}
              </span>
              <span className="font-medium text-green-600">
                {formatCurrency(row.commission_amount || 0, row.commission_currency || 'EUR')}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2 mb-1">
          <BankOutlined className="text-indigo-500" />
          {t('manager:finance.payouts.title')}
        </h1>
        <p className="text-sm text-slate-400">{t('manager:finance.payouts.subtitle')}</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <StatBox
          label={t('manager:finance.payouts.stats.ytdTotal')}
          value={formatCurrency(ytdTotal, 'EUR')}
          color="text-indigo-600"
          border="border-indigo-100"
          icon={<CheckCircleOutlined className="text-indigo-500" />}
        />
        <StatBox
          label={t('manager:finance.payouts.stats.totalReceived')}
          value={formatCurrency(totalReceived, 'EUR')}
          color="text-green-600"
          border="border-green-100"
        />
        <StatBox
          label={t('manager:finance.payouts.stats.payoutCount')}
          value={String(payouts.length)}
          sub={t('manager:finance.payouts.stats.payoutCountSub')}
          color="text-slate-700"
          border="border-slate-100"
        />
      </div>

      <div className="rounded-xl border border-gray-100 bg-white p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <h3 className="text-sm font-semibold text-gray-700">
            {t('manager:finance.payouts.historyTitle')}
          </h3>
          <RangePicker
            value={dateRange}
            onChange={setDateRange}
            style={{ width: 240 }}
            size="small"
          />
        </div>

        {payouts.length === 0 ? (
          <Empty description={t('manager:finance.payouts.empty')} image={Empty.PRESENTED_IMAGE_SIMPLE} />
        ) : (
          <Table
            columns={columns}
            dataSource={payouts}
            rowKey="key"
            size="small"
            scroll={{ x: 700 }}
            pagination={{ pageSize: 15, showSizeChanger: false, size: 'small' }}
            expandable={{ expandedRowRender }}
          />
        )}
      </div>
    </div>
  );
}

export default ManagerPayouts;
