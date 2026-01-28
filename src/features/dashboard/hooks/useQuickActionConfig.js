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
  SettingOutlined,
  UserAddOutlined
} from '@ant-design/icons';

/**
 * Configuration for all Quick Action cards on the dashboard
 * Each service has its own configuration with permissions, colors, actions, etc.
 * 
 * Actions can have:
 * - `to`: Navigation path (renders as Link)
 * - `modal`: Modal identifier (renders as button, parent component handles modal)
 */
export const useQuickActionConfig = (userPermissions = [], userRole = '', modalHandlers = {}) => {
  
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
    // Helper to create action with modal or link
    const createAction = (label, toPath, modalId = null) => {
      if (modalId && modalHandlers[modalId]) {
        return { label, onClick: modalHandlers[modalId] };
      }
      return { label, to: toPath };
    };

    const allActions = [
      // ===== 1. SHOP / PRODUCTS =====
      {
        id: 'shop',
        title: 'Shop',
        description: 'Point of sale for products, gear, and merchandise',
        icon: ShoppingCartOutlined,
        color: 'pink',
        permissions: [], // Available to all dashboard users (especially Front Desk)
        primaryAction: createAction('Quick Sale', '/services/shop', 'newShopSale'),
        secondaryActions: [
          { label: 'Products', to: '/services/shop' }
        ],
        order: 1
      },

      // ===== 2. ACADEMY / LESSONS =====
      {
        id: 'lessons',
        title: 'Academy',
        description: 'Schedule and manage kite surfing lessons for students',
        icon: BookOutlined,
        color: 'lime',
        permissions: ['bookings:read', 'bookings:write'],
        primaryAction: createAction('New Booking', '/bookings', 'newBooking'),
        secondaryActions: [
          { label: 'Calendar', to: '/calendars/lessons' },
          { label: 'All Lessons', to: '/bookings' }
        ],
        order: 2
      },

      // ===== 3. RENTALS =====
      {
        id: 'rentals',
        title: 'Rentals',
        description: 'Rent out equipment - kites, boards, harnesses & more',
        icon: ToolOutlined,
        color: 'orange',
        permissions: ['equipment:rental', 'equipment:read'],
        primaryAction: createAction('New Rental', '/rentals', 'newRental'),
        secondaryActions: [
          { label: 'Calendar', to: '/calendars/rentals' },
          { label: 'Equipment', to: '/equipment' }
        ],
        order: 3
      },

      // ===== 4. MEMBERSHIP =====
      {
        id: 'membership',
        title: 'Member',
        description: 'Member offerings, subscriptions and loyalty programs',
        icon: CrownOutlined,
        color: 'green',
        permissions: [],
        primaryAction: createAction('Register New Member', '/members', 'newMembership'),
        secondaryActions: [
          { label: 'All Members', to: '/members' },
          { label: 'Offerings', to: '/services/memberships' }
        ],
        order: 4
      },

      // ===== 5. CARE / REPAIRS =====
      {
        id: 'care',
        title: 'Care',
        description: 'Equipment repairs, maintenance and service requests',
        icon: SettingOutlined,
        color: 'teal',
        permissions: ['equipment:read', 'equipment:write'],
        primaryAction: { label: 'Repair Queue', to: '/repairs' },
        secondaryActions: [
          { label: 'Equipment', to: '/equipment' }
        ],
        order: 5
      },

      // ===== 6. ACCOMMODATION / STAY =====
      {
        id: 'accommodation',
        title: 'Stay',
        description: 'Manage room bookings and guest accommodations',
        icon: HomeOutlined,
        color: 'blue',
        permissions: ['bookings:read', 'bookings:write'],
        primaryAction: createAction('Book Room', '/accommodation', 'newAccommodation'),
        secondaryActions: [
          { label: 'Manage Units', to: '/services/accommodation' }
        ],
        order: 6
      },

      // ===== 7. COMMUNITY / EVENTS =====
      {
        id: 'events',
        title: 'Community',
        description: 'Community events, competitions and special activities',
        icon: CalendarOutlined,
        color: 'sky',
        permissions: ['bookings:read'],
        primaryAction: { label: 'View Events', to: '/calendars/events' },
        secondaryActions: [
          { label: 'Calendar', to: '/calendars/events' }
        ],
        order: 7
      },

      // ===== 8. CHAT =====
      {
        id: 'chat',
        title: 'Chat',
        description: 'Message customers and team members',
        icon: MessageOutlined,
        color: 'rose',
        permissions: ['notifications:read', 'notifications:send'],
        primaryAction: { label: 'Open Chat', to: '/chat' },
        secondaryActions: [],
        order: 8
      },

      // ===== 9. CUSTOMERS (LAST) =====
      {
        id: 'customers',
        title: 'Customers',
        description: 'Manage customer profiles, contacts and history',
        icon: TeamOutlined,
        color: 'slate',
        permissions: ['users:read', 'users:write'],
        primaryAction: createAction('Register New', '/customers/new', 'newCustomer'),
        secondaryActions: [
          { label: 'All Customers', to: '/customers' }
        ],
        order: 9
      },

      // ===== PACKAGES (HIDDEN FROM MAIN ORDER) =====
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
  }, [permissionsArray, userRole, modalHandlers]);

  return quickActions;
};

export default useQuickActionConfig;
