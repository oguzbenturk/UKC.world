import { useState, useEffect, useCallback } from 'react';
import { 
  Button, 
  Table, 
  Modal, 
  Form, 
  Input, 
  InputNumber, 
  Select, 
  Card, 
  Row, 
  Col, 
  Statistic, 
  Tag, 
  Space, 
  Tooltip,
  Popconfirm,
  Empty,
  Spin,
  Tabs,
  Badge,
  App,
  Upload,
  Grid
} from 'antd';
import { 
  PlusOutlined, 
  EditOutlined, 
  DeleteOutlined, 
  HomeOutlined,
  DollarOutlined,
  UserOutlined,
  CalendarOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  ReloadOutlined,
  LoadingOutlined
} from '@ant-design/icons';
import accommodationApi from '@/shared/services/accommodationApi';
import apiClient from '@/shared/services/apiClient';

const { TextArea } = Input;
const { Option } = Select;
const { useBreakpoint } = Grid;

// Amenities options
const AMENITIES_OPTIONS = [
  { value: 'wifi', label: '📶 WiFi' },
  { value: 'air_conditioning', label: '❄️ Air Conditioning' },
  { value: 'tv', label: '📺 TV' },
  { value: 'kitchen', label: '🍳 Kitchen' },
  { value: 'minibar', label: '🍷 Minibar' },
  { value: 'safe', label: '🔐 Safe' },
  { value: 'balcony', label: '🌅 Balcony' },
  { value: 'sea_view', label: '🌊 Sea View' },
  { value: 'pool_access', label: '🏊 Pool Access' },
  { value: 'parking', label: '🅿️ Parking' },
  { value: 'breakfast', label: '🥐 Breakfast Included' },
  { value: 'pet_friendly', label: '🐕 Pet Friendly' },
];

// Status options
const STATUS_OPTIONS = [
  { value: 'Available', label: 'Available', color: 'green' },
  { value: 'Occupied', label: 'Occupied', color: 'blue' },
  { value: 'Maintenance', label: 'Maintenance', color: 'orange' },
  { value: 'Unavailable', label: 'Unavailable', color: 'red' },
];

