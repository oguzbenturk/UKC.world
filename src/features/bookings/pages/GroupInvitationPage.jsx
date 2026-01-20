/**
 * Group Booking Invitation Page
 * 
 * Handles invitation acceptance/decline flow:
 * - Public page (accessible without auth)
 * - Shows invitation details
 * - Allows accepting (requires login/register) or declining
 */

import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  Card,
  Typography,
  Button,
  Space,
  Spin,
  Result,
  Descriptions,
  Modal,
  Input,
  Alert,
  Tag,
  Divider,
  Avatar,
  message
} from 'antd';
import {
  UserGroupIcon,
  CalendarIcon,
  ClockIcon,
  CurrencyEuroIcon,
  CheckCircleIcon,
  XCircleIcon,
  UserIcon,
  AcademicCapIcon
} from '@heroicons/react/24/outline';
import dayjs from 'dayjs';
import { getInvitationDetails, declineInvitation, acceptInvitation } from '../services/groupBookingService';
import { useAuth } from '@/shared/hooks/useAuth';

const { Title, Text, Paragraph } = Typography;
const { TextArea } = Input;

const GroupInvitationPage = () => {
  const { token } = useParams();
  const navigate = useNavigate();
  const { user, isAuthenticated } = useAuth();
  
  const [loading, setLoading] = useState(true);
  const [invitation, setInvitation] = useState(null);
  const [error, setError] = useState(null);
  const [declining, setDeclining] = useState(false);
  const [accepting, setAccepting] = useState(false);
  const [declineModalVisible, setDeclineModalVisible] = useState(false);
  const [declineReason, setDeclineReason] = useState('');
  
  useEffect(() => {
    fetchInvitation();
  }, [token]);
  
  const fetchInvitation = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await getInvitationDetails(token);
      setInvitation(response.invitation);
    } catch (err) {
      const errorMessage = err.response?.data?.error || 'Failed to load invitation';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };
  
  const handleAccept = async () => {
    // If not logged in, redirect to login with return URL
    if (!isAuthenticated) {
      const returnUrl = encodeURIComponent(`/group-invitation/${token}`);
      navigate(`/login?returnUrl=${returnUrl}&action=accept-invitation`);
      return;
    }
    
    try {
      setAccepting(true);
      const response = await acceptInvitation(token);
      message.success('Invitation accepted! You are now part of this group lesson.');
      navigate(`/student/group-bookings/${response.groupBookingId}`);
    } catch (err) {
      message.error(err.response?.data?.error || 'Failed to accept invitation');
    } finally {
      setAccepting(false);
    }
  };
  
  const handleDecline = async () => {
    try {
      setDeclining(true);
      await declineInvitation(token, declineReason || null);
      message.success('Invitation declined');
      setDeclineModalVisible(false);
      // Redirect to home after declining
      navigate('/');
    } catch (err) {
      message.error(err.response?.data?.error || 'Failed to decline invitation');
    } finally {
      setDeclining(false);
    }
  };
  
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Spin size="large" tip="Loading invitation..." />
      </div>
    );
  }
  
  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <Result
          status="error"
          title="Invitation Not Found"
          subTitle={error}
          extra={[
            <Button key="home" type="primary" onClick={() => navigate('/')}>
              Go to Homepage
            </Button>
          ]}
        />
      </div>
    );
  }
  
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 py-8 px-4">
      <div className="max-w-2xl mx-auto">
        {/* Logo / Header */}
        <div className="text-center mb-8">
          <Avatar 
            size={64} 
            className="bg-blue-600"
            icon={<UserGroupIcon className="w-8 h-8" />}
          />
          <Title level={2} className="mt-4 text-gray-800">
            Group Lesson Invitation
          </Title>
          <Text type="secondary">
            You've been invited to join a group lesson
          </Text>
        </div>
        
        <Card className="shadow-lg rounded-xl">
          {/* Invitation Header */}
          <div className="text-center border-b pb-6 mb-6">
            <Tag color="blue" className="mb-4 text-base px-4 py-1">
              {invitation.serviceName}
            </Tag>
            <Title level={3} className="mb-2">{invitation.groupTitle}</Title>
            {invitation.groupDescription && (
              <Paragraph type="secondary" className="mb-0">
                {invitation.groupDescription}
              </Paragraph>
            )}
          </div>
          
          {/* Greeting */}
          <Alert
            type="info"
            showIcon
            icon={<UserIcon className="w-5 h-5" />}
            message={
              <span>
                Hello <strong>{invitation.fullName || invitation.email}</strong>!
              </span>
            }
            description={`${invitation.organizerName} has invited you to join this group lesson.`}
            className="mb-6"
          />
          
          {/* Event Details */}
          <Descriptions column={1} bordered className="mb-6">
            <Descriptions.Item 
              label={
                <Space>
                  <CalendarIcon className="w-4 h-4" />
                  <span>Date</span>
                </Space>
              }
            >
              <Text strong>
                {dayjs(invitation.scheduledDate).format('dddd, MMMM D, YYYY')}
              </Text>
            </Descriptions.Item>
            
            <Descriptions.Item 
              label={
                <Space>
                  <ClockIcon className="w-4 h-4" />
                  <span>Time</span>
                </Space>
              }
            >
              <Text strong>
                {invitation.startTime}
                {invitation.endTime && ` - ${invitation.endTime}`}
                {invitation.durationHours > 0 && (
                  <Text type="secondary"> ({invitation.durationHours}h)</Text>
                )}
              </Text>
            </Descriptions.Item>
            
            <Descriptions.Item 
              label={
                <Space>
                  <AcademicCapIcon className="w-4 h-4" />
                  <span>Instructor</span>
                </Space>
              }
            >
              <Text strong>{invitation.instructorName || 'To be assigned'}</Text>
            </Descriptions.Item>
            
            <Descriptions.Item 
              label={
                <Space>
                  <CurrencyEuroIcon className="w-4 h-4" />
                  <span>Price</span>
                </Space>
              }
            >
              <Text strong className="text-lg text-green-600">
                {invitation.currency} {invitation.pricePerPerson?.toFixed(2)}
              </Text>
              <Text type="secondary"> per person</Text>
            </Descriptions.Item>
            
            <Descriptions.Item 
              label={
                <Space>
                  <UserGroupIcon className="w-4 h-4" />
                  <span>Participants</span>
                </Space>
              }
            >
              <Space>
                <Text strong>
                  {invitation.currentParticipants} / {invitation.maxParticipants}
                </Text>
                {invitation.spotsRemaining > 0 ? (
                  <Tag color="green">{invitation.spotsRemaining} spots remaining</Tag>
                ) : (
                  <Tag color="red">Full</Tag>
                )}
              </Space>
            </Descriptions.Item>
          </Descriptions>
          
          {/* Registration Notice */}
          {invitation.requiresRegistration && !isAuthenticated && (
            <Alert
              type="warning"
              showIcon
              message="Account Required"
              description="To join this group lesson, you'll need to create an account or log in. This allows you to manage your booking, pay, and receive updates."
              className="mb-6"
            />
          )}
          
          {/* Already logged in notice */}
          {isAuthenticated && (
            <Alert
              type="success"
              showIcon
              icon={<CheckCircleIcon className="w-5 h-5" />}
              message={`Logged in as ${user?.full_name || user?.email}`}
              description="Click 'Accept Invitation' to join this group lesson."
              className="mb-6"
            />
          )}
          
          <Divider />
          
          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button
              type="primary"
              size="large"
              icon={<CheckCircleIcon className="w-5 h-5" />}
              onClick={handleAccept}
              loading={accepting}
              disabled={invitation.spotsRemaining <= 0}
              className="min-w-[200px]"
            >
              {isAuthenticated ? 'Accept Invitation' : 'Accept & Sign In'}
            </Button>
            
            <Button
              size="large"
              danger
              icon={<XCircleIcon className="w-5 h-5" />}
              onClick={() => setDeclineModalVisible(true)}
              className="min-w-[200px]"
            >
              Decline
            </Button>
          </div>
          
          {/* Footer Links */}
          <div className="mt-8 pt-6 border-t text-center">
            <Text type="secondary">
              Need help? <Link to="/contact" className="text-blue-600">Contact us</Link>
            </Text>
          </div>
        </Card>
        
        {/* Powered by */}
        <div className="text-center mt-6">
          <Text type="secondary" className="text-sm">
            Powered by Plannivo
          </Text>
        </div>
      </div>
      
      {/* Decline Modal */}
      <Modal
        title="Decline Invitation"
        open={declineModalVisible}
        onCancel={() => setDeclineModalVisible(false)}
        footer={[
          <Button key="cancel" onClick={() => setDeclineModalVisible(false)}>
            Cancel
          </Button>,
          <Button
            key="decline"
            danger
            loading={declining}
            onClick={handleDecline}
          >
            Confirm Decline
          </Button>
        ]}
      >
        <p>Are you sure you want to decline this invitation?</p>
        <TextArea
          placeholder="(Optional) Let the organizer know why you can't attend..."
          value={declineReason}
          onChange={e => setDeclineReason(e.target.value)}
          rows={3}
          className="mt-4"
        />
      </Modal>
    </div>
  );
};

export default GroupInvitationPage;
