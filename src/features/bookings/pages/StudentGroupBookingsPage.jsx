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
  Typography,
  Button,
  Spin,
  Empty,
  Badge,
  Tag,
  Avatar,
  message,
  Tabs,
  Progress,
  Popconfirm,
  Tooltip
} from 'antd';
import {
  UserGroupIcon,
  CalendarIcon,
  ClockIcon,
  PlusIcon,
  EyeIcon,
  CreditCardIcon,
  CheckCircleIcon,
  ExclamationCircleIcon,
  StarIcon,
  SparklesIcon,
  XMarkIcon
} from '@heroicons/react/24/outline';
import dayjs from 'dayjs';
import { getGroupBookings } from '../services/groupBookingService';
import { getGroupLessonRequests, cancelGroupLessonRequest } from '../services/groupLessonRequestService';
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
  const [requests, setRequests] = useState([]);
  const [activeTab, setActiveTab] = useState('all');
  const [cancellingId, setCancellingId] = useState(null);
  
  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const [bookingsRes, requestsRes] = await Promise.allSettled([
        getGroupBookings(),
        getGroupLessonRequests()
      ]);
      setBookings(bookingsRes.status === 'fulfilled' ? (bookingsRes.value.groupBookings || []) : []);
      setRequests(requestsRes.status === 'fulfilled' ? (requestsRes.value.requests || requestsRes.value || []) : []);
    } catch {
      message.error('Failed to load data');
    } finally {
      setLoading(false);
    }
  }, []);
  
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleCancelRequest = async (requestId) => {
    try {
      setCancellingId(requestId);
      await cancelGroupLessonRequest(requestId);
      message.success('Request cancelled');
      setRequests(prev => prev.filter(r => r.id !== requestId));
    } catch (err) {
      message.error(err.response?.data?.error || 'Failed to cancel request');
    } finally {
      setCancellingId(null);
    }
  };
  
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
    const participantPct = Math.round((booking.participantCount / booking.maxParticipants) * 100);
    
    return (
      <div
        key={booking.id}
        className={`bg-white rounded-2xl border border-slate-200 p-5 hover:shadow-lg hover:border-blue-200 transition-all duration-200 cursor-pointer ${isPastDate ? 'opacity-60' : ''}`}
        onClick={() => navigate(`/student/group-bookings/${booking.id}`)}
      >
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          {/* Left — Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center flex-shrink-0">
                <UserGroupIcon className="w-5 h-5 text-white" />
              </div>
              <div className="min-w-0">
                <p className="font-semibold text-slate-800 text-base truncate mb-0">{booking.title}</p>
                <p className="text-slate-500 text-sm mb-0 truncate">{booking.serviceName}</p>
              </div>
            </div>
            
            <div className="flex flex-wrap gap-1.5 mb-3">
              {booking.scheduledDate && (
                <span className="inline-flex items-center gap-1 text-xs bg-slate-100 text-slate-600 px-2.5 py-1 rounded-lg">
                  <CalendarIcon className="w-3.5 h-3.5" />
                  {dayjs(booking.scheduledDate).format('MMM D, YYYY')}
                </span>
              )}
              {booking.startTime && (
                <span className="inline-flex items-center gap-1 text-xs bg-slate-100 text-slate-600 px-2.5 py-1 rounded-lg">
                  <ClockIcon className="w-3.5 h-3.5" />
                  {booking.startTime}
                </span>
              )}
              <Tag color={getStatusColor(booking.status)} className="!rounded-lg !text-xs !px-2 !m-0">
                {booking.status.replace('_', ' ')}
              </Tag>
              {booking.iAmOrganizer && (
                <Tag color="gold" className="!rounded-lg !text-xs !px-2 !m-0">
                  <StarIcon className="w-3 h-3 inline mr-0.5" /> Organizer
                </Tag>
              )}
            </div>
            
            {/* Participants bar */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-slate-500">Participants</span>
                <span className="text-xs font-medium text-slate-700">
                  {booking.participantCount}/{booking.maxParticipants}
                  <span className="text-slate-400 ml-1">· {booking.paidCount} paid</span>
                </span>
              </div>
              <Progress 
                percent={participantPct}
                size="small"
                showInfo={false}
                strokeColor={participantPct === 100 ? '#10b981' : '#3b82f6'}
                trailColor="#e2e8f0"
              />
            </div>
          </div>
          
          {/* Right — Price & Actions */}
          <div className="flex sm:flex-col items-center sm:items-end gap-3 sm:gap-2 flex-shrink-0">
            <div className="text-right">
              <p className="text-lg font-bold text-slate-800 mb-0">
                € {booking.pricePerPerson?.toFixed(2)}
              </p>
              <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${
                booking.myPaymentStatus === 'paid' 
                  ? 'bg-emerald-50 text-emerald-700' 
                  : booking.myPaymentStatus === 'pending' 
                    ? 'bg-amber-50 text-amber-700' 
                    : 'bg-slate-100 text-slate-600'
              }`}>
                {booking.myPaymentStatus === 'paid' && <CheckCircleIcon className="w-3 h-3" />}
                {booking.myPaymentStatus === 'pending' && <ExclamationCircleIcon className="w-3 h-3" />}
                {booking.myPaymentStatus}
              </span>
            </div>
            
            <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
              {needsPayment && (
                <Button
                  type="primary"
                  size="small"
                  className="!rounded-lg"
                  icon={<CreditCardIcon className="w-3.5 h-3.5" />}
                  onClick={() => navigate(`/student/group-bookings/${booking.id}?pay=true`)}
                >
                  Pay
                </Button>
              )}
              <Button
                size="small"
                className="!rounded-lg"
                icon={<EyeIcon className="w-3.5 h-3.5" />}
                onClick={() => navigate(`/student/group-bookings/${booking.id}`)}
              >
                Details
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  };
  
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Spin size="large" />
      </div>
    );
  }
  
  const pendingPayments = bookings.filter(b => b.myPaymentStatus === 'pending' && b.status !== 'cancelled').length;
  const pendingRequests = requests.filter(r => r.status === 'pending');

  const getRequestStatusColor = (status) => {
    const colors = { pending: 'orange', matched: 'green', cancelled: 'default', expired: 'red' };
    return colors[status] || 'default';
  };

  const renderRequestCard = (req) => (
    <div key={req.id} className="bg-white rounded-2xl border border-slate-200 p-4 hover:shadow-md transition-all duration-200">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center flex-shrink-0">
            <SparklesIcon className="w-5 h-5 text-white" />
          </div>
          <div>
            <p className="font-semibold text-slate-800 text-sm mb-0">{req.service_name || req.serviceName || 'Lesson'}</p>
            <div className="flex flex-wrap gap-1.5 mt-1.5">
              <span className="inline-flex items-center gap-1 text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-lg">
                <CalendarIcon className="w-3 h-3" />
                {dayjs(req.preferred_date_start || req.preferredDateStart).format('MMM D')}
                {(req.preferred_date_end || req.preferredDateEnd) &&
                  ` – ${dayjs(req.preferred_date_end || req.preferredDateEnd).format('MMM D')}`}
              </span>
              <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-lg">
                {(req.preferred_time_of_day || req.preferredTimeOfDay || 'any')}
              </span>
              <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-lg">
                {(req.skill_level || req.skillLevel || 'any')}
              </span>
              <Tag color={getRequestStatusColor(req.status)} className="!rounded-lg !text-xs !px-2 !m-0">{req.status}</Tag>
            </div>
            {req.notes && <p className="text-slate-500 text-xs mt-1.5 mb-0">{req.notes}</p>}
          </div>
        </div>
        <div className="flex gap-2 flex-shrink-0">
          {req.status === 'matched' && req.matched_group_booking_id && (
            <Button
              size="small"
              className="!rounded-lg"
              icon={<EyeIcon className="w-3.5 h-3.5" />}
              onClick={() => navigate(`/student/group-bookings/${req.matched_group_booking_id}`)}
            >
              View
            </Button>
          )}
          {req.status === 'pending' && (
            <Popconfirm title="Cancel this request?" onConfirm={() => handleCancelRequest(req.id)}>
              <Button
                size="small"
                danger
                className="!rounded-lg"
                loading={cancellingId === req.id}
                icon={<XMarkIcon className="w-3.5 h-3.5" />}
              >
                Cancel
              </Button>
            </Popconfirm>
          )}
        </div>
      </div>
    </div>
  );
  
  const tabItems = [
    { 
      key: 'all', 
      label: (
        <span className="flex items-center gap-1.5">
          All
          <Badge count={bookings.length} size="small" />
        </span>
      )
    },
    { 
      key: 'organizing', 
      label: (
        <span className="flex items-center gap-1.5">
          Organizing
          <Badge count={bookings.filter(b => b.iAmOrganizer).length} size="small" />
        </span>
      )
    },
    { 
      key: 'participating', 
      label: (
        <span className="flex items-center gap-1.5">
          Participating
          <Badge count={bookings.filter(b => !b.iAmOrganizer).length} size="small" />
        </span>
      )
    },
    { 
      key: 'pending_payment', 
      label: (
        <span className="flex items-center gap-1.5">
          Pending Payment
          <Badge count={pendingPayments} size="small" status="warning" />
        </span>
      )
    },
    {
      key: 'my_requests',
      label: (
        <span className="flex items-center gap-1.5">
          My Requests
          <Badge count={pendingRequests.length} size="small" color="purple" />
        </span>
      )
    }
  ];
  
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50/40">
      <div className="max-w-4xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-500/20">
              <UserGroupIcon className="w-6 h-6 text-white" />
            </div>
            <div>
              <Title level={3} className="!mb-0 !text-slate-800">My Group Lessons</Title>
              <Text className="text-slate-500 text-sm">Manage your group lesson bookings</Text>
            </div>
          </div>
          <div className="flex gap-2">
            <Tooltip title="Don't have a partner? We'll find one for you!">
              <Button
                className="!rounded-xl"
                icon={<SparklesIcon className="w-4 h-4" />}
                onClick={() => navigate('/student/group-bookings/request')}
              >
                Find a Partner
              </Button>
            </Tooltip>
            <Button
              type="primary"
              className="!rounded-xl"
              icon={<PlusIcon className="w-4 h-4" />}
              onClick={() => navigate('/student/group-bookings/create')}
            >
              New Group
            </Button>
          </div>
        </div>

        {/* Pending Payment Alert */}
        {pendingPayments > 0 && (
          <div className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-2xl p-4 mb-5 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center flex-shrink-0">
              <ExclamationCircleIcon className="w-5 h-5 text-amber-600" />
            </div>
            <div className="flex-1">
              <p className="font-semibold text-amber-800 text-sm mb-0">Payment Required</p>
              <p className="text-amber-700 text-xs mb-0">
                You have {pendingPayments} group lesson{pendingPayments > 1 ? 's' : ''} awaiting payment.
              </p>
            </div>
            <Button 
              size="small"
              className="!rounded-lg !border-amber-300 !text-amber-700 hover:!bg-amber-100"
              onClick={() => setActiveTab('pending_payment')}
            >
              View
            </Button>
          </div>
        )}
        
        {/* Main Content */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-4 pt-3">
            <Tabs 
              activeKey={activeTab} 
              onChange={setActiveTab}
              items={tabItems}
            />
          </div>

          <div className="p-4">
            {activeTab === 'my_requests' ? (
              requests.length === 0 ? (
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description={<span className="text-slate-500">No matching requests yet</span>}
                >
                  <Button
                    type="primary"
                    className="!rounded-xl"
                    onClick={() => navigate('/student/group-bookings/request')}
                  >
                    Request a Group Lesson
                  </Button>
                </Empty>
              ) : (
                <div className="space-y-3">
                  {requests.map(renderRequestCard)}
                </div>
              )
            ) : (
              filteredBookings.length === 0 ? (
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description={
                    <span className="text-slate-500">
                      {activeTab === 'all' 
                        ? "You haven't joined any group lessons yet"
                        : 'No group lessons in this category'}
                    </span>
                  }
                >
                  <Button 
                    type="primary" 
                    className="!rounded-xl"
                    onClick={() => navigate('/student/group-bookings/create')}
                  >
                    Create a Group Lesson
                  </Button>
                </Empty>
              ) : (
                <div className="space-y-3">
                  {filteredBookings.map(renderBookingCard)}
                </div>
              )
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default StudentGroupBookingsPage;