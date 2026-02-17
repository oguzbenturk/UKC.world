import { useState, useEffect, useCallback } from 'react';
import dayjs from 'dayjs';
import {
  Button,
  Modal,
  Form,
  Input,
  InputNumber,
  Select,
  Table,
  Tag,
  Tooltip,
  Spin,
  Grid,
  Card,
  Row,
  Col,
  Space,
  App,
  Popconfirm,
  Typography,
  Badge,
  Divider,
  Alert,
  DatePicker,
  Image,
  Upload
} from 'antd';
import { 
  PlusOutlined, 
  EditOutlined,
  DeleteOutlined,
  TableOutlined,
  AppstoreOutlined,
  GiftOutlined,
  HomeOutlined,
  CarOutlined,
  BookOutlined,
  ShoppingOutlined,
  InfoCircleOutlined,
  RocketOutlined,
  CalendarOutlined,
  InboxOutlined,
  LoadingOutlined
} from '@ant-design/icons';
import { useCurrency } from '@/shared/contexts/CurrencyContext';
import { useData } from '@/shared/hooks/useData';
import MultiCurrencyPriceInput from '@/shared/components/ui/MultiCurrencyPriceInput';
import { usePageSEO } from '@/shared/utils/seo';

const { Option } = Select;
const { useBreakpoint } = Grid;
const { TextArea } = Input;
const { Title, Text } = Typography;

// Package type configuration
const PACKAGE_TYPES = [
  { value: 'lesson', label: 'Lesson Package', icon: <BookOutlined />, color: 'blue', description: 'Lesson hours only' },
  { value: 'rental', label: 'Rental Package', icon: <CarOutlined />, color: 'green', description: 'Equipment rental days' },
  { value: 'accommodation', label: 'Accommodation Package', icon: <HomeOutlined />, color: 'orange', description: 'Accommodation nights' },
  { value: 'lesson_rental', label: 'Lesson + Rental', icon: <GiftOutlined />, color: 'purple', description: 'Lessons with equipment' },
  { value: 'accommodation_lesson', label: 'Accommodation + Lesson', icon: <GiftOutlined />, color: 'cyan', description: 'Stay & learn package' },
  { value: 'accommodation_rental', label: 'Accommodation + Rental', icon: <GiftOutlined />, color: 'magenta', description: 'Stay & ride package' },
  { value: 'all_inclusive', label: 'All Inclusive', icon: <ShoppingOutlined />, color: 'gold', description: 'Complete package' },
  { value: 'downwinders', label: 'Downwinders', icon: <RocketOutlined />, color: 'volcano', description: 'Downwind adventure package' },
  { value: 'camps', label: 'Camps', icon: <GiftOutlined />, color: 'geekblue', description: 'Camp experience package' }
];

// Helper function to construct image URLs correctly
const getImageUrl = (imageUrl) => {
  if (!imageUrl) return null;
  if (imageUrl.startsWith('http')) return imageUrl;
  return imageUrl;
};

function PackageManagement() {
  return (
    <App>
      <PackageManagementInner />
    </App>
  );
}

