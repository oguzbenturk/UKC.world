import { useState, useEffect } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { Bars3Icon, UserCircleIcon, MoonIcon, SunIcon } from '@heroicons/react/24/outline';
import { Avatar, Modal } from 'antd';
import { message } from '@/shared/utils/antdStatic';
import { useAuth } from '../../hooks/useAuth';
import RealTimeStatusIndicator from '../realtime/RealTimeStatusIndicator';
import NotificationBell from '@/features/notifications/components/NotificationBell';
import StudentWalletTriggerButton from '@/features/students/components/StudentWalletTriggerButton';
import { getWalletBalance } from '@/features/students/utils/getWalletBalance';
import { useCurrency } from '@/shared/contexts/CurrencyContext';
import { useWalletSummary } from '@/shared/hooks/useWalletSummary';

const profileImageCandidateKeys = [
  'profile_image_url',
  'profileImageUrl',
  'avatar_url',
  'avatarUrl',
  'avatar',
  'photoUrl',
  'photo_url',
  'imageUrl',
  'image_url'
];

const getUserProfileImage = (currentUser) => {
  if (!currentUser) {
    return null;
  }

  for (const key of profileImageCandidateKeys) {
    const candidate = currentUser?.[key];
    if (typeof candidate === 'string' && candidate.trim().length > 0) {
      return candidate;
    }
  }

  return null;
};

const getUserDisplayName = (currentUser) => {
  if (!currentUser) {
    return 'Profile';
  }

  const preferredKeys = ['full_name', 'name', 'displayName'];
  for (const key of preferredKeys) {
    const value = currentUser?.[key];
    if (typeof value === 'string' && value.trim().length > 0) {
      return value;
    }
  }

  const composed = [currentUser?.first_name, currentUser?.last_name].filter(Boolean).join(' ');
  if (composed) {
    return composed;
  }

  if (typeof currentUser?.email === 'string') {
    return currentUser.email.split('@')[0];
  }

  return 'Profile';
};

const resolveWalletBalance = (summary, user) => {
  const extracted = getWalletBalance(summary, user);
  return typeof extracted === 'number' && Number.isFinite(extracted) ? extracted : undefined;
};

