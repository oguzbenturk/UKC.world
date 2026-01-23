import { useState, useEffect, useMemo } from 'react';
import { Card, DatePicker, Space, Button, Tag, Grid } from 'antd';
import dayjs from 'dayjs';
import { ReloadOutlined } from '@ant-design/icons';
import TransactionHistory from '../components/TransactionHistory';
import { formatCurrency } from '@/shared/utils/formatters';
import apiClient from '@/shared/services/apiClient';

const { RangePicker } = DatePicker;
const { useBreakpoint } = Grid;

const accentStyles = {
  cyan: { bg: 'bg-cyan-50', text: 'text-cyan-600' },
  emerald: { bg: 'bg-emerald-50', text: 'text-emerald-600' },
  amber: { bg: 'bg-amber-50', text: 'text-amber-600' },
  rose: { bg: 'bg-rose-50', text: 'text-rose-600' },
  slate: { bg: 'bg-slate-100', text: 'text-slate-600' }
};

// Quick date range presets
const getQuickRanges = () => ({
  today: {
    label: 'Today',
    startDate: dayjs().format('YYYY-MM-DD'),
    endDate: dayjs().format('YYYY-MM-DD')
  },
  thisWeek: {
    label: 'This Week',
    startDate: dayjs().startOf('week').format('YYYY-MM-DD'),
    endDate: dayjs().format('YYYY-MM-DD')
  },
  thisMonth: {
    label: 'This Month',
    startDate: dayjs().startOf('month').format('YYYY-MM-DD'),
    endDate: dayjs().format('YYYY-MM-DD')
  },
  thisYear: {
    label: 'This Year',
    startDate: dayjs().startOf('year').format('YYYY-MM-DD'),
    endDate: dayjs().format('YYYY-MM-DD')
  },
  allHistory: {
    label: 'All History',
    startDate: '2020-01-01',
    endDate: dayjs().format('YYYY-MM-DD')
  }
});

/**
 * FinanceShop - Finance view for product/shop sales
 */
