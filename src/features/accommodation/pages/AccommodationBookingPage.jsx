import { useState, useEffect, useCallback } from 'react';
import { 
  Card, 
  Row, 
  Col, 
  Button, 
  Modal, 
  Form, 
  DatePicker, 
  InputNumber, 
  Input,
  Empty, 
  Spin, 
  Tag, 
  message,
  Divider,
  Badge,
  Tabs,
  Alert,
  Select
} from 'antd';
import { 
  HomeOutlined, 
  CalendarOutlined, 
  UserOutlined,
  WifiOutlined,
  CarOutlined,
  CoffeeOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  CloseCircleOutlined
} from '@ant-design/icons';
import dayjs from 'dayjs';
import accommodationApi from '@/shared/services/accommodationApi';
import { usePageSEO } from '@/shared/utils/seo';
import { useCurrency } from '@/shared/contexts/CurrencyContext';

const { RangePicker } = DatePicker;
const { TextArea } = Input;

// Map amenities to icons
const AMENITY_ICONS = {
  wifi: <WifiOutlined />,
  parking: <CarOutlined />,
  breakfast: <CoffeeOutlined />,
  air_conditioning: '❄️',
  tv: '📺',
  kitchen: '🍳',
  minibar: '🍷',
  safe: '🔐',
  balcony: '🌅',
  sea_view: '🌊',
  pool_access: '🏊',
  pet_friendly: '🐕',
};

// Amenity labels
const AMENITY_LABELS = {
  wifi: 'WiFi',
  parking: 'Parking',
  breakfast: 'Breakfast',
  air_conditioning: 'A/C',
  tv: 'TV',
  kitchen: 'Kitchen',
  minibar: 'Minibar',
  safe: 'Safe',
  balcony: 'Balcony',
  sea_view: 'Sea View',
  pool_access: 'Pool',
  pet_friendly: 'Pet Friendly',
};

