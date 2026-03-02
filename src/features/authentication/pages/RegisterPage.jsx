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
    // After successful registration the user is typically logged in;
    // navigate to the guest landing or wherever they came from.
    navigate(returnUrl, { replace: true });
  }, [navigate, returnUrl]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 flex items-center justify-center">
      <RegisterModal
        visible={visible}
        onClose={handleClose}
        onSuccess={handleSuccess}
      />
    </div>
  );
};

export default RegisterPage;
