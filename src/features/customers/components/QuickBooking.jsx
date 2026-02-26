import React, { useState, useEffect } from 'react';
import {
  Modal,
  Form,
  Select,
  DatePicker,
  InputNumber,
  Alert,
  Button,
  Card,
  Tag,
  Space,
  Divider,
  Row,
  Col,
  Progress
} from 'antd';
import { message } from '@/shared/utils/antdStatic';
import {
  CalendarOutlined,
  ClockCircleOutlined,
  UserOutlined,
  GiftOutlined,
  CheckCircleOutlined,
  ExclamationCircleOutlined
} from '@ant-design/icons';
import moment from 'moment';
import { serviceApi } from '@/shared/services/serviceApi';
import { filterServicesByCapacity } from '@/shared/utils/serviceCapacityFilter';
import { useCurrency } from '@/shared/contexts/CurrencyContext';
import calendarConfig from '@/config/calendarConfig';

// Predefined lesson time blocks for the booking form
const PRESET_SLOT_OPTIONS = calendarConfig.preScheduledSlots.map((s) => ({
  value: s.start,
  label: `${s.start} – ${s.end}`,
  durationMinutes: Math.round(
    (parseInt(s.end.split(':')[0], 10) * 60 + parseInt(s.end.split(':')[1], 10)) -
    (parseInt(s.start.split(':')[0], 10) * 60 + parseInt(s.start.split(':')[1], 10))
  ),
}));

const { Option } = Select;

// Helper to get price in specific currency from prices array
const getPriceInCurrency = (service, targetCurrency) => {
  if (!service) return { price: 0, currency: 'EUR' };
  
  // Try to find price in target currency
  if (targetCurrency && service.prices && Array.isArray(service.prices)) {
    const currencyPrice = service.prices.find(
      p => p.currencyCode === targetCurrency || p.currency_code === targetCurrency
    );
    if (currencyPrice && currencyPrice.price > 0) {
      return { price: currencyPrice.price, currency: targetCurrency };
    }
  }
  
  // Fallback to default service price
  return { price: service.price || 0, currency: service.currency || 'EUR' };
};

