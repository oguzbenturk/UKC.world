import { StarOutlined, ThunderboltOutlined } from '@ant-design/icons';
import AcademyServicePackagesPage from '../components/AcademyServicePackagesPage';

const slsRentalPackages = [
  {
    id: 'rental-sls',
    name: 'SLS Equipment',
    subtitle: 'Strong Light Superior',
    icon: <StarOutlined />,
    featured: true,
    color: 'cyan',
    gradient: 'from-cyan-500 to-blue-500',
    shadow: 'shadow-cyan-500/20',
    border: 'hover:border-cyan-500/50',
    image: '/Images/ukc/evo-sls-rent.png',
    description: 'Lighter, stiffer and more responsive than standard equipment. Ideal for riders who want top performance.',
    highlights: [
      'Latest SLS kite models',
      'Premium board options',
      'High-response setup',
      'Daily checked gear',
      'Equipment included',
      'Book directly from this page'
    ],
    durations: [
      { hours: '1h', price: 40, label: 'Quick Session', sessions: '1 session' },
      { hours: '4h', price: 65, label: 'Half Day', sessions: 'Half day rental', tag: 'Popular' },
      { hours: '8h', price: 85, label: 'Full Day', sessions: 'Full day rental' },
      { hours: '168h', price: 510, label: '1 Week', sessions: '7 day rental', tag: 'Best Value' }
    ],
    badges: ['SLS', 'Premium']
  },
  {
    id: 'rental-sls-foil',
    name: 'SLS Foil Setup',
    subtitle: 'Hydrofoil Equipment',
    icon: <ThunderboltOutlined />,
    featured: false,
    color: 'green',
    gradient: 'from-green-500 to-emerald-600',
    shadow: 'shadow-green-500/20',
    border: 'hover:border-green-500/50',
    image: '/Images/ukc/evo-sls-rent.png',
    description: 'Premium foil-oriented setup for experienced riders and smooth, efficient sessions.',
    highlights: [
      'SLS foil board',
      'Performance-oriented setup',
      'Safety checks included',
      'Equipment included',
      'Book directly from this page'
    ],
    durations: [
      { hours: '24h', price: 27, label: '1 Day', sessions: '1 day rental' },
      { hours: '168h', price: 135, label: '1 Week', sessions: '7 day rental', tag: 'Best Value' }
    ],
    badges: ['SLS', 'Foil']
  }
];

const RentalSlsShowcasePage = () => (
  <AcademyServicePackagesPage
    seoTitle="SLS Rental | UKC"
    seoDescription="Premium SLS rental options with clear durations and direct booking."
    headline="SLS"
    accentWord="Equipment"
    academyTheme="rental"
    subheadline="Strong Light Superior setup for riders who want lighter feel, quicker response and premium performance."
    academyTag="UKC Rental"
    packages={slsRentalPackages}
  />
);

export default RentalSlsShowcasePage;
