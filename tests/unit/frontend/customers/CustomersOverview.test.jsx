import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Staff Customers page (/customers).
// API mocked per backend/services/customerInsightsService.js (GET /users/customers/segments)
// and GET /users/customers/list?insights=1&withTotal=1.
import '../../../setup/i18nForTests';

const apiMock = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
const chatMock = vi.hoisted(() => ({ messageStudent: vi.fn(), openingFor: null, unread: 0, openInbox: vi.fn() }));

vi.mock('@/shared/services/apiClient', () => ({ default: apiMock }));
vi.mock('@/shared/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'mgr-1', role: 'manager' } }) }));
vi.mock('@/shared/contexts/CurrencyContext', () => ({
  useCurrency: () => ({
    formatCurrency: (amount) => `€${Number(amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
  }),
}));
vi.mock('@/features/instructor/dashboard/useDashboard', () => ({ useChatBridge: () => chatMock }));
vi.mock('@/features/bookings/components/contexts/CalendarContext', () => ({ CalendarProvider: ({ children }) => children }));
vi.mock('@/features/bookings/components/components/BookingDrawer', () => ({
  default: ({ isOpen, prefilledCustomer }) => (isOpen ? <div data-testid="booking-drawer">{prefilledCustomer?.name}</div> : null),
}));
vi.mock('@/shared/components/ui/UserForm', () => ({ default: () => <div data-testid="user-form" /> }));
vi.mock('@/features/customers/components/CustomerDeleteModal', () => ({ default: () => <div data-testid="delete-modal" /> }));
vi.mock('@/features/customers/components/EnhancedCustomerDetailModal', () => ({
  default: ({ isOpen, customer }) => (isOpen ? <div data-testid="customer-drawer">{customer?.name}</div> : null),
}));

import Customers from '@/features/customers/pages/Customers';

const SEGMENTS = {
  asOf: '2026-10-08',
  currency: 'EUR',
  total: 139,
  roles: { students: 139, trusted: 0, outsiders: 0 },
  segments: { lessons: 120, shop: 23, members: 12, membersActive: 7, rentals: 40, stays: 18 },
  active30: 96,
  inactive30: 43,
  noActivity: 5,
  owes: { count: 9, total: -2315 },
  credit: { count: 14, total: 1800 },
  newThisMonth: 6,
  lastCreatedAt: '2026-10-07T10:00:00Z',
};

const today = new Date().toISOString().slice(0, 10);
const customer = (id, overrides = {}) => ({
  id: `c-${id}`,
  name: `Customer ${id}`,
  email: `c${id}@example.com`,
  phone: null,
  role: 'student',
  balance: 0,
  segments: ['lessons'],
  last_activity_at: today,
  lifetime_spend: 100,
  profile_image_url: null,
  ...overrides,
});

const PAGE1 = {
  items: [
    customer(1, { name: 'Freya Hargrove', balance: -500, segments: ['lessons', 'shop'], lifetime_spend: 2400 }),
    customer(2, { name: 'Gus Credit', balance: 120, segments: ['member_active', 'stays'], lifetime_spend: 900 }),
  ],
  nextCursor: 'cursor-2',
  total: 139,
};
const PAGE2 = { items: [customer(3, { name: 'Hal None', segments: [], last_activity_at: null, lifetime_spend: 0 })], nextCursor: null };

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

const renderPage = (path = '/customers') => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes><Route path="*" element={<><Customers /><LocationProbe /></>} /></Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
};

const listCalls = () => apiMock.get.mock.calls.filter(([url]) => url === '/users/customers/list').map(([, opts]) => opts.params);

beforeEach(() => {
  vi.clearAllMocks();
  setDesktop(true);
  apiMock.get.mockImplementation((url, opts) => {
    if (url === '/users/customers/segments') return Promise.resolve({ data: SEGMENTS });
    if (url === '/users/customers/list') return Promise.resolve({ data: opts?.params?.cursor ? PAGE2 : PAGE1 });
    return Promise.resolve({ data: [] });
  });
});

describe('Customers overview page', () => {
  it('desktop: real totals, segment tiles, uses badges and balance labels', async () => {
    renderPage();
    expect(await screen.findByTestId('customer-tiles')).toBeInTheDocument();
    expect(screen.getByTestId('customers-summary')).toHaveTextContent('139 customers · 96 active in the last 30 days · 139 students, 0 trusted, 0 outsiders');
    expect(screen.getByTestId('tile-shop')).toHaveTextContent('23');
    expect(screen.getByTestId('tile-members')).toHaveTextContent('7 active now');
    expect(screen.getByTestId('tile-owes')).toHaveTextContent('€2,315.00');

    const list = await screen.findByTestId('customers-list');
    const freya = within(list).getByText('Freya Hargrove').closest('tr');
    expect(within(freya).getByText('Lessons')).toBeInTheDocument();
    expect(within(freya).getByText('Shop')).toBeInTheDocument();
    expect(within(freya).getByText('owes')).toBeInTheDocument();
    expect(within(freya).getByRole('button', { name: 'Collect' })).toBeInTheDocument();
    const gus = within(list).getByText('Gus Credit').closest('tr');
    expect(within(gus).getByText('credit')).toBeInTheDocument();
    expect(within(gus).getByText('Member')).toBeInTheDocument();
    expect(screen.getByTestId('customers-showing')).toHaveTextContent('Showing 2 of 139');

    expect(listCalls()[0]).toMatchObject({ insights: 1, withTotal: 1, sortBy: 'lifetime_spend', sortDir: 'desc' });
  });

  it('Load more appends the next keyset page', async () => {
    renderPage();
    await screen.findByTestId('customers-list');
    fireEvent.click(screen.getByRole('button', { name: 'Load more' }));
    expect(await screen.findByText('Hal None')).toBeInTheDocument();
    expect(screen.getByText('No purchases yet')).toBeInTheDocument();
    expect(listCalls().at(-1)).toMatchObject({ cursor: 'cursor-2' });
    expect(screen.queryByRole('button', { name: 'Load more' })).not.toBeInTheDocument();
  });

  it('segment chips and tiles filter on the server and sync to the URL', async () => {
    renderPage();
    await screen.findByTestId('customers-list');
    const chips = screen.getByRole('group', { name: 'Filter customers' });
    expect(within(chips).getByRole('button', { name: /Shop/ })).toHaveTextContent('23');
    fireEvent.click(within(chips).getByRole('button', { name: /Shop/ }));
    await waitFor(() => expect(listCalls().at(-1)).toMatchObject({ segment: 'shop' }));
    expect(lastSearch).toBe('?segment=shop');

    fireEvent.click(screen.getByTestId('tile-active'));
    await waitFor(() => expect(listCalls().at(-1)).toMatchObject({ segment: 'shop', activity: 'active' }));
  });

  it('a deep link opens pre-filtered', async () => {
    renderPage('/customers?segment=owes&sort=owes');
    await screen.findByTestId('customers-list');
    expect(listCalls()[0]).toMatchObject({ segment: 'owes', sortBy: 'balance', sortDir: 'asc' });
    expect(screen.getByTestId('tile-owes')).toHaveAttribute('aria-pressed', 'true');
  });

  it('quick actions: message, book (prefilled) and collect (opens the profile)', async () => {
    renderPage();
    const list = await screen.findByTestId('customers-list');
    fireEvent.click(within(list).getByRole('button', { name: 'Message Freya Hargrove' }));
    expect(chatMock.messageStudent).toHaveBeenCalledWith('c-1');

    const gus = within(list).getByText('Gus Credit').closest('tr');
    fireEvent.click(within(gus).getByRole('button', { name: 'Book' }));
    expect(await screen.findByTestId('booking-drawer')).toHaveTextContent('Gus Credit');

    const freya = within(list).getByText('Freya Hargrove').closest('tr');
    fireEvent.click(within(freya).getByRole('button', { name: 'Collect' }));
    expect(await screen.findByTestId('customer-drawer')).toHaveTextContent('Freya Hargrove');
  });

  it('mobile: cards with last activity and spend', async () => {
    setDesktop(false);
    renderPage();
    const list = await screen.findByTestId('customers-list');
    expect(screen.getByTestId('customers-page')).toHaveAttribute('data-layout', 'mobile');
    expect(list.tagName).toBe('UL');
    expect(within(list).getByText(/today · €2,400.00 spent/)).toBeInTheDocument();
  });

  it('shows an error state with retry when the list fails', async () => {
    apiMock.get.mockImplementation((url) => (url === '/users/customers/segments'
      ? Promise.resolve({ data: SEGMENTS })
      : Promise.reject(new Error('boom'))));
    renderPage();
    expect(await screen.findByText('Customers could not load')).toBeInTheDocument();
  });
});
