/**
 * IyzicoCheckout Component
 * Opens Iyzico's hosted payment page and verifies completion via:
 * 1. Socket.IO real-time event (instant — when server callback fires)
 * 2. Status polling (fallback — every 3s after user clicks "I've Completed Payment")
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { Modal, App } from 'antd';
import apiClient from '@/shared/services/apiClient';
import { useRealTimeSync } from '@/shared/hooks/useRealTime';

// How often to poll deposit status (ms)
const POLL_INTERVAL = 3000;
// Max time before we consider the session expired (25 min)
const SESSION_TIMEOUT = 25 * 60 * 1000;

export function IyzicoCheckout({
  visible,
  paymentPageUrl,
  depositId,
  onClose,
  onSuccess,
  onError
}) {
  const { message } = App.useApp();
  const [windowOpened, setWindowOpened] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [expired, setExpired] = useState(false);
  const pollRef = useRef(null);
  const resolvedRef = useRef(false); // prevent double-fire from socket + poll race

  // Reset on visibility change
  useEffect(() => {
    if (visible) {
      resolvedRef.current = false;
      setExpired(false);
      setWindowOpened(false);
      setVerifying(false);
    }
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [visible]);

  // Session expiration timer
  useEffect(() => {
    if (!visible) return;
    const timer = setTimeout(() => {
      setExpired(true);
      if (pollRef.current) clearInterval(pollRef.current);
    }, SESSION_TIMEOUT);
    return () => clearTimeout(timer);
  }, [visible]);

  // ── Socket.IO: auto-detect payment completion (instant) ──
  const handleSocketApproved = useCallback((data) => {
    // Only react if this event matches our deposit
    if (!visible || !depositId || resolvedRef.current) return;
    if (data?.depositId && data.depositId !== depositId) return;

    resolvedRef.current = true;
    if (pollRef.current) clearInterval(pollRef.current);
    setVerifying(false);
    onSuccess?.(data);
  }, [visible, depositId, onSuccess]);

  useRealTimeSync('wallet:deposit_approved', handleSocketApproved);

  // Open payment in new tab
  const handleOpenPayment = useCallback(() => {
    if (expired) {
      onError?.('Payment session expired. Please start a new deposit.');
      return;
    }
    if (paymentPageUrl) {
      window.open(paymentPageUrl, '_blank');
      setWindowOpened(true);
    } else {
      onError?.('Payment URL not available');
    }
  }, [paymentPageUrl, onError, expired]);

  // Poll deposit status (fallback for when socket doesn't fire)
  const pollDepositStatus = useCallback(async () => {
    if (!depositId || resolvedRef.current) return;

    setVerifying(true);
    let attempts = 0;
    const maxAttempts = 20; // ~60 seconds

    if (pollRef.current) clearInterval(pollRef.current);

    pollRef.current = setInterval(async () => {
      if (resolvedRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
        return;
      }
      attempts++;
      try {
        const res = await apiClient.get(`/wallet/deposits/${depositId}/status`);
        const data = res.data;

        if (data?.status === 'completed') {
          clearInterval(pollRef.current);
          pollRef.current = null;
          if (!resolvedRef.current) {
            resolvedRef.current = true;
            setVerifying(false);
            onSuccess?.(data);
          }
          return;
        }

        if (data?.status === 'failed' || data?.status === 'rejected' || data?.status === 'cancelled') {
          clearInterval(pollRef.current);
          pollRef.current = null;
          if (!resolvedRef.current) {
            resolvedRef.current = true;
            setVerifying(false);
            onError?.(data?.failureReason || 'Payment was not successful. No funds were charged.');
          }
          return;
        }

        if (attempts >= maxAttempts) {
          clearInterval(pollRef.current);
          pollRef.current = null;
          setVerifying(false);
          message.info('Payment is still being processed. Your wallet will be updated once confirmed.');
          onClose?.();
        }
      } catch {
        if (attempts >= maxAttempts) {
          clearInterval(pollRef.current);
          pollRef.current = null;
          setVerifying(false);
          message.info('Could not confirm payment. Your wallet will be updated once processing completes.');
          onClose?.();
        }
      }
    }, POLL_INTERVAL);
  }, [depositId, onSuccess, onError, onClose, message]);

  // "I've Completed Payment" → start polling as backup to socket
  const handlePaymentCompleted = useCallback(() => {
    setWindowOpened(false);
    pollDepositStatus();
  }, [pollDepositStatus]);

  // Close handler
  const handleClose = useCallback(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    setWindowOpened(false);
    setVerifying(false);
    onClose?.();
  }, [onClose]);

  if (!visible) return null;

  return (
    <Modal
      open={visible}
      onCancel={handleClose}
      footer={null}
      closable={false}
      width={400}
      centered
      maskClosable={false}
      styles={{
        body: { padding: 0 },
        content: {
          padding: 0,
          borderRadius: 16,
          overflow: 'hidden',
          boxShadow: '0 20px 60px rgba(0,0,0,0.12), 0 4px 16px rgba(0,0,0,0.04)',
        },
        mask: { backdropFilter: 'blur(6px)', background: 'rgba(0,0,0,0.2)' },
      }}
    >
      {/* Header */}
      <div className="relative bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 px-5 pt-4 pb-4">
        <button
          type="button"
          onClick={handleClose}
          className="absolute top-3 right-3 flex h-7 w-7 items-center justify-center rounded-full bg-white/10 text-white/60 transition hover:bg-white/20 hover:text-white cursor-pointer"
          aria-label="Close"
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="h-3.5 w-3.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
          </svg>
        </button>
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/10 backdrop-blur-sm">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="h-4.5 w-4.5 text-white">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z" />
            </svg>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white leading-tight">Secure Payment</h3>
            <p className="text-[10px] text-white/50 mt-0.5">iyzico · 256-bit SSL</p>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="px-5 py-6">
        {verifying ? (
          /* ── Verifying state ── */
          <div className="flex flex-col items-center text-center py-4">
            <div className="relative mb-5">
              <div className="h-14 w-14 rounded-full border-[3px] border-gray-200" />
              <div className="absolute inset-0 h-14 w-14 rounded-full border-[3px] border-transparent border-t-gray-900 animate-spin" />
            </div>
            <h3 className="text-base font-semibold text-gray-900 mb-1.5">Verifying Payment...</h3>
            <p className="text-xs text-gray-500 max-w-[260px] leading-relaxed">
              Confirming your payment with the gateway. This usually takes a few seconds.
            </p>
          </div>
        ) : expired ? (
          /* ── Session expired ── */
          <div className="flex flex-col items-center text-center py-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-amber-50 mb-4">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="h-7 w-7 text-amber-500">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
              </svg>
            </div>
            <h3 className="text-base font-semibold text-gray-900 mb-1.5">Session Expired</h3>
            <p className="text-xs text-gray-500 mb-5 max-w-[260px] leading-relaxed">
              The payment session has timed out. Please close this window and start a new deposit.
            </p>
            <button
              type="button"
              onClick={handleClose}
              className="rounded-xl bg-gray-900 px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-gray-800 active:scale-[0.97] cursor-pointer"
            >
              Start Over
            </button>
          </div>
        ) : !windowOpened ? (
          /* ── Initial: Open payment window ── */
          <div className="flex flex-col items-center text-center py-2">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-blue-50 mb-4">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="h-7 w-7 text-blue-600">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z" />
              </svg>
            </div>
            <h3 className="text-base font-semibold text-gray-900 mb-1.5">Complete Your Payment</h3>
            <p className="text-xs text-gray-500 mb-5 max-w-[260px] leading-relaxed">
              A secure payment window will open. Complete your payment there — we'll automatically detect when it's done.
            </p>
            <button
              type="button"
              onClick={handleOpenPayment}
              className="flex items-center gap-2 rounded-xl bg-gray-900 px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-gray-800 active:scale-[0.97] cursor-pointer"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="h-4 w-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
              </svg>
              Open Payment Window
            </button>
          </div>
        ) : (
          /* ── Window opened: waiting ── */
          <div className="flex flex-col items-center text-center py-2">
            <div className="relative mb-4">
              <div className="h-14 w-14 rounded-full border-[3px] border-emerald-100" />
              <div className="absolute inset-0 h-14 w-14 rounded-full border-[3px] border-transparent border-t-emerald-500 animate-spin" style={{ animationDuration: '1.5s' }} />
              <div className="absolute inset-0 flex items-center justify-center">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="h-5 w-5 text-emerald-600">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 0 0 2.25-2.25V6.75A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25v10.5A2.25 2.25 0 0 0 4.5 19.5Z" />
                </svg>
              </div>
            </div>
            <h3 className="text-base font-semibold text-gray-900 mb-1.5">Waiting for Payment...</h3>
            <div className="rounded-xl bg-blue-50 border border-blue-100 p-3 mb-5 w-full">
              <p className="text-xs text-blue-700 leading-relaxed">
                Complete your payment in the new window. This screen will update automatically once your payment is confirmed.
              </p>
            </div>

            <div className="flex flex-col gap-2 w-full">
              <button
                type="button"
                onClick={handlePaymentCompleted}
                className="w-full flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 active:scale-[0.97] cursor-pointer"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="h-4 w-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                </svg>
                I've Completed Payment
              </button>
              <button
                type="button"
                onClick={handleOpenPayment}
                className="w-full flex items-center justify-center gap-1.5 rounded-xl border border-gray-200 px-4 py-2 text-xs font-medium text-gray-600 transition hover:bg-gray-50 cursor-pointer"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="h-3.5 w-3.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182" />
                </svg>
                Reopen Payment Window
              </button>
            </div>
          </div>
        )}

        {/* Trust footer */}
        {!verifying && (
          <div className="mt-5 pt-4 border-t border-gray-100">
            <div className="flex items-center justify-center gap-3 text-[11px] text-gray-400">
              <span>🔒 256-bit SSL</span>
              <span>·</span>
              <span>Powered by iyzico</span>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

export default IyzicoCheckout;
