import { useState, useEffect, useRef } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { Modal } from 'antd';
import { message } from '@/shared/utils/antdStatic';
import { useAuth } from '../../hooks/useAuth';
import { getNavItemsForRole, getSystemItemsForRole } from '../../utils/navConfig';
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
  TrashIcon,
  PresentationChartBarIcon,
  BellAlertIcon,
  WrenchScrewdriverIcon,
  MegaphoneIcon,
  ChatBubbleLeftRightIcon
} from '@heroicons/react/24/outline';

const Sidebar = ({ isOpen, toggleSidebar, isCollapsed, isDark }) => {
  const [isLogoutModalVisible, setIsLogoutModalVisible] = useState(false);
  const [expandedItems, setExpandedItems] = useState({});
  const sidebarRef = useRef(null);
  const { logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // Auto-expand parent items when their subitems are active
  useEffect(() => {
    const user = localStorage.getItem('user');
    if (!user) return;
    
    try {
      const currentRole = JSON.parse(user)?.role;
      const navItems = getNavItemsForRole(currentRole);
      const systemItems = getSystemItemsForRole(currentRole);
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
    const baseLinkClasses = "flex items-center px-3 py-2.5 rounded-md transition-colors duration-150 ease-in-out text-sm font-medium";
  const commonLinkClasses = `${baseLinkClasses} text-slate-600 hover:text-sky-600 hover:bg-slate-100/80 dark:text-slate-300 dark:hover:text-sky-300 dark:hover:bg-slate-700/50`;
  const activeLinkClasses = "bg-sky-100 text-sky-700 dark:bg-sky-600 dark:text-white";
  const groupLabelClasses = "px-3 pb-2 text-xs text-slate-500 dark:text-slate-400 font-semibold uppercase tracking-wider";
  const subItemClasses = "pl-11 py-2 text-sm text-slate-600 hover:bg-slate-100/80 hover:text-sky-600 rounded-md transition-colors duration-150 ease-in-out block dark:text-slate-300 dark:hover:bg-slate-700/50 dark:hover:text-sky-300";
  const activeSubItemClasses = "text-sky-700 bg-sky-100 dark:text-sky-300 dark:bg-slate-700/30";
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
    ChatBubbleLeftRightIcon
  };

  let currentRole = undefined;
  try { currentRole = JSON.parse(localStorage.getItem('user'))?.role; } catch {}

  const dynamicNavItems = getNavItemsForRole(currentRole).map(n => ({
    ...n,
    icon: allIconMap[n.icon] || HomeIcon
  }));
  const dynamicSystemItems = getSystemItemsForRole(currentRole).map(n => ({
    ...n,
    icon: allIconMap[n.icon] || CogIcon
  }));
  return (
    <>
      <div className={isDark ? 'dark' : ''}>
        <aside 
          ref={sidebarRef}
          className={`sidebar ${isCollapsed ? 'collapsed' : ''} ${isOpen ? 'open' : ''}`}
        >
          <nav className="flex-grow overflow-y-auto overflow-x-hidden px-2 pt-2 pb-4 space-y-5 scrollbar scrollbar-track-transparent scrollbar-thumb-slate-300 hover:scrollbar-thumb-slate-400 dark:scrollbar-thumb-slate-600">
          
          <div>
            {/* Removed duplicate 'Main Menu' labels to simplify UI */}
            <ul className="mt-1 space-y-1">
              {dynamicNavItems.map(item => (
                <li key={item.label}>
                  {item.subItems ? (
                    <div>
                      {isCollapsed ? (
                        // Collapsed view for items with subItems - show as tooltip
                        <div className="relative group">
                          <NavLink
                            to={item.to}
                            className={`${commonLinkClasses} justify-center ${isParentActive(item) ? 'text-sky-600 dark:text-sky-300' : ''}`}
                            onClick={isOpen && window.innerWidth < 1200 ? toggleSidebar : undefined}
                          >
                            <item.icon className="h-5 w-5" />
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
                              <item.icon className="h-5 w-5 mr-3" />
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
                                    `${subItemClasses} ${isActive ? activeSubItemClasses : ''}`
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
                            <item.icon className="h-5 w-5" />
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
                              <item.icon className="h-5 w-5 mr-3" />
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
                                    `${subItemClasses} ${isActive ? activeSubItemClasses : ''}`
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