import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { CalendarDaysIcon, ClockIcon, UserIcon } from '@heroicons/react/24/outline';

const ProgressRing = ({ percent = 0 }) => {
  const radius = 40;
  const stroke = 6;
  const normalizedRadius = radius - stroke / 2;
  const circumference = normalizedRadius * 2 * Math.PI;
  const strokeDashoffset = circumference - (percent / 100) * circumference;

  return (
    <div className="relative flex items-center justify-center">
      <svg height={radius * 2} width={radius * 2} className="-rotate-90">
        <circle stroke="#e2e8f0" fill="transparent" strokeWidth={stroke} r={normalizedRadius} cx={radius} cy={radius} />
        <circle
          stroke="#1E3A8A"
          fill="transparent"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${circumference} ${circumference}`}
          style={{ strokeDashoffset, transition: 'stroke-dashoffset 0.6s ease' }}
          r={normalizedRadius}
          cx={radius}
          cy={radius}
        />
      </svg>
      <span className="absolute font-duotone-bold text-lg text-slate-900">{Math.round(percent)}%</span>
    </div>
  );
};

const parseSessionDate = (session) => {
  const candidate = session?.startTime || session?.date;
  if (!candidate) return null;
  try {
    const parsed = new Date(candidate);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  } catch {
    return null;
  }
};

const NextLessonHero = ({ nextSession, completionPercent = 0 }) => {
  const navigate = useNavigate();
  const sessionDate = useMemo(() => parseSessionDate(nextSession), [nextSession]);

  if (!nextSession) {
    return (
      <section className="rounded-3xl border border-slate-200/60 bg-gradient-to-br from-sky-50 via-white to-emerald-50/30 p-6 shadow-sm sm:p-8">
        <div className="flex flex-col items-center gap-4 text-center sm:flex-row sm:text-left">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-sky-100">
            <CalendarDaysIcon className="h-7 w-7 text-[#1E3A8A]" />
          </div>
          <div className="flex-1">
            <h2 className="font-duotone-bold-extended text-xl text-slate-900">Your kite is waiting</h2>
            <p className="mt-1 font-duotone-regular text-sm text-slate-500">No lessons on the horizon yet — book one to get started.</p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-3xl border border-slate-200/60 bg-gradient-to-br from-sky-50 via-white to-emerald-50/30 p-6 shadow-sm sm:p-8">
      <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex-1 space-y-3">
          <p className="font-gotham-medium text-[10px] uppercase tracking-widest text-[#1E3A8A]">Next lesson</p>
          <h2 className="font-duotone-bold-extended text-2xl text-slate-900 sm:text-3xl">
            {sessionDate ? format(sessionDate, 'EEEE, MMM d') : 'Coming soon'}
          </h2>
          <div className="flex flex-wrap items-center gap-4 text-sm text-slate-600">
            {sessionDate && (
              <span className="inline-flex items-center gap-1.5">
                <ClockIcon className="h-4 w-4 text-slate-400" />
                <span className="font-gotham-medium">{format(sessionDate, 'HH:mm')}</span>
              </span>
            )}
            {nextSession.instructor?.name && (
              <span className="inline-flex items-center gap-1.5">
                <UserIcon className="h-4 w-4 text-slate-400" />
                <span className="font-gotham-medium">{nextSession.instructor.name}</span>
              </span>
            )}
          </div>
          {nextSession.service?.name && (
            <span className="inline-flex items-center rounded-full bg-emerald-50 px-3 py-1 text-[11px] font-gotham-medium uppercase tracking-wider text-emerald-700">
              {nextSession.service.name}
            </span>
          )}
        </div>
        <div className="flex flex-col items-center gap-2">
          <ProgressRing percent={completionPercent} />
          <span className="font-gotham-medium text-[10px] uppercase tracking-widest text-slate-400">Progress</span>
        </div>
      </div>
    </section>
  );
};

export default NextLessonHero;
