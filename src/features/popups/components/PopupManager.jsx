import { useState, useEffect, useCallback } from 'react';
import PopupDisplay from './PopupDisplay';

const PopupManager = ({ user, currentPath }) => {
  const [activePopup, setActivePopup] = useState(null);
  const [shownPopups, setShownPopups] = useState(new Set());

  const checkAudienceMatch = (general, targeting, user) => {
    // Check target audience
    if (general.targetAudience && general.targetAudience !== 'all_users') {
      if (general.targetAudience === 'new_users' && user?.loginCount > 5) return false;
      if (general.targetAudience !== 'all_users' && user?.role !== general.targetAudience) return false;
    }

    // Check user roles
    if (targeting.userRoles && targeting.userRoles.length > 0) {
      if (!targeting.userRoles.includes(user?.role)) return false;
    }

    return true;
  };

  // eslint-disable-next-line complexity
  const checkUserConditions = (targeting, user) => {
    // Check login count conditions
    if (targeting.loginCount && targeting.loginCount !== 'any') {
      const loginCount = user?.loginCount || 0;
      if (targeting.loginCount === 'first' && loginCount !== 1) return false;
      if (targeting.loginCount === '<=5' && loginCount > 5) return false;
      if (targeting.loginCount === '>=10' && loginCount < 10) return false;
    }

    // Check registration days
    if (targeting.registrationDays && targeting.registrationDays !== 'any' && user?.createdAt) {
      const daysSinceReg = Math.floor((Date.now() - new Date(user.createdAt)) / (1000 * 60 * 60 * 24));
      if (targeting.registrationDays === '0' && daysSinceReg > 0) return false;
      if (targeting.registrationDays === '<=7' && daysSinceReg > 7) return false;
      if (targeting.registrationDays === '<=30' && daysSinceReg > 30) return false;
      if (targeting.registrationDays === '>=30' && daysSinceReg < 30) return false;
    }

    return true;
  };

  // eslint-disable-next-line complexity
  const checkTimeConditions = (targeting) => {
    // Check time of day
    if (targeting.timeOfDay && targeting.timeOfDay.length > 0) {
      const hour = new Date().getHours();
      const currentPeriod = 
        hour >= 6 && hour < 12 ? 'morning' :
        hour >= 12 && hour < 18 ? 'afternoon' :
        hour >= 18 && hour < 24 ? 'evening' : 'night';
      
      if (!targeting.timeOfDay.includes(currentPeriod)) return false;
    }

    // Check weekdays
    if (targeting.weekdays && targeting.weekdays.length > 0) {
      const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
      const currentDay = days[new Date().getDay()];
      if (!targeting.weekdays.includes(currentDay)) return false;
    }

    // Check date range
    if (targeting.startDate) {
      const startDate = new Date(targeting.startDate);
      if (Date.now() < startDate.getTime()) return false;
    }

    if (targeting.endDate) {
      const endDate = new Date(targeting.endDate);
      if (Date.now() > endDate.getTime()) return false;
    }

    return true;
  };

  const checkDeviceAndPageConditions = (general, targeting, currentPath) => {
    // Check pages
    if (general.pages && general.pages.length > 0) {
      if (!general.pages.includes(currentPath)) return false;
    }

    // Check device type
    if (targeting.deviceType && targeting.deviceType.length > 0) {
      const isMobile = window.innerWidth <= 768;
      const isTablet = window.innerWidth > 768 && window.innerWidth <= 1024;
      
      const currentDevice = isMobile ? 'mobile' : isTablet ? 'tablet' : 'desktop';
      if (!targeting.deviceType.includes(currentDevice)) return false;
    }

    return true;
  };

  const shouldShowPopup = useCallback((popup) => {
    const config = popup.config || {};
    const general = config.general || {};
    const targeting = config.targeting || {};

    // Check if popup is enabled
    if (!popup.enabled) return false;

    // Check all conditions
    return checkAudienceMatch(general, targeting, user) &&
           checkUserConditions(targeting, user) &&
           checkTimeConditions(targeting) &&
           checkDeviceAndPageConditions(general, targeting, currentPath);
  }, [user, currentPath]);

  const checkPopupConditions = useCallback(async () => {
    try {
      const response = await fetch('/api/popups/check', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          currentPath,
          userAgent: navigator.userAgent,
          screenWidth: window.innerWidth,
          timeOfDay: new Date().getHours(),
          dayOfWeek: new Date().getDay()
        })
      });

      if (response.ok) {
        const eligiblePopups = await response.json();
        
        // Find first popup that hasn't been shown yet
        const popupToShow = eligiblePopups.find(popup => 
          !shownPopups.has(popup.id) && shouldShowPopup(popup)
        );

        if (popupToShow) {
          setActivePopup(popupToShow);
          setShownPopups(prev => new Set([...prev, popupToShow.id]));
        }
      } else {
        // Log the error for debugging in development
        if (process.env.NODE_ENV === 'development') {
          const errorText = await response.text();
          // eslint-disable-next-line no-console
          console.warn('Popup check failed:', response.status, errorText);
        }
      }
    } catch (error) {
      // Log the error for debugging in development
      if (process.env.NODE_ENV === 'development') {
        // eslint-disable-next-line no-console
        console.warn('Popup check error:', error);
      }
    }
  }, [currentPath, shownPopups, shouldShowPopup]);

  const handlePopupAction = async (action, data) => {
    if (action === 'primary' || action === 'secondary') {
      const buttonData = data;
      
      if (buttonData.action === 'redirect' && buttonData.url) {
        if (buttonData.url.startsWith('http')) {
          window.open(buttonData.url, '_blank');
        } else {
          window.location.href = buttonData.url;
        }
      } else if (buttonData.action === 'external' && buttonData.url) {
        window.open(buttonData.url, '_blank');
      }
    }
    
    if (action !== 'social') {
      setActivePopup(null);
    }
  };

  const handlePopupClose = () => {
    setActivePopup(null);
  };

  useEffect(() => {
    if (user && currentPath) {
      // Add delay for better UX
      const delay = activePopup?.config?.targeting?.delaySeconds || 2;
      const timer = setTimeout(checkPopupConditions, delay * 1000);
      
      return () => clearTimeout(timer);
    }
  }, [user, currentPath, checkPopupConditions, activePopup]);

  // Auto-close popup if configured
  useEffect(() => {
    if (activePopup?.config?.general?.autoClose) {
      const timer = setTimeout(() => {
        setActivePopup(null);
      }, activePopup.config.general.autoClose * 1000);
      
      return () => clearTimeout(timer);
    }
  }, [activePopup]);

  return (
    <PopupDisplay
      popup={activePopup}
      visible={!!activePopup}
      onClose={handlePopupClose}
      onAction={handlePopupAction}
    />
  );
};

export default PopupManager;
