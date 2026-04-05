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
import relativeTime from 'dayjs/plugin/relativeTime';
import { getInvitationDetails, declineInvitation, acceptInvitation } from '../services/groupBookingService';
import apiClient from '@/shared/services/apiClient';
import {
  REGISTRATION_DISABLED_USER_MESSAGE,
  SIGN_IN_DISABLED_USER_MESSAGE,
} from '@/shared/services/auth/authService';
import { useAuth } from '@/shared/hooks/useAuth';
import { useCurrency } from '@/shared/contexts/CurrencyContext';

const { Title, Text, Paragraph } = Typography;
const { TextArea } = Input;
const { Option } = Select;

dayjs.extend(relativeTime);

const fallbackCurrencies = [
  { label: 'Euro (€)', value: 'EUR', symbol: '€', name: 'Euro' },
  { label: 'US Dollar ($)', value: 'USD', symbol: '$', name: 'US Dollar' },
  { label: 'Turkish Lira (₺)', value: 'TRY', symbol: '₺', name: 'Turkish Lira' },
  { label: 'British Pound (£)', value: 'GBP', symbol: '£', name: 'British Pound' },
  { label: 'Swiss Franc (CHF)', value: 'CHF', symbol: 'CHF', name: 'Swiss Franc' },
];

const currencySymbols = { EUR: '€', USD: '$', TRY: '₺', GBP: '£', CHF: 'CHF' };

