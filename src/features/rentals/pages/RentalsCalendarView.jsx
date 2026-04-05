import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { Tooltip } from 'antd';
import { useLocation } from 'react-router-dom';
import {
  format,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  addWeeks,
  subWeeks,
  addDays,
  subDays,
  addMonths,
  subMonths,
  startOfMonth,
  endOfMonth,
  isSameDay,
  isSameMonth,
  parseISO,
} from 'date-fns';
import { ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/24/outline';
import CalendarViewSwitcher from '@/shared/components/CalendarViewSwitcher';
import { useData } from '@/shared/hooks/useData';
import { useQuery } from '@tanstack/react-query';

const buildFullName = (firstName, lastName) => {
  const name = [firstName, lastName].filter(Boolean).join(' ').trim();
  return name || null;
};

const formatRentalDuration = (duration) => {
  const hours = Number(duration);
  if (!Number.isFinite(hours) || hours <= 0) return '';
  if (hours < 1) {
    const minutes = Math.max(15, Math.round(hours * 60));
    return `${minutes}m`;
  }
  if (Number.isInteger(hours)) {
    return `${hours}h`;
  }
  return `${parseFloat(hours.toFixed(2))}h`;
};

const getNumericDuration = (value) => {
  const num = Number(value);
  return Number.isFinite(num) && num > 0 ? num : null;
};

const sumDurationFromItems = (items) => {
  if (!Array.isArray(items)) return 0;
  return items.reduce((total, item) => total + (Number(item?.duration) || 0), 0);
};

const sumDurationFromDetails = (details) => {
  if (!details || typeof details !== 'object') return 0;
  return Object.values(details).reduce((total, item) => total + (Number(item?.duration) || 0), 0);
};

// eslint-disable-next-line complexity
const getCustomerName = (rental) => {
  const candidates = [
    rental?.customer_name,
    rental?.customerName,
    rental?.customer?.full_name,
    rental?.customer?.name,
    buildFullName(rental?.customer?.first_name, rental?.customer?.last_name),
    rental?.user?.full_name,
    rental?.user?.name,
    buildFullName(rental?.user?.first_name, rental?.user?.last_name),
    rental?.student?.full_name,
    rental?.student?.name,
    buildFullName(rental?.student?.first_name, rental?.student?.last_name),
    buildFullName(rental?.customer_first_name, rental?.customer_last_name),
  ].filter(Boolean);

  return candidates[0] || 'Unknown Customer';
};

// eslint-disable-next-line complexity
const getDurationLabel = (rental) => {
  const directLabel = rental?.durationLabel || rental?.duration_label;
  if (directLabel) return directLabel;

  const rawDuration = getNumericDuration(
    rental?.duration
      ?? rental?.rental_duration
      ?? rental?.duration_hours
      ?? rental?.hours
  );
  if (rawDuration) return formatRentalDuration(rawDuration);

  const detailsDuration = sumDurationFromDetails(rental?.equipment_details);
  if (detailsDuration) return formatRentalDuration(detailsDuration);

  const itemsDuration = sumDurationFromItems(
    rental?.equipment_items || rental?.equipmentItems || rental?.equipment
  );
  if (itemsDuration) return formatRentalDuration(itemsDuration);

  return '';
};

const getServiceName = (rental) => {
  const directName = rental?.service_name || rental?.service?.name || rental?.equipment_name;
  if (directName) return directName;
  if (Array.isArray(rental?.equipment_names) && rental.equipment_names.length > 0) {
    return rental.equipment_names.join(', ');
  }
  if (rental?.equipment_details && typeof rental.equipment_details === 'object') {
    const names = Object.values(rental.equipment_details)
      .map((item) => item?.name)
      .filter(Boolean);
    if (names.length > 0) return names.join(', ');
  }
  return 'Rental Service';
};

/**
 * RentalsCalendarView - Calendar view for equipment rentals
 */
const RentalsCalendarView = () => {
  const { apiClient } = useData();
  const location = useLocation();
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [view, setView] = useState('week');
  const [expandedDay, setExpandedDay] = useState(null);
  const gridRef = useRef(null);
  const dayRefs = useRef({});
  const overlayRef = useRef(null);
  const overlayStyleRef = useRef(null);
  const [overlayStyle, setOverlayStyle] = useState(null);

  const calcOverlay = useCallback((dateStr) => {
    const gridEl = gridRef.current;
    const cellEl = dayRefs.current[dateStr];
    if (!gridEl || !cellEl) return null;
    const gridRect = gridEl.getBoundingClientRect();
    const cellRect = cellEl.getBoundingClientRect();
    const colWidth = cellRect.width;
    const desiredCols = 4;
    const gridWidth = gridRect.width;
    const width = Math.min(gridWidth, colWidth * desiredCols);
    let left = cellRect.left - gridRect.left;
    if (left + width > gridWidth) left = Math.max(0, gridWidth - width);
    const top = cellRect.top - gridRect.top;
    return { left, top, width };
  }, []);

  const toggleDayExpanded = useCallback((dateStr) => {
    setExpandedDay((prev) => {
      const next = prev === dateStr ? null : dateStr;
      setTimeout(() => {
        if (next) setOverlayStyle(calcOverlay(next)); else setOverlayStyle(null);
      }, 0);
      return next;
    });
  }, [calcOverlay]);

  // Close overlay on outside click or Escape
  useEffect(() => {
    if (!expandedDay) return;
    const onDocClick = (e) => {
      if (overlayRef.current && !overlayRef.current.contains(e.target)) {
        setExpandedDay(null);
        setOverlayStyle(null);
      }
    };
    const onKey = (e) => {
      if (e.key === 'Escape') { setExpandedDay(null); setOverlayStyle(null); }
    };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [expandedDay]);

  // Fetch rentals data
  const { data: rentals = [] } = useQuery({
    queryKey: ['rentals', 'calendar'],
    queryFn: async () => {
      if (!apiClient) return [];
      const response = await apiClient.get('/rentals');
      return Array.isArray(response.data) ? response.data : [];
    },
    enabled: !!apiClient
  });

  const weekStart = startOfWeek(selectedDate, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(selectedDate, { weekStartsOn: 1 });
  const weekDays = eachDayOfInterval({ start: weekStart, end: weekEnd });

  const monthStart = startOfMonth(selectedDate);
  const monthEnd = endOfMonth(selectedDate);
  const monthGridStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const monthGridEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
  const monthDays = eachDayOfInterval({ start: monthGridStart, end: monthGridEnd });

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const nextView = params.get('view');
    if (nextView === 'day' || nextView === 'week' || nextView === 'month') {
      setView(nextView);
    }
  }, [location.search]);

  const handlePrevious = () => {
    if (view === 'day') return setSelectedDate(subDays(selectedDate, 1));
    if (view === 'month') return setSelectedDate(subMonths(selectedDate, 1));
    return setSelectedDate(subWeeks(selectedDate, 1));
  };

  const handleNext = () => {
    if (view === 'day') return setSelectedDate(addDays(selectedDate, 1));
    if (view === 'month') return setSelectedDate(addMonths(selectedDate, 1));
    return setSelectedDate(addWeeks(selectedDate, 1));
  };

  // Group rentals by date
  const rentalsByDate = useMemo(() => {
    const grouped = {};
    rentals.forEach(rental => {
      const rentalDate = rental.rental_date || rental.start_date;
      if (rentalDate) {
        const dateKey = format(parseISO(rentalDate), 'yyyy-MM-dd');
        if (!grouped[dateKey]) grouped[dateKey] = [];
        grouped[dateKey].push(rental);
      }
    });
    return grouped;
  }, [rentals]);

  const getStatusColor = (status) => {
    switch (status) {
      case 'active': return { dot: 'bg-blue-500', bg: 'bg-blue-50', border: 'border-blue-200/60', text: 'text-blue-700', hover: 'hover:bg-blue-100' };
      case 'completed': return { dot: 'bg-emerald-500', bg: 'bg-emerald-50', border: 'border-emerald-200/60', text: 'text-emerald-700', hover: 'hover:bg-emerald-100' };
      case 'overdue': return { dot: 'bg-red-500', bg: 'bg-red-50', border: 'border-red-200/60', text: 'text-red-700', hover: 'hover:bg-red-100' };
      default: return { dot: 'bg-orange-500', bg: 'bg-orange-50', border: 'border-orange-200/60', text: 'text-orange-700', hover: 'hover:bg-orange-100' };
    }
  };

  const dayHeaderLabel = useMemo(() => {
    if (view === 'day') return format(selectedDate, 'EEEE, MMMM d, yyyy');
    if (view === 'month') return format(selectedDate, 'MMMM yyyy');
    return `${format(weekStart, 'MMM d')} – ${format(weekEnd, 'MMM d, yyyy')}`;
  }, [selectedDate, view, weekStart, weekEnd]);

  const rentalCard = (rental, compact = false) => {
    const customerName = getCustomerName(rental);
    const serviceName = getServiceName(rental);
    const durationLabel = getDurationLabel(rental);
    const colors = getStatusColor(rental.status);
    return (
      <Tooltip
        key={rental.id}
        title={<div><div className="font-semibold">{customerName}</div><div className="text-xs opacity-80">{serviceName}{durationLabel ? ` · ${durationLabel}` : ''}</div></div>}
      >
        <div className={`px-2 py-1.5 ${colors.bg} border ${colors.border} rounded-lg text-xs cursor-pointer ${colors.hover} transition-all duration-150`}>
          <div className={`${colors.text} font-semibold truncate leading-tight`}>{customerName}</div>
          {!compact && <div className={`${colors.text} opacity-70 mt-0.5 truncate text-[11px] leading-tight`}>{durationLabel ? `${serviceName} · ${durationLabel}` : serviceName}</div>}
        </div>
      </Tooltip>
    );
  };

  return (
    <div className="flex flex-col h-full bg-slate-50/40">
      {/* ── Header ─────────────────────────────────────── */}
      <div className="bg-white border-b border-slate-200/80 px-4 sm:px-6 py-2.5">
        <div className="flex items-center justify-between gap-3">
          <CalendarViewSwitcher
            currentView={view}
            onViewChange={setView}
            views={['list', 'day', 'week', 'month']}
            listPath="/calendars/rentals"
            calendarPath="/rentals/calendar"
            size="large"
          />

          <div className="flex items-center gap-1.5">
            <button type="button" onClick={handlePrevious} className="h-8 w-8 grid place-items-center rounded-lg border border-slate-200 bg-white hover:bg-slate-50 transition-colors">
              <ChevronLeftIcon className="h-4 w-4 text-slate-600" />
            </button>
            <button type="button" onClick={() => setSelectedDate(new Date())} className="px-3 h-8 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-medium text-slate-600 transition-colors">
              Today
            </button>
            <div className="px-4 h-8 flex items-center rounded-lg text-sm font-semibold text-slate-800 min-w-[180px] justify-center select-none">
              {dayHeaderLabel}
            </div>
            <button type="button" onClick={handleNext} className="h-8 w-8 grid place-items-center rounded-lg border border-slate-200 bg-white hover:bg-slate-50 transition-colors">
              <ChevronRightIcon className="h-4 w-4 text-slate-600" />
            </button>
          </div>

          <div className="hidden sm:block flex-1" />
        </div>
      </div>

      {/* ── Calendar Body ──────────────────────────────── */}
      <div className="flex-1 overflow-auto p-3 sm:p-4">

        {/* ─── Day View ──────────────────────────────── */}
        {view === 'day' && (() => {
          const dateKey = format(selectedDate, 'yyyy-MM-dd');
          const dayRentals = rentalsByDate[dateKey] || [];
          return (
            <div className="max-w-2xl mx-auto">
              <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/50">
                  <h3 className="text-sm font-semibold text-slate-700">{format(selectedDate, 'EEEE, MMMM d')}</h3>
                  <span className="text-xs text-slate-400">{dayRentals.length} rental{dayRentals.length !== 1 ? 's' : ''}</span>
                </div>
                <div className="p-3 space-y-2">
                  {dayRentals.length > 0 ? dayRentals.map((rental) => rentalCard(rental)) : (
                    <div className="py-12 text-center text-sm text-slate-400">No rentals for this day</div>
                  )}
                </div>
              </div>
            </div>
          );
        })()}

        {/* ─── Week View ─────────────────────────────── */}
        {view === 'week' && (
          <>
            <div className="grid grid-cols-7 gap-1.5 mb-1.5">
              {weekDays.map((day) => {
                const isToday = isSameDay(day, new Date());
                return (
                  <div key={day.toISOString()} className="text-center py-1.5">
                    <div className="text-[10px] font-medium uppercase text-slate-400 tracking-wider">{format(day, 'EEE')}</div>
                    <div className={`text-lg font-semibold mt-0.5 ${isToday ? 'text-blue-600' : 'text-slate-800'}`}>{format(day, 'd')}</div>
                  </div>
                );
              })}
            </div>
            <div className="grid grid-cols-7 gap-1.5">
              {weekDays.map((day) => {
                const dateKey = format(day, 'yyyy-MM-dd');
                const dayRentals = rentalsByDate[dateKey] || [];
                const isToday = isSameDay(day, new Date());
                const maxVisible = 3;
                const visibleRentals = dayRentals.slice(0, maxVisible);
                const overflow = Math.max(0, dayRentals.length - maxVisible);
                return (
                  <div key={day.toISOString()} className={`bg-white border rounded-xl p-2 min-h-[180px] transition-colors ${isToday ? 'border-blue-300 bg-blue-50/20' : 'border-slate-200/80'}`}>
                    {visibleRentals.length > 0 ? (
                      <div className="space-y-1.5">
                        {visibleRentals.map((rental) => rentalCard(rental))}
                        {overflow > 0 && (
                          <button type="button" className="w-full text-left text-[11px] font-medium text-slate-500 hover:text-orange-600 px-1.5 py-0.5 rounded hover:bg-orange-50 transition-colors" onClick={() => { setView('day'); setSelectedDate(day); }}>
                            +{overflow} more
                          </button>
                        )}
                      </div>
                    ) : (
                      <div className="h-full flex items-center justify-center text-xs text-slate-300">—</div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* ─── Month View ────────────────────────────── */}
        {view === 'month' && (
          <>
            {/* Day-of-week header */}
            <div className="grid grid-cols-7 mb-px">
              {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
                <div key={d} className="text-center py-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400 bg-white border-b border-slate-100">
                  {d}
                </div>
              ))}
            </div>

            {/* Month grid */}
            <div ref={gridRef} className="grid grid-cols-7 relative bg-white border-x border-b border-slate-100 rounded-b-xl overflow-hidden">
              {monthDays.map((day) => {
                const dateKey = format(day, 'yyyy-MM-dd');
                const dayRentals = rentalsByDate[dateKey] || [];
                const isToday = isSameDay(day, new Date());
                const isInMonth = isSameMonth(day, selectedDate);
                const maxVisible = 3;
                const visibleRentals = dayRentals.slice(0, maxVisible);
                const overflow = Math.max(0, dayRentals.length - visibleRentals.length);

                return (
                  <div
                    key={day.toISOString()}
                    ref={(el) => { dayRefs.current[dateKey] = el; }}
                    className={`relative border-r border-b border-slate-100 min-h-[110px] p-1.5 transition-colors cursor-pointer hover:bg-orange-50/30 ${
                      isToday ? 'bg-blue-50/40' : ''
                    } ${!isInMonth ? 'bg-slate-50/60' : ''}`}
                    onClick={() => toggleDayExpanded(dateKey)}
                  >
                    {/* Day number */}
                    <div className="flex items-center justify-between mb-1">
                      <span className={`text-xs font-medium leading-none ${
                        isToday
                          ? 'bg-blue-600 text-white w-5 h-5 rounded-full flex items-center justify-center'
                          : isInMonth ? 'text-slate-700' : 'text-slate-400'
                      }`}>
                        {format(day, 'd')}
                      </span>
                      {dayRentals.length > 0 && (
                        <span className="text-[10px] font-medium text-orange-500">{dayRentals.length}</span>
                      )}
                    </div>

                    {/* Rental pills */}
                    {isInMonth && visibleRentals.length > 0 && (
                      <div className="space-y-0.5">
                        {visibleRentals.map((rental) => {
                          const colors = getStatusColor(rental.status);
                          const customerName = getCustomerName(rental);
                          return (
                            <Tooltip key={rental.id} title={`${customerName} · ${getServiceName(rental)}`}>
                              <div className={`flex items-center gap-1 px-1.5 py-0.5 rounded ${colors.bg} ${colors.hover} transition-colors`} onClick={(e) => e.stopPropagation()}>
                                <span className={`w-1.5 h-1.5 rounded-full ${colors.dot} shrink-0`} />
                                <span className={`text-[11px] font-medium ${colors.text} truncate leading-tight`}>{customerName}</span>
                              </div>
                            </Tooltip>
                          );
                        })}
                        {overflow > 0 && (
                          <button type="button" className="w-full text-left text-[10px] font-medium text-slate-500 hover:text-orange-600 px-1.5 py-0.5 rounded hover:bg-orange-50 transition-colors" onClick={(e) => { e.stopPropagation(); toggleDayExpanded(dateKey); }}>
                            +{overflow} more
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Expanded overlay */}
              {expandedDay && overlayStyle && (() => {
                const dayRentalsExp = rentalsByDate[expandedDay] || [];
                return (
                  <div className="absolute z-50" style={{ left: overlayStyle.left, top: overlayStyle.top, width: overlayStyle.width }}>
                    <div ref={overlayRef} className="bg-white border border-orange-200/80 shadow-2xl rounded-xl p-3" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-between mb-2.5">
                        <div>
                          <div className="text-sm font-bold text-slate-800">{format(new Date(expandedDay), 'EEEE, MMM d')}</div>
                          <div className="text-[11px] text-slate-400">{dayRentalsExp.length} rental{dayRentalsExp.length !== 1 ? 's' : ''}</div>
                        </div>
                        <button className="text-xs text-orange-600 hover:text-orange-700 font-medium" onClick={() => { setExpandedDay(null); setOverlayStyle(null); }}>Close</button>
                      </div>
                      <div className="space-y-1.5 max-h-[50vh] overflow-auto pr-1">
                        {dayRentalsExp.length > 0 ? dayRentalsExp.map((rental) => rentalCard(rental)) : (
                          <div className="text-slate-400 text-xs text-center py-6">No rentals</div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default RentalsCalendarView;
