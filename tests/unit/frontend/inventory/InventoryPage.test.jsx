import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// ── Mocks ───────────────────────────────────────────────────────────────────

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    // Strip the namespace and append interpolated values so assertions can
    // target a key without pulling the locale files in.
    t: (key, opts) => {
      const base = key.replace(/^common:/, '');
      if (opts?.count !== undefined) return `${base}:${opts.count}`;
      if (opts?.names !== undefined) return `${base}:${opts.names}`;
      if (opts?.units !== undefined) return `${base}:${opts.units}/${opts.models}`;
      if (opts?.total !== undefined) return `${base}:${opts.total}`;
      if (opts?.code !== undefined) return `${base}:${opts.code}`;
      return base;
    },
    i18n: { language: 'en' },
  }),
}));

vi.mock('@/shared/hooks/useAuth', () => ({
  useAuth: () => ({ user: { role: 'admin', permissions: {} } }),
}));

const equipment = [
  // Five spellings of the same Duotone kite model, the case that scattered rows.
  { id: 1, type: 'kite', brand: 'Duotone', name: 'Mono', size: '9m', condition: 'good', availability: 'available', serial_number: 'K-001' },
  { id: 2, type: 'kite', brand: 'Duotone', name: 'Mono 22', size: '9m', condition: 'fair', availability: 'maintenance', serial_number: 'K-002' },
  { id: 3, type: 'kite', brand: 'Duotone', name: 'Mono 22 Kite', size: '7m', condition: 'good', availability: 'available', serial_number: 'K-003' },
  { id: 4, type: 'kite', brand: 'Duotone', name: 'Mono 24', size: '11m', condition: 'new', availability: 'in-use', serial_number: 'K-004' },
  { id: 5, type: 'kite', brand: 'Duotone', name: 'Mono 25', size: '5m', condition: 'new', availability: 'available', serial_number: 'K-005' },
  // A different model line must stay its own row.
  { id: 6, type: 'kite', brand: 'Duotone', name: 'Evo SLS', size: '9m', condition: 'good', availability: 'available', serial_number: 'K-006' },
  // Brand-only wetsuit spellings.
  { id: 7, type: 'wetsuit', brand: 'Tribord', name: 'Tribord', size: 'S', condition: 'good', availability: 'available', serial_number: 'W-001' },
  { id: 8, type: 'wetsuit', brand: 'Tribord', name: 'Tribord Wetsuit', size: 'M', condition: 'good', availability: 'available', serial_number: 'W-002' },
  { id: 9, type: 'wetsuit', brand: 'Tribord', name: 'Wetsuit Tribord', size: 'xl', condition: 'poor', availability: 'retired', serial_number: 'W-003' },
  // Board dimension strings are banded, not used raw as columns.
  { id: 10, type: 'board', brand: 'Duotone', name: 'Board Gonzales', size: '138x41.5cm', condition: 'good', availability: 'available', serial_number: 'B-001' },
  { id: 11, type: 'board', brand: 'Duotone', name: 'Board Gonzales', size: '151x44cm', condition: 'good', availability: 'available', serial_number: 'B-002' },
];

const refreshData = vi.fn();
const patchEquipment = vi.fn();
vi.mock('@/shared/hooks/useData', () => ({
  useData: () => ({ equipment, loading: false, error: null, refreshData, patchEquipment }),
}));

vi.mock('@/shared/services/apiClient', () => ({
  default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
}));

vi.mock('@/shared/utils/antdStatic', () => ({
  message: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));

import InventoryPage from '@/features/inventory/pages/InventoryPage';
import apiClient from '@/shared/services/apiClient';
import { message } from '@/shared/utils/antdStatic';

// ── Helpers ─────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
});

// Filters live in the URL, so the page needs a router.
const renderPage = (route = '/inventory') =>
  render(
    <MemoryRouter initialEntries={[route]}>
      <InventoryPage />
    </MemoryRouter>
  );

// Sections start collapsed; open the one named by the type and scope queries to it.
const sectionFor = (typeKey) => {
  const label = screen.getAllByText(`inventory.types.${typeKey}`).find((el) => el.closest('.ant-collapse-header'));
  const item = label.closest('.ant-collapse-item');
  if (!item.classList.contains('ant-collapse-item-active')) fireEvent.click(label.closest('.ant-collapse-header'));
  return within(item);
};
const kiteSection = () => sectionFor('kite');

const sizeChips = (scope = screen) => scope.getAllByTestId('size-chip').map((el) => el.textContent);
const columnHeaders = (scope = screen) => scope.getAllByRole('columnheader').map((th) => th.textContent);
const monoRowIn = (scope) => scope.getByText('Mono').closest('tr');

