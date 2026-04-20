import { useTranslation } from 'react-i18next';
import AcademyServicePackagesPage from '../components/AcademyServicePackagesPage';
import RentalUpsellBanner from '../components/RentalUpsellBanner';

const RentalDlabShowcasePage = () => {
  const { t } = useTranslation(['outsider']);
  return (
    <AcademyServicePackagesPage
      seoTitle="D/LAB Rental | UKC"
      seoDescription="Top-tier D/LAB rental options with direct booking and clean duration selection."
      headline={t('outsider:rentalShowcase.dlab.headline')}
      accentWord={t('outsider:rentalShowcase.dlab.accentWord')}
      academyTheme="rental"
      subheadline={t('outsider:rentalShowcase.dlab.subheadline')}
      academyTag="UKC•Rental"
      dynamicServiceKey="rental_dlab"
      promoBanner={<RentalUpsellBanner currentKey="dlab" />}
    />
  );
};

export default RentalDlabShowcasePage;