function AccommodationBookingPage() {
  usePageSEO({
    title: 'Book Accommodation',
    description: 'Browse and book available accommodation',
  });

  const [units, setUnits] = useState([]);
  const [myBookings, setMyBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [bookingsLoading, setBookingsLoading] = useState(false);
  const [selectedUnit, setSelectedUnit] = useState(null);
  const [bookingModalVisible, setBookingModalVisible] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState('browse');
  const [form] = Form.useForm();
  const [dateRange, setDateRange] = useState(null);
  const [calculatedPrice, setCalculatedPrice] = useState(0);
  const { userCurrency, convertCurrency, formatCurrency, getSupportedCurrencies } = useCurrency();
  const [selectedCurrency, setSelectedCurrency] = useState(userCurrency);

  // Keep the local selection in sync with the user's saved preference
  useEffect(() => {
    setSelectedCurrency(userCurrency);
    form.setFieldsValue({ currency: userCurrency });
  }, [userCurrency, form]);

  // Load available units
  const loadUnits = useCallback(async () => {
    try {
      setLoading(true);
      const data = await accommodationApi.getUnits({ status: 'Available' });
      setUnits(data);
    } catch {
      message.error('Failed to load accommodations');
    } finally {
      setLoading(false);
    }
  }, []);

  // Load my bookings
  const loadMyBookings = useCallback(async () => {
    try {
      setBookingsLoading(true);
      const data = await accommodationApi.getMyBookings();
      setMyBookings(data);
    } catch {
      message.error('Failed to load your bookings');
    } finally {
      setBookingsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadUnits();
  }, [loadUnits]);

  useEffect(() => {
    if (activeTab === 'my-bookings') {
      loadMyBookings();
    }
  }, [activeTab, loadMyBookings]);

  // Calculate price when dates change
  useEffect(() => {
    if (selectedUnit && dateRange && dateRange[0] && dateRange[1]) {
      const nights = dateRange[1].diff(dateRange[0], 'day');
      const baseCurrency = selectedUnit.currency || 'EUR';
      const perNight = convertCurrency(
        parseFloat(selectedUnit.price_per_night || 0),
        baseCurrency,
        selectedCurrency
      );
      const price = nights * perNight;
      setCalculatedPrice(price);
    } else {
      setCalculatedPrice(0);
    }
  }, [selectedUnit, dateRange, convertCurrency, selectedCurrency]);

  // Open booking modal
  const handleBookUnit = (unit) => {
    setSelectedUnit(unit);
    form.resetFields();
    form.setFieldsValue({ guests_count: 1 });
    setDateRange(null);
    setCalculatedPrice(0);
    setSelectedCurrency(userCurrency);
    form.setFieldsValue({ currency: userCurrency });
    setBookingModalVisible(true);
  };

  // Handle date change
  const handleDateChange = (dates) => {
    setDateRange(dates);
    form.setFieldsValue({ dates });
  };

  // Submit booking
  const handleSubmitBooking = async (values) => {
    if (!selectedUnit) return;
    if (!dateRange || !dateRange[0] || !dateRange[1]) {
      message.error('Please select check-in and check-out dates');
      return;
    }

    try {
      setSubmitting(true);
      await accommodationApi.createBooking({
        unit_id: selectedUnit.id,
        check_in_date: dateRange[0].format('YYYY-MM-DD'),
        check_out_date: dateRange[1].format('YYYY-MM-DD'),
        guests_count: values.guests_count,
        notes: values.notes,
      });
      message.success('Booking request submitted! You will be notified once confirmed.');
      setBookingModalVisible(false);
      loadUnits(); // Refresh availability
    } catch (error) {
      message.error(error.response?.data?.error || 'Failed to submit booking');
    } finally {
      setSubmitting(false);
    }
  };

  // Cancel my booking
  const handleCancelBooking = async (bookingId) => {
    try {
      await accommodationApi.cancelBooking(bookingId);
      message.success('Booking cancelled');
      loadMyBookings();
    } catch {
      message.error('Failed to cancel booking');
    }
  };

  // Disable past dates
  const disabledDate = (current) => {
    return current && current < dayjs().startOf('day');
  };

  // Render unit card
  const renderUnitCard = (unit) => {
    const amenities = Array.isArray(unit.amenities) ? unit.amenities : [];
    const baseCurrency = unit.currency || 'EUR';
    const displayPrice = formatCurrency(
      convertCurrency(unit.price_per_night, baseCurrency, userCurrency),
      userCurrency
    );
    
    // Get the main image URL
    const mainImage = unit.image_url 
      ? (unit.image_url.startsWith('http') ? unit.image_url : `${import.meta.env.VITE_API_URL}${unit.image_url}`)
      : null;
    
    return (
      <Col xs={24} sm={12} lg={8} key={unit.id}>
        <Card 
          className="h-full hover:shadow-xl transition-all duration-300 rounded-xl border-gray-200"
          cover={
            mainImage ? (
              <div className="h-52 overflow-hidden rounded-t-xl">
                <img 
                  src={mainImage}
                  alt={unit.name}
                  className="w-full h-full object-cover hover:scale-105 transition-transform duration-300"
                />
              </div>
            ) : (
              <div className="h-52 bg-gradient-to-br from-orange-400 to-orange-600 flex items-center justify-center rounded-t-xl">
                <HomeOutlined className="text-7xl text-white opacity-80" />
              </div>
            )
          }
        >
          <div className="flex justify-between items-start mb-3">
            <h3 className="text-lg font-semibold text-gray-800">{unit.name}</h3>
            <Tag color="success" className="rounded-full">Available</Tag>
          </div>
          
          <div className="space-y-3 mb-4">
            <div className="flex items-center gap-3 text-gray-600">
              <Badge color="orange" text={unit.type} />
              <div className="flex items-center gap-1">
                <UserOutlined /> 
                <span className="text-sm">{unit.capacity} guests</span>
              </div>
            </div>
            
            {unit.description && (
              <p className="text-gray-500 text-sm line-clamp-2 leading-relaxed">
                {unit.description}
              </p>
            )}
            
            {amenities.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {amenities.slice(0, 4).map(a => (
                  <Tag key={a} className="text-xs rounded-md border-gray-200">
                    {AMENITY_ICONS[a]} {AMENITY_LABELS[a] || a}
                  </Tag>
                ))}
                {amenities.length > 4 && (
                  <Tag className="text-xs rounded-md bg-gray-50">
                    +{amenities.length - 4} more
                  </Tag>
                )}
              </div>
            )}

            <div className="flex items-baseline justify-between pt-2 border-t border-gray-100">
              <div>
                <span className="text-2xl font-bold text-orange-600">
                  {displayPrice}
                </span>
                <span className="text-sm text-gray-500 ml-1">/ night</span>
              </div>
            </div>
          </div>

          <Button 
            type="primary" 
            icon={<CalendarOutlined />}
            onClick={() => handleBookUnit(unit)}
            className="w-full h-10 bg-orange-500 hover:bg-orange-600 border-none rounded-lg font-medium"
            size="large"
          >
            Book Now
          </Button>
        </Card>
      </Col>
    );
  };

  // Render my booking card
  const renderMyBooking = (booking) => {
    const statusConfig = {
      pending: { color: 'orange', icon: <ClockCircleOutlined />, text: 'Pending Confirmation' },
      confirmed: { color: 'blue', icon: <CheckCircleOutlined />, text: 'Confirmed' },
      completed: { color: 'green', icon: <CheckCircleOutlined />, text: 'Completed' },
      cancelled: { color: 'red', icon: <CloseCircleOutlined />, text: 'Cancelled' },
    };
    
    const status = statusConfig[booking.status] || statusConfig.pending;
    const checkIn = dayjs(booking.check_in_date);
    const checkOut = dayjs(booking.check_out_date);
    const nights = checkOut.diff(checkIn, 'day');
    
    return (
      <Card 
        key={booking.id} 
        className="rounded-xl border-gray-200 hover:shadow-md transition-shadow"
      >
        <Row gutter={[16, 16]}>
          <Col xs={24} md={16}>
            <div className="flex items-start gap-4">
              <div className="w-16 h-16 bg-gradient-to-br from-orange-400 to-orange-600 rounded-lg flex items-center justify-center flex-shrink-0">
                <HomeOutlined className="text-2xl text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-lg font-semibold text-gray-800 mb-2">
                  {booking.unit?.name || `Unit #${booking.unit_id}`}
                </h3>
                <div className="flex flex-wrap items-center gap-2 text-gray-600 text-sm mb-2">
                  <CalendarOutlined />
                  <span className="font-medium">{checkIn.format('MMM D, YYYY')}</span>
                  <span className="text-gray-400">→</span>
                  <span className="font-medium">{checkOut.format('MMM D, YYYY')}</span>
                  <span className="text-gray-400">({nights} night{nights !== 1 ? 's' : ''})</span>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <span className="text-sm text-gray-600">
                    <UserOutlined /> {booking.guests_count} guest{booking.guests_count !== 1 ? 's' : ''}
                  </span>
                  <Tag color={status.color} className="rounded-full">
                    {status.icon} {status.text}
                  </Tag>
                </div>
                {booking.notes && (
                  <p className="text-gray-500 text-sm mt-3 p-3 bg-gray-50 rounded-lg">
                    {booking.notes}
                  </p>
                )}
              </div>
            </div>
          </Col>
          <Col xs={24} md={8} className="md:text-right flex flex-col justify-between">
            <div>
              <div className="text-3xl font-bold text-orange-600">
                ₺{parseFloat(booking.total_price).toFixed(2)}
              </div>
              <div className="text-gray-500 text-sm">Total Price</div>
            </div>
            {(booking.status === 'pending' || booking.status === 'confirmed') && (
              <Button 
                danger 
                size="large"
                className="mt-4 rounded-lg"
                onClick={() => handleCancelBooking(booking.id)}
              >
                Cancel Booking
              </Button>
            )}
          </Col>
        </Row>
      </Card>
    );
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-7xl px-4 py-6">
        {/* Tabs */}
        <Tabs
          activeKey={activeTab}
          onChange={setActiveTab}
          size="large"
          items={[
          {
            key: 'browse',
            label: (
              <span className="flex items-center gap-2">
                <HomeOutlined /> Available Rooms
              </span>
            ),
            children: (
              <div className="py-4">
                {loading ? (
                  <div className="flex justify-center py-20">
                    <Spin size="large" />
                  </div>
                ) : units.length === 0 ? (
                  <Card className="rounded-xl shadow-sm">
                    <Empty 
                      description="No accommodations available at the moment"
                      image={Empty.PRESENTED_IMAGE_SIMPLE}
                      className="py-12"
                    />
                  </Card>
                ) : (
                  <Row gutter={[16, 16]}>
                    {units.map(renderUnitCard)}
                  </Row>
                )}
              </div>
            ),
          },
          {
            key: 'my-bookings',
            label: (
              <span className="flex items-center gap-2">
                <CalendarOutlined /> My Bookings
                {myBookings.filter(b => b.status === 'pending').length > 0 && (
                  <Badge 
                    count={myBookings.filter(b => b.status === 'pending').length} 
                    style={{ marginLeft: 8 }}
                  />
                )}
              </span>
            ),
            children: (
              <div className="py-4">
                {bookingsLoading ? (
                  <div className="flex justify-center py-20">
                    <Spin size="large" />
                  </div>
                ) : myBookings.length === 0 ? (
                  <Card className="rounded-xl shadow-sm">
                    <Empty 
                      description="You haven't made any bookings yet"
                      image={Empty.PRESENTED_IMAGE_SIMPLE}
                      className="py-12"
                    >
                      <Button type="primary" onClick={() => setActiveTab('browse')}>
                        Browse Accommodations
                      </Button>
                    </Empty>
                  </Card>
                ) : (
                  <div className="space-y-4">
                    {myBookings.map(renderMyBooking)}
                  </div>
                )}
              </div>
            ),
          },
        ]}
      />

      {/* Booking Modal */}
      <Modal
        title={
          <div className="flex items-center gap-2">
            <CalendarOutlined className="text-orange-500" />
            Book: {selectedUnit?.name}
          </div>
        }
        open={bookingModalVisible}
        onCancel={() => setBookingModalVisible(false)}
        footer={null}
        width={500}
        destroyOnClose
      >
        {selectedUnit && (
          <Form
            form={form}
            layout="vertical"
            onFinish={handleSubmitBooking}
            className="mt-4"
          >
            {/* Unit Images */}
            {(selectedUnit.image_url || (selectedUnit.images && selectedUnit.images.length > 0)) && (
              <div className="mb-4">
                {/* Main Image */}
                {selectedUnit.image_url && (
                  <div className="rounded-lg overflow-hidden mb-2">
                    <img 
                      src={selectedUnit.image_url.startsWith('http') 
                        ? selectedUnit.image_url 
                        : `${import.meta.env.VITE_API_URL}${selectedUnit.image_url}`}
                      alt={selectedUnit.name}
                      className="w-full h-48 object-cover"
                    />
                  </div>
                )}
                {/* Gallery */}
                {selectedUnit.images && selectedUnit.images.length > 0 && (
                  <div className="flex gap-2 overflow-x-auto pb-2">
                    {selectedUnit.images.map((img, idx) => (
                      <img 
                        key={idx}
                        src={img.startsWith('http') ? img : `${import.meta.env.VITE_API_URL}${img}`}
                        alt={`${selectedUnit.name} ${idx + 1}`}
                        className="w-20 h-16 object-cover rounded flex-shrink-0 cursor-pointer hover:opacity-80"
                      />
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Unit Summary */}
            <div className="bg-gray-50 rounded-lg p-4 mb-6">
              <div className="flex justify-between items-start">
                <div>
                  <h4 className="font-semibold text-gray-800">{selectedUnit.name}</h4>
                  <p className="text-sm text-gray-500">{selectedUnit.type} • Up to {selectedUnit.capacity} guests</p>
                </div>
                <div className="text-right">
                  <div className="text-xl font-bold text-orange-500">
                    {formatCurrency(
                      convertCurrency(
                        parseFloat(selectedUnit.price_per_night || 0),
                        selectedUnit.currency || 'EUR',
                        selectedCurrency
                      ),
                      selectedCurrency
                    )}
                  </div>
                  <div className="text-xs text-gray-400">per night ({selectedUnit.currency || 'EUR'} base)</div>
                </div>
              </div>
            </div>

                <Form.Item
                  name="currency"
                  label="Price Currency"
                  initialValue={selectedCurrency}
                >
                  <Select
                    options={getSupportedCurrencies()}
                    onChange={(val) => setSelectedCurrency(val)}
                  />
                </Form.Item>

            <Form.Item
              name="dates"
              label="Check-in & Check-out"
              rules={[{ required: true, message: 'Please select dates' }]}
            >
              <RangePicker 
                style={{ width: '100%' }}
                disabledDate={disabledDate}
                onChange={handleDateChange}
                format="YYYY-MM-DD"
                placeholder={['Check-in', 'Check-out']}
              />
            </Form.Item>

            <Form.Item
              name="guests_count"
              label="Number of Guests"
              rules={[
                { required: true, message: 'Please enter number of guests' },
                { type: 'number', max: selectedUnit.capacity, message: `Maximum ${selectedUnit.capacity} guests` }
              ]}
            >
              <InputNumber 
                min={1} 
                max={selectedUnit.capacity} 
                style={{ width: '100%' }}
                placeholder="1"
              />
            </Form.Item>

            <Form.Item
              name="notes"
              label="Special Requests (optional)"
            >
              <TextArea 
                rows={3}
                placeholder="Any special requests or notes..."
              />
            </Form.Item>

            {/* Price Summary */}
            {calculatedPrice > 0 && (
              <Alert
                type="info"
                className="mb-4"
                message={
                  <div className="flex justify-between items-center">
                    <span>
                      {dateRange[1].diff(dateRange[0], 'day')} nights × {formatCurrency(
                        convertCurrency(
                          parseFloat(selectedUnit.price_per_night || 0),
                          selectedUnit.currency || 'EUR',
                          selectedCurrency
                        ),
                        selectedCurrency
                      )}
                    </span>
                    <span className="text-xl font-bold text-orange-500">
                      Total: {formatCurrency(calculatedPrice, selectedCurrency)}
                    </span>
                  </div>
                }
              />
            )}

            <div className="flex justify-end gap-2 mt-6">
              <Button onClick={() => setBookingModalVisible(false)}>Cancel</Button>
              <Button 
                type="primary" 
                htmlType="submit"
                loading={submitting}
                style={{ backgroundColor: '#fa8c16', borderColor: '#fa8c16' }}
              >
                Submit Booking Request
              </Button>
            </div>
          </Form>
        )}
      </Modal>
      </div>
    </div>
  );
}

export default AccommodationBookingPage;
