import React from 'react';
import PropTypes from 'prop-types';
import { Typography, Empty, Spin, Button, Tag } from 'antd';
import { BellAlertIcon, CheckCircleIcon, XCircleIcon } from '@heroicons/react/24/outline';
import { formatDistanceToNow } from 'date-fns';

const { Text, Paragraph } = Typography;

const getRelativeTime = (date) => {
  if (!date) return 'moments ago';
  try {
    // Ensure we're working with a fresh Date object every time
    const timestamp = typeof date === 'string' ? new Date(date) : date;
    // Validate the date is valid
    if (isNaN(timestamp.getTime())) {
      return 'moments ago';
    }
    return formatDistanceToNow(timestamp, { addSuffix: true });
  } catch {
    return 'moments ago';
  }
};

const NotificationList = ({
  notifications = [],
  isLoading = false,
  isFetching = false,
  onItemClick,
  onMarkRead,
  onAction,
  markReadLoadingId,
  emptyDescription,
  compact = false,
  className = '',
} = {}) => {
  const [, setTick] = React.useState(0);
  
  // Force re-render every 30 seconds to update "X minutes/hours ago" timestamps
  React.useEffect(() => {
    const interval = setInterval(() => {
      setTick(t => t + 1);
    }, 30000); // Update every 30 seconds
    
    return () => clearInterval(interval);
  }, []);
  
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-10">
        <Spin tip="Loading notifications" />
      </div>
    );
  }

  if (!notifications?.length) {
    return (
      <div className="py-8">
        <Empty
          image={<BellAlertIcon className="h-12 w-12 text-slate-300 mx-auto" />}
          description={emptyDescription || 'No notifications yet'}
        />
      </div>
    );
  }

  // Generate a fresh timestamp on EVERY render to force timestamp recalculation
  // This ensures "X minutes ago" is always current
  const renderTimestamp = Date.now();

  return (
    <div className={`notification-list ${className || ''}`} style={{ maxHeight: '450px', overflowY: 'auto' }}>
      <div className="p-2 space-y-2">
        {notifications.map((item) => {
          const isUnread = !item.readAt;
          const isMarking = markReadLoadingId === item.id;
          const isCompactClickable = compact && typeof onItemClick === 'function';

          const handleMarkReadClick = (event) => {
            event.stopPropagation();
            onMarkRead?.(item.id);
          };

          const handleItemClick = () => {
            if (isCompactClickable) {
              onItemClick?.(item);
            }
          };

          const handleItemKeyDown = (event) => {
            if (isCompactClickable && (event.key === 'Enter' || event.key === ' ')) {
              event.preventDefault();
              onItemClick?.(item);
            }
          };

          return (
            <div
              key={`${item.id}-${renderTimestamp}`}
              className={`border rounded-lg overflow-hidden transition-all ${
                isUnread
                  ? 'bg-blue-50 border-blue-200 shadow-sm'
                  : 'bg-white border-gray-200 hover:border-gray-300'
              } ${isCompactClickable ? 'cursor-pointer hover:shadow-md' : ''}`}
              onClick={handleItemClick}
              onKeyDown={handleItemKeyDown}
              role={isCompactClickable ? 'button' : undefined}
              tabIndex={isCompactClickable ? 0 : undefined}
            >
              {/* Blue accent line for unread */}
              {isUnread && <div className="h-1 bg-blue-500"></div>}
              
              <div className="p-3">
                {/* Title with NEW badge */}
                <div className="flex items-start gap-2 mb-2">
                  {isUnread && (
                    <span className="inline-block bg-blue-500 text-white text-xs font-medium px-2 py-0.5 rounded">
                      NEW
                    </span>
                  )}
                  <Text strong className="text-gray-900 text-sm leading-snug">
                    {item.title || 'Notification'}
                  </Text>
                </div>

                {/* Message */}
                <Paragraph className="text-sm text-gray-700 mb-2 leading-relaxed">
                  {item.message}
                </Paragraph>

                {/* Action buttons */}
                {item.data?.actions && item.data?.status === 'pending' && onAction && (
                  <div className="flex gap-2 mb-2">
                    {item.data.actions.map((action) => (
                      <Button
                        key={action.key}
                        size="small"
                        type={action.type === 'primary' ? 'primary' : 'default'}
                        danger={action.type === 'danger'}
                        icon={
                          action.key === 'approve' 
                            ? <CheckCircleIcon className="h-4 w-4" /> 
                            : action.key === 'cancel' 
                              ? <XCircleIcon className="h-4 w-4" /> 
                              : null
                        }
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          onAction?.(item, action.key);
                        }}
                      >
                        {action.label}
                      </Button>
                    ))}
                  </div>
                )}

                {/* Footer */}
                <div className="flex items-center justify-between pt-2 border-t border-gray-100">
                  <span className="text-xs text-gray-500">
                    {getRelativeTime(item.createdAt)}
                  </span>
                  {onMarkRead && isUnread && (
                    <Button
                      size="small"
                      type="link"
                      onClick={handleMarkReadClick}
                      loading={isMarking}
                      className="text-xs p-0 h-auto"
                    >
                      Mark as read
                    </Button>
                  )}
                </div>
              </div>

              {/* CTA button for non-compact mode */}
              {!compact && item.data?.cta && (
                <Button
                  type="link"
                  size="small"
                  className="px-0 text-sm mt-1"
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    onItemClick?.(item);
                  }}
                >
                  {item.data.cta.label}
                </Button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

NotificationList.propTypes = {
  notifications: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
      title: PropTypes.string,
      message: PropTypes.string,
      readAt: PropTypes.oneOfType([PropTypes.string, PropTypes.instanceOf(Date)]),
      createdAt: PropTypes.oneOfType([PropTypes.string, PropTypes.instanceOf(Date)]),
      data: PropTypes.shape({
        cta: PropTypes.shape({
          label: PropTypes.string,
          href: PropTypes.string,
        }),
        actions: PropTypes.arrayOf(
          PropTypes.shape({
            key: PropTypes.string,
            label: PropTypes.string,
            type: PropTypes.string,
          })
        ),
        status: PropTypes.string,
      }),
    })
  ),
  isLoading: PropTypes.bool,
  isFetching: PropTypes.bool,
  onItemClick: PropTypes.func,
  onMarkRead: PropTypes.func,
  onAction: PropTypes.func,
  markReadLoadingId: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  emptyDescription: PropTypes.string,
  compact: PropTypes.bool,
  className: PropTypes.string,
};

export default NotificationList;
