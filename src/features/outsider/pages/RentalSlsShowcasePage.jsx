import { useTranslation } from 'react-i18next';
import AcademyServicePackagesPage from '../components/AcademyServicePackagesPage';
import RentalUpsellBanner from '../components/RentalUpsellBanner';

const RentalSlsShowcasePage = () => {
  const { t } = useTranslation(['outsider']);
  return (
    <AcademyServicePackagesPage
      seoTitle="SLS Rental | UKC"
      seoDescription="Premium SLS rental options with clear durations and direct booking."
      headline={t('outsider:rentalShowcase.sls.headline')}
      accentWord={t('outsider:rentalShowcase.sls.accentWord')}
      academyTheme="rental"
      subheadline={t('outsider:rentalShowcase.sls.subheadline')}
      academyTag="UKC•Rental"
      dynamicServiceKey="rental_sls"
      promoBanner={<RentalUpsellBanner currentKey="sls" />}
    />
  );
};

export default RentalSlsShowcasePage;
