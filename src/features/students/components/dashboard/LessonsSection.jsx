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
const resolveInstructorName = (l) => pickFirst(l?.instructor?.name, l?.instructorName, 'TBD');
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
    <button
      type="button"
      onClick={onClick}
      className="w-full grid grid-cols-[1fr_1.2fr_1fr_auto] gap-2 items-center px-4 py-2.5 text-left text-xs hover:bg-slate-50 transition-colors"
    >
      <span className="font-gotham-medium text-slate-600 truncate">{resolveDate(lesson)}</span>
      <span className="font-duotone-bold text-slate-900 truncate">{resolveLessonName(lesson)}</span>
      <span className="text-slate-500 truncate">{resolveInstructorName(lesson)}</span>
      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-gotham-medium uppercase tracking-wider ${statusCls[status] || statusCls.scheduled}`}>
        {status}
      </span>
    </button>
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
          {/* header */}
          <div className="grid grid-cols-[1fr_1.2fr_1fr_auto] gap-2 px-4 py-2 text-[10px] font-gotham-medium uppercase tracking-wider text-slate-400 border-b border-slate-100">
            <span>Date</span>
            <span>Lesson</span>
            <span>Instructor</span>
            <span>Status</span>
          </div>

          {/* rows */}
          <div className="divide-y divide-slate-100">
            {visible.map((lesson, i) => (
              <LessonRow
                key={lesson?.bookingId || lesson?.id || i}
                lesson={lesson}
                onClick={() => navigate('/student/schedule')}
              />
            ))}
          </div>

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
