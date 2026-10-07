// Text hooks shared by the hero, timeline and drawer.
import { useTranslation } from 'react-i18next';
import { formatHours } from '../../earnings/earningsFormat';
import { participantLabel } from '../dashboardFormat';

export function useLocale() {
  const { i18n } = useTranslation();
  return i18n?.language || 'en';
}

/** "Hazal Tekinalp" / "Nina Brunner +1" / "Student". */
export function useLessonTitle(lesson) {
  const { t } = useTranslation(['instructor']);
  const { first, others } = participantLabel(lesson);
  const name = first || t('instructor:myDay.unknownStudent');
  return others > 0 ? t('instructor:myDay.plusOthers', { name, others }) : name;
}

/** "Private kite · 2 h · lesson 4 of 6" (+ package line on request). */
export function useLessonSubtitle(lesson, { withPackage = false } = {}) {
  const { t } = useTranslation(['instructor']);
  const locale = useLocale();
  if (!lesson) return '';
  const parts = [
    lesson.service?.name || t('instructor:myDay.lessonFallback'),
    t('instructor:myDay.durationHours', { hours: formatHours(lesson.durationHours, locale) }),
  ];
  const pkg = lesson.packageInfo;
  if (pkg?.lessonIndex) {
    parts.push(pkg.lessonsTotal
      ? t('instructor:myDay.lessonOf', { index: pkg.lessonIndex, total: pkg.lessonsTotal })
      : t('instructor:myDay.lessonNumber', { index: pkg.lessonIndex }));
  }
  if (withPackage && pkg?.totalHours) {
    parts.push(t('instructor:myDay.packageLeft', {
      total: formatHours(pkg.totalHours, locale),
      left: formatHours(pkg.hoursLeft ?? 0, locale),
    }));
  }
  return parts.join(' · ');
}
