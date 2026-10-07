import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import dayjs from 'dayjs';

// Instructor "My day" dashboard (/instructor/dashboard). API mocked per
// backend/routes/instructorToday.js + the public weather report contract.
import '../../../setup/i18nForTests';
import { ChatWidgetContext } from '@/features/chat/context/chatWidgetContextInstance';

const apiMock = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() }));
const realTime = vi.hoisted(() => ({ on: vi.fn(), off: vi.fn() }));
const messageMock = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
const authState = vi.hoisted(() => ({ role: 'instructor' }));

vi.mock('@/shared/services/apiClient', () => ({ default: apiMock }));
vi.mock('@/shared/services/realTimeService', () => ({ default: realTime, realTimeService: realTime }));
vi.mock('@/shared/utils/antdStatic', () => ({ message: messageMock }));
vi.mock('@/shared/services/analyticsService', () => ({ analyticsService: { track: vi.fn() } }));
vi.mock('@/shared/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'ins-1', first_name: 'Mira', last_name: 'Janssens', name: 'Mira Janssens', role: authState.role } }),
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

import InstructorDashboard from '@/features/instructor/pages/InstructorDashboard';

const TODAY = dayjs().format('YYYY-MM-DD');
const TODAY_URL = '/instructors/me/today';
const WEEK_URL = '/instructors/me/week';
const WIND_URL = '/weather/report/gulbahce';

const participant = (overrides) => ({
  userId: 's-x', familyMemberId: null, name: 'Someone', initials: 'S', skillLevel: null, waiverSigned: true, lastNote: null, ...overrides,
});

const makeDay = (overrides = {}) => ({
  date: TODAY,
  today: TODAY,
  summary: { lessons: 3, hours: 5.5, firstStart: '08:30' },
  lessons: [
    {
      id: 'b-1', date: TODAY, startHour: '08:30', durationHours: 1.5, status: 'completed', checkinStatus: 'checked-in', checkoutStatus: 'checked-out',
      service: { name: 'Private kite', category: 'private' }, groupSize: 1, packageInfo: null, equipment: [], location: null,
      participants: [participant({ userId: 's-1', name: 'Nazlı Erginsoy', initials: 'NE' })],
    },
    {
      id: 'b-2', date: TODAY, startHour: '10:30', durationHours: 2, status: 'confirmed', checkinStatus: 'pending', checkoutStatus: 'pending',
      service: { name: 'Private kite', category: 'private' }, groupSize: 1,
      packageInfo: { name: '10h pack', lessonIndex: 4, lessonsTotal: 6, hoursLeft: 6, totalHours: 10 },
      equipment: ['Kite 9 m', 'Board 138'], location: 'Gülbahçe beach',
      participants: [participant({
        userId: 's-2', name: 'Hazal Tekinalp', initials: 'HT', skillLevel: 'Intermediate', waiverSigned: true,
        lastNote: { date: '2026-10-06', text: 'Riding both directions.' },
      })],
    },
    {
      id: 'b-3', date: TODAY, startHour: '13:00', durationHours: 2, status: 'confirmed', checkinStatus: 'pending', checkoutStatus: 'pending',
      service: { name: 'Semi-private', category: 'semi-private' }, groupSize: 2, packageInfo: null, equipment: [], location: null,
      participants: [
        participant({ userId: 's-3', name: 'Nina Brunner', initials: 'NB', waiverSigned: false }),
        participant({ userId: 's-4', name: 'Tom Brunner', initials: 'TB', waiverSigned: true }),
      ],
    },
  ],
  nextLessonId: 'b-2',
  attention: [{ kind: 'waiver_missing', bookingId: 'b-3', userId: 's-3', name: 'Nina Brunner', startHour: '13:00' }],
  ...overrides,
});

const WEEK = {
  start: dayjs().startOf('week').format('YYYY-MM-DD'),
  today: TODAY,
  days: Array.from({ length: 7 }, (_, i) => ({
    date: dayjs(TODAY).add(i - 3, 'day').format('YYYY-MM-DD'),
    lessons: i === 6 ? 0 : 2,
    hours: i === 6 ? 0 : 3,
    off: i === 6,
  })),
  totals: { lessons: 12, hours: 18 },
};

const REPORT = {
  spot: { id: 'gulbahce' },
  forecast: {
    hours: Array.from({ length: 24 }, (_, hour) => ({
      dateLocal: TODAY, timeLocal: `${String(hour).padStart(2, '0')}:00`, hour, wspdKn: 16, gustKn: 21, dirDeg: 225, dirText: 'SW',
    })),
  },
};

const SUMMARY = {
  currency: 'EUR',
  balances: { available: 436.42 },
  threshold: { amount: 200, meets: true, shortfall: 0 },
  pendingRequest: null,
};

let responders;

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

const renderPage = ({ chat = null } = {}) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const tree = (
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/instructor/dashboard']}>
        <InstructorDashboard />
      </MemoryRouter>
    </QueryClientProvider>
  );
  return render(chat ? <ChatWidgetContext.Provider value={chat}>{tree}</ChatWidgetContext.Provider> : tree);
};

