import { useTranslation } from 'react-i18next';
import AcademyServicePackagesPage from '../components/AcademyServicePackagesPage';
import RentalUpsellBanner from '../components/RentalUpsellBanner';

const RentalStandardShowcasePage = () => {
  const { t } = useTranslation(['outsider']);
  return (
    <AcademyServicePackagesPage
      seoTitle="Standard Rental | UKC"
      seoDescription="Standard rental options for kites, boards, wetsuits and accessories with clear durations and pricing."
      headline={t('outsider:rentalShowcase.standard.headline')}
      accentWord={t('outsider:rentalShowcase.standard.accentWord')}
      academyTheme="rental"
      subheadline={t('outsider:rentalShowcase.standard.subheadline')}
      academyTag="UKC•Rental"
      dynamicServiceKey="rental_standard"
      promoBanner={<RentalUpsellBanner currentKey="standard" />}
    />
  );
};

export default RentalStandardShowcasePage;