function QuickBooking({ visible, onClose, customer, onBookingCreated }) {
  const [form] = Form.useForm();
  const { formatCurrency, businessCurrency } = useCurrency();
  const [loading, setLoading] = useState(false);
  const [lessonServices, setLessonServices] = useState([]);
  const [instructors, setInstructors] = useState([]);
  const [customerPackages, setCustomerPackages] = useState([]);
  const [selectedService, setSelectedService] = useState(null);
  const [availablePackage, setAvailablePackage] = useState(null);
  const [usePackage, setUsePackage] = useState(false);

  useEffect(() => {
    if (visible && customer) {
      loadData();
    }
  }, [visible, customer]);

  const loadData = async () => {
    try {
      setLoading(true);
      
      // Load services
      const services = await serviceApi.getServices();
      const lessons = services.filter(s => s.category === 'lesson');
      
      // For QuickBooking, we typically book for 1 person (the customer)
      // but we'll show all services with capacity filtering as a safety measure
      const capacityFilteredLessons = filterServicesByCapacity(lessons, 1);
      setLessonServices(capacityFilteredLessons);

      // Mock instructors - replace with actual API
      const mockInstructors = [
        { id: 1, name: 'Anna Garcia', specialties: ['Private Lessons', 'Semi Private Lessons'] },
        { id: 2, name: 'Carlos Martinez', specialties: ['Group Lessons', 'Wing Foil Lessons'] },
        { id: 3, name: 'Elena Rodriguez', specialties: ['Private Lessons', 'Advanced Lessons'] }
      ];
      setInstructors(mockInstructors);

      // Load customer packages
      const mockPackages = [
        {
          id: 1,
          packageType: 'combo',
          lessonType: 'Private Lessons',
          accommodationType: 'Beachfront Villa',
          totalHours: 8,
          usedHours: 2,
          remainingHours: 6,
          accommodationNights: 5,
          usedNights: 1,
          remainingNights: 4,
          purchaseDate: '2025-06-20',
          expiryDate: '2025-09-20',
          status: 'active'
        },
        {
          id: 2,
          packageType: 'lesson-only',
          lessonType: 'Semi Private Lessons',
          totalHours: 4,
          usedHours: 1,
          remainingHours: 3,
          purchaseDate: '2025-06-25',
          expiryDate: '2025-08-25',
          status: 'active'
        }
      ];
      setCustomerPackages(mockPackages);
      
    } catch (error) {
      message.error('Failed to load booking data');
    } finally {
      setLoading(false);
    }
  };

  const handleServiceChange = (serviceId) => {
    const service = lessonServices.find(s => s.id === serviceId);
    setSelectedService(service);
    
    // Find available package for this service type
    const availablePkg = customerPackages.find(pkg => 
      (pkg.packageType === 'lesson-only' || pkg.packageType === 'combo') &&
      pkg.lessonType === service?.name &&
      pkg.remainingHours > 0 &&
      moment().isBefore(moment(pkg.expiryDate))
    );
    
    setAvailablePackage(availablePkg);
    setUsePackage(!!availablePkg);
  };

  const handleCreateBooking = async (values) => {
    try {
      setLoading(true);
      
      const bookingDate = values.date.format('YYYY-MM-DD');
      // time is now a plain "HH:mm" string from the preset slot Select
      const bookingTime = typeof values.time === 'string' ? values.time : values.time.format('HH:mm');
      // derive duration from the selected preset slot, fallback to form value
      const selectedSlot = PRESET_SLOT_OPTIONS.find((s) => s.value === values.time);
      const duration = selectedSlot ? selectedSlot.durationMinutes : values.duration;
      
      const newBooking = {
        id: Date.now(),
        customer_id: customer.id,
        customer_name: customer.name,
        service_id: selectedService.id,
        service_name: selectedService.name,
        instructor_id: values.instructor_id,
        start_time: `${bookingDate}T${bookingTime}:00`,
        duration: duration,
        status: 'confirmed',
        booking_type: selectedService.name.toLowerCase().includes('private') ? 'private' : 
                     selectedService.name.toLowerCase().includes('semi') ? 'semi-private' : 'group',
        created_at: new Date().toISOString()
      };

      // Handle package usage
      if (usePackage && availablePackage) {
        const hoursToUse = duration / 60; // Convert minutes to hours
        
        if (hoursToUse > availablePackage.remainingHours) {
          message.error(`Not enough hours in package. Available: ${availablePackage.remainingHours}h, Required: ${hoursToUse}h`);
          return;
        }

        // Update package usage
        availablePackage.usedHours += hoursToUse;
        availablePackage.remainingHours -= hoursToUse;
        
        newBooking.package_id = availablePackage.id;
        newBooking.payment_method = 'package';
        newBooking.package_hours_used = hoursToUse;
        
        // Create package usage transaction
        await createPackageUsageTransaction(availablePackage, hoursToUse, newBooking);
        
        message.success(`Booking created! Used ${hoursToUse}h from package. Remaining: ${availablePackage.remainingHours}h`);
      } else {
        // Regular booking - charge customer balance
        // Use customer's preferred currency to get correct price
        const customerCurrency = customer?.preferred_currency || customer?.preferredCurrency || businessCurrency || 'EUR';
        const { price, currency: priceCurrency } = getPriceInCurrency(selectedService, customerCurrency);
        const cost = (price * duration) / 60; // Price per hour * hours
        
        if ((customer.balance || 0) < cost) {
          const requiredStr = formatCurrency(cost, priceCurrency);
          const availableStr = formatCurrency(customer.balance || 0, priceCurrency);
          message.error(`Insufficient balance. Required: ${requiredStr}, Available: ${availableStr}`);
          return;
        }
        
        customer.balance = (customer.balance || 0) - cost;
        newBooking.payment_method = 'balance';
        newBooking.cost = cost;
        
        // Create payment transaction
        await createPaymentTransaction(cost, newBooking);
        
  message.success(`Booking created! ${formatCurrency(cost, businessCurrency || 'EUR')} charged to customer balance.`);
      }

      // In real app, save booking to API
      
      if (onBookingCreated) {
        onBookingCreated(newBooking);
      }
      
      onClose();
      form.resetFields();
      setSelectedService(null);
      setAvailablePackage(null);
      setUsePackage(false);
      
    } catch (error) {
      message.error('Failed to create booking');
    } finally {
      setLoading(false);
    }
  };

  const createPackageUsageTransaction = async (packageData, hoursUsed, booking) => {
    try {
      const transaction = {
        customer_id: customer.id,
        type: 'package_usage',
        amount: 0, // No cost as it's from package
        description: `Package Usage: ${hoursUsed}h for ${booking.service_name}`,
        transaction_date: new Date().toISOString(),
        reference: `BOOK-${booking.id}`,
        package_id: packageData.id
      };
      
      // In real app, call API to create transaction
    } catch (error) {
    }
  };

  const createPaymentTransaction = async (amount, booking) => {
    try {
      const transaction = {
        customer_id: customer.id,
        type: 'lesson_booking',
        amount: amount,
        description: `Lesson Booking: ${booking.service_name}`,
        transaction_date: new Date().toISOString(),
        reference: `BOOK-${booking.id}`
      };
      
      // In real app, call API to create transaction
    } catch (error) {
    }
  };

  const calculateCost = () => {
    if (!selectedService || !form.getFieldValue('duration')) return 0;
    const duration = form.getFieldValue('duration');
    const customerCurrency = customer?.preferred_currency || customer?.preferredCurrency || businessCurrency || 'EUR';
    const { price } = getPriceInCurrency(selectedService, customerCurrency);
    return (price * duration) / 60;
  };

  return (
    <Modal
      title={
        <div className="flex items-center space-x-2">
          <CalendarOutlined />
          <span>Quick Booking - {customer?.name}</span>
        </div>
      }
      open={visible}
      onCancel={() => {
        onClose();
        form.resetFields();
        setSelectedService(null);
        setAvailablePackage(null);
        setUsePackage(false);
      }}
      footer={null}
      width={700}
    >
      <div className="space-y-6">
        {/* Customer Balance */}
        <Alert
          message={`Customer Balance: ${formatCurrency(customer?.balance || 0, businessCurrency || 'EUR')}`}
          type="info"
          showIcon
        />

        {/* Available Package Alert */}
        {availablePackage && (
          <Card size="small" className="bg-green-50 border-green-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <GiftOutlined className="text-green-600" />
                <div>
                  <div className="font-medium text-green-800">
                    Available Package: {availablePackage.lessonType}
                  </div>
                  <div className="text-sm text-green-600">
                    {availablePackage.remainingHours}h remaining
                  </div>
                </div>
              </div>
              <Progress
                type="circle"
                percent={Math.round((availablePackage.usedHours / availablePackage.totalHours) * 100)}
                width={60}
                strokeColor="#52c41a"
              />
            </div>
          </Card>
        )}

        <Form
          form={form}
          layout="vertical"
          onFinish={handleCreateBooking}
          initialValues={{
            date: moment().add(1, 'day'),
            time: PRESET_SLOT_OPTIONS[0]?.value || '09:00',
            duration: PRESET_SLOT_OPTIONS[0]?.durationMinutes || 120
          }}
        >
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="service_id"
                label="Lesson Type"
                rules={[{ required: true, message: 'Please select a lesson type' }]}
              >
                <Select 
                  placeholder="Select lesson type"
                  onChange={handleServiceChange}
                >
    {lessonServices.map(service => {
        const customerCurrency = customer?.preferred_currency || customer?.preferredCurrency || businessCurrency || 'EUR';
        const { price, currency: priceCurrency } = getPriceInCurrency(service, customerCurrency);
        return (
        <Option key={service.id} value={service.id}>
      {service.name} - {formatCurrency(price, priceCurrency)}/hour
        </Option>
        );
      })}
                </Select>
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="instructor_id"
                label="Instructor"
                rules={[{ required: true, message: 'Please select an instructor' }]}
              >
                <Select placeholder="Select instructor">
                  {instructors.map(instructor => (
                    <Option key={instructor.id} value={instructor.id}>
                      {instructor.name}
                    </Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={8}>
              <Form.Item
                name="date"
                label="Date"
                rules={[{ required: true, message: 'Please select a date' }]}
              >
                <DatePicker 
                  style={{ width: '100%' }}
                  disabledDate={(current) => current && current < moment().endOf('day')}
                />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item
                name="time"
                label="Time Slot"
                rules={[{ required: true, message: 'Please select a time slot' }]}
              >
                <Select
                  style={{ width: '100%' }}
                  placeholder="Select time slot"
                  options={PRESET_SLOT_OPTIONS}
                  onChange={(val) => {
                    const slot = PRESET_SLOT_OPTIONS.find((s) => s.value === val);
                    if (slot) form.setFieldValue('duration', slot.durationMinutes);
                  }}
                />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item
                name="duration"
                label="Duration (minutes)"
                rules={[{ required: true, message: 'Please enter duration' }]}
              >
                <Select>
                  <Option value={60}>1 hour</Option>
                  <Option value={90}>1.5 hours</Option>
                  <Option value={120}>2 hours</Option>
                  <Option value={180}>3 hours</Option>
                </Select>
              </Form.Item>
            </Col>
          </Row>

          {/* Payment Method Selection */}
          {availablePackage && (
            <Form.Item label="Payment Method">
              <div className="space-y-3">
                <div 
                  className={`p-3 border rounded cursor-pointer ${usePackage ? 'border-green-500 bg-green-50' : 'border-gray-200'}`}
                  onClick={() => setUsePackage(true)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <GiftOutlined className={usePackage ? 'text-green-600' : 'text-gray-400'} />
                      <span className="font-medium">Use Package Hours</span>
                      {usePackage && <CheckCircleOutlined className="text-green-600" />}
                    </div>
                    <Tag color="green">FREE</Tag>
                  </div>
                  <div className="text-sm text-gray-600 mt-1">
                    From: {availablePackage.lessonType} package
                  </div>
                </div>

                <div 
                  className={`p-3 border rounded cursor-pointer ${!usePackage ? 'border-blue-500 bg-blue-50' : 'border-gray-200'}`}
                  onClick={() => setUsePackage(false)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <UserOutlined className={!usePackage ? 'text-blue-600' : 'text-gray-400'} />
                      <span className="font-medium">Pay from Balance</span>
                      {!usePackage && <CheckCircleOutlined className="text-blue-600" />}
                    </div>
                    <Tag color="blue">{formatCurrency(calculateCost() || 0, businessCurrency || 'EUR')}</Tag>
                  </div>
                  <div className="text-sm text-gray-600 mt-1">
                    Charge customer balance
                  </div>
                </div>
              </div>
            </Form.Item>
          )}

          {/* Cost Alert for Balance Payment */}
          {selectedService && !usePackage && (
            <Alert
              message={`Total Cost: ${formatCurrency(calculateCost() || 0, businessCurrency || 'EUR')}`}
              description="This amount will be deducted from customer balance"
              type="warning"
              showIcon
            />
          )}

          {/* Insufficient Balance Warning */}
          {selectedService && !usePackage && calculateCost() > (customer?.balance || 0) && (
            <Alert
              message="Insufficient Balance"
              description={`Customer needs ${formatCurrency((calculateCost() || 0) - (customer?.balance || 0), businessCurrency || 'EUR')} more to complete this booking`}
              type="error"
              showIcon
            />
          )}

          <Divider />

          <div className="flex justify-end space-x-3">
            <Button onClick={() => {
              onClose();
              form.resetFields();
              setSelectedService(null);
              setAvailablePackage(null);
              setUsePackage(false);
            }}>
              Cancel
            </Button>
            <Button 
              type="primary" 
              htmlType="submit"
              loading={loading}
              disabled={
                !selectedService || 
                (!usePackage && calculateCost() > (customer?.balance || 0))
              }
            >
              Create Booking
            </Button>
          </div>
        </Form>
      </div>
    </Modal>
  );
}

export default QuickBooking;
