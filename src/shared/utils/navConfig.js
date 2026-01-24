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
  
  // Outsider role - ukc.World custom menu structure with styled dots (colors from actual images)
  if (r === ROLES.OUTSIDER) {
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
        subItems: [
          { to: '/academy/kite-lessons', label: 'Kite Lessons' },
          { to: '/academy/foil-lessons', label: 'Foil Lessons' },
          { to: '/academy/wing-lessons', label: 'Wing Lessons' },
          { to: '/academy/premium-lessons', label: 'Premium Lessons' }
        ]
      }),
      item('/rental', 'Rental', 'CubeIcon', {
        customStyle: { dotColor: '#2d6a3e', textColor: '#fb923c' }, // turuncu (orange)
        subItems: [
          { to: '/rental/standard', label: 'Standard Equipment' },
          { to: '/rental/premium', label: 'Premium Equipment' }
        ]
      }),
      item('/members/offerings', 'Member', 'UsersIcon', {
        customStyle: { dotColor: '#2d6a3e', textColor: '#93c47d' } // fıstık yeşili (pistachio green)
      }),
      item('/repairs', 'Care (Repairs)', 'WrenchScrewdriverIcon', {
        customStyle: { dotColor: '#2d6a3e', textColor: '#14b8a6' } // teal
      }),
      item('/stay', 'Stay', 'HomeIcon', {
        customStyle: { dotColor: '#2d6a3e', textColor: '#3b82f6' }, // mavi (blue)
        subItems: [
          { to: '/stay/book-accommodation', label: 'Book Accommodation' },
          { to: '/stay/home', label: 'Home' },
          { to: '/stay/hotel', label: 'Hotel' }
        ]
      }),
      item('/experience', 'Experience', 'CalendarDaysIcon', {
        customStyle: { dotColor: '#2d6a3e', textColor: '#eab308' }, // sarı (yellow)
        subItems: [
          { to: '/experience/kite-packages', label: 'Kite Packages' },
          { to: '/experience/wing-packages', label: 'Wing Packages' },
          { to: '/experience/downwinders', label: 'DownWinders' },
          { to: '/experience/camps', label: 'Camps' }
        ]
      }),
      // Community/Events - Sky Blue (icon only, with Chat and Events as subcategories)
      item('/community', 'Community/Events', 'ChatBubbleLeftRightIcon', {
        customStyle: { textColor: '#0ea5e9' },
        subItems: [
          { to: '/chat', label: 'Chat', icon: 'ChatBubbleLeftRightIcon' },
          { to: '/services/events', label: 'Events', icon: 'CalendarDaysIcon' }
        ]
      })
    ];
  }
  
  if (r === ROLES.STUDENT && featureFlags.studentPortal) {
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
      item('/student/dashboard', 'Dashboard', 'HomeIcon', {
        customStyle: { dotColor: '#2d6a3e', textColor: '#3b82f6' } // mavi (blue)
      }),
      item('/academy', 'Academy', 'AcademicCapIcon', {
        customStyle: { dotColor: '#2d6a3e', textColor: '#4ade80' }, // açık yeşil (light green)
        subItems: [
          { to: '/academy/book-service', label: 'Book a Service' },
          { to: '/student/schedule', label: 'My Lessons' },
          { to: '/student/courses', label: 'My Packages' },
          { to: '/academy/progress', label: 'Learning Progress' }
        ]
      }),
      item('/rental', 'Rental', 'CubeIcon', {
        customStyle: { dotColor: '#2d6a3e', textColor: '#fb923c' }, // turuncu (orange)
        subItems: [
          { to: '/rental/book-equipment', label: 'Book Equipment' },
          { to: '/rental/my-rentals', label: 'My Equipment Rentals' }
        ]
      }),
      item('/members/offerings', 'Member', 'SparklesIcon', {
        customStyle: { dotColor: '#2d6a3e', textColor: '#93c47d' } // fıstık yeşili (pistachio green)
      }),
      item('/stay', 'Stay', 'HomeIcon', {
        customStyle: { dotColor: '#2d6a3e', textColor: '#3b82f6' }, // mavi (blue)
        subItems: [
          { to: '/stay/book-accommodation', label: 'Book Accommodation' },
          { to: '/stay/hotel', label: 'Hotel' },
          { to: '/stay/home', label: 'Home' },
          { to: '/stay/my-accommodation', label: 'My Accommodation' }
        ]
      }),
      item('/experience', 'Experience', 'CalendarDaysIcon', {
        customStyle: { dotColor: '#2d6a3e', textColor: '#eab308' }, // sarı (yellow)
        subItems: [
          { to: '/student/courses', label: 'My Packages' },
          { to: '/experience/kite-packages', label: 'Kite Packages' },
          { to: '/experience/wing-packages', label: 'Wing Packages' },
          { to: '/experience/downwinders', label: 'DownWinders' },
          { to: '/experience/camps', label: 'Camps' }
        ]
      }),
      item('/care', 'Care', 'WrenchScrewdriverIcon', {
        customStyle: { dotColor: '#2d6a3e', textColor: '#14b8a6' }, // teal
        subItems: [
          { to: '/repairs', label: 'Equipment Repairs' }
        ]
      }),
      // Community/Events - Sky Blue (icon only, with Chat and Events as subcategories)
      item('/community', 'Community/Events', 'ChatBubbleLeftRightIcon', {
        customStyle: { textColor: '#0ea5e9' },
        subItems: [
          { to: '/chat', label: 'Chat', icon: 'ChatBubbleLeftRightIcon' },
          { to: '/services/events', label: 'Events', icon: 'CalendarDaysIcon' }
        ]
      }),
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
      // Dashboard - Blue (icon only)
      item('/dashboard', 'Dashboard', 'HomeIcon', {
        customStyle: { textColor: '#3b82f6' }
      }),
      // Customers - Cyan (icon only)
      item('/customers', 'Customers', 'UsersIcon', {
        customStyle: { textColor: '#06b6d4' }
      }),
      // Instructors - Yellow (icon only)
      item('/instructors', 'Instructors', 'AcademicCapIcon', {
        customStyle: { textColor: '#eab308' }
      }),
      // Calendars - Teal (icon only)
      item('/calendars', 'Calendars', 'CalendarDaysIcon', {
        customStyle: { textColor: '#14b8a6' },
        subItems: [
          { to: '/calendars/lessons', label: 'Academy', dotColor: '#4ade80' },
          { to: '/calendars/rentals', label: 'Rental', dotColor: '#fb923c' },
          { to: '/calendars/members', label: 'Member', dotColor: '#93c47d' },
          { to: '/calendars/stay', label: 'Stay', dotColor: '#8b5cf6' },
          { to: '/repairs', label: 'Care', dotColor: '#14b8a6' },
          { to: '/calendars/shop-orders', label: 'Shop', dotColor: '#ec4899' }
        ]
      }),
      // Services Parameters - Orange (renamed, icon only, no dots in subitems)
      item('/services', 'Services Parameters', 'CogIcon', {
        customStyle: { textColor: '#fb923c' },
        subItems: [
          { to: '/services/lessons', label: 'Lessons', icon: 'AcademicCapIcon' },
          { to: '/services/rentals', label: 'Rentals', icon: 'CubeIcon' },
          { to: '/services/packages', label: 'Packages', icon: 'CubeIcon' },
          { to: '/services/accommodation', label: 'Accommodation', icon: 'HomeIcon' },
          { to: '/services/shop', label: 'Shop', icon: 'ShoppingBagIcon' },
          { to: '/services/memberships', label: 'Memberships', icon: 'SparklesIcon' },
          { to: '/calendars/events', label: 'Events', icon: 'CalendarDaysIcon' }
        ]
      }),
      // Finance - Emerald (icon only, no dot)
      item('/finance', 'Finance', 'CurrencyDollarIcon', {
        customStyle: { textColor: '#10b981' },
        subItems: [
          { to: '/finance', label: 'Overall', icon: 'PresentationChartBarIcon' },
          { to: '/finance/lessons', label: 'Lessons', icon: 'AcademicCapIcon' },
          { to: '/finance/rentals', label: 'Rentals', icon: 'CubeIcon' },
          { to: '/finance/membership', label: 'Member', icon: 'SparklesIcon' },
          { to: '/finance/accommodation', label: 'Accommodation', icon: 'HomeIcon' },
          { to: '/finance/events', label: 'Events', icon: 'CalendarDaysIcon' },
          { to: '/finance/shop', label: 'Shop', icon: 'ShoppingBagIcon' },
          { to: '/finance/payment-history', label: 'Payment History', icon: 'WalletIcon' },
          { to: '/finance/expenses', label: 'Expenses', icon: 'CurrencyDollarIcon' }
        ]
      }),
      // Marketing - Rose (icon only, no dot)
      item('/marketing', 'Marketing', 'MegaphoneIcon', {
        customStyle: { textColor: '#f43f5e' },
        subItems: [
          { to: '/marketing', label: 'Marketing Dashboard', icon: 'PresentationChartBarIcon' },
          { to: '/quick-links', label: 'Quick Links', icon: 'SparklesIcon' }
        ]
      }),
      // Rating Analytics - Amber (icon only, no dot)
      item('/admin/ratings-analytics', 'Rating Analytics', 'PresentationChartBarIcon', {
        customStyle: { textColor: '#f59e0b' }
      }),
      // Community/Events - Sky Blue (icon only, with Chat and Events as subcategories)
      item('/community', 'Community/Events', 'ChatBubbleLeftRightIcon', {
        customStyle: { textColor: '#0ea5e9' },
        subItems: [
          { to: '/chat', label: 'Chat', icon: 'ChatBubbleLeftRightIcon' },
          { to: '/services/events', label: 'Events', icon: 'CalendarDaysIcon' }
        ]
      }),
      // Shop - Pink with dot (at bottom after Community)
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
    // Dashboard - No dot, icon only, slate color (matches logout)
    item('/dashboard', 'Dashboard', 'HomeIcon', {
      customStyle: { textColor: '#cbd5e1' }
    }),
    // Customers - No dot, icon only, slate color (matches logout)
    item('/customers', 'Customers', 'UsersIcon', {
      customStyle: { textColor: '#cbd5e1' }
    }),
    // Shop - Pink - 3rd position
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
    // Academy - Light Green (requires bookings or equipment permissions)
    item('/calendars', 'Academy', 'AcademicCapIcon', {
      customStyle: { dotColor: '#2d6a3e', textColor: '#4ade80' },
      subItems: [
        { to: '/calendars/lessons', label: 'Lessons' },
        { to: '/calendars/rentals', label: 'Rentals' },
        { to: '/services/events', label: 'Events' },
        { to: '/inventory', label: 'Inventory' }
      ]
    }),
    // Member - Pistachio Green (requires users permissions)
    item('/members/offerings', 'Member', 'SparklesIcon', {
      customStyle: { dotColor: '#2d6a3e', textColor: '#93c47d' }
    }),
    // Instructors - Yellow (requires instructors permissions)
    item('/instructors', 'Instructors', 'AcademicCapIcon', {
      customStyle: { dotColor: '#2d6a3e', textColor: '#eab308' }
    }),
    // Services Settings - Orange (requires services:write or admin)
    item('/services', 'Services Settings', 'CogIcon', {
      customStyle: { dotColor: '#2d6a3e', textColor: '#fb923c' },
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
      customStyle: { dotColor: '#2d6a3e', textColor: '#10b981' },
      subItems: [
        { to: '/finance', label: 'Overall' },
        { to: '/finance/lessons', label: 'Lessons' },
        { to: '/finance/rentals', label: 'Rentals' },
        { to: '/finance/membership', label: 'Membership' },
        { to: '/finance/shop', label: 'Shop' },
        { to: '/finance/daily-operations', label: 'Daily Operations' },
        { to: '/finance/expenses', label: 'Expenses' }
      ]
    }),
    // Care - Teal (requires equipment permissions)
    item('/repairs', 'Care', 'WrenchScrewdriverIcon', {
      customStyle: { dotColor: '#2d6a3e', textColor: '#14b8a6' }
    }),
    // Marketing - Rose (requires marketing or admin permissions)
    item('/marketing', 'Marketing', 'MegaphoneIcon', {
      customStyle: { dotColor: '#2d6a3e', textColor: '#f43f5e' },
      subItems: [
        { to: '/marketing', label: 'Marketing Dashboard' },
        { to: '/quick-links', label: 'Quick Links' }
      ]
    }),
    // Rating Analytics - Amber (requires reports permissions)
    item('/admin/ratings-analytics', 'Rating Analytics', 'PresentationChartBarIcon', {
      customStyle: { dotColor: '#2d6a3e', textColor: '#f59e0b' }
    }),
    // Community/Events - Sky Blue (requires notifications permissions)
    item('/community', 'Community/Events', 'ChatBubbleLeftRightIcon', {
      customStyle: { textColor: '#0ea5e9' },
      subItems: [
        { to: '/chat', label: 'Chat', icon: 'ChatBubbleLeftRightIcon' },
        { to: '/services/events', label: 'Events', icon: 'CalendarDaysIcon' }
      ]
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
  
  // For outsider and student roles, no system items
  if (r === ROLES.OUTSIDER || r === ROLES.STUDENT) {
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
          { to: '/admin/vouchers', label: 'Vouchers', icon: 'SparklesIcon' },
          { to: '/admin/spare-parts', label: 'Spare Parts', icon: 'WrenchScrewdriverIcon' },
          { to: '/admin/deleted-bookings', label: 'Deleted Bookings', icon: 'TrashIcon' },
          { to: '/admin/manager-commissions', label: 'Manager Commissions', icon: 'CurrencyDollarIcon' }
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
          { to: '/admin/vouchers', label: 'Vouchers', icon: 'SparklesIcon' },
          { to: '/admin/spare-parts', label: 'Spare Parts', icon: 'WrenchScrewdriverIcon' },
          { to: '/admin/deleted-bookings', label: 'Deleted Bookings', icon: 'TrashIcon' },
          { to: '/admin/manager-commissions', label: 'Manager Commissions', icon: 'CurrencyDollarIcon' }
        ]
      })
    ];
  }
  
  // Custom roles without admin permissions - no settings menu
  return [];
};
