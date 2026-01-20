import { useState, useMemo, useEffect } from 'react';
import { Tag, Tooltip } from 'antd';
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
import { ToolOutlined } from '@ant-design/icons';
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
      case 'active': return 'blue';
      case 'completed': return 'green';
      case 'overdue': return 'red';
      default: return 'default';
    }
  };

  const dayHeaderLabel = useMemo(() => {
    if (view === 'day') return format(selectedDate, 'MMM d, yyyy');
    if (view === 'month') return format(selectedDate, 'MMMM yyyy');
    return `${format(weekStart, 'MMM d')} - ${format(weekEnd, 'MMM d, yyyy')}`;
  }, [selectedDate, view, weekStart, weekEnd]);

  const calendarDays = view === 'day' ? [selectedDate] : view === 'month' ? monthDays : weekDays;
  const gridCols = view === 'day' ? 'grid-cols-1' : 'grid-cols-7';

  return (
    <div className="flex flex-col h-full">
      {/* Header with View Switcher */}
      <div className="bg-white border-b border-gray-200 px-3 sm:px-4 py-2.5">
        <div className="flex items-center justify-between gap-2">
          {/* Left: View Switcher */}
          <div className="flex-1 flex justify-start">
            <CalendarViewSwitcher
              currentView={view}
              onViewChange={setView}
              views={['list', 'day', 'week', 'month']}
              listPath="/calendars/rentals"
              calendarPath="/rentals/calendar"
              size="large"
            />
          </div>

          {/* Center: Date Navigation */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="h-9 w-9 grid place-items-center rounded-lg border border-gray-300 bg-white hover:bg-gray-50 shadow-sm"
              onClick={handlePrevious}
            >
              <ChevronLeftIcon className="h-4 w-4 text-gray-600" />
            </button>
            <div className="px-4 h-9 flex items-center border border-gray-300 rounded-lg text-sm font-medium text-gray-900 bg-white min-w-[200px] justify-center">
              {dayHeaderLabel}
            </div>
            <button
              type="button"
              className="h-9 w-9 grid place-items-center rounded-lg border border-gray-300 bg-white hover:bg-gray-50 shadow-sm"
              onClick={handleNext}
            >
              <ChevronRightIcon className="h-4 w-4 text-gray-600" />
            </button>
          </div>

          {/* Right: Empty for balance */}
          <div className="hidden sm:block flex-1" />
        </div>
      </div>

      {/* Calendar Grid */}
      <div className="flex-1 overflow-auto p-4">
        {view !== 'day' && (
          <div className={`grid ${gridCols} gap-2 mb-2`}>
            {(view === 'month'
              ? [
                  { key: 'mon', label: 'Mon' },
                  { key: 'tue', label: 'Tue' },
                  { key: 'wed', label: 'Wed' },
                  { key: 'thu', label: 'Thu' },
                  { key: 'fri', label: 'Fri' },
                  { key: 'sat', label: 'Sat' },
                  { key: 'sun', label: 'Sun' },
                ]
              : calendarDays.map((day) => ({ key: day.toISOString(), label: format(day, 'EEE'), day }))
            ).map((item) => (
              <div
                key={item.key}
                className="text-center p-2 rounded-lg text-slate-600"
              >
                <div className="text-xs font-medium uppercase">{item.label}</div>
                {view === 'week' && item.day && (
                  <div className="text-lg font-semibold">
                    {format(item.day, 'd')}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        <div className={`grid ${gridCols} gap-2 min-h-[400px]`}>
          {calendarDays.map((day) => {
            const dateKey = format(day, 'yyyy-MM-dd');
            const dayRentals = rentalsByDate[dateKey] || [];
            const isToday = isSameDay(day, new Date());
            const isInMonth = view === 'month' ? isSameMonth(day, selectedDate) : true;
            
            return (
              <div
                key={day.toISOString()}
                className={`border rounded-xl p-2 min-h-[220px] ${
                  isToday ? 'border-sky-300 bg-sky-50/30' : 'border-slate-200 bg-white'
                } ${!isInMonth ? 'opacity-50' : ''}`}
              >
                {view === 'month' && (
                  <div className="text-xs font-semibold text-slate-500 mb-2">
                    {format(day, 'd')}
                  </div>
                )}
                {view === 'day' && (
                  <div className="text-xs font-semibold text-slate-500 mb-2">
                    {format(day, 'EEEE, MMM d')}
                  </div>
                )}
                {dayRentals.length > 0 ? (
                  <div className="space-y-2">
                    {dayRentals.map((rental) => {
                      const customerName = getCustomerName(rental);
                      const serviceName = getServiceName(rental);
                      const durationLabel = getDurationLabel(rental);
                      const serviceLabel = durationLabel ? `${serviceName} • ${durationLabel}` : serviceName;
                      return (
                        <Tooltip
                          key={rental.id}
                          title={
                            <div>
                              <div className="font-semibold">{customerName}</div>
                              <div className="text-xs">{serviceLabel}</div>
                            </div>
                          }
                        >
                          <div className="p-2 bg-orange-50 border border-orange-200 rounded-lg text-xs cursor-pointer hover:bg-orange-100 transition-colors">
                            <div className="flex items-center gap-1 text-orange-700 font-medium">
                              <ToolOutlined className="flex-shrink-0" />
                              <span className="truncate">{customerName}</span>
                            </div>
                            <div className="text-orange-600 mt-1 truncate">
                              {serviceLabel}
                            </div>
                            <Tag
                              size="small"
                              color={getStatusColor(rental.status)}
                              className="mt-1"
                            >
                              {rental.status}
                            </Tag>
                          </div>
                        </Tooltip>
                      );
                    })}
                  </div>
                ) : (
                  <div className="h-full flex items-center justify-center text-slate-300 text-xs">
                    No rentals
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default RentalsCalendarView;
