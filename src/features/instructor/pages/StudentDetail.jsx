/**
 * Instructor student profile (/instructor/students/:id).
 * Data: GET /instructors/me/students/:id/profile + /notes
 * (backend/services/instructorService.js, instructorNotesService.js).
 *
 * Contact-card hero (message / call / WhatsApp / email, package hours ring,
 * key numbers), then the skill path, lesson notes, lessons, level + staff note
 * and recommendations. Mobile splits these into tabs (kept in ?tab=);
 * desktop shows them in two columns.
 */
import { useCallback } from 'react';
import { Link, useLocation, useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ErrorState, SkeletonBlock } from '../earnings/components/ui';
import { cardClass } from '../earnings/components/earningsStyles';
import { useIsDesktop } from '../earnings/useEarnings';
import { useChatBridge } from '../dashboard/useDashboard';
import { useStudentActions, useStudentProfile } from '../students/useStudents';
import StudentHero from '../students/components/StudentHero';
import SkillPath from '../students/components/SkillPath';
import NotesPanel from '../students/components/NotesPanel';
import LessonsPanel from '../students/components/LessonsPanel';
import AboutPanel from '../students/components/AboutPanel';
import RecommendationsPanel from '../students/components/RecommendationsPanel';
import { ArrowLeftIcon } from '../students/components/StudentsIcons';

const TABS = ['overview', 'skills', 'notes', 'picks'];

// Back to the list with the search / filter / sort it was opened from.
function BackLink() {
  const { t } = useTranslation(['instructor']);
  const location = useLocation();
  const listSearch = typeof location.state?.listSearch === 'string' ? location.state.listSearch : '';
  return (
    <Link
      to={`/instructor/students${listSearch}`}
      className="inline-flex h-10 w-fit items-center gap-1.5 rounded-xl pr-3 text-sm font-semibold text-slate-600 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00798c]"
    >
      <ArrowLeftIcon size={18} />
      {t('instructor:students.back')}
    </Link>
  );
}

function ProfileSkeleton({ isDesktop }) {
  const { t } = useTranslation(['instructor']);
  return (
    <div role="status" aria-live="polite" data-testid="student-skeleton" className="flex flex-col gap-4">
      <span className="sr-only">{t('instructor:students.loading')}</span>
      <div className={`${cardClass} flex flex-col gap-4 p-5`}>
        <div className="flex items-center gap-4">
          <SkeletonBlock className="h-16 w-16 rounded-2xl" />
          <div className="flex flex-col gap-2"><SkeletonBlock className="h-6 w-48" /><SkeletonBlock className="h-4 w-28" /></div>
        </div>
        <SkeletonBlock className="h-16 w-full" />
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">{[0, 1, 2, 3].map((i) => <SkeletonBlock key={i} className="h-16" />)}</div>
      </div>
      <div className={`grid gap-4 ${isDesktop ? 'grid-cols-2' : ''}`}>
        <SkeletonBlock className="h-72 rounded-2xl" />
        {isDesktop && <SkeletonBlock className="h-72 rounded-2xl" />}
      </div>
    </div>
  );
}

function Tabs({ value, onChange }) {
  const { t } = useTranslation(['instructor']);
  return (
    <div className="sticky top-0 z-10 -mx-4 bg-slate-50/95 px-4 py-2 backdrop-blur">
      <div role="tablist" aria-label={t('instructor:students.tabs.label')} className="grid grid-cols-4 gap-1 rounded-2xl border border-slate-200 bg-slate-100 p-1">
        {TABS.map((key) => {
          const active = key === value;
          return (
            <button
              key={key}
              type="button"
              role="tab"
              id={`student-tab-${key}`}
              aria-selected={active}
              aria-controls={`student-panel-${key}`}
              onClick={() => onChange(key)}
              className={`h-10 min-w-0 rounded-xl px-1 text-sm whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00798c] ${active ? 'bg-white font-semibold text-slate-900 shadow-sm' : 'font-medium text-slate-600 hover:text-slate-900'}`}
            >
              {t(`instructor:students.tabs.${key}`)}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function useTab() {
  const [params, setParams] = useSearchParams();
  const tab = TABS.includes(params.get('tab')) ? params.get('tab') : 'overview';
  const setTab = useCallback((next) => {
    setParams((prev) => {
      const p = new URLSearchParams(prev);
      if (next === 'overview') p.delete('tab');
      else p.set('tab', next);
      return p;
    }, { replace: true });
  }, [setParams]);
  return [tab, setTab];
}

function ProfileError({ query }) {
  const { t } = useTranslation(['instructor']);
  const status = query.error?.response?.status;
  const notFound = status === 404 || status === 403;
  return (
    <ErrorState
      title={notFound ? t('instructor:students.error.notFoundTitle') : t('instructor:students.error.profileTitle')}
      body={notFound ? t('instructor:students.error.notFoundBody') : t('instructor:students.error.body')}
      retryLabel={t('instructor:students.error.retry')}
      onRetry={notFound ? undefined : () => query.refetch()}
    />
  );
}

export default function StudentDetail() {
  const { id } = useParams();
  const isDesktop = useIsDesktop();
  const query = useStudentProfile(id);
  const actions = useStudentActions(id);
  const chat = useChatBridge();
  const [tab, setTab] = useTab();
  const profile = query.data;

  let body;
  if (profile) {
    const hero = (
      <StudentHero
        profile={profile}
        onMessage={() => chat.messageStudent(profile.student.id)}
        messaging={chat.openingFor === profile.student.id}
        isDesktop={isDesktop}
      />
    );
    const skills = <SkillPath profile={profile} actions={actions} isDesktop={isDesktop} />;
    const notes = <NotesPanel studentId={id} />;
    const lessons = <LessonsPanel lessons={profile.recentLessons} />;
    const about = <AboutPanel profile={profile} actions={actions} isDesktop={isDesktop} />;
    const recs = <RecommendationsPanel recommendations={profile.recommendations} actions={actions} isDesktop={isDesktop} />;

    body = isDesktop ? (
      <>
        {hero}
        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
          <div className="flex flex-col gap-5">{skills}{notes}</div>
          <div className="flex flex-col gap-5">{lessons}{about}{recs}</div>
        </div>
      </>
    ) : (
      <>
        {hero}
        <Tabs value={tab} onChange={setTab} />
        <div role="tabpanel" id={`student-panel-${tab}`} aria-labelledby={`student-tab-${tab}`} className="flex flex-col gap-3.5">
          {tab === 'overview' && <>{lessons}{about}</>}
          {tab === 'skills' && skills}
          {tab === 'notes' && notes}
          {tab === 'picks' && recs}
        </div>
      </>
    );
  } else if (query.isError) {
    body = <ProfileError query={query} />;
  } else {
    body = <ProfileSkeleton isDesktop={isDesktop} />;
  }

  return (
    <div
      data-testid="instructor-student-page"
      data-layout={isDesktop ? 'desktop' : 'mobile'}
      className={`mx-auto flex w-full flex-col ${isDesktop ? 'max-w-7xl gap-5 p-6 xl:p-8' : 'max-w-xl gap-3.5 px-4 pb-8 pt-2'}`}
    >
      <BackLink />
      {body}
    </div>
  );
}
