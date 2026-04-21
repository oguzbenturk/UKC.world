import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ChevronDownIcon } from '@heroicons/react/24/outline';
import dayjs from 'dayjs';

const DEFAULT_VISIBLE = 5;

const pickFirst = (...values) => {
  for (const v of values) {
    if (v !== undefined && v !== null && v !== '') return v;
  }
  return null;
};

const resolveEquipmentName = (r) => pickFirst(r?.equipmentNames, r?.equipment_names, 'Equipment');
const resolveStatus = (r) => pickFirst(r?.status, 'active');

const resolveDate = (r) => {
  const raw = pickFirst(r?.startDate, r?.start_date);
  return raw ? dayjs(raw).format('ddd, MMM D') : 'TBD';
};

const resolveDuration = (r) => {
  const start = pickFirst(r?.startDate, r?.start_date);
  const end = pickFirst(r?.endDate, r?.end_date);
  if (!start || !end) return '—';
  const days = Math.max(1, dayjs(end).diff(dayjs(start), 'day'));
  return days === 1 ? '1 day' : `${days} days`;
};

const statusCls = {
  completed: 'bg-emerald-50 text-emerald-700',
  returned:  'bg-emerald-50 text-emerald-700',
  closed:    'bg-emerald-50 text-emerald-700',
  active:    'bg-sky-50 text-sky-700',
  in_progress: 'bg-sky-50 text-sky-700',
  pending:   'bg-amber-50 text-amber-700',
  cancelled: 'bg-slate-100 text-slate-500',
};

const RentalRow = ({ rental, onClick }) => {
  const status = resolveStatus(rental);
  return (
    <tr
      onClick={onClick}
      className="cursor-pointer hover:bg-slate-50 transition-colors border-b border-slate-100 last:border-b-0"
    >
      <td className="px-4 py-2.5 font-gotham-medium text-xs text-slate-600 whitespace-nowrap">{resolveDate(rental)}</td>
      <td className="px-4 py-2.5 font-duotone-bold text-xs text-slate-900 truncate">{resolveEquipmentName(rental)}</td>
      <td className="px-4 py-2.5 text-xs text-slate-500 whitespace-nowrap">{resolveDuration(rental)}</td>
      <td className="px-4 py-2.5 text-center whitespace-nowrap">
        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-gotham-medium uppercase tracking-wider ${statusCls[status] || statusCls.active}`}>
          {status}
        </span>
      </td>
    </tr>
  );
};

const RentalGroup = ({ label, labelKey, rentals, defaultExpanded }) => {
  const navigate = useNavigate();
  const { t } = useTranslation(['student']);
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [showAll, setShowAll] = useState(false);

  if (!rentals || rentals.length === 0) {
    return (
      <div className="border border-slate-100 rounded-2xl overflow-hidden shadow-sm">
        <button
          onClick={() => setExpanded((p) => !p)}
          className="w-full px-4 py-3 flex items-center justify-between gap-3 bg-white hover:bg-slate-50 transition-colors"
        >
          <h3 className="font-duotone-bold text-sm text-slate-900 uppercase tracking-wide">{label}</h3>
          <ChevronDownIcon className={`h-5 w-5 text-slate-400 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`} />
        </button>
        {expanded && (
          <div className="border-t border-slate-100 px-4 py-6 text-center text-xs text-slate-400">
            {t('student:dashboard.rentalsSection.noRentals', { label: labelKey ? t(labelKey).toLowerCase() : label.toLowerCase() })}
          </div>
        )}
      </div>
    );
  }

  const visible = showAll ? rentals : rentals.slice(0, DEFAULT_VISIBLE);
  const remaining = rentals.length - DEFAULT_VISIBLE;

  return (
    <div className="border border-slate-100 rounded-2xl overflow-hidden shadow-sm">
      <button
        onClick={() => setExpanded((p) => !p)}
        className="w-full px-4 py-3 flex items-center justify-between gap-3 bg-white hover:bg-slate-50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <h3 className="font-duotone-bold text-sm text-slate-900 uppercase tracking-wide">{label}</h3>
          <span className="text-[10px] font-gotham-medium text-slate-400">{rentals.length}</span>
        </div>
        <ChevronDownIcon className={`h-5 w-5 text-slate-400 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`} />
      </button>

      {expanded && (
        <div className="border-t border-slate-100 bg-slate-50/30">
          <table className="w-full border-collapse table-fixed">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="w-1/4 px-4 py-2 text-left text-[10px] font-gotham-medium uppercase tracking-wider text-slate-400">{t('student:dashboard.rentalsSection.columns.date')}</th>
                <th className="w-1/4 px-4 py-2 text-left text-[10px] font-gotham-medium uppercase tracking-wider text-slate-400">{t('student:dashboard.rentalsSection.columns.equipment')}</th>
                <th className="w-1/4 px-4 py-2 text-left text-[10px] font-gotham-medium uppercase tracking-wider text-slate-400">{t('student:dashboard.rentalsSection.columns.duration')}</th>
                <th className="w-1/4 px-4 py-2 text-center text-[10px] font-gotham-medium uppercase tracking-wider text-slate-400">{t('student:dashboard.rentalsSection.columns.status')}</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((rental, i) => (
                <RentalRow
                  key={rental?.id || i}
                  rental={rental}
                  onClick={() => navigate('/rental/book-equipment')}
                />
              ))}
            </tbody>
          </table>

          {remaining > 0 && !showAll && (
            <button
              type="button"
              onClick={() => setShowAll(true)}
              className="w-full py-2.5 text-xs font-gotham-medium text-sky-600 hover:text-sky-700 hover:bg-sky-50/50 transition-colors"
            >
              {t('student:dashboard.rentalsSection.showMore', { count: remaining })}
            </button>
          )}
        </div>
      )}
    </div>
  );
};

const RentalsSection = ({ upcoming = [], past = [] }) => {
  const { t } = useTranslation(['student']);
  if (upcoming.length === 0 && past.length === 0) return null;

  return (
    <div className="space-y-3">
      <RentalGroup label={t('student:dashboard.rentalsSection.upcomingLabel')} labelKey="student:dashboard.rentalsSection.upcomingLabel" rentals={upcoming} defaultExpanded />
      <RentalGroup label={t('student:dashboard.rentalsSection.pastLabel')} labelKey="student:dashboard.rentalsSection.pastLabel" rentals={past} defaultExpanded={false} />
    </div>
  );
};

export default RentalsSection;
