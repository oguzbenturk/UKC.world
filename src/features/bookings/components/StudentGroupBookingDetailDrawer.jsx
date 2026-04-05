/**
 * Student Group Booking Detail Drawer
 *
 * Shows full booking details (lesson info, participants, payment, invite, cancel)
 * inside an Ant Design Drawer — used from the student group bookings list page.
 */

/* eslint-disable complexity */
import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Drawer,
  Typography,
  Button,
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
  Popconfirm,
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
  CreditCardIcon,
  ClipboardDocumentIcon,
  ShareIcon,
  LinkIcon,
} from '@heroicons/react/24/outline';
import dayjs from 'dayjs';
import {
  getGroupBookingDetails,
  inviteParticipants,
  payForGroupBooking,
  payForAllParticipants,
  cancelGroupBooking,
  removeParticipant,
} from '../services/groupBookingService';
import { useAuth } from '@/shared/hooks/useAuth';
import { useCurrency } from '@/shared/contexts/CurrencyContext';
import { useWalletSummary } from '@/shared/hooks/useWalletSummary';
import { useRealTimeEvents } from '@/shared/hooks/useRealTime';
import { WalletDepositModal } from '@/features/finances/components/WalletDepositModal';

const { Text, Paragraph } = Typography;
const { TextArea } = Input;

const sColor = (s) =>
  ({ invited: 'blue', accepted: 'cyan', declined: 'red', cancelled: 'red' }[s] || 'default');
const pColor = (s) =>
  ({ pending: 'orange', paid: 'green', refunded: 'purple' }[s] || 'default');

const DetailItem = ({ icon, label, value }) => (
  <div className="flex items-start gap-2">
    <div className="w-8 h-8 rounded-lg bg-white flex items-center justify-center shrink-0 mt-0.5">
      {icon}
    </div>
    <div>
      <Text type="secondary" className="text-[11px] uppercase tracking-wider font-semibold block">
        {label}
      </Text>
      <Text className="text-sm">{value}</Text>
    </div>
  </div>
);

