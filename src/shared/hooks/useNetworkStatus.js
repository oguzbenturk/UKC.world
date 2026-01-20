import { useEffect, useState } from 'react';

const readNavigatorStatus = () => {
  if (typeof navigator === 'undefined') {
    return {
      isOnline: true,
      effectiveType: undefined,
    };
  }

  const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  return {
    isOnline: navigator.onLine !== false,
    effectiveType: connection?.effectiveType,
  };
};

/**
 * Track the browser's network connectivity status.
 * Emits online/offline changes and the last change timestamp to power UI banners.
 */
const useNetworkStatus = () => {
  const initialStatus = readNavigatorStatus();
  const [status, setStatus] = useState({
    ...initialStatus,
    lastChangedAt: new Date(),
  });

  useEffect(() => {
    const updateStatus = (isOnlineOverride) => {
      const next = readNavigatorStatus();
      setStatus({
        ...next,
        isOnline: typeof isOnlineOverride === 'boolean' ? isOnlineOverride : next.isOnline,
        lastChangedAt: new Date(),
      });
    };

    const handleOnline = () => updateStatus(true);
    const handleOffline = () => updateStatus(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    const connection = typeof navigator !== 'undefined'
      ? navigator.connection || navigator.mozConnection || navigator.webkitConnection
      : undefined;

    const handleConnectionChange = () => updateStatus();
    if (connection?.addEventListener) {
      connection.addEventListener('change', handleConnectionChange);
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      if (connection?.removeEventListener) {
        connection.removeEventListener('change', handleConnectionChange);
      }
    };
  }, []);

  return status;
};

export default useNetworkStatus;
