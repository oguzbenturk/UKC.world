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
  App,
  Divider,
  Alert
} from 'antd';
import { 
  PlusOutlined, 
  EditOutlined,
  DeleteOutlined,
  TableOutlined,
  AppstoreOutlined,
  CarOutlined,
  InfoCircleOutlined
} from '@ant-design/icons';
import { useCurrency } from '@/shared/contexts/CurrencyContext';
import { useData } from '@/shared/hooks/useData';
import MultiCurrencyPriceInput from '@/shared/components/ui/MultiCurrencyPriceInput';

const { Option } = Select;
const { useBreakpoint } = Grid;

function RentalPackageManager({ visible, onClose, rentalServices }) {
  return (
    <App>
      <RentalPackageManagerInner visible={visible} onClose={onClose} rentalServices={rentalServices} />
    </App>
  );
}

// eslint-disable-next-line complexity
function RentalPackageManagerInner({ visible, onClose, rentalServices }) {
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
  const [viewMode, setViewMode] = useState('table');
  
  const { userCurrency, formatCurrency } = useCurrency();

  // Get rental equipment types from available rental services
  const availableRentalTypes = rentalServices?.map(service => ({
    value: service.id,
    label: service.name,
    duration: service.duration || 24, // default to 24h (1 day) for rentals
    price: service.price,
    currency: service.currency,
    category: service.category,
  })) || [];

  // Load rental packages from API (filtered by rental category)
  function loadPackages() {
    if (!apiClient) return;
    (async () => {
      try {
        setLoading(true);
        // Fetch packages with rental category
        const response = await apiClient.get('/services/packages/available?category=rental');
        setPackages(response.data || []);
      } catch (error) {
        // Error loading rental packages - silent fail
        void error;
        if (error.response?.status === 401) {
          message.warning('Please log in to view packages');
        } else {
          message.error('Failed to load rental packages');
        }
        setPackages([]);
      } finally {
        setLoading(false);
      }
    })();
  }

  useEffect(() => {
    if (apiClient && visible) {
      loadPackages();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiClient, visible]);

  useEffect(() => {
    if (!screens.md) {
      setViewMode('cards');
    }
  }, [screens.md]);

  // Auto-calculate price when rental type or total days change
  const calculatePackagePrice = () => {
    if (!form) return null;
    
    try {
      const rentalType = form.getFieldValue('rentalType');
      const totalDays = form.getFieldValue('totalDays');
      
      if (rentalType && totalDays && isAutoCalculated) {
        const selectedService = rentalServices?.find(service => service.id === rentalType);
        if (selectedService?.price) {
          // For rentals, price is typically daily rate
          const dailyRate = selectedService.price;
          const calculatedPrice = dailyRate * totalDays;
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

  const updatePriceCalculationDisplay = () => {
    if (!form) {
      setPriceCalculationDisplay('💡 Price automatically calculated from daily rate × total days');
      return;
    }
    
    try {
      const rentalType = form.getFieldValue('rentalType');
      const totalDays = form.getFieldValue('totalDays');
      
      if (rentalType && totalDays) {
        const selectedService = rentalServices?.find(service => service.id === rentalType);
        if (selectedService?.price) {
          setPriceCalculationDisplay(
            `💡 ${formatCurrency(selectedService.price, selectedService.currency)}/day × ${totalDays} days = ${formatCurrency(selectedService.price * totalDays, selectedService.currency)}`
          );
          return;
        }
      }
      setPriceCalculationDisplay('💡 Price automatically calculated from daily rate × total days');
    } catch {
      setPriceCalculationDisplay('💡 Price automatically calculated from daily rate × total days');
    }
  };

  const handleRentalTypeChange = () => {
    if (isAutoCalculated) {
      calculatePackagePrice();
    }
  };

  const handleTotalDaysChange = () => {
    if (isAutoCalculated) {
      calculatePackagePrice();
    }
  };

  const handlePriceChange = (value) => {
    if (!form || !isAutoCalculated || value === null) return;

    try {
      const rentalType = form.getFieldValue('rentalType');
      const totalDays = form.getFieldValue('totalDays');

      if (rentalType && totalDays) {
        const selectedService = rentalServices?.find(service => service.id === rentalType);
        if (selectedService?.price) {
          const calculatedPrice = selectedService.price * totalDays;
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

  const handlePricesChange = (prices = []) => {
    const primaryPrice = Array.isArray(prices) && prices.length > 0 ? prices[0]?.price : null;
    if (typeof primaryPrice === 'number') {
      handlePriceChange(primaryPrice);
    }
  };

  const resetAutoCalculation = () => {
    setIsAutoCalculated(true);
    setManualPriceOverride(false);
    calculatePackagePrice();
  };

  const buildPackageData = (values) => {
    const selectedRentalService = rentalServices.find(service => service.id === values.rentalType);
    // For rentals, sessions = days, and hours = days * 24
    const totalHours = (values.totalDays || 1) * 24;
    
    const prices = values.prices || [];
    const primaryPrice = prices.length > 0 ? prices[0].price : (parseFloat(values.price) || 0);
    const primaryCurrency = prices.length > 0 ? prices[0].currencyCode : (values.currency || userCurrency || 'EUR');
    
    return {
      name: values.name,
      price: primaryPrice,
      currency: primaryCurrency,
      prices: prices.filter(p => p.price != null && p.price > 0),
      sessionsCount: values.totalDays || 1,
      totalHours: totalHours,
      lessonType: values.rentalType,
      lessonServiceName: selectedRentalService?.name,
      description: values.description || '',
      // Mark as rental package
      disciplineTag: 'rental',
      lessonCategoryTag: 'rental',
      levelTag: null,
    };
  };

  const savePackage = async (packageData) => {
    if (editMode && selectedPackage) {
      const response = await apiClient.put(`/services/packages/${selectedPackage.id}`, packageData);
      const updatedPackage = { ...response.data };
      setPackages(prev => prev.map(pkg => (pkg.id === selectedPackage.id ? updatedPackage : pkg)));
      message.success('Rental package updated successfully!');
    } else {
      const response = await apiClient.post('/services/packages', packageData);
      const newPackage = { ...response.data };
      setPackages(prev => [...prev, newPackage]);
      message.success('Rental package created successfully!');
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
      // Reload packages to ensure the list is up to date
      loadPackages();
    } catch (error) {
      // Error saving rental package
      void error;
      const status = error.response?.status;
      if (status === 401) {
        message.error('Authentication required. Please log in.');
      } else if (status === 403) {
        message.error('You do not have permission to manage packages.');
      } else {
        message.error(editMode ? 'Failed to update rental package' : 'Failed to create rental package');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleEditPackage = (pkg) => {
    setSelectedPackage(pkg);
    setEditMode(true);
    setPackageModalVisible(true);
    setIsAutoCalculated(false);
    setManualPriceOverride(false);
    setPriceCalculationDisplay('⚠️ Editing existing package - price calculation disabled');
    
    const initialPrices = pkg.prices && pkg.prices.length > 0 
      ? pkg.prices 
      : [{ currencyCode: pkg.currency || 'EUR', price: pkg.price }];
    
    // Find the rental service ID by matching the name
    const matchedService = rentalServices?.find(
      service => service.name === pkg.lessonServiceName
    );
    const rentalTypeId = matchedService?.id || pkg.lessonType;
    
    // Convert totalHours back to days (rental duration)
    const totalDays = pkg.totalHours ? Math.round(pkg.totalHours / 24) : pkg.sessionsCount || 1;
    
    form.setFieldsValue({
      name: pkg.name,
      rentalType: rentalTypeId,
      totalDays: totalDays,
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
      message.success('Rental package deleted successfully!');
    } catch (error) {
      // Error deleting rental package
      void error;
      
      if (error.response?.status === 400 && error.response?.data?.linkedServices) {
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
              <p>Would you like to force delete this package?</p>
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
        setPackages(prev => prev.filter(pkg => pkg.id !== packageId));
      } else {
        message.error('Failed to delete rental package');
      }
    }
  };

  const handleForceDeletePackage = async (packageId) => {
    if (!apiClient) {
      message.error('API client not available');
      return;
    }
    
    try {
      await apiClient.delete(`/services/packages/${packageId}/force`);
      setPackages(prev => prev.filter(pkg => pkg.id !== packageId));
      message.success('Rental package force deleted successfully!');
    } catch (error) {
      // Error force deleting rental package
      void error;
      if (error.response?.status === 401) {
        message.error('Authentication required. Please log in.');
      } else if (error.response?.status === 403) {
        message.error('You do not have permission to force delete packages.');
      } else {
        message.error('Failed to force delete rental package');
      }
    }
  };

  // Table columns for rental packages
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
      title: 'Equipment Type',
      dataIndex: 'lessonServiceName',
      key: 'lessonServiceName',
      render: (lessonServiceName) => {
        const displayName = lessonServiceName || 'Unknown Equipment';
        return (
          <Tag color="orange">
            {displayName}
          </Tag>
        );
      }
    },
    {
      title: 'Duration',
      dataIndex: 'totalHours',
      key: 'totalHours',
      render: (hours, record) => {
        const days = hours ? Math.round(hours / 24) : record.sessionsCount || 1;
        return (
          <div className="text-center">
            <div className="font-semibold">{days} day{days > 1 ? 's' : ''}</div>
          </div>
        );
      },
    },
    {
      title: 'Price',
      dataIndex: 'price',
      key: 'price',
      render: (price, record) => {
        const prices = record.prices && record.prices.length > 0 
          ? record.prices 
          : [{ currencyCode: record.currency, price }];
        
        const days = record.totalHours ? Math.round(record.totalHours / 24) : record.sessionsCount || 1;
        const pricePerDay = days > 0 ? price / days : price;
        
        return (
          <div className="text-right">
            {prices.map((p) => (
              <div key={`${p.currencyCode}-${p.price}`} className={p === prices[0] ? 'font-semibold' : 'text-sm text-gray-500'}>
                {formatCurrency(p.price, p.currencyCode)}
              </div>
            ))}
            <div className="text-xs text-gray-400 mt-1">
              {formatCurrency(pricePerDay, record.currency)}/day
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
          {(status || 'active').toUpperCase()}
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
        {/* Header */}
        <div className="bg-gradient-to-r from-orange-500 to-amber-500 px-6 py-5 -mx-6 -mt-5 mb-4 rounded-t-lg">
          <h2 className="text-xl font-semibold text-white flex items-center gap-2">
            🏄 Rental Package Manager
          </h2>
          <p className="text-orange-100 text-sm mt-1">
            Create and manage rental equipment packages for your customers
          </p>
        </div>

        {/* Actions Row */}
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
            className="bg-orange-500 hover:bg-orange-600 border-orange-500"
            onClick={() => {
              setEditMode(false);
              setSelectedPackage(null);
              setIsAutoCalculated(true);
              setManualPriceOverride(false);
              setPriceCalculationDisplay('💡 Price automatically calculated from daily rate × total days');
              form.resetFields();
              form.setFieldsValue({
                currency: 'EUR',
                totalDays: 1
              });
              setPackageModalVisible(true);
            }}
          >
            Create Rental Package
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
              locale={{ emptyText: 'No rental packages found. Create your first rental package!' }}
            />
          ) : (
            <div>
              {(!packages || packages.length === 0) ? (
                <div className="text-center text-gray-500 py-8">No rental packages found. Create your first rental package!</div>
              ) : (
                <Row gutter={[16, 16]}>
                  {packages.map((pkg) => {
                    const days = pkg.totalHours ? Math.round(pkg.totalHours / 24) : pkg.sessionsCount || 1;
                    const perDay = days > 0 ? (pkg.price || 0) / days : pkg.price;
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
                                <Tag color="orange" className="m-0">
                                  {pkg.lessonServiceName || 'Unknown Equipment'}
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
                              <div className="text-xs text-gray-500">Duration</div>
                              <div className="font-semibold">{days} day{days > 1 ? 's' : ''}</div>
                            </div>
                            <div className="text-right">
                              <div className="text-xs text-gray-500">Prices</div>
                              {(pkg.prices && pkg.prices.length > 0 
                                ? pkg.prices 
                                : [{ currencyCode: pkg.currency, price: pkg.price }]
                              ).map((p) => (
                                <div key={`${p.currencyCode}-${p.price}`} className={p === (pkg.prices && pkg.prices.length > 0 ? pkg.prices : [{ currencyCode: pkg.currency, price: pkg.price }])[0] ? 'font-semibold' : 'text-xs text-gray-500'}>
                                  {formatCurrency(p.price, p.currencyCode)}
                                </div>
                              ))}
                              <div className="text-xs text-gray-400 mt-1">{perDay != null ? `${formatCurrency(perDay, pkg.currency)}/day` : '-'}</div>
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
        width={800}
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
          onFinish={handleCreatePackage}
          requiredMark={false}
          className="p-6 space-y-1 package-creator-form"
          style={{ maxHeight: 'calc(80vh - 80px)', overflowY: 'auto', overflowX: 'hidden' }}
        >
          <Row gutter={16}>
            <Col xs={24} md={14}>
              <Form.Item
                name="name"
                label="Package Name"
                rules={[{ required: true, message: 'Please enter package name' }]}
              >
                <Input placeholder="e.g., 7-Day Kite Rental Bundle" className="rounded-lg" />
              </Form.Item>
            </Col>
            <Col xs={24} md={10}>
              <Form.Item label="Package Type">
                <Input value="Rental Package" disabled />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item
            name="description"
            label="Description"
          >
            <Input.TextArea
              rows={2}
              placeholder="Describe what's included in this package"
              className="rounded-lg"
            />
          </Form.Item>

          <Divider orientation="left"><CarOutlined /> Rental Details</Divider>

          {availableRentalTypes.length === 0 ? (
            <Alert
              type="warning"
              showIcon
              icon={<InfoCircleOutlined />}
              message="No rental services found"
              description="Create rental services first in Services → Rentals"
              style={{ marginBottom: 16 }}
            />
          ) : (
            <Row gutter={16}>
              <Col xs={24} md={16}>
                <Form.Item
                  name="rentalType"
                  label="Rental Service"
                  rules={[{ required: true, message: 'Please select equipment type' }]}
                  tooltip="This links the package to a specific rental equipment"
                >
                  <Select
                    placeholder="Select equipment type"
                    onChange={handleRentalTypeChange}
                    className="rounded-lg"
                  >
                    {availableRentalTypes.map(type => (
                      <Option key={type.value} value={type.value}>
                        <div className="flex justify-between">
                          <span>{type.label}</span>
                          <span className="text-gray-500 ml-2">
                            {formatCurrency(type.price, type.currency)}/day
                          </span>
                        </div>
                      </Option>
                    ))}
                  </Select>
                </Form.Item>
              </Col>
              <Col xs={24} md={8}>
                <Form.Item
                  name="totalDays"
                  label="Rental Days"
                  rules={[{ required: true, message: 'Please enter total days' }]}
                >
                  <InputNumber
                    min={1}
                    max={90}
                    placeholder="e.g., 7"
                    style={{ width: '100%' }}
                    addonAfter="days"
                    onChange={handleTotalDaysChange}
                    className="rounded-lg"
                  />
                </Form.Item>
              </Col>
            </Row>
          )}

          <Divider />

          <div className="mb-3">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Package Price *</span>
              {isAutoCalculated && (
                <Tooltip title="Primary price is automatically calculated based on daily rate × total days">
                  <Tag color="blue" size="small">Auto</Tag>
                </Tooltip>
              )}
              {manualPriceOverride && (
                <Tooltip title="Price has been manually overridden">
                  <Tag color="orange" size="small">Manual</Tag>
                </Tooltip>
              )}
            </div>
            <MultiCurrencyPriceInput
              form={form}
              name="prices"
              label="Multi-Currency Pricing"
              primaryCurrencyName="currency"
              primaryPriceName="price"
              required={true}
              initialPrices={editMode && selectedPackage?.prices ? selectedPackage.prices : undefined}
              compact={true}
              onChange={handlePricesChange}
            />
          </div>

          {(manualPriceOverride || isAutoCalculated) && (
            <div className="rounded-lg bg-white border border-slate-200 p-3 mt-2 mb-3 flex items-center justify-between">
              {manualPriceOverride ? (
                <span className="text-orange-600 text-sm flex items-center gap-2">
                  ⚠️ Price manually overridden. Auto-calculation is disabled.
                </span>
              ) : (
                <span className="text-blue-600 text-sm flex items-center gap-2">
                  {priceCalculationDisplay}
                </span>
              )}
              {manualPriceOverride && (
                <Button type="link" size="small" onClick={resetAutoCalculation}>
                  Reset to auto
                </Button>
              )}
            </div>
          )}

          <Form.Item name="price" hidden>
            <InputNumber />
          </Form.Item>

          <Form.Item
            name="currency"
            initialValue="EUR"
            style={{ display: 'none' }}
          >
            <Input />
          </Form.Item>

          <div className="flex justify-end gap-3 pt-2 border-t border-slate-200">
            <Button
              onClick={() => {
                setPackageModalVisible(false);
                setEditMode(false);
                setSelectedPackage(null);
                form.resetFields();
              }}
              className="rounded-lg !px-5"
            >
              Cancel
            </Button>
            <Button
              type="primary"
              htmlType="submit"
              loading={loading}
              className="rounded-lg bg-gradient-to-r from-violet-600 to-indigo-600 border-0 shadow-md hover:shadow-lg transition-all"
            >
              {editMode ? 'Update Package' : 'Create Package'}
            </Button>
          </div>
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
    </Modal>
  );
}

export default RentalPackageManager;
