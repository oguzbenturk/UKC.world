import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import ManagerCommissionSettings from '@/features/manager/pages/ManagerCommissionSettings';

vi.mock('@/features/manager/services/managerCommissionApi', () => ({
  getAllManagersWithSettings: vi.fn(),
  updateManagerSettings: vi.fn()
}));

vi.mock('@/shared/utils/formatters', () => ({
  formatCurrency: vi.fn((val) => `€${Number(val).toFixed(2)}`)
}));

vi.mock('@/shared/utils/antdStatic', () => ({
  message: { success: vi.fn(), error: vi.fn(), info: vi.fn() }
}));

import { getAllManagersWithSettings, updateManagerSettings } from '@/features/manager/services/managerCommissionApi';
import { message } from '@/shared/utils/antdStatic';

const mockManagers = [
  {
    id: 'mgr1',
    name: 'John Doe',
    email: 'john@test.com',
    profileImage: null,
    pendingCommission: 250,
    paidCommission: 1500,
    settings: {
      salaryType: 'commission',
      commissionType: 'per_category',
      defaultRate: 10,
      bookingRate: 12,
      rentalRate: 8,
      accommodationRate: null,
      packageRate: null,
      shopRate: 7,
      membershipRate: 5
    }
  },
  {
    id: 'mgr2',
    name: 'Jane Smith',
    email: 'jane@test.com',
    profileImage: null,
    pendingCommission: 0,
    paidCommission: 3000,
    settings: {
      salaryType: 'monthly_salary',
      commissionType: 'flat',
      defaultRate: 0,
      fixedSalaryAmount: 2000,
      perLessonAmount: 0
    }
  },
  {
    id: 'mgr3',
    name: 'Bob Teacher',
    email: 'bob@test.com',
    profileImage: null,
    pendingCommission: 100,
    paidCommission: 500,
    settings: {
      salaryType: 'fixed_per_lesson',
      commissionType: 'flat',
      defaultRate: 0,
      fixedSalaryAmount: 0,
      perLessonAmount: 25
    }
  }
];

function renderComponent() {
  return render(
    <MemoryRouter>
      <ManagerCommissionSettings />
    </MemoryRouter>
  );
}

describe('ManagerCommissionSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getAllManagersWithSettings.mockResolvedValue({ success: true, data: mockManagers });
  });

  it('renders manager list with salary type tags', async () => {
    renderComponent();
    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });
    expect(screen.getByText('Jane Smith')).toBeInTheDocument();
    expect(screen.getByText('Bob Teacher')).toBeInTheDocument();
    // Salary type tags
    expect(screen.getByText('Commission')).toBeInTheDocument();
    expect(screen.getByText('Monthly Salary')).toBeInTheDocument();
    expect(screen.getByText('Per Lesson')).toBeInTheDocument();
  });

  it('shows rate/amount for each salary type', async () => {
    renderComponent();
    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });
    expect(screen.getByText('10%')).toBeInTheDocument(); // commission default rate
    expect(screen.getByText('€2000.00/mo')).toBeInTheDocument(); // monthly salary
    expect(screen.getByText('€25.00/lesson')).toBeInTheDocument(); // per lesson
  });

  it('shows category rates for per_category commission', async () => {
    renderComponent();
    await waitFor(() => {
      expect(screen.getByText('Booking: 12%')).toBeInTheDocument();
    });
    expect(screen.getByText('Rental: 8%')).toBeInTheDocument();
    expect(screen.getByText('Shop: 7%')).toBeInTheDocument();
    expect(screen.getByText('Membership: 5%')).toBeInTheDocument();
  });

  it('opens edit modal with salary type selector', async () => {
    const user = userEvent.setup();
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });

    // Click first Edit button
    const editButtons = screen.getAllByText('Details');
    await user.click(editButtons[0]);

    await waitFor(() => {
      expect(screen.getByText('Edit Salary & Commission Settings')).toBeInTheDocument();
    });
    // Salary type radio buttons
    expect(screen.getByText('Commission %')).toBeInTheDocument();
    expect(screen.getByText('Per Lesson €')).toBeInTheDocument();
    // Monthly Salary appears both in table tag and modal radio, so use getAllByText
    expect(screen.getAllByText('Monthly Salary').length).toBeGreaterThanOrEqual(2);
  });

  it('displays empty state when no managers', async () => {
    getAllManagersWithSettings.mockResolvedValue({ success: true, data: [] });
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText(/No managers found/)).toBeInTheDocument();
    });
  });

  it('saves settings successfully', async () => {
    updateManagerSettings.mockResolvedValue({ success: true });
    const user = userEvent.setup();
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });

    const editButtons = screen.getAllByText('Details');
    await user.click(editButtons[0]);

    await waitFor(() => {
      expect(screen.getByText('Edit Salary & Commission Settings')).toBeInTheDocument();
    });

    // Click Save
    await user.click(screen.getByText('Save Settings'));

    await waitFor(() => {
      expect(updateManagerSettings).toHaveBeenCalledWith('mgr1', expect.objectContaining({
        salaryType: 'commission',
        commissionType: 'per_category'
      }));
    });

    expect(message.success).toHaveBeenCalledWith('Commission settings saved successfully');
  });

  it('has payroll button for each manager', async () => {
    renderComponent();
    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });
    const payrollButtons = screen.getAllByTitle('View Payroll');
    expect(payrollButtons).toHaveLength(3);
  });
});
