import { useTranslation } from 'react-i18next';
import { SkeletonBlock } from '../../earnings/components/ui';

/** Layout-shaped placeholder for the lesson sections while /me/today loads. */
export default function DashboardSkeleton({ isDesktop }) {
  const { t } = useTranslation(['instructor']);
  return (
    <div role="status" aria-live="polite" data-testid="my-day-skeleton" className={isDesktop ? 'contents' : 'flex flex-col gap-3.5'}>
      <span className="sr-only">{t('instructor:myDay.loading')}</span>
      <SkeletonBlock className={`h-72 rounded-2xl ${isDesktop ? 'lg:col-span-2' : ''}`} />
      <SkeletonBlock className={`h-64 rounded-2xl ${isDesktop ? 'lg:col-span-2' : ''}`} />
    </div>
  );
}
