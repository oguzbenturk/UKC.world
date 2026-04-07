import { useState, useEffect, useCallback, useRef } from 'react';
import { BrowserRouter as Router, useLocation } from 'react-router-dom';
import { App as AntdApp } from 'antd';
import { AuthProvider } from './shared/contexts/AuthContext';
import { AuthModalProvider } from './shared/contexts/AuthModalContext';
import { DataProvider } from './shared/contexts/DataContext';
import { ToastProvider } from './shared/contexts/ToastContext';
import { CurrencyProvider } from './shared/contexts/CurrencyContext';
import { CartProvider } from './shared/contexts/CartContext';
import { ShopFiltersProvider } from './shared/contexts/ShopFiltersContext';
import { ForecastProvider } from './features/forecast/contexts/ForecastContext';
import AppRoutes from './routes/AppRoutes';
import { Navbar } from './shared/components/layout/Navbar';
import Sidebar from './shared/components/layout/Sidebar';
import PopupManager from './features/popups/components/PopupManager';
import AuthModal from './shared/components/ui/AuthModal';
import { useAuth } from './shared/hooks/useAuth';
import { realTimeService } from './shared/services/realTimeService';
import ErrorBoundary from './shared/components/error/ErrorBoundary';
import AppErrorFallback from './shared/components/error/AppErrorFallback';
import AntdStaticHolder from './shared/components/system/AntdStaticHolder';
// import { logger } from './shared/utils/logger';
import { collectWebVitals } from './shared/utils/performance';
import './styles/sidebar.css';
import NotificationRealtimeBridge from './features/notifications/components/NotificationRealtimeBridge';
import UserConsentModal from './features/compliance/components/UserConsentModal.jsx';
import NetworkStatusBanner from './shared/components/system/NetworkStatusBanner.jsx';
import CookieConsentBanner from './shared/components/CookieConsentBanner';
import WalletModalManager from './shared/components/wallet/WalletModalManager';
import InstructorMyProfileDrawer from './features/instructor/components/InstructorMyProfileDrawer';
import RescheduleConfirmationModal from './features/notifications/components/RescheduleConfirmationModal';
import PartnerInviteModal from './features/notifications/components/PartnerInviteModal';
import GlobalFAB from './shared/components/ui/GlobalFAB';
import { UkcBrandDot } from './shared/components/ui/UkcBrandDot';
import GlobalPackageDetailsModal from '@/features/outsider/components/GlobalPackageDetailsModal';

// Wrapper component to provide location to PopupManager
const PopupManagerWrapper = ({ user }) => {
  const location = useLocation();
  return <PopupManager user={user} currentPath={location.pathname} />;
};

// Main App component wraps everything with providers
function App() {  
  // Removed performance monitoring and logging to eliminate console noise
  useEffect(() => {
    // Silent Web Vitals collection - no console output
  collectWebVitals((_metric) => {
      // Metric collected silently for internal use only
    });
  }, []);
  
  return (
    <ErrorBoundary fallback={AppErrorFallback}>
      <AntdApp>
        <AntdStaticHolder />
        <NetworkStatusBanner />
        <CookieConsentBanner />
        <Router>
          <AuthProvider>
            <AuthModalProvider>
              <CurrencyProvider>
                <CartProvider>
                  <ShopFiltersProvider>
                  <DataProvider>
                    <ToastProvider>
                      <ForecastProvider>
                        <AppLayoutWithAuth />
                        <AuthModal />
                      </ForecastProvider>
                    </ToastProvider>
                  </DataProvider>
                  </ShopFiltersProvider>
                </CartProvider>
              </CurrencyProvider>
            </AuthModalProvider>
          </AuthProvider>
        </Router>
      </AntdApp>
    </ErrorBoundary>
  );
}

