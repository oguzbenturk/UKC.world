import { useState, useEffect, useMemo } from 'react';
import {
  Button,
  Input,
  Empty,
  Table,
  Alert,
  Skeleton,
  Tag,
  Typography,
  Dropdown,
  Modal,
  Card,
  Space,
  Drawer,
  Divider,
  Form,
  InputNumber,
  Select,
  Row,
  Col,
  Tooltip,
  Upload,
} from 'antd';
import { message } from '@/shared/utils/antdStatic';
import {
  PlusOutlined,
  SearchOutlined,
  MoreOutlined,
  EditOutlined,
  EyeOutlined,
  DeleteOutlined,
  GiftOutlined,
  CloseCircleOutlined,
  UploadOutlined,
} from '@ant-design/icons';
import { useAuth } from "@/shared/hooks/useAuth";
import { serviceApi } from '@/shared/services/serviceApi';
import StepRentalServiceModal from '../components/StepRentalServiceModal';
import ServiceDetailModal from '../components/ServiceDetailModal';
import RentalPackageManager from '../components/RentalPackageManager';
import { useCurrency } from '@/shared/contexts/CurrencyContext';
import { UnifiedResponsiveTable } from '@/components/ui/ResponsiveTableV2';

// Helper functions moved outside to reduce component complexity
const getEquipmentInitials = (name) => {
  if (!name) return 'EQ';
  const words = name.split(' ').filter(w => w.length > 0);
  if (words.length >= 2) {
    return (words[0][0] + words[1][0]).toUpperCase();
  }
  return name.substring(0, 2).toUpperCase();
};

const getEquipmentColor = (name) => {
  const colors = {
    Kite: 'bg-blue-500',
    Board: 'bg-green-500',
    Harness: 'bg-purple-500',
    Wetsuit: 'bg-cyan-500',
    Helmet: 'bg-yellow-500',
    DLAB: 'bg-red-500',
    SLS: 'bg-orange-500',
    Pump: 'bg-gray-500',
    Bag: 'bg-indigo-500',
  };
  for (const [key, color] of Object.entries(colors)) {
    if (name?.includes(key)) return color;
  }
  return 'bg-blue-500';
};

const getCategoryColor = (category) => {
  const colors = {
    rental: 'blue',
    kite: 'red',
    board: 'green',
    accessory: 'purple',
    equipment: 'orange',
  };
  return colors[category?.toLowerCase()] || 'blue';
};

const RENTAL_SEGMENTS = [
  { key: 'all', label: 'All' },
  { key: 'sls', label: 'SLS' },
  { key: 'dlab', label: 'DLAB' },
  { key: 'standard', label: 'Standard' },
  { key: 'efoil', label: 'E-Foil' },
  { key: 'boards', label: 'Boards' },
  { key: 'accessories', label: 'Accessories' },
];

const DISCIPLINE_FILTERS = [
  { key: 'all', label: 'All Sports' },
  { key: 'kite', label: '🪁 Kite' },
  { key: 'wing', label: '🦅 Wing' },
  { key: 'kite_foil', label: '🏄 Kite Foil' },
  { key: 'efoil', label: '⚡ E-Foil' },
  { key: 'accessory', label: '🎒 Accessory' },
];

const getRentalSearchText = (service) => (
  `${service?.name || ''} ${service?.description || ''} ${service?.brand || ''} ${service?.category || ''}`
).toLowerCase();

const getRentalSegmentsForService = (service) => {
  // Prefer the explicit DB field when available
  if (service?.rentalSegment) {
    return [service.rentalSegment];
  }

  // Legacy fallback: infer from the service name
  const text = getRentalSearchText(service);
  const compact = text.replace(/[^a-z0-9]/g, ' ');

  const isBoard = ['board', 'twintip', 'twin tip', 'directional', 'surfboard', 'foil board'].some((k) => text.includes(k));
  const isAccessory = ['harness', 'helmet', 'wetsuit', 'accessory', 'pump', 'bag', 'vest', 'glove', 'bootie', 'bar'].some((k) => text.includes(k));
  const isSls = /\bsls\b/i.test(compact);
  const isDlab = /\bd\s*lab\b/i.test(compact) || /\bdlab\b/i.test(compact);

  const segments = [];
  if (isSls) segments.push('sls');
  if (isDlab) segments.push('dlab');
  if (isBoard) segments.push('boards');
  if (isAccessory) segments.push('accessories');

  if (!isSls && !isDlab && !isAccessory) {
    segments.push('standard');
  }

  return segments;
};

const TIER_COLORS_HEX = {
  standard: '#3b82f6',
  sls: '#f59e0b',
  dlab: '#eab308',
  efoil: '#10b981',
  boards: '#6366f1',
  accessories: '#a855f7',
};

const getTierForService = (service) => {
  const segs = getRentalSegmentsForService(service);
  if (segs.includes('efoil')) return 'efoil';
  if (segs.includes('dlab')) return 'dlab';
  if (segs.includes('sls')) return 'sls';
  if (segs.includes('boards')) return 'boards';
  if (segs.includes('accessories')) return 'accessories';
  if (segs.includes('standard')) return 'standard';
  return null;
};

// Strip leading duration prefix like "168H - " to get groupable product name
const getBaseProductName = (name) =>
  String(name || '').replace(/^(\d+(?:\.\d+)?)[Hh](?:ours?)?\s*[-–—]\s*/i, '');

const SEGMENT_ACCENT_COLORS = {
  all: '#64748b',
  standard: '#3b82f6',
  sls: '#f59e0b',
  dlab: '#eab308',
  efoil: '#10b981',
  boards: '#6366f1',
  accessories: '#a855f7',
};

const DISCIPLINE_LABELS = {
  kite: '🪁 Kite',
  wing: '🦅 Wing',
  kite_foil: '🏄 Kite Foil',
  efoil: '⚡ E-Foil',
  premium: '💎 Premium',
  accessory: '🎒 Accessory',
};

// --- Drawer form constants & helpers ---
const { Option } = Select;

const RENTAL_SEGMENT_OPTIONS_LIST = [
  { value: 'standard', label: 'Standard' },
  { value: 'sls', label: 'SLS' },
  { value: 'dlab', label: 'D/LAB' },
  { value: 'efoil', label: 'E-Foil' },
  { value: 'board', label: 'Board' },
  { value: 'accessory', label: 'Accessory' },
];

const DISCIPLINE_OPTIONS_LIST = [
  { value: 'kite', label: '🪁 Kitesurfing' },
  { value: 'wing', label: '🦅 Wing Foiling' },
  { value: 'kite_foil', label: '🏄 Kite Foiling' },
  { value: 'efoil', label: '⚡ E-Foil' },
  { value: 'accessory', label: '🎒 Accessories' },
];