function AccommodationUnitsManager() {
  const { message } = App.useApp();
  const screens = useBreakpoint();
  const isMobile = !screens.md;
  const [units, setUnits] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [bookingsLoading, setBookingsLoading] = useState(false);
  const [unitTypes, setUnitTypes] = useState([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingUnit, setEditingUnit] = useState(null);
  const [form] = Form.useForm();
  const [activeTab, setActiveTab] = useState('units');
  
  // Image upload state
  const [imageUrl, setImageUrl] = useState(null);
  const [images, setImages] = useState([]);
  const [imageLoading, setImageLoading] = useState(false);

  // Load units
  const loadUnits = useCallback(async () => {
    try {
      setLoading(true);
      const data = await accommodationApi.getUnits();
      setUnits(data);
    } catch {
      message.error('Failed to load accommodation units');
    } finally {
      setLoading(false);
    }
  }, []);

  // Load bookings
  const loadBookings = useCallback(async () => {
    try {
      setBookingsLoading(true);
      const data = await accommodationApi.getBookings();
      setBookings(data);
    } catch {
      message.error('Failed to load bookings');
    } finally {
      setBookingsLoading(false);
    }
  }, []);

  // Load unit types
  const loadUnitTypes = useCallback(async () => {
    try {
      const types = await accommodationApi.getUnitTypes();
      setUnitTypes(types);
    } catch {
      // Silently handle error - types will fallback to empty
    }
  }, []);

  useEffect(() => {
    loadUnits();
    loadUnitTypes();
  }, [loadUnits, loadUnitTypes]);

  useEffect(() => {
    if (activeTab === 'bookings') {
      loadBookings();
    }
  }, [activeTab, loadBookings]);

  // Open modal for new unit
  const handleAddUnit = () => {
    setEditingUnit(null);
    form.resetFields();
    form.setFieldsValue({ status: 'Available' });
    setImageUrl(null);
    setImages([]);
    setModalVisible(true);
  };

  // Open modal for editing
  const handleEditUnit = (unit) => {
    setEditingUnit(unit);
    form.setFieldsValue({
      ...unit,
      amenities: unit.amenities || [],
    });
    setImageUrl(unit.image_url || null);
    setImages(unit.images || []);
    setModalVisible(true);
  };

  // Handle main image upload
  const handleImageUpload = async (info) => {
    if (info.file.status === 'uploading') {
      setImageLoading(true);
      return;
    }
    
    if (info.file.status === 'done') {
      setImageLoading(false);
      setImageUrl(info.file.response.url);
      message.success('Image uploaded successfully!');
    } else if (info.file.status === 'error') {
      setImageLoading(false);
      message.error('Image upload failed');
    }
  };

  // Handle multiple images upload
  const handleMultipleImagesUpload = async (fileList) => {
    if (fileList.length === 0) return;
    
    setImageLoading(true);
    try {
      const formData = new FormData();
      fileList.forEach(file => {
        formData.append('images', file);
      });

      const response = await apiClient.post('/upload/images', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      const newImages = response.data.images.map(img => img.url);
      setImages(prevImages => [...prevImages, ...newImages]);
      setImageLoading(false);
      message.success(`${response.data.count} images uploaded successfully!`);
    } catch (error) {
      console.error('Error uploading images:', error);
      setImageLoading(false);
      message.error('Failed to upload images');
    }
  };

  // Remove an image from the gallery
  const removeImage = (indexToRemove) => {
    setImages(prevImages => prevImages.filter((_, index) => index !== indexToRemove));
    message.success('Image removed');
  };

  // Save unit (create or update)
  const handleSaveUnit = async (values) => {
    try {
      // Include image data in the payload
      const payload = {
        ...values,
        image_url: imageUrl,
        images: images
      };

      if (editingUnit) {
        await accommodationApi.updateUnit(editingUnit.id, payload);
        message.success('Accommodation unit updated');
      } else {
        await accommodationApi.createUnit(payload);
        message.success('Accommodation unit created');
      }
      setModalVisible(false);
      loadUnits();
    } catch (error) {
      message.error(error.response?.data?.error || 'Failed to save unit');
    }
  };

  // Delete unit
  const handleDeleteUnit = async (id) => {
    try {
      await accommodationApi.deleteUnit(id);
      message.success('Accommodation unit deleted');
      loadUnits();
    } catch (error) {
      message.error(error.response?.data?.error || 'Failed to delete unit');
    }
  };

  // Confirm booking
  const handleConfirmBooking = async (id) => {
    try {
      await accommodationApi.confirmBooking(id);
      message.success('Booking confirmed');
      loadBookings();
    } catch {
      message.error('Failed to confirm booking');
    }
  };

  // Cancel booking
  const handleCancelBooking = async (id) => {
    try {
      await accommodationApi.cancelBooking(id);
      message.success('Booking cancelled');
      loadBookings();
    } catch {
      message.error('Failed to cancel booking');
    }
  };

  // Complete booking
  const handleCompleteBooking = async (id) => {
    try {
      await accommodationApi.completeBooking(id);
      message.success('Booking completed');
      loadBookings();
    } catch {
      message.error('Failed to complete booking');
    }
  };

  // Statistics
  const totalUnits = units.length;
  const availableUnits = units.filter(u => u.status === 'Available').length;
  const totalCapacity = units.reduce((sum, u) => sum + (u.capacity || 0), 0);
  const avgPrice = units.length > 0 
    ? units.reduce((sum, u) => sum + parseFloat(u.price_per_night || 0), 0) / units.length 
    : 0;

  const pendingBookings = bookings.filter(b => b.status === 'pending').length;

  // Mobile Unit Card Component
  const UnitCard = ({ unit }) => {
    const statusOpt = STATUS_OPTIONS.find(s => s.value === unit.status);
    const amenities = Array.isArray(unit.amenities) ? unit.amenities : [];
    
    return (
      <Card className="rounded-2xl border border-slate-200 shadow-sm mb-3" bodyStyle={{ padding: 12 }}>
        <div className="flex gap-3">
          {/* Image */}
          <div className="flex-shrink-0">
            {unit.image_url ? (
              <img
                src={unit.image_url.startsWith('http') ? unit.image_url : `${import.meta.env.VITE_API_URL}${unit.image_url}`}
                alt="Unit"
                className="w-20 h-16 object-cover rounded-lg"
              />
            ) : (
              <div className="w-20 h-16 bg-gray-100 rounded-lg flex items-center justify-center">
                <HomeOutlined className="text-gray-400 text-xl" />
              </div>
            )}
          </div>
          
          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between mb-1">
              <div>
                <div className="font-semibold text-slate-900 truncate">{unit.name}</div>
                <div className="text-xs text-slate-500">{unit.type}</div>
              </div>
              <Tag color={statusOpt?.color || 'default'} className="m-0 text-xs">
                {unit.status}
              </Tag>
            </div>
            
            <div className="flex items-center gap-3 text-xs text-slate-600 mt-2">
              <span><UserOutlined /> {unit.capacity}</span>
              <span className="font-semibold text-green-600">€{parseFloat(unit.price_per_night).toFixed(0)}/night</span>
            </div>
            
            {amenities.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {amenities.slice(0, 3).map(a => {
                  const opt = AMENITIES_OPTIONS.find(o => o.value === a);
                  return <Tag key={a} className="text-xs m-0">{opt?.label?.split(' ')[0] || a}</Tag>;
                })}
                {amenities.length > 3 && <Tag className="text-xs m-0">+{amenities.length - 3}</Tag>}
              </div>
            )}
          </div>
        </div>
        
        {/* Actions */}
        <div className="flex justify-end gap-2 mt-3 pt-2 border-t border-slate-100">
          <Button icon={<EditOutlined />} size="small" onClick={() => handleEditUnit(unit)}>
            Edit
          </Button>
          <Popconfirm
            title="Delete this unit?"
            description="This action cannot be undone"
            onConfirm={() => handleDeleteUnit(unit.id)}
            okText="Delete"
            okType="danger"
          >
            <Button icon={<DeleteOutlined />} size="small" danger>
              Delete
            </Button>
          </Popconfirm>
        </div>
      </Card>
    );
  };

  // Mobile Booking Card Component
  const BookingCard = ({ booking }) => {
    const unit = units.find(u => u.id === booking.unit_id);
    const colors = { pending: 'orange', confirmed: 'blue', completed: 'green', cancelled: 'red' };
    
    return (
      <Card className="rounded-2xl border border-slate-200 shadow-sm mb-3" bodyStyle={{ padding: 12 }}>
        <div className="flex items-start justify-between mb-2">
          <div>
            <div className="font-semibold text-slate-900">{unit?.name || 'Unknown Unit'}</div>
            <div className="text-xs text-slate-500">{booking.guests_count} guest(s)</div>
          </div>
          <Tag color={colors[booking.status] || 'default'} className="m-0">
            {booking.status}
          </Tag>
        </div>
        
        <div className="grid grid-cols-2 gap-2 text-xs text-slate-600 mb-2">
          <div>
            <span className="text-slate-400">Check-in:</span>
            <br />
            {new Date(booking.check_in_date).toLocaleDateString()}
          </div>
          <div>
            <span className="text-slate-400">Check-out:</span>
            <br />
            {new Date(booking.check_out_date).toLocaleDateString()}
          </div>
        </div>
        
        <div className="flex items-center justify-between pt-2 border-t border-slate-100">
          <span className="font-semibold text-green-600">€{parseFloat(booking.total_price).toFixed(2)}</span>
          
          <Space size="small">
            {booking.status === 'pending' && (
              <>
                <Button 
                  icon={<CheckCircleOutlined />} 
                  size="small" 
                  type="primary"
                  onClick={() => handleConfirmBooking(booking.id)} 
                >
                  Confirm
                </Button>
                <Button 
                  icon={<CloseCircleOutlined />} 
                  size="small" 
                  danger
                  onClick={() => handleCancelBooking(booking.id)} 
                />
              </>
            )}
            {booking.status === 'confirmed' && (
              <>
                <Button 
                  icon={<CheckCircleOutlined />} 
                  size="small"
                  style={{ backgroundColor: '#52c41a', borderColor: '#52c41a', color: '#fff' }}
                  onClick={() => handleCompleteBooking(booking.id)} 
                >
                  Complete
                </Button>
                <Button 
                  icon={<CloseCircleOutlined />} 
                  size="small" 
                  danger
                  onClick={() => handleCancelBooking(booking.id)} 
                />
              </>
            )}
          </Space>
        </div>
      </Card>
    );
  };

  // Units table columns
  const unitColumns = [
    {
      title: 'Image',
      dataIndex: 'image_url',
      key: 'image_url',
      width: 80,
      render: (imageUrl) => (
        imageUrl ? (
          <img
            src={imageUrl.startsWith('http') ? imageUrl : `${import.meta.env.VITE_API_URL}${imageUrl}`}
            alt="Unit"
            className="w-16 h-12 object-cover rounded"
          />
        ) : (
          <div className="w-16 h-12 bg-gray-100 rounded flex items-center justify-center">
            <HomeOutlined className="text-gray-400" />
          </div>
        )
      ),
    },
    {
      title: 'Name',
      dataIndex: 'name',
      key: 'name',
      render: (text, record) => (
        <div>
          <div className="font-medium text-gray-900">{text}</div>
          <div className="text-xs text-gray-500">{record.type}</div>
        </div>
      ),
    },
    {
      title: 'Capacity',
      dataIndex: 'capacity',
      key: 'capacity',
      render: (capacity) => (
        <span><UserOutlined /> {capacity} guests</span>
      ),
    },
    {
      title: 'Price/Night',
      dataIndex: 'price_per_night',
      key: 'price_per_night',
      render: (price) => (
        <span className="font-semibold text-green-600">€{parseFloat(price).toFixed(2)}</span>
      ),
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      render: (status) => {
        const opt = STATUS_OPTIONS.find(s => s.value === status);
        return <Tag color={opt?.color || 'default'}>{status}</Tag>;
      },
    },
    {
      title: 'Amenities',
      dataIndex: 'amenities',
      key: 'amenities',
      render: (amenities) => {
        const items = Array.isArray(amenities) ? amenities : [];
        if (items.length === 0) return <span className="text-gray-400">-</span>;
        return (
          <div className="flex flex-wrap gap-1">
            {items.slice(0, 3).map(a => {
              const opt = AMENITIES_OPTIONS.find(o => o.value === a);
              return <Tag key={a} className="text-xs">{opt?.label || a}</Tag>;
            })}
            {items.length > 3 && <Tag className="text-xs">+{items.length - 3}</Tag>}
          </div>
        );
      },
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_, record) => (
        <Space>
          <Tooltip title="Edit">
            <Button icon={<EditOutlined />} size="small" onClick={() => handleEditUnit(record)} />
          </Tooltip>
          <Popconfirm
            title="Delete this unit?"
            description="This action cannot be undone"
            onConfirm={() => handleDeleteUnit(record.id)}
            okText="Delete"
            okType="danger"
          >
            <Tooltip title="Delete">
              <Button icon={<DeleteOutlined />} size="small" danger />
            </Tooltip>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  // Bookings table columns
  const bookingColumns = [
    {
      title: 'Unit',
      key: 'unit',
      render: (_, record) => {
        const unit = units.find(u => u.id === record.unit_id);
        return unit?.name || record.unit_id;
      },
    },
    {
      title: 'Dates',
      key: 'dates',
      render: (_, record) => (
        <div>
          <div>{new Date(record.check_in_date).toLocaleDateString()}</div>
          <div className="text-xs text-gray-500">to {new Date(record.check_out_date).toLocaleDateString()}</div>
        </div>
      ),
    },
    {
      title: 'Guests',
      dataIndex: 'guests_count',
      key: 'guests_count',
    },
    {
      title: 'Total',
      dataIndex: 'total_price',
      key: 'total_price',
      render: (price) => <span className="font-semibold">€{parseFloat(price).toFixed(2)}</span>,
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      render: (status) => {
        const colors = { pending: 'orange', confirmed: 'blue', completed: 'green', cancelled: 'red' };
        return <Tag color={colors[status] || 'default'}>{status}</Tag>;
      },
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_, record) => (
        <Space>
          {record.status === 'pending' && (
            <>
              <Tooltip title="Confirm">
                <Button 
                  icon={<CheckCircleOutlined />} 
                  size="small" 
                  type="primary"
                  onClick={() => handleConfirmBooking(record.id)} 
                />
              </Tooltip>
              <Tooltip title="Cancel">
                <Button 
                  icon={<CloseCircleOutlined />} 
                  size="small" 
                  danger
                  onClick={() => handleCancelBooking(record.id)} 
                />
              </Tooltip>
            </>
          )}
          {record.status === 'confirmed' && (
            <>
              <Tooltip title="Mark Complete">
                <Button 
                  icon={<CheckCircleOutlined />} 
                  size="small"
                  style={{ backgroundColor: '#52c41a', borderColor: '#52c41a', color: '#fff' }}
                  onClick={() => handleCompleteBooking(record.id)} 
                />
              </Tooltip>
              <Tooltip title="Cancel">
                <Button 
                  icon={<CloseCircleOutlined />} 
                  size="small" 
                  danger
                  onClick={() => handleCancelBooking(record.id)} 
                />
              </Tooltip>
            </>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div className="space-y-4 md:space-y-6 p-4 md:p-6 max-w-7xl mx-auto min-h-screen bg-slate-50">
      {/* Header */}
      <Card
        variant="borderless"
        className="relative overflow-hidden rounded-2xl md:rounded-3xl border border-slate-200 bg-white shadow-sm"
        styles={{ body: { padding: isMobile ? 16 : 32 } }}
      >
        <div className="pointer-events-none absolute -top-20 right-8 h-44 w-44 rounded-full bg-orange-100 hidden md:block" />
        <div className="pointer-events-none absolute -bottom-24 left-16 h-48 w-48 rounded-full bg-amber-50 hidden md:block" />
        <div className="relative space-y-3 md:space-y-4">
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-3">
            <div className="space-y-1 md:space-y-2 max-w-2xl">
              <h1 className="text-xl md:text-3xl font-bold text-slate-900 flex items-center gap-2 md:gap-3">
                <HomeOutlined className="text-orange-600" />
                Accommodation
              </h1>
              <p className="text-slate-600 text-sm md:text-base hidden sm:block">
                Manage rooms, suites, and accommodation bookings.
              </p>
            </div>
            <Button 
              type="primary" 
              icon={<PlusOutlined />}
              onClick={handleAddUnit}
              size={isMobile ? 'middle' : 'large'}
            >
              {isMobile ? 'Add Unit' : 'Add Room/Unit'}
            </Button>
          </div>
        </div>
      </Card>

      {/* Statistics */}
      <Row gutter={[12, 12]}>
        <Col xs={12} sm={12} md={6}>
          <Card className="rounded-xl md:rounded-2xl border border-slate-200 shadow-sm" bodyStyle={{ padding: isMobile ? 12 : 20 }}>
            <Statistic
              title={<span className="text-slate-600 text-xs md:text-sm">Total Units</span>}
              value={totalUnits}
              prefix={<HomeOutlined className="text-blue-600" />}
              valueStyle={{ color: '#1e293b', fontSize: isMobile ? 20 : 24 }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={12} md={6}>
          <Card className="rounded-xl md:rounded-2xl border border-slate-200 shadow-sm" bodyStyle={{ padding: isMobile ? 12 : 20 }}>
            <Statistic
              title={<span className="text-slate-600 text-xs md:text-sm">Available</span>}
              value={availableUnits}
              prefix={<CheckCircleOutlined className="text-green-600" />}
              valueStyle={{ color: '#10b981', fontSize: isMobile ? 20 : 24 }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={12} md={6}>
          <Card className="rounded-xl md:rounded-2xl border border-slate-200 shadow-sm" bodyStyle={{ padding: isMobile ? 12 : 20 }}>
            <Statistic
              title={<span className="text-slate-600 text-xs md:text-sm">Capacity</span>}
              value={totalCapacity}
              prefix={<UserOutlined className="text-purple-600" />}
              valueStyle={{ color: '#1e293b', fontSize: isMobile ? 20 : 24 }}
              suffix={isMobile ? '' : 'guests'}
            />
          </Card>
        </Col>
        <Col xs={12} sm={12} md={6}>
          <Card className="rounded-xl md:rounded-2xl border border-slate-200 shadow-sm" bodyStyle={{ padding: isMobile ? 12 : 20 }}>
            <Statistic
              title={<span className="text-slate-600 text-xs md:text-sm">Avg/Night</span>}
              value={avgPrice}
              prefix={<DollarOutlined className="text-green-600" />}
              valueStyle={{ color: '#1e293b', fontSize: isMobile ? 20 : 24 }}
              precision={0}
              suffix="€"
            />
          </Card>
        </Col>
      </Row>

      {/* Tabs: Units & Bookings */}
      <Card className="rounded-xl md:rounded-2xl border border-slate-200 shadow-sm">
        <Tabs 
          activeKey={activeTab} 
          onChange={setActiveTab}
          size={isMobile ? 'small' : 'middle'}
          items={[
            {
              key: 'units',
              label: (
                <span className="text-sm md:text-base">
                  <HomeOutlined /> Units ({totalUnits})
                </span>
              ),
              children: (
                <div className="space-y-3 md:space-y-4">
                  <div className="flex justify-end">
                    <Button icon={<ReloadOutlined />} size={isMobile ? 'small' : 'middle'} onClick={loadUnits} loading={loading}>
                      {!isMobile && 'Refresh'}
                    </Button>
                  </div>
                  {loading ? (
                    <div className="flex justify-center py-8 md:py-12">
                      <Spin size="large" />
                    </div>
                  ) : units.length === 0 ? (
                    <Empty 
                      description="No accommodation units yet"
                      image={Empty.PRESENTED_IMAGE_SIMPLE}
                    >
                      <Button type="primary" onClick={handleAddUnit}>Add Your First Unit</Button>
                    </Empty>
                  ) : isMobile ? (
                    // Mobile: Card View
                    <div>
                      <div className="text-xs text-slate-500 mb-2">{units.length} unit{units.length !== 1 ? 's' : ''}</div>
                      {units.map(unit => (
                        <UnitCard key={unit.id} unit={unit} />
                      ))}
                    </div>
                  ) : (
                    // Desktop: Table View
                    <Table 
                      dataSource={units} 
                      columns={unitColumns} 
                      rowKey="id"
                      pagination={{ pageSize: 10 }}
                      scroll={{ x: 800 }}
                    />
                  )}
                </div>
              ),
            },
            {
              key: 'bookings',
              label: (
                <span className="text-sm md:text-base">
                  <CalendarOutlined /> Bookings
                  {pendingBookings > 0 && (
                    <Badge count={pendingBookings} style={{ marginLeft: 8 }} />
                  )}
                </span>
              ),
              children: (
                <div className="space-y-3 md:space-y-4">
                  <div className="flex justify-end">
                    <Button icon={<ReloadOutlined />} size={isMobile ? 'small' : 'middle'} onClick={loadBookings} loading={bookingsLoading}>
                      {!isMobile && 'Refresh'}
                    </Button>
                  </div>
                  {bookingsLoading ? (
                    <div className="flex justify-center py-8 md:py-12">
                      <Spin size="large" />
                    </div>
                  ) : bookings.length === 0 ? (
                    <Empty 
                      description="No bookings yet"
                      image={Empty.PRESENTED_IMAGE_SIMPLE}
                    />
                  ) : isMobile ? (
                    // Mobile: Card View
                    <div>
                      <div className="text-xs text-slate-500 mb-2">{bookings.length} booking{bookings.length !== 1 ? 's' : ''}</div>
                      {bookings.map(booking => (
                        <BookingCard key={booking.id} booking={booking} />
                      ))}
                    </div>
                  ) : (
                    // Desktop: Table View
                    <Table 
                      dataSource={bookings} 
                      columns={bookingColumns} 
                      rowKey="id"
                      pagination={{ pageSize: 10 }}
                      scroll={{ x: 600 }}
                    />
                  )}
                </div>
              ),
            },
          ]}
        />
      </Card>

      {/* Add/Edit Unit Modal */}
      <Modal
        title={editingUnit ? 'Edit Accommodation Unit' : 'Add New Accommodation Unit'}
        open={modalVisible}
        onCancel={() => setModalVisible(false)}
        footer={null}
        width={isMobile ? '100%' : 700}
        style={isMobile ? { top: 20, margin: '0 10px' } : undefined}
        destroyOnHidden
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleSaveUnit}
          className="mt-4"
        >
          <Row gutter={[12, 0]}>
            <Col xs={24} sm={16}>
              <Form.Item
                name="name"
                label="Unit Name"
                rules={[{ required: true, message: 'Please enter unit name' }]}
              >
                <Input placeholder="e.g. Ocean View Suite 101" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={8}>
              <Form.Item
                name="type"
                label="Type"
                rules={[{ required: true, message: 'Please select type' }]}
              >
                <Select placeholder="Select type">
                  {unitTypes.map(type => (
                    <Option key={type} value={type}>{type}</Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={[12, 0]}>
            <Col xs={12} sm={8}>
              <Form.Item
                name="capacity"
                label={isMobile ? 'Capacity' : 'Capacity (guests)'}
                rules={[{ required: true, message: 'Required' }]}
              >
                <InputNumber min={1} max={20} style={{ width: '100%' }} placeholder="2" />
              </Form.Item>
            </Col>
            <Col xs={12} sm={8}>
              <Form.Item
                name="price_per_night"
                label={isMobile ? 'Price (€)' : 'Price per Night (€)'}
                rules={[{ required: true, message: 'Required' }]}
              >
                <InputNumber min={0} step={0.01} style={{ width: '100%' }} placeholder="99.00" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={8}>
              <Form.Item
                name="status"
                label="Status"
                rules={[{ required: true }]}
              >
                <Select placeholder="Select status">
                  {STATUS_OPTIONS.map(opt => (
                    <Option key={opt.value} value={opt.value}>
                      <Tag color={opt.color}>{opt.label}</Tag>
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
            <TextArea 
              rows={3} 
              placeholder="Describe this accommodation unit..."
            />
          </Form.Item>

          <Form.Item
            name="amenities"
            label="Amenities"
          >
            <Select
              mode="multiple"
              placeholder="Select amenities"
              style={{ width: '100%' }}
            >
              {AMENITIES_OPTIONS.map(opt => (
                <Option key={opt.value} value={opt.value}>{opt.label}</Option>
              ))}
            </Select>
          </Form.Item>

          {/* Main Image Upload */}
          <Form.Item label="Main Image">
            <Upload
              name="image"
              listType="picture-card"
              showUploadList={false}
              customRequest={handleImageUpload}
              accept="image/*"
            >
              {imageUrl ? (
                <div className="relative w-full h-full">
                  <img
                    src={imageUrl.startsWith('http') ? imageUrl : `${import.meta.env.VITE_API_URL}${imageUrl}`}
                    alt="Unit"
                    className="w-full h-full object-cover rounded"
                  />
                  <div className="absolute inset-0 bg-black bg-opacity-40 opacity-0 hover:opacity-100 flex items-center justify-center transition-opacity rounded">
                    <span className="text-white text-sm">Change</span>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center">
                  {imageLoading ? <LoadingOutlined /> : <PlusOutlined />}
                  <div className="mt-2 text-sm">Upload</div>
                </div>
              )}
            </Upload>
          </Form.Item>

          {/* Additional Images Gallery */}
          <Form.Item label="Gallery Images (up to 10)">
            <div className="flex flex-wrap gap-2">
              {images.map((img, index) => (
                <div key={index} className="relative w-24 h-24 border rounded overflow-hidden group">
                  <img
                    src={img.startsWith('http') ? img : `${import.meta.env.VITE_API_URL}${img}`}
                    alt={`Gallery ${index + 1}`}
                    className="w-full h-full object-cover"
                  />
                  <div 
                    className="absolute inset-0 bg-black bg-opacity-50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity cursor-pointer"
                    onClick={() => removeImage(index)}
                  >
                    <DeleteOutlined className="text-white text-lg" />
                  </div>
                </div>
              ))}
              {images.length < 10 && (
                <Upload
                  name="images"
                  listType="picture-card"
                  showUploadList={false}
                  customRequest={handleMultipleImagesUpload}
                  accept="image/*"
                  multiple
                >
                  <div className="flex flex-col items-center justify-center">
                    <PlusOutlined />
                    <div className="mt-2 text-xs">Add Images</div>
                  </div>
                </Upload>
              )}
            </div>
          </Form.Item>

          <div className="flex justify-end gap-2 mt-6">
            <Button onClick={() => setModalVisible(false)}>Cancel</Button>
            <Button type="primary" htmlType="submit" style={{ backgroundColor: '#fa8c16', borderColor: '#fa8c16' }}>
              {editingUnit ? 'Update Unit' : 'Create Unit'}
            </Button>
          </div>
        </Form>
      </Modal>
    </div>
  );
}

export default AccommodationUnitsManager;
