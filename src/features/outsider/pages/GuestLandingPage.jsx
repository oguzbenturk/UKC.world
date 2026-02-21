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

  const services = [
    {
      title: '.Shop',
      icon: ShoppingBagIcon,
      color: '#ec4899',
      path: '/shop',
      tagline: 'Official Duotone Dealer',
      subItems: ['Kitesurf', 'Wing Foil', 'E-Foil', 'Wetsuits', 'ION ACCS', 'SecondWind (2nd hand)'],
      size: 'large'
    },
    {
      title: '.Academy',
      icon: AcademicCapIcon,
      color: '#4ade80',
      path: '/academy',
      tagline: 'IKO Certified Instructors',
      subItems: ['Kite Lessons', 'Foil Lessons', 'Wing Lessons', 'E-Foil Lessons', 'Premium Lessons'],
      size: 'large'
    },
    {
      title: '.Rental',
      icon: CubeIcon,
      color: '#fb923c',
      path: '/rental',
      tagline: 'Premium Equipment',
      subItems: ['Full Set', 'Kiteboard Only', 'Wetsuit Only', 'Harness & Bar', 'SLS Equipment', 'D/LAB Equipment', 'E-Foil Equipment'],
      size: 'small'
    },
    {
      title: '.Member',
      icon: UsersIcon,
      color: '#93c47d',
      path: '/members/offerings',
      tagline: 'Exclusive Benefits',
      subItems: ['Membership Packages', 'Lesson Discounts', 'Rental Priority', 'Early Access'],
      size: 'small'
    },
    {
      title: '.Care',
      icon: WrenchScrewdriverIcon,
      color: '#14b8a6',
      path: '/care',
      tagline: 'All Brands Welcome',
      subItems: ['Kite Repair', 'Board Repair', 'Bar & Lines', 'Bladder Replacement', 'Full Service'],
      size: 'small'
    },
    {
      title: '.Stay',
      icon: HomeIcon,
      color: '#3b82f6',
      path: '/stay',
      tagline: 'Beach-side Living',
      subItems: ['Beach House', 'Hotel Rooms', 'Long-term Stay'],
      size: 'medium'
    },
    {
      title: '.Experience',
      icon: CalendarDaysIcon,
      color: '#eab308',
      path: '/experience',
      tagline: 'Adventure Awaits',
      subItems: ['Kite Packages', 'Wing Packages', 'DownWinders', 'Camps'],
      size: 'small'
    },
    {
      title: '.Community',
      icon: ChatBubbleLeftRightIcon,
      color: '#0ea5e9',
      path: '/services/events',
      tagline: 'Join the Tribe',
      subItems: ['Live Chat', 'Events & Meetups', 'Rider Community'],
      size: 'small'
    }
  ];

  const BentoCard = ({ service }) => {
    const Icon = service.icon;
    return (
      <div
        onClick={() => navigate(service.path)}
        style={{ backgroundColor: service.color }}
        className="group relative isolate overflow-hidden rounded-3xl cursor-pointer flex flex-col transition-[transform,box-shadow] duration-300 hover:-translate-y-1.5 hover:shadow-2xl"
      >
        {/* Subtle dark vignette overlay so text pops */}
        <div className="absolute inset-0 bg-gradient-to-br from-black/0 via-black/5 to-black/20 pointer-events-none" />
        {/* Hover shimmer */}
        <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-white/10 pointer-events-none" />

        <div className="relative z-10 p-5 flex flex-col h-full min-h-[210px]">
          {/* Icon */}
          <div className="w-12 h-12 rounded-2xl bg-white/20 border border-white/30 flex items-center justify-center mb-4 transition-transform duration-300 group-hover:scale-110 shadow-lg">
            <Icon className="w-6 h-6 text-white" />
          </div>

          {/* Title */}
          <h3 className="text-2xl font-black text-white tracking-tight leading-none mb-1">
            {service.title}
          </h3>
          <p className="text-xs font-semibold uppercase tracking-widest text-white/70 mb-4">
            {service.tagline}
          </p>

          {/* Sub-items */}
          <ul className="space-y-1.5 flex-1">
            {service.subItems.map((item, i) => (
              <li key={i} className="flex items-center gap-2 text-sm text-white/80">
                <span className="w-1 h-1 rounded-full bg-white/60 flex-shrink-0" />
                {item}
              </li>
            ))}
          </ul>

          {/* Explore */}
          <div className="flex items-center gap-1.5 text-sm font-bold text-white mt-4 pt-3 border-t border-white/20">
            <span className="group-hover:underline">Explore</span>
            <ArrowRightIcon className="w-4 h-4 transition-transform group-hover:translate-x-1" />
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-white to-slate-50 font-sans">
      {/* Welcome Header */}
      <div className="max-w-6xl mx-auto px-4 pt-12 pb-8 text-center">
        <h1 className="text-3xl md:text-4xl font-bold text-gray-900 mb-3 tracking-tight">
          Welcome to Duotone Pro Center Urla
        </h1>
        <p className="text-lg text-gray-400 max-w-2xl mx-auto leading-relaxed">
          Your complete kitesurfing destination in the Aegean. Explore our services below.
        </p>
      </div>

      {/* Card Grid */}
      <div className="max-w-6xl mx-auto px-4 pb-8">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {services.map((service, idx) => (
            <BentoCard key={idx} service={service} />
          ))}
        </div>
      </div>

      {/* Bottom CTA */}
      <div className="max-w-6xl mx-auto px-4 pb-12">
        <div className="text-center py-10 px-6 rounded-3xl border border-gray-100 bg-white shadow-sm">
          <h3 className="text-2xl font-bold text-gray-900 mb-2">Ready to Ride the Wind?</h3>
          <p className="text-gray-400 mb-6 max-w-md mx-auto">
            Start your kitesurfing journey today with our expert instructors
          </p>
          <div className="flex justify-center gap-4 flex-wrap">
            <Button
              type="primary"
              size="large"
              className="!bg-green-500 hover:!bg-green-600 !border-0 !rounded-2xl !px-8 !h-14 !font-semibold !text-base"
              onClick={() => navigate('/academy')}
            >
              Book Your First Lesson
            </Button>
            <Button
              size="large"
              className="!rounded-2xl !px-8 !h-14 !font-semibold !text-base !border-gray-300 !text-gray-800 hover:!border-gray-500 hover:!text-gray-900 !bg-white"
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
