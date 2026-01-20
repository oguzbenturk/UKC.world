import { useAuth } from '@/shared/hooks/useAuth';

const InstructorDashboardFallback = () => {
  const { user } = useAuth();
  return (
    <div className="p-6 md:p-10">
      <div className="mx-auto max-w-2xl rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/70 shadow-sm p-6 md:p-8 space-y-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Instructor dashboard</p>
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-white">Preview unavailable</h1>
        <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
          The revamped instructor dashboard is currently behind an internal feature flag.
          If you believe you should have access, please contact an administrator and request that
          <code className="mx-1 rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-semibold text-slate-700">VITE_INSTRUCTOR_DASHBOARD_REVAMP</code>
          be enabled for your environment.
        </p>
        {user?.email && (
          <p className="text-xs text-slate-500">
            Logged in as <span className="font-medium text-slate-700 dark:text-slate-200">{user.email}</span>
          </p>
        )}
      </div>
    </div>
  );
};

export default InstructorDashboardFallback;
