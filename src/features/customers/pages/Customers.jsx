// src/features/customers/pages/Customers.jsx
// Staff Customers page: segment tiles (who buys lessons, shop, memberships,
// rentals, stays; who owes / has credit), filter chips with counts, search,
// a server-paged list with a real total, and quick actions (message, book,
// collect, edit, delete). Segment / activity / search / sort live in the URL.

import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Drawer } from 'antd';
import { useAuth } from '@/shared/hooks/useAuth';
import apiClient from '@/shared/services/apiClient';
import UserForm from '@/shared/components/ui/UserForm';
import { CalendarProvider } from '@/features/bookings/components/contexts/CalendarContext';
import { useIsDesktop } from '@/features/instructor/earnings/useEarnings';
import { useChatBridge } from '@/features/instructor/dashboard/useDashboard';
import { cardClass, primaryButtonClass, secondaryButtonClass } from '@/features/instructor/earnings/components/earningsStyles';
import { EmptyState, ErrorState, SkeletonBlock } from '@/features/instructor/earnings/components/ui';
import { SearchIcon } from '@/features/instructor/earnings/components/EarningsIcons';
import { PlusIcon } from '@/features/instructor/dashboard/components/DashboardIcons';
import CustomerTiles from '../components/overview/CustomerTiles';
import CustomersList from '../components/overview/CustomersList';
import {
  CUSTOMER_ACTIVITY, CUSTOMER_FILTERS, CUSTOMER_SORTS,
  useCustomerList, useCustomerSegments, useInvalidateCustomers,
} from '../useCustomerInsights';

const CustomerDeleteModal = lazy(() => import('../components/CustomerDeleteModal'));
const EnhancedCustomerDetailModal = lazy(() => import('../components/EnhancedCustomerDetailModal'));
const BookingDrawer = lazy(() => import('@/features/bookings/components/components/BookingDrawer'));

const pick = (value, allowed, fallback) => (allowed.includes(value) ? value : fallback);

const chipCls = (active) => [
  'inline-flex h-9 shrink-0 items-center gap-2 rounded-full border px-3.5 text-sm whitespace-nowrap',
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00798c] focus-visible:ring-offset-1',
  active ? 'border-slate-900 bg-slate-900 font-semibold text-white' : 'border-slate-200 bg-white font-medium text-slate-700 hover:border-slate-300',
].join(' ');
const countCls = (active) => `min-w-[1.25rem] rounded-full px-1.5 text-center text-xs font-semibold tabular-nums ${active ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'}`;

function filterCount(data, key) {
  if (!data) return null;
  if (key === 'all') return data.total;
  if (key === 'owes') return data.owes.count;
  if (key === 'credit') return data.credit.count;
  if (key === 'new') return data.newThisMonth;
  return data.segments[key] ?? null;
}

function useDebounced(value, ms = 300) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const h = setTimeout(() => setV(value), ms);
    return () => clearTimeout(h);
  }, [value, ms]);
  return v;
}

function NewBookingFor({ customer, onClose, onCreated }) {
  if (!customer) return null;
  return (
    <Suspense fallback={null}>
      <CalendarProvider>
        <BookingDrawer isOpen onClose={onClose} onBookingCreated={onCreated} prefilledCustomer={customer} />
      </CalendarProvider>
    </Suspense>
  );
}

