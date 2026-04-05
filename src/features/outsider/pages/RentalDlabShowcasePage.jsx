import AcademyServicePackagesPage from '../components/AcademyServicePackagesPage';
import RentalUpsellBanner from '../components/RentalUpsellBanner';

const RentalDlabShowcasePage = () => (
  <AcademyServicePackagesPage
    seoTitle="D/LAB Rental | UKC"
    seoDescription="Top-tier D/LAB rental options with direct booking and clean duration selection."
    headline="D/LAB"
    accentWord="Equipment"
    academyTheme="rental"
    subheadline="The highest-performance rental lineup for riders who want the lightest and most responsive setup."
    academyTag="UKC•Rental"
    dynamicServiceKey="rental_dlab"
    promoBanner={<RentalUpsellBanner currentKey="dlab" />}
  />
);

export default RentalDlabShowcasePage;
