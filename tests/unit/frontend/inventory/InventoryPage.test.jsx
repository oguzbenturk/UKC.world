import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';

// ── Mocks ───────────────────────────────────────────────────────────────────

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    // Strip the namespace and append interpolated count/names so assertions can
    // target a key without pulling the locale files in.
    t: (key, opts) => {
      const base = key.replace(/^common:/, '');
      if (opts?.count !== undefined) return `${base}:${opts.count}`;
      if (opts?.names !== undefined) return `${base}:${opts.names}`;
      return base;
    },
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
vi.mock('@/shared/hooks/useData', () => ({
  useData: () => ({ equipment, loading: false, error: null, refreshData }),
}));

vi.mock('@/shared/services/apiClient', () => ({
  default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
}));

vi.mock('@/shared/utils/antdStatic', () => ({
  message: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));

import InventoryPage from '@/features/inventory/pages/InventoryPage';

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

const kiteSection = () => {
  // The kites collapse panel is the one whose header names the section.
  const header = screen.getAllByText('Kite').find((el) => el.closest('.ant-collapse-header'));
  return within(header.closest('.ant-collapse-item'));
};

// ── Tests ───────────────────────────────────────────────────────────────────

describe('InventoryPage grouping and size grid', () => {
  test('folds every "Mono" spelling into one row and lists the spellings', () => {
    render(<InventoryPage />);

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

  test('grid has one column per size in numeric order with column totals', () => {
    render(<InventoryPage />);

    const headers = kiteSection()
      .getAllByRole('columnheader')
      .map((th) => th.textContent);
    // Model | 5m | 7m | 9m | 11m | Total | Status | Actions, sizes carry their totals.
    expect(headers.slice(1, 5)).toEqual(['5m1', '7m1', '9m3', '11m1']);
  });

  test('turning off merge shows the exact entered names again', () => {
    render(<InventoryPage />);

    fireEvent.click(screen.getByRole('switch'));

    const kites = kiteSection();
    expect(kites.getByText('Mono 22')).toBeInTheDocument();
    expect(kites.getByText('Mono 22 Kite')).toBeInTheDocument();
    expect(kites.getByText('inventory.modelsCount:6')).toBeInTheDocument();
    // The setup file stubs localStorage with mocks, so assert on the write itself.
    expect(localStorage.setItem).toHaveBeenCalledWith('ukc:inventory:mergeVariants', 'false');
  });

  test('brand-only wetsuit spellings and case-different sizes merge', () => {
    render(<InventoryPage />);

    const header = screen.getAllByText('Wetsuit').find((el) => el.closest('.ant-collapse-header'));
    const wetsuits = within(header.closest('.ant-collapse-item'));
    expect(wetsuits.getByText('inventory.modelsCount:1')).toBeInTheDocument();
    const headers = wetsuits.getAllByRole('columnheader').map((th) => th.textContent);
    expect(headers.slice(1, 4)).toEqual(['S1', 'M1', 'XL1']);
  });

  test('boards are bucketed into length bands', () => {
    render(<InventoryPage />);

    const header = screen.getAllByText('Board').find((el) => el.closest('.ant-collapse-header'));
    const boards = within(header.closest('.ant-collapse-item'));
    const headers = boards.getAllByRole('columnheader').map((th) => th.textContent);
    expect(headers[1]).toBe('135–140 cm (medium)1');
    expect(headers[2]).toBe('146+ cm (XL)1');
  });

  test('clicking a size cell opens the drawer narrowed to that size', () => {
    render(<InventoryPage />);

    const kites = kiteSection();
    // The 9m cell of the Mono row holds 2 units (one in maintenance); the third 9m
    // kite is the Evo SLS in its own row.
    const monoRow = kites.getByText('Mono').closest('tr');
    const cell = within(monoRow).getByText('2');
    fireEvent.click(cell);

    const drawer = within(document.querySelector('.ant-drawer'));
    expect(drawer.getByText('inventory.size: 9m')).toBeInTheDocument();
    // Entered-name column is present because the group merged spellings.
    expect(drawer.getByText('inventory.enteredName')).toBeInTheDocument();
    expect(drawer.getByText('K-001')).toBeInTheDocument();
    expect(drawer.getByText('K-002')).toBeInTheDocument();
    expect(drawer.queryByText('K-003')).not.toBeInTheDocument();
  });

  test('category chips filter to one type and render it flat', () => {
    render(<InventoryPage />);

    fireEvent.click(screen.getByRole('button', { name: /^Wetsuit/ }));

    expect(document.querySelector('.ant-collapse')).toBeNull();
    // All three spellings appear once, so the shortest ("Tribord") labels the row;
    // it also shows as the brand line, hence getAll.
    expect(screen.getAllByText('Tribord').length).toBeGreaterThan(0);
    expect(screen.getByText('inventory.spellingsCount:3')).toBeInTheDocument();
    expect(screen.queryByText('Mono')).not.toBeInTheDocument();
  });
});
