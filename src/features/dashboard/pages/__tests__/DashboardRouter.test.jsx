import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

// Mock child components before imports
vi.mock('../ExecutiveDashboard', () => ({
  default: () => <div data-testid="executive-dashboard">Executive Dashboard</div>
}));

vi.mock('../DashboardNew', () => ({
  default: () => <div data-testid="quick-actions-dashboard">Quick Actions Dashboard</div>
}));

// Mock useAuth — will be configured per test
const mockUseAuth = vi.fn();
vi.mock('@/shared/hooks/useAuth', () => ({
  useAuth: () => mockUseAuth()
}));

import DashboardRouter from '../DashboardRouter';

describe('DashboardRouter — role-based routing', () => {
  it('renders ExecutiveDashboard for admin', () => {
    mockUseAuth.mockReturnValue({ user: { role: 'admin' } });
    render(<DashboardRouter />);
    expect(screen.getByTestId('executive-dashboard')).toBeInTheDocument();
  });

  it('renders ExecutiveDashboard for manager', () => {
    mockUseAuth.mockReturnValue({ user: { role: 'manager' } });
    render(<DashboardRouter />);
    expect(screen.getByTestId('executive-dashboard')).toBeInTheDocument();
  });

  it('renders ExecutiveDashboard for instructor', () => {
    mockUseAuth.mockReturnValue({ user: { role: 'instructor' } });
    render(<DashboardRouter />);
    expect(screen.getByTestId('executive-dashboard')).toBeInTheDocument();
  });

  it('renders ExecutiveDashboard for developer', () => {
    mockUseAuth.mockReturnValue({ user: { role: 'developer' } });
    render(<DashboardRouter />);
    expect(screen.getByTestId('executive-dashboard')).toBeInTheDocument();
  });

  it('renders Quick Actions Dashboard for front_desk (custom role)', () => {
    mockUseAuth.mockReturnValue({ user: { role: 'front_desk' } });
    render(<DashboardRouter />);
    expect(screen.getByTestId('quick-actions-dashboard')).toBeInTheDocument();
  });

  it('renders Quick Actions Dashboard for student', () => {
    mockUseAuth.mockReturnValue({ user: { role: 'student' } });
    render(<DashboardRouter />);
    expect(screen.getByTestId('quick-actions-dashboard')).toBeInTheDocument();
  });

  it('renders Quick Actions Dashboard when no user', () => {
    mockUseAuth.mockReturnValue({ user: null });
    render(<DashboardRouter />);
    expect(screen.getByTestId('quick-actions-dashboard')).toBeInTheDocument();
  });

  it('is case-insensitive for role matching', () => {
    mockUseAuth.mockReturnValue({ user: { role: 'MANAGER' } });
    render(<DashboardRouter />);
    expect(screen.getByTestId('executive-dashboard')).toBeInTheDocument();
  });
});