const StudentGroupBookingDetailDrawer = ({ bookingId, open, onClose, onUpdated }) => {
  const { user, refreshToken } = useAuth();
  const { message } = App.useApp();
  const { userCurrency, convertCurrency } = useCurrency();

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

  const [inviteModalVisible, setInviteModalVisible] = useState(false);
  const [inviteForm] = Form.useForm();
  const [inviting, setInviting] = useState(false);

  const [depositModalVisible, setDepositModalVisible] = useState(false);
  const [paying, setPaying] = useState(false);

  const [cancelModalVisible, setCancelModalVisible] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [cancelReason, setCancelReason] = useState('');

  const PAYMENT_EVENTS = useMemo(() => ['group_booking:participant_paid'], []);
  const realTimeData = useRealTimeEvents(PAYMENT_EVENTS);
  const lastPaymentEvent = realTimeData['group_booking:participant_paid'];

  useEffect(() => {
    if (lastPaymentEvent?.data?.groupBookingId === bookingId) {
      message.success(`${lastPaymentEvent.data.participantName} has paid!`);
      fetchBooking();
    }
  }, [lastPaymentEvent]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchBooking = useCallback(async () => {
    if (!bookingId) return;
    try {
      setLoading(true);
      setError(null);
      const response = await getGroupBookingDetails(bookingId);
      setBooking(response.groupBooking);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load group booking');
    } finally {
      setLoading(false);
    }
  }, [bookingId]);

  useEffect(() => {
    if (open && bookingId) fetchBooking();
    if (!open) { setBooking(null); setError(null); }
  }, [open, bookingId]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ─── Handlers ────────────────────────────── */
  const handleInvite = async (values) => {
    try {
      setInviting(true);
      const participants = values.emails.split(/[\n,]/).map(l => l.trim()).filter(Boolean).map(email => ({ email }));
      if (!participants.length) { message.error('Please enter at least one email'); return; }
      const res = await inviteParticipants(bookingId, participants);
      message.success(`${res.invitations?.length || 0} invitation(s) sent`);
      setInviteModalVisible(false);
      inviteForm.resetFields();
      fetchBooking();
      onUpdated?.();
    } catch (err) {
      message.error(err.response?.data?.error || 'Failed to send invitations');
    } finally { setInviting(false); }
  };

  const handleDepositSuccess = async () => {
    try {
      if (booking?.paymentModel === 'organizer_pays' && booking?.isOrganizer) {
        const result = await payForAllParticipants(bookingId, 'wallet');
        message.success(`Payment successful! Paid €${result.totalAmount?.toFixed(2)} for ${result.participantCount} participants.`);
        if (result?.roleUpgrade?.upgraded) await refreshToken();
      } else {
        const payResult = await payForGroupBooking(bookingId, 'wallet');
        message.success('Payment successful!');
        if (payResult?.roleUpgrade?.upgraded) { message.success(payResult.roleUpgrade.message); await refreshToken(); }
      }
      refetchWallet(); fetchBooking(); onUpdated?.();
    } catch (err) {
      const errMsg = err.response?.data?.error;
      message.error(typeof errMsg === 'string' ? errMsg : 'Deposit succeeded but wallet payment failed.');
    }
  };

  const handlePay = async () => {
    const isOrgPays = booking?.paymentModel === 'organizer_pays' && booking?.isOrganizer && !booking?.organizerPaid;
    const accepted = booking?.participants?.filter(p => ['accepted', 'paid'].includes(p.status)).length || 0;
    const amountEur = isOrgPays ? accepted * (booking?.pricePerPerson || 0) : booking?.pricePerPerson || 0;
    const amountLocal = convertCurrency ? convertCurrency(amountEur, 'EUR', userCurrency) : amountEur;

    if (walletBalance >= amountLocal) {
      try {
        setPaying(true);
        if (isOrgPays) {
          const result = await payForAllParticipants(bookingId, 'wallet');
          message.success(`Paid €${result.totalAmount?.toFixed(2)} for ${result.participantCount} participants.`);
          if (result?.roleUpgrade?.upgraded) { message.success(result.roleUpgrade.message); await refreshToken(); }
        } else {
          const payResult = await payForGroupBooking(bookingId, 'wallet');
          message.success('Payment successful!');
          if (payResult?.roleUpgrade?.upgraded) { message.success(payResult.roleUpgrade.message); await refreshToken(); }
        }
        refetchWallet(); fetchBooking(); onUpdated?.();
      } catch (err) { message.error(err.response?.data?.error || 'Payment failed'); }
      finally { setPaying(false); }
    } else {
      setDepositModalVisible(true);
    }
  };

  const handleCancel = async () => {
    try {
      setCancelling(true);
      await cancelGroupBooking(bookingId, cancelReason || null);
      message.success('Group booking cancelled');
      setCancelModalVisible(false);
      onClose?.(); onUpdated?.();
    } catch (err) { message.error(err.response?.data?.error || 'Failed to cancel'); }
    finally { setCancelling(false); }
  };

  const handleRemoveParticipant = async (participantId) => {
    try {
      await removeParticipant(bookingId, participantId);
      message.success('Participant removed');
      fetchBooking(); onUpdated?.();
    } catch (err) { message.error(err.response?.data?.error || 'Failed to remove participant'); }
  };

  /* ─── Derived ─────────────────────────────── */
  const myParticipant = booking?.participants?.find(p => p.userId === user?.id);
  const isOrgPaysModel = booking?.paymentModel === 'organizer_pays';
  const orgNeedsToPay = isOrgPaysModel && booking?.isOrganizer && !booking?.organizerPaid;
  const partNeedsToPay = !isOrgPaysModel && myParticipant?.paymentStatus === 'pending';
  const needsPayment = (orgNeedsToPay || partNeedsToPay) && booking?.status !== 'cancelled';
  const acceptedCount = booking?.participants?.filter(p => ['accepted', 'paid'].includes(p.status)).length || 0;
  const totalForOrg = acceptedCount * (booking?.pricePerPerson || 0);

  /* ─── Render ──────────────────────────────── */
  const renderBody = () => {
    if (loading) return <div className="flex justify-center py-20"><Spin size="large" /></div>;
    if (error) return <Result status="error" title="Error" subTitle={error} extra={<Button onClick={onClose}>Close</Button>} />;
    if (!booking) return null;

    return (
      <div className="space-y-5">
        {/* Hero */}
        <div>
          <div className="flex items-start gap-3 mb-3">
            <div className="w-12 h-12 rounded-xl bg-blue-100 flex items-center justify-center shrink-0">
              <UserGroupIcon className="w-6 h-6 text-blue-600" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-lg font-bold text-slate-900 mb-1">{booking.title}</h3>
              <div className="flex flex-wrap gap-1.5">
                <Tag color="blue" className="!rounded-full !text-xs !px-3">{booking.serviceName}</Tag>
                <Tag color={sColor(booking.status)} className="!rounded-full !text-xs !px-3">{booking.status?.replace('_', ' ')}</Tag>
                {booking.isOrganizer && <Tag color="gold" className="!rounded-full !text-xs !px-3">Organizer</Tag>}
                <Tag color={isOrgPaysModel ? 'purple' : 'cyan'} className="!rounded-full !text-xs !px-3">
                  {isOrgPaysModel ? 'Organizer Pays' : 'Individual Payment'}
                </Tag>
              </div>
            </div>
          </div>
          <div className="text-right">
            <span className="text-2xl font-extrabold text-emerald-600">€{booking.pricePerPerson?.toFixed(2)}</span>
            <Text type="secondary" className="block text-xs">per person</Text>
          </div>
          {booking.description && <Paragraph className="!mb-0 text-slate-500 text-sm mt-2">{booking.description}</Paragraph>}
        </div>

        {/* Payment Alert */}
        {needsPayment && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex flex-col gap-3">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
                <CreditCardIcon className="w-4 h-4 text-amber-600" />
              </div>
              <div>
                <Text strong className="text-amber-900 block text-sm">{orgNeedsToPay ? 'Pay for Your Group' : 'Payment Required'}</Text>
                <Text className="text-amber-700 text-xs">
                  {orgNeedsToPay
                    ? `Pay for all ${acceptedCount} participant(s). Total: €${totalForOrg.toFixed(2)}`
                    : 'Complete your payment to confirm your spot.'}
                </Text>
              </div>
            </div>
            <Button type="primary" loading={paying} icon={<CreditCardIcon className="w-4 h-4" />} onClick={handlePay} className="!rounded-xl !font-bold">
              {orgNeedsToPay ? `Pay €${totalForOrg.toFixed(2)}` : `Pay €${booking.pricePerPerson?.toFixed(2)}`}
            </Button>
          </div>
        )}

        {/* Status Alerts */}
        {booking?.isOrganizer && booking.status === 'pending' && (
          <Alert type="info" showIcon className="!rounded-2xl" message="Waiting for participants"
            description={acceptedCount >= booking.minParticipants ? 'Minimum reached!' : `${acceptedCount}/${booking.minParticipants} minimum. Need ${booking.minParticipants - acceptedCount} more.`} />
        )}
        {!booking?.isOrganizer && booking.status === 'pending' && (
          <Alert type="info" showIcon className="!rounded-2xl" message="Booking pending" description="The organizer is collecting participants." />
        )}
        {isOrgPaysModel && !booking?.isOrganizer && (
          <Alert type="info" showIcon className="!rounded-2xl" message="Organizer Pays" description="The organizer will cover payment for all participants." />
        )}

        {/* Lesson Details */}
        <div className="bg-slate-50 rounded-2xl p-5">
          <Text strong className="text-slate-700 block mb-3">Lesson Details</Text>
          <div className="grid grid-cols-2 gap-4">
            <DetailItem icon={<CalendarIcon className="w-4 h-4 text-blue-500" />} label="Date" value={dayjs(booking.scheduledDate).format('ddd, MMM D, YYYY')} />
            <DetailItem icon={<ClockIcon className="w-4 h-4 text-violet-500" />} label="Time"
              value={<>{booking.startTime}{booking.endTime ? ` – ${booking.endTime}` : ''}{booking.durationHours > 0 && <span className="text-slate-400 ml-1">({booking.durationHours}h)</span>}</>} />
            <DetailItem icon={<UserIcon className="w-4 h-4 text-emerald-500" />} label="Instructor" value={booking.instructorName || 'To be assigned'} />
            <DetailItem icon={<EnvelopeIcon className="w-4 h-4 text-amber-500" />} label="Organizer"
              value={<>{booking.organizerName}<span className="text-slate-400 text-[11px] block">{booking.organizerEmail}</span></>} />
            <DetailItem icon={<UserGroupIcon className="w-4 h-4 text-cyan-500" />} label="Participants"
              value={`${booking.participantCount} / ${booking.maxParticipants} (min: ${booking.minParticipants})`} />
            <DetailItem icon={<CurrencyEuroIcon className="w-4 h-4 text-green-500" />} label="Price"
              value={<span className="text-emerald-600 font-semibold">€{booking.pricePerPerson?.toFixed(2)} <span className="text-slate-400 font-normal text-[11px]">per person</span></span>} />
          </div>

          {(booking.registrationDeadline || booking.paymentDeadline) && (
            <div className="mt-4 pt-3 border-t border-slate-200 flex flex-wrap gap-6">
              {booking.registrationDeadline && (
                <div><Text type="secondary" className="text-[11px] uppercase tracking-wider font-semibold block">Registration Deadline</Text><Text className="text-sm">{dayjs(booking.registrationDeadline).format('MMM D, YYYY HH:mm')}</Text></div>
              )}
              {booking.paymentDeadline && (
                <div><Text type="secondary" className="text-[11px] uppercase tracking-wider font-semibold block">Payment Deadline</Text><Text className="text-sm">{dayjs(booking.paymentDeadline).format('MMM D, YYYY HH:mm')}</Text></div>
              )}
            </div>
          )}
          {booking.notes && (
            <div className="mt-4 pt-3 border-t border-slate-200">
              <Text type="secondary" className="text-[11px] uppercase tracking-wider font-semibold block mb-1">Notes</Text>
              <Paragraph className="!mb-0 text-sm text-slate-600">{booking.notes}</Paragraph>
            </div>
          )}
        </div>

        {/* Participants */}
        <div className="bg-slate-50 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-3">
            <Text strong className="text-slate-700">Participants ({booking.participantCount}/{booking.maxParticipants})</Text>
            {booking.isOrganizer && booking.status !== 'cancelled' && (
              <Button type="primary" size="small" icon={<PlusIcon className="w-3.5 h-3.5" />}
                onClick={() => setInviteModalVisible(true)} disabled={booking.participantCount >= booking.maxParticipants} className="!rounded-lg">
                Invite
              </Button>
            )}
          </div>
          <div className="space-y-2">
            {booking.participants?.map(p => (
              <div key={p.id} className="flex items-center justify-between p-3 rounded-xl bg-white border border-slate-100">
                <div className="flex items-center gap-3">
                  <Avatar size={32} className="bg-blue-100 text-blue-600 shrink-0" icon={<UserIcon className="w-3.5 h-3.5" />} />
                  <div>
                    <div className="flex items-center gap-1.5">
                      <Text strong className="text-sm">{p.fullName || 'Pending'}</Text>
                      {p.isOrganizer && <Tag color="gold" className="!rounded-full !text-[10px] !px-2 !py-0 !leading-4">Organizer</Tag>}
                    </div>
                    <Text type="secondary" className="text-xs block">{p.email}</Text>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <Tag color={sColor(p.status)} className="!rounded-full !text-xs !m-0">{p.status}</Tag>
                  <Tag color={pColor(p.paymentStatus)} className="!rounded-full !text-xs !m-0">
                    {p.paymentStatus}{p.paymentStatus === 'paid' && p.amountPaid > 0 && ` €${p.amountPaid?.toFixed(2)}`}
                  </Tag>
                  {booking.isOrganizer && !p.isOrganizer && (
                    <Popconfirm title="Remove participant?" description="If they've paid, they will be refunded." onConfirm={() => handleRemoveParticipant(p.id)}>
                      <Button type="text" danger size="small" icon={<TrashIcon className="w-3.5 h-3.5" />} className="!rounded-lg" />
                    </Popconfirm>
                  )}
                </div>
              </div>
            ))}
          </div>
          <div className="mt-3 pt-2 border-t border-slate-200 flex gap-2 flex-wrap">
            <Tag color="blue" className="!rounded-full !text-xs">{booking.participants?.filter(p => p.status === 'accepted').length || 0} Accepted</Tag>
            <Tag color="orange" className="!rounded-full !text-xs">{booking.participants?.filter(p => p.status === 'invited').length || 0} Pending</Tag>
            <Tag color="green" className="!rounded-full !text-xs">{booking.paidCount} Paid</Tag>
          </div>
        </div>

        {/* Share Invite Link */}
        {booking.isOrganizer && booking.status !== 'cancelled' && booking.status !== 'completed' && (
          <div className="bg-slate-50 rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-3">
              <ShareIcon className="w-4 h-4 text-slate-500" />
              <Text strong className="text-slate-700">Share Invite Link</Text>
            </div>
            <Text type="secondary" className="text-sm block mb-3">Share this link so friends can join — even without an account.</Text>
            {(() => {
              const invitedP = booking.participants?.find(p => p.invitationToken && p.status === 'invited');
              if (invitedP) {
                const inviteLink = `${window.location.origin}/group-invitation/${invitedP.invitationToken}`;
                return (
                  <div className="flex gap-2">
                    <Input value={inviteLink} readOnly className="flex-1 !rounded-xl" addonBefore={<LinkIcon className="w-4 h-4" />} />
                    <Tooltip title="Copy to clipboard">
                      <Button type="primary" icon={<ClipboardDocumentIcon className="w-4 h-4" />} className="!rounded-xl"
                        onClick={() => navigator.clipboard.writeText(inviteLink).then(() => message.success('Invite link copied!'))}>Copy</Button>
                    </Tooltip>
                  </div>
                );
              }
              return <Alert type="info" showIcon className="!rounded-xl" message="No pending invite links" description="Use 'Invite' above to create invite links." />;
            })()}
            {booking.participants?.filter(p => p.invitationToken && p.status === 'invited').length > 1 && (
              <div className="mt-3 pt-3 border-t border-slate-200">
                <Text strong className="text-xs block mb-2 text-slate-500">All pending invitations:</Text>
                <div className="space-y-1">
                  {booking.participants.filter(p => p.invitationToken && p.status === 'invited').map(p => {
                    const link = `${window.location.origin}/group-invitation/${p.invitationToken}`;
                    return (
                      <div key={p.id} className="flex items-center gap-2">
                        <Text type="secondary" className="text-xs truncate max-w-[150px]">{p.email || p.fullName || 'Invited'}</Text>
                        <Button size="small" type="link" icon={<ClipboardDocumentIcon className="w-3 h-3" />}
                          onClick={() => { navigator.clipboard.writeText(link); message.success(`Link copied!`); }}>Copy</Button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Cancel */}
        {booking.isOrganizer && booking.status !== 'cancelled' && booking.status !== 'completed' && (
          <div className="bg-slate-50 rounded-2xl p-4 flex justify-between items-center">
            <Text type="secondary" className="text-sm">Organizer Actions</Text>
            <Button danger className="!rounded-xl" onClick={() => setCancelModalVisible(true)}>Cancel Group Booking</Button>
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      <Drawer
        title={null}
        open={open}
        onClose={onClose}
        width={520}
        styles={{ body: { padding: '20px 24px' } }}
        destroyOnClose
      >
        {renderBody()}
      </Drawer>

      {/* Invite Modal */}
      <Modal title="Invite Friends" open={inviteModalVisible} onCancel={() => setInviteModalVisible(false)} footer={null}>
        <Form form={inviteForm} onFinish={handleInvite} layout="vertical">
          <Alert type="info" message="Invitees will receive an email with a link to join" description="They'll need to create an account (if they don't have one) and pay for their spot." className="mb-4" />
          <Form.Item name="emails" label="Email Addresses" rules={[{ required: true, message: 'Please enter at least one email' }]}>
            <TextArea placeholder="Enter email addresses, one per line or comma-separated" rows={4} />
          </Form.Item>
          <div className="flex justify-end gap-2">
            <Button onClick={() => setInviteModalVisible(false)}>Cancel</Button>
            <Button type="primary" htmlType="submit" loading={inviting} icon={<EnvelopeIcon className="w-4 h-4" />}>Send Invitations</Button>
          </div>
        </Form>
      </Modal>

      {/* Wallet Deposit Modal */}
      {booking && (
        <WalletDepositModal
          visible={depositModalVisible}
          onClose={() => setDepositModalVisible(false)}
          onSuccess={handleDepositSuccess}
          initialAmount={orgNeedsToPay
            ? (convertCurrency ? convertCurrency(totalForOrg, 'EUR', userCurrency) : totalForOrg)
            : (convertCurrency ? convertCurrency(booking?.pricePerPerson || 0, 'EUR', userCurrency) : booking?.pricePerPerson || 0)}
          initialCurrency={userCurrency}
        />
      )}

      {/* Cancel Modal */}
      <Modal title="Cancel Group Booking" open={cancelModalVisible} onCancel={() => setCancelModalVisible(false)}
        footer={[
          <Button key="cancel" onClick={() => setCancelModalVisible(false)}>Keep Booking</Button>,
          <Button key="confirm" danger loading={cancelling} onClick={handleCancel}>Cancel Booking</Button>,
        ]}>
        <Alert type="warning" message="This action cannot be undone" description="All participants will be notified and refunded if they've paid." className="mb-4" />
        <TextArea placeholder="(Optional) Reason for cancellation..." value={cancelReason} onChange={e => setCancelReason(e.target.value)} rows={3} />
      </Modal>
    </>
  );
};

export default StudentGroupBookingDetailDrawer;
