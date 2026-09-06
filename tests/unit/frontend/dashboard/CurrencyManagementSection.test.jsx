import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';

// Settings → Currency. The scenario behind these tests (prod, 2026-09-05): the admin
// wanted to set "the euro rate" (1 EUR = 57.085 TRY) and typed it on the EUR/base row.
// The base row is now locked, so the same rate has to be editable where the admin
// actually reads it — the "EUR → TRY" customer-rate card — and the base row has to say
// where the euro rate lives.

const apiMock = vi.hoisted(() => ({ get: vi.fn(), put: vi.fn(), post: vi.fn() }));
const toastMock = vi.hoisted(() => ({ showSuccess: vi.fn(), showError: vi.fn() }));
const refreshRates = vi.hoisted(() => vi.fn());

vi.mock('@/shared/services/apiClient', () => ({ default: apiMock }));
vi.mock('@/shared/contexts/ToastContext', () => ({ useToast: () => toastMock }));
vi.mock('@/shared/contexts/CurrencyContext', () => ({ useCurrency: () => ({ refreshRates }) }));

import CurrencyManagementSection from '@/features/dashboard/components/CurrencyManagementSection';

const currency = (overrides) => ({
  name: overrides.code,
  symbol: overrides.code,
  raw_rate: overrides.exchange_rate,
  rate_margin_percent: '0.000',
  base_currency: false,
  is_active: true,
  auto_update_enabled: true,
  update_frequency_hours: 1,
  last_updated_at: '2026-09-05T04:00:00.000Z',
  last_update_status: 'success',
  last_update_source: 'yahoo',
  ...overrides,
});

const CURRENCIES = [
  currency({ code: 'EUR', name: 'Euro', exchange_rate: '1.0000', base_currency: true, auto_update_enabled: false, last_update_source: 'open_er' }),
  currency({ code: 'TRY', name: 'Turkish Lira', exchange_rate: '56.2512', auto_update_enabled: false, update_frequency_hours: 4 }),
  currency({ code: 'USD', name: 'US Dollar', exchange_rate: '1.1621' }),
];

const renderSection = async () => {
  render(<CurrencyManagementSection />);
  // The card only renders once /currencies has loaded.
  await screen.findByRole('button', { name: 'Edit EUR → TRY rate' });
};

describe('CurrencyManagementSection — editing the euro rate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiMock.get.mockResolvedValue({ data: CURRENCIES });
    apiMock.put.mockResolvedValue({
      data: { message: 'Rate updated for TRY. Auto-update is now off for this currency so your manual rate is kept.', autoUpdateDisabled: true },
    });
  });

  it('lets the admin type 1 EUR = X TRY on the customer-rate card and saves it to the TRY row', async () => {
    await renderSection();

    fireEvent.click(screen.getByRole('button', { name: 'Edit EUR → TRY rate' }));

    const input = screen.getByRole('spinbutton', { name: '1 EUR = ? TRY' });
    expect(input).toHaveValue(56.2512);

    fireEvent.change(input, { target: { value: '57.085' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save TRY rate' }));

    await waitFor(() =>
      expect(apiMock.put).toHaveBeenCalledWith('/currencies/TRY/rate', { exchangeRate: 57.085 })
    );
    // Never touches the base currency — that is what skewed every conversion in prod.
    expect(apiMock.put).not.toHaveBeenCalledWith(expect.stringContaining('/currencies/EUR/'), expect.anything());

    await waitFor(() => expect(toastMock.showSuccess).toHaveBeenCalledWith(expect.stringContaining('Auto-update is now off')));
    // Re-fetches and pushes the new rate into the app-wide CurrencyContext.
    await waitFor(() => expect(apiMock.get).toHaveBeenCalledTimes(2));
    expect(refreshRates).toHaveBeenCalled();
    // Back to display mode.
    expect(screen.queryByRole('spinbutton', { name: '1 EUR = ? TRY' })).not.toBeInTheDocument();
  });

  it('saves on Enter and cancels on Escape', async () => {
    await renderSection();

    fireEvent.click(screen.getByRole('button', { name: 'Edit EUR → TRY rate' }));
    const input = screen.getByRole('spinbutton', { name: '1 EUR = ? TRY' });
    fireEvent.change(input, { target: { value: '58' } });
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(screen.queryByRole('spinbutton', { name: '1 EUR = ? TRY' })).not.toBeInTheDocument();
    expect(apiMock.put).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Edit EUR → TRY rate' }));
    const again = screen.getByRole('spinbutton', { name: '1 EUR = ? TRY' });
    fireEvent.change(again, { target: { value: '58' } });
    fireEvent.keyDown(again, { key: 'Enter' });

    await waitFor(() =>
      expect(apiMock.put).toHaveBeenCalledWith('/currencies/TRY/rate', { exchangeRate: 58 })
    );
  });

  it('refuses a zero/negative/empty rate without calling the API', async () => {
    await renderSection();

    fireEvent.click(screen.getByRole('button', { name: 'Edit EUR → TRY rate' }));
    const input = screen.getByRole('spinbutton', { name: '1 EUR = ? TRY' });

    for (const bad of ['0', '-5', '']) {
      fireEvent.change(input, { target: { value: bad } });
      fireEvent.click(screen.getByRole('button', { name: 'Save TRY rate' }));
    }

    expect(apiMock.put).not.toHaveBeenCalled();
    expect(toastMock.showError).toHaveBeenCalledTimes(3);
    // Still in edit mode so the admin can correct the value.
    expect(screen.getByRole('spinbutton', { name: '1 EUR = ? TRY' })).toBeInTheDocument();
  });

  it('surfaces the server error (e.g. base-currency refusal) and stays editable', async () => {
    apiMock.put.mockRejectedValueOnce({ response: { data: { error: 'EUR is the base currency; its rate is always 1.0 and cannot be edited' } } });
    await renderSection();

    fireEvent.click(screen.getByRole('button', { name: 'Edit EUR → USD rate' }));
    fireEvent.change(screen.getByRole('spinbutton', { name: '1 EUR = ? USD' }), { target: { value: '1.2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save USD rate' }));

    await waitFor(() => expect(toastMock.showError).toHaveBeenCalledWith(expect.stringContaining('base currency')));
    expect(toastMock.showSuccess).not.toHaveBeenCalled();
  });

  it('keeps the base row read-only but tells the admin where the euro rate is edited', async () => {
    await renderSection();

    const table = screen.getAllByRole('table')[0]; // active-currencies table
    const eurRow = within(table).getByText('Euro').closest('tr');
    expect(within(eurRow).getByText('base')).toBeInTheDocument();
    expect(within(eurRow).getByText('1 EUR = 56.2512 TRY — change it on the TRY row')).toBeInTheDocument();
    expect(within(eurRow).queryByTitle('Edit rate')).not.toBeInTheDocument();

    // The non-base rows do have the pencil.
    const tryRow = within(table).getByText('Turkish Lira').closest('tr');
    expect(within(tryRow).getByTitle('Edit rate')).toBeInTheDocument();
  });

  it('shows the stored rate as "1 EUR = X TRY" and flags a currency whose auto-update is off', async () => {
    await renderSection();

    expect(screen.getByText('1 EUR = 56.2512 TRY')).toBeInTheDocument();
    expect(screen.getByText('Auto-update: off')).toBeInTheDocument(); // TRY, pinned by the admin
    expect(screen.getByText('Auto-update: every 1h')).toBeInTheDocument(); // USD, still live
  });
});
