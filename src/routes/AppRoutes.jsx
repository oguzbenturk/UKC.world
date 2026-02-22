import React, { Suspense } from 'react';
import { Routes, Route, Navigate, Outlet, useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../shared/hooks/useAuth';

// ── Lightweight loading fallback for lazy-loaded routes ──
const LazyFallback = () => (
  <div className="flex items-center justify-center h-64">
    <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-sky-600" />
  </div>
);

// Helper – wraps a React.lazy() import so chunk-load failures show a retry
// button instead of crashing (this fixes the old "hanging" issue that
// originally caused lazy loading to be reverted to eager imports).
const lazyWithRetry = (factory) =>
  React.lazy(() =>
    factory().catch(() =>
      // If chunk fails (e.g. after deploy hash change), retry once after 1.5s
      new Promise((resolve) => setTimeout(resolve, 1500)).then(() =>
        factory().catch(() => ({
          default: () => (
            <div className="flex flex-col items-center justify-center h-64 gap-3">
              <p className="text-slate-600">Failed to load page.</p>
              <button
                onClick={() => window.location.reload()}
                className="px-4 py-2 bg-sky-600 text-white rounded-lg text-sm hover:bg-sky-700"
              >
                Reload
              </button>
            </div>
          ),
        }))
      )
    )
  );

// ── Eagerly loaded pages (critical path / first paint) ──
import Login from '../features/authentication/pages/Login';
import ResetPassword from '../features/authentication/pages/ResetPassword';

// ── Lazy-loaded pages (code-split for fast mobile load) ──
const ExecutiveDashboard = lazyWithRetry(() => import('../features/dashboard/pages/ExecutiveDashboard'));
const DashboardRouter = lazyWithRetry(() => import('../features/dashboard/pages/DashboardRouter'));
const InstructorDashboard = lazyWithRetry(() => import('../features/instructor/pages/InstructorDashboard'));
const InstructorDashboardFallback = lazyWithRetry(() => import('../features/instructor/pages/InstructorDashboardFallback'));
const MyStudents = lazyWithRetry(() => import('../features/instructor/pages/MyStudents'));
const StudentDetail = lazyWithRetry(() => import('../features/instructor/pages/StudentDetail'));
const Customers = lazyWithRetry(() => import('../features/customers/pages/Customers'));
const UserDetail = lazyWithRetry(() => import('../features/customers/pages/UserDetail'));
const UserFormPage = lazyWithRetry(() => import('../features/customers/pages/UserFormPage'));
const Instructors = lazyWithRetry(() => import('../features/instructors/pages/Instructors'));
const Equipment = lazyWithRetry(() => import('../features/equipment/pages/Equipment'));
const InventoryPage = lazyWithRetry(() => import('../features/inventory/pages/InventoryPage'));
const BookingsPage = lazyWithRetry(() => import('../features/bookings/pages/BookingsPage'));
const BookingEditPage = lazyWithRetry(() => import('../features/bookings/pages/BookingEditPage'));
const BookingCalendarPage = lazyWithRetry(() => import('../features/bookings/pages/BookingCalendarPage'));
const Settings = lazyWithRetry(() => import('../features/dashboard/pages/Settings'));
const Finance = lazyWithRetry(() => import('../features/finances/pages/Finance'));
const FinanceSettingsPage = lazyWithRetry(() => import('../features/finances/pages/FinanceSettingsPage'));
const Rentals = lazyWithRetry(() => import('../features/rentals/pages/Rentals'));
const AccommodationUnitsManager = lazyWithRetry(() => import('../features/services/pages/AccommodationUnitsManager'));
const AccommodationBookingPage = lazyWithRetry(() => import('../features/accommodation/pages/AccommodationBookingPage'));
const AccommodationAdminPage = lazyWithRetry(() => import('../features/accommodation/pages/AccommodationAdminPage'));
const LessonServices = lazyWithRetry(() => import('../features/services/pages/LessonServices'));
const RentalServices = lazyWithRetry(() => import('../features/services/pages/RentalServices'));
const ShopManagement = lazyWithRetry(() => import('../features/services/pages/ShopManagement'));
const PackageManagement = lazyWithRetry(() => import('../features/services/pages/PackageManagement'));
const ShopPage = lazyWithRetry(() => import('../features/dashboard/pages/Shop'));
const UserProfilePage = lazyWithRetry(() => import('../features/authentication/pages/UserProfilePage'));
const CustomerProfilePage = lazyWithRetry(() => import('../features/customers/pages/CustomerProfilePage'));
const InstructorFormPage = lazyWithRetry(() => import('../features/instructors/pages/InstructorFormPage'));
const Categories = lazyWithRetry(() => import('../features/services/pages/Categories'));
const MembershipSettings = lazyWithRetry(() => import('../features/services/pages/MembershipSettings'));
const RolesAdmin = lazyWithRetry(() => import('../features/admin/pages/RolesAdmin'));
const SparePartsOrders = lazyWithRetry(() => import('../features/admin/pages/SparePartsOrders'));
const InstructorRatingsAnalytics = lazyWithRetry(() => import('../features/admin/pages/InstructorRatingsAnalytics'));
const MemberOfferings = lazyWithRetry(() => import('../features/members/pages/MemberOfferings'));
const WaiverManagement = lazyWithRetry(() => import('../features/admin/pages/WaiverManagement'));
const VoucherManagement = lazyWithRetry(() => import('../features/admin/pages/VoucherManagement'));
const SupportTicketsPage = lazyWithRetry(() => import('../features/admin/pages/SupportTicketsPage'));
const LegalDocumentsPage = lazyWithRetry(() => import('../features/settings/pages/LegalDocumentsPage'));
const HelpSupport = lazyWithRetry(() => import('../features/help/pages/HelpSupport'));
const DeletedBookingsPage = lazyWithRetry(() => import('../components/admin/DeletedBookingsPage'));
const StudentLayout = lazyWithRetry(() => import('../features/students/components/StudentLayout'));
const StudentDashboard = lazyWithRetry(() => import('../features/students/pages/StudentDashboard'));
const StudentSchedule = lazyWithRetry(() => import('../features/students/pages/StudentSchedule'));
const StudentCourses = lazyWithRetry(() => import('../features/students/pages/StudentCourses'));
const StudentPayments = lazyWithRetry(() => import('../features/students/pages/StudentPayments'));
const StudentSupport = lazyWithRetry(() => import('../features/students/pages/StudentSupport'));
const StudentProfile = lazyWithRetry(() => import('../features/students/pages/StudentProfile'));
const FamilyManagementPage = lazyWithRetry(() => import('../features/students/pages/FamilyManagementPage'));
const StudentFriendsPage = lazyWithRetry(() => import('../features/students/pages/StudentFriendsPage'));
const StudentPortalUnavailable = lazyWithRetry(() => import('../features/students/pages/StudentPortalUnavailable'));
const StudentBookServicePage = lazyWithRetry(() => import('../features/students/pages/StudentBookServicePage'));
const StudentBookEquipmentPage = lazyWithRetry(() => import('../features/students/pages/StudentBookEquipmentPage'));
const StudentMyRentalsPage = lazyWithRetry(() => import('../features/students/pages/StudentMyRentalsPage'));
const StudentMyAccommodationPage = lazyWithRetry(() => import('../features/students/pages/StudentMyAccommodationPage'));
const NotificationCenter = lazyWithRetry(() => import('../features/notifications/pages/NotificationCenter'));
const PrivacyGdprPage = lazyWithRetry(() => import('../features/compliance/components/PrivacyGdprPage'));
const OutsiderBookingPage = lazyWithRetry(() => import('../features/outsider/pages/OutsiderBookingPage'));
const GuestLandingPage = lazyWithRetry(() => import('../features/outsider/pages/GuestLandingPage'));
const OutsiderPackagesPage = lazyWithRetry(() => import('../features/outsider/pages/OutsiderPackagesPage'));
const KiteLessonsPublicPage = lazyWithRetry(() => import('../features/outsider/pages/KiteLessonsPublicPage'));
const AcademyLandingPage = lazyWithRetry(() => import('../features/outsider/pages/AcademyLandingPage'));
const FoilLessonsPage = lazyWithRetry(() => import('../features/outsider/pages/FoilLessonsPage'));
const WingLessonsPage = lazyWithRetry(() => import('../features/outsider/pages/WingLessonsPage'));
const EFoilLessonsPage = lazyWithRetry(() => import('../features/outsider/pages/EFoilLessonsPage'));
const PremiumLessonsPage = lazyWithRetry(() => import('../features/outsider/pages/PremiumLessonsPage'));
const RentalStandardShowcasePage = lazyWithRetry(() => import('../features/outsider/pages/RentalStandardShowcasePage'));
const RentalPremiumShowcasePage = lazyWithRetry(() => import('../features/outsider/pages/RentalPremiumShowcasePage'));
const RentalSlsShowcasePage = lazyWithRetry(() => import('../features/outsider/pages/RentalSlsShowcasePage'));
const RentalDlabShowcasePage = lazyWithRetry(() => import('../features/outsider/pages/RentalDlabShowcasePage'));
const RentalEFoilShowcasePage = lazyWithRetry(() => import('../features/outsider/pages/RentalEFoilShowcasePage'));
const RentalLandingPage = lazyWithRetry(() => import('../features/outsider/pages/RentalLandingPage'));
const ContactPage = lazyWithRetry(() => import('../features/outsider/pages/ContactPage'));
const StayLandingPage = lazyWithRetry(() => import('../features/outsider/pages/StayLandingPage'));
const ExperienceLandingPage = lazyWithRetry(() => import('../features/outsider/pages/ExperienceLandingPage'));
// Stay pages
const StayBookingPage = lazyWithRetry(() => import('../features/outsider/pages/StayBookingPage'));
const StayHotelPage = lazyWithRetry(() => import('../features/outsider/pages/StayHotelPage'));
const StayHomePage = lazyWithRetry(() => import('../features/outsider/pages/StayHomePage'));
// Experience pages
const ExperienceBookPackagePage = lazyWithRetry(() => import('../features/outsider/pages/ExperienceBookPackagePage'));
const ExperienceKitePackagesPage = lazyWithRetry(() => import('../features/outsider/pages/ExperienceKitePackagesPage'));
const ExperienceWingPackagesPage = lazyWithRetry(() => import('../features/outsider/pages/ExperienceWingPackagesPage'));
const ExperienceDownwindersPage = lazyWithRetry(() => import('../features/outsider/pages/ExperienceDownwindersPage'));
const ExperienceCampsPage = lazyWithRetry(() => import('../features/outsider/pages/ExperienceCampsPage'));
const GroupInvitationPage = lazyWithRetry(() => import('../features/bookings/pages/GroupInvitationPage'));
const StudentGroupBookingsPage = lazyWithRetry(() => import('../features/bookings/pages/StudentGroupBookingsPage'));
const GroupBookingDetailPage = lazyWithRetry(() => import('../features/bookings/pages/GroupBookingDetailPage'));
const UserSettings = lazyWithRetry(() => import('../features/settings/pages/UserSettings'));
const ManagerDashboard = lazyWithRetry(() => import('../features/manager/pages/ManagerDashboard'));
const ManagerCommissionSettings = lazyWithRetry(() => import('../features/manager/pages/ManagerCommissionSettings'));
const ChatPage = lazyWithRetry(() => import('../features/chat/pages/ChatPage'));

// Calendar views
const LessonsCalendar = lazyWithRetry(() => import('../features/calendars/pages/LessonsCalendar'));
const RentalsCalendar = lazyWithRetry(() => import('../features/calendars/pages/RentalsCalendar'));
const RentalsCalendarView = lazyWithRetry(() => import('../features/rentals/pages/RentalsCalendarView'));
const EventsCalendar = lazyWithRetry(() => import('../features/calendars/pages/EventsCalendar'));
const EventsPage = lazyWithRetry(() => import('../features/events/pages/EventsPage'));

// Repairs
const RepairsPage = lazyWithRetry(() => import('../features/repairs/pages/RepairsPage'));
const CareLandingPage = lazyWithRetry(() => import('../features/outsider/pages/CareLandingPage'));

// Marketing
const MarketingPage = lazyWithRetry(() => import('../features/marketing/pages/MarketingPage'));

// Quick Links
const QuickLinksPage = lazyWithRetry(() => import('../features/quicklinks/pages/QuickLinksPage'));
const PublicQuickBooking = lazyWithRetry(() => import('../features/quicklinks/pages/PublicQuickBooking'));

// Form Builder
const FormsListPage = lazyWithRetry(() => import('../features/forms/pages/FormsListPage'));
const FormBuilderPage = lazyWithRetry(() => import('../features/forms/pages/FormBuilderPage'));
const FormPreviewPage = lazyWithRetry(() => import('../features/forms/pages/FormPreviewPage'));
const PublicFormPage = lazyWithRetry(() => import('../features/forms/pages/PublicFormPage'));
const FormSuccessPage = lazyWithRetry(() => import('../features/forms/pages/FormSuccessPage'));
const FormAnalyticsPage = lazyWithRetry(() => import('../features/forms/pages/FormAnalyticsPage'));
const FormResponsesPage = lazyWithRetry(() => import('../features/forms/pages/FormResponsesPage'));

// Finance sub-pages
const FinanceLessons = lazyWithRetry(() => import('../features/finances/pages/FinanceLessons'));
const FinanceRentals = lazyWithRetry(() => import('../features/finances/pages/FinanceRentals'));
const FinanceMembership = lazyWithRetry(() => import('../features/finances/pages/FinanceMembership'));
const FinanceShop = lazyWithRetry(() => import('../features/finances/pages/FinanceShop'));
const FinanceAccommodation = lazyWithRetry(() => import('../features/finances/pages/FinanceAccommodation'));
const FinanceEvents = lazyWithRetry(() => import('../features/finances/pages/FinanceEvents'));
const FinanceDailyOperations = lazyWithRetry(() => import('../features/finances/pages/FinanceDailyOperations'));
const ExpensesPage = lazyWithRetry(() => import('../features/finances/pages/ExpensesPage'));
const PaymentCallback = lazyWithRetry(() => import('../features/finances/pages/PaymentCallback'));
const PaymentRefunds = lazyWithRetry(() => import('../features/finances/pages/PaymentRefunds'));

// Shop Order Management
const ShopOrdersPage = lazyWithRetry(() => import('../features/services/pages/ShopOrdersPage'));

// Admin Members
const AdminMembersPage = lazyWithRetry(() => import('../features/members/pages/AdminMembersPage'));

import { hasPermission, ROLES } from '../shared/utils/roleUtils';
import { featureFlags } from '../shared/config/featureFlags';

// Helper component to redirect to current user's profile
const CurrentUserProfile = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  
  React.useEffect(() => {
    if (user?.id) {
      navigate(`/users/${user.id}/edit`, { replace: true });
    } else {
      navigate('/login', { replace: true });
    }
  }, [user, navigate]);
  
  return <div>Redirecting to profile...</div>;
};