const QUICK_DURATIONS_LIST = [
  { label: '1h', value: 1 },
  { label: '4h', value: 4 },
  { label: '8h', value: 8 },
  { label: '1 Week', value: 168 },
];

const SEGMENT_LABELS_FULL = {
  sls: 'SLS', dlab: 'D/LAB', standard: 'Standard', efoil: 'E-Foil', board: 'Board', accessory: 'Accessory',
};

/** Strip leading "{duration}H - {SEGMENT} - " from stored service name */
const stripDurationPrefix = (name, rentalSegment) => {
  if (!name) return '';
  let n = name.replace(/^\d+\.?\d*[Hh]\s*[-–]\s*/u, '').trim();
  const segLabel = SEGMENT_LABELS_FULL[rentalSegment] || '';
  if (segLabel) n = n.replace(new RegExp(`^${segLabel.replace('/', '\\/')}\\s*[-–]\\s*`, 'i'), '').trim();
  return n || name;
};

/** Build the storedName + full API payload from drawer form values */
const buildRentalServicePayload = (values, businessCurrency) => {
  const segment = values.rentalSegment || 'standard';
  const segLabel = SEGMENT_LABELS_FULL[segment] || segment.toUpperCase();
  const baseName = (values.name || '').trim() || 'Rental Service';
  const dH = parseFloat(values.duration);
  const durationTag = Number.isFinite(dH) ? `${dH}H` : '';
  const storedName = durationTag ? `${durationTag} - ${segLabel} - ${baseName}` : `${segLabel} - ${baseName}`;
  return {
    name: storedName,
    category: 'rental',
    duration: parseFloat(values.duration),
    price: parseFloat(values.price),
    currency: values.currency || businessCurrency || 'EUR',
    description: values.description || '',
    includes: values.includes || '',
    imageUrl: values.imageUrl || null,
    serviceType: 'rental',
    isPackage: false,
    disciplineTag: values.disciplineTag || null,
    rentalSegment: segment,
    max_participants: parseInt(values.availableUnits, 10) || 1,
    maxParticipants: parseInt(values.availableUnits, 10) || 1,
    insuranceRate: (values.insuranceRate != null && values.insuranceRate !== '') ? parseFloat(values.insuranceRate) : null,
  };
};

const isValidNumber = (value) => typeof value === 'number' && Number.isFinite(value);

const tidyNumber = (value) => {
  if (!isValidNumber(value)) return '';
  const fixed = value.toFixed(2);
  return fixed.replace(/\.00$/, '').replace(/(\.\d)0$/, '$1');
};

const formatDurationDisplay = (rawDuration) => {
  const hours = Number(rawDuration);
  if (!Number.isFinite(hours) || hours <= 0) {
    return { long: '—', short: '', type: 'hourly' };
  }

  if (hours < 1) {
    const minutes = Math.max(15, Math.round(hours * 60));
    const label = `${minutes} minute${minutes === 1 ? '' : 's'}`;
    return { long: label, short: `${minutes}m`, type: 'hourly' };
  }

  if (hours < 24) {
    const clean = tidyNumber(hours);
    const plural = Number(hours) === 1 ? '' : 's';
    return { long: `${clean} hour${plural}`, short: `${clean}h`, type: 'hourly' };
  }

  const nearlyInteger = (x) => Math.abs(x - Math.round(x)) < 0.02;
  const weeks = hours / 168;
  if (hours >= 168 && nearlyInteger(weeks)) {
    const w = Math.round(weeks);
    const plural = w === 1 ? '' : 's';
    return { long: `${w} week${plural}`, short: `${w}w`, type: 'weekly' };
  }

  const days = hours / 24;
  const clean = tidyNumber(days);
  const plural = Number(days) === 1 ? '' : 's';
  return { long: `${clean} day${plural}`, short: `${clean}d`, type: 'daily' };
};

const formatServiceName = (name) => {
  const s = String(name || '');
  const match = s.match(/^(\d+(?:\.\d+)?)[Hh](?:ours?)?\s*[-–—]\s*/);
  if (!match) return s;
  const hours = parseFloat(match[1]);
  const nearlyInteger = (x) => Math.abs(x - Math.round(x)) < 0.02;
  const weeks = hours / 168;
  if (hours >= 168 && nearlyInteger(weeks)) {
    const w = Math.round(weeks);
    return `${w} Week${w === 1 ? '' : 's'} - ${s.slice(match[0].length)}`;
  }
  const days = hours / 24;
  if (hours >= 24 && nearlyInteger(days)) {
    const d = Math.round(days);
    return `${d} Day${d === 1 ? '' : 's'} - ${s.slice(match[0].length)}`;
  }
  return s;
};

const makeColumns = ({ formatCurrency, convertCurrency, userCurrency, businessCurrency, canDeleteServices, handleView, handleEdit, handleDelete, formatDuration }) => [
  {
    title: 'Equipment',
    dataIndex: 'name',
    key: 'name',
    render: (text, record) => {
      const tierColor = TIER_COLORS_HEX[getTierForService(record)];
      return (
      <div className="flex items-center">
        <div
          className={`w-10 h-10 rounded-lg flex items-center justify-center mr-3 text-white font-semibold text-sm ${getEquipmentColor(record.name)}`}
          style={tierColor ? { outline: `2px solid ${tierColor}`, outlineOffset: '2px' } : {}}
        >
          {getEquipmentInitials(record.name)}
        </div>
        <div>
          <div className="font-medium">{formatServiceName(text)}</div>
          <div className="text-sm text-gray-500">{record.description}</div>
        </div>
      </div>
      );
    },
  },
  {
    title: 'Category',
    dataIndex: 'category',
    key: 'category',
    render: (category) => {
      const color = getCategoryColor(category);
      return <Tag color={color}>{category?.charAt(0).toUpperCase() + category?.slice(1)}</Tag>;
    },
  },
  {
    title: 'Sport',
    dataIndex: 'disciplineTag',
    key: 'disciplineTag',
    render: (tag) => tag ? <Tag color="purple">{DISCIPLINE_LABELS[tag] || tag}</Tag> : <span className="text-gray-400 text-xs">—</span>,
  },
  {
    title: 'Brand',
    dataIndex: 'brand',
    key: 'brand',
    render: (brand) => brand || '-',
  },
  {
    title: 'Duration',
    dataIndex: 'duration',
    key: 'duration',
    render: (duration) => formatDuration(duration).long,
  },
  {
    title: 'Price',
    dataIndex: 'price',
    key: 'price',
    render: (price, record) => {
      const baseCurrency = record.currency || businessCurrency || 'EUR';
      const targetCurrency = userCurrency || baseCurrency;
      const convertedPrice = convertCurrency ? convertCurrency(price || 0, baseCurrency, targetCurrency) : (price || 0);
      
      return (
        <span className="font-medium">
          {formatCurrency(Number(convertedPrice), targetCurrency)} <span className="text-gray-500">/ {formatDuration(record.duration).short || 'booking'}</span>
        </span>
      );
    },
  },
  {
    title: 'Actions',
    key: 'actions',
    width: 120,
    render: (_, record) => (
      <Dropdown
        menu={{
          items: [
            {
              key: 'view',
              icon: <EyeOutlined />,
              label: 'View Details',
              onClick: () => handleView(record),
            },
            {
              key: 'edit',
              icon: <EditOutlined />,
              label: 'Edit',
              onClick: () => handleEdit(record),
            },
            ...(canDeleteServices ? [{
              key: 'delete',
              icon: <DeleteOutlined />,
              label: 'Delete',
              onClick: () => handleDelete(record),
              danger: true,
            }] : []),
          ],
        }}
        trigger={['click']}
      >
        <Button type="text" icon={<MoreOutlined />} />
      </Dropdown>
    ),
  },
];

