// src/features/authentication/pages/RegisterPage.jsx
// Standalone register page – renders the RegisterModal auto-opened on a minimal background.
// When the modal is closed, navigates back to /guest (or the returnUrl from location state).

import { useState, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { usePageSEO } from '@/shared/utils/seo';
import RegisterModal from '../components/RegisterModal';

const RegisterPage = () => {
  usePageSEO({
    title: 'Create Account | Plannivo',
    description: 'Create a new account to access lessons, rentals, and more.',
    path: '/register',
  });

  const navigate = useNavigate();
  const location = useLocation();
  const [visible, setVisible] = useState(true);

  const returnUrl = location.state?.returnUrl || '/guest';

  const handleClose = useCallback(() => {
    setVisible(false);
    navigate(returnUrl, { replace: true });
  }, [navigate, returnUrl]);

  const handleSuccess = useCallback(() => {
    setVisible(false);
    // If auto-login succeeded, token is already in localStorage synchronously
    const destination = localStorage.getItem('token') ? '/dashboard' : returnUrl;
    navigate(destination, { replace: true });
  }, [navigate, returnUrl]);

  return (
    <div style={{ minHeight: '100vh', background: '#0f172a', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 16px' }}>
        <div style={{ width: '100%', maxWidth: 480, boxShadow: '0 25px 80px rgba(0,0,0,0.6)', borderRadius: 16, overflow: 'hidden' }}>
        <RegisterModal
          visible={visible}
          inline={true}
          onClose={handleClose}
          onSuccess={handleSuccess}
        />
      </div>
    </div>
  );
};

export default RegisterPage;
