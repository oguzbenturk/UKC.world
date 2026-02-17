// src/shared/contexts/AuthModalContext.jsx
import { createContext, useState, useContext, useCallback } from 'react';

const AuthModalContext = createContext(null);

export const useAuthModal = () => {
  const context = useContext(AuthModalContext);
  if (!context) {
    throw new Error('useAuthModal must be used within AuthModalProvider');
  }
  return context;
};

export function AuthModalProvider({ children }) {
  const [isOpen, setIsOpen] = useState(false);
  const [modalConfig, setModalConfig] = useState({
    title: 'Sign In Required',
    message: 'Please sign in to continue',
    returnUrl: null,
    mode: 'signin' // 'signin' or 'register'
  });

  const openAuthModal = useCallback((config = {}) => {
    setModalConfig({
      title: config.title || 'Sign In Required',
      message: config.message || 'Please sign in to continue',
      returnUrl: config.returnUrl || null,
      mode: config.mode || 'signin'
    });
    setIsOpen(true);
  }, []);

  const closeAuthModal = useCallback(() => {
    setIsOpen(false);
  }, []);

  const value = {
    isOpen,
    openAuthModal,
    closeAuthModal,
    modalConfig
  };

  return (
    <AuthModalContext.Provider value={value}>
      {children}
    </AuthModalContext.Provider>
  );
}
