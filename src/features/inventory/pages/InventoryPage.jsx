import { useState, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
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
  Tabs,
  Grid,
} from 'antd';
import { message } from '@/shared/utils/antdStatic';
import {
  PlusOutlined,
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
  RightOutlined,
  BorderlessTableOutlined,
} from '@ant-design/icons';
import { useAuth } from '@/shared/hooks/useAuth';
import { useData } from '@/shared/hooks/useData';
import apiClient from '@/shared/services/apiClient';
import dayjs from 'dayjs';
import {
  EQUIPMENT_TYPES,
  TYPE_ORDER,
  TYPE_LABEL_ID,
  CONDITION_VALUES,
  CONDITION_KEYS,
  CONDITION_COLORS,
  STATUS_VALUES,
  STATUS_KEYS,
  STATUS_COLORS,
  USABLE_CONDITIONS,
  WATCH_CONDITIONS,
  REPLACE_CONDITIONS,
  BLANK,
  VIEW_KEY,
  MERGE_KEY,
  STOCKTAKE_KEY,
  brandOptions,
  getSizeOptions,
} from '../utils/constants';
import { sizeLabel, compareSizes } from '../utils/sizeKeys';
import { subtypeOrder } from '../utils/subtype';
import {
  EMPTY_FILTERS,
  normalizeUnit,
  applyFilters,
  buildFacets,
  isFilterActive,
  emptyCounts,
  tallyStatus,
  cellColor,
  retally,
} from '../utils/facets';
import {
  filtersFromSearchParams,
  tabFromSearchParams,
  writeFiltersToSearchParams,
  readStoredPref,
  writeStoredPref,
  migrateStoredView,
} from '../utils/urlState';
import { buildEquipmentCsv, downloadCsv } from '../utils/csv';
import { exportInventoryPdf } from '../pdf/inventoryPdfExport';
import InventoryHeader from '../components/InventoryHeader';
import InventoryFilterBar from '../components/InventoryFilterBar';
import UnitStatusButton from '../components/UnitStatusButton';
import StatTile from '../components/StatTile';
import EquipmentIcon from '../components/EquipmentIcon';

const { Title, Text, Paragraph } = Typography;
const { TextArea } = Input;

// Ticks from an in-progress count, so a refresh mid-container doesn't lose the walk.
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

const capitalize = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : '');

const byCountThenName = (a, b) => b.count - a.count || String(a.name || '').localeCompare(String(b.name || ''));

