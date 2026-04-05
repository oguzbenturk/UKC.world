import AcademyServicePackagesPage from '../components/AcademyServicePackagesPage';
import RentalUpsellBanner from '../components/RentalUpsellBanner';

const RentalEFoilShowcasePage = () => (
  <AcademyServicePackagesPage
    seoTitle="E-Foil Rental | UKC"
    seoDescription="Rent an E-Foil and glide above the water with no wind needed. Premium electric hydrofoil rental with instructor support."
    headline="E-FOIL"
    accentWord="Rental"
    academyTheme="rental"
    subheadline="The most unique watersports experience. No wind, no noise — just you and the water."
    academyTag="UKC•Rental"
    dynamicServiceKey="rental_efoil"
    promoBanner={<RentalUpsellBanner currentKey="efoil" />}
  />
);

export default RentalEFoilShowcasePage;
