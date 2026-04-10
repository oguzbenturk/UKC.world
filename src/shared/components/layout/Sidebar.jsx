import { useState, useEffect, useRef } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { Modal, Badge } from 'antd';
import { message } from '@/shared/utils/antdStatic';
import { useAuth } from '../../hooks/useAuth';
import { useAuthModal } from '../../contexts/AuthModalContext';
import { useAIChat } from '../../contexts/AIChatContext';
import { getNavItemsForRole, getSystemItemsForRole } from '../../utils/navConfig';
import { useShopFilters, SORT_OPTIONS } from '../../contexts/ShopFiltersContext';
import { preloadRoute } from '../../utils/routePreloader';
import { hasSubcategories, getHierarchicalSubcategories } from '@/shared/constants/productCategories';
import {
  HomeIcon,
  UsersIcon,
  AcademicCapIcon,
  CurrencyDollarIcon,
  CogIcon,
  QuestionMarkCircleIcon,
  ArrowRightOnRectangleIcon,
  ArrowLeftOnRectangleIcon,
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
  FunnelIcon,
  WalletIcon,
  LifebuoyIcon,
  UserCircleIcon,
  EnvelopeIcon,
  RocketLaunchIcon,
  LinkIcon,
  DocumentTextIcon,
  ArrowUturnLeftIcon,
  CreditCardIcon,
  BuildingLibraryIcon
} from '@heroicons/react/24/outline';

