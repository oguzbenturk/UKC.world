/**
 * Group Booking Invitation Page
 * 
 * Flow for unauthenticated users:
 *   1. Show lesson details (public, no auth)
 *   2. Show inline registration form
 *   3. Auto-login after registration
 *   4. Auto-accept invitation after login
 * 
 * Flow for authenticated users:
 *   1. Show lesson details
 *   2. Accept or Decline
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
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
  Form,
  Alert,
  Tag,
  Divider,
  Avatar,
  Progress,
  Select,
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
import {
  UserOutlined,
  MailOutlined,
  LockOutlined,
  DollarOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { getInvitationDetails, declineInvitation, acceptInvitation } from '../services/groupBookingService';
import apiClient from '@/shared/services/apiClient';
import { useAuth } from '@/shared/hooks/useAuth';

const { Title, Text, Paragraph } = Typography;
const { TextArea } = Input;
const { Option } = Select;

const fallbackCurrencies = [
  { label: 'Euro (€)', value: 'EUR', symbol: '€', name: 'Euro' },
  { label: 'US Dollar ($)', value: 'USD', symbol: '$', name: 'US Dollar' },
  { label: 'Turkish Lira (₺)', value: 'TRY', symbol: '₺', name: 'Turkish Lira' },
  { label: 'British Pound (£)', value: 'GBP', symbol: '£', name: 'British Pound' },
  { label: 'Swiss Franc (CHF)', value: 'CHF', symbol: 'CHF', name: 'Swiss Franc' },
];

const GroupInvitationPage = () => {
  const { token } = useParams();
  const navigate = useNavigate();
  const { user, isAuthenticated, login } = useAuth();
  
  const [loading, setLoading] = useState(true);
  const [invitation, setInvitation] = useState(null);
  const [error, setError] = useState(null);
  const [declining, setDeclining] = useState(false);
  const [accepting, setAccepting] = useState(false);
  const [declineModalVisible, setDeclineModalVisible] = useState(false);
  const [declineReason, setDeclineReason] = useState('');

  // Registration / login inline state
  const [showRegisterForm, setShowRegisterForm] = useState(false);
  const [showLoginForm, setShowLoginForm] = useState(false);
  const [registering, setRegistering] = useState(false);
  const [loggingIn, setLoggingIn] = useState(false);
  const [registerForm] = Form.useForm();
  const [loginForm] = Form.useForm();
  const pendingAcceptRef = useRef(false);
  const [allowedCurrencies, setAllowedCurrencies] = useState([]);
  
  useEffect(() => {
    fetchInvitation();
  }, [token]);

  useEffect(() => {
    const fetchCurrencies = async () => {
      try {
        const response = await apiClient.get('/settings/registration-currencies');
        setAllowedCurrencies(response.data.currencies || ['EUR', 'USD', 'TRY']);
      } catch {
        setAllowedCurrencies(['EUR', 'USD', 'TRY']);
      }
    };
    fetchCurrencies();
  }, []);

  const currencyOptions = allowedCurrencies.length > 0
    ? fallbackCurrencies.filter(c => allowedCurrencies.includes(c.value))
    : fallbackCurrencies;

  // Auto-accept after auth completes (login or register)
  useEffect(() => {
    if (isAuthenticated && pendingAcceptRef.current && invitation) {
      pendingAcceptRef.current = false;
      doAccept();
    }
  }, [isAuthenticated, invitation]);
  
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

  const doAccept = async () => {
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
  
  const handleAccept = async () => {
    if (!isAuthenticated) {
      // Show inline registration form
      setShowRegisterForm(true);
      setShowLoginForm(false);
      return;
    }
    doAccept();
  };

  const handleRegister = async () => {
    try {
      const values = await registerForm.validateFields();
      setRegistering(true);

      await apiClient.post('/auth/register', {
        first_name: values.first_name,
        last_name: values.last_name,
        email: values.email.toLowerCase(),
        password: values.password,
        preferred_currency: values.preferred_currency,
      });

      // Flag that we want to auto-accept after login
      pendingAcceptRef.current = true;

      // Auto-login
      const loggedIn = await login(values.email.toLowerCase(), values.password);
      if (loggedIn) {
        message.success(`Welcome, ${values.first_name}! Accepting your invitation...`);
        // The useEffect above will trigger doAccept when isAuthenticated flips
      } else {
        message.error('Account created but auto-login failed. Please log in manually.');
        setShowRegisterForm(false);
        setShowLoginForm(true);
      }
    } catch (err) {
      const errorMessage = err.response?.data?.error || err.message || 'Registration failed';
      if (errorMessage !== 'Validation failed') {
        message.error(errorMessage);
      }
    } finally {
      setRegistering(false);
    }
  };

  const handleLogin = async () => {
    try {
      const values = await loginForm.validateFields();
      setLoggingIn(true);

      pendingAcceptRef.current = true;

      const loggedIn = await login(values.email.toLowerCase(), values.password);
      if (loggedIn) {
        message.success('Logged in! Accepting your invitation...');
      } else {
        message.error('Invalid email or password');
        pendingAcceptRef.current = false;
      }
    } catch (err) {
      if (err.errorFields) return; // form validation
      message.error('Login failed');
      pendingAcceptRef.current = false;
    } finally {
      setLoggingIn(false);
    }
  };
  
  const handleDecline = async () => {
    try {
      setDeclining(true);
      await declineInvitation(token, declineReason || null);
      message.success('Invitation declined');
      setDeclineModalVisible(false);
      navigate('/');
    } catch (err) {
      message.error(err.response?.data?.error || 'Failed to decline invitation');
    } finally {
      setDeclining(false);
    }
  };

  // Password strength indicator
  const passwordValue = Form.useWatch('password', registerForm) || '';
  const getPasswordStrength = (pw) => {
    if (!pw) return { pct: 0, label: '', color: '#d9d9d9' };
    let score = 0;
    if (pw.length >= 8) score++;
    if (/[a-z]/.test(pw)) score++;
    if (/[A-Z]/.test(pw)) score++;
    if (/\d/.test(pw)) score++;
    if (/[@$!%*?&]/.test(pw)) score++;
    if (score <= 2) return { pct: 30, label: 'Weak', color: '#ff4d4f' };
    if (score <= 3) return { pct: 55, label: 'Fair', color: '#faad14' };
    if (score <= 4) return { pct: 80, label: 'Good', color: '#1890ff' };
    return { pct: 100, label: 'Strong', color: '#52c41a' };
  };
  const pwStrength = getPasswordStrength(passwordValue);
  
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Spin size="large" />
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
          {invitation.isGenericLink ? (
            <Alert
              type="info"
              showIcon
              icon={<UserGroupIcon className="w-5 h-5" />}
              message="You've been invited to join a group lesson!"
              description={`${invitation.organizerName} shared this invitation link. Sign in or create an account to accept.`}
              className="mb-6"
            />
          ) : (
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
          )}
          
          {/* Event Details */}
          <Descriptions column={1} bordered className="mb-6">
            {invitation.scheduledDate && (
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
            )}
            
            {invitation.startTime && (
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
            )}
            
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
          
          {/* Registration Notice — for unauthenticated users */}
          {!isAuthenticated && !showRegisterForm && !showLoginForm && (
            <Alert
              type="info"
              showIcon
              message="Join this group lesson"
              description="Review the lesson details below, then click Accept to create your account and join."
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
          
          {/* ── Inline Registration Form ── */}
          {!isAuthenticated && showRegisterForm && (
            <div className="mb-6">
              <div className="text-center mb-4">
                <Title level={4} className="!mb-1">Create Your Account</Title>
                <Text type="secondary">Quick sign up to join this lesson</Text>
              </div>
              <Form form={registerForm} layout="vertical" requiredMark={false} onFinish={handleRegister}>
                <div className="grid grid-cols-2 gap-3">
                  <Form.Item
                    name="first_name"
                    label="First Name"
                    rules={[{ required: true, message: 'Required' }]}
                  >
                    <Input prefix={<UserOutlined className="text-slate-400" />} placeholder="John" size="large" autoComplete="given-name" />
                  </Form.Item>
                  <Form.Item
                    name="last_name"
                    label="Last Name"
                    rules={[{ required: true, message: 'Required' }]}
                  >
                    <Input prefix={<UserOutlined className="text-slate-400" />} placeholder="Doe" size="large" autoComplete="family-name" />
                  </Form.Item>
                </div>
                <Form.Item
                  name="email"
                  label="Email"
                  rules={[
                    { required: true, message: 'Required' },
                    { type: 'email', message: 'Enter a valid email' },
                  ]}
                >
                  <Input prefix={<MailOutlined className="text-slate-400" />} placeholder="you@email.com" size="large" autoComplete="email" />
                </Form.Item>
                <Form.Item
                  name="password"
                  label="Password"
                  rules={[
                    { required: true, message: 'Required' },
                    { min: 8, message: 'Min 8 characters' },
                    { pattern: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])/, message: 'Must include uppercase, lowercase, number & special char' },
                  ]}
                >
                  <Input.Password prefix={<LockOutlined className="text-slate-400" />} placeholder="Create password" size="large" autoComplete="new-password" />
                </Form.Item>
                {passwordValue && (
                  <div className="mb-4 -mt-2">
                    <Progress percent={pwStrength.pct} showInfo={false} strokeColor={pwStrength.color} size="small" />
                    <Text style={{ color: pwStrength.color, fontSize: 12 }}>{pwStrength.label}</Text>
                  </div>
                )}
                <Form.Item
                  name="preferred_currency"
                  label="Preferred Currency"
                  rules={[{ required: true, message: 'Required' }]}
                  extra={<span style={{ color: '#9ca3af', fontSize: 12 }}>All prices and payments will be processed in this currency</span>}
                >
                  <Select
                    placeholder="Select currency"
                    suffixIcon={<DollarOutlined className="text-slate-400" />}
                    showSearch
                    size="large"
                    className="[&_.ant-select-selector]:!rounded-lg"
                    filterOption={(input, option) =>
                      option.label.toLowerCase().includes(input.toLowerCase())
                    }
                  >
                    {currencyOptions.map((c) => (
                      <Option key={c.value} value={c.value} label={c.label}>
                        <span className="flex items-center gap-2">
                          <span>{c.symbol}</span>
                          <span>{c.name}</span>
                          <span className="text-slate-400">({c.value})</span>
                        </span>
                      </Option>
                    ))}
                  </Select>
                </Form.Item>

                <Form.Item
                  name="confirm_password"
                  label="Confirm Password"
                  dependencies={['password']}
                  rules={[
                    { required: true, message: 'Required' },
                    ({ getFieldValue }) => ({
                      validator(_, value) {
                        if (!value || getFieldValue('password') === value) return Promise.resolve();
                        return Promise.reject(new Error('Passwords do not match'));
                      },
                    }),
                  ]}
                >
                  <Input.Password prefix={<LockOutlined className="text-slate-400" />} placeholder="Confirm password" size="large" autoComplete="new-password" />
                </Form.Item>

                <Button
                  type="primary"
                  size="large"
                  block
                  htmlType="submit"
                  loading={registering || accepting}
                  className="!h-12 !rounded-xl !font-bold"
                >
                  {registering ? 'Creating Account...' : accepting ? 'Accepting Invitation...' : 'Create Account & Join'}
                </Button>
              </Form>
              <div className="text-center mt-3">
                <Text type="secondary">Already have an account? </Text>
                <Button type="link" className="!p-0" onClick={() => { setShowRegisterForm(false); setShowLoginForm(true); }}>
                  Log in
                </Button>
              </div>
            </div>
          )}

          {/* ── Inline Login Form ── */}
          {!isAuthenticated && showLoginForm && (
            <div className="mb-6">
              <div className="text-center mb-4">
                <Title level={4} className="!mb-1">Log In</Title>
                <Text type="secondary">Sign in to accept this invitation</Text>
              </div>
              <Form form={loginForm} layout="vertical" requiredMark={false} onFinish={handleLogin}>
                <Form.Item
                  name="email"
                  label="Email"
                  rules={[{ required: true, message: 'Required' }, { type: 'email', message: 'Enter a valid email' }]}
                >
                  <Input prefix={<MailOutlined className="text-slate-400" />} placeholder="you@email.com" size="large" autoComplete="email" />
                </Form.Item>
                <Form.Item
                  name="password"
                  label="Password"
                  rules={[{ required: true, message: 'Required' }]}
                >
                  <Input.Password prefix={<LockOutlined className="text-slate-400" />} placeholder="Your password" size="large" autoComplete="current-password" />
                </Form.Item>
                <Button
                  type="primary"
                  size="large"
                  block
                  htmlType="submit"
                  loading={loggingIn || accepting}
                  className="!h-12 !rounded-xl !font-bold"
                >
                  {loggingIn ? 'Logging in...' : accepting ? 'Accepting Invitation...' : 'Log In & Join'}
                </Button>
              </Form>
              <div className="text-center mt-3">
                <Text type="secondary">Don't have an account? </Text>
                <Button type="link" className="!p-0" onClick={() => { setShowLoginForm(false); setShowRegisterForm(true); }}>
                  Create one
                </Button>
              </div>
            </div>
          )}

          {/* Action Buttons — show when no form is visible */}
          {(!showRegisterForm && !showLoginForm) && (
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
                {isAuthenticated ? 'Accept Invitation' : 'Accept & Join'}
              </Button>
              
              {!isAuthenticated && (
                <Button
                  size="large"
                  type="default"
                  icon={<UserIcon className="w-5 h-5" />}
                  onClick={() => { setShowLoginForm(true); setShowRegisterForm(false); }}
                  className="min-w-[200px]"
                >
                  I have an account
                </Button>
              )}
              
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
          )}
          
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
