import { useState, useEffect, useRef } from 'react';
import PropTypes from 'prop-types';
import { PlusIcon, ArrowLeftIcon } from '@heroicons/react/24/outline';

function FloatingActionLauncher({ title, subtitle, actions, className, backAction }) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    const handleClickOutside = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    const handleEscape = (event) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen]);

  if (!actions || actions.length === 0) {
    return null;
  }

  return (
    <div
      ref={containerRef}
      className={`fixed bottom-6 right-6 z-50 flex flex-col items-end gap-4 ${className || ''}`.trim()}
    >
      {isOpen && (
        <div className="w-64 rounded-2xl bg-white/95 backdrop-blur border border-white/60 shadow-xl ring-1 ring-slate-200/80 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100/80">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[10px] uppercase tracking-wider text-slate-500">{title || 'Quick actions'}</p>
                {subtitle && <p className="text-sm font-semibold text-slate-800 truncate">{subtitle}</p>}
              </div>
              {backAction && (
                <button
                  type="button"
                  onClick={() => {
                    setIsOpen(false);
                    backAction.onClick();
                  }}
                  className="inline-flex items-center gap-1 px-3 h-9 rounded-full bg-white/90 shadow-sm ring-1 ring-slate-200 text-slate-500 hover:text-slate-700 hover:bg-white transition-colors"
                  title={backAction.tooltip || 'Back'}
                  aria-label={backAction.ariaLabel || 'Back'}
                >
                  {(backAction.icon && <backAction.icon className="h-4 w-4" />) || (
                    <ArrowLeftIcon className="h-4 w-4" />
                  )}
                  <span className="text-xs font-medium tracking-wide uppercase">Go back</span>
                </button>
              )}
            </div>
          </div>
          <div className="py-2 max-h-80 overflow-y-auto">
            {actions.map((action) => {
              const Icon = action.icon;
              return (
                <button
                  key={action.key}
                  type="button"
                  onClick={() => {
                    setIsOpen(false);
                    action.onClick();
                  }}
                  className={`w-full px-4 py-2.5 flex items-center gap-3 text-left text-sm transition-colors ${
                    action.danger
                      ? 'text-red-600 hover:bg-red-50'
                      : 'text-slate-700 hover:bg-slate-100/80'
                  }`}
                >
                  <span
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 ${
                      action.danger
                        ? 'bg-red-50 text-red-500'
                        : action.iconClassName || 'text-sky-500'
                    }`}
                  >
                    {Icon ? <Icon className="text-base" /> : '+'}
                  </span>
                  <div className="flex flex-col">
                    <span className="font-medium">{action.label}</span>
                    {action.description && (
                      <span className="text-xs text-slate-500">{action.description}</span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="group relative h-14 w-14 rounded-full shadow-2xl ring-1 ring-slate-500/25 transition-transform duration-200 hover:scale-105 active:scale-95 md:h-16 md:w-16"
        style={{ marginBottom: 'env(keyboard-inset-height, 0px)' }}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-label={isOpen ? 'Close quick actions' : 'Open quick actions'}
      >
        <div className="absolute inset-0 rounded-full bg-gradient-to-b from-slate-800 to-slate-700" />
        <div className="absolute -inset-1 rounded-full blur-md bg-sky-500/30 group-hover:bg-sky-400/30" />
        <div className="relative flex h-full w-full items-center justify-center text-slate-100">
          <PlusIcon className={`h-6 w-6 transition-transform duration-200 ${isOpen ? 'rotate-45' : ''}`} />
        </div>
      </button>
    </div>
  );
}

FloatingActionLauncher.propTypes = {
  title: PropTypes.string,
  subtitle: PropTypes.string,
  actions: PropTypes.arrayOf(
    PropTypes.shape({
      key: PropTypes.string.isRequired,
      label: PropTypes.string.isRequired,
      description: PropTypes.string,
      icon: PropTypes.elementType,
      iconClassName: PropTypes.string,
      danger: PropTypes.bool,
      onClick: PropTypes.func.isRequired
    })
  ),
  className: PropTypes.string,
  backAction: PropTypes.shape({
    onClick: PropTypes.func.isRequired,
    icon: PropTypes.elementType,
    tooltip: PropTypes.string,
    ariaLabel: PropTypes.string
  })
};

export default FloatingActionLauncher;
