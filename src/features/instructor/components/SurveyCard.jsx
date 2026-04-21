import { useTranslation } from 'react-i18next';

const SurveyCard = ({ onSurveyStart }) => {
  const { t } = useTranslation(['instructor']);
  return (
    <section className="rounded-2xl border border-slate-200 bg-gradient-to-r from-violet-500/10 via-sky-500/10 to-emerald-500/10 p-6">
      <p className="text-xs uppercase tracking-wide text-slate-500">{t('instructor:survey.helpUs')}</p>
      <h3 className="mt-2 text-lg font-semibold text-slate-900">{t('instructor:survey.title')}</h3>
      <p className="mt-1 text-sm text-slate-600">
        {t('instructor:survey.body')}
      </p>
      <div className="mt-4 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={onSurveyStart}
          className="inline-flex items-center rounded-md bg-violet-600 hover:bg-violet-700 text-white px-4 py-2 text-sm font-medium transition"
        >
          {t('instructor:survey.startSurvey')}
        </button>
        <a
          href="https://docs.plannivo.com/instructor-dashboard-changelog"
          className="inline-flex items-center text-sm text-violet-700 hover:underline"
          target="_blank"
          rel="noreferrer"
        >
          {t('instructor:survey.viewChangelog')}
        </a>
      </div>
    </section>
  );
};

export default SurveyCard;
