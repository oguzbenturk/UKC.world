import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import CustomizePanel from '@/features/dashboard/components/CustomizePanel';

const WIDGETS = {
  revenueBreakdown: true,
  operationalStatus: true,
  people: true,
  revenueTrend: true,
  topInstructors: true,
};

describe('CustomizePanel', () => {
  let onVisibilityChange;

  beforeEach(() => {
    onVisibilityChange = vi.fn();
  });

  it('renders a toggle for each widget', () => {
    render(
      <CustomizePanel
        visibleWidgets={WIDGETS}
        onVisibilityChange={onVisibilityChange}
        initialWidgets={WIDGETS}
      />
    );
    expect(screen.getByText('Revenue Breakdown')).toBeInTheDocument();
    expect(screen.getByText('Operational Status')).toBeInTheDocument();
    expect(screen.getByText('People')).toBeInTheDocument();
    expect(screen.getByText('Revenue Trend')).toBeInTheDocument();
    expect(screen.getByText('Top Instructors')).toBeInTheDocument();
  });

  it('does not render removed kpiRow1 or kpiRow2 labels', () => {
    render(
      <CustomizePanel
        visibleWidgets={WIDGETS}
        onVisibilityChange={onVisibilityChange}
        initialWidgets={WIDGETS}
      />
    );
    expect(screen.queryByText('KPI Row 1')).not.toBeInTheDocument();
    expect(screen.queryByText('KPI Row 2')).not.toBeInTheDocument();
  });

  it('renders exactly 5 widget toggles', () => {
    render(
      <CustomizePanel
        visibleWidgets={WIDGETS}
        onVisibilityChange={onVisibilityChange}
        initialWidgets={WIDGETS}
      />
    );
    const switches = screen.getAllByRole('switch');
    expect(switches).toHaveLength(5);
  });

  it('calls onVisibilityChange when a toggle is clicked', () => {
    render(
      <CustomizePanel
        visibleWidgets={WIDGETS}
        onVisibilityChange={onVisibilityChange}
        initialWidgets={WIDGETS}
      />
    );
    const switches = screen.getAllByRole('switch');
    fireEvent.click(switches[0]);
    expect(onVisibilityChange).toHaveBeenCalledTimes(1);
  });

  it('renders the settings header', () => {
    render(
      <CustomizePanel
        visibleWidgets={WIDGETS}
        onVisibilityChange={onVisibilityChange}
        initialWidgets={WIDGETS}
      />
    );
    expect(screen.getByText('Dashboard Settings')).toBeInTheDocument();
  });
});
