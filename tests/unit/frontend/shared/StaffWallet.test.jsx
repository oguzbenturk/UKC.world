import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Staff wallet (owner decisions 2026-10-08): earnings panel in My Wallet and
// "Pay with my earnings" in the shop checkout.
import '../../../setup/i18nForTests';

const apiMock = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
const summaryState = vi.hoisted(() => ({ data: null }));

vi.mock('@/shared/services/apiClient', () => ({
  default: apiMock,
  resolveApiBaseUrl: () => '',
  getAccessToken: () => 'token',
}));
vi.mock('@/shared/contexts/CurrencyContext', () => ({
  useCurrency: () => ({
    formatCurrency: (amount) => `€${Number(amount).toFixed(2)}`,
    convertCurrency: (v) => v,
    businessCurrency: 'EUR',
    userCurrency: 'EUR',
  }),
}));
vi.mock('@/shared/hooks/useWalletSummary', () => ({
  useWalletSummary: () => summaryState,
}));
const cartApi = vi.hoisted(() => ({
  cart: [{ id: 'p1', name: 'Tee', quantity: 1, price: 50 }],
  getCartTotal: () => 50,
  getCartCount: () => 1,
  clearCart: () => {},
}));
vi.mock('@/shared/contexts/CartContext', () => ({
  useCart: () => cartApi,
}));
// Stable object: CheckoutModal re-runs an effect whenever `user` changes identity.
const authState = vi.hoisted(() => ({
  value: { user: { id: 'u1', role: 'instructor', address: 'Street 1', city: 'Urla', country: 'TR', zip_code: '35430' } },
}));
vi.mock('@/shared/hooks/useAuth', () => ({
  useAuth: () => authState.value,
}));

vi.mock('@/shared/hooks/useWalletTransactions', () => ({
  useWalletTransactions: () => ({ data: { results: [] }, isLoading: false, refetch: vi.fn() }),
}));
vi.mock('@/shared/hooks/useRealTime', () => ({ useRealTimeSync: () => {} }));
vi.mock('@/features/finances/components/WalletDepositModal', () => ({ WalletDepositModal: () => null }));
vi.mock('@/features/finances/components/BankTransferModal', () => ({ BankTransferModal: () => null }));

import { App } from 'antd';
import StaffEarningsPanel from '@/shared/components/wallet/StaffEarningsPanel';
import StudentWalletModal from '@/features/students/components/StudentWalletModal';
import CheckoutModal from '@/features/students/components/CheckoutModal';

const EARNINGS = { currency: 'EUR', earned: 300, paidOut: 100, spentInApp: 50, deducted: 20, available: 130, startDate: '2026-10-08' };

const wrap = (ui) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
};

beforeEach(() => {
  vi.clearAllMocks();
  summaryState.data = null;
  apiMock.get.mockImplementation((url) => {
    if (url === '/wallet/earnings-activity') {
      return Promise.resolve({ data: { items: [
        { kind: 'earned', source: 'lesson', id: 'l1', date: '2026-10-07', amount: 100, label: 'Private kite', detail: 'Hazal' },
        { kind: 'spent', source: 'payroll', id: 's1', date: '2026-10-08', amount: 50, label: 'Spent in app — Shop order #1', detail: 'earnings' },
      ] } });
    }
    return Promise.resolve({ data: [] });
  });
});

describe('StaffEarningsPanel', () => {
  it('renders nothing without earnings (receptionist / customer)', () => {
    const { container } = wrap(<StaffEarningsPanel earnings={null} open />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows available earnings, the breakdown and the history', async () => {
    wrap(<StaffEarningsPanel earnings={EARNINGS} open />);
    expect(screen.getByTestId('staff-earnings-available')).toHaveTextContent('€130.00');
    expect(screen.getByText('€300.00')).toBeInTheDocument();
    expect(screen.getByText('€100.00')).toBeInTheDocument();
    expect(screen.getByText('Deductions: €20.00')).toBeInTheDocument();
    expect(await screen.findByText('Spent in app — Shop order #1')).toBeInTheDocument();
    expect(screen.getByText('Private kite')).toBeInTheDocument();
  });
});

describe('CheckoutModal — Pay with my earnings', () => {
  it('is not offered to users without earnings', () => {
    wrap(<CheckoutModal visible onClose={vi.fn()} userBalance={0} />);
    expect(screen.queryByText('Pay with my earnings')).not.toBeInTheDocument();
  });

  it('pays the order with earnings', async () => {
    summaryState.data = { earnings: EARNINGS };
    apiMock.post.mockResolvedValue({ data: { success: true, order: { id: 7, order_number: 'ORD-1', payment_status: 'completed' } } });
    wrap(<CheckoutModal visible onClose={vi.fn()} userBalance={0} />);
    fireEvent.click(screen.getByText('Pay with my earnings'));
    fireEvent.click(screen.getByRole('button', { name: /Pay €50/ }));
    // antd Modal.confirm (rendered in a portal)
    expect(await screen.findByText('Confirm Order')).toBeInTheDocument();
    fireEvent.click(await screen.findByRole('button', { name: 'Place Order' }));
    await waitFor(() => expect(apiMock.post).toHaveBeenCalledWith('/shop-orders', expect.objectContaining({
      payment_method: 'earnings',
      use_wallet: false,
    })));
  });

  it('cannot pay when the earnings do not cover the order', () => {
    summaryState.data = { earnings: { ...EARNINGS, available: 20 } };
    wrap(<CheckoutModal visible onClose={vi.fn()} userBalance={0} />);
    expect(screen.getByText('Not enough')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Pay with my earnings'));
    expect(screen.getByRole('button', { name: /Pay €50/ })).toBeDisabled();
  });
});

describe('My Wallet header for staff', () => {
  const renderModal = (props) => wrap(<App><StudentWalletModal open onClose={() => {}} currency={{ code: 'EUR' }} {...props} /></App>);

  it('shows wallet credit + earnings as one total, with the split', async () => {
    renderModal({ balance: 20, earnings: EARNINGS });
    expect(await screen.findByText('Total you can spend')).toBeInTheDocument();
    expect(screen.getByText('€150.00')).toBeInTheDocument();
    expect(screen.getByText('€20.00 wallet credit · €130.00 earnings')).toBeInTheDocument();
  });

  it('keeps the plain balance for customers', async () => {
    renderModal({ balance: 20, earnings: null });
    expect(await screen.findByText('Available Balance')).toBeInTheDocument();
    expect(screen.queryByText('Total you can spend')).not.toBeInTheDocument();
  });
});
