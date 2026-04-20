import { useState, useEffect, useMemo } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { Bars3Icon, UserCircleIcon, MoonIcon, SunIcon } from '@heroicons/react/24/outline';
import { Avatar, Modal } from 'antd';
import { message } from '@/shared/utils/antdStatic';
import { useAuth } from '../../hooks/useAuth';
import { useAuthModal } from '../../contexts/AuthModalContext';
import { useCart } from '@/shared/hooks/useCart';
import RealTimeStatusIndicator from '../realtime/RealTimeStatusIndicator';
import EnhancedCustomerDetailModal from '@/features/customers/components/EnhancedCustomerDetailModal';
import NotificationBell from '@/features/notifications/components/NotificationBell';
import StudentWalletTriggerButton from '@/features/students/components/StudentWalletTriggerButton';
import { getWalletBalance } from '@/features/students/utils/getWalletBalance';
import { useCurrency } from '@/shared/contexts/CurrencyContext';
import { useWalletSummary } from '@/shared/hooks/useWalletSummary';
import { getNavItemsForRole } from '@/shared/utils/navConfig';
import { isShopStaff } from '@/shared/utils/roleUtils';
import { featureFlags } from '@/shared/config/featureFlags';
import { APP_VERSION } from '@/shared/constants/version';
import { UkcBrandWordmark } from '@/shared/components/ui/UkcBrandDot';
import LanguageSwitcher from '@/shared/components/LanguageSwitcher';

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

/** Section title next to UKC (e.g. Academy, Shop). */
const resolvePageSectionIndicator = (pathname, userRole, permissions) => {
  if (pathname === '/' || pathname === '/login') return null;
  if (pathname === '/guest') return null;
  if (pathname === '/shop' || pathname.startsWith('/shop/')) {
    return {
      activeItem: { to: '/shop', label: 'Shop' },
      displayLabel: 'Shop',
      textColor: '#ec4899',
    };
  }

  const navItems = getNavItemsForRole(userRole, permissions);
  const pathToSectionMap = {
    '/members/offerings': '/members/offerings',
  };
  const matchPath = pathToSectionMap[pathname] || pathname;

  let activeItem = null;
  for (const item of navItems) {
    if (item.subItems) {
      const sortedSubItems = [...item.subItems].sort(
        (a, b) => (b.to?.length || 0) - (a.to?.length || 0)
      );
      const matchedSub = sortedSubItems.find(
        (sub) => matchPath === sub.to || matchPath.startsWith(`${sub.to}/`)
      );
      if (matchedSub) {
        activeItem = item;
        break;
      }
    }
    if (item.to && (matchPath === item.to || matchPath.startsWith(`${item.to}/`))) {
      activeItem = item;
      break;
    }
  }

  if (!activeItem?.to) return null;

  return {
    activeItem,
    displayLabel: activeItem.label,
    textColor: activeItem.customStyle?.textColor || '#64748b',
  };
};

