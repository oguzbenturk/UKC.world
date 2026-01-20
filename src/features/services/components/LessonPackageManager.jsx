import { useState, useEffect } from 'react';
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
  App
} from 'antd';
import { 
  PlusOutlined, 
  EditOutlined,
  DeleteOutlined,
  TableOutlined,
  AppstoreOutlined
} from '@ant-design/icons';
import { useCurrency } from '@/shared/contexts/CurrencyContext';
import { useData } from '@/shared/hooks/useData';
import MultiCurrencyPriceInput from '@/shared/components/ui/MultiCurrencyPriceInput';

const { Option } = Select;
const { useBreakpoint } = Grid;

function LessonPackageManager({ visible, onClose, lessonServices }) {
  return (
    <App>
      <LessonPackageManagerInner visible={visible} onClose={onClose} lessonServices={lessonServices} />
    </App>
  );
}

function LessonPackageManagerInner({ visible, onClose, lessonServices }) {
  const { message } = App.useApp();
  const screens = useBreakpoint();
  const { apiClient } = useData();
  const [form] = Form.useForm();
  const [packages, setPackages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [packageModalVisible, setPackageModalVisible] = useState(false);
  const [selectedPackage, setSelectedPackage] = useState(null);
  const [editMode, setEditMode] = useState(false);
  const [isAutoCalculated, setIsAutoCalculated] = useState(true);
  const [manualPriceOverride, setManualPriceOverride] = useState(false);
  const [priceCalculationDisplay, setPriceCalculationDisplay] = useState('');
  const [viewMode, setViewMode] = useState('table'); // 'table' | 'cards'
  
  const { userCurrency, formatCurrency, getCurrencySymbol } = useCurrency();

  // Get lesson types from available lesson services
  const availableLessonTypes = lessonServices?.map(service => ({
    value: service.id,
    label: service.name,
    duration: service.duration || 2,
    price: service.price,
  currency: service.currency,
  // pass through service tags for convenience
  disciplineTag: service.disciplineTag || null,
  lessonCategoryTag: service.lessonCategoryTag || null,
  levelTag: service.levelTag || null,
  })) || [];

  // Load packages from API
  function loadPackages() {
    if (!apiClient) return;
    (async () => {
      try {
        setLoading(true);
        const response = await apiClient.get('/services/packages');
        setPackages(response.data || []);
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('Error loading packages:', error);
        if (error.response?.status === 401) {
          message.warning('Please log in to view packages');
        } else {
          message.error('Failed to load packages');
        }
        setPackages([]);
      } finally {
        setLoading(false);
      }
    })();
  }

  // Load packages from API on component mount
  useEffect(() => {
    if (apiClient) {
      loadPackages();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiClient]);

  // Prefer cards by default on small screens
  useEffect(() => {
    if (!screens.md) {
      setViewMode('cards');
    }
  }, [screens.md]);

  // Auto-calculate price when lesson type or total hours change
  const calculatePackagePrice = () => {
    if (!form) return null;
    
    try {
      const lessonType = form.getFieldValue('lessonType');
      const totalHours = form.getFieldValue('totalHours');
      
      if (lessonType && totalHours && isAutoCalculated) {
        const selectedService = lessonServices?.find(service => service.id === lessonType);
        if (selectedService?.price) {
          const calculatedPrice = selectedService.price * totalHours;
          form.setFieldsValue({ price: calculatedPrice });
          updatePriceCalculationDisplay();
          return calculatedPrice;
        }
      }
      updatePriceCalculationDisplay();
    } catch {
      // Silent fallback for form calculation
    }
    return null;
  };

  // Update price calculation display
  const updatePriceCalculationDisplay = () => {
    if (!form) {
      setPriceCalculationDisplay('💡 Price automatically calculated from lesson rate × total hours');
      return;
    }
    
    try {
      const lessonType = form.getFieldValue('lessonType');
      const totalHours = form.getFieldValue('totalHours');
      
      if (lessonType && totalHours) {
        const selectedService = lessonServices?.find(service => service.id === lessonType);
        if (selectedService?.price) {
          setPriceCalculationDisplay(
            `💡 ${formatCurrency(selectedService.price, selectedService.currency)}/hour × ${totalHours} hours = ${formatCurrency(selectedService.price * totalHours, selectedService.currency)}`
          );
          return;
        }
      }
      setPriceCalculationDisplay('💡 Price automatically calculated from lesson rate × total hours');
    } catch {
      setPriceCalculationDisplay('💡 Price automatically calculated from lesson rate × total hours');
    }
  };

  // Handle lesson type change
  const handleLessonTypeChange = (_value) => {
    if (isAutoCalculated) {
      calculatePackagePrice();
    }
  };

  // Handle total hours change
  const handleTotalHoursChange = (_value) => {
    if (isAutoCalculated) {
      calculatePackagePrice();
    }
  };

  // Handle manual price change
  const handlePriceChange = (value) => {
    if (!form || !isAutoCalculated || value === null) return;
    
    try {
      const lessonType = form.getFieldValue('lessonType');
      const totalHours = form.getFieldValue('totalHours');
      
      if (lessonType && totalHours) {
        const selectedService = lessonServices?.find(service => service.id === lessonType);
        if (selectedService?.price) {
          const calculatedPrice = selectedService.price * totalHours;
          if (Math.abs(value - calculatedPrice) > 0.01) {
            setManualPriceOverride(true);
            setIsAutoCalculated(false);
          }
        }
      }
    } catch {
      // Silent fallback for price calculation
    }
  };

  // Reset auto-calculation mode
  const resetAutoCalculation = () => {
    setIsAutoCalculated(true);
    setManualPriceOverride(false);
    calculatePackagePrice();
  };

  // (Removed useCallback variant; using hoisted function instead)

  const buildPackageData = (values) => {
    const selectedLessonService = lessonServices.find(service => service.id === values.lessonType);
    const suggestedSessions = Math.ceil(values.totalHours / (selectedLessonService?.duration || 2));
    
    // Build prices array from form values (multi-currency support)
    const prices = values.prices || [];
    const primaryPrice = prices.length > 0 ? prices[0].price : (parseFloat(values.price) || 0);
    const primaryCurrency = prices.length > 0 ? prices[0].currencyCode : (values.currency || userCurrency || 'EUR');
    
    return {
      name: values.name,
      price: primaryPrice,
      currency: primaryCurrency,
      prices: prices.filter(p => p.price != null && p.price > 0), // Only send valid prices
      sessionsCount: suggestedSessions,
      totalHours: values.totalHours,
      lessonType: values.lessonType,
      lessonServiceName: selectedLessonService?.name,
      description: values.description || '',
      disciplineTag: selectedLessonService?.disciplineTag || null,
      lessonCategoryTag: selectedLessonService?.lessonCategoryTag || null,
      levelTag: selectedLessonService?.levelTag || null,
    };
  };

  const savePackage = async (packageData) => {
    if (editMode && selectedPackage) {
      const response = await apiClient.put(`/services/packages/${selectedPackage.id}`, packageData);
      const updatedPackage = { ...response.data };
      setPackages(prev => prev.map(pkg => (pkg.id === selectedPackage.id ? updatedPackage : pkg)));
      message.success('Package updated successfully!');
    } else {
      const response = await apiClient.post('/services/packages', packageData);
      const newPackage = { ...response.data };
      setPackages(prev => [...prev, newPackage]);
      message.success('Package created successfully!');
    }
  };

  const finalizePackageModal = () => {
    setPackageModalVisible(false);
    setEditMode(false);
    setSelectedPackage(null);
    form.resetFields();
  };

  const handleCreatePackage = async (values) => {
    try {
      setLoading(true);
      const packageData = buildPackageData(values);
      await savePackage(packageData);
      finalizePackageModal();
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Error saving package:', error);
      const status = error.response?.status;
      if (status === 401) {
        message.error('Authentication required. Please log in.');
      } else if (status === 403) {
        message.error('You do not have permission to manage packages.');
      } else {
        message.error(editMode ? 'Failed to update package' : 'Failed to create package');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleEditPackage = (pkg) => {
    setSelectedPackage(pkg);
    setEditMode(true);
    setPackageModalVisible(true);
    setIsAutoCalculated(false); // Disable auto-calc for existing packages
    setManualPriceOverride(false);
    setPriceCalculationDisplay('⚠️ Editing existing package - price calculation disabled');
    
    // Build initial prices from package data
    const initialPrices = pkg.prices && pkg.prices.length > 0 
      ? pkg.prices 
      : [{ currencyCode: pkg.currency || 'EUR', price: pkg.price }];
    
    // Find the lesson service ID by matching the name from the API response
    // The API returns lessonServiceName (display name) but frontend Select uses service.id
    const matchedService = lessonServices?.find(
      service => service.name === pkg.lessonServiceName
    );
    const lessonTypeId = matchedService?.id || pkg.lessonType;
    
    form.setFieldsValue({
      name: pkg.name,
      lessonType: lessonTypeId,
      totalHours: pkg.totalHours,
      price: pkg.price,
      currency: pkg.currency,
      prices: initialPrices,
      description: pkg.description
    });
  };

  const handleDeletePackage = async (packageId) => {
    try {
      await apiClient.delete(`/services/packages/${packageId}`);
      setPackages(prev => prev.filter(pkg => pkg.id !== packageId));
      message.success('Package deleted successfully!');
  } catch (error) {
  // eslint-disable-next-line no-console
  console.error('Error deleting package:', error);
      
      if (error.response?.status === 400 && error.response?.data?.linkedServices) {
        // Package has linked services
        const { linkedServices } = error.response.data;
        Modal.confirm({
          title: 'Package Cannot Be Deleted',
          content: (
            <div>
              <p>{error.response.data.details}</p>
              <p><strong>Linked services:</strong></p>
              <ul>
                {linkedServices.map(service => (
                  <li key={service.id}>{service.name}</li>
                ))}
              </ul>
              <p>Would you like to force delete this package? This will remove the package association from all linked services.</p>
            </div>
          ),
          onOk: () => handleForceDeletePackage(packageId),
          okText: 'Force Delete',
          okType: 'danger',
          cancelText: 'Cancel'
        });
      } else if (error.response?.status === 401) {
        message.error('Authentication required. Please log in.');
      } else if (error.response?.status === 403) {
        message.error('You do not have permission to delete packages.');
      } else if (error.response?.status === 404) {
        message.error('Package not found.');
        // Remove from local state anyway
        setPackages(prev => prev.filter(pkg => pkg.id !== packageId));
      } else {
        message.error('Failed to delete package');
      }
    }
  };

  const handleForceDeletePackage = async (packageId) => {
    if (!apiClient) {
      message.error('API client not available');
      return;
    }
    
    try {
  // Use the dedicated force delete endpoint to avoid query parsing issues
  await apiClient.delete(`/services/packages/${packageId}/force`);
      setPackages(prev => prev.filter(pkg => pkg.id !== packageId));
      message.success('Package force deleted successfully!');
  } catch (error) {
  // eslint-disable-next-line no-console
  console.error('Error force deleting package:', error);
      if (error.response?.status === 401) {
        message.error('Authentication required. Please log in.');
      } else if (error.response?.status === 403) {
        message.error('You do not have permission to force delete packages.');
      } else {
        message.error('Failed to force delete package');
      }
    }
  };

  // Refresh button removed per request

  // Table columns for packages
  const columns = [
    {
      title: 'Package Name',
      dataIndex: 'name',
      key: 'name',
      render: (text, record) => (
        <div>
          <div className="font-medium">{text}</div>
          <div className="text-sm text-gray-500">{record.description}</div>
        </div>
      ),
    },
    {
      title: 'Lesson Type',
      dataIndex: 'lessonServiceName',
      key: 'lessonServiceName',
  render: (lessonServiceName, _record) => {
        const displayName = lessonServiceName || 'Unknown Service';
        return (
          <Tag color="blue">
            {displayName}
          </Tag>
        );
      }
    },
    {
      title: 'Total Hours',
      dataIndex: 'totalHours',
      key: 'totalHours',
      render: (hours, record) => (
        <div className="text-center">
          <div className="font-semibold">{hours}h</div>
          <div className="text-sm text-gray-500">{record.sessionsCount} sessions</div>
        </div>
      ),
    },
    {
      title: 'Price',
      dataIndex: 'price',
      key: 'price',
      render: (price, record) => {
        // Show all currency prices if available
        const prices = record.prices && record.prices.length > 0 
          ? record.prices 
          : [{ currencyCode: record.currency, price }];
        
        return (
          <div className="text-right">
            {prices.map((p, idx) => (
              <div key={idx} className={idx === 0 ? 'font-semibold' : 'text-sm text-gray-500'}>
                {formatCurrency(p.price, p.currencyCode)}
              </div>
            ))}
            <div className="text-xs text-gray-400 mt-1">
              {formatCurrency(record.pricePerHour, record.currency)}/h
            </div>
          </div>
        );
      },
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      render: (status) => (
        <Tag color={status === 'active' ? 'green' : 'red'}>
          {status.toUpperCase()}
        </Tag>
      )
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_, record) => (
        <div className="space-x-2">
          <Button 
            size="small" 
            icon={<EditOutlined />}
            onClick={() => handleEditPackage(record)}
          >
            Edit
          </Button>
          <Button 
            size="small" 
            danger
            icon={<DeleteOutlined />}
            onClick={() => handleDeletePackage(record.id)}
          >
            Delete
          </Button>
        </div>
      )
    }
  ];

  // Stats removed from UI; keeping data minimal in this manager

  return (
    <Modal
      title={null}
      open={visible}
      onCancel={onClose}
      width={1200}
      footer={null}
      style={{ top: 20 }}
    >
      <div className="space-y-6">
        {/* Actions Row: View toggle + Create button */}
        <div className="flex justify-between items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Space.Compact>
              <Button 
                type={viewMode === 'table' ? 'primary' : 'default'}
                icon={<TableOutlined />}
                onClick={() => setViewMode('table')}
              >
                Table
              </Button>
              <Button 
                type={viewMode === 'cards' ? 'primary' : 'default'}
                icon={<AppstoreOutlined />}
                onClick={() => setViewMode('cards')}
              >
                Cards
              </Button>
            </Space.Compact>
          </div>
          <Button 
            type="primary" 
            icon={<PlusOutlined />}
            onClick={() => {
              setEditMode(false);
              setSelectedPackage(null);
              setIsAutoCalculated(true);
              setManualPriceOverride(false);
              setPriceCalculationDisplay('💡 Price automatically calculated from lesson rate × total hours');
              form.resetFields();
              // Set default values
              form.setFieldsValue({
                currency: 'EUR'
              });
              setPackageModalVisible(true);
            }}
          >
            Create Package
          </Button>
        </div>

        {/* Packages List */}
        <Spin spinning={loading}>
          {viewMode === 'table' ? (
            <Table
              columns={columns}
              dataSource={packages}
              rowKey="id"
              pagination={{ pageSize: 10 }}
              size="middle"
            />
          ) : (
            <div>
              {(!packages || packages.length === 0) ? (
                <div className="text-center text-gray-500 py-8">No packages found</div>
              ) : (
                <Row gutter={[16, 16]}>
                  {packages.map((pkg) => {
                    const perHour = pkg.totalHours ? (pkg.price || 0) / pkg.totalHours : null;
                    return (
                      <Col key={pkg.id} xs={24} sm={12} md={8} lg={6}>
                        <Card
                          size="small"
                          className="h-full"
                          title={
                            <div className="flex flex-col gap-1">
                              <div className="font-medium leading-snug">{pkg.name}</div>
                              {pkg.description ? (
                                <div className="text-xs text-gray-500 leading-snug">{pkg.description}</div>
                              ) : null}
                              <div className="flex flex-wrap items-center gap-1 pt-1">
                                <Tag color={pkg.status === 'active' ? 'green' : 'red'} className="m-0">
                                  {(pkg.status || 'active').toUpperCase()}
                                </Tag>
                                <Tag color="blue" className="m-0">
                                  {pkg.lessonServiceName || 'Unknown Service'}
                                </Tag>
                              </div>
                            </div>
                          }
                          actions={[
                            <Button key="edit" size="small" icon={<EditOutlined />} onClick={() => handleEditPackage(pkg)}>Edit</Button>,
                            <Button key="delete" size="small" danger icon={<DeleteOutlined />} onClick={() => handleDeletePackage(pkg.id)}>Delete</Button>
                          ]}
                        >
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <div className="text-xs text-gray-500">Total Hours</div>
                              <div className="font-semibold">{pkg.totalHours}h</div>
                              <div className="text-xs text-gray-500">{pkg.sessionsCount} sessions</div>
                            </div>
                            <div className="text-right">
                              <div className="text-xs text-gray-500">Prices</div>
                              {(pkg.prices && pkg.prices.length > 0 
                                ? pkg.prices 
                                : [{ currencyCode: pkg.currency, price: pkg.price }]
                              ).map((p, idx) => (
                                <div key={idx} className={idx === 0 ? 'font-semibold' : 'text-xs text-gray-500'}>
                                  {formatCurrency(p.price, p.currencyCode)}
                                </div>
                              ))}
                              <div className="text-xs text-gray-400 mt-1">{perHour != null ? `${formatCurrency(perHour, pkg.currency)}/h` : '-'}</div>
                            </div>
                          </div>
                        </Card>
                      </Col>
                    );
                  })}
                </Row>
              )}
            </div>
          )}
        </Spin>
      </div>

      {/* Create/Edit Package Modal */}
      <Modal
        title={null}
        open={packageModalVisible}
        onCancel={() => {
          setPackageModalVisible(false);
          setEditMode(false);
          setSelectedPackage(null);
          setIsAutoCalculated(true);
          setManualPriceOverride(false);
          setPriceCalculationDisplay('');
          form.resetFields();
        }}
        footer={null}
        width={640}
        className="modern-modal"
        styles={{ body: { padding: 0 } }}
      >
        {/* Modern gradient header */}
        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-5 -mx-6 -mt-5 mb-6 rounded-t-lg">
          <h2 className="text-xl font-semibold text-white flex items-center gap-2">
            {editMode ? '✏️ Edit Service Package' : '📦 Create Service Package'}
          </h2>
          <p className="text-blue-100 text-sm mt-1">
            {editMode ? 'Update the package details below' : 'Bundle lesson hours into a convenient package for your customers'}
          </p>
        </div>

        <Form
          form={form}
          layout="vertical"
          onFinish={handleCreatePackage}
          className="px-6 pb-6"
        >
          {/* Section 1: Package Basics */}
          <section className="space-y-4 rounded-xl border border-slate-200/70 bg-slate-50/50 p-4 mb-5">
            <div className="border-b border-slate-200/70 pb-3 mb-3">
              <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Basic Info</p>
              <h3 className="text-base font-semibold text-slate-800">Package Details</h3>
            </div>
            
            <Form.Item
              name="name"
              label={<span className="font-medium text-slate-700">Package Name</span>}
              rules={[{ required: true, message: 'Please enter package name' }]}
            >
              <Input placeholder="e.g., 6h Beginner Course" className="rounded-lg" />
            </Form.Item>

            <Form.Item
              name="lessonType"
              label={<span className="font-medium text-slate-700">Lesson Type / Service</span>}
              rules={[{ required: true, message: 'Please select a lesson type - this determines which service this package belongs to' }]}
              tooltip="This links the package to a specific service and determines when it will be available for booking"
            >
              <Select 
                placeholder="Select lesson type (REQUIRED)"
                onChange={handleLessonTypeChange}
                className="rounded-lg"
              >
                {availableLessonTypes.map(type => (
                  <Option key={type.value} value={type.value}>
                    <div className="flex justify-between">
                      <span>{type.label}</span>
                      <span className="text-gray-500 ml-2">
                        {formatCurrency(type.price, type.currency)}/h
                      </span>
                    </div>
                  </Option>
                ))}
              </Select>
            </Form.Item>

            <Form.Item
              name="totalHours"
              label={<span className="font-medium text-slate-700">Total Hours</span>}
              rules={[{ required: true, message: 'Please enter total hours' }]}
            >
              <InputNumber 
                min={1} 
                max={20} 
                placeholder="e.g., 6" 
                style={{ width: '100%' }}
                addonAfter="hours"
                onChange={handleTotalHoursChange}
                className="rounded-lg"
              />
            </Form.Item>
          </section>

          {/* Section 2: Tags/Classification */}
          <section className="space-y-4 rounded-xl border border-slate-200/70 bg-slate-50/50 p-4 mb-5">
            <div className="border-b border-slate-200/70 pb-3 mb-3">
              <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Classification</p>
              <h3 className="text-base font-semibold text-slate-800">Package Tags</h3>
              <p className="text-xs text-slate-500 mt-1">Optional - helps organize and filter packages</p>
            </div>
            
            <Row gutter={16}>
              <Col span={8}>
                <Form.Item name="disciplineTag" label={<span className="font-medium text-slate-700 text-sm">Discipline</span>}>
                  <Select allowClear placeholder="Auto" size="middle" className="rounded-lg">
                    <Option value="kite">🪁 Kite</Option>
                    <Option value="wing">🦅 Wing</Option>
                    <Option value="foil">🏄 Foil</Option>
                  </Select>
                </Form.Item>
              </Col>
              <Col span={8}>
                <Form.Item name="lessonCategoryTag" label={<span className="font-medium text-slate-700 text-sm">Category</span>}>
                  <Select allowClear placeholder="Auto" size="middle" className="rounded-lg">
                    <Option value="private">👤 Private</Option>
                    <Option value="semi-private">👥 Semi-Private</Option>
                    <Option value="group">👨‍👩‍👧‍👦 Group</Option>
                    <Option value="supervision">👁️ Supervision</Option>
                  </Select>
                </Form.Item>
              </Col>
              <Col span={8}>
                <Form.Item name="levelTag" label={<span className="font-medium text-slate-700 text-sm">Level</span>}>
                  <Select allowClear placeholder="Optional" size="middle" className="rounded-lg">
                    <Option value="beginner">🌱 Beginner</Option>
                    <Option value="intermediate">📈 Intermediate</Option>
                    <Option value="advanced">🚀 Advanced</Option>
                    <Option value="premium">⭐ Premium</Option>
                  </Select>
                </Form.Item>
              </Col>
            </Row>
          </section>

          {/* Section 3: Pricing */}
          <section className="space-y-4 rounded-xl border border-slate-200/70 bg-slate-50/50 p-4 mb-5">
            <div className="border-b border-slate-200/70 pb-3 mb-3">
              <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Pricing</p>
              <h3 className="text-base font-semibold text-slate-800">Package Prices</h3>
            </div>

            <MultiCurrencyPriceInput
              form={form}
              name="prices"
              label={
                <div className="flex items-center gap-2">
                  <span className="font-medium text-slate-700">Price</span>
                  {isAutoCalculated && (
                    <Tooltip title="Primary price is automatically calculated based on lesson service hourly rate × total hours">
                      <Tag color="blue" size="small">Auto-calculated</Tag>
                    </Tooltip>
                  )}
                  {manualPriceOverride && (
                    <div className="flex items-center gap-1">
                      <Tooltip title="Price has been manually overridden">
                        <Tag color="orange" size="small">Manual Override</Tag>
                      </Tooltip>
                      <Button 
                        type="link" 
                        size="small" 
                        onClick={resetAutoCalculation}
                        style={{ padding: 0, height: 'auto' }}
                      >
                        Reset to Auto
                      </Button>
                    </div>
                  )}
                </div>
              }
              primaryCurrencyName="currency"
              primaryPriceName="price"
              required={true}
              initialPrices={editMode && selectedPackage?.prices ? selectedPackage.prices : undefined}
              compact={true}
            />
            
            {(manualPriceOverride || isAutoCalculated) && (
              <div className="rounded-lg bg-white border border-slate-200 p-3 mt-2">
                {manualPriceOverride ? (
                  <span className="text-orange-600 text-sm flex items-center gap-2">
                    ⚠️ Price manually overridden. Auto-calculation is disabled.
                  </span>
                ) : isAutoCalculated ? (
                  <span className="text-blue-600 text-sm flex items-center gap-2">
                    {priceCalculationDisplay}
                  </span>
                ) : null}
              </div>
            )}

            <Form.Item
              name="currency"
              initialValue="EUR"
              style={{ display: 'none' }}
            >
              <Input />
            </Form.Item>
          </section>

          {/* Section 4: Notes */}
          <section className="space-y-4 rounded-xl border border-slate-200/70 bg-slate-50/50 p-4 mb-5">
            <div className="border-b border-slate-200/70 pb-3 mb-3">
              <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Additional</p>
              <h3 className="text-base font-semibold text-slate-800">Description</h3>
            </div>
            
            <Form.Item
              name="description"
            >
              <Input.TextArea 
                rows={3}
                placeholder="Describe what's included in this package... (optional)"
                className="rounded-lg"
              />
            </Form.Item>
          </section>

          {/* Action buttons */}
          <div className="flex justify-end gap-3 pt-2 border-t border-slate-200">
            <Button 
              onClick={() => {
                setPackageModalVisible(false);
                setEditMode(false);
                setSelectedPackage(null);
                form.resetFields();
              }}
              className="rounded-lg"
            >
              Cancel
            </Button>
            <Button 
              type="primary" 
              htmlType="submit" 
              loading={loading}
              className="rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 border-0 shadow-md hover:shadow-lg transition-all"
            >
              {editMode ? 'Update Package' : 'Create Package'}
            </Button>
          </div>
        </Form>
      </Modal>
    </Modal>
  );
}

export default LessonPackageManager;

