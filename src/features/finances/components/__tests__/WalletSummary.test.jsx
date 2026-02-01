// Unit tests for WalletSummary component
import { describe, it, expect, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '@/test/test-utils';
import WalletSummary from '../WalletSummary';

// Mock API client
vi.mock('@/shared/services/apiClient', () => ({
  default: {
    get: vi.fn(),
  },
}));

import apiClient from '@/shared/services/apiClient';

describe('WalletSummary', () => {
  it('should display wallet balance', async () => {
    const mockWalletData = {
      available: 1000,
      pending: 50,
      nonWithdrawable: 200
    };

    apiClient.get.mockResolvedValueOnce({ data: mockWalletData });

    renderWithProviders(<WalletSummary />);

    await waitFor(() => {
      expect(screen.getByText(/1000/)).toBeInTheDocument();
    });

    expect(screen.getByText(/50/)).toBeInTheDocument();
    expect(screen.getByText(/200/)).toBeInTheDocument();
  });

  it('should show loading state', () => {
    apiClient.get.mockReturnValue(new Promise(() => {})); // Never resolves

    renderWithProviders(<WalletSummary />);

    expect(screen.getByTestId('loading-spinner')).toBeInTheDocument();
  });

  it('should handle error state', async () => {
    apiClient.get.mockRejectedValueOnce(new Error('Network error'));

    renderWithProviders(<WalletSummary />);

    await waitFor(() => {
      expect(screen.getByText(/error/i)).toBeInTheDocument();
    });
  });

  it('should format currency correctly', async () => {
    const mockWalletData = {
      available: 1234.56,
      pending: 0,
      nonWithdrawable: 0
    };

    apiClient.get.mockResolvedValueOnce({ data: mockWalletData });

    renderWithProviders(<WalletSummary />);

    await waitFor(() => {
      expect(screen.getByText(/€1,234.56/)).toBeInTheDocument();
    });
  });

  it('should display zero balance for new users', async () => {
    const mockWalletData = {
      available: 0,
      pending: 0,
      nonWithdrawable: 0
    };

    apiClient.get.mockResolvedValueOnce({ data: mockWalletData });

    renderWithProviders(<WalletSummary />);

    await waitFor(() => {
      expect(screen.getAllByText(/0/).length).toBeGreaterThan(0);
    });
  });
});
