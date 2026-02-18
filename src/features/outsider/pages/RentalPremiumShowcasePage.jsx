import {
  StarOutlined,
  RocketOutlined,
  ThunderboltOutlined
} from '@ant-design/icons';
import AcademyServicePackagesPage from '../components/AcademyServicePackagesPage';

const premiumRentalPackages = [
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
    id: 'rental-dlab',
    name: 'D/LAB Equipment',
    subtitle: 'Top Tier Performance',
    icon: <RocketOutlined />,
    featured: false,
    color: 'purple',
    gradient: 'from-purple-600 to-fuchsia-500',
    shadow: 'shadow-purple-500/20',
    border: 'hover:border-purple-500/50',
    image: '/Images/ukc/rebel-dlab-rent.png',
    description: 'Duotone’s most advanced line with ultra-light construction and top-end efficiency.',
    highlights: [
      'D/LAB series equipment',
      'Ultra-light response',
      'Limited premium stock',
      'Priority setup support',
      'Equipment included',
      'Book directly from this page'
    ],
    durations: [
      { hours: '1h', price: 48, label: 'Quick Session', sessions: '1 session' },
      { hours: '4h', price: 75, label: 'Half Day', sessions: 'Half day rental', tag: 'Popular' },
      { hours: '8h', price: 95, label: 'Full Day', sessions: 'Full day rental' }
    ],
    badges: ['D/LAB', 'Premium']
  },
  {
    id: 'rental-foil-premium',
    name: 'Premium Foil Setup',
    subtitle: 'Foil Equipment',
    icon: <ThunderboltOutlined />,
    featured: false,
    color: 'green',
    gradient: 'from-green-500 to-emerald-600',
    shadow: 'shadow-green-500/20',
    border: 'hover:border-green-500/50',
    image: '/Images/ukc/rebel-dlab-rent.png',
    description: 'Premium foil-focused rental setup designed for advanced control and smooth gliding sessions.',
    highlights: [
      'Premium foil board',
      'Performance-tuned setup',
      'Experienced rider focused',
      'Safety checks included',
      'Equipment included',
      'Book directly from this page'
    ],
    durations: [
      { hours: '24h', price: 27, label: '1 Day', sessions: '1 day rental' },
      { hours: '168h', price: 135, label: '1 Week', sessions: '7 day rental', tag: 'Best Value' }
    ],
    badges: ['Foil', 'Premium']
  }
];

const RentalPremiumShowcasePage = () => (
  <AcademyServicePackagesPage
    seoTitle="Premium Rental | UKC"
    seoDescription="Premium Duotone SLS and D/LAB rentals with clear options and direct booking flow."
    headline="Premium"
    accentWord="Rental"
    academyTheme="rental"
    subheadline="Choose SLS or D/LAB setups for top-tier response, lighter feel and high-performance sessions."
    academyTag="UKC.Rental"
    packages={premiumRentalPackages}
  />
);

export default RentalPremiumShowcasePage;
