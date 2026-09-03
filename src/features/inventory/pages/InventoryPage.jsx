import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Card,
  Table,
  Button,
  Space,
  Tag,
  Input,
  Select,
  Row,
  Col,
  Statistic,
  Modal,
  Form,
  DatePicker,
  Drawer,
  Descriptions,
  Typography,
  Empty,
  Spin,
  Segmented,
  Tooltip,
  Popconfirm,
  Upload,
  Collapse,
  Checkbox,
  Progress,
  Alert,
  Switch,
} from 'antd';
import { message } from '@/shared/utils/antdStatic';
import {
  PlusOutlined,
  ReloadOutlined,
  SearchOutlined,
  EditOutlined,
  DeleteOutlined,
  EyeOutlined,
  AppstoreOutlined,
  UnorderedListOutlined,
  ToolOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  ExclamationCircleOutlined,
  StopOutlined,
  UploadOutlined,
  LoadingOutlined,
  PrinterOutlined,
  DownloadOutlined,
  AuditOutlined,
  ShoppingCartOutlined,
  TableOutlined,
} from '@ant-design/icons';
import { useAuth } from '@/shared/hooks/useAuth';
import { useData } from '@/shared/hooks/useData';
import apiClient from '@/shared/services/apiClient';
import dayjs from 'dayjs';

const { Title, Text, Paragraph } = Typography;
const { TextArea } = Input;

const equipmentTypes = [
  { value: 'kite', label: 'Kite' },
  { value: 'board', label: 'Board' },
  { value: 'harness', label: 'Harness' },
  { value: 'control bar', label: 'Control Bar' },
  { value: 'wetsuit', label: 'Wetsuit' },
  { value: 'safety gear', label: 'Safety Gear' },
  { value: 'wing/foil', label: 'Wing / Foil' },
  { value: 'footwear', label: 'Footwear' },
  { value: 'accessory', label: 'Accessory' },
  { value: 'other', label: 'Other' },
];

// Gear counted as usable for the season. 'fair' still works but is on its way out,
// so the planning view tracks it separately; 'poor' is what needs replacing.
const USABLE_CONDITIONS = new Set(['new', 'excellent', 'good']);
const WATCH_CONDITIONS = new Set(['fair']);
const REPLACE_CONDITIONS = new Set(['poor']);

// Ticks from an in-progress count, so a refresh mid-container doesn't lose the walk.
const STOCKTAKE_KEY = 'ukc:inventory:stocktake';

const readStoredChecks = () => {
  try {
    const raw = localStorage.getItem(STOCKTAKE_KEY);
    return new Set(raw ? JSON.parse(raw) : []);
  } catch {
    return new Set();
  }
};

const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));

// Planning groups gear by the size a customer actually asks for. Kites, harnesses,
// wetsuits and shoes already have such a size; boards do not — each is stored as its
// own dimension string (136cm, 136x40cm, 138x41.5cm), so grouping on it raw makes
// every single board its own "size" and every worn board looks like a missing size.
// Boards are therefore bucketed into the length bands a school actually plans around,
// and directionals (feet-inch sizes) are counted separately.
const boardBand = (size) => {
  const raw = String(size || '').trim();
  if (!raw) return '—';
  if (raw.includes("'")) return `Surf ${raw}`;
  const length = parseInt(raw, 10);
  if (!Number.isFinite(length)) return raw;
  if (length <= 134) return '≤134 cm (small)';
  if (length <= 140) return '135–140 cm (medium)';
  if (length <= 145) return '141–145 cm (large)';
  return '146+ cm (XL)';
};

const planningSize = (item) => {
  const size = (item.size && String(item.size).trim()) || '—';
  return item.type === 'board' ? boardBand(size) : size;
};

const brandOptions = [
  { value: 'Core', label: 'Core' },
  { value: 'Duotone', label: 'Duotone' },
  { value: 'Naish', label: 'Naish' },
  { value: 'Cabrinha', label: 'Cabrinha' },
  { value: 'Slingshot', label: 'Slingshot' },
  { value: 'North', label: 'North' },
  { value: 'F-One', label: 'F-One' },
  { value: 'Ozone', label: 'Ozone' },
  { value: 'Ocean Rodeo', label: 'Ocean Rodeo' },
  { value: 'Eleveight', label: 'Eleveight' },
  { value: 'Airush', label: 'Airush' },
  { value: 'Best', label: 'Best' },
  { value: 'Mystic', label: 'Mystic' },
  { value: 'ION', label: 'ION' },
  { value: 'Manera', label: 'Manera' },
  { value: 'Liquid Force', label: 'Liquid Force' },
  { value: 'Fanatic', label: 'Fanatic' },
  { value: 'Neil Pryde', label: 'Neil Pryde' },
  { value: 'Prolimit', label: 'Prolimit' },
  { value: 'Jobe', label: 'Jobe' },
  { value: 'Tribord', label: 'Tribord' },
  { value: "O'Neill", label: "O'Neill" },
  { value: 'Olaian', label: 'Olaian' },
  { value: 'Oxelo', label: 'Oxelo' },
  { value: 'Other', label: 'Other' },
];

const conditionOptions = [
  { value: 'new', label: 'New' },
  { value: 'excellent', label: 'Excellent' },
  { value: 'good', label: 'Good' },
  { value: 'fair', label: 'Fair' },
  { value: 'poor', label: 'Poor' },
];

const STATUS_KEYS = {
  available: 'statusAvailable',
  'in-use': 'statusInUse',
  maintenance: 'statusMaintenance',
  retired: 'statusRetired',
};

const STATUS_COLORS = {
  available: 'success',
  'in-use': 'processing',
  maintenance: 'warning',
  retired: 'default',
};

const getSizeOptions = (type) => {
  switch (type) {
    case 'kite':
      return ['5m', '6m', '7m', '8m', '9m', '10m', '11m', '12m', '13m', '14m', '15m'];
    case 'board':
      return ['132x39', '135x40', '138x41', '141x42', '144x43'];
    case 'harness':
    case 'wetsuit':
    case 'safety gear':
      return ['KIDS', 'XS', 'S', 'M', 'L', 'XL', 'XXL'];
    case 'control bar':
      return ['19', '22', '24', '26', '27'];
    case 'wing/foil':
      return ['3m', '4m', '5m', '6m', '7m'];
    case 'footwear':
      return ['30-31', '32-33', '34-35', '36-37', '38-39', '40-41', '42-43', '44-45', '46-47'];
    default:
      return [];
  }
};

// ── Model-family grouping ────────────────────────────────────────────────────
// Staff enter one model under several spellings — "Mono", "Mono 22", "Mono 22 Kite",
// "Mono 24"; "Tribord", "Tribord Wetsuit", "Wetsuit Tribord" — so grouping on the raw
// name scatters a single model over five rows. The family name drops the brand, the
// type's own noun and year/size numbers, which folds those spellings into one "Mono"
// row. The original spelling stays on each unit and is shown as its entered name.
const TYPE_NOISE_WORDS = {
  kite: ['kite', 'kites', 'uçurtma'],
  wetsuit: ['wetsuit', 'wetsuits', 'suit', 'mono'],
  board: ['board', 'boards', 'tahta'],
  'control bar': ['bar', 'bars'],
  harness: ['harness', 'harnesses', 'trapez'],
  footwear: ['ayakkabı', 'shoe', 'shoes', 'boot', 'boots', 'bot'],
  'wing/foil': ['wing', 'wings', 'kanat', 'foil'],
};
const BRAND_ALIASES = {
  'liquid force': ['lf'],
  'neil pryde': ['np'],
  duotone: ['dtk', 'dt'],
  "o'neill": ['oneill'],
};
// "22" / "2024" (a model year) and "15.5" / "9m" (a size typed into the name).
const YEAR_OR_SIZE_TOKEN = /^(?:(?:19|20)\d{2}|\d{1,2}(?:[.,]\d+)?m|\d{2}(?:[.,]\d+)?)$/;

