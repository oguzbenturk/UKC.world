/**
 * Student Group Bookings Page
 * 
 * Shows all group bookings for the current user
 * - Organized groups
 * - Participating groups
 * - Payment status
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Card,
  Typography,
  Button,
  Space,
  Spin,
  Empty,
  Badge,
  Tag,
  Avatar,
  List,
  message,
  Tabs,
  Progress
} from 'antd';
import {
  UserGroupIcon,
  CalendarIcon,
  ClockIcon,
  CurrencyEuroIcon,
  PlusIcon,
  EyeIcon,
  CreditCardIcon,
  CheckCircleIcon,
  ExclamationCircleIcon,
  StarIcon
} from '@heroicons/react/24/outline';
import dayjs from 'dayjs';
import { getGroupBookings } from '../services/groupBookingService';
import { usePageSEO } from '@/shared/utils/seo';

const { Title, Text } = Typography;

const StudentGroupBookingsPage = () => {
  usePageSEO({
    title: 'My Group Lessons',
    description: 'View and manage your group lessons'
  });
  
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [bookings, setBookings] = useState([]);
  const [activeTab, setActiveTab] = useState('all');
  
  const fetchBookings = useCallback(async () => {
    try {
      setLoading(true);
      const response = await getGroupBookings();
      setBookings(response.groupBookings || []);
    } catch (err) {
      message.error('Failed to load group bookings');
    } finally {
      setLoading(false);
    }
  }, []);
  
  useEffect(() => {
    fetchBookings();
  }, [fetchBookings]);
  
  const getStatusColor = (status) => {
    const colors = {
      'pending': 'orange',
      'confirmed': 'blue',
      'in_progress': 'processing',
      'completed': 'green',
      'cancelled': 'red'
    };
    return colors[status] || 'default';
  };
  
  const getPaymentStatusColor = (status) => {
    const colors = {
      'pending': 'orange',
      'paid': 'green',
      'refunded': 'purple'
    };
    return colors[status] || 'default';
  };
  
  const filteredBookings = bookings.filter(b => {
    if (activeTab === 'organizing') return b.iAmOrganizer;
    if (activeTab === 'participating') return !b.iAmOrganizer;
    if (activeTab === 'pending_payment') return b.myPaymentStatus === 'pending';
    return true;
  });
  
  const renderBookingCard = (booking) => {
    const isPastDate = dayjs(booking.scheduledDate).isBefore(dayjs(), 'day');
    const needsPayment = booking.myPaymentStatus === 'pending' && booking.status !== 'cancelled';
    
    return (
      <Card 
        key={booking.id}
        className={`mb-4 hover:shadow-lg transition-shadow ${isPastDate ? 'opacity-75' : ''}`}
        bordered
      >
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          {/* Left - Info */}
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-2">
              <Avatar 
                size={48} 
                className="bg-blue-100 text-blue-600"
                icon={<UserGroupIcon className="w-6 h-6" />}
              />
              <div>
                <Text strong className="text-lg block">
                  {booking.title}
                </Text>
                <Text type="secondary" className="text-sm">
                  {booking.serviceName}
                </Text>
              </div>
            </div>
            
            <Space wrap className="mt-3">
              <Tag icon={<CalendarIcon className="w-3 h-3 inline mr-1" />}>
                {dayjs(booking.scheduledDate).format('MMM D, YYYY')}
              </Tag>
              <Tag icon={<ClockIcon className="w-3 h-3 inline mr-1" />}>
                {booking.startTime}
              </Tag>
              <Tag color={getStatusColor(booking.status)}>
                {booking.status.replace('_', ' ')}
              </Tag>
              {booking.iAmOrganizer && (
                <Tag color="gold" icon={<StarIcon className="w-3 h-3 inline mr-1" />}>
                  Organizer
                </Tag>
              )}
            </Space>
            
            {/* Participants Progress */}
            <div className="mt-3">
              <div className="flex items-center justify-between mb-1">
                <Text type="secondary" className="text-xs">
                  Participants
                </Text>
                <Text type="secondary" className="text-xs">
                  {booking.participantCount} / {booking.maxParticipants}
                </Text>
              </div>
              <Progress 
                percent={Math.round((booking.participantCount / booking.maxParticipants) * 100)}
                size="small"
                showInfo={false}
                strokeColor="#3b82f6"
              />
              <Text type="secondary" className="text-xs">
                {booking.paidCount} paid
              </Text>
            </div>
          </div>
          
          {/* Right - Actions & Payment Status */}
          <div className="flex flex-col items-end gap-3">
            <div className="text-right">
              <Text className="text-lg font-semibold text-green-600 block">
                € {booking.pricePerPerson?.toFixed(2)}
              </Text>
              <Tag color={getPaymentStatusColor(booking.myPaymentStatus)}>
                {booking.myPaymentStatus === 'paid' && (
                  <CheckCircleIcon className="w-3 h-3 inline mr-1" />
                )}
                {booking.myPaymentStatus === 'pending' && (
                  <ExclamationCircleIcon className="w-3 h-3 inline mr-1" />
                )}
                Payment: {booking.myPaymentStatus}
              </Tag>
            </div>
            
            <Space>
              {needsPayment && (
                <Button
                  type="primary"
                  icon={<CreditCardIcon className="w-4 h-4" />}
                  onClick={() => navigate(`/student/group-bookings/${booking.id}?pay=true`)}
                >
                  Pay Now
                </Button>
              )}
              <Button
                icon={<EyeIcon className="w-4 h-4" />}
                onClick={() => navigate(`/student/group-bookings/${booking.id}`)}
              >
                View
              </Button>
            </Space>
          </div>
        </div>
      </Card>
    );
  };
  
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Spin size="large" tip="Loading group lessons..." />
      </div>
    );
  }
  
  const pendingPayments = bookings.filter(b => b.myPaymentStatus === 'pending' && b.status !== 'cancelled').length;
  
  const tabItems = [
    { 
      key: 'all', 
      label: (
        <span>
          All
          <Badge count={bookings.length} className="ml-2" size="small" />
        </span>
      )
    },
    { 
      key: 'organizing', 
      label: (
        <span>
          Organizing
          <Badge count={bookings.filter(b => b.iAmOrganizer).length} className="ml-2" size="small" />
        </span>
      )
    },
    { 
      key: 'participating', 
      label: (
        <span>
          Participating
          <Badge count={bookings.filter(b => !b.iAmOrganizer).length} className="ml-2" size="small" />
        </span>
      )
    },
    { 
      key: 'pending_payment', 
      label: (
        <span>
          Pending Payment
          <Badge count={pendingPayments} className="ml-2" size="small" status="warning" />
        </span>
      )
    }
  ];
  
  return (
    <div className="max-w-4xl mx-auto p-4">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Avatar 
            size={48} 
            className="bg-blue-600"
            icon={<UserGroupIcon className="w-6 h-6" />}
          />
          <div>
            <Title level={3} className="mb-0">My Group Lessons</Title>
            <Text type="secondary">Manage your group lesson bookings</Text>
          </div>
        </div>
        <Button
          type="primary"
          icon={<PlusIcon className="w-4 h-4" />}
          onClick={() => navigate('/student/book?participantType=group')}
        >
          Book Group Lesson
        </Button>
      </div>
      
      {/* Pending Payment Alert */}
      {pendingPayments > 0 && (
        <Card className="mb-4 bg-orange-50 border-orange-200">
          <div className="flex items-center gap-3">
            <ExclamationCircleIcon className="w-6 h-6 text-orange-500" />
            <div>
              <Text strong>Payment Required</Text>
              <Text className="block text-sm text-gray-600">
                You have {pendingPayments} group lesson(s) awaiting payment.
              </Text>
            </div>
            <Button 
              type="primary"
              className="ml-auto"
              onClick={() => setActiveTab('pending_payment')}
            >
              View
            </Button>
          </div>
        </Card>
      )}
      
      <Card>
        <Tabs 
          activeKey={activeTab} 
          onChange={setActiveTab}
          items={tabItems}
        />
        
        {filteredBookings.length === 0 ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={
              activeTab === 'all' 
                ? "You haven't joined any group lessons yet"
                : `No group lessons in this category`
            }
          >
            <Button 
              type="primary" 
              onClick={() => navigate('/student/book?participantType=group')}
            >
              Book a Group Lesson
            </Button>
          </Empty>
        ) : (
          <div className="mt-4">
            {filteredBookings.map(renderBookingCard)}
          </div>
        )}
      </Card>
    </div>
  );
};

export default StudentGroupBookingsPage;
