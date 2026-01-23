import { useMemo } from 'react';
import { 
  BookOutlined, 
  ShoppingCartOutlined, 
  HomeOutlined, 
  ToolOutlined,
  TeamOutlined,
  CrownOutlined,
  CalendarOutlined,
  MessageOutlined,
  GiftOutlined,
  DollarOutlined,
  SettingOutlined
} from '@ant-design/icons';

/**
 * Configuration for all Quick Action cards on the dashboard
 * Each service has its own configuration with permissions, colors, actions, etc.
 */
export const useQuickActionConfig = (userPermissions = [], userRole = '') => {
  
  // Normalize permissions to array (can be object with permission keys or array)
  const normalizePermissions = (perms) => {
    if (!perms) return [];
    if (Array.isArray(perms)) return perms;
    if (typeof perms === 'object') {
      // If it's an object like { 'bookings:read': true }, extract the keys that are true
      return Object.entries(perms)
        .filter(([, value]) => value === true)
        .map(([key]) => key);
    }
    return [];
  };

  const permissionsArray = normalizePermissions(userPermissions);

  // Helper to check if user has any of the required permissions
  const hasPermission = (requiredPermissions) => {
    if (!requiredPermissions || requiredPermissions.length === 0) return true;
    if (['admin', 'manager'].includes(userRole)) return true;
    return requiredPermissions.some(p => permissionsArray.includes(p));
  };

  const quickActions = useMemo(() => {
    const allActions = [
      // ===== LESSONS / BOOKINGS =====
      {
        id: 'lessons',
        title: 'Lessons',
        description: 'Schedule and manage kite surfing lessons for students',
        icon: BookOutlined,
        color: 'blue',
        permissions: ['bookings:read', 'bookings:write'],
        primaryAction: { label: 'New Booking', to: '/bookings' },
        secondaryActions: [
          { label: 'Calendar', to: '/calendars/lessons' },
          { label: 'All Lessons', to: '/bookings' }
        ],
        order: 1
      },

      // ===== EQUIPMENT RENTALS =====
      {
        id: 'rentals',
        title: 'Rentals',
        description: 'Rent out equipment - kites, boards, harnesses & more',
        icon: ToolOutlined,
        color: 'emerald',
        permissions: ['equipment:rental', 'equipment:read'],
        primaryAction: { label: 'New Rental', to: '/rentals' },
        secondaryActions: [
          { label: 'Calendar', to: '/calendars/rentals' },
          { label: 'Equipment', to: '/equipment' }
        ],
        order: 2
      },

      // ===== PACKAGES =====
      {
        id: 'packages',
        title: 'Packages',
        description: 'Experience packages - camps, downwinders, wing foil & more',
        icon: GiftOutlined,
        color: 'violet',
        permissions: ['services:read', 'bookings:write'],
        primaryAction: { label: 'View Packages', to: '/services/packages' },
        secondaryActions: [
          { label: 'Manage', to: '/services/packages' }
        ],
        order: 3
      },

      // ===== ACCOMMODATION =====
      {
        id: 'accommodation',
        title: 'Accommodation',
        description: 'Manage room bookings and guest accommodations',
        icon: HomeOutlined,
        color: 'orange',
        permissions: ['bookings:read', 'bookings:write'],
        primaryAction: { label: 'Book Room', to: '/accommodation' },
        secondaryActions: [
          { label: 'Manage Units', to: '/services/accommodation' }
        ],
        order: 4
      },

      // ===== SHOP / PRODUCTS =====
      {
        id: 'shop',
        title: 'Shop',
        description: 'Point of sale for products, gear, and merchandise',
        icon: ShoppingCartOutlined,
        color: 'pink',
        permissions: ['products:read', 'products:write'],
        primaryAction: { label: 'Open Shop', to: '/services/shop' },
        secondaryActions: [
          { label: 'Products', to: '/services/shop' }
        ],
        order: 5
      },

      // ===== MEMBERSHIP =====
      {
        id: 'membership',
        title: 'Membership',
        description: 'Member offerings, subscriptions and loyalty programs',
        icon: CrownOutlined,
        color: 'amber',
        permissions: ['users:read', 'finances:read'],
        primaryAction: { label: 'Members', to: '/members' },
        secondaryActions: [
          { label: 'Offerings', to: '/services/memberships' }
        ],
        order: 6
      },

      // ===== EVENTS =====
      {
        id: 'events',
        title: 'Events',
        description: 'Community events, competitions and special activities',
        icon: CalendarOutlined,
        color: 'cyan',
        permissions: ['bookings:read'],
        primaryAction: { label: 'View Events', to: '/calendars/events' },
        secondaryActions: [
          { label: 'Calendar', to: '/calendars/events' }
        ],
        order: 7
      },

      // ===== CARE / REPAIRS =====
      {
        id: 'care',
        title: 'Care & Repairs',
        description: 'Equipment repairs, maintenance and service requests',
        icon: SettingOutlined,
        color: 'teal',
        permissions: ['equipment:read', 'equipment:write'],
        primaryAction: { label: 'Repair Queue', to: '/repairs' },
        secondaryActions: [
          { label: 'Equipment', to: '/equipment' }
        ],
        order: 8
      },

      // ===== CUSTOMERS =====
      {
        id: 'customers',
        title: 'Customers',
        description: 'Manage customer profiles, contacts and history',
        icon: TeamOutlined,
        color: 'slate',
        permissions: ['users:read', 'users:write'],
        primaryAction: { label: 'All Customers', to: '/customers' },
        secondaryActions: [
          { label: 'Add New', to: '/customers' }
        ],
        order: 9
      },

      // ===== CHAT =====
      {
        id: 'chat',
        title: 'Chat',
        description: 'Message customers and team members',
        icon: MessageOutlined,
        color: 'rose',
        permissions: ['notifications:read', 'notifications:send'],
        primaryAction: { label: 'Open Chat', to: '/chat' },
        secondaryActions: [],
        order: 10
      },

      // ===== FINANCE (Admin/Manager only) =====
      {
        id: 'finance',
        title: 'Finance',
        description: 'Payments, invoices, wallets and financial reports',
        icon: DollarOutlined,
        color: 'emerald',
        permissions: ['finances:read'],
        primaryAction: { label: 'Finance Overview', to: '/finance' },
        secondaryActions: [
          { label: 'Daily Ops', to: '/finance/daily-operations' },
          { label: 'Expenses', to: '/finance/expenses' }
        ],
        order: 11
      }
    ];

    // Filter by user permissions
    return allActions
      .filter(action => hasPermission(action.permissions))
      .sort((a, b) => a.order - b.order);
  }, [permissionsArray, userRole]);

  return quickActions;
};

export default useQuickActionConfig;
