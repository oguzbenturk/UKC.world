import {
  SafetyCertificateOutlined,
  AppstoreOutlined,
  SkinOutlined,
  DeploymentUnitOutlined
} from '@ant-design/icons';
import AcademyServicePackagesPage from '../components/AcademyServicePackagesPage';

const standardRentalPackages = [
  {
    id: 'rental-full-set',
    name: 'Full Set Rental',
    subtitle: 'Complete Kite Setup',
    icon: <SafetyCertificateOutlined />,
    featured: true,
    color: 'blue',
    gradient: 'from-blue-600 to-blue-400',
    shadow: 'shadow-blue-500/20',
    border: 'hover:border-blue-500/50',
    image: '/Images/ukc/evo-rent-standart.png',
    description: 'Everything you need to get on the water with reliable, progression-friendly equipment.',
    highlights: [
      'Kite + board + bar',
      'Harness & wetsuit included',
      'Safety leash & helmet',
      'Daily checked gear',
      'Equipment included',
      'Book directly from this page'
    ],
    durations: [
      { hours: '1h', price: 35, label: 'Quick Session', sessions: '1 session' },
      { hours: '4h', price: 55, label: 'Half Day', sessions: 'Half day rental', tag: 'Popular' },
      { hours: '8h', price: 75, label: 'Full Day', sessions: 'Full day rental' },
      { hours: '168h', price: 380, label: '1 Week', sessions: '7 day rental', tag: 'Best Value' }
    ],
    badges: ['Standard', 'Complete Set']
  },
  {
    id: 'rental-board',
    name: 'Board Rental',
    subtitle: 'Twin Tip / Directional',
    icon: <AppstoreOutlined />,
    featured: false,
    color: 'green',
    gradient: 'from-green-500 to-emerald-600',
    shadow: 'shadow-green-500/20',
    border: 'hover:border-green-500/50',
    image: '/Images/ukc/evo-rent-standart.png',
    description: 'Travel light and rent boards only. Multiple sizes and shapes for different conditions.',
    highlights: [
      'Twin tip and directional options',
      'Straps/pads included',
      'Board bag available',
      'Freshly prepared equipment',
      'Equipment included',
      'Book directly from this page'
    ],
    durations: [
      { hours: '24h', price: 20, label: '1 Day', sessions: '1 day rental' },
      { hours: '168h', price: 100, label: '1 Week', sessions: '7 day rental', tag: 'Popular' }
    ],
    badges: ['Boards', 'Standard']
  },
  {
    id: 'rental-wetsuit',
    name: 'Wetsuit Rental',
    subtitle: 'ION Wetsuits',
    icon: <SkinOutlined />,
    featured: false,
    color: 'cyan',
    gradient: 'from-cyan-500 to-blue-500',
    shadow: 'shadow-cyan-500/20',
    border: 'hover:border-cyan-500/50',
    image: '/Images/ukc/evo-rent-standart.png',
    description: 'Premium ION wetsuits in multiple sizes, cleaned and prepared after every use.',
    highlights: [
      'All sizes available',
      'Freshly cleaned',
      'Comfort-focused fit',
      'Boots optional',
      'Equipment included',
      'Book directly from this page'
    ],
    durations: [
      { hours: '24h', price: 10, label: '1 Day', sessions: '1 day rental' },
      { hours: '168h', price: 50, label: '1 Week', sessions: '7 day rental', tag: 'Best Value' }
    ],
    badges: ['Wetsuit', 'Standard']
  },
  {
    id: 'rental-harness-bar',
    name: 'Harness & Bar',
    subtitle: 'Control System',
    icon: <DeploymentUnitOutlined />,
    featured: false,
    color: 'purple',
    gradient: 'from-purple-600 to-fuchsia-500',
    shadow: 'shadow-purple-500/20',
    border: 'hover:border-purple-500/50',
    image: '/Images/ukc/evo-rent-standart.png',
    description: 'Latest control systems and harnesses for safe, responsive sessions.',
    highlights: [
      'Duotone control bars',
      'Waist and seat harness options',
      'Quick-release safety systems',
      'Safety checks included',
      'Equipment included',
      'Book directly from this page'
    ],
    durations: [
      { hours: '24h', price: 15, label: '1 Day', sessions: '1 day rental' },
      { hours: '168h', price: 80, label: '1 Week', sessions: '7 day rental', tag: 'Popular' }
    ],
    badges: ['Accessories', 'Standard']
  }
];

const RentalStandardShowcasePage = () => (
  <AcademyServicePackagesPage
    seoTitle="Standard Rental | UKC"
    seoDescription="Standard rental options for kites, boards, wetsuits and accessories with clear durations and pricing."
    headline="Standard"
    accentWord="Rental"
    academyTheme="rental"
    subheadline="Reliable, progression-friendly equipment for daily sessions. Choose your gear and duration in one place."
    academyTag="UKC.Rental"
    packages={standardRentalPackages}
  />
);

export default RentalStandardShowcasePage;
