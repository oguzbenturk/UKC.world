// src/components/ServiceDetailModal.jsx
import React, { useMemo, useState } from 'react';
import { Modal, Button, Descriptions, Tag, Divider, DatePicker, Select, Typography } from 'antd';
import { message } from '@/shared/utils/antdStatic';
import { 
  ClockCircleOutlined, 
  UserOutlined, 
  AppstoreAddOutlined, 
  CalendarOutlined,
  DollarOutlined,
  CheckCircleOutlined,
  ShoppingCartOutlined
} from '@ant-design/icons';
import moment from 'moment';
import { useCurrency } from '@/shared/contexts/CurrencyContext';

const { Option } = Select;
const { Text } = Typography;

const ServiceDetailModal = ({ service, open, onClose, onBook }) => {
  const [bookingDate, setBookingDate] = useState(null);
  const [bookingTime, setBookingTime] = useState(null);
  const [bookingLoading, setBookingLoading] = useState(false);
  const [showBookingOptions, setShowBookingOptions] = useState(false);
  const { formatCurrency, convertCurrency, userCurrency } = useCurrency();
  
  // useMemo must be called unconditionally (before any early returns)
  const priceCurrency = useMemo(() => {
    return service?.currency || 'EUR';
  }, [service]);
  
  if (!service) return null;
  
  const { 
    name,
    description,
    category,
    level,
    serviceType,
    duration,
    maxParticipants,
    price,
    isPackage,
    packageName,
    packagePrice,
    sessionsCount,
    startTime,
    endTime,
    includes
  } = service;

  const resolvedPriceCurrency = (typeof window !== 'undefined' && window.__APP_CURRENCY__?.business) || priceCurrency;

  const displayCurrency = (amount, baseCurr = resolvedPriceCurrency) => {
    const targetCurr = userCurrency || baseCurr || 'EUR';
    const converted = convertCurrency ? convertCurrency(Number(amount || 0), baseCurr || 'EUR', targetCurr) : Number(amount || 0);
    return formatCurrency(converted, targetCurr);
  };

  const formatServiceType = (type) => {
    switch(type) {
      case 'private': return 'Private (1-on-1)';
      case 'semi-private': return 'Semi-Private (2-3 people)';
      case 'group': return 'Group (4+ people)';
      default: return type;
    }
  };

  const formatCategory = (cat) => {
    return cat?.charAt(0).toUpperCase() + cat?.slice(1).replace('-', ' ') || 'Service';
  };

  const formatLevel = (lvl) => {
    return lvl?.charAt(0).toUpperCase() + lvl?.slice(1).replace('-', ' ') || 'All Levels';
  };

  const getCategoryColor = (category) => {
    switch(category) {
      case 'kitesurfing': return 'blue';
      case 'windsurfing': return 'green';
      case 'equipment-rental': return 'purple';
      default: return 'default';
    }
  };

  const getLevelColor = (level) => {
    switch(level) {
      case 'beginner': return 'green';
      case 'intermediate': return 'blue';
      case 'advanced': return 'orange';
      case 'all-levels': return 'cyan';
      default: return 'default';
    }
  };

  const includedItems = includes?.split(',').map(item => item.trim()).filter(Boolean) || [];
  
  // Generate available time slots based on service duration
  const generateTimeSlots = () => {
    const slots = [];
    // Start from 8 AM, end at 6 PM
    for (let hour = 8; hour <= 18 - duration; hour++) {
      for (let minute = 0; minute < 60; minute += 30) {
        if (hour === 18 - duration && minute > 0) continue; // Don't go past 6 PM
        
        const timeString = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
        slots.push(timeString);
      }
    }
    return slots;
  };
  
  const timeSlots = generateTimeSlots();

  // Handle booking
  const handleBook = () => {
    if (!bookingDate || !bookingTime) {
      message.error('Please select a date and time for your booking');
      return;
    }
    
    setBookingLoading(true);
    
    // The date and time chosen by the user
  // const bookingDateTime = moment(bookingDate).format('YYYY-MM-DD') + ' ' + bookingTime; // not used
    
    // Typically you would call a booking API here
    setTimeout(() => {
      if (onBook) {
        onBook({
          serviceId: service.id,
          serviceName: name,
          date: bookingDate,
          time: bookingTime,
          isPackage: isPackage,
          price: isPackage ? packagePrice : price
        });
      }
      
      message.success('Booking created successfully!');
      setBookingLoading(false);
      setShowBookingOptions(false);
      onClose();
    }, 1500);
  };

  const disabledDate = (current) => {
    // Can't book dates in the past
    return current && current < moment().startOf('day');
  };
  
  const footer = [
    <Button key="close" onClick={onClose}>
      Close
    </Button>,
    showBookingOptions ? (
      <Button 
        key="book-confirm" 
        type="primary" 
        onClick={handleBook}
        loading={bookingLoading}
        disabled={!bookingDate || !bookingTime}
      >
        Confirm Booking
      </Button>
    ) : (
      <Button 
        key="book" 
        type="primary" 
        icon={<ShoppingCartOutlined />} 
        onClick={() => setShowBookingOptions(true)}
      >
        Book Now
      </Button>
    )
  ];
  return (
    <Modal
      title={name}
      open={open}
      onCancel={onClose}
      width={700}
      footer={footer}
    >
      <div className="mb-4">
        {service.imageUrl && (
          <div 
            className="h-60 w-full rounded-md bg-cover bg-center mb-4"
            style={{ backgroundImage: `url(${service.imageUrl})` }}
          />
        )}
        
        <div className="mb-3 flex flex-wrap gap-2">
          <Tag color={getCategoryColor(category)}>{formatCategory(category)}</Tag>
          <Tag color={getLevelColor(level)}>{formatLevel(level)}</Tag>
        </div>
        
        <p className="text-base text-gray-700">{description}</p>
      </div>

      <Divider />
      
      {showBookingOptions ? (
        <div className="bg-blue-50 p-4 rounded-lg mb-4">
          <h3 className="text-lg font-medium text-blue-800 mb-4">Book {name}</h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Select Date</label>
              <DatePicker 
                className="w-full" 
                onChange={setBookingDate} 
                disabledDate={disabledDate}
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Select Time</label>
              <Select 
                className="w-full" 
                onChange={setBookingTime}
                disabled={!bookingDate}
                placeholder="Select time slot"
              >
                {timeSlots.map(slot => (
                  <Option key={slot} value={slot}>
                    {slot} - {moment(slot, 'HH:mm').add(duration, 'hours').format('HH:mm')}
                  </Option>
                ))}
              </Select>
            </div>
          </div>
          
          <div className="bg-white p-3 rounded-lg shadow-sm">
            <h4 className="font-medium text-gray-800">Booking Summary</h4>
            
      {bookingDate && bookingTime ? (
              <div className="mt-2">
                <p><strong>Service:</strong> {name}</p>
                <p><strong>Date:</strong> {moment(bookingDate).format('dddd, MMMM D, YYYY')}</p>
                <p><strong>Time:</strong> {bookingTime} - {moment(bookingTime, 'HH:mm').add(duration, 'hours').format('HH:mm')}</p>
        <p><strong>Price:</strong> {displayCurrency(Number((isPackage ? packagePrice : price) || 0), priceCurrency)}</p>
              </div>
            ) : (
              <Text type="secondary">Please select a date and time to see booking details</Text>
            )}
          </div>
        </div>
      ) : (        <>
          <Descriptions title="Service Details" column={{ xs: 1, sm: 2, md: 3 }} bordered>
            <Descriptions.Item label="Service Type" span={1}>{formatServiceType(serviceType)}</Descriptions.Item>
            <Descriptions.Item label="Duration" span={1}>
              <ClockCircleOutlined className="mr-1" /> {duration} hour{duration !== 1 ? 's' : ''}
            </Descriptions.Item>
            {serviceType !== 'private' && (
              <Descriptions.Item label="Max Participants" span={1}>
                <UserOutlined className="mr-1" /> {maxParticipants} participants
              </Descriptions.Item>
            )}
            {startTime && (
              <Descriptions.Item label="Typical Time" span={1}>
                <CalendarOutlined className="mr-1" /> {startTime} - {endTime || 'Variable'}
              </Descriptions.Item>
            )}
          </Descriptions>

          <Divider />

          {isPackage ? (
            <div className="bg-blue-50 p-4 rounded-md mb-4">
              <h3 className="text-lg font-medium text-blue-800 mb-2">
                <AppstoreAddOutlined className="mr-2" /> 
                Package: {packageName}
              </h3>
              <p className="text-blue-700 mb-2">Includes {sessionsCount} sessions</p>
              
              <div className="flex justify-between items-center">
                <div>
                  <div className="text-sm text-blue-600">Single session price</div>
                  <div className="text-lg font-medium">{displayCurrency(Number(price || 0), resolvedPriceCurrency)}</div>
                </div>
                
                <div className="text-xl font-bold text-center">→</div>
                
                <div>
                  <div className="text-sm text-blue-600">Package price</div>
                  <div className="text-xl font-bold text-blue-800">{displayCurrency(Number(packagePrice || 0), resolvedPriceCurrency)}</div>
                </div>
                
                <div className="bg-blue-100 rounded-md p-2 text-center">
                  <div className="text-sm text-blue-700">You save</div>
                  <div className="text-lg font-bold text-blue-800">
                    {displayCurrency((Number(price || 0) * Number(sessionsCount || 0)) - Number(packagePrice || 0), resolvedPriceCurrency)}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="mb-4">
              <h3 className="text-lg font-medium flex items-center">
                <DollarOutlined className="mr-2" /> 
                Pricing
              </h3>
              <p className="text-xl font-bold text-blue-600 mt-1">{displayCurrency(Number(price || 0), resolvedPriceCurrency)}</p>
            </div>
          )}

          {includedItems.length > 0 && (
            <div className="mb-4">
              <h3 className="text-lg font-medium mb-2">What's Included</h3>
              <ul className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {includedItems.map((item) => (
                  <li key={`incl-${item}`} className="flex items-start">
                    <CheckCircleOutlined className="text-green-500 mr-2 mt-1" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </Modal>
  );
};

export default ServiceDetailModal;