// ── Tests ───────────────────────────────────────────────────────────────────

describe('InventoryPage grouping and size grid', () => {
  test('sections start collapsed', () => {
    renderPage();
    expect(document.querySelectorAll('.ant-collapse-item')).toHaveLength(3);
    expect(document.querySelector('.ant-collapse-item-active')).toBeNull();
    expect(screen.queryByText('Mono')).not.toBeInTheDocument();
  });

  test('folds every "Mono" spelling into one row and lists the spellings', () => {
    renderPage();

    const kites = kiteSection();
    // One model row for Mono, one for Evo SLS; none of the year-suffixed spellings
    // appear as their own row.
    expect(kites.getAllByText('Mono')).toHaveLength(1);
    expect(kites.queryByText('Mono 22')).not.toBeInTheDocument();
    expect(kites.queryByText('Mono 24')).not.toBeInTheDocument();
    expect(kites.getByText('Evo SLS')).toBeInTheDocument();
    expect(kites.getByText('inventory.spellingsCount:5')).toBeInTheDocument();
    // 2 models in the kite section.
    expect(kites.getByText('inventory.modelsCount:2')).toBeInTheDocument();
  });

  test('each model row lists only its own sizes, in numeric order, with counts', () => {
    renderPage();

    const kites = kiteSection();
    expect(sizeChips(within(monoRowIn(kites)))).toEqual(['5m1', '7m1', '9m2', '11m1']);
    expect(sizeChips(within(kites.getByText('Evo SLS').closest('tr')))).toEqual(['9m1']);
  });

  test('the size matrix view has one column per size with column totals', () => {
    renderPage();

    fireEvent.click(screen.getByTitle('inventory.viewMatrix'));

    const headers = columnHeaders(kiteSection());
    // Model | 5m | 7m | 9m | 11m | Total | Status | Actions, sizes carry their totals.
    expect(headers.slice(1, 5)).toEqual(['5m1', '7m1', '9m3', '11m1']);
    expect(localStorage.setItem).toHaveBeenCalledWith('ukc:inventory:view', '"matrix"');
  });

  test('turning off merge shows the exact entered names again', () => {
    renderPage();

    fireEvent.click(screen.getByRole('switch'));

    const kites = kiteSection();
    expect(kites.getByText('Mono 22')).toBeInTheDocument();
    expect(kites.getByText('Mono 22 Kite')).toBeInTheDocument();
    expect(kites.getByText('inventory.modelsCount:6')).toBeInTheDocument();
    // The setup file stubs localStorage with mocks, so assert on the write itself.
    expect(localStorage.setItem).toHaveBeenCalledWith('ukc:inventory:mergeVariants', 'false');
  });

  test('brand-only wetsuit spellings and case-different sizes merge', () => {
    renderPage();

    const wetsuits = sectionFor('wetsuit');
    expect(wetsuits.getByText('inventory.modelsCount:1')).toBeInTheDocument();
    expect(sizeChips(wetsuits)).toEqual(['S1', 'M1', 'XL1']);
  });

  test('boards are bucketed into length bands', () => {
    renderPage();

    expect(sizeChips(sectionFor('board'))).toEqual(['inventory.bands.medium1', 'inventory.bands.xl1']);
  });

  test('clicking a size chip opens the drawer narrowed to that size', () => {
    renderPage();

    const kites = kiteSection();
    // The 9m chip of the Mono row holds 2 units (one in maintenance); the third 9m
    // kite is the Evo SLS in its own row.
    fireEvent.click(within(monoRowIn(kites)).getByText('9m'));

    const drawer = within(document.querySelector('.ant-drawer'));
    expect(drawer.getByText('inventory.size: 9m')).toBeInTheDocument();
    // Entered-name column is present because the group merged spellings.
    expect(drawer.getByText('inventory.enteredName')).toBeInTheDocument();
    expect(drawer.getByText('K-001')).toBeInTheDocument();
    expect(drawer.getByText('K-002')).toBeInTheDocument();
    expect(drawer.queryByText('K-003')).not.toBeInTheDocument();
  });

  test('category chips filter to one type and render it flat', () => {
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: /^inventory\.types\.wetsuit/ }));

    expect(document.querySelector('.ant-collapse')).toBeNull();
    // All three spellings appear once, so the shortest ("Tribord") labels the row;
    // it also shows as the brand line, hence getAll.
    expect(screen.getAllByText('Tribord').length).toBeGreaterThan(0);
    expect(screen.getByText('inventory.spellingsCount:3')).toBeInTheDocument();
    expect(screen.queryByText('Mono')).not.toBeInTheDocument();
  });
});

