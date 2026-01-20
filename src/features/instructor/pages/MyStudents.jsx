import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useInstructorStudents } from '../hooks/useInstructorStudents';

const fmtDate = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};

const fmtTime = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
};

const MyStudents = () => {
  const navigate = useNavigate();
  const { students, loading, error, refetch } = useInstructorStudents();
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState({ field: 'totalHours', dir: 'desc' });

  const filtered = useMemo(() => {
    let list = students;
    if (query) {
      const q = query.toLowerCase();
      list = list.filter(s => (s.name || '').toLowerCase().includes(q));
    }
    const { field, dir } = sort;
    list = [...list].sort((a, b) => {
      const av = a[field] ?? 0; const bv = b[field] ?? 0;
      if (av === bv) return 0;
      return dir === 'asc' ? (av > bv ? 1 : -1) : (av < bv ? 1 : -1);
    });
    return list;
  }, [students, query, sort]);

  const toggleSort = (field) => {
    setSort(s => s.field === field ? { field, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { field, dir: 'desc' });
  };

  return (
    <div className="space-y-6 p-4 md:p-6 max-w-6xl">
      <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">My Students</h1>
          <p className="text-slate-600 dark:text-slate-300 mt-1 text-sm">Hours, lessons, progress & upcoming sessions.</p>
        </div>
        <div className="flex gap-3 items-center">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search students..."
            className="px-4 py-2 rounded-lg border border-indigo-100 dark:border-slate-600 bg-white shadow-sm text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400/70"
          />
          <button
            onClick={refetch}
            className="px-4 py-2 rounded-md text-sm font-medium bg-slate-900 text-white border border-slate-800 hover:bg-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700 transition-colors shadow-sm"
          >
            Refresh
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/70 backdrop-blur p-0 overflow-hidden shadow-xl">
        {loading && (
          <div className="p-6 flex items-center gap-3 text-slate-600"><div className="spinner" /><span>Loading students...</span></div>
        )}
        {error && (
          <div className="p-6 text-sm text-red-700 bg-red-50 border-b border-red-200">{error}</div>
        )}
        {!loading && !error && filtered.length === 0 && (
          <div className="p-8 text-center text-slate-500 text-sm">No students found.</div>
        )}
        {!loading && !error && filtered.length > 0 && (
          <div className="overflow-auto">
            <table className="min-w-full text-sm">
              <thead className="text-xs uppercase tracking-wide text-white bg-slate-900/95 dark:bg-slate-800 border-b border-slate-700">
                <tr>
                  <th className="text-left px-4 py-3 font-semibold">Student</th>
                  <th className="text-left px-4 py-3 font-semibold">Skill</th>
                  <th onClick={() => toggleSort('totalLessonCount')} className="text-left px-4 py-3 font-semibold cursor-pointer select-none">Lessons {sort.field==='totalLessonCount' ? (sort.dir==='asc'?'▲':'▼') : ''}</th>
                  <th onClick={() => toggleSort('totalHours')} className="text-left px-4 py-3 font-semibold cursor-pointer select-none">Hours {sort.field==='totalHours' ? (sort.dir==='asc'?'▲':'▼') : ''}</th>
                  <th className="text-left px-4 py-3 font-semibold">Last</th>
                  <th className="text-left px-4 py-3 font-semibold">Next</th>
                  <th className="text-left px-4 py-3 font-semibold w-48">Progress</th>
                </tr>
              </thead>
              <tbody className="bg-slate-50/60 dark:bg-slate-800/40">
                {filtered.map((s, idx) => (
                  <tr key={s.studentId} className={`border-b last:border-b-0 border-slate-200/70 dark:border-slate-700/60 ${idx % 2 === 0 ? 'bg-white dark:bg-slate-900/60' : 'bg-slate-100/80 dark:bg-slate-800/60'}`}>
                    <td className="px-4 py-3 font-semibold text-slate-900 dark:text-slate-100 whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => navigate(`/instructor/students/${s.studentId}`)}
                        className="hover:underline"
                      >
                        {s.name}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{s.skillLevel || '—'}</td>
                    <td className="px-4 py-3 text-slate-700 dark:text-slate-200">{s.totalLessonCount}</td>
                    <td className="px-4 py-3 text-slate-700 dark:text-slate-200">{s.totalHours}</td>
                    <td className="px-4 py-3 text-slate-500 dark:text-slate-400">{fmtDate(s.lastLessonAt)}</td>
                    <td className="px-4 py-3 text-slate-500 dark:text-slate-400">{fmtTime(s.upcomingLessonAt)}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-1">
                        <div className="w-full h-2.5 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-emerald-400 via-teal-500 to-sky-500 transition-all"
                            style={{ width: `${s.progressPercent}%` }}
                          />
                        </div>
                        <div className="flex justify-between text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-400"><span>{s.progressPercent}%</span><span>20h Goal</span></div>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <div className="text-[11px] text-slate-500 italic">Progress heuristic: hours / 20. Will refine with real goal data once available.</div>
    </div>
  );
};

export default MyStudents;
