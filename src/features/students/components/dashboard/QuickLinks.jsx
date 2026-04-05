import { useNavigate } from 'react-router-dom';
import { CalendarDaysIcon, AcademicCapIcon, CreditCardIcon } from '@heroicons/react/24/outline';

const links = [
  { to: '/student/schedule', label: 'My Schedule', icon: CalendarDaysIcon, color: 'text-[#00a8c4] bg-sky-50'    },
  { to: '/student/courses',  label: 'My Courses',  icon: AcademicCapIcon,  color: 'text-emerald-600 bg-emerald-50' },
  { to: '/student/payments', label: 'Payments',    icon: CreditCardIcon,   color: 'text-violet-600 bg-violet-50'  },
];

const QuickLinks = () => {
  const navigate = useNavigate();
  return (
    <section>
      <h3 className="mb-3 font-duotone-bold text-sm uppercase tracking-[0.12em] text-antrasit">Quick access</h3>
      <div className="grid grid-cols-3 gap-3">
        {links.map(({ to, label, icon: Icon, color }) => (
          <button
            key={to}
            type="button"
            onClick={() => navigate(to)}
            className="flex flex-col items-center gap-2 rounded-2xl border border-slate-100 bg-white px-3 py-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
          >
            <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${color}`}>
              <Icon className="h-5 w-5" />
            </span>
            <span className="font-gotham-medium text-[11px] text-slate-600">{label}</span>
          </button>
        ))}
      </div>
    </section>
  );
};

export default QuickLinks;
