import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronDownIcon, CalendarDaysIcon, ViewColumnsIcon, Squares2X2Icon, ListBulletIcon } from '@heroicons/react/24/outline';

/**
 * CalendarViewSwitcher - A reusable view switcher component for calendar pages
 * 
 * @param {Object} props
 * @param {string} props.currentView - Current active view ('day', 'week', 'month', 'list', 'calendar')
 * @param {function} props.onViewChange - Callback when view changes
 * @param {Array} props.views - Array of view options to show
 * @param {string} props.listPath - Path to navigate for list view
 * @param {string} props.calendarPath - Path to navigate for calendar view
 * @param {string} props.size - Size variant ('default', 'large')
 */
const CalendarViewSwitcher = ({ 
  currentView = 'list',
  onViewChange,
  views = ['list', 'calendar'],
  listPath,
  calendarPath,
  size = 'default'
}) => {
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);
  const navigate = useNavigate();

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setOpen(false);
      }
    };
    if (open) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  // Close on Escape key
  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    if (open) {
      document.addEventListener('keydown', handleEscape);
    }
    return () => document.removeEventListener('keydown', handleEscape);
  }, [open]);

  const allViewOptions = {
    list: { 
      key: 'list', 
      label: 'List View', 
      shortLabel: 'List',
      Icon: ListBulletIcon,
      description: 'View all items in a table'
    },
    calendar: { 
      key: 'calendar', 
      label: 'Calendar View', 
      shortLabel: 'Calendar',
      Icon: CalendarDaysIcon,
      description: 'View items on a calendar'
    },
    day: { 
      key: 'day', 
      label: 'Daily View', 
      shortLabel: 'Daily',
      Icon: CalendarDaysIcon,
      description: 'View by day'
    },
    week: { 
      key: 'week', 
      label: '9x9 View', 
      shortLabel: '9x9',
      Icon: ViewColumnsIcon,
      description: 'Weekly grid view'
    },
    month: { 
      key: 'month', 
      label: 'Monthly View', 
      shortLabel: 'Monthly',
      Icon: Squares2X2Icon,
      description: 'Monthly overview'
    }
  };

  const availableViews = views.map(v => allViewOptions[v]).filter(Boolean);

  const currentOption = allViewOptions[currentView] || allViewOptions.list;

  const handleViewSelect = (viewKey) => {
    setOpen(false);
    
    // Handle navigation for list view
    if (viewKey === 'list' && listPath) {
      navigate(listPath);
      return;
    }
    
    // Handle navigation for calendar view (generic)
    if (viewKey === 'calendar' && calendarPath) {
      navigate(calendarPath);
      return;
    }
    
    // Handle navigation for specific calendar views (day, week, month)
    if (['day', 'week', 'month'].includes(viewKey) && calendarPath) {
      navigate(`${calendarPath}?view=${viewKey}`);
      return;
    }
    
    // For other views or when no path is specified, call the callback
    if (onViewChange) {
      onViewChange(viewKey);
    }
  };

  const isLarge = size === 'large';

  return (
    <div ref={containerRef} className="relative view-dropdown-container">
      <button
        type="button"
        className={`
          inline-flex items-center gap-2 rounded-xl font-semibold
          border-2 border-sky-500 text-sky-700 bg-sky-50/50
          hover:bg-sky-100/70 hover:border-sky-600
          shadow-sm
          focus:outline-none focus:ring-2 focus:ring-sky-400 focus:ring-offset-1
          active:translate-y-px transition-all
          ${isLarge ? 'h-11 px-4 text-sm' : 'h-9 px-3 text-xs sm:text-sm'}
        `}
        onClick={() => setOpen(!open)}
      >
        <currentOption.Icon className={`${isLarge ? 'h-5 w-5' : 'h-4 w-4'} text-sky-600`} />
        <span className="hidden sm:inline">{currentOption.label}</span>
        <span className="sm:hidden">{currentOption.shortLabel}</span>
        <ChevronDownIcon className={`${isLarge ? 'h-4 w-4' : 'h-3.5 w-3.5'} text-sky-500 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute left-0 mt-2 w-56 bg-white border border-slate-200 rounded-xl shadow-xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-150">
          <div className="p-1">
            {availableViews.map((option) => (
              <button
                key={option.key}
                type="button"
                className={`
                  w-full text-left px-3 py-2.5 rounded-lg text-sm flex items-center gap-3 transition-colors
                  ${currentView === option.key 
                    ? 'bg-sky-50 text-sky-700' 
                    : 'text-slate-700 hover:bg-slate-50'
                  }
                `}
                onClick={() => handleViewSelect(option.key)}
              >
                <div className={`
                  flex h-8 w-8 items-center justify-center rounded-lg
                  ${currentView === option.key ? 'bg-sky-100' : 'bg-slate-100'}
                `}>
                  <option.Icon className={`h-4 w-4 ${currentView === option.key ? 'text-sky-600' : 'text-slate-500'}`} />
                </div>
                <div className="flex-1">
                  <div className={`font-medium ${currentView === option.key ? 'text-sky-700' : 'text-slate-900'}`}>
                    {option.label}
                  </div>
                  <div className="text-xs text-slate-500">{option.description}</div>
                </div>
                {currentView === option.key && (
                  <div className="text-sky-600 text-lg">✓</div>
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default CalendarViewSwitcher;
