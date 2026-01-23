import { useEffect, useState, useMemo, useCallback } from 'react';
import { Card, DatePicker, Table, Tag, Space, Row, Col, Spin, Empty, Button, Typography, Grid } from 'antd';
import { 
  ReloadOutlined, 
  ArrowUpOutlined, 
  ArrowDownOutlined,
  CalendarOutlined,
  ShoppingCartOutlined,
  DollarOutlined
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { getDailyOperations } from '../services/dailyOperationsService.js';
import { useCurrency } from '@/shared/contexts/CurrencyContext';

const { Title, Text } = Typography;
const { useBreakpoint } = Grid;

// Stat card component
function StatCard({ title, value, icon, trend, color = 'cyan' }) {
  const colorMap = {
    cyan: { bg: 'from-cyan-50 to-white', text: 'text-cyan-600', icon: 'text-cyan-500' },
    green: { bg: 'from-emerald-50 to-white', text: 'text-emerald-600', icon: 'text-emerald-500' },
    amber: { bg: 'from-amber-50 to-white', text: 'text-amber-600', icon: 'text-amber-500' },
    rose: { bg: 'from-rose-50 to-white', text: 'text-rose-600', icon: 'text-rose-500' },
    purple: { bg: 'from-purple-50 to-white', text: 'text-purple-600', icon: 'text-purple-500' },
    slate: { bg: 'from-slate-50 to-white', text: 'text-slate-600', icon: 'text-slate-500' },
  };
  const colors = colorMap[color] || colorMap.slate;
  
  return (
    <div className={`rounded-2xl border border-slate-200/70 bg-gradient-to-br ${colors.bg} p-4 shadow-sm`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</p>
          <p className={`mt-2 text-2xl font-bold ${colors.text}`}>{value}</p>
          {trend !== undefined && (
            <p className={`mt-1 text-xs ${trend >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
              {trend >= 0 ? <ArrowUpOutlined /> : <ArrowDownOutlined />} {Math.abs(trend)}%
            </p>
          )}
        </div>
        <div className={`rounded-xl bg-white/60 p-2 ${colors.icon}`}>
          {icon}
        </div>
      </div>
    </div>
  );
}

export default function DailyOperationsPage() {
  const screens = useBreakpoint();
  const isMobile = !screens.md;
  const { formatCurrency } = useCurrency();
  const [date, setDate] = useState(dayjs());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(() => {
    setLoading(true); 
    setError(null);
    getDailyOperations({ date: date.format('YYYY-MM-DD'), rentalsScope: 'both' })
      .then(setData)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [date]);

  useEffect(() => { load(); }, [load]);

  // Calculate daily stats
  const dailyStats = useMemo(() => {
    if (!data) return null;
    
    const payments = data.payments || [];
    const rentals = [...(data.rentalsCreated || []), ...(data.rentalsActive || [])];
    
    // Remove duplicate rentals
    const uniqueRentals = Array.from(new Map(rentals.map(r => [r.id, r])).values());
    
    const totalIncome = payments.filter(p => p.amount > 0).reduce((sum, p) => sum + p.amount, 0);
    const totalRefunds = payments.filter(p => p.amount < 0).reduce((sum, p) => sum + Math.abs(p.amount), 0);
    const netIncome = totalIncome - totalRefunds;
    const transactionCount = payments.length;
    const rentalCount = uniqueRentals.length;
    const activeRentals = uniqueRentals.filter(r => ['active', 'in_progress'].includes(r.status)).length;
    
    return {
      totalIncome,
      totalRefunds,
      netIncome,
      transactionCount,
      rentalCount,
      activeRentals
    };
  }, [data]);

  // Income transactions (positive payments)
  const incomeTransactions = useMemo(() => {
    if (!data?.payments) return [];
    return data.payments
      .filter(p => p.amount > 0)
      .map(p => ({
        ...p,
        key: p.id
      }));
  }, [data]);

  // Unique rentals for the day
  const dayRentals = useMemo(() => {
    if (!data) return [];
    const rentals = [...(data.rentalsCreated || []), ...(data.rentalsActive || [])];
    const uniqueRentals = Array.from(new Map(rentals.map(r => [r.id, r])).values());
    return uniqueRentals.map(r => ({ ...r, key: r.id }));
  }, [data]);

  const paymentColumns = [
    { 
      title: 'Time', 
      dataIndex: 'transaction_date', 
      key: 'time',
      width: 80,
      render: v => <Text className="text-slate-600">{dayjs(v).format('HH:mm')}</Text>
    },
    { 
      title: 'Description', 
      dataIndex: 'description', 
      key: 'description',
      ellipsis: true,
      render: (text, record) => (
        <div>
          <Text strong className="block">{text || record.type || 'Payment'}</Text>
          {record.payment_method && (
            <Text type="secondary" className="text-xs">{record.payment_method}</Text>
          )}
        </div>
      )
    },
    { 
      title: 'Type', 
      dataIndex: 'type', 
      key: 'type',
      width: 100,
      responsive: ['md'],
      render: type => {
        const colors = {
          rental: 'blue',
          lesson: 'purple',
          product: 'cyan',
          deposit: 'green',
          membership: 'magenta',
          refund: 'red'
        };
        return <Tag color={colors[type] || 'default'}>{type || 'Other'}</Tag>;
      }
    },
    { 
      title: 'Reference', 
      dataIndex: 'reference_number', 
      key: 'reference',
      width: 120,
      responsive: ['lg'],
      render: ref => <Text type="secondary" className="text-xs">{ref || '—'}</Text>
    },
    { 
      title: 'Amount', 
      dataIndex: 'amount', 
      key: 'amount',
      width: 100,
      align: 'right',
      render: v => (
        <Text strong className="text-emerald-600">
          +{formatCurrency(v)}
        </Text>
      )
    }
  ];

  const rentalColumns = [
    { 
      title: 'Time', 
      key: 'time',
      width: 100,
      render: (_, record) => (
        <div className="text-xs">
          <div>{dayjs(record.start_date).format('HH:mm')}</div>
          <div className="text-slate-400">to {dayjs(record.end_date).format('HH:mm')}</div>
        </div>
      )
    },
    { 
      title: 'Customer', 
      dataIndex: 'user_id', 
      key: 'customer',
      ellipsis: true,
      render: (userId, record) => (
        <div>
          <Text strong className="block">{record.customer_name || 'Customer'}</Text>
          <Text type="secondary" className="text-xs">ID: {userId?.slice(0, 8)}...</Text>
        </div>
      )
    },
    { 
      title: 'Status', 
      dataIndex: 'status', 
      key: 'status',
      width: 100,
      render: status => {
        const colors = {
          active: 'blue',
          in_progress: 'processing',
          completed: 'green',
          closed: 'green',
          pending: 'orange',
          cancelled: 'red'
        };
        return <Tag color={colors[status] || 'default'}>{status}</Tag>;
      }
    },
    { 
      title: 'Payment', 
      dataIndex: 'payment_status', 
      key: 'payment_status',
      width: 90,
      responsive: ['md'],
      render: status => {
        const colors = {
          paid: 'green',
          closed: 'green',
          pending: 'orange',
          partial: 'gold',
          unpaid: 'red'
        };
        return <Tag color={colors[status] || 'default'}>{status}</Tag>;
      }
    },
    { 
      title: 'Price', 
      dataIndex: 'total_price', 
      key: 'total_price',
      width: 100,
      align: 'right',
      render: v => <Text strong>{formatCurrency(v)}</Text>
    },
    { 
      title: 'Paid Today', 
      dataIndex: 'amount_paid_today', 
      key: 'amount_paid_today',
      width: 100,
      align: 'right',
      responsive: ['lg'],
      render: v => (
        <Text className={v > 0 ? 'text-emerald-600' : 'text-slate-400'}>
          {formatCurrency(v || 0)}
        </Text>
      )
    }
  ];

  const dateLabel = date.format('dddd, MMMM D, YYYY');
  const isToday = date.isSame(dayjs(), 'day');

  return (
    <div className="min-h-screen space-y-6 bg-slate-50 p-4 md:p-6">
      {/* Header */}
      <Card className="rounded-3xl border border-slate-200/70 bg-gradient-to-br from-cyan-50 via-white to-white shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Title level={3} className="!mb-0 text-slate-900">Daily Operations</Title>
              {isToday && <Tag color="cyan" className="text-xs font-medium">Today</Tag>}
            </div>
            <p className="text-sm text-slate-500">{dateLabel}</p>
          </div>
          <Space wrap>
            <DatePicker 
              value={date} 
              onChange={d => d && setDate(d)} 
              allowClear={false}
              size={isMobile ? 'middle' : 'large'}
              className="rounded-xl"
            />
            <Button
              icon={<CalendarOutlined />}
              onClick={() => setDate(dayjs())}
              disabled={isToday}
            >
              Today
            </Button>
            <Button
              icon={<ReloadOutlined />}
              onClick={load}
              loading={loading}
            >
              Refresh
            </Button>
          </Space>
        </div>

        {/* Summary Stats */}
        {!loading && dailyStats && (
          <Row gutter={[16, 16]} className="mt-6">
            <Col xs={12} md={6}>
              <StatCard 
                title="Total Income" 
                value={formatCurrency(dailyStats.totalIncome)}
                icon={<DollarOutlined className="text-xl" />}
                color="green"
              />
            </Col>
            <Col xs={12} md={6}>
              <StatCard 
                title="Net Revenue" 
                value={formatCurrency(dailyStats.netIncome)}
                icon={<ArrowUpOutlined className="text-xl" />}
                color="cyan"
              />
            </Col>
            <Col xs={12} md={6}>
              <StatCard 
                title="Transactions" 
                value={dailyStats.transactionCount}
                icon={<ShoppingCartOutlined className="text-xl" />}
                color="purple"
              />
            </Col>
            <Col xs={12} md={6}>
              <StatCard 
                title="Rentals" 
                value={`${dailyStats.activeRentals} active / ${dailyStats.rentalCount} total`}
                icon={<CalendarOutlined className="text-xl" />}
                color="amber"
              />
            </Col>
          </Row>
        )}
      </Card>

      {/* Loading State */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <Spin size="large" />
        </div>
      )}

      {/* Error State */}
      {error && (
        <Card className="rounded-2xl border-rose-200 bg-rose-50">
          <Text type="danger">Failed to load data: {error}</Text>
        </Card>
      )}

      {/* Income/Payment History */}
      {!loading && data && (
        <Card 
          className="rounded-3xl border border-slate-200/70 shadow-sm"
          title={
            <div className="flex items-center gap-2">
              <DollarOutlined className="text-emerald-500" />
              <span>Payment History</span>
              <Tag color="green">{incomeTransactions.length} income transactions</Tag>
            </div>
          }
        >
          <Table
            dataSource={incomeTransactions}
            columns={paymentColumns}
            size="small"
            pagination={{ pageSize: 10, showSizeChanger: true }}
            scroll={{ x: 600 }}
            locale={{
              emptyText: (
                <Empty 
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description="No income transactions for this day"
                />
              )
            }}
          />
        </Card>
      )}

      {/* Rentals List */}
      {!loading && data && (
        <Card 
          className="rounded-3xl border border-slate-200/70 shadow-sm"
          title={
            <div className="flex items-center gap-2">
              <CalendarOutlined className="text-amber-500" />
              <span>Rentals</span>
              <Tag color="orange">{dayRentals.length} rentals</Tag>
            </div>
          }
        >
          <Table
            dataSource={dayRentals}
            columns={rentalColumns}
            size="small"
            pagination={{ pageSize: 10, showSizeChanger: true }}
            scroll={{ x: 700 }}
            locale={{
              emptyText: (
                <Empty 
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description="No rentals for this day"
                />
              )
            }}
          />
        </Card>
      )}
    </div>
  );
}
