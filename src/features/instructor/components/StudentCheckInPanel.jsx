const StudentCheckInPanel = ({ students = [], loading = false, onSelect }) => {
  const placeholders = Array.from({ length: 4 }, (_, index) => `placeholder-${index}`);

  return (
    <section className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/70 shadow-sm p-6 space-y-4">
      <header>
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Students to check in</h2>
        <p className="text-xs text-slate-500">Reconnect with learners who have been inactive recently.</p>
      </header>

      {loading && !students.length ? (
        <div className="space-y-3">
          {placeholders.map((key) => (
            <div key={key} className="h-14 rounded-xl bg-slate-100 dark:bg-slate-800 animate-pulse" />
          ))}
        </div>
      ) : !students.length ? (
        <p className="text-sm text-slate-500">Great job! Everyone has booked recently.</p>
      ) : (
        <ul className="space-y-3">
          {students.map((student) => (
            <li key={student.studentId} className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 px-4 py-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">{student.name}</p>
                  <p className="text-xs text-slate-500">
                    {student.lastLessonAt
                      ? `Last lesson ${new Date(student.lastLessonAt).toLocaleDateString()}`
                      : 'No lessons yet'}
                  </p>
                </div>
                <div className="text-right text-xs text-slate-500">
                  <p>{student.completedLessons} lessons</p>
                  <p>{student.totalHours} hours</p>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => onSelect?.(student.studentId)}
                  className="inline-flex items-center rounded-md bg-emerald-500 hover:bg-emerald-600 text-white px-3 py-1.5 text-xs font-medium transition"
                >
                  View profile
                </button>
                <button
                  type="button"
                  className="inline-flex items-center rounded-md border border-slate-200 dark:border-slate-600 px-3 py-1.5 text-xs text-slate-600 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition"
                  onClick={() => {
                    if (typeof window !== 'undefined') {
                      window.dispatchEvent(new CustomEvent('instructor-dashboard:compose-message', {
                        detail: { studentId: student.studentId },
                      }));
                    }
                  }}
                >
                  Send message
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
