import { ROLES } from './roleUtils';
import { featureFlags } from '../config/featureFlags';

const item = (to, label, icon, opts = {}) => ({ to, label, icon, ...opts });

export const getNavItemsForRole = (role) => {
  const r = role?.toLowerCase?.();
  
  // Outsider role - can book lessons, buy packages, shop, and access support
  if (r === ROLES.OUTSIDER) {
    return [
      item('/book', 'Book a Service', 'CalendarDaysIcon'),
      item('/accommodation', 'Accommodation', 'HomeIcon'),
      item('/outsider/packages', 'My Packages', 'AcademicCapIcon'),
      item('/calendars', 'Calendars', 'CalendarDaysIcon'),
      item('/chat', 'Messages', 'ChatBubbleLeftRightIcon'),
      item('/shop', 'Shop', 'ShoppingBagIcon'),
      item('/repairs', 'Repairs', 'WrenchScrewdriverIcon'),
      item('/help', 'Support', 'QuestionMarkCircleIcon')
    ];
  }
  
  if (r === ROLES.STUDENT && featureFlags.studentPortal) {
    return [
      item('/student/dashboard', 'Dashboard', 'HomeIcon'),
      item('/student/schedule', 'Schedule', 'CalendarDaysIcon'),
      item('/accommodation', 'Accommodation', 'HomeIcon'),
      item('/student/courses', 'Packages & Services', 'AcademicCapIcon'),
      item('/services/events', 'Events', 'CalendarDaysIcon'),
      item('/members/offerings', 'Membership', 'SparklesIcon'),
      item('/student/payments', 'Payments', 'CurrencyDollarIcon'),
      item('/repairs', 'Repairs', 'WrenchScrewdriverIcon'),
      item('/student/support', 'Support', 'QuestionMarkCircleIcon'),
      item('/chat', 'Messages', 'ChatBubbleLeftRightIcon'),
      item('/student/profile', 'Profile', 'UsersIcon', {
        subItems: [
          { to: '/student/profile', label: 'Profile Overview' },
          { to: '/student/family', label: 'Family' }
        ]
      }),
      item('/shop', 'Shop', 'ShoppingBagIcon')
    ];
  }
  const dashboardPath = r === ROLES.INSTRUCTOR ? '/instructor/dashboard' : '/dashboard';
  const base = [
    item(dashboardPath, 'Dashboard', 'HomeIcon')
  ];

  if (r === ROLES.INSTRUCTOR) {
    return [
      ...base,
      item('/instructor/students', 'My Students', 'UsersIcon'),
      item('/calendars', 'Calendars', 'CalendarDaysIcon', {
        subItems: [
          { to: '/calendars/lessons', label: 'Lessons' },
          { to: '/bookings/calendar', label: 'Calendar View' },
          { to: '/services/events', label: 'Events' }
        ]
      }),
      item('/members/offerings', 'Membership', 'SparklesIcon'),
      item('/shop', 'Shop', 'ShoppingBagIcon'),
      item('/repairs', 'Repairs', 'WrenchScrewdriverIcon'),
      item('/finance', 'Finance', 'CurrencyDollarIcon'),
      item('/chat', 'Messages', 'ChatBubbleLeftRightIcon')
    ];
  }

  if ([ROLES.MANAGER, ROLES.ADMIN, ROLES.DEVELOPER].includes(r)) {
    return [
      ...base,
      item('/customers', 'Customers', 'UsersIcon'),
      item('/calendars', 'Calendars', 'CalendarDaysIcon', {
        subItems: [
          { to: '/calendars/lessons', label: 'Lessons' },
          { to: '/calendars/rentals', label: 'Rentals' },
          { to: '/services/events', label: 'Events' }
        ]
      }),
      item('/members/offerings', 'Membership', 'SparklesIcon'),
      item('/shop', 'Shop', 'ShoppingBagIcon'),
      item('/services', 'Services Settings', 'AcademicCapIcon', {
        subItems: [
          { to: '/services/accommodation', label: 'Accommodation' },
          { to: '/services/lessons', label: 'Lessons' },
          { to: '/services/rentals', label: 'Rentals' },
          { to: '/services/shop', label: 'Shop Management' },
          { to: '/services/packages', label: 'Package Management' },
          { to: '/services/memberships', label: 'Membership Settings' },
          { to: '/services/categories', label: 'Categories' },
          { to: '/calendars/events', label: 'Event Manager' }
        ]
      }),
      item('/finance', 'Finance', 'CurrencyDollarIcon', {
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
      item('/repairs', 'Repairs', 'WrenchScrewdriverIcon'),
      item('/marketing', 'Marketing', 'MegaphoneIcon'),
      item('/quick-links', 'Quick Links', 'LinkIcon'),
      item('/admin/ratings-analytics', 'Ratings Analytics', 'PresentationChartBarIcon'),
      item('/instructors', 'Instructors', 'AcademicCapIcon'),
      item('/inventory', 'Inventory', 'CubeIcon'),
      item('/chat', 'Messages', 'ChatBubbleLeftRightIcon')
    ];
  }
  return base;
};

export const getSystemItemsForRole = (role) => {
  const r = role?.toLowerCase?.();
  // System items moved to profile dropdown - only admin-specific items remain here
  if (r === ROLES.ADMIN) {
    return [
      item('/admin', 'Admin', 'CogIcon', {
        subItems: [
          { to: '/admin/roles', label: 'Roles' },
          { to: '/admin/waivers', label: 'Waivers' },
          { to: '/admin/vouchers', label: 'Vouchers' },
          { to: '/admin/spare-parts', label: 'Spare Parts' },
          { to: '/admin/deleted-bookings', label: 'Deleted Bookings' },
          { to: '/admin/manager-commissions', label: 'Manager Commissions' }
        ]
      })
    ];
  }
  return [];
};
