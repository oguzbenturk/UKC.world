import { useState, useEffect, useMemo } from 'react';
import { 
  Button, 
  Input, 
  Empty, 
  Drawer,
  Table,
  Alert,
  Skeleton,
  Tag,
  Typography,
  Dropdown,
  Modal,
  Card,
  Space
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
  CloseCircleOutlined
} from '@ant-design/icons';
import { useAuth } from "@/shared/hooks/useAuth";
import { serviceApi } from '@/shared/services/serviceApi';
import ServiceForm from '../components/ServiceForm';
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

const DISCIPLINE_LABELS = {
  kite: '🪁 Kite',
  wing: '🦅 Wing',
  kite_foil: '🏄 Kite Foil',
  efoil: '⚡ E-Foil',
  premium: '💎 Premium',
  accessory: '🎒 Accessory',
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

  const days = hours / 24;
  const clean = tidyNumber(days);
  const plural = Number(days) === 1 ? '' : 's';
  return { long: `${clean} day${plural}`, short: `${clean}d`, type: 'daily' };
};

const makeColumns = ({ formatCurrency, convertCurrency, userCurrency, businessCurrency, canDeleteServices, handleView, handleEdit, handleDelete, formatDuration }) => [
  {
    title: 'Equipment',
    dataIndex: 'name',
    key: 'name',
    render: (text, record) => (
      <div className="flex items-center">
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center mr-3 text-white font-semibold text-sm ${getEquipmentColor(record.name)}`}>
          {getEquipmentInitials(record.name)}
        </div>
        <div>
          <div className="font-medium">{text}</div>
          <div className="text-sm text-gray-500">{record.description}</div>
        </div>
      </div>
    ),
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
  const { formatCurrency, businessCurrency, convertCurrency, userCurrency } = useCurrency();
  
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
  
  const [formDrawerVisible, setFormDrawerVisible] = useState(false);
  const [detailModalVisible, setDetailModalVisible] = useState(false);
  const [selectedService, setSelectedService] = useState(null);
  const [editMode, setEditMode] = useState(false);
  const [packageManagerVisible, setPackageManagerVisible] = useState(false);

  // Load rental services on component mount
  useEffect(() => {
    loadServices();
  }, []);

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

  const handleServiceCreated = async (newService) => {
    // Check if it's a rental service or has rental-related category
    const isRentalService = newService.category === 'rental' || 
      rentalCategories.some(cat => cat.name.toLowerCase() === newService.category?.toLowerCase());
    
    if (isRentalService) {
      setServices(prev => [...prev, newService]);
      message.success('Rental service created successfully!');
    }
    setFormDrawerVisible(false);
  };

  const handleServiceUpdated = async (updatedService) => {
    setServices(prev => prev.map(service => 
      service.id === updatedService.id ? updatedService : service
    ));
    setFormDrawerVisible(false);
    setEditMode(false);
    setSelectedService(null);
    message.success('Rental service updated successfully!');
  };

  const handleServiceDeleted = (serviceId) => {
    setServices(prev => prev.filter(service => service.id !== serviceId));
    setDetailModalVisible(false);
    setSelectedService(null);
  };

  const handleEdit = (service) => {
    setSelectedService(service);
    setEditMode(true);
    setFormDrawerVisible(true);
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

  const RentalMobileCard = ({ record, onEdit, onView, onDelete }) => {
    const color = getCategoryColor(record.category);
    const equipColor = getEquipmentColor(record.name);
    const initials = getEquipmentInitials(record.name);
    
    // Price logic duplicate from columns
    const baseCurrency = record.currency || businessCurrency || 'EUR';
    const targetCurrency = userCurrency || baseCurrency;
    const convertedPrice = convertCurrency ? convertCurrency(record.price || 0, baseCurrency, targetCurrency) : (record.price || 0);

    return (
      <Card styles={{ body: { padding: 12 } }} className="mb-3 border-slate-200 shadow-sm border">
        <div className="flex justify-between items-start">
           <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-white font-semibold text-sm ${equipColor}`}>
                 {initials}
              </div>
              <div className="min-w-0">
                 <div className="font-medium text-slate-900 truncate">{record.name}</div>
                 <div className="text-xs text-slate-500 truncate">{record.brand || '-'}</div>
              </div>
           </div>
           <div className="text-right flex-shrink-0">
             <div className="font-semibold text-slate-900">{formatCurrency(Number(convertedPrice), targetCurrency)}</div>
             <div className="text-xs text-slate-500">
               {formatDurationDisplay(record.duration).short ? `/ ${formatDurationDisplay(record.duration).short}` : ''}
             </div>
           </div>
        </div>
        
        <div className="mt-3 flex items-center justify-between">
            <div className="flex gap-1 flex-wrap">
              <Tag color={color}>{record.category}</Tag>
              {record.disciplineTag && <Tag color="purple">{DISCIPLINE_LABELS[record.disciplineTag] || record.disciplineTag}</Tag>}
            </div>
            <Space>
               <Button size="small" icon={<EyeOutlined />} onClick={() => onView(record)} />
               <Button size="small" icon={<EditOutlined />} onClick={() => onEdit(record)} />
               {canDeleteServices && (
                 <Button size="small" danger icon={<DeleteOutlined />} onClick={() => onDelete(record)} />
               )}
            </Space>
        </div>
      </Card>
    );
  };

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
        <div className="flex flex-wrap gap-2">
          <span className="text-xs text-slate-400 self-center font-medium mr-1">Segment:</span>
          {segmentFilters.map(({ key, label, count }) => (
            <Button
              key={key}
              type={categoryFilter === key ? 'primary' : 'default'}
              onClick={() => setCategoryFilter(key)}
              size="small"
              className="text-xs sm:text-sm"
            >
              {label} ({count})
            </Button>
          ))}
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
            onClick={() => setFormDrawerVisible(true)}
            className="flex-1 sm:flex-none"
          >
            <span className="hidden sm:inline">Add Rental Service</span>
            <span className="sm:hidden">Add</span>
          </Button>
        </div>
      </div>

      <UnifiedResponsiveTable
        density="comfortable"
        columns={columns}
        dataSource={filteredServices}
        rowKey="id"
        pagination={{
          total: filteredServices.length,
          pageSize: 10,
          showSizeChanger: true,
          showTotal: (total, range) => `${range[0]}-${range[1]} of ${total} rental services`,
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
                onClick={() => setFormDrawerVisible(true)}
              >
                Add First Rental Service
              </Button>
            </Empty>
          )
        }}
        mobileCardRenderer={(props) => (
          <RentalMobileCard 
             {...props} 
             onView={() => handleView(props.record)}
             onEdit={() => handleEdit(props.record)}
             onDelete={() => handleDelete(props.record)} 
          />
        )}
      />

      {/* Service Form Drawer */}
      <Drawer
        title={editMode ? "Edit Rental Service" : "Add New Rental Service"}
        width={600}
        onClose={() => {
          setFormDrawerVisible(false);
          setEditMode(false);
          setSelectedService(null);
        }}
        open={formDrawerVisible}
        styles={{ body: { paddingBottom: 80 } }}
      >
        <ServiceForm
          key={selectedService?.id ?? 'new'}
          initialValues={editMode ? selectedService : {}}
          isEditing={editMode}
          defaultCategory={rentalCategories.length > 0 ? rentalCategories[0].name.toLowerCase() : "rental"}
          onSubmit={editMode ? handleServiceUpdated : handleServiceCreated}
        />
      </Drawer>

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
    </div>
  );
}

export default RentalServices;
