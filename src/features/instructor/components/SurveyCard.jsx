const SurveyCard = ({ onSurveyStart }) => (
  <section className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-gradient-to-r from-violet-500/10 via-sky-500/10 to-emerald-500/10 dark:from-violet-500/20 dark:via-sky-500/20 dark:to-emerald-500/20 p-6">
    <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-200">Help us improve</p>
    <h3 className="mt-2 text-lg font-semibold text-slate-900 dark:text-white">Share feedback on the new dashboard</h3>
    <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
      A 45-second survey to prioritize what matters most for your teaching workflow.
    </p>
    <div className="mt-4 flex flex-wrap gap-3">
      <button
        type="button"
        onClick={onSurveyStart}
        className="inline-flex items-center rounded-md bg-violet-600 hover:bg-violet-700 text-white px-4 py-2 text-sm font-medium transition"
      >
        Start survey
      </button>
      <a
        href="https://docs.plannivo.com/instructor-dashboard-changelog"
        className="inline-flex items-center text-sm text-violet-700 dark:text-violet-200 hover:underline"
        target="_blank"
        rel="noreferrer"
      >
        View changelog
      </a>
    </div>
  </section>
);

export default SurveyCard;
