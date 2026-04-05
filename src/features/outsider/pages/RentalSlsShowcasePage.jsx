import AcademyServicePackagesPage from '../components/AcademyServicePackagesPage';
import RentalUpsellBanner from '../components/RentalUpsellBanner';

const RentalSlsShowcasePage = () => (
  <AcademyServicePackagesPage
    seoTitle="SLS Rental | UKC"
    seoDescription="Premium SLS rental options with clear durations and direct booking."
    headline="SLS"
    accentWord="Equipment"
    academyTheme="rental"
    subheadline="Strong Light Superior setup for riders who want lighter feel, quicker response and premium performance."
    academyTag="UKC•Rental"
    dynamicServiceKey="rental_sls"
    promoBanner={<RentalUpsellBanner currentKey="sls" />}
  />
);

export default RentalSlsShowcasePage;
