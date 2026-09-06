import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// Shop orders admin list (/calendars/shop-orders). The table row leads with the
// product (thumbnail + name) and shows the order number underneath; the customer
// cell shows the full name with the phone number beneath; the old "Items" count
// column is gone. The page chrome is a header bar with counts, a status tab rail
// and a filter bar.

const apiMock = vi.hoisted(() => ({ get: vi.fn(), patch: vi.fn(), delete: vi.fn() }));
const realTime = vi.hoisted(() => ({ on: vi.fn(), off: vi.fn() }));

vi.mock('@/shared/services/apiClient', () => ({ default: apiMock }));
vi.mock('@/shared/services/realTimeService', () => ({ realTimeService: realTime }));
vi.mock('@/shared/utils/antdStatic', () => ({ message: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/shared/contexts/CurrencyContext', () => ({
  useCurrency: () => ({ formatCurrency: (amount, ccy = 'EUR') => `${ccy} ${Number(amount).toFixed(2)}` }),
}));
vi.mock('@/shared/hooks/useProductCategories', () => ({ useProductCategories: () => ({ options: [] }) }));

// Render the desktop columns straight from their definitions so the test exercises
// the real column renderers (and row click wiring) without the responsive
// table-vs-cards machinery.
vi.mock('@/components/ui/ResponsiveTableV2', () => ({
  default: ({ columns, dataSource, rowKey, onRow }) => (
    <table>
      <thead>
        <tr>{columns.map((c) => <th key={c.key}>{c.title}</th>)}</tr>
      </thead>
      <tbody>
        {dataSource.map((record) => (
          <tr key={record[rowKey]} data-testid={`row-${record[rowKey]}`} {...(onRow ? onRow(record) : {})}>
            {columns.map((c) => (
              <td key={c.key}>{c.render ? c.render(record[c.dataIndex], record) : record[c.dataIndex]}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  ),
}));

import OrderManagement from '@/features/dashboard/pages/OrderManagement';
import { OrderMobileCard } from '@/features/dashboard/components/orders/OrderManagementUi';

const order = (overrides) => ({
  id: 1,
  order_number: 'ORD-20260906-0004',
  created_at: '2026-09-06T10:00:00.000Z',
  status: 'confirmed',
  payment_status: 'completed',
  payment_method: 'cash',
  total_amount: '5.20',
  currency: 'EUR',
  user_id: 'u-metin',
  // Customer's non-zero wallet balances from the admin list query (null = all zero).
  customer_balances: null,
  first_name: 'Metin',
  last_name: 'Kaya',
  email: 'metin@example.com',
  phone: '+90 532 000 00 00',
  item_count: 1,
  items: [{ id: 11, product_name: 'Wax Comb', product_image: 'https://cdn.example.com/wax-comb.webp', quantity: 1 }],
  ...overrides,
});

const STATS = {
  total_orders: 124,
  pending_count: 2,
  confirmed_count: 99,
  processing_count: 0,
  shipped_count: 1,
  delivered_count: 7,
  total_revenue: '4120.00',
};

// Did any list request since the last mockClear carry this query fragment?
const listQueriedWith = (fragment) =>
  apiMock.get.mock.calls.some(([url]) => url.startsWith('/shop-orders/admin/all') && url.includes(fragment));

const renderPage = async (orders, { lowStock = [], embedded = false } = {}) => {
  apiMock.get.mockImplementation((url) => {
    if (url.startsWith('/shop-orders/admin/all')) {
      return Promise.resolve({ data: { orders, total: orders.length, stats: STATS } });
    }
    if (url === '/shop-orders/admin/low-stock') return Promise.resolve({ data: { products: lowStock } });
    return Promise.reject(new Error(`unexpected GET ${url}`));
  });
  render(
    <MemoryRouter>
      <OrderManagement embedded={embedded} />
    </MemoryRouter>
  );
  await screen.findByTestId(`row-${orders[0].id}`);
};

describe('OrderManagement — orders table columns', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('leads the Order cell with the product name and image, and puts the order number underneath', async () => {
    await renderPage([order()]);
    const row = screen.getByTestId('row-1');

    const name = within(row).getByText('Wax Comb');
    const number = within(row).getByText(/ORD-20260906-0004/);
    expect(name.compareDocumentPosition(number) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    const image = within(row).getByTestId('order-item-image').querySelector('img');
    expect(image).toHaveAttribute('src', 'https://cdn.example.com/wax-comb.webp');
    expect(within(row).queryByTestId('order-item-placeholder')).toBeNull();
  });

  it('shows a placeholder when no line item has an image', async () => {
    await renderPage([order({ items: [{ id: 11, product_name: 'Leash', product_image: null, quantity: 1 }] })]);
    const row = screen.getByTestId('row-1');

    const placeholder = within(row).getByTestId('order-item-placeholder');
    expect(placeholder.querySelector('img')).toBeNull();
    expect(placeholder.querySelector('.anticon-shopping-cart')).not.toBeNull();
    expect(within(row).getByText('Leash')).toBeInTheDocument();
  });

  it('names the first product and counts the rest for multi-item orders', async () => {
    await renderPage([
      order({
        items: [
          { id: 11, product_name: 'Harness', product_image: null, quantity: 1 },
          { id: 12, product_name: 'Bar', product_image: 'https://cdn.example.com/bar.webp', quantity: 1 },
          { id: 13, product_name: 'Lines', product_image: null, quantity: 2 },
        ],
      }),
    ]);
    const row = screen.getByTestId('row-1');

    expect(within(row).getByText('Harness')).toBeInTheDocument();
    expect(within(row).getByText('+2 more')).toBeInTheDocument();
    // The thumbnail comes from the first item that actually has a picture.
    expect(within(row).getByTestId('order-item-image').querySelector('img')).toHaveAttribute('src', 'https://cdn.example.com/bar.webp');
  });

  it('shows the customer full name with the phone number underneath', async () => {
    await renderPage([order()]);
    const row = screen.getByTestId('row-1');

    const name = within(row).getByText('Metin Kaya');
    const phone = within(row).getByText('+90 532 000 00 00');
    expect(name.compareDocumentPosition(phone) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(row).queryByText('Metin K.')).toBeNull();
  });

  it('falls back to a dash when the customer has no phone and to Guest when there is no user', async () => {
    await renderPage([
      order({ id: 1, phone: null }),
      order({ id: 2, first_name: null, last_name: null, email: null, phone: null, order_number: 'ORD-20260906-0005' }),
    ]);

    expect(within(screen.getByTestId('row-1')).getByText('—')).toBeInTheDocument();
    expect(within(screen.getByTestId('row-2')).getByText('Guest')).toBeInTheDocument();
  });

  it('shows "Paid" with the method underneath only when money actually arrived (staff cash / card / online card)', async () => {
    await renderPage([
      order({ id: 1, payment_method: 'cash' }),
      order({ id: 2, payment_method: 'card', order_number: 'ORD-20260906-0005' }),
      order({ id: 3, payment_method: 'credit_card', order_number: 'ORD-20260906-0006' }),
    ]);

    for (const [id, method] of [[1, 'Cash'], [2, 'Card'], [3, 'Credit Card']]) {
      const row = screen.getByTestId(`row-${id}`);
      expect(within(row).getByText('Paid')).toBeInTheDocument();
      expect(within(row).getByText(method)).toBeInTheDocument();
      expect(within(row).queryByText('On account')).toBeNull();
    }
    expect(within(screen.getByTestId('row-1')).getByText('Confirmed')).toBeInTheDocument();
    expect(within(screen.getByTestId('row-1')).getByText('EUR 5.20')).toBeInTheDocument();
  });

  it('shows a wallet-charged order as "On account" with what the customer still owes', async () => {
    // payment_status is "completed" because the tab was debited, but the customer
    // has not paid: their wallet is €120 in the red (and 500 TRY too).
    await renderPage([
      order({
        payment_method: 'wallet',
        payment_status: 'completed',
        customer_balances: [{ currency: 'EUR', amount: '-120.00' }, { currency: 'TRY', amount: '-500.00' }],
      }),
    ]);
    const row = screen.getByTestId('row-1');

    expect(within(row).getByText('On account')).toBeInTheDocument();
    expect(within(row).queryByText('Paid')).toBeNull();
    expect(within(row).getByTestId('wallet-owes')).toHaveTextContent('Owes EUR 120.00 + TRY 500.00');
    // The method label is replaced by the settlement line for on-account orders.
    expect(within(row).queryByText('Wallet')).toBeNull();
  });

  it('shows "Settled" under an on-account order once the customer wallet is no longer negative', async () => {
    await renderPage([
      order({ id: 1, payment_method: 'wallet', customer_balances: null }),
      order({ id: 2, payment_method: 'wallet', customer_balances: [{ currency: 'EUR', amount: '35.50' }], order_number: 'ORD-20260906-0005' }),
    ]);

    for (const id of [1, 2]) {
      const row = screen.getByTestId(`row-${id}`);
      expect(within(row).getByText('On account')).toBeInTheDocument();
      expect(within(row).getByTestId('wallet-settled')).toHaveTextContent('Settled');
      expect(within(row).queryByTestId('wallet-owes')).toBeNull();
    }
  });

  it('keeps pending / awaiting-transfer / refunded wording for the other payment states', async () => {
    await renderPage([
      order({ id: 1, payment_method: 'cash', payment_status: 'pending' }),
      order({ id: 2, payment_method: 'bank_transfer', payment_status: 'waiting_payment', order_number: 'ORD-20260906-0005' }),
      order({ id: 3, payment_method: 'wallet', payment_status: 'refunded', order_number: 'ORD-20260906-0006' }),
    ]);

    expect(within(screen.getByTestId('row-1')).getByText('Pending')).toBeInTheDocument();
    expect(within(screen.getByTestId('row-2')).getByText('Awaiting transfer')).toBeInTheDocument();
    expect(within(screen.getByTestId('row-3')).getByText('Refunded')).toBeInTheDocument();
    expect(screen.queryByText('On account')).toBeNull();
  });

  it('no longer renders the Items count column', async () => {
    await renderPage([order({ item_count: 7 })]);

    expect(screen.queryByRole('columnheader', { name: 'Items' })).toBeNull();
    expect(screen.getByRole('columnheader', { name: 'Order' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Customer' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Total' })).toBeInTheDocument();
  });

  it('opens details from the row but not from the actions menu button', async () => {
    await renderPage([order()]);
    apiMock.get.mockClear();

    fireEvent.click(screen.getByRole('button', { name: 'Order actions' }));
    expect(apiMock.get).not.toHaveBeenCalledWith('/shop-orders/1');

    fireEvent.click(screen.getByText('Wax Comb'));
    await waitFor(() => expect(apiMock.get).toHaveBeenCalledWith('/shop-orders/1'));
  });
});

describe('OrderManagement — page chrome', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows the header with revenue and clickable counts on the standalone page', async () => {
    await renderPage([order()], { lowStock: [{ id: 'p1', name: 'Wax Comb', stock_quantity: 2 }] });

    expect(screen.getByRole('heading', { name: 'Shop Orders' })).toBeInTheDocument();
    expect(screen.getByText('EUR 4120.00')).toBeInTheDocument();
    expect(screen.getByTestId('header-chip-pending')).toHaveTextContent('2pending');
    const strip = screen.getByText('Low stock').closest('div');
    expect(within(strip).getByText('Wax Comb')).toBeInTheDocument();
    expect(within(strip).getByText(/2 left/)).toBeInTheDocument();
  });

  it('hides the header when embedded but keeps the status rail and a refresh button', async () => {
    await renderPage([order()], { embedded: true });

    expect(screen.queryByRole('heading', { name: 'Shop Orders' })).toBeNull();
    expect(screen.getByRole('tab', { name: /^All/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Refresh/ })).toBeInTheDocument();
  });

  it('status tabs carry counts and re-query the list with that status', async () => {
    await renderPage([order()]);
    const pendingTab = screen.getByRole('tab', { name: /^Pending/ });
    expect(pendingTab).toHaveTextContent('2');
    expect(screen.getByRole('tab', { name: /^All/ })).toHaveAttribute('aria-selected', 'true');

    apiMock.get.mockClear();
    fireEvent.click(pendingTab);

    await waitFor(() => expect(listQueriedWith('status=pending')).toBe(true));
    expect(pendingTab).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('header-chip-pending')).toHaveAttribute('aria-pressed', 'true');
  });
});

describe('OrderMobileCard', () => {
  it('shows product, order number, customer with phone, total and status', () => {
    const onAction = vi.fn();
    render(
      <OrderMobileCard
        record={order({ items: [{ id: 11, product_name: 'Harness', product_image: null }, { id: 12, product_name: 'Bar', product_image: null }] })}
        onAction={onAction}
        formatCurrency={(a, c) => `${c} ${Number(a).toFixed(2)}`}
      />
    );

    expect(screen.getByText('Harness')).toBeInTheDocument();
    expect(screen.getByText('+1 more')).toBeInTheDocument();
    expect(screen.getByText(/ORD-20260906-0004/)).toBeInTheDocument();
    expect(screen.getByText('Metin Kaya')).toBeInTheDocument();
    expect(screen.getByText('+90 532 000 00 00')).toBeInTheDocument();
    expect(screen.getByText('EUR 5.20')).toBeInTheDocument();
    expect(screen.getByText('Confirmed')).toBeInTheDocument();
    expect(screen.getByTestId('order-item-placeholder')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button'));
    expect(onAction).toHaveBeenCalledWith('view', expect.objectContaining({ id: 1 }));
  });
});