const Sidebar = ({ isOpen, toggleSidebar }) => {
  const [isLogoutModalVisible, setIsLogoutModalVisible] = useState(false);
  const [expandedItems, setExpandedItems] = useState({});
  const [isShopMode, setIsShopMode] = useState(false);
  const sidebarRef = useRef(null);
  const navRef = useRef(null);
  const { logout, isAuthenticated, isGuest } = useAuth();
  const { openAuthModal } = useAuthModal();
  const { toggleChat } = useAIChat();
  const navigate = useNavigate();
  const location = useLocation();

  // All roles now get the UKC styled shop experience
  const isUKCRole = true;

  // Detect shop route and toggle shop mode automatically
  useEffect(() => {
    if (location.pathname.startsWith('/shop')) {
      setIsShopMode(true);
    } else {
      setIsShopMode(false);
    }
  }, [location.pathname]);

  const handleBackToMenu = () => {
    setIsShopMode(false);
    navigate('/guest'); 
  };

  // Auto-expand parent items when their subitems are active
  useEffect(() => {
    const userString = localStorage.getItem('user');
    if (!userString) return;
    
    try {
      const parsedUser = JSON.parse(userString);
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
    } catch (e) {
      // Ignore
    }
  }, [location.pathname]);

  // Reset nav scroll on route change
  useEffect(() => {
    if (navRef.current) {
      navRef.current.scrollTop = 0;
    }
  }, [location.pathname]);

  // Handle clicks outside to close sidebar
  useEffect(() => {
    const handleClickOutside = (event) => {
      const isHamburgerButton = event.target.closest('[data-sidebar-toggle="true"]');
      if (isHamburgerButton) return;
      
      if (isOpen && sidebarRef.current && !sidebarRef.current.contains(event.target)) {
        toggleSidebar();
      }
    };

    if (isOpen) {
      const timeoutId = setTimeout(() => {
        document.addEventListener('mousedown', handleClickOutside);
        document.addEventListener('touchstart', handleClickOutside);
      }, 150);
      
      return () => {
        clearTimeout(timeoutId);
        document.removeEventListener('mousedown', handleClickOutside);
        document.removeEventListener('touchstart', handleClickOutside);
      };
    }
  }, [isOpen, toggleSidebar]);

  const baseLinkClasses = "flex items-center px-3 py-2.5 rounded-md transition-all duration-75 ease-out text-sm font-medium active:scale-[0.98] active:opacity-80";
  const commonLinkClasses = `${baseLinkClasses} text-slate-200 hover:text-white hover:bg-white/10`;
  const activeLinkClasses = "border-l-2 border-[#2d6a3e] pl-[10px] !text-sky-400";
  const groupLabelClasses = "px-3 pb-2 text-xs text-slate-400 font-semibold uppercase tracking-wider";
  const subItemInactiveClasses = "py-2.5 text-sm pl-11 rounded-md border-l-2 border-transparent transition-colors duration-75 ease-out block text-slate-300 hover:bg-white/10 hover:text-white";
  const subItemActiveClasses = "py-2.5 text-sm !pl-[42px] !text-sky-400 !bg-white/10 !rounded-r-md !rounded-l-none !border-l-[#2d6a3e] border-l-2 !border-solid transition-colors duration-75 ease-out block";

  const showLogoutConfirmation = () => {
    setIsLogoutModalVisible(true);
    if (isOpen) toggleSidebar();
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

  const handleLogoutCancel = () => setIsLogoutModalVisible(false);

  const toggleExpanded = (label) => {
    setExpandedItems(prev => ({
      ...prev,
      [label]: !prev[label]
    }));
  };

  const isItemActive = (path) => location.pathname === path;
  const isParentActive = (item) => {
    if (isItemActive(item.to)) return true;
    if (item.subItems) {
      return item.subItems.some(sub => isItemActive(sub.to));
    }
    return false;
  };

  const allIconMap = {
    HomeIcon, ShoppingBagIcon, UsersIcon, AcademicCapIcon, CurrencyDollarIcon,
    CalendarDaysIcon, CubeIcon, CogIcon, QuestionMarkCircleIcon, TrashIcon,
    PresentationChartBarIcon, BellAlertIcon, WrenchScrewdriverIcon, MegaphoneIcon,
    ChatBubbleLeftRightIcon, SparklesIcon, WalletIcon, LifebuoyIcon, UserCircleIcon,
    EnvelopeIcon, RocketLaunchIcon, LinkIcon, DocumentTextIcon, ArrowUturnLeftIcon
  };

  let currentUser = undefined;
  try { currentUser = JSON.parse(localStorage.getItem('user')); } catch {}
  const currentRole = currentUser?.role;
  const userPermissions = currentUser?.permissions || null;

  const dynamicNavItems = getNavItemsForRole(currentRole, userPermissions).map(n => ({
    ...n, icon: allIconMap[n.icon] || HomeIcon
  }));
  const dynamicSystemItems = getSystemItemsForRole(currentRole, userPermissions).map(n => ({
    ...n, icon: allIconMap[n.icon] || CogIcon
  }));

  const shopFilters = useShopFilters();

  const renderSubcategoryTree = (nodes, catValue, selectedCategory, selectedSubcategory, expandedCategories, toggleCategoryExpanded, handleSubcategoryChange, depth) => {
    return nodes.map((node) => {
      const isActive = selectedCategory === catValue && selectedSubcategory === node.value;
      const hasChildren = node.children && node.children.length > 0;
      const expandKey = `${catValue}__${node.value}`;
      const isNodeExpanded = expandedCategories[expandKey];

      return (
        <div key={node.value}>
          <div className="flex items-center">
            {hasChildren ? (
              <button
                onClick={() => toggleCategoryExpanded(expandKey)}
                className="w-5 h-7 flex items-center justify-center text-slate-400 hover:text-slate-200"
              >
                <ChevronRightIcon className={`h-2.5 w-2.5 transition-transform duration-150 ${isNodeExpanded ? 'rotate-90' : ''}`} />
              </button>
            ) : (
              <div className="w-5" />
            )}
            <button
              onClick={() => {
                handleSubcategoryChange(node.value);
                if (hasChildren && !isNodeExpanded) toggleCategoryExpanded(expandKey);
              }}
              className={`flex-1 flex items-center px-2 py-1.5 rounded text-sm transition-all ${
                isActive
                  ? 'bg-white/15 text-white font-medium'
                  : 'text-slate-300 hover:text-white hover:bg-white/10'
              }`}
            >
              <span>{node.label}</span>
            </button>
          </div>

          {hasChildren && isNodeExpanded && (
            <div className="ml-5 mt-0.5 space-y-0.5 border-l border-white/10 pl-2">
              {renderSubcategoryTree(node.children, catValue, selectedCategory, selectedSubcategory, expandedCategories, toggleCategoryExpanded, handleSubcategoryChange, depth + 1)}
            </div>
          )}
        </div>
      );
    });
  };

  const renderShopSidebar = () => {
    const {
      selectedCategory, selectedSubcategory, showInStockOnly, expandedCategories,
      availableCategories, handleCategoryChange: contextHandleCategoryChange,
      handleSubcategoryChange: contextHandleSubcategoryChange, setShowInStockOnly,
      clearAllFilters, toggleCategoryExpanded, setExpandedCategories, activeFilterCount
    } = shopFilters;

    const isLandingPage = location.pathname === '/shop';

    const handleCategoryChange = (value) => {
      contextHandleCategoryChange(value);
      setExpandedCategories(prev => {
        const next = {};
        Object.keys(prev).forEach(k => { next[k] = false; });
        next[value] = true;
        return next;
      });
      if (isLandingPage) {
        if (value === 'featured' || value === 'all') navigate('/shop/browse');
        else navigate(`/shop/${value}`);
      }
    };

    const handleSubcategoryChange = (value, forCategory) => {
      const effectiveCategory = forCategory || selectedCategory;
      if (forCategory && forCategory !== selectedCategory) {
        contextHandleCategoryChange(forCategory, true);
      }
      contextHandleSubcategoryChange(value);
      if (isLandingPage) {
        if (effectiveCategory && effectiveCategory !== 'featured' && effectiveCategory !== 'all') navigate(`/shop/${effectiveCategory}`);
        else navigate('/shop/browse');
      }
    };

    return (
      <div className="overflow-y-auto overflow-x-hidden h-full px-2 pt-2 pb-4 scrollbar scrollbar-track-transparent scrollbar-thumb-slate-600">
        <div className="px-3 mb-4">
          <div className="flex items-center justify-center text-xl font-bold">
            <span style={{ color: '#2d6a3e', fontSize: '1.75rem', lineHeight: '1', marginRight: '0.25rem' }}>•</span>
            <span style={{ color: '#ec4899', letterSpacing: '0.02em', fontSize: '1.25rem' }}>Shop</span>
          </div>
        </div>

        <div className="px-2 mb-4">
          <button onClick={handleBackToMenu} className="flex items-center justify-center w-full px-3 py-3 text-sm font-medium text-slate-200 hover:text-white hover:bg-white/10 rounded-md transition-all duration-150">
            <ArrowLeftIcon className="h-5 w-5 mr-2" />
            <span>Back to Menu</span>
          </button>
        </div>

        <div className="px-3 mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FunnelIcon className="h-4 w-4 text-slate-400" />
            <span className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Filters</span>
          </div>
          {activeFilterCount > 0 && (
            <button onClick={clearAllFilters} className="text-xs text-slate-400 hover:text-white">Clear all</button>
          )}
        </div>

        <div className="px-3 mb-4">
          <div className="space-y-0.5">
            {availableCategories.map((cat) => {
              const isSpecialCategory = cat.value === 'all' || cat.value === 'featured';
              const isActive = selectedCategory === cat.value && selectedSubcategory === 'all';
              const hasSubs = !isSpecialCategory && hasSubcategories(cat.value);
              const subcats = hasSubs ? getHierarchicalSubcategories(cat.value) : [];
              const isCategoryActive = selectedCategory === cat.value;
              const isExpanded = expandedCategories[cat.value] !== undefined ? expandedCategories[cat.value] : isCategoryActive;

              return (
                <div key={cat.value}>
                  <div className="flex items-center">
                    {hasSubs ? (
                      <button onClick={() => toggleCategoryExpanded(cat.value)} className="w-6 h-8 flex items-center justify-center text-slate-400 hover:text-slate-200">
                        <ChevronRightIcon className={`h-3 w-3 transition-transform duration-150 ${isExpanded ? 'rotate-90' : ''}`} />
                      </button>
                    ) : (
                      <div className="w-6" />
                    )}
                    <button onClick={() => handleCategoryChange(cat.value)} className={`flex-1 flex items-center justify-between px-2 py-2 rounded-lg text-sm transition-all ${isActive ? 'bg-white/15 text-white font-medium' : isCategoryActive ? 'bg-white/10 text-slate-100 font-medium' : 'text-slate-300 hover:bg-white/10'}`}>
                      <span>{cat.label}</span>
                      {cat.count > 0 && <span className={`text-xs ${isActive ? 'text-slate-500' : 'text-slate-400'}`}>{cat.count}</span>}
                    </button>
                  </div>
                  {hasSubs && isExpanded && (
                    <div className="ml-6 mt-0.5 space-y-0.5 border-l-2 border-white/10 pl-2">
                      {renderSubcategoryTree(subcats, cat.value, selectedCategory, selectedSubcategory, expandedCategories, toggleCategoryExpanded, (v) => handleSubcategoryChange(v, cat.value), 0)}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="my-4 border-t border-white/10" />

        <div className="px-3">
          <label className="flex items-center gap-3 cursor-pointer text-sm text-slate-300 hover:text-white transition-colors">
            <input type="checkbox" checked={showInStockOnly} onChange={(e) => setShowInStockOnly(e.target.checked)} className="w-4 h-4 rounded border-slate-400 bg-white text-[#2d6a3e] focus:ring-[#2d6a3e]" />
            <span>In Stock Only</span>
          </label>
        </div>

        <div className="px-2 mt-6 border-t border-white/10 pt-4">
          <button onClick={handleBackToMenu} className="flex items-center justify-center w-full px-3 py-3 text-sm font-medium text-slate-200 hover:text-white hover:bg-white/10 rounded-md transition-all duration-150">
            <ArrowLeftIcon className="h-5 w-5 mr-2" />
            <span>Other Services</span>
          </button>
        </div>
      </div>
    );
  };

  return (
    <>
      <div>
        <aside ref={sidebarRef} className={`sidebar ${isOpen ? 'open' : ''}`}>
          {isShopMode && isUKCRole ? (
            <nav className="flex flex-col h-full overflow-hidden">
              <div className="flex-1 overflow-y-auto overflow-x-hidden">
                {renderShopSidebar()}
              </div>
              <div className="flex-shrink-0 border-t border-white/10 px-3 py-3">
                <button
                  onClick={() => { toggleChat(); if (isOpen) toggleSidebar(); }}
                  className="flex items-center w-full px-3 py-2.5 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 transition-colors text-sm font-medium"
                >
                  <ChatBubbleLeftRightIcon className="h-5 w-5 mr-3 text-duotone-blue" />
                  <span>Ask Kai</span>
                  <span className="ml-auto w-2 h-2 rounded-full bg-duotone-blue animate-pulse" />
                </button>
              </div>
            </nav>
          ) : (
            <nav ref={navRef} className="flex-grow flex flex-col overflow-hidden">
              <div className="flex-1 overflow-y-auto overflow-x-hidden px-2 pt-2 pb-4 space-y-5 scrollbar scrollbar-track-transparent scrollbar-thumb-slate-600 hover:scrollbar-thumb-slate-500 sidebar-nav-scroll">

              <div>
                <ul className="mt-1 space-y-1">
                  {dynamicNavItems.filter(item => item.label !== 'Contact').map((item) => (
                    <li key={item.label}>
                      {item.isShopLink ? (
                        <div className="relative group">
                          <NavLink
                            to={item.to}
                            className={({ isActive }) => `${commonLinkClasses} ${isActive ? activeLinkClasses : ''} ${item.customStyle?.centered ? 'justify-center' : ''}`}
                            onMouseEnter={() => preloadRoute(item.to)}
                            onTouchStart={() => preloadRoute(item.to)}
                            onClick={() => {
                              setIsShopMode(true);
                              if (isOpen) toggleSidebar();
                            }}
                          >
                            {item.customStyle?.centered ? (
                              <div className="flex items-center justify-center">
                                <span style={{ color: item.customStyle.dotColor || '#2d6a3e', fontSize: '1.5rem', lineHeight: '1', marginRight: '0.25rem' }}>•</span>
                                <span style={{ color: item.customStyle.textColor, letterSpacing: '0.02em', fontSize: '1.25rem', fontWeight: 600 }}>{item.label}</span>
                              </div>
                            ) : (
                              <span className="flex items-center text-[15px] font-semibold">
                                {item.customStyle?.dotColor ? (
                                  <span style={{ color: item.customStyle.dotColor, fontSize: '1.5rem', lineHeight: '1', marginRight: '0.2rem' }}>•</span>
                                ) : (
                                  <item.icon className="h-5 w-5 mr-3" style={{ color: item.customStyle?.textColor }} />
                                )}
                                <span style={{ color: item.customStyle?.textColor, letterSpacing: '0.01em', fontFamily: '"Gotham Medium", sans-serif', fontWeight: 500, fontSize: '15px' }}>{item.label}</span>
                              </span>
                            )}
                          </NavLink>
                        </div>
                      ) : item.subItems ? (
                        <div>
                          {(() => {
                            const Component = item.isDirectLink ? NavLink : 'button';
                            const props = item.isDirectLink ? {
                              to: item.to,
                              className: ({ isActive }) => `${commonLinkClasses} w-full justify-between ${isActive || isParentActive(item) ? '!text-sky-400' : ''}`,
                              onClick: () => toggleExpanded(item.label)
                            } : {
                              onClick: () => toggleExpanded(item.label),
                              className: `${commonLinkClasses} w-full justify-between ${isParentActive(item) ? '!text-sky-400' : ''}`
                            };

                            return (
                              <Component {...props}>
                                <div className="flex items-center">
                                  {item.customStyle ? (
                                    <span className="flex items-center text-[15px] font-semibold">
                                      {item.customStyle.dotColor ? (
                                        <span style={{ color: item.customStyle.dotColor, fontSize: '1.5rem', lineHeight: '1', marginRight: '0.2rem' }}>•</span>
                                      ) : item.icon ? (
                                        <item.icon className="h-5 w-5 mr-3" style={{ color: item.customStyle.textColor }} />
                                      ) : null}
                                      <span style={{ color: item.customStyle.textColor, letterSpacing: '0.01em', fontFamily: '"Gotham Medium", sans-serif', fontWeight: 500, fontSize: '15px' }}>{item.label}</span>
                                    </span>
                                  ) : (
                                    <>
                                      <item.icon className="h-5 w-5 mr-3" />
                                      <span>{item.label}</span>
                                    </>
                                  )}
                                </div>
                                <ChevronDownIcon className={`h-4 w-4 transition-transform ${expandedItems[item.label] ? 'rotate-180' : ''}`} />
                              </Component>
                            );
                          })()}
                          {expandedItems[item.label] && (
                            <div className="mt-1 ml-2 border-l border-white/10">
                              {item.subItems.map((subItem) => {
                                const parentColor = item.customStyle?.textColor || '#94a3b8';
                                const SubItemIcon = subItem.icon ? allIconMap[subItem.icon] : null;
                                return (
                                  <NavLink key={subItem.to} to={subItem.to} end onMouseEnter={() => preloadRoute(subItem.to)} onTouchStart={() => preloadRoute(subItem.to)} onClick={() => { if (isOpen) toggleSidebar(); }} className={({ isActive }) => isActive ? subItemActiveClasses : subItemInactiveClasses}>
                                    <span className="flex items-center">
                                      {SubItemIcon ? (
                                        <SubItemIcon className="h-4 w-4 mr-2" style={{ color: subItem.iconColor || parentColor, opacity: 0.75 }} />
                                      ) : subItem.dotColor ? (
                                        <span style={{ color: subItem.dotColor, fontSize: '0.75rem', lineHeight: '1', marginRight: '0.2rem' }}>•</span>
                                      ) : (
                                        <span style={{ color: '#2d6a3e', fontSize: '0.75rem', lineHeight: '1', marginRight: '0.2rem' }}>•</span>
                                      )}
                                      <span style={{ color: subItem.dotColor || parentColor, opacity: 0.75 }}>{subItem.label}</span>
                                    </span>
                                  </NavLink>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      ) : (
                        <NavLink to={item.to} onMouseEnter={() => preloadRoute(item.to)} onTouchStart={() => preloadRoute(item.to)} className={({ isActive }) => `${commonLinkClasses} ${isActive ? activeLinkClasses : ''}`}>
                          {item.customStyle ? (
                            <span className="flex items-center text-[15px] font-semibold">
                              {item.customStyle.dotColor ? (
                                <span style={{ color: item.customStyle.dotColor, fontSize: '1.5rem', lineHeight: '1', marginRight: '0.2rem' }}>•</span>
                              ) : (
                                <item.icon className="h-5 w-5 mr-3" style={{ color: item.customStyle.textColor }} />
                              )}
                              <span style={{ color: item.customStyle.textColor, letterSpacing: '0.01em', fontFamily: '"Gotham Medium", sans-serif', fontWeight: 500, fontSize: '15px' }}>{item.label}</span>
                            </span>
                          ) : (
                            <>
                              <item.icon className="h-5 w-5 mr-3" />
                              <span>{item.label}</span>
                            </>
                          )}
                        </NavLink>
                      )}
                    </li>
                  ))}
                </ul>
              </div>

              <div>
                {dynamicSystemItems.length > 0 && <span className={groupLabelClasses}>System</span>}
                <ul className="mt-1 space-y-1">
                  {dynamicSystemItems.map((item) => (
                    <li key={item.label}>
                      {item.subItems ? (
                        <div>
                          {(() => {
                            const Component = item.isDirectLink ? NavLink : 'button';
                            const props = item.isDirectLink ? {
                              to: item.to,
                              className: ({ isActive }) => `${commonLinkClasses} w-full justify-between ${isActive || isParentActive(item) ? '!text-sky-400' : ''}`,
                              onClick: () => toggleExpanded(item.label)
                            } : {
                              onClick: () => toggleExpanded(item.label),
                              className: `${commonLinkClasses} w-full justify-between ${isParentActive(item) ? '!text-sky-400' : ''}`
                            };

                            return (
                              <Component {...props}>
                                <div className="flex items-center">
                                  {item.customStyle ? (
                                    <span className="flex items-center text-[15px] font-semibold">
                                      {item.customStyle.dotColor ? (
                                        <span style={{ color: item.customStyle.dotColor, fontSize: '1.5rem', lineHeight: '1', marginRight: '0.2rem' }}>•</span>
                                      ) : (
                                        <item.icon className="h-5 w-5 mr-3" style={{ color: item.customStyle.textColor }} />
                                      )}
                                      <span style={{ color: item.customStyle.textColor, letterSpacing: '0.01em', fontFamily: '"Gotham Medium", sans-serif', fontWeight: 500, fontSize: '15px' }}>{item.label}</span>
                                    </span>
                                  ) : (
                                    <>
                                      <item.icon className="h-5 w-5 mr-3" />
                                      <span>{item.label}</span>
                                    </>
                                  )}
                                </div>
                                <ChevronDownIcon className={`h-4 w-4 transition-transform ${expandedItems[item.label] ? 'rotate-180' : ''}`} />
                              </Component>
                            );
                          })()}
                          {expandedItems[item.label] && (
                            <div className="mt-1 ml-2 border-l border-white/10">
                              {item.subItems.map((subItem) => {
                                const parentColor = item.customStyle?.textColor || '#94a3b8';
                                const SubItemIcon = subItem.icon ? allIconMap[subItem.icon] : null;
                                return (
                                  <NavLink key={subItem.to} to={subItem.to} end onMouseEnter={() => preloadRoute(subItem.to)} onTouchStart={() => preloadRoute(subItem.to)} onClick={() => { if (isOpen) toggleSidebar(); }} className={({ isActive }) => isActive ? subItemActiveClasses : subItemInactiveClasses}>
                                    <span className="flex items-center">
                                      {SubItemIcon ? (
                                        <SubItemIcon className="h-4 w-4 mr-2" style={{ color: subItem.iconColor || parentColor, opacity: 0.75 }} />
                                      ) : subItem.dotColor ? (
                                        <span style={{ color: subItem.dotColor, fontSize: '0.75rem', lineHeight: '1', marginRight: '0.2rem' }}>•</span>
                                      ) : (
                                        <span style={{ color: '#2d6a3e', fontSize: '0.75rem', lineHeight: '1', marginRight: '0.2rem' }}>•</span>
                                      )}
                                      <span style={{ color: subItem.dotColor || parentColor, opacity: 0.75 }}>{subItem.label}</span>
                                    </span>
                                  </NavLink>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      ) : (
                        <NavLink to={item.to} onMouseEnter={() => preloadRoute(item.to)} onTouchStart={() => preloadRoute(item.to)} className={({ isActive }) => `${commonLinkClasses} ${isActive ? activeLinkClasses : ''}`}>
                          {item.customStyle ? (
                            <span className="flex items-center text-[15px] font-semibold">
                              {item.customStyle.dotColor ? (
                                <span style={{ color: item.customStyle.dotColor, fontSize: '1.5rem', lineHeight: '1', marginRight: '0.2rem' }}>•</span>
                              ) : (
                                <item.icon className="h-5 w-5 mr-3" style={{ color: item.customStyle.textColor }} />
                              )}
                              <span style={{ color: item.customStyle.textColor, letterSpacing: '0.01em', fontFamily: '"Gotham Medium", sans-serif', fontWeight: 500, fontSize: '15px' }}>{item.label}</span>
                            </span>
                          ) : (
                            <>
                              <item.icon className="h-5 w-5 mr-3" />
                              <span>{item.label}</span>
                            </>
                          )}
                        </NavLink>
                      )}
                    </li>
                  ))}
                  <li>
                    {isGuest ? (
                      <button onClick={() => openAuthModal({ title: 'Sign In', message: 'Sign in to access features', returnUrl: location.pathname })} className={`${commonLinkClasses} w-full text-left font-duotone-bold`} style={{ background: '#4b4f54', color: '#00a8c4', border: '1px solid rgba(0,168,196,0.5)' }}>
                        <ArrowLeftOnRectangleIcon className="h-5 w-5 mr-3" />
                        <span>Sign In</span>
                      </button>
                    ) : (
                      <button onClick={showLogoutConfirmation} className={`${commonLinkClasses} w-full text-left`}>
                        <ArrowRightOnRectangleIcon className="h-5 w-5 mr-3" />
                        <span>Logout</span>
                      </button>
                    )}
                  </li>
                </ul>
              </div>

              <div className="mt-auto pt-3 border-t border-white/10">
                {/* Contact - styled exactly like others but kept at bottom */}
                {dynamicNavItems.find(i => i.label === 'Contact') && (() => {
                  const contactItem = dynamicNavItems.find(i => i.label === 'Contact');
                  return (
                    <NavLink
                      to={contactItem.to}
                      onMouseEnter={() => preloadRoute(contactItem.to)}
                      onTouchStart={() => preloadRoute(contactItem.to)}
                      className={({ isActive }) => `${commonLinkClasses} w-full mb-1 ${isActive ? activeLinkClasses : ''}`}
                    >
                      <span className="flex items-center text-[15px] font-semibold">
                        {contactItem.customStyle?.dotColor ? (
                          <span style={{ color: contactItem.customStyle.dotColor, fontSize: '1.5rem', lineHeight: '1', marginRight: '0.2rem' }}>•</span>
                        ) : (
                          <contactItem.icon className="h-5 w-5 mr-3" style={{ color: contactItem.customStyle?.textColor }} />
                        )}
                        <span style={{ color: contactItem.customStyle?.textColor, letterSpacing: '0.01em', fontFamily: '"Gotham Medium", sans-serif', fontWeight: 500, fontSize: '15px' }}>{contactItem.label}</span>
                      </span>
                    </NavLink>
                  );
                })()}
                <span className={groupLabelClasses}>Payment Methods</span>
                <ul className="mt-1 space-y-1">
                  <li>
                    <button onClick={() => { window.dispatchEvent(new Event('wallet:deposit')); if (isOpen) toggleSidebar(); }} className={`${commonLinkClasses} w-full text-left`}>
                      <CreditCardIcon className="h-5 w-5 mr-3" />
                      <span>Credit Card</span>
                    </button>
                  </li>
                  <li>
                    <button onClick={() => { window.dispatchEvent(new Event('wallet:bank-transfer')); if (isOpen) toggleSidebar(); }} className={`${commonLinkClasses} w-full text-left`}>
                      <BuildingLibraryIcon className="h-5 w-5 mr-3" />
                      <span>Bank Transfer</span>
                    </button>
                  </li>
                </ul>
              </div>
              </div>
              <div className="flex-shrink-0 border-t border-white/10 px-3 py-3">
                <button
                  onClick={() => { toggleChat(); if (isOpen) toggleSidebar(); }}
                  className="flex items-center w-full px-3 py-2.5 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 transition-colors text-sm font-medium"
                >
                  <ChatBubbleLeftRightIcon className="h-5 w-5 mr-3 text-duotone-blue" />
                  <span>Ask Kai</span>
                  <span className="ml-auto w-2 h-2 rounded-full bg-duotone-blue animate-pulse" />
                </button>
              </div>
            </nav>
          )}
        </aside>
      </div>

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