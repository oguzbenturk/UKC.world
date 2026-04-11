import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronDownIcon } from '@heroicons/react/24/outline';
import dayjs from 'dayjs';

const DEFAULT_VISIBLE = 5;

/* ── tiny helpers (adapted from StudentSchedule) ── */

const pickFirst = (...values) => {
  for (const v of values) {
    if (v !== undefined && v !== null && v !== '') return v;
  }
  return null;
};

const resolveLessonName = (l) => pickFirst(l?.service?.name, l?.lessonType, 'Lesson');
const resolveInstructorName = (l) => pickFirst(l?.instructor?.name, l?.instructorName, '—');
const resolveStatus = (l) => pickFirst(l?.status, 'scheduled');

const resolveDate = (l) => {
  const raw = pickFirst(l?.startTime, l?.date);
  return raw ? dayjs(raw).format('ddd, MMM D') : 'TBD';
};

const statusCls = {
  completed: 'bg-emerald-50 text-emerald-700',
  scheduled: 'bg-sky-50 text-sky-700',
  pending:   'bg-amber-50 text-amber-700',
  cancelled: 'bg-slate-100 text-slate-500',
};

/* ── row ── */

const LessonRow = ({ lesson, onClick }) => {
  const status = resolveStatus(lesson);
  return (
    <tr
      onClick={onClick}
      className="cursor-pointer hover:bg-slate-50 transition-colors border-b border-slate-100 last:border-b-0"
    >
      <td className="px-4 py-2.5 font-gotham-medium text-xs text-slate-600 whitespace-nowrap">{resolveDate(lesson)}</td>
      <td className="px-4 py-2.5 font-duotone-bold text-xs text-slate-900">{resolveLessonName(lesson)}</td>
      <td className="px-4 py-2.5 text-xs text-slate-500 whitespace-nowrap">{resolveInstructorName(lesson)}</td>
      <td className="px-4 py-2.5 text-right whitespace-nowrap">
        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-gotham-medium uppercase tracking-wider ${statusCls[status] || statusCls.scheduled}`}>
          {status}
        </span>
      </td>
    </tr>
  );
};

/* ── collapsible sub-section ── */

const LessonGroup = ({ label, lessons, defaultExpanded }) => {
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [showAll, setShowAll] = useState(false);

  if (!lessons || lessons.length === 0) {
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
            No {label.toLowerCase()} lessons
          </div>
        )}
      </div>
    );
  }

  const visible = showAll ? lessons : lessons.slice(0, DEFAULT_VISIBLE);
  const remaining = lessons.length - DEFAULT_VISIBLE;

  return (
    <div className="border border-slate-100 rounded-2xl overflow-hidden shadow-sm">
      <button
        onClick={() => setExpanded((p) => !p)}
        className="w-full px-4 py-3 flex items-center justify-between gap-3 bg-white hover:bg-slate-50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <h3 className="font-duotone-bold text-sm text-slate-900 uppercase tracking-wide">{label}</h3>
          <span className="text-[10px] font-gotham-medium text-slate-400">{lessons.length}</span>
        </div>
        <ChevronDownIcon className={`h-5 w-5 text-slate-400 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`} />
      </button>

      {expanded && (
        <div className="border-t border-slate-100 bg-slate-50/30">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="px-4 py-2 text-left text-[10px] font-gotham-medium uppercase tracking-wider text-slate-400 w-[110px]">Date</th>
                <th className="px-4 py-2 text-left text-[10px] font-gotham-medium uppercase tracking-wider text-slate-400">Lesson</th>
                <th className="px-4 py-2 text-left text-[10px] font-gotham-medium uppercase tracking-wider text-slate-400 w-[130px]">Instructor</th>
                <th className="px-4 py-2 text-right text-[10px] font-gotham-medium uppercase tracking-wider text-slate-400 w-[100px]">Status</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((lesson, i) => (
                <LessonRow
                  key={lesson?.bookingId || lesson?.id || i}
                  lesson={lesson}
                  onClick={() => navigate('/student/schedule')}
                />
              ))}
            </tbody>
          </table>

          {/* show more */}
          {remaining > 0 && !showAll && (
            <button
              type="button"
              onClick={() => setShowAll(true)}
              className="w-full py-2.5 text-xs font-gotham-medium text-sky-600 hover:text-sky-700 hover:bg-sky-50/50 transition-colors"
            >
              Show more ({remaining})
            </button>
          )}
        </div>
      )}
    </div>
  );
};

/* ── main export ── */

const LessonsSection = ({ upcoming = [], past = [] }) => {
  if (upcoming.length === 0 && past.length === 0) return null;

  return (
    <div className="space-y-3">
      <LessonGroup label="Upcoming" lessons={upcoming} defaultExpanded />
      <LessonGroup label="Past" lessons={past} defaultExpanded={false} />
    </div>
  );
};

export default LessonsSection;
