import { useState, useEffect, useCallback } from 'react';
import dayjs from 'dayjs';
import {
  Button,
  Drawer,
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
  LoadingOutlined,
  CloseOutlined,
  DollarOutlined
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

  // Side panel state
  const [activeSection, setActiveSection] = useState('info');
  const [drawerWidth, setDrawerWidth] = useState(() =>
    typeof window !== 'undefined' && window.innerWidth < 640 ? '100%' : 720
  );

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

  // Responsive drawer width
  useEffect(() => {
    const onResize = () => setDrawerWidth(window.innerWidth < 640 ? '100%' : 720);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

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
    includesLessons: ['lesson', 'lesson_rental', 'accommodation_lesson', 'all_inclusive', 'downwinders', 'camps'].includes(packageType),
    includesRental: ['rental', 'lesson_rental', 'accommodation_rental', 'all_inclusive', 'downwinders', 'camps'].includes(packageType),
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
      packageHourlyRate: values.packageHourlyRate || null,
      packageDailyRate: values.packageDailyRate || null,
      packageNightlyRate: values.packageNightlyRate || null,
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
    setActiveSection('info');
    
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
      packageHourlyRate: pkg.packageHourlyRate || undefined,
      packageDailyRate: pkg.packageDailyRate || undefined,
      packageNightlyRate: pkg.packageNightlyRate || undefined,
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

  // Close package panel
  const closePackagePanel = () => {
    setPackageModalVisible(false);
    form.resetFields();
    setEditMode(false);
    setSelectedPackage(null);
    setSelectedUnitImages([]);
    setActiveSection('info');
  };

  // Open create modal
  const openCreateModal = (type = 'lesson') => {
    setEditMode(false);
    setSelectedPackage(null);
    setSelectedUnitImages([]);
    setActiveSection('info');
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
  const watchName = Form.useWatch('name', form);
  const packageFields = getPackageTypeFields(watchPackageType || 'lesson');

  // Watch fields for auto price calculator
  const watchPrices = Form.useWatch('prices', form);
  const watchTotalHours = Form.useWatch('totalHours', form);
  const watchRentalDays = Form.useWatch('rentalDays', form);
  const watchAccommodationNights = Form.useWatch('accommodationNights', form);

  // Watch selected services for standard price comparison
  const watchLessonServiceId = Form.useWatch('lessonServiceId', form);
  const watchRentalServiceId = Form.useWatch('rentalServiceId', form);
  const watchAccommodationUnitId = Form.useWatch('accommodationUnitId', form);

  // Watch custom package rates (user-entered)
  const watchPackageHourlyRate = Form.useWatch('packageHourlyRate', form);
  const watchPackageDailyRate = Form.useWatch('packageDailyRate', form);
  const watchPackageNightlyRate = Form.useWatch('packageNightlyRate', form);

  // Compute per-unit prices: prefer custom rate → standard service price as fallback
  const totalPrice = watchPrices?.[0]?.price || 0;
  const totalCurrency = watchPrices?.[0]?.currencyCode || userCurrency || 'EUR';

  // Standard prices from selected services
  const selectedLesson = lessonServices.find(s => s.id === watchLessonServiceId);
  const standardLessonPrice = selectedLesson?.price ? parseFloat(selectedLesson.price) : null;
  const selectedRental = rentalServices.find(s => s.id === watchRentalServiceId);
  const standardRentalPrice = selectedRental?.price ? parseFloat(selectedRental.price) : null;
  const selectedUnit = accommodationUnits.find(u => u.id === watchAccommodationUnitId);
  const standardNightPrice = selectedUnit?.price_per_night ? parseFloat(selectedUnit.price_per_night) : null;

  // Per-unit rates: custom rate > standard service price
  const pricePerHour = watchPackageHourlyRate > 0 ? watchPackageHourlyRate : (standardLessonPrice || null);
  const pricePerDay = watchPackageDailyRate > 0 ? watchPackageDailyRate : (standardRentalPrice || null);
  const pricePerNight = watchPackageNightlyRate > 0 ? watchPackageNightlyRate : (standardNightPrice || null);

  // Component totals (rate x quantity)
  const lessonComponentTotal = pricePerHour && watchTotalHours > 0 ? pricePerHour * watchTotalHours : null;
  const rentalComponentTotal = pricePerDay && watchRentalDays > 0 ? pricePerDay * watchRentalDays : null;
  const accommodationComponentTotal = pricePerNight && watchAccommodationNights > 0 ? pricePerNight * watchAccommodationNights : null;

  // Auto-calculated total from component rates
  const calculatedTotal = (lessonComponentTotal || 0) + (rentalComponentTotal || 0) + (accommodationComponentTotal || 0);

  // Determine if any service component is configured
  const hasLessonComponent = packageFields.showLessons && watchTotalHours > 0;
  const hasRentalComponent = packageFields.showRental && watchRentalDays > 0;
  const hasAccommodationComponent = packageFields.showAccommodation && watchAccommodationNights > 0;
  const hasAnyComponent = hasLessonComponent || hasRentalComponent || hasAccommodationComponent;

  // Form completeness check for enabling Create button
  const isFormComplete = !!(watchName?.trim()) && hasAnyComponent && totalPrice > 0;

  // Auto-sync calculated total into the prices form field
  useEffect(() => {
    if (calculatedTotal > 0) {
      const currentPrices = form.getFieldValue('prices') || [{ currencyCode: userCurrency || 'EUR', price: 0 }];
      const rounded = Math.round(calculatedTotal * 100) / 100;
      form.setFieldsValue({
        prices: [{ ...currentPrices[0], price: rounded }]
      });
    }
  }, [calculatedTotal, form, userCurrency]);

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

      {/* Create/Edit Side Panel */}
      <Drawer
        open={packageModalVisible}
        onClose={closePackagePanel}
        width={drawerWidth}
        closable={false}
        destroyOnHidden
        forceRender
        styles={{
          wrapper: { overflow: 'hidden' },
          body: { padding: 0, display: 'flex', overflow: 'hidden' },
          header: { display: 'none' }
        }}
      >
        {/* Icon Rail */}
        <div className="w-14 bg-slate-50 border-r border-gray-200 flex flex-col shrink-0">
          <div className="p-2 border-b border-gray-200 flex justify-center">
            <Tooltip title={editMode ? 'Edit Package' : 'New Package'} placement="right">
              <div className="w-10 h-10 rounded-xl bg-violet-100 flex items-center justify-center text-violet-600 text-lg cursor-default">
                {editMode ? <EditOutlined /> : <GiftOutlined />}
              </div>
            </Tooltip>
          </div>
          <div className="flex-1 py-2 px-1 space-y-0.5">
            {[
              { key: 'info', icon: <InfoCircleOutlined />, label: 'Package Info' },
              { key: 'services', icon: <BookOutlined />, label: 'Components' },
              { key: 'pricing', icon: <DollarOutlined />, label: 'Pricing' },
              { key: 'media', icon: <InboxOutlined />, label: 'Image' },
            ].map(item => (
              <Tooltip key={item.key} title={item.label} placement="right">
                <button
                  type="button"
                  onClick={() => setActiveSection(item.key)}
                  className={`w-full flex items-center justify-center h-10 rounded-lg transition-all text-base
                    ${activeSection === item.key
                      ? 'bg-violet-50 text-violet-700 shadow-sm font-medium'
                      : 'text-gray-500 hover:bg-gray-100 hover:text-gray-800'}`}
                >
                  {item.icon}
                </button>
              </Tooltip>
            ))}
          </div>
          <div className="p-1 border-t border-gray-200">
            <Tooltip title="Close" placement="right">
              <button
                type="button"
                onClick={closePackagePanel}
                className="w-full flex items-center justify-center h-10 rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-500 transition-all"
              >
                <CloseOutlined />
              </button>
            </Tooltip>
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 min-w-0 overflow-y-auto">
          {/* Sticky Top Action Bar */}
          <div className="sticky top-0 z-20 bg-white border-b border-gray-200 px-4 py-2.5 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-gray-800 m-0">
                {editMode ? 'Edit Package' : 'New Package'}
              </h3>
              <div className="flex items-center gap-1 ml-2">
                {['info', 'services', 'pricing', 'media'].map((key) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setActiveSection(key)}
                    className={`w-2 h-2 rounded-full transition-all ${activeSection === key ? 'bg-violet-600 w-4' : 'bg-gray-300 hover:bg-gray-400'}`}
                  />
                ))}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button size="small" onClick={closePackagePanel}>Cancel</Button>
              <Button
                size="small"
                type="primary"
                onClick={() => form.submit()}
                loading={loading}
                disabled={!editMode && !isFormComplete}
                className="!bg-violet-600 hover:!bg-violet-500 !border-0 !rounded-lg disabled:!bg-gray-300 disabled:!text-gray-500"
              >
                {editMode ? 'Update' : 'Create'}
              </Button>
            </div>
          </div>

          <div className="bg-gray-50/50">
            <Form
              form={form}
              layout="vertical"
              onFinish={handleSubmit}
              requiredMark={false}
              className="package-creator-form"
              initialValues={{
                packageType: 'lesson',
                prices: [{ currencyCode: userCurrency || 'EUR', price: 0 }]
              }}
            >
              <div className="p-4 md:p-6">

                {/* ═══ SECTION: Package Info ═══ */}
                <div style={{ display: activeSection === 'info' ? 'block' : 'none' }}>
                  <div className="mb-4">
                    <h3 className="text-base font-semibold text-gray-900">Package Info</h3>
                    <p className="text-xs text-gray-400 mt-0.5">Basic information about this package</p>
                  </div>

                  <div className="rounded-xl border border-gray-100 bg-white p-5 space-y-1">
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

                    <Form.Item name="description" label="Description">
                      <TextArea rows={3} placeholder="Describe what's included in this package" />
                    </Form.Item>
                  </div>

                  {/* Package Composition Preview */}
                  {watchPackageType && (
                    <div className="mt-4 rounded-xl border border-gray-100 bg-white p-5">
                      <div className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-3">Package Composition</div>
                      <div className="flex flex-wrap gap-2">
                        {packageFields.showLessons && (
                          <div className="flex items-center gap-2 bg-blue-50 text-blue-700 rounded-lg px-3 py-2 text-sm font-medium">
                            <BookOutlined /> Lessons {watchTotalHours ? `· ${watchTotalHours}h` : ''}
                          </div>
                        )}
                        {packageFields.showRental && (
                          <div className="flex items-center gap-2 bg-green-50 text-green-700 rounded-lg px-3 py-2 text-sm font-medium">
                            <CarOutlined /> Rental {watchRentalDays ? `· ${watchRentalDays}d` : ''}
                          </div>
                        )}
                        {packageFields.showAccommodation && (
                          <div className="flex items-center gap-2 bg-orange-50 text-orange-700 rounded-lg px-3 py-2 text-sm font-medium">
                            <HomeOutlined /> Stay {watchAccommodationNights ? `· ${watchAccommodationNights}n` : ''}
                          </div>
                        )}
                        {(watchPackageType === 'downwinders' || watchPackageType === 'camps') && (
                          <div className="flex items-center gap-2 bg-purple-50 text-purple-700 rounded-lg px-3 py-2 text-sm font-medium">
                            <CalendarOutlined /> Event
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* ═══ SECTION: Services & Components ═══ */}
                <div style={{ display: activeSection === 'services' ? 'block' : 'none' }}>
                  <div className="mb-4">
                    <h3 className="text-base font-semibold text-gray-900">Services &amp; Components</h3>
                    <p className="text-xs text-gray-400 mt-0.5">Configure what this package includes</p>
                  </div>

                  {/* Lesson Fields */}
                  {packageFields.showLessons && (
                    <div className="rounded-xl border border-blue-100 bg-white p-5 mb-4">
                      <div className="flex items-center gap-2 mb-4">
                        <div className="w-7 h-7 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
                          <BookOutlined className="text-sm" />
                        </div>
                        <span className="text-sm font-semibold text-gray-900">Lesson Details</span>
                      </div>
                      {servicesLoading ? (
                        <Spin size="small" />
                      ) : lessonServices.length === 0 ? (
                        <Alert
                          type="warning"
                          message="No lesson services found"
                          description="Create lesson services first in Services → Lessons"
                          showIcon
                          icon={<InfoCircleOutlined />}
                        />
                      ) : (
                        <>
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
                          <Row gutter={16}>
                            <Col xs={24} md={12}>
                              <Form.Item
                                name="packageHourlyRate"
                                label="Package Hourly Rate"
                                tooltip="The per-hour price you want to charge in this package"
                              >
                                <InputNumber min={0} step={0.01} style={{ width: '100%' }} placeholder={standardLessonPrice ? `Standard: ${standardLessonPrice}` : 'e.g., 70'} addonAfter={totalCurrency + '/h'} />
                              </Form.Item>
                            </Col>
                            <Col xs={24} md={12}>
                              {lessonComponentTotal !== null && (
                                <div className="mt-7 text-sm font-bold text-blue-700">
                                  {'Lesson total: ' + formatCurrency(lessonComponentTotal, totalCurrency)}
                                </div>
                              )}
                            </Col>
                          </Row>
                          {/* Lesson Price Summary */}
                          {(standardLessonPrice || pricePerHour !== null) && (
                            <div className="rounded-lg border border-blue-100 bg-gradient-to-r from-blue-50/80 to-slate-50/50 p-3">
                              <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Price Summary</div>
                              <div className="space-y-1.5">
                                {standardLessonPrice && (
                                  <div className="flex items-center justify-between">
                                    <span className="text-xs text-gray-500">Standard 1h price</span>
                                    <span className="text-xs font-semibold text-gray-700">{formatCurrency(standardLessonPrice, selectedLesson?.currency || totalCurrency)}</span>
                                  </div>
                                )}
                                {standardLessonPrice && watchTotalHours > 0 && (
                                  <div className="flex items-center justify-between">
                                    <span className="text-xs text-gray-500">{'Standard total (' + watchTotalHours + 'h x ' + formatCurrency(standardLessonPrice, selectedLesson?.currency || totalCurrency) + ')'}</span>
                                    <span className="text-xs font-semibold text-gray-700">{formatCurrency(standardLessonPrice * watchTotalHours, selectedLesson?.currency || totalCurrency)}</span>
                                  </div>
                                )}
                                {pricePerHour !== null && (
                                  <>
                                    <div className="border-t border-blue-100 my-1" />
                                    <div className="flex items-center justify-between">
                                      <span className="text-xs text-blue-600 font-medium">Package 1h price</span>
                                      <span className="text-xs font-bold text-blue-700">{formatCurrency(pricePerHour, totalCurrency)}</span>
                                    </div>
                                    {lessonComponentTotal !== null && (
                                      <div className="flex items-center justify-between">
                                        <span className="text-xs text-blue-600 font-medium">{'Package total (' + watchTotalHours + 'h)'}</span>
                                        <span className="text-xs font-bold text-blue-700">{formatCurrency(lessonComponentTotal, totalCurrency)}</span>
                                      </div>
                                    )}
                                  </>
                                )}
                                {standardLessonPrice && pricePerHour !== null && standardLessonPrice > pricePerHour && (
                                  <div className="flex items-center justify-between mt-1 pt-1 border-t border-blue-100">
                                    <span className="text-[10px] text-emerald-600 font-semibold">You save per hour</span>
                                    <span className="text-[10px] font-bold text-emerald-600">{formatCurrency(standardLessonPrice - pricePerHour, totalCurrency) + ' (' + Math.round((1 - pricePerHour / standardLessonPrice) * 100) + '%)'}</span>
                                  </div>
                                )}
                              </div>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  )}

                  {/* Rental Fields */}
                  {packageFields.showRental && (
                    <div className="rounded-xl border border-green-100 bg-white p-5 mb-4">
                      <div className="flex items-center gap-2 mb-4">
                        <div className="w-7 h-7 rounded-lg bg-green-50 text-green-600 flex items-center justify-center">
                          <CarOutlined className="text-sm" />
                        </div>
                        <span className="text-sm font-semibold text-gray-900">Rental Details</span>
                      </div>
                      {rentalServices.length === 0 ? (
                        <Alert
                          type="warning"
                          message="No rental services found"
                          description="Create rental services first in Services → Rentals"
                          showIcon
                          icon={<InfoCircleOutlined />}
                        />
                      ) : (
                        <>
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
                        <Row gutter={16}>
                          <Col xs={24} md={12}>
                            <Form.Item
                              name="packageDailyRate"
                              label="Package Daily Rate"
                              tooltip="The per-day price you want to charge for rental in this package"
                            >
                              <InputNumber min={0} step={0.01} style={{ width: '100%' }} placeholder={standardRentalPrice ? `Standard: ${standardRentalPrice}` : 'e.g., 30'} addonAfter={totalCurrency + '/day'} />
                            </Form.Item>
                          </Col>
                          <Col xs={24} md={12}>
                            {rentalComponentTotal !== null && (
                              <div className="mt-7 text-sm font-bold text-green-700">
                                {'Rental total: ' + formatCurrency(rentalComponentTotal, totalCurrency)}
                              </div>
                            )}
                          </Col>
                        </Row>
                        {/* Rental Price Summary */}
                        {(standardRentalPrice || pricePerDay !== null) && (
                          <div className="rounded-lg border border-green-100 bg-gradient-to-r from-green-50/80 to-slate-50/50 p-3">
                            <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Price Summary</div>
                            <div className="space-y-1.5">
                              {standardRentalPrice && (
                                <div className="flex items-center justify-between">
                                  <span className="text-xs text-gray-500">Standard 1 day price</span>
                                  <span className="text-xs font-semibold text-gray-700">{formatCurrency(standardRentalPrice, selectedRental?.currency || totalCurrency)}</span>
                                </div>
                              )}
                              {standardRentalPrice && watchRentalDays > 0 && (
                                <div className="flex items-center justify-between">
                                  <span className="text-xs text-gray-500">{'Standard total (' + watchRentalDays + 'd x ' + formatCurrency(standardRentalPrice, selectedRental?.currency || totalCurrency) + ')'}</span>
                                  <span className="text-xs font-semibold text-gray-700">{formatCurrency(standardRentalPrice * watchRentalDays, selectedRental?.currency || totalCurrency)}</span>
                                </div>
                              )}
                              {pricePerDay !== null && (
                                <>
                                  <div className="border-t border-green-100 my-1" />
                                  <div className="flex items-center justify-between">
                                    <span className="text-xs text-green-600 font-medium">Package 1 day price</span>
                                    <span className="text-xs font-bold text-green-700">{formatCurrency(pricePerDay, totalCurrency)}</span>
                                  </div>
                                  {rentalComponentTotal !== null && (
                                    <div className="flex items-center justify-between">
                                      <span className="text-xs text-green-600 font-medium">{'Package total (' + watchRentalDays + 'd)'}</span>
                                      <span className="text-xs font-bold text-green-700">{formatCurrency(rentalComponentTotal, totalCurrency)}</span>
                                    </div>
                                  )}
                                </>
                              )}
                              {standardRentalPrice && pricePerDay !== null && standardRentalPrice > pricePerDay && (
                                <div className="flex items-center justify-between mt-1 pt-1 border-t border-green-100">
                                  <span className="text-[10px] text-emerald-600 font-semibold">You save per day</span>
                                  <span className="text-[10px] font-bold text-emerald-600">{formatCurrency(standardRentalPrice - pricePerDay, totalCurrency) + ' (' + Math.round((1 - pricePerDay / standardRentalPrice) * 100) + '%)'}</span>
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                        </>
                      )}
                    </div>
                  )}

                  {/* Accommodation Fields */}
                  {packageFields.showAccommodation && (
                    <div className="rounded-xl border border-orange-100 bg-white p-5 mb-4">
                      <div className="flex items-center gap-2 mb-4">
                        <div className="w-7 h-7 rounded-lg bg-orange-50 text-orange-600 flex items-center justify-center">
                          <HomeOutlined className="text-sm" />
                        </div>
                        <span className="text-sm font-semibold text-gray-900">Accommodation Details</span>
                      </div>
                      {accommodationUnits.length === 0 ? (
                        <Alert
                          type="warning"
                          message="No accommodation units found"
                          description="Create accommodation units first in Services → Accommodation"
                          showIcon
                          icon={<InfoCircleOutlined />}
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
                          <Row gutter={16}>
                            <Col xs={24} md={12}>
                              <Form.Item
                                name="packageNightlyRate"
                                label="Package Nightly Rate"
                                tooltip="The per-night price you want to charge for accommodation in this package"
                              >
                                <InputNumber min={0} step={0.01} style={{ width: '100%' }} placeholder={standardNightPrice ? `Standard: ${standardNightPrice}` : 'e.g., 50'} addonAfter={totalCurrency + '/night'} />
                              </Form.Item>
                            </Col>
                            <Col xs={24} md={12}>
                              {accommodationComponentTotal !== null && (
                                <div className="mt-7 text-sm font-bold text-orange-700">
                                  {'Accommodation total: ' + formatCurrency(accommodationComponentTotal, totalCurrency)}
                                </div>
                              )}
                            </Col>
                          </Row>
                          {/* Accommodation Price Summary */}
                          {(standardNightPrice || pricePerNight !== null) && (
                            <div className="mt-3 rounded-lg border border-orange-100 bg-gradient-to-r from-orange-50/80 to-slate-50/50 p-3">
                              <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Price Summary</div>
                              <div className="space-y-1.5">
                                {standardNightPrice && (
                                  <div className="flex items-center justify-between">
                                    <span className="text-xs text-gray-500">Standard 1 night price</span>
                                    <span className="text-xs font-semibold text-gray-700">{formatCurrency(standardNightPrice, selectedUnit?.currency || totalCurrency)}</span>
                                  </div>
                                )}
                                {standardNightPrice && watchAccommodationNights > 0 && (
                                  <div className="flex items-center justify-between">
                                    <span className="text-xs text-gray-500">{'Standard total (' + watchAccommodationNights + 'n x ' + formatCurrency(standardNightPrice, selectedUnit?.currency || totalCurrency) + ')'}</span>
                                    <span className="text-xs font-semibold text-gray-700">{formatCurrency(standardNightPrice * watchAccommodationNights, selectedUnit?.currency || totalCurrency)}</span>
                                  </div>
                                )}
                                {pricePerNight !== null && (
                                  <>
                                    <div className="border-t border-orange-100 my-1" />
                                    <div className="flex items-center justify-between">
                                      <span className="text-xs text-orange-600 font-medium">Package 1 night price</span>
                                      <span className="text-xs font-bold text-orange-700">{formatCurrency(pricePerNight, totalCurrency)}</span>
                                    </div>
                                    {accommodationComponentTotal !== null && (
                                      <div className="flex items-center justify-between">
                                        <span className="text-xs text-orange-600 font-medium">{'Package total (' + watchAccommodationNights + 'n)'}</span>
                                        <span className="text-xs font-bold text-orange-700">{formatCurrency(accommodationComponentTotal, totalCurrency)}</span>
                                      </div>
                                    )}
                                  </>
                                )}
                                {standardNightPrice && pricePerNight !== null && standardNightPrice > pricePerNight && (
                                  <div className="flex items-center justify-between mt-1 pt-1 border-t border-orange-100">
                                    <span className="text-[10px] text-emerald-600 font-semibold">You save per night</span>
                                    <span className="text-[10px] font-bold text-emerald-600">{formatCurrency(standardNightPrice - pricePerNight, totalCurrency) + ' (' + Math.round((1 - pricePerNight / standardNightPrice) * 100) + '%)'}</span>
                                  </div>
                                )}
                              </div>
                            </div>
                          )}

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
                    </div>
                  )}

                  {/* Event-Specific Fields (Downwinders/Camps) */}
                  {(watchPackageType === 'downwinders' || watchPackageType === 'camps') && (
                    <div className="rounded-xl border border-purple-100 bg-white p-5 mb-4">
                      <div className="flex items-center gap-2 mb-4">
                        <div className="w-7 h-7 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center">
                          <CalendarOutlined className="text-sm" />
                        </div>
                        <span className="text-sm font-semibold text-gray-900">Event Details</span>
                      </div>
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
                    </div>
                  )}

                  {/* Empty state when no components match */}
                  {!packageFields.showLessons && !packageFields.showRental && !packageFields.showAccommodation && (
                    <div className="rounded-xl border-2 border-dashed border-gray-200 bg-gray-50 p-8 text-center">
                      <InfoCircleOutlined className="text-3xl text-gray-300 mb-3" />
                      <p className="text-sm text-gray-500">Select a package type in the Info section to configure components</p>
                    </div>
                  )}
                </div>

                {/* ═══ SECTION: Pricing ═══ */}
                <div style={{ display: activeSection === 'pricing' ? 'block' : 'none' }}>
                  <div className="mb-4">
                    <h3 className="text-base font-semibold text-gray-900">Pricing</h3>
                    <p className="text-xs text-gray-400 mt-0.5">Review package breakdown and confirm total price</p>
                  </div>

                  {/* Package Confirmation Summary */}
                  {hasAnyComponent ? (
                    <div className="rounded-xl border border-violet-100 bg-gradient-to-br from-violet-50/80 to-indigo-50/50 p-5 mb-4">
                      <div className="flex items-center gap-2 mb-3">
                        <div className="w-7 h-7 rounded-lg bg-violet-100 text-violet-600 flex items-center justify-center">
                          <DollarOutlined className="text-sm" />
                        </div>
                        <span className="text-sm font-semibold text-gray-900">Package Confirmation</span>
                      </div>

                      {/* Package name */}
                      <div className="bg-white rounded-lg border border-gray-100 p-3 mb-3">
                        <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Package</div>
                        <div className="text-sm font-semibold text-gray-900">{watchName || 'Untitled Package'}</div>
                        <div className="text-xs text-gray-400">{(PACKAGE_TYPES.find(pt => pt.value === watchPackageType) || {}).label || watchPackageType}</div>
                      </div>

                      {/* Component breakdown */}
                      <div className="space-y-2 mb-3">
                        {hasLessonComponent && (
                          <div className="bg-white rounded-lg border border-blue-100 px-3 py-2 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <BookOutlined className="text-blue-500 text-xs" />
                              <div>
                                <div className="text-xs font-medium text-gray-700">
                                  {selectedLesson ? selectedLesson.name : 'Lessons'}
                                </div>
                                <div className="text-[10px] text-gray-400">
                                  {watchTotalHours + 'h'}{pricePerHour ? (' x ' + formatCurrency(pricePerHour, totalCurrency) + '/h') : ''}
                                </div>
                              </div>
                            </div>
                            {lessonComponentTotal !== null && (
                              <span className="text-sm font-bold text-blue-700">{formatCurrency(lessonComponentTotal, totalCurrency)}</span>
                            )}
                          </div>
                        )}
                        {hasRentalComponent && (
                          <div className="bg-white rounded-lg border border-green-100 px-3 py-2 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <CarOutlined className="text-green-500 text-xs" />
                              <div>
                                <div className="text-xs font-medium text-gray-700">
                                  {selectedRental ? selectedRental.name : 'Rental'}
                                </div>
                                <div className="text-[10px] text-gray-400">
                                  {watchRentalDays + 'd'}{pricePerDay ? (' x ' + formatCurrency(pricePerDay, totalCurrency) + '/day') : ''}
                                </div>
                              </div>
                            </div>
                            {rentalComponentTotal !== null && (
                              <span className="text-sm font-bold text-green-700">{formatCurrency(rentalComponentTotal, totalCurrency)}</span>
                            )}
                          </div>
                        )}
                        {hasAccommodationComponent && (
                          <div className="bg-white rounded-lg border border-orange-100 px-3 py-2 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <HomeOutlined className="text-orange-500 text-xs" />
                              <div>
                                <div className="text-xs font-medium text-gray-700">
                                  {selectedUnit ? selectedUnit.name : 'Accommodation'}
                                </div>
                                <div className="text-[10px] text-gray-400">
                                  {watchAccommodationNights + 'n'}{pricePerNight ? (' x ' + formatCurrency(pricePerNight, totalCurrency) + '/night') : ''}
                                </div>
                              </div>
                            </div>
                            {accommodationComponentTotal !== null && (
                              <span className="text-sm font-bold text-orange-700">{formatCurrency(accommodationComponentTotal, totalCurrency)}</span>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Calculated Total */}
                      <div className="border-t border-violet-200 pt-3">
                        <div className="flex items-center justify-between mb-3">
                          <span className="text-sm font-semibold text-gray-700">Total Package Price</span>
                          <span className="text-xl font-bold text-violet-700">{formatCurrency(totalPrice > 0 ? totalPrice : calculatedTotal, totalCurrency)}</span>
                        </div>

                        {/* Override price input */}
                        <div className="bg-white rounded-lg border border-gray-200 p-3">
                          <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Adjust Final Price</div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm text-gray-500">{totalCurrency}</span>
                            <InputNumber
                              min={0}
                              step={0.01}
                              style={{ flex: 1 }}
                              value={totalPrice > 0 ? totalPrice : calculatedTotal > 0 ? calculatedTotal : undefined}
                              placeholder={calculatedTotal > 0 ? String(Math.round(calculatedTotal * 100) / 100) : '0.00'}
                              onChange={(val) => {
                                const currentPrices = form.getFieldValue('prices') || [{ currencyCode: userCurrency || 'EUR', price: 0 }];
                                form.setFieldsValue({
                                  prices: [{ ...currentPrices[0], price: val || 0 }]
                                });
                              }}
                            />
                          </div>
                          {totalPrice > 0 && calculatedTotal > 0 && Math.abs(totalPrice - calculatedTotal) > 0.01 && (
                            <div className="mt-2 text-[10px] text-gray-400">
                              {'Calculated from rates: ' + formatCurrency(calculatedTotal, totalCurrency)}
                              {totalPrice < calculatedTotal
                                ? (' — discount of ' + formatCurrency(calculatedTotal - totalPrice, totalCurrency))
                                : (' — markup of ' + formatCurrency(totalPrice - calculatedTotal, totalCurrency))}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-xl border-2 border-dashed border-gray-200 bg-gray-50 p-6 text-center">
                      <DollarOutlined className="text-2xl text-gray-300 mb-2" />
                      <p className="text-sm text-gray-500 mb-1">No components configured yet</p>
                      <p className="text-xs text-gray-400">Go to Components to set up lessons, rentals, or accommodation first</p>
                    </div>
                  )}

                  {/* Hidden form fields for price data */}
                  <div style={{ display: 'none' }}>
                    <MultiCurrencyPriceInput
                      form={form}
                      name="prices"
                      label="Prices"
                      required
                      compact
                    />
                  </div>
                </div>

                {/* ═══ SECTION: Media ═══ */}
                <div style={{ display: activeSection === 'media' ? 'block' : 'none' }}>
                  <div className="mb-4">
                    <h3 className="text-base font-semibold text-gray-900">Package Image</h3>
                    <p className="text-xs text-gray-400 mt-0.5">Upload a cover image for this package (optional)</p>
                  </div>

                  <div className="rounded-xl border border-gray-100 bg-white p-5">
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
                </div>

              </div>
            </Form>
          </div>

        </div>

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
      </Drawer>
    </div>
  );
}

export default PackageManagement;
