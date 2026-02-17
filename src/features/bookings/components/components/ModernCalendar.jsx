import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeftIcon, ChevronRightIcon, ChevronDownIcon, PlusIcon, CalendarDaysIcon, ViewColumnsIcon, Squares2X2Icon, ListBulletIcon } from '@heroicons/react/24/outline';
import { format, addDays, addWeeks, addMonths, subDays, subWeeks, subMonths, getISOWeek, getISOWeekYear, startOfISOWeek } from 'date-fns';

// Import calendar views
import DailyView from './views/DailyView';
import WeekView from './views/WeekView';
import MonthView from './views/MonthView';

// Import modals and components
import StepBookingModal from './StepBookingModal';
import BulkBookingAssistant from './BulkBookingAssistant';
import BookingDetailModal from './BookingDetailModal';
import LoadingIndicator from '@/shared/components/ui/LoadingIndicator';
import ErrorIndicator from '@/shared/components/ui/ErrorIndicator';
import ErrorBoundary from '@/shared/components/error/ErrorBoundary';

// Import context and hooks
import { useCalendar } from '../contexts/CalendarContext';
import { useKeyboardShortcuts, createCalendarShortcuts } from '../hooks/useKeyboardShortcuts';

/**
 * Modern booking calendar with daily, weekly, and monthly views
 * 
 * @param {Object} props - Component props
 * @returns {JSX.Element} ModernCalendar component
 */
// Helper functions extracted to reduce main component complexity
const getPrevDate = (view, date) => {
  switch (view) {
    case 'day':
      return subDays(date, 1);
    case 'week':
      return subWeeks(date, 1);
    case 'month':
      return subMonths(date, 1);
    default:
      return subDays(date, 1);
  }
};

const getNextDate = (view, date) => {
  switch (view) {
    case 'day':
      return addDays(date, 1);
    case 'week':
      return addWeeks(date, 1);
    case 'month':
      return addMonths(date, 1);
    default:
      return addDays(date, 1);
  }
};

