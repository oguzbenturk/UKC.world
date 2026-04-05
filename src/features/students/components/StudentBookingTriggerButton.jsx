import PropTypes from 'prop-types';
import { CalendarDaysIcon } from '@heroicons/react/24/outline';

const variantClassMap = {
  light: 'border-white/40 bg-white/20 text-white shadow-inner hover:bg-white/30 focus-visible:ring-white/70',
  solid: 'border-slate-200 bg-white text-slate-700 shadow hover:bg-slate-50 focus-visible:ring-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700',
  navbar: 'border-slate-200 bg-white text-slate-700 shadow-sm hover:bg-slate-100 focus-visible:ring-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700'
};

const StudentBookingTriggerButton = ({ onClick, variant = 'light', className = '', label = 'Book Lesson', icon: Icon = CalendarDaysIcon }) => {
  const classes = variantClassMap[variant] || variantClassMap.light;
  const ariaLabel = 'Open booking wizard';

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      className={`inline-flex items-center justify-center gap-2 rounded-2xl border px-4 py-2 text-sm font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent ${classes} ${className}`}
    >
      <Icon className="h-5 w-5" aria-hidden />
      <span>{label}</span>
    </button>
  );
};

StudentBookingTriggerButton.propTypes = {
  onClick: PropTypes.func,
  variant: PropTypes.oneOf(['light', 'solid', 'navbar']),
  className: PropTypes.string,
  label: PropTypes.string,
  icon: PropTypes.elementType
};

export default StudentBookingTriggerButton;
