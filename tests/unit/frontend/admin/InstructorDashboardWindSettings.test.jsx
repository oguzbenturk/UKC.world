import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Settings → Forecast → "Instructor dashboard wind" (settings.instructor_dashboard).
import '../../../setup/i18nForTests';

const apiMock = vi.hoisted(() => ({ get: vi.fn(), put: vi.fn() }));
const messageMock = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
const authState = vi.hoisted(() => ({ role: 'admin' }));

vi.mock('@/shared/services/apiClient', () => ({ default: apiMock }));
vi.mock('@/shared/utils/antdStatic', () => ({ message: messageMock }));
vi.mock('@/shared/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'u-1', role: authState.role } }) }));

import InstructorDashboardWindSettings from '@/features/forecast/components/InstructorDashboardWindSettings';
import ForecastSettings from '@/features/forecast/components/ForecastSettings';
import { validateWindForm } from '@/features/forecast/components/instructorWindForm';

const SPOTS = [{ id: 'gulbahce' }, { id: 'alacati' }, { id: 'pirlanta' }, { id: 'gokceada' }];

const renderWith = (ui) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const invalidate = vi.spyOn(client, 'invalidateQueries');
  render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
  return { client, invalidate };
};

describe('InstructorDashboardWindSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authState.role = 'admin';
    apiMock.get.mockImplementation((url) => {
      if (url === '/settings') return Promise.resolve({ data: { instructor_dashboard: { wind_spot: 'alacati', wind_min_kn: 14, wind_max_kn: 28 } } });
      if (url === '/weather/spots') return Promise.resolve({ data: { spots: SPOTS } });
      return Promise.reject(new Error(`unexpected GET ${url}`));
    });
    apiMock.put.mockImplementation((url, body) => Promise.resolve({ data: { success: true, setting: { key: 'instructor_dashboard', value: body.value } } }));
  });

  it('renders the section with the saved values and the spot list', async () => {
    renderWith(<InstructorDashboardWindSettings />);
    const section = await screen.findByTestId('instructor-wind-settings');
    expect(within(section).getByRole('heading', { name: 'Instructor dashboard wind' })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText('Minimum (kn)')).toHaveValue(14));
    expect(screen.getByLabelText('Maximum (kn)')).toHaveValue(28);
    const spot = screen.getByLabelText('Spot');
    await waitFor(() => expect(within(spot).getAllByRole('option')).toHaveLength(4));
    expect(spot).toHaveValue('alacati');
  });

  it('saves via PUT /settings/instructor_dashboard and refreshes the dashboard wind settings', async () => {
    const { invalidate } = renderWith(<InstructorDashboardWindSettings />);
    await waitFor(() => expect(screen.getByLabelText('Minimum (kn)')).toHaveValue(14));
    await waitFor(() => expect(within(screen.getByLabelText('Spot')).getAllByRole('option')).toHaveLength(4));
    fireEvent.change(screen.getByLabelText('Spot'), { target: { value: 'gulbahce' } });
    fireEvent.change(screen.getByLabelText('Minimum (kn)'), { target: { value: '10' } });
    fireEvent.change(screen.getByLabelText('Maximum (kn)'), { target: { value: '22' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save wind settings' }));

    await waitFor(() => expect(apiMock.put).toHaveBeenCalledWith('/settings/instructor_dashboard', {
      value: { wind_spot: 'gulbahce', wind_min_kn: 10, wind_max_kn: 22 },
    }));
    await waitFor(() => expect(messageMock.success).toHaveBeenCalledWith('Instructor dashboard wind saved'));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['instructor-dashboard', 'settings'] });
  });

  it('blocks saving when min >= max or a value is outside 5–40 kn', async () => {
    renderWith(<InstructorDashboardWindSettings />);
    await waitFor(() => expect(screen.getByLabelText('Minimum (kn)')).toHaveValue(14));
    const save = screen.getByRole('button', { name: 'Save wind settings' });

    fireEvent.change(screen.getByLabelText('Minimum (kn)'), { target: { value: '30' } });
    expect(screen.getByRole('alert')).toHaveTextContent('The minimum must be lower than the maximum.');
    expect(save).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Minimum (kn)'), { target: { value: '4' } });
    expect(screen.getByText('Enter a value between 5 and 40 knots.')).toBeInTheDocument();
    expect(save).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Minimum (kn)'), { target: { value: '12' } });
    expect(save).not.toBeDisabled();
    fireEvent.submit(save.closest('form'));
    await waitFor(() => expect(apiMock.put).toHaveBeenCalledTimes(1));
  });

  it('validateWindForm', () => {
    expect(validateWindForm({ min: '12', max: '25' })).toEqual({});
    expect(validateWindForm({ min: '25', max: '12' })).toEqual({ order: true });
    expect(validateWindForm({ min: '', max: '41' })).toEqual({ min: 'range', max: 'range' });
  });

  it('ForecastSettings shows the section to admins/managers only', async () => {
    authState.role = 'manager';
    const { unmount } = render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <ForecastSettings />
      </QueryClientProvider>,
    );
    expect(await screen.findByTestId('instructor-wind-settings')).toBeInTheDocument();
    unmount();

    authState.role = 'instructor';
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <ForecastSettings />
      </QueryClientProvider>,
    );
    expect(screen.queryByTestId('instructor-wind-settings')).not.toBeInTheDocument();
  });
});