function DateNavigator({ view, selectedDate, onChangeDate, onPrev, onNext }) {
  const dayInputRef = useRef(null);
  const weekInputRef = useRef(null);
  const monthInputRef = useRef(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  const openNativePicker = useCallback(() => {
    const ref = view === 'day' ? dayInputRef : view === 'week' ? weekInputRef : monthInputRef;
    const el = ref.current;
    if (!el) return;
    if (pickerOpen) {
      try { el.blur(); } catch { /* no-op */ }
      setPickerOpen(false);
      return;
    }
    try {
      if (typeof el.showPicker === 'function') {
        el.showPicker();
      } else {
        el.focus();
        el.click();
      }
    } catch {
      el.focus();
      el.click();
    }
    setPickerOpen(true);
  }, [pickerOpen, view]);

  return (
    <div className="flex items-center space-x-1 sm:space-x-2">
      <button
        type="button"
        className="h-8 w-8 sm:h-9 sm:w-9 grid place-items-center rounded-lg border border-gray-300 bg-white hover:bg-gray-50 shadow-sm"
        onClick={onPrev}
        aria-label="Previous"
      >
        <ChevronLeftIcon className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-gray-600" />
      </button>
      <div className="relative">
        <input
          type="text"
          value={format(selectedDate, 'MM/dd/yyyy')}
          readOnly
          className="px-3 sm:px-4 h-8 sm:h-9 border border-gray-300 rounded-lg text-xs sm:text-sm font-medium text-gray-900 bg-white cursor-pointer hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-sky-400 focus:border-sky-400 min-w-[96px] sm:min-w-[112px] text-center shadow-sm"
          onClick={openNativePicker}
        />
        {/* Hidden native inputs to open picker immediately */}
        <input
          ref={dayInputRef}
          type="date"
          value={format(selectedDate, 'yyyy-MM-dd')}
          onChange={(e) => {
            const d = new Date(e.target.value);
            if (!isNaN(d)) onChangeDate(d);
          }}
          onFocus={() => setPickerOpen(true)}
          onBlur={() => setPickerOpen(false)}
          className="absolute opacity-0 -z-10 pointer-events-none h-0 w-0"
          tabIndex={-1}
          aria-hidden="true"
        />
        <input
          ref={weekInputRef}
          type="week"
          value={`${getISOWeekYear(selectedDate)}-W${String(getISOWeek(selectedDate)).padStart(2, '0')}`}
          onChange={(e) => {
            const match = e.target.value.match(/(\d{4})-W(\d{2})/);
            if (match) {
              const isoYear = parseInt(match[1], 10);
              const isoWeek = parseInt(match[2], 10);
              const isoWeek1 = startOfISOWeek(new Date(isoYear, 0, 4));
              const d = addWeeks(isoWeek1, isoWeek - 1);
              onChangeDate(d);
            }
          }}
          onFocus={() => setPickerOpen(true)}
          onBlur={() => setPickerOpen(false)}
          className="absolute opacity-0 -z-10 pointer-events-none h-0 w-0"
          tabIndex={-1}
          aria-hidden="true"
        />
        <input
          ref={monthInputRef}
          type="month"
          value={format(selectedDate, 'yyyy-MM')}
          onChange={(e) => {
            const d = new Date(`${e.target.value}-01`);
            if (!isNaN(d)) onChangeDate(d);
          }}
          onFocus={() => setPickerOpen(true)}
          onBlur={() => setPickerOpen(false)}
          className="absolute opacity-0 -z-10 pointer-events-none h-0 w-0"
          tabIndex={-1}
          aria-hidden="true"
        />
      </div>
      <button
        type="button"
        className="h-8 w-8 sm:h-9 sm:w-9 grid place-items-center rounded-lg border border-gray-300 bg-white hover:bg-gray-50 shadow-sm"
        onClick={onNext}
        aria-label="Next"
      >
        <ChevronRightIcon className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-gray-600" />
      </button>
    </div>
  );
}

function ViewDropdownButton({ view, onChangeView, navigate }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (event) => {
      if (open && !event.target.closest('.view-dropdown-container')) setOpen(false);
    };
    const handleEscape = (event) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [open]);

  const label = useMemo(() => {
    switch (view) {
      case 'day': return { full: 'Daily View', short: 'Daily' };
      case 'week': return { full: '9x9 View', short: '9x9' };
      case 'month': return { full: 'Monthly View', short: 'Monthly' };
      case 'list': return { full: 'List View', short: 'List' };
      default: return { full: 'Select View', short: 'View' };
    }
  }, [view]);

  const options = [
    { key: 'day', label: 'Daily View', Icon: CalendarDaysIcon },
    { key: 'week', label: '9x9 View', Icon: ViewColumnsIcon },
    { key: 'month', label: 'Monthly View', Icon: Squares2X2Icon },
    { key: 'list', label: 'List View', Icon: ListBulletIcon }
  ];

  return (
    <div className="relative view-dropdown-container">
      <button
        type="button"
        className="inline-flex items-center gap-2 h-9 sm:h-10 px-3 sm:px-4 rounded-xl border-2 border-sky-500 text-sky-700 bg-sky-50/50 hover:bg-sky-100/70 hover:border-sky-600 shadow-sm text-xs sm:text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-sky-400 focus:ring-offset-1 active:translate-y-px transition-all"
        onClick={() => setOpen(!open)}
      >
        {(() => {
          const CurrentIcon = options.find(o => o.key === view)?.Icon || CalendarDaysIcon;
          return <CurrentIcon className="h-4 w-4 sm:h-5 sm:w-5 text-sky-600" />;
        })()}
        <span className="hidden sm:inline">{label.full}</span>
        <span className="sm:hidden">{label.short}</span>
        <ChevronDownIcon className={`h-3.5 w-3.5 sm:h-4 sm:w-4 text-sky-500 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute left-0 mt-2 w-56 bg-white border border-slate-200 rounded-xl shadow-xl z-50 overflow-hidden">
          <div className="p-1">
            {options.map((option) => (
              <button
                key={option.key}
                type="button"
                className={`w-full text-left px-3 py-2.5 rounded-lg text-sm flex items-center gap-3 transition-colors ${
                  view === option.key ? 'bg-sky-50 text-sky-700' : 'text-slate-700 hover:bg-slate-50'
                }`}
                onClick={() => {
                  if (option.key === 'list') {
                    navigate('/bookings');
                  } else {
                    onChangeView(option.key);
                  }
                  setOpen(false);
                }}
              >
                <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${view === option.key ? 'bg-sky-100' : 'bg-slate-100'}`}>
                  <option.Icon className={`h-4 w-4 ${view === option.key ? 'text-sky-600' : 'text-slate-500'}`} />
                </div>
                <span className={`flex-1 font-medium ${view === option.key ? 'text-sky-700' : 'text-slate-900'}`}>{option.label}</span>
                {view === option.key && <span className="text-sky-600 text-lg">✓</span>}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function CalendarViews({ view, onTimeSlotClick, onBookingClick }) {
  if (view === 'day') {
    return <DailyView onTimeSlotClick={onTimeSlotClick} onBookingClick={onBookingClick} />;
  }
  if (view === 'week') {
    return <WeekView onTimeSlotClick={onTimeSlotClick} onBookingClick={onBookingClick} />;
  }
  if (view === 'month') {
    return <MonthView onTimeSlotClick={onTimeSlotClick} onBookingClick={onBookingClick} />;
  }
  return null;
}

const ModernCalendar = () => {
  const { 
    selectedDate,
    setSelectedDate,
    view,
    setView,
    setViewState, // For tab switching without URL sync
    instructors: _instructors,
    services: _services,
    bookings: _bookings,
    isLoading,
    error,
    retry,
    refreshData,
    showFilters,
    setShowFilters,
    clearCacheAndRefresh,
    selectedSlot: _selectedSlot,
    setSelectedSlot
  } = useCalendar();  // State for modals
  const [isBookingModalOpen, setIsBookingModalOpen] = useState(false);
  const [isBulkBookingModalOpen, setIsBulkBookingModalOpen] = useState(false);
  const [isBookingDetailModalOpen, setIsBookingDetailModalOpen] = useState(false);
  const [selectedBooking, setSelectedBooking] = useState(null);
  const [_showQuickSearch, _setShowQuickSearch] = useState(false);
  const navigate = useNavigate();
  // Time navigation using extracted helpers
  const handlePrevious = () => setSelectedDate(getPrevDate(view, selectedDate));
  const handleNext = () => setSelectedDate(getNextDate(view, selectedDate));

  // Handle view change from tab buttons
  const _handleViewChange = (index) => {
    const newView = index === 0 ? 'day' : index === 1 ? 'week' : 'month';
    setViewState(newView); // Use setViewState to avoid URL sync conflicts
  };

  // Keyboard shortcuts setup (after function definitions)
  const shortcutActions = {
    newBooking: () => handleNewBooking(),
    goToToday: () => setSelectedDate(new Date()),
    goToPrevious: handlePrevious,
    goToNext: handleNext,
    setView: (viewType) => setView(viewType),
    refresh: () => clearCacheAndRefresh(),
    quickSearch: () => _setShowQuickSearch(true),
    toggleFilters: () => setShowFilters(!showFilters),
    clearSelection: () => {
      setSelectedSlot(null);
      setSelectedBooking(null);
      setIsBookingModalOpen(false);
      setIsBookingDetailModalOpen(false);
    },
    debugLog: () => {
      // Debug info removed for production
    }
  };
  const shortcuts = createCalendarShortcuts(shortcutActions);
  useKeyboardShortcuts(shortcuts, true);

  // Handle time slot click to open booking modal
  const handleTimeSlotClick = (slot) => {
    setSelectedSlot(slot);
    setIsBookingModalOpen(true);
  };

  // Handle new booking button click (clear any selected slot)
  const handleNewBooking = () => {
    setSelectedSlot(null);
    setIsBookingModalOpen(true);
  };

  // Handle booking click to open booking detail modal
  const handleBookingClick = (booking) => {
    setSelectedBooking(booking);
    setIsBookingDetailModalOpen(true);
  };

  // No-op
  return (
    <div className="flex flex-col h-full">
      {/* Simple Date Picker Header with View Switcher (app-matched styling) */}
      <div className="bg-white border-b border-gray-200 px-3 sm:px-4 py-2.5">
        <div className="flex items-center justify-between gap-2">
          {/* Left: View Switcher */}
          <div className="flex-1 flex justify-start">
            <ViewDropdownButton
              view={view}
              onChangeView={setView}
              navigate={navigate}
            />
          </div>

          {/* Center: Date Navigation */}
          <DateNavigator
            view={view}
            selectedDate={selectedDate}
            onChangeDate={setSelectedDate}
            onPrev={handlePrevious}
            onNext={handleNext}
          />

          {/* Right: Empty for balance */}
          <div className="hidden sm:block flex-1" />
        </div>
      </div>

      {/* Calendar content with enhanced consistency */}
      <div className="calendar-view-container view-transition flex-grow overflow-auto">
        {/* Loading State */}
        {isLoading && (
          <div className="calendar-loading-overlay">
            <LoadingIndicator 
              message="Loading calendar data..." 
              size="large"
            />
          </div>
        )}

        {/* Error State */}
        {error && !isLoading && (
          <div className="calendar-error-container">
            <ErrorIndicator 
              message={error}
              onRetry={retry}
              showRetry={true}
            />
          </div>
        )}

        {/* Calendar Views */}
        {!isLoading && !error && (
          <CalendarViews
            view={view}
            onTimeSlotClick={handleTimeSlotClick}
            onBookingClick={handleBookingClick}
          />
        )}
      </div>      {/* Modals */}
      <StepBookingModal
        isOpen={isBookingModalOpen}
        onClose={() => setIsBookingModalOpen(false)}
        prefilledDate={format(selectedDate, 'yyyy-MM-dd')}
        onSwitchToBulk={() => {
          // Close single booking and open bulk booking assistant
          setIsBookingModalOpen(false);
          // small timeout to ensure unmount before opening next modal
          setTimeout(() => setIsBulkBookingModalOpen(true), 0);
        }}
      />
      <BulkBookingAssistant
        isOpen={isBulkBookingModalOpen}
        onClose={() => setIsBulkBookingModalOpen(false)}
        onSwitchToSingle={() => {
          setIsBulkBookingModalOpen(false);
          setTimeout(() => setIsBookingModalOpen(true), 0);
        }}
        onBookingsCreated={() => {
          // Refresh calendar data after bookings are created
          refreshData();
        }}
      />
      <ErrorBoundary>
        <BookingDetailModal
          isOpen={isBookingDetailModalOpen}
          onClose={() => setIsBookingDetailModalOpen(false)}
          booking={selectedBooking}
          onServiceUpdate={() => {}} // Empty callback for calendar view
        />
      </ErrorBoundary>

      {/* Quick Action: FAB opens single booking modal directly */}

      <button
        onClick={() => handleNewBooking()}
        className="fixed bottom-6 right-6 h-14 w-14 z-50"
        style={{ marginBottom: 'env(keyboard-inset-height, 0px)' }}
        title="New Booking"
        aria-label="New Booking"
      >
        <div className={`relative h-full w-full rounded-full shadow-2xl ring-1 transition-transform duration-200 hover:scale-105 active:scale-95 bg-gradient-to-b from-slate-800 to-slate-700 fab-float ring-slate-500/30`}>
          <div className="absolute inset-0 rounded-full bg-white/5" />
          <div className="absolute -inset-1 rounded-full blur-md bg-sky-500/25 fab-glow" />
          <div className="relative flex h-full w-full items-center justify-center text-slate-100">
            <PlusIcon className="h-6 w-6" />
          </div>
        </div>
      </button>
    </div>
  );
};

export default ModernCalendar;
