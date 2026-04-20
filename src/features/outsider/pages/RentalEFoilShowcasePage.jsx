import { useTranslation } from 'react-i18next';
import AcademyServicePackagesPage from '../components/AcademyServicePackagesPage';
import RentalUpsellBanner from '../components/RentalUpsellBanner';

const RentalEFoilShowcasePage = () => {
  const { t } = useTranslation(['outsider']);
  return (
    <AcademyServicePackagesPage
      seoTitle="E-Foil Rental | UKC"
      seoDescription="Rent an E-Foil and glide above the water with no wind needed. Premium electric hydrofoil rental with instructor support."
      headline={t('outsider:rentalShowcase.efoil.headline')}
      accentWord={t('outsider:rentalShowcase.efoil.accentWord')}
      academyTheme="rental"
      subheadline={t('outsider:rentalShowcase.efoil.subheadline')}
      academyTag="UKC•Rental"
      dynamicServiceKey="rental_efoil"
      promoBanner={<RentalUpsellBanner currentKey="efoil" />}
    />
  );
};

export default RentalEFoilShowcasePage;
