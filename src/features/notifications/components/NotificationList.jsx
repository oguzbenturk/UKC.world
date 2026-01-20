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
    <div className={`notification-list max-h-[60vh] overflow-y-auto ${className || ''}`}>
      <div className="space-y-2">
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
              className={`rounded-lg transition-colors duration-200 ${
                isUnread
                  ? 'bg-sky-50 border border-sky-200/60 dark:bg-slate-800/40 dark:border-slate-700/40'
                  : 'bg-white border border-slate-100 dark:bg-slate-900 dark:border-slate-800'
              } p-3 ${isCompactClickable ? 'cursor-pointer active:bg-sky-100 dark:active:bg-slate-700' : ''}`}
              onClick={handleItemClick}
              onKeyDown={handleItemKeyDown}
              role={isCompactClickable ? 'button' : undefined}
              tabIndex={isCompactClickable ? 0 : undefined}
            >
              {/* Header row with title and New tag */}
              <div className="flex items-start justify-between gap-2 mb-1">
                <div className="flex items-center gap-2 flex-wrap min-w-0 flex-1">
                  {isUnread && (
                    <Tag color="red" bordered={false} className="uppercase tracking-wide text-[10px] leading-tight px-1.5 py-0 m-0 shrink-0">
                      New
                    </Tag>
                  )}
                  <Text strong className="text-slate-800 dark:text-slate-100 text-sm leading-tight break-words">
                    {item.title || 'Notification'}
                  </Text>
                </div>
              </div>

              {/* Message content */}
              <Paragraph className="mb-2 text-sm text-slate-600 dark:text-slate-300 leading-relaxed !mb-2">
                {item.message}
              </Paragraph>

              {/* Action buttons for booking requests */}
              {item.data?.actions && item.data?.status === 'pending' && onAction && (
                <div className="flex flex-wrap gap-2 mb-2">
                  {item.data.actions.map((action) => (
                    <Button
                      key={action.key}
                      size="middle"
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
                      className="h-9 text-xs font-medium"
                    >
                      {action.label}
                    </Button>
                  ))}
                </div>
              )}

              {/* Footer row with mark as read button */}
              {onMarkRead && isUnread && (
                <div className="flex items-center justify-end gap-2 pt-1 border-t border-slate-100 dark:border-slate-700/50">
                  <Button
                    size="small"
                    type="link"
                    onClick={handleMarkReadClick}
                    loading={isMarking}
                    className="text-xs p-0 h-auto"
                  >
                    Mark as read
                  </Button>
                </div>
              )}

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
