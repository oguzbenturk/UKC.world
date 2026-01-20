import React, { createContext, useContext, useState, useCallback } from 'react';
import Toast from '../components/Toast';

const ToastContext = createContext();

/**
 * Hook to use toast notifications
 */
export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
};

/**
 * Toast provider component that manages toast notifications
 */
export const ToastProvider = ({ children }) => {
  const [toasts, setToasts] = useState([]);

  /**
   * Show a new toast notification
   * @param {string} message - Message to display
   * @param {string} type - Type of toast: 'success', 'error', 'info', 'warning'
   * @param {number} duration - How long to show the toast (ms)
   */
  const showToast = useCallback((message, type = 'success', duration = 4000) => {
    const id = Date.now() + Math.random();
    const newToast = {
      id,
      message,
      type,
      duration
    };

    setToasts(current => [...current, newToast]);
  }, []);

  /**
   * Remove a specific toast
   * @param {string|number} id - ID of the toast to remove
   */
  const removeToast = useCallback((id) => {
    setToasts(current => current.filter(toast => toast.id !== id));
  }, []);

  /**
   * Show success toast
   * @param {string} message - Success message
   */
  const showSuccess = useCallback((message) => {
    showToast(message, 'success');
  }, [showToast]);

  /**
   * Show error toast
   * @param {string} message - Error message
   */
  const showError = useCallback((message) => {
    showToast(message, 'error');
  }, [showToast]);

  /**
   * Show info toast
   * @param {string} message - Info message
   */
  const showInfo = useCallback((message) => {
    showToast(message, 'info');
  }, [showToast]);

  /**
   * Show warning toast
   * @param {string} message - Warning message
   */
  const showWarning = useCallback((message) => {
    showToast(message, 'warning');
  }, [showToast]);

  const value = {
    showToast,
    showSuccess,
    showError,
    showInfo,
    showWarning,
    removeToast
  };

  return (
    <ToastContext.Provider value={value}>
      {children}
      
      {/* Toast container - positioned at top right */}
      <div className="fixed top-4 right-4 z-50 space-y-2">
        {toasts.map((toast) => (
          <Toast
            key={toast.id}
            type={toast.type}
            message={toast.message}
            duration={toast.duration}
            onClose={() => removeToast(toast.id)}
            isVisible={true}
          />
        ))}
      </div>
    </ToastContext.Provider>
  );
};
