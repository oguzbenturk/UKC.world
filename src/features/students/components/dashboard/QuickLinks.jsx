import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { CalendarDaysIcon, ShoppingBagIcon, AcademicCapIcon, WrenchScrewdriverIcon } from '@heroicons/react/24/outline';
import { featureFlags } from '@/shared/config/featureFlags';

const QuickLinks = () => {
  const navigate = useNavigate();
  const { t } = useTranslation(['student']);

  const allLinks = [
    { to: '/academy',          labelKey: 'student:dashboard.quickLinks.visitLessons',    icon: AcademicCapIcon,        color: 'text-[#00a8c4] bg-sky-50'       },
    { to: '/rental',           labelKey: 'student:dashboard.quickLinks.visitRentals',    icon: WrenchScrewdriverIcon,   color: 'text-amber-600 bg-amber-50'     },
    { to: '/shop',             labelKey: 'student:dashboard.quickLinks.visitShop',       icon: ShoppingBagIcon,         color: 'text-violet-600 bg-violet-50', requiresPublicShop: true },
    { to: '/student/schedule', labelKey: 'student:dashboard.quickLinks.visitMyLessons',  icon: CalendarDaysIcon,        color: 'text-emerald-600 bg-emerald-50' },
  ];

  const links = allLinks.filter((l) => !l.requiresPublicShop || featureFlags.publicShopEnabled);
  return (
    <section>
      <h3 className="mb-3 font-duotone-bold text-sm uppercase tracking-[0.12em] text-antrasit">{t('student:dashboard.quickLinks.sectionHeading')}</h3>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {links.map(({ to, labelKey, icon: Icon, color }) => (
          <button
            key={to}
            type="button"
            onClick={() => navigate(to)}
            className="flex flex-col items-center gap-2 rounded-2xl border border-slate-100 bg-white px-3 py-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
          >
            <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${color}`}>
              <Icon className="h-5 w-5" />
            </span>
            <span className="font-gotham-medium text-[11px] text-slate-600">{t(labelKey)}</span>
          </button>
        ))}
      </div>
    </section>
  );
};

export default QuickLinks;