const InventoryPage = () => {
  const { t, i18n } = useTranslation(['common']);
  const { user } = useAuth();
  const { equipment, loading, error, refreshData, patchEquipment } = useData();
  const [searchParams, setSearchParams] = useSearchParams();
  // Phone-width layout: full-width drawer, stacked filters, no size matrix. Only
  // trusted once a breakpoint has actually resolved (all-false = not measured yet).
  const screens = Grid.useBreakpoint();
  const isNarrow = Boolean((screens.xs || screens.sm) && !screens.md);

  // Display preferences are personal and live in localStorage; filters live in the URL.
  const [viewMode, setViewMode] = useState(() => migrateStoredView(readStoredPref(VIEW_KEY, 'grid')));
  const [mergeVariants, setMergeVariants] = useState(() => readStoredPref(MERGE_KEY, true) !== false);
  const changeViewMode = (mode) => { setViewMode(mode); writeStoredPref(VIEW_KEY, mode); };
  const changeMergeVariants = (on) => { setMergeVariants(on); writeStoredPref(MERGE_KEY, on); };

  const [selectedItem, setSelectedItem] = useState(null);
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [detailDrawerOpen, setDetailDrawerOpen] = useState(false);
  const [formModalOpen, setFormModalOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [imageUrl, setImageUrl] = useState(null);
  const [imageLoading, setImageLoading] = useState(false);
  const [checkedIds, setCheckedIds] = useState(readStoredChecks);
  const [pendingStatus, setPendingStatus] = useState(() => new Set());
  const [form] = Form.useForm();

  // ── Labels ─────────────────────────────────────────────────────────────────
  // defaultValue keeps labels readable if a stale locale file is still cached.
  const typeLabel = useCallback((key) => {
    const id = TYPE_LABEL_ID[key];
    return id ? t(`common:inventory.types.${id}`, { defaultValue: capitalize(key) }) : capitalize(key);
  }, [t]);
  const subtypeLabel = useCallback((id) => t(`common:inventory.subtypes.${id}`, { defaultValue: capitalize(id) }), [t]);
  const conditionLabel = useCallback(
    (c) => (CONDITION_KEYS[c] ? t(`common:inventory.${CONDITION_KEYS[c]}`) : capitalize(c)),
    [t]
  );
  const statusLabel = useCallback((s) => t(`common:inventory.${STATUS_KEYS[s] || 'statusAvailable'}`), [t]);

  const getStatusConfig = (status) => ({
    color: STATUS_COLORS[status] || 'default',
    icon: status === 'available' ? <CheckCircleOutlined />
      : status === 'in-use' ? <ClockCircleOutlined />
      : status === 'maintenance' ? <ToolOutlined />
      : <StopOutlined />,
    label: statusLabel(status),
  });

  const canManageEquipment =
    user?.role === 'admin' ||
    user?.role === 'manager' ||
    user?.role === 'owner' ||
    user?.role === 'receptionist' ||
    user?.role === 'front_desk' ||
    user?.permissions?.['equipment:write'] === true;
  const watchType = Form.useWatch('type', form);

  // ── Data pipeline: normalise → filters (URL) → facets ──────────────────────
  const units = useMemo(() => (equipment || []).map(normalizeUnit), [equipment]);
  const knownTypes = useMemo(() => new Set([...TYPE_ORDER, ...units.map((u) => u.typeKey)]), [units]);
  const filters = useMemo(() => filtersFromSearchParams(searchParams, knownTypes), [searchParams, knownTypes]);
  const tab = tabFromSearchParams(searchParams);

  const setFilters = useCallback((patch, { replace = false, tab: nextTab } = {}) => {
    setSearchParams(
      (prev) => writeFiltersToSearchParams(prev, { ...filtersFromSearchParams(prev, knownTypes), ...patch }, nextTab),
      { replace }
    );
  }, [setSearchParams, knownTypes]);
  const setTab = (key) => setSearchParams((prev) => {
    const next = new URLSearchParams(prev);
    if (key === 'inventory') next.delete('tab'); else next.set('tab', key);
    return next;
  });
  const clearFilters = () => setFilters({ ...EMPTY_FILTERS });

  const facets = useMemo(() => buildFacets(units, filters), [units, filters]);
  const filteredUnits = facets.result;
  const filtersActive = isFilterActive(filters);

  // Global counts for the header chips (they read the whole inventory, not the filtered set).
  const stats = useMemo(() => ({
    total: units.length,
    available: units.filter((u) => u.status === 'available').length,
    maintenance: units.filter((u) => u.status === 'maintenance').length,
    poor: units.filter((u) => u.condition === 'poor').length,
  }), [units]);

  const onlyStatus = (s) => filters.statuses.length === 1 && filters.statuses[0] === s && filters.conditions.length === 0;
  const onlyCondition = (c) => filters.conditions.length === 1 && filters.conditions[0] === c && filters.statuses.length === 0;
  const activeStat = !filtersActive ? 'all'
    : onlyStatus('available') ? 'available'
    : onlyStatus('maintenance') ? 'maintenance'
    : onlyCondition('poor') ? 'poor'
    : null;
  const handleStat = (kind) => {
    if (kind === 'all') return clearFilters();
    if (kind === 'poor') return setFilters({ conditions: activeStat === 'poor' ? [] : ['poor'] });
    return setFilters({ statuses: activeStat === kind ? [] : [kind] });
  };

  // ── Facet options ──────────────────────────────────────────────────────────
  const typeChips = useMemo(() => {
    const known = TYPE_ORDER
      .filter((v) => facets.type[v] || v === filters.type)
      .map((v) => ({ value: v, label: typeLabel(v), count: facets.type[v] || 0 }));
    const unknown = Object.keys(facets.type)
      .filter((k) => !TYPE_ORDER.includes(k))
      .map((k) => ({ value: k, label: typeLabel(k), count: facets.type[k] }));
    return [...known, ...unknown];
  }, [facets.type, filters.type, typeLabel]);
  const allCount = useMemo(() => Object.values(facets.type).reduce((a, b) => a + b, 0), [facets.type]);

  // A rail with a single chip carries no information, so it only renders when there
  // is a choice to make (or something is already selected and needs clearing).
  const sizeChips = useMemo(() => {
    if (!facets.size) return [];
    const keys = [...new Set([...Object.keys(facets.size), ...filters.sizes])].sort(compareSizes);
    if (keys.length < 2 && filters.sizes.length === 0) return [];
    return keys.map((k) => ({ value: k, label: sizeLabel(k, filters.type, t), count: facets.size[k] || 0 }));
  }, [facets.size, filters.sizes, filters.type, t]);

  const subtypeChips = useMemo(() => {
    if (!facets.subtype) return [];
    const order = subtypeOrder(filters.type);
    const ids = [...new Set([
      ...order.filter((id) => facets.subtype[id]),
      ...Object.keys(facets.subtype),
      ...filters.subtypes,
    ])];
    if (ids.length < 2 && filters.subtypes.length === 0) return [];
    return ids.map((id) => ({ value: id, label: subtypeLabel(id), count: facets.subtype[id] || 0 }));
  }, [facets.subtype, filters.subtypes, filters.type, subtypeLabel]);

  const brandSelectOptions = useMemo(() => {
    const keys = new Set([...Object.keys(facets.brand), ...filters.brands]);
    return [...keys]
      .map((b) => ({ value: b, label: b, count: facets.brand[b] || 0 }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  }, [facets.brand, filters.brands]);
  const conditionSelectOptions = useMemo(
    () => CONDITION_VALUES.map((c) => ({ value: c, label: conditionLabel(c), count: facets.condition[c] || 0 })),
    [facets.condition, conditionLabel]
  );
  const statusSelectOptions = useMemo(
    () => STATUS_VALUES.map((s) => ({ value: s, label: statusLabel(s), count: facets.status[s] || 0 })),
    [facets.status, statusLabel]
  );

  // ── Grouping by model ──────────────────────────────────────────────────────
  // With "merge model years" on (default) the key is the family name, so "Mono" /
  // "Mono 22" / "Mono 24 Kite" collapse into one row; off, it is the exact name
  // entered. Sizes are aggregated into a size breakdown and into per-size cells for
  // the grid. Items missing brand or name remain ungrouped (isSolo).
  const groupedEquipment = useMemo(() => {
    const groups = new Map();
    for (const u of filteredUnits) {
      const b = u.brand.toLowerCase();
      const n = u.name.toLowerCase();
      const isSolo = !b || !n;
      const family = mergeVariants ? u.family : n;
      const key = isSolo ? `__solo__:${u.id}` : `${u.typeKey}|${b}|${family}`;
      let g = groups.get(key);
      if (!g) {
        g = {
          key,
          isSolo,
          brand: u.brand,
          name: u.name,
          type: u.typeKey,
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
      g.image_url = g.image_url || u.imageUrl || null;
      const sz = u.size || BLANK;
      g.sizes[sz] = (g.sizes[sz] || 0) + 1;
      const cell = g.cells[u.sizeKey] || (g.cells[u.sizeKey] = { size: u.sizeKey, ...emptyCounts() });
      g.nameCounts[u.name] = (g.nameCounts[u.name] || 0) + 1;
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
  }, [filteredUnits, mergeVariants]);

  // Section the grouped models by equipment type, preserving the canonical order.
  const sectionedEquipment = useMemo(() => {
    const byType = new Map();
    for (const g of groupedEquipment) {
      if (!byType.has(g.type)) byType.set(g.type, []);
      byType.get(g.type).push(g);
    }
    const ordered = [];
    const pushSection = (key, groups) => {
      groups.sort(byCountThenName);
      ordered.push({
        key,
        label: typeLabel(key),
        groups,
        unitCount: groups.reduce((acc, g) => acc + g.count, 0),
        modelCount: groups.length,
      });
    };
    for (const key of TYPE_ORDER) {
      if (byType.has(key)) {
        pushSection(key, byType.get(key));
        byType.delete(key);
      }
    }
    for (const [key, groups] of byType) pushSection(key, groups);
    return ordered;
  }, [groupedEquipment, typeLabel]);

  const summary = useMemo(() => {
    const base = t('common:inventory.resultSummary', {
      units: filteredUnits.length,
      models: groupedEquipment.length,
      defaultValue: '{{units}} units · {{models}} models',
    });
    return filtersActive
      ? `${base} ${t('common:inventory.ofTotal', { total: units.length, defaultValue: 'of {{total}}' })}`
      : base;
  }, [t, filteredUnits.length, groupedEquipment.length, filtersActive, units.length]);

  const StatusBreakdown = ({ group }) => {
    const items = [];
    if (group.available_count > 0) items.push({ color: 'success', count: group.available_count, label: t('common:inventory.availShort') });
    if (group.in_use_count > 0) items.push({ color: 'processing', count: group.in_use_count, label: t('common:inventory.inUseShort') });
    if (group.maintenance_count > 0) items.push({ color: 'warning', count: group.maintenance_count, label: t('common:inventory.maintShort') });
    if (group.retired_count > 0) items.push({ color: 'default', count: group.retired_count, label: t('common:inventory.retiredShort') });
    return (
      <Space size={4} wrap>
        {items.map((it) => (
          <Tag key={it.color} color={it.color}>{it.count} {it.label}</Tag>
        ))}
      </Space>
    );
  };

  // ── Exports ────────────────────────────────────────────────────────────────
  const csvCtx = { t, typeLabel, subtypeLabel, conditionLabel, statusLabel };
  const exportFilteredCsv = () => {
    downloadCsv(
      `inventory-${filters.type || 'all'}-${dayjs().format('YYYY-MM-DD')}.csv`,
      buildEquipmentCsv(filteredUnits, csvCtx)
    );
  };

  // Human-readable line of the active filters for the PDF header.
  const filtersSummaryText = () => {
    const parts = [];
    if (filters.type) parts.push(typeLabel(filters.type));
    if (filters.sizes.length) parts.push(filters.sizes.map((s) => sizeLabel(s, filters.type, t)).join(', '));
    if (filters.subtypes.length) parts.push(filters.subtypes.map(subtypeLabel).join(', '));
    if (filters.brands.length) parts.push(filters.brands.join(', '));
    if (filters.conditions.length) parts.push(filters.conditions.map(conditionLabel).join(', '));
    if (filters.statuses.length) parts.push(filters.statuses.map(statusLabel).join(', '));
    if (filters.q.trim()) parts.push(`"${filters.q.trim()}"`);
    return parts.join(' · ');
  };

  const exportFilteredPdf = async () => {
    try {
      await exportInventoryPdf({
        units: filteredUnits,
        ctx: csvCtx,
        filtersSummary: filtersSummaryText(),
        stats,
        lang: i18n?.language || 'en',
        fileTag: filters.type || 'all',
      });
    } catch (err) {
      message.error(err?.message || t('common:inventory.pdfFailed', { defaultValue: 'Could not create the PDF' }));
    }
  };

  // ── Stock-take ─────────────────────────────────────────────────────────────
  // A flat, code-ordered checklist for walking the container with a phone. Ticks are
  // kept per browser (localStorage) so a count survives a refresh or an accidental
  // back-navigation; "Reset" clears them for the next count.
  const stocktakeRows = useMemo(
    () => [...filteredUnits].sort((a, b) => (a.serialNumber || 'zzz').localeCompare(b.serialNumber || 'zzz')),
    [filteredUnits]
  );

  const persistChecks = (next) => {
    try { localStorage.setItem(STOCKTAKE_KEY, JSON.stringify([...next])); } catch { /* private mode */ }
  };

  const toggleCheck = (id) => {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      persistChecks(next);
      return next;
    });
  };

  const setChecksFor = (ids, checked) => {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => (checked ? next.add(id) : next.delete(id)));
      persistChecks(next);
      return next;
    });
  };

  const stocktakeStats = useMemo(() => {
    const found = stocktakeRows.filter((r) => checkedIds.has(r.id)).length;
    return { found, missing: stocktakeRows.length - found, total: stocktakeRows.length };
  }, [stocktakeRows, checkedIds]);

  const exportStocktakeCsv = () => {
    downloadCsv(
      `stocktake-${dayjs().format('YYYY-MM-DD')}.csv`,
      buildEquipmentCsv(stocktakeRows, csvCtx, [
        { header: t('common:inventory.csvCounted', { defaultValue: 'Counted' }), get: (u) => (checkedIds.has(u.id) ? 'FOUND' : 'NOT FOUND') },
      ])
    );
  };

  const printStocktake = () => {
    const rows = stocktakeRows.map((r) => `
      <tr>
        <td class="box"></td>
        <td><b>${escapeHtml(r.serialNumber)}</b></td>
        <td>${escapeHtml(r.name)}</td>
        <td>${escapeHtml(r.brand)}</td>
        <td>${escapeHtml(r.size)}</td>
        <td>${escapeHtml(conditionLabel(r.condition))}</td>
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
      <p>${stocktakeRows.length} items${filters.type ? ` · type: ${escapeHtml(typeLabel(filters.type))}` : ''}. Tick each item you physically find.</p>
      <table><thead><tr><th></th><th>Code</th><th>Item</th><th>Brand</th><th>Size</th><th>Condition</th></tr></thead>
      <tbody>${rows}</tbody></table></body></html>`);
    win.document.close();
    win.focus();
    win.print();
  };

  // ── Next-season planning ───────────────────────────────────────────────────
  // One row per model+size: what you own, what is still good, what is worn out.
  // "Buy" = the units in poor condition (like-for-like replacement); a model size
  // with no usable unit left is flagged as a gap even if nothing is worn out yet.
  // Condition and status filters are ignored here because they would corrupt
  // those sums.
  const planningUnits = useMemo(
    () => applyFilters(units, filters, new Set(['conditions', 'statuses'])),
    [units, filters]
  );

  const planningRows = useMemo(() => {
    // Same model key as the grid (brand + family; an empty family is a brand-only
    // model such as "Tribord"), and the same label rule: the most-typed spelling
    // across the whole model, shortest on a tie.
    const modelKey = (u) => `${u.typeKey}|${u.brand.toLowerCase()}|${u.family}`;
    const nameCounts = new Map();
    for (const u of planningUnits) {
      const counts = nameCounts.get(modelKey(u)) || nameCounts.set(modelKey(u), {}).get(modelKey(u));
      counts[u.name] = (counts[u.name] || 0) + 1;
    }
    const modelName = (u) => Object.entries(nameCounts.get(modelKey(u)) || {})
      .sort((a, b) => b[1] - a[1] || a[0].length - b[0].length || a[0].localeCompare(b[0]))[0]?.[0] || u.name;

    const map = new Map();
    for (const item of planningUnits) {
      const key = `${modelKey(item)}|${item.sizeKey}`;
      let row = map.get(key);
      if (!row) {
        row = {
          key, type: item.typeKey, brand: item.brand, family: item.family, name: modelName(item),
          sizeKey: item.sizeKey, subtypes: item.subtypes,
          total: 0, usable: 0, watch: 0, replace: 0, maintenance: 0,
        };
        map.set(key, row);
      }
      row.total++;
      if (item.status === 'maintenance') row.maintenance++;
      if (REPLACE_CONDITIONS.has(item.condition)) row.replace++;
      else if (WATCH_CONDITIONS.has(item.condition)) row.watch++;
      else if (USABLE_CONDITIONS.has(item.condition)) row.usable++;
    }
    // A gap means nothing serviceable is left in that model size — every unit is
    // worn out. Counting it as a gap while a 'fair' unit still works would cry wolf
    // on every ageing item and bury the sizes that genuinely cannot go out.
    return Array.from(map.values())
      .map((r) => ({ ...r, buy: r.replace, gap: r.usable + r.watch === 0 && r.total > 0 }))
      .sort((a, b) =>
        (b.gap - a.gap) || (b.buy - a.buy) ||
        (TYPE_ORDER.indexOf(a.type) - TYPE_ORDER.indexOf(b.type)) ||
        a.name.localeCompare(b.name) || compareSizes(a.sizeKey, b.sizeKey)
      );
  }, [planningUnits]);

  const planningTotals = useMemo(() => planningRows.reduce(
    (acc, r) => ({
      usable: acc.usable + r.usable,
      watch: acc.watch + r.watch,
      replace: acc.replace + r.replace,
      gaps: acc.gaps + (r.gap ? 1 : 0),
    }),
    { usable: 0, watch: 0, replace: 0, gaps: 0 }
  ), [planningRows]);

  // A plan row opens the same units in the size grid; the view is switched for this
  // visit only, the stored preference is left alone.
  const openInGrid = (r) => {
    setViewMode('grid');
    // The family name is in every unit's search blob, so it doubles as a model
    // filter; a brand-only model ("Tribord") is narrowed by brand instead.
    setFilters({
      type: r.type,
      sizes: [r.sizeKey],
      subtypes: [],
      q: r.family,
      brands: r.family ? [] : [r.brand].filter(Boolean),
    }, { tab: 'inventory' });
  };

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

  // ── Selection / drawer ─────────────────────────────────────────────────────
  const handleViewDetails = (record) => {
    setSelectedItem(record);
    setSelectedGroup(null);
    setDetailDrawerOpen(true);
  };

  // Clicking a grid cell opens the group narrowed to that size; the counts are rebuilt
  // for the slice so the drawer header matches the cell. `base` keeps the full group
  // so the size chip in the drawer title can be cleared.
  const sliceGroup = (group, size) => {
    const sliceUnits = group.units.filter((u) => u.sizeKey === size);
    const sliced = { ...group, base: group, units: sliceUnits, sizes: {}, sizeFilter: size, ...emptyCounts() };
    for (const u of sliceUnits) {
      const sz = u.size || BLANK;
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

  // ── Quick status change ────────────────────────────────────────────────────
  // Keeps the drawer's copies of a unit in step with the optimistic list update.
  const syncSelection = (id, status) => {
    const patch = (list) => list.map((u) => (u.id === id ? { ...u, status, availability: status } : u));
    setSelectedItem((p) => (p && p.id === id ? { ...p, status, availability: status } : p));
    setSelectedGroup((g) => {
      if (!g) return g;
      const next = { ...g, units: patch(g.units) };
      if (g.base) next.base = { ...g.base, units: patch(g.base.units) };
      return retally(next);
    });
  };

  const changeStatus = async (unit, next) => {
    const prev = unit.status;
    setPendingStatus((s) => new Set(s).add(unit.id));
    patchEquipment?.(unit.id, { availability: next });
    syncSelection(unit.id, next);
    try {
      await apiClient.put(`/equipment/${unit.id}`, { availability: next });
      message.success(next === 'maintenance'
        ? t('common:inventory.movedToMaintenance', { code: unit.serialNumber || unit.name, defaultValue: '{{code}} moved to maintenance' })
        : t('common:inventory.markedAvailable', { code: unit.serialNumber || unit.name, defaultValue: '{{code}} marked available' }));
    } catch (err) {
      patchEquipment?.(unit.id, { availability: prev });
      syncSelection(unit.id, prev);
      message.error(err.response?.data?.error || t('common:inventory.failStatus', { defaultValue: 'Failed to change status' }));
    } finally {
      setPendingStatus((s) => { const n = new Set(s); n.delete(unit.id); return n; });
    }
  };

  // ── Add / edit / delete ────────────────────────────────────────────────────
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
      // Board sizes are bucketed into length bands in the grid, which is not a real size.
      size: group.sizeFilter && group.sizeFilter !== BLANK && group.type !== 'board' ? group.sizeFilter : undefined,
    });
    setFormModalOpen(true);
  };

  const handleAddNew = () => {
    setIsEditing(false);
    setSelectedItem(null);
    setImageUrl(null);
    form.resetFields();
    form.setFieldsValue({ status: 'available', type: filters.type || 'kite' });
    setFormModalOpen(true);
  };

  const handleEdit = (record) => {
    setIsEditing(true);
    setSelectedItem(record);
    setImageUrl(record.imageUrl || null);
    form.setFieldsValue({
      ...record,
      registerDate: record.purchase_date ? dayjs(record.purchase_date) : null,
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

  const renderConditionTag = (condition) => (condition ? (
    <Tag color={CONDITION_COLORS[condition] || 'default'}>{conditionLabel(condition)}</Tag>
  ) : null);

  const renderUnitActions = (u) => (
    <Space size="small">
      <Tooltip title={t('common:inventory.viewDetails')}>
        <Button type="text" size="small" icon={<EyeOutlined />} onClick={() => handleViewDetails(u)} />
      </Tooltip>
      {canManageEquipment && (
        <>
          <UnitStatusButton unit={u} pending={pendingStatus.has(u.id)} onToggle={changeStatus} />
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
      render: (_, u) => u.serialNumber || <Text type="secondary">—</Text>,
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
      width: 170,
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
        <EquipmentIcon typeKey={group.type} subtypes={group.units[0]?.subtypes} />
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
      width: 170,
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
              <EquipmentIcon size="card" className="mx-auto" typeKey={group.type} subtypes={group.units[0]?.subtypes} />
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

  // ── Size grid (default) ────────────────────────────────────────────────────
  // One row per model showing only the sizes that model actually has, as chips
  // coloured by the worst status in that size. A 21-model kite fleet spans 17
  // distinct sizes, so a full matrix is mostly empty cells; this reads "Mono:
  // 5m ×5, 7m ×5, 9m ×3" at a glance and fits a phone.
  const SizeChips = ({ group, typeKey }) => {
    const cells = Object.values(group.cells).sort((a, b) => compareSizes(a.size, b.size));
    return (
      <div className="flex flex-wrap gap-1.5">
        {cells.map((c) => (
          <Tooltip key={c.size} title={<StatusBreakdown group={c} />}>
            <Tag
              color={cellColor(c)}
              data-testid="size-chip"
              className="m-0 cursor-pointer px-2 py-0.5"
              onClick={() => (group.isSolo ? handleViewDetails(group.units[0]) : handleViewGroup(group, c.size))}
            >
              <span className="font-semibold">{sizeLabel(c.size, typeKey, t)}</span>
              <span className="ml-1 opacity-75 tabular-nums">{c.count}</span>
            </Tag>
          </Tooltip>
        ))}
      </div>
    );
  };

  const groupActions = (g) => (g.isSolo ? renderUnitActions(g.units[0]) : (
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
  ));

  const renderSizeRows = (section) => (
    <Table
      size="small"
      dataSource={section.groups}
      rowKey="key"
      pagination={false}
      columns={[
        {
          title: t('common:inventory.modelCol'),
          key: 'model',
          width: 220,
          render: (_, g) => (
            <div className="cursor-pointer" onClick={() => openGroup(g)}>
              <GroupIdentity group={g} />
            </div>
          ),
        },
        {
          title: t('common:inventory.sizesLabel'),
          key: 'sizes',
          render: (_, g) => <SizeChips group={g} typeKey={section.key} />,
        },
        {
          title: t('common:inventory.totalCol'),
          key: 'total',
          align: 'center',
          width: 80,
          responsive: ['md'],
          render: (_, g) => <Tag color="purple" className="m-0 font-semibold">{g.count}</Tag>,
        },
        {
          title: t('common:inventory.statusField'),
          key: 'status',
          width: 220,
          responsive: ['lg'],
          render: (_, g) => <StatusBreakdown group={g} />,
        },
        {
          title: t('common:table.actions'),
          key: 'actions',
          width: 120,
          responsive: ['md'],
          render: (_, g) => groupActions(g),
        },
      ]}
    />
  );

  // ── Size matrix (desktop option) ───────────────────────────────────────────
  // One row per model, one column per size, with column totals, for comparing
  // models against each other.
  const renderSizeMatrix = (section) => {
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
            <div className="font-semibold whitespace-nowrap">{sizeLabel(sz, section.key, t)}</div>
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
        width: 120,
        fixed: 'right',
        render: (_, g) => groupActions(g),
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
    if (viewMode === 'grid') return renderSizeRows(section);
    if (viewMode === 'matrix' && !isNarrow) return renderSizeMatrix(section);
    if (viewMode === 'matrix') return renderSizeRows(section);
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

  // A single section renders flat; several keep one collapsible section per type.
  const renderSections = () => (
    <div className="space-y-4">
      {(viewMode === 'grid' || viewMode === 'matrix') && <GridLegend />}
      {sectionedEquipment.length === 1 ? (
        <div className="space-y-3">
          <SectionTitle section={sectionedEquipment[0]} />
          {renderSectionBody(sectionedEquipment[0])}
        </div>
      ) : (
        <Collapse
          // Sections start closed: nine open tables is a wall; open the one you need.
          items={sectionedEquipment.map((section) => ({
            key: section.key,
            label: <SectionTitle section={section} />,
            children: renderSectionBody(section),
          }))}
        />
      )}
    </div>
  );

  // ── Tab bodies ─────────────────────────────────────────────────────────────
  const stateBlock = loading ? (
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
  ) : null;

  const emptyBlock = (
    <Empty description={filtersActive
      ? t('common:inventory.noMatch', { defaultValue: 'Nothing matches these filters' })
      : t('common:inventory.noEquipment')}
    >
      {filtersActive && (
        <Button onClick={clearFilters}>{t('common:inventory.clearFilters', { defaultValue: 'Clear filters' })}</Button>
      )}
    </Empty>
  );

  const inventoryBody = stateBlock || (sectionedEquipment.length === 0 ? emptyBlock : renderSections());

  const stocktakeBody = stateBlock || (stocktakeRows.length === 0 ? emptyBlock : (
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
            render: (c) => (c ? (
              <Tag color={c === 'poor' ? 'error' : c === 'fair' ? 'warning' : 'success'}>{conditionLabel(c)}</Tag>
            ) : <Text type="secondary">—</Text>),
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
  ));

  const planningBody = stateBlock || (planningRows.length === 0 ? emptyBlock : (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <StatTile title={t('common:inventory.planUsable')} value={planningTotals.usable} icon={<CheckCircleOutlined />} iconClass="text-emerald-500" />
        <StatTile title={t('common:inventory.planWatch')} value={planningTotals.watch} icon={<ClockCircleOutlined />} iconClass="text-amber-500" />
        <StatTile title={t('common:inventory.planReplace')} value={planningTotals.replace} icon={<ToolOutlined />} iconClass="text-red-500" />
        <StatTile title={t('common:inventory.planGaps')} value={planningTotals.gaps} icon={<ExclamationCircleOutlined />} iconClass={planningTotals.gaps > 0 ? 'text-red-500' : 'text-emerald-500'} />
      </div>
      <Alert type="info" showIcon message={t('common:inventory.planningHint')} />
      <Table
        size="small"
        rowKey="key"
        dataSource={planningRows}
        pagination={false}
        scroll={{ x: 720 }}
        onRow={(r) => ({ className: 'cursor-pointer', onClick: () => openInGrid(r) })}
        columns={[
          {
            title: t('common:inventory.modelCol'),
            key: 'model',
            render: (_, r) => (
              <div className="flex items-center gap-3 min-w-0">
                <EquipmentIcon typeKey={r.type} subtypes={r.subtypes} />
                <div className="min-w-0">
                  <Text strong className="block truncate">{r.name}</Text>
                  <Text type="secondary" className="text-xs">{[r.brand, typeLabel(r.type)].filter(Boolean).join(' · ')}</Text>
                </div>
              </div>
            ),
          },
          {
            title: t('common:inventory.size'),
            dataIndex: 'sizeKey',
            key: 'size',
            width: 150,
            render: (sz, r) => sizeLabel(sz, r.type, t),
          },
          { title: t('common:inventory.totalItems'), dataIndex: 'total', key: 'total', width: 80 },
          {
            title: t('common:inventory.planUsable'),
            dataIndex: 'usable',
            key: 'usable',
            width: 100,
            render: (v, r) => <Text type={r.gap ? 'danger' : undefined} strong={r.gap}>{v}</Text>,
          },
          { title: t('common:inventory.planWatch'), dataIndex: 'watch', key: 'watch', width: 100, responsive: ['md'] },
          {
            title: t('common:inventory.maintenance'),
            dataIndex: 'maintenance',
            key: 'maintenance',
            width: 110,
            responsive: ['md'],
            render: (v) => (v > 0 ? <Tag color="warning" icon={<ToolOutlined />}>{v}</Tag> : <Text type="secondary">0</Text>),
          },
          {
            title: t('common:inventory.planReplace'),
            dataIndex: 'replace',
            key: 'replace',
            width: 110,
            responsive: ['md'],
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
          {
            key: 'open',
            width: 40,
            align: 'center',
            render: () => (
              <Tooltip title={t('common:inventory.planOpenInGrid', { defaultValue: 'Show these units in the grid' })}>
                <RightOutlined className="text-slate-400" />
              </Tooltip>
            ),
          },
        ]}
      />
    </div>
  ));

  const tabLabel = (icon, label) => (
    <span className="flex items-center gap-1.5">{icon}{label}</span>
  );

  const tabItems = [
    {
      key: 'inventory',
      label: tabLabel(<TableOutlined />, t('common:inventory.tabInventory', { defaultValue: 'Inventory' })),
      children: <Card className="rounded-xl border-slate-200">{inventoryBody}</Card>,
    },
    {
      key: 'stocktake',
      label: tabLabel(<AuditOutlined />, t('common:inventory.viewStocktake')),
      children: <Card className="rounded-xl border-slate-200">{stocktakeBody}</Card>,
    },
    {
      key: 'planning',
      label: tabLabel(<ShoppingCartOutlined />, t('common:inventory.viewPlanning')),
      children: <Card className="rounded-xl border-slate-200">{planningBody}</Card>,
    },
  ];

  const displayControls = tab === 'inventory' ? (
    <div className="flex items-center gap-3">
      <Tooltip title={t('common:inventory.mergeVariantsHint')}>
        <label className="flex cursor-pointer select-none items-center gap-2 text-xs text-slate-600">
          <Switch size="small" checked={mergeVariants} onChange={changeMergeVariants} />
          <span className="hidden md:inline">{t('common:inventory.mergeVariants')}</span>
        </label>
      </Tooltip>
      <Segmented
        size="small"
        value={viewMode === 'matrix' && isNarrow ? 'grid' : viewMode}
        onChange={changeViewMode}
        options={[
          { value: 'grid', icon: <TableOutlined />, title: t('common:inventory.viewGrid') },
          // The model × size matrix needs width; phones get the chip rows instead.
          ...(isNarrow ? [] : [{ value: 'matrix', icon: <BorderlessTableOutlined />, title: t('common:inventory.viewMatrix', { defaultValue: 'Size matrix' }) }]),
          { value: 'list', icon: <UnorderedListOutlined />, title: t('common:inventory.viewList') },
          { value: 'cards', icon: <AppstoreOutlined />, title: t('common:inventory.viewCards') },
        ]}
      />
    </div>
  ) : null;

  const renderAvatar = (entity, sizeClass) => (
    entity.image_url || entity.imageUrl ? (
      <div className={`${sizeClass} mx-auto rounded-2xl overflow-hidden`}>
        <img src={entity.image_url || entity.imageUrl} alt={entity.name} className="w-full h-full object-cover" />
      </div>
    ) : (
      <EquipmentIcon
        size="lg"
        className="mx-auto"
        typeKey={entity.typeKey || entity.type}
        subtypes={entity.subtypes || entity.units?.[0]?.subtypes}
      />
    )
  );

  return (
    <div className="min-h-[60vh] max-w-[1400px] mx-auto pb-6">
      <InventoryHeader
        stats={stats}
        activeStat={activeStat}
        onStat={handleStat}
        onRefresh={refreshData}
        loading={loading}
        canManage={canManageEquipment}
        onAdd={handleAddNew}
      />

      <InventoryFilterBar
        filters={filters}
        compact={isNarrow}
        active={filtersActive}
        summary={summary}
        allCount={allCount}
        typeChips={typeChips}
        sizeChips={sizeChips}
        subtypeChips={subtypeChips}
        brandOptions={brandSelectOptions}
        conditionOptions={conditionSelectOptions}
        statusOptions={statusSelectOptions}
        onChange={setFilters}
        onClear={clearFilters}
        onExport={exportFilteredCsv}
        onExportPdf={exportFilteredPdf}
      />

      <div className="px-4">
        <Tabs
          activeKey={tab}
          onChange={setTab}
          size="small"
          items={tabItems}
          tabBarExtraContent={displayControls}
        />
      </div>

      {/* Detail Drawer */}
      <Drawer
        title={
          selectedGroup?.sizeFilter ? (
            <Space>
              {t('common:inventory.details')}
              <Tooltip title={t('common:inventory.showAllSizes')}>
                <Tag color="blue" closable onClose={(e) => { e.preventDefault(); setSelectedGroup(selectedGroup.base); }}>
                  {t('common:inventory.size')}: {sizeLabel(selectedGroup.sizeFilter, selectedGroup.type, t)}
                </Tag>
              </Tooltip>
            </Space>
          ) : t('common:inventory.details')
        }
        placement="right"
        width={isNarrow ? '100%' : selectedGroup ? 680 : 450}
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
              {renderAvatar(selectedGroup, 'w-20 h-20')}
              <Title level={4} className="mt-4 mb-0">{selectedGroup.name}</Title>
              <Text type="secondary">{selectedGroup.brand}</Text>
            </div>

            <Descriptions column={1} bordered size="small">
              <Descriptions.Item label={t('common:inventory.equipmentType')}>
                {typeLabel(selectedGroup.type)}
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
              {renderAvatar(selectedItem, 'w-20 h-20')}
              <Title level={4} className="mt-4 mb-0">{selectedItem.name}</Title>
              <Text type="secondary">{selectedItem.brand}</Text>
            </div>

            <Descriptions column={1} bordered size="small">
              <Descriptions.Item label={t('common:inventory.equipmentType')}>
                {typeLabel(selectedItem.typeKey)}
              </Descriptions.Item>
              {selectedItem.subtypes?.length > 0 && (
                <Descriptions.Item label={t('common:inventory.subtype', { defaultValue: 'Sub-type' })}>
                  {selectedItem.subtypes.map(subtypeLabel).join(' / ')}
                </Descriptions.Item>
              )}
              <Descriptions.Item label={t('common:inventory.assetCode')}>
                {selectedItem.serialNumber || 'N/A'}
              </Descriptions.Item>
              <Descriptions.Item label={t('common:inventory.size')}>{selectedItem.size || 'N/A'}</Descriptions.Item>
              <Descriptions.Item label={t('common:inventory.condition')}>
                {selectedItem.condition ? conditionLabel(selectedItem.condition) : 'N/A'}
              </Descriptions.Item>
              <Descriptions.Item label={t('common:inventory.statusField')}>
                <div className="flex flex-wrap items-center gap-2">
                  <Tag color={getStatusConfig(selectedItem.status).color} className="m-0">
                    {getStatusConfig(selectedItem.status).label}
                  </Tag>
                  {canManageEquipment && (
                    <UnitStatusButton
                      unit={selectedItem}
                      pending={pendingStatus.has(selectedItem.id)}
                      onToggle={changeStatus}
                      block
                    />
                  )}
                </div>
              </Descriptions.Item>
              <Descriptions.Item label={t('common:inventory.location')}>
                {selectedItem.location || 'N/A'}
              </Descriptions.Item>
              <Descriptions.Item label={t('common:inventory.registerDate')}>
                {selectedItem.purchase_date
                  ? dayjs(selectedItem.purchase_date).format('MMM DD, YYYY')
                  : 'N/A'}
              </Descriptions.Item>
            </Descriptions>

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
            <Col xs={24} sm={12}>
              <Form.Item
                name="name"
                label={t('common:inventory.equipmentName')}
                rules={[{ required: true, message: t('common:inventory.nameRequired') }]}
              >
                <Input placeholder={t('common:inventory.namePlaceholder')} />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item
                name="brand"
                label={t('common:inventory.brand')}
                rules={[{ required: true, message: t('common:inventory.brandRequired') }]}
              >
                <Select options={brandOptions} placeholder={t('common:inventory.selectBrand')} showSearch />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col xs={24} sm={12}>
              <Form.Item
                name="type"
                label={t('common:inventory.equipmentType')}
                rules={[{ required: true, message: t('common:inventory.typeRequired') }]}
              >
                <Select
                  options={EQUIPMENT_TYPES.map(({ value }) => ({ value, label: typeLabel(value) }))}
                  placeholder={t('common:inventory.selectType')}
                />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item
                name="size"
                label={t('common:inventory.size')}
              >
                {getSizeOptions(watchType).length > 0 ? (
                  <Select
                    options={getSizeOptions(watchType).map((s) => ({ value: s, label: s }))}
                    placeholder={t('common:inventory.selectSize')}
                  />
                ) : (
                  <Input placeholder={t('common:inventory.enterSize')} />
                )}
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col xs={24} sm={12}>
              <Form.Item
                name="condition"
                label={t('common:inventory.condition')}
              >
                <Select
                  options={CONDITION_VALUES.map((c) => ({ value: c, label: conditionLabel(c) }))}
                  placeholder={t('common:inventory.selectCondition')}
                />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item
                name="status"
                label={t('common:inventory.statusField')}
                rules={[{ required: true, message: t('common:inventory.statusRequired') }]}
              >
                <Select
                  options={STATUS_VALUES.map((s) => ({ value: s, label: statusLabel(s) }))}
                  placeholder={t('common:inventory.selectStatus')}
                />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col xs={24} sm={12}>
              <Form.Item name="serial_number" label={t('common:inventory.assetCode')}>
                <Input placeholder="K-001" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="location" label={t('common:inventory.location')}>
                <Input placeholder={t('common:inventory.locationPlaceholder', { defaultValue: 'e.g. Container A, beach, shop' })} />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col xs={24} sm={12}>
              <Form.Item name="registerDate" label={t('common:inventory.registerDate')}>
                <DatePicker style={{ width: '100%' }} />
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
