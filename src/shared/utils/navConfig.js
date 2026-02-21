import { ROLES } from './roleUtils';
import { featureFlags } from '../config/featureFlags';

const item = (to, label, icon, opts = {}) => ({ to, label, icon, ...opts });

/**
 * Map of nav item keys to the permissions required to see them.
 * If a user has ANY of the listed permissions, they can see the item.
 * If the array is empty, the item is always visible to staff roles.
 */
const NAV_PERMISSIONS = {
  // Dashboard is visible to all staff
  dashboard: [],
  // Academy requires bookings or equipment permissions
  academy: ['bookings:read', 'equipment:read', 'equipment:rental'],
  // Membership requires users permissions
  membership: ['users:read'],
  // Customers requires users permissions
  customers: ['users:read', 'users:write'],
  // Instructors requires instructors:write (management level, not just read)
  instructors: ['instructors:write'],
  // Shop requires shop or finances permissions
  shop: ['shop:read', 'shop:write', 'finances:read', 'finances:write'],
  // Services Settings requires admin-level permissions (services:write)
  services: ['services:write', 'admin:settings'],
  // Finance requires finances:read (full finance access, not just write)
  finance: ['finances:read'],
  // Care/Repairs requires equipment permissions
  care: ['equipment:read', 'equipment:write'],
  // Marketing requires marketing permissions
  marketing: ['marketing:read', 'marketing:write', 'admin:settings'],
  // Rating Analytics requires admin settings (management level)
  analytics: ['admin:settings'],
  // Chat requires notifications permissions
  chat: ['notifications:read', 'notifications:send'],
  // Settings requires admin permissions
  settings: ['admin:settings', 'admin:roles']
};

/**
 * Check if user has any of the required permissions
 * @param {Object} userPermissions - Object with permission keys set to true/false
 * @param {string[]} requiredPermissions - Array of permission keys (user needs at least one)
 * @returns {boolean}
 */
const hasAnyPermission = (userPermissions, requiredPermissions) => {
  // If no permissions required, always show
  if (!requiredPermissions || requiredPermissions.length === 0) {
    return true;
  }
  // If no userPermissions provided, deny access
  if (!userPermissions || typeof userPermissions !== 'object') {
    return false;
  }
  // Check if user has ANY of the required permissions
  return requiredPermissions.some(perm => userPermissions[perm] === true);
};

/**
 * Filter nav items based on user permissions
 * @param {Array} items - Array of nav items
 * @param {Object} permissions - User's permissions object
 * @returns {Array} Filtered nav items
 */
const filterNavByPermissions = (items, permissions) => {
  return items.filter(navItem => {
    // Map nav items to their permission keys
    const permKey = getNavItemPermissionKey(navItem.to, navItem.label);
    const requiredPerms = NAV_PERMISSIONS[permKey] || [];
    return hasAnyPermission(permissions, requiredPerms);
  });
};

/**
 * Get the permission key for a nav item based on its path or label
 */
const getNavItemPermissionKey = (path, label) => {
  const p = path?.toLowerCase() || '';
  const l = label?.toLowerCase() || '';
  
  if (p.includes('dashboard') || l === 'dashboard') return 'dashboard';
  if (p.includes('calendar') || l === 'academy') return 'academy';
  if (p.includes('member') || l === 'member' || l === 'membership') return 'membership';
  if (p.includes('customer') || l === 'customers') return 'customers';
  if (p.includes('instructor') || l === 'instructors') return 'instructors';
  if (p.includes('shop') || l === 'shop') return 'shop';
  if (p.includes('service') || l.includes('service')) return 'services';
  if (p.includes('finance') || l === 'finance') return 'finance';
  if (p.includes('repair') || l === 'care') return 'care';
  if (p.includes('marketing') || l === 'marketing') return 'marketing';
  if (p.includes('rating') || l.includes('rating') || l.includes('analytics')) return 'analytics';
  if (p.includes('chat') || l === 'chat') return 'chat';
  if (p.includes('admin') || l === 'settings') return 'settings';
  
  // Default to showing the item
  return 'dashboard';
};

