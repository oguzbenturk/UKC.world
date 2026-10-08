// src/features/members/pages/AdminMembersPage.jsx
// Staff Members page: KPI strip, status/type chips, the membership list with
// renew / win back / bulk renewal reminders, the storage box map and the
// renewals due this week. Every status is effective (expiry-aware).
//
// `defaultStatus` lets a route (the sidebar "Active Memberships" entry at
// /memberships/active) open the page pre-filtered; `?view=` / `?status=` do the
// same for deep links. View, type, search and sort live in the URL.

import { lazy, Suspense, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { DatePicker, Form, Input, Modal, Select, message } from 'antd';
import dayjs from 'dayjs';
import { useCurrency } from '@/shared/contexts/CurrencyContext';
import { useAuth } from '@/shared/hooks/useAuth';
import apiClient from '@/shared/services/apiClient';
import ApplyDiscountModal from '@/features/customers/components/ApplyDiscountModal';
import { useIsDesktop } from '@/features/instructor/earnings/useEarnings';
import { cardClass, primaryButtonClass, secondaryButtonClass } from '@/features/instructor/earnings/components/earningsStyles';
import { EmptyState, ErrorState, SkeletonBlock } from '@/features/instructor/earnings/components/ui';
import { DownloadIcon, SendIcon } from '@/features/instructor/earnings/components/EarningsIcons';
import { PlusIcon } from '@/features/instructor/dashboard/components/DashboardIcons';
import NewMemberDrawer from '../components/NewMemberDrawer';
import MembersKpis from '../components/overview/MembersKpis';
import MembersToolbar from '../components/overview/MembersToolbar';
import MembersList from '../components/overview/MembersList';
import StorageBoxMap from '../components/overview/StorageBoxMap';
import RenewalsDue from '../components/overview/RenewalsDue';
import {
  SORTS, VIEWS, countViews, familyOf, memberState, renewalStart, selectMembers, sharedUnits, typeKeyOf,
} from '../membersFormat';
import {
  useInvalidateMembers, useMemberPurchases, useMemberStats, useSendRenewalReminders,
} from '../useMembers';

const EnhancedCustomerDetailModal = lazy(() => import('@/features/customers/components/EnhancedCustomerDetailModal'));

const PAGE_SIZE = 50;
const DURATION_ORDER = ['day', 'week', 'month', 'season', 'year', 'other'];

const pick = (value, allowed, fallback) => (allowed.includes(value) ? value : fallback);

function csvEscape(v) {
  const s = v == null ? '' : String(v);
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function exportCsv(rows) {
  const header = ['member', 'email', 'phone', 'membership', 'status', 'starts', 'ends', 'box', 'paid'];
  const lines = rows.map((p) => [
    p.user_name, p.user_email, p.user_phone, p.offering_name || p.current_offering_name, memberState(p),
    p.purchased_at ? dayjs(p.purchased_at).format('YYYY-MM-DD') : '',
    p.expires_at ? dayjs(p.expires_at).format('YYYY-MM-DD') : '',
    p.storage_unit ?? '', p.offering_price ?? '',
  ].map(csvEscape).join(','));
  const blob = new Blob([[header.join(','), ...lines].join('\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `members-${dayjs().format('YYYY-MM-DD')}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function EditMembershipModal({ purchase, onClose, onSaved }) {
  const { t } = useTranslation(['admin', 'common']);
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const save = async () => {
    try {
      const values = await form.validateFields();
      setSaving(true);
      await apiClient.put(`/member-offerings/admin/purchases/${purchase.id}`, {
        status: values.status,
        payment_status: values.payment_status,
        notes: values.notes || null,
        expires_at: values.expires_at ? values.expires_at.toISOString() : null,
      });
      message.success(t('admin:members.toast.updated', 'Membership updated'));
      onSaved();
    } catch (err) {
      if (err?.errorFields) return;
      message.error(err?.response?.data?.error || t('admin:members.toast.updateFailed', 'Failed to update'));
    } finally {
      setSaving(false);
    }
  };
  return (
    <Modal
      open={!!purchase}
      title={t('admin:members.edit.title', 'Edit membership')}
      onCancel={onClose}
      onOk={save}
      okButtonProps={{ loading: saving }}
      okText={t('common:buttons.save', 'Save')}
      cancelText={t('common:buttons.cancel', 'Cancel')}
      destroyOnHidden
    >
      {purchase && (
        <Form
          form={form}
          layout="vertical"
          preserve={false}
          initialValues={{
            status: purchase.status || 'active',
            payment_status: purchase.payment_status || 'completed',
            expires_at: purchase.expires_at ? dayjs(purchase.expires_at) : null,
            notes: purchase.notes || '',
          }}
        >
          <Form.Item name="status" label={t('admin:members.edit.status', 'Status')} rules={[{ required: true }]}>
            <Select
              options={['active', 'pending', 'expired', 'cancelled'].map((s) => ({ value: s, label: t(`admin:members.status.${s}`) }))}
            />
          </Form.Item>
          <Form.Item name="payment_status" label={t('admin:members.edit.paymentStatus', 'Payment status')}>
            <Select
              options={['completed', 'pending', 'failed', 'refunded'].map((s) => ({ value: s, label: t(`admin:membersPage.payment.${s}`) }))}
            />
          </Form.Item>
          <Form.Item name="expires_at" label={t('admin:members.edit.expires', 'Expires at')}>
            <DatePicker style={{ width: '100%' }} format="YYYY-MM-DD" />
          </Form.Item>
          <Form.Item name="notes" label={t('admin:members.edit.notes', 'Notes')}>
            <Input.TextArea rows={3} />
          </Form.Item>
        </Form>
      )}
    </Modal>
  );
}

function BulkBar({ count, sending, onRemind, onClear }) {
  const { t } = useTranslation(['admin']);
  return (
    <div role="region" aria-label={t('admin:membersPage.bulk.label')} className="flex flex-wrap items-center gap-2 rounded-2xl bg-slate-900 px-4 py-2.5 text-white shadow-sm">
      <span className="text-sm font-semibold tabular-nums">{t('admin:membersPage.bulk.selected', { count })}</span>
      <span className="flex-1" />
      <button type="button" disabled={sending} onClick={onRemind} className={`${primaryButtonClass} h-9 px-3.5 text-sm`}>
        <SendIcon size={15} />
        {t('admin:membersPage.bulk.remind')}
      </button>
      <button type="button" onClick={onClear} className="h-9 rounded-xl px-3 text-sm font-semibold text-white/90 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white">
        {t('admin:membersPage.bulk.clear')}
      </button>
    </div>
  );
}

const AdminMembersPage = ({ defaultStatus = null } = {}) => {
  const { t } = useTranslation(['admin', 'common']);
  const { formatCurrency } = useCurrency();
  const { user: currentUser } = useAuth();
  const isDesktop = useIsDesktop();
  const [searchParams, setSearchParams] = useSearchParams();
  // Deleting a membership posts a wallet refund, so it's gated to managers+ — matching
  // the backend cancel endpoint (authorizeRoles(['admin','manager','developer','owner'])).
  const canManage = ['admin', 'manager', 'developer', 'owner'].includes((currentUser?.role || '').toLowerCase());

  const [limit, setLimit] = useState(PAGE_SIZE);
  const view = pick(searchParams.get('view') || searchParams.get('status') || defaultStatus, VIEWS, 'all');
  const type = searchParams.get('type') || 'all';
  const query = searchParams.get('q') || '';
  const sort = pick(searchParams.get('sort'), SORTS, 'attention');
  const setParam = (key, value, fallback) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (key === 'view') next.delete('status');
      if (!value || value === fallback) next.delete(key);
      else next.set(key, value);
      return next;
    }, { replace: true });
    setLimit(PAGE_SIZE);
  };

  const purchasesQuery = useMemberPurchases();
  const statsQuery = useMemberStats();
  const invalidate = useInvalidateMembers();
  const reminders = useSendRenewalReminders();
  const purchases = useMemo(() => purchasesQuery.data || [], [purchasesQuery.data]);
  const stats = statsQuery.data;

  const [selected, setSelected] = useState(() => new Set());
  const [drawer, setDrawer] = useState({ open: false, initial: null });
  const [editTarget, setEditTarget] = useState(null);
  const [discountTarget, setDiscountTarget] = useState(null);
  const [customer, setCustomer] = useState(null);

  const counts = useMemo(() => countViews(purchases), [purchases]);
  const types = useMemo(() => {
    const map = new Map();
    purchases.forEach((p) => {
      const key = typeKeyOf(p);
      const row = map.get(key) || { key, family: familyOf(p), duration: p.offering_duration || 'other', count: 0 };
      row.count += 1;
      map.set(key, row);
    });
    return Array.from(map.values()).sort((a, b) => a.family.localeCompare(b.family)
      || DURATION_ORDER.indexOf(a.duration) - DURATION_ORDER.indexOf(b.duration));
  }, [purchases]);
  const filtered = useMemo(() => selectMembers(purchases, { view, type, query, sort }), [purchases, view, type, query, sort]);
  const shared = useMemo(() => sharedUnits(purchases), [purchases]);
  const visible = filtered.slice(0, limit);

  const toggle = (id) => setSelected((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const toggleAll = (rows) => setSelected((prev) => {
    const all = rows.every((p) => prev.has(p.id));
    const next = new Set(prev);
    rows.forEach((p) => (all ? next.delete(p.id) : next.add(p.id)));
    return next;
  });

  const sendReminders = async (ids) => {
    if (!ids.length) return;
    try {
      const res = await reminders.mutateAsync(ids);
      if (res.sent > 0) message.success(t('admin:membersPage.remind.sent', { count: res.sent }));
      if (res.skipped > 0) message.info(t('admin:membersPage.remind.skipped', { count: res.skipped }));
      setSelected(new Set());
    } catch (err) {
      message.error(err?.response?.data?.error || t('admin:membersPage.remind.failed'));
    }
  };

  const openCustomer = (p) => {
    const userId = p.user_id ?? p.userId;
    if (!userId) return;
    setCustomer({ id: userId, name: p.user_name ?? p.userName, email: p.user_email });
  };

  const renew = (p) => setDrawer({
    open: true,
    initial: { userId: p.user_id, offeringId: p.offering_id, startDate: renewalStart(p) },
  });

  const discount = (p) => setDiscountTarget({
    customerId: p.user_id,
    entityType: 'member_purchase',
    entityId: p.id,
    originalPrice: Number(p.offering_price) || 0,
    currency: p.currency || 'EUR',
    description: `${p.offering_name || p.current_offering_name || 'Membership'} — ${p.user_name || p.user_email || ''}`,
  });

  const remove = (p) => {
    const name = p.offering_name || p.current_offering_name || 'membership';
    Modal.confirm({
      title: t('admin:members.delete.title', 'Delete membership'),
      content: t('admin:members.delete.confirm', {
        name,
        defaultValue: `Delete "${name}"? Any wallet payment is refunded to the customer and the storage box is released. The membership is kept as "cancelled" for the record.`,
      }),
      okText: t('admin:members.actions.delete', 'Delete'),
      okButtonProps: { danger: true },
      cancelText: t('common:buttons.cancel', 'Cancel'),
      onOk: async () => {
        try {
          const { data } = await apiClient.post(`/member-offerings/admin/purchases/${p.id}/cancel`, { reason: 'admin_deleted' });
          if (data?.refunded) {
            message.success(t('admin:members.delete.refunded', {
              amount: formatCurrency(data.refundAmount || 0, data.refundCurrency || undefined),
              defaultValue: `Membership deleted · ${formatCurrency(data.refundAmount || 0, data.refundCurrency || undefined)} refunded to wallet`,
            }));
          } else {
            message.warning(t('admin:members.delete.noRefund', 'Membership deleted. No wallet charge was found to refund — adjust the balance manually if needed.'));
          }
          invalidate();
        } catch (err) {
          message.error(err?.response?.data?.error || t('admin:members.delete.failed', 'Failed to delete membership'));
        }
      },
    });
  };

  const actions = {
    onRenew: renew, onOpenCustomer: openCustomer, onEdit: setEditTarget, onDiscount: discount, onDelete: remove,
  };
  const selectedIds = Array.from(selected).filter((id) => purchases.some((p) => p.id === id));
  const title = defaultStatus === 'active' ? t('admin:membersPage.titleActive') : t('admin:membersPage.title');

  let listBody;
  if (purchasesQuery.isError) {
    listBody = (
      <ErrorState
        title={t('admin:membersPage.error.title')}
        body={t('admin:membersPage.error.body')}
        retryLabel={t('admin:membersPage.error.retry')}
        onRetry={() => purchasesQuery.refetch()}
      />
    );
  } else if (purchasesQuery.isLoading) {
    listBody = (
      <div role="status" aria-label={t('admin:membersPage.loading')} className="flex flex-col gap-2">
        {Array.from({ length: 6 }, (_, i) => <SkeletonBlock key={i} className="h-16 rounded-2xl" />)}
      </div>
    );
  } else if (filtered.length === 0) {
    listBody = (
      <div className={cardClass}>
        <EmptyState
          title={purchases.length ? t('admin:membersPage.empty.filtered') : t('admin:membersPage.empty.none')}
          hint={purchases.length ? t('admin:membersPage.empty.filteredHint') : t('admin:membersPage.empty.noneHint')}
        />
      </div>
    );
  } else {
    listBody = (
      <>
        <MembersList
          items={visible}
          isDesktop={isDesktop}
          selected={selected}
          onToggle={toggle}
          onToggleAll={toggleAll}
          canManage={canManage}
          shared={shared}
          {...actions}
        />
        <div className="flex items-center justify-between gap-2 px-1 text-sm text-slate-600">
          <span className="tabular-nums" data-testid="members-showing">
            {t('admin:membersPage.showing', { shown: visible.length, total: filtered.length })}
          </span>
          {visible.length < filtered.length && (
            <button type="button" onClick={() => setLimit((n) => n + PAGE_SIZE)} className={`${secondaryButtonClass} h-10 text-sm`}>
              {t('admin:membersPage.showMore')}
            </button>
          )}
        </div>
      </>
    );
  }

  const boxMap = stats?.storage ? (
    <StorageBoxMap storage={stats.storage} onPickBox={(unit) => setParam('q', `#${unit}`, '')} />
  ) : null;
  const renewals = stats ? (
    <RenewalsDue renewals={stats.renewalsDue} sending={reminders.isPending} onRemind={sendReminders} onOpen={openCustomer} />
  ) : null;

  return (
    <div
      data-testid="members-page"
      data-layout={isDesktop ? 'desktop' : 'mobile'}
      className={`mx-auto flex w-full flex-col ${isDesktop ? 'max-w-7xl gap-5 p-6 xl:p-8' : 'max-w-xl gap-3.5 px-4 pb-24 pt-4'}`}
    >
      <header className={`flex gap-3 ${isDesktop ? 'flex-row flex-wrap items-end justify-between' : 'flex-col px-1'}`}>
        <div className="flex min-w-0 flex-col gap-0.5">
          <h1 className="font-duotone-bold-extended text-2xl tracking-tight text-slate-900 lg:text-3xl">{title}</h1>
          {stats && (
            <span className="text-sm tabular-nums text-slate-600 lg:text-base" data-testid="members-summary">
              {t('admin:membersPage.summary', { count: stats.total, people: stats.activePeople, active: stats.active })}
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {isDesktop && (
            <button type="button" disabled={!filtered.length} onClick={() => exportCsv(filtered)} className={`${secondaryButtonClass} h-11 text-sm`}>
              <DownloadIcon size={17} />
              {t('admin:membersPage.export')}
            </button>
          )}
          <button
            type="button"
            onClick={() => setDrawer({ open: true, initial: null })}
            className={`${primaryButtonClass} h-11 text-sm ${isDesktop ? '' : 'w-full'}`}
          >
            <PlusIcon size={17} />
            {t('admin:membersPage.sell')}
          </button>
        </div>
      </header>

      <MembersKpis
        stats={stats}
        loading={statsQuery.isLoading}
        view={view}
        onView={(v) => setParam('view', v === view ? 'all' : v, 'all')}
        isDesktop={isDesktop}
      />

      <MembersToolbar
        query={query}
        onQuery={(q) => setParam('q', q, '')}
        sort={sort}
        onSort={(s) => setParam('sort', s, 'attention')}
        view={view}
        onView={(v) => setParam('view', v, 'all')}
        counts={counts}
        type={type}
        onType={(ty) => setParam('type', ty, 'all')}
        types={types}
        isDesktop={isDesktop}
      />

      {isDesktop && selectedIds.length > 0 && (
        <BulkBar
          count={selectedIds.length}
          sending={reminders.isPending}
          onRemind={() => sendReminders(selectedIds)}
          onClear={() => setSelected(new Set())}
        />
      )}

      {isDesktop ? (
        // Wide screens: list + side column. Narrower desktops: the two panels sit under the list.
        <div className="grid items-start gap-5 min-[1680px]:grid-cols-[minmax(0,1fr)_340px]">
          <div className="flex min-w-0 flex-col gap-3">{listBody}</div>
          <div className="grid min-w-0 items-start gap-5 lg:grid-cols-2 min-[1680px]:grid-cols-1">{renewals}{boxMap}</div>
        </div>
      ) : (
        <>
          {stats?.renewalsDue?.length > 0 && renewals}
          {listBody}
          {boxMap}
          {!(stats?.renewalsDue?.length > 0) && renewals}
        </>
      )}

      <NewMemberDrawer
        isOpen={drawer.open}
        initial={drawer.initial}
        onClose={() => { setDrawer({ open: false, initial: null }); invalidate(); }}
      />

      <EditMembershipModal
        purchase={editTarget}
        onClose={() => setEditTarget(null)}
        onSaved={() => { setEditTarget(null); invalidate(); }}
      />

      <Suspense fallback={null}>
        <EnhancedCustomerDetailModal
          customer={customer}
          isOpen={!!customer}
          onClose={() => setCustomer(null)}
          onUpdate={invalidate}
        />
      </Suspense>

      <ApplyDiscountModal
        open={!!discountTarget}
        onClose={() => setDiscountTarget(null)}
        onSaved={() => { setDiscountTarget(null); invalidate(); }}
        customerId={discountTarget?.customerId}
        entityType={discountTarget?.entityType}
        entityId={discountTarget?.entityId}
        originalPrice={discountTarget?.originalPrice}
        currency={discountTarget?.currency}
        description={discountTarget?.description}
      />
    </div>
  );
};

export default AdminMembersPage;