const Customers = () => {
  const { t } = useTranslation(['manager']);
  const navigate = useNavigate();
  const location = useLocation();
  const { user: currentUser } = useAuth();
  const isDesktop = useIsDesktop();
  const chat = useChatBridge();
  const invalidate = useInvalidateCustomers();
  const canManage = ['admin', 'manager', 'developer', 'owner'].includes((currentUser?.role || '').toLowerCase());

  const [searchParams, setSearchParams] = useSearchParams();
  const segment = pick(searchParams.get('segment'), CUSTOMER_FILTERS, 'all');
  const activity = pick(searchParams.get('activity'), CUSTOMER_ACTIVITY, 'any');
  const sort = pick(searchParams.get('sort'), Object.keys(CUSTOMER_SORTS), 'spend');
  const urlQuery = searchParams.get('q') || '';
  const [search, setSearch] = useState(urlQuery);
  const q = useDebounced(search.trim());

  const setParam = (key, value, fallback) => setSearchParams((prev) => {
    const next = new URLSearchParams(prev);
    if (!value || value === fallback) next.delete(key);
    else next.set(key, value);
    return next;
  }, { replace: true });

  useEffect(() => {
    if (q !== urlQuery) setParam('q', q, '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const segmentsQuery = useCustomerSegments();
  const listQuery = useCustomerList({ segment, activity, q, sort });
  const items = useMemo(() => (listQuery.data?.pages || []).flatMap((p) => p.items || []), [listQuery.data]);
  const total = listQuery.data?.pages?.[0]?.total ?? items.length;
  const seg = segmentsQuery.data;

  const [openCustomer, setOpenCustomer] = useState(null);
  const [bookFor, setBookFor] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [formOpen, setFormOpen] = useState(false);
  const [roles, setRoles] = useState([]);

  const refresh = () => invalidate();

  // Return from /customers/:id/edit or user creation → refresh.
  useEffect(() => {
    if (location.state?.userCreated) {
      invalidate();
      navigate(location.pathname, { replace: true, state: {} });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state]);

  const openNewCustomer = () => {
    if (!roles.length) apiClient.get('/roles').then((res) => setRoles(res.data || [])).catch(() => {});
    setFormOpen(true);
  };

  const actions = {
    onOpen: (c) => setOpenCustomer({ id: c.id, name: c.name, email: c.email }),
    onBook: (c) => setBookFor({ id: c.id, name: c.name, email: c.email, phone: c.phone }),
    onEdit: (c) => navigate(`/customers/${c.id}/edit`),
    onDelete: (c) => setDeleteTarget(c),
    onMessage: chat.messageStudent,
    opening: chat.openingFor,
  };

  const filtersActive = segment !== 'all' || activity !== 'any' || q;
  let listBody;
  if (listQuery.isError) {
    listBody = (
      <ErrorState
        title={t('manager:customersPage.error.title')}
        body={t('manager:customersPage.error.body')}
        retryLabel={t('manager:customersPage.error.retry')}
        onRetry={() => listQuery.refetch()}
      />
    );
  } else if (listQuery.isLoading) {
    listBody = (
      <div role="status" aria-label={t('manager:customersPage.loading')} className="flex flex-col gap-2">
        {Array.from({ length: 6 }, (_, i) => <SkeletonBlock key={i} className="h-16 rounded-2xl" />)}
      </div>
    );
  } else if (items.length === 0) {
    listBody = (
      <div className={cardClass}>
        <EmptyState
          title={filtersActive ? t('manager:customersPage.empty.filtered') : t('manager:customersPage.empty.none')}
          hint={filtersActive ? t('manager:customersPage.empty.filteredHint') : t('manager:customersPage.empty.noneHint')}
        />
      </div>
    );
  } else {
    listBody = (
      <>
        <CustomersList
          items={items}
          isDesktop={isDesktop}
          canManage={canManage}
          sort={sort}
          onSort={(s) => setParam('sort', s, 'spend')}
          {...actions}
        />
        <div className="flex items-center justify-between gap-2 px-1 text-sm text-slate-600">
          <span className="tabular-nums" data-testid="customers-showing">
            {t('manager:customersPage.showing', { shown: items.length, total })}
          </span>
          {listQuery.hasNextPage && (
            <button
              type="button"
              disabled={listQuery.isFetchingNextPage}
              onClick={() => listQuery.fetchNextPage()}
              className={`${secondaryButtonClass} h-10 text-sm`}
            >
              {listQuery.isFetchingNextPage ? t('manager:customersPage.loadingMore') : t('manager:customersPage.loadMore')}
            </button>
          )}
        </div>
      </>
    );
  }

  return (
    <div
      data-testid="customers-page"
      data-layout={isDesktop ? 'desktop' : 'mobile'}
      className={`mx-auto flex w-full flex-col ${isDesktop ? 'max-w-7xl gap-5 p-6 xl:p-8' : 'max-w-xl gap-3.5 px-4 pb-24 pt-4'}`}
    >
      <header className={`flex gap-3 ${isDesktop ? 'flex-row flex-wrap items-end justify-between' : 'flex-col px-1'}`}>
        <div className="flex min-w-0 flex-col gap-0.5">
          <h1 className="font-duotone-bold-extended text-2xl tracking-tight text-slate-900 lg:text-3xl">{t('manager:customersPage.title')}</h1>
          {seg && (
            <span className="text-sm tabular-nums text-slate-600 lg:text-base" data-testid="customers-summary">
              {[
                t('manager:customersPage.summary.total', { count: seg.total }),
                t('manager:customersPage.summary.active', { count: seg.active30 }),
                t('manager:customersPage.summary.roles', { students: seg.roles.students, trusted: seg.roles.trusted, outsiders: seg.roles.outsiders }),
              ].join(' · ')}
            </span>
          )}
        </div>
        <button type="button" onClick={openNewCustomer} className={`${primaryButtonClass} h-11 text-sm ${isDesktop ? '' : 'w-full'}`}>
          <PlusIcon size={17} />
          {t('manager:customersPage.newCustomer')}
        </button>
      </header>

      <CustomerTiles
        data={seg}
        loading={segmentsQuery.isLoading}
        segment={segment}
        activity={activity}
        onSegment={(s) => setParam('segment', s, 'all')}
        onActivity={(a) => setParam('activity', a, 'any')}
        isDesktop={isDesktop}
      />

      <div className="flex flex-col gap-2.5">
        <div className="flex gap-2">
          <label className="relative min-w-0 flex-1">
            <span className="sr-only">{t('manager:customersPage.search')}</span>
            <span className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-slate-500"><SearchIcon size={18} /></span>
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('manager:customersPage.searchPlaceholder')}
              className="h-11 w-full rounded-2xl border border-slate-200 bg-white pl-10 pr-3 text-[15px] text-slate-900 shadow-sm placeholder:text-slate-500 focus:border-[#00798c] focus:outline-none focus:ring-2 focus:ring-[#00798c]/30"
            />
          </label>
          <label className={`flex h-11 items-center gap-2 rounded-2xl border border-slate-200 bg-white pl-3 pr-2 text-sm font-semibold text-slate-700 shadow-sm focus-within:ring-2 focus-within:ring-[#00798c] ${isDesktop ? 'shrink-0' : 'min-w-0 max-w-[40%]'}`}>
            <span className={isDesktop ? 'text-slate-500' : 'sr-only'}>{t('manager:customersPage.sort.label')}</span>
            <select value={sort} onChange={(e) => setParam('sort', e.target.value, 'spend')} className="h-full min-w-0 cursor-pointer truncate bg-transparent pr-1 focus:outline-none">
              {Object.keys(CUSTOMER_SORTS).map((s) => <option key={s} value={s}>{t(`manager:customersPage.sort.${s}`)}</option>)}
            </select>
          </label>
        </div>
        <div role="group" aria-label={t('manager:customersPage.filterLabel')} className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] lg:mx-0 lg:flex-wrap lg:px-0">
          {CUSTOMER_FILTERS.map((f) => {
            const n = filterCount(seg, f);
            return (
              <button key={f} type="button" aria-pressed={segment === f} onClick={() => setParam('segment', f, 'all')} className={chipCls(segment === f)}>
                {t(`manager:customersPage.seg.${f}`)}
                {n != null && <span className={countCls(segment === f)}>{n}</span>}
              </button>
            );
          })}
          <span aria-hidden="true" className="mx-1 w-px shrink-0 self-stretch bg-slate-200" />
          {CUSTOMER_ACTIVITY.filter((a) => a !== 'any').map((a) => (
            <button key={a} type="button" aria-pressed={activity === a} onClick={() => setParam('activity', activity === a ? 'any' : a, 'any')} className={chipCls(activity === a)}>
              {t(`manager:customersPage.activity.${a}`)}
              {seg && <span className={countCls(activity === a)}>{a === 'active' ? seg.active30 : seg.inactive30}</span>}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-3">{listBody}</div>

      <Suspense fallback={null}>
        {deleteTarget && (
          <CustomerDeleteModal
            visible
            onClose={() => setDeleteTarget(null)}
            userId={deleteTarget.id}
            userName={deleteTarget.name}
            onDeleted={() => { setDeleteTarget(null); refresh(); }}
          />
        )}
      </Suspense>

      <Suspense fallback={null}>
        <EnhancedCustomerDetailModal
          customer={openCustomer}
          isOpen={!!openCustomer}
          onClose={() => setOpenCustomer(null)}
          onUpdate={refresh}
        />
      </Suspense>

      <NewBookingFor
        customer={bookFor}
        onClose={() => setBookFor(null)}
        onCreated={() => { setBookFor(null); refresh(); }}
      />

      <Drawer
        open={formOpen}
        onClose={() => setFormOpen(false)}
        width={isDesktop ? 520 : '100%'}
        closable={false}
        destroyOnHidden
        styles={{ body: { padding: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }, header: { display: 'none' } }}
      >
        <div className="flex flex-shrink-0 items-center justify-between border-b border-slate-200 bg-white px-5 py-3">
          <h2 className="m-0 text-base font-semibold text-slate-900">{t('manager:customersPage.newCustomer')}</h2>
          <button
            type="button"
            onClick={() => setFormOpen(false)}
            aria-label={t('manager:customersPage.close')}
            className="flex h-9 w-9 items-center justify-center rounded-full text-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900"
          >
            &times;
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-5">
          <UserForm
            user={null}
            roles={roles}
            onSuccess={() => { setFormOpen(false); refresh(); }}
            onCancel={() => setFormOpen(false)}
          />
        </div>
      </Drawer>
    </div>
  );
};

export default Customers;
