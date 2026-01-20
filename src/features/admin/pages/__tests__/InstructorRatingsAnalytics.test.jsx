import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import InstructorRatingsAnalytics from '../InstructorRatingsAnalytics';
import { useInstructorRatingsAnalytics } from '../../hooks/useInstructorRatingsAnalytics';

const { docInstances, jsPDFConstructor, autoTableMock } = vi.hoisted(() => {
  const instances = [];
  const constructor = vi.fn();
  constructor.mockImplementation(() => {
    const instance = {
      setFontSize: vi.fn(),
      text: vi.fn(),
      setTextColor: vi.fn(),
      internal: { pageSize: { getHeight: () => 595, width: 842, height: 595 } },
      save: vi.fn()
    };
    instances.push(instance);
    return instance;
  });

  const autoTableFn = vi.fn();

  return {
    docInstances: instances,
    jsPDFConstructor: constructor,
    autoTableMock: autoTableFn
  };
});

vi.mock('jspdf', () => ({
  default: jsPDFConstructor
}));

vi.mock('jspdf-autotable', () => ({
  default: autoTableMock
}));

vi.mock('recharts', async () => {
  const actual = await vi.importActual('recharts');
  return {
    ...actual,
    ResponsiveContainer: ({ children }) => (
      <div style={{ width: 800, height: 400 }}>{children}</div>
    )
  };
});

vi.mock('../../hooks/useInstructorRatingsAnalytics');

const mockRefetch = vi.fn();

const createHookResponse = () => ({
  data: {
    instructors: [
      {
        instructorId: '1',
        instructorName: 'Alice Waves',
        instructorAvatar: null,
        averageRating: 4.9,
        totalRatings: 42,
        distribution: { 5: 40, 4: 2 },
        breakdown: {
          lesson: { count: 30, average: 4.9 },
          rental: { count: 12, average: 4.6 },
          accommodation: { count: 0, average: 0 }
        },
        lastRatingAt: '2025-09-14T12:00:00Z'
      },
      {
        instructorId: '2',
        instructorName: 'Bora Coast',
        instructorAvatar: null,
        averageRating: 4.4,
        totalRatings: 18,
        distribution: { 5: 10, 4: 6, 3: 2 },
        breakdown: {
          lesson: { count: 12, average: 4.5 },
          rental: { count: 6, average: 4.2 },
          accommodation: { count: 0, average: 0 }
        },
        lastRatingAt: '2025-09-10T08:00:00Z'
      }
    ],
    totals: {
      average: 4.72,
      totalRatings: 60,
      fiveStarShare: 83.3
    },
    starBuckets: [50, 8, 2, 0, 0],
    serviceBreakdown: {
      lesson: { count: 42, average: 4.7 },
      rental: { count: 18, average: 4.4 },
      accommodation: { count: 0, average: 0 }
    }
  },
  crossMetrics: {
    totalRevenue: 12850,
    avgBookingValue: 245,
    instructorUtilization: 66.4,
    equipmentUtilization: 58.1,
    conversionRate: 23.4
  },
  isCrossMetricsLoading: false,
  crossMetricsError: null,
  isLoading: false,
  isFetching: false,
  error: null,
  refetch: mockRefetch
});

const renderComponent = () => {
  return render(
    <MemoryRouter>
      <InstructorRatingsAnalytics />
    </MemoryRouter>
  );
};

describe('InstructorRatingsAnalytics page', () => {
  beforeEach(() => {
    mockRefetch.mockReset();
    useInstructorRatingsAnalytics.mockReturnValue(createHookResponse());
    docInstances.length = 0;
    jsPDFConstructor.mockClear();
    autoTableMock.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders instructor data and hides benchmark column when toggled off', async () => {
    renderComponent();

    const table = screen.getByRole('table');
    expect(within(table).getByText('Alice Waves')).toBeInTheDocument();
    expect(within(table).getByText('Benchmark')).toBeInTheDocument();
    expect(screen.getByText('Top performer')).toBeInTheDocument();

    const benchmarkToggle = screen.getByRole('switch', { name: /toggle benchmark highlight/i });
    await userEvent.click(benchmarkToggle);

    await waitFor(() => {
      expect(within(table).queryByText('Benchmark')).not.toBeInTheDocument();
    });
    expect(screen.queryByText('Top performer')).not.toBeInTheDocument();
  });

  it('updates sort filter label and triggers manual refresh', async () => {
    renderComponent();

    const sortLabel = screen.getByText('Sort by');
    const sortContainer = sortLabel.closest('.ant-col');
    expect(sortContainer).not.toBeNull();

    const sortSelectTrigger = within(sortContainer).getByText('Highest average rating');
    await userEvent.click(sortSelectTrigger);

    const mostRatingsOption = await screen.findByTitle('Most ratings submitted');
    await userEvent.click(mostRatingsOption);

    await waitFor(() => {
      const selected = sortContainer.querySelector('.ant-select-selection-item[title="Most ratings submitted"]');
      expect(selected).not.toBeNull();
    });

    const refreshButton = screen.getByRole('button', { name: /refresh/i });
    await userEvent.click(refreshButton);

    expect(mockRefetch).toHaveBeenCalledTimes(1);
  });

  it('enables auto refresh mode on the analytics hook when toggled', async () => {
    renderComponent();

    expect(useInstructorRatingsAnalytics).toHaveBeenCalledWith(expect.any(Object), {
      autoRefresh: false,
      refetchIntervalMs: 60_000
    });

    const autoRefreshSwitch = screen.getByRole('switch', { name: /auto refresh/i });
    await userEvent.click(autoRefreshSwitch);

    await waitFor(() => {
      const lastCall = useInstructorRatingsAnalytics.mock.calls.at(-1);
      expect(lastCall?.[1]).toMatchObject({ autoRefresh: true, refetchIntervalMs: 60_000 });
    });
  });

  it('generates a PDF export with current filters', async () => {
    renderComponent();

    const pdfButton = screen.getByRole('button', { name: /export pdf/i });
    expect(pdfButton).toBeEnabled();

    await userEvent.click(pdfButton);

    expect(jsPDFConstructor).toHaveBeenCalledTimes(1);
    expect(autoTableMock).toHaveBeenCalledTimes(1);
    expect(docInstances[0]).toBeTruthy();
    expect(docInstances[0].save).toHaveBeenCalledWith('instructor-rating-overview.pdf');
  });
});
