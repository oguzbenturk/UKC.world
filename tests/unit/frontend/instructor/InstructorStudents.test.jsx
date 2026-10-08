import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import dayjs from 'dayjs';

// Instructor "My students" list + student profile. API mocked per
// backend/services/instructorService.js (getInstructorStudents / getInstructorStudentProfile).
import '../../../setup/i18nForTests';

const apiMock = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn(), put: vi.fn(), delete: vi.fn() }));
const messageMock = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));

vi.mock('@/shared/services/apiClient', () => ({ default: apiMock }));
vi.mock('@/shared/utils/antdStatic', () => ({ message: messageMock }));
vi.mock('@/shared/hooks/usePullToRefresh', () => ({ usePullToRefresh: () => {} }));
vi.mock('@/shared/contexts/CurrencyContext', () => ({
  useCurrency: () => ({ formatCurrency: (amount) => `€${Number(amount).toFixed(2)}` }),
}));

import MyStudents from '@/features/instructor/pages/MyStudents';
import StudentDetail from '@/features/instructor/pages/StudentDetail';

const today = dayjs().format('YYYY-MM-DD');
const tomorrow = dayjs().add(1, 'day').format('YYYY-MM-DD');
const weekAgo = dayjs().subtract(7, 'day').format('YYYY-MM-DD');
const longAgo = dayjs().subtract(90, 'day').format('YYYY-MM-DD');

const STUDENTS = [
  {
    studentId: 's1', name: 'Hazal Sezgin', skillLevel: 'beginner', avatarUrl: null, phone: '+90 544 324 99 45',
    totalLessonCount: 3, totalHours: 5.5, lastLessonDate: weekAgo, nextLesson: { date: today, startHour: '15.50' },
    packageHours: { totalHours: 10, usedHours: 8.5, remainingHours: 1.5 },
  },
  {
    studentId: 's2', name: 'Nina Brunner', skillLevel: 'intermediate', avatarUrl: null, phone: null,
    totalLessonCount: 6, totalHours: 12, lastLessonDate: weekAgo, nextLesson: { date: tomorrow, startHour: 9 },
    packageHours: { totalHours: 0, usedHours: 0, remainingHours: 0 },
  },
  {
    studentId: 's3', name: 'Dmytro Shevchenko', skillLevel: null, avatarUrl: null, phone: null,
    totalLessonCount: 1, totalHours: 2, lastLessonDate: longAgo, nextLesson: null,
    packageHours: { totalHours: 0, usedHours: 0, remainingHours: 0 },
  },
];

const PROFILE = {
  student: {
    id: 's1', name: 'Hazal Sezgin', email: 'hazal@example.com', phone: '+90 544 324 99 45',
    avatarUrl: null, level: 'beginner', notes: 'Prefers mornings', createdAt: '2026-03-02T10:00:00.000Z',
  },
  stats: { totalLessons: 3, totalHours: 5.5, lastLessonDate: weekAgo, nextLesson: { date: today, startHour: '15.50' } },
  progress: [{ id: 'p1', skillId: 'k1', skillName: 'Body drag', dateAchieved: weekAgo, notes: null }],
  skillLevels: [{ id: 'l1', name: 'Beginner', orderIndex: 1 }, { id: 'l2', name: 'Intermediate', orderIndex: 2 }],
  skills: [
    { id: 'k1', name: 'Body drag', skillLevelId: 'l1' },
    { id: 'k2', name: 'Water start', skillLevelId: 'l1' },
    { id: 'k3', name: 'Riding upwind', skillLevelId: 'l2' },
  ],
  recentLessons: [
    { id: 'b1', date: today, startHour: '15.50', durationHours: 2, status: 'confirmed', serviceName: 'Private kite' },
    { id: 'b2', date: weekAgo, startHour: 10, durationHours: 1.5, status: 'completed', serviceName: 'Private kite' },
  ],
  recommendations: [],
  packageHours: { totalHours: 10, usedHours: 8.5, remainingHours: 1.5, packageCount: 1 },
};

