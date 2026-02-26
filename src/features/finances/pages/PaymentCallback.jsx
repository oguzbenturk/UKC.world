/**
 * PaymentCallback Component
 * Shown in the iyzico payment tab after callback redirect.
 * The original tab auto-detects completion via Socket.IO and shows the receipt.
 * This page auto-closes immediately — it's just a transient redirect target.
 */

import { useEffect } from 'react';

export function PaymentCallback() {
  // Auto-close this tab immediately — the original tab shows the receipt
  useEffect(() => {
    try { window.close(); } catch { /* browser may block */ }
    // Retry after a tick in case the first attempt was too early
    const t = setTimeout(() => {
      try { window.close(); } catch { /* noop */ }
    }, 300);
    return () => clearTimeout(t);
  }, []);

  // Minimal fallback UI — only visible if window.close() is blocked by the browser
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
