import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from 'antd';
import {
  ShoppingCartOutlined,
  ThunderboltOutlined,
  SafetyCertificateOutlined,
  CustomerServiceOutlined,
  InfoCircleOutlined
} from '@ant-design/icons';
import { usePageSEO } from '@/shared/utils/seo';
import { useShopFilters } from '@/shared/contexts/ShopFiltersContext';
import { productApi } from '@/shared/services/productApi';

const SECTIONS = [
  {
    id: 'kitesurf',
    label: 'KITESURF',
    color: 'emerald',
    activeClass: 'text-emerald-400 border-emerald-400',
    btnClass: '!bg-emerald-600 !border-emerald-600 hover:!bg-emerald-500 shadow-emerald-900/40',
    gradientSkeleton: 'from-emerald-900/20 to-green-900/20',
    image: '/Images/ukc/rebel-dlab-rent.png',
    title: 'KITESURF GEAR',
    subtitle: 'Everything you need to ride the wind.',
    description: 'From the latest Duotone kites and boards to bars, harnesses, and spare parts — explore our full range of kitesurfing equipment. Whether you\'re just getting started or upgrading your setup, we\'ve got you covered.',
    buttonText: 'Browse Kitesurf',
    filterCategory: 'kitesurf',
  },
  {
    id: 'wing-foil',
    label: 'WING FOIL',
    color: 'purple',
    activeClass: 'text-purple-400 border-purple-400',
    btnClass: '!bg-purple-600 !border-purple-600 hover:!bg-purple-500 shadow-purple-900/40',
    gradientSkeleton: 'from-purple-900/20 to-fuchsia-900/20',
    image: '/Images/ukc/wing-header.png',
    title: 'WING FOIL',
    subtitle: 'Fly above the water with the latest wing foil gear.',
    description: 'Complete wing foil setups, foil boards, wings, and accessories from top brands. The fastest-growing watersport deserves the best equipment — find it here.',
    buttonText: 'Browse Wing Foil',
    filterCategory: 'wing-foil',
  },
  {
    id: 'e-foil',
    label: 'E-FOIL',
    color: 'yellow',
    activeClass: 'text-yellow-400 border-yellow-400',
    btnClass: '!bg-yellow-600 !border-yellow-600 hover:!bg-yellow-500 shadow-yellow-900/40',
    gradientSkeleton: 'from-yellow-900/20 to-amber-900/20',
    image: '/Images/ukc/e-foil.png',
    title: 'E-FOIL',
    subtitle: 'Electric flight. No wind required.',
    description: 'Explore our selection of Fliteboard e-foils and accessories. Experience the thrill of flying above the water powered by a whisper-quiet electric motor — perfect for any conditions.',
    buttonText: 'Browse E-Foil',
    filterCategory: 'e-foil',
  },
  {
    id: 'wetsuits',
    label: 'WETSUITS',
    color: 'cyan',
    activeClass: 'text-cyan-400 border-cyan-400',
    btnClass: '!bg-cyan-600 !border-cyan-600 hover:!bg-cyan-500 shadow-cyan-900/40',
    gradientSkeleton: 'from-cyan-900/20 to-blue-900/20',
    image: '/assets/images/highres-5.png',
    title: 'WETSUITS',
    subtitle: 'Stay warm. Stay flexible. Stay in the water longer.',
    description: 'Premium wetsuits for men, women, and kids. From full suits to shorties, spring suits to drysuits — find the perfect fit for your sessions in any water temperature.',
    buttonText: 'Browse Wetsuits',
    filterCategory: 'wetsuits',
  },
  {
    id: 'ion-accs',
    label: 'ION ACCS',
    color: 'pink',
    activeClass: 'text-pink-400 border-pink-400',
    btnClass: '!bg-pink-600 !border-pink-600 hover:!bg-pink-500 shadow-pink-900/40',
    gradientSkeleton: 'from-pink-900/20 to-rose-900/20',
    image: '/assets/images/harness.png',
    title: 'ION ACCESSORIES',
    subtitle: 'Premium accessories for every rider.',
    description: 'Harnesses, impact vests, helmets, boots, gloves, bags, and more from ION. The finishing touches that make every session safer, more comfortable, and more fun.',
    buttonText: 'Browse ION Accessories',
    filterCategory: 'ion-accs',
  },
  {
    id: 'second-wind',
    label: 'SECONDWIND',
    color: 'amber',
    activeClass: 'text-amber-400 border-amber-400',
    btnClass: '!bg-amber-600 !border-amber-600 hover:!bg-amber-500 shadow-amber-900/40',
    gradientSkeleton: 'from-amber-900/20 to-orange-900/20',
    image: '/assets/images/2ndwind.jpeg',
    title: 'SECONDWIND — 2ND HAND',
    subtitle: 'Quality second-hand gear at great prices.',
    description: 'Pre-loved kites, boards, and equipment — inspected and priced to move. Great gear doesn\'t have to break the bank. Find hidden gems from our carefully curated used collection.',
    buttonText: 'Browse Second-Hand',
    filterCategory: 'second-wind',
  },
];

