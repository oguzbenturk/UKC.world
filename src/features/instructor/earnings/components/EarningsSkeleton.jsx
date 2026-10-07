import { useTranslation } from 'react-i18next';
import { SkeletonBlock } from './ui';
import { cardClass } from './earningsStyles';

// Layout-shaped skeleton (no full-page spinner).
export default function EarningsSkeleton({ isDesktop }) {
  const { t } = useTranslation(['instructor']);
  const hero = (
    <div className={`${cardClass} flex flex-col gap-4 p-5`}>
      <SkeletonBlock className="h-4 w-40" />
      <SkeletonBlock className="h-11 w-48" />
      <SkeletonBlock className="h-16 w-full" />
      {!isDesktop && (
        <div className="grid grid-cols-2 gap-2.5">
          <SkeletonBlock className="h-16" />
          <SkeletonBlock className="h-16" />
        </div>
      )}
    </div>
  );

  return (
    <div role="status" aria-live="polite" data-testid="earnings-skeleton" className="flex flex-col gap-4">
      <span className="sr-only">{t('instructor:earnings.loading')}</span>
      {isDesktop ? (
        <>
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1fr)]">
            {hero}
            <SkeletonBlock className="h-72 rounded-2xl" />
            <SkeletonBlock className="h-72 rounded-2xl" />
          </div>
          <div className="grid gap-5 lg:grid-cols-2">
            <SkeletonBlock className="h-64 rounded-2xl" />
            <SkeletonBlock className="h-64 rounded-2xl" />
          </div>
          <SkeletonBlock className="h-80 rounded-2xl" />
        </>
      ) : (
        <>
          {hero}
          <SkeletonBlock className="h-40 rounded-2xl" />
          <SkeletonBlock className="h-14 rounded-2xl" />
          <SkeletonBlock className="h-36 rounded-2xl" />
        </>
      )}
    </div>
  );
}