describe('InstructorDashboard ("My day")', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authState.role = 'instructor';
    setViewport('mobile');
    responders = {
      [TODAY_URL]: () => Promise.resolve({ data: makeDay() }),
      [WEEK_URL]: () => Promise.resolve({ data: WEEK }),
      '/settings': () => Promise.resolve({ data: {} }),
      [WIND_URL]: () => Promise.resolve({ data: REPORT }),
      '/instructors/me/earnings-summary': () => Promise.resolve({ data: SUMMARY }),
    };
    apiMock.get.mockImplementation((url) => {
      if (responders[url]) return responders[url]();
      if (url.startsWith('/ratings/instructor/')) {
        return Promise.resolve({ data: { ratings: [{ id: 'r1', rating: 5, feedbackText: 'Super patient!', studentName: 'Nazlı E.' }], summary: { averageRating: 4.7, totalRatings: 50 } } });
      }
      if (url.startsWith('/ratings/stats/')) return Promise.resolve({ data: { distribution: {} } });
      return Promise.reject(new Error(`unexpected GET ${url}`));
    });
    apiMock.put.mockResolvedValue({ data: { id: 'b-2' } });
    apiMock.post.mockResolvedValue({ data: { id: 'note-1' } });
  });

  it('renders greeting, wind, next lesson, attention, timeline, week and the two small cards (mobile)', async () => {
    renderPage();
    const hero = await screen.findByTestId('next-lesson');
    const page = screen.getByTestId('instructor-dashboard');
    expect(page).toHaveAttribute('data-layout', 'mobile');

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/Good (morning|afternoon|evening), Mira/);
    expect(screen.getByTestId('day-summary')).toHaveTextContent('3 lessons today · 5.5 hours · first at 08:30');

    // Next lesson hero
    expect(within(hero).getByText('Hazal Tekinalp')).toBeInTheDocument();
    expect(within(hero).getByText('Private kite · 2 h · lesson 4 of 6')).toBeInTheDocument();
    expect(within(hero).getByText('10:30–12:30')).toBeInTheDocument();
    expect(within(hero).getByText('Level: Intermediate')).toBeInTheDocument();
    expect(within(hero).getByText('Kite 9 m · Board 138')).toBeInTheDocument();
    expect(within(hero).getByText('Waiver signed')).toBeInTheDocument();
    expect(within(hero).getByText(/Riding both directions\./)).toBeInTheDocument();
    expect(within(hero).getByText(/^Next lesson · /)).toBeInTheDocument();

    // Wind
    const wind = await screen.findByTestId('wind-card');
    expect(within(wind).getByText('Wind at Urla – Gülbahçe · now')).toBeInTheDocument();
    expect(within(wind).getByText('Gusts 21 kn · from SW')).toBeInTheDocument();
    expect(within(wind).getByTestId('wind-verdict')).toHaveTextContent('Good for lessons');
    expect(within(wind).getByText('13:00 — 16 knots')).toBeInTheDocument();
    expect(within(wind).getByRole('link', { name: 'Full wind report' })).toHaveAttribute('href', '/wind-report');

    // Timeline states (icon + text, not colour only)
    expect(screen.getByTestId('timeline-row-b-1')).toHaveAttribute('data-state', 'done');
    expect(within(screen.getByTestId('timeline-row-b-1')).getByText('Done')).toBeInTheDocument();
    expect(within(screen.getByTestId('timeline-row-b-2')).getByText('Next')).toBeInTheDocument();
    expect(within(screen.getByTestId('timeline-row-b-3')).getByText('Nina Brunner +1')).toBeInTheDocument();
    expect(within(screen.getByTestId('timeline-row-b-3')).getByText('Later')).toBeInTheDocument();

    // Week strip + small cards
    const week = await screen.findByTestId('week-strip');
    expect(within(week).getByText('12 lessons · 18 h')).toBeInTheDocument();
    expect(within(week).getByText('off')).toBeInTheDocument();
    const payout = await screen.findByTestId('payout-card');
    expect(payout).toHaveTextContent('€436.42');
    expect(payout).toHaveAttribute('href', '/finance?request=1');
    const rating = await screen.findByTestId('rating-card');
    expect(rating).toHaveTextContent('4.7');
    expect(rating).toHaveTextContent('50 reviews · “Super patient!”');

    // No floating "+" any more; New booking lives in the Today card header.
    expect(screen.getByRole('button', { name: 'New booking' })).toBeInTheDocument();
    expect(apiMock.get).toHaveBeenCalledWith(TODAY_URL, undefined);
  });

  it('shows attention items only when present (waiver + unread messages)', async () => {
    const toggleOpen = vi.fn();
    const { unmount } = renderPage({ chat: { unreadTotal: 2, isOpen: false, toggleOpen, openConversationWith: vi.fn() } });
    const attention = await screen.findByTestId('attention');
    expect(within(attention).getByText('Nina Brunner (13:00) has no signed waiver')).toBeInTheDocument();
    fireEvent.click(within(attention).getByText('2 unread messages'));
    expect(toggleOpen).toHaveBeenCalledTimes(1);

    // Waiver row opens that lesson's drawer.
    fireEvent.click(within(attention).getByText('Nina Brunner (13:00) has no signed waiver'));
    expect(await screen.findByText('Participants (2)')).toBeInTheDocument();
    unmount();

    responders[TODAY_URL] = () => Promise.resolve({ data: makeDay({ attention: [] }) });
    renderPage({ chat: { unreadTotal: 0, isOpen: false, toggleOpen, openConversationWith: vi.fn() } });
    await screen.findByTestId('next-lesson');
    expect(screen.queryByTestId('attention')).not.toBeInTheDocument();
  });

  it('check-in from the hero calls PUT /bookings/:id with the check-in fields', async () => {
    renderPage();
    const hero = await screen.findByTestId('next-lesson');
    fireEvent.click(within(hero).getByRole('button', { name: 'Check in' }));
    await waitFor(() => expect(apiMock.put).toHaveBeenCalledWith('/bookings/b-2', expect.objectContaining({
      status: 'checked-in',
      checkin_status: 'checked-in',
      checkin_time: expect.any(String),
    })));
    await waitFor(() => expect(messageMock.success).toHaveBeenCalledWith('Checked in'));
    // The day is refetched after the update.
    await waitFor(() => expect(apiMock.get.mock.calls.filter(([url]) => url === TODAY_URL).length).toBeGreaterThan(1));
  });

  it('instructor: a checked-in lesson has NO Check out (hero + drawer) — the manager closes it', async () => {
    const day = makeDay();
    day.lessons[1] = { ...day.lessons[1], status: 'checked-in', checkinStatus: 'checked-in' };
    responders[TODAY_URL] = () => Promise.resolve({ data: day });
    renderPage();
    const hero = await screen.findByTestId('next-lesson');
    expect(within(hero).getByText('Next lesson · in progress')).toBeInTheDocument();
    expect(within(hero).queryByRole('button', { name: 'Check out' })).not.toBeInTheDocument();
    expect(within(hero).getByTestId('close-hint')).toHaveTextContent('Your manager closes the lesson after it ends.');

    fireEvent.click(screen.getByTestId('timeline-row-b-2'));
    expect(await screen.findByText('Participants (1)')).toBeInTheDocument();
    expect(screen.queryAllByRole('button', { name: 'Check out' })).toHaveLength(0);
    expect(screen.getAllByTestId('close-hint').length).toBeGreaterThanOrEqual(2);
    expect(apiMock.put).not.toHaveBeenCalled();
  });

  it('instructor drawer still offers Check in for a lesson that has not started', async () => {
    renderPage();
    fireEvent.click(await screen.findByTestId('timeline-row-b-3'));
    expect(await screen.findByText('Participants (2)')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Check in' }).length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByRole('button', { name: 'Check out' })).not.toBeInTheDocument();
  });

  it('staff (manager) viewing the page keeps Check out (status completed + checkout fields)', async () => {
    authState.role = 'manager';
    const day = makeDay();
    day.lessons[1] = { ...day.lessons[1], status: 'checked-in', checkinStatus: 'checked-in' };
    responders[TODAY_URL] = () => Promise.resolve({ data: day });
    renderPage();
    const hero = await screen.findByTestId('next-lesson');
    fireEvent.click(within(hero).getByRole('button', { name: 'Check out' }));
    await waitFor(() => expect(apiMock.put).toHaveBeenCalledWith('/bookings/b-2', expect.objectContaining({
      status: 'completed',
      checkout_status: 'checked-out',
    })));
  });

  it('never shows payment / unpaid attention items', async () => {
    responders[TODAY_URL] = () => Promise.resolve({ data: makeDay() });
    renderPage({ chat: { unreadTotal: 0, isOpen: false, toggleOpen: vi.fn(), openConversationWith: vi.fn() } });
    await screen.findByTestId('next-lesson');
    expect(screen.queryByText(/paid/i)).not.toBeInTheDocument();
  });

  it('timeline row opens the lesson drawer; notes are saved through the instructor notes API', async () => {
    renderPage();
    fireEvent.click(await screen.findByTestId('timeline-row-b-3'));
    expect(await screen.findByText('Participants (2)')).toBeInTheDocument();
    const rows = screen.getAllByTestId('drawer-participant');
    expect(rows).toHaveLength(2);
    expect(within(rows[0]).getByText('No signed waiver')).toBeInTheDocument();
    expect(within(rows[1]).getByText('Waiver signed')).toBeInTheDocument();

    fireEvent.click(within(rows[0]).getByRole('button', { name: 'Add note' }));
    const field = await screen.findByLabelText('Note for Nina Brunner');
    fireEvent.change(field, { target: { value: 'First water start!' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save note' }));
    await waitFor(() => expect(apiMock.post).toHaveBeenCalledWith('/instructors/me/students/s-3/notes', {
      note: 'First water start!', bookingId: 'b-3', visibility: 'student_visible',
    }));
    await waitFor(() => expect(messageMock.success).toHaveBeenCalledWith('Note saved'));
  });

  it('Message opens a direct conversation through the chat widget', async () => {
    const openConversationWith = vi.fn().mockResolvedValue({ id: 'conv-1' });
    renderPage({ chat: { unreadTotal: 0, isOpen: false, toggleOpen: vi.fn(), openConversationWith } });
    const hero = await screen.findByTestId('next-lesson');
    fireEvent.click(within(hero).getByRole('button', { name: 'Message' }));
    await waitFor(() => expect(openConversationWith).toHaveBeenCalledWith('s-2'));
  });

  it('weather failure shows a compact unavailable state and never blocks the page', async () => {
    responders[WIND_URL] = () => Promise.reject(Object.assign(new Error('upstream down'), { response: { status: 502 } }));
    renderPage();
    expect(await screen.findByTestId('next-lesson')).toBeInTheDocument();
    const unavailable = await screen.findByTestId('wind-unavailable', {}, { timeout: 3000 });
    expect(unavailable).toHaveTextContent('Wind data is unavailable right now.');
    expect(screen.queryByTestId('wind-card')).not.toBeInTheDocument();
    expect(screen.getByTestId('today-timeline')).toBeInTheDocument();
  });

  it('uses wind thresholds from settings (instructor_dashboard)', async () => {
    responders['/settings'] = () => Promise.resolve({ data: { instructor_dashboard: { wind_spot: 'gulbahce', wind_min_kn: 18, wind_max_kn: 30 } } });
    renderPage();
    const wind = await screen.findByTestId('wind-card');
    expect(within(wind).getByTestId('wind-verdict')).toHaveTextContent('Light wind');
  });

  it('shows an error state with retry when the day fails to load', async () => {
    responders[TODAY_URL] = () => Promise.reject(new Error('boom'));
    renderPage();
    expect(await screen.findByText("Couldn't load your lessons")).toBeInTheDocument();
    responders[TODAY_URL] = () => Promise.resolve({ data: makeDay() });
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByTestId('next-lesson')).toBeInTheDocument();
  });

  it('shows an empty next-lesson state when nothing is left today', async () => {
    responders[TODAY_URL] = () => Promise.resolve({ data: makeDay({ nextLessonId: null, attention: [] }) });
    renderPage();
    expect(await screen.findByTestId('next-lesson-empty')).toHaveTextContent('No more lessons today');
  });

  it('desktop: bento layout with header New booking and grouped attention chips', async () => {
    setViewport('desktop');
    renderPage({ chat: { unreadTotal: 3, isOpen: false, toggleOpen: vi.fn(), openConversationWith: vi.fn() } });
    await screen.findByTestId('next-lesson');
    expect(screen.getByTestId('instructor-dashboard')).toHaveAttribute('data-layout', 'desktop');
    const chips = screen.getByTestId('attention');
    expect(within(chips).getByText('1 missing waiver')).toBeInTheDocument();
    expect(within(chips).getByText('3 unread messages')).toBeInTheDocument();
    expect(screen.getByText('Private kite · 2 h · lesson 4 of 6 · package 10 h (6 h left)')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add note / progress' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'New booking' }));
    expect(await screen.findByTestId('booking-drawer')).toBeInTheDocument();
  });
});
