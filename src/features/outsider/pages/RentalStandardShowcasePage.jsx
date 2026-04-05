import AcademyServicePackagesPage from '../components/AcademyServicePackagesPage';
import RentalUpsellBanner from '../components/RentalUpsellBanner';

const RentalStandardShowcasePage = () => (
  <AcademyServicePackagesPage
    seoTitle="Standard Rental | UKC"
    seoDescription="Standard rental options for kites, boards, wetsuits and accessories with clear durations and pricing."
    headline="Standard"
    accentWord="Rental"
    academyTheme="rental"
    subheadline="Reliable, progression-friendly equipment for daily sessions. Choose your gear and duration in one place."
    academyTag="UKC•Rental"
    dynamicServiceKey="rental_standard"
    promoBanner={<RentalUpsellBanner currentKey="standard" />}
  />
);

export default RentalStandardShowcasePage;
