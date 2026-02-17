import React from 'react';
import { Routes, Route, Navigate, Outlet, useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../shared/hooks/useAuth';

// Normal imports (temporarily revert lazy loading to fix the hanging issue)
import Login from '../features/authentication/pages/Login';
import ResetPassword from '../features/authentication/pages/ResetPassword';
import PublicHome from '../features/public/PublicHome';
import ExecutiveDashboard from '../features/dashboard/pages/ExecutiveDashboard';
import DashboardRouter from '../features/dashboard/pages/DashboardRouter';
import InstructorDashboard from '../features/instructor/pages/InstructorDashboard';
import InstructorDashboardFallback from '../features/instructor/pages/InstructorDashboardFallback';
import MyStudents from '../features/instructor/pages/MyStudents';
import StudentDetail from '../features/instructor/pages/StudentDetail';
import Customers from '../features/customers/pages/Customers';
import UserDetail from '../features/customers/pages/UserDetail';
import UserFormPage from '../features/customers/pages/UserFormPage';
import Instructors from '../features/instructors/pages/Instructors';
import Equipment from '../features/equipment/pages/Equipment';
import InventoryPage from '../features/inventory/pages/InventoryPage';
import BookingsPage from '../features/bookings/pages/BookingsPage';
import BookingEditPage from '../features/bookings/pages/BookingEditPage';
import BookingCalendarPage from '../features/bookings/pages/BookingCalendarPage';
import Settings from '../features/dashboard/pages/Settings';
import Finance from '../features/finances/pages/Finance';
import FinanceSettingsPage from '../features/finances/pages/FinanceSettingsPage';
import Rentals from '../features/rentals/pages/Rentals';
import AccommodationServices from '../features/services/pages/AccommodationServices';
import AccommodationUnitsManager from '../features/services/pages/AccommodationUnitsManager';
import AccommodationBookingPage from '../features/accommodation/pages/AccommodationBookingPage';
import AccommodationAdminPage from '../features/accommodation/pages/AccommodationAdminPage';
import LessonServices from '../features/services/pages/LessonServices';
import RentalServices from '../features/services/pages/RentalServices';
import SalesServices from '../features/services/pages/SalesServices';
import ShopManagement from '../features/services/pages/ShopManagement';
import PackageManagement from '../features/services/pages/PackageManagement';
import ShopPage from '../features/dashboard/pages/Shop';
import UserProfilePage from '../features/authentication/pages/UserProfilePage';
import CustomerProfilePage from '../features/customers/pages/CustomerProfilePage';
import InstructorFormPage from '../features/instructors/pages/InstructorFormPage';
import Categories from '../features/services/pages/Categories';
import MembershipSettings from '../features/services/pages/MembershipSettings';
import RolesAdmin from '../features/admin/pages/RolesAdmin';
import SparePartsOrders from '../features/admin/pages/SparePartsOrders';
import InstructorRatingsAnalytics from '../features/admin/pages/InstructorRatingsAnalytics';
import MemberOfferings from '../features/members/pages/MemberOfferings';
import WaiverManagement from '../features/admin/pages/WaiverManagement';
import VoucherManagement from '../features/admin/pages/VoucherManagement';
import SupportTicketsPage from '../features/admin/pages/SupportTicketsPage';
import LegalDocumentsPage from '../features/settings/pages/LegalDocumentsPage';
import HelpSupport from '../features/help/pages/HelpSupport';
import DeletedBookingsPage from '../components/admin/DeletedBookingsPage';
import StudentLayout from '../features/students/components/StudentLayout';
import StudentDashboard from '../features/students/pages/StudentDashboard';
import StudentSchedule from '../features/students/pages/StudentSchedule';
import StudentCourses from '../features/students/pages/StudentCourses';
import StudentPayments from '../features/students/pages/StudentPayments';
import StudentSupport from '../features/students/pages/StudentSupport';
import StudentProfile from '../features/students/pages/StudentProfile';
import FamilyManagementPage from '../features/students/pages/FamilyManagementPage';
import StudentFriendsPage from '../features/students/pages/StudentFriendsPage';
import StudentPortalUnavailable from '../features/students/pages/StudentPortalUnavailable';
import StudentBookServicePage from '../features/students/pages/StudentBookServicePage';
import StudentBookEquipmentPage from '../features/students/pages/StudentBookEquipmentPage';
import StudentMyRentalsPage from '../features/students/pages/StudentMyRentalsPage';
import StudentMyAccommodationPage from '../features/students/pages/StudentMyAccommodationPage';
import NotificationCenter from '../features/notifications/pages/NotificationCenter';
import GdprDataManager from '../features/compliance/components/GdprDataManager';
import PrivacyGdprPage from '../features/compliance/components/PrivacyGdprPage';
import OutsiderBookingPage from '../features/outsider/pages/OutsiderBookingPage';
import GuestLandingPage from '../features/outsider/pages/GuestLandingPage';
import OutsiderPackagesPage from '../features/outsider/pages/OutsiderPackagesPage';
import KiteLessonsPublicPage from '../features/outsider/pages/KiteLessonsPublicPage';
import AcademyLandingPage from '../features/outsider/pages/AcademyLandingPage';
import FoilLessonsPage from '../features/outsider/pages/FoilLessonsPage';
import WingLessonsPage from '../features/outsider/pages/WingLessonsPage';
import EFoilLessonsPage from '../features/outsider/pages/EFoilLessonsPage';
import PremiumLessonsPage from '../features/outsider/pages/PremiumLessonsPage';
import RentalStandardShowcasePage from '../features/outsider/pages/RentalStandardShowcasePage';
import RentalPremiumShowcasePage from '../features/outsider/pages/RentalPremiumShowcasePage';
import RentalSlsShowcasePage from '../features/outsider/pages/RentalSlsShowcasePage';
import RentalDlabShowcasePage from '../features/outsider/pages/RentalDlabShowcasePage';
import RentalLandingPage from '../features/outsider/pages/RentalLandingPage';
import StayLandingPage from '../features/outsider/pages/StayLandingPage';
import ExperienceLandingPage from '../features/outsider/pages/ExperienceLandingPage';
// Stay pages
import StayBookingPage from '../features/outsider/pages/StayBookingPage';
import StayHotelPage from '../features/outsider/pages/StayHotelPage';
import StayHomePage from '../features/outsider/pages/StayHomePage';
// Experience pages
import ExperienceBookPackagePage from '../features/outsider/pages/ExperienceBookPackagePage';
import ExperienceKitePackagesPage from '../features/outsider/pages/ExperienceKitePackagesPage';
import ExperienceWingPackagesPage from '../features/outsider/pages/ExperienceWingPackagesPage';
import ExperienceDownwindersPage from '../features/outsider/pages/ExperienceDownwindersPage';
import ExperienceCampsPage from '../features/outsider/pages/ExperienceCampsPage';
import GroupInvitationPage from '../features/bookings/pages/GroupInvitationPage';
import StudentGroupBookingsPage from '../features/bookings/pages/StudentGroupBookingsPage';
import GroupBookingDetailPage from '../features/bookings/pages/GroupBookingDetailPage';
import UserSettings from '../features/settings/pages/UserSettings';
import ManagerDashboard from '../features/manager/pages/ManagerDashboard';
import ManagerCommissionSettings from '../features/manager/pages/ManagerCommissionSettings';
import ChatPage from '../features/chat/pages/ChatPage';

// Calendar views
import LessonsCalendar from '../features/calendars/pages/LessonsCalendar';
import RentalsCalendar from '../features/calendars/pages/RentalsCalendar';
import RentalsCalendarView from '../features/rentals/pages/RentalsCalendarView';
import EventsCalendar from '../features/calendars/pages/EventsCalendar';
import EventsPage from '../features/events/pages/EventsPage';

// Repairs
import RepairsPage from '../features/repairs/pages/RepairsPage';

// Marketing
import MarketingPage from '../features/marketing/pages/MarketingPage';

// Quick Links
import QuickLinksPage from '../features/quicklinks/pages/QuickLinksPage';
import PublicQuickBooking from '../features/quicklinks/pages/PublicQuickBooking';

// Form Builder
import FormsListPage from '../features/forms/pages/FormsListPage';
import FormBuilderPage from '../features/forms/pages/FormBuilderPage';
import FormPreviewPage from '../features/forms/pages/FormPreviewPage';
import PublicFormPage from '../features/forms/pages/PublicFormPage';
import FormSuccessPage from '../features/forms/pages/FormSuccessPage';
import FormAnalyticsPage from '../features/forms/pages/FormAnalyticsPage';
import FormResponsesPage from '../features/forms/pages/FormResponsesPage';

// Finance sub-pages
import FinanceLessons from '../features/finances/pages/FinanceLessons';
import FinanceRentals from '../features/finances/pages/FinanceRentals';
import FinanceMembership from '../features/finances/pages/FinanceMembership';
import FinanceShop from '../features/finances/pages/FinanceShop';
import FinanceAccommodation from '../features/finances/pages/FinanceAccommodation';
import FinanceEvents from '../features/finances/pages/FinanceEvents';
import FinanceDailyOperations from '../features/finances/pages/FinanceDailyOperations';
import ExpensesPage from '../features/finances/pages/ExpensesPage';
import PaymentCallback from '../features/finances/pages/PaymentCallback';
import PaymentRefunds from '../features/finances/pages/PaymentRefunds';

// Shop Order Management
import OrderManagement from '../features/dashboard/pages/OrderManagement';
import ShopOrdersPage from '../features/services/pages/ShopOrdersPage';

// Admin Members
import AdminMembersPage from '../features/members/pages/AdminMembersPage';

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
    return <div>Loading...</div>;
  }

  const resolveLandingRoute = () => {
    const role = typeof user?.role === 'string' ? user.role.toLowerCase() : undefined;
    // Outsider users go to booking page to book their first lesson
    if (role === ROLES.OUTSIDER) return '/book';
    if (role === ROLES.STUDENT) {
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
    // Exclude outsider and student roles - everything else is considered staff
    if (r === ROLES.OUTSIDER || r === ROLES.STUDENT) return false;
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
    <Routes>
  <Route path="/login" element={!isAuthenticated ? <Login /> : <Navigate to={landingRoute} replace />} />
  <Route path="/reset-password" element={<ResetPassword />} />
  
  {/* Payment callback route - Iyzico ödeme sonrası yönlendirme */}
  <Route path="/payment/callback" element={<PaymentCallback />} />
  
  {/* Default route: guests see the UKC Landing Page */}
  <Route path="/" element={isAuthenticated ? <Navigate to={landingRoute} replace /> : <PublicHome />} />

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
      <Route path="/rental/premium" element={<RentalPremiumShowcasePage />} />
      
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
      <Route element={<ProtectedRoute allowedRoles={[ROLES.STUDENT]} />}>
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
  {/* Root handled above to show PublicHome when not authenticated */}
      
      {/* Catch all for non-existing routes */}
      <Route path="*" element={<Navigate to={isAuthenticated ? landingRoute : "/login"} replace />} />
    </Routes>
  );
};

export default AppRoutes;