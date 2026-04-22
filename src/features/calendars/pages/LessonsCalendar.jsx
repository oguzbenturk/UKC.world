import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Tabs, Badge } from 'antd';
import { CalendarDaysIcon, UserGroupIcon, ClockIcon, BanknotesIcon, CreditCardIcon } from '@heroicons/react/24/outline';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import apiClient from '@/shared/services/apiClient';
import { useAuth } from '@/shared/hooks/useAuth';
import BookingCalendarPage from '@/features/bookings/pages/BookingCalendarPage';
import GroupLessonMatchingPage from '@/features/bookings/pages/GroupLessonMatchingPage';
import LessonMatchUpsTab from '@/features/bookings/pages/LessonMatchUpsTab';
import PendingLessonsTab from '@/features/calendars/components/PendingLessonsTab';
import PendingMemberPaymentsTab from '@/features/members/components/PendingMemberPaymentsTab';

/**
 * LessonsCalendar - Shows lesson bookings in calendar view and group requests
 */
const LessonsCalendar = () => {
  const { user } = useAuth();
  const { t } = useTranslation(['common']);
  const isInstructor = user?.role?.toLowerCase?.() === 'instructor';
  const [searchParams, setSearchParams] = useSearchParams();
  const tabFromUrl = searchParams.get('tab');
  const validTabs = ['calendar', 'group-requests', 'lesson-matchups', 'pending-transfers', 'pending-payments'];
  const [activeTab, setActiveTab] = useState(validTabs.includes(tabFromUrl) ? tabFromUrl : 'calendar');

  // Lightweight count queries for tab badges
  const { data: pendingTransferCount = 0 } = useQuery({
    queryKey: ['pending-transfers-count'],
    queryFn: async () => {
      const res = await apiClient.get('/bookings/pending-transfers?status=pending');
      return res.data?.results?.length || res.data?.pagination?.total || 0;
    },
    refetchInterval: 60000,
    enabled: !isInstructor,
    staleTime: 30000,
  });

  const { data: groupRequestCount = 0 } = useQuery({
    queryKey: ['group-requests-count'],
    queryFn: async () => {
      const res = await apiClient.get('/group-lesson-requests', { params: { status: 'pending' } });
      const all = res.data?.requests || res.data || [];
      return all.filter(r => r.source === 'group_booking').length;
    },
    refetchInterval: 60000,
    enabled: !isInstructor,
    staleTime: 30000,
  });

  const { data: matchupCount = 0 } = useQuery({
    queryKey: ['lesson-matchups-count'],
    queryFn: async () => {
      const res = await apiClient.get('/group-lesson-requests', { params: { status: 'pending' } });
      const all = res.data?.requests || res.data || [];
      return all.filter(r => r.source === 'request').length;
    },
    refetchInterval: 60000,
    enabled: !isInstructor,
    staleTime: 30000,
  });

  const { data: pendingPaymentsCount = 0 } = useQuery({
    queryKey: ['pending-payments-combined-count'],
    queryFn: async () => {
      const [memberRes, depositsRes, accomRes] = await Promise.all([
        apiClient.get('/member-offerings/admin/pending-payments?status=pending'),
        apiClient.get('/wallet/admin/deposits?status=pending&method=bank_transfer&limit=1'),
        apiClient.get('/accommodation/admin/pending-deposits?status=pending&limit=1'),
      ]);
      const memberCount = memberRes.data?.results?.length || memberRes.data?.pagination?.total || 0;
      const depositsCount = depositsRes.data?.results?.length || depositsRes.data?.pagination?.total || 0;
      const accomCount = accomRes.data?.pagination?.total || accomRes.data?.results?.length || 0;
      return memberCount + depositsCount + accomCount;
    },
    refetchInterval: 60000,
    enabled: !isInstructor,
    staleTime: 30000,
  });

  // Sync tab state with URL changes (e.g. notification click navigating here)
  useEffect(() => {
    const t = searchParams.get('tab');
    if (t && validTabs.includes(t) && activeTab !== t) {
      setActiveTab(t);
    }
  }, [searchParams]);

  const handleTabChange = (key) => {
    setActiveTab(key);
    if (key === 'calendar') {
      searchParams.delete('tab');
      setSearchParams(searchParams);
    } else {
      setSearchParams({ tab: key });
    }
  };

  const tabItems = [
    {
      key: 'calendar',
      label: (
        <span className="flex items-center gap-2">
          <CalendarDaysIcon className="w-4 h-4" />
          {t('common:calendars.tabs.calendar')}
        </span>
      ),
      children: (
        <div className="h-full">
          <BookingCalendarPage />
        </div>
      )
    },
    {
      key: 'group-requests',
      label: (
        <span className="flex items-center gap-2">
          <UserGroupIcon className="w-4 h-4" />
          {t('common:calendars.tabs.groupRequests')}
          {groupRequestCount > 0 && (
            <Badge count={groupRequestCount} size="small" style={{ marginLeft: 4 }} />
          )}
        </span>
      ),
      children: (
        <div className="h-full overflow-y-auto">
          <GroupLessonMatchingPage />
        </div>
      )
    },
    {
      key: 'lesson-matchups',
      label: (
        <span className="flex items-center gap-2">
          <ClockIcon className="w-4 h-4" />
          {t('common:calendars.tabs.lessonMatchups')}
          {matchupCount > 0 && (
            <Badge count={matchupCount} size="small" style={{ marginLeft: 4 }} />
          )}
        </span>
      ),
      children: (
        <div className="h-full overflow-y-auto">
          <LessonMatchUpsTab />
        </div>
      )
    },
    {
      key: 'pending-transfers',
      label: (
        <span className="flex items-center gap-2">
          <BanknotesIcon className="w-4 h-4" />
          {t('common:calendars.tabs.pendingLessons')}
          {pendingTransferCount > 0 && (
            <Badge count={pendingTransferCount} size="small" style={{ marginLeft: 4 }} />
          )}
        </span>
      ),
      children: (
        <div className="h-full overflow-y-auto w-full">
          <PendingLessonsTab />
        </div>
      )
    },
    {
      key: 'pending-payments',
      label: (
        <span className="flex items-center gap-2">
          <CreditCardIcon className="w-4 h-4" />
          {t('common:calendars.tabs.pendingPayments')}
          {pendingPaymentsCount > 0 && (
            <Badge count={pendingPaymentsCount} size="small" style={{ marginLeft: 4 }} />
          )}
        </span>
      ),
      children: (
        <div className="h-full overflow-y-auto w-full">
          <PendingMemberPaymentsTab />
        </div>
      )
    }
  ];
  const visibleTabItems = isInstructor
    ? tabItems.filter(t => t.key === 'calendar')
    : tabItems;

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <style>{`
        .lessons-calendar-tabs {
          display: flex;
          flex-direction: column;
          height: 100%;
        }
        .lessons-calendar-tabs .ant-tabs-nav {
          margin-bottom: 0 !important;
          padding: 0 16px;
          background: #fff;
          border-bottom: 1px solid #e5e7eb;
          flex-shrink: 0;
        }
        .lessons-calendar-tabs .ant-tabs-nav::before {
          border-bottom: none !important;
        }
        .lessons-calendar-tabs .ant-tabs-content-holder {
          flex: 1;
          overflow: hidden;
          display: flex;
          flex-direction: column;
        }
        .lessons-calendar-tabs .ant-tabs-content {
          height: 100%;
          display: flex;
          flex-direction: column;
        }
        .lessons-calendar-tabs .ant-tabs-tabpane {
          height: 100%;
          display: flex;
          flex-direction: column;
        }
        .lessons-calendar-tabs .ant-tabs-tabpane > div {
          flex: 1;
          overflow: hidden;
        }
      `}</style>
      <Tabs
        activeKey={activeTab}
        onChange={handleTabChange}
        items={visibleTabItems}
        className="lessons-calendar-tabs"
      />
    </div>
  );
};

export default LessonsCalendar;
