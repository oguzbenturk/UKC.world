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

// Shared sub-item lists (reused across multiple roles)
const SHOP_SUBITEMS = [
  { to: '/shop/kitesurf', label: 'Kitesurf', labelKey: 'common:nav.kitesurf' },
  { to: '/shop/wingfoil', label: 'Wing Foil', labelKey: 'common:nav.wingFoil' },
  { to: '/shop/foiling', label: 'Foiling', labelKey: 'common:nav.foiling' },
  { to: '/shop/efoil', label: 'E-Foiling', labelKey: 'common:nav.efoiling' },
  { to: '/shop/ion', label: 'ION', labelKey: 'common:nav.ion' },
  { to: '/shop/secondwind', label: 'SecondWind', labelKey: 'common:nav.secondwind' }
];

const ACADEMY_PUBLIC_SUBITEMS = [
  { to: '/academy/kite-lessons', label: 'Kite Lessons', labelKey: 'common:nav.kiteLessons' },
  { to: '/academy/foil-lessons', label: 'Foil Lessons', labelKey: 'common:nav.foilLessons' },
  { to: '/academy/wing-lessons', label: 'Wing Lessons', labelKey: 'common:nav.wingLessons' },
  { to: '/academy/efoil-lessons', label: 'E-Foil Lessons', labelKey: 'common:nav.efoilLessons' },
  { to: '/academy/premium-lessons', label: 'Premium Lessons', labelKey: 'common:nav.premiumLessons' }
];

const RENTAL_SUBITEMS = [
  { to: '/rental/standard', label: 'Standard Equipment', labelKey: 'common:nav.standardEquipment' },
  { to: '/rental/sls', label: 'SLS Equipment', labelKey: 'common:nav.slsEquipment' },
  { to: '/rental/dlab', label: 'D/LAB Equipment', labelKey: 'common:nav.dlabEquipment' },
  { to: '/rental/efoil', label: 'E-Foil Equipment', labelKey: 'common:nav.efoilEquipment' }
];

const STAY_SUBITEMS = [
  { to: '/stay/home', label: 'Home', labelKey: 'common:nav.home' },
  { to: '/stay/hotel', label: 'Hotel', labelKey: 'common:nav.hotel' }
];

const EXPERIENCE_SUBITEMS = [
  { to: '/experience/kite-packages', label: 'Kite Packages', labelKey: 'common:nav.kitePackages' },
  { to: '/experience/wing-packages', label: 'Wing Packages', labelKey: 'common:nav.wingPackages' },
  { to: '/experience/downwinders', label: 'DownWinders', labelKey: 'common:nav.downwinders' },
  { to: '/experience/camps', label: 'Camps', labelKey: 'common:nav.camps' }
];

const COMMUNITY_SUBITEMS = [
  { to: '/community/team', label: 'Team', labelKey: 'common:nav.team' },
  { to: '/chat', label: 'Chat', labelKey: 'common:nav.chat' },
  { to: '/services/events', label: 'Events', labelKey: 'common:nav.events' }
];

