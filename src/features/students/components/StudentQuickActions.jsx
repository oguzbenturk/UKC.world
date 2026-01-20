import { useState, useEffect, useRef, useCallback } from 'react';
import PropTypes from 'prop-types';
import { useNavigate } from 'react-router-dom';
import { Badge } from 'antd';
import {
  PlusIcon,
  WalletIcon,
  CalendarDaysIcon,
  HomeModernIcon,
  ShoppingBagIcon,
  StarIcon,
  GiftIcon,
  UserGroupIcon,
  UsersIcon,
} from '@heroicons/react/24/outline';
import { useCurrency } from '@/shared/contexts/CurrencyContext';

const ActionItem = ({ icon: Icon, label, description, badge, onClick, variant = 'default' }) => {
  const isHighlight = variant === 'highlight';

  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full px-4 py-2.5 flex items-center gap-3 text-left text-sm transition-colors ${
        isHighlight
          ? 'text-amber-700 hover:bg-amber-50'
          : 'text-slate-700 hover:bg-slate-100/80'
      }`}
    >
      <span
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
          isHighlight
            ? 'bg-gradient-to-br from-amber-400 to-orange-500 text-white'
            : 'bg-gradient-to-br from-sky-500 via-sky-600 to-indigo-600 text-white'
        }`}
      >
        <Icon className="h-5 w-5" aria-hidden />
      </span>
      <div className="flex flex-1 flex-col">
        <span className="font-medium">{label}</span>
        {description && (
          <span className="text-xs text-slate-500">{description}</span>
        )}
      </div>
      {badge ? (
        <Badge count={badge} size="small" />
      ) : null}
    </button>
  );
};

ActionItem.propTypes = {
  icon: PropTypes.elementType.isRequired,
  label: PropTypes.string.isRequired,
  description: PropTypes.string,
  badge: PropTypes.number,
  onClick: PropTypes.func.isRequired,
  variant: PropTypes.oneOf(['default', 'highlight']),
};

const StudentQuickActions = ({
  onOpenWallet,
  onOpenBooking,
  onBookAccommodation,
  onBookRental,
  onBuyPackage,
  onRateLesson,
  ratingsCount = 0,
  currency,
  balance,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef(null);
  const navigate = useNavigate();
  const { formatCurrency, convertCurrency, businessCurrency, userCurrency } = useCurrency();

  // Storage currency is always EUR
  const storageCurrency = businessCurrency || 'EUR';
  const showDualCurrency = storageCurrency !== userCurrency && convertCurrency;

  // Click outside to close
  useEffect(() => {
    if (!isOpen) return undefined;

    const handleClickOutside = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  // Escape to close
  useEffect(() => {
    if (!isOpen) return undefined;

    const handleEscape = (event) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen]);

  const handleAction = useCallback((action) => {
    setIsOpen(false);
    action?.();
  }, []);

  const hasRatings = ratingsCount > 0;
  const totalBadge = hasRatings ? ratingsCount : 0;

  // Format wallet label with dual currency
  const walletLabel = balance !== undefined
    ? (() => {
        if (showDualCurrency) {
          const converted = convertCurrency(balance, storageCurrency, userCurrency);
          return `${formatCurrency(balance, storageCurrency)} / ${formatCurrency(converted, userCurrency)}`;
        }
        return `${currency?.symbol || '€'}${balance.toFixed(2)}`;
      })()
    : 'Wallet';

  return (
    <div
      ref={containerRef}
      className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-4"
    >
      {/* Dropdown panel */}
      {isOpen && (
        <div className="w-72 overflow-hidden rounded-2xl border border-white/60 bg-white/95 shadow-xl ring-1 ring-slate-200/80 backdrop-blur animate-in fade-in slide-in-from-bottom-4 duration-200">
          <div className="border-b border-slate-100/80 px-4 py-3">
            <p className="text-[10px] uppercase tracking-wider text-slate-500">Quick actions</p>
            <p className="truncate text-sm font-semibold text-slate-800">What would you like to do?</p>
          </div>
          <div className="max-h-80 overflow-y-auto py-2">
            <ActionItem
              icon={WalletIcon}
              label={walletLabel}
              description="View balance & transactions"
              onClick={() => handleAction(onOpenWallet)}
            />
            <ActionItem
              icon={CalendarDaysIcon}
              label="Book"
              description="Schedule your next session"
              onClick={() => handleAction(onOpenBooking)}
            />
            <ActionItem
              icon={HomeModernIcon}
              label="Book Accommodation"
              description="Find a place to stay"
              onClick={() => handleAction(onBookAccommodation)}
            />
            <ActionItem
              icon={ShoppingBagIcon}
              label="Book Rental"
              description="Rent equipment"
              onClick={() => handleAction(onBookRental)}
            />
            <ActionItem
              icon={GiftIcon}
              label="Buy Package"
              description="Purchase lesson packages"
              onClick={() => handleAction(onBuyPackage)}
            />
            <ActionItem
              icon={UserGroupIcon}
              label="Group Lessons"
              description="View & manage group bookings"
              onClick={() => handleAction(() => navigate('/student/group-bookings'))}
            />
            <ActionItem
              icon={UsersIcon}
              label="Friends"
              description="Manage friends for group bookings"
              onClick={() => handleAction(() => navigate('/student/friends'))}
            />
            {hasRatings && (
              <>
                <div className="my-2 border-t border-slate-100" />
                <ActionItem
                  icon={StarIcon}
                  label={`Rate ${ratingsCount} lesson${ratingsCount > 1 ? 's' : ''}`}
                  description="Share your experience"
                  badge={ratingsCount}
                  onClick={() => handleAction(onRateLesson)}
                  variant="highlight"
                />
              </>
            )}
          </div>
        </div>
      )}

      {/* FAB Button */}
      <Badge count={totalBadge} offset={[-8, 8]}>
        <button
          type="button"
          onClick={() => setIsOpen((prev) => !prev)}
          className="group relative h-14 w-14 animate-bounce-slow rounded-full shadow-2xl ring-1 ring-slate-500/25 transition-transform duration-200 hover:scale-105 hover:animate-none active:scale-95 md:h-16 md:w-16"
          style={{ marginBottom: 'env(keyboard-inset-height, 0px)' }}
          aria-haspopup="menu"
          aria-expanded={isOpen}
          aria-label={isOpen ? 'Close quick actions' : 'Open quick actions'}
        >
          {/* Background gradient */}
          <div className="absolute inset-0 rounded-full bg-gradient-to-br from-sky-500 via-sky-600 to-indigo-600" />
          {/* Glow effect */}
          <div className="absolute -inset-1 rounded-full bg-sky-500/30 blur-md group-hover:bg-sky-400/40 transition-colors" />
          {/* Icon */}
          <div className="relative flex h-full w-full items-center justify-center text-white">
            <PlusIcon className={`h-7 w-7 transition-transform duration-200 ${isOpen ? 'rotate-45' : ''}`} />
          </div>
        </button>
      </Badge>
    </div>
  );
};

StudentQuickActions.propTypes = {
  onOpenWallet: PropTypes.func.isRequired,
  onOpenBooking: PropTypes.func.isRequired,
  onBookAccommodation: PropTypes.func.isRequired,
  onBookRental: PropTypes.func.isRequired,
  onBuyPackage: PropTypes.func,
  onRateLesson: PropTypes.func,
  ratingsCount: PropTypes.number,
  currency: PropTypes.shape({
    code: PropTypes.string,
    symbol: PropTypes.string,
  }),
  balance: PropTypes.number,
};

export default StudentQuickActions;
