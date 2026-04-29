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
  Button,
  Spin,
  Modal,
  Input,
  Form,
  Alert,
  Tag,
  Select,
  Progress,
} from 'antd';
import {
  UserGroupIcon,
  CalendarDaysIcon,
  ClockIcon,
  CurrencyEuroIcon,
  CheckCircleIcon,
  XCircleIcon,
  UserIcon,
  AcademicCapIcon,
  ExclamationCircleIcon,
} from '@heroicons/react/24/outline';
import {
  CheckCircleFilled,
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
import { message } from '@/shared/utils/antdStatic';

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

const InfoTile = ({ icon: Icon, iconBg, iconColor, label, children }) => (
  <div className="flex items-start gap-3">
    <div className={`p-2.5 rounded-xl shrink-0 ${iconBg}`}>
      <Icon className={`w-5 h-5 ${iconColor}`} />
    </div>
    <div className="min-w-0">
      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">{label}</p>
      {children}
    </div>
  </div>
);

const GroupInvitationPage = () => {
  const { token } = useParams();
  const navigate = useNavigate();
  const { user, isAuthenticated, login, refreshToken } = useAuth();
  const { userCurrency, convertCurrency, formatCurrency, formatDualCurrency } = useCurrency();

  const [loading, setLoading] = useState(true);
  const [invitation, setInvitation] = useState(null);
  const [error, setError] = useState(null);
  const [declining, setDeclining] = useState(false);
  const [accepting, setAccepting] = useState(false);
  const [declineModalVisible, setDeclineModalVisible] = useState(false);
  const [declineReason, setDeclineReason] = useState('');

  // Registration / login inline state
  const [activeForm, setActiveForm] = useState(null); // 'register' | 'login' | null
  const [registering, setRegistering] = useState(false);
  const [loggingIn, setLoggingIn] = useState(false);
  const [registerForm] = Form.useForm();
  const [loginForm] = Form.useForm();
  const pendingAcceptRef = useRef(false);
  const [allowedCurrencies, setAllowedCurrencies] = useState([]);

  useEffect(() => { fetchInvitation(); }, [token]);

  useEffect(() => {
    apiClient.get('/settings/registration-currencies')
      .then(r => setAllowedCurrencies(r.data.currencies || ['EUR', 'USD', 'TRY']))
      .catch(() => setAllowedCurrencies(['EUR', 'USD', 'TRY']));
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
      setError(err.response?.data?.error || 'Failed to load invitation');
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

  const handleAccept = () => {
    if (!isAuthenticated) {
      setActiveForm('register');
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
      pendingAcceptRef.current = true;
      const loggedIn = await login(values.email.toLowerCase(), values.password);
      if (loggedIn) {
        message.success(`Welcome, ${values.first_name}! Accepting your invitation...`);
      } else {
        message.error('Account created but auto-login failed. Please log in.');
        setActiveForm('login');
      }
    } catch (err) {
      if (err.response?.data?.code === 'LOGIN_DISABLED') {
        message.info(REGISTRATION_DISABLED_USER_MESSAGE);
      } else if (err.message === SIGN_IN_DISABLED_USER_MESSAGE) {
        message.info(SIGN_IN_DISABLED_USER_MESSAGE);
      } else {
        const msg = err.response?.data?.error || err.message || 'Registration failed';
        if (msg !== 'Validation failed') message.error(msg);
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
      if (err.errorFields) return;
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

  // Password strength
  const passwordValue = Form.useWatch('password', registerForm) || '';
  const pwStrength = (() => {
    if (!passwordValue) return { pct: 0, label: '', color: '#e5e7eb' };
    let s = 0;
    if (passwordValue.length >= 8) s++;
    if (/[a-z]/.test(passwordValue)) s++;
    if (/[A-Z]/.test(passwordValue)) s++;
    if (/\d/.test(passwordValue)) s++;
    if (/[@$!%*?&]/.test(passwordValue)) s++;
    if (s <= 2) return { pct: 30, label: 'Weak', color: '#ef4444' };
    if (s <= 3) return { pct: 55, label: 'Fair', color: '#f59e0b' };
    if (s <= 4) return { pct: 80, label: 'Good', color: '#3b82f6' };
    return { pct: 100, label: 'Strong', color: '#10b981' };
  })();

  const lessonDate = invitation?.scheduledDate ? dayjs(invitation.scheduledDate) : null;
  const diffDays = lessonDate ? lessonDate.startOf('day').diff(dayjs().startOf('day'), 'day') : null;
  const dateChip =
    diffDays === null ? null
    : diffDays === 0 ? { color: 'red', label: 'Today' }
    : diffDays === 1 ? { color: 'orange', label: 'Tomorrow' }
    : diffDays > 1 ? { color: 'blue', label: `In ${diffDays} days` }
    : { color: 'default', label: `${Math.abs(diffDays)} days ago` };

  const priceMeta = (() => {
    if (!invitation) return { formatted: '€0.00', label: 'per person' };
    if (isAuthenticated && convertCurrency) {
      const isPackage = !!invitation.packageId;
      const base = isPackage ? (invitation.packagePrice || 0) : (invitation.pricePerPerson || 0);
      return {
        formatted: formatDualCurrency ? formatDualCurrency(base, invitation.currency) : formatCurrency(base, invitation.currency),
        label: isPackage ? 'package price' : 'per person',
      };
    }
    const amount = invitation.displayPrice || invitation.pricePerPerson || 0;
    const currency = invitation.displayCurrency || invitation.currency || 'EUR';
    return {
      formatted: `${currencySymbols[currency] || currency}${Number(amount).toFixed(2)}`,
      label: invitation.isPackageBooking ? 'package price' : 'per person',
    };
  })();

  const spotsLeft = invitation?.spotsRemaining ?? 0;
  const isFull = spotsLeft <= 0;
  const spotsPercent = invitation
    ? Math.round((invitation.currentParticipants / invitation.maxParticipants) * 100)
    : 0;

  // ── Loading ──────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-sky-50 via-white to-indigo-50 flex items-center justify-center">
        <div className="text-center">
          <Spin size="large" />
          <p className="mt-4 text-sm text-slate-500">Loading your invitation...</p>
        </div>
      </div>
    );
  }

  // ── Error ────────────────────────────────────────────────────────────────
  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-sky-50 via-white to-indigo-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-lg border border-slate-100 p-8 max-w-md w-full text-center">
          <div className="w-16 h-16 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-4">
            <ExclamationCircleIcon className="w-8 h-8 text-red-500" />
          </div>
          <h2 className="text-xl font-bold text-slate-800 mb-2">Invitation Not Found</h2>
          <p className="text-sm text-slate-500 mb-6">{error}</p>
          <Button type="primary" size="large" onClick={() => navigate('/')} className="!rounded-xl !px-8">
            Go to Homepage
          </Button>
        </div>
      </div>
    );
  }

  // ── Main page ────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gradient-to-br from-sky-50 via-white to-indigo-50">
      {/* Hero banner */}
      <div className="bg-gradient-to-r from-sky-600 to-indigo-600 text-white px-4 py-10 text-center">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-white/20 backdrop-blur-sm mb-4">
          <UserGroupIcon className="w-7 h-7 text-white" />
        </div>
        <h1 className="text-2xl sm:text-3xl font-bold mb-1">Group Lesson Invitation</h1>
        <p className="text-sky-100 text-sm">
          <span className="font-semibold text-white">{invitation.organizerName}</span> has invited you to join a group lesson
        </p>
        {invitation.invitationExpiresAt && (
          <p className="text-sky-200 text-xs mt-2">
            Expires {dayjs(invitation.invitationExpiresAt).fromNow()}
          </p>
        )}
      </div>

      <div className="max-w-2xl mx-auto px-4 py-8 space-y-4">

        {/* Main card */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">

          {/* Lesson header */}
          <div className="px-6 pt-6 pb-5 border-b border-slate-100">
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <Tag color="blue" className="!text-xs !font-semibold !px-2 !py-0.5 !m-0">
                {invitation.serviceName}
              </Tag>
              {isFull && <Tag color="red" className="!text-xs !font-semibold !px-2 !py-0.5 !m-0">Full</Tag>}
            </div>
            <h2 className="text-xl font-bold text-slate-800 leading-snug">{invitation.groupTitle}</h2>
            {invitation.groupDescription && (
              <p className="text-sm text-slate-500 mt-1">{invitation.groupDescription}</p>
            )}
          </div>

          {/* Details grid */}
          <div className="px-6 py-5 grid grid-cols-1 sm:grid-cols-2 gap-5 border-b border-slate-100">
            {invitation.scheduledDate && (
              <InfoTile icon={CalendarDaysIcon} iconBg="bg-sky-50" iconColor="text-sky-600" label="Date">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-sm font-semibold text-slate-800">
                    {dayjs(invitation.scheduledDate).format('ddd, MMM D, YYYY')}
                  </span>
                  {dateChip && (
                    <Tag color={dateChip.color} bordered={false} className="!text-[10px] !m-0 !font-medium !px-1.5 !py-0.5">
                      {dateChip.label}
                    </Tag>
                  )}
                </div>
              </InfoTile>
            )}

            {invitation.startTime && (
              <InfoTile icon={ClockIcon} iconBg="bg-amber-50" iconColor="text-amber-500" label="Time">
                <span className="text-sm font-semibold text-slate-800">
                  {invitation.startTime}
                  {invitation.endTime && ` – ${invitation.endTime}`}
                </span>
                {invitation.durationHours > 0 && (
                  <span className="text-xs text-slate-400 ml-1">({invitation.durationHours}h)</span>
                )}
              </InfoTile>
            )}

            <InfoTile icon={CurrencyEuroIcon} iconBg="bg-emerald-50" iconColor="text-emerald-600" label="Investment">
              <span className="text-base font-bold text-emerald-600">{priceMeta.formatted}</span>
              <span className="text-xs text-slate-400 block">{priceMeta.label}</span>
            </InfoTile>

            <InfoTile icon={AcademicCapIcon} iconBg="bg-indigo-50" iconColor="text-indigo-600" label="Instructor">
              <span className="text-sm font-semibold text-slate-800">
                {invitation.instructorName || 'To be assigned'}
              </span>
            </InfoTile>
          </div>

          {/* Spots bar */}
          <div className="px-6 py-4 border-b border-slate-100">
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-1.5">
                <UserGroupIcon className="w-4 h-4 text-purple-500" />
                <span className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Availability</span>
              </div>
              <span className="text-xs font-bold text-slate-700">
                {invitation.currentParticipants} / {invitation.maxParticipants} joined
              </span>
            </div>
            <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${isFull ? 'bg-red-400' : 'bg-emerald-400'}`}
                style={{ width: `${Math.min(spotsPercent, 100)}%` }}
              />
            </div>
            <p className={`text-xs mt-1.5 font-medium ${isFull ? 'text-red-500' : 'text-emerald-600'}`}>
              {isFull ? 'No spots available' : `${spotsLeft} spot${spotsLeft !== 1 ? 's' : ''} remaining`}
            </p>
          </div>

          {/* Auth status / notice */}
          <div className="px-6 py-4">
            {isAuthenticated ? (
              <div className="flex items-center gap-3 rounded-xl bg-emerald-50 border border-emerald-100 px-4 py-3">
                <CheckCircleFilled className="text-emerald-500 text-lg shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-emerald-800">
                    Signed in as {user?.full_name || user?.email}
                  </p>
                  <p className="text-xs text-emerald-600">Click Accept to join this group lesson.</p>
                </div>
              </div>
            ) : activeForm === null ? (
              <div className="rounded-xl bg-sky-50 border border-sky-100 px-4 py-3 text-sm text-sky-700">
                <span className="font-semibold">Join this lesson</span> — accept to create your free account or log in.
              </div>
            ) : null}
          </div>

          {/* ── Inline Register form ── */}
          {!isAuthenticated && activeForm === 'register' && (
            <div className="px-6 pb-6 border-t border-slate-100 pt-5">
              <h3 className="text-base font-bold text-slate-800 mb-0.5">Create Your Account</h3>
              <p className="text-xs text-slate-500 mb-4">Takes 30 seconds — free, no credit card needed.</p>

              <Form form={registerForm} layout="vertical" requiredMark={false} onFinish={handleRegister}>
                <div className="grid grid-cols-2 gap-3">
                  <Form.Item name="first_name" label={<span className="text-xs font-medium text-slate-600">First Name</span>} rules={[{ required: true, message: 'Required' }]} className="!mb-3">
                    <Input prefix={<UserOutlined className="text-slate-300" />} placeholder="John" size="large" autoComplete="given-name" className="!rounded-lg" />
                  </Form.Item>
                  <Form.Item name="last_name" label={<span className="text-xs font-medium text-slate-600">Last Name</span>} rules={[{ required: true, message: 'Required' }]} className="!mb-3">
                    <Input prefix={<UserOutlined className="text-slate-300" />} placeholder="Doe" size="large" autoComplete="family-name" className="!rounded-lg" />
                  </Form.Item>
                </div>
                <Form.Item name="email" label={<span className="text-xs font-medium text-slate-600">Email</span>} rules={[{ required: true, message: 'Required' }, { type: 'email', message: 'Enter a valid email' }]} className="!mb-3">
                  <Input prefix={<MailOutlined className="text-slate-300" />} placeholder="you@email.com" size="large" autoComplete="email" className="!rounded-lg" />
                </Form.Item>
                <Form.Item
                  name="password"
                  label={<span className="text-xs font-medium text-slate-600">Password</span>}
                  rules={[
                    { required: true, message: 'Required' },
                    { min: 8, message: 'Min 8 characters' },
                    { pattern: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])/, message: 'Needs uppercase, lowercase, number & special char' },
                  ]}
                  className="!mb-1"
                >
                  <Input.Password prefix={<LockOutlined className="text-slate-300" />} placeholder="Create a secure password" size="large" autoComplete="new-password" className="!rounded-lg" />
                </Form.Item>
                {passwordValue && (
                  <div className="mb-3">
                    <Progress percent={pwStrength.pct} showInfo={false} strokeColor={pwStrength.color} size="small" className="!mb-0.5" />
                    <span style={{ color: pwStrength.color }} className="text-[11px] font-medium">{pwStrength.label}</span>
                  </div>
                )}
                <Form.Item
                  name="confirm_password"
                  label={<span className="text-xs font-medium text-slate-600">Confirm Password</span>}
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
                  className="!mb-3"
                >
                  <Input.Password prefix={<LockOutlined className="text-slate-300" />} placeholder="Repeat password" size="large" autoComplete="new-password" className="!rounded-lg" />
                </Form.Item>
                <Form.Item
                  name="preferred_currency"
                  label={<span className="text-xs font-medium text-slate-600">Preferred Currency</span>}
                  rules={[{ required: true, message: 'Required' }]}
                  className="!mb-4"
                >
                  <Select placeholder="Select currency" suffixIcon={<DollarOutlined className="text-slate-300" />} showSearch size="large" className="[&_.ant-select-selector]:!rounded-lg"
                    filterOption={(input, option) => option.label.toLowerCase().includes(input.toLowerCase())}
                  >
                    {currencyOptions.map(c => (
                      <Option key={c.value} value={c.value} label={c.label}>
                        <span className="flex items-center gap-2">
                          <span className="font-medium">{c.symbol}</span>
                          <span>{c.name}</span>
                          <span className="text-slate-400 text-xs">({c.value})</span>
                        </span>
                      </Option>
                    ))}
                  </Select>
                </Form.Item>

                <Button
                  type="primary"
                  size="large"
                  block
                  htmlType="submit"
                  loading={registering || accepting}
                  className="!h-11 !rounded-xl !font-semibold !bg-sky-600 hover:!bg-sky-700 !border-sky-600"
                >
                  {registering ? 'Creating Account…' : accepting ? 'Accepting Invitation…' : 'Create Account & Join'}
                </Button>
              </Form>

              <p className="text-center text-xs text-slate-400 mt-3">
                Already have an account?{' '}
                <button className="text-sky-600 font-medium hover:underline" onClick={() => setActiveForm('login')}>Sign in</button>
              </p>
            </div>
          )}

          {/* ── Inline Login form ── */}
          {!isAuthenticated && activeForm === 'login' && (
            <div className="px-6 pb-6 border-t border-slate-100 pt-5">
              <h3 className="text-base font-bold text-slate-800 mb-0.5">Sign In</h3>
              <p className="text-xs text-slate-500 mb-4">Sign in to accept this invitation.</p>

              <Form form={loginForm} layout="vertical" requiredMark={false} onFinish={handleLogin}>
                <Form.Item name="email" label={<span className="text-xs font-medium text-slate-600">Email</span>} rules={[{ required: true, message: 'Required' }, { type: 'email', message: 'Enter a valid email' }]} className="!mb-3">
                  <Input prefix={<MailOutlined className="text-slate-300" />} placeholder="you@email.com" size="large" autoComplete="email" className="!rounded-lg" />
                </Form.Item>
                <Form.Item name="password" label={<span className="text-xs font-medium text-slate-600">Password</span>} rules={[{ required: true, message: 'Required' }]} className="!mb-4">
                  <Input.Password prefix={<LockOutlined className="text-slate-300" />} placeholder="Your password" size="large" autoComplete="current-password" className="!rounded-lg" />
                </Form.Item>
                <Button
                  type="primary"
                  size="large"
                  block
                  htmlType="submit"
                  loading={loggingIn || accepting}
                  className="!h-11 !rounded-xl !font-semibold !bg-sky-600 hover:!bg-sky-700 !border-sky-600"
                >
                  {loggingIn ? 'Signing in…' : accepting ? 'Accepting Invitation…' : 'Sign In & Join'}
                </Button>
              </Form>

              <p className="text-center text-xs text-slate-400 mt-3">
                No account?{' '}
                <button className="text-sky-600 font-medium hover:underline" onClick={() => setActiveForm('register')}>Create one free</button>
              </p>
            </div>
          )}

          {/* ── Action buttons ── */}
          {activeForm === null && (
            <div className="px-6 pb-6 space-y-3">
              <Button
                type="primary"
                size="large"
                block
                icon={<CheckCircleIcon className="w-5 h-5" />}
                onClick={handleAccept}
                loading={accepting}
                disabled={isFull}
                className="!h-12 !rounded-xl !font-semibold !bg-sky-600 hover:!bg-sky-700 !border-sky-600 !text-base flex items-center justify-center gap-2"
              >
                {isAuthenticated ? 'Accept Invitation' : 'Accept & Join'}
              </Button>

              {!isAuthenticated && (
                <Button
                  size="large"
                  block
                  icon={<UserIcon className="w-5 h-5" />}
                  onClick={() => setActiveForm('login')}
                  className="!h-11 !rounded-xl !font-medium flex items-center justify-center gap-2"
                >
                  I already have an account
                </Button>
              )}

              <button
                onClick={() => setDeclineModalVisible(true)}
                className="w-full text-center text-sm text-slate-400 hover:text-red-500 transition-colors py-1 underline underline-offset-2"
              >
                Decline invitation
              </button>
            </div>
          )}

          {/* Back button when form is open */}
          {activeForm !== null && (
            <div className="px-6 pb-4">
              <button
                className="text-xs text-slate-400 hover:text-slate-600 transition-colors"
                onClick={() => setActiveForm(null)}
              >
                ← Back
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-slate-400 pb-4">
          Powered by{' '}
          <Link to="/" className="text-slate-500 hover:text-sky-600 font-medium transition-colors">
            Plannivo
          </Link>
          {' '}· Need help?{' '}
          <Link to="/contact" className="text-slate-500 hover:text-sky-600 transition-colors">
            Contact us
          </Link>
        </p>
      </div>

      {/* Decline modal */}
      <Modal
        title="Decline Invitation"
        open={declineModalVisible}
        onCancel={() => setDeclineModalVisible(false)}
        footer={[
          <Button key="cancel" onClick={() => setDeclineModalVisible(false)}>Cancel</Button>,
          <Button key="confirm" danger loading={declining} onClick={handleDecline}>Confirm Decline</Button>,
        ]}
      >
        <p className="text-sm text-slate-600 mb-3">Are you sure you want to decline this invitation?</p>
        <TextArea
          placeholder="(Optional) Let the organizer know why you can't attend…"
          value={declineReason}
          onChange={e => setDeclineReason(e.target.value)}
          rows={3}
          className="!rounded-lg"
        />
      </Modal>
    </div>
  );
};

export default GroupInvitationPage;
