import { Link } from 'react-router-dom';

/**
 * QuickActionCard - A modern card component for dashboard quick actions
 * Each card represents a service/feature with quick access buttons
 */
const QuickActionCard = ({ 
  title, 
  description, 
  icon: Icon, 
  color = 'blue',
  primaryAction,
  secondaryActions = [],
  stats = null
}) => {
  // Color variants for the cards
  const colorClasses = {
    blue: {
      bg: 'bg-gradient-to-br from-blue-50 to-blue-100/50',
      border: 'border-blue-200/50',
      iconBg: 'bg-blue-500',
      iconText: 'text-white',
      accent: 'text-blue-600',
      hover: 'hover:border-blue-300',
      button: 'bg-blue-600 hover:bg-blue-700',
      buttonSecondary: 'text-blue-600 hover:bg-blue-50'
    },
    emerald: {
      bg: 'bg-gradient-to-br from-emerald-50 to-emerald-100/50',
      border: 'border-emerald-200/50',
      iconBg: 'bg-emerald-500',
      iconText: 'text-white',
      accent: 'text-emerald-600',
      hover: 'hover:border-emerald-300',
      button: 'bg-emerald-600 hover:bg-emerald-700',
      buttonSecondary: 'text-emerald-600 hover:bg-emerald-50'
    },
    orange: {
      bg: 'bg-gradient-to-br from-orange-50 to-orange-100/50',
      border: 'border-orange-200/50',
      iconBg: 'bg-orange-500',
      iconText: 'text-white',
      accent: 'text-orange-600',
      hover: 'hover:border-orange-300',
      button: 'bg-orange-600 hover:bg-orange-700',
      buttonSecondary: 'text-orange-600 hover:bg-orange-50'
    },
    violet: {
      bg: 'bg-gradient-to-br from-violet-50 to-violet-100/50',
      border: 'border-violet-200/50',
      iconBg: 'bg-violet-500',
      iconText: 'text-white',
      accent: 'text-violet-600',
      hover: 'hover:border-violet-300',
      button: 'bg-violet-600 hover:bg-violet-700',
      buttonSecondary: 'text-violet-600 hover:bg-violet-50'
    },
    pink: {
      bg: 'bg-gradient-to-br from-pink-50 to-pink-100/50',
      border: 'border-pink-200/50',
      iconBg: 'bg-pink-500',
      iconText: 'text-white',
      accent: 'text-pink-600',
      hover: 'hover:border-pink-300',
      button: 'bg-pink-600 hover:bg-pink-700',
      buttonSecondary: 'text-pink-600 hover:bg-pink-50'
    },
    cyan: {
      bg: 'bg-gradient-to-br from-cyan-50 to-cyan-100/50',
      border: 'border-cyan-200/50',
      iconBg: 'bg-cyan-500',
      iconText: 'text-white',
      accent: 'text-cyan-600',
      hover: 'hover:border-cyan-300',
      button: 'bg-cyan-600 hover:bg-cyan-700',
      buttonSecondary: 'text-cyan-600 hover:bg-cyan-50'
    },
    amber: {
      bg: 'bg-gradient-to-br from-amber-50 to-amber-100/50',
      border: 'border-amber-200/50',
      iconBg: 'bg-amber-500',
      iconText: 'text-white',
      accent: 'text-amber-600',
      hover: 'hover:border-amber-300',
      button: 'bg-amber-600 hover:bg-amber-700',
      buttonSecondary: 'text-amber-600 hover:bg-amber-50'
    },
    teal: {
      bg: 'bg-gradient-to-br from-teal-50 to-teal-100/50',
      border: 'border-teal-200/50',
      iconBg: 'bg-teal-500',
      iconText: 'text-white',
      accent: 'text-teal-600',
      hover: 'hover:border-teal-300',
      button: 'bg-teal-600 hover:bg-teal-700',
      buttonSecondary: 'text-teal-600 hover:bg-teal-50'
    },
    rose: {
      bg: 'bg-gradient-to-br from-rose-50 to-rose-100/50',
      border: 'border-rose-200/50',
      iconBg: 'bg-rose-500',
      iconText: 'text-white',
      accent: 'text-rose-600',
      hover: 'hover:border-rose-300',
      button: 'bg-rose-600 hover:bg-rose-700',
      buttonSecondary: 'text-rose-600 hover:bg-rose-50'
    },
    slate: {
      bg: 'bg-gradient-to-br from-slate-50 to-slate-100/50',
      border: 'border-slate-200/50',
      iconBg: 'bg-slate-600',
      iconText: 'text-white',
      accent: 'text-slate-600',
      hover: 'hover:border-slate-300',
      button: 'bg-slate-600 hover:bg-slate-700',
      buttonSecondary: 'text-slate-600 hover:bg-slate-50'
    }
  };

  const colors = colorClasses[color] || colorClasses.blue;

  return (
    <div 
      className={`
        rounded-2xl border ${colors.border} ${colors.bg} ${colors.hover}
        p-5 transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5
        flex flex-col h-full
      `}
    >
      {/* Header */}
      <div className="flex items-start gap-4 mb-4">
        <div className={`p-3 rounded-xl ${colors.iconBg} ${colors.iconText} shadow-sm`}>
          {Icon && <Icon className="w-6 h-6" />}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className={`text-lg font-semibold ${colors.accent} truncate`}>{title}</h3>
          <p className="text-sm text-slate-500 mt-0.5 line-clamp-2">{description}</p>
        </div>
      </div>

      {/* Stats (optional) */}
      {stats && (
        <div className="grid grid-cols-2 gap-3 mb-4 pb-4 border-b border-slate-200/50">
          {stats.map((stat, index) => (
            <div key={index} className="text-center">
              <div className={`text-xl font-bold ${colors.accent}`}>{stat.value}</div>
              <div className="text-xs text-slate-500">{stat.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Actions */}
      <div className="mt-auto space-y-2">
        {/* Primary Action */}
        {primaryAction && (
          <Link 
            to={primaryAction.to}
            className={`
              block w-full text-center py-2.5 px-4 rounded-xl text-white font-medium
              ${colors.button} transition-colors shadow-sm
            `}
          >
            {primaryAction.label}
          </Link>
        )}
        
        {/* Secondary Actions */}
        {secondaryActions.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {secondaryActions.map((action, index) => (
              <Link
                key={index}
                to={action.to}
                className={`
                  flex-1 min-w-[45%] text-center py-2 px-3 rounded-lg text-sm font-medium
                  ${colors.buttonSecondary} transition-colors border border-transparent
                  hover:border-current
                `}
              >
                {action.label}
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default QuickActionCard;
