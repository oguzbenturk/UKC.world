// src/features/manager/pages/finance/ManagerUpcomingIncome.jsx
import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Spin, Tag, Table, Select, Empty, DatePicker, Alert } from 'antd';
import { message } from '@/shared/utils/antdStatic';
import { RocketOutlined, BarChartOutlined, InfoCircleOutlined } from '@ant-design/icons';
import { getManagerUpcomingIncome } from '../../services/managerCommissionApi';
import StatBox from '../../components/finance/StatBox';
import { formatCurrency } from '@/shared/utils/formatters';
import { SOURCE_TAG } from '../../constants/commissionSources';
import dayjs from 'dayjs';

const { Option } = Select;
const { RangePicker } = DatePicker;

const CATEGORY_BORDER = {
  bookings: 'border-blue-100',
  rentals: 'border-green-100',
  accommodation: 'border-purple-100',
  shop: 'border-orange-100',
  membership: 'border-cyan-100',
  packages: 'border-pink-100',
};

const CATEGORY_COLOR = {
  bookings: 'text-blue-600',
  rentals: 'text-green-600',
  accommodation: 'text-purple-600',
  shop: 'text-orange-600',
  membership: 'text-cyan-600',
  packages: 'text-pink-600',
};

function ManagerUpcomingIncome() {
  const { t } = useTranslation(['manager']);
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [filters, setFilters] = useState({ sourceType: null, dateRange: null });

  const fetchUpcoming = useCallback(async () => {
    setLoading(true);
    try {
      const options = { sourceType: filters.sourceType };
      if (filters.dateRange?.length === 2) {
        options.startDate = filters.dateRange[0].format('YYYY-MM-DD');
        options.endDate = filters.dateRange[1].format('YYYY-MM-DD');
      }
      const response = await getManagerUpcomingIncome(options);
      if (response.success) setData(response.data);
      else message.error(t('manager:errors.loadFailed'));
    } catch (error) {
      // Endpoint may not be live yet — show empty state gracefully
      setData({ totalProjected: 0, byCategory: {}, items: [] });
      if (error?.response?.status !== 404) {
        message.error(error.message || t('manager:errors.loadFailed'));
      }
    } finally {
      setLoading(false);
    }
  }, [filters, t]);

  useEffect(() => { fetchUpcoming(); }, [fetchUpcoming]);

  if (loading) {
    return <div className="flex justify-center items-center min-h-[400px]"><Spin size="large" /></div>;
  }

  const totalProjected = data?.totalProjected || 0;
  const byCategory = data?.byCategory || {};
  const items = data?.items || [];

  const categories = [
    { key: 'bookings', label: t('manager:dashboard.categoryBreakdown.bookings') },
    { key: 'rentals', label: t('manager:dashboard.categoryBreakdown.rentals') },
    { key: 'accommodation', label: t('manager:dashboard.categoryBreakdown.accommodation') },
    { key: 'shop', label: t('manager:dashboard.categoryBreakdown.shop') },
    { key: 'membership', label: t('manager:dashboard.categoryBreakdown.membership') },
    { key: 'packages', label: t('manager:dashboard.categoryBreakdown.packages') },
  ];

  const columns = [
    {
      title: t('manager:dashboard.history.columns.date'), key: 'date', width: 110,
      render: (_, r) => r.date ? dayjs(r.date).format('DD MMM YYYY') : '—',
    },
    {
      title: t('manager:dashboard.history.columns.source'), key: 'source', width: 110,
      render: (_, r) => (
        <Tag color={SOURCE_TAG[r.sourceType] || 'default'} className="capitalize">
          {r.sourceType || '—'}
        </Tag>
      ),
    },
    {
      title: t('manager:dashboard.history.columns.details'), key: 'details', ellipsis: true,
      render: (_, r) => {
        const d = r.sourceDetails || {};
        const parts = [d.studentName, d.instructorName, d.serviceName].filter(Boolean);
        return <span className="text-xs text-gray-600">{parts.join(' · ') || '—'}</span>;
      },
    },
    {
      title: t('manager:dashboard.history.columns.amount'), key: 'amount', width: 100, align: 'right',
      render: (_, r) => (
        <span className="text-gray-500">
          {formatCurrency(r.sourceAmount || 0, r.sourceCurrency || 'EUR')}
        </span>
      ),
    },
    {
      title: t('manager:dashboard.history.columns.rate'), key: 'rate', width: 60, align: 'center',
      render: (_, r) => r.commissionRate ? <span className="text-purple-600 font-medium">{r.commissionRate}%</span> : '—',
    },
    {
      title: t('manager:finance.upcoming.columns.projected'), key: 'projected', width: 130, align: 'right',
      render: (_, r) => (
        <span className="font-semibold text-sky-600">
          {formatCurrency(r.projectedCommission || 0, r.sourceCurrency || 'EUR')}
        </span>
      ),
    },
  ];

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2 mb-1">
          <RocketOutlined className="text-sky-500" />
          {t('manager:finance.upcoming.title')}
        </h1>
        <p className="text-sm text-slate-400">{t('manager:finance.upcoming.subtitle')}</p>
      </div>

      {/* Big total */}
      <div className="rounded-xl border border-sky-100 bg-gradient-to-br from-sky-50/40 to-white p-6">
        <div className="text-xs font-semibold uppercase tracking-wider text-sky-500 mb-1">
          {t('manager:finance.upcoming.totalLabel')}
        </div>
        <div className="text-4xl font-bold text-sky-600">
          {formatCurrency(totalProjected, 'EUR')}
        </div>
        <div className="text-sm text-slate-400 mt-1">
          {t('manager:finance.upcoming.totalSub', { count: items.length })}
        </div>
      </div>

      {/* Category breakdown */}
      <div className="rounded-xl border border-gray-100 bg-white p-5">
        <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2 mb-4">
          <BarChartOutlined className="text-indigo-500" />
          {t('manager:finance.upcoming.byCategory')}
        </h3>
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
          {categories.map((cat) => (
            <StatBox
              key={cat.key}
              label={cat.label}
              value={formatCurrency(byCategory[cat.key] || 0, 'EUR')}
              color={CATEGORY_COLOR[cat.key]}
              border={CATEGORY_BORDER[cat.key]}
            />
          ))}
        </div>
      </div>

      {/* Items table */}
      <div className="rounded-xl border border-gray-100 bg-white p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <h3 className="text-sm font-semibold text-gray-700">
            {t('manager:finance.upcoming.itemsTitle')}
          </h3>
          <div className="flex items-center gap-2 flex-wrap">
            <Select
              placeholder={t('manager:dashboard.history.filters.source')}
              allowClear
              style={{ width: 140 }}
              size="small"
              value={filters.sourceType}
              onChange={v => setFilters(f => ({ ...f, sourceType: v }))}
            >
              <Option value="booking">{t('manager:dashboard.history.filters.booking')}</Option>
              <Option value="rental">{t('manager:dashboard.history.filters.rental')}</Option>
              <Option value="accommodation">{t('manager:dashboard.history.filters.accommodation')}</Option>
              <Option value="shop">{t('manager:dashboard.history.filters.shop')}</Option>
              <Option value="membership">{t('manager:dashboard.history.filters.membership')}</Option>
              <Option value="package">{t('manager:dashboard.history.filters.package')}</Option>
            </Select>
            <RangePicker
              value={filters.dateRange}
              onChange={dates => setFilters(f => ({ ...f, dateRange: dates }))}
              style={{ width: 220 }}
              size="small"
            />
          </div>
        </div>

        {items.length === 0 ? (
          <Empty description={t('manager:finance.upcoming.empty')} image={Empty.PRESENTED_IMAGE_SIMPLE} />
        ) : (
          <Table
            columns={columns}
            dataSource={items}
            rowKey="id"
            size="small"
            scroll={{ x: 700 }}
            pagination={{ pageSize: 15, showSizeChanger: false, size: 'small' }}
          />
        )}
      </div>

      <Alert
        type="info"
        showIcon
        icon={<InfoCircleOutlined />}
        message={t('manager:finance.upcoming.footnote')}
        className="rounded-xl border-sky-100 bg-sky-50/40"
      />
    </div>
  );
}

export default ManagerUpcomingIncome;
