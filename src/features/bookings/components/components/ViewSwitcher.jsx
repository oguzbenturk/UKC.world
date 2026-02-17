import { useNavigate, useLocation } from 'react-router-dom';
import { Dropdown, Button } from 'antd';
import { 
  AppstoreOutlined, 
  UnorderedListOutlined, 
  CalendarOutlined 
} from '@ant-design/icons';
import './ViewSwitcher.css';

/**
 * Reusable ViewSwitcher component for booking calendar views
 * Provides a dropdown to switch between List, Daily, 9x9 (weekly), and Monthly views
 * 
 * @param {Object} props - Component props
 * @param {string} props.currentView - Current active view ('list', 'daily', 'weekly', 'monthly')
 * @param {string} props.size - Button size ('small', 'middle', 'large')
 * @param {boolean} props.compact - Whether to show compact version (icons only)
 * @param {string} props.className - Additional CSS classes
 * @returns {JSX.Element} ViewSwitcher component
 */
const ViewSwitcher = ({ 
  currentView = 'list', 
  compact = false,
  className = '' 
}) => {
  const navigate = useNavigate();
  const location = useLocation();

  // Get current view from URL if not provided
  const getCurrentView = () => {
    if (currentView !== 'list') return currentView;
    
    if (location.pathname.includes('/calendar')) {
      const urlParams = new URLSearchParams(location.search);
      return urlParams.get('view') || 'daily';
    }
    return 'list';
  };

  const activeView = getCurrentView();

  // View options with icons and labels
  const viewOptions = [
    {
      key: 'list',
      label: 'List View',
      icon: <UnorderedListOutlined />,
      path: '/bookings',
      isActive: activeView === 'list'
    },
    {
      key: 'daily',
      label: 'Daily View', 
      icon: <CalendarOutlined />,
      path: '/bookings/calendar?view=daily',
      isActive: activeView === 'daily' || activeView === 'day'
    },
    {
      key: 'weekly',
      label: '9x9 View',
      icon: <CalendarOutlined />,
      path: '/bookings/calendar?view=weekly', 
      isActive: activeView === 'weekly' || activeView === 'week'
    },
    {
      key: 'monthly',
      label: 'Monthly View',
      icon: <CalendarOutlined />,
      path: '/bookings/calendar?view=monthly',
      isActive: activeView === 'monthly' || activeView === 'month'
    }
  ];

  // Get current view label for button text
  const getCurrentViewLabel = () => {
    const current = viewOptions.find(option => option.isActive);
    if (!current) return 'View';
    
    // Return short version for compact display
    if (compact) {
      return current.key === 'list' ? 'List' : 
             current.key === 'daily' ? 'Day' :
             current.key === 'weekly' ? '9x9' :
             current.key === 'monthly' ? 'Month' : 'View';
    }
    
    // Return even shorter version for space-constrained layouts
    return current.key === 'list' ? 'List' : 
           current.key === 'daily' ? 'Daily' :
           current.key === 'weekly' ? '9x9 View' :
           current.key === 'monthly' ? 'Monthly' : 'View';
  };

  // Handle view selection
  const handleViewSelect = (path) => {
    navigate(path);
  };

  // Create dropdown menu items
  const menuItems = viewOptions.map(option => ({
    key: option.key,
    label: (
      <div className={`flex items-center space-x-2 ${option.isActive ? 'font-semibold text-blue-600' : ''}`}>
        {option.icon}
        <span>{option.label}</span>
        {option.isActive && <span className="text-blue-500">✓</span>}
      </div>
    ),
    onClick: () => handleViewSelect(option.path)
  }));

  return (
    <Dropdown
      menu={{ items: menuItems }}
      placement="bottomRight"
      trigger={['click']}
      overlayClassName="view-switcher-dropdown"
    >
      <Button
        icon={compact ? <AppstoreOutlined /> : null}
        size="small"
        className={`${compact 
          ? 'h-8 w-8 p-0 bg-gray-50 hover:bg-gray-100 text-gray-600 border-gray-200 hover:border-gray-300' 
          : 'h-8 px-3 bg-blue-50 hover:bg-blue-100 text-blue-600 border-blue-200 hover:border-blue-300 text-xs'
        } rounded transition-all duration-200 ${className}`}
      >
        {!compact && (
          <span className="flex items-center gap-1">
            {getCurrentViewLabel()}
            <span className="text-xs">▼</span>
          </span>
        )}
      </Button>
    </Dropdown>
  );
};

export default ViewSwitcher;