const { Title } = Typography;

function RentalServices() {
  const { user } = useAuth();
  const { formatCurrency, businessCurrency, convertCurrency, userCurrency, getCurrencySymbol, getSupportedCurrencies } = useCurrency();
  
  // Check if user has permission to delete services
  const canDeleteServices = user?.role === 'admin' || user?.role === 'manager';
  const [services, setServices] = useState([]);
  const [filteredServices, setFilteredServices] = useState([]);
  // const [availableCategories, setAvailableCategories] = useState([]);
  const [rentalCategories, setRentalCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchText, setSearchText] = useState('');
  const [error, setError] = useState(null);
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [disciplineFilter, setDisciplineFilter] = useState('all');
  
  const [rentalModalOpen, setRentalModalOpen] = useState(false);
  const [detailModalVisible, setDetailModalVisible] = useState(false);
  const [selectedService, setSelectedService] = useState(null);
  const [packageManagerVisible, setPackageManagerVisible] = useState(false);
  const [selectedGroupKey, setSelectedGroupKey] = useState(null);
  const [durationDrawerOpen, setDurationDrawerOpen] = useState(false);
  // Drawer-internal mode: 'list' | 'edit' | 'add'
  const [drawerMode, setDrawerMode] = useState('list');
  const [editingService, setEditingService] = useState(null);
  const [drawerSubmitting, setDrawerSubmitting] = useState(false);
  const [drawerImageUrl, setDrawerImageUrl] = useState(null);
  const [drawerImageUploading, setDrawerImageUploading] = useState(false);
  const [drawerForm] = Form.useForm();

  // Load rental services on component mount
  useEffect(() => {
    loadServices();
  }, []);

  // Initialise drawerImageUrl from the group's first service whenever the drawer opens
  useEffect(() => {
    if (durationDrawerOpen && selectedGroup) {
      const first = selectedGroup.services[0];
      setDrawerImageUrl(first?.imageUrl || first?.image_url || null);
    }
  }, [durationDrawerOpen, selectedGroupKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Function to load/reload services
  const loadServices = async () => {
    try {
      setLoading(true);
      const [servicesData, categoriesData] = await Promise.all([
        serviceApi.getServices(),
        serviceApi.getFullServiceCategories()
      ]);
      
      // Get rental-related categories from centralized Categories
      const rentalCats = categoriesData.filter(cat => 
        cat.status === 'active' && (
          cat.type === 'rental' || 
          cat.name.toLowerCase().includes('rental') ||
          cat.name.toLowerCase().includes('equipment')
        )
      );
      setRentalCategories(rentalCats);
  // setAvailableCategories(categoriesData);
      
      // Get category names for filtering services
      const rentalCategoryNames = rentalCats.map(cat => cat.name.toLowerCase());
      
      // Filter rental services
      const rentalServices = servicesData.filter(service => 
        rentalCategoryNames.includes(service.category?.toLowerCase()) ||
        service.category === 'rental' // fallback for old data
      );
      
      setServices(rentalServices);
      setError(null);
    } catch (_err) {
      // mark used to satisfy lint without logging to console
      void _err;
      setError('Failed to load rental services. Please try again later.');
    } finally {
      setLoading(false);
    }
  };

  const segmentFilters = useMemo(() => {
    const counts = RENTAL_SEGMENTS.reduce((acc, segment) => {
      acc[segment.key] = segment.key === 'all'
        ? services.length
        : services.filter((service) => getRentalSegmentsForService(service).includes(segment.key)).length;
      return acc;
    }, {});

    return RENTAL_SEGMENTS.map((segment) => ({
      ...segment,
      count: counts[segment.key] || 0,
    }));
  }, [services]);

  const disciplineFilters = useMemo(() => {
    const counts = DISCIPLINE_FILTERS.reduce((acc, disc) => {
      acc[disc.key] = disc.key === 'all'
        ? services.length
        : services.filter((s) => s.disciplineTag === disc.key).length;
      return acc;
    }, {});
    return DISCIPLINE_FILTERS.map((disc) => ({ ...disc, count: counts[disc.key] || 0 }));
  }, [services]);

  const tierStats = useMemo(() => [
    { key: 'standard', label: 'Standard', color: '#3b82f6', icon: '⚙️', count: services.filter(s => getRentalSegmentsForService(s).includes('standard')).length },
    { key: 'sls',      label: 'SLS',      color: '#f59e0b', icon: '⚡', count: services.filter(s => getRentalSegmentsForService(s).includes('sls')).length },
    { key: 'dlab',     label: 'D-LAB',    color: '#eab308', icon: '🏆', count: services.filter(s => getRentalSegmentsForService(s).includes('dlab')).length },
    { key: 'efoil',    label: 'E-Foil',   color: '#10b981', icon: '🌊', count: services.filter(s => getRentalSegmentsForService(s).includes('efoil')).length },
  ], [services]);

  // Group filtered services by their base product name (strip duration prefix)
  const groupedServices = useMemo(() => {
    const groups = new Map();
    filteredServices.forEach(service => {
      const key = getBaseProductName(service.name);
      if (!groups.has(key)) {
        groups.set(key, { key, segment: getTierForService(service), services: [] });
      }
      groups.get(key).services.push(service);
    });
    // Sort durations within each group ascending
    groups.forEach(g => g.services.sort((a, b) => Number(a.duration) - Number(b.duration)));
    return Array.from(groups.values());
  }, [filteredServices]);

  // Reactively derive selected group from groupedServices (auto-updates on edit/delete)
  const selectedGroup = selectedGroupKey
    ? (groupedServices.find(g => g.key === selectedGroupKey) ?? null)
    : null;

  // Filter services when search changes
  useEffect(() => {
    let result = [...services];
    
    // Apply search filter
    if (searchText) {
      result = result.filter(service =>
        service.name?.toLowerCase().includes(searchText.toLowerCase()) ||
        service.description?.toLowerCase().includes(searchText.toLowerCase()) ||
        service.brand?.toLowerCase().includes(searchText.toLowerCase()) ||
        service.category?.toLowerCase().includes(searchText.toLowerCase())
      );
    }

    // Apply segment filter
    if (categoryFilter !== 'all') {
      result = result.filter((service) => getRentalSegmentsForService(service).includes(categoryFilter));
    }

    // Apply discipline filter
    if (disciplineFilter !== 'all') {
      result = result.filter((service) => service.disciplineTag === disciplineFilter);
    }
    
    setFilteredServices(result);
  }, [services, searchText, categoryFilter, disciplineFilter]);

  const handleServiceCreated = async () => {
    // Reload all services to pick up all batch-created items
    await loadServices();
    setRentalModalOpen(false);
    setSelectedService(null);
  };

  const handleServiceUpdated = async (updatedService) => {
    setServices(prev => prev.map(service => 
      service.id === updatedService.id ? updatedService : service
    ));
    setRentalModalOpen(false);
    setSelectedService(null);
    message.success('Rental service updated successfully!');
  };

  const handleServiceDeleted = (serviceId) => {
    setServices(prev => {
      const updated = prev.filter(service => service.id !== serviceId);
      // If the open group's last duration was deleted, close the drawer
      if (selectedGroupKey) {
        const groupStillHasServices = updated.some(
          s => getBaseProductName(s.name) === selectedGroupKey
        );
        if (!groupStillHasServices) {
          setDurationDrawerOpen(false);
          setSelectedGroupKey(null);
        }
      }
      return updated;
    });
    setDetailModalVisible(false);
    setSelectedService(null);
  };

  const handleEdit = (service) => {
    setSelectedService(service);
    setRentalModalOpen(true);
  };

  const handleView = (service) => {
    setSelectedService(service);
    setDetailModalVisible(true);
  };

  const handleDelete = async (service) => {
    // Show confirmation dialog
    Modal.confirm({
      title: 'Delete Rental Service',
      content: `Are you sure you want to delete "${service.name}"? This action cannot be undone.`,
      okText: 'Yes, Delete',
      okType: 'danger',
      cancelText: 'Cancel',
      onOk: async () => {
        try {
          await serviceApi.deleteService(service.id);
          handleServiceDeleted(service.id);
          message.success('Rental service deleted successfully!');
        } catch (error) {
          if (error.response?.status === 403) {
            message.error('You do not have permission to delete services. Only administrators and managers can delete services.');
          } else {
            message.error('Failed to delete service. Please try again.');
          }
        }
      }
    });
  };

  // --- Drawer image upload ---
  const handleDrawerImageUpload = async (file) => {
    setDrawerImageUploading(true);
    try {
      const result = await serviceApi.uploadServiceImage(file);
      setDrawerImageUrl(result.imageUrl);
      // In list mode, immediately save to all services in the group so it's not lost on close.
      // Must send the full payload (backend PUT requires name/price/duration etc.)
      if (drawerMode === 'list' && selectedGroup) {
        // Only update services that have all required fields — guards against stale closure state
        const validServices = selectedGroup.services.filter(
          s => s.id && s.name && s.duration != null && s.price != null
        );
        if (validServices.length > 0) {
          await Promise.all(
            validServices.map(s => serviceApi.updateService(s.id, {
              name: s.name,
              category: s.category || 'rental',
              serviceType: s.serviceType || s.service_type || 'rental',
              duration: s.duration,
              price: s.price,
              currency: s.currency || businessCurrency || 'EUR',
              description: s.description || '',
              includes: s.includes || '',
              imageUrl: result.imageUrl,
              disciplineTag: s.disciplineTag || s.discipline_tag || null,
              rentalSegment: s.rentalSegment || s.rental_segment || null,
              maxParticipants: s.max_participants || s.maxParticipants || 1,
              insuranceRate: s.insuranceRate ?? null,
            }))
          );
        }
        setServices(prev => prev.map(s =>
          validServices.some(gs => gs.id === s.id)
            ? { ...s, imageUrl: result.imageUrl, image_url: result.imageUrl }
            : s
        ));
      }
      message.success('Image saved');
    } catch {
      message.error('Image upload failed');
    } finally {
      setDrawerImageUploading(false);
    }
    return false; // prevent antd auto-upload
  };

  // --- Drawer form handlers ---
  const openEditMode = (service) => {
    setEditingService(service);
    drawerForm.setFieldsValue({
      name: stripDurationPrefix(service.name, service.rentalSegment),
      rentalSegment: service.rentalSegment || undefined,
      disciplineTag: service.disciplineTag || undefined,
      duration: service.duration,
      price: service.price,
      currency: service.currency || businessCurrency || 'EUR',
      availableUnits: service.max_participants || service.maxParticipants || 1,
      insuranceRate: service.insuranceRate ?? undefined,
      description: service.description || '',
      includes: service.includes || '',
    });
    setDrawerMode('edit');
  };

  const openAddMode = () => {
    const firstService = selectedGroup?.services[0];
    drawerForm.resetFields();
    drawerForm.setFieldsValue({
      name: stripDurationPrefix(firstService?.name, firstService?.rentalSegment) || '',
      rentalSegment: selectedGroup?.segment || undefined,
      disciplineTag: firstService?.disciplineTag || undefined,
      currency: firstService?.currency || businessCurrency || 'EUR',
      availableUnits: 1,
      description: '',
      includes: '',
    });
    setEditingService(null);
    setDrawerMode('add');
  };

  const handleDrawerSave = async () => {
    try {
      await drawerForm.validateFields();
      setDrawerSubmitting(true);
      const values = { ...drawerForm.getFieldsValue(true), imageUrl: drawerImageUrl };
      const payload = buildRentalServicePayload(values, businessCurrency);
      if (drawerMode === 'edit' && editingService?.id) {
        const updated = await serviceApi.updateService(editingService.id, payload);
        setServices(prev => prev.map(s => s.id === updated.id ? updated : s));
        message.success('Duration updated');
      } else {
        await serviceApi.createService(payload);
        await loadServices();
        message.success('Duration added');
      }
      setDrawerMode('list');
      setEditingService(null);
    } catch (err) {
      if (err?.errorFields) return;
      message.error(err?.response?.data?.error || err?.message || 'Save failed');
    } finally {
      setDrawerSubmitting(false);
    }
  };

  const closeDrawer = () => {
    setDurationDrawerOpen(false);
    setDrawerMode('list');
    setEditingService(null);
    setDrawerImageUrl(null);
    drawerForm.resetFields();
  };

  // Table columns configuration
  const columns = makeColumns({
    formatCurrency,
    businessCurrency,
    convertCurrency,
    userCurrency,
    canDeleteServices,
    handleView,
    handleEdit,
    handleDelete,
    formatDuration: formatDurationDisplay,
  });

  // Helper functions for equipment display
  // local helpers moved to top-level

  // Grouped table columns — one row per product, durations shown in drawer
  const groupedColumns = [
    {
      title: 'Product',
      key: 'product',
      render: (_, group) => {
        const tierColor = TIER_COLORS_HEX[group.segment];
        const firstService = group.services[0];
        return (
          <div className="flex items-center gap-3">
            <div
              className={`w-10 h-10 flex-shrink-0 rounded-lg flex items-center justify-center text-white font-semibold text-sm ${getEquipmentColor(firstService?.name)}`}
              style={tierColor ? { outline: `2px solid ${tierColor}`, outlineOffset: '2px' } : {}}
            >
              {getEquipmentInitials(firstService?.name)}
            </div>
            <div className="min-w-0">
              <div className="font-medium text-slate-900 leading-tight">{group.key}</div>
              <div className="text-xs text-slate-400 mt-0.5 truncate max-w-xs">{firstService?.description}</div>
            </div>
          </div>
        );
      },
    },
    {
      title: 'Tier',
      key: 'tier',
      render: (_, group) => {
        const tierColor = TIER_COLORS_HEX[group.segment];
        if (!tierColor) return <span className="text-slate-400 text-xs">—</span>;
        return (
          <Tag style={{ background: `${tierColor}18`, color: tierColor, border: `1px solid ${tierColor}44`, fontWeight: 600, borderRadius: 6 }}>
            {group.segment?.toUpperCase()}
          </Tag>
        );
      },
    },
    {
      title: 'Sport',
      key: 'sport',
      render: (_, group) => {
        const tag = group.services[0]?.disciplineTag;
        return tag
          ? <Tag color="purple">{DISCIPLINE_LABELS[tag] || tag}</Tag>
          : <span className="text-gray-400 text-xs">—</span>;
      },
    },
    {
      title: 'Durations',
      key: 'durations',
      render: (_, group) => (
        <div className="flex flex-wrap gap-1">
          {group.services.map(s => (
            <span key={s.id} className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-medium">
              {formatDurationDisplay(s.duration).short}
            </span>
          ))}
        </div>
      ),
    },
    {
      title: 'Price Range',
      key: 'price',
      render: (_, group) => {
        const firstService = group.services[0];
        const baseCurrency = firstService?.currency || businessCurrency || 'EUR';
        const targetCurrency = userCurrency || baseCurrency;
        const prices = group.services
          .map(s => convertCurrency ? convertCurrency(s.price || 0, baseCurrency, targetCurrency) : (s.price || 0))
          .sort((a, b) => a - b);
        const min = prices[0];
        const max = prices[prices.length - 1];
        return (
          <span className="font-semibold text-slate-900 tabular-nums">
            {min === max
              ? formatCurrency(min, targetCurrency)
              : <>{formatCurrency(min, targetCurrency)}<span className="text-slate-400 font-normal mx-1">–</span>{formatCurrency(max, targetCurrency)}</>}
          </span>
        );
      },
    },
    {
      title: '',
      key: 'actions',
      width: 140,
      render: (_, group) => (
        <Button
          size="small"
          onClick={() => { setSelectedGroupKey(group.key); setDurationDrawerOpen(true); }}
          style={{ borderColor: '#cbd5e1', color: '#475569' }}
        >
          {group.services.length} Duration{group.services.length !== 1 ? 's' : ''} →
        </Button>
      ),
    },
  ];

  // Mobile card for the grouped table view
  const GroupMobileCard = ({ record: group }) => {
    const tierColor = TIER_COLORS_HEX[group.segment];
    const firstService = group.services[0];
    const baseCurrency = firstService?.currency || businessCurrency || 'EUR';
    const targetCurrency = userCurrency || baseCurrency;
    const prices = group.services
      .map(s => convertCurrency ? convertCurrency(s.price || 0, baseCurrency, targetCurrency) : (s.price || 0))
      .sort((a, b) => a - b);
    const min = prices[0];
    const max = prices[prices.length - 1];
    return (
      <Card
        styles={{ body: { padding: 12 } }}
        className="mb-3 shadow-sm border border-slate-200 cursor-pointer active:bg-slate-50"
        style={tierColor ? { borderLeft: `3px solid ${tierColor}` } : {}}
        onClick={() => { setSelectedGroupKey(group.key); setDurationDrawerOpen(true); }}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div
              className={`w-10 h-10 flex-shrink-0 rounded-lg flex items-center justify-center text-white font-semibold text-sm ${getEquipmentColor(firstService?.name)}`}
              style={tierColor ? { outline: `2px solid ${tierColor}`, outlineOffset: '2px' } : {}}
            >
              {getEquipmentInitials(firstService?.name)}
            </div>
            <div className="min-w-0">
              <div className="font-medium text-slate-900 truncate">{group.key}</div>
              {group.segment && (
                <span className="inline-block mt-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded" style={{ background: tierColor ? `${tierColor}18` : undefined, color: tierColor }}>
                  {group.segment.toUpperCase()}
                </span>
              )}
            </div>
          </div>
          <div className="text-right flex-shrink-0">
            <div className="font-semibold text-slate-900 text-sm tabular-nums">
              {min === max ? formatCurrency(min, targetCurrency) : `${formatCurrency(min, targetCurrency)} – ${formatCurrency(max, targetCurrency)}`}
            </div>
            <div className="text-xs text-slate-400 mt-0.5">{group.services.length} option{group.services.length !== 1 ? 's' : ''}</div>
          </div>
        </div>
        <div className="mt-2 flex flex-wrap gap-1">
          {group.services.map(s => (
            <span key={s.id} className="text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">
              {formatDurationDisplay(s.duration).short}
            </span>
          ))}
        </div>
      </Card>
    );
  };

  // Build currency select options for the drawer form
  const drawerCurrencyOptions = (() => {
    const list = getSupportedCurrencies?.() || [];
    const items = list.length > 0 ? list : ['EUR', 'USD', 'GBP'];
    return items.map(item => {
      const code = typeof item === 'string' ? item : item.value;
      const label = typeof item === 'string' ? `${getCurrencySymbol?.(code) || ''} ${code}`.trim() : (item.label || `${getCurrencySymbol?.(code) || ''} ${code}`.trim());
      return { code, label };
    });
  })();

  if (loading) {
    return (
      <div className="p-6">
        <Skeleton active />
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6 p-3 sm:p-6 max-w-7xl mx-auto">
      <Card
        variant="borderless"
        className="relative overflow-hidden rounded-2xl sm:rounded-3xl border border-slate-200 bg-white shadow-sm"
        styles={{ body: { padding: '16px' } }}
        classNames={{ body: 'sm:!p-8' }}
      >
        <div className="pointer-events-none absolute -top-20 right-8 h-44 w-44 rounded-full bg-blue-100" />
        <div className="pointer-events-none absolute -bottom-24 left-16 h-48 w-48 rounded-full bg-sky-50" />
        <div className="relative space-y-3 sm:space-y-4">
          <div className="space-y-2 sm:space-y-3 max-w-2xl">
            <Title level={2} className="!mb-0 text-slate-900 !text-lg sm:!text-xl md:!text-2xl">Rental Packages</Title>
            <p className="text-slate-600 text-xs sm:text-sm md:text-base leading-relaxed">
              Fine-tune the equipment bundles your team can book in seconds. Keep pricing transparent, durations consistent, and gear easy to find.
            </p>
          </div>
          {rentalCategories.length > 0 && (
            <div className="flex flex-wrap gap-2 text-xs sm:text-sm text-slate-600">
              <span className="font-medium text-slate-500">Active categories</span>
              {rentalCategories.map((cat) => (
                <Tag
                  key={cat.id || cat.name}
                  color="geekblue"
                  className="!border-0 !rounded-full !bg-blue-50 !text-blue-600 !text-xs"
                >
                  {cat.name}
                </Tag>
              ))}
            </div>
          )}
        </div>
      </Card>

      {/* Tier Stats Overview */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {tierStats.map(stat => (
          <div
            key={stat.key}
            className="bg-white border border-slate-200 rounded-xl p-4 cursor-pointer hover:shadow-md transition-all duration-200 group select-none"
            style={{ borderLeft: `4px solid ${stat.color}` }}
            onClick={() => setCategoryFilter(stat.key)}
            role="button"
            tabIndex={0}
            onKeyDown={e => e.key === 'Enter' && setCategoryFilter(stat.key)}
          >
            <div className="flex items-end justify-between">
              <div>
                <div className="text-2xl sm:text-3xl font-bold text-slate-900 leading-none tabular-nums">{stat.count}</div>
                <div className="text-xs font-semibold mt-1.5 tracking-wide" style={{ color: stat.color }}>{stat.label}</div>
                <div className="text-xs text-slate-400 mt-0.5">services</div>
              </div>
              <div className="text-xl opacity-50 group-hover:opacity-90 transition-opacity">{stat.icon}</div>
            </div>
          </div>
        ))}
      </div>

      {rentalCategories.length === 0 && !loading && (
        <Alert
          message="No rental categories found"
          description="Activate at least one rental category under Services > Categories to keep these packages organized."
          type="warning"
          showIcon
        />
      )}

      {error && (
        <Alert
          message="Error"
          description={error}
          type="error"
          showIcon
          closable
          onClose={() => setError(null)}
        />
      )}

      <div className="bg-white border border-slate-200/60 shadow-sm rounded-xl sm:rounded-2xl p-3 sm:p-4 flex flex-col gap-3 sm:gap-4">
        <Input
          placeholder="Search rental packages..."
          prefix={<SearchOutlined />}
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          size="middle"
          allowClear
          className="w-full"
        />
        <div className="flex flex-wrap gap-1.5 items-center">
          <span className="text-xs text-slate-400 font-medium mr-0.5">Segment:</span>
          {segmentFilters.map(({ key, label, count }) => {
            const accentColor = SEGMENT_ACCENT_COLORS[key] || '#64748b';
            const isActive = categoryFilter === key;
            return (
              <button
                key={key}
                onClick={() => setCategoryFilter(key)}
                className="text-xs sm:text-sm px-3 py-1 rounded-lg font-medium transition-all duration-150 border leading-5"
                style={isActive ? {
                  background: accentColor,
                  color: '#fff',
                  borderColor: accentColor,
                  boxShadow: `0 1px 6px ${accentColor}55`,
                } : {
                  background: '#fff',
                  color: '#64748b',
                  borderColor: '#e2e8f0',
                }}
              >
                {label} <span style={{ opacity: isActive ? 0.75 : 0.55 }}>({count})</span>
              </button>
            );
          })}
        </div>
        <div className="flex flex-wrap gap-2">
          <span className="text-xs text-slate-400 self-center font-medium mr-1">Sport:</span>
          {disciplineFilters.map(({ key, label, count }) => (
            <Button
              key={key}
              type={disciplineFilter === key ? 'primary' : 'default'}
              onClick={() => setDisciplineFilter(key)}
              size="small"
              className="text-xs sm:text-sm"
            >
              {label} ({count})
            </Button>
          ))}
        </div>
        <div className="flex gap-2 w-full">
          {(categoryFilter !== 'all' || disciplineFilter !== 'all' || searchText) && (
            <Button
              icon={<CloseCircleOutlined />}
              size="middle"
              onClick={() => { setCategoryFilter('all'); setDisciplineFilter('all'); setSearchText(''); }}
              className="flex-shrink-0"
            >
              Clear Filters
            </Button>
          )}
          <Button
            icon={<GiftOutlined />}
            size="middle"
            onClick={() => setPackageManagerVisible(true)}
            className="bg-orange-500 hover:bg-orange-600 text-white border-orange-500 flex-1 sm:flex-none"
          >
            <span className="hidden sm:inline">Manage Packages</span>
            <span className="sm:hidden">Packages</span>
          </Button>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            size="middle"
            onClick={() => { setSelectedService(null); setRentalModalOpen(true); }}
            className="flex-1 sm:flex-none"
          >
            <span className="hidden sm:inline">Add Rental Service</span>
            <span className="sm:hidden">Add</span>
          </Button>
        </div>
      </div>

      <UnifiedResponsiveTable
        density="comfortable"
        columns={groupedColumns}
        dataSource={groupedServices}
        rowKey="key"
        onRow={(group) => ({
          onClick: () => { setSelectedGroupKey(group.key); setDurationDrawerOpen(true); },
          style: { cursor: 'pointer' },
        })}
        pagination={{
          total: groupedServices.length,
          pageSize: 15,
          showSizeChanger: false,
          showTotal: (total, range) => `${range[0]}-${range[1]} of ${total} products · ${filteredServices.length} duration variants`,
        }}
        loading={loading}
        locale={{
          emptyText: (
            <Empty
              description="No rental services found"
              image={Empty.PRESENTED_IMAGE_SIMPLE}
            >
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={() => { setSelectedService(null); setRentalModalOpen(true); }}
              >
                Add First Rental Service
              </Button>
            </Empty>
          )
        }}
        mobileCardRenderer={(props) => <GroupMobileCard {...props} />}
      />

      {/* Step-based Rental Creator / Editor */}
      <StepRentalServiceModal
        open={rentalModalOpen}
        onClose={() => { setRentalModalOpen(false); setSelectedService(null); }}
        service={selectedService}
        onCreated={handleServiceCreated}
        onUpdated={handleServiceUpdated}
      />

      {/* Service Detail Modal */}
      <ServiceDetailModal
        service={selectedService}
        open={detailModalVisible}
        onClose={() => {
          setDetailModalVisible(false);
          setSelectedService(null);
        }}
        onEdit={handleEdit}
        onDelete={handleServiceDeleted}
      />

      {/* Rental Package Manager Modal */}
      <RentalPackageManager
        visible={packageManagerVisible}
        onClose={() => setPackageManagerVisible(false)}
        rentalServices={services}
      />

      {/* Duration drawer — list view + inline edit/add form */}
      {(() => {
        const tierColor = selectedGroup ? TIER_COLORS_HEX[selectedGroup.segment] : null;
        const isFormMode = drawerMode === 'edit' || drawerMode === 'add';

        const drawerTitle = (
          <div className="flex items-center gap-2">
            {isFormMode && (
              <Button
                type="text"
                size="small"
                icon={<span style={{ fontSize: 16, lineHeight: 1 }}>←</span>}
                onClick={() => { setDrawerMode('list'); setEditingService(null); drawerForm.resetFields(); }}
                className="!px-1 !mr-1"
              />
            )}
            <div>
              <div className="font-semibold text-slate-900 text-sm leading-snug">
                {isFormMode
                  ? (drawerMode === 'edit' ? 'Edit Duration' : 'Add Duration')
                  : (selectedGroup?.key || 'Durations')}
              </div>
              {!isFormMode && selectedGroup?.segment && (
                <Tag className="mt-1" style={{ background: tierColor ? `${tierColor}15` : undefined, color: tierColor, border: `1px solid ${tierColor}40`, borderRadius: 6 }}>
                  {selectedGroup.segment.toUpperCase()}
                </Tag>
              )}
              {isFormMode && selectedGroup?.key && (
                <div className="text-xs text-slate-400 mt-0.5">{selectedGroup.key}</div>
              )}
            </div>
          </div>
        );

        const drawerExtra = !isFormMode ? (
          <Button type="primary" icon={<PlusOutlined />} size="small" onClick={openAddMode}>
            Add Duration
          </Button>
        ) : null;

        const drawerFooter = isFormMode ? (
          <div className="flex gap-2 justify-end">
            <Button onClick={() => { setDrawerMode('list'); setEditingService(null); drawerForm.resetFields(); }}>
              Cancel
            </Button>
            <Button type="primary" loading={drawerSubmitting} onClick={handleDrawerSave}>
              {drawerMode === 'edit' ? 'Save Changes' : 'Add Duration'}
            </Button>
          </div>
        ) : null;

        return (
          <Drawer
            title={drawerTitle}
            open={durationDrawerOpen}
            onClose={closeDrawer}
            width={isFormMode ? 520 : 420}
            extra={drawerExtra}
            footer={drawerFooter}
            destroyOnHidden={false}
          >
            {/* LIST MODE */}
            {drawerMode === 'list' && selectedGroup && (
              <>
                {/* Product image section in list mode */}
                <div className="flex items-center gap-3 mb-4 p-3 bg-slate-50 rounded-xl border border-slate-200">
                  {drawerImageUrl ? (
                    <img
                      src={drawerImageUrl}
                      alt="Product"
                      className="w-16 h-12 object-cover rounded-lg border border-slate-200 flex-shrink-0"
                    />
                  ) : (
                    <div className="w-16 h-12 rounded-lg border-2 border-dashed border-slate-300 flex items-center justify-center flex-shrink-0 bg-white">
                      <span className="text-slate-400 text-xs">No img</span>
                    </div>
                  )}
                  <div className="min-w-0">
                    <div className="text-xs text-slate-500 mb-1">Product image <span className="text-slate-400">(shown on rental card)</span></div>
                    <Upload accept="image/*" showUploadList={false} beforeUpload={handleDrawerImageUpload}>
                      <Button size="small" icon={<UploadOutlined />} loading={drawerImageUploading}>
                        {drawerImageUrl ? 'Replace' : 'Upload'}
                      </Button>
                    </Upload>
                  </div>
                </div>

                <p className="text-xs text-slate-500 mb-4">
                  {selectedGroup.services.length} duration option{selectedGroup.services.length !== 1 ? 's' : ''}. Click a row to edit it inline.
                </p>
                <div className="space-y-2">
                  {selectedGroup.services.map((service, idx) => {
                    const baseCurrency = service.currency || businessCurrency || 'EUR';
                    const targetCurrency = userCurrency || baseCurrency;
                    const convertedPrice = convertCurrency
                      ? convertCurrency(service.price || 0, baseCurrency, targetCurrency)
                      : (service.price || 0);
                    const { long: durLabel } = formatDurationDisplay(service.duration);
                    return (
                      <div
                        key={service.id}
                        className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-200 hover:border-blue-300 hover:bg-blue-50/30 transition-colors cursor-pointer group"
                        onClick={() => openEditMode(service)}
                      >
                        <div>
                          <div className="text-xs text-slate-400 font-medium uppercase tracking-wide mb-0.5">Option {idx + 1}</div>
                          <div className="font-semibold text-slate-900">{durLabel}</div>
                          <div className="text-lg font-bold mt-0.5 tabular-nums" style={{ color: tierColor || '#0f172a' }}>
                            {formatCurrency(Number(convertedPrice), targetCurrency)}
                          </div>
                        </div>
                        <Space>
                          <Button
                            size="small"
                            icon={<EditOutlined />}
                            className="opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={(e) => { e.stopPropagation(); openEditMode(service); }}
                          />
                          {canDeleteServices && (
                            <Button
                              size="small"
                              danger
                              icon={<DeleteOutlined />}
                              className="opacity-0 group-hover:opacity-100 transition-opacity"
                              onClick={(e) => { e.stopPropagation(); handleDelete(service); }}
                            />
                          )}
                        </Space>
                      </div>
                    );
                  })}
                </div>
                <div className="mt-4">
                  <Button block type="dashed" icon={<PlusOutlined />} onClick={openAddMode}>
                    Add Another Duration
                  </Button>
                </div>
              </>
            )}

            {/* EDIT / ADD FORM MODE */}
            {isFormMode && (
              <Form form={drawerForm} layout="vertical" requiredMark="optional">
                {/* Product info section */}
                <div className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-3">Product Info</div>

                {/* Product image upload (shared across all durations) */}
                <div className="mb-4">
                  <div className="text-sm font-medium text-slate-700 mb-1.5">Product Image <span className="text-xs text-slate-400 font-normal">(shown on the main rental card)</span></div>
                  <div className="flex items-start gap-3">
                    {drawerImageUrl ? (
                      <div className="relative flex-shrink-0">
                        <img
                          src={drawerImageUrl}
                          alt="Product"
                          className="w-24 h-20 object-cover rounded-lg border border-slate-200"
                        />
                        <button
                          type="button"
                          className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-slate-700 rounded-full flex items-center justify-center text-white hover:bg-red-500 transition-colors"
                          onClick={() => setDrawerImageUrl(null)}
                        >
                          <CloseCircleOutlined style={{ fontSize: 12 }} />
                        </button>
                      </div>
                    ) : null}
                    <Upload
                      accept="image/*"
                      showUploadList={false}
                      beforeUpload={handleDrawerImageUpload}
                    >
                      <Button
                        icon={<UploadOutlined />}
                        loading={drawerImageUploading}
                        size="small"
                        className="!h-9"
                      >
                        {drawerImageUrl ? 'Replace Image' : 'Upload Image'}
                      </Button>
                    </Upload>
                  </div>
                </div>

                <Form.Item
                  name="name"
                  label="Equipment Name"
                  rules={[{ required: true, message: 'Required' }]}
                  extra="Duration and tier are prepended automatically to the stored name"
                >
                  <Input placeholder="e.g. Full Kite Set, Harness" />
                </Form.Item>
                <Row gutter={12}>
                  <Col span={12}>
                    <Form.Item name="rentalSegment" label="Tier / Class" rules={[{ required: true, message: 'Required' }]}>
                      <Select placeholder="Standard, SLS…">
                        {RENTAL_SEGMENT_OPTIONS_LIST.map(o => <Option key={o.value} value={o.value}>{o.label}</Option>)}
                      </Select>
                    </Form.Item>
                  </Col>
                  <Col span={12}>
                    <Form.Item name="disciplineTag" label="Sport">
                      <Select placeholder="Kite, Wing…" allowClear>
                        {DISCIPLINE_OPTIONS_LIST.map(d => <Option key={d.value} value={d.value}>{d.label}</Option>)}
                      </Select>
                    </Form.Item>
                  </Col>
                </Row>
                <Divider className="!my-4" />

                {/* Duration & pricing section */}
                <div className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-3">Duration & Pricing</div>

                {drawerMode === 'add' && (
                  <div className="mb-3">
                    <div className="text-xs text-slate-500 mb-2">Quick durations:</div>
                    <div className="flex gap-2 flex-wrap">
                      {QUICK_DURATIONS_LIST.map(qd => (
                        <Button
                          key={qd.value}
                          size="small"
                          type="dashed"
                          onClick={() => drawerForm.setFieldValue('duration', qd.value)}
                        >
                          {qd.label}
                        </Button>
                      ))}
                    </div>
                  </div>
                )}

                <Row gutter={12}>
                  <Col span={12}>
                    <Form.Item name="duration" label="Duration (hours)" rules={[{ required: true, message: 'Required' }]}>
                      <InputNumber min={0.5} max={720} step={0.5} style={{ width: '100%' }} placeholder="e.g. 1, 4, 168" />
                    </Form.Item>
                  </Col>
                  <Col span={12}>
                    <Form.Item name="availableUnits" label="Available Units" rules={[{ required: true, type: 'number', min: 1 }]}>
                      <InputNumber min={1} max={50} style={{ width: '100%' }} />
                    </Form.Item>
                  </Col>
                </Row>
                <Row gutter={12}>
                  <Col span={8}>
                    <Form.Item name="currency" label="Currency" rules={[{ required: true }]}>
                      <Select>
                        {drawerCurrencyOptions.map(({ code, label }) => (
                          <Option key={code} value={code}>{label}</Option>
                        ))}
                      </Select>
                    </Form.Item>
                  </Col>
                  <Col span={16}>
                    <Form.Item name="price" label="Price" rules={[{ required: true, message: 'Required' }]}>
                      <InputNumber min={0} style={{ width: '100%' }} placeholder="e.g. 35" />
                    </Form.Item>
                  </Col>
                </Row>
                <Tooltip title="Optional. When set, customers are offered equipment insurance at checkout.">
                  <Form.Item name="insuranceRate" label="Insurance Rate (%) — optional">
                    <InputNumber min={0} max={100} step={0.5} style={{ width: '100%' }} addonAfter="%" placeholder="e.g. 10" />
                  </Form.Item>
                </Tooltip>

                <Divider className="!my-4" />

                {/* Per-duration content */}
                <div className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-3">Content for this Duration</div>
                <Form.Item
                  name="description"
                  label="Description"
                  extra={<span className="text-[11px] text-slate-400">Shown on: product card &amp; booking step</span>}
                >
                  <Input.TextArea rows={2} placeholder="e.g. Quick session — kite, board and bar included." />
                </Form.Item>
                <Form.Item
                  name="includes"
                  label="What's Included (optional)"
                  extra={<span className="text-[11px] text-slate-400">Shown on: booking step</span>}
                >
                  <Input.TextArea rows={2} placeholder="e.g. Kite, board, bar, harness &amp; safety gear. Wetsuit available." />
                </Form.Item>
              </Form>
            )}
          </Drawer>
        );
      })()}
    </div>
  );
}

export default RentalServices;
