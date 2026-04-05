import {
  ThunderboltOutlined,
  RiseOutlined,
  ExperimentOutlined,
  RocketOutlined
} from '@ant-design/icons';
import AcademyServicePackagesPage from '../components/AcademyServicePackagesPage';

const foilPackages = [
  {
    id: 'foil-intro',
    name: 'Foil Introduction',
    subtitle: 'First Flights',
    icon: <RiseOutlined />,
    featured: true,
    color: 'cyan',
    gradient: 'from-cyan-500 to-blue-500',
    shadow: 'shadow-cyan-500/20',
    border: 'hover:border-cyan-500/50',
    image: '/Images/ukc/foil-lessons-header.png',
    description: 'Already riding upwind? Start hydrofoil safely with a progressive plan from first rides to stable control.',
    highlights: [
      'Foil setup & safety briefing',
      'Body position fundamentals',
      'Controlled lift-off practice',
      'Balance and recovery drills',
      'Flight height management',
      'Confidence progression'
    ],
    durations: [
      { hours: '2h', price: 140, label: 'Intro', sessions: '2 x 1hr', tag: 'Starter' },
      { hours: '4h', price: 260, label: 'Core', sessions: '4 x 1hr', tag: 'Popular' },
      { hours: '6h', price: 380, label: 'Plus', sessions: '6 x 1hr', tag: 'Progress' },
      { hours: '8h', price: 500, label: 'Track', sessions: '8 x 1hr', tag: 'Value' }
    ],
    badges: ['Prerequisite: Upwind Ride', 'Progressive Learning']
  },
  {
    id: 'foil-boat-assist',
    name: 'Boat-Assisted Foil',
    subtitle: 'Accelerated Progress',
    icon: <ExperimentOutlined />,
    featured: false,
    color: 'blue',
    gradient: 'from-blue-600 to-indigo-500',
    shadow: 'shadow-blue-500/20',
    border: 'hover:border-blue-500/50',
    image: '/Images/ukc/foil-lessons-header.png',
    description: 'Boost your learning speed with assisted sessions designed for maximum repetitions and faster correction loops.',
    highlights: [
      'Dedicated support boat',
      'Faster repetition cycles',
      'Immediate coaching feedback',
      'Efficient recovery support',
      'Stable training environment',
      'Accelerated progression plan'
    ],
    durations: [
      { hours: '2h', price: 190, label: 'Boost', sessions: '2 x 1hr', tag: 'Fast Track' },
      { hours: '4h', price: 360, label: 'Core', sessions: '4 x 1hr', tag: 'Popular' },
      { hours: '6h', price: 520, label: 'Intensive', sessions: '6 x 1hr', tag: 'Recommended' },
      { hours: '8h', price: 680, label: 'Pro Track', sessions: '8 x 1hr', tag: 'Advanced' }
    ],
    badges: ['Boat Support', 'Rapid Progress']
  },
  {
    id: 'foil-progression',
    name: 'Foil Progression',
    subtitle: 'Control & Transitions',
    icon: <ThunderboltOutlined />,
    featured: false,
    color: 'purple',
    gradient: 'from-purple-600 to-fuchsia-500',
    shadow: 'shadow-purple-500/20',
    border: 'hover:border-purple-500/50',
    image: '/Images/ukc/foil-lessons-header.png',
    description: 'Refine carving, turning, and sustained flight control for confident independent sessions.',
    highlights: [
      'Carving line control',
      'Transition timing drills',
      'Speed management',
      'Ride efficiency improvements',
      'Technical correction plan',
      'Advanced progression roadmap'
    ],
    durations: [
      { hours: '4h', price: 320, label: 'Refine', sessions: '4 x 1hr', tag: 'Core' },
      { hours: '6h', price: 450, label: 'Flow', sessions: '6 x 1hr', tag: 'Popular' },
      { hours: '8h', price: 580, label: 'Advanced', sessions: '8 x 1hr', tag: 'Strong' },
      { hours: '10h', price: 700, label: 'Elite', sessions: '10 x 1hr', tag: 'Intensive' }
    ],
    badges: ['Advanced Riders', 'Performance Coaching']
  },
  {
    id: 'foil-complete',
    name: 'Complete Foil Course',
    subtitle: 'End-to-End Program',
    icon: <RocketOutlined />,
    featured: false,
    color: 'green',
    gradient: 'from-green-500 to-emerald-600',
    shadow: 'shadow-green-500/20',
    border: 'hover:border-green-500/50',
    image: '/Images/ukc/foil-lessons-header.png',
    description: 'Structured end-to-end program combining fundamentals, assisted learning, and advanced control sessions.',
    highlights: [
      'Combined coaching phases',
      'Step-by-step milestones',
      'Balanced session plan',
      'Targeted correction blocks',
      'Long-term progression support',
      'Best value package'
    ],
    durations: [
      { hours: '8h', price: 590, label: 'Complete', sessions: '8 x 1hr', tag: 'Best Value' },
      { hours: '10h', price: 720, label: 'Extended', sessions: '10 x 1hr', tag: 'Recommended' },
      { hours: '12h', price: 840, label: 'Pro', sessions: '12 x 1hr', tag: 'Intensive' },
      { hours: '14h', price: 960, label: 'Elite', sessions: '14 x 1hr', tag: 'Full Track' }
    ],
    badges: ['Full Program', 'Mentored Journey']
  }
];

const FoilLessonsPage = () => (
  <AcademyServicePackagesPage
    seoTitle="Foil Lessons | UKC Academy"
    seoDescription="Learn hydrofoil safely with structured packages from intro to advanced progression."
    headline="Foil"
    accentWord="Lessons"
    academyTheme="academy"
    subheadline="Fly above the water with a guided progression path built for confident and controlled foil riding."
    packages={foilPackages}
    dynamicServiceKey="foil"
  />
);

export default FoilLessonsPage;