// eslint-disable-next-line complexity
function PackageManagementInner() {
  usePageSEO({
    title: 'Experience Package Management',
    description: 'Manage experience bundle packages - lessons with rentals, accommodation, and all-inclusive packages'
  });

  const { message } = App.useApp();
  const screens = useBreakpoint();
  const { apiClient } = useData();
  const [form] = Form.useForm();
  const [packages, setPackages] = useState([]);
  const [allServices, setAllServices] = useState([]);
  const [accommodationUnits, setAccommodationUnits] = useState([]);
  const [loading, setLoading] = useState(false);
  const [servicesLoading, setServicesLoading] = useState(false);
  const [packageModalVisible, setPackageModalVisible] = useState(false);
  const [selectedPackage, setSelectedPackage] = useState(null);
  const [editMode, setEditMode] = useState(false);
  const [viewMode, setViewMode] = useState('table');
  // Default to experience bundle types only
  const [selectedTypes, setSelectedTypes] = useState(['lesson_rental', 'accommodation_lesson', 'accommodation_rental', 'all_inclusive', 'downwinders', 'camps']);

  // Track selected accommodation unit images
  const [selectedUnitImages, setSelectedUnitImages] = useState([]);
  const [imageLoading, setImageLoading] = useState(false);

  const { userCurrency, formatCurrency } = useCurrency();

  // Derived data - filter services by category
  const lessonServices = allServices.filter(s => {
    // Include if category suggests it's a lesson
    const isLessonCategory = s.category === 'lesson' || 
                             s.category === 'lessons' || 
                             s.category === 'kitesurfing' || 
                             s.category === 'wingfoil';
    
    // Include if service type suggests it's a lesson
    const isLessonType = s.serviceType === 'lesson' ||
                         s.serviceType === 'private' ||
                         s.serviceType === 'group' ||
                         s.serviceType === 'semi-private';
    
    // Exclude if explicitly a rental
    const isNotRental = s.category !== 'rentals' && 
                        s.category !== 'rental' && 
                        s.serviceType !== 'rental';
    
    return (isLessonCategory || isLessonType) && isNotRental;
  });
  
  const rentalServices = allServices.filter(s => 
    s.category === 'rental' || 
    s.category === 'rentals' || 
    s.serviceType === 'rental' ||
    s.serviceType === 'equipment'
  );

  // Load all services
  const loadAllServices = useCallback(async () => {
    if (!apiClient) return;
    setServicesLoading(true);
    try {
      const response = await apiClient.get('/services');
      setAllServices(response.data || []);
    } catch {
      // Silent fail
    } finally {
      setServicesLoading(false);
    }
  }, [apiClient]);

  // Load accommodation units
  const loadAccommodationUnits = useCallback(async () => {
    if (!apiClient) return;
    try {
      const response = await apiClient.get('/accommodation/units');
      setAccommodationUnits(response.data || []);
    } catch {
      // Silent fail - accommodation optional
    }
  }, [apiClient]);



  // Load packages from API
  const loadPackages = useCallback(async () => {
    if (!apiClient) return;
    try {
      setLoading(true);
      const response = await apiClient.get('/services/packages');
      setPackages(response.data || []);
    } catch (error) {
      if (error.response?.status === 401) {
        message.warning('Please log in to view packages');
      } else {
        message.error('Failed to load packages');
      }
      setPackages([]);
    } finally {
      setLoading(false);
    }
  }, [apiClient, message]);

  // Load data on mount
  useEffect(() => {
    if (apiClient) {
      loadPackages();
      loadAllServices();
      loadAccommodationUnits();
    }
  }, [apiClient, loadPackages, loadAllServices, loadAccommodationUnits]);

  // Prefer cards by default on small screens
  useEffect(() => {
    if (!screens.md) {
      setViewMode('cards');
    }
  }, [screens.md]);

  // Get package type config
  const getPackageTypeConfig = (type) => {
    return PACKAGE_TYPES.find(pt => pt.value === type) || PACKAGE_TYPES[0];
  };

  // Filter packages by type (multi-select)
  const getFilteredPackages = () => {
    if (selectedTypes.length === 0) return packages;  // No filter = show all
    return packages.filter(pkg => selectedTypes.includes(pkg.packageType));
  };

  // Helper to check which features a package type includes
  const getPackageTypeIncludes = (packageType) => ({
    includesLessons: ['lesson', 'lesson_rental', 'accommodation_lesson', 'all_inclusive'].includes(packageType),
    includesRental: ['rental', 'lesson_rental', 'accommodation_rental', 'all_inclusive'].includes(packageType),
    includesAccommodation: ['accommodation', 'accommodation_lesson', 'accommodation_rental', 'all_inclusive', 'camps'].includes(packageType)
  });

  // Helper to find selected entities by ID
  const findSelectedEntities = (values) => ({
    lessonService: lessonServices.find(s => s.id === values.lessonServiceId),
    rentalService: rentalServices.find(s => s.id === values.rentalServiceId),
    unit: accommodationUnits.find(u => u.id === values.accommodationUnitId)
  });

  // Build service reference fields from form values
  const buildServiceReferences = (values, entities) => ({
    lessonServiceId: values.lessonServiceId ?? null,
    lessonServiceName: entities.lessonService?.name ?? null,
    rentalServiceId: values.rentalServiceId ?? null,
    rentalServiceName: entities.rentalService?.name ?? null,
    equipmentId: null,
    equipmentName: null,
    accommodationUnitId: values.accommodationUnitId ?? null,
    accommodationUnitName: entities.unit?.name ?? null
  });

  // Build package data from form values
  const buildPackageData = (values) => {
    const packageType = values.packageType ?? 'lesson';
    const includes = getPackageTypeIncludes(packageType);
    const entities = findSelectedEntities(values);
    const serviceRefs = buildServiceReferences(values, entities);
    const prices = values.prices ?? [];
    
    const packageData = {
      name: values.name,
      description: values.description ?? '',
      packageType,
      ...includes,
      ...serviceRefs,
      totalHours: values.totalHours ?? 0,
      sessionsCount: values.sessionsCount ?? Math.ceil((values.totalHours ?? 0) / 2),
      rentalDays: values.rentalDays ?? 0,
      accommodationNights: values.accommodationNights ?? 0,
      prices,
      imageUrl: values.imageUrl ?? null,
      disciplineTag: null,
      lessonCategoryTag: null,
      levelTag: null
    };

    // Add event-specific fields for downwinders/camps
    if (packageType === 'downwinders' || packageType === 'camps') {
      packageData.eventStartDate = values.eventStartDate?.toISOString() || null;
      packageData.eventEndDate = values.eventEndDate?.toISOString() || null;
      packageData.eventLocation = values.eventLocation || null;
      packageData.departureLocation = values.departureLocation || null;
      packageData.destinationLocation = values.destinationLocation || null;
      packageData.maxParticipants = values.maxParticipants || null;
      packageData.minSkillLevel = values.minSkillLevel || null;
      packageData.minAge = values.minAge || null;
      packageData.maxAge = values.maxAge || null;
      packageData.itinerary = values.itinerary || null;
      packageData.eventStatus = values.eventStatus || 'scheduled';
    }

    if (prices.length > 0) {
      packageData.price = prices[0].price;
      packageData.currency = prices[0].currencyCode;
    }

    return packageData;
  };

  // Handle image upload
  const handleImageUpload = useCallback((info) => {
    if (info.file.status === 'uploading') {
      setImageLoading(true);
      return;
    }

    if (info.file.status === 'done') {
      setImageLoading(false);
      const uploadedUrl = info.file.response?.url;
      if (uploadedUrl) {
        form.setFieldValue('imageUrl', uploadedUrl);
        message.success('Image uploaded successfully!');
      }
    } else if (info.file.status === 'error') {
      setImageLoading(false);
      message.error('Image upload failed');
    }
  }, [form, message]);

  // Custom upload request handler
  const customUploadRequest = useCallback(async ({ file, onSuccess, onError, onProgress }) => {
    try {
      const formData = new FormData();
      formData.append('image', file);
      const response = await apiClient.post('/upload/image', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: ({ total, loaded }) => {
          if (total) onProgress?.({ percent: Math.round((loaded / total) * 100) });
        }
      });
      onSuccess?.(response.data);
    } catch (err) {
      onError?.(err);
    }
  }, [apiClient]);

  // Handle form submission
  const handleSubmit = async (values) => {
    try {
      setLoading(true);
      const packageData = buildPackageData(values);

      if (editMode && selectedPackage) {
        await apiClient.put(`/services/packages/${selectedPackage.id}`, packageData);
        message.success('Package updated successfully!');
      } else {
        await apiClient.post('/services/packages', packageData);
        message.success('Package created successfully!');
      }

      setPackageModalVisible(false);
      form.resetFields();
      setEditMode(false);
      setSelectedPackage(null);
      loadPackages();
    } catch (error) {
      message.error(error.response?.data?.error || 'Failed to save package');
    } finally {
      setLoading(false);
    }
  };

  // Handle edit
  const handleEdit = (pkg) => {
    setSelectedPackage(pkg);
    setEditMode(true);
    
    // Find service IDs by name if not stored directly
    const lessonService = lessonServices.find(s => s.name === pkg.lessonServiceName);
    const rentalService = rentalServices.find(s => s.name === pkg.rentalServiceName);
    const unit = accommodationUnits.find(u => u.name === pkg.accommodationUnitName);
    
    const formValues = {
      name: pkg.name,
      description: pkg.description,
      packageType: pkg.packageType || 'lesson',
      totalHours: pkg.totalHours,
      sessionsCount: pkg.sessionsCount,
      rentalDays: pkg.rentalDays,
      accommodationNights: pkg.accommodationNights,
      lessonServiceId: pkg.lessonServiceId || lessonService?.id,
      rentalServiceId: pkg.rentalServiceId || rentalService?.id,
      accommodationUnitId: pkg.accommodationUnitId || unit?.id,
      prices: pkg.prices || [{ currencyCode: pkg.currency || 'EUR', price: pkg.price }],
      imageUrl: pkg.imageUrl
    };

    // Add event fields if they exist
    if (pkg.eventStartDate) formValues.eventStartDate = dayjs(pkg.eventStartDate);
    if (pkg.eventEndDate) formValues.eventEndDate = dayjs(pkg.eventEndDate);
    if (pkg.eventLocation) formValues.eventLocation = pkg.eventLocation;
    if (pkg.departureLocation) formValues.departureLocation = pkg.departureLocation;
    if (pkg.destinationLocation) formValues.destinationLocation = pkg.destinationLocation;
    if (pkg.maxParticipants) formValues.maxParticipants = pkg.maxParticipants;
    if (pkg.minSkillLevel) formValues.minSkillLevel = pkg.minSkillLevel;
    if (pkg.minAge) formValues.minAge = pkg.minAge;
    if (pkg.maxAge) formValues.maxAge = pkg.maxAge;
    if (pkg.itinerary) formValues.itinerary = pkg.itinerary;
    if (pkg.eventStatus) formValues.eventStatus = pkg.eventStatus;
    
    form.setFieldsValue(formValues);
    
    setPackageModalVisible(true);
  };

  // Handle delete
  const handleDelete = async (packageId) => {
    try {
      await apiClient.delete(`/services/packages/${packageId}`);
      message.success('Package deleted successfully!');
      loadPackages();
    } catch (error) {
      if (error.response?.status === 400) {
        message.error(error.response.data?.details || 'Cannot delete package - it may have linked services or purchases');
      } else {
        message.error('Failed to delete package');
      }
    }
  };

  // Open create modal
  const openCreateModal = (type = 'lesson') => {
    setEditMode(false);
    setSelectedPackage(null);
    setSelectedUnitImages([]);
    form.resetFields();
    form.setFieldsValue({
      packageType: type,
      prices: [{ currencyCode: userCurrency || 'EUR', price: 0 }]
    });
    setPackageModalVisible(true);
  };

  // Get fields to show based on package type
  const getPackageTypeFields = (packageType) => {
    const fields = {
      showLessons: ['lesson', 'lesson_rental', 'accommodation_lesson', 'all_inclusive', 'downwinders', 'camps'].includes(packageType),
      showRental: ['rental', 'lesson_rental', 'accommodation_rental', 'all_inclusive', 'downwinders', 'camps'].includes(packageType),
      showAccommodation: ['accommodation', 'accommodation_lesson', 'accommodation_rental', 'all_inclusive', 'camps'].includes(packageType)
    };
    return fields;
  };

  // Watch for package type changes
  const watchPackageType = Form.useWatch('packageType', form);
  const packageFields = getPackageTypeFields(watchPackageType || 'lesson');

  // Watch for accommodation unit selection changes
  const watchAccommodationUnitId = Form.useWatch('accommodationUnitId', form);

  // Update images when accommodation unit is selected
  useEffect(() => {
    if (watchAccommodationUnitId && accommodationUnits.length > 0) {
      const selectedUnit = accommodationUnits.find(u => u.id === watchAccommodationUnitId);
      if (selectedUnit) {
        // Set images from the selected accommodation unit
        const unitImages = selectedUnit.images || [];
        setSelectedUnitImages(unitImages);
      }
    } else {
      setSelectedUnitImages([]);
    }
  }, [watchAccommodationUnitId, accommodationUnits]);

  // Table columns
  const columns = [
    {
      title: 'Name',
      dataIndex: 'name',
      key: 'name',
      render: (text, record) => (
        <Space direction="vertical" size={0}>
          <Text strong>{text}</Text>
          {record.description && (
            <Text type="secondary" style={{ fontSize: 12 }}>{record.description.substring(0, 50)}...</Text>
          )}
        </Space>
      )
    },
    {
      title: 'Type',
      dataIndex: 'packageType',
      key: 'packageType',
      render: (type) => {
        const config = getPackageTypeConfig(type);
        return (
          <Tag color={config.color} icon={config.icon}>
            {config.label}
          </Tag>
        );
      }
    },
    {
      title: 'Includes',
      key: 'includes',
      render: (_, record) => (
        <Space wrap size={[4, 4]}>
          {record.includesLessons && record.totalHours > 0 && (
            <Tag color="blue">{record.totalHours}h {record.lessonServiceName || 'Lessons'}</Tag>
          )}
          {record.includesRental && record.rentalDays > 0 && (
            <Tag color="green">{record.rentalDays}d {record.equipmentName || record.rentalServiceName || 'Rental'}</Tag>
          )}
          {record.includesAccommodation && record.accommodationNights > 0 && (
            <Tag color="orange">{record.accommodationNights}n {record.accommodationUnitName || 'Stay'}</Tag>
          )}
        </Space>
      )
    },
    {
      title: 'Price',
      dataIndex: 'price',
      key: 'price',
      render: (price, record) => formatCurrency(price, record.currency)
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_, record) => (
        <Space>
          <Tooltip title="Edit">
            <Button 
              type="text" 
              icon={<EditOutlined />} 
              onClick={() => handleEdit(record)}
            />
          </Tooltip>
          <Popconfirm
            title="Delete Package"
            description="Are you sure you want to delete this package?"
            onConfirm={() => handleDelete(record.id)}
            okText="Delete"
            cancelText="Cancel"
            okButtonProps={{ danger: true }}
          >
            <Tooltip title="Delete">
              <Button type="text" danger icon={<DeleteOutlined />} />
            </Tooltip>
          </Popconfirm>
        </Space>
      )
    }
  ];

  // Package card for card view
  const PackageCard = ({ pkg }) => {
    const config = getPackageTypeConfig(pkg.packageType);
    
    // Map abstract colors to hex for icons
    const getColor = (c) => {
        const map = {
            blue: '#1890ff',
            green: '#52c41a',
            orange: '#fa8c16',
            purple: '#722ed1',
            cyan: '#13c2c2',
            magenta: '#eb2f96',
            gold: '#faad14'
        };
        return map[c] || '#1890ff';
    };
    
    const accentColor = getColor(config.color);

    return (
      <Card
        hoverable
        className="rounded-xl border border-slate-200 shadow-sm hover:shadow-lg transition-all duration-300 h-full"
        styles={{ body: { padding: 0 } }}
      >
        {/* Card Header - Uniform Style */}
        <div className="p-4 rounded-t-xl bg-slate-50 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="text-2xl" style={{ color: accentColor }}>{config.icon}</div>
            <div className="flex-1 min-w-0">
              <h3 className="font-bold text-slate-800 text-base mb-1 truncate">{pkg.name}</h3>
              <Tag color={config.color} className="!text-xs border-0 font-medium">
                {config.label}
              </Tag>
            </div>
          </div>
        </div>

        {/* Card Body */}
        <div className="p-4 flex flex-col h-[calc(100%-80px)]">
          {pkg.description && (
            <div className="mb-4 text-slate-600 text-sm line-clamp-2 min-h-[40px]">
              {pkg.description}
            </div>
          )}
          
          {/* Package Features List */}
          <div className="flex-1 space-y-3">
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Includes</div>
            
            <div className="space-y-2">
              {(pkg.includesLessons && pkg.totalHours > 0) && (
                 <div className="flex items-start gap-3 text-slate-700 text-sm">
                    <div className="mt-0.5 w-5 h-5 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                       <BookOutlined className="text-xs" />
                    </div>
                    <span>
                      <span className="font-semibold">{pkg.totalHours} Hours</span> 
                      {pkg.lessonServiceName && ` - ${pkg.lessonServiceName}`}
                      {!pkg.lessonServiceName && ' Lessons'}
                    </span>
                 </div>
              )}
              
              {(pkg.includesRental && (pkg.rentalDaysTotal > 0 || pkg.rentalDays > 0 || pkg.rental_days_total > 0)) && (
                 <div className="flex items-start gap-3 text-slate-700 text-sm">
                    <div className="mt-0.5 w-5 h-5 rounded-full bg-green-50 text-green-600 flex items-center justify-center shrink-0">
                       <CarOutlined className="text-xs" />
                    </div>
                    <span>
                      <span className="font-semibold">{pkg.rentalDaysTotal || pkg.rentalDays || pkg.rental_days_total} Days</span> 
                      {pkg.rentalServiceName && ` - ${pkg.rentalServiceName}`}
                      {!pkg.rentalServiceName && ' Rental'}
                    </span>
                 </div>
              )}
              
              {(pkg.includesAccommodation && (pkg.accommodationNightsTotal > 0 || pkg.accommodationNights > 0 || pkg.accommodation_nights_total > 0)) && (
                 <div className="flex items-start gap-3 text-slate-700 text-sm">
                    <div className="mt-0.5 w-5 h-5 rounded-full bg-orange-50 text-orange-600 flex items-center justify-center shrink-0">
                       <HomeOutlined className="text-xs" />
                    </div>
                    <span>
                      <span className="font-semibold">{pkg.accommodationNightsTotal || pkg.accommodationNights || pkg.accommodation_nights_total} Nights</span> 
                      {pkg.accommodationUnitName && ` - ${pkg.accommodationUnitName}`}
                      {!pkg.accommodationUnitName && ' Stay'}
                    </span>
                 </div>
              )}

              {!pkg.includesLessons && !pkg.includesRental && !pkg.includesAccommodation && (
                <div className="flex items-center gap-2 text-slate-400 text-sm italic py-2">
                   <InfoCircleOutlined /> No items configured
                </div>
              )}
            </div>
          </div>

          <Divider className="my-4 border-slate-100" />

          {/* Price */}
          <div className="flex items-baseline justify-between mb-4">
            <div>
              <div className="text-2xl font-bold text-slate-800 tracking-tight">
                {formatCurrency(pkg.price)}
              </div>
              <div className="text-xs text-slate-400 font-medium uppercase tracking-wide">Total Price</div>
            </div>
          </div>

          {/* Actions */}
          <div className="grid grid-cols-2 gap-3 mt-auto">
            <Button
              type="default" 
              icon={<EditOutlined />}
              onClick={() => handleEdit(pkg)}
              className="w-full !rounded-lg border-slate-200 hover:border-slate-300 hover:text-slate-700"
            >
              Edit
            </Button>
            <Popconfirm
              title="Delete Package"
              description="Are you sure you want to delete this package?"
              onConfirm={() => handleDelete(pkg.id)}
              okText="Delete"
              cancelText="Cancel"
              okButtonProps={{ danger: true }}
            >
              <Button
                danger
                icon={<DeleteOutlined />}
                className="w-full !rounded-lg"
              >
                Delete
              </Button>
            </Popconfirm>
          </div>
        </div>
      </Card>
    );
  };

  // Package type filter options for multi-select dropdown
  const filterOptions = PACKAGE_TYPES.map(pt => ({
    value: pt.value,
    label: (
      <Space>
        {pt.icon} 
        {pt.label}
        <Badge count={packages.filter(p => p.packageType === pt.value).length} size="small" />
      </Space>
    )
  }));

  const filteredPackages = getFilteredPackages();

  return (
    <div className="space-y-4 sm:space-y-6 p-3 sm:p-6 max-w-7xl mx-auto">
      {/* Header Card */}
      <Card
        variant="borderless"
        className="relative overflow-hidden rounded-2xl sm:rounded-3xl border border-slate-200 bg-white shadow-sm"
        styles={{ body: { padding: '16px' } }}
        classNames={{ body: 'sm:!p-8' }}
      >
        <div className="pointer-events-none absolute -top-20 right-8 h-44 w-44 rounded-full bg-purple-100" />
        <div className="pointer-events-none absolute -bottom-24 left-16 h-48 w-48 rounded-full bg-blue-50" />
        <div className="relative space-y-3 sm:space-y-4">
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-3 sm:gap-4">
            <div className="space-y-1 sm:space-y-2 max-w-2xl">
              <div className="flex items-center gap-2 sm:gap-3">
                <GiftOutlined className="text-xl sm:text-2xl text-purple-600" />
                <Title level={2} className="!mb-0 text-slate-900 !text-lg sm:!text-xl md:!text-2xl">Experience Packages</Title>
              </div>
              <p className="text-slate-600 text-xs sm:text-sm md:text-base">
                Create and manage experience bundle packages - combine lessons, rentals, and accommodation
              </p>
            </div>
            <Space size="small" className="shrink-0 w-full sm:w-auto">
              <Button
                icon={viewMode === 'table' ? <AppstoreOutlined /> : <TableOutlined />}
                onClick={() => setViewMode(viewMode === 'table' ? 'cards' : 'table')}
                size="middle"
                className="flex-1 sm:flex-none"
              >
                <span className="hidden sm:inline">{viewMode === 'table' ? 'Cards' : 'Table'}</span>
              </Button>
              <Button 
                type="primary"
                icon={<PlusOutlined />}
                onClick={() => openCreateModal(selectedTypes.length === 1 ? selectedTypes[0] : 'lesson')}
                size="middle"
                className="flex-1 sm:flex-none"
              >
                <span className="hidden sm:inline">Create Package</span>
                <span className="sm:hidden">Create</span>
              </Button>
            </Space>
          </div>
          
          {/* Quick Stats - Experience Bundle Types */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-3 pt-2">
            {PACKAGE_TYPES.filter(type => ['lesson_rental', 'accommodation_lesson', 'accommodation_rental', 'all_inclusive', 'downwinders', 'camps'].includes(type.value)).map(type => {
              const count = packages.filter(p => p.packageType === type.value).length;
              const colorClass = {
                purple: 'text-purple-600',
                cyan: 'text-cyan-600',
                magenta: 'text-pink-600',
                gold: 'text-yellow-600',
                volcano: 'text-orange-600',
                geekblue: 'text-blue-600'
              }[type.color] || 'text-gray-600';
              
              return (
                <div key={type.value} className="bg-slate-50 rounded-lg sm:rounded-xl p-2 sm:p-3 border border-slate-100">
                  <div className="flex items-center gap-2">
                    <div className={`text-lg sm:text-xl ${colorClass}`}>
                      {type.icon}
                    </div>
                    <div>
                      <div className="text-lg sm:text-xl font-bold text-slate-900">{count}</div>
                      <div className="text-xs text-slate-500 truncate">{type.label.split(' ')[0]}</div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </Card>

      {/* Content Card with integrated Filter Toolbar */}
      <Card className="rounded-xl sm:rounded-2xl border-slate-200 shadow-sm" styles={{ body: { padding: 0 } }}>
        <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex flex-col sm:flex-row items-start sm:items-center gap-4 justify-between">
           <div className="flex items-center gap-3 w-full sm:w-auto">
             <Text strong className="text-slate-500 uppercase tracking-wide text-xs whitespace-nowrap">Package Types</Text>
             <Select
                mode="multiple"
                allowClear
                placeholder="Select types to filter"
                value={selectedTypes}
                onChange={setSelectedTypes}
                options={filterOptions}
                size="middle"
                style={{ minWidth: 240 }}
                className="flex-1 sm:flex-none"
                maxTagCount="responsive"
                variant="filled"
              />
           </div>
           
           <div className="flex items-center gap-2">
             <Badge count={filteredPackages.length} showZero color="#94a3b8">
                <span className="text-slate-500 text-sm px-2">Total Packages</span>
             </Badge>
           </div>
        </div>

        <div className="p-6">
        {loading ? (
          <div className="flex justify-center p-8">
            <Spin size="large" />
          </div>
        ) : viewMode === 'table' ? (
          <Table
            dataSource={filteredPackages}
            columns={columns}
            rowKey="id"
            pagination={{ pageSize: 10 }}
            scroll={{ x: 800 }}
          />
        ) : (
          <Row gutter={[20, 20]}>
            {filteredPackages.map(pkg => (
              <Col key={pkg.id} xs={24} sm={12} lg={8} xl={6}>
                <PackageCard pkg={pkg} />
              </Col>
            ))}
            {filteredPackages.length === 0 && (
              <Col span={24}>
                <div className="text-center py-16 bg-slate-50 rounded-xl border-2 border-dashed border-slate-200">
                  <div className="text-6xl mb-4 opacity-50">📦</div>
                  <h3 className="text-lg font-medium text-slate-900 mb-2">No packages found</h3>
                  <Text type="secondary">Clear filters or create your first package to get started.</Text>
                </div>
              </Col>
            )}
          </Row>
        )}
        </div>
      </Card>

      {/* Create/Edit Modal */}
      <Modal
        title={null}
        open={packageModalVisible}
        onCancel={() => {
          setPackageModalVisible(false);
          form.resetFields();
          setEditMode(false);
          setSelectedPackage(null);
          setSelectedUnitImages([]);
        }}
        footer={null}
        width={800}
        destroyOnHidden
        className="clean-modal-override"
        closeIcon={<div className="bg-white/10 hover:bg-white/20 w-7 h-7 flex items-center justify-center rounded-full text-white transition-colors">×</div>}
        styles={{
          content: { padding: 0, borderRadius: '16px', overflow: 'hidden', backgroundColor: '#f8fafc' },
          body: { padding: 0 }
        }}
      >
        <div className="bg-gradient-to-r from-violet-600 to-indigo-600 px-6 py-5 border-b border-violet-500/30">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-white/20 backdrop-blur-sm flex items-center justify-center text-lg shadow-sm ring-1 ring-white/10">
              {editMode ? '✏️' : '✨'}
            </div>
            <div>
              <h2 className="text-lg font-bold text-white leading-tight">
                {editMode ? 'Edit Package' : 'New Package'}
              </h2>
              <p className="text-violet-100/90 text-xs mt-0.5">
                Configure package composition, services, and pricing.
              </p>
            </div>
          </div>
        </div>

        <Form
          form={form}
          layout="vertical"
          onFinish={handleSubmit}
          requiredMark={false}
          className="p-6 space-y-1 package-creator-form"
          style={{ maxHeight: 'calc(80vh - 80px)', overflowY: 'auto', overflowX: 'hidden' }}
          initialValues={{
            packageType: 'lesson',
            prices: [{ currencyCode: userCurrency || 'EUR', price: 0 }]
          }}
        >
          <Row gutter={16}>
            <Col xs={24} md={12}>
              <Form.Item
                name="name"
                label="Package Name"
                rules={[{ required: true, message: 'Please enter package name' }]}
              >
                <Input placeholder="e.g., Beginner Week Package" />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item
                name="packageType"
                label="Package Type"
                rules={[{ required: true, message: 'Please select package type' }]}
              >
                <Select
                  onChange={(val) => {
                    const includeLessons = ['lesson', 'lesson_rental', 'accommodation_lesson', 'all_inclusive', 'downwinders', 'camps'].includes(val);
                    const includeRental = ['rental', 'lesson_rental', 'accommodation_rental', 'all_inclusive', 'downwinders', 'camps'].includes(val);
                    const includeAccommodation = ['accommodation', 'accommodation_lesson', 'accommodation_rental', 'all_inclusive', 'camps'].includes(val);

                    if (!includeLessons) {
                      form.setFieldsValue({ lessonServiceId: undefined, totalHours: undefined, sessionsCount: undefined });
                    }
                    if (!includeRental) {
                      form.setFieldsValue({ rentalServiceId: undefined, rentalDays: undefined });
                    }
                    if (!includeAccommodation) {
                      form.setFieldsValue({ accommodationUnitId: undefined, accommodationNights: undefined });
                    }
                  }}
                >
                  {PACKAGE_TYPES.map(pt => (
                    <Option key={pt.value} value={pt.value}>
                      <Space>{pt.icon} {pt.label} <Text type="secondary">- {pt.description}</Text></Space>
                    </Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
          </Row>

          <Form.Item
            name="description"
            label="Description"
          >
            <TextArea rows={2} placeholder="Describe what's included in this package" />
          </Form.Item>

          {/* Lesson Fields */}
          {packageFields.showLessons && (
            <>
              <Divider orientation="left"><BookOutlined /> Lesson Details</Divider>
              {servicesLoading ? (
                <Spin size="small" />
              ) : lessonServices.length === 0 ? (
                <Alert 
                  type="warning" 
                  message="No lesson services found" 
                  description="Create lesson services first in Services → Lessons"
                  showIcon
                  icon={<InfoCircleOutlined />}
                  style={{ marginBottom: 16 }}
                />
              ) : (
                <Row gutter={16}>
                  <Col xs={24} md={12}>
                    <Form.Item
                      name="lessonServiceId"
                      label="Lesson Type / Service"
                      rules={[{ required: false }]}
                      tooltip="Select which lesson service this package includes (optional)"
                    >
                      <Select 
                        placeholder={servicesLoading ? "Loading services..." : lessonServices.length === 0 ? "No lesson services found" : "Select lesson type"}
                        showSearch
                        optionFilterProp="children"
                        loading={servicesLoading}
                        disabled={servicesLoading || lessonServices.length === 0}
                        filterOption={(input, option) =>
                          (option?.children ?? '').toLowerCase().includes(input.toLowerCase())
                        }
                        notFoundContent={servicesLoading ? <Spin size="small" /> : "No lesson services available"}
                      >
                        {lessonServices.map(service => (
                          <Option key={service.id} value={service.id}>
                            {service.name} {service.price ? `- ${formatCurrency(service.price, service.currency)}` : ''}
                          </Option>
                        ))}
                      </Select>
                    </Form.Item>
                  </Col>
                  <Col xs={24} md={12}>
                    <Form.Item
                      name="totalHours"
                      label="Total Lesson Hours"
                      rules={[{ required: false }]}
                      tooltip="Number of lesson hours included in this package (optional)"
                    >
                      <InputNumber min={1} style={{ width: '100%' }} placeholder="e.g., 10" addonAfter="hours" />
                    </Form.Item>
                  </Col>
                </Row>
              )}
            </>
          )}

          {/* Rental Fields */}
          {packageFields.showRental && (
            <>
              <Divider orientation="left"><CarOutlined /> Rental Details</Divider>
              {rentalServices.length === 0 ? (
                <Alert 
                  type="warning" 
                  message="No rental services found" 
                  description="Create rental services first in Services → Rentals"
                  showIcon
                  icon={<InfoCircleOutlined />}
                  style={{ marginBottom: 16 }}
                />
              ) : (
                <Row gutter={16}>
                  <Col xs={24} md={12}>
                    <Form.Item
                      name="rentalServiceId"
                      label="Rental Service"
                      rules={[{ required: false }]}
                      tooltip="Select which rental service is included in the package (optional)"
                    >
                      <Select 
                        placeholder={servicesLoading ? "Loading services..." : "Select rental service"}
                        allowClear
                        showSearch
                        loading={servicesLoading}
                        disabled={servicesLoading}
                        optionFilterProp="children"
                        notFoundContent={servicesLoading ? <Spin size="small" /> : "No rental services available"}
                        filterOption={(input, option) =>
                          (option?.children ?? '').toLowerCase().includes(input.toLowerCase())
                        }
                      >
                        {rentalServices.map(service => (
                          <Option key={service.id} value={service.id}>
                            {service.name} {service.price ? `- ${formatCurrency(service.price, service.currency)}` : ''}
                          </Option>
                        ))}
                      </Select>
                    </Form.Item>
                  </Col>
                  <Col xs={24} md={12}>
                    <Form.Item
                      name="rentalDays"
                      label="Rental Days"
                      rules={[{ required: false }]}
                      tooltip="Number of days the rental is included (optional)"
                    >
                      <InputNumber min={1} style={{ width: '100%' }} placeholder="e.g., 7" addonAfter="days" />
                    </Form.Item>
                  </Col>
                </Row>
              )}
            </>
          )}

          {/* Accommodation Fields */}
          {packageFields.showAccommodation && (
            <>
              <Divider orientation="left"><HomeOutlined /> Accommodation Details</Divider>
              {accommodationUnits.length === 0 ? (
                <Alert 
                  type="warning" 
                  message="No accommodation units found" 
                  description="Create accommodation units first in Services → Accommodation"
                  showIcon
                  icon={<InfoCircleOutlined />}
                  style={{ marginBottom: 16 }}
                />
              ) : (
                <>
                  <Row gutter={16}>
                    <Col xs={24} md={12}>
                      <Form.Item
                        name="accommodationUnitId"
                        label="Room / Unit Type"
                        tooltip="Select which accommodation unit type is included"
                      >
                        <Select
                          placeholder="Select room/unit (optional - any available)"
                          allowClear
                          showSearch
                          optionFilterProp="children"
                        >
                          {accommodationUnits.map(unit => (
                            <Option key={unit.id} value={unit.id}>
                              {unit.name} - {unit.type} (Capacity: {unit.capacity})
                              {unit.price_per_night ? ` - ${formatCurrency(unit.price_per_night, unit.currency || 'EUR')}/night` : ''}
                            </Option>
                          ))}
                        </Select>
                      </Form.Item>
                    </Col>
                    <Col xs={24} md={12}>
                      <Form.Item
                        name="accommodationNights"
                        label="Number of Nights"
                        rules={[{ required: true, message: 'Enter number of nights' }]}
                        tooltip="Number of nights accommodation is included"
                      >
                        <InputNumber min={1} style={{ width: '100%' }} placeholder="e.g., 7" addonAfter="nights" />
                      </Form.Item>
                    </Col>
                  </Row>

                  {/* Display selected unit's images */}
                  {selectedUnitImages.length > 0 && (
                    <div className="mt-4">
                      <div className="text-xs font-semibold text-slate-600 mb-2 uppercase tracking-wide">
                        Room Photos
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Image.PreviewGroup>
                          {selectedUnitImages.map((imgUrl, index) => (
                            <Image
                              key={index}
                              src={getImageUrl(imgUrl)}
                              alt={`Room ${index + 1}`}
                              width={100}
                              height={75}
                              className="object-cover rounded-lg border border-slate-200"
                            />
                          ))}
                        </Image.PreviewGroup>
                      </div>
                      <div className="text-xs text-slate-400 mt-2">
                        {`${selectedUnitImages.length} photo${selectedUnitImages.length > 1 ? 's' : ''} from selected accommodation unit`}
                      </div>
                    </div>
                  )}
                </>
              )}
            </>
          )}

          {/* Event-Specific Fields (Downwinders/Camps) */}
          {(watchPackageType === 'downwinders' || watchPackageType === 'camps') && (
            <>
              <Divider orientation="left"><CalendarOutlined /> Event Details</Divider>
              <Row gutter={16}>
                <Col xs={24} md={12}>
                  <Form.Item
                    name="eventStartDate"
                    label="Start Date & Time"
                    rules={[{ required: true, message: 'Select start date/time' }]}
                    tooltip="When the event begins"
                  >
                    <DatePicker 
                      showTime 
                      format="YYYY-MM-DD HH:mm" 
                      style={{ width: '100%' }}
                      placeholder="Select start date/time"
                    />
                  </Form.Item>
                </Col>
                <Col xs={24} md={12}>
                  <Form.Item
                    name="eventEndDate"
                    label="End Date & Time"
                    rules={[{ required: true, message: 'Select end date/time' }]}
                    tooltip="When the event ends"
                  >
                    <DatePicker 
                      showTime 
                      format="YYYY-MM-DD HH:mm" 
                      style={{ width: '100%' }}
                      placeholder="Select end date/time"
                    />
                  </Form.Item>
                </Col>
              </Row>

              <Row gutter={16}>
                {watchPackageType === 'camps' && (
                  <Col xs={24}>
                    <Form.Item
                      name="eventLocation"
                      label="Camp Location"
                      rules={[{ required: true, message: 'Enter camp location' }]}
                    >
                      <Input placeholder="e.g., UKC Gökçeada Beach Resort" />
                    </Form.Item>
                  </Col>
                )}

                {watchPackageType === 'downwinders' && (
                  <>
                    <Col xs={24} md={12}>
                      <Form.Item
                        name="departureLocation"
                        label="Departure Point"
                        rules={[{ required: true, message: 'Enter departure location' }]}
                      >
                        <Input placeholder="e.g., Aydıncık Beach" />
                      </Form.Item>
                    </Col>
                    <Col xs={24} md={12}>
                      <Form.Item
                        name="destinationLocation"
                        label="Destination"
                        rules={[{ required: true, message: 'Enter destination' }]}
                      >
                        <Input placeholder="e.g., Gökçeada Harbor" />
                      </Form.Item>
                    </Col>
                  </>
                )}
              </Row>

              <Row gutter={16}>
                <Col xs={24} md={8}>
                  <Form.Item
                    name="maxParticipants"
                    label="Max Participants"
                    rules={[{ required: true, message: 'Enter capacity' }]}
                    tooltip="Maximum number of people allowed"
                  >
                    <InputNumber min={1} max={100} style={{ width: '100%' }} placeholder="e.g., 12" />
                  </Form.Item>
                </Col>
                <Col xs={24} md={8}>
                  <Form.Item
                    name="minSkillLevel"
                    label="Minimum Skill Level"
                    tooltip="Required skill level to participate"
                  >
                    <Select placeholder="Select skill level">
                      <Option value="beginner">Beginner</Option>
                      <Option value="intermediate">Intermediate</Option>
                      <Option value="advanced">Advanced</Option>
                      <Option value="expert">Expert</Option>
                    </Select>
                  </Form.Item>
                </Col>
                <Col xs={24} md={8}>
                  <Form.Item
                    name="eventStatus"
                    label="Event Status"
                    initialValue="scheduled"
                  >
                    <Select>
                      <Option value="scheduled">Scheduled</Option>
                      <Option value="full">Full / Sold Out</Option>
                      <Option value="completed">Completed</Option>
                      <Option value="cancelled">Cancelled</Option>
                    </Select>
                  </Form.Item>
                </Col>
              </Row>

              <Row gutter={16}>
                <Col xs={24} md={12}>
                  <Form.Item
                    name="minAge"
                    label="Minimum Age"
                    tooltip="Minimum age requirement (optional)"
                  >
                    <InputNumber min={1} max={100} style={{ width: '100%' }} placeholder="e.g., 16" addonAfter="years" />
                  </Form.Item>
                </Col>
                <Col xs={24} md={12}>
                  <Form.Item
                    name="maxAge"
                    label="Maximum Age"
                    tooltip="Maximum age requirement (optional, leave empty for no limit)"
                  >
                    <InputNumber min={1} max={100} style={{ width: '100%' }} placeholder="No limit" addonAfter="years" />
                  </Form.Item>
                </Col>
              </Row>

              <Form.Item
                name="itinerary"
                label="Itinerary / Schedule"
                tooltip="Detailed day-by-day schedule or route description"
              >
                <TextArea 
                  rows={4} 
                  placeholder="Day 1: Morning briefing and gear check...&#10;Day 2: Downwind adventure from Aydıncık to Gökçeada...&#10;Day 3: Beach session and wrap-up"
                />
              </Form.Item>
            </>
          )}

          <Divider />

          <div className="mb-3">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Package Price *</span>
            </div>
            <MultiCurrencyPriceInput
              form={form}
              name="prices"
              label="Multi-Currency Pricing"
              required
              compact
            />
          </div>

          <Form.Item name="price" hidden>
            <InputNumber />
          </Form.Item>
          <Form.Item name="currency" hidden>
            <Input />
          </Form.Item>

          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Package Image (Optional)
            </label>
            <Upload
              name="image"
              listType="picture-card"
              showUploadList={false}
              onChange={handleImageUpload}
              customRequest={customUploadRequest}
              accept="image/*"
            >
              {form.getFieldValue('imageUrl') ? (
                <div className="relative w-full h-full">
                  <img
                    src={getImageUrl(form.getFieldValue('imageUrl'))}
                    alt="Package"
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                  <div className="absolute inset-0 bg-black bg-opacity-40 opacity-0 hover:opacity-100 flex items-center justify-center transition-opacity rounded">
                    <span className="text-white text-sm">Change</span>
                  </div>
                </div>
              ) : (
                <div>
                  {imageLoading ? <LoadingOutlined /> : <PlusOutlined />}
                  <div style={{ marginTop: 8 }}>Upload</div>
                </div>
              )}
            </Upload>
            <Form.Item name="imageUrl" hidden>
              <Input />
            </Form.Item>
          </div>

          <Form.Item>
            <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
              <Button onClick={() => setPackageModalVisible(false)}>
                Cancel
              </Button>
              <Button type="primary" htmlType="submit" loading={loading} className="!bg-violet-600 hover:!bg-violet-500 !border-0 !rounded-lg !px-6">
                {editMode ? 'Update Package' : 'Create Package'}
              </Button>
            </Space>
          </Form.Item>
        </Form>

        <style>{`
          .package-creator-form .ant-form-item-label > label {
            color: #334155;
            font-weight: 600;
          }
          .package-creator-form .ant-input,
          .package-creator-form .ant-input-number,
          .package-creator-form .ant-input-number-group-addon,
          .package-creator-form .ant-select-selector {
            border-radius: 10px !important;
          }
        `}</style>
      </Modal>
    </div>
  );
}

export default PackageManagement;
