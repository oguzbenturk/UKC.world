import { ThunderboltOutlined } from '@ant-design/icons';
import AcademyServicePackagesPage from '../components/AcademyServicePackagesPage';

const efoilRentalPackages = [
  {
    id: 'rental-efoil',
    name: 'E-Foil Equipment',
    subtitle: 'Electric Hydrofoil',
    icon: <ThunderboltOutlined />,
    featured: true,
    color: 'yellow',
    gradient: 'from-yellow-500 to-orange-500',
    shadow: 'shadow-yellow-500/20',
    border: 'hover:border-yellow-500/50',
    image: '/Images/ukc/e-foil.png',
    description: 'Experience the future of watersports. Glide silently above the water with our premium E-Foil rental — no wind required.',
    highlights: [
      'Latest E-Foil models',
      'Battery-powered silent ride',
      'No wind required',
      'All skill levels welcome',
      'Instructor support available',
      'Book directly from this page'
    ],
    durations: [
      { hours: '1h', price: 80, label: 'Intro Session', sessions: '1 session' },
      { hours: '2h', price: 140, label: 'Discovery', sessions: '2 hour rental', tag: 'Popular' },
      { hours: '4h', price: 240, label: 'Half Day', sessions: 'Half day rental' },
    ],
    badges: ['E-Foil', 'Electric']
  }
];

const RentalEFoilShowcasePage = () => (
  <AcademyServicePackagesPage
    seoTitle="E-Foil Rental | UKC"
    seoDescription="Rent an E-Foil and glide above the water with no wind needed. Premium electric hydrofoil rental with instructor support."
    headline="E-FOIL"
    accentWord="Rental"
    academyTheme="rental"
    subheadline="The most unique watersports experience. No wind, no noise — just you and the water."
    academyTag="UKC.Rental"
    dynamicServiceKey="rental_efoil"
    packages={efoilRentalPackages}
  />
);

export default RentalEFoilShowcasePage;
