/**
 * PaymentCallback Component
 * Shown after Iyzico payment callback redirect.
 * For wallet deposits: auto-closes tab (original tab shows receipt via Socket.IO).
 * For shop orders: shows success/failure and links to orders or shop.
 * For bookings/group bookings: shows success/failure and links to dashboard.
 */

import { useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';

export function PaymentCallback() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  
  const status = searchParams.get('status');
  const type = searchParams.get('type'); // 'shop', 'booking', 'group_booking'
  const orderNumber = searchParams.get('order');
  const reason = searchParams.get('reason');
  
  const isShopOrder = type === 'shop';
  const isBooking = type === 'booking';
  const isGroupBooking = type === 'group_booking';
  const isMembership = type === 'membership';
  const isSuccess = status === 'success';

  // For membership payments, redirect back to the offerings page with status info
  useEffect(() => {
    if (isMembership) {
      const params = new URLSearchParams();
      if (status) params.set('payment', status);
      if (reason) params.set('reason', reason);
      navigate(`/members/offerings${params.toString() ? `?${params}` : ''}`, { replace: true });
      return;
    }
  }, [isMembership, navigate, status, reason]);

  // For wallet deposits (no type param), auto-close the tab
  useEffect(() => {
    if (!isShopOrder && !isBooking && !isGroupBooking && !isMembership) {
      try { window.close(); } catch { /* browser may block */ }
      const t = setTimeout(() => {
        try { window.close(); } catch { /* noop */ }
      }, 300);
      return () => clearTimeout(t);
    }
  }, [isShopOrder, isBooking, isGroupBooking, isMembership]);

  // For shop orders: clear cart from localStorage on successful payment
  useEffect(() => {
    if (isShopOrder && isSuccess) {
      try {
        localStorage.removeItem('plannivo_cart');
      } catch { /* noop */ }
    }
  }, [isShopOrder, isSuccess]);

  // Shop order success screen
  if (isShopOrder && isSuccess) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="text-center max-w-md">
          <div className="flex justify-center mb-4">
            <div className="h-16 w-16 rounded-full bg-emerald-50 flex items-center justify-center">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.2} stroke="currentColor" className="h-8 w-8 text-emerald-500">
                <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
              </svg>
            </div>
          </div>
          <h2 className="text-lg font-semibold text-gray-800 mb-1">Order Confirmed!</h2>
          {orderNumber && (
            <p className="text-sm text-gray-600 mb-1">
              Order Number: <span className="font-mono font-semibold text-gray-800">{orderNumber}</span>
            </p>
          )}
          <p className="text-xs text-gray-400 mb-6">Your payment was processed successfully. Thank you for your purchase!</p>
          <div className="flex gap-3 justify-center">
            <button
              type="button"
              onClick={() => navigate('/shop/my-orders')}
              className="rounded-lg bg-gray-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-gray-800 cursor-pointer"
            >
              View My Orders
            </button>
            <button
              type="button"
              onClick={() => navigate('/shop')}
              className="rounded-lg bg-white px-5 py-2.5 text-sm font-semibold text-gray-700 border border-gray-300 hover:bg-gray-50 cursor-pointer"
            >
              Continue Shopping
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Shop order failure screen
  if (isShopOrder && !isSuccess) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="text-center max-w-md">
          <div className="flex justify-center mb-4">
            <div className="h-16 w-16 rounded-full bg-red-50 flex items-center justify-center">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.2} stroke="currentColor" className="h-8 w-8 text-red-500">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
              </svg>
            </div>
          </div>
          <h2 className="text-lg font-semibold text-gray-800 mb-1">Payment Failed</h2>
          <p className="text-xs text-gray-400 mb-6">
            {reason === 'order_not_found' 
              ? 'We could not find your order. Please contact support.'
              : 'Your payment could not be processed. Please try again or use a different payment method.'}
          </p>
          <div className="flex gap-3 justify-center">
            <button
              type="button"
              onClick={() => navigate('/shop')}
              className="rounded-lg bg-gray-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-gray-800 cursor-pointer"
            >
              Return to Shop
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Booking payment success screen
  if ((isBooking || isGroupBooking) && isSuccess) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="text-center max-w-md">
          <div className="flex justify-center mb-4">
            <div className="h-16 w-16 rounded-full bg-emerald-50 flex items-center justify-center">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.2} stroke="currentColor" className="h-8 w-8 text-emerald-500">
                <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
              </svg>
            </div>
          </div>
          <h2 className="text-lg font-semibold text-gray-800 mb-1">Booking Payment Confirmed!</h2>
          <p className="text-xs text-gray-400 mb-6">Your payment was processed successfully. Your booking is now confirmed.</p>
          <div className="flex gap-3 justify-center">
            <button
              type="button"
              onClick={() => navigate('/student/dashboard')}
              className="rounded-lg bg-gray-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-gray-800 cursor-pointer"
            >
              Go to Dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Booking payment failure screen
  if ((isBooking || isGroupBooking) && !isSuccess) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="text-center max-w-md">
          <div className="flex justify-center mb-4">
            <div className="h-16 w-16 rounded-full bg-red-50 flex items-center justify-center">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.2} stroke="currentColor" className="h-8 w-8 text-red-500">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
              </svg>
            </div>
          </div>
          <h2 className="text-lg font-semibold text-gray-800 mb-1">Payment Failed</h2>
          <p className="text-xs text-gray-400 mb-6">
            Your booking payment could not be processed. Please try again or use a different payment method.
          </p>
          <div className="flex gap-3 justify-center">
            <button
              type="button"
              onClick={() => navigate('/student/dashboard')}
              className="rounded-lg bg-gray-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-gray-800 cursor-pointer"
            >
              Go to Dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Generic failure screen (no_match, unknown type, etc.)
  if (!isSuccess && status === 'failed') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="text-center max-w-md">
          <div className="flex justify-center mb-4">
            <div className="h-16 w-16 rounded-full bg-red-50 flex items-center justify-center">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.2} stroke="currentColor" className="h-8 w-8 text-red-500">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
              </svg>
            </div>
          </div>
          <h2 className="text-lg font-semibold text-gray-800 mb-1">Payment Issue</h2>
          <p className="text-xs text-gray-400 mb-6">
            {reason === 'no_match'
              ? 'We could not match your payment to an order. Please contact support if you were charged.'
              : 'Your payment could not be processed. Please try again or contact support.'}
          </p>
          <div className="flex gap-3 justify-center">
            <button
              type="button"
              onClick={() => navigate('/')}
              className="rounded-lg bg-gray-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-gray-800 cursor-pointer"
            >
              Go to Dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Default: wallet deposit — fallback UI (only visible if window.close() is blocked)
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="text-center">
        <div className="flex justify-center mb-4">
          <div className="h-12 w-12 rounded-full bg-emerald-50 flex items-center justify-center">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.2} stroke="currentColor" className="h-6 w-6 text-emerald-500">
              <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
            </svg>
          </div>
        </div>
        <p className="text-sm font-medium text-gray-700 mb-1">Payment processed</p>
        <p className="text-xs text-gray-400 mb-4">You can close this tab and return to your wallet.</p>
        <button
          type="button"
          onClick={() => { try { window.close(); } catch { /* noop */ } }}
          className="rounded-lg bg-gray-900 px-4 py-2 text-xs font-semibold text-white hover:bg-gray-800 cursor-pointer"
        >
          Close Tab
        </button>
      </div>
    </div>
  );
}

export default PaymentCallback;
