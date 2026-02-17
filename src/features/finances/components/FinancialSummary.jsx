import React, { useState, useMemo } from 'react';
import { formatCurrency } from '@/shared/utils/formatters';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell
} from 'recharts';

function FinancialSummary({ data, startDate, endDate }) {
  const [timeframe, setTimeframe] = useState('month'); // month, quarter, year
  const [comparisonMode, setComparisonMode] = useState('previous'); // previous, year

  const {
    summary,
    trends,
    outstanding,
    expenses,
    revenueByCategory
  } = useMemo(() => {
    // Use data directly from the financials summary API endpoint
    if (!data || !data.financials) {
      return {
        summary: {
          totalRevenue: 0,
          lessonRevenue: 0,
          rentalRevenue: 0,
          packageRevenue: 0
        },
        trends: [],
        outstanding: {},
        expenses: {},
        revenueByCategory: []
      };
    }

    // Format the data from the API to match our component's data structure
    const summaryData = {
      totalRevenue: data.financials.totalRevenue,
      lessonRevenue: data.financials.servicePayments || 0,
      rentalRevenue: data.financials.rentalPayments || 0,
      packageRevenue: 0 // The API doesn't separate package payments, so we'll set to 0 for now
    };
    
    // Create trend data from recent transactions
    const trendData = data.transactions?.recent?.map(transaction => {
      const date = new Date(transaction.transaction_date);
      return {
        month: date.toLocaleDateString('default', { month: 'short' }),
        date: date.toLocaleDateString(),
        revenue: transaction.type === 'payment' || transaction.type === 'service_payment' || transaction.type === 'rental_payment' 
          ? parseFloat(transaction.amount) 
          : 0,
        expenses: transaction.type === 'expense' || transaction.type === 'salary' 
          ? parseFloat(transaction.amount) 
          : 0
      };
    }) || [];
    
    // Outstanding payments (this would need to be calculated on the backend)
    const outstandingData = {
      lessons: 0,
      rentals: 0,
      packages: 0
    };
    
    // Expense breakdown
    const expenseData = {
      salary: data.financials.payrollPayments || 0,
      operations: data.financials.totalExpenses - (data.financials.payrollPayments || 0)
    };
    
    // Revenue by category
    const categoryData = [
      { name: 'Lessons', value: data.financials.servicePayments || 0 },
      { name: 'Rentals', value: data.financials.rentalPayments || 0 },
      { name: 'Deposits', value: data.financials.deposits || 0 }
    ];
    
    return {
      summary: summaryData,
      trends: trendData,
      outstanding: outstandingData,
      expenses: expenseData,
      revenueByCategory: categoryData
    };
  }, [data, startDate, endDate]);

  // Colors for charts
  const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042'];
  
  return (
    <div className="space-y-8">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-lg shadow">
          <h3 className="text-sm font-medium text-gray-500">Total Revenue</h3>
          <p className="mt-2 text-2xl font-semibold text-gray-900">
            {formatCurrency(summary.totalRevenue)}
          </p>
        </div>
        <div className="bg-white p-4 rounded-lg shadow">
          <h3 className="text-sm font-medium text-gray-500">Lesson Revenue</h3>
          <p className="mt-2 text-2xl font-semibold text-blue-600">
            {formatCurrency(summary.lessonRevenue)}
          </p>
        </div>
        <div className="bg-white p-4 rounded-lg shadow">
          <h3 className="text-sm font-medium text-gray-500">Rental Revenue</h3>
          <p className="mt-2 text-2xl font-semibold text-green-600">
            {formatCurrency(summary.rentalRevenue)}
          </p>
        </div>
        <div className="bg-white p-4 rounded-lg shadow">
          <h3 className="text-sm font-medium text-gray-500">Package Revenue</h3>
          <p className="mt-2 text-2xl font-semibold text-purple-600">
            {formatCurrency(summary.packageRevenue)}
          </p>
        </div>
      </div>

      {/* Revenue Trends */}
      <div className="bg-white p-6 rounded-lg shadow">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Revenue Trends</h3>
        <LineChart width={800} height={300} data={trends}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="month" />
          <YAxis />
          <Tooltip formatter={(value) => formatCurrency(value)} />
          <Legend />
          <Line type="monotone" dataKey="revenue" stroke="#0088FE" name="Revenue" />
          <Line type="monotone" dataKey="expenses" stroke="#FF8042" name="Expenses" />
        </LineChart>
      </div>

      {/* Revenue by Category */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Revenue by Category</h3>
          <PieChart width={400} height={300}>
            <Pie
              data={revenueByCategory}
              cx={200}
              cy={150}
              labelLine={false}
              outerRadius={80}
              fill="#8884d8"
              dataKey="value"
              label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
            >
              {revenueByCategory.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip formatter={(value) => formatCurrency(value)} />
          </PieChart>
        </div>

        {/* Outstanding Payments */}
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Outstanding Payments</h3>
          <div className="space-y-4">
            {Object.entries(outstanding).map(([category, amount]) => (
              <div key={category} className="flex justify-between items-center">
                <span className="text-gray-600 capitalize">{category}</span>
                <span className="text-red-600 font-medium">{formatCurrency(amount)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Expense Breakdown */}
      <div className="bg-white p-6 rounded-lg shadow">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Expense Breakdown</h3>
        <BarChart width={800} height={300} data={Object.entries(expenses).map(([category, amount]) => ({
          category,
          amount
        }))}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="category" />
          <YAxis />
          <Tooltip formatter={(value) => formatCurrency(value)} />
          <Bar dataKey="amount" fill="#FF8042" />
        </BarChart>
      </div>
    </div>
  );
}

export default FinancialSummary;
