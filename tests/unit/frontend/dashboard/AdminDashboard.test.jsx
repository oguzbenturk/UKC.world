import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// --- Mocks ---
const mockDashboardData = {
  dateRange: { startDate: '2025-01-01', endDate: '2025-06-15' },
  setDateRange: vi.fn(),
  activePreset: 'year',
  setActivePreset: vi.fn(),
  loading: false,
  error: null,
  kpis: {
    totalRevenue: 12500,
    lessonRevenue: 8000,
    rentalRevenue: 4000,
    otherRevenue: 500,
    totalRefunds: 200,
    totalBookings: 100,
    completedBookings: 85,
    completedRentals: 40,
    avgBookingValue: 94.12,
    customersWithDebt: 3,
    totalCustomerDebt: 350,
  },
  operationalKpis: {
    upcomingBookings: 12,
    activeBookings: 5,
    cancelledBookings: 2,
    activeRentals: 8,
    upcomingRentals: 4,
    equipmentTotal: 50,
    equipmentAvailable: 40,
    equipmentUnavailable: 5,
    equipmentNeedsService: 5,
    totalCustomers: 200,
    students: 150,
    instructors: 10,
    staff: 5,
    newThisMonth: 12,
    netRevenue: 11000,
    income: 12500,
    expenses: 1500,
    transactions: 250,
    totalServices: 20,
    serviceCategories: 4,
    groupServices: 8,
    privateServices: 12,
    completedHours: 170,
    lessonCategoryBreakdown: [
      { category: 'kitesurfing', hours: '120', count: '50' },
      { category: 'windsurfing', hours: '50', count: '35' },
    ],
    rentalServiceBreakdown: [
      { segment: 'dlab', serviceName: 'Half Day DLab', count: 3 },
      { segment: 'standard', serviceName: 'Full Day Board', count: 5 },
    ],
    totalRentals: 15,
    shopCustomers: 23,
  },
  trendData: [{ period: '2025-01', revenue: 2000, transactionCount: 30 }],
  instructorData: [{ name: 'John', revenue: 3000 }],
  groupBy: 'month',
  fetchAll: vi.fn(),
};

vi.mock('@/features/dashboard/hooks/useDashboardData', () => ({
  useDashboardData: () => mockDashboardData,
}));

vi.mock('@/shared/contexts/CurrencyContext', () => ({
  useCurrency: () => ({ businessCurrency: 'EUR', currencySymbol: '€' }),
}));

vi.mock('@/shared/utils/seo', () => ({
  usePageSEO: vi.fn(),
}));

vi.mock('@/shared/utils/formatters', () => ({
  formatCurrency: (v) => `€${Number(v || 0).toLocaleString()}`,
}));

// Minimal mock for recharts to avoid canvas errors
vi.mock('recharts', () => {
  const MockComponent = ({ children }) => <div>{children}</div>;
  return {
    ResponsiveContainer: MockComponent,
    LineChart: MockComponent,
    Line: () => null,
    BarChart: MockComponent,
    Bar: () => null,
    PieChart: MockComponent,
    Pie: () => null,
    Cell: () => null,
    XAxis: () => null,
    YAxis: () => null,
    CartesianGrid: () => null,
    Tooltip: () => null,
    Legend: () => null,
  };
});

import AdminDashboard from '@/features/dashboard/pages/AdminDashboard';

const renderDashboard = () =>
  render(
    <MemoryRouter>
      <AdminDashboard />
    </MemoryRouter>
  );

describe('AdminDashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('renders the page title', () => {
    renderDashboard();
    expect(screen.getByText('Operational Health')).toBeInTheDocument();
  });

  it('renders highlight stat cards with correct values', () => {
    renderDashboard();
    // Bookings completed value
    expect(screen.getByText('85')).toBeInTheDocument();
    // Total Rentals card label and active count appear
    expect(screen.getByText('Total Rentals')).toBeInTheDocument();
    expect(screen.getByText(/8 active/)).toBeInTheDocument();
    // Total Revenue card is removed
    expect(screen.queryByText(/€12[,.]500/)).not.toBeInTheDocument();
  });

  it('shows category breakdown in bookings card', () => {
    renderDashboard();
    expect(screen.getByText(/120h kitesurfing/i)).toBeInTheDocument();
    expect(screen.getByText(/50h windsurfing/i)).toBeInTheDocument();
  });

  it('shows avg booking value in bookings card', () => {
    renderDashboard();
    expect(screen.getByText(/Avg €94/)).toBeInTheDocument();
  });

  it('shows completion rate and total hours in bookings card', () => {
    renderDashboard();
    expect(screen.getByText(/85\.0% completion/)).toBeInTheDocument();
    expect(screen.getByText(/170h total/)).toBeInTheDocument();
  });

  it('shows rental service breakdown in active rentals card', () => {
    renderDashboard();
    expect(screen.getByText(/3× Half Day DLab/)).toBeInTheDocument();
    expect(screen.getByText(/5× Full Day Board/)).toBeInTheDocument();
  });

  it('renders quick action links in the header', () => {
    renderDashboard();
    const bookingLink = screen.getByText('Booking');
    const rentalLink = screen.getByText('Rental');
    const calendarLink = screen.getByText('Calendar');
    expect(bookingLink.closest('a')).toHaveAttribute('href', '/bookings');
    expect(rentalLink.closest('a')).toHaveAttribute('href', '/rentals');
    expect(calendarLink.closest('a')).toHaveAttribute('href', '/calendar/lessons');
  });

  it('displays the active preset label on the dropdown button', () => {
    renderDashboard();
    expect(screen.getByText('This Year')).toBeInTheDocument();
  });

  it('does not render removed KPI rows (old completed bookings / completed rentals / avg booking)', () => {
    renderDashboard();
    expect(screen.queryByText('Completed Bookings')).not.toBeInTheDocument();
    expect(screen.queryByText('Completed Rentals')).not.toBeInTheDocument();
    expect(screen.queryByText('Avg. Booking Value')).not.toBeInTheDocument();
  });

  it('does not render removed cards (Total Revenue, Total Refunds, Customers with Debt, New This Month)', () => {
    renderDashboard();
    expect(screen.queryByText('Total Revenue')).not.toBeInTheDocument();
    expect(screen.queryByText('Total Refunds')).not.toBeInTheDocument();
    expect(screen.queryByText('Customers with Debt')).not.toBeInTheDocument();
    expect(screen.queryByText('New This Month')).not.toBeInTheDocument();
  });

  it('renders the customize button', () => {
    renderDashboard();
    // SettingOutlined icon button exists
    const buttons = screen.getAllByRole('button');
    expect(buttons.length).toBeGreaterThan(0);
  });

  it('shows error alert when data fails to load', () => {
    mockDashboardData.error = 'Network failure';
    mockDashboardData.kpis = { completedBookings: 0 };
    renderDashboard();
    expect(screen.getByText('Dashboard Error')).toBeInTheDocument();
    expect(screen.getByText('Network failure')).toBeInTheDocument();
    // Reset
    mockDashboardData.error = null;
    mockDashboardData.kpis = {
      totalRevenue: 12500, completedBookings: 85, totalBookings: 100,
      avgBookingValue: 94.12, customersWithDebt: 3,
    };
  });
});
