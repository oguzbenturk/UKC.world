import { useState, useEffect, useRef } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { Modal, Input, Select, Checkbox, Badge } from 'antd';
import { message } from '@/shared/utils/antdStatic';
import { useAuth } from '../../hooks/useAuth';
import { getNavItemsForRole, getSystemItemsForRole } from '../../utils/navConfig';
import { useShopFilters, SORT_OPTIONS } from '../../contexts/ShopFiltersContext';
import { hasSubcategories, getHierarchicalSubcategories } from '@/shared/constants/productCategories';
import {
  HomeIcon,
  UsersIcon,
  AcademicCapIcon,
  CurrencyDollarIcon,
  CogIcon,
  QuestionMarkCircleIcon,
  ArrowRightOnRectangleIcon,
  ShoppingBagIcon,
  CalendarDaysIcon,
  CubeIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  TrashIcon,
  PresentationChartBarIcon,
  BellAlertIcon,
  WrenchScrewdriverIcon,
  MegaphoneIcon,
  ChatBubbleLeftRightIcon,
  ArrowLeftIcon,
  SparklesIcon,
  MagnifyingGlassIcon,
  FunnelIcon
} from '@heroicons/react/24/outline';

const Sidebar = ({ isOpen, toggleSidebar, isCollapsed, isDark }) => {
  const [isLogoutModalVisible, setIsLogoutModalVisible] = useState(false);
  const [expandedItems, setExpandedItems] = useState({});
  const [isShopMode, setIsShopMode] = useState(false);
  const sidebarRef = useRef(null);
  const { logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // Get current role for shop mode detection
  let currentUserRole = undefined;
  try { currentUserRole = JSON.parse(localStorage.getItem('user'))?.role?.toLowerCase(); } catch {}

  // All roles now get the UKC styled shop experience
  const isUKCRole = true;

  // Detect shop route and enable shop mode for all roles
  useEffect(() => {
    if (location.pathname.startsWith('/shop')) {
      setIsShopMode(true);
    }
  }, [location.pathname]);

  // Handle back to menu - exit shop mode and reset filters
  const handleBackToMenu = () => {
    setIsShopMode(false);
    navigate('/'); // Navigate away from shop
  };

  // Auto-expand parent items when their subitems are active
  useEffect(() => {
    const user = localStorage.getItem('user');
    if (!user) return;
    
    try {
      const parsedUser = JSON.parse(user);
      const currentRole = parsedUser?.role;
      const permissions = parsedUser?.permissions || null;
      const navItems = getNavItemsForRole(currentRole, permissions);
      const systemItems = getSystemItemsForRole(currentRole, permissions);
      const allItems = [...navItems, ...systemItems];
      
      const newExpandedState = {};
      allItems.forEach(item => {
        if (item.subItems) {
          const hasActiveSubItem = item.subItems.some(subItem => 
            location.pathname === subItem.to
          );
          if (hasActiveSubItem) {
            newExpandedState[item.label] = true;
          }
        }
      });
      
      setExpandedItems(prev => ({ ...prev, ...newExpandedState }));
    } catch {
      // Silently handle parse errors
    }
  }, [location.pathname]);

  // Monitor viewport dimensions for responsive behavior
  useEffect(() => {
    const handleResize = () => {
      // Responsive behavior handling without debug logging
    };
    
    handleResize(); // Check on mount
    window.addEventListener('resize', handleResize);
    
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Close sidebar when clicking outside (on mobile, tablets, and small screens up to 1200px)
  useEffect(() => {
    const handleClickOutside = (event) => {
      const currentWidth = window.innerWidth;
      
      // Don't auto-close if clicking the navbar hamburger button
      const isHamburgerButton = event.target.closest('[data-sidebar-toggle="true"]');
  if (isHamburgerButton) return;
      
      const shouldClose = isOpen && currentWidth < 1200 && sidebarRef.current && !sidebarRef.current.contains(event.target);
      
      // Debug all clicks for 853x1280 device
  // Removed debug logs
      
  if (shouldClose) toggleSidebar();
    };

    // Debug: Log when event listeners are attached/removed
    if (isOpen) {
      // Add a small delay to prevent immediate closure when opening via hamburger button
      const timeoutId = setTimeout(() => {
        document.addEventListener('mousedown', handleClickOutside);
        document.addEventListener('touchstart', handleClickOutside);
      }, 150);
      
      return () => {
        clearTimeout(timeoutId);
        document.removeEventListener('mousedown', handleClickOutside);
        document.removeEventListener('touchstart', handleClickOutside);
      };
    } else {
      // No-op
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [isOpen, toggleSidebar]);
    const baseLinkClasses = "flex items-center px-3 py-2.5 rounded-md transition-colors duration-75 ease-out text-sm font-medium";
  // Light mode: dark text on white sidebar | Dark mode: light text on dark sidebar
  const commonLinkClasses = `${baseLinkClasses} text-slate-700 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-300 dark:hover:text-white dark:hover:bg-slate-800/60`;
  const activeLinkClasses = "!bg-slate-100 !text-slate-900 border-l-2 border-[#2d6a3e] pl-[10px] dark:!bg-slate-800/80 dark:!text-white";
  const groupLabelClasses = "px-3 pb-2 text-xs text-slate-500 dark:text-slate-400 font-semibold uppercase tracking-wider";
  // Split sub-item classes - base without hover, and hover-only
  const subItemBaseClasses = "py-2.5 text-sm transition-colors duration-75 ease-out block border-l-2";
  const subItemInactiveClasses = `${subItemBaseClasses} pl-11 rounded-md border-l-transparent text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800/40 dark:hover:text-white`;
  const subItemActiveClasses = `${subItemBaseClasses} !pl-[42px] !text-slate-900 !bg-slate-100 !rounded-r-md !rounded-l-none !border-l-[#2d6a3e] !border-solid dark:!text-white dark:!bg-slate-800/60`;
  // const collapsedLinkClasses = "flex items-center justify-center px-2 py-2.5 text-slate-300 hover:bg-slate-700/50 hover:text-sky-300 rounded-md transition-colors duration-150 ease-in-out text-sm font-medium";

  const showLogoutConfirmation = () => {
    setIsLogoutModalVisible(true);
    if (isOpen && window.innerWidth < 1200) {
      toggleSidebar();
    }
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

  const toggleExpanded = (label) => {
    setExpandedItems(prev => ({
      ...prev,
      [label]: !prev[label]
    }));
  };

  const isItemActive = (path) => {
    return location.pathname === path;
  };
  const isSubItemActive = (item) => {
    if (item.subItems) {
      return item.subItems.some(subItem => isItemActive(subItem.to));
    }
    return false;
  };
  const isParentActive = (item) => {
    if (isItemActive(item.to)) return true;
    return isSubItemActive(item);
  };

  // Build dynamic nav + system items from role config
  const allIconMap = {
    HomeIcon,
    ShoppingBagIcon,
    UsersIcon,
    AcademicCapIcon,
    CurrencyDollarIcon,
    CalendarDaysIcon,
    CubeIcon,
    CogIcon,
    QuestionMarkCircleIcon,
    TrashIcon,
    PresentationChartBarIcon,
    BellAlertIcon,
    WrenchScrewdriverIcon,
    MegaphoneIcon,
    ChatBubbleLeftRightIcon,
    SparklesIcon
  };

  let currentRole = undefined;
  let userPermissions = null;
  try { 
    const storedUser = JSON.parse(localStorage.getItem('user'));
    currentRole = storedUser?.role;
    userPermissions = storedUser?.permissions || null;
  } catch {}

  const dynamicNavItems = getNavItemsForRole(currentRole, userPermissions).map(n => ({
    ...n,
    icon: allIconMap[n.icon] || HomeIcon
  }));
  const dynamicSystemItems = getSystemItemsForRole(currentRole, userPermissions).map(n => ({
    ...n,
    icon: allIconMap[n.icon] || CogIcon
  }));

  // Get shop item for shop mode sidebar
  const shopItem = dynamicNavItems.find(item => item.isShopLink);

  // Shop filters context - only use when shop mode is active
  const shopFilters = useShopFilters();

  // Shop Mode Sidebar Content with Full Filters
  const renderShopSidebar = () => {
    const {
      selectedCategory,
      selectedSubcategory,
      sortBy,
      showInStockOnly,
      searchText,
      expandedCategories,
      activeFilterCount,
      availableCategories,
      handleCategoryChange,
      handleSubcategoryChange,
      handleSortChange,
      handleSearchChange,
      setShowInStockOnly,
      clearAllFilters,
      toggleCategoryExpanded
    } = shopFilters;

    return (
      <div className="overflow-y-auto overflow-x-hidden h-full px-2 pt-2 pb-4 scrollbar scrollbar-track-transparent scrollbar-thumb-slate-600">
        {/* Shop Header - Centered, Bigger */}
        <div className="px-3 mb-4">
          <div className="flex items-center justify-center text-xl font-bold">
            <span style={{ color: '#2d6a3e', fontSize: '1.75rem', lineHeight: '1', marginRight: '0.25rem' }}>•</span>
            <span style={{ color: '#ec4899', letterSpacing: '0.02em', fontSize: '1.25rem' }}>Shop</span>
          </div>
        </div>

        {/* Filters Header */}
        <div className="px-3 mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FunnelIcon className="h-4 w-4 text-slate-500 dark:text-slate-400" />
            <span className="text-xs text-slate-500 font-semibold uppercase tracking-wider dark:text-slate-400">
              Filters
            </span>
          </div>
          {activeFilterCount > 0 && (
            <button
              onClick={clearAllFilters}
              className="text-xs text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white transition-colors"
            >
              Clear all
            </button>
          )}
        </div>

        {/* Categories */}
        <div className="px-3 mb-4">
          <div className="space-y-0.5">
            {availableCategories.map((cat) => {
              const isActive = selectedCategory === cat.value && selectedSubcategory === 'all';
              const isExpanded = expandedCategories[cat.value];
              const hasSubs = cat.value !== 'all' && hasSubcategories(cat.value);
              const subcats = hasSubs ? getHierarchicalSubcategories(cat.value) : [];
              const isCategoryActive = selectedCategory === cat.value;
              
              return (
                <div key={cat.value}>
                  {/* Category row */}
                  <div className="flex items-center">
                    {/* Expand/collapse toggle */}
                    {hasSubs ? (
                      <button
                        onClick={() => toggleCategoryExpanded(cat.value)}
                        className="w-6 h-8 flex items-center justify-center text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
                      >
                        {isExpanded ? (
                          <ChevronDownIcon className="h-3 w-3" />
                        ) : (
                          <ChevronRightIcon className="h-3 w-3" />
                        )}
                      </button>
                    ) : (
                      <div className="w-6" />
                    )}
                    <button
                      onClick={() => {
                        handleCategoryChange(cat.value);
                        if (hasSubs && !isExpanded) {
                          toggleCategoryExpanded(cat.value);
                        }
                      }}
                      className={`flex-1 flex items-center justify-between px-2 py-2 rounded-lg text-sm transition-all ${
                        isActive
                          ? 'bg-slate-200 text-slate-900 font-medium dark:bg-slate-700 dark:text-white'
                          : isCategoryActive
                            ? 'bg-slate-100 text-slate-800 font-medium dark:bg-slate-700/50 dark:text-slate-200'
                            : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700/30'
                      }`}
                    >
                      <span>{cat.label}</span>
                      <span className={`text-xs ${isActive ? 'text-slate-500 dark:text-slate-400' : 'text-slate-400 dark:text-slate-500'}`}>
                        {cat.count}
                      </span>
                    </button>
                  </div>
                  
                  {/* Subcategories */}
                  {hasSubs && isExpanded && (
                    <div className="ml-6 mt-0.5 space-y-0.5 border-l border-slate-300 pl-2 dark:border-slate-600">
                      {subcats.map((parent) => {
                        const isParentActive = selectedCategory === cat.value && selectedSubcategory === parent.value;
                        
                        return (
                          <button
                            key={parent.value}
                            onClick={() => handleSubcategoryChange(parent.value)}
                            className={`w-full flex items-center justify-between px-2 py-1.5 rounded text-sm transition-all ${
                              isParentActive
                                ? 'bg-slate-200 text-slate-900 font-medium dark:bg-slate-700 dark:text-white'
                                : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-slate-200 dark:hover:bg-slate-700/30'
                            }`}
                          >
                            <span>{parent.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Divider */}
        <div className="my-4 border-t border-slate-200 dark:border-slate-700" />

        {/* In Stock Only Toggle */}
        <div className="px-3">
          <label className="flex items-center gap-3 cursor-pointer text-sm text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white transition-colors">
            <input
              type="checkbox"
              checked={showInStockOnly}
              onChange={(e) => setShowInStockOnly(e.target.checked)}
              className="w-4 h-4 rounded border-slate-400 bg-white text-[#2d6a3e] focus:ring-[#2d6a3e] focus:ring-offset-0 dark:border-slate-500 dark:bg-slate-700"
            />
            <span>In Stock Only</span>
          </label>
        </div>

        {/* Back to Menu Button - Right under In Stock Only */}
        <div className="px-2 mt-6 border-t border-slate-200 pt-4 dark:border-slate-700">
          <button
            onClick={handleBackToMenu}
            className="flex items-center justify-center w-full px-3 py-3 text-sm font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-md transition-all duration-150 dark:text-slate-300 dark:hover:text-white dark:hover:bg-slate-800/60"
          >
            <ArrowLeftIcon className="h-5 w-5 mr-2" />
            <span>Back to Menu</span>
          </button>
        </div>
      </div>
    );
  };

  return (
    <>
      <div className={isDark ? 'dark' : ''}>
        <aside 
          ref={sidebarRef}
          className={`sidebar ${isCollapsed ? 'collapsed' : ''} ${isOpen ? 'open' : ''}`}
        >
          {/* Shop Mode Sidebar */}
          {isShopMode && isUKCRole ? (
            <nav className="flex flex-col h-full overflow-hidden">
              {renderShopSidebar()}
            </nav>
          ) : (
          <nav className="flex-grow overflow-y-auto overflow-x-hidden px-2 pt-2 pb-4 space-y-5 scrollbar scrollbar-track-transparent scrollbar-thumb-slate-300 hover:scrollbar-thumb-slate-400 dark:scrollbar-thumb-slate-600">
          
          <div>
            {/* Removed duplicate 'Main Menu' labels to simplify UI */}
            <ul className="mt-1 space-y-1">
              {dynamicNavItems.map(item => (
                <li key={item.label}>
                  {/* Special handling for Shop - navigates directly */}
                  {item.isShopLink ? (
                    <div className="relative group">
                      <NavLink
                        to={item.to}
                        className={({ isActive }) =>
                          `${commonLinkClasses} ${isActive ? activeLinkClasses : ''} ${isCollapsed ? 'justify-center' : ''}`
                        }
                        onClick={() => {
                          setIsShopMode(true);
                          if (isOpen && window.innerWidth < 1200) toggleSidebar();
                        }}
                      >
                        {item.customStyle ? (
                          <span className="flex items-center text-[15px] font-semibold">
                            <span style={{ color: item.customStyle.dotColor, fontSize: '1.5rem', lineHeight: '1', marginRight: isCollapsed ? '0' : '0.2rem' }}>•</span>
                            {!isCollapsed && <span style={{ color: item.customStyle.textColor, letterSpacing: '0.01em' }}>{item.label}</span>}
                          </span>
                        ) : (
                          <>
                            <item.icon className={`h-5 w-5 ${isCollapsed ? '' : 'mr-3'}`} />
                            {!isCollapsed && item.label}
                          </>
                        )}
                      </NavLink>
                      {isCollapsed && (
                        <div className="absolute left-full top-0 ml-2 px-2 py-1 bg-slate-800 text-white text-sm rounded opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap z-50">
                          {item.label}
                        </div>
                      )}
                    </div>
                  ) : item.subItems ? (
                    <div>
                      {isCollapsed ? (
                        // Collapsed view for items with subItems - show as tooltip
                        <div className="relative group">
                          <NavLink
                            to={item.to}
                            className={`${commonLinkClasses} justify-center ${isParentActive(item) ? 'text-white' : ''}`}
                            onClick={isOpen && window.innerWidth < 1200 ? toggleSidebar : undefined}
                          >
                            {item.customStyle ? (
                              <span className="flex items-center text-lg font-semibold">
                                <span style={{ color: item.customStyle.dotColor, fontSize: '1.5rem', marginRight: '0.25rem' }}>•</span>
                              </span>
                            ) : (
                              <item.icon className="h-5 w-5" />
                            )}
                          </NavLink>
                          {/* Tooltip */}
                          <div className="absolute left-full top-0 ml-2 px-2 py-1 bg-slate-800 text-white text-sm rounded opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap z-50 dark:bg-slate-700">
                            {item.label}
                          </div>
                        </div>
                      ) : (
                        // Expanded view for items with subItems
                        <>
                          <button 
                            onClick={() => toggleExpanded(item.label)}
                            className={`${commonLinkClasses} w-full justify-between ${isParentActive(item) ? 'text-sky-600 dark:text-sky-300' : ''}`}
                          >
                            <div className="flex items-center">
                              {item.customStyle ? (
                                <span className="flex items-center text-[15px] font-semibold mr-0">
                                  <span style={{ color: item.customStyle.dotColor, fontSize: '1.5rem', lineHeight: '1', marginRight: '0.2rem' }}>•</span>
                                  <span style={{ color: item.customStyle.textColor, letterSpacing: '0.01em' }}>{item.label}</span>
                                </span>
                              ) : (
                                <>
                                  <item.icon className="h-5 w-5 mr-3" />
                                  {item.label}
                                </>
                              )}
                            </div>
                            <ChevronDownIcon 
                              className={`h-4 w-4 transition-transform ${expandedItems[item.label] ? 'rotate-180' : ''}`} 
                            />
                          </button>
                          {expandedItems[item.label] && (
                            <div className="mt-1 ml-2 border-l border-slate-200 dark:border-slate-700">
                              {item.subItems.map(subItem => {
                                const parentColor = item.customStyle?.textColor || '#94a3b8';
                                return (
                                  <NavLink
                                    key={subItem.to}
                                    to={subItem.to}
                                    end
                                    className={({ isActive }) => 
                                      isActive ? subItemActiveClasses : subItemInactiveClasses
                                    }
                                    onClick={isOpen && window.innerWidth < 1200 ? toggleSidebar : undefined}
                                  >
                                    <span className="flex items-center">
                                      <span style={{ color: '#2d6a3e', fontSize: '0.75rem', lineHeight: '1', marginRight: '0.2rem', alignSelf: 'flex-end', marginBottom: '0.15rem' }}>•</span>
                                      <span style={{ color: parentColor, opacity: 0.75 }}>{subItem.label}</span>
                                    </span>
                                  </NavLink>
                                );
                              })}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  ) : (
                    // Regular nav items
                    <div className="relative group">
                      <NavLink 
                        to={item.to} 
                        className={({ isActive }) => 
                          `${commonLinkClasses} ${isActive ? activeLinkClasses : ''} ${
                            isCollapsed ? 'justify-center' : ''
                          }`
                        }
                        onClick={() => {
                          const currentWidth = window.innerWidth;
                          const shouldClose = isOpen && currentWidth < 1200;
                          
                          // Enhanced debugging for 853x1280 device
                          if (shouldClose) toggleSidebar();
                        }}
                      >
                        {item.customStyle ? (
                          <span className="flex items-center text-[15px] font-semibold">
                            <span style={{ color: item.customStyle.dotColor, fontSize: '1.5rem', lineHeight: '1', marginRight: isCollapsed ? '0' : '0.2rem' }}>•</span>
                            {!isCollapsed && <span style={{ color: item.customStyle.textColor, letterSpacing: '0.01em' }}>{item.label}</span>}
                          </span>
                        ) : (
                          <>
                            <item.icon className={`h-5 w-5 ${isCollapsed ? '' : 'mr-3'}`} />
                            {!isCollapsed && item.label}
                          </>
                        )}
                      </NavLink>
                      {/* Tooltip for collapsed mode */}
                      {isCollapsed && (
                        <div className="absolute left-full top-0 ml-2 px-2 py-1 bg-slate-800 text-white text-sm rounded opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap z-50 dark:bg-slate-700">
                          {item.label}
                        </div>
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </div>


          <div>
            {!isCollapsed && dynamicSystemItems.length > 0 && <span className={groupLabelClasses}>System</span>}
            <ul className="mt-1 space-y-1">
              {dynamicSystemItems.map(item => (
                <li key={item.label}>
                  {item.subItems ? (
                    <div>
                      {isCollapsed ? (
                        // Collapsed view for items with subItems - show as tooltip
                        <div className="relative group">
                          <button
                            onClick={() => toggleExpanded(item.label)}
                            className={`${commonLinkClasses} justify-center ${isParentActive(item) ? 'text-sky-600 dark:text-sky-300' : ''}`}
                          >
                            {item.customStyle ? (
                              <span className="flex items-center text-lg font-bold">
                                <span style={{ color: item.customStyle.dotColor, fontSize: '1.5rem', marginRight: '0.25rem' }}>•</span>
                              </span>
                            ) : (
                              <item.icon className="h-5 w-5" />
                            )}
                          </button>
                          {/* Tooltip */}
                          <div className="absolute left-full top-0 ml-2 px-2 py-1 bg-slate-800 text-white text-sm rounded opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap z-50 dark:bg-slate-700">
                            {item.label}
                          </div>
                        </div>
                      ) : (
                        // Expanded view for items with subItems
                        <>
                          <button 
                            onClick={() => toggleExpanded(item.label)}
                            className={`${commonLinkClasses} w-full justify-between ${isParentActive(item) ? 'text-sky-600 dark:text-sky-300' : ''}`}
                          >
                            <div className="flex items-center">
                              {item.image ? (
                                <img src={item.image} alt={item.label} className="h-5 w-5 mr-3 object-contain" />
                              ) : (
                                <item.icon className="h-5 w-5 mr-3" />
                              )}
                              {item.label}
                            </div>
                            <ChevronDownIcon 
                              className={`h-4 w-4 transition-transform ${expandedItems[item.label] ? 'rotate-180' : ''}`} 
                            />
                          </button>
                          {expandedItems[item.label] && (
                            <div className="mt-1 ml-2 border-l border-slate-200 dark:border-slate-700">
                              {item.subItems.map(subItem => (
                                <NavLink
                                  key={subItem.to}
                                  to={subItem.to}
                                  end
                                  className={({ isActive }) => 
                                    isActive ? subItemActiveClasses : subItemInactiveClasses
                                  }
                                  onClick={isOpen && window.innerWidth < 1200 ? toggleSidebar : undefined}
                                >
                                  {subItem.label}
                                </NavLink>
                              ))}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  ) : (
                    <div className="relative group">
                      <NavLink 
                        to={item.to} 
                        className={({ isActive }) => 
                          `${commonLinkClasses} ${isActive ? activeLinkClasses : ''} ${
                            isCollapsed ? 'justify-center' : ''
                          }`
                        }
                        onClick={isOpen && window.innerWidth < 1200 ? toggleSidebar : undefined}
                      >
                        <item.icon className={`h-5 w-5 ${isCollapsed ? '' : 'mr-3'}`} />
                        {!isCollapsed && item.label}
                      </NavLink>
                      {/* Tooltip for collapsed mode */}
                      {isCollapsed && (
                        <div className="absolute left-full top-0 ml-2 px-2 py-1 bg-slate-800 text-white text-sm rounded opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap z-50 dark:bg-slate-700">
                          {item.label}
                        </div>
                      )}
                    </div>
                  )}
                </li>
              ))}
              <li>
                <div className="relative group">
                  <button 
                    onClick={showLogoutConfirmation}
                    className={`${commonLinkClasses} w-full text-left ${
                      isCollapsed ? 'justify-center' : ''
                    }`}
                  >
                    <ArrowRightOnRectangleIcon className={`h-5 w-5 ${isCollapsed ? '' : 'mr-3'}`} />
                    {!isCollapsed && 'Logout'}
                  </button>
                  {/* Tooltip for collapsed mode */}
                  {isCollapsed && (
                    <div className="absolute left-full top-0 ml-2 px-2 py-1 bg-slate-800 text-white text-sm rounded opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap z-50 dark:bg-slate-700">
                      Logout
                    </div>
                  )}
                </div>
              </li>
            </ul>
          </div>
          </nav>
          )}
        </aside>
      </div>
      
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
    </>
  );
};

export default Sidebar;