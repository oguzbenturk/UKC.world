/**
 * Group Booking Detail Page — Light theme redesign
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { Modal, Input, App, Form, Tooltip, Popconfirm } from 'antd';
import {
  UserGroupIcon, CalendarIcon, ClockIcon, CurrencyEuroIcon, PlusIcon,
  UserIcon, EnvelopeIcon, TrashIcon, ArrowLeftIcon, CreditCardIcon,
  ClipboardDocumentIcon, ShareIcon, LinkIcon, XMarkIcon,
} from '@heroicons/react/24/outline';
import dayjs from 'dayjs';
import {
  getGroupBookingDetails, inviteParticipants, payForGroupBooking,
  payForAllParticipants, cancelGroupBooking, removeParticipant,
} from '../services/groupBookingService';
import { WalletOutlined, CreditCardOutlined, ShopOutlined } from '@ant-design/icons';
import { useAuth } from '@/shared/hooks/useAuth';
import { useCurrency } from '@/shared/contexts/CurrencyContext';
import { useWalletSummary } from '@/shared/hooks/useWalletSummary';
import { useRealTimeEvents } from '@/shared/hooks/useRealTime';
import { WalletDepositModal } from '@/features/finances/components/WalletDepositModal';
import IyzicoPaymentModal from '@/shared/components/IyzicoPaymentModal';
import { PAY_AT_CENTER_ALLOWED_ROLES } from '@/shared/utils/roleUtils';

const { TextArea } = Input;

/* ── Status pills ── */
const SP = {
  invited: { bg: 'bg-sky-50', text: 'text-sky-700', dot: 'bg-sky-500' },
  accepted: { bg: 'bg-cyan-50', text: 'text-cyan-700', dot: 'bg-cyan-500' },
  pending: { bg: 'bg-amber-50', text: 'text-amber-700', dot: 'bg-amber-500' },
  pending_partner: { bg: 'bg-orange-50', text: 'text-orange-700', dot: 'bg-orange-500' },
  confirmed: { bg: 'bg-sky-50', text: 'text-sky-700', dot: 'bg-sky-500' },
  in_progress: { bg: 'bg-blue-50', text: 'text-blue-700', dot: 'bg-blue-500' },
  completed: { bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500' },
  cancelled: { bg: 'bg-red-50', text: 'text-red-600', dot: 'bg-red-400' },
  declined: { bg: 'bg-red-50', text: 'text-red-600', dot: 'bg-red-400' },
  paid: { bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500' },
  refunded: { bg: 'bg-violet-50', text: 'text-violet-700', dot: 'bg-violet-500' },
};
const Pill = ({ status }) => {
  const s = SP[status] || SP.pending;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-gotham-medium uppercase tracking-wider ${s.bg} ${s.text}`}>
      <span className={`h-1 w-1 rounded-full ${s.dot}`} />{(status || '').replace('_', ' ')}
    </span>
  );
};

const InfoRow = ({ icon, label, children }) => (
  <div className="flex items-start gap-2.5">
    <div className="w-8 h-8 rounded-lg bg-slate-50 border border-slate-100 flex items-center justify-center shrink-0 mt-0.5">{icon}</div>
    <div className="min-w-0">
      <p className="text-[9px] font-gotham-medium uppercase tracking-widest text-slate-400">{label}</p>
      <div className="text-sm text-slate-800">{children}</div>
    </div>
  </div>
);

const GroupBookingDetailPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, refreshToken } = useAuth();
  const { message } = App.useApp();
  const { userCurrency, convertCurrency, formatCurrency: fmtCur } = useCurrency();

  const { data: walletSummary, refetch: refetchWallet } = useWalletSummary({ currency: userCurrency, enabled: !!user?.id });
  const walletBalance = useMemo(() => {
    const all = walletSummary?.balances;
    if (Array.isArray(all) && all.length > 0) return all.reduce((s, r) => s + (r.currency === userCurrency || !convertCurrency ? Number(r.available) || 0 : convertCurrency(Number(r.available) || 0, r.currency, userCurrency)), 0);
    return Number(walletSummary?.available) || 0;
  }, [walletSummary, convertCurrency, userCurrency]);

  const toLocal = (eur) => convertCurrency ? convertCurrency(eur, 'EUR', userCurrency) : eur;
  const fmt = (v) => fmtCur ? fmtCur(v, userCurrency) : `€${v.toFixed(2)}`;

  const [loading, setLoading] = useState(true);
  const [booking, setBooking] = useState(null);
  const [error, setError] = useState(null);
  const [inviteModalVisible, setInviteModalVisible] = useState(false);
  const [inviteForm] = Form.useForm();
  const [inviting, setInviting] = useState(false);
  const [depositModalVisible, setDepositModalVisible] = useState(false);
  const [paying, setPaying] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState('wallet');
  const [showIyzicoModal, setShowIyzicoModal] = useState(false);
  const [iyzicoPaymentUrl, setIyzicoPaymentUrl] = useState(null);
  const [cancelModalVisible, setCancelModalVisible] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [cancelReason, setCancelReason] = useState('');

  const fetchBooking = useCallback(async () => {
    try { setLoading(true); setError(null); const r = await getGroupBookingDetails(id); setBooking(r.groupBooking); if (searchParams.get('pay') === 'true') setDepositModalVisible(true); }
    catch (e) { setError(e.response?.data?.error || 'Failed to load group booking'); }
    finally { setLoading(false); }
  }, [id, searchParams]);

  const PAYMENT_EVENTS = useMemo(() => ['group_booking:participant_paid'], []);
  const realTimeData = useRealTimeEvents(PAYMENT_EVENTS);
  const lastPaymentEvent = realTimeData['group_booking:participant_paid'];
  useEffect(() => { if (lastPaymentEvent?.data?.groupBookingId && String(lastPaymentEvent.data.groupBookingId) === String(id)) { message.success(`${lastPaymentEvent.data.participantName} has paid!`); fetchBooking(); } }, [lastPaymentEvent, id, fetchBooking, message]);
  useEffect(() => { fetchBooking(); }, [fetchBooking]);

  /* ─── Handlers ─── */
  const handleInvite = async (values) => {
    try { setInviting(true); const p = values.emails.split(/[\n,]/).map(l => l.trim()).filter(Boolean).map(email => ({ email })); if (!p.length) { message.error('Enter at least one email'); return; } const r = await inviteParticipants(id, p); message.success(`${r.invitations?.length || 0} invitation(s) sent`); setInviteModalVisible(false); inviteForm.resetFields(); fetchBooking(); }
    catch (e) { message.error(e.response?.data?.error || 'Failed to send invitations'); } finally { setInviting(false); }
  };
  const handleDepositSuccess = async () => {
    try { if (booking?.paymentModel === 'organizer_pays' && booking?.isOrganizer) { const r = await payForAllParticipants(id, 'wallet'); message.success(`Paid ${fmt(toLocal(r.totalAmount || 0))} for ${r.participantCount} participants.`); if (r?.roleUpgrade?.upgraded) await refreshToken(); } else { const r = await payForGroupBooking(id, 'wallet'); message.success('Payment successful!'); if (r?.roleUpgrade?.upgraded) await refreshToken(); } refetchWallet(); fetchBooking(); }
    catch (e) { message.error(typeof e.response?.data?.error === 'string' ? e.response.data.error : 'Payment failed'); }
  };
  const canPayLater = PAY_AT_CENTER_ALLOWED_ROLES.includes(user?.role);
  const handleIyzicoSuccess = useCallback(async () => { setShowIyzicoModal(false); setIyzicoPaymentUrl(null); message.success('Payment confirmed!'); try { await refreshToken(); } catch {} refetchWallet(); fetchBooking(); }, [refreshToken, refetchWallet, fetchBooking, message]);
  const handlePay = async () => {
    const isOrg = booking?.paymentModel === 'organizer_pays' && booking?.isOrganizer && !booking?.organizerPaid;
    const base = booking?.packageId ? (booking.packagePrice || 0) : (booking?.pricePerPerson || 0);
    const eurAmt = isOrg ? (booking?.maxParticipants || 2) * base : base;
    const dispatch = (m) => isOrg ? payForAllParticipants(id, m) : payForGroupBooking(id, m);
    const refresh = () => { refetchWallet(); fetchBooking(); };
    if (paymentMethod === 'credit_card') { try { setPaying(true); const r = await dispatch('credit_card'); if (r.paymentPageUrl) { setIyzicoPaymentUrl(r.paymentPageUrl); setShowIyzicoModal(true); } else message.error('Failed to initiate card payment'); } catch (e) { message.error(e.response?.data?.error || 'Payment failed'); } finally { setPaying(false); } return; }
    if (paymentMethod === 'pay_later') { try { setPaying(true); await dispatch('pay_later'); message.success('Confirmed! Pay at the center.'); refresh(); } catch (e) { message.error(e.response?.data?.error || 'Payment failed'); } finally { setPaying(false); } return; }
    if (walletBalance < toLocal(eurAmt)) { setDepositModalVisible(true); return; }
    try { setPaying(true); const r = await dispatch('wallet'); if (isOrg) message.success(`Paid ${fmt(toLocal(r.totalAmount || 0))} for ${r.participantCount} participants.`); else message.success('Payment successful!'); if (r?.roleUpgrade?.upgraded) await refreshToken(); refresh(); } catch (e) { message.error(e.response?.data?.error || 'Payment failed'); } finally { setPaying(false); }
  };
  const handleCancel = async () => { try { setCancelling(true); await cancelGroupBooking(id, cancelReason || null); message.success('Group booking cancelled'); setCancelModalVisible(false); navigate('/student/schedule?tab=group'); } catch (e) { message.error(e.response?.data?.error || 'Failed to cancel'); } finally { setCancelling(false); } };
  const handleRemoveParticipant = async (pid) => { try { await removeParticipant(id, pid); message.success('Participant removed'); fetchBooking(); } catch (e) { message.error(e.response?.data?.error || 'Failed to remove'); } };

  /* ─── Derived ─── */
  const myP = booking?.participants?.find(p => p.userId === user?.id);
  const isOrgModel = booking?.paymentModel === 'organizer_pays';
  const orgPay = isOrgModel && booking?.isOrganizer && !booking?.organizerPaid;
  const partPay = !isOrgModel && myP?.paymentStatus === 'pending';
  const needsPay = (orgPay || partPay) && booking?.status !== 'cancelled';
  const isPkg = !!booking?.packageId;
  const basePrice = isPkg ? (booking.packagePrice || 0) : (booking?.pricePerPerson || 0);
  const maxPart = booking?.maxParticipants || 2;
  const totalOrg = maxPart * basePrice;
  const canInvite = booking?.isOrganizer && booking?.status !== 'cancelled' && (booking?.participantCount || 0) < (booking?.maxParticipants || 99);
  const canCancel = booking?.isOrganizer && booking?.status !== 'cancelled' && booking?.status !== 'completed';

  /* ─── Loading / Error ─── */
  if (loading) return <div className="flex justify-center py-20"><div className="h-6 w-6 border-2 border-slate-200 border-t-duotone-blue rounded-full animate-spin" /></div>;
  if (error) return (
    <div className="max-w-xl mx-auto py-16 text-center">
      <p className="text-sm text-red-500 mb-3">{error}</p>
      <button type="button" onClick={() => navigate('/student/schedule?tab=group')} className="px-4 py-2 rounded-xl text-sm font-gotham-medium text-slate-600 border border-slate-200 hover:bg-slate-50 transition-colors">Back to Group Lessons</button>
    </div>
  );

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      {/* Back */}
      <button type="button" onClick={() => navigate('/student/schedule?tab=group')}
        className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 font-gotham-medium transition-colors">
        <ArrowLeftIcon className="w-4 h-4" /> Back to Group Lessons
      </button>

      {/* ── Hero ── */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="min-w-0">
            <h1 className="text-lg font-duotone-bold text-slate-900 mb-1">{booking.title}</h1>
            <p className="text-sm text-slate-500">{booking.serviceName}</p>
          </div>
          <div className="text-right shrink-0">
            <span className="text-xl font-duotone-bold-extended text-emerald-600">{fmt(toLocal(basePrice))}</span>
            <p className="text-[10px] text-slate-400 font-gotham-medium">{isPkg ? 'package' : 'per person'}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Pill status={booking.status} />
          {booking.isOrganizer && <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 text-amber-700 px-2 py-0.5 text-[9px] font-gotham-medium uppercase tracking-wider">Organizer</span>}
          <span className="inline-flex items-center rounded-full bg-slate-100 text-slate-600 px-2 py-0.5 text-[9px] font-gotham-medium uppercase tracking-wider">{isOrgModel ? 'Organizer Pays' : 'Individual'}</span>
        </div>
        {booking.description && <p className="text-sm text-slate-500 mt-3">{booking.description}</p>}
      </div>

      {/* ── Payment ── */}
      {needsPay && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50/40 p-4 space-y-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center shrink-0"><CreditCardIcon className="w-4 h-4 text-amber-600" /></div>
            <div>
              <p className="text-sm font-duotone-bold text-amber-900">{orgPay ? 'Pay for Your Group' : 'Payment Required'}</p>
              <p className="text-xs text-amber-700">{orgPay ? `${maxPart} participant(s) — Total: ${fmt(toLocal(totalOrg))}` : 'Complete payment to confirm your spot.'}</p>
            </div>
          </div>
          <p className="text-[9px] font-gotham-medium uppercase tracking-widest text-slate-400">Payment Method</p>
          <div className={`grid gap-2 ${canPayLater ? 'grid-cols-3' : 'grid-cols-2'}`}>
            {[{ key: 'wallet', icon: <WalletOutlined />, label: 'Wallet', sub: fmt(walletBalance) }, { key: 'credit_card', icon: <CreditCardOutlined />, label: 'Card', sub: 'Iyzico' }, ...(canPayLater ? [{ key: 'pay_later', icon: <ShopOutlined />, label: 'At Center', sub: 'Pay later' }] : [])].map(({ key, icon, label, sub }) => (
              <button key={key} type="button" onClick={() => setPaymentMethod(key)}
                className={`flex flex-col items-center gap-0.5 p-2.5 rounded-xl border-2 transition-all cursor-pointer ${paymentMethod === key ? 'border-duotone-blue bg-duotone-blue/5' : 'border-slate-200 bg-white hover:border-slate-300'}`}>
                <span className={`text-base ${paymentMethod === key ? 'text-duotone-blue' : 'text-slate-400'}`}>{icon}</span>
                <span className={`text-[11px] font-gotham-medium ${paymentMethod === key ? 'text-duotone-blue' : 'text-slate-600'}`}>{label}</span>
                <span className={`text-[10px] ${paymentMethod === key ? 'text-duotone-blue/70' : 'text-slate-400'}`}>{sub}</span>
              </button>
            ))}
          </div>
          <button type="button" onClick={handlePay} disabled={paying}
            className="w-full h-10 rounded-xl text-sm font-duotone-bold text-white bg-duotone-blue hover:bg-duotone-blue/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
            {paying ? 'Processing...' : paymentMethod === 'pay_later' ? 'Confirm — Pay at Center' : `Pay ${fmt(toLocal(orgPay ? totalOrg : basePrice))}`}
          </button>
        </div>
      )}

      {/* ── Alerts ── */}
      {booking?.isOrganizer && booking.status === 'pending' && (
        <div className="rounded-xl bg-sky-50 border border-sky-200 px-4 py-3">
          <p className="text-sm font-gotham-medium text-sky-800">Waiting for participants</p>
          <p className="text-xs text-sky-600 mt-0.5">{accepted >= booking.minParticipants ? 'Minimum reached!' : `${accepted}/${booking.minParticipants} minimum — need ${booking.minParticipants - accepted} more.`}</p>
        </div>
      )}
      {isOrgModel && !booking?.isOrganizer && (
        <div className="rounded-xl bg-sky-50 border border-sky-200 px-4 py-3"><p className="text-xs text-sky-700">The organizer will cover payment for all participants.</p></div>
      )}

      {/* ── Details ── */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <p className="text-[10px] font-gotham-medium uppercase tracking-widest text-slate-400 mb-3">Lesson Details</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <InfoRow icon={<CalendarIcon className="w-3.5 h-3.5 text-duotone-blue" />} label="Date">{dayjs(booking.scheduledDate).format('ddd, MMM D, YYYY')}</InfoRow>
          <InfoRow icon={<ClockIcon className="w-3.5 h-3.5 text-violet-500" />} label="Time">{booking.startTime}{booking.endTime ? ` – ${booking.endTime}` : ''}{booking.durationHours > 0 && <span className="text-slate-400 ml-1">({booking.durationHours}h)</span>}</InfoRow>
          <InfoRow icon={<UserIcon className="w-3.5 h-3.5 text-emerald-500" />} label="Instructor">{booking.instructorName || 'To be assigned'}</InfoRow>
          <InfoRow icon={<EnvelopeIcon className="w-3.5 h-3.5 text-amber-500" />} label="Organizer">{booking.organizerName}<span className="text-slate-400 text-[11px] block">{booking.organizerEmail}</span></InfoRow>
          <InfoRow icon={<UserGroupIcon className="w-3.5 h-3.5 text-cyan-500" />} label="Participants">{booking.participantCount} / {booking.maxParticipants} <span className="text-slate-400">(min: {booking.minParticipants})</span></InfoRow>
          <InfoRow icon={<CurrencyEuroIcon className="w-3.5 h-3.5 text-green-500" />} label="Price"><span className="font-duotone-bold text-emerald-600">{fmt(toLocal(basePrice))}</span> <span className="text-slate-400 text-[11px]">{isPkg ? 'package' : 'per person'}</span></InfoRow>
        </div>
        {booking.notes && <div className="mt-3 pt-3 border-t border-slate-100"><p className="text-[9px] font-gotham-medium uppercase tracking-widest text-slate-400 mb-1">Notes</p><p className="text-sm text-slate-600">{booking.notes}</p></div>}
      </div>

      {/* ── Participants ── */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <p className="text-[10px] font-gotham-medium uppercase tracking-widest text-slate-400">Participants ({booking.participantCount}/{booking.maxParticipants})</p>
          {canInvite && (
            <button type="button" onClick={() => setInviteModalVisible(true)}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-gotham-medium text-white bg-duotone-blue hover:bg-duotone-blue/90 transition-colors">
              <PlusIcon className="w-3 h-3" /> Invite
            </button>
          )}
        </div>
        <div className="space-y-1.5">
          {booking.participants?.map(p => (
            <div key={p.id} className="flex items-center justify-between py-2 px-3 rounded-xl bg-slate-50 border border-slate-100">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-7 h-7 rounded-full bg-gradient-to-br from-duotone-blue to-cyan-600 flex items-center justify-center shrink-0">
                  <span className="text-[10px] font-duotone-bold text-white">{(p.fullName || p.email || '?')[0].toUpperCase()}</span>
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-gotham-medium text-slate-800 truncate">{p.fullName || 'Pending'}</span>
                    {p.isOrganizer && <span className="rounded bg-amber-100 text-amber-700 px-1 py-px text-[8px] font-gotham-medium uppercase">Org</span>}
                  </div>
                  <span className="text-[11px] text-slate-400 block truncate">{p.email}</span>
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Pill status={p.status} />
                <Pill status={p.paymentStatus} />
                {booking.isOrganizer && !p.isOrganizer && (
                  <Popconfirm title="Remove participant?" description="If paid, they'll be refunded." onConfirm={() => handleRemoveParticipant(p.id)}>
                    <button type="button" className="ml-1 p-1 rounded text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors"><TrashIcon className="w-3.5 h-3.5" /></button>
                  </Popconfirm>
                )}
              </div>
            </div>
          ))}
        </div>
        <div className="mt-2.5 pt-2 border-t border-slate-200 flex gap-2 text-[10px] font-gotham-medium text-slate-500">
          <span>{booking.participants?.filter(p => p.status === 'accepted').length || 0} accepted</span>
          <span className="text-slate-300">&middot;</span>
          <span>{booking.participants?.filter(p => p.status === 'invited').length || 0} pending</span>
          <span className="text-slate-300">&middot;</span>
          <span className="text-emerald-600">{booking.paidCount} paid</span>
        </div>
      </div>

      {/* ── Share Invite Link ── */}
      {canInvite && (() => {
        const inv = booking.participants?.find(p => p.invitationToken && p.status === 'invited');
        if (!inv) return null;
        const link = `${window.location.origin}/group-invitation/${inv.invitationToken}`;
        return (
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2 mb-2">
              <ShareIcon className="w-4 h-4 text-slate-400" />
              <p className="text-[10px] font-gotham-medium uppercase tracking-widest text-slate-400">Share Invite Link</p>
            </div>
            <p className="text-xs text-slate-500 mb-3">Share so friends can join — even without an account.</p>
            <div className="flex gap-2">
              <div className="flex-1 flex items-center gap-2 rounded-xl bg-slate-50 border border-slate-200 px-3 py-2 min-w-0">
                <LinkIcon className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span className="text-xs text-slate-600 truncate">{link}</span>
              </div>
              <Tooltip title="Copy to clipboard">
                <button type="button" onClick={() => navigator.clipboard.writeText(link).then(() => message.success('Invite link copied!'))}
                  className="shrink-0 inline-flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-gotham-medium text-white bg-duotone-blue hover:bg-duotone-blue/90 transition-colors">
                  <ClipboardDocumentIcon className="w-3.5 h-3.5" /> Copy
                </button>
              </Tooltip>
            </div>
          </div>
        );
      })()}

      {/* ── Cancel ── */}
      {canCancel && (
        <div className="flex items-center justify-between rounded-xl border border-slate-200 px-4 py-3">
          <span className="text-xs text-slate-500">Organizer Actions</span>
          <button type="button" onClick={() => setCancelModalVisible(true)}
            className="px-3 py-1.5 rounded-lg text-xs font-gotham-medium text-red-500 border border-red-200 bg-white hover:bg-red-50 transition-colors">
            Cancel Booking
          </button>
        </div>
      )}

      {/* ── Modals ── */}
      <Modal title={null} open={inviteModalVisible} onCancel={() => setInviteModalVisible(false)} footer={null} width={400} centered
        styles={{ body: { padding: 0 }, content: { borderRadius: 20, overflow: 'hidden' } }}>
        <div className="px-6 pt-6 pb-2">
          <h3 className="font-duotone-bold text-base text-slate-900 mb-1">Invite Friends</h3>
          <p className="text-xs text-slate-500">They'll receive an email link to join and pay for their spot.</p>
        </div>
        <Form form={inviteForm} onFinish={handleInvite} layout="vertical" className="px-6 pb-6 pt-3">
          <Form.Item name="emails" rules={[{ required: true, message: 'Enter at least one email' }]} className="mb-4">
            <TextArea placeholder="Enter emails, one per line or comma-separated" rows={4} className="!rounded-xl" />
          </Form.Item>
          <div className="flex gap-2">
            <button type="button" onClick={() => setInviteModalVisible(false)} className="flex-1 py-2.5 rounded-xl text-sm font-gotham-medium text-slate-600 border border-slate-200 hover:bg-slate-50 transition-colors">Cancel</button>
            <button type="submit" disabled={inviting} className="flex-1 py-2.5 rounded-xl text-sm font-gotham-medium text-white bg-duotone-blue hover:bg-duotone-blue/90 transition-colors disabled:opacity-50">{inviting ? 'Sending...' : 'Send Invitations'}</button>
          </div>
        </Form>
      </Modal>

      <WalletDepositModal visible={depositModalVisible} onClose={() => setDepositModalVisible(false)} onSuccess={handleDepositSuccess}
        initialAmount={toLocal(orgPay ? totalOrg : basePrice)} initialCurrency={userCurrency} />

      <IyzicoPaymentModal visible={showIyzicoModal} paymentPageUrl={iyzicoPaymentUrl} socketEventName="booking:payment_confirmed"
        onSuccess={handleIyzicoSuccess} onClose={() => { setShowIyzicoModal(false); setIyzicoPaymentUrl(null); }}
        onError={(msg) => { setShowIyzicoModal(false); setIyzicoPaymentUrl(null); message.error(msg || 'Payment failed'); }} />

      <Modal title={null} open={cancelModalVisible} onCancel={() => setCancelModalVisible(false)} footer={null} width={400} centered
        styles={{ body: { padding: 0 }, content: { borderRadius: 20, overflow: 'hidden' } }}>
        <div className="px-6 pt-6 pb-2">
          <h3 className="font-duotone-bold text-base text-red-600 mb-1">Cancel Group Booking</h3>
          <p className="text-xs text-slate-500">All participants will be notified and refunded if paid.</p>
        </div>
        <div className="px-6 pb-6 pt-3 space-y-3">
          <TextArea placeholder="Reason for cancellation (optional)" value={cancelReason} onChange={e => setCancelReason(e.target.value)} rows={3} className="!rounded-xl" />
          <div className="flex gap-2">
            <button type="button" onClick={() => setCancelModalVisible(false)} className="flex-1 py-2.5 rounded-xl text-sm font-gotham-medium text-slate-600 border border-slate-200 hover:bg-slate-50 transition-colors">Keep Booking</button>
            <button type="button" onClick={handleCancel} disabled={cancelling} className="flex-1 py-2.5 rounded-xl text-sm font-gotham-medium text-white bg-red-500 hover:bg-red-600 transition-colors disabled:opacity-50">{cancelling ? 'Cancelling...' : 'Cancel Booking'}</button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default GroupBookingDetailPage;