const FinanceShop = () => {
  const screens = useBreakpoint();
  const isMobile = !screens.md;
  const [dateRange, setDateRange] = useState({
    startDate: dayjs().startOf('month').format('YYYY-MM-DD'),
    endDate: dayjs().format('YYYY-MM-DD')
  });
  const [activeQuickRange, setActiveQuickRange] = useState('thisMonth');
  const [summaryData, setSummaryData] = useState(null);
  const [shopOrders, setShopOrders] = useState([]);
  const [shopOrderCount, setShopOrderCount] = useState(0);
  const [shopRevenue, setShopRevenue] = useState(0);
  const [totalCostPrice, setTotalCostPrice] = useState(0);
  const [netProfit, setNetProfit] = useState(0);

  useEffect(() => {
    loadFinancialData();
    loadShopOrders();
  }, [dateRange]);

  const loadFinancialData = async () => {
    try {
      const response = await apiClient.get('/finances/summary', {
        params: {
          startDate: dateRange.startDate,
          endDate: dateRange.endDate,
          serviceType: 'shop',
          mode: 'accrual'
        }
      });
      setSummaryData(response.data);
    } catch (error) {
      console.error('Error loading financial data:', error);
    }
  };

  const loadShopOrders = async () => {
    try {
      const response = await apiClient.get('/shop-orders/admin/all', {
        params: {
          date_from: dateRange.startDate,
          date_to: dateRange.endDate,
          limit: 1000,
          payment_status: 'completed'
        }
      });
      const orders = response.data?.orders || [];
      setShopOrders(orders);
      setShopOrderCount(response.data?.total || orders.length);
      
      // Calculate total revenue from completed orders
      const revenue = orders
        .filter(o => o.payment_status === 'completed')
        .reduce((sum, o) => sum + parseFloat(o.total_amount || 0), 0);
      setShopRevenue(revenue);

      // Calculate total cost price (COGS) from order items
      // We need to fetch product cost prices for accurate calculation
      const productIds = new Set();
      orders.forEach(order => {
        if (order.items) {
          order.items.forEach(item => {
            if (item.product_id) productIds.add(item.product_id);
          });
        }
      });

      // If we have products, fetch their cost prices
      let costPriceMap = {};
      if (productIds.size > 0) {
        try {
          const productsResponse = await apiClient.get('/products', {
            params: { ids: Array.from(productIds).join(','), limit: 1000 }
          });
          const products = productsResponse.data?.products || productsResponse.data || [];
          products.forEach(p => {
            costPriceMap[p.id] = parseFloat(p.cost_price || 0);
          });
        } catch {
          // Fallback: estimate cost as 60% of selling price
          console.warn('Could not fetch product cost prices, using estimate');
        }
      }

      // Calculate total cost of goods sold
      let totalCost = 0;
      orders.forEach(order => {
        if (order.items && order.payment_status === 'completed') {
          order.items.forEach(item => {
            const itemCost = costPriceMap[item.product_id] 
              ? costPriceMap[item.product_id] * (item.quantity || 1)
              : parseFloat(item.unit_price || 0) * 0.6 * (item.quantity || 1); // 60% estimate if no cost price
            totalCost += itemCost;
          });
        }
      });

      setTotalCostPrice(totalCost);
      setNetProfit(revenue - totalCost);
    } catch (error) {
      console.error('Error loading shop orders:', error);
      setShopOrders([]);
      setShopOrderCount(0);
      setShopRevenue(0);
      setTotalCostPrice(0);
      setNetProfit(0);
    }
  };

  const handleDateRangeChange = (dates) => {
    if (dates && dates[0] && dates[1]) {
      setDateRange({
        startDate: dates[0].format('YYYY-MM-DD'),
        endDate: dates[1].format('YYYY-MM-DD')
      });
      setActiveQuickRange(null);
    }
  };

  const handleMobileDateChange = (field, value) => {
    setDateRange(prev => ({ ...prev, [field]: value }));
    setActiveQuickRange(null);
  };

  const handleQuickRange = (rangeKey) => {
    const ranges = getQuickRanges();
    const range = ranges[rangeKey];
    if (range) {
      setDateRange({
        startDate: range.startDate,
        endDate: range.endDate
      });
      setActiveQuickRange(rangeKey);
    }
  };

  const rangeLabel = useMemo(() => {
    const start = dayjs(dateRange.startDate);
    const end = dayjs(dateRange.endDate);
    return `${start.format('MMM D, YYYY')} – ${end.format('MMM D, YYYY')}`;
  }, [dateRange]);

  const headlineStats = useMemo(() => {
    // Use shop revenue from actual orders, or from summary API as fallback
    const revenue = summaryData?.revenue || {};
    const apiShopRevenue = Number(revenue.shop_revenue || 0);
    const displayRevenue = shopRevenue > 0 ? shopRevenue : apiShopRevenue;
    
    // Calculate profit margin percentage
    const profitMargin = displayRevenue > 0 ? ((netProfit / displayRevenue) * 100).toFixed(1) : 0;

    if (!summaryData && shopOrders.length === 0) {
      return [
        { key: 'revenue', label: 'Total Revenue', value: '--', accent: 'cyan' },
        { key: 'orders', label: 'Total Orders', value: '--', accent: 'emerald' },
        { key: 'cost', label: 'Cost of Goods', value: '--', accent: 'amber' },
        { key: 'profit', label: 'Net Profit', value: '--', accent: 'emerald', subtitle: '--' }
      ];
    }

    return [
      { key: 'revenue', label: 'Total Revenue', value: formatCurrency(displayRevenue), accent: 'cyan' },
      { key: 'orders', label: 'Total Orders', value: shopOrderCount.toLocaleString(), accent: 'slate' },
      { key: 'cost', label: 'Cost of Goods', value: formatCurrency(totalCostPrice), accent: 'amber' },
      { 
        key: 'profit', 
        label: 'Net Profit', 
        value: formatCurrency(netProfit), 
        accent: netProfit >= 0 ? 'emerald' : 'rose',
        subtitle: `${profitMargin}% margin`
      }
    ];
  }, [summaryData, shopOrderCount, shopRevenue, shopOrders, totalCostPrice, netProfit]);

  // Transform shop orders into transaction-like format for TransactionHistory component
  const shopTransactions = useMemo(() => {
    return shopOrders.map(order => ({
      id: order.id,
      transaction_type: 'shop_purchase',
      amount: parseFloat(order.total_amount || 0),
      currency: order.currency || 'EUR',
      status: order.payment_status || order.status,
      description: `Order #${order.order_number} - ${order.items?.length || 0} items`,
      created_at: order.created_at,
      user_id: order.user_id,
      user_name: order.first_name && order.last_name 
        ? `${order.first_name} ${order.last_name}` 
        : order.email || 'Unknown',
      user_email: order.email,
      metadata: {
        order_number: order.order_number,
        items: order.items,
        item_count: order.item_count
      }
    }));
  }, [shopOrders]);

  return (
    <div className="min-h-screen space-y-6 bg-slate-50 p-6">
      <Card className="rounded-3xl border border-slate-200/70 bg-gradient-to-br from-cyan-50 via-white to-white shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-semibold text-slate-900">Shop Finance</h1>
              <Tag color="cyan" className="text-xs font-medium">Shop</Tag>
            </div>
            <p className="text-sm text-slate-500">Product & Merchandise Sales · {rangeLabel}</p>
          </div>
          <div className="flex flex-col gap-3">
            {/* Quick Range Buttons */}
            <div className="flex flex-wrap gap-2">
              {Object.entries(getQuickRanges()).map(([key, range]) => (
                <Button
                  key={key}
                  size="small"
                  type={activeQuickRange === key ? 'primary' : 'default'}
                  onClick={() => handleQuickRange(key)}
                  className={`rounded-lg ${activeQuickRange === key ? '' : 'border-slate-200 bg-white/70 hover:bg-slate-50'}`}
                >
                  {range.label}
                </Button>
              ))}
            </div>
            {/* Date Range Picker */}
            <Space wrap size="small" className="justify-start lg:justify-end">
              {isMobile ? (
                <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white/70 px-3 py-2 shadow-sm">
                  <input
                    type="date"
                    value={dateRange.startDate}
                    onChange={(e) => handleMobileDateChange('startDate', e.target.value)}
                    className="rounded border border-slate-200 px-2 py-1 text-xs shadow-sm focus:border-cyan-500 focus:outline-none"
                    max={dateRange.endDate}
                  />
                  <span className="text-xs text-slate-500">to</span>
                  <input
                    type="date"
                  value={dateRange.endDate}
                  onChange={(e) => handleMobileDateChange('endDate', e.target.value)}
                  className="rounded border border-slate-200 px-2 py-1 text-xs shadow-sm focus:border-cyan-500 focus:outline-none"
                  min={dateRange.startDate}
                />
              </div>
            ) : (
              <RangePicker
                size="middle"
                value={[dayjs(dateRange.startDate), dayjs(dateRange.endDate)]}
                onChange={handleDateRangeChange}
                allowClear={false}
                className="rounded-xl border border-slate-200 shadow-sm"
              />
            )}
          </Space>
        </div>
      </div>
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {headlineStats.map((stat) => {
            const accent = accentStyles[stat.accent] || accentStyles.slate;
            return (
              <div
                key={stat.key}
                className="rounded-2xl border border-slate-200/70 bg-white/80 p-4 shadow-sm backdrop-blur"
              >
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {stat.label}
                </p>
                <p className={`mt-2 text-2xl font-semibold ${accent.text}`}>
                  {stat.value}
                </p>
                {stat.subtitle && (
                  <p className="mt-1 text-xs text-slate-400">{stat.subtitle}</p>
                )}
              </div>
            );
          })}
        </div>
      </Card>

      <Card className="rounded-3xl border border-slate-200/70 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-slate-900">Shop Transactions</h3>
          <Button
            size={isMobile ? 'small' : 'middle'}
            icon={<ReloadOutlined />}
            onClick={loadShopOrders}
          >
            Refresh
          </Button>
        </div>
        <TransactionHistory
          transactions={shopTransactions}
          customerDirectory={{}}
        />
      </Card>
    </div>
  );
};

export default FinanceShop;
