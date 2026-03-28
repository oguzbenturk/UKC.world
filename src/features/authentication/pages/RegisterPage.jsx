// src/features/authentication/pages/RegisterPage.jsx
// Standalone register page – renders the RegisterModal auto-opened on a minimal background.
// When the modal is closed, navigates back to /guest (or the returnUrl from location state).

import { useState, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { usePageSEO } from '@/shared/utils/seo';
import RegisterModal from '../components/RegisterModal';

const RegisterPage = () => {
  usePageSEO({
    title: 'Create Account | UKC.',
    description: 'Create a new account at Duotone Pro Center Urla to access lessons, rentals, and more.',
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
    const destination = localStorage.getItem('token') ? '/dashboard' : returnUrl;
    navigate(destination, { replace: true });
  }, [navigate, returnUrl]);

  return (
    <div className="min-h-screen bg-[#0f1013] flex items-center justify-center p-4 py-12 relative overflow-hidden">
      {/* Background blobs for consistency */}
      <div className="absolute top-0 -left-4 w-72 h-72 bg-duotone-blue/10 rounded-full mix-blend-multiply filter blur-3xl opacity-30 animate-blob"></div>
      <div className="absolute -bottom-8 right-20 w-72 h-72 bg-antrasit/20 rounded-full mix-blend-multiply filter blur-3xl opacity-30 animate-blob animation-delay-4000"></div>

      <div className="w-full max-w-lg relative z-10">
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