const setDesktop = (isDesktop) => {
  window.matchMedia = vi.fn().mockImplementation((query) => ({
    matches: query.includes('min-width: 1024px') ? isDesktop : false,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
};

const renderAt = (path) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/instructor/students" element={<MyStudents />} />
          <Route path="/instructor/students/:id" element={<StudentDetail />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
};

beforeEach(() => {
  vi.clearAllMocks();
  setDesktop(false);
  apiMock.get.mockImplementation((url) => {
    if (url === '/instructors/me/students') return Promise.resolve({ data: STUDENTS });
    if (url === '/instructors/me/students/s1/profile') return Promise.resolve({ data: PROFILE });
    if (url.startsWith('/instructors/me/students/s1/notes')) return Promise.resolve({ data: { notes: [] } });
    return Promise.resolve({ data: [] });
  });
});

describe('My students list', () => {
  it('shows students grouped by next lesson with counts', async () => {
    renderAt('/instructor/students');
    const list = await screen.findByTestId('students-list');
    expect(screen.getByText('3 students · 2 with a lesson booked')).toBeInTheDocument();
    expect(within(list).getByRole('heading', { name: /Today/ })).toBeInTheDocument();
    expect(within(list).getByRole('heading', { name: /Tomorrow/ })).toBeInTheDocument();
    expect(within(list).getByRole('heading', { name: /No lesson booked/ })).toBeInTheDocument();
    expect(within(list).getByText(/Today · 15:30/)).toBeInTheDocument();
    expect(within(list).getByRole('link', { name: 'Hazal Sezgin' })).toHaveAttribute('href', '/instructor/students/s1');
  });

  it('filters with chips and search', async () => {
    renderAt('/instructor/students');
    await screen.findByTestId('students-list');

    fireEvent.click(screen.getByRole('button', { name: /Low on hours/ }));
    expect(screen.getByRole('link', { name: 'Hazal Sezgin' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Nina Brunner' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /^All/ }));
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search students' }), { target: { value: 'dmytro' } });
    expect(screen.getByRole('link', { name: 'Dmytro Shevchenko' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Hazal Sezgin' })).not.toBeInTheDocument();

    fireEvent.change(screen.getByRole('searchbox', { name: 'Search students' }), { target: { value: 'nobody' } });
    expect(screen.getByText('No students match')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(screen.getByRole('link', { name: 'Nina Brunner' })).toBeInTheDocument();
  });

  it('sort menu: opens a styled list, picking an option re-sorts and closes it', async () => {
    setDesktop(true);
    renderAt('/instructor/students');
    const list = await screen.findByTestId('students-list');
    const trigger = screen.getByRole('button', { name: /Sort by/, expanded: false });
    fireEvent.click(trigger);
    const menu = screen.getByRole('listbox', { name: 'Sort by' });
    expect(within(menu).getByRole('option', { name: 'Next lesson', selected: true })).toHaveFocus();

    fireEvent.click(within(menu).getByRole('option', { name: 'Name A–Z' }));
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    const names = within(list).getAllByRole('link').map((a) => a.textContent);
    expect(names).toEqual(['Dmytro Shevchenko', 'Hazal Sezgin', 'Nina Brunner']);
    expect(screen.getByRole('button', { name: /Sort by/ })).toHaveTextContent('Name A–Z');

    // Escape closes without changing the sort.
    fireEvent.click(screen.getByRole('button', { name: /Sort by/ }));
    fireEvent.keyDown(screen.getByRole('listbox'), { key: 'Escape' });
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('shows the empty state when the instructor has no students', async () => {
    apiMock.get.mockResolvedValueOnce({ data: [] });
    renderAt('/instructor/students');
    expect(await screen.findByText('No students yet')).toBeInTheDocument();
  });

  it('shows an error with retry', async () => {
    apiMock.get.mockRejectedValueOnce(new Error('boom'));
    renderAt('/instructor/students');
    expect(await screen.findByText('Couldn’t load your students')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByTestId('students-list')).toBeInTheDocument();
  });

  it('renders the desktop table header', async () => {
    setDesktop(true);
    renderAt('/instructor/students');
    await screen.findByTestId('students-list');
    expect(screen.getByTestId('instructor-students-page')).toHaveAttribute('data-layout', 'desktop');
    expect(screen.getByRole('button', { name: /Next lesson/, pressed: true })).toBeInTheDocument();
  });
});

describe('Student profile', () => {
  it('shows the contact card, package and stats', async () => {
    renderAt('/instructor/students/s1');
    const hero = await screen.findByTestId('student-hero');
    expect(within(hero).getByRole('heading', { name: 'Hazal Sezgin' })).toBeInTheDocument();
    expect(within(hero).getByRole('link', { name: /Call/ })).toHaveAttribute('href', 'tel:+905443249945');
    expect(within(hero).getByRole('link', { name: /WhatsApp/ })).toHaveAttribute('href', 'https://wa.me/905443249945');
    expect(within(hero).getByText('Almost used up — suggest a new package.')).toBeInTheDocument();
    expect(within(hero).getByText(/Today · 15:30/)).toBeInTheDocument();
  });

  it('switches mobile tabs and logs a skill', async () => {
    apiMock.post.mockResolvedValue({ data: { id: 'p2', skillId: 'k2', skillName: 'Water start', dateAchieved: today } });
    renderAt('/instructor/students/s1');
    await screen.findByTestId('student-hero');
    expect(screen.getByTestId('lessons-panel')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: 'Skills' }));
    const path = screen.getByTestId('skill-path');
    expect(within(path).getByText('1 of 3 skills learned')).toBeInTheDocument();

    fireEvent.click(within(path).getByRole('button', { name: /Water start/ }));
    const select = await screen.findByLabelText('Skill');
    expect(select).toHaveValue('k2');
    fireEvent.click(screen.getByRole('button', { name: 'Save skill' }));
    await waitFor(() => expect(apiMock.post).toHaveBeenCalledWith(
      '/instructors/me/students/s1/progress',
      expect.objectContaining({ skillId: 'k2', dateAchieved: today }),
    ));
    expect(messageMock.success).toHaveBeenCalledWith('Skill logged');
  });

  it('shows not found for a student outside the instructor’s lessons', async () => {
    apiMock.get.mockImplementation((url) => (url.includes('/profile')
      ? Promise.reject(Object.assign(new Error('nope'), { response: { status: 403 } }))
      : Promise.resolve({ data: [] })));
    renderAt('/instructor/students/s1');
    expect(await screen.findByText('Student not found')).toBeInTheDocument();
  });
});
