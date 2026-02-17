import { RocketOutlined } from '@ant-design/icons';
import AcademyServicePackagesPage from '../components/AcademyServicePackagesPage';

const dlabRentalPackages = [
  {
    id: 'rental-dlab',
    name: 'D/LAB Equipment',
    subtitle: 'Top Tier Performance',
    icon: <RocketOutlined />,
    featured: true,
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
  }
];

const RentalDlabShowcasePage = () => (
  <AcademyServicePackagesPage
    seoTitle="D/LAB Rental | UKC"
    seoDescription="Top-tier D/LAB rental options with direct booking and clean duration selection."
    headline="D/LAB"
    accentWord="Equipment"
    academyTheme="rental"
    subheadline="The highest-performance rental lineup for riders who want the lightest and most responsive setup."
    academyTag="UKC Rental"
    packages={dlabRentalPackages}
  />
);

export default RentalDlabShowcasePage;
