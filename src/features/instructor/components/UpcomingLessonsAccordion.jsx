import { Disclosure, Transition } from '@headlessui/react';
import { ChevronDownIcon } from '@heroicons/react/24/outline';
import { Fragment } from 'react';
import { format } from 'date-fns';

const formatLessonTime = (startTime) => {
  if (!startTime) return 'TBD';
  const date = new Date(startTime);
  if (Number.isNaN(date.getTime())) return 'TBD';
  return format(date, 'HH:mm');
};

const LessonRow = ({ lesson }) => (
  <div className="flex items-center justify-between rounded-xl border border-slate-200 dark:border-slate-800 px-4 py-3 bg-white dark:bg-slate-900/60">
    <div>
      <p className="text-sm font-semibold text-slate-900 dark:text-white">{lesson.studentName}</p>
      <p className="text-xs text-slate-500">{lesson.status}</p>
    </div>
    <div className="text-right">
      <p className="text-sm font-medium text-slate-700 dark:text-slate-200">{formatLessonTime(lesson.startTime)}</p>
      <p className="text-xs text-slate-500">{lesson.durationHours}h</p>
    </div>
  </div>
);

const UpcomingLessonsAccordion = ({ groupedLessons = [], loading = false }) => {
  const placeholders = Array.from({ length: 3 }, (_, index) => `placeholder-${index}`);

  return (
    <section className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/70 shadow-sm p-6 space-y-3">
      <header className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Upcoming lessons</h2>
          <p className="text-xs text-slate-500">Plan ahead with quick access to session details.</p>
        </div>
        <span className="hidden sm:block text-xs text-slate-500">
          Next {groupedLessons.reduce((acc, g) => acc + g.lessons.length, 0)} sessions
        </span>
      </header>

      {loading && !groupedLessons.length ? (
        <div className="space-y-3">
          {placeholders.map((key) => (
            <div key={key} className="h-16 rounded-xl bg-slate-100 dark:bg-slate-800 animate-pulse" />
          ))}
        </div>
      ) : !groupedLessons.length ? (
        <p className="text-sm text-slate-500">No future lessons are scheduled at the moment.</p>
      ) : (
        <div className="space-y-2">
          {groupedLessons.map((group) => (
            <Disclosure key={group.label} as={Fragment}>
              {({ open }) => (
                <div className="rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
                  <Disclosure.Button className="flex w-full items-center justify-between bg-slate-50 dark:bg-slate-900/40 px-4 py-3 text-sm font-medium text-slate-700 dark:text-slate-200">
                    <span>{group.label}</span>
                    <div className="flex items-center gap-3 text-xs text-slate-500">
                      <span>{group.lessons.length} sessions</span>
                      <ChevronDownIcon
                        className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`}
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
                    <Disclosure.Panel className="space-y-2 bg-white dark:bg-slate-900/60 px-4 py-3">
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