describe('InventoryPage filters', () => {
  test('a size chip narrows the grid to that size', () => {
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: /^inventory\.types\.kite/ }));
    // The size rail appears for the selected type, ordered numerically.
    const rail = ['5m', '7m', '9m', '11m'].map((s) => screen.getByRole('button', { name: new RegExp(`^${s}`) }));
    expect(rail).toHaveLength(4);

    fireEvent.click(rail[1]);

    expect(rail[1]).toHaveAttribute('aria-pressed', 'true');
    // Only the Mono row remains (Evo SLS has no 7m) and it shows only its 7m.
    expect(sizeChips()).toEqual(['7m1']);
    expect(screen.queryByText('Evo SLS')).not.toBeInTheDocument();
    expect(screen.getByText(/inventory\.resultSummary:1\/1/)).toBeInTheDocument();
  });

  test('filters in the URL are applied on load', () => {
    renderPage('/inventory?type=wetsuit&size=M');

    expect(document.querySelector('.ant-collapse')).toBeNull();
    expect(sizeChips()).toEqual(['M1']);
    expect(screen.getByText(/inventory\.resultSummary:1\/1/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^M/ })).toHaveAttribute('aria-pressed', 'true');
  });

  test('the maintenance stat chip toggles the status filter', () => {
    renderPage();

    const chip = screen.getByRole('button', { name: /inventory\.statMaintenance/ });
    fireEvent.click(chip);

    expect(chip).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText(/inventory\.resultSummary:1\/1/)).toBeInTheDocument();
    expect(screen.queryByText('inventory.types.wetsuit')).not.toBeInTheDocument();

    fireEvent.click(chip);
    expect(chip).toHaveAttribute('aria-pressed', 'false');
    // 11 units in 4 models: Mono, Evo SLS, Tribord, Board Gonzales.
    expect(screen.getByText('inventory.resultSummary:11/4')).toBeInTheDocument();
  });

  test('quick status toggle PUTs only the availability and patches the list', async () => {
    apiClient.put.mockResolvedValue({ data: {} });
    renderPage();

    fireEvent.click(within(monoRowIn(kiteSection())).getByText('9m'));
    const drawer = within(document.querySelector('.ant-drawer'));

    // K-001 is available, K-002 already in maintenance: only one "send" button.
    fireEvent.click(drawer.getByRole('button', { name: 'inventory.markMaintenance' }));

    await waitFor(() => expect(apiClient.put).toHaveBeenCalledWith('/equipment/1', { availability: 'maintenance' }));
    expect(patchEquipment).toHaveBeenCalledWith(1, { availability: 'maintenance' });
    await waitFor(() => expect(message.success).toHaveBeenCalledWith('inventory.movedToMaintenance:K-001'));
  });

  test('a failed status change is rolled back', async () => {
    apiClient.put.mockRejectedValue(new Error('boom'));
    renderPage();

    fireEvent.click(within(monoRowIn(kiteSection())).getByText('9m'));
    const drawer = within(document.querySelector('.ant-drawer'));
    fireEvent.click(drawer.getByRole('button', { name: 'inventory.markMaintenance' }));

    await waitFor(() => expect(message.error).toHaveBeenCalledWith('inventory.failStatus'));
    expect(patchEquipment).toHaveBeenLastCalledWith(1, { availability: 'available' });
  });
});

describe('InventoryPage season plan', () => {
  test('rows are per model and size and click through to the filtered grid', () => {
    renderPage();

    fireEvent.click(screen.getByText('inventory.viewPlanning'));

    // Mono has four sizes, Evo SLS one, Tribord three, Gonzales two: 10 rows
    // (`.ant-table-row` skips the hidden measurement row a scrollable table adds).
    const rows = document.querySelectorAll('.ant-tabs-tabpane-active tbody tr.ant-table-row');
    expect(rows).toHaveLength(10);
    expect(within(rows[0].closest('table')).getAllByText('Mono').length).toBeGreaterThan(0);

    // The worn-out XL Tribord is the only gap and sorts first.
    expect(within(rows[0]).getByText('inventory.planGapTag')).toBeInTheDocument();
    expect(within(rows[0]).getByText('Tribord')).toBeInTheDocument();

    fireEvent.click(rows[0]);

    // Back on the inventory tab, filtered to that model (brand-only → by brand) and size.
    expect(screen.getByRole('button', { name: /^inventory\.types\.wetsuit/ })).toHaveAttribute('aria-pressed', 'true');
    expect(sizeChips()).toEqual(['XL1']);
    expect(screen.getByText(/inventory\.resultSummary:1\/1/)).toBeInTheDocument();
  });
});
