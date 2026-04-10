const StudentCheckInPanel = ({ students = [], loading = false, onSelect }) => {
  const placeholders = Array.from({ length: 4 }, (_, index) => `placeholder-${index}`);

  return (
    <section className="rounded-xl md:rounded-2xl border border-slate-200 bg-white shadow-sm p-3 sm:p-5 space-y-2 sm:space-y-3">
      <header>
        <h2 className="text-sm sm:text-base font-semibold text-slate-900">Students to check in</h2>
        <p className="text-[10px] sm:text-xs text-slate-400">Reconnect with inactive learners.</p>
      </header>

      {loading && !students.length ? (
        <div className="space-y-2">
          {placeholders.map((key) => (
            <div key={key} className="h-12 sm:h-14 rounded-lg bg-slate-100/70 animate-pulse" />
          ))}
        </div>
      ) : !students.length ? (
        <div className="rounded-lg bg-emerald-50 border border-emerald-100 px-3 py-3 text-center">
          <p className="text-xs sm:text-sm text-emerald-700">Great job! Everyone has booked recently.</p>
        </div>
      ) : (
        <ul className="space-y-1.5 sm:space-y-2">
          {students.map((student) => (
            <li key={student.studentId} className="rounded-lg sm:rounded-xl border border-slate-100 bg-white px-3 py-2.5 sm:px-4 sm:py-3 hover:bg-slate-50/50 transition">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                  <div className="h-7 w-7 sm:h-8 sm:w-8 rounded-full bg-gradient-to-br from-amber-100 to-amber-200 flex items-center justify-center text-amber-700 text-[10px] sm:text-xs font-semibold shrink-0">
                    {(student.name || '?')[0].toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs sm:text-sm font-semibold text-slate-900 truncate">{student.name}</p>
                    <p className="text-[10px] sm:text-xs text-slate-400">
                      {student.lastLessonAt
                        ? `Last ${new Date(student.lastLessonAt).toLocaleDateString()}`
                        : 'No lessons yet'}
                    </p>
                  </div>
                </div>
                <div className="text-right text-[10px] sm:text-xs text-slate-400 tabular-nums shrink-0 ml-2">
                  <p>{student.completedLessons} lessons</p>
                  <p>{student.totalHours}h</p>
                </div>
              </div>
              <div className="mt-2 flex gap-2 ml-9 sm:ml-11">
                <button
                  type="button"
                  onClick={() => onSelect?.(student.studentId)}
                  className="inline-flex items-center rounded-md bg-sky-500 hover:bg-sky-600 active:scale-95 text-white px-2.5 py-1 sm:px-3 sm:py-1.5 text-[10px] sm:text-xs font-medium transition shadow-sm shadow-sky-500/20"
                >
                  View
                </button>
                <button
                  type="button"
                  className="inline-flex items-center rounded-md border border-slate-200 px-2.5 py-1 sm:px-3 sm:py-1.5 text-[10px] sm:text-xs text-slate-500 hover:bg-slate-50 active:scale-95 transition"
                  onClick={() => {
                    if (typeof window !== 'undefined') {
                      window.dispatchEvent(new CustomEvent('instructor-dashboard:compose-message', {
                        detail: { studentId: student.studentId },
                      }));
                    }
                  }}
                >
                  Message
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};

export default StudentCheckInPanel;
