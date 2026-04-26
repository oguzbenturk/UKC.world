import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useInstructorStudents } from '../hooks/useInstructorStudents';

const fmtDateTime = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
};

const MyStudents = () => {
  const { t } = useTranslation(['instructor']);
  const navigate = useNavigate();
  const { students, loading, error, refetch } = useInstructorStudents();
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState({ field: 'totalHours', dir: 'desc' });

  const filtered = useMemo(() => {
    let list = students;
    if (query) {
      const q = query.toLowerCase();
      list = list.filter(s =>
        (s.name || '').toLowerCase().includes(q) ||
        (s.skillLevel || '').toLowerCase().includes(q)
      );
    }
    const { field, dir } = sort;
    list = [...list].sort((a, b) => {
      const av = Number(a[field] ?? 0);
      const bv = Number(b[field] ?? 0);
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
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900">{t('instructor:myStudents.title')}</h1>
          <p className="text-slate-600 mt-1 text-sm">{t('instructor:myStudents.subtitle')}</p>
        </div>
        <div className="flex gap-3 items-center">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('instructor:myStudents.searchPlaceholder')}
            className="px-4 py-2 rounded-lg border border-indigo-100 bg-white shadow-sm text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400/70"
          />
          <button
            onClick={refetch}
            className="px-4 py-2 rounded-md text-sm font-medium bg-sky-600 text-white border border-sky-600 hover:bg-sky-500 transition-colors shadow-sm"
          >
            {t('instructor:myStudents.refresh')}
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-0 overflow-hidden shadow-xl">
        {loading && (
          <div className="p-6 flex items-center gap-3 text-slate-600"><div className="spinner" /><span>{t('instructor:myStudents.loading')}</span></div>
        )}
        {error && (
          <div className="p-6 text-sm text-red-700 bg-red-50 border-b border-red-200">{error}</div>
        )}
        {!loading && !error && filtered.length === 0 && (
          <div className="p-8 text-center text-slate-500 text-sm">{t('instructor:myStudents.noStudents')}</div>
        )}
        {!loading && !error && filtered.length > 0 && (
          <div className="overflow-auto">
            <table className="min-w-full text-sm">
              <thead className="text-xs uppercase tracking-wide text-slate-700 bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="text-left px-4 py-3 font-semibold">{t('instructor:myStudents.columns.student')}</th>
                  <th className="text-left px-4 py-3 font-semibold">{t('instructor:myStudents.columns.skill')}</th>
                  <th onClick={() => toggleSort('totalLessonCount')} className="text-left px-4 py-3 font-semibold cursor-pointer select-none">{t('instructor:myStudents.columns.lessons')} {sort.field==='totalLessonCount' ? (sort.dir==='asc'?'▲':'▼') : ''}</th>
                  <th onClick={() => toggleSort('totalHours')} className="text-left px-4 py-3 font-semibold cursor-pointer select-none">{t('instructor:myStudents.columns.hours')} {sort.field==='totalHours' ? (sort.dir==='asc'?'▲':'▼') : ''}</th>
                  <th className="text-left px-4 py-3 font-semibold">{t('instructor:myStudents.columns.last')}</th>
                  <th className="text-left px-4 py-3 font-semibold">{t('instructor:myStudents.columns.next')}</th>
                  <th className="text-left px-4 py-3 font-semibold w-48">{t('instructor:myStudents.columns.progress')}</th>
                </tr>
              </thead>
              <tbody className="bg-slate-50/60">
                {filtered.map((s, idx) => (
                  <tr key={s.studentId} className={`border-b last:border-b-0 border-slate-200/70 ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-100/80'}`}>
                    <td className="px-4 py-3 font-semibold text-slate-900 whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => navigate(`/instructor/students/${s.studentId}`)}
                        className="hover:underline"
                      >
                        {s.name}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{s.skillLevel || '—'}</td>
                    <td className="px-4 py-3 text-slate-700">{s.totalLessonCount}</td>
                    <td className="px-4 py-3 text-slate-700">{Number(s.totalHours).toFixed(1)}h</td>
                    <td className="px-4 py-3 text-slate-500">{fmtDateTime(s.lastLessonAt)}</td>
                    <td className="px-4 py-3 text-slate-500">{fmtDateTime(s.upcomingLessonAt)}</td>
                    <td className="px-4 py-3">
                      {s.packageHours?.totalHours > 0 ? (
                        <div className="flex flex-col gap-1">
                          <div className="w-full h-2.5 rounded-full bg-slate-200 overflow-hidden">
                            <div
                              className="h-full bg-gradient-to-r from-emerald-400 via-teal-500 to-sky-500 transition-all"
                              style={{ width: `${s.progressPercent}%` }}
                            />
                          </div>
                          <div className="flex justify-between text-[10px] uppercase tracking-wide text-slate-500">
                            <span>{s.progressPercent}%</span>
                            <span>{t('instructor:myStudents.progressLabel', { remaining: s.packageHours.remainingHours, total: s.packageHours.totalHours })}</span>
                          </div>
                        </div>
                      ) : (
                        <span className="text-[11px] text-slate-400 italic">{t('instructor:myStudents.noActivePackage')}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default MyStudents;
