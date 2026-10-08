import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// Manager Home "My Earnings" card (audit 2026-10-08 #9 #10 #15): manager-only,
// currency from the API, month-to-date comparison label.
import '../../../setup/i18nForTests';

const authState = vi.hoisted(() => ({ role: 'manager' }));
const apiMock = vi.hoisted(() => ({ getManagerDashboard: vi.fn() }));

vi.mock('@/shared/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'm1', role: authState.role } }) }));
vi.mock('@/features/manager/services/managerCommissionApi', () => apiMock);
vi.mock('@/shared/utils/antdStatic', () => ({ message: { error: vi.fn(), success: vi.fn() } }));
vi.mock('@/features/dashboard/hooks/useDashboardData', () => ({
  useDashboardData: () => ({ loading: false, kpis: {}, operationalKpis: {} }),
}));
vi.mock('@/shared/contexts/CurrencyContext', () => ({
  useCurrency: () => ({ businessCurrency: 'TRY', getCurrencySymbol: (c) => (c === 'TRY' ? '₺' : '€') }),
}));
vi.mock('@/shared/utils/formatters', () => ({
  formatCurrency: (amount, currency) => `${currency} ${Number(amount).toFixed(2)}`,
}));

import ManagerHomeDashboard from '@/features/manager/pages/ManagerHomeDashboard';

const summary = (over = {}) => ({
  totalEarned: 857.81,
  pending: { count: 79, amount: 858.98 },
  paid: { count: 1, amount: 3203 },
  breakdown: { bookings: { count: 40 }, rentals: { count: 5 } },
  currency: 'EUR',
  ...over,
});

const renderPage = () => render(<MemoryRouter><ManagerHomeDashboard /></MemoryRouter>);

beforeEach(() => {
  vi.clearAllMocks();
  authState.role = 'manager';
  apiMock.getManagerDashboard.mockResolvedValue({
    success: true,
    data: {
      currentPeriod: summary(),
      previousPeriod: summary({ totalEarned: 3203.39 }),
      yearToDate: summary({ totalEarned: 8309.98, paid: { count: 3, amount: 7451 } }),
      comparison: { basis: 'month_to_date', previousEarned: 849.2, earningsChangePercent: '1.0' },
    },
  });
});

describe('ManagerHomeDashboard — My Earnings', () => {
  it('shows pending payout and amounts in the currency the API reports', async () => {
    renderPage();
    expect(await screen.findByText('EUR 858.98')).toBeInTheDocument();
    expect(screen.getByText('EUR 8309.98')).toBeInTheDocument();
    expect(screen.queryByText(/TRY 858/)).not.toBeInTheDocument();
  });

  it('compares month-to-date with the same days of last month', async () => {
    renderPage();
    expect(await screen.findByText('Same days last month: EUR 849.20')).toBeInTheDocument();
    expect(screen.getByText(/\+1\.0%/)).toBeInTheDocument();
  });

  it('admin: does not call the manager-only earnings API and shows a note', async () => {
    authState.role = 'admin';
    renderPage();
    expect(await screen.findByTestId('earnings-managers-only')).toBeInTheDocument();
    await waitFor(() => expect(apiMock.getManagerDashboard).not.toHaveBeenCalled());
    expect(screen.queryByText('Pending Payout')).not.toBeInTheDocument();
  });
});
