/**
 * IyzicoPaymentModal
 * 
 * Generic Iyzico payment modal — same UX as the wallet deposit flow.
 * Opens Iyzico's hosted payment page in a new tab and verifies completion via:
 * 1. Socket.IO real-time event (instant — when server callback fires)
 * 2. Timeout fallback
 *
 * Usage:
 *   <IyzicoPaymentModal
 *     visible={showPayment}
 *     paymentPageUrl="https://..."
 *     socketEventName="booking:payment_confirmed"
 *     entityId={bookingId}
 *     onSuccess={(data) => { ... }}
 *     onClose={() => setShowPayment(false)}
 *     onError={(msg) => { ... }}
 *   />
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { Modal } from 'antd';
import { useRealTimeSync } from '@/shared/hooks/useRealTime';

// Max time before session expires (25 min)
const SESSION_TIMEOUT = 25 * 60 * 1000;

export default function IyzicoPaymentModal({
  visible,
  paymentPageUrl,
  socketEventName = 'wallet:deposit_approved',
  entityId,
  onClose,
  onSuccess,
  onError,
}) {
  const [windowOpened, setWindowOpened] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [expired, setExpired] = useState(false);
  const resolvedRef = useRef(false);
  const autoOpenedRef = useRef(false);

  // Reset on visibility change
  useEffect(() => {
    if (visible) {
      resolvedRef.current = false;
      autoOpenedRef.current = false;
      setExpired(false);
      setWindowOpened(false);
      setVerifying(false);
    }
  }, [visible]);

  // Session expiration timer
  useEffect(() => {
    if (!visible) return;
    const timer = setTimeout(() => setExpired(true), SESSION_TIMEOUT);
    return () => clearTimeout(timer);
  }, [visible]);

  // Socket.IO: auto-detect payment completion
  const handleSocketEvent = useCallback((data) => {
    if (!visible || resolvedRef.current) return;
    // If entityId provided, only match events for that specific entity
    if (entityId && data) {
      const dataId = data.depositId || data.bookingId || data.packageId || data.customerPackageId || data.purchaseId || data.id;
      if (dataId && dataId !== entityId) return;
    }

    resolvedRef.current = true;
    setVerifying(false);
    onSuccess?.(data);
  }, [visible, entityId, onSuccess]);

  useRealTimeSync(socketEventName, handleSocketEvent);

  // Auto-open payment window immediately when visible
  useEffect(() => {
    if (visible && paymentPageUrl && !autoOpenedRef.current && !expired) {
      autoOpenedRef.current = true;
      window.open(paymentPageUrl, '_blank');
      setWindowOpened(true);
      // Start a gentle verification wait
      setVerifying(true);
    }
    if (!visible) {
      autoOpenedRef.current = false;
    }
  }, [visible, paymentPageUrl, expired]);

  const handleOpenPayment = useCallback(() => {
    if (expired) {
      onError?.('Payment session expired. Please try again.');
      return;
    }
    if (paymentPageUrl) {
      window.open(paymentPageUrl, '_blank');
      setWindowOpened(true);
      setVerifying(true);
    }
  }, [paymentPageUrl, onError, expired]);

  const handleClose = useCallback(() => {
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
          /* Verifying / Waiting state */
          <div className="flex flex-col items-center text-center py-4">
            <div className="relative mb-5">
              <div className="h-14 w-14 rounded-full border-[3px] border-gray-200" />
              <div className="absolute inset-0 h-14 w-14 rounded-full border-[3px] border-transparent border-t-gray-900 animate-spin" />
            </div>
            <h3 className="text-base font-semibold text-gray-900 mb-1.5">Waiting for Payment...</h3>
            <p className="text-xs text-gray-500 max-w-[260px] leading-relaxed">
              Complete the payment in the new tab. This page will update automatically once confirmed.
            </p>
            <div className="mt-5 flex flex-col gap-2 w-full">
              <button
                type="button"
                onClick={handleOpenPayment}
                className="w-full rounded-xl bg-gray-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-gray-800 active:scale-[0.97] cursor-pointer"
              >
                Reopen Payment Page
              </button>
              <button
                type="button"
                onClick={handleClose}
                className="w-full rounded-xl border border-gray-200 bg-white px-5 py-2 text-sm font-medium text-gray-600 transition hover:bg-gray-50 active:scale-[0.97] cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : expired ? (
          /* Session expired */
          <div className="flex flex-col items-center text-center py-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-amber-50 mb-4">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="h-7 w-7 text-amber-500">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
              </svg>
            </div>
            <h3 className="text-base font-semibold text-gray-900 mb-1.5">Session Expired</h3>
            <p className="text-xs text-gray-500 mb-5 max-w-[260px] leading-relaxed">
              The payment session has timed out. Please close and try again.
            </p>
            <button
              type="button"
              onClick={handleClose}
              className="rounded-xl bg-gray-900 px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-gray-800 active:scale-[0.97] cursor-pointer"
            >
              Close
            </button>
          </div>
        ) : !windowOpened ? (
          /* Initial: prompt to open */
          <div className="flex flex-col items-center text-center py-2">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gray-100 mb-4">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="h-6 w-6 text-gray-700">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
              </svg>
            </div>
            <h3 className="text-base font-semibold text-gray-900 mb-1.5">Ready to Pay</h3>
            <p className="text-xs text-gray-500 mb-5 max-w-[260px] leading-relaxed">
              A secure payment page will open in a new tab. Complete the payment there.
            </p>
            <button
              type="button"
              onClick={handleOpenPayment}
              className="w-full rounded-xl bg-gray-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-gray-800 active:scale-[0.97] cursor-pointer"
            >
              Open Payment Page
            </button>
          </div>
        ) : null}
      </div>
    </Modal>
  );
}
