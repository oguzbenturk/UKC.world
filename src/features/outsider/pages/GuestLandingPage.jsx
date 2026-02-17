/**
 * GuestLandingPage - Modern 2026 Welcome page for Duotone Pro Center Urla
 */

import { useNavigate } from 'react-router-dom';
import { Button } from 'antd';
import {
  ShoppingBagIcon,
  AcademicCapIcon,
  CubeIcon,
  WrenchScrewdriverIcon,
  HomeIcon,
  CalendarDaysIcon,
  UsersIcon,
  ChatBubbleLeftRightIcon,
  ArrowRightIcon
} from '@heroicons/react/24/outline';

const GuestLandingPage = () => {
  const navigate = useNavigate();

  // Services with size hints for bento layout - ORDER MATCHES SIDEBAR
  const services = [
    {
      title: '.Shop',
      icon: ShoppingBagIcon,
      color: '#ec4899',
      path: '/shop',
      tagline: 'Official Duotone Dealer',
      description: 'Premium kites, boards, wetsuits and accessories.',
      subItems: ['Kitesurf', 'Wing Foil', 'E-Foil', 'Wetsuits', 'ION ACCS'],
      size: 'large'
    },
    {
      title: '.Academy',
      icon: AcademicCapIcon,
      color: '#4ade80',
      path: '/academy/kite-lessons',
      tagline: 'IKO Certified Instructors',
      description: 'Learn to kite with the best. From beginner to advanced.',
      subItems: ['Kite Lessons', 'Foil Lessons', 'Wing Lessons', 'E-Foil Lessons', 'Premium Lessons'],
      size: 'large'
    },
    {
      title: '.Rental',
      icon: CubeIcon,
      color: '#fb923c',
      path: '/rental/standard',
      tagline: '2024 Duotone Gear',
      subItems: ['Standard', 'Premium'],
      size: 'small'
    },
    {
      title: '.Member',
      icon: UsersIcon,
      color: '#93c47d',
      path: '/members/offerings',
      tagline: 'Exclusive Benefits',
      subItems: ['Packages', 'Discounts'],
      size: 'small'
    },
    {
      title: '.Care',
      icon: WrenchScrewdriverIcon,
      color: '#14b8a6',
      path: '/repairs',
      tagline: 'All Brands Welcome',
      subItems: ['Kite', 'Board', 'Bar & Lines'],
      size: 'small'
    },
    {
      title: '.Stay',
      icon: HomeIcon,
      color: '#3b82f6',
      path: '/stay/book-accommodation',
      tagline: 'Beach-side Living',
      subItems: ['Accommodation', 'Hotel'],
      size: 'medium'
    },
    {
      title: '.Experience',
      icon: CalendarDaysIcon,
      color: '#eab308',
      path: '/experience/kite-packages',
      tagline: 'Adventure Awaits',
      subItems: ['Packages', 'DownWinders', 'Camps'],
      size: 'small'
    },
    {
      title: '.Community',
      icon: ChatBubbleLeftRightIcon,
      color: '#0ea5e9',
      path: '/chat',
      tagline: 'Join the Tribe',
      subItems: ['Chat', 'Events'],
      size: 'small'
    }
  ];

  // Bento card component
  const BentoCard = ({ service, className = '' }) => (
    <div
      onClick={() => navigate(service.path)}
      className={`
        group relative overflow-hidden rounded-xl cursor-pointer
        bg-white
        border border-gray-200/60
        shadow-sm
        transition-all duration-300 ease-out
        hover:shadow-lg hover:border-gray-300/60 hover:-translate-y-0.5
        ${className}
      `}
    >
      {/* Colored top accent bar */}
      <div 
        className="h-1 w-full"
        style={{ backgroundColor: service.color }}
      />
      
      {/* Content */}
      <div className="h-full p-5 flex flex-col">
        {/* Title */}
        <h3 className="text-lg font-bold mb-0.5" style={{ color: service.color }}>
          {service.title}
        </h3>
        <p className="text-xs text-gray-400 uppercase tracking-wide mb-4">{service.tagline}</p>

        {/* Sub-items as clean list */}
        <ul className="space-y-1.5 mt-auto">
          {service.subItems.map((item, i) => (
            <li 
              key={i} 
              className="flex items-center gap-2 text-sm text-gray-600"
            >
              <span className="w-1 h-1 bg-gray-300 rounded-full" />
              {item}
            </li>
          ))}
        </ul>

        {/* Explore link */}
        <div 
          className="flex items-center gap-1.5 text-sm font-medium mt-4 pt-3 border-t border-gray-100 transition-all duration-200"
          style={{ color: service.color }}
        >
          <span className="group-hover:underline">Explore</span>
          <ArrowRightIcon className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" />
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-slate-50">
      {/* Welcome Header */}
      <div className="max-w-6xl mx-auto px-4 pt-10 pb-6 text-center">
        <h1 className="text-3xl md:text-4xl font-bold text-gray-900 mb-3 tracking-tight">
          Welcome to Duotone Pro Center Urla
        </h1>
        <p className="text-lg text-gray-500 max-w-2xl mx-auto leading-relaxed">
          Your complete kitesurfing destination in the Aegean. Explore our services below.
        </p>
      </div>

      {/* Bento Grid */}
      <div className="max-w-6xl mx-auto px-4 pb-8">
        {/* Uniform Grid Layout */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {services.map((service, idx) => (
            <BentoCard key={idx} service={service} />
          ))}
        </div>
      </div>

      {/* Bottom CTA */}
      <div className="max-w-6xl mx-auto px-4 pb-10">
        <div className="text-center py-10 px-6 bg-gradient-to-r from-green-500/10 via-emerald-500/5 to-blue-500/10 rounded-3xl border border-white/50">
          <h3 className="text-2xl font-bold text-gray-900 mb-2">Ready to Ride the Wind?</h3>
          <p className="text-gray-500 mb-6 max-w-md mx-auto">
            Start your kitesurfing journey today with our expert instructors
          </p>
          <div className="flex justify-center gap-4 flex-wrap">
            <Button 
              type="primary" 
              size="large"
              className="bg-green-500 hover:bg-green-600 border-0 rounded-2xl px-8 h-14 font-semibold text-base shadow-xl shadow-green-500/25 transition-all duration-300 hover:shadow-2xl hover:shadow-green-500/30 hover:-translate-y-0.5"
              onClick={() => navigate('/academy/kite-lessons')}
            >
              Book Your First Lesson
            </Button>
            <Button 
              size="large"
              className="rounded-2xl px-8 h-14 font-semibold text-base border-2 border-gray-200 hover:border-gray-300 transition-all duration-300 hover:-translate-y-0.5"
              onClick={() => navigate('/shop')}
            >
              Browse Shop
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default GuestLandingPage;
