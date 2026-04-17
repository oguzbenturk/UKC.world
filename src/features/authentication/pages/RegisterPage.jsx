// src/features/authentication/pages/RegisterPage.jsx
// Standalone register page – renders the RegisterModal auto-opened on a minimal background.
// When the modal is closed, navigates back to /guest (or the returnUrl from location state).

import { useState, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { usePageSEO } from '@/shared/utils/seo';
import RegisterModal from '../components/RegisterModal';

const RegisterPage = () => {
  usePageSEO({
    title: 'Create Account | UKC•',
    description: 'Create your Plannivo account to access lessons, rentals, and more.',
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
      <div className="absolute top-0 -left-4 w-96 h-96 opacity-40 animate-blob pointer-events-none" style={{ background: 'radial-gradient(circle, rgba(30,58,138,0.2) 0%, rgba(30,58,138,0) 70%)' }}></div>
      <div className="absolute -bottom-8 right-20 w-96 h-96 opacity-40 animate-blob animation-delay-4000 pointer-events-none" style={{ background: 'radial-gradient(circle, rgba(75,79,84,0.3) 0%, rgba(75,79,84,0) 70%)' }}></div>

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