// Create a layout component that renders navigation only when authenticated
// This component is separated from App so it can use the useAuth hook
const AppLayoutWithAuth = () => {
  const location = useLocation();
  
  // Check if current route is a public form route (no sidebar/navbar needed)
  const isPublicFormRoute = location.pathname.startsWith('/f/') || 
                            location.pathname.startsWith('/quick/') ||
                            location.pathname.startsWith('/group-invitation/') ||
                            location.pathname === '/'; // Add root path to public form routes for layout

  // Initialize sidebar state based on screen size (start closed everywhere)
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [forceShowApp, setForceShowApp] = useState(false);
  const { isAuthenticated, loading, user, error, consent, requiresConsent, updateConsent, consentLoading } = useAuth();
  const { message: messageApi } = AntdApp.useApp();

  const consentSnapshot = consent || {
    latestTermsVersion: 'current',
    requiresTermsAcceptance: true,
    communicationPreferences: {
      email: false,
      sms: false,
      whatsapp: false
    }
  };

  // Note: body overflow locking is handled by the UserConsentModal component itself
  // (its fixed inset-0 overlay prevents interaction). No need to manipulate
  // document.body.style — that conflicts with Ant Design's own scroll management.

  const handleConsentSubmit = async (payload) => {
    try {
      await updateConsent(payload);
      messageApi.success('Consent saved');
    } catch (err) {
      const errorMessage = err?.response?.data?.error || err?.message || 'Failed to save consent';
      messageApi.error(errorMessage);
    }
  };

  const consentModal = (
    <UserConsentModal
      open={requiresConsent}
      loading={consentLoading}
      consent={consentSnapshot}
      onSubmit={handleConsentSubmit}
    />
  );
  
  // Emergency timeout to prevent infinite loading
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (loading && !isAuthenticated) {
        setForceShowApp(true);
      }
    }, 15000); // 15 second timeout

    return () => clearTimeout(timeoutId);
  }, [loading, isAuthenticated]);

  // Initialize real-time service when user is authenticated
  useEffect(() => {
    if (isAuthenticated && user) {
      realTimeService.connect();
      // Re-authenticate with real-time service when user changes
      setTimeout(() => {
        realTimeService.authenticate(user);
      }, 1000);
    } else {
      realTimeService.disconnect();
    }

    return () => {
      realTimeService.disconnect();
    };
  }, [isAuthenticated, user]);

  const toggleSidebar = useCallback(() => {
    setIsSidebarOpen((prev) => !prev);
  }, []);

  const isSidebarOpenRef = useRef(isSidebarOpen);
  isSidebarOpenRef.current = isSidebarOpen;

  // Auto-close sidebar on viewport resize (stable listener — avoids churn from sidebar state toggles)
  useEffect(() => {
    const handleResize = () => {
      if (isSidebarOpenRef.current) {
        setIsSidebarOpen(false);
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  // Show a simple loading screen while checking authentication
  if (loading && !forceShowApp) {
    return (
      <div className="flex items-center justify-center h-screen bg-slate-100">
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-sky-600 mx-auto" />
          <p className="mt-4 text-slate-600">Loading...</p>
          {error && (
            <div className="mt-4 p-3 bg-red-100 border border-red-300 rounded-md">
              <p className="text-red-800 text-sm">{error}</p>
              <button 
                onClick={() => setForceShowApp(true)}
                className="mt-2 px-3 py-1 bg-red-600 text-white rounded text-xs hover:bg-red-700"
              >
                Continue Anyway
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Show consent modal ONLY for authenticated users who need to consent
  if (isAuthenticated && requiresConsent) {
    return (
      <div className="min-h-screen">
        {consentModal}
      </div>
    );
  }

  // Define which roles can see the navigation components
  // Standard roles + any custom role (custom roles are valid if they have permission)
  const standardRoles = ['admin', 'manager', 'instructor', 'student', 'outsider', 'developer', 'trusted_customer'];
  const userRole = user?.role?.toLowerCase?.() || '';
  
  // Guests (not authenticated) CAN access navigation
  // Authenticated users without valid role CANNOT access navigation
  const canAccessNavigation = !isAuthenticated || (user && (
    standardRoles.includes(userRole) || 
    // Allow any other role (custom roles) to access navigation
    (userRole && userRole.length > 0)
  ));

  // If authenticated but not authorized to see navigation, show a limited view
  if (!canAccessNavigation) {
    return (
      <main className="min-h-dvh h-dvh overflow-y-auto safe-pb">
        {consentModal}
        <div className="bg-slate-800 shadow-lg sticky top-0 z-50 p-4 flex justify-between items-center">
          <span className="flex items-baseline tracking-wide text-xl">
            <span className="font-bold text-white">UKC</span>
            <UkcBrandDot className="mx-0.5" style={{ top: '0.15em' }} />
            <span className="font-medium text-slate-300 text-sm">World</span>
          </span>
          <button 
            onClick={() => {
              localStorage.removeItem('token');
              localStorage.removeItem('user');
              window.location.href = '/login';
            }}
            className="text-slate-300 hover:text-white text-sm"
          >
            Logout
          </button>
        </div>
        <div className="p-4 md:p-6">
          <AppRoutes />
          <GlobalPackageDetailsModal />
        </div>
      </main>
    );
  }

  // For public form routes, render without sidebar/navbar
  if (isPublicFormRoute) {
    return (
      <main className="min-h-dvh h-dvh overflow-y-auto">
        <AppRoutes />
        <GlobalPackageDetailsModal />
      </main>
    );
  }

  return (
    <div className="flex flex-col h-dvh">
      {consentModal}
  <Navbar toggleSidebar={toggleSidebar} />
  <NotificationRealtimeBridge />
  <WalletModalManager />
  <InstructorMyProfileDrawer />
  <RescheduleConfirmationModal />
  <PartnerInviteModal />
      <div className="flex flex-1 min-h-0 overflow-hidden">
        <Sidebar 
          isOpen={isSidebarOpen} 
          toggleSidebar={toggleSidebar} 
        />        
        <main className="content-container flex-1 safe-pb">
          <AppRoutes />
          <GlobalPackageDetailsModal />
        </main>
      </div>
      
      {/* Popup Manager - shows popups based on conditions */}
      <PopupManagerWrapper user={user} />
      <GlobalFAB />
    </div>
  );
};

export default App;