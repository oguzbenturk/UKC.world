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
    return (
      <Card
        hoverable
        style={{ marginBottom: 16 }}
        actions={[
          <EditOutlined key="edit" onClick={() => handleEdit(pkg)} />,
          <Popconfirm
            key="delete"
            title="Delete Package"
            description="Are you sure you want to delete this package?"
            onConfirm={() => handleDelete(pkg.id)}
            okText="Delete"
            cancelText="Cancel"
            okButtonProps={{ danger: true }}
          >
            <DeleteOutlined style={{ color: '#ff4d4f' }} />
          </Popconfirm>
        ]}
      >
        <Card.Meta
          title={
            <Space>
              <span>{pkg.name}</span>
              <Tag color={config.color}>{config.label}</Tag>
            </Space>
          }
          description={
            <Space direction="vertical" size="small" style={{ width: '100%' }}>
              {pkg.description && <Text type="secondary">{pkg.description}</Text>}
              <Space wrap>
                {pkg.includesLessons && pkg.totalHours > 0 && (
                  <Tag color="blue">{pkg.totalHours}h Lessons</Tag>
                )}
                {pkg.includesRental && pkg.rentalDays > 0 && (
                  <Tag color="green">{pkg.rentalDays}d Rental</Tag>
                )}
                {pkg.includesAccommodation && pkg.accommodationNights > 0 && (
                  <Tag color="orange">{pkg.accommodationNights}n Stay</Tag>
                )}
              </Space>
              <Text strong style={{ fontSize: 16 }}>
                {formatCurrency(pkg.price, pkg.currency)}
              </Text>
            </Space>
          }
        />
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
    <div className="p-4 md:p-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
        <div>
          <Title level={2} className="!mb-1">Package Management</Title>
          <Text type="secondary">Create and manage all service packages</Text>
        </div>
        <Space>
          <Button
            icon={viewMode === 'table' ? <AppstoreOutlined /> : <TableOutlined />}
            onClick={() => setViewMode(viewMode === 'table' ? 'cards' : 'table')}
          >
            {viewMode === 'table' ? 'Card View' : 'Table View'}
          </Button>
          <Button 
            type="primary" 
            icon={<PlusOutlined />}
            onClick={() => openCreateModal(selectedTypes.length === 1 ? selectedTypes[0] : 'lesson')}
          >
            Create Package
          </Button>
        </Space>
      </div>

      <Card>
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 mb-4">
          <Text strong className="whitespace-nowrap">Filter by type:</Text>
          <Select
            mode="multiple"
            allowClear
            placeholder="All package types"
            value={selectedTypes}
            onChange={setSelectedTypes}
            options={filterOptions}
            style={{ minWidth: 200, maxWidth: '100%' }}
            className="flex-1"
            maxTagCount="responsive"
          />
          <Text type="secondary" className="whitespace-nowrap">
            Showing {filteredPackages.length} of {packages.length} packages
          </Text>
        </div>

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
          <Row gutter={[16, 16]}>
            {filteredPackages.map(pkg => (
              <Col key={pkg.id} xs={24} sm={12} lg={8} xl={6}>
                <PackageCard pkg={pkg} />
              </Col>
            ))}
            {filteredPackages.length === 0 && (
              <Col span={24}>
                <div className="text-center py-8 text-gray-500">
                  No packages found. Create your first package!
                </div>
              </Col>
            )}
          </Row>
        )}
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
