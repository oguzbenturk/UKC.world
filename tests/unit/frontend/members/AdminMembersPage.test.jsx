import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Staff Members page (/calendars/members, /memberships/active).
// API mocked per backend/services/membershipStatsService.js (GET /member-offerings/admin/stats)
// and GET /member-offerings/admin/purchases (effective computed_status).
import '../../../setup/i18nForTests';

const apiMock = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), put: vi.fn() }));
const messageMock = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() }));
const drawerSpy = vi.hoisted(() => vi.fn());

vi.mock('@/shared/services/apiClient', () => ({ default: apiMock }));
vi.mock('antd', async (importOriginal) => ({ ...(await importOriginal()), message: messageMock }));
vi.mock('@/shared/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'mgr-1', role: 'manager' } }) }));
vi.mock('@/shared/contexts/CurrencyContext', () => ({
  useCurrency: () => ({ formatCurrency: (n) => `€${Number(n).toFixed(2)}` }),
}));
vi.mock('@/features/members/components/NewMemberDrawer', () => ({
  default: (props) => {
    drawerSpy(props);
    return props.isOpen ? <div data-testid="member-drawer">{JSON.stringify(props.initial)}</div> : null;
  },
}));
vi.mock('@/features/customers/components/ApplyDiscountModal', () => ({ default: () => null }));
vi.mock('@/features/customers/components/EnhancedCustomerDetailModal', () => ({
  default: ({ isOpen, customer }) => (isOpen ? <div data-testid="customer-drawer">{customer?.name}</div> : null),
}));

import AdminMembersPage from '@/features/members/pages/AdminMembersPage';

const DAY = 24 * 3600 * 1000;
const at = (days) => new Date(Date.now() + days * DAY).toISOString();

const purchase = (id, overrides = {}) => ({
  id,
  user_id: `u-${id}`,
  user_name: `Person ${id}`,
  user_email: `p${id}@example.com`,
  offering_id: 10,
  offering_name: 'Storage week',
  offering_family: 'storage',
  offering_duration: 'week',
  offering_price: 50,
  purchased_at: at(-4),
  expires_at: at(30),
  status: 'active',
  computed_status: 'active',
  storage_unit: null,
  ...overrides,
});

const PURCHASES = [
  purchase(1, { user_name: 'Ada Ending', expires_at: at(2), storage_unit: 4 }),
  purchase(2, { user_name: 'Bea Expired', offering_family: 'beach', offering_duration: 'day', offering_name: 'Beach day', expires_at: at(-5), computed_status: 'expired' }),
  purchase(3, { user_name: 'Cem Active', offering_family: 'beach', offering_duration: 'season', offering_name: 'Beach season', expires_at: at(90) }),
  purchase(4, { user_name: 'Dua Later', purchased_at: at(3), expires_at: at(10), storage_unit: 6 }),
];

const STATS = {
  currency: 'EUR',
  total: 4,
  active: 3,
  activePeople: 3,
  expiring7: 1,
  expiring30: 2,
  expired: 1,
  expiredRecent: 1,
  pending: 0,
  cancelled: 0,
  upcoming: 1,
  storage: {
    memberships: 2, active: 2, inUse: 2, capacity: 8,
    boxes: [
      { unit: 4, state: 'ending', holders: 1, holder: 'Ada Ending', endsAt: at(2) },
      { unit: 6, state: 'starting', holders: 1, holder: 'Dua Later', endsAt: at(10) },
    ],
  },
  beach: { memberships: 2, active: 1 },
  newThisMonth: 2,
  soldThisMonth: 100,
  soldThisYear: 900,
  types: [],
  renewalsDue: [{ id: 1, userId: 'u-1', userName: 'Ada Ending', offeringId: 10, offeringName: 'Storage week', family: 'storage', storageUnit: 4, expiresAt: at(2) }],
};

const setDesktop = (isDesktop) => {
  window.matchMedia = vi.fn().mockImplementation((query) => ({
    matches: query.includes('min-width: 1024px') ? isDesktop : false,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
};

let lastSearch = '';
function LocationProbe() {
  lastSearch = useLocation().search;
  return null;
}

const renderPage = ({ path = '/calendars/members', element = <AdminMembersPage /> } = {}) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes><Route path="*" element={<>{element}<LocationProbe /></>} /></Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
};

const NAME = /^(Ada|Bea|Cem|Dua) /;
const rowNames = () => within(screen.getByTestId('members-list'))
  .getAllByRole('button')
  .map((b) => b.textContent)
  .filter((text) => NAME.test(text));

beforeEach(() => {
  vi.clearAllMocks();
  setDesktop(true);
  apiMock.get.mockImplementation((url) => {
    if (url === '/member-offerings/admin/stats') return Promise.resolve({ data: STATS });
    if (url === '/member-offerings/admin/purchases') return Promise.resolve({ data: PURCHASES });
    return Promise.resolve({ data: [] });
  });
  apiMock.post.mockResolvedValue({ data: { requested: 1, sent: 1, skipped: 0 } });
});

describe('AdminMembersPage', () => {
  it('desktop: KPI tiles, chips with counts, attention order, box map and renewals', async () => {
    renderPage();
    expect(await screen.findByTestId('members-kpis')).toBeInTheDocument();
    expect(screen.getByTestId('members-page')).toHaveAttribute('data-layout', 'desktop');
    expect(screen.getByTestId('members-summary')).toHaveTextContent('4 memberships · 3 active · 3 people');
    expect(screen.getByTestId('kpi-storage')).toHaveTextContent('2 / 8');
    expect(screen.getByTestId('kpi-storage')).toHaveTextContent('6 boxes free');
    expect(screen.getByTestId('kpi-new')).toHaveTextContent('€100.00 this month');

    const chips = screen.getByRole('group', { name: 'Filter by status' });
    expect(within(chips).getByRole('button', { name: /Expired/ })).toHaveTextContent('1');
    expect(within(chips).getByRole('button', { name: /Ending this week/ })).toHaveTextContent('1');

    await screen.findByTestId('members-list');
    // Ending soon → recently expired → starts soon → the rest.
    expect(rowNames()).toEqual(['Ada Ending', 'Bea Expired', 'Dua Later', 'Cem Active']);
    // Status is text + icon, never colour alone.
    expect(screen.getByText('2 days left')).toBeInTheDocument();
    expect(screen.getByText('Expired 5 days ago')).toBeInTheDocument();
    expect(screen.getByText('Starts in 3 days')).toBeInTheDocument();
    expect(screen.getByText('Win back')).toBeInTheDocument();

    const map = screen.getByTestId('storage-box-map');
    expect(within(map).getAllByRole('listitem').length).toBeGreaterThanOrEqual(8);
    expect(within(map).getByRole('button', { name: /Box 4: Ends this week · Ada Ending/ })).toBeInTheDocument();
    expect(within(map).getByRole('button', { name: 'Box 8: free' })).toBeDisabled();
    expect(within(screen.getByTestId('renewals-due')).getByText('Ada Ending')).toBeInTheDocument();
    expect(screen.getByTestId('members-showing')).toHaveTextContent('Showing 4 of 4');
  });

  it('chips filter the list and sync to the URL; /memberships/active opens pre-filtered', async () => {
    renderPage();
    await screen.findByTestId('members-list');
    fireEvent.click(within(screen.getByRole('group', { name: 'Filter by status' })).getByRole('button', { name: /Expired/ }));
    expect(rowNames()).toEqual(['Bea Expired']);
    expect(lastSearch).toBe('?view=expired');

    fireEvent.change(screen.getByLabelText('Search members'), { target: { value: '#4' } });
    expect(screen.getByText('No memberships match')).toBeInTheDocument();
  });

  it('defaultStatus=active hides expired memberships', async () => {
    renderPage({ path: '/memberships/active', element: <AdminMembersPage defaultStatus="active" /> });
    await screen.findByTestId('members-list');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Active memberships');
    expect(rowNames()).toEqual(['Ada Ending', 'Dua Later', 'Cem Active']);
  });

  it('Renew opens the sell drawer prefilled from the day after the current end', async () => {
    renderPage();
    await screen.findByTestId('members-list');
    const row = within(screen.getByTestId('members-list')).getByText('Ada Ending').closest('tr');
    fireEvent.click(within(row).getByRole('button', { name: 'Renew' }));
    const initial = JSON.parse(screen.getByTestId('member-drawer').textContent);
    expect(initial).toEqual({ userId: 'u-1', offeringId: 10, startDate: PURCHASES[0].expires_at.slice(0, 10) });
  });

  it('bulk selection sends renewal reminders through the remind endpoint', async () => {
    renderPage();
    await screen.findByTestId('members-list');
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Ada Ending' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Bea Expired' }));
    expect(screen.getByText('2 selected')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Send renewal reminder/ }));
    await waitFor(() => expect(apiMock.post).toHaveBeenCalledWith('/member-offerings/admin/purchases/remind', { purchaseIds: [1, 2] }));
    await waitFor(() => expect(messageMock.success).toHaveBeenCalledWith('Reminder sent to 1 member'));
  });

  it('mobile: cards instead of a table, still with status text', async () => {
    setDesktop(false);
    renderPage();
    const list = await screen.findByTestId('members-list');
    expect(screen.getByTestId('members-page')).toHaveAttribute('data-layout', 'mobile');
    expect(list.tagName).toBe('UL');
    expect(within(list).getByText('2 days left')).toBeInTheDocument();
  });

  it('shows an error state with retry when purchases fail', async () => {
    apiMock.get.mockImplementation((url) => (url === '/member-offerings/admin/stats'
      ? Promise.resolve({ data: STATS })
      : Promise.reject(new Error('boom'))));
    renderPage();
    expect(await screen.findByText('Memberships could not load')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });
});
