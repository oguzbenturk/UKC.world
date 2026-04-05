import {
  ThunderboltOutlined,
  RocketOutlined,
  SafetyCertificateOutlined,
  TeamOutlined
} from '@ant-design/icons';
import AcademyServicePackagesPage from '../components/AcademyServicePackagesPage';

const eFoilPackages = [
  {
    id: 'efoil-intro',
    name: 'E-Foil Discovery',
    subtitle: 'First Flight Session',
    icon: <RocketOutlined />,
    featured: true,
    color: 'green',
    gradient: 'from-green-500 to-emerald-600',
    shadow: 'shadow-green-500/20',
    border: 'hover:border-green-500/50',
    image: '/Images/ukc/e-foil.png',
    description: 'A smooth and safe first experience on electric hydrofoil with full instructor support.',
    highlights: [
      'On-land safety briefing',
      'Board control fundamentals',
      'Safe standing progression',
      'Speed control basics',
      'Turning introduction',
      'Instructor-assisted progression'
    ],
    durations: [
      { hours: '1h', price: 150, label: 'Discovery', sessions: '1 x 1hr', tag: 'Popular' },
      { hours: '2h', price: 280, label: 'Core', sessions: '2 x 1hr', tag: 'Recommended' },
      { hours: '3h', price: 390, label: 'Plus', sessions: '3 x 1hr', tag: 'Progress' },
      { hours: '4h', price: 500, label: 'Complete', sessions: '4 x 1hr', tag: 'Value' }
    ],
    badges: ['Beginner Friendly', 'Premium Equipment']
  },
  {
    id: 'efoil-progression',
    name: 'E-Foil Progression',
    subtitle: 'Control & Confidence',
    icon: <SafetyCertificateOutlined />,
    featured: false,
    color: 'blue',
    gradient: 'from-blue-600 to-cyan-500',
    shadow: 'shadow-blue-500/20',
    border: 'hover:border-blue-500/50',
    image: '/Images/ukc/e-foil.png',
    description: 'Improve ride control, turns, and consistency for longer and smoother independent runs.',
    highlights: [
      'Ride efficiency coaching',
      'Balanced stance refinement',
      'Turning and line control',
      'Battery/range management tips',
      'Water confidence building',
      'Session-based progress goals'
    ],
    durations: [
      { hours: '2h', price: 300, label: 'Core', sessions: '2 x 1hr', tag: 'Starter' },
      { hours: '4h', price: 560, label: 'Standard', sessions: '4 x 1hr', tag: 'Popular' },
      { hours: '6h', price: 810, label: 'Advanced', sessions: '6 x 1hr', tag: 'Strong' },
      { hours: '8h', price: 1040, label: 'Pro', sessions: '8 x 1hr', tag: 'Intensive' }
    ],
    badges: ['Skill Progression', 'Coaching Focus']
  },
  {
    id: 'efoil-private',
    name: 'Private E-Foil Coaching',
    subtitle: '1-on-1 Premium Session',
    icon: <ThunderboltOutlined />,
    featured: false,
    color: 'purple',
    gradient: 'from-purple-600 to-fuchsia-500',
    shadow: 'shadow-purple-500/20',
    border: 'hover:border-purple-500/50',
    image: '/Images/ukc/e-foil.png',
    description: 'Dedicated private coaching for fast improvement and tailored progression according to your level.',
    highlights: [
      'Dedicated instructor attention',
      'Custom progression plan',
      'Precision technique tuning',
      'Advanced turn refinement',
      'Confidence under speed',
      'Flexible session focus'
    ],
    durations: [
      { hours: '1h', price: 180, label: 'Private', sessions: '1 x 1hr', tag: 'Fast Track' },
      { hours: '3h', price: 510, label: 'Private Pack', sessions: '3 x 1hr', tag: 'Popular' },
      { hours: '5h', price: 820, label: 'Intensive', sessions: '5 x 1hr', tag: 'Recommended' },
      { hours: '8h', price: 1260, label: 'Elite', sessions: '8 x 1hr', tag: 'Top Tier' }
    ],
    badges: ['Private Coaching', 'Premium Progress']
  },
  {
    id: 'efoil-group',
    name: 'E-Foil Group Sessions',
    subtitle: 'Shared Experience',
    icon: <TeamOutlined />,
    featured: false,
    color: 'cyan',
    gradient: 'from-cyan-500 to-teal-500',
    shadow: 'shadow-cyan-500/20',
    border: 'hover:border-cyan-500/50',
    image: '/Images/ukc/e-foil.png',
    description: 'Learn with friends in a structured group format while maintaining safety and quality coaching.',
    highlights: [
      'Small group instruction',
      'Shared learning momentum',
      'Rotational coaching support',
      'Supervised ride blocks',
      'Efficient session planning',
      'Great value option'
    ],
    durations: [
      { hours: '2h', price: 220, label: 'Group Intro', sessions: '2 x 1hr', perPerson: true, tag: 'Starter' },
      { hours: '4h', price: 420, label: 'Group Standard', sessions: '4 x 1hr', perPerson: true, tag: 'Popular' },
      { hours: '6h', price: 600, label: 'Group Plus', sessions: '6 x 1hr', perPerson: true, tag: 'Value' },
      { hours: '8h', price: 760, label: 'Group Pro', sessions: '8 x 1hr', perPerson: true, tag: 'Complete' }
    ],
    badges: ['Social Learning', 'Per Person Pricing']
  }
];

const EFoilLessonsPage = () => (
  <AcademyServicePackagesPage
    seoTitle="E-Foil Lessons | UKC Academy"
    seoDescription="Discover e-foil with guided sessions from first ride to advanced control."
    headline="E-Foil"
    accentWord="Lessons"
    academyTheme="academy"
    subheadline="Experience the smooth feeling of electric foiling with structured sessions for all skill levels."
    packages={eFoilPackages}
    dynamicServiceKey="efoil"
  />
);

export default EFoilLessonsPage;