export const getNavItemsForRole = (role, userPermissions = null) => {
  const r = role?.toLowerCase?.();

  // Outsider role OR unauthenticated (guest) - ukc.World custom menu structure with styled dots (colors from actual images)
  if (r === ROLES.OUTSIDER || !r || r === 'undefined') {
    return [
      ...(featureFlags.publicShopEnabled ? [item('/shop', 'Shop', 'ShoppingBagIcon', {
        labelKey: 'common:nav.shop',
        customStyle: { dotColor: '#2d6a3e', textColor: '#ec4899' },
        isShopLink: true,
        subItems: SHOP_SUBITEMS
      })] : []),
      item('/academy', 'Academy', 'AcademicCapIcon', {
        labelKey: 'common:nav.academy',
        customStyle: { dotColor: '#2d6a3e', textColor: '#4ade80' },
        isDirectLink: true,
        subItems: ACADEMY_PUBLIC_SUBITEMS
      }),
      item('/rental', 'Rental', 'CubeIcon', {
        labelKey: 'common:nav.rental',
        customStyle: { dotColor: '#2d6a3e', textColor: '#fb923c' },
        isDirectLink: true,
        subItems: RENTAL_SUBITEMS
      }),
      item('/members/offerings', 'Member', 'UsersIcon', {
        labelKey: 'common:nav.member',
        customStyle: { dotColor: '#2d6a3e', textColor: '#93c47d' }
      }),
      item('/care', 'Care (Repairs)', 'WrenchScrewdriverIcon', {
        labelKey: 'common:nav.careRepairs',
        customStyle: { dotColor: '#2d6a3e', textColor: '#14b8a6' }
      }),
      item('/stay', 'Stay', 'HomeIcon', {
        labelKey: 'common:nav.stay',
        customStyle: { dotColor: '#2d6a3e', textColor: '#3b82f6' },
        isDirectLink: true,
        subItems: STAY_SUBITEMS
      }),
      item('/experience', 'Experience', 'CalendarDaysIcon', {
        labelKey: 'common:nav.experience',
        customStyle: { dotColor: '#2d6a3e', textColor: '#eab308' },
        isDirectLink: true,
        subItems: EXPERIENCE_SUBITEMS
      }),
      item('/community', 'Community', 'ChatBubbleLeftRightIcon', {
        labelKey: 'common:nav.community',
        customStyle: { dotColor: '#2d6a3e', textColor: '#0ea5e9' },
        subItems: COMMUNITY_SUBITEMS
      }),
      item('/contact', 'Contact', 'EnvelopeIcon', {
        labelKey: 'common:nav.contact',
        customStyle: { dotColor: '#2d6a3e', textColor: '#94a3b8' }
      })
    ];
  }

  if ((r === ROLES.STUDENT || r === ROLES.TRUSTED_CUSTOMER) && featureFlags.studentPortal) {
    return [
      ...(featureFlags.publicShopEnabled ? [item('/shop', 'Shop', 'ShoppingBagIcon', {
        labelKey: 'common:nav.shop',
        customStyle: { dotColor: '#2d6a3e', textColor: '#ec4899' },
        isShopLink: true,
        subItems: SHOP_SUBITEMS
      })] : []),
      item('/academy', 'Academy', 'AcademicCapIcon', {
        labelKey: 'common:nav.academy',
        customStyle: { dotColor: '#2d6a3e', textColor: '#4ade80' },
        isDirectLink: true,
        subItems: [
          { to: '/student/dashboard', label: 'Dashboard', labelKey: 'common:nav.dashboard' },
          { to: '/student/schedule', label: 'My Lessons', labelKey: 'common:nav.myLessons' },
          ...ACADEMY_PUBLIC_SUBITEMS
        ]
      }),
      item('/rental', 'Rental', 'CubeIcon', {
        labelKey: 'common:nav.rental',
        customStyle: { dotColor: '#2d6a3e', textColor: '#fb923c' },
        isDirectLink: true,
        subItems: RENTAL_SUBITEMS
      }),
      item('/members/offerings', 'Member', 'SparklesIcon', {
        labelKey: 'common:nav.member',
        customStyle: { dotColor: '#2d6a3e', textColor: '#93c47d' }
      }),
      item('/repairs', 'Care (Repairs)', 'WrenchScrewdriverIcon', {
        labelKey: 'common:nav.careRepairs',
        customStyle: { dotColor: '#2d6a3e', textColor: '#14b8a6' }
      }),
      item('/stay', 'Stay', 'HomeIcon', {
        labelKey: 'common:nav.stay',
        customStyle: { dotColor: '#2d6a3e', textColor: '#3b82f6' },
        isDirectLink: true,
        subItems: STAY_SUBITEMS
      }),
      item('/experience', 'Experience', 'CalendarDaysIcon', {
        labelKey: 'common:nav.experience',
        customStyle: { dotColor: '#2d6a3e', textColor: '#eab308' },
        isDirectLink: true,
        subItems: EXPERIENCE_SUBITEMS
      }),
      item('/community', 'Community', 'ChatBubbleLeftRightIcon', {
        labelKey: 'common:nav.community',
        customStyle: { dotColor: '#2d6a3e', textColor: '#0ea5e9' },
        subItems: COMMUNITY_SUBITEMS
      }),
      item('/student/payments', 'Wallet Payments', 'WalletIcon', {
        labelKey: 'common:nav.walletPayments',
        customStyle: { textColor: '#10b981' }
      }),
      item('/student/support', 'Support', 'LifebuoyIcon', {
        labelKey: 'common:nav.support',
        customStyle: { textColor: '#f59e0b' }
      }),
      item('/contact', 'Contact', 'EnvelopeIcon', {
        labelKey: 'common:nav.contact',
        customStyle: { textColor: '#94a3b8' }
      }),
      item('/student/profile', 'Profile', 'UserCircleIcon', {
        labelKey: 'common:nav.profile',
        customStyle: { textColor: '#cbd5e1' },
        subItems: [
          { to: '/student/profile', label: 'Profile Overview', labelKey: 'common:nav.profileOverview' },
          { to: '/student/family', label: 'Family', labelKey: 'common:nav.family' }
        ]
      })
    ];
  }
  const dashboardPath = r === ROLES.INSTRUCTOR ? '/instructor/dashboard' : '/dashboard';

  if (r === ROLES.INSTRUCTOR) {
    return [
      ...(featureFlags.publicShopEnabled ? [item('/shop', 'Shop', 'ShoppingBagIcon', {
        labelKey: 'common:nav.shop',
        customStyle: { dotColor: '#2d6a3e', textColor: '#ec4899' },
        isShopLink: true,
        subItems: SHOP_SUBITEMS
      })] : []),
      item('/instructor/dashboard', 'Dashboard', 'HomeIcon', {
        labelKey: 'common:nav.dashboard',
        customStyle: { dotColor: '#2d6a3e', textColor: '#3b82f6' }
      }),
      item('/instructor/students', 'My Students', 'UsersIcon', {
        labelKey: 'common:nav.myStudents',
        customStyle: { dotColor: '#2d6a3e', textColor: '#06b6d4' }
      }),
      item('/calendars', 'Academy', 'AcademicCapIcon', {
        labelKey: 'common:nav.academy',
        customStyle: { dotColor: '#2d6a3e', textColor: '#4ade80' },
        subItems: [
          { to: '/bookings/calendar', label: 'Calendar View', labelKey: 'common:nav.calendarView' },
          { to: '/services/events', label: 'Events', labelKey: 'common:nav.events' }
        ]
      }),
      item('/repairs', 'Care', 'WrenchScrewdriverIcon', {
        labelKey: 'common:nav.care',
        customStyle: { dotColor: '#2d6a3e', textColor: '#14b8a6' }
      }),
      item('/finance', 'Finance', 'CurrencyDollarIcon', {
        labelKey: 'common:nav.finance',
        customStyle: { dotColor: '#2d6a3e', textColor: '#10b981' }
      }),
      item('/chat', 'Messages', 'ChatBubbleLeftRightIcon', {
        labelKey: 'common:nav.messages',
        customStyle: { dotColor: '#2d6a3e', textColor: '#0ea5e9' }
      }),
      item('/contact', 'Contact', 'EnvelopeIcon', {
        labelKey: 'common:nav.contact',
        customStyle: { dotColor: '#2d6a3e', textColor: '#94a3b8' }
      })
    ];
  }

  if ([ROLES.MANAGER, ROLES.ADMIN, ROLES.DEVELOPER].includes(r)) {
    return [
      item('/dashboard', 'Dashboard', 'HomeIcon', {
        labelKey: 'common:nav.dashboard',
        customStyle: { textColor: '#3b82f6' }
      }),
      item('/customers', 'Customers', 'UsersIcon', {
        labelKey: 'common:nav.customers',
        customStyle: { textColor: '#06b6d4' }
      }),
      item('/instructors', 'Instructors', 'AcademicCapIcon', {
        labelKey: 'common:nav.instructors',
        customStyle: { textColor: '#eab308' },
        isDirectLink: true,
        subItems: [
          { to: '/instructors/managers', label: 'Managers', labelKey: 'common:nav.managers', noDot: true }
        ]
      }),
      item('/calendars', 'Calendars', 'CalendarDaysIcon', {
        labelKey: 'common:nav.calendars',
        customStyle: { textColor: '#14b8a6' },
        subItems: [
          { to: '/calendars/shop-orders', label: 'Shop', labelKey: 'common:nav.shop', dotColor: '#ec4899' },
          { to: '/calendars/lessons', label: 'Academy', labelKey: 'common:nav.academy', dotColor: '#4ade80' },
          { to: '/calendars/rentals', label: 'Rental', labelKey: 'common:nav.rental', dotColor: '#fb923c' },
          { to: '/calendars/members', label: 'Member', labelKey: 'common:nav.member', dotColor: '#93c47d' },
          { to: '/repairs', label: 'Care', labelKey: 'common:nav.care', dotColor: '#14b8a6' },
          { to: '/calendars/stay', label: 'Stay', labelKey: 'common:nav.stay', dotColor: '#3b82f6' },
          { to: '/calendars/events', label: 'Community (Events)', labelKey: 'common:nav.communityEvents', dotColor: '#0ea5e9' }
        ]
      }),
      item('/services', 'Services Parameters', 'CogIcon', {
        labelKey: 'common:nav.servicesParameters',
        customStyle: { textColor: '#fb923c' },
        subItems: [
          { to: '/services/shop', label: 'Shop', labelKey: 'common:nav.shop', dotColor: '#ec4899' },
          { to: '/services/lessons', label: 'Academy', labelKey: 'common:nav.academy', dotColor: '#4ade80' },
          { to: '/services/rentals', label: 'Rental', labelKey: 'common:nav.rental', dotColor: '#fb923c' },
          { to: '/services/memberships', label: 'Member', labelKey: 'common:nav.member', dotColor: '#93c47d' },
          { to: '/services/accommodation', label: 'Stay', labelKey: 'common:nav.stay', dotColor: '#3b82f6' },
          { to: '/services/packages', label: 'Experience', labelKey: 'common:nav.experience', dotColor: '#eab308' },
          { to: '/services/events', label: 'Events', labelKey: 'common:nav.events', dotColor: '#0ea5e9' }
        ]
      }),
      item('/finance', 'Finance', 'CurrencyDollarIcon', {
        labelKey: 'common:nav.finance',
        customStyle: { textColor: '#10b981' },
        subItems: [
          { to: '/finance/shop', label: 'Shop', labelKey: 'common:nav.shop', dotColor: '#ec4899' },
          { to: '/finance/lessons', label: 'Academy', labelKey: 'common:nav.academy', dotColor: '#4ade80' },
          { to: '/finance/rentals', label: 'Rental', labelKey: 'common:nav.rental', dotColor: '#fb923c' },
          { to: '/finance/membership', label: 'Member', labelKey: 'common:nav.member', dotColor: '#93c47d' },
          { to: '/finance/accommodation', label: 'Stay', labelKey: 'common:nav.stay', dotColor: '#3b82f6' },
          { to: '/finance/events', label: 'Community', labelKey: 'common:nav.community', dotColor: '#0ea5e9' },
          { to: '/finance/payment-history', label: 'Payment History', labelKey: 'common:nav.paymentHistory', icon: 'WalletIcon' },
          { to: '/finance/wallet-deposits', label: 'Wallet Deposits', labelKey: 'common:nav.walletDeposits', icon: 'WalletIcon' },
          { to: '/finance/expenses', label: 'Expenses', labelKey: 'common:nav.expenses', icon: 'CurrencyDollarIcon' },
          { to: '/finance', label: 'Overall', labelKey: 'common:nav.overall', icon: 'PresentationChartBarIcon' }
        ]
      }),
      item('/marketing', 'Marketing', 'MegaphoneIcon', {
        labelKey: 'common:nav.marketing',
        customStyle: { textColor: '#f43f5e' },
        subItems: [
          { to: '/marketing', label: 'Campaign Builder', labelKey: 'common:nav.campaignBuilder', icon: 'RocketLaunchIcon' },
          { to: '/quick-links', label: 'Links & Forms', labelKey: 'common:nav.linksAndForms', icon: 'LinkIcon' },
          { to: '/admin/vouchers', label: 'Vouchers', labelKey: 'common:nav.vouchers', icon: 'SparklesIcon' }
        ]
      }),
      item('/admin/ratings-analytics', 'Rating Analytics', 'PresentationChartBarIcon', {
        labelKey: 'common:nav.ratingAnalytics',
        customStyle: { textColor: '#f59e0b' }
      }),
      item('/shop', 'Shop', 'ShoppingBagIcon', {
        labelKey: 'common:nav.shop',
        customStyle: { dotColor: '#2d6a3e', textColor: '#ec4899' },
        isShopLink: true
      })
    ];
  }

  // For any custom/unrecognized roles (e.g., "Front Desk"), provide navigation
  // filtered by their actual permissions from the database.
  const allStaffNavItems = [
    item('/dashboard', 'Dashboard', 'HomeIcon', {
      labelKey: 'common:nav.dashboard',
      customStyle: { textColor: '#3b82f6' }
    }),
    item('/customers', 'Customers', 'UsersIcon', {
      labelKey: 'common:nav.customers',
      customStyle: { textColor: '#06b6d4' }
    }),
    ...(featureFlags.publicShopEnabled ? [item('/shop', 'Shop', 'ShoppingBagIcon', {
      labelKey: 'common:nav.shop',
      customStyle: { dotColor: '#2d6a3e', textColor: '#ec4899' },
      isShopLink: true,
      subItems: SHOP_SUBITEMS
    })] : []),
    item('/calendars', 'Academy', 'AcademicCapIcon', {
      labelKey: 'common:nav.academy',
      customStyle: { dotColor: '#2d6a3e', textColor: '#4ade80' },
      subItems: [
        { to: '/calendars/lessons', label: 'Lessons', labelKey: 'common:nav.lessons' },
        { to: '/inventory', label: 'Inventory', labelKey: 'common:nav.inventory' }
      ]
    }),
    item('/calendars/rentals', 'Rental', 'CubeIcon', {
      labelKey: 'common:nav.rental',
      customStyle: { dotColor: '#2d6a3e', textColor: '#fb923c' }
    }),
    item('/members/offerings', 'Member', 'SparklesIcon', {
      labelKey: 'common:nav.member',
      customStyle: { dotColor: '#2d6a3e', textColor: '#93c47d' }
    }),
    item('/repairs', 'Care', 'WrenchScrewdriverIcon', {
      labelKey: 'common:nav.care',
      customStyle: { dotColor: '#2d6a3e', textColor: '#14b8a6' }
    }),
    item('/calendars/stay', 'Stay', 'HomeIcon', {
      labelKey: 'common:nav.stay',
      customStyle: { dotColor: '#2d6a3e', textColor: '#3b82f6' }
    }),
    item('/services/packages', 'Experience', 'CalendarDaysIcon', {
      labelKey: 'common:nav.experience',
      customStyle: { dotColor: '#2d6a3e', textColor: '#eab308' }
    }),
    item('/community', 'Community', 'ChatBubbleLeftRightIcon', {
      labelKey: 'common:nav.community',
      customStyle: { dotColor: '#2d6a3e', textColor: '#0ea5e9' },
      subItems: COMMUNITY_SUBITEMS
    }),
    item('/instructors', 'Instructors', 'AcademicCapIcon', {
      labelKey: 'common:nav.instructors',
      customStyle: { textColor: '#eab308' },
      subItems: [
        { to: '/instructors/managers', label: 'Managers', labelKey: 'common:nav.managers', dotColor: '#8b5cf6' }
      ]
    }),
    item('/services', 'Services Settings', 'CogIcon', {
      labelKey: 'common:nav.servicesSettings',
      customStyle: { textColor: '#fb923c' },
      subItems: [
        { to: '/services/lessons', label: 'Lesson Parameters', labelKey: 'common:nav.lessonParameters' },
        { to: '/services/rentals', label: 'Rental Parameters', labelKey: 'common:nav.rentalParameters' },
        { to: '/services/packages', label: 'Package Manager', labelKey: 'common:nav.packageManager' },
        { to: '/services/accommodation', label: 'Accommodation', labelKey: 'common:nav.accommodation' },
        { to: '/services/shop', label: 'Shop Management', labelKey: 'common:nav.shopManagement' },
        { to: '/services/memberships', label: 'Memberships', labelKey: 'common:nav.memberships' },
        { to: '/services/categories', label: 'Category Parameters', labelKey: 'common:nav.categoryParameters' },
        { to: '/calendars/events', label: 'Event Manager', labelKey: 'common:nav.eventManager' }
      ]
    }),
    item('/finance', 'Finance', 'CurrencyDollarIcon', {
      labelKey: 'common:nav.finance',
      customStyle: { textColor: '#10b981' },
      subItems: [
        { to: '/finance', label: 'Overall', labelKey: 'common:nav.overall' },
        { to: '/finance/lessons', label: 'Lessons', labelKey: 'common:nav.lessons' },
        { to: '/finance/rentals', label: 'Rentals', labelKey: 'common:nav.rentals' },
        { to: '/finance/membership', label: 'Membership', labelKey: 'common:nav.membership' },
        { to: '/finance/shop', label: 'Shop', labelKey: 'common:nav.shop' },
        { to: '/finance/daily-operations', label: 'Daily Operations', labelKey: 'common:nav.dailyOperations' },
        { to: '/finance/expenses', label: 'Expenses', labelKey: 'common:nav.expenses' }
      ]
    }),
    item('/marketing', 'Marketing', 'MegaphoneIcon', {
      labelKey: 'common:nav.marketing',
      customStyle: { textColor: '#f43f5e' },
      subItems: [
        { to: '/marketing', label: 'Campaign Builder', labelKey: 'common:nav.campaignBuilder', icon: 'RocketLaunchIcon' },
        { to: '/quick-links', label: 'Links & Forms', labelKey: 'common:nav.linksAndForms', icon: 'LinkIcon' },
        { to: '/admin/vouchers', label: 'Vouchers', labelKey: 'common:nav.vouchers', icon: 'SparklesIcon' }
      ]
    }),
    item('/admin/ratings-analytics', 'Rating Analytics', 'PresentationChartBarIcon', {
      labelKey: 'common:nav.ratingAnalytics',
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

  if (r === ROLES.OUTSIDER || r === ROLES.STUDENT || r === ROLES.TRUSTED_CUSTOMER || !r || r === 'undefined') {
    return [];
  }

  if ([ROLES.MANAGER, ROLES.ADMIN, ROLES.DEVELOPER].includes(r)) {
    return [];
  }

  if (userPermissions && (userPermissions['admin:settings'] === true || userPermissions['admin:roles'] === true)) {
    return [];
  }

  return [];
};
