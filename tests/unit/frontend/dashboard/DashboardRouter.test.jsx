import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

// Mock child components before imports
vi.mock('@/features/dashboard/pages/AdminDashboard', () => ({
  default: () => <div data-testid="admin-dashboard">Admin Dashboard</div>
}));

vi.mock('@/features/dashboard/pages/FrontDeskDashboard', () => ({
  default: () => <div data-testid="front-desk-dashboard">Front Desk Dashboard</div>
}));

// Mock useAuth — will be configured per test
const mockUseAuth = vi.fn();
vi.mock('@/shared/hooks/useAuth', () => ({
  useAuth: () => mockUseAuth()
}));

import DashboardRouter from '@/features/dashboard/pages/DashboardRouter';

describe('DashboardRouter — role-based routing', () => {
  it('renders AdminDashboard for admin', () => {
    mockUseAuth.mockReturnValue({ user: { role: 'admin' } });
    render(<DashboardRouter />);
    expect(screen.getByTestId('admin-dashboard')).toBeInTheDocument();
  });

  it('renders AdminDashboard for manager', () => {
    mockUseAuth.mockReturnValue({ user: { role: 'manager' } });
    render(<DashboardRouter />);
    expect(screen.getByTestId('admin-dashboard')).toBeInTheDocument();
  });

  it('renders AdminDashboard for instructor', () => {
    mockUseAuth.mockReturnValue({ user: { role: 'instructor' } });
    render(<DashboardRouter />);
    expect(screen.getByTestId('admin-dashboard')).toBeInTheDocument();
  });

  it('renders AdminDashboard for developer', () => {
    mockUseAuth.mockReturnValue({ user: { role: 'developer' } });
    render(<DashboardRouter />);
    expect(screen.getByTestId('admin-dashboard')).toBeInTheDocument();
  });

  it('renders FrontDeskDashboard for front_desk (custom role)', () => {
    mockUseAuth.mockReturnValue({ user: { role: 'front_desk' } });
    render(<DashboardRouter />);
    expect(screen.getByTestId('front-desk-dashboard')).toBeInTheDocument();
  });

  it('renders FrontDeskDashboard for student', () => {
    mockUseAuth.mockReturnValue({ user: { role: 'student' } });
    render(<DashboardRouter />);
    expect(screen.getByTestId('front-desk-dashboard')).toBeInTheDocument();
  });

  it('renders FrontDeskDashboard when no user', () => {
    mockUseAuth.mockReturnValue({ user: null });
    render(<DashboardRouter />);
    expect(screen.getByTestId('front-desk-dashboard')).toBeInTheDocument();
  });

  it('is case-insensitive for role matching', () => {
    mockUseAuth.mockReturnValue({ user: { role: 'MANAGER' } });
    render(<DashboardRouter />);
    expect(screen.getByTestId('admin-dashboard')).toBeInTheDocument();
  });
});
