/**
 * Group Booking Detail Page
 * 
 * Shows detailed view of a group booking:
 * - Event details
 * - Participants list
 * - Payment functionality
 * - Invite participants (if organizer)
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Typography,
  Button,
  Space,
  Spin,
  Result,
  Modal,
  Input,
  Alert,
  Tag,
  Avatar,
  App,
  Form,
  Tooltip,
  Popconfirm
} from 'antd';
import {
  UserGroupIcon,
  CalendarIcon,
  ClockIcon,
  CurrencyEuroIcon,
  PlusIcon,
  UserIcon,
  EnvelopeIcon,
  TrashIcon,
  ArrowLeftIcon,
  CreditCardIcon,
  ClipboardDocumentIcon,
  ShareIcon,
  LinkIcon
} from '@heroicons/react/24/outline';
import dayjs from 'dayjs';
import { 
  getGroupBookingDetails, 
  inviteParticipants, 
  payForGroupBooking,
  payForAllParticipants,
  cancelGroupBooking,
  removeParticipant
} from '../services/groupBookingService';
import { WalletOutlined, CreditCardOutlined, ShopOutlined } from '@ant-design/icons';
import { useAuth } from '@/shared/hooks/useAuth';
import { useCurrency } from '@/shared/contexts/CurrencyContext';
import { useWalletSummary } from '@/shared/hooks/useWalletSummary';
import { useRealTimeEvents } from '@/shared/hooks/useRealTime';
import { WalletDepositModal } from '@/features/finances/components/WalletDepositModal';
import IyzicoPaymentModal from '@/shared/components/IyzicoPaymentModal';
import { PAY_AT_CENTER_ALLOWED_ROLES } from '@/shared/utils/roleUtils';

const { Title, Text, Paragraph } = Typography;
const { TextArea } = Input;

const GroupBookingDetailPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, refreshToken } = useAuth();
  const { message } = App.useApp();
  const { userCurrency, convertCurrency, formatCurrency } = useCurrency();
  
  const { data: walletSummary, refetch: refetchWallet } = useWalletSummary({
    currency: userCurrency,
    enabled: !!user?.id,
  });
  
  const walletBalance = useMemo(() => {
    const allBalances = walletSummary?.balances;
    if (Array.isArray(allBalances) && allBalances.length > 0) {
      return allBalances.reduce((sum, row) => {
        const amt = Number(row.available) || 0;
        if (amt === 0) return sum;
        if (row.currency === userCurrency || !convertCurrency) return sum + amt;
        return sum + convertCurrency(amt, row.currency, userCurrency);
      }, 0);
    }
    return Number(walletSummary?.available) || 0;
  }, [walletSummary, convertCurrency, userCurrency]);
  
  const [loading, setLoading] = useState(true);
  const [booking, setBooking] = useState(null);
  const [error, setError] = useState(null);
  
  // Invite modal
  const [inviteModalVisible, setInviteModalVisible] = useState(false);
  const [inviteForm] = Form.useForm();
  const [inviting, setInviting] = useState(false);
  
  // Payment
  const [depositModalVisible, setDepositModalVisible] = useState(false);
  const [paying, setPaying] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState('wallet');
  const [showIyzicoModal, setShowIyzicoModal] = useState(false);
  const [iyzicoPaymentUrl, setIyzicoPaymentUrl] = useState(null);
  
  // Cancel modal
  const [cancelModalVisible, setCancelModalVisible] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [cancelReason, setCancelReason] = useState('');

  // Listen for real-time participant payment events
  const PAYMENT_EVENTS = useMemo(() => ['group_booking:participant_paid'], []);
  const realTimeData = useRealTimeEvents(PAYMENT_EVENTS);
  const lastPaymentEvent = realTimeData['group_booking:participant_paid'];
  
  useEffect(() => {
    if (lastPaymentEvent?.data?.groupBookingId === id) {
      message.success(`${lastPaymentEvent.data.participantName} has paid!`);
      fetchBooking();
    }
  }, [lastPaymentEvent]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchBooking = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await getGroupBookingDetails(id);
      setBooking(response.groupBooking);
      
      // Auto-open payment modal if ?pay=true
      if (searchParams.get('pay') === 'true') {
        setDepositModalVisible(true);
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load group booking');
    } finally {
      setLoading(false);
    }
  }, [id, searchParams]);
  
  useEffect(() => {
    fetchBooking();
  }, [fetchBooking]);
  
  const handleInvite = async (values) => {
    try {
      setInviting(true);
      
      // Parse email list
      const participants = values.emails
        .split(/[\n,]/)
        .map(line => line.trim())
        .filter(line => line)
        .map(email => ({ email }));
      
      if (participants.length === 0) {
        message.error('Please enter at least one email address');
        return;
      }
      
      const response = await inviteParticipants(id, participants);
      message.success(`${response.invitations?.length || 0} invitation(s) sent`);
      setInviteModalVisible(false);
      inviteForm.resetFields();
      fetchBooking();
    } catch (err) {
      message.error(err.response?.data?.error || 'Failed to send invitations');
    } finally {
      setInviting(false);
    }
  };
  
  const handleDepositSuccess = async () => {
    try {
      if (booking?.paymentModel === 'organizer_pays' && booking?.isOrganizer) {
        const result = await payForAllParticipants(id, 'wallet');
        const paidAmount = convertCurrency && formatCurrency ? formatCurrency(convertCurrency(result.totalAmount || 0, 'EUR', userCurrency), userCurrency) : `€${result.totalAmount?.toFixed(2)}`;
        message.success(`Payment successful! Paid ${paidAmount} for ${result.participantCount} participants.`);
        if (result?.roleUpgrade?.upgraded) await refreshToken();
      } else {
        const payResult = await payForGroupBooking(id, 'wallet');
        message.success('Payment successful!');
        if (payResult?.roleUpgrade?.upgraded) {
          message.success(payResult.roleUpgrade.message);
          await refreshToken();
        }
      }
      refetchWallet();
      fetchBooking();
    } catch (err) {
      const errMsg = err.response?.data?.error;
      message.error(typeof errMsg === 'string' ? errMsg : 'Deposit succeeded but wallet payment failed. Please try paying from your wallet.');
    }
  };

  const canPayLater = PAY_AT_CENTER_ALLOWED_ROLES.includes(user?.role);

  const handleIyzicoSuccess = useCallback(async () => {
    setShowIyzicoModal(false);
    setIyzicoPaymentUrl(null);
    message.success('Payment confirmed!');
    try { await refreshToken(); } catch { /* non-blocking */ }
    refetchWallet();
    fetchBooking();
  }, [refreshToken, refetchWallet, fetchBooking, message]);

  const handlePay = async () => {
    const isOrgPays = booking?.paymentModel === 'organizer_pays' && booking?.isOrganizer && !booking?.organizerPaid;
    const accepted = booking?.participants?.filter(p => ['accepted', 'paid'].includes(p.status)).length || 0;
    const unitPrice = booking?.packageId ? (booking.packagePrice || 0) : (booking?.pricePerPerson || 0);
    const amountEur = isOrgPays ? (accepted * unitPrice) : unitPrice;
    const amountInUserCurrency = convertCurrency ? convertCurrency(amountEur, 'EUR', userCurrency) : amountEur;

    // Credit card → Iyzico
    if (paymentMethod === 'credit_card') {
      try {
        setPaying(true);
        const result = isOrgPays
          ? await payForAllParticipants(id, 'credit_card')
          : await payForGroupBooking(id, 'credit_card');
        if (result.paymentPageUrl) {
          setIyzicoPaymentUrl(result.paymentPageUrl);
          setShowIyzicoModal(true);
        } else {
          message.error('Failed to initiate card payment');
        }
      } catch (err) {
        message.error(err.response?.data?.error || 'Failed to initiate payment');
      } finally {
        setPaying(false);
      }
      return;
    }

    // Pay at center → pay_later
    if (paymentMethod === 'pay_later') {
      try {
        setPaying(true);
        const result = isOrgPays
          ? await payForAllParticipants(id, 'pay_later')
          : await payForGroupBooking(id, 'pay_later');
        message.success('Booking confirmed! Pay at the center.');
        if (result?.roleUpgrade?.upgraded) await refreshToken();
        refetchWallet();
        fetchBooking();
      } catch (err) {
        message.error(err.response?.data?.error || 'Payment failed');
      } finally {
        setPaying(false);
      }
      return;
    }

    // Wallet flow
    if (walletBalance >= amountInUserCurrency) {
      try {
        setPaying(true);
        if (isOrgPays) {
          const result = await payForAllParticipants(id, 'wallet');
          const paidAmount = convertCurrency && formatCurrency ? formatCurrency(convertCurrency(result.totalAmount || 0, 'EUR', userCurrency), userCurrency) : `\u20AC${result.totalAmount?.toFixed(2)}`;
          message.success(`Payment successful! Paid ${paidAmount} for ${result.participantCount} participants.`);
          if (result?.roleUpgrade?.upgraded) {
            message.success(result.roleUpgrade.message);
            await refreshToken();
          }
        } else {
          const payResult = await payForGroupBooking(id, 'wallet');
          message.success('Payment successful!');
          if (payResult?.roleUpgrade?.upgraded) {
            message.success(payResult.roleUpgrade.message);
            await refreshToken();
          }
        }
        refetchWallet();
        fetchBooking();
      } catch (err) {
        const errMsg = err.response?.data?.error;
        message.error(typeof errMsg === 'string' ? errMsg : 'Payment failed');
      } finally {
        setPaying(false);
      }
    } else {
      setDepositModalVisible(true);
    }
  };
  
  const handleCancel = async () => {
    try {
      setCancelling(true);
      await cancelGroupBooking(id, cancelReason || null);
      message.success('Group booking cancelled');
      setCancelModalVisible(false);
      navigate('/student/group-bookings');
    } catch (err) {
      message.error(err.response?.data?.error || 'Failed to cancel booking');
    } finally {
      setCancelling(false);
    }
  };
  
  const handleRemoveParticipant = async (participantId) => {
    try {
      await removeParticipant(id, participantId);
      message.success('Participant removed');
      fetchBooking();
    } catch (err) {
      message.error(err.response?.data?.error || 'Failed to remove participant');
    }
  };
  
  const getStatusColor = (status) => {
    const colors = {
      'invited': 'blue',
      'accepted': 'cyan',
      'declined': 'red',
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
  
  // Find current user's participant record
  const myParticipant = booking?.participants?.find(p => p.userId === user?.id);
  
  // Determine if payment is needed based on payment model
  const isOrganizerPaysModel = booking?.paymentModel === 'organizer_pays';
  const organizerNeedsToPay = isOrganizerPaysModel && booking?.isOrganizer && !booking?.organizerPaid;
  const participantNeedsToPay = !isOrganizerPaysModel && myParticipant?.paymentStatus === 'pending';
  const needsPayment = (organizerNeedsToPay || participantNeedsToPay) && booking?.status !== 'cancelled';
  
  // Calculate total for organizer_pays model
  const acceptedCount = booking?.participants?.filter(p => ['accepted', 'paid'].includes(p.status)).length || 0;
  const isPackageBooking = !!booking?.packageId;
  
  const displayPriceBase = isPackageBooking ? (booking.packagePrice || 0) : (booking?.pricePerPerson || 0);
  const totalForOrganizerBase = acceptedCount * displayPriceBase;
  const displayLabel = isPackageBooking ? 'package price' : 'per person';
  
  const displayPrice = convertCurrency ? convertCurrency(displayPriceBase, 'EUR', userCurrency) : displayPriceBase;
  const formattedDisplayPrice = formatCurrency ? formatCurrency(displayPrice, userCurrency) : `€${displayPrice.toFixed(2)}`;
  
  const totalForOrganizer = convertCurrency ? convertCurrency(totalForOrganizerBase, 'EUR', userCurrency) : totalForOrganizerBase;
  const formattedTotalForOrganizer = formatCurrency ? formatCurrency(totalForOrganizer, userCurrency) : `€${totalForOrganizer.toFixed(2)}`;
  
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Spin size="large" />
      </div>
    );
  }
  
  if (error) {
    return (
      <div className="max-w-2xl mx-auto p-4">
        <Result
          status="error"
          title="Error Loading Group Booking"
          subTitle={error}
          extra={
            <Button type="primary" onClick={() => navigate('/student/group-bookings')}>
              Back to My Group Lessons
            </Button>
          }
        />
      </div>
    );
  }
  
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50/40 py-6 px-4">
      <div className="max-w-3xl mx-auto">
        {/* Back Button */}
        <Button
          type="text"
          icon={<ArrowLeftIcon className="w-4 h-4" />}
          onClick={() => navigate('/student/group-bookings')}
          className="mb-4 !text-slate-500 hover:!text-slate-800"
        >
          Back to Group Lessons
        </Button>

        {/* ── Hero Header ── */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200/60 p-6 mb-4">
          <div className="flex flex-col sm:flex-row justify-between gap-4">
            <div className="flex items-start gap-4">
              <div className="w-14 h-14 rounded-xl bg-blue-100 flex items-center justify-center shrink-0">
                <UserGroupIcon className="w-7 h-7 text-blue-600" />
              </div>
              <div>
                <Title level={3} className="!mb-1.5 !text-slate-900">{booking.title}</Title>
                <div className="flex flex-wrap gap-1.5">
                  <Tag color="blue" className="!rounded-full !text-xs !px-3">{booking.serviceName}</Tag>
                  <Tag color={getStatusColor(booking.status)} className="!rounded-full !text-xs !px-3">
                    {booking.status.replace('_', ' ')}
                  </Tag>
                  {booking.isOrganizer && (
                    <Tag color="gold" className="!rounded-full !text-xs !px-3">Organizer</Tag>
                  )}
                  <Tag color={isOrganizerPaysModel ? 'purple' : 'cyan'} className="!rounded-full !text-xs !px-3">
                    {isOrganizerPaysModel ? 'Organizer Pays' : 'Individual Payment'}
                  </Tag>
                </div>
              </div>
            </div>
            <div className="text-right shrink-0">
              <span className="text-3xl font-extrabold text-emerald-600">{formattedDisplayPrice}</span>
              <Text type="secondary" className="block text-xs mt-0.5">{displayLabel}</Text>
            </div>
          </div>
          {booking.description && (
            <Paragraph className="mt-4 !mb-0 text-slate-500 text-sm">
              {booking.description}
            </Paragraph>
          )}
        </div>

        {/* ── Payment Section ── */}
        {needsPayment && (
          <div className="bg-white rounded-2xl shadow-sm border border-amber-200 p-5 mb-4">
            <div className="flex items-start gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center shrink-0 mt-0.5">
                <CreditCardIcon className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <Text strong className="text-amber-900 block">
                  {organizerNeedsToPay ? 'Pay for Your Group' : 'Payment Required'}
                </Text>
                <Text className="text-amber-700 text-sm">
                  {organizerNeedsToPay
                    ? `As the organizer, you'll pay for all ${acceptedCount} participant(s). Total: ${formattedTotalForOrganizer}`
                    : 'Complete your payment to confirm your spot.'}
                </Text>
              </div>
            </div>

            {/* Payment method selector */}
            <p className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
              Payment Method
            </p>
            <div className={`grid gap-2 mb-4 ${canPayLater ? 'grid-cols-3' : 'grid-cols-2'}`}>
              {[
                { key: 'wallet', icon: <WalletOutlined />, label: 'Wallet', sub: formatCurrency ? formatCurrency(walletBalance, userCurrency) : `${walletBalance.toFixed(2)}` },
                { key: 'credit_card', icon: <CreditCardOutlined />, label: 'Card', sub: 'Iyzico' },
                ...(canPayLater ? [{ key: 'pay_later', icon: <ShopOutlined />, label: 'At Center', sub: 'Pay later' }] : []),
              ].map(({ key, icon, label, sub }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setPaymentMethod(key)}
                  className={`flex flex-col items-center gap-1 p-3 rounded-xl border-2 transition-all cursor-pointer ${
                    paymentMethod === key
                      ? 'border-blue-500 bg-blue-50/80 shadow-sm'
                      : 'border-slate-200 bg-white hover:border-slate-300'
                  }`}
                >
                  <span className={`text-lg ${paymentMethod === key ? 'text-blue-600' : 'text-slate-400'}`}>{icon}</span>
                  <span className={`text-xs font-semibold ${paymentMethod === key ? 'text-blue-700' : 'text-slate-600'}`}>{label}</span>
                  <span className={`text-[10px] ${paymentMethod === key ? 'text-blue-500' : 'text-slate-400'}`}>{sub}</span>
                </button>
              ))}
            </div>

            {paymentMethod === 'wallet' && walletBalance < (organizerNeedsToPay ? totalForOrganizer : displayPrice) && (
              <div className="mb-3 text-xs text-amber-600 bg-amber-50 rounded-lg px-3 py-2">
                Insufficient wallet balance. You'll be prompted to top up first.
              </div>
            )}

            <Button
              type="primary"
              size="large"
              block
              loading={paying}
              onClick={handlePay}
              className="!h-12 !rounded-xl !font-bold"
              icon={paymentMethod === 'wallet' ? <WalletOutlined /> : paymentMethod === 'credit_card' ? <CreditCardOutlined /> : <ShopOutlined />}
            >
              {paymentMethod === 'pay_later'
                ? 'Confirm — Pay at Center'
                : paymentMethod === 'credit_card'
                  ? `Pay ${organizerNeedsToPay ? formattedTotalForOrganizer : formattedDisplayPrice} with Card`
                  : `Pay ${organizerNeedsToPay ? formattedTotalForOrganizer : formattedDisplayPrice}`}
            </Button>
          </div>
        )}

        {/* ── Status Alerts ── */}
        {booking?.isOrganizer && booking.status === 'pending' && (
          <Alert
            type="info"
            showIcon
            className="!rounded-2xl mb-4"
            message="Waiting for participants"
            description={
              <span>
                {acceptedCount} of {booking.minParticipants} minimum accepted.
                {acceptedCount >= booking.minParticipants
                  ? ' Minimum participants reached!'
                  : ` Need ${booking.minParticipants - acceptedCount} more.`}
              </span>
            }
          />
        )}

        {!booking?.isOrganizer && booking.status === 'pending' && (
          <Alert
            type="info"
            showIcon
            className="!rounded-2xl mb-4"
            message="Booking pending"
            description="The organizer is collecting participants. You'll be notified when the booking is confirmed."
          />
        )}

        {isOrganizerPaysModel && !booking?.isOrganizer && (
          <Alert
            type="info"
            showIcon
            className="!rounded-2xl mb-4"
            message="Organizer Pays"
            description="The organizer will cover payment for all participants."
          />
        )}

        {/* ── Lesson Details ── */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200/60 p-6 mb-4">
          <Title level={5} className="!mb-4 !text-slate-700">Lesson Details</Title>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* Date */}
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
                <CalendarIcon className="w-4.5 h-4.5 text-blue-500" />
              </div>
              <div>
                <Text type="secondary" className="text-[11px] uppercase tracking-wider font-semibold block">Date</Text>
                <Text strong className="text-sm">{dayjs(booking.scheduledDate).format('ddd, MMM D, YYYY')}</Text>
              </div>
            </div>
            {/* Time */}
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-lg bg-violet-50 flex items-center justify-center shrink-0">
                <ClockIcon className="w-4.5 h-4.5 text-violet-500" />
              </div>
              <div>
                <Text type="secondary" className="text-[11px] uppercase tracking-wider font-semibold block">Time</Text>
                <Text strong className="text-sm">
                  {booking.startTime}{booking.endTime ? ` – ${booking.endTime}` : ''}
                  {booking.durationHours > 0 && <Text type="secondary" className="text-xs"> ({booking.durationHours}h)</Text>}
                </Text>
              </div>
            </div>
            {/* Instructor */}
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-lg bg-emerald-50 flex items-center justify-center shrink-0">
                <UserIcon className="w-4.5 h-4.5 text-emerald-500" />
              </div>
              <div>
                <Text type="secondary" className="text-[11px] uppercase tracking-wider font-semibold block">Instructor</Text>
                <Text strong className="text-sm">{booking.instructorName || 'To be assigned'}</Text>
              </div>
            </div>
          </div>

          {/* Second row */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-4 pt-4 border-t border-slate-100">
            {/* Organizer */}
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-lg bg-amber-50 flex items-center justify-center shrink-0">
                <EnvelopeIcon className="w-4.5 h-4.5 text-amber-500" />
              </div>
              <div>
                <Text type="secondary" className="text-[11px] uppercase tracking-wider font-semibold block">Organizer</Text>
                <Text strong className="text-sm">{booking.organizerName}</Text>
                <Text type="secondary" className="text-xs block">{booking.organizerEmail}</Text>
              </div>
            </div>
            {/* Participants */}
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-lg bg-cyan-50 flex items-center justify-center shrink-0">
                <UserGroupIcon className="w-4.5 h-4.5 text-cyan-500" />
              </div>
              <div>
                <Text type="secondary" className="text-[11px] uppercase tracking-wider font-semibold block">Participants</Text>
                <Text strong className="text-sm">{booking.participantCount} / {booking.maxParticipants}</Text>
                <Text type="secondary" className="text-xs block">min: {booking.minParticipants}</Text>
              </div>
            </div>
            {/* Price */}
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-lg bg-green-50 flex items-center justify-center shrink-0">
                <CurrencyEuroIcon className="w-4.5 h-4.5 text-green-500" />
              </div>
              <div>
                <Text type="secondary" className="text-[11px] uppercase tracking-wider font-semibold block">Price</Text>
                <Text strong className="text-sm text-emerald-600">{formattedDisplayPrice}</Text>
                <Text type="secondary" className="text-xs block">{displayLabel}</Text>
              </div>
            </div>
          </div>

          {/* Deadlines */}
          {(booking.registrationDeadline || booking.paymentDeadline) && (
            <div className="mt-4 pt-4 border-t border-slate-100 flex flex-wrap gap-6">
              {booking.registrationDeadline && (
                <div>
                  <Text type="secondary" className="text-[11px] uppercase tracking-wider font-semibold block">Registration Deadline</Text>
                  <Text className="text-sm">{dayjs(booking.registrationDeadline).format('MMM D, YYYY HH:mm')}</Text>
                </div>
              )}
              {booking.paymentDeadline && (
                <div>
                  <Text type="secondary" className="text-[11px] uppercase tracking-wider font-semibold block">Payment Deadline</Text>
                  <Text className="text-sm">{dayjs(booking.paymentDeadline).format('MMM D, YYYY HH:mm')}</Text>
                </div>
              )}
            </div>
          )}

          {booking.notes && (
            <div className="mt-4 pt-4 border-t border-slate-100">
              <Text type="secondary" className="text-[11px] uppercase tracking-wider font-semibold block mb-1">Notes</Text>
              <Paragraph className="!mb-0 text-sm text-slate-600">{booking.notes}</Paragraph>
            </div>
          )}
        </div>

        {/* ── Participants ── */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200/60 p-6 mb-4">
          <div className="flex items-center justify-between mb-4">
            <Title level={5} className="!mb-0 !text-slate-700">
              Participants ({booking.participantCount}/{booking.maxParticipants})
            </Title>
            {booking.isOrganizer && booking.status !== 'cancelled' && (
              <Button
                type="primary"
                size="small"
                icon={<PlusIcon className="w-3.5 h-3.5" />}
                onClick={() => setInviteModalVisible(true)}
                disabled={booking.participantCount >= booking.maxParticipants}
                className="!rounded-lg"
              >
                Invite
              </Button>
            )}
          </div>

          <div className="space-y-3">
            {booking.participants?.map((p) => (
              <div key={p.id} className="flex items-center justify-between p-3 rounded-xl bg-slate-50/80 border border-slate-100">
                <div className="flex items-center gap-3">
                  <Avatar size={36} className="bg-blue-100 text-blue-600 shrink-0" icon={<UserIcon className="w-4 h-4" />} />
                  <div>
                    <div className="flex items-center gap-1.5">
                      <Text strong className="text-sm">{p.fullName || 'Pending'}</Text>
                      {p.isOrganizer && <Tag color="gold" className="!rounded-full !text-[10px] !px-2 !py-0 !leading-4">Organizer</Tag>}
                    </div>
                    <Text type="secondary" className="text-xs block">{p.email}</Text>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Tag color={getStatusColor(p.status)} className="!rounded-full !text-xs !m-0">{p.status}</Tag>
                  <Tag color={getPaymentStatusColor(p.paymentStatus)} className="!rounded-full !text-xs !m-0">
                    {p.paymentStatus}
                    {p.paymentStatus === 'paid' && p.amountPaid > 0 && (
                      ` ${formatCurrency ? formatCurrency(convertCurrency ? convertCurrency(p.amountPaid, 'EUR', userCurrency) : p.amountPaid, userCurrency) : '€' + p.amountPaid.toFixed(2)}`
                    )}
                  </Tag>
                  {booking.isOrganizer && !p.isOrganizer && (
                    <Popconfirm
                      title="Remove participant?"
                      description="If they've paid, they will be refunded."
                      onConfirm={() => handleRemoveParticipant(p.id)}
                      okText="Remove"
                      cancelText="Cancel"
                    >
                      <Button type="text" danger size="small" icon={<TrashIcon className="w-3.5 h-3.5" />} className="!rounded-lg" />
                    </Popconfirm>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Stats row */}
          <div className="mt-4 pt-3 border-t border-slate-100 flex gap-3 flex-wrap">
            <Tag color="blue" className="!rounded-full !text-xs">
              {booking.participants?.filter(p => p.status === 'accepted').length || 0} Accepted
            </Tag>
            <Tag color="orange" className="!rounded-full !text-xs">
              {booking.participants?.filter(p => p.status === 'invited').length || 0} Pending
            </Tag>
            <Tag color="green" className="!rounded-full !text-xs">
              {booking.paidCount} Paid
            </Tag>
          </div>
        </div>

        {/* ── Share Invite Link ── */}
        {booking.isOrganizer && booking.status !== 'cancelled' && booking.status !== 'completed' && (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200/60 p-6 mb-4">
            <div className="flex items-center gap-2 mb-3">
              <ShareIcon className="w-4.5 h-4.5 text-slate-500" />
              <Title level={5} className="!mb-0 !text-slate-700">Share Invite Link</Title>
            </div>
            <Text type="secondary" className="text-sm block mb-3">
              Share this link with friends so they can join — even without an account.
            </Text>
            {(() => {
              const invitedParticipant = booking.participants?.find(p => p.invitationToken && p.status === 'invited');
              const baseUrl = window.location.origin;

              if (invitedParticipant) {
                const inviteLink = `${baseUrl}/group-invitation/${invitedParticipant.invitationToken}`;
                return (
                  <div className="flex gap-2">
                    <Input
                      value={inviteLink}
                      readOnly
                      className="flex-1 !rounded-xl"
                      addonBefore={<LinkIcon className="w-4 h-4" />}
                    />
                    <Tooltip title="Copy to clipboard">
                      <Button
                        type="primary"
                        icon={<ClipboardDocumentIcon className="w-4 h-4" />}
                        className="!rounded-xl"
                        onClick={() => {
                          navigator.clipboard.writeText(inviteLink).then(() => {
                            message.success('Invite link copied!');
                          }).catch(() => {
                            const textArea = document.createElement('textarea');
                            textArea.value = inviteLink;
                            document.body.appendChild(textArea);
                            textArea.select();
                            document.execCommand('copy');
                            document.body.removeChild(textArea);
                            message.success('Link copied!');
                          });
                        }}
                      >
                        Copy
                      </Button>
                    </Tooltip>
                  </div>
                );
              }

              return (
                <Alert
                  type="info"
                  showIcon
                  className="!rounded-xl"
                  message="No pending invite links"
                  description="Use 'Invite' above to create invite links."
                />
              );
            })()}

            {booking.participants?.filter(p => p.invitationToken && p.status === 'invited').length > 1 && (
              <div className="mt-3 pt-3 border-t border-slate-100">
                <Text strong className="text-xs block mb-2 text-slate-500">All pending invitations:</Text>
                <div className="space-y-1">
                  {booking.participants
                    .filter(p => p.invitationToken && p.status === 'invited')
                    .map(p => {
                      const link = `${window.location.origin}/group-invitation/${p.invitationToken}`;
                      return (
                        <div key={p.id} className="flex items-center gap-2">
                          <Text type="secondary" className="text-xs truncate max-w-[150px]">
                            {p.email || p.fullName || 'Invited'}
                          </Text>
                          <Button
                            size="small"
                            type="link"
                            icon={<ClipboardDocumentIcon className="w-3 h-3" />}
                            onClick={() => {
                              navigator.clipboard.writeText(link);
                              message.success(`Link for ${p.email || 'participant'} copied!`);
                            }}
                          >
                            Copy
                          </Button>
                        </div>
                      );
                    })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Organizer Actions ── */}
        {booking.isOrganizer && booking.status !== 'cancelled' && booking.status !== 'completed' && (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200/60 p-5 mb-4">
            <div className="flex justify-between items-center">
              <Text type="secondary" className="text-sm">Organizer Actions</Text>
              <Button
                danger
                className="!rounded-xl"
                onClick={() => setCancelModalVisible(true)}
              >
                Cancel Group Booking
              </Button>
            </div>
          </div>
        )}
      
      {/* Invite Modal */}
      <Modal
        title="Invite Friends"
        open={inviteModalVisible}
        onCancel={() => setInviteModalVisible(false)}
        footer={null}
      >
        <Form form={inviteForm} onFinish={handleInvite} layout="vertical">
          <Alert
            type="info"
            message="Invitees will receive an email with a link to join"
            description="They'll need to create an account (if they don't have one) and pay for their spot."
            className="mb-4"
          />
          
          <Form.Item
            name="emails"
            label="Email Addresses"
            rules={[{ required: true, message: 'Please enter at least one email' }]}
          >
            <TextArea
              placeholder="Enter email addresses, one per line or comma-separated"
              rows={4}
            />
          </Form.Item>
          
          <div className="flex justify-end gap-2">
            <Button onClick={() => setInviteModalVisible(false)}>
              Cancel
            </Button>
            <Button 
              type="primary" 
              htmlType="submit" 
              loading={inviting}
              icon={<EnvelopeIcon className="w-4 h-4" />}
            >
              Send Invitations
            </Button>
          </div>
        </Form>
      </Modal>
      
      {/* Payment / Wallet Deposit Modal */}
      <WalletDepositModal
        visible={depositModalVisible}
        onClose={() => setDepositModalVisible(false)}
        onSuccess={handleDepositSuccess}
        initialAmount={
          organizerNeedsToPay ? totalForOrganizer : displayPrice
        }
        initialCurrency={userCurrency}
      />

      {/* Iyzico Payment Modal */}
      <IyzicoPaymentModal
        visible={showIyzicoModal}
        paymentPageUrl={iyzicoPaymentUrl}
        socketEventName="booking:payment_confirmed"
        onSuccess={handleIyzicoSuccess}
        onClose={() => { setShowIyzicoModal(false); setIyzicoPaymentUrl(null); }}
        onError={(msg) => { setShowIyzicoModal(false); setIyzicoPaymentUrl(null); message.error(msg || 'Payment failed'); }}
      />
      
      {/* Cancel Modal */}
      <Modal
        title="Cancel Group Booking"
        open={cancelModalVisible}
        onCancel={() => setCancelModalVisible(false)}
        footer={[
          <Button key="cancel" onClick={() => setCancelModalVisible(false)}>
            Keep Booking
          </Button>,
          <Button
            key="confirm"
            danger
            loading={cancelling}
            onClick={handleCancel}
          >
            Cancel Booking
          </Button>
        ]}
      >
        <Alert
          type="warning"
          message="This action cannot be undone"
          description="All participants will be notified and refunded if they've paid."
          className="mb-4"
        />
        <TextArea
          placeholder="(Optional) Reason for cancellation..."
          value={cancelReason}
          onChange={e => setCancelReason(e.target.value)}
          rows={3}
        />
      </Modal>
      </div>
    </div>
  );
};

export default GroupBookingDetailPage;
