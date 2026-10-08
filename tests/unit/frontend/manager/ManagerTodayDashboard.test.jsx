import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import dayjs from 'dayjs';

// Manager "Today" dashboard (/dashboard for managers, /manager/dashboard).
// API mocked per backend/services/managerTodayService.js (GET /manager/today).
import '../../../setup/i18nForTests';

const apiMock = vi.hoisted(() => ({ get: vi.fn(), patch: vi.fn(), post: vi.fn(), put: vi.fn() }));
const realTime = vi.hoisted(() => ({ on: vi.fn(), off: vi.fn() }));
const messageMock = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));

vi.mock('@/shared/services/apiClient', () => ({ default: apiMock }));
vi.mock('@/shared/services/realTimeService', () => ({ default: realTime, realTimeService: realTime }));
vi.mock('@/shared/utils/antdStatic', () => ({ message: messageMock }));
vi.mock('@/shared/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'mgr-1', first_name: 'Nehir', name: 'Nehir Ateşoğlu', role: 'manager' } }),
}));
vi.mock('@/shared/contexts/CurrencyContext', () => ({
  useCurrency: () => ({
    formatCurrency: (amount) => `€${Number(amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
  }),
}));
vi.mock('@/features/bookings/components/contexts/CalendarContext', () => ({
  CalendarProvider: ({ children }) => children,
}));
vi.mock('@/features/bookings/components/components/BookingDrawer', () => ({
  default: ({ isOpen }) => (isOpen ? <div data-testid="booking-drawer">booking drawer</div> : null),
}));
vi.mock('@/features/instructor/dashboard/useDashboard', () => ({
  useWindSettings: () => ({ settings: { spot: 'gulbahce', minKn: 12, maxKn: 25 }, ready: true }),
  useWindReport: () => ({ data: null, isPending: false, isError: true }),
}));

import ManagerTodayDashboard from '@/features/manager/pages/ManagerTodayDashboard';

const TODAY = dayjs().format('YYYY-MM-DD');
const TOMORROW = dayjs().add(1, 'day').format('YYYY-MM-DD');

const lessonItem = (overrides = {}) => ({
  bookingId: 'b-1',
  date: TODAY,
  startHour: '15:30',
  endHour: '17:00',
  durationHours: 1.5,
  status: 'pending',
  service: 'Supervision',
  student: 'Koray Korkmazer',
  others: 0,
  instructor: { id: 'ins-1', name: 'Mira Janssens' },
  bookedBy: { name: 'Mira Janssens', role: 'instructor' },
  createdAt: new Date().toISOString(),
  payment: { status: 'package', amount: 0 },
  ...overrides,
});

const instructor = (id, name, overrides = {}) => ({
  id, name, initials: name.slice(0, 2).toUpperCase(), avatarUrl: null, off: false, hours: 0, capacityHours: 8, lessons: [], ...overrides,
});

const makeData = (overrides = {}) => ({
  date: TODAY,
  today: TODAY,
  isToday: true,
  nowTime: '11:20',
  summary: { lessons: 11, hours: 19.5, instructorsWorking: 6, instructorsTotal: 7, rentalsOut: 3, stayCheckIns: 2 },
  now: {
    inLesson: 2,
    freeNow: { count: 2, names: ['Bora Kılınçarslan', 'Lukas Brandt'] },
    startingNextHour: 1,
    next: lessonItem({ bookingId: 'b-next', startHour: '12:00', status: 'confirmed', student: 'Ece Şahinler', instructor: { id: 'ins-2', name: 'Deniz Arıkan' } }),
    running: [{ bookingId: 'b-run', student: 'Hazal Tekinalp', others: 0, instructor: 'Mira Janssens', until: '12:30' }],
  },
  actions: {
    toConfirm: {
      count: 2,
      items: [
        lessonItem(),
        lessonItem({ bookingId: 'b-2', date: TOMORROW, startHour: '15:30', student: 'Jonas Albrecht', bookedBy: { name: 'Deniz Arıkan', role: 'instructor' }, payment: { status: 'unpaid', amount: 140 } }),
      ],
    },
    unassigned: { count: 1, items: [lessonItem({ bookingId: 'b-u', status: 'confirmed', startHour: '14:00', student: 'Barış Ekinci', instructor: null, suggested: { id: 'ins-4', name: 'Bora Kılınçarslan' } })] },
    waivers: { count: 1, items: [{ bookingId: 'b-w', userId: 'u-nina', familyMemberId: null, name: 'Nina Brunner', startHour: '13:00' }] },
    notClosed: { count: 1, items: [lessonItem({ bookingId: 'b-nc', status: 'confirmed', startHour: '08:30', endHour: '10:00', student: 'Nazlı Erginsoy' })] },
    payoutRequests: { count: 1, amount: 436.42, oldestAt: new Date().toISOString(), items: [{ id: 'pr-1', instructor: { id: 'ins-1', name: 'Mira Janssens' }, amount: 436.42, currency: 'EUR', method: 'bank_transfer', createdAt: new Date().toISOString() }] },
    overbooked: { count: 0, items: [] },
  },
  instructors: [
    instructor('ins-1', 'Mira Janssens', { hours: 7, lessons: [{ bookingId: 'b-run', start: '10:30', end: '12:30', state: 'now', student: 'Hazal' }, { bookingId: 'b-1', start: '15:30', end: '17:00', state: 'pending', student: 'Koray' }] }),
    instructor('ins-2', 'Deniz Arıkan', { hours: 6, lessons: [{ bookingId: 'b-next', start: '12:00', end: '14:00', state: 'confirmed', student: 'Ece' }] }),
    instructor('ins-4', 'Bora Kılınçarslan'),
    instructor('ins-5', 'Elif Yıldız', { off: true }),
  ],
  capacity: { bookedHours: 19.5, availableHours: 48, percent: 41 },
  hourly: Array.from({ length: 12 }, (_, i) => ({ hour: 8 + i, busy: i % 4, total: 4 })),
  money: {
    currency: 'EUR',
    revenueToday: 1240,
    revenueSameDayLastWeek: 1107,
    revenueWeek: 6980,
    revenueLastWeekSameDays: 6463,
    trend: Array.from({ length: 8 }, (_, i) => ({ weekStart: dayjs().subtract(7 - i, 'week').format('YYYY-MM-DD'), revenue: 5000 + i * 300 })),
    outstanding: { amount: 2315, customers: 14 },
  },
  myCommission: { month: TODAY.slice(0, 7), earned: 612, owed: 180, currency: 'EUR' },
  rentals: { out: 3, outValue: 210, overdue: 1, upcoming: 4, overdueItems: [{ id: 'r-1', customer: 'Joris', minutesLate: 40 }] },
  stays: { checkIns: 2, checkOuts: 1, occupied: 5, units: 8 },
  gear: { needsService: 4, lowStock: 2, lowStockItems: ['Wetsuit M', 'Harness L'] },
  ...overrides,
});

let responder;

const setDesktop = (isDesktop) => {
  window.matchMedia = vi.fn().mockImplementation((query) => ({
    matches: query.includes('min-width: 1024px') ? isDesktop : false,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
};

const renderPage = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter><ManagerTodayDashboard /></MemoryRouter>
    </QueryClientProvider>,
  );
};

beforeEach(() => {
  vi.clearAllMocks();
  setDesktop(false);
  responder = () => Promise.resolve({ data: makeData() });
  apiMock.get.mockImplementation((url) => (url === '/manager/today' ? responder() : Promise.resolve({ data: {} })));
  apiMock.patch.mockResolvedValue({ data: { success: true } });
});

describe('ManagerTodayDashboard', () => {
  it('mobile: greeting, right now, needs action, money, instructors and the ops strip', async () => {
    renderPage();
    expect(await screen.findByTestId('needs-action')).toBeInTheDocument();
    expect(screen.getByTestId('manager-today')).toHaveAttribute('data-layout', 'mobile');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Nehir');
    expect(screen.getByTestId('today-summary')).toHaveTextContent('11 lessons · 6 instructors · 19.5 h · 3 rentals out · 2 stay check-ins');

    const now = screen.getByTestId('right-now');
    expect(within(now).getByTestId('now-in-lesson')).toHaveTextContent('2');
    expect(within(now).getByTestId('now-free')).toHaveTextContent('2');
    expect(within(now).getByText('Free now: Bora Kılınçarslan, Lukas Brandt')).toBeInTheDocument();

    const queue = screen.getByTestId('needs-action');
    expect(within(queue).getByText('2 lessons to confirm · booked by instructors')).toBeInTheDocument();
    expect(within(queue).getByText(/Booked by Deniz Arıkan/)).toBeInTheDocument();
    expect(within(queue).getByText('€140.00 unpaid')).toBeInTheDocument();
    expect(within(queue).getByTestId('action-unassigned')).toHaveTextContent('Bora Kılınçarslan is free');
    expect(within(queue).getByTestId('action-waivers')).toHaveAttribute('href', '/customers/u-nina');
    expect(within(queue).getByTestId('action-notClosed')).toHaveAttribute('href', `/calendars/lessons?view=daily&date=${TODAY}&bookingId=b-nc`);
    expect(within(queue).getByTestId('action-payoutRequests')).toHaveAttribute('href', '/finance/payout-requests');

    expect(screen.getByTestId('money-today')).toHaveTextContent('€1,240.00');
    expect(screen.getByTestId('money-today')).toHaveTextContent('▲ 12%');
    expect(screen.getByTestId('money-week')).toHaveTextContent('▲ 8% vs same days last week');
    expect(screen.getByTestId('money-commission')).toHaveTextContent('€180.00 waiting for payout');

    expect(screen.getAllByTestId('instructor-row')).toHaveLength(4);
    expect(screen.getByTestId('ops-rentals')).toHaveTextContent('1 return overdue');
    expect(screen.getByTestId('ops-stays')).toHaveTextContent('2 check-ins · 1 check-outs · 5 of 8 rooms taken');
    expect(screen.getByText('All reports →').closest('a')).toHaveAttribute('href', '/admin/dashboard');
  });

  it('desktop: open links on pending rows, instructor tracks and the 8-week trend', async () => {
    setDesktop(true);
    renderPage();
    const queue = await screen.findByTestId('needs-action');
    expect(screen.getByTestId('manager-today')).toHaveAttribute('data-layout', 'desktop');
    const open = within(queue).getAllByRole('link', { name: 'Open' });
    expect(open[0]).toHaveAttribute('href', `/calendars/lessons?view=daily&date=${TODAY}&bookingId=b-1`);
    expect(screen.getByTestId('revenue-trend')).toBeInTheDocument();
    expect(screen.getByText('day off')).toBeInTheDocument();
    expect(screen.getByText('free all day')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /New booking/ })).toBeInTheDocument();
  });

  it('confirms one pending lesson, then all of them', async () => {
    renderPage();
    const group = await screen.findByTestId('to-confirm');
    fireEvent.click(within(group).getByRole('button', { name: 'Confirm lesson of Koray Korkmazer' }));
    await waitFor(() => expect(apiMock.patch).toHaveBeenCalledWith('/bookings/b-1/status', { status: 'confirmed' }));
    await waitFor(() => expect(messageMock.success).toHaveBeenCalledWith('Lesson confirmed'));

    apiMock.patch.mockClear();
    fireEvent.click(within(group).getByRole('button', { name: 'Confirm all 2' }));
    await waitFor(() => expect(apiMock.patch).toHaveBeenCalledTimes(2));
    expect(apiMock.patch).toHaveBeenNthCalledWith(1, '/bookings/b-1/status', { status: 'confirmed' });
    expect(apiMock.patch).toHaveBeenNthCalledWith(2, '/bookings/b-2/status', { status: 'confirmed' });
    await waitFor(() => expect(messageMock.success).toHaveBeenCalledWith('2 lessons confirmed'));
  });

  it('reports a failed confirmation', async () => {
    apiMock.patch.mockRejectedValueOnce(new Error('nope'));
    renderPage();
    const group = await screen.findByTestId('to-confirm');
    fireEvent.click(within(group).getByRole('button', { name: 'Confirm lesson of Koray Korkmazer' }));
    await waitFor(() => expect(messageMock.error).toHaveBeenCalledWith('1 lesson could not be confirmed'));
  });

  it('busy season (> 10 instructors) shows capacity by hour instead of one row per instructor', async () => {
    const many = Array.from({ length: 12 }, (_, i) => instructor(`i-${i}`, `Instructor ${i}`, { hours: 8 }));
    responder = () => Promise.resolve({ data: makeData({ instructors: many }) });
    renderPage();
    expect(await screen.findByTestId('capacity-by-hour')).toBeInTheDocument();
    expect(screen.queryAllByTestId('instructor-row')).toHaveLength(0);
    expect(screen.getByText('Capacity by hour')).toBeInTheDocument();
  });

  it('shows "all caught up" when nothing needs action', async () => {
    const empty = { count: 0, items: [] };
    responder = () => Promise.resolve({
      data: makeData({ actions: { toConfirm: empty, unassigned: empty, waivers: empty, notClosed: empty, payoutRequests: { ...empty, amount: 0 }, overbooked: empty } }),
    });
    renderPage();
    expect(await screen.findByText('All caught up — nothing waiting for you.')).toBeInTheDocument();
    expect(screen.queryByTestId('to-confirm')).not.toBeInTheDocument();
  });

  it('shows an error with retry', async () => {
    responder = () => Promise.reject(new Error('boom'));
    renderPage();
    expect(await screen.findByText('Couldn’t load today')).toBeInTheDocument();
    responder = () => Promise.resolve({ data: makeData() });
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByTestId('needs-action')).toBeInTheDocument();
  });

  it('New booking opens the booking drawer', async () => {
    renderPage();
    await screen.findByTestId('needs-action');
    fireEvent.click(screen.getByRole('button', { name: 'Booking' }));
    expect(await screen.findByTestId('booking-drawer')).toBeInTheDocument();
  });
});
