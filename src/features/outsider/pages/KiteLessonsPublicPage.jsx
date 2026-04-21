import { useTranslation } from 'react-i18next';
import AcademyServicePackagesPage from '../components/AcademyServicePackagesPage';

const KiteLessonsPublicPage = () => {
  const { t } = useTranslation(['outsider']);
  return (
    <AcademyServicePackagesPage
      seoTitle="Kite Lessons | UKC Academy"
      seoDescription="Learn kitesurfing with structured packages and standalone lesson options from beginner to advanced."
      headline={t('outsider:academyKite.hero.title')}
      accentWord={t('outsider:academyKite.hero.titleAccent')}
      academyTheme="academy"
      subheadline={t('outsider:academyKite.hero.subtitle')}
      dynamicServiceKey="kite"
    />
  );
};

export default KiteLessonsPublicPage;