export const Navbar = ({ toggleSidebar, toggleSidebarCollapsed }) => { 
  // Mobile NavLinks menu is no longer used (only sidebar toggle remains)
  // const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isProfileDropdownOpen, setIsProfileDropdownOpen] = useState(false);
  const [isLogoutModalVisible, setIsLogoutModalVisible] = useState(false);
  const [isStudentProfileOpen, setIsStudentProfileOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const { logout, user, isAuthenticated } = useAuth();
  const { openAuthModal } = useAuthModal();
  const { getCartCount } = useCart();
  const { userCurrency, getCurrencySymbol, convertCurrency, businessCurrency } = useCurrency();
  const location = useLocation();
  
  // Storage currency is always EUR (base currency)
  const storageCurrency = businessCurrency || 'EUR';
  // Query wallet in storage currency (EUR)
  const { data: walletSummary } = useWalletSummary({ enabled: isAuthenticated, currency: storageCurrency });
  const navigate = useNavigate();

  const pageSectionIndicator = useMemo(
    () => resolvePageSectionIndicator(location.pathname, user?.role, user?.permissions),
    [location.pathname, user?.role, user?.permissions]
  );

  // Get raw balance — aggregate all currency balances into storage currency
  const rawWalletBalance = (() => {
    if (!isAuthenticated) return undefined;

    // If multi-currency balances array is available, aggregate
    const balances = walletSummary?.balances;
    if (Array.isArray(balances) && balances.length > 0) {
      let total = 0;
      for (const b of balances) {
        if ((b.available || 0) !== 0) {
          if (b.currency === storageCurrency) {
            total += Number(b.available) || 0;
          } else if (convertCurrency) {
            total += convertCurrency(Number(b.available) || 0, b.currency, storageCurrency);
          }
        }
      }
      return total;
    }

    // Fallback: single-currency response
    return resolveWalletBalance(walletSummary, user);
  })();
  
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

  const handleSidebarToggle = (e) => {
    e.preventDefault();
    e.stopPropagation();
    toggleSidebar?.();
  };

  return (
    <div className="dark safe-pt">
      <nav
        className={`sticky top-0 z-[70] transition-all duration-300 ${
          isScrolled
            ? 'border-b border-white/10'
            : 'border-b border-white/5'
        }`}
        style={{
          background: isScrolled
            ? 'linear-gradient(180deg, #3a4a4f 0%, #2e3f44 60%, #263840 100%)'
            : 'linear-gradient(180deg, #46575c 0%, #3a4d53 60%, #324750 100%)',
          boxShadow: isScrolled
            ? '0 8px 32px rgba(0,0,0,0.35), 0 2px 8px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.07), inset 0 -1px 0 rgba(0,168,196,0.15)'
            : '0 4px 20px rgba(0,0,0,0.22), inset 0 1px 0 rgba(255,255,255,0.05), inset 0 -1px 0 rgba(0,168,196,0.08)'
        }}
      >
          <div className="mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center h-16">
              {/* Left Section - fixed width */}
              <div className="flex items-center flex-shrink-0 gap-2 min-w-0">
                {/* Mobile/Tablet Menu Toggle - visible on all screens */}
                <button
                  type="button"
                  onClick={handleSidebarToggle}
                  className="p-2 rounded-md text-white hover:text-white/80 hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-[#00a8c4] transition-colors duration-150 ease-in-out shrink-0"
                  aria-expanded={false}
                  aria-label="Toggle sidebar"
                  data-sidebar-toggle="true"
                >
                  <span className="sr-only">Toggle sidebar</span>
                  <Bars3Icon className="block h-6 w-6" aria-hidden="true" />
                </button>

                <div className="flex items-baseline gap-0.5 sm:gap-1 min-w-0">
                  {/* UKC on left — guest page xl+ only */}
                  {location.pathname === '/guest' && (
                    <NavLink
                      to="/guest"
                      className="hidden xl:flex items-baseline px-3 py-1 rounded-md hover:bg-white/10 transition-colors duration-150 shrink-0"
                    >
                      <UkcBrandWordmark />
                    </NavLink>
                  )}

                  {/* Logo / UKC — hidden on guest page */}
                  {location.pathname !== '/guest' && (
                    <NavLink
                      to="/guest"
                      className="flex items-center shrink-0 px-3 py-1 rounded-md hover:bg-white/10 transition-colors duration-150 ease-in-out"
                      onClick={(e) => {
                        if (
                          (user?.role?.toLowerCase() === 'outsider' ||
                            user?.role?.toLowerCase() === 'student') &&
                          location.pathname.startsWith('/shop')
                        ) {
                          e.preventDefault();
                          navigate('/guest');
                        }
                      }}
                    >
                      {(() => {
                        try {
                          const settings = JSON.parse(localStorage.getItem('systemSettings') || '{}');
                          if (settings.branding?.logo) {
                            return (
                              <img
                                src={settings.branding.logo}
                                alt={settings.branding?.company_name || 'Logo'}
                                style={{ height: '40px', objectFit: 'contain' }}
                              />
                            );
                          }
                        } catch (e) {
                          console.error('Failed to load logo:', e);
                        }
                        return (
                          <span
                            className="flex items-center gap-3"
                            style={{ backfaceVisibility: 'hidden', transform: 'translateZ(0)' }}
                          >
                            <UkcBrandWordmark />
                          </span>
                        );
                      })()}
                    </NavLink>
                  )}

                  {pageSectionIndicator && (
                    <div
                      className="min-w-0 max-w-[100px] sm:max-w-[160px] md:max-w-[220px] lg:max-w-none overflow-hidden cursor-pointer hover:opacity-80 transition-opacity"
                      onClick={() => {
                        if (pageSectionIndicator.activeItem.to) navigate(pageSectionIndicator.activeItem.to);
                      }}
                      role="link"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && pageSectionIndicator.activeItem.to) {
                          navigate(pageSectionIndicator.activeItem.to);
                        }
                      }}
                      title={`Go to ${pageSectionIndicator.displayLabel}`}
                    >
                      <span
                        className="font-gotham-bold whitespace-nowrap text-sm sm:text-base md:text-lg lg:text-xl truncate"
                        style={{
                          color: pageSectionIndicator.textColor,
                          letterSpacing: '0.02em',
                        }}
                        title={pageSectionIndicator.displayLabel}
                      >
                        {pageSectionIndicator.displayLabel}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Center Section - takes remaining space, centers content */}
              <div className="flex-1 flex items-center justify-center min-w-0">
                {(() => {
                  try {
                    const currentPath = location.pathname;

                    if (currentPath === '/' || currentPath === '/login') {
                      return null;
                    }

                    if (currentPath === '/guest') {
                      return (
                        <NavLink
                          to="/guest"
                          className="flex xl:hidden items-baseline hover:opacity-80 transition-opacity"
                        >
                          <UkcBrandWordmark />
                        </NavLink>
                      );
                    }

                    return null;
                  } catch (error) {
                    console.error('Error rendering navbar center:', error);
                    return null;
                  }
                })()}
              </div>

              {/* Right-side icons */}
              <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
                {/* Subtle Plannivo link with version - managers/developers only */}
                {['admin', 'manager', 'super_admin', 'developer'].includes(user?.role?.toLowerCase()) && (
                <a 
                  href="https://plannivo.com"
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="hidden lg:flex items-center gap-1.5 text-xs text-white/60 hover:text-white/90 transition-colors duration-150"
                  title="Visit Plannivo.com"
                >
                  <span>Plannivo</span>
                  <span className="px-1.5 py-0.5 bg-white/10 text-white/80 rounded text-[10px] font-medium">
                    v{APP_VERSION}
                  </span>
                </a>
                )}
              
                <LanguageSwitcher />

                {/* Real-time Status Indicator - Only for authenticated users */}
                {isAuthenticated && <NotificationBell />}
                {isAuthenticated && ['admin', 'manager', 'super_admin', 'developer'].includes(user?.role?.toLowerCase()) && (
                  <div className="hidden md:flex">
                    <RealTimeStatusIndicator />
                  </div>
                )}
              
                {/* Profile Dropdown Container or Sign In Button */}
                {isAuthenticated ? (
                  <div className="relative profile-dropdown-container z-[80]">
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
                      className="origin-top-right absolute right-0 mt-2 w-48 rounded-lg shadow-xl py-1 bg-white border border-slate-200 focus:outline-none z-[9999] dark:bg-slate-800 dark:border-slate-700/40"
                      role="menu" 
                      aria-orientation="vertical"
                      aria-labelledby="user-menu-button"
                      style={{ zIndex: 9999 }}
                    >
                      {['instructor', 'manager', 'admin', 'developer', 'super_admin'].includes(user?.role?.toLowerCase()) ? (
                        <button
                          type="button"
                          className="block w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-100/80 hover:text-sky-600 transition-colors duration-150 ease-in-out dark:text-slate-300 dark:hover:bg-slate-700/50 dark:hover:text-sky-300"
                          role="menuitem"
                          onClick={() => {
                            setIsProfileDropdownOpen(false);
                            window.dispatchEvent(new CustomEvent('instructorProfile:open'));
                          }}
                        >
                          {displayName}
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="flex w-full items-center justify-between px-4 py-2 text-sm text-slate-700 hover:bg-slate-100/80 hover:text-sky-600 transition-colors duration-150 ease-in-out dark:text-slate-300 dark:hover:bg-slate-700/50 dark:hover:text-sky-300"
                          role="menuitem"
                          onClick={() => {
                            setIsProfileDropdownOpen(false);
                            setIsStudentProfileOpen(true);
                          }}
                        >
                          <span>{displayName}</span>
                          <span className="ml-2 text-xs text-sky-500 dark:text-sky-400 font-medium">My Profile</span>
                        </button>
                      )}
                      {isAuthenticated && (
                        <button
                          type="button"
                          onClick={() => {
                            handleWalletClick();
                            setIsProfileDropdownOpen(false);
                          }}
                          className="flex w-full items-center justify-between px-4 py-2 text-sm text-slate-700 hover:bg-slate-100/80 hover:text-sky-600 transition-colors duration-150 ease-in-out dark:text-slate-300 dark:hover:bg-slate-700/50 dark:hover:text-sky-300"
                          role="menuitem"
                        >
                          <span>My Wallet</span>
                          <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                            {walletBalance !== undefined && preferredCurrency ? `${preferredCurrency.symbol}${walletBalance.toFixed(2)}` : '...'}
                          </span>
                        </button>
                      )}
                      <NavLink
                        to="/shop/my-orders"
                        className="block px-4 py-2 text-sm text-slate-700 hover:bg-slate-100/80 hover:text-sky-600 transition-colors duration-150 ease-in-out dark:text-slate-300 dark:hover:bg-slate-700/50 dark:hover:text-sky-300"
                        role="menuitem"
                        onClick={(e) => {
                          e.preventDefault();
                          setIsProfileDropdownOpen(false);
                          navigate('/shop/my-orders');
                        }}
                      >
                        My Orders
                      </NavLink>
                      {(featureFlags.publicShopEnabled || isShopStaff(user?.role)) && (
                        <NavLink
                          to="/shop/browse"
                          className="flex items-center justify-between px-4 py-2 text-sm text-slate-700 hover:bg-slate-100/80 hover:text-sky-600 transition-colors duration-150 ease-in-out dark:text-slate-300 dark:hover:bg-slate-700/50 dark:hover:text-sky-300"
                          role="menuitem"
                          onClick={(e) => {
                            e.preventDefault();
                            setIsProfileDropdownOpen(false);
                            navigate('/shop/browse', {
                              state: {
                                openCart: true,
                                openedFrom: 'profile-menu',
                                requestedAt: Date.now()
                              }
                            });
                          }}
                        >
                          <span>Shopping Cart</span>
                          {getCartCount() > 0 && (
                            <span className="text-xs font-semibold bg-sky-100 text-sky-700 px-1.5 py-0.5 rounded-full dark:bg-sky-900/50 dark:text-sky-300">
                              {getCartCount()}
                            </span>
                          )}
                        </NavLink>
                      )}
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
                ) : (
                  // Sign In button for guests
                  <button
                    onClick={() => {
                      openAuthModal({
                        title: 'Sign In to UKC•',
                        message: 'Create an account or sign in to access all features',
                        returnUrl: location.pathname
                      });
                    }}
                    className="px-4 py-2 rounded-md font-duotone-bold text-sm transition-all duration-150 focus:outline-none"
                    style={{ background: '#4b4f54', color: '#00a8c4', border: '1px solid rgba(0,168,196,0.5)', boxShadow: '0 0 8px rgba(0,168,196,0.2)' }}
                    aria-label="Sign In"
                  >
                    Sign In
                  </button>
                )}

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

        {/* Student self-profile drawer (read-only) */}
        {user?.id && (
          <EnhancedCustomerDetailModal
            customer={{ id: user.id }}
            isOpen={isStudentProfileOpen}
            onClose={() => setIsStudentProfileOpen(false)}
            readOnly={true}
          />
        )}
    </div>
  );
};