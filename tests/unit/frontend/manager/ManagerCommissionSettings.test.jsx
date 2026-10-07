import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
// Page is i18n'd (react-i18next) — load the real English copy so text assertions hit real UI strings.
import '../../../setup/i18nForTests';
import ManagerCommissionSettings from '@/features/manager/pages/ManagerCommissionSettings';

vi.mock('@/features/manager/services/managerCommissionApi', () => ({
  getAllManagersWithSettings: vi.fn(),
  updateManagerSettings: vi.fn()
}));

vi.mock('@/shared/utils/formatters', () => ({
  formatCurrency: vi.fn((val) => `€${Number(val).toFixed(2)}`)
}));

// Editing moved from an inline "Edit Salary & Commission Settings" modal into the
// EnhancedManagerDetailPanel drawer (opened via "Details"). That drawer is a
// large component with its own data fetching; here we stub it and assert the
// page wires it correctly (which manager, open state, refresh on update).
const detailPanelProps = { current: null };
vi.mock('@/features/manager/components/EnhancedManagerDetailPanel', () => ({
  default: (props) => {
    detailPanelProps.current = props;
    return props.isOpen && props.manager ? (
      <div data-testid="manager-detail-panel">
        <span>Panel for {props.manager.name}</span>
        <button type="button" onClick={() => props.onUpdate()}>stub-save</button>
      </div>
    ) : null;
  }
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
    // Suffix now comes from i18n manager:detailPanel.profile.perMonth ("/month").
    expect(screen.getByText('€2000.00/month')).toBeInTheDocument(); // monthly salary
    expect(screen.getByText('€25.00/lesson')).toBeInTheDocument(); // per lesson
  });

  it('shows category rates for per_category commission', async () => {
    renderComponent();
    await waitFor(() => {
      // Labels now come from i18n manager:detailPanel.commissions.categories.*
      expect(screen.getByText('Bookings: 12%')).toBeInTheDocument();
    });
    expect(screen.getByText('Rentals: 8%')).toBeInTheDocument();
    expect(screen.getByText('Shop / Sales: 7%')).toBeInTheDocument();
    expect(screen.getByText('Membership: 5%')).toBeInTheDocument();
    // null / 0 categories are not rendered
    expect(screen.queryByText(/^Accommodation:/)).not.toBeInTheDocument();
  });

  it('Details opens the manager detail panel for that manager', async () => {
    const user = userEvent.setup();
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('manager-detail-panel')).not.toBeInTheDocument();

    const detailButtons = screen.getAllByText('Details');
    expect(detailButtons).toHaveLength(3);
    await user.click(detailButtons[1]);

    await waitFor(() => {
      expect(screen.getByTestId('manager-detail-panel')).toBeInTheDocument();
    });
    expect(screen.getByText('Panel for Jane Smith')).toBeInTheDocument();
    expect(detailPanelProps.current.manager).toEqual(expect.objectContaining({ id: 'mgr2' }));
    expect(detailPanelProps.current.manager.settings.salaryType).toBe('monthly_salary');
  });

  it('displays empty state when no managers', async () => {
    getAllManagersWithSettings.mockResolvedValue({ success: true, data: [] });
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText(/No managers found/)).toBeInTheDocument();
    });
  });

  it('reloads the manager list after the detail panel saves settings', async () => {
    const user = userEvent.setup();
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });
    expect(getAllManagersWithSettings).toHaveBeenCalledTimes(1);

    await user.click(screen.getAllByText('Details')[0]);
    await waitFor(() => {
      expect(screen.getByText('Panel for John Doe')).toBeInTheDocument();
    });

    // The panel calls onUpdate after a successful updateManagerSettings.
    await user.click(screen.getByText('stub-save'));

    await waitFor(() => {
      expect(getAllManagersWithSettings).toHaveBeenCalledTimes(2);
    });
  });

  it('has payroll button for each manager', async () => {
    renderComponent();
    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });
    // The payroll button is now icon-only inside an antd Tooltip ("View Payroll"),
    // so there is no title attribute; locate it by its bar-chart icon instead.
    const payrollIcons = screen.getAllByRole('img', { name: 'bar-chart' });
    expect(payrollIcons).toHaveLength(3);
    payrollIcons.forEach((icon) => expect(icon.closest('button')).not.toBeNull());
  });
});