export const getNavItemsForRole = (role, userPermissions = null) => {
  const r = role?.toLowerCase?.();
  
  // Outsider role OR unauthenticated (guest) - ukc.World custom menu structure with styled dots (colors from actual images)
  if (r === ROLES.OUTSIDER || !r || r === 'undefined') {
    return [
      item('/shop', 'Shop', 'ShoppingBagIcon', {
        customStyle: { dotColor: '#2d6a3e', textColor: '#ec4899' }, // pembe (pink) - TOP POSITION
        isShopLink: true, // Special flag for shop - navigates directly
        subItems: [
          { to: '/shop/kitesurf', label: 'Kitesurf' },
          { to: '/shop/wing-foil', label: 'Wing Foil' },
          { to: '/shop/e-foil', label: 'E-Foil' },
          { to: '/shop/wetsuits', label: 'Wetsuits' },
          { to: '/shop/ion-accs', label: 'ION ACCS' },
          { to: '/shop/second-wind', label: 'SecondWind (2nd hand)' }
        ]
      }),
      item('/academy', 'Academy', 'AcademicCapIcon', {
        customStyle: { dotColor: '#2d6a3e', textColor: '#4ade80' }, // açık yeşil (light green)
        isDirectLink: true,
        subItems: [
          { to: '/academy/kite-lessons', label: 'Kite Lessons' },
          { to: '/academy/foil-lessons', label: 'Foil Lessons' },
          { to: '/academy/wing-lessons', label: 'Wing Lessons' },
          { to: '/academy/efoil-lessons', label: 'E-Foil Lessons' },
          { to: '/academy/premium-lessons', label: 'Premium Lessons' }
        ]
      }),
      item('/rental', 'Rental', 'CubeIcon', {
        customStyle: { dotColor: '#2d6a3e', textColor: '#fb923c' }, // turuncu (orange)
        isDirectLink: true,
        subItems: [
          { to: '/rental/standard', label: 'Standard Equipment' },
          { to: '/rental/sls', label: 'SLS Equipment' },
          { to: '/rental/dlab', label: 'D/LAB Equipment' },
          { to: '/rental/efoil', label: 'E-Foil Equipment' }
        ]
      }),
      item('/members/offerings', 'Member', 'UsersIcon', {
        customStyle: { dotColor: '#2d6a3e', textColor: '#93c47d' } // fıstık yeşili (pistachio green)
      }),
      item('/care', 'Care (Repairs)', 'WrenchScrewdriverIcon', {
        customStyle: { dotColor: '#2d6a3e', textColor: '#14b8a6' } // teal
      }),
      item('/stay', 'Stay', 'HomeIcon', {
        customStyle: { dotColor: '#2d6a3e', textColor: '#3b82f6' }, // mavi (blue)
        isDirectLink: true,
        subItems: [
          { to: '/stay/home', label: 'Home' },
          { to: '/stay/hotel', label: 'Hotel' }
        ]
      }),
      item('/experience', 'Experience', 'CalendarDaysIcon', {
        customStyle: { dotColor: '#2d6a3e', textColor: '#eab308' }, // sarı (yellow)
        isDirectLink: true,
        subItems: [
          { to: '/experience/kite-packages', label: 'Kite Packages' },
          { to: '/experience/wing-packages', label: 'Wing Packages' },
          { to: '/experience/downwinders', label: 'DownWinders' },
          { to: '/experience/camps', label: 'Camps' }
        ]
      }),
      // Community - Sky Blue (with dot styling like others)
      item('/community', 'Community', 'ChatBubbleLeftRightIcon', {
        customStyle: { dotColor: '#2d6a3e', textColor: '#0ea5e9' }, // sky blue with dot
        subItems: [
          { to: '/chat', label: 'Chat' },
          { to: '/services/events', label: 'Events' }
        ]
      })
    ];
  }
  
  if (r === ROLES.STUDENT && featureFlags.studentPortal) {
    return [
      // 1. Shop - Pink
      item('/shop', 'Shop', 'ShoppingBagIcon', {
        customStyle: { dotColor: '#2d6a3e', textColor: '#ec4899' }, // pembe (pink) - TOP POSITION
        isShopLink: true, // Special flag for shop - navigates directly
        subItems: [
          { to: '/shop/kitesurf', label: 'Kitesurf' },
          { to: '/shop/wing-foil', label: 'Wing Foil' },
          { to: '/shop/e-foil', label: 'E-Foil' },
          { to: '/shop/wetsuits', label: 'Wetsuits' },
          { to: '/shop/ion-accs', label: 'ION ACCS' },
          { to: '/shop/second-wind', label: 'SecondWind (2nd hand)' }
        ]
      }),
      // 2. Academy - Light Green
      item('/academy', 'Academy', 'AcademicCapIcon', {
        customStyle: { dotColor: '#2d6a3e', textColor: '#4ade80' }, // açık yeşil (light green)
        isDirectLink: true,
        subItems: [
          { to: '/student/dashboard', label: 'Dashboard' },
          { to: '/student/schedule', label: 'My Lessons' },
          { to: '/academy/kite-lessons', label: 'Kite Lessons' },
          { to: '/academy/foil-lessons', label: 'Foil Lessons' },
          { to: '/academy/wing-lessons', label: 'Wing Lessons' },
          { to: '/academy/efoil-lessons', label: 'E-Foil Lessons' },
          { to: '/academy/premium-lessons', label: 'Premium Lessons' }
        ]
      }),
      // 3. Rental - Orange
      item('/rental', 'Rental', 'CubeIcon', {
        customStyle: { dotColor: '#2d6a3e', textColor: '#fb923c' }, // turuncu (orange)
        isDirectLink: true,
        subItems: [
          { to: '/rental/standard', label: 'Standard Equipment' },
          { to: '/rental/sls', label: 'SLS Equipment' },
          { to: '/rental/dlab', label: 'D/LAB Equipment' },
          { to: '/rental/efoil', label: 'E-Foil Equipment' },
          { to: '/rental/my-rentals', label: 'My Equipment Rentals' }
        ]
      }),
      // 4. Member - Pistachio Green
      item('/members/offerings', 'Member', 'SparklesIcon', {
        customStyle: { dotColor: '#2d6a3e', textColor: '#93c47d' }, // fıstık yeşili (pistachio green)
        isDirectLink: true,
        subItems: [
          { to: '/student/memberships', label: 'My Memberships' }
        ]
      }),
      // 5. Care - Teal
      item('/repairs', 'Care (Repairs)', 'WrenchScrewdriverIcon', {
        customStyle: { dotColor: '#2d6a3e', textColor: '#14b8a6' } // teal
      }),
      // 6. Stay - Blue
      item('/stay', 'Stay', 'HomeIcon', {
        customStyle: { dotColor: '#2d6a3e', textColor: '#3b82f6' }, // mavi (blue)
        isDirectLink: true,
        subItems: [
          { to: '/stay/home', label: 'Home' },
          { to: '/stay/hotel', label: 'Hotel' },
          { to: '/stay/my-accommodation', label: 'My Accommodation' }
        ]
      }),
      // 7. Experience - Yellow
      item('/experience', 'Experience', 'CalendarDaysIcon', {
        customStyle: { dotColor: '#2d6a3e', textColor: '#eab308' }, // sarı (yellow)
        isDirectLink: true,
        subItems: [
          { to: '/experience/kite-packages', label: 'Kite Packages' },
          { to: '/experience/wing-packages', label: 'Wing Packages' },
          { to: '/experience/downwinders', label: 'DownWinders' },
          { to: '/experience/camps', label: 'Camps' },
          { to: '/student/courses', label: 'My Experience' }
        ]
      }),
      // 8. Community - Sky Blue (with dot styling like others)
      item('/community', 'Community', 'ChatBubbleLeftRightIcon', {
        customStyle: { dotColor: '#2d6a3e', textColor: '#0ea5e9' }, // sky blue with dot
        subItems: [
          { to: '/chat', label: 'Chat' },
          { to: '/services/events', label: 'Events' }
        ]
      }),
      // --- System Items ---
      item('/student/payments', 'Wallet Payments', 'WalletIcon', {
        customStyle: { textColor: '#10b981' } // emerald
      }),
      item('/student/support', 'Support', 'LifebuoyIcon', {
        customStyle: { textColor: '#f59e0b' } // amber
      }),
      item('/student/profile', 'Profile', 'UserCircleIcon', {
        customStyle: { textColor: '#cbd5e1' }, // slate-300 (matches logout in dark mode)
        subItems: [
          { to: '/student/profile', label: 'Profile Overview' },
          { to: '/student/family', label: 'Family' }
        ]
      })
    ];
  }
  const dashboardPath = r === ROLES.INSTRUCTOR ? '/instructor/dashboard' : '/dashboard';

  if (r === ROLES.INSTRUCTOR) {
    return [
      // Shop - Pink - TOP POSITION (same as outsider/student)
      item('/shop', 'Shop', 'ShoppingBagIcon', {
        customStyle: { dotColor: '#2d6a3e', textColor: '#ec4899' },
        isShopLink: true,
        subItems: [
          { to: '/shop/kitesurf', label: 'Kitesurf' },
          { to: '/shop/wing-foil', label: 'Wing Foil' },
          { to: '/shop/e-foil', label: 'E-Foil' },
          { to: '/shop/wetsuits', label: 'Wetsuits' },
          { to: '/shop/ion-accs', label: 'ION ACCS' },
          { to: '/shop/second-wind', label: 'SecondWind (2nd hand)' }
        ]
      }),
      // Dashboard - Blue
      item('/instructor/dashboard', 'Dashboard', 'HomeIcon', {
        customStyle: { dotColor: '#2d6a3e', textColor: '#3b82f6' }
      }),
      // My Students - Cyan
      item('/instructor/students', 'My Students', 'UsersIcon', {
        customStyle: { dotColor: '#2d6a3e', textColor: '#06b6d4' }
      }),
      // Academy - Light Green (Lessons, Calendar, Events)
      item('/calendars', 'Academy', 'AcademicCapIcon', {
        customStyle: { dotColor: '#2d6a3e', textColor: '#4ade80' },
        subItems: [
          { to: '/calendars/lessons', label: 'Lessons' },
          { to: '/bookings/calendar', label: 'Calendar View' },
          { to: '/services/events', label: 'Events' }
        ]
      }),
      // Member - Pistachio Green
      item('/members/offerings', 'Member', 'SparklesIcon', {
        customStyle: { dotColor: '#2d6a3e', textColor: '#93c47d' }
      }),
      // Repairs - Teal
      item('/repairs', 'Repairs', 'WrenchScrewdriverIcon', {
        customStyle: { dotColor: '#2d6a3e', textColor: '#14b8a6' }
      }),
      // Finance - Emerald
      item('/finance', 'Finance', 'CurrencyDollarIcon', {
        customStyle: { dotColor: '#2d6a3e', textColor: '#10b981' }
      }),
      // Messages - Sky Blue
      item('/chat', 'Messages', 'ChatBubbleLeftRightIcon', {
        customStyle: { dotColor: '#2d6a3e', textColor: '#0ea5e9' }
      })
    ];
  }

  if ([ROLES.MANAGER, ROLES.ADMIN, ROLES.DEVELOPER].includes(r)) {
    return [
      // --- Top Priority (icon only, no dots) ---
      // Dashboard - Blue
      item('/dashboard', 'Dashboard', 'HomeIcon', {
        customStyle: { textColor: '#3b82f6' }
      }),
      // Customers - Cyan
      item('/customers', 'Customers', 'UsersIcon', {
        customStyle: { textColor: '#06b6d4' }
      }),
      // Instructors - Yellow
      item('/instructors', 'Instructors', 'AcademicCapIcon', {
        customStyle: { textColor: '#eab308' }
      }),
      // Calendars - Teal (for calendar views)
      item('/calendars', 'Calendars', 'CalendarDaysIcon', {
        customStyle: { textColor: '#14b8a6' },
        subItems: [
          { to: '/calendars/shop-orders', label: 'Shop', dotColor: '#ec4899' },
          { to: '/calendars/lessons', label: 'Academy', dotColor: '#4ade80' },
          { to: '/calendars/rentals', label: 'Rental', dotColor: '#fb923c' },
          { to: '/calendars/members', label: 'Member', dotColor: '#93c47d' },
          { to: '/repairs', label: 'Care', dotColor: '#14b8a6' },
          { to: '/calendars/stay', label: 'Stay', dotColor: '#3b82f6' },
          { to: '/calendars/events', label: 'Community (Events)', dotColor: '#0ea5e9' }
        ]
      }),
      // --- Admin Tools (icon only, no dots) ---
      // Services Parameters - Orange
      item('/services', 'Services Parameters', 'CogIcon', {
        customStyle: { textColor: '#fb923c' },
        subItems: [
          { to: '/services/shop', label: 'Shop', dotColor: '#ec4899' },
          { to: '/services/lessons', label: 'Academy', dotColor: '#4ade80' },
          { to: '/services/rentals', label: 'Rental', dotColor: '#fb923c' },
          { to: '/services/memberships', label: 'Member', dotColor: '#93c47d' },
          { to: '/services/accommodation', label: 'Stay', dotColor: '#3b82f6' },
          { to: '/services/packages', label: 'Experience', dotColor: '#eab308' },
          { to: '/calendars/events', label: 'Community', dotColor: '#0ea5e9' }
        ]
      }),
      // Finance - Emerald
      item('/finance', 'Finance', 'CurrencyDollarIcon', {
        customStyle: { textColor: '#10b981' },
        subItems: [
          { to: '/finance/shop', label: 'Shop', dotColor: '#ec4899' },
          { to: '/finance/lessons', label: 'Academy', dotColor: '#4ade80' },
          { to: '/finance/rentals', label: 'Rental', dotColor: '#fb923c' },
          { to: '/finance/membership', label: 'Member', dotColor: '#93c47d' },
          { to: '/finance/accommodation', label: 'Stay', dotColor: '#3b82f6' },
          { to: '/finance/events', label: 'Community', dotColor: '#0ea5e9' },
          { to: '/finance/payment-history', label: 'Payment History', icon: 'WalletIcon' },
          { to: '/finance/expenses', label: 'Expenses', icon: 'CurrencyDollarIcon' },
          { to: '/finance', label: 'Overall', icon: 'PresentationChartBarIcon' }
        ]
      }),
      // Marketing - Rose
      item('/marketing', 'Marketing', 'MegaphoneIcon', {
        customStyle: { textColor: '#f43f5e' },
        subItems: [
          { to: '/marketing', label: 'Campaign Builder', icon: 'RocketLaunchIcon' },
          { to: '/quick-links', label: 'Links & Forms', icon: 'LinkIcon' },
          { to: '/admin/vouchers', label: 'Vouchers', icon: 'SparklesIcon' }
        ]
      }),
      // Rating Analytics - Amber
      item('/admin/ratings-analytics', 'Rating Analytics', 'PresentationChartBarIcon', {
        customStyle: { textColor: '#f59e0b' }
      }),
      // Shop - Pink (links to /shop - at bottom)
      item('/shop', 'Shop', 'ShoppingBagIcon', {
        customStyle: { dotColor: '#2d6a3e', textColor: '#ec4899' },
        isShopLink: true
      })
    ];
  }
  
  // For any custom/unrecognized roles (e.g., "Front Desk"), provide navigation
  // filtered by their actual permissions from the database.
  // All items with full styling - only items they have permissions for will show.
  const allStaffNavItems = [
    // Dashboard - Blue (icon only, no dot) - TOP PRIORITY
    item('/dashboard', 'Dashboard', 'HomeIcon', {
      customStyle: { textColor: '#3b82f6' }
    }),
    // Customers - Cyan (icon only, no dot) - 2nd TOP PRIORITY
    item('/customers', 'Customers', 'UsersIcon', {
      customStyle: { textColor: '#06b6d4' }
    }),
    // --- UKC Services in standard order ---
    // 1. Shop - Pink
    item('/shop', 'Shop', 'ShoppingBagIcon', {
      customStyle: { dotColor: '#2d6a3e', textColor: '#ec4899' },
      isShopLink: true,
      subItems: [
        { to: '/shop/kitesurf', label: 'Kitesurf' },
        { to: '/shop/wing-foil', label: 'Wing Foil' },
        { to: '/shop/e-foil', label: 'E-Foil' },
        { to: '/shop/wetsuits', label: 'Wetsuits' },
        { to: '/shop/ion-accs', label: 'ION ACCS' },
        { to: '/shop/second-wind', label: 'SecondWind (2nd hand)' }
      ]
    }),
    // 2. Academy - Light Green
    item('/calendars', 'Academy', 'AcademicCapIcon', {
      customStyle: { dotColor: '#2d6a3e', textColor: '#4ade80' },
      subItems: [
        { to: '/calendars/lessons', label: 'Lessons' },
        { to: '/inventory', label: 'Inventory' }
      ]
    }),
    // 3. Rental - Orange (calendar view for rentals)
    item('/calendars/rentals', 'Rental', 'CubeIcon', {
      customStyle: { dotColor: '#2d6a3e', textColor: '#fb923c' }
    }),
    // 4. Member - Pistachio Green
    item('/members/offerings', 'Member', 'SparklesIcon', {
      customStyle: { dotColor: '#2d6a3e', textColor: '#93c47d' }
    }),
    // 5. Care - Teal
    item('/repairs', 'Care', 'WrenchScrewdriverIcon', {
      customStyle: { dotColor: '#2d6a3e', textColor: '#14b8a6' }
    }),
    // 6. Stay - Blue
    item('/calendars/stay', 'Stay', 'HomeIcon', {
      customStyle: { dotColor: '#2d6a3e', textColor: '#3b82f6' }
    }),
    // 7. Experience - Yellow (Packages/Events)
    item('/services/packages', 'Experience', 'CalendarDaysIcon', {
      customStyle: { dotColor: '#2d6a3e', textColor: '#eab308' }
    }),
    // 8. Community - Sky Blue (with dot styling)
    item('/community', 'Community', 'ChatBubbleLeftRightIcon', {
      customStyle: { dotColor: '#2d6a3e', textColor: '#0ea5e9' },
      subItems: [
        { to: '/chat', label: 'Chat' },
        { to: '/services/events', label: 'Events' }
      ]
    }),
    // --- Staff/Admin Tools ---
    // Instructors - Yellow (requires instructors permissions)
    item('/instructors', 'Instructors', 'AcademicCapIcon', {
      customStyle: { textColor: '#eab308' }
    }),
    // Services Settings - Orange (requires services:write or admin)
    item('/services', 'Services Settings', 'CogIcon', {
      customStyle: { textColor: '#fb923c' },
      subItems: [
        { to: '/services/lessons', label: 'Lesson Parameters' },
        { to: '/services/rentals', label: 'Rental Parameters' },
        { to: '/services/packages', label: 'Package Manager' },
        { to: '/services/accommodation', label: 'Accommodation' },
        { to: '/services/shop', label: 'Shop Management' },
        { to: '/services/memberships', label: 'Memberships' },
        { to: '/services/categories', label: 'Category Parameters' },
        { to: '/calendars/events', label: 'Event Manager' }
      ]
    }),
    // Finance - Emerald (requires finances permissions)
    item('/finance', 'Finance', 'CurrencyDollarIcon', {
      customStyle: { textColor: '#10b981' },
      subItems: [
        { to: '/finance', label: 'Overall' },
        { to: '/finance/lessons', label: 'Lessons' },
        { to: '/finance/rentals', label: 'Rentals' },
        { to: '/finance/membership', label: 'Membership' },
        { to: '/finance/shop', label: 'Shop' },
        { to: '/finance/daily-operations', label: 'Daily Operations' },
        { to: '/finance/expenses', label: 'Expenses' }
        // Note: Refunds only visible to admin/manager/owner - not in this menu
      ]
    }),
    // Marketing - Rose (requires marketing or admin permissions)
    item('/marketing', 'Marketing', 'MegaphoneIcon', {
      customStyle: { textColor: '#f43f5e' },
      subItems: [
        { to: '/marketing', label: 'Campaign Builder', icon: 'RocketLaunchIcon' },
        { to: '/quick-links', label: 'Links & Forms', icon: 'LinkIcon' },
        { to: '/admin/vouchers', label: 'Vouchers', icon: 'SparklesIcon' }
      ]
    }),
    // Rating Analytics - Amber (requires reports permissions)
    item('/admin/ratings-analytics', 'Rating Analytics', 'PresentationChartBarIcon', {
      customStyle: { textColor: '#f59e0b' }
    })
  ];
  
  // If permissions are provided, filter the nav items
  if (userPermissions && typeof userPermissions === 'object') {
    return filterNavByPermissions(allStaffNavItems, userPermissions);
  }
  
  // If no permissions provided, return all items (backward compatibility)
  return allStaffNavItems;
};

