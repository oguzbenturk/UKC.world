import { useState, useRef, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { PlusIcon, CalendarDaysIcon } from '@heroicons/react/24/outline';
import { CalendarProvider } from '@/features/bookings/components/contexts/CalendarContext';
import BookingDrawer from '@/features/bookings/components/components/BookingDrawer';
import { useAuth } from '@/shared/hooks/useAuth';

// Paths where the global FAB should not appear
const HIDDEN_EXACT_PATHS = ['/', '/login', '/register', '/reset-password', '/bookings/calendar'];
const HIDDEN_PATH_PREFIXES = ['/f/', '/quick/', '/group-invitation/'];

const NON_STAFF_ROLES = ['outsider', 'student', 'trusted_customer'];

const GlobalFAB = () => {
  const { user, isAuthenticated } = useAuth();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [bookingDrawerOpen, setBookingDrawerOpen] = useState(false);
  const menuRef = useRef(null);

  const isHidden =
    HIDDEN_EXACT_PATHS.includes(location.pathname) ||
    HIDDEN_PATH_PREFIXES.some(p => location.pathname.startsWith(p));

  const isStaff =
    isAuthenticated &&
    user &&
    !NON_STAFF_ROLES.includes(user.role?.toLowerCase?.() || '');

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuOpen]);

  if (!isStaff || isHidden) return null;

  return (
    <>
      <div ref={menuRef} className="fixed bottom-6 right-6 z-[60] flex flex-col items-end gap-2">
        {/* Action menu — appears above the FAB */}
        {menuOpen && (
          <div className="flex flex-col items-end gap-2 mb-1 animate-in fade-in slide-in-from-bottom-2 duration-150">
            <button
              onClick={() => {
                setMenuOpen(false);
                setBookingDrawerOpen(true);
              }}
              className="flex items-center gap-2.5 bg-white border border-slate-200 shadow-xl rounded-xl px-4 py-2.5 text-sm font-medium text-slate-800 hover:bg-slate-50 whitespace-nowrap transition-colors"
            >
              <CalendarDaysIcon className="h-4 w-4 text-sky-600 shrink-0" />
              Book a Lesson
            </button>
          </div>
        )}

        {/* FAB button */}
        <button
          onClick={() => setMenuOpen(o => !o)}
          className="h-14 w-14"
          style={{ marginBottom: 'env(keyboard-inset-height, 0px)' }}
          title={menuOpen ? 'Close' : 'Quick Actions'}
          aria-label={menuOpen ? 'Close' : 'Quick Actions'}
          aria-expanded={menuOpen}
        >
          <div
            className={`relative h-full w-full rounded-full shadow-2xl ring-1 transition-all duration-200 hover:scale-105 active:scale-95 bg-gradient-to-b from-slate-800 to-slate-700 ring-slate-500/30 ${menuOpen ? '' : 'fab-float'}`}
          >
            <div className="absolute inset-0 rounded-full bg-white/5" />
            <div className="absolute -inset-1 rounded-full blur-md bg-sky-500/25 fab-glow" />
            <div
              className={`relative flex h-full w-full items-center justify-center text-slate-100 transition-transform duration-300 ${menuOpen ? 'rotate-45' : ''}`}
            >
              <PlusIcon className="h-6 w-6" />
            </div>
          </div>
        </button>
      </div>

      {/* BookingDrawer with its own CalendarProvider — only mounted when open */}
      {bookingDrawerOpen && (
        <CalendarProvider>
          <BookingDrawer
            isOpen={bookingDrawerOpen}
            onClose={() => setBookingDrawerOpen(false)}
          />
        </CalendarProvider>
      )}
    </>
  );
};

export default GlobalFAB;