const normalizeWords = (s) => String(s || '').toLowerCase().replace(/[’`´]/g, "'").replace(/[(),]/g, ' ');

const familyName = (item) => {
  const type = (item.type || '').trim().toLowerCase();
  const brand = (item.brand || '').trim().toLowerCase();
  const noise = new Set(TYPE_NOISE_WORDS[type] || []);
  const brandTokens = new Set(
    brand === 'other'
      ? []
      : [...normalizeWords(brand).split(/\s+/), ...(BRAND_ALIASES[brand] || [])].filter(Boolean)
  );
  return normalizeWords(item.name)
    .split(/\s+/)
    .filter((tok) => tok && !noise.has(tok) && !brandTokens.has(tok) && !YEAR_OR_SIZE_TOKEN.test(tok))
    .join(' ');
};

const byCountThenName = (a, b) => b.count - a.count || String(a.name || '').localeCompare(String(b.name || ''));

// ── Size grid ────────────────────────────────────────────────────────────────
const APPAREL_ORDER = ['KIDS', 'ÇOCUK', 'XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL'];

// Boards use the planning bands (every board has its own dimension string); apparel
// sizes are upper-cased so "xl" and "XL" land in the same column.
const gridSize = (item) => {
  if (item.type === 'board') return boardBand(item.size);
  const raw = (item.size && String(item.size).trim()) || '—';
  const upper = raw.toUpperCase();
  return APPAREL_ORDER.includes(upper) ? upper : raw;
};

const leadingNumber = (s) => parseFloat(String(s).replace(/^[≤<>]/, '').replace(',', '.'));

const compareSizes = (a, b) => {
  if (a === b) return 0;
  if (a === '—') return 1;
  if (b === '—') return -1;
  const ia = APPAREL_ORDER.indexOf(a.toUpperCase());
  const ib = APPAREL_ORDER.indexOf(b.toUpperCase());
  if (ia !== -1 || ib !== -1) return ia === -1 ? 1 : ib === -1 ? -1 : ia - ib;
  const na = leadingNumber(a);
  const nb = leadingNumber(b);
  const aNum = Number.isFinite(na);
  const bNum = Number.isFinite(nb);
  if (aNum && bNum && na !== nb) return na - nb;
  if (aNum !== bNum) return aNum ? -1 : 1;
  return a.localeCompare(b, undefined, { numeric: true });
};

// The worst status in a cell decides its colour, so a size with one kite in the
// workshop reads orange even when the other three are on the beach.
const cellColor = (c) =>
  c.maintenance_count > 0 ? 'warning'
    : c.in_use_count > 0 ? 'processing'
    : c.available_count > 0 ? 'success'
    : 'default';

const emptyCounts = () => ({ count: 0, available_count: 0, in_use_count: 0, maintenance_count: 0, retired_count: 0 });
const tallyStatus = (target, status) => {
  target.count++;
  if (status === 'available') target.available_count++;
  else if (status === 'in-use') target.in_use_count++;
  else if (status === 'maintenance') target.maintenance_count++;
  else if (status === 'retired') target.retired_count++;
};

const VIEW_MODES = ['grid', 'table', 'cards', 'stocktake', 'planning'];
const VIEW_KEY = 'ukc:inventory:view';
const MERGE_KEY = 'ukc:inventory:mergeVariants';
const readStoredPref = (key, fallback) => {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
};
const writeStoredPref = (key, value) => {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* private mode */ }
};

const InventoryPage = () => {
  const { t } = useTranslation(['common']);
  const { user } = useAuth();
  const { equipment, loading, error, refreshData } = useData();
  const [viewMode, setViewMode] = useState(() => {
    const stored = readStoredPref(VIEW_KEY, 'grid');
    return VIEW_MODES.includes(stored) ? stored : 'grid';
  });
  const [mergeVariants, setMergeVariants] = useState(() => readStoredPref(MERGE_KEY, true) !== false);
  const changeViewMode = (mode) => { setViewMode(mode); writeStoredPref(VIEW_KEY, mode); };
  const changeMergeVariants = (on) => { setMergeVariants(on); writeStoredPref(MERGE_KEY, on); };
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState(null);
  const [filterStatus, setFilterStatus] = useState(null);
  const [selectedItem, setSelectedItem] = useState(null);
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [detailDrawerOpen, setDetailDrawerOpen] = useState(false);
  const [formModalOpen, setFormModalOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [imageUrl, setImageUrl] = useState(null);
  const [imageLoading, setImageLoading] = useState(false);
  const [checkedIds, setCheckedIds] = useState(readStoredChecks);
  const [form] = Form.useForm();

  const getStatusConfig = (status) => ({
    color: STATUS_COLORS[status] || 'default',
    icon: status === 'available' ? <CheckCircleOutlined />
      : status === 'in-use' ? <ClockCircleOutlined />
      : status === 'maintenance' ? <ToolOutlined />
      : <StopOutlined />,
    label: t(`common:inventory.${STATUS_KEYS[status] || 'statusAvailable'}`),
  });

  const canManageEquipment =
    user?.role === 'admin' ||
    user?.role === 'manager' ||
    user?.role === 'owner' ||
    user?.role === 'receptionist' ||
    user?.role === 'front_desk' ||
    user?.permissions?.['equipment:write'] === true;
  const watchType = Form.useWatch('type', form);

  // GET /equipment returns raw DB rows (snake_case): the status lives in `availability`
  // and the asset code in `serial_number`. This page read `status`/`serialNumber`, which
  // are never present — so every stat card read 0, the status filter matched nothing, the
  // status tag fell back to "Available" for ALL gear (hiding items in maintenance) and
  // searching by asset code found nothing. Normalise the shape once, here, and let every
  // memo below work off it.
  const normalizedEquipment = useMemo(() => {
    if (!equipment) return [];
    return equipment.map((item) => ({
      ...item,
      status: item.status || item.availability || 'available',
      serialNumber: item.serialNumber || item.serial_number || '',
      imageUrl: item.imageUrl || item.image_url || null,
      condition: (item.condition || '').toLowerCase(),
    }));
  }, [equipment]);

  // Filter equipment. Search + status are applied first so the category rail can count
  // per type against them; the selected type is applied last.
  const searchStatusFiltered = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return normalizedEquipment.filter(item => {
      const matchesSearch = !term ||
        item.name?.toLowerCase().includes(term) ||
        item.brand?.toLowerCase().includes(term) ||
        item.size?.toLowerCase().includes(term) ||
        item.serialNumber?.toLowerCase().includes(term);
      const matchesStatus = !filterStatus || item.status === filterStatus;
      return matchesSearch && matchesStatus;
    });
  }, [normalizedEquipment, searchTerm, filterStatus]);

  const filteredEquipment = useMemo(
    () => (filterType ? searchStatusFiltered.filter((item) => item.type === filterType) : searchStatusFiltered),
    [searchStatusFiltered, filterType]
  );

  const typeCounts = useMemo(() => {
    const counts = {};
    for (const item of searchStatusFiltered) {
      const ty = (item.type || '').toLowerCase().trim() || 'other';
      counts[ty] = (counts[ty] || 0) + 1;
    }
    return counts;
  }, [searchStatusFiltered]);

  // Chips for the category rail, in the canonical type order, then any unknown types.
  // The active type stays visible even when the search leaves it empty, so the user
  // can see why the page is blank and switch away.
  const typeRail = useMemo(() => {
    const known = equipmentTypes
      .filter((tDef) => typeCounts[tDef.value] || tDef.value === filterType)
      .map((tDef) => ({ value: tDef.value, label: tDef.label, count: typeCounts[tDef.value] || 0 }));
    const unknown = Object.keys(typeCounts)
      .filter((k) => !equipmentTypes.some((tDef) => tDef.value === k))
      .map((k) => ({ value: k, label: k.charAt(0).toUpperCase() + k.slice(1), count: typeCounts[k] }));
    return [...known, ...unknown];
  }, [typeCounts, filterType]);

  // Statistics
  const stats = useMemo(() => ({
    total: normalizedEquipment.length,
    available: normalizedEquipment.filter(e => e.status === 'available').length,
    inUse: normalizedEquipment.filter(e => e.status === 'in-use').length,
    maintenance: normalizedEquipment.filter(e => e.status === 'maintenance').length,
  }), [normalizedEquipment]);

  // Group equipment by model. With "merge model years" on (default) the key is the
  // family name, so "Mono" / "Mono 22" / "Mono 24 Kite" collapse into one row; off, it
  // is the exact name entered. Sizes are aggregated into a size breakdown and into
  // per-size cells for the grid. Items missing brand or name remain ungrouped (isSolo).
  const groupedEquipment = useMemo(() => {
    const groups = new Map();
    for (const u of filteredEquipment) {
      const b = u.brand?.trim().toLowerCase();
      const n = u.name?.trim().toLowerCase();
      const ty = u.type?.trim().toLowerCase();
      const isSolo = !b || !n;
      const family = mergeVariants ? familyName(u) : n;
      const key = isSolo ? `__solo__:${u.id}` : `${ty}|${b}|${family}`;
      let g = groups.get(key);
      if (!g) {
        g = {
          key,
          isSolo,
          brand: u.brand,
          name: u.name,
          type: u.type,
          image_url: null,
          units: [],
          sizes: {},
          cells: {},
          nameCounts: {},
          variants: [],
          ...emptyCounts(),
        };
        groups.set(key, g);
      }
      g.units.push(u);
      g.image_url = g.image_url || u.image_url || u.imageUrl || null;
      const sz = (u.size && String(u.size).trim()) || '—';
      g.sizes[sz] = (g.sizes[sz] || 0) + 1;
      const gs = gridSize(u);
      const cell = g.cells[gs] || (g.cells[gs] = { size: gs, ...emptyCounts() });
      const orig = (u.name || '').trim();
      g.nameCounts[orig] = (g.nameCounts[orig] || 0) + 1;
      tallyStatus(g, u.status);
      tallyStatus(cell, u.status);
    }
    for (const g of groups.values()) {
      // The most-typed spelling labels the row (shortest on a tie); every spelling is
      // kept so nobody loses track of what "Mono 24" was entered as.
      const names = Object.entries(g.nameCounts)
        .sort((a, b) => b[1] - a[1] || a[0].length - b[0].length || a[0].localeCompare(b[0]));
      g.name = names[0]?.[0] || g.name;
      g.variants = names.map(([name]) => name);
    }
    return Array.from(groups.values());
  }, [filteredEquipment, mergeVariants]);

  // Section the grouped models by equipment type, preserving the order of equipmentTypes.
  const sectionedEquipment = useMemo(() => {
    const byType = new Map();
    for (const g of groupedEquipment) {
      const ty = (g.type || '').toLowerCase().trim() || 'other';
      if (!byType.has(ty)) byType.set(ty, []);
      byType.get(ty).push(g);
    }
    const ordered = [];
    for (const tDef of equipmentTypes) {
      if (byType.has(tDef.value)) {
        const groups = byType.get(tDef.value).sort(byCountThenName);
        ordered.push({
          key: tDef.value,
          label: tDef.label,
          groups,
          unitCount: groups.reduce((acc, g) => acc + g.count, 0),
          modelCount: groups.length,
        });
        byType.delete(tDef.value);
      }
    }
    // Trailing unknown types
    for (const [key, groups] of byType) {
      groups.sort(byCountThenName);
      ordered.push({
        key,
        label: key.charAt(0).toUpperCase() + key.slice(1),
        groups,
        unitCount: groups.reduce((acc, g) => acc + g.count, 0),
        modelCount: groups.length,
      });
    }
    return ordered;
  }, [groupedEquipment]);

  const StatusBreakdown = ({ group }) => {
    const items = [];
    if (group.available_count > 0) items.push({ color: 'success', count: group.available_count, label: t('common:inventory.availShort') });
    if (group.in_use_count > 0) items.push({ color: 'processing', count: group.in_use_count, label: t('common:inventory.inUseShort') });
    if (group.maintenance_count > 0) items.push({ color: 'warning', count: group.maintenance_count, label: t('common:inventory.maintShort') });
    if (group.retired_count > 0) items.push({ color: 'default', count: group.retired_count, label: t('common:inventory.retiredShort') });
    return (
      <Space size={4} wrap>
        {items.map((it, i) => (
          <Tag key={i} color={it.color}>{it.count} {it.label}</Tag>
        ))}
      </Space>
    );
  };

  // ── Stock-take ─────────────────────────────────────────────────────────────
  // A flat, code-ordered checklist for walking the container with a phone. Ticks are
  // kept per browser (localStorage) so a count survives a refresh or an accidental
  // back-navigation; "Finish" clears them for the next count.
  const stocktakeRows = useMemo(
    () => [...filteredEquipment].sort((a, b) => (a.serialNumber || 'zzz').localeCompare(b.serialNumber || 'zzz')),
    [filteredEquipment]
  );

  const toggleCheck = (id) => {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      try { localStorage.setItem(STOCKTAKE_KEY, JSON.stringify([...next])); } catch { /* private mode */ }
      return next;
    });
  };

  const setChecksFor = (ids, checked) => {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => (checked ? next.add(id) : next.delete(id)));
      try { localStorage.setItem(STOCKTAKE_KEY, JSON.stringify([...next])); } catch { /* private mode */ }
      return next;
    });
  };

  const stocktakeStats = useMemo(() => {
    const found = stocktakeRows.filter((r) => checkedIds.has(r.id)).length;
    return { found, missing: stocktakeRows.length - found, total: stocktakeRows.length };
  }, [stocktakeRows, checkedIds]);

  const exportStocktakeCsv = () => {
    const header = ['Code', 'Type', 'Item', 'Brand', 'Size', 'Condition', 'Status', 'Counted'];
    const lines = stocktakeRows.map((r) => [
      r.serialNumber, r.type, r.name, r.brand, r.size, r.condition, r.status,
      checkedIds.has(r.id) ? 'FOUND' : 'NOT FOUND',
    ].map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(','));
    // BOM so Excel opens Turkish characters correctly.
    const blob = new Blob(['﻿' + [header.join(','), ...lines].join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `stocktake-${dayjs().format('YYYY-MM-DD')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const printStocktake = () => {
    const rows = stocktakeRows.map((r) => `
      <tr>
        <td class="box"></td>
        <td><b>${escapeHtml(r.serialNumber)}</b></td>
        <td>${escapeHtml(r.name)}</td>
        <td>${escapeHtml(r.brand)}</td>
        <td>${escapeHtml(r.size)}</td>
        <td>${escapeHtml(r.condition)}</td>
      </tr>`).join('');
    const win = window.open('', '_blank');
    if (!win) return;
    win.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Stock-take ${dayjs().format('YYYY-MM-DD')}</title>
      <style>
        body{font-family:system-ui,sans-serif;margin:24px;color:#111}
        h1{font-size:18px;margin:0 0 4px} p{margin:0 0 16px;color:#555;font-size:12px}
        table{width:100%;border-collapse:collapse;font-size:12px}
        th,td{border:1px solid #bbb;padding:4px 6px;text-align:left}
        th{background:#f3f4f6}
        td.box{width:22px;height:22px}
        tr{break-inside:avoid}
      </style></head><body>
      <h1>Equipment stock-take — ${dayjs().format('DD MMM YYYY')}</h1>
      <p>${stocktakeRows.length} items${filterType ? ` · type: ${filterType}` : ''}. Tick each item you physically find.</p>
      <table><thead><tr><th></th><th>Code</th><th>Item</th><th>Brand</th><th>Size</th><th>Condition</th></tr></thead>
      <tbody>${rows}</tbody></table></body></html>`);
    win.document.close();
    win.focus();
    win.print();
  };

  // ── Next-season planning ───────────────────────────────────────────────────
  // One row per type+size: what you own, what is still good, what is worn out.
  // "Buy" = the units in poor condition (like-for-like replacement); a size with no
  // usable unit left is flagged as a gap even if nothing is worn out yet.
  const planningRows = useMemo(() => {
    const map = new Map();
    for (const item of normalizedEquipment) {
      const type = item.type || 'other';
      const size = planningSize(item);
      const key = `${type}|${size}`;
      let row = map.get(key);
      if (!row) {
        row = { key, type, size, total: 0, usable: 0, watch: 0, replace: 0, maintenance: 0 };
        map.set(key, row);
      }
      row.total++;
      if (item.status === 'maintenance') row.maintenance++;
      if (REPLACE_CONDITIONS.has(item.condition)) row.replace++;
      else if (WATCH_CONDITIONS.has(item.condition)) row.watch++;
      else if (USABLE_CONDITIONS.has(item.condition)) row.usable++;
    }
    // A gap means nothing serviceable is left in that size — every unit is worn out.
    // Counting a size as a gap while a 'fair' unit still works would cry wolf on every
    // ageing item and bury the sizes that genuinely cannot be handed to a customer.
    return Array.from(map.values())
      .map((r) => ({ ...r, buy: r.replace, gap: r.usable + r.watch === 0 && r.total > 0 }))
      .sort((a, b) =>
        (b.gap - a.gap) || (b.buy - a.buy) || a.type.localeCompare(b.type) || a.size.localeCompare(b.size)
      );
  }, [normalizedEquipment]);

  const planningTotals = useMemo(() => planningRows.reduce(
    (acc, r) => ({
      usable: acc.usable + r.usable,
      watch: acc.watch + r.watch,
      replace: acc.replace + r.replace,
      gaps: acc.gaps + (r.gap ? 1 : 0),
    }),
    { usable: 0, watch: 0, replace: 0, gaps: 0 }
  ), [planningRows]);

  const SizeBreakdown = ({ sizes }) => {
    const entries = Object.entries(sizes || {});
    entries.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    if (entries.length === 0) return <Text type="secondary">—</Text>;
    return (
      <Space size={4} wrap>
        {entries.map(([sz, cnt]) => (
          <Tag key={sz} color="blue">{sz}: {cnt}</Tag>
        ))}
      </Space>
    );
  };

  const handleViewDetails = (record) => {
    setSelectedItem(record);
    setSelectedGroup(null);
    setDetailDrawerOpen(true);
  };

  // Clicking a grid cell opens the group narrowed to that size; the counts are rebuilt
  // for the slice so the drawer header matches the cell. `base` keeps the full group
  // so the size chip in the drawer title can be cleared.
  const sliceGroup = (group, size) => {
    const units = group.units.filter((u) => gridSize(u) === size);
    const sliced = { ...group, base: group, units, sizes: {}, sizeFilter: size, ...emptyCounts() };
    for (const u of units) {
      const sz = (u.size && String(u.size).trim()) || '—';
      sliced.sizes[sz] = (sliced.sizes[sz] || 0) + 1;
      tallyStatus(sliced, u.status);
    }
    return sliced;
  };

  const handleViewGroup = (group, size = null) => {
    setSelectedItem(null);
    setSelectedGroup(size ? sliceGroup(group, size) : group);
    setDetailDrawerOpen(true);
  };

  const handleAddUnit = (group) => {
    setIsEditing(false);
    setSelectedItem(null);
    setImageUrl(null);
    form.resetFields();
    form.setFieldsValue({
      status: 'available',
      type: group.type,
      name: group.name,
      brand: group.brand,
      // Boards are bucketed into length bands in the grid, which is not a real size.
      size: group.sizeFilter && group.sizeFilter !== '—' && group.type !== 'board' ? group.sizeFilter : undefined,
    });
    setFormModalOpen(true);
  };

  const handleAddNew = () => {
    setIsEditing(false);
    setSelectedItem(null);
    setImageUrl(null);
    form.resetFields();
    form.setFieldsValue({ status: 'available', type: 'kite' });
    setFormModalOpen(true);
  };

  const handleEdit = (record) => {
    setIsEditing(true);
    setSelectedItem(record);
    setImageUrl(record.image_url || record.imageUrl || null);
    form.setFieldsValue({
      ...record,
      purchaseDate: record.purchaseDate ? dayjs(record.purchaseDate) : null,
    });
    setFormModalOpen(true);
  };

  const handleFormSubmit = async (values) => {
    setSaving(true);
    try {
      // Map frontend field names to backend field names
      const payload = {
        name: values.name,
        brand: values.brand,
        type: values.type,
        size: values.size,
        condition: values.condition,
        availability: values.status, // Map status -> availability
        purchase_date: values.registerDate ? values.registerDate.format('YYYY-MM-DD') : null,
        notes: values.notes,
        // Optional fields that might be in the form
        model: values.model,
        serial_number: values.serial_number,
        location: values.location,
        image_url: imageUrl,
      };

      if (isEditing && selectedItem) {
        await apiClient.put(`/equipment/${selectedItem.id}`, payload);
        message.success(t('common:inventory.equipmentUpdated'));
      } else {
        await apiClient.post('/equipment', payload);
        message.success(t('common:inventory.equipmentAdded'));
      }

      setFormModalOpen(false);
      form.resetFields();
      setImageUrl(null);
      refreshData();
    } catch (err) {
      message.error(err.response?.data?.error || err.response?.data?.message || t('common:inventory.failSave'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    try {
      await apiClient.delete(`/equipment/${id}`);
      message.success(t('common:inventory.equipmentDeleted'));
      refreshData();
    } catch {
      message.error(t('common:inventory.failDelete'));
    }
  };

  const renderConditionTag = (condition) => {
    const colors = {
      new: 'green',
      excellent: 'cyan',
      good: 'blue',
      fair: 'orange',
      poor: 'red',
    };
    return condition ? (
      <Tag color={colors[condition] || 'default'}>
        {condition.charAt(0).toUpperCase() + condition.slice(1)}
      </Tag>
    ) : null;
  };

  const renderUnitActions = (u) => (
    <Space size="small">
      <Tooltip title={t('common:inventory.viewDetails')}>
        <Button type="text" size="small" icon={<EyeOutlined />} onClick={() => handleViewDetails(u)} />
      </Tooltip>
      {canManageEquipment && (
        <>
          <Tooltip title={t('common:inventory.editTooltip')}>
            <Button type="text" size="small" icon={<EditOutlined />} onClick={() => handleEdit(u)} />
          </Tooltip>
          <Popconfirm
            title={t('common:inventory.deleteConfirmTitle')}
            description={t('common:inventory.deleteConfirmDesc')}
            onConfirm={() => handleDelete(u.id)}
            okText={t('common:buttons.delete')}
            cancelText={t('common:buttons.cancel')}
            okButtonProps={{ danger: true }}
          >
            <Tooltip title={t('common:inventory.deleteTooltip')}>
              <Button type="text" size="small" icon={<DeleteOutlined />} danger />
            </Tooltip>
          </Popconfirm>
        </>
      )}
    </Space>
  );

  const unitSubColumns = [
    {
      title: t('common:inventory.serialNumber'),
      key: 'serial',
      render: (_, u) => u.serialNumber || u.serial_number || <Text type="secondary">—</Text>,
    },
    {
      title: t('common:inventory.size'),
      dataIndex: 'size',
      key: 'size',
      render: (sz) => (sz ? <Tag color="blue">{sz}</Tag> : <Text type="secondary">—</Text>),
    },
    {
      title: t('common:inventory.condition'),
      dataIndex: 'condition',
      key: 'condition',
      render: renderConditionTag,
    },
    {
      title: t('common:inventory.statusField'),
      dataIndex: 'status',
      key: 'status',
      render: (status) => {
        const config = getStatusConfig(status);
        return <Tag color={config.color} icon={config.icon}>{config.label}</Tag>;
      },
    },
    {
      title: t('common:inventory.location'),
      dataIndex: 'location',
      key: 'location',
      render: (loc) => loc || <Text type="secondary">—</Text>,
    },
    {
      title: t('common:table.actions'),
      key: 'actions',
      width: 140,
      render: (_, u) => renderUnitActions(u),
    },
  ];

  // Only worth a column when the group actually merged different spellings.
  const enteredNameColumn = {
    title: t('common:inventory.enteredName'),
    dataIndex: 'name',
    key: 'enteredName',
    render: (n) => <Text type="secondary">{n}</Text>,
  };
  const unitColumnsFor = (group) => (group?.variants?.length > 1 ? [enteredNameColumn, ...unitSubColumns] : unitSubColumns);

  const VariantsHint = ({ group }) => {
    if (!group.variants || group.variants.length <= 1) return null;
    return (
      <Tooltip title={t('common:inventory.enteredAs', { names: group.variants.join(' · ') })}>
        <Tag bordered={false} className="m-0 px-1.5 text-[11px] leading-4 cursor-help">
          {t('common:inventory.spellingsCount', { count: group.variants.length })}
        </Tag>
      </Tooltip>
    );
  };

  const GroupIdentity = ({ group }) => (
    <div className="flex items-center gap-3 min-w-0">
      {group.image_url ? (
        <div className="w-10 h-10 shrink-0 rounded-lg overflow-hidden">
          <img src={group.image_url} alt={group.name} className="w-full h-full object-cover" />
        </div>
      ) : (
        <div className="w-10 h-10 shrink-0 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white font-bold">
          {group.name?.charAt(0)?.toUpperCase() || '?'}
        </div>
      )}
      <div className="min-w-0">
        <Text strong className="block truncate">{group.name}</Text>
        <div className="flex items-center gap-2">
          <Text type="secondary" className="text-xs">{group.brand}</Text>
          <VariantsHint group={group} />
        </div>
      </div>
    </div>
  );

  const groupColumns = [
    {
      title: t('common:inventory.title'),
      key: 'equipment',
      render: (_, group) => <GroupIdentity group={group} />,
    },
    {
      title: t('common:inventory.sizesLabel'),
      key: 'sizes',
      render: (_, group) => <SizeBreakdown sizes={group.sizes} />,
    },
    {
      title: t('common:inventory.unitsLabel'),
      key: 'units',
      render: (_, group) => (
        <Tag color="purple">
          {group.count} {group.count === 1 ? t('common:inventory.unitLabel') : t('common:inventory.unitsLabel')}
        </Tag>
      ),
    },
    {
      title: t('common:inventory.statusField'),
      key: 'status',
      render: (_, group) => {
        if (group.isSolo) {
          const u = group.units[0];
          const config = getStatusConfig(u.status);
          return <Tag color={config.color} icon={config.icon}>{config.label}</Tag>;
        }
        return <StatusBreakdown group={group} />;
      },
    },
    {
      title: t('common:table.actions'),
      key: 'actions',
      width: 160,
      render: (_, group) => {
        if (group.isSolo) {
          return renderUnitActions(group.units[0]);
        }
        return (
          <Space size="small">
            <Tooltip title={t('common:inventory.viewUnits')}>
              <Button type="text" icon={<EyeOutlined />} onClick={() => handleViewGroup(group)} />
            </Tooltip>
            {canManageEquipment && (
              <Tooltip title={t('common:inventory.addUnit')}>
                <Button type="text" icon={<PlusOutlined />} onClick={() => handleAddUnit(group)} />
              </Tooltip>
            )}
          </Space>
        );
      },
    },
  ];

  const renderGroupCard = (group) => {
    const onCardClick = group.isSolo
      ? () => handleViewDetails(group.units[0])
      : () => handleViewGroup(group);
    const soloConfig = group.isSolo ? getStatusConfig(group.units[0].status) : null;
    return (
      <Col xs={24} sm={12} md={8} lg={6} key={group.key}>
        <Card hoverable onClick={onCardClick} className="h-full cursor-pointer">
          <div className="text-center mb-4">
            {group.image_url ? (
              <div className="w-16 h-16 mx-auto rounded-2xl overflow-hidden">
                <img
                  src={group.image_url}
                  alt={group.name}
                  className="w-full h-full object-cover"
                />
              </div>
            ) : (
              <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white text-2xl font-bold">
                {group.name?.charAt(0)?.toUpperCase() || '?'}
              </div>
            )}
          </div>
          <div className="text-center">
            <Text strong className="text-lg block">{group.name}</Text>
            <Text type="secondary" className="block">{group.brand}</Text>
            <div className="mt-1 flex justify-center"><VariantsHint group={group} /></div>
            <div className="mt-2 flex justify-center">
              <SizeBreakdown sizes={group.sizes} />
            </div>
            <div className="mt-2 flex justify-center">
              <Tag color="purple">
                {group.count} {group.count === 1 ? t('common:inventory.unitLabel') : t('common:inventory.unitsLabel')}
              </Tag>
            </div>
            <div className="mt-3 flex justify-center">
              {group.isSolo ? (
                <Tag color={soloConfig.color} icon={soloConfig.icon}>{soloConfig.label}</Tag>
              ) : (
                <StatusBreakdown group={group} />
              )}
            </div>
          </div>
        </Card>
      </Col>
    );
  };

  const openGroup = (g) => (g.isSolo ? handleViewDetails(g.units[0]) : handleViewGroup(g));

  // ── Size grid ──────────────────────────────────────────────────────────────
  // One row per model, one column per size, so "how many 9m Monos do we have, and
  // are they all on the beach?" is a single glance rather than an expanded row.
  const renderSizeGrid = (section) => {
    const sizes = [...new Set(section.groups.flatMap((g) => Object.keys(g.cells)))].sort(compareSizes);
    const colTotals = {};
    for (const g of section.groups) {
      for (const [sz, c] of Object.entries(g.cells)) colTotals[sz] = (colTotals[sz] || 0) + c.count;
    }
    const columns = [
      {
        title: t('common:inventory.modelCol'),
        key: 'model',
        fixed: 'left',
        width: 240,
        render: (_, g) => (
          <div className="cursor-pointer" onClick={() => openGroup(g)}>
            <GroupIdentity group={g} />
          </div>
        ),
      },
      ...sizes.map((sz) => ({
        title: (
          <div className="text-center leading-tight">
            <div className="font-semibold whitespace-nowrap">{sz}</div>
            <Text type="secondary" className="text-[11px]">{colTotals[sz]}</Text>
          </div>
        ),
        key: sz,
        align: 'center',
        width: 76,
        render: (_, g) => {
          const c = g.cells[sz];
          if (!c) return <span className="text-slate-300 select-none">·</span>;
          return (
            <Tooltip title={<StatusBreakdown group={c} />}>
              <Tag
                color={cellColor(c)}
                className="m-0 min-w-[34px] cursor-pointer text-center font-semibold"
                onClick={() => (g.isSolo ? handleViewDetails(g.units[0]) : handleViewGroup(g, sz))}
              >
                {c.count}
              </Tag>
            </Tooltip>
          );
        },
      })),
      {
        title: t('common:inventory.totalCol'),
        key: 'total',
        align: 'center',
        width: 80,
        render: (_, g) => <Tag color="purple" className="m-0 font-semibold">{g.count}</Tag>,
      },
      {
        title: t('common:inventory.statusField'),
        key: 'status',
        width: 220,
        render: (_, g) => <StatusBreakdown group={g} />,
      },
      {
        title: t('common:table.actions'),
        key: 'actions',
        width: 110,
        fixed: 'right',
        render: (_, g) => (g.isSolo ? renderUnitActions(g.units[0]) : (
          <Space size="small">
            <Tooltip title={t('common:inventory.viewUnits')}>
              <Button type="text" icon={<EyeOutlined />} onClick={() => handleViewGroup(g)} />
            </Tooltip>
            {canManageEquipment && (
              <Tooltip title={t('common:inventory.addUnit')}>
                <Button type="text" icon={<PlusOutlined />} onClick={() => handleAddUnit(g)} />
              </Tooltip>
            )}
          </Space>
        )),
      },
    ];
    return (
      <Table
        size="small"
        columns={columns}
        dataSource={section.groups}
        rowKey="key"
        pagination={false}
        scroll={{ x: 'max-content' }}
      />
    );
  };

  const renderSectionBody = (section) => {
    if (viewMode === 'grid') return renderSizeGrid(section);
    if (viewMode === 'cards') return <Row gutter={[16, 16]}>{section.groups.map(renderGroupCard)}</Row>;
    return (
      <Table
        columns={groupColumns}
        dataSource={section.groups}
        rowKey="key"
        pagination={false}
        scroll={{ x: 800 }}
        expandable={{
          rowExpandable: (g) => !g.isSolo,
          expandedRowRender: (g) => (
            <Table
              size="small"
              columns={unitColumnsFor(g)}
              dataSource={g.units}
              rowKey="id"
              pagination={false}
            />
          ),
        }}
      />
    );
  };

  const SectionTitle = ({ section }) => (
    <Space wrap>
      <Text strong>{section.label}</Text>
      <Tag color="purple" className="m-0">
        {section.unitCount} {section.unitCount === 1 ? t('common:inventory.unitLabel') : t('common:inventory.unitsLabel')}
      </Tag>
      <Text type="secondary" className="text-xs">{t('common:inventory.modelsCount', { count: section.modelCount })}</Text>
    </Space>
  );

  const GridLegend = () => (
    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
      <span>{t('common:inventory.gridLegend')}</span>
      <Tag color="success" className="m-0">{t('common:inventory.statusAvailable')}</Tag>
      <Tag color="processing" className="m-0">{t('common:inventory.statusInUse')}</Tag>
      <Tag color="warning" className="m-0">{t('common:inventory.statusMaintenance')}</Tag>
      <Tag className="m-0">{t('common:inventory.statusRetired')}</Tag>
    </div>
  );

  // A single selected category renders flat; "All" keeps one collapsible section per type.
  const renderSections = () => (
    <div className="space-y-4">
      {viewMode === 'grid' && <GridLegend />}
      {sectionedEquipment.length === 1 ? (
        <div className="space-y-3">
          <SectionTitle section={sectionedEquipment[0]} />
          {renderSectionBody(sectionedEquipment[0])}
        </div>
      ) : (
        <Collapse
          defaultActiveKey={sectionedEquipment.map((s) => s.key)}
          items={sectionedEquipment.map((section) => ({
            key: section.key,
            label: <SectionTitle section={section} />,
            children: renderSectionBody(section),
          }))}
        />
      )}
    </div>
  );

  const TypeChip = ({ active, label, count, onClick }) => (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex shrink-0 items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium transition ${
        active
          ? 'border-emerald-600 bg-emerald-600 text-white shadow-sm'
          : 'border-slate-200 bg-white text-slate-700 hover:border-emerald-400 hover:text-emerald-700'
      }`}
    >
      {label}
      <span className={`rounded-full px-1.5 text-xs ${active ? 'bg-white/25' : 'bg-slate-100 text-slate-500'}`}>{count}</span>
    </button>
  );

  const segmentedOption = (value, icon, label) => ({
    value,
    label: (
      <span className="flex items-center gap-1">
        {icon}
        <span className="hidden lg:inline">{label}</span>
      </span>
    ),
    title: label,
  });

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Hero Header */}
      <div className="overflow-hidden rounded-3xl bg-gradient-to-br from-emerald-500 via-teal-500 to-cyan-500 p-6 text-white shadow-lg">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold uppercase tracking-wider">
              <AppstoreOutlined /> {t('common:inventory.badge')}
            </div>
            <h1 className="text-3xl font-semibold">{t('common:inventory.title')}</h1>
            <p className="text-sm text-white/75">
              {t('common:inventory.subtitle')}
            </p>
          </div>
          <div className="flex gap-3">
            <Button
              icon={<ReloadOutlined />}
              onClick={refreshData}
              loading={loading}
              className="h-11 rounded-2xl bg-white/20 text-white border-white/30 hover:bg-white/30"
            >
              {t('common:inventory.refresh')}
            </Button>
            {canManageEquipment && (
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={handleAddNew}
                className="h-11 rounded-2xl bg-white text-emerald-600 border-0 shadow-lg hover:bg-slate-100"
              >
                {t('common:inventory.addEquipment')}
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Statistics Cards */}
      <Row gutter={[16, 16]}>
        <Col xs={12} sm={6}>
          <Card className="rounded-2xl">
            <Statistic
              title={t('common:inventory.totalItems')}
              value={stats.total}
              valueStyle={{ color: '#1890ff' }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card className="rounded-2xl">
            <Statistic
              title={t('common:inventory.available')}
              value={stats.available}
              valueStyle={{ color: '#52c41a' }}
              prefix={<CheckCircleOutlined />}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card className="rounded-2xl">
            <Statistic
              title={t('common:inventory.inUse')}
              value={stats.inUse}
              valueStyle={{ color: '#1890ff' }}
              prefix={<ClockCircleOutlined />}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card className="rounded-2xl">
            <Statistic
              title={t('common:inventory.maintenance')}
              value={stats.maintenance}
              valueStyle={{ color: '#faad14' }}
              prefix={<ToolOutlined />}
            />
          </Card>
        </Col>
      </Row>

      {/* Filters, category rail and view toggle */}
      <Card className="rounded-2xl">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-3 md:flex-row md:flex-wrap md:items-center">
            <Input
              placeholder={t('common:inventory.searchPlaceholder')}
              prefix={<SearchOutlined />}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              allowClear
              className="md:max-w-xs"
            />
            <Select
              placeholder={t('common:inventory.filterStatus')}
              allowClear
              className="w-full md:w-44"
              value={filterStatus}
              onChange={setFilterStatus}
              options={[
                { value: 'available', label: t('common:inventory.statusAvailable') },
                { value: 'in-use', label: t('common:inventory.statusInUse') },
                { value: 'maintenance', label: t('common:inventory.statusMaintenance') },
                { value: 'retired', label: t('common:inventory.statusRetired') },
              ]}
            />
            <Tooltip title={t('common:inventory.mergeVariantsHint')}>
              <label className="flex cursor-pointer select-none items-center gap-2 text-sm text-slate-600">
                <Switch size="small" checked={mergeVariants} onChange={changeMergeVariants} />
                {t('common:inventory.mergeVariants')}
              </label>
            </Tooltip>
            <div className="md:ml-auto">
              <Segmented
                value={viewMode}
                onChange={changeViewMode}
                options={[
                  segmentedOption('grid', <TableOutlined />, t('common:inventory.viewGrid')),
                  segmentedOption('table', <UnorderedListOutlined />, t('common:inventory.viewList')),
                  segmentedOption('cards', <AppstoreOutlined />, t('common:inventory.viewCards')),
                  segmentedOption('stocktake', <AuditOutlined />, t('common:inventory.viewStocktake')),
                  segmentedOption('planning', <ShoppingCartOutlined />, t('common:inventory.viewPlanning')),
                ]}
              />
            </div>
          </div>
          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
            <TypeChip
              active={!filterType}
              label={t('common:inventory.allTypes')}
              count={searchStatusFiltered.length}
              onClick={() => setFilterType(null)}
            />
            {typeRail.map((chip) => (
              <TypeChip
                key={chip.value}
                active={filterType === chip.value}
                label={chip.label}
                count={chip.count}
                onClick={() => setFilterType(filterType === chip.value ? null : chip.value)}
              />
            ))}
          </div>
        </div>
      </Card>

      {/* Content */}
      <Card className="rounded-2xl">
        {loading ? (
          <div className="text-center py-12">
            <Spin size="large" />
            <p className="mt-4 text-gray-500">{t('common:inventory.loading')}</p>
          </div>
        ) : error ? (
          <div className="text-center py-12">
            <ExclamationCircleOutlined className="text-4xl text-red-500" />
            <p className="mt-4 text-red-500">{error}</p>
            <Button onClick={refreshData} className="mt-4">{t('common:inventory.tryAgain')}</Button>
          </div>
        ) : sectionedEquipment.length === 0 ? (
          <Empty description={t('common:inventory.noEquipment')} />
        ) : viewMode === 'stocktake' ? (
          <div className="space-y-4">
            <Row gutter={[16, 16]} align="middle">
              <Col xs={24} md={10}>
                <Text strong>{t('common:inventory.stocktakeProgress')}</Text>
                <Progress
                  percent={stocktakeStats.total ? Math.round((stocktakeStats.found / stocktakeStats.total) * 100) : 0}
                  format={() => `${stocktakeStats.found} / ${stocktakeStats.total}`}
                  status={stocktakeStats.found === stocktakeStats.total && stocktakeStats.total > 0 ? 'success' : 'active'}
                />
              </Col>
              <Col xs={24} md={14}>
                <Space wrap>
                  <Button onClick={() => setChecksFor(stocktakeRows.map((r) => r.id), true)}>
                    {t('common:inventory.checkAllShown')}
                  </Button>
                  <Popconfirm
                    title={t('common:inventory.resetCountTitle')}
                    description={t('common:inventory.resetCountDesc')}
                    onConfirm={() => setChecksFor(stocktakeRows.map((r) => r.id), false)}
                  >
                    <Button>{t('common:inventory.resetCount')}</Button>
                  </Popconfirm>
                  <Button icon={<PrinterOutlined />} onClick={printStocktake}>
                    {t('common:inventory.printList')}
                  </Button>
                  <Button icon={<DownloadOutlined />} onClick={exportStocktakeCsv}>
                    {t('common:inventory.exportCsv')}
                  </Button>
                </Space>
              </Col>
            </Row>
            {stocktakeStats.missing > 0 && (
              <Alert
                type="info"
                showIcon
                message={t('common:inventory.stocktakeHint', { count: stocktakeStats.missing })}
              />
            )}
            <Table
              size="small"
              rowKey="id"
              dataSource={stocktakeRows}
              pagination={{ pageSize: 50, showSizeChanger: true }}
              rowClassName={(r) => (checkedIds.has(r.id) ? 'bg-green-50' : '')}
              onRow={(r) => ({ onClick: () => toggleCheck(r.id) })}
              columns={[
                {
                  title: '',
                  key: 'check',
                  width: 48,
                  render: (_, r) => <Checkbox checked={checkedIds.has(r.id)} onChange={() => toggleCheck(r.id)} />,
                },
                {
                  title: t('common:inventory.assetCode'),
                  dataIndex: 'serialNumber',
                  key: 'code',
                  width: 110,
                  render: (code) => <Text code strong>{code || '—'}</Text>,
                  sorter: (a, b) => (a.serialNumber || '').localeCompare(b.serialNumber || ''),
                },
                { title: t('common:inventory.equipmentName'), dataIndex: 'name', key: 'name' },
                { title: t('common:inventory.brand'), dataIndex: 'brand', key: 'brand', responsive: ['md'] },
                { title: t('common:inventory.size'), dataIndex: 'size', key: 'size', width: 110 },
                {
                  title: t('common:inventory.condition'),
                  dataIndex: 'condition',
                  key: 'condition',
                  width: 110,
                  render: (c) => (
                    <Tag color={c === 'poor' ? 'error' : c === 'fair' ? 'warning' : 'success'}>{c || '—'}</Tag>
                  ),
                },
                {
                  title: t('common:inventory.statusField'),
                  dataIndex: 'status',
                  key: 'status',
                  width: 130,
                  render: (status) => {
                    const config = getStatusConfig(status);
                    return <Tag color={config.color} icon={config.icon}>{config.label}</Tag>;
                  },
                },
              ]}
            />
          </div>
        ) : viewMode === 'planning' ? (
          <div className="space-y-4">
            <Row gutter={[16, 16]}>
              <Col xs={12} md={6}>
                <Card className="rounded-2xl">
                  <Statistic title={t('common:inventory.planUsable')} value={planningTotals.usable} valueStyle={{ color: '#52c41a' }} />
                </Card>
              </Col>
              <Col xs={12} md={6}>
                <Card className="rounded-2xl">
                  <Statistic title={t('common:inventory.planWatch')} value={planningTotals.watch} valueStyle={{ color: '#faad14' }} />
                </Card>
              </Col>
              <Col xs={12} md={6}>
                <Card className="rounded-2xl">
                  <Statistic title={t('common:inventory.planReplace')} value={planningTotals.replace} valueStyle={{ color: '#ff4d4f' }} />
                </Card>
              </Col>
              <Col xs={12} md={6}>
                <Card className="rounded-2xl">
                  <Statistic title={t('common:inventory.planGaps')} value={planningTotals.gaps} valueStyle={{ color: '#ff4d4f' }} />
                </Card>
              </Col>
            </Row>
            <Alert type="info" showIcon message={t('common:inventory.planningHint')} />
            <Table
              size="small"
              rowKey="key"
              dataSource={planningRows}
              pagination={false}
              scroll={{ x: 720 }}
              columns={[
                {
                  title: t('common:inventory.equipmentType'),
                  dataIndex: 'type',
                  key: 'type',
                  render: (type) => equipmentTypes.find((e) => e.value === type)?.label || type,
                },
                { title: t('common:inventory.size'), dataIndex: 'size', key: 'size', width: 110 },
                { title: t('common:inventory.totalItems'), dataIndex: 'total', key: 'total', width: 80 },
                {
                  title: t('common:inventory.planUsable'),
                  dataIndex: 'usable',
                  key: 'usable',
                  width: 100,
                  render: (v, r) => <Text type={r.gap ? 'danger' : undefined} strong={r.gap}>{v}</Text>,
                },
                { title: t('common:inventory.planWatch'), dataIndex: 'watch', key: 'watch', width: 100 },
                {
                  title: t('common:inventory.maintenance'),
                  dataIndex: 'maintenance',
                  key: 'maintenance',
                  width: 110,
                  render: (v) => (v > 0 ? <Tag color="warning" icon={<ToolOutlined />}>{v}</Tag> : <Text type="secondary">0</Text>),
                },
                {
                  title: t('common:inventory.planReplace'),
                  dataIndex: 'replace',
                  key: 'replace',
                  width: 110,
                  render: (v) => (v > 0 ? <Tag color="error">{v}</Tag> : <Text type="secondary">0</Text>),
                },
                {
                  title: t('common:inventory.planBuy'),
                  dataIndex: 'buy',
                  key: 'buy',
                  width: 120,
                  sorter: (a, b) => a.buy - b.buy,
                  render: (v, r) => {
                    if (r.gap) return <Tag color="error">{t('common:inventory.planGapTag')}</Tag>;
                    if (v > 0) return <Tag color="warning">{t('common:inventory.planBuyCount', { count: v })}</Tag>;
                    return <Tag color="success">{t('common:inventory.planOk')}</Tag>;
                  },
                },
              ]}
            />
          </div>
        ) : (
          renderSections()
        )}
      </Card>

      {/* Detail Drawer */}
      <Drawer
        title={
          selectedGroup?.sizeFilter ? (
            <Space>
              {t('common:inventory.details')}
              <Tooltip title={t('common:inventory.showAllSizes')}>
                <Tag color="blue" closable onClose={(e) => { e.preventDefault(); setSelectedGroup(selectedGroup.base); }}>
                  {t('common:inventory.size')}: {selectedGroup.sizeFilter}
                </Tag>
              </Tooltip>
            </Space>
          ) : t('common:inventory.details')
        }
        placement="right"
        width={selectedGroup ? 640 : 450}
        onClose={() => {
          setDetailDrawerOpen(false);
          setSelectedGroup(null);
          setSelectedItem(null);
        }}
        open={detailDrawerOpen}
        extra={
          canManageEquipment && (
            selectedGroup ? (
              <Button type="primary" icon={<PlusOutlined />} onClick={() => {
                setDetailDrawerOpen(false);
                handleAddUnit(selectedGroup);
              }}>
                {t('common:inventory.addUnit')}
              </Button>
            ) : selectedItem ? (
              <Button type="primary" icon={<EditOutlined />} onClick={() => {
                setDetailDrawerOpen(false);
                handleEdit(selectedItem);
              }}>
                {t('common:inventory.edit')}
              </Button>
            ) : null
          )
        }
      >
        {selectedGroup && (
          <div className="space-y-6">
            <div className="text-center">
              {selectedGroup.image_url ? (
                <div className="w-20 h-20 mx-auto rounded-2xl overflow-hidden">
                  <img
                    src={selectedGroup.image_url}
                    alt={selectedGroup.name}
                    className="w-full h-full object-cover"
                  />
                </div>
              ) : (
                <div className="w-20 h-20 mx-auto rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white text-3xl font-bold">
                  {selectedGroup.name?.charAt(0)?.toUpperCase() || '?'}
                </div>
              )}
              <Title level={4} className="mt-4 mb-0">{selectedGroup.name}</Title>
              <Text type="secondary">{selectedGroup.brand}</Text>
            </div>

            <Descriptions column={1} bordered size="small">
              <Descriptions.Item label={t('common:inventory.equipmentType')}>
                {selectedGroup.type?.charAt(0).toUpperCase() + selectedGroup.type?.slice(1)}
              </Descriptions.Item>
              <Descriptions.Item label={t('common:inventory.sizesLabel')}>
                <SizeBreakdown sizes={selectedGroup.sizes} />
              </Descriptions.Item>
              <Descriptions.Item label={t('common:inventory.statusField')}>
                <StatusBreakdown group={selectedGroup} />
              </Descriptions.Item>
            </Descriptions>

            <div>
              <Text strong>
                {selectedGroup.count} {selectedGroup.count === 1 ? t('common:inventory.unitLabel') : t('common:inventory.unitsLabel')}
              </Text>
              <Table
                size="small"
                columns={unitColumnsFor(selectedGroup)}
                dataSource={selectedGroup.units}
                rowKey="id"
                pagination={false}
                className="mt-2"
              />
            </div>
          </div>
        )}
        {!selectedGroup && selectedItem && (
          <div className="space-y-6">
            <div className="text-center">
              {selectedItem.image_url || selectedItem.imageUrl ? (
                <div className="w-20 h-20 mx-auto rounded-2xl overflow-hidden">
                  <img
                    src={selectedItem.image_url || selectedItem.imageUrl}
                    alt={selectedItem.name}
                    className="w-full h-full object-cover"
                  />
                </div>
              ) : (
                <div className="w-20 h-20 mx-auto rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white text-3xl font-bold">
                  {selectedItem.name?.charAt(0)?.toUpperCase() || '?'}
                </div>
              )}
              <Title level={4} className="mt-4 mb-0">{selectedItem.name}</Title>
              <Text type="secondary">{selectedItem.brand}</Text>
            </div>

            <Descriptions column={1} bordered size="small">
              <Descriptions.Item label={t('common:inventory.equipmentType')}>
                {selectedItem.type?.charAt(0).toUpperCase() + selectedItem.type?.slice(1)}
              </Descriptions.Item>
              <Descriptions.Item label={t('common:inventory.size')}>{selectedItem.size || 'N/A'}</Descriptions.Item>
              <Descriptions.Item label={t('common:inventory.condition')}>
                {selectedItem.condition
                  ? selectedItem.condition.charAt(0).toUpperCase() + selectedItem.condition.slice(1)
                  : 'N/A'}
              </Descriptions.Item>
              <Descriptions.Item label={t('common:inventory.statusField')}>
                <Tag color={getStatusConfig(selectedItem.status).color}>
                  {getStatusConfig(selectedItem.status).label}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label={t('common:inventory.registerDate')}>
                {selectedItem.registerDate
                  ? dayjs(selectedItem.registerDate).format('MMM DD, YYYY')
                  : selectedItem.purchaseDate
                    ? dayjs(selectedItem.purchaseDate).format('MMM DD, YYYY')
                    : 'N/A'}
              </Descriptions.Item>
            </Descriptions>

            {selectedItem.specifications && (
              <div>
                <Text strong>{t('common:inventory.specifications')}</Text>
                <Paragraph className="mt-2 p-3 bg-gray-50 rounded-lg">
                  {selectedItem.specifications}
                </Paragraph>
              </div>
            )}

            {selectedItem.notes && (
              <div>
                <Text strong>{t('common:inventory.notes')}</Text>
                <Paragraph className="mt-2 p-3 bg-gray-50 rounded-lg">
                  {selectedItem.notes}
                </Paragraph>
              </div>
            )}
          </div>
        )}
      </Drawer>

      {/* Add/Edit Form Modal */}
      <Modal
        title={isEditing ? t('common:inventory.editEquipment') : t('common:inventory.addNewEquipment')}
        open={formModalOpen}
        onCancel={() => {
          setFormModalOpen(false);
          form.resetFields();
          setImageUrl(null);
        }}
        footer={null}
        width={600}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleFormSubmit}
          className="mt-4"
        >
          {/* Equipment Image */}
          <div className="text-center mb-6">
            <Upload
              name="image"
              listType="picture-card"
              className="avatar-uploader"
              showUploadList={false}
              beforeUpload={(file) => {
                const isImage = file.type.startsWith('image/');
                if (!isImage) {
                  message.error(t('common:inventory.imageTypeError'));
                  return false;
                }
                const isLt5M = file.size / 1024 / 1024 < 5;
                if (!isLt5M) {
                  message.error(t('common:inventory.imageSizeError'));
                  return false;
                }
                return true;
              }}
              customRequest={async ({ file, onSuccess, onError, onProgress }) => {
                setImageLoading(true);
                try {
                  const formData = new FormData();
                  formData.append('image', file);
                  const response = await apiClient.post('/upload/equipment-image', formData, {
                    headers: { 'Content-Type': 'multipart/form-data' },
                    onUploadProgress: ({ total, loaded }) => {
                      if (total) {
                        onProgress?.({ percent: Math.round((loaded / total) * 100) });
                      }
                    }
                  });
                  const newUrl = response.data?.url;
                  if (newUrl) {
                    setImageUrl(newUrl);
                  }
                  onSuccess?.(response.data);
                  message.success(t('common:inventory.imageUploaded'));
                } catch (err) {
                  onError?.(err);
                  message.error(t('common:inventory.imageUploadFailed'));
                } finally {
                  setImageLoading(false);
                }
              }}
            >
              {imageUrl ? (
                <div style={{ width: 104, height: 104, overflow: 'hidden', borderRadius: 8 }}>
                  <img 
                    src={imageUrl} 
                    alt="equipment" 
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }} 
                  />
                </div>
              ) : (
                <div>
                  {imageLoading ? <LoadingOutlined /> : <UploadOutlined />}
                  <div style={{ marginTop: 8 }}>{t('common:inventory.uploadPhoto')}</div>
                </div>
              )}
            </Upload>
            <Text type="secondary" className="text-xs">{t('common:inventory.uploadHint')}</Text>
          </div>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="name"
                label={t('common:inventory.equipmentName')}
                rules={[{ required: true, message: t('common:inventory.nameRequired') }]}
              >
                <Input placeholder={t('common:inventory.namePlaceholder')} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="brand"
                label={t('common:inventory.brand')}
                rules={[{ required: true, message: t('common:inventory.brandRequired') }]}
              >
                <Select options={brandOptions} placeholder={t('common:inventory.selectBrand')} />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="type"
                label={t('common:inventory.equipmentType')}
                rules={[{ required: true, message: t('common:inventory.typeRequired') }]}
              >
                <Select options={equipmentTypes} placeholder={t('common:inventory.selectType')} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="size"
                label={t('common:inventory.size')}
              >
                {getSizeOptions(watchType).length > 0 ? (
                  <Select
                    options={getSizeOptions(watchType).map(s => ({ value: s, label: s }))}
                    placeholder={t('common:inventory.selectSize')}
                  />
                ) : (
                  <Input placeholder={t('common:inventory.enterSize')} />
                )}
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="condition"
                label={t('common:inventory.condition')}
              >
                <Select options={conditionOptions} placeholder={t('common:inventory.selectCondition')} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="status"
                label={t('common:inventory.statusField')}
                rules={[{ required: true, message: t('common:inventory.statusRequired') }]}
              >
                <Select
                  options={[
                    { value: 'available', label: t('common:inventory.statusAvailable') },
                    { value: 'in-use', label: t('common:inventory.statusInUse') },
                    { value: 'maintenance', label: t('common:inventory.statusMaintenance') },
                    { value: 'retired', label: t('common:inventory.statusRetired') },
                  ]}
                  placeholder={t('common:inventory.selectStatus')}
                />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="registerDate" label={t('common:inventory.registerDate')}>
                <DatePicker style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="specifications" label={t('common:inventory.specifications')}>
                <Input placeholder={t('common:inventory.specsPlaceholder')} />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item name="notes" label={t('common:inventory.notes')}>
            <TextArea rows={3} placeholder={t('common:inventory.notesPlaceholder')} />
          </Form.Item>

          <div className="flex justify-end gap-3 mt-6">
            <Button onClick={() => setFormModalOpen(false)}>{t('common:buttons.cancel')}</Button>
            <Button type="primary" htmlType="submit" loading={saving}>
              {isEditing ? t('common:inventory.editEquipment') : t('common:inventory.addEquipment')}
            </Button>
          </div>
        </Form>
      </Modal>
    </div>
  );
};

export default InventoryPage;
