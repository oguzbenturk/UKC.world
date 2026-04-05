import React, { useState, useEffect } from 'react';
import { CheckCircleIcon, XCircleIcon, InformationCircleIcon, ExclamationTriangleIcon, XMarkIcon } from '@heroicons/react/24/outline';

/**
 * Toast notification component for showing brief success/error messages
 * 
 * @param {Object} props - Component props
 * @param {string} props.type - Type of toast: 'success', 'error', 'info', 'warning'
 * @param {string} props.message - Message to display
 * @param {number} props.duration - How long to show the toast (ms)
 * @param {Function} props.onClose - Function called when toast is closed
 * @param {boolean} props.isVisible - Whether the toast is visible
 * @returns {JSX.Element} Toast component
 */
const Toast = ({ 
  type = 'success', 
  message, 
  duration = 4000, 
  onClose, 
  isVisible = true 
}) => {
  const [show, setShow] = useState(isVisible);

  useEffect(() => {
    setShow(isVisible);
  }, [isVisible]);

  useEffect(() => {
    if (show && duration > 0) {
      const timer = setTimeout(() => {
        handleClose();
      }, duration);

      return () => clearTimeout(timer);
    }
  }, [show, duration]);

  const handleClose = () => {
    setShow(false);
    setTimeout(() => {
      if (onClose) onClose();
    }, 300); // Wait for animation to complete
  };

  const getIcon = () => {
    switch (type) {
      case 'success':
        return <CheckCircleIcon className="h-5 w-5 text-green-400" />;
      case 'error':
        return <XCircleIcon className="h-5 w-5 text-red-400" />;
      case 'warning':
        return <ExclamationTriangleIcon className="h-5 w-5 text-yellow-400" />;
      case 'info':
        return <InformationCircleIcon className="h-5 w-5 text-blue-400" />;
      default:
        return <CheckCircleIcon className="h-5 w-5 text-green-400" />;
    }
  };

  const getStyles = () => {
    const baseStyles = "flex items-center w-full max-w-sm p-4 mb-4 text-sm rounded-lg shadow-lg border";
    
    switch (type) {
      case 'success':
        return `${baseStyles} text-green-800 bg-green-50 border-green-200`;
      case 'error':
        return `${baseStyles} text-red-800 bg-red-50 border-red-200`;
      case 'warning':
        return `${baseStyles} text-yellow-800 bg-yellow-50 border-yellow-200`;
      case 'info':
        return `${baseStyles} text-blue-800 bg-blue-50 border-blue-200`;
      default:
        return `${baseStyles} text-green-800 bg-green-50 border-green-200`;
    }
  };

  if (!show) return null;

  return (
    <div className={`
      ${getStyles()}
      transform transition-all duration-300 ease-in-out
      ${show ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-0'}
    `}>
      <div className="inline-flex items-center justify-center flex-shrink-0 w-8 h-8 rounded-lg">
        {getIcon()}
      </div>
      <div className="ml-3 text-sm font-medium flex-1">
        {message}
      </div>
      <button
        type="button"
        className="ml-auto -mx-1.5 -my-1.5 rounded-lg p-1.5 hover:bg-gray-100 inline-flex h-8 w-8 items-center justify-center"
        onClick={handleClose}
        aria-label="Close"
      >
        <XMarkIcon className="w-3 h-3" />
      </button>
    </div>
  );
};

export default Toast;
