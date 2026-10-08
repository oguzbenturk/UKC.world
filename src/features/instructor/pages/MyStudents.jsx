/**
 * Instructor "My students" (/instructor/students).
 * Data: GET /instructors/me/students (backend/services/instructorService.js).
 *
 * Search (name / level / phone, "/" to focus on desktop), filter chips with
 * counts (All · Lesson booked · Low on hours · Inactive), sort, and a list
 * grouped by the day of the next lesson. Search, filter and sort live in the
 * URL so the back button from a student profile restores the view.
 */
import { useCallback, useMemo } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { usePullToRefresh } from '@/shared/hooks/usePullToRefresh';
import { EmptyState, ErrorState, SkeletonBlock } from '../earnings/components/ui';
import { cardClass, secondaryButtonClass } from '../earnings/components/earningsStyles';
import { useIsDesktop } from '../earnings/useEarnings';
import { useChatBridge } from '../dashboard/useDashboard';
import { FILTERS, SORTS, countByFilter, groupStudents, selectStudents } from '../students/studentsFormat';
import { studentKeys, useStudentsList } from '../students/useStudents';
import StudentsToolbar from '../students/components/StudentsToolbar';
import StudentList from '../students/components/StudentList';
import { UsersIcon } from '../students/components/StudentsIcons';

function useListParams() {
  const [params, setParams] = useSearchParams();
  const query = params.get('q') || '';
  const filter = FILTERS.includes(params.get('filter')) ? params.get('filter') : 'all';
  const sort = SORTS.includes(params.get('sort')) ? params.get('sort') : 'next';
  const set = useCallback((key, value, fallback) => {
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      if (!value || value === fallback) next.delete(key);
      else next.set(key, value);
      return next;
    }, { replace: true });
  }, [setParams]);
  return {
    query,
    filter,
    sort,
    setQuery: (v) => set('q', v, ''),
    setFilter: (v) => set('filter', v, 'all'),
    setSort: (v) => set('sort', v, 'next'),
    // One update: consecutive setParams calls don't compose.
    clearSearchAndFilter: () => setParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete('q');
      next.delete('filter');
      return next;
    }, { replace: true }),
  };
}

function ListSkeleton({ isDesktop }) {
  const { t } = useTranslation(['instructor']);
  return (
    <div role="status" aria-live="polite" data-testid="students-skeleton" className={`${cardClass} divide-y divide-slate-100 overflow-hidden`}>
      <span className="sr-only">{t('instructor:students.loading')}</span>
      {Array.from({ length: isDesktop ? 8 : 6 }, (_, i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-3.5">
          <SkeletonBlock className="h-12 w-12 rounded-2xl" />
          <div className="flex flex-1 flex-col gap-2">
            <SkeletonBlock className="h-4 w-40" />
            <SkeletonBlock className="h-3 w-28" />
          </div>
          <SkeletonBlock className="h-10 w-10 rounded-full" />
        </div>
      ))}
    </div>
  );
}

function Header({ total, upcoming, isDesktop }) {
  const { t } = useTranslation(['instructor']);
  return (
    <header className={`flex flex-col gap-0.5 ${isDesktop ? '' : 'px-1'}`}>
      <h1 className="font-duotone-bold-extended text-2xl tracking-tight text-slate-900 lg:text-3xl">{t('instructor:students.title')}</h1>
      {total != null && (
        <p className="text-sm text-slate-600 lg:text-base">
          {total
            ? [t('instructor:students.summary.total', { count: total }), upcoming ? t('instructor:students.summary.upcoming', { count: upcoming }) : null].filter(Boolean).join(' · ')
            : t('instructor:students.subtitle')}
        </p>
      )}
    </header>
  );
}

export default function MyStudents() {
  const { t } = useTranslation(['instructor']);
  const isDesktop = useIsDesktop();
  const queryClient = useQueryClient();
  const location = useLocation();
  const listQuery = useStudentsList();
  const chat = useChatBridge();
  const { query, filter, sort, setQuery, setFilter, setSort, clearSearchAndFilter } = useListParams();

  usePullToRefresh(() => queryClient.invalidateQueries({ queryKey: studentKeys.list() }), { threshold: 90, maxScroll: 30 });

  const students = useMemo(() => (Array.isArray(listQuery.data) ? listQuery.data : []), [listQuery.data]);
  const counts = useMemo(() => countByFilter(students), [students]);
  const visible = useMemo(() => selectStudents(students, { query, filter, sort }), [students, query, filter, sort]);
  const groups = useMemo(() => groupStudents(visible, sort), [visible, sort]);

  let body;
  if (listQuery.isError && !listQuery.data) {
    body = (
      <ErrorState
        title={t('instructor:students.error.title')}
        body={t('instructor:students.error.body')}
        retryLabel={t('instructor:students.error.retry')}
        onRetry={() => listQuery.refetch()}
      />
    );
  } else if (listQuery.isLoading) {
    body = <ListSkeleton isDesktop={isDesktop} />;
  } else if (!students.length) {
    body = (
      <EmptyState
        className={`${cardClass} px-6 py-14`}
        icon={<UsersIcon size={20} />}
        title={t('instructor:students.empty.title')}
        hint={t('instructor:students.empty.body')}
      />
    );
  } else if (!visible.length) {
    body = (
      <div className={`${cardClass} flex flex-col items-center gap-3 px-6 py-12 text-center`}>
        <p className="text-sm font-medium text-slate-700">{t('instructor:students.noMatch.title')}</p>
        <p className="text-xs text-slate-500">{t('instructor:students.noMatch.body')}</p>
        <button type="button" onClick={clearSearchAndFilter} className={`${secondaryButtonClass} h-10 text-sm`}>
          {t('instructor:students.noMatch.clear')}
        </button>
      </div>
    );
  } else {
    body = (
      <StudentList
        groups={groups}
        isDesktop={isDesktop}
        sort={sort}
        onSortChange={setSort}
        onMessage={chat.messageStudent}
        opening={chat.openingFor}
        linkState={{ listSearch: location.search }}
      />
    );
  }

  return (
    <div
      data-testid="instructor-students-page"
      data-layout={isDesktop ? 'desktop' : 'mobile'}
      className={`mx-auto flex w-full flex-col ${isDesktop ? 'max-w-7xl gap-5 p-6 xl:p-8' : 'max-w-xl gap-3.5 px-4 pb-8 pt-4'}`}
    >
      <Header total={listQuery.data ? students.length : null} upcoming={counts.upcoming} isDesktop={isDesktop} />
      {students.length > 0 && (
        <StudentsToolbar
          query={query}
          onQueryChange={setQuery}
          filter={filter}
          onFilterChange={setFilter}
          sort={sort}
          onSortChange={setSort}
          counts={counts}
          isDesktop={isDesktop}
        />
      )}
      {body}
    </div>
  );
}
