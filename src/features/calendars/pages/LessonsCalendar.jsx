import React, { useState, useEffect } from 'react';
import { Tabs } from 'antd';
import { CalendarDaysIcon, UserGroupIcon } from '@heroicons/react/24/outline';
import { useSearchParams } from 'react-router-dom';
import BookingCalendarPage from '@/features/bookings/pages/BookingCalendarPage';
import GroupLessonMatchingPage from '@/features/bookings/pages/GroupLessonMatchingPage';

/**
 * LessonsCalendar - Shows lesson bookings in calendar view and group requests
 */
const LessonsCalendar = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const tabFromUrl = searchParams.get('tab');
  const [activeTab, setActiveTab] = useState(tabFromUrl === 'group-requests' ? 'group-requests' : 'calendar');

  // Sync tab state with URL changes (e.g. notification click navigating here)
  useEffect(() => {
    const t = searchParams.get('tab');
    if (t === 'group-requests' && activeTab !== 'group-requests') {
      setActiveTab('group-requests');
    }
  }, [searchParams]);

  const handleTabChange = (key) => {
    setActiveTab(key);
    if (key === 'group-requests') {
      setSearchParams({ tab: 'group-requests' });
    } else {
      searchParams.delete('tab');
      setSearchParams(searchParams);
    }
  };

  const tabItems = [
    {
      key: 'calendar',
      label: (
        <span className="flex items-center gap-2">
          <CalendarDaysIcon className="w-4 h-4" />
          Calendar
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
          Group Requests
        </span>
      ),
      children: (
        <div className="h-full overflow-y-auto">
          <GroupLessonMatchingPage />
        </div>
      )
    }
  ];

  return (
    <div className="p-4 h-full flex flex-col">
      <style>{`
        .lessons-calendar-tabs .ant-tabs-content-holder {
          flex: 1;
          overflow: hidden;
        }
        .lessons-calendar-tabs .ant-tabs-content {
          height: 100%;
        }
        .lessons-calendar-tabs .ant-tabs-tabpane {
          height: 100%;
        }
      `}</style>
      <Tabs 
        activeKey={activeTab}
        onChange={handleTabChange}
        items={tabItems}
        className="flex-1 h-full flex flex-col lessons-calendar-tabs"
      />
    </div>
  );
};

export default LessonsCalendar;
