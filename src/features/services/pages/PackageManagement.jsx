import { useState, useEffect, useCallback } from 'react';
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
  Alert
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
  InfoCircleOutlined
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
  { value: 'all_inclusive', label: 'All Inclusive', icon: <ShoppingOutlined />, color: 'gold', description: 'Complete package' }
];

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
    title: 'Package Management',
    description: 'Manage all service packages - lessons, rentals, accommodation, and combo packages'
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
  const [selectedTypes, setSelectedTypes] = useState([]);  // Multi-select filter - empty means all
  
  const { userCurrency, formatCurrency } = useCurrency();

  // Derived data - filter services by category
  const lessonServices = allServices.filter(s => 
    s.category === 'lesson' || 
    s.category === 'lessons' || 
    s.category === 'kitesurfing' || 
    s.category === 'wingfoil' ||
    s.serviceType === 'lesson' ||
    s.serviceType === 'private' ||
    s.serviceType === 'group'
  ).filter(s => s.category !== 'rentals' && s.category !== 'rental'); // Exclude rental services
  
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
    includesAccommodation: ['accommodation', 'accommodation_lesson', 'accommodation_rental', 'all_inclusive'].includes(packageType)
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

    if (prices.length > 0) {
      packageData.price = prices[0].price;
      packageData.currency = prices[0].currencyCode;
    }

    return packageData;
  };

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
    
    form.setFieldsValue({
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
    });
    
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
      showLessons: ['lesson', 'lesson_rental', 'accommodation_lesson', 'all_inclusive'].includes(packageType),
      showRental: ['rental', 'lesson_rental', 'accommodation_rental', 'all_inclusive'].includes(packageType),
      showAccommodation: ['accommodation', 'accommodation_lesson', 'accommodation_rental', 'all_inclusive'].includes(packageType)
    };
    return fields;
  };

  // Watch for package type changes
  const watchPackageType = Form.useWatch('packageType', form);
  const packageFields = getPackageTypeFields(watchPackageType || 'lesson');

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
                    <span><span className="font-semibold">{pkg.totalHours} Hours</span> Lessons</span>
                 </div>
              )}
              
              {(pkg.includesRental && (pkg.rentalDaysTotal > 0 || pkg.rentalDays > 0 || pkg.rental_days_total > 0)) && (
                 <div className="flex items-start gap-3 text-slate-700 text-sm">
                    <div className="mt-0.5 w-5 h-5 rounded-full bg-green-50 text-green-600 flex items-center justify-center shrink-0">
                       <CarOutlined className="text-xs" />
                    </div>
                    <span><span className="font-semibold">{pkg.rentalDaysTotal || pkg.rentalDays || pkg.rental_days_total} Days</span> Rental ({pkg.rentalServiceName})</span>
                 </div>
              )}
              
              {(pkg.includesAccommodation && (pkg.accommodationNightsTotal > 0 || pkg.accommodationNights > 0 || pkg.accommodation_nights_total > 0)) && (
                 <div className="flex items-start gap-3 text-slate-700 text-sm">
                    <div className="mt-0.5 w-5 h-5 rounded-full bg-orange-50 text-orange-600 flex items-center justify-center shrink-0">
                       <HomeOutlined className="text-xs" />
                    </div>
                    <span><span className="font-semibold">{pkg.accommodationNightsTotal || pkg.accommodationNights || pkg.accommodation_nights_total} Nights</span> Stay ({pkg.accommodationUnitName})</span>
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
                <Title level={2} className="!mb-0 text-slate-900 !text-lg sm:!text-xl md:!text-2xl">Package Management</Title>
              </div>
              <p className="text-slate-600 text-xs sm:text-sm md:text-base">
                Create and manage all service packages - lessons, rentals, accommodation, and combos
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
          
          {/* Quick Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 pt-2">
            {PACKAGE_TYPES.slice(0, 4).map(type => {
              const count = packages.filter(p => p.packageType === type.value).length;
              return (
                <div key={type.value} className="bg-slate-50 rounded-lg sm:rounded-xl p-2 sm:p-3 border border-slate-100">
                  <div className="flex items-center gap-2">
                    <div className={`text-lg sm:text-xl ${type.color === 'blue' ? 'text-blue-600' : type.color === 'green' ? 'text-green-600' : type.color === 'orange' ? 'text-orange-600' : 'text-purple-600'}`}>
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
             <Text strong className="text-slate-500 uppercase tracking-wide text-xs whitespace-nowrap">Filter Packages</Text>
             <Select
                mode="multiple"
                allowClear
                placeholder="All Types"
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
        title={editMode ? 'Edit Package' : 'Create New Package'}
        open={packageModalVisible}
        onCancel={() => {
          setPackageModalVisible(false);
          form.resetFields();
          setEditMode(false);
          setSelectedPackage(null);
        }}
        footer={null}
        width={800}
        destroyOnHidden
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleSubmit}
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
                <Select>
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
                      rules={[{ required: true, message: 'Please select a lesson type' }]}
                      tooltip="Select which lesson service this package includes"
                    >
                      <Select 
                        placeholder="Select lesson type"
                        showSearch
                        optionFilterProp="children"
                        filterOption={(input, option) =>
                          (option?.children ?? '').toLowerCase().includes(input.toLowerCase())
                        }
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
                      rules={[{ required: true, message: 'Enter total hours included' }]}
                      tooltip="Number of lesson hours included in this package"
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
                      rules={[{ required: true, message: 'Please select a rental service' }]}
                      tooltip="Select which rental service is included in the package"
                    >
                      <Select 
                        placeholder="Select rental service"
                        allowClear
                        showSearch
                        optionFilterProp="children"
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
                      rules={[{ required: true, message: 'Enter rental days' }]}
                      tooltip="Number of days the rental is included"
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
              )}
            </>
          )}

          <Divider />

          {/* Pricing Section */}
          <Form.Item
            name="prices"
            label="Package Price (Multi-Currency)"
            rules={[{ required: true, message: 'Please set a price' }]}
            tooltip="Set the total package price in one or more currencies"
          >
            <MultiCurrencyPriceInput />
          </Form.Item>

          <Form.Item
            name="imageUrl"
            label="Package Image URL (Optional)"
          >
            <Input placeholder="https://example.com/package-image.jpg" />
          </Form.Item>

          <Form.Item>
            <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
              <Button onClick={() => setPackageModalVisible(false)}>
                Cancel
              </Button>
              <Button type="primary" htmlType="submit" loading={loading}>
                {editMode ? 'Update Package' : 'Create Package'}
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

export default PackageManagement;
