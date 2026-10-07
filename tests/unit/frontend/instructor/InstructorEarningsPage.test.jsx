import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, fireEvent, waitFor, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Instructor earnings page (/finance for role instructor). The API is mocked per
// the contract in docs/specs/instructor-earnings-payouts.md §2.
import '../../../setup/i18nForTests';

const apiMock = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), delete: vi.fn() }));
const realTime = vi.hoisted(() => ({ on: vi.fn(), off: vi.fn() }));
const messageMock = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));

vi.mock('@/shared/services/apiClient', () => ({ default: apiMock }));
vi.mock('@/shared/services/realTimeService', () => ({ default: realTime, realTimeService: realTime }));
vi.mock('@/shared/utils/antdStatic', () => ({ message: messageMock }));
vi.mock('@/shared/contexts/CurrencyContext', () => ({
  useCurrency: () => ({
    formatCurrency: (amount) => `€${Number(amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
  }),
}));

import InstructorEarningsPage from '@/features/instructor/earnings/InstructorEarningsPage';

const SUMMARY_URL = '/instructors/me/earnings-summary';
const ACTIVITY_URL = '/instructors/me/earnings-activity';
const REQUESTS_URL = '/instructors/me/payout-requests';

const makeSummary = (overrides = {}) => ({
  period: { key: 'month', start: '2026-10-01', end: '2026-10-31', label: 'October 2026' },
  currency: 'EUR',
  earned: 428.57,
  previousEarned: 396.82,
  changePct: 8,
  lessons: 38,
  hours: 57.5,
  avgPerLesson: 11.28,
  byLessonType: [
    { key: 'private', label: 'Private kite', commissionType: 'fixed', rate: 25, hours: 11, lessons: 8, amount: 275 },
    { key: 'semi', label: 'Semi-private', commissionType: 'percentage', rate: 40, hours: 14, lessons: 9, amount: 104 },
    { key: 'supervision', label: 'Supervision', commissionType: 'fixed', rate: 20, hours: 4.5, lessons: 3, amount: 90 },
  ],
  deductions: 40.43,
  weekly: Array.from({ length: 12 }, (_, i) => ({ weekStart: `2026-07-${String(i + 1).padStart(2, '0')}`, total: 50 + i * 10 })),
  monthly: [
    { month: '2026-05', total: 900 }, { month: '2026-06', total: 1100 }, { month: '2026-07', total: 1180 },
    { month: '2026-08', total: 2215 }, { month: '2026-09', total: 2200 }, { month: '2026-10', total: 428.57 },
  ],
  balances: { totalEarned: 6023.77, paidOutNet: 5590, paidOutGross: 5630.43, deductionsTotal: 40.43, available: 433.77 },
  threshold: { amount: 200, meets: true, shortfall: 0 },
  lastPayout: { date: '2026-09-30', amount: 1250, method: 'bank_transfer', reference: 'TR-4821' },
  pendingRequest: null,
  updatedAt: new Date().toISOString(),
  ...overrides,
});

const ACTIVITY = {
  items: [
    { kind: 'lesson', id: 'b1', date: '2026-10-07', startHour: '10:30', student: 'Hazal Tekinalp', groupSize: 1, lessonType: 'Private kite', hours: 2, commissionType: 'fixed', rate: 25, amount: 50, status: 'pending' },
    { kind: 'lesson', id: 'b2', date: '2026-10-07', startHour: 8.5, student: 'Nina Brunner', groupSize: 2, lessonType: 'Semi-private', hours: 1.5, commissionType: 'percentage', rate: 40, amount: 39, status: 'paid' },
    { kind: 'payout', id: 'p1', date: '2026-09-30', amount: 1250, method: 'bank_transfer', reference: 'TR-4821', status: 'paid' },
  ],
  total: 3,
};

let summaryResponder;
let activityResponder;

const setViewport = (kind) => {
  window.matchMedia = vi.fn().mockImplementation((query) => ({
    matches: kind === 'desktop' && query === '(min-width: 1024px)',
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
};

const summaryCalls = () => apiMock.get.mock.calls.filter(([url]) => url === SUMMARY_URL);

const renderPage = ({ route = '/finance' } = {}) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[route]}>
        <InstructorEarningsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
};

const heroAmount = () => screen.findByTestId('earnings-hero-amount');

describe('InstructorEarningsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setViewport('mobile');
    summaryResponder = () => Promise.resolve({ data: makeSummary() });
    activityResponder = () => Promise.resolve({ data: ACTIVITY });
    apiMock.get.mockImplementation((url, config) => {
      if (url === SUMMARY_URL) return summaryResponder(config);
      if (url === ACTIVITY_URL) return activityResponder(config);
      return Promise.reject(new Error(`unexpected GET ${url}`));
    });
    apiMock.post.mockResolvedValue({ data: { id: 'req-new', status: 'pending' } });
    apiMock.delete.mockResolvedValue({ data: { id: 'req-1', status: 'cancelled' } });
  });

  it('renders the hero figure, change chip, trend and balances', async () => {
    renderPage();
    const hero = await heroAmount();
    expect(hero).toHaveTextContent('€428.57');
    expect(within(hero).getByText('.57')).toBeInTheDocument();
    expect(screen.getByText('Earned in October 2026')).toBeInTheDocument();
    expect(screen.getByTestId('earnings-change-chip')).toHaveTextContent('+8% vs last month');
    expect(screen.getByRole('img', { name: /Weekly earnings over the last 12 weeks/ })).toBeInTheDocument();
    expect(screen.getByText('Ready for payout')).toBeInTheDocument();
    expect(screen.getAllByText('€433.77').length).toBeGreaterThan(0);
    expect(screen.getByText('Paid out (all time)')).toBeInTheDocument();
    expect(screen.getByText('€5,590.00')).toBeInTheDocument();
    // Net paid out with gross as secondary.
    expect(screen.getByText('€5,630.43 gross before deductions')).toBeInTheDocument();
    // Breakdown + bars.
    expect(screen.getByText('How is this calculated?')).toBeInTheDocument();
    expect(screen.getByText('Private kite (€25.00/h · 11 h)')).toBeInTheDocument();
    expect(screen.getByText('Semi-private (40% · 14 h)')).toBeInTheDocument();
    expect(screen.getByText('−€40.43')).toBeInTheDocument();
    expect(screen.getByText('Last payout · Sep 30')).toBeInTheDocument();
    expect(summaryCalls()[0][1]).toEqual({ params: { period: 'month' } });
  });

  it('refetches the summary and activity when the period changes', async () => {
    renderPage();
    await heroAmount();
    summaryResponder = () => Promise.resolve({
      data: makeSummary({ period: { key: 'week', start: '2026-10-05', end: '2026-10-11' }, earned: 89, changePct: -12 }),
    });
    fireEvent.click(screen.getByRole('button', { name: 'Week' }));
    expect(screen.getByRole('button', { name: 'Week' })).toHaveAttribute('aria-pressed', 'true');
    await waitFor(() => expect(summaryCalls().some(([, cfg]) => cfg.params.period === 'week')).toBe(true));
    await waitFor(() => expect(screen.getByTestId('earnings-hero-amount')).toHaveTextContent('€89.00'));
    expect(screen.getByRole('region', { name: 'Earned this week' })).toBeInTheDocument();
    expect(screen.getByTestId('earnings-change-chip')).toHaveTextContent('-12% vs last week');
    expect(apiMock.get.mock.calls.some(([url, cfg]) => url === ACTIVITY_URL && cfg.params.period === 'week')).toBe(true);
  });

  it('shows day-grouped activity cards with status icons + labels on mobile', async () => {
    renderPage();
    const feed = await screen.findByTestId('activity-feed');
    await within(feed).findByText('Hazal Tekinalp');
    expect(within(feed).getByText('Private kite · 2 h · 10:30')).toBeInTheDocument();
    expect(within(feed).getByText('Nina Brunner +1')).toBeInTheDocument();
    expect(within(feed).getByText('Semi-private · 1.5 h · 08:30')).toBeInTheDocument();
    expect(within(feed).getByText('Payout received')).toBeInTheDocument();
    expect(within(feed).getAllByText('Pending').length).toBe(1);
    expect(within(feed).getAllByText('Paid').length).toBe(2);
    expect(within(feed).getByText(/Sep 30/)).toBeInTheDocument();

    fireEvent.click(within(feed).getByRole('button', { name: 'Payouts' }));
    await waitFor(() => expect(apiMock.get.mock.calls.some(([url, cfg]) => url === ACTIVITY_URL && cfg.params.type === 'payouts')).toBe(true));
  });

  it('runs the request flow: validates max/minimum, submits, then shows success', async () => {
    renderPage();
    await heroAmount();
    fireEvent.click(screen.getByRole('button', { name: 'Request payout · €433.77' }));

    const amount = await screen.findByLabelText('Amount');
    expect(amount).toHaveValue('433.77');
    // Mobile → bottom sheet (Drawer), not a modal.
    expect(document.querySelector('.ant-drawer')).not.toBeNull();
    expect(document.querySelector('.ant-modal')).toBeNull();

    fireEvent.change(amount, { target: { value: '500' } });
    fireEvent.blur(amount);
    expect(await screen.findByText('You can request at most €433.77')).toBeInTheDocument();

    fireEvent.change(amount, { target: { value: '150' } });
    expect(await screen.findByText('The minimum payout is €200.00')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Send request · €150.00' }));
    expect(apiMock.post).not.toHaveBeenCalled();

    fireEvent.change(amount, { target: { value: '300' } });
    fireEvent.click(screen.getByRole('radio', { name: 'Cash' }));
    fireEvent.change(screen.getByLabelText('Note (optional)'), { target: { value: 'Before Friday please' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send request · €300.00' }));

    await waitFor(() => expect(apiMock.post).toHaveBeenCalledWith(REQUESTS_URL, {
      amount: 300, preferredMethod: 'cash', note: 'Before Friday please',
    }));
    const success = await screen.findByTestId('payout-request-success');
    expect(within(success).getByText('Request sent — your manager has been notified.')).toBeInTheDocument();
    expect(within(success).getByText('€300.00')).toBeInTheDocument();
    // Queries are invalidated → summary refetched.
    await waitFor(() => expect(summaryCalls().length).toBeGreaterThan(1));
  });

  it('shows a pending request with a confirmable cancel action', async () => {
    summaryResponder = () => Promise.resolve({
      data: makeSummary({ pendingRequest: { id: 'req-1', amount: 433.77, createdAt: '2026-10-06T09:00:00Z', note: null } }),
    });
    renderPage();
    const pending = await screen.findByTestId('pending-request');
    expect(within(pending).getByText('Payout requested · €433.77 · Oct 6')).toBeInTheDocument();
    expect(screen.getByTestId('request-payout-button')).toHaveTextContent('Payout requested · €433.77');
    expect(screen.queryByRole('button', { name: /Request payout ·/ })).toBeNull();

    fireEvent.click(within(pending).getByRole('button', { name: 'Cancel request' }));
    expect(within(pending).getByText('Cancel this payout request?')).toBeInTheDocument();
    fireEvent.click(within(pending).getByRole('button', { name: 'Yes, cancel' }));
    await waitFor(() => expect(apiMock.delete).toHaveBeenCalledWith(`${REQUESTS_URL}/req-1`));
    await waitFor(() => expect(messageMock.success).toHaveBeenCalledWith('Payout request cancelled'));
  });

  it('disables the request button with an explanation below the threshold', async () => {
    summaryResponder = () => Promise.resolve({
      data: makeSummary({
        balances: { totalEarned: 150, paidOutNet: 0, paidOutGross: 0, deductionsTotal: 0, available: 150 },
        threshold: { amount: 200, meets: false, shortfall: 50 },
      }),
    });
    renderPage();
    await heroAmount();
    const button = screen.getByRole('button', { name: 'Request payout · €150.00' });
    expect(button).toBeDisabled();
    const explanation = document.getElementById(button.getAttribute('aria-describedby'));
    expect(explanation).toHaveTextContent('€50.00 more to reach the €200.00 minimum');
    expect(explanation.querySelector('strong')).toHaveTextContent('€50.00');
  });

  it('shows helpful empty states when there is no history', async () => {
    summaryResponder = () => Promise.resolve({
      data: makeSummary({
        earned: 0, changePct: null, lessons: 0, hours: 0, avgPerLesson: 0, byLessonType: [], deductions: 0,
        balances: { totalEarned: 0, paidOutNet: 0, paidOutGross: 0, deductionsTotal: 0, available: 0 },
        threshold: { amount: 200, meets: false, shortfall: 200 },
        lastPayout: null,
      }),
    });
    activityResponder = () => Promise.resolve({ data: { items: [], total: 0 } });
    renderPage();
    expect(await screen.findByText('No earnings yet')).toBeInTheDocument();
    expect(screen.getByText('No lessons in this period yet')).toBeInTheDocument();
    expect(screen.getByText('No payouts yet')).toBeInTheDocument();
    expect(await screen.findByText('Nothing here yet')).toBeInTheDocument();
    expect(screen.queryByTestId('earnings-change-chip')).toBeNull();
  });

  it('shows a skeleton while loading and an error state with retry', async () => {
    let fail = true;
    summaryResponder = () => (fail ? Promise.reject(new Error('network')) : Promise.resolve({ data: makeSummary() }));
    renderPage();
    expect(screen.getByTestId('earnings-skeleton')).toBeInTheDocument();
    expect(await screen.findByText('We could not load your earnings')).toBeInTheDocument();
    fail = false;
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await heroAmount()).toHaveTextContent('€428.57');
  });

  it('switches to the desktop layout: header actions, table, modal request flow', async () => {
    setViewport('desktop');
    renderPage();
    const page = await screen.findByTestId('instructor-earnings-page');
    expect(page).toHaveAttribute('data-layout', 'desktop');
    await heroAmount();
    expect(screen.getByRole('button', { name: 'Statement' })).toBeInTheDocument();
    expect(screen.getByText('Earnings by month')).toBeInTheDocument();
    expect(screen.getByText('38 lessons · 57.5 h · avg €11.28 per lesson')).toBeInTheDocument();
    expect(screen.queryByTestId('activity-feed')).toBeNull();

    const table = await screen.findByTestId('activity-table');
    const header = within(table).getByRole('columnheader', { name: 'You earn' });
    expect(header.className).toContain('sticky');
    expect(header.className).toContain('text-right');
    expect(within(table).getByText('Hazal Tekinalp')).toBeInTheDocument();

    // Status filter is client-side on lessons; search hits the API.
    fireEvent.click(screen.getByRole('button', { name: 'Pending' }));
    await waitFor(() => expect(within(screen.getByTestId('activity-table')).queryByText('Nina Brunner +1')).toBeNull());
    fireEvent.change(screen.getByPlaceholderText('Search student or lesson'), { target: { value: 'Hazal' } });
    await waitFor(() => expect(apiMock.get.mock.calls.some(([url, cfg]) => url === ACTIVITY_URL && cfg.params.search === 'Hazal')).toBe(true));

    fireEvent.click(screen.getByRole('button', { name: 'Request payout · €433.77' }));
    await screen.findByLabelText('Amount');
    expect(document.querySelector('.ant-modal')).not.toBeNull();
    expect(document.querySelector('.ant-drawer')).toBeNull();
  });

  it('opens the request sheet from /finance?request=1 (dashboard link)', async () => {
    renderPage({ route: '/finance?request=1' });
    expect(await screen.findByLabelText('Amount')).toHaveValue('433.77');
  });

  it('refreshes when the payout_request:updated socket event fires', async () => {
    renderPage();
    await heroAmount();
    const call = realTime.on.mock.calls.find(([event]) => event === 'payout_request:updated');
    expect(call).toBeTruthy();
    const before = summaryCalls().length;
    await act(async () => { call[1]({ id: 'req-1', status: 'paid' }); });
    await waitFor(() => expect(summaryCalls().length).toBeGreaterThan(before));
  });
});
