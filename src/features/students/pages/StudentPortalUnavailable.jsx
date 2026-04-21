import { useTranslation } from 'react-i18next';

const StudentPortalUnavailable = () => {
  const { t } = useTranslation(['student']);
  return (
    <div className="mx-auto max-w-3xl px-6 py-16">
      <div className="rounded-3xl border border-slate-200 bg-white p-10 text-center shadow-sm dark:border-slate-700 dark:bg-slate-900/70">
        <h1 className="text-3xl font-duotone-bold-extended text-slate-900 dark:text-white">{t('student:portalUnavailable.heading')}</h1>
        <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">
          {t('student:portalUnavailable.body')}
        </p>
      </div>
    </div>
  );
};

export default StudentPortalUnavailable;
