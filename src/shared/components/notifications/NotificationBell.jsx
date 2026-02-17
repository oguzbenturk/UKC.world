import React, { useState, useEffect, useRef } from 'react';
import { useFeatures } from '../../contexts/FeaturesContext';
import { 
  BellIcon, 
  CheckIcon, 
  ExclamationTriangleIcon,
  CloudIcon,
  CreditCardIcon,
  CalendarDaysIcon 
} from '@heroicons/react/24/outline';

const NotificationBell = () => {
  const { notifications, markNotificationAsRead, loadNotifications } = useFeatures();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    // Load notifications on mount
    loadNotifications();
  }, []);

  useEffect(() => {
    // Close dropdown when clicking outside
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const getNotificationIcon = (type) => {
    switch (type) {
      case 'weather':
        return <CloudIcon className="h-4 w-4 text-blue-500" />;
      case 'booking':
        return <CalendarDaysIcon className="h-4 w-4 text-green-500" />;
      case 'payment':
        return <CreditCardIcon className="h-4 w-4 text-purple-500" />;
      default:
        return <ExclamationTriangleIcon className="h-4 w-4 text-slate-500" />;
    }
  };

  const handleNotificationClick = async (notification) => {
    if (!notification.read_at) {
      await markNotificationAsRead(notification.id);
    }
    // Could add navigation logic here based on notification type
  };

  const markAllAsRead = async () => {
    try {
      const response = await fetch('/api/notifications/read-all', {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      
      if (response.ok) {
        loadNotifications(); // Refresh notifications
      }
    } catch (error) {
      console.error('Error marking all notifications as read:', error);
    }
  };

  const unreadNotifications = notifications.list.filter(n => !n.read_at);
  const recentNotifications = notifications.list.slice(0, 5);

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 text-slate-400 hover:text-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2 rounded-md"
      >
        <BellIcon className="h-6 w-6" />
        {unreadNotifications.length > 0 && (
          <span className="absolute -top-1 -right-1 h-5 w-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center">
            {unreadNotifications.length > 9 ? '9+' : unreadNotifications.length}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 bg-white rounded-lg shadow-lg ring-1 ring-black ring-opacity-5 z-50">
          <div className="p-4 border-b border-slate-200">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-medium text-slate-900">Notifications</h3>
              {unreadNotifications.length > 0 && (
                <button
                  onClick={markAllAsRead}
                  className="text-sm text-sky-600 hover:text-sky-700"
                >
                  Mark all read
                </button>
              )}
            </div>
          </div>

          <div className="max-h-96 overflow-y-auto">
            {notifications.loading ? (
              <div className="p-4 text-center">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-sky-600 mx-auto"></div>
              </div>
            ) : recentNotifications.length === 0 ? (
              <div className="p-4 text-center text-slate-500">
                <BellIcon className="h-8 w-8 mx-auto mb-2 text-slate-300" />
                <p>No notifications</p>
              </div>
            ) : (
              <div className="space-y-1 p-2">
                {recentNotifications.map((notification) => (
                  <div
                    key={notification.id}
                    onClick={() => handleNotificationClick(notification)}
                    className={`p-3 rounded-lg cursor-pointer transition-colors ${
                      notification.read_at
                        ? 'hover:bg-slate-50'
                        : 'bg-sky-50 hover:bg-sky-100 border-l-4 border-sky-500'
                    }`}
                  >
                    <div className="flex items-start">
                      <div className="flex-shrink-0 mr-3 mt-1">
                        {getNotificationIcon(notification.type)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-medium ${
                          notification.read_at ? 'text-slate-900' : 'text-slate-900'
                        }`}>
                          {notification.title}
                        </p>
                        <p className={`text-sm mt-1 ${
                          notification.read_at ? 'text-slate-500' : 'text-slate-600'
                        }`}>
                          {notification.message}
                        </p>
                        <p className="text-xs text-slate-400 mt-1">
                          {new Date(notification.created_at).toLocaleString()}
                        </p>
                      </div>
                      {!notification.read_at && (
                        <div className="flex-shrink-0 ml-2">
                          <div className="h-2 w-2 bg-sky-500 rounded-full"></div>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {notifications.list.length > 5 && (
            <div className="p-4 border-t border-slate-200">
              <button
                onClick={() => {
                  setIsOpen(false);
                  // Navigate to full notifications page if you have one
                }}
                className="w-full text-center text-sm text-sky-600 hover:text-sky-700"
              >
                View all notifications
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default NotificationBell;