// Helper component to handle dynamic parameter forwarding
const NavigateWithParams = ({ to }) => {
  const params = useParams();
  const navigate = useNavigate();
  
  React.useEffect(() => {
    const targetPath = Object.entries(params).reduce(
      (path, [key, value]) => path.replace(`:${key}`, value),
      to
    );
    navigate(targetPath, { replace: true });
  }, [navigate, params, to]);
  
  return null;
};

const AppRoutes = () => {
  const { isAuthenticated, loading, user } = useAuth();

  // Show loading indicator while checking authentication
  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
        <div style={{ width: 32, height: 32, border: '3px solid #1a1d2e', borderTopColor: '#3b82f6', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  const resolveLandingRoute = () => {
    const role = typeof user?.role === 'string' ? user.role.toLowerCase() : undefined;
    // Outsider users go to booking page to book their first lesson
    if (role === ROLES.OUTSIDER) return '/book';
    if (role === ROLES.STUDENT || role === ROLES.TRUSTED_CUSTOMER) {
      return featureFlags.studentPortal ? '/student/dashboard' : '/student';
    }
    if (role === ROLES.INSTRUCTOR) return '/instructor/dashboard';
    // Admin, manager, developer, and ALL custom roles go to admin dashboard
    // Standard staff roles and any custom role not matching outsider/student
    return '/dashboard';
  };

  const landingRoute = resolveLandingRoute();
  
  // Helper function to check if a role is a "staff" role (can access staff routes)
  // Custom roles are treated as staff unless they match outsider/student
  const isStaffRole = (role) => {
    if (!role) return false;
    const r = role.toLowerCase();
    // Exclude outsider, student, and trusted_customer roles - everything else is considered staff
    if (r === ROLES.OUTSIDER || r === ROLES.STUDENT || r === ROLES.TRUSTED_CUSTOMER) return false;
    return true;
  };
  
  // Define a ProtectedRoute component with role-based access
  const ProtectedRoute = ({ allowedRoles = [], staffOnly = false }) => {
    let canAccess = false;
    
    if (!isAuthenticated) {
      canAccess = false;
    } else if (allowedRoles.length === 0 && !staffOnly) {
      // No specific roles required, any authenticated user can access
      canAccess = true;
    } else if (staffOnly && user) {
      // Staff-only routes - allow standard staff roles and custom roles
      canAccess = isStaffRole(user.role);
    } else if (user && hasPermission(user.role, allowedRoles)) {
      // Specific roles required - check exact match
      canAccess = true;
    } else if (user && isStaffRole(user.role)) {
      // For custom staff roles, allow access to routes meant for manager/admin
      const staffRoles = [ROLES.INSTRUCTOR, ROLES.MANAGER, ROLES.ADMIN, ROLES.DEVELOPER];
      if (allowedRoles.some(r => staffRoles.includes(r))) {
        canAccess = true;
      }
    }

    return canAccess ? <Outlet /> : <Navigate to="/login" replace />;
  };

  return (
    <Suspense fallback={<LazyFallback />}>
    <Routes>
  <Route path="/login" element={!isAuthenticated ? <Login /> : <Navigate to={landingRoute} replace />} />
  <Route path="/reset-password" element={<ResetPassword />} />
  
  {/* Payment callback route - Iyzico ödeme sonrası yönlendirme */}
  <Route path="/payment/callback" element={<PaymentCallback />} />
  
  {/* Default route: guests see the UKC Landing Page */}
  <Route path="/" element={isAuthenticated ? <Navigate to={landingRoute} replace /> : <Navigate to="/guest" replace />} />

  {/* Guest Portal Main Page */}
  <Route path="/guest" element={<GuestLandingPage />} />
  
  {/* Public route for group booking invitations */}
  <Route path="/group-invitation/:token" element={<GroupInvitationPage />} />
  
  {/* Public route for quick link registration */}
  <Route path="/quick/:linkCode" element={<PublicQuickBooking />} />

  {/* Public route for custom forms (short URL: /f/CODE) */}
  <Route path="/f/success/:linkCode" element={<FormSuccessPage />} />
  <Route path="/f/:linkCode" element={<PublicFormPage />} />

  {/* Form preview - rendered outside layout but requires auth (handled in component) */}
  <Route path="/forms/preview/:id" element={<FormPreviewPage />} />
      
      {/* PUBLIC ROUTES - Accessible without authentication (Guest Mode) */}
      {/* These routes are browsable by guests but actions require sign-in */}
      
      {/* Shop - browse products, but cart/purchase requires auth */}
      <Route path="/shop" element={<ShopPage />} />
      
      {/* Academy lesson pages - browse and explore */}
      <Route path="/academy/kite-lessons" element={<KiteLessonsPublicPage />} />
      <Route path="/academy/foil-lessons" element={<FoilLessonsPage />} />
      <Route path="/academy/wing-lessons" element={<WingLessonsPage />} />
      <Route path="/academy/efoil-lessons" element={<EFoilLessonsPage />} />
      <Route path="/academy/premium-lessons" element={<PremiumLessonsPage />} />
      
      {/* Rental pages - browse equipment */}
      <Route path="/rental/standard" element={<RentalStandardShowcasePage />} />
      <Route path="/rental/sls" element={<RentalSlsShowcasePage />} />
      <Route path="/rental/dlab" element={<RentalDlabShowcasePage />} />
      <Route path="/rental/efoil" element={<RentalEFoilShowcasePage />} />
      <Route path="/rental/premium" element={<RentalPremiumShowcasePage />} />
      
      {/* .Care public page – submit & track repair requests without an account */}
      <Route path="/care" element={<CareLandingPage />} />

      <Route path="/stay" element={<StayLandingPage />} />
      {/* Stay pages - explore accommodation */}
      <Route path="/stay/book-accommodation" element={<StayBookingPage />} />
      <Route path="/stay/hotel" element={<StayHotelPage />} />
      <Route path="/stay/home" element={<StayHomePage />} />
      
      <Route path="/experience" element={<ExperienceLandingPage />} />
      {/* Experience pages - browse packages */}
      <Route path="/experience/book-package" element={<ExperienceBookPackagePage />} />
      <Route path="/experience/kite-packages" element={<ExperienceKitePackagesPage />} />
      <Route path="/experience/wing-packages" element={<ExperienceWingPackagesPage />} />
      <Route path="/experience/downwinders" element={<ExperienceDownwindersPage />} />
      <Route path="/experience/camps" element={<ExperienceCampsPage />} />
      
      {/* Member Offerings - browse VIP & Seasonal Packages */}
      <Route path="/members/offerings" element={<MemberOfferings />} />
      
      {/* Events - view upcoming events */}
      <Route path="/services/events" element={<EventsPage />} />
      
      {/* Guest landing page - welcome page for Duotone Pro Center */}
      <Route path="/academy" element={<AcademyLandingPage />} />
      <Route path="/rental" element={<RentalLandingPage />} />
      <Route path="/contact" element={<ContactPage />} />
      {/* Legacy booking page - keep for direct access if needed */}
      <Route path="/book" element={<OutsiderBookingPage />} />
      <Route path="/outsider/packages" element={<OutsiderPackagesPage />} />
      
      {/* Help/Support - public access */}
      <Route path="/help" element={<HelpSupport />} />
      
      {/* AUTHENTICATED-ONLY ROUTES */}
      {/* These routes require authentication and redirect to login */}
      <Route element={<ProtectedRoute allowedRoles={[]} />}>
        <Route path="/chat" element={<ChatPage />} />
        <Route path="/notifications" element={<NotificationCenter />} />
        <Route path="/accommodation" element={<AccommodationBookingPage />} />
        <Route path="/repairs" element={<RepairsPage />} />
      </Route>

      {/* Dashboard routes for staff */}
      <Route element={<ProtectedRoute allowedRoles={[ROLES.INSTRUCTOR, ROLES.MANAGER, ROLES.ADMIN, ROLES.DEVELOPER]} />}>
        <Route path="/dashboard" element={<DashboardRouter />} />
        <Route
          path="/instructor/dashboard"
          element={featureFlags.instructorDashboardRevamp ? <InstructorDashboard /> : <InstructorDashboardFallback />}
        />
      </Route>
      <Route element={<ProtectedRoute allowedRoles={[ROLES.MANAGER, ROLES.ADMIN, ROLES.DEVELOPER]} />}>
        <Route path="/admin/dashboard" element={<ExecutiveDashboard />} />
      </Route>

      {/* Student portal routes */}
      <Route element={<ProtectedRoute allowedRoles={[ROLES.STUDENT, ROLES.TRUSTED_CUSTOMER]} />}>
        {featureFlags.studentPortal ? (
          <Route path="/student" element={<StudentLayout />}>
            <Route index element={<Navigate to="/student/dashboard" replace />} />
            <Route path="dashboard" element={<StudentDashboard />} />
            <Route path="schedule" element={<StudentSchedule />} />
            <Route path="courses" element={<StudentCourses />} />
            <Route path="payments" element={<StudentPayments />} />
            <Route path="support" element={<StudentSupport />} />
            <Route path="profile" element={<StudentProfile />} />
            <Route path="family" element={<FamilyManagementPage />} />
            <Route path="friends" element={<StudentFriendsPage />} />
            <Route path="group-bookings" element={<StudentGroupBookingsPage />} />
            <Route path="group-bookings/:id" element={<GroupBookingDetailPage />} />
          </Route>
        ) : (
          <Route path="/student/*" element={<StudentPortalUnavailable />} />
        )}
        {/* Student booking service redirect - triggers booking wizard from dashboard */}
        <Route path="/academy/book-service" element={<StudentBookServicePage />} />
        {/* Student rental pages */}
        <Route path="/rental/book-equipment" element={<StudentBookEquipmentPage />} />
        <Route path="/rental/my-rentals" element={<StudentMyRentalsPage />} />
        {/* Student accommodation page */}
        <Route path="/stay/my-accommodation" element={<StudentMyAccommodationPage />} />
      </Route>
      {/* Customer management routes - instructors and above */}
      <Route element={<ProtectedRoute allowedRoles={[ROLES.INSTRUCTOR, ROLES.MANAGER, ROLES.ADMIN]} />}>
        <Route path="/customers" element={<Customers />} />
  <Route path="/instructor/students" element={<MyStudents />} />
  <Route path="/instructor/students/:id" element={<StudentDetail />} />
        <Route path="/customers/new" element={<UserFormPage />} />
        <Route path="/customers/edit/:id" element={<UserFormPage />} />
        <Route path="/customers/:id" element={<UserDetail />} />
        <Route path="/customers/:id/profile" element={<CustomerProfilePage />} />        {/* Legacy routes - using useParams internally */}
        <Route path="/students" element={<Navigate to="/customers" />} />
        <Route path="/students/new" element={<Navigate to="/customers/new" />} />
        <Route path="/students/edit/:id" element={
          <NavigateWithParams to="/customers/edit/:id" />
        } />
        <Route path="/students/:id" element={
          <NavigateWithParams to="/customers/:id" />
        } />
      </Route>
      
      {/* Routes accessible to managers and above */}
      <Route element={<ProtectedRoute allowedRoles={[ROLES.MANAGER, ROLES.ADMIN]} />}>
    <Route path="/instructors" element={<Instructors />} />
    <Route path="/instructors/new" element={<InstructorFormPage />} /> {/* Unified user form for new instructor */}
    <Route path="/instructors/edit/:id" element={<InstructorFormPage />} /> {/* Unified user form for editing instructor */}
  <Route path="/finance/settings" element={<FinanceSettingsPage />} />
        <Route path="/admin/settings" element={<Settings />} />
        <Route path="/admin/ratings-analytics" element={<InstructorRatingsAnalytics />} />
  <Route path="/admin/roles" element={<RolesAdmin />} />
  <Route path="/admin/waivers" element={<WaiverManagement />} />
  <Route path="/admin/legal-documents" element={<LegalDocumentsPage />} />
  <Route path="/admin/vouchers" element={<VoucherManagement />} />
  <Route path="/admin/support-tickets" element={<SupportTicketsPage />} />
        <Route path="/admin/manager-commissions" element={<ManagerCommissionSettings />} />
        <Route path="/manager/commissions" element={<ManagerDashboard />} />
        {/* Services - Package Management (managers and above only) */}
        <Route path="/services/packages" element={<PackageManagement />} />
        {/* Marketing - managers and above */}
        <Route path="/marketing" element={<MarketingPage />} />
        {/* Quick Links - managers and above */}
        <Route path="/quick-links" element={<QuickLinksPage />} />
        {/* Form Builder - managers and above */}
        <Route path="/forms" element={<FormsListPage />} />
        <Route path="/forms/builder/:id" element={<FormBuilderPage />} />
        <Route path="/forms/:id/analytics" element={<FormAnalyticsPage />} />
        <Route path="/forms/:id/responses" element={<FormResponsesPage />} />
      </Route>
      {/* Admin-only routes */}
      <Route element={<ProtectedRoute allowedRoles={[ROLES.ADMIN]} />}>
        <Route path="/admin/deleted-bookings" element={<DeletedBookingsPage />} />
  <Route path="/admin/spare-parts" element={<SparePartsOrders />} />
      </Route>
        {/* Routes for operations staff (instructors and above) */}
      <Route element={<ProtectedRoute allowedRoles={[ROLES.INSTRUCTOR, ROLES.MANAGER, ROLES.ADMIN]} />}>
        <Route path="/equipment" element={<Equipment />} />
        <Route path="/inventory" element={<InventoryPage />} />
        <Route path="/bookings" element={<BookingsPage />} />
        <Route path="/bookings/edit/:id" element={<BookingEditPage />} />
        <Route path="/bookings/calendar" element={<BookingCalendarPage />} />
        <Route path="/rentals" element={<Rentals />} />
        {/* Calendar routes */}
        <Route path="/calendars" element={<Navigate to="/calendars/lessons" replace />} />
        <Route path="/calendars/lessons" element={<LessonsCalendar />} />
        <Route path="/calendars/rentals" element={<RentalsCalendar />} />
        <Route path="/calendars/members" element={<AdminMembersPage />} />
        <Route path="/calendars/stay" element={<AccommodationAdminPage />} />
        <Route path="/calendars/shop-orders" element={<ShopOrdersPage />} />
        <Route path="/calendars/events" element={<EventsCalendar />} />
        {/* Rentals calendar view */}
        <Route path="/rentals/calendar" element={<RentalsCalendarView />} />
        {/* Services routes */}
        <Route path="/services" element={<Navigate to="/services/accommodation" replace />} />
        <Route path="/services/accommodation" element={<AccommodationUnitsManager />} />
        <Route path="/services/lessons" element={<LessonServices />} />
        <Route path="/services/rentals" element={<RentalServices />} />
        <Route path="/services/shop" element={<ShopManagement />} />
        <Route path="/services/sales" element={<Navigate to="/services/shop" replace />} />
        <Route path="/services/orders" element={<Navigate to="/services/shop" replace />} />
        <Route path="/services/memberships" element={<MembershipSettings />} />
        <Route path="/services/categories" element={<Categories />} />
        {/* Finance routes */}
        <Route path="/finance" element={<Finance />} />
        <Route path="/finance/lessons" element={<FinanceLessons />} />
        <Route path="/finance/rentals" element={<FinanceRentals />} />
        <Route path="/finance/membership" element={<FinanceMembership />} />
        <Route path="/finance/shop" element={<FinanceShop />} />
        <Route path="/finance/accommodation" element={<FinanceAccommodation />} />
        <Route path="/finance/events" element={<FinanceEvents />} />
        <Route path="/finance/daily-operations" element={<FinanceDailyOperations />} />
        <Route path="/finance/payment-history" element={<FinanceDailyOperations />} />
        <Route path="/finance/expenses" element={<ExpensesPage />} />
      </Route>
      {/* Admin-only finance routes (refunds) */}
      <Route element={<ProtectedRoute allowedRoles={[ROLES.ADMIN, ROLES.MANAGER]} />}>
        <Route path="/finance/refunds" element={<PaymentRefunds />} />
      </Route>
        {/* User profile and settings routes - all authenticated users can access */}
      <Route element={<ProtectedRoute allowedRoles={[]} />}>
        <Route path="/users/:id/edit" element={<UserProfilePage />} />
        {/* Redirect /profile to current user's profile */}
        <Route path="/profile" element={<CurrentUserProfile />} />
        {/* GDPR Privacy Rights - admins see Legal Documents, users see GDPR manager */}
        <Route path="/privacy/gdpr" element={<PrivacyGdprPage />} />
        {/* User settings - accessible to all authenticated users */}
        <Route path="/settings" element={<UserSettings />} />
      </Route>
        {/* Redirect root to login or dashboard */}
  {/* Root redirects to /guest for unauthenticated users */}
      
      {/* Catch all for non-existing routes */}
      <Route path="*" element={<Navigate to={isAuthenticated ? landingRoute : "/guest"} replace />} />
    </Routes>
    </Suspense>
  );
};

export default AppRoutes;
