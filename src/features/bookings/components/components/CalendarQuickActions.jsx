import React, { useState } from 'react';
import { 
  PlusIcon, 
  CalendarDaysIcon, 
  ClockIcon, 
  FunnelIcon,
  ArrowPathIcon,
  MagnifyingGlassIcon
} from '@heroicons/react/24/outline';
import { useCalendar } from '../contexts/CalendarContext';

/**
 * Quick actions toolbar for calendar operations
 * Provides shortcuts for common calendar actions
 */
const CalendarQuickActions = ({ onNewBooking, onQuickSearch }) => {
  const { 
    refreshData, 
    setSelectedDate, 
    view, 
    setView,
    isLoading,
    selectedInstructors,
    selectedServices,
    clearCacheAndRefresh
  } = useCalendar();

  const [isRefreshing, setIsRefreshing] = useState(false);

  // Quick navigation actions
  const quickActions = [
    {
      id: 'new-booking',
      label: 'New Booking',
      icon: PlusIcon,
      color: 'bg-blue-600 hover:bg-blue-700 text-white',
      action: onNewBooking,
      shortcut: 'Ctrl+N'
    },
    {
      id: 'today',
      label: 'Today',
      icon: CalendarDaysIcon,
      color: 'bg-gray-100 hover:bg-gray-200 text-gray-700',
      action: () => setSelectedDate(new Date()),
      shortcut: 'T'
    },
    {
      id: 'refresh',
      label: 'Refresh',
      icon: ArrowPathIcon,
      color: 'bg-green-100 hover:bg-green-200 text-green-700',
      action: handleRefresh,
      shortcut: 'F5',
      loading: isRefreshing
    },
    {
      id: 'search',
      label: 'Quick Search',
      icon: MagnifyingGlassIcon,
      color: 'bg-purple-100 hover:bg-purple-200 text-purple-700',
      action: onQuickSearch,
      shortcut: 'Ctrl+K'
    }
  ];

  // View switching shortcuts
  const viewActions = [
    { id: 'day', label: 'Day', view: 'day', shortcut: '1' },
    { id: 'week', label: 'Week', view: 'week', shortcut: '2' },
    { id: 'month', label: 'Month', view: 'month', shortcut: '3' }
  ];

  async function handleRefresh() {
    setIsRefreshing(true);
    try {
      await clearCacheAndRefresh();
    } finally {
      setTimeout(() => setIsRefreshing(false), 500); // Minimum loading time for UX
    }
  }

  const getActiveFiltersCount = () => {
    return selectedInstructors.length + selectedServices.length;
  };

  return (
    <div className="border-b border-gray-200 bg-white px-4 py-3">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-3 sm:space-y-0">
        
        {/* Primary Actions */}
        <div className="flex items-center space-x-2">
          {quickActions.map(action => (
            <button
              key={action.id}
              onClick={action.action}
              disabled={action.loading || isLoading}
              className={`
                inline-flex items-center px-3 py-2 border border-transparent text-sm font-medium rounded-md
                transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500
                ${action.color}
                ${(action.loading || isLoading) ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
              `}
              title={`${action.label} (${action.shortcut})`}
            >
              <action.icon className={`h-4 w-4 ${action.loading ? 'animate-spin' : ''} ${
                action.label !== 'New Booking' ? 'sm:mr-2' : 'mr-2'
              }`} />
              <span className={action.label === 'New Booking' ? '' : 'hidden sm:inline'}>
                {action.label}
              </span>
            </button>
          ))}
        </div>

        {/* View Switcher and Status */}
        <div className="flex items-center space-x-3">
          
          {/* Active Filters Indicator */}
          {getActiveFiltersCount() > 0 && (
            <div className="flex items-center text-sm text-gray-600">
              <FunnelIcon className="h-4 w-4 mr-1" />
              <span className="hidden sm:inline">
                {getActiveFiltersCount()} filter{getActiveFiltersCount() !== 1 ? 's' : ''} active
              </span>
              <span className="sm:hidden">
                {getActiveFiltersCount()}
              </span>
            </div>
          )}

          {/* Quick View Switcher */}
          <div className="flex items-center space-x-1 bg-gray-100 rounded-lg p-1">
            {viewActions.map(viewAction => (
              <button
                key={viewAction.id}
                onClick={() => setView(viewAction.view)}
                className={`
                  px-2 py-1 text-xs font-medium rounded transition-all duration-200
                  ${view === viewAction.view 
                    ? 'bg-white text-gray-900 shadow-sm' 
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                  }
                `}
                title={`${viewAction.label} view (${viewAction.shortcut})`}
              >
                {viewAction.label}
              </button>
            ))}
          </div>

          {/* Loading indicator */}
          {isLoading && (
            <div className="flex items-center text-sm text-gray-500">
              <ClockIcon className="h-4 w-4 mr-1 animate-pulse" />
              <span className="hidden sm:inline">Loading...</span>
            </div>
          )}
        </div>
      </div>

      {/* Keyboard shortcuts help (optional, could be toggled) */}
      <div className="mt-2 text-xs text-gray-500 hidden lg:block">
        <span className="mr-4">⌨️ Shortcuts: </span>
        <span className="mr-3">Ctrl+N: New Booking</span>
        <span className="mr-3">T: Today</span>
        <span className="mr-3">1/2/3: Switch Views</span>
        <span>F5: Refresh</span>
      </div>
    </div>
  );
};

export default CalendarQuickActions;