export const Navbar = ({ toggleSidebar, theme, onToggleTheme }) => { 
  // Mobile NavLinks menu is no longer used (only sidebar toggle remains)
  // const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isProfileDropdownOpen, setIsProfileDropdownOpen] = useState(false);
  const [isLogoutModalVisible, setIsLogoutModalVisible] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const { logout, user, isAuthenticated } = useAuth();
  const { userCurrency, getCurrencySymbol, convertCurrency, businessCurrency } = useCurrency();
  
  // Storage currency is always EUR (base currency)
  const storageCurrency = businessCurrency || 'EUR';
  // Query wallet in storage currency (EUR)
  const { data: walletSummary } = useWalletSummary({ enabled: isAuthenticated, currency: storageCurrency });
  const navigate = useNavigate();
  const isDark = theme === 'dark';
  
  // Get raw balance in storage currency (EUR)
  const rawWalletBalance = isAuthenticated ? resolveWalletBalance(walletSummary, user) : undefined;
  
  // Determine display currency: user's preferred currency, NOT wallet's storage currency
  // Priority: user.preferred_currency > userCurrency (from context) > storageCurrency
  const displayCurrency = (() => {
    // First check user's preferred_currency from user object
    if (user?.preferred_currency) {
      return user.preferred_currency;
    }
    // Then check userCurrency from CurrencyContext (already resolved)
    if (userCurrency) {
      return userCurrency;
    }
    // Default to storage currency
    return storageCurrency;
  })();
  
  // For wallet display, we need the symbol
  const preferredCurrency = displayCurrency 
    ? { code: displayCurrency, symbol: getCurrencySymbol(displayCurrency) }
    : undefined;
  
  // Convert balance from EUR to user's display currency
  const walletBalance = (() => {
    if (!isAuthenticated || rawWalletBalance === undefined || rawWalletBalance === null) {
      return undefined;
    }
    // Convert from storage currency (EUR) to display currency
    if (convertCurrency && displayCurrency !== storageCurrency) {
      return convertCurrency(rawWalletBalance, storageCurrency, displayCurrency);
    }
    return rawWalletBalance;
  })();

  const profileImage = getUserProfileImage(user);
  const displayName = getUserDisplayName(user);

  const handleWalletClick = () => {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('wallet:open'));
      window.dispatchEvent(new CustomEvent('studentWallet:open'));
    }
  };

  const handleToggleTheme = () => {
    if (typeof onToggleTheme === 'function') {
      onToggleTheme();
    }
  };

  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined;
    }

    const handleScroll = () => {
      setIsScrolled(window.scrollY > 8);
    };

    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      window.removeEventListener('scroll', handleScroll);
    };
  }, []);

  // const toggleMobileMenu = () => {
  //   setIsMobileMenuOpen(!isMobileMenuOpen);
  // };

  const toggleProfileDropdown = () => { // Function to toggle profile dropdown
    setIsProfileDropdownOpen(!isProfileDropdownOpen);
  };
  // Add a function to close the dropdown when clicking outside (optional but good UX)
  useEffect(() => {
    const handleClickOutside = (event) => {
      // Only close if clicking outside the dropdown container
      // Use 'click' instead of 'mousedown' to allow NavLink clicks to complete
      if (isProfileDropdownOpen && !event.target.closest('.profile-dropdown-container')) {
        setIsProfileDropdownOpen(false);
      }
    };
    // Use 'click' event instead of 'mousedown' to prevent interfering with NavLink navigation
    document.addEventListener('click', handleClickOutside);
    return () => {
      document.removeEventListener('click', handleClickOutside);
    };
  }, [isProfileDropdownOpen]);

  const showLogoutConfirmation = () => {
    setIsProfileDropdownOpen(false);
    setIsLogoutModalVisible(true);
  };

  const handleLogoutConfirm = async () => {
    try {
      await logout();
      setIsLogoutModalVisible(false);
      navigate('/login');
    } catch {
      message.error('Logout failed');
    }
  };

  const handleLogoutCancel = () => {
    setIsLogoutModalVisible(false);
  };

  return (
    <div className={isDark ? 'dark' : ''}>
      <nav
        className={`sticky top-0 z-50 border-b border-slate-200/80 dark:border-slate-700/40 shadow-xl transition-colors duration-200 ${
          isScrolled
            ? 'bg-white/85 backdrop-blur-md supports-[backdrop-filter]:bg-white/70 dark:bg-gradient-to-r dark:from-slate-900/90 dark:to-slate-800/85'
            : 'bg-white dark:bg-gradient-to-r dark:from-slate-900 dark:to-slate-800'
        }`}
      >
          <div className="max-w-full mx-auto px-4 sm:px-6 lg:px-8"> {/* Changed to max-w-full for wider layout */}
            <div className="flex items-center justify-between h-16">
              <div className="flex items-center">
                {/* Mobile/Tablet Menu Toggle - visible only on screens smaller than 1200px */}
                  <button 
                  onClick={toggleSidebar}
                  className="mr-2 p-2 rounded-md text-slate-600 hover:text-slate-900 hover:bg-slate-200/70 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-sky-500 xl:hidden transition-colors duration-150 ease-in-out dark:text-slate-300 dark:hover:text-white dark:hover:bg-slate-700/50"
                  aria-expanded={false}
                  aria-label="Open sidebar"
                  data-sidebar-toggle="true"
                >
                  <span className="sr-only">Open sidebar</span>
                  <Bars3Icon className="block h-6 w-6" aria-hidden="true" />
                </button>

                {/* Back/Forward icons moved to Sidebar header per request */}
              
                {/* Logo - now always on the left */}
                <div>
                  <NavLink 
                    to="/" 
                    className="flex items-center px-3 py-1 rounded-md text-slate-800 hover:text-sky-600 hover:bg-slate-200/70 transition-colors duration-150 ease-in-out dark:text-white dark:hover:text-sky-300 dark:hover:bg-slate-700/50"
                  >
                    <span className="font-semibold text-xl tracking-tight">Plannivo</span>
                  </NavLink>
                </div>
              </div>

              {/* Right-side icons */}
              <div className="flex flex-wrap items-center gap-2 sm:gap-3 justify-end">
                {/* Subtle Plannivo link */}
                <a 
                  href="http://plannivo.com" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="hidden lg:block text-xs text-slate-500 hover:text-slate-700 transition-colors duration-150 dark:text-slate-400 dark:hover:text-slate-300"
                  title="Visit Plannivo.com"
                >
                  Plannivo Product
                </a>
              
                {/* Real-time Status Indicator */}
                <NotificationBell />
                {isAuthenticated && (
                  <StudentWalletTriggerButton
                    onClick={handleWalletClick}
                    variant="navbar"
                    currency={preferredCurrency}
                    balance={walletBalance}
                    className="!px-2.5 !py-1.5 sm:!px-4 sm:!py-2"
                  />
                )}
                <div className="hidden md:flex">
                  <RealTimeStatusIndicator />
                </div>
              
                {/* Profile Dropdown Container */}
                <div className="relative profile-dropdown-container z-50">
                  <button 
                    onClick={toggleProfileDropdown}
                    className="relative inline-flex h-10 w-10 items-center justify-center rounded-full text-slate-600 hover:text-slate-900 hover:bg-slate-200/70 transition-colors duration-150 ease-in-out focus:outline-none focus:ring-2 focus:ring-sky-500 dark:text-slate-300 dark:hover:text-sky-300 dark:hover:bg-slate-700/50"
                    aria-expanded={isProfileDropdownOpen}
                    aria-haspopup="true"
                    type="button"
                    aria-label={`Open profile menu for ${displayName}`}
                  >
                    <Avatar
                      size={32}
                      shape="circle"
                      src={profileImage || undefined}
                      alt={`${displayName} avatar`}
                      icon={!profileImage ? <UserCircleIcon className="h-5 w-5 text-slate-500 dark:text-slate-200" /> : undefined}
                      className="border border-slate-200 bg-slate-100 text-slate-600 shadow-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                    />
                  </button>
                  {isProfileDropdownOpen && (
                    <div 
                      className="origin-top-right absolute right-0 mt-2 w-48 rounded-lg shadow-xl py-1 bg-white border border-slate-200 focus:outline-none z-[60] dark:bg-slate-800 dark:border-slate-700/40"
                      role="menu" 
                      aria-orientation="vertical"
                      aria-labelledby="user-menu-button"
                      style={{ zIndex: 9999 }}
                    >
                      <button
                        type="button"
                        onClick={handleToggleTheme}
                        className="flex w-full items-center justify-between px-4 py-2 text-sm text-slate-700 hover:bg-slate-100/80 hover:text-sky-600 transition-colors duration-150 ease-in-out dark:text-slate-300 dark:hover:bg-slate-700/50 dark:hover:text-sky-300"
                        role="menuitem"
                        aria-pressed={isDark}
                      >
                        <span>{`Switch to ${isDark ? 'Light' : 'Dark'} mode`}</span>
                        {isDark ? (
                          <SunIcon className="h-4 w-4" aria-hidden />
                        ) : (
                          <MoonIcon className="h-4 w-4" aria-hidden />
                        )}
                      </button>
                      <hr className="my-1 border-slate-200 dark:border-slate-700" />
                      <NavLink
                        to="/profile"
                        className="block px-4 py-2 text-sm text-slate-700 hover:bg-slate-100/80 hover:text-sky-600 transition-colors duration-150 ease-in-out dark:text-slate-300 dark:hover:bg-slate-700/50 dark:hover:text-sky-300"
                        role="menuitem"
                        onClick={(e) => {
                          e.preventDefault();
                          setIsProfileDropdownOpen(false);
                          navigate('/profile');
                        }}
                      >
                        My Profile
                      </NavLink>
                      <NavLink
                        to="/settings"
                        className="block px-4 py-2 text-sm text-slate-700 hover:bg-slate-100/80 hover:text-sky-600 transition-colors duration-150 ease-in-out dark:text-slate-300 dark:hover:bg-slate-700/50 dark:hover:text-sky-300"
                        role="menuitem"
                        onClick={(e) => {
                          e.preventDefault();
                          setIsProfileDropdownOpen(false);
                          navigate('/settings');
                        }}
                      >
                        Settings
                      </NavLink>
                      <NavLink
                        to="/marketing"
                        className="block px-4 py-2 text-sm text-slate-700 hover:bg-slate-100/80 hover:text-sky-600 transition-colors duration-150 ease-in-out dark:text-slate-300 dark:hover:bg-slate-700/50 dark:hover:text-sky-300"
                        role="menuitem"
                        onClick={(e) => {
                          e.preventDefault();
                          setIsProfileDropdownOpen(false);
                          navigate('/marketing');
                        }}
                      >
                        Marketing & Popups
                      </NavLink>
                      <NavLink
                        to="/notifications"
                        className="block px-4 py-2 text-sm text-slate-700 hover:bg-slate-100/80 hover:text-sky-600 transition-colors duration-150 ease-in-out dark:text-slate-300 dark:hover:bg-slate-700/50 dark:hover:text-sky-300"
                        role="menuitem"
                        onClick={(e) => {
                          e.preventDefault();
                          setIsProfileDropdownOpen(false);
                          navigate('/notifications');
                        }}
                      >
                        Notifications
                      </NavLink>
                      <NavLink
                        to="/help"
                        className="block px-4 py-2 text-sm text-slate-700 hover:bg-slate-100/80 hover:text-sky-600 transition-colors duration-150 ease-in-out dark:text-slate-300 dark:hover:bg-slate-700/50 dark:hover:text-sky-300"
                        role="menuitem"
                        onClick={(e) => {
                          e.preventDefault();
                          setIsProfileDropdownOpen(false);
                          navigate('/help');
                        }}
                      >
                        Help & Support
                      </NavLink>
                      <NavLink
                        to="/privacy/gdpr"
                        className="block px-4 py-2 text-sm text-slate-700 hover:bg-slate-100/80 hover:text-sky-600 transition-colors duration-150 ease-in-out dark:text-slate-300 dark:hover:bg-slate-700/50 dark:hover:text-sky-300"
                        role="menuitem"
                        onClick={(e) => {
                          e.preventDefault();
                          setIsProfileDropdownOpen(false);
                          navigate('/privacy/gdpr');
                        }}
                      >
                        Privacy & GDPR
                      </NavLink>
                      <hr className="my-1 border-slate-200 dark:border-slate-700" />
                      <button
                        onClick={showLogoutConfirmation}
                        className="block w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-100/80 hover:text-sky-600 transition-colors duration-150 ease-in-out dark:text-slate-300 dark:hover:bg-slate-700/50 dark:hover:text-sky-300"
                        role="menuitem"
                      >
                        Logout
                      </button>
                    </div>
                  )}
                </div>

                {/* Removed duplicate right-side hamburger to keep only sidebar toggle on the left */}
              </div>
            </div>
          </div>
        </nav>

        {/* Logout Confirmation Modal */}
        <Modal
          title="Confirm Logout"
          open={isLogoutModalVisible}
          onOk={handleLogoutConfirm}
          onCancel={handleLogoutCancel}
          okText="Yes, Logout"
          cancelText="Cancel"
        >
          <p>Are you sure you want to logout?</p>
        </Modal>
    </div>
  );
};