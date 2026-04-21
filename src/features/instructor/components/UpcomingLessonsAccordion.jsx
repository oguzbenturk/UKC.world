import { Disclosure, Transition } from '@headlessui/react';
import { ChevronDownIcon } from '@heroicons/react/24/outline';
import { Fragment } from 'react';
import { format } from 'date-fns';
import { useTranslation } from 'react-i18next';

const formatLessonTime = (startTime) => {
  if (!startTime) return 'TBD';
  const date = new Date(startTime);
  if (Number.isNaN(date.getTime())) return 'TBD';
  return format(date, 'HH:mm');
};

const statusStyles = {
  completed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  confirmed: 'bg-sky-50 text-sky-700 border-sky-200',
  pending: 'bg-amber-50 text-amber-700 border-amber-200',
  cancelled: 'bg-rose-50 text-rose-700 border-rose-200',
};

const getStatusStyle = (status) => {
  const key = (status || '').toLowerCase();
  return statusStyles[key] || 'bg-slate-50 text-slate-600 border-slate-200';
};

const LessonRow = ({ lesson }) => (
  <div className="flex items-center justify-between rounded-lg sm:rounded-xl border border-slate-100 px-3 py-2 sm:px-4 sm:py-3 bg-white hover:bg-slate-50/50 transition">
    <div className="flex items-center gap-2 sm:gap-3 min-w-0">
      <div className="h-7 w-7 sm:h-8 sm:w-8 rounded-full bg-sky-50 flex items-center justify-center text-sky-600 text-[10px] sm:text-xs font-semibold shrink-0">
        {(lesson.studentName || '?')[0].toUpperCase()}
      </div>
      <div className="min-w-0">
        <p className="text-xs sm:text-sm font-semibold text-slate-900 truncate">{lesson.studentName}</p>
        <span className={`inline-flex items-center rounded-full border px-1.5 sm:px-2 py-px sm:py-0.5 text-[9px] sm:text-[10px] font-medium uppercase tracking-wide ${getStatusStyle(lesson.status)}`}>
          {lesson.status}
        </span>
      </div>
    </div>
    <div className="text-right shrink-0 ml-2">
      <p className="text-xs sm:text-sm font-semibold text-slate-800 tabular-nums">{formatLessonTime(lesson.startTime)}</p>
      <p className="text-[10px] sm:text-xs text-slate-400">{lesson.durationHours}h</p>
    </div>
  </div>
);

const UpcomingLessonsAccordion = ({ groupedLessons = [], loading = false }) => {
  const { t } = useTranslation(['instructor']);
  const placeholders = Array.from({ length: 3 }, (_, index) => `placeholder-${index}`);
  const totalSessions = groupedLessons.reduce((acc, g) => acc + g.lessons.length, 0);

  return (
    <section className="rounded-xl md:rounded-2xl border border-slate-200 bg-white shadow-sm p-3 sm:p-5 space-y-2 sm:space-y-3">
      <header className="flex items-center justify-between">
        <h2 className="text-sm sm:text-base font-semibold text-slate-900">{t('instructor:lessons.upcomingLessons')}</h2>
        <span className="hidden sm:inline-flex items-center rounded-full bg-sky-50 text-sky-700 px-2.5 py-1 text-xs font-medium">
          {totalSessions} {totalSessions === 1 ? t('instructor:lessons.session') : t('instructor:lessons.sessions')}
        </span>
      </header>

      {loading && !groupedLessons.length ? (
        <div className="space-y-3">
          {placeholders.map((key) => (
            <div key={key} className="h-16 rounded-xl bg-slate-100/70 animate-pulse" />
          ))}
        </div>
      ) : !groupedLessons.length ? (
        <div className="rounded-xl bg-slate-50 px-4 py-6 text-center">
          <p className="text-sm text-slate-500">{t('instructor:lessons.noLessonsScheduled')}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {groupedLessons.map((group) => (
            <Disclosure key={group.label} as={Fragment}>
              {({ open }) => (
                <div className={`rounded-xl border overflow-hidden transition ${open ? 'border-sky-200 bg-sky-50/30' : 'border-slate-100'}`}>
                  <Disclosure.Button className={`flex w-full items-center justify-between px-4 py-3 text-sm font-medium transition ${open ? 'text-sky-800 bg-sky-50/50' : 'text-slate-700 bg-slate-50/50 hover:bg-slate-50'}`}>
                    <span>{group.label}</span>
                    <div className="flex items-center gap-2.5 text-xs text-slate-500">
                      <span className="tabular-nums">{group.lessons.length} {group.lessons.length === 1 ? t('instructor:lessons.session') : t('instructor:lessons.sessions')}</span>
                      <ChevronDownIcon
                        className={`h-4 w-4 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
                      />
                    </div>
                  </Disclosure.Button>
                  <Transition
                    enter="transition duration-150 ease-out"
                    enterFrom="transform scale-y-95 opacity-0"
                    enterTo="transform scale-y-100 opacity-100"
                    leave="transition duration-100 ease-in"
                    leaveFrom="transform scale-y-100 opacity-100"
                    leaveTo="transform scale-y-95 opacity-0"
                  >
                    <Disclosure.Panel className="space-y-2 bg-white px-4 py-3">
                      {group.lessons.map((lesson) => (
                        <LessonRow key={lesson.id} lesson={lesson} />
                      ))}
                    </Disclosure.Panel>
                  </Transition>
                </div>
              )}
            </Disclosure>
          ))}
        </div>
      )}
    </section>
  );
};

export default UpcomingLessonsAccordion;