const GroupInvitationPage = () => {
  const { token } = useParams();
  const navigate = useNavigate();
  const { user, isAuthenticated, login, refreshToken } = useAuth();
  const { userCurrency, convertCurrency, formatCurrency } = useCurrency();
  
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
      
      if (response.roleUpgrade?.upgraded && refreshToken) {
        await refreshToken();
      }
      
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
      if (err.response?.data?.code === 'LOGIN_DISABLED') {
        message.info(REGISTRATION_DISABLED_USER_MESSAGE);
      } else if (err.message === SIGN_IN_DISABLED_USER_MESSAGE) {
        message.info(SIGN_IN_DISABLED_USER_MESSAGE);
      } else {
        const errorMessage = err.response?.data?.error || err.message || 'Registration failed';
        if (errorMessage !== 'Validation failed') {
          message.error(errorMessage);
        }
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
      if (err.message === SIGN_IN_DISABLED_USER_MESSAGE) {
        message.info(SIGN_IN_DISABLED_USER_MESSAGE);
      } else {
        message.error('Login failed');
      }
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

  const lessonDate = invitation?.scheduledDate ? dayjs(invitation.scheduledDate) : null;
  const now = dayjs();
  const diffDays = lessonDate ? lessonDate.startOf('day').diff(now.startOf('day'), 'day') : null;
  const dateChip = diffDays === null
    ? null
    : diffDays === 0
      ? { color: 'red', label: 'Today' }
      : diffDays === 1
        ? { color: 'orange', label: 'Tomorrow' }
        : diffDays > 1
          ? { color: 'blue', label: `In ${diffDays} days` }
          : { color: 'default', label: `${Math.abs(diffDays)} days ago` };

  const priceMeta = (() => {
    if (!invitation) {
      return { amount: 0, currency: 'EUR', label: 'per person', formatted: '€0.00' };
    }

    if (isAuthenticated && convertCurrency) {
      const isPackage = !!invitation.packageId;
      const basePrice = isPackage ? (invitation.packagePrice || 0) : (invitation.pricePerPerson || 0);
      const converted = convertCurrency(basePrice, invitation.currency, userCurrency);
      return {
        amount: converted,
        currency: userCurrency,
        label: isPackage ? 'package price' : 'per person',
        formatted: formatCurrency ? formatCurrency(converted, userCurrency) : `${userCurrency} ${converted.toFixed(2)}`,
      };
    }

    const amount = invitation.displayPrice || invitation.pricePerPerson || 0;
    const currency = invitation.displayCurrency || invitation.currency || 'EUR';
    const symbol = currencySymbols[currency] || currency;
    return {
      amount,
      currency,
      label: invitation.isPackageBooking ? 'package price' : 'per person',
      formatted: `${symbol}${amount.toFixed(2)}`,
    };
  })();
  
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
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
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
            {invitation.organizerName} has invited you to join a group lesson
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
              message={<span><strong>{invitation.organizerName}</strong> invited you to join a group lesson!</span>}
              description={invitation.invitationExpiresAt && (
                <span className="text-xs text-slate-500">This invitation expires {dayjs(invitation.invitationExpiresAt).fromNow()}</span>
              )}
              className="mb-6"
            />
          ) : (
            <Alert
              type="info"
              showIcon
              icon={<UserIcon className="w-5 h-5" />}
              message={<span>Hello <strong>{invitation.fullName || invitation.email}</strong>!</span>}
              description={
                <span>
                  <strong>{invitation.organizerName}</strong> has invited you to join this group lesson.
                  {invitation.invitationExpiresAt && (
                    <span className="block mt-1 text-xs text-slate-500">This invitation expires {dayjs(invitation.invitationExpiresAt).fromNow()}</span>
                  )}
                </span>
              }
              className="mb-6"
            />
          )}

          {/* Event Details */}
          <div className="bg-slate-50/80 rounded-2xl p-5 mb-8 border border-slate-100 flex flex-col gap-4">
            {/* Row 1: Date & Time */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {invitation.scheduledDate && (
                <div className="flex items-start gap-3">
                  <div className="p-2 bg-blue-100 text-blue-600 rounded-lg shrink-0">
                    <CalendarIcon className="w-5 h-5" />
                  </div>
                  <div>
                    <Text type="secondary" className="block text-[11px] font-semibold uppercase tracking-wider mb-0.5">Date</Text>
                    <div className="flex flex-wrap items-center gap-2">
                      <Text strong className="text-sm text-slate-800">{dayjs(invitation.scheduledDate).format('dddd, MMMM D, YYYY')}</Text>
                      {dateChip && <Tag color={dateChip.color} bordered={false} className="m-0 font-medium text-xs">{dateChip.label}</Tag>}
                    </div>
                  </div>
                </div>
              )}

              {invitation.startTime && (
                <div className="flex items-start gap-3">
                  <div className="p-2 bg-amber-100 text-amber-600 rounded-lg shrink-0">
                    <ClockIcon className="w-5 h-5" />
                  </div>
                  <div>
                    <Text type="secondary" className="block text-[11px] font-semibold uppercase tracking-wider mb-0.5">Time</Text>
                    <Text strong className="text-sm text-slate-800">
                      {invitation.startTime}
                      {invitation.endTime && ` - ${invitation.endTime}`}
                      {invitation.durationHours > 0 && (
                        <Text type="secondary" className="font-normal ml-1 text-xs">({invitation.durationHours}h)</Text>
                      )}
                    </Text>
                  </div>
                </div>
              )}
            </div>

            <div className="h-px bg-slate-200/60 w-full" />

            {/* Row 2: Availability, Investment, Instructor */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="flex items-start gap-3">
                <div className="p-2 bg-purple-100 text-purple-600 rounded-lg shrink-0">
                  <UserGroupIcon className="w-5 h-5" />
                </div>
                <div>
                  <Text type="secondary" className="block text-[11px] font-semibold uppercase tracking-wider mb-0.5">Availability</Text>
                  <div className="flex flex-col gap-1 mt-0.5">
                    <Text strong className="text-sm text-slate-700 leading-none">{invitation.currentParticipants} / {invitation.maxParticipants} Joined</Text>
                    {invitation.spotsRemaining > 0 ? (
                      <Tag color="success" bordered={false} className="m-0 text-[10px] w-fit leading-tight py-0.5 px-1.5">
                        {invitation.spotsRemaining} spot{invitation.spotsRemaining !== 1 && 's'} left
                      </Tag>
                    ) : (
                      <Tag color="error" bordered={false} className="m-0 text-[10px] w-fit leading-tight py-0.5 px-1.5">Full</Tag>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="p-2 bg-emerald-100 text-emerald-600 rounded-lg shrink-0">
                  <CurrencyEuroIcon className="w-5 h-5" />
                </div>
                <div>
                  <Text type="secondary" className="block text-[11px] font-semibold uppercase tracking-wider mb-0.5">Investment</Text>
                  <div className="flex flex-col">
                    <Text strong className="text-base text-emerald-600 leading-tight">{priceMeta.formatted}</Text>
                    <Text type="secondary" className="text-[11px] mt-0.5">{priceMeta.label}</Text>
                  </div>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="p-2 bg-indigo-100 text-indigo-600 rounded-lg shrink-0">
                  <AcademicCapIcon className="w-5 h-5" />
                </div>
                <div>
                  <Text type="secondary" className="block text-[11px] font-semibold uppercase tracking-wider mb-0.5">Instructor</Text>
                  <Text strong className="text-sm text-slate-800 leading-tight block mt-0.5">{invitation.instructorName || 'To be assigned'}</Text>
                </div>
              </div>
            </div>
          </div>

          {/* Registration Notice — for unauthenticated users */}
          {!isAuthenticated && !showRegisterForm && !showLoginForm && (
            <Alert
              type="info"
              showIcon
              message="Join this group lesson"
              description="Click Accept to create your account and join. Your chosen currency will be used for all payments."
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
