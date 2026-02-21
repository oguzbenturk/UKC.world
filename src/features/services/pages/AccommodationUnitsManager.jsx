import { useState, useEffect, useCallback, useRef } from 'react';
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
  Grid,
  Image
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
  LoadingOutlined,
  MailOutlined,
  PhoneOutlined,
  WalletOutlined
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

// Helper function to construct image URLs correctly
// In development, use relative URLs to avoid CORS issues with Vite proxy
// In production, use absolute URLs for CDN/external hosting
const getImageUrl = (imageUrl) => {
  if (!imageUrl) return null;
  if (imageUrl.startsWith('http')) return imageUrl;
  // In development, use relative URL to go through Vite proxy
  // In production, images are served by same backend or CDN
  return imageUrl;
};

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

  // Ref to prevent duplicate uploads when beforeUpload is called per file
  const uploadInProgressRef = useRef(false);

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

  // Set form values when modal opens with editing unit
  useEffect(() => {
    if (modalVisible && editingUnit) {
      form.setFieldsValue({
        ...editingUnit,
        amenities: editingUnit.amenities || [],
      });
    }
  }, [modalVisible, editingUnit, form]);

  // Open modal for new unit
  const handleAddUnit = () => {
    setEditingUnit(null);
    setImageUrl(null);
    setImages([]);
    setModalVisible(true);
    // Reset form after modal opens
    setTimeout(() => {
      form.resetFields();
      form.setFieldsValue({ status: 'Available' });
    }, 0);
  };

  // Open modal for editing
  const handleEditUnit = (unit) => {
    setEditingUnit(unit);
    setImageUrl(unit.image_url || null);
    setImages(unit.images || []);
    setModalVisible(true);
    // Form values will be set by useEffect above
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
    // Prevent duplicate calls - beforeUpload fires for each file with full list
    if (uploadInProgressRef.current) return;
    if (!Array.isArray(fileList) || fileList.length === 0) return;

    uploadInProgressRef.current = true;
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
      message.success(`${response.data.count} images uploaded successfully!`);
    } catch (error) {
      console.error('Error uploading images:', error);
      message.error('Failed to upload images');
    } finally {
      setImageLoading(false);
      // Reset after a short delay to allow for next batch
      setTimeout(() => {
        uploadInProgressRef.current = false;
      }, 100);
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

  // Cancel booking (with wallet refund)
  const handleCancelBooking = async (id) => {
    try {
      const result = await accommodationApi.cancelBooking(id);
      if (result.payment_status === 'refunded') {
        message.success('Booking cancelled — wallet refund processed');
      } else {
        message.success('Booking cancelled');
      }
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
      <Card className="rounded-2xl border border-slate-200 shadow-sm mb-3" styles={{ body: { padding: 12 } }}>
        <div className="flex gap-3">
          {/* Image */}
          <div className="flex-shrink-0">
            {unit.image_url ? (
              <img
                src={getImageUrl(unit.image_url)}
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
    const paymentColors = { paid: 'green', refunded: 'blue', unpaid: 'default' };
    
    return (
      <Card className="rounded-2xl border border-slate-200 shadow-sm mb-3" styles={{ body: { padding: 12 } }}>
        <div className="flex items-start justify-between mb-2">
          <div>
            <div className="font-semibold text-slate-900">{booking.unit_name || unit?.name || 'Unknown Unit'}</div>
            <div className="text-xs text-slate-500">{booking.guests_count} guest(s)</div>
          </div>
          <div className="flex flex-col items-end gap-1">
            <Tag color={colors[booking.status] || 'default'} className="m-0">
              {booking.status}
            </Tag>
            {booking.payment_status && booking.payment_status !== 'unpaid' && (
              <Tag color={paymentColors[booking.payment_status] || 'default'} className="m-0" icon={<WalletOutlined />}>
                {booking.payment_status}
              </Tag>
            )}
          </div>
        </div>

        {/* Guest info */}
        {booking.guest_name && (
          <div className="bg-slate-50 rounded-lg p-2 mb-2 text-xs">
            <div className="font-medium text-slate-800 flex items-center gap-1">
              <UserOutlined className="text-slate-400" /> {booking.guest_name}
            </div>
            {booking.guest_email && (
              <div className="text-slate-500 flex items-center gap-1 mt-0.5">
                <MailOutlined className="text-slate-400" /> {booking.guest_email}
              </div>
            )}
            {booking.guest_phone && (
              <div className="text-slate-500 flex items-center gap-1 mt-0.5">
                <PhoneOutlined className="text-slate-400" /> {booking.guest_phone}
              </div>
            )}
          </div>
        )}
        
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

        {booking.notes && (
          <div className="text-xs text-slate-500 italic mb-2 truncate" title={booking.notes}>
            📝 {booking.notes}
          </div>
        )}
        
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
                <Popconfirm
                  title="Cancel this booking?"
                  description={booking.payment_status === 'paid' ? `€${parseFloat(booking.total_price).toFixed(2)} will be refunded to the guest's wallet.` : 'This action cannot be undone.'}
                  onConfirm={() => handleCancelBooking(booking.id)}
                  okText="Yes, Cancel"
                  okType="danger"
                >
                  <Button 
                    icon={<CloseCircleOutlined />} 
                    size="small" 
                    danger
                  />
                </Popconfirm>
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
                <Popconfirm
                  title="Cancel this booking?"
                  description={booking.payment_status === 'paid' ? `€${parseFloat(booking.total_price).toFixed(2)} will be refunded to the guest's wallet.` : 'This action cannot be undone.'}
                  onConfirm={() => handleCancelBooking(booking.id)}
                  okText="Yes, Cancel"
                  okType="danger"
                >
                  <Button 
                    icon={<CloseCircleOutlined />} 
                    size="small" 
                    danger
                  />
                </Popconfirm>
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
            src={getImageUrl(imageUrl)}
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
        return record.unit_name || units.find(u => u.id === record.unit_id)?.name || record.unit_id;
      },
    },
    {
      title: 'Guest',
      key: 'guest',
      render: (_, record) => (
        <div>
          <div className="font-medium">{record.guest_name || '—'}</div>
          {record.guest_email && (
            <div className="text-xs text-gray-500">{record.guest_email}</div>
          )}
          {record.guest_phone && (
            <div className="text-xs text-gray-400">{record.guest_phone}</div>
          )}
        </div>
      ),
    },
    {
      title: 'Dates',
      key: 'dates',
      render: (_, record) => {
        const checkIn = new Date(record.check_in_date);
        const checkOut = new Date(record.check_out_date);
        const nights = Math.ceil((checkOut - checkIn) / (1000 * 60 * 60 * 24));
        return (
          <div>
            <div>{checkIn.toLocaleDateString()}</div>
            <div className="text-xs text-gray-500">to {checkOut.toLocaleDateString()}</div>
            <div className="text-xs text-blue-500">{nights} night{nights !== 1 ? 's' : ''}</div>
          </div>
        );
      },
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
      title: 'Payment',
      key: 'payment_status',
      render: (_, record) => {
        const ps = record.payment_status || 'unpaid';
        const colors = { paid: 'green', refunded: 'blue', unpaid: 'default' };
        return <Tag icon={<WalletOutlined />} color={colors[ps] || 'default'}>{ps}</Tag>;
      },
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
      title: 'Notes',
      dataIndex: 'notes',
      key: 'notes',
      ellipsis: true,
      width: 120,
      render: (notes) => notes ? <span className="text-xs text-gray-500" title={notes}>{notes}</span> : '—',
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
              <Popconfirm
                title="Cancel this booking?"
                description={record.payment_status === 'paid' ? `€${parseFloat(record.total_price).toFixed(2)} will be refunded to the guest's wallet.` : 'This action cannot be undone.'}
                onConfirm={() => handleCancelBooking(record.id)}
                okText="Yes, Cancel"
                okType="danger"
              >
                <Tooltip title="Cancel">
                  <Button 
                    icon={<CloseCircleOutlined />} 
                    size="small" 
                    danger
                  />
                </Tooltip>
              </Popconfirm>
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
              <Popconfirm
                title="Cancel this booking?"
                description={record.payment_status === 'paid' ? `€${parseFloat(record.total_price).toFixed(2)} will be refunded to the guest's wallet.` : 'This action cannot be undone.'}
                onConfirm={() => handleCancelBooking(record.id)}
                okText="Yes, Cancel"
                okType="danger"
              >
                <Tooltip title="Cancel">
                  <Button 
                    icon={<CloseCircleOutlined />} 
                    size="small" 
                    danger
                  />
                </Tooltip>
              </Popconfirm>
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
          <Card className="rounded-xl md:rounded-2xl border border-slate-200 shadow-sm" styles={{ body: { padding: isMobile ? 12 : 20 } }}>
            <Statistic
              title={<span className="text-slate-600 text-xs md:text-sm">Total Units</span>}
              value={totalUnits}
              prefix={<HomeOutlined className="text-blue-600" />}
              valueStyle={{ color: '#1e293b', fontSize: isMobile ? 20 : 24 }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={12} md={6}>
          <Card className="rounded-xl md:rounded-2xl border border-slate-200 shadow-sm" styles={{ body: { padding: isMobile ? 12 : 20 } }}>
            <Statistic
              title={<span className="text-slate-600 text-xs md:text-sm">Available</span>}
              value={availableUnits}
              prefix={<CheckCircleOutlined className="text-green-600" />}
              valueStyle={{ color: '#10b981', fontSize: isMobile ? 20 : 24 }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={12} md={6}>
          <Card className="rounded-xl md:rounded-2xl border border-slate-200 shadow-sm" styles={{ body: { padding: isMobile ? 12 : 20 } }}>
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
          <Card className="rounded-xl md:rounded-2xl border border-slate-200 shadow-sm" styles={{ body: { padding: isMobile ? 12 : 20 } }}>
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
              onChange={handleImageUpload}
              customRequest={async ({ file, onSuccess, onError, onProgress }) => {
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
              }}
              accept="image/*"
            >
              {imageUrl ? (
                <div className="relative w-full h-full">
                  <img
                    src={getImageUrl(imageUrl)}
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
                    src={getImageUrl(img)}
                    alt={`Gallery ${index + 1}`}
                    className="w-full h-full object-cover"
                  />
                  <div
                    className="absolute top-1 right-1 bg-red-500 hover:bg-red-600 text-white rounded-full w-6 h-6 flex items-center justify-center cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity z-10"
                    onClick={() => removeImage(index)}
                  >
                    <DeleteOutlined className="text-xs" />
                  </div>
                </div>
              ))}
              {images.length < 10 && (
                <Upload
                  name="images"
                  listType="picture-card"
                  showUploadList={false}
                  beforeUpload={(file, fileList) => {
                    if (images.length + fileList.length > 10) {
                      message.error('Maximum 10 images allowed');
                      return false;
                    }
                    handleMultipleImagesUpload(fileList);
                    return false; // Prevent auto upload
                  }}
                  accept="image/*"
                  multiple
                  disabled={imageLoading}
                >
                  <div className="flex flex-col items-center justify-center">
                    {imageLoading ? <LoadingOutlined /> : <PlusOutlined />}
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
