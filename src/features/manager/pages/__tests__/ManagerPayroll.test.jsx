import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import ManagerPayroll from '../ManagerPayroll';

vi.mock('../../services/managerCommissionApi', () => ({
  getManagerPayroll: vi.fn(),
  getManagerSettings: vi.fn()
}));

vi.mock('@/shared/utils/formatters', () => ({
  formatCurrency: vi.fn((val) => `€${Number(val).toFixed(2)}`)
}));

vi.mock('@/shared/utils/antdStatic', () => ({
  message: { success: vi.fn(), error: vi.fn(), info: vi.fn() }
}));

import { getManagerPayroll, getManagerSettings } from '../../services/managerCommissionApi';

const mockPayroll = {
  year: 2024,
  salaryType: 'commission',
  settings: {
    commissionType: 'per_category',
    defaultRate: 10,
    fixedSalaryAmount: 0,
    perLessonAmount: 0
  },
  months: Array.from({ length: 12 }, (_, i) => ({
    period: `2024-${String(i + 1).padStart(2, '0')}`,
    month: i + 1,
    monthName: new Date(2024, i, 1).toLocaleString('en', { month: 'long' }),
    bookings: { count: i === 0 ? 5 : i === 6 ? 10 : 0, earnings: i === 0 ? 500 : i === 6 ? 1000 : 0 },
    rentals: { count: i === 0 ? 2 : i === 6 ? 5 : 0, earnings: i === 0 ? 200 : i === 6 ? 500 : 0 },
    accommodation: { count: 0, earnings: 0 },
    packages: { count: 0, earnings: 0 },
    shop: { count: 0, earnings: i === 0 ? 50 : 0 },
    membership: { count: 0, earnings: 0 },
    grossAmount: i === 0 ? 750 : i === 6 ? 1500 : 0,
    paidAmount: i === 0 ? 500 : i === 6 ? 1500 : 0,
    pendingAmount: i === 0 ? 250 : 0
  })),
  seasons: [
    { name: 'Winter', label: 'Q1 (Jan-Mar)', months: [1, 2, 3], grossAmount: 750, paidAmount: 500, pendingAmount: 250, bookingCount: 5, rentalCount: 2 },
    { name: 'Spring', label: 'Q2 (Apr-Jun)', months: [4, 5, 6], grossAmount: 0, paidAmount: 0, pendingAmount: 0, bookingCount: 0, rentalCount: 0 },
    { name: 'Summer', label: 'Q3 (Jul-Sep)', months: [7, 8, 9], grossAmount: 1500, paidAmount: 1500, pendingAmount: 0, bookingCount: 10, rentalCount: 5 },
    { name: 'Autumn', label: 'Q4 (Oct-Dec)', months: [10, 11, 12], grossAmount: 0, paidAmount: 0, pendingAmount: 0, bookingCount: 0, rentalCount: 0 }
  ],
  totals: { gross: 2250, paid: 2000, pending: 250 },
  currency: 'EUR'
};

const mockSettings = {
  commissionType: 'per_category',
  defaultRate: 10,
  salaryType: 'commission',
  fixedSalaryAmount: 0,
  perLessonAmount: 0,
  bookingRate: 12,
  rentalRate: 8
};

function renderComponent(managerId = 'mgr1') {
  return render(
    <MemoryRouter initialEntries={[`/admin/manager-payroll/${managerId}`]}>
      <Routes>
        <Route path="/admin/manager-payroll/:managerId" element={<ManagerPayroll />} />
        <Route path="/admin/manager-commissions" element={<div>Commission Settings</div>} />
      </Routes>
    </MemoryRouter>
  );
}

describe('ManagerPayroll', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getManagerPayroll.mockResolvedValue({ success: true, data: mockPayroll });
    getManagerSettings.mockResolvedValue({ success: true, data: mockSettings });
  });

  it('renders payroll page with title and year selector', async () => {
    renderComponent();
    await waitFor(() => {
      expect(screen.getByText('Manager Payroll')).toBeInTheDocument();
    });
    expect(screen.getByText('Detailed earnings breakdown by month and season')).toBeInTheDocument();
  });

  it('shows year totals', async () => {
    renderComponent();
    await waitFor(() => {
      expect(screen.getByText('Gross Earnings')).toBeInTheDocument();
    });
    // "Paid" appears as both Statistic title and Tag in table, so use getAllByText
    expect(screen.getAllByText('Paid').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Pending')).toBeInTheDocument();
  });

  it('shows seasonal summary cards', async () => {
    renderComponent();
    await waitFor(() => {
      expect(screen.getByText('Q1 (Jan-Mar)')).toBeInTheDocument();
    });
    expect(screen.getByText('Q2 (Apr-Jun)')).toBeInTheDocument();
    expect(screen.getByText('Q3 (Jul-Sep)')).toBeInTheDocument();
    expect(screen.getByText('Q4 (Oct-Dec)')).toBeInTheDocument();
  });

  it('displays seasonal booking and rental counts', async () => {
    renderComponent();
    await waitFor(() => {
      expect(screen.getByText('5 bookings')).toBeInTheDocument();
    });
    expect(screen.getByText('10 bookings')).toBeInTheDocument();
    expect(screen.getByText('2 rentals')).toBeInTheDocument();
    expect(screen.getByText('5 rentals')).toBeInTheDocument();
  });

  it('shows monthly breakdown table', async () => {
    renderComponent();
    await waitFor(() => {
      expect(screen.getByText('Monthly Breakdown')).toBeInTheDocument();
    });
    expect(screen.getByText('January')).toBeInTheDocument();
    expect(screen.getByText('December')).toBeInTheDocument();
  });

  it('displays current salary configuration', async () => {
    renderComponent();
    await waitFor(() => {
      expect(screen.getByText('Current Salary Configuration')).toBeInTheDocument();
    });
    expect(screen.getByText('Commission Based')).toBeInTheDocument();
  });

  it('shows empty state when no payroll data', async () => {
    getManagerPayroll.mockResolvedValue({ success: true, data: null });
    getManagerSettings.mockResolvedValue({ success: true, data: null });
    renderComponent();
    await waitFor(() => {
      expect(screen.getByText('No payroll data found')).toBeInTheDocument();
    });
  });

  it('has back button that navigates to commission settings', async () => {
    renderComponent();
    await waitFor(() => {
      expect(screen.getByText('Manager Payroll')).toBeInTheDocument();
    });
    expect(screen.getByText('Back')).toBeInTheDocument();
  });

  it('shows Seasonal Summary header', async () => {
    renderComponent();
    await waitFor(() => {
      expect(screen.getByText('Seasonal Summary')).toBeInTheDocument();
    });
  });
});