export const getSystemItemsForRole = (role, userPermissions = null) => {
  const r = role?.toLowerCase?.();
  
  // For outsider, student roles, and unauthenticated users - no system items
  if (r === ROLES.OUTSIDER || r === ROLES.STUDENT || !r || r === 'undefined') {
    return [];
  }
  
  // For admin, manager, developer - show full Settings
  if ([ROLES.MANAGER, ROLES.ADMIN, ROLES.DEVELOPER].includes(r)) {
    return [
      item('/admin', 'Settings', 'CogIcon', {
        subItems: [
          { to: '/services/categories', label: 'Service Creation', icon: 'CubeIcon' },
          { to: '/admin/roles', label: 'Roles', icon: 'UsersIcon' },
          { to: '/admin/waivers', label: 'Waivers', icon: 'AcademicCapIcon' },
          { to: '/admin/legal-documents', label: 'Legal Documents', icon: 'DocumentTextIcon' },
          { to: '/admin/deleted-bookings', label: 'Deleted Bookings', icon: 'TrashIcon' },
          { to: '/admin/manager-commissions', label: 'Manager Commissions', icon: 'CurrencyDollarIcon' },
          { to: '/finance/refunds', label: 'Payment Refunds', icon: 'ArrowUturnLeftIcon' }
        ]
      })
    ];
  }
  
  // For custom roles, check if they have admin:settings permission
  if (userPermissions && (userPermissions['admin:settings'] === true || userPermissions['admin:roles'] === true)) {
    return [
      item('/admin', 'Settings', 'CogIcon', {
        subItems: [
          { to: '/services/categories', label: 'Service Creation', icon: 'CubeIcon' },
          { to: '/admin/roles', label: 'Roles', icon: 'UsersIcon' },
          { to: '/admin/waivers', label: 'Waivers', icon: 'AcademicCapIcon' },
          { to: '/admin/legal-documents', label: 'Legal Documents', icon: 'DocumentTextIcon' },
          { to: '/admin/deleted-bookings', label: 'Deleted Bookings', icon: 'TrashIcon' },
          { to: '/admin/manager-commissions', label: 'Manager Commissions', icon: 'CurrencyDollarIcon' },
          { to: '/finance/refunds', label: 'Payment Refunds', icon: 'ArrowUturnLeftIcon' }
        ]
      })
    ];
  }
  
  // Custom roles without admin permissions - no settings menu
  return [];
};
