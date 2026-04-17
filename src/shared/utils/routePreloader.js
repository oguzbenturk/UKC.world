// Maps route prefixes to their dynamic import functions.
// Calling import() a second time returns the cached module — no double-download.
//
// Akyaka: public marketing routes have been removed. Only preload in-app routes
// that authenticated users land on.
const routeChunkMap = {
  '/guest': () => import('../../features/outsider/pages/GuestLandingPage'),
  '/shop/product': () => import('../../features/outsider/pages/ProductDetailPage'),
  '/shop': () => import('../../features/dashboard/pages/Shop'),
  '/members/offerings': () => import('../../features/members/pages/MemberOfferings'),
  '/student/dashboard': () => import('../../features/students/pages/StudentDashboard'),
  '/student/schedule': () => import('../../features/students/pages/StudentSchedule'),
  '/student/payments': () => import('../../features/students/pages/StudentPayments'),
  '/student/support': () => import('../../features/students/pages/StudentSupport'),
  '/student/profile': () => import('../../features/students/pages/StudentProfile'),
  '/student/family': () => import('../../features/students/pages/FamilyManagementPage'),
  '/student/friends': () => import('../../features/students/pages/StudentFriendsPage'),
  '/student/group-bookings': () => import('../../features/bookings/pages/StudentGroupBookingsPage'),
  '/chat': () => import('../../features/chat/pages/ChatPage'),
  '/notifications': () => import('../../features/notifications/pages/NotificationCenter'),
  '/settings': () => import('../../features/settings/pages/UserSettings'),
};

// Sort prefixes longest-first so /shop/product matches before /shop
const sortedPrefixes = Object.keys(routeChunkMap).sort((a, b) => b.length - a.length);

const preloaded = new Set();

export function preloadRoute(path) {
  if (!path || preloaded.has(path)) return;
  const match = sortedPrefixes.find(prefix => path.startsWith(prefix));
  if (match) {
    preloaded.add(path);
    routeChunkMap[match]();
  }
}
