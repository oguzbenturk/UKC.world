import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Spin } from 'antd';
import { CheckCircleOutlined, CloseCircleOutlined, MailOutlined } from '@ant-design/icons';
import apiClient from '@/shared/services/apiClient';

import dpcLogo from '../../../../DuotoneFonts/DPSLOGOS/DPC-transparant-white.svg';

const Logo = () => (
  <div className="flex items-center justify-center gap-2 mb-6">
    <img src={dpcLogo} alt="UKC•" style={{ height: '50px', objectFit: 'contain' }} />
  </div>
);

const VerifyEmail = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const email = searchParams.get('email');

  const [status, setStatus] = useState('verifying'); // verifying | success | already-verified | expired | invalid
  const [errorMessage, setErrorMessage] = useState('');
  const [resending, setResending] = useState(false);
  const [resendSent, setResendSent] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const verify = async () => {
      if (!token || !email) {
        setStatus('invalid');
        setErrorMessage('Verification link is missing required information.');
        return;
      }

      try {
        const response = await apiClient.post('/auth/verify-email', { token, email });
        if (cancelled) return;

        if (response.data?.success) {
          setStatus(response.data.alreadyVerified ? 'already-verified' : 'success');
        } else {
          setStatus(response.data?.expired ? 'expired' : 'invalid');
          setErrorMessage(response.data?.error || 'Verification failed.');
        }
      } catch (err) {
        if (cancelled) return;
        const data = err.response?.data;
        if (data?.expired) {
          setStatus('expired');
        } else {
          setStatus('invalid');
        }
        setErrorMessage(data?.error || 'Verification failed. Please try again.');
      }
    };

    verify();
    return () => { cancelled = true; };
  }, [token, email]);

  const handleResend = async () => {
    if (!email) return;
    setResending(true);
    try {
      await apiClient.post('/auth/resend-verification', { email });
      setResendSent(true);
    } catch {
      setResendSent(true); // generic response either way
    } finally {
      setResending(false);
    }
  };

  const goToLogin = () => navigate('/login');

  return (
    <div className="min-h-screen bg-[#0f1013] flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-10 sm:p-12 text-center shadow-2xl">
        <Logo />

        {status === 'verifying' && (
          <>
            <Spin size="large" />
            <p className="font-duotone-regular mt-6 text-gray-400">Verifying your email…</p>
          </>
        )}

        {status === 'success' && (
          <>
            <div className="w-20 h-20 mx-auto mb-6 bg-white/5 rounded-2xl flex items-center justify-center border border-white/10 text-green-400 shadow-inner">
              <CheckCircleOutlined className="text-4xl" />
            </div>
            <h2 className="font-duotone-bold-extended text-2xl text-white mb-4 uppercase tracking-tight">Email Verified</h2>
            <p className="font-duotone-regular text-gray-400 mb-8">
              Your email has been verified. You can now sign in to your account.
            </p>
            <button
              onClick={goToLogin}
              className="w-full font-duotone-bold bg-white text-antrasit py-4 rounded-xl hover:bg-gray-100 transition-all tracking-widest text-sm shadow-lg"
            >
              Continue to login
            </button>
          </>
        )}

        {status === 'already-verified' && (
          <>
            <div className="w-20 h-20 mx-auto mb-6 bg-white/5 rounded-2xl flex items-center justify-center border border-white/10 text-green-400 shadow-inner">
              <CheckCircleOutlined className="text-4xl" />
            </div>
            <h2 className="font-duotone-bold-extended text-2xl text-white mb-4 uppercase tracking-tight">Already Verified</h2>
            <p className="font-duotone-regular text-gray-400 mb-8">
              This account is already verified. Go ahead and sign in.
            </p>
            <button
              onClick={goToLogin}
              className="w-full font-duotone-bold bg-white text-antrasit py-4 rounded-xl hover:bg-gray-100 transition-all tracking-widest text-sm shadow-lg"
            >
              Continue to login
            </button>
          </>
        )}

        {(status === 'expired' || status === 'invalid') && (
          <>
            <div className="w-20 h-20 mx-auto mb-6 bg-white/5 rounded-2xl flex items-center justify-center border border-white/10 text-red-400 shadow-inner">
              <CloseCircleOutlined className="text-4xl" />
            </div>
            <h2 className="font-duotone-bold-extended text-2xl text-white mb-4 uppercase tracking-tight">
              {status === 'expired' ? 'Link Expired' : 'Verification Failed'}
            </h2>
            <p className="font-duotone-regular text-gray-400 mb-6">
              {errorMessage || 'We couldn’t verify your email with this link.'}
            </p>

            {resendSent ? (
              <div className="bg-white/5 border border-white/10 rounded-2xl p-4 text-left mb-6">
                <p className="font-duotone-regular text-xs text-duotone-blue leading-relaxed m-0 flex items-start gap-2">
                  <MailOutlined className="mt-0.5" />
                  If an account exists with this email, a new verification link has been sent. Please check your inbox.
                </p>
              </div>
            ) : (
              email && (
                <button
                  onClick={handleResend}
                  disabled={resending}
                  className="w-full font-duotone-bold bg-duotone-blue text-antrasit py-4 rounded-xl hover:bg-white transition-all tracking-widest text-sm shadow-lg shadow-duotone-blue/20 disabled:opacity-50 mb-4"
                >
                  {resending ? 'Sending…' : 'Send a new verification link'}
                </button>
              )
            )}

            <button
              onClick={goToLogin}
              className="w-full font-duotone-bold text-gray-500 hover:text-white transition-colors tracking-widest text-xs"
            >
              Return to login
            </button>
          </>
        )}
      </div>
    </div>
  );
};

export default VerifyEmail;
