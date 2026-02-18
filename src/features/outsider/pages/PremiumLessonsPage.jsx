import {
  CrownOutlined,
  StarOutlined,
  RocketOutlined,
  ThunderboltOutlined
} from '@ant-design/icons';
import AcademyServicePackagesPage from '../components/AcademyServicePackagesPage';

const premiumFallbackPackages = [
  {
    id: 'premium-private',
    name: 'Premium Private',
    subtitle: '1-on-1 Coaching',
    icon: <CrownOutlined />,
    featured: true,
    color: 'yellow',
    gradient: 'from-yellow-500 to-amber-600',
    shadow: 'shadow-yellow-500/20',
    border: 'hover:border-yellow-500/50',
    image: '/Images/ukc/kite-header.jpg.png',
    description: 'Dedicated private coaching for fast progression with premium support.',
    highlights: [
      'Private instructor focus',
      'Progress-first session flow',
      'Priority scheduling',
      'Premium gear support',
      'Structured milestones',
      'Best for rapid improvement'
    ],
    durations: [
      { hours: '4h', price: 480, label: 'Starter', sessions: '4 sessions', tag: 'Popular' },
      { hours: '8h', price: 880, label: 'Core', sessions: '8 sessions', tag: 'Recommended' },
      { hours: '12h', price: 1200, label: 'Pro', sessions: '12 sessions', tag: 'Value' }
    ],
    badges: ['Private Coaching', 'Premium Track']
  },
  {
    id: 'premium-masterclass',
    name: 'Premium Masterclass',
    subtitle: 'Advanced Progression',
    icon: <StarOutlined />,
    featured: false,
    color: 'purple',
    gradient: 'from-purple-600 to-fuchsia-500',
    shadow: 'shadow-purple-500/20',
    border: 'hover:border-purple-500/50',
    image: '/Images/ukc/foil-lessons-header.png',
    description: 'Advanced sessions focused on precision, confidence, and cleaner technique.',
    highlights: [
      'Advanced drills & feedback',
      'Technique refinement',
      'Progress checkpoints',
      'Performance-focused coaching',
      'Custom session goals',
      'Premium priority access'
    ],
    durations: [
      { hours: '6h', price: 600, label: 'Master', sessions: '6 sessions', tag: 'Core' },
      { hours: '10h', price: 950, label: 'Elite', sessions: '10 sessions', tag: 'Popular' }
    ],
    badges: ['Advanced Riders', 'Technique Focus']
  },
  {
    id: 'premium-intensive',
    name: 'Premium Intensive',
    subtitle: 'Fast-Track Program',
    icon: <ThunderboltOutlined />,
    featured: false,
    color: 'cyan',
    gradient: 'from-cyan-500 to-blue-500',
    shadow: 'shadow-cyan-500/20',
    border: 'hover:border-cyan-500/50',
    image: '/Images/ukc/wing-header.png',
    description: 'High-frequency sessions built to maximize progress in a short time.',
    highlights: [
      'Intensive schedule blocks',
      'Daily progression targets',
      'Focused instructor guidance',
      'Premium equipment priority',
      'Flexible plan adaptation',
      'Strong value bundle'
    ],
    durations: [
      { hours: '15h', price: 1350, label: 'Intensive', sessions: '3 x 5h', tag: 'Fast Track' },
      { hours: '21h', price: 1800, label: 'Ultra', sessions: '3 x 7h', tag: 'Top Tier' }
    ],
    badges: ['Accelerated Learning', 'Premium Support']
  },
  {
    id: 'premium-pro',
    name: 'Premium Pro Coaching',
    subtitle: 'Performance Sessions',
    icon: <RocketOutlined />,
    featured: false,
    color: 'green',
    gradient: 'from-green-500 to-emerald-600',
    shadow: 'shadow-green-500/20',
    border: 'hover:border-green-500/50',
    image: '/Images/ukc/e-foil.png',
    description: 'Long-form coaching package for committed riders aiming for top-level consistency.',
    highlights: [
      'Long-term coaching roadmap',
      'Performance metrics tracking',
      'Advanced progression plan',
      'Coaching continuity',
      'Session-by-session refinement',
      'Priority booking slots'
    ],
    durations: [
      { hours: '8h', price: 840, label: 'Pro', sessions: '8 sessions', tag: 'Strong' },
      { hours: '14h', price: 1400, label: 'Elite', sessions: '14 sessions', tag: 'Best Value' }
    ],
    badges: ['Committed Riders', 'Premium Journey']
  }
];

const PremiumLessonsPage = () => (
  <AcademyServicePackagesPage
    seoTitle="Premium Lessons | UKC Academy"
    seoDescription="Explore premium lesson packages with advanced coaching and configurable pricing."
    headline="Premium"
    accentWord="Lessons"
    subheadline="Exclusive coaching packages with admin-configurable durations and prices."
    academyTag="UKC.Premium"
    academyTheme="premium"
    packages={premiumFallbackPackages}
    dynamicServiceKey="premium"
  />
);

export default PremiumLessonsPage;