const ShopLandingPage = () => {
  const navigate = useNavigate();
  const [activeSection, setActiveSection] = useState(SECTIONS[0].id);
  const [imagesLoaded, setImagesLoaded] = useState({});
  const { allProducts, setAllProducts } = useShopFilters();

  usePageSEO({
    title: 'Shop | UKC World',
    description: 'Browse our full range of kitesurfing, wing foil, e-foil gear, wetsuits, and accessories.'
  });

  // Populate sidebar category filters when landing page loads
  useEffect(() => {
    if (allProducts.length > 0) return;
    let cancelled = false;
    productApi.getProductsByCategory(200)
      .then(response => {
        if (cancelled) return;
        if (response?.success && response?.categories) {
          const flat = Object.values(response.categories).flatMap(g => g.products || []);
          if (flat.length > 0) setAllProducts(flat);
        }
      })
      .catch(() => { /* ignore errors — sidebar filters are non-critical */ });
    return () => { cancelled = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleImageLoad = (sectionId) => {
    setImagesLoaded(prev => ({ ...prev, [sectionId]: true }));
  };

  useEffect(() => {
    const handleScroll = () => {
      const scrollPosition = window.scrollY + window.innerHeight / 3;

      for (const section of SECTIONS) {
        const el = document.getElementById(`shop-${section.id}`);
        if (el) {
          const { offsetTop, offsetHeight } = el;
          if (scrollPosition >= offsetTop && scrollPosition < offsetTop + offsetHeight) {
            setActiveSection(section.id);
            break;
          }
        }
      }
    };

    window.addEventListener('scroll', handleScroll);
    handleScroll();
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const scrollToSection = (sectionId) => {
    document.getElementById(`shop-${sectionId}`)?.scrollIntoView({ behavior: 'smooth' });
    setActiveSection(sectionId);
  };

  return (
    <div className="bg-[#0d1511] min-h-screen text-white font-sans pb-20 selection:bg-emerald-400/30">

      {/* Sticky Category Nav */}
      <div className="sticky top-0 z-30 border-b border-white/5 bg-[#1e2b33] backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-start md:justify-center items-center overflow-x-auto py-4 gap-5 md:gap-10 lg:gap-12 scrollbar-hide no-scrollbar">
            {SECTIONS.map((s) => (
              <button
                key={s.id}
                onClick={() => scrollToSection(s.id)}
                className={`flex items-center gap-2 text-sm md:text-base font-semibold transition-all duration-200 drop-shadow-md tracking-wide whitespace-nowrap ${
                  activeSection === s.id
                    ? 'text-cyan-400 border-b-2 border-cyan-400 pb-1 -mb-0.5'
                    : 'text-white/70 hover:text-white pb-1'
                }`}
              >
                <span>{s.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Hero Sections */}
      {SECTIONS.map((section, idx) => (
        <div
          key={section.id}
          id={`shop-${section.id}`}
          className="relative min-h-[500px] sm:min-h-[600px] flex flex-col group"
        >
          {/* Background Image */}
          <div className="absolute inset-0 z-0">
            <img
              src={section.image}
              alt={`${section.title} background`}
              className={`absolute inset-0 w-full h-full object-cover object-center transition-all duration-1000 ${
                imagesLoaded[section.id] ? 'opacity-100 group-hover:scale-105' : 'opacity-0'
              }`}
              onLoad={() => handleImageLoad(section.id)}
              loading={idx === 0 ? 'eager' : 'lazy'}
              fetchpriority={idx === 0 ? 'high' : undefined}
            />
            {/* Loading skeleton */}
            {!imagesLoaded[section.id] && (
              <div className={`absolute inset-0 bg-gradient-to-br ${section.gradientSkeleton} animate-pulse`} />
            )}
            {/* Gradient Overlay */}
            <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/30 to-[#0d1511]" />
          </div>

          {/* Content */}
          <div className="relative z-10 flex-grow flex flex-col justify-center max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-20 md:py-32 w-full">
            <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold mb-3 tracking-tight text-white drop-shadow-xl">
              {section.title}
            </h1>
            <p className="text-lg sm:text-xl font-medium text-white mb-2 drop-shadow">
              {section.subtitle}
            </p>
            <p className="text-sm sm:text-base text-white mb-6 sm:mb-8 max-w-lg leading-relaxed">
              {section.description}
            </p>

            <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
              <Button
                type="primary"
                size="large"
                className={`${section.btnClass} !h-12 sm:!h-14 !px-8 sm:!px-10 !text-base sm:!text-lg !font-bold !rounded-lg shadow-xl hover:-translate-y-1 transition-transform w-full sm:w-auto`}
                icon={<ShoppingCartOutlined />}
                onClick={() => navigate(`/shop/${section.filterCategory}`)}
              >
                {section.buttonText}
              </Button>
            </div>
          </div>
        </div>
      ))}

      {/* Trust Section */}
      <div className="py-20 bg-[#0d1511]">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl sm:text-3xl font-bold text-center text-white mb-12">
            Why Shop With Us?
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
            <div className="text-center">
              <div className="w-14 h-14 mx-auto rounded-full bg-emerald-500/10 flex items-center justify-center mb-4">
                <SafetyCertificateOutlined className="text-2xl text-emerald-400" />
              </div>
              <h3 className="text-lg font-semibold text-white mb-2">Authorized Dealer</h3>
              <p className="text-sm text-white/60">Official Duotone, ION & Fliteboard dealer. Genuine products with full manufacturer warranty.</p>
            </div>
            <div className="text-center">
              <div className="w-14 h-14 mx-auto rounded-full bg-cyan-500/10 flex items-center justify-center mb-4">
                <ThunderboltOutlined className="text-2xl text-cyan-400" />
              </div>
              <h3 className="text-lg font-semibold text-white mb-2">Expert Advice</h3>
              <p className="text-sm text-white/60">Our instructors ride the gear they sell. Get real, hands-on advice from people who know.</p>
            </div>
            <div className="text-center">
              <div className="w-14 h-14 mx-auto rounded-full bg-purple-500/10 flex items-center justify-center mb-4">
                <CustomerServiceOutlined className="text-2xl text-purple-400" />
              </div>
              <h3 className="text-lg font-semibold text-white mb-2">Try Before You Buy</h3>
              <p className="text-sm text-white/60">Test equipment from our rental fleet before committing. Rent, ride, decide — then buy with confidence.</p>
            </div>
          </div>
        </div>
      </div>

      {/* CTA Section */}
      <div className="py-16 bg-[#0d1511]">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-2xl font-bold mb-4 text-white">Need Help Choosing?</h2>
          <p className="text-gray-400 mb-8">Not sure which gear is right for you? Our team can recommend the perfect setup based on your level and riding style.</p>
          <div className="flex justify-center gap-4">
            <Button
              icon={<InfoCircleOutlined />}
              size="large"
              className="!bg-[#1a1d26] !text-white !border-white/10 hover:!border-white/30"
              onClick={() => navigate('/shop/browse')}
            >
              Browse All Products
            </Button>
            <Button
              type="primary"
              size="large"
              className="!bg-emerald-600 !border-none hover:!bg-emerald-500"
              onClick={() => navigate('/contact')}
            >
              Contact Us
            </Button>
          </div>
        </div>
      </div>

      <style>{`
        .scrollbar-hide::-webkit-scrollbar,
        .no-scrollbar::-webkit-scrollbar {
          display: none;
        }
        .scrollbar-hide,
        .no-scrollbar {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
      `}</style>
    </div>
  );
};

export default ShopLandingPage;
