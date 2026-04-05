import {
  ThunderboltOutlined,
  RocketOutlined,
  StarOutlined,
  TeamOutlined
} from '@ant-design/icons';
import AcademyServicePackagesPage from '../components/AcademyServicePackagesPage';

const wingPackages = [
  {
    id: 'wing-beginner',
    name: 'Wing Beginner',
    subtitle: 'Introduction Track',
    icon: <RocketOutlined />,
    featured: true,
    color: 'cyan',
    gradient: 'from-cyan-500 to-blue-500',
    shadow: 'shadow-cyan-500/20',
    border: 'hover:border-cyan-500/50',
    image: '/Images/ukc/wing-header.png',
    description: 'Start your wing journey with structured sessions focused on safe control and steady progression on water.',
    highlights: [
      'Wing handling fundamentals',
      'Board balance & stance',
      'Safe water starts',
      'First controlled rides',
      'Progress tracking',
      'All training gear included'
    ],
    durations: [
      { hours: '3h', price: 180, label: 'Intro', sessions: '3 x 1hr', tag: 'Starter' },
      { hours: '6h', price: 340, label: 'Core', sessions: '6 x 1hr', tag: 'Popular' },
      { hours: '8h', price: 440, label: 'Boost', sessions: '8 x 1hr', tag: 'Progress' },
      { hours: '10h', price: 540, label: 'Complete', sessions: '10 x 1hr', tag: 'Value' }
    ],
    badges: ['Beginner Friendly', 'Structured Plan']
  },
  {
    id: 'wing-intermediate',
    name: 'Wing Intermediate',
    subtitle: 'Ride & Improve',
    icon: <ThunderboltOutlined />,
    featured: false,
    color: 'blue',
    gradient: 'from-blue-600 to-indigo-500',
    shadow: 'shadow-blue-500/20',
    border: 'hover:border-blue-500/50',
    image: '/Images/ukc/wing-header.png',
    description: 'Build consistency and confidence with better control, efficiency, and upwind performance.',
    highlights: [
      'Water start consistency',
      'Speed & direction control',
      'Upwind riding skills',
      'Transition basics',
      'Technique correction',
      'Session-by-session goals'
    ],
    durations: [
      { hours: '4h', price: 260, label: 'Core', sessions: '4 x 1hr', tag: 'Popular' },
      { hours: '6h', price: 380, label: 'Plus', sessions: '6 x 1hr', tag: 'Recommended' },
      { hours: '8h', price: 500, label: 'Advanced', sessions: '8 x 1hr', tag: 'Strong' },
      { hours: '10h', price: 620, label: 'Master', sessions: '10 x 1hr', tag: 'Intensive' }
    ],
    badges: ['Performance Focus', 'Technique First']
  },
  {
    id: 'wing-advanced',
    name: 'Wing Advanced',
    subtitle: 'Transitions & Style',
    icon: <StarOutlined />,
    featured: false,
    color: 'purple',
    gradient: 'from-purple-600 to-fuchsia-500',
    shadow: 'shadow-purple-500/20',
    border: 'hover:border-purple-500/50',
    image: '/Images/ukc/wing-header.png',
    description: 'Develop advanced flow with clean transitions, stronger control in variable conditions, and style progression.',
    highlights: [
      'Tack & jibe refinement',
      'Timing and body mechanics',
      'Efficiency in gusty wind',
      'Downwind technique intro',
      'Advanced drills',
      'Personalized progression plan'
    ],
    durations: [
      { hours: '4h', price: 320, label: 'Refine', sessions: '4 x 1hr', tag: 'Core' },
      { hours: '6h', price: 470, label: 'Flow', sessions: '6 x 1hr', tag: 'Popular' },
      { hours: '8h', price: 620, label: 'Elite', sessions: '8 x 1hr', tag: 'Advanced' },
      { hours: '10h', price: 760, label: 'Pro', sessions: '10 x 1hr', tag: 'Top' }
    ],
    badges: ['Advanced Riders', 'High Progression']
  },
  {
    id: 'wing-complete',
    name: 'Complete Wing Course',
    subtitle: 'Zero to Confident',
    icon: <TeamOutlined />,
    featured: false,
    color: 'green',
    gradient: 'from-green-500 to-emerald-600',
    shadow: 'shadow-green-500/20',
    border: 'hover:border-green-500/50',
    image: '/Images/ukc/wing-header.png',
    description: 'Full curriculum package designed to move you from first session to consistent independent riding.',
    highlights: [
      'Beginner to intermediate roadmap',
      'Step-based milestones',
      'Long-term coaching plan',
      'Equipment setup guidance',
      'All sessions coordinated',
      'Best value bundle'
    ],
    durations: [
      { hours: '10h', price: 580, label: 'Complete', sessions: '10 x 1hr', tag: 'Best Value' },
      { hours: '12h', price: 680, label: 'Extended', sessions: '12 x 1hr', tag: 'Recommended' },
      { hours: '14h', price: 780, label: 'Pro Track', sessions: '14 x 1hr', tag: 'Intensive' },
      { hours: '16h', price: 880, label: 'Elite Track', sessions: '16 x 1hr', tag: 'Full Journey' }
    ],
    badges: ['Full Journey', 'Mentored Program']
  }
];

const WingLessonsPage = () => (
  <AcademyServicePackagesPage
    seoTitle="Wing Lessons | UKC Academy"
    seoDescription="Learn wing foiling with structured packages from beginner to advanced."
    headline="Wing"
    accentWord="Lessons"
    academyTheme="academy"
    subheadline="Choose your wing progression path. From first rides to advanced transitions, our team supports every step."
    packages={wingPackages}
    dynamicServiceKey="wing"
  />
);

export default WingLessonsPage;
