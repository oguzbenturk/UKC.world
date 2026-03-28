import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from 'antd';
import {
  ShoppingCartOutlined,
  ThunderboltOutlined,
  SafetyCertificateOutlined,
  CustomerServiceOutlined,
  LeftOutlined,
  RightOutlined
} from '@ant-design/icons';
import { usePageSEO } from '@/shared/utils/seo';
import { useShopFilters } from '@/shared/contexts/ShopFiltersContext';
import { productApi } from '@/shared/services/productApi';
import StickyNavBar from '@/shared/components/navigation/StickyNavBar';

const SECTIONS = [
  {
    id: 'kitesurf',
    label: 'KITEBOARDING',
    color: 'emerald',
    activeClass: 'text-emerald-400 border-emerald-400',
    btnClass: '!bg-emerald-600 !border-emerald-600 hover:!bg-emerald-500 shadow-emerald-900/40',
    gradientSkeleton: 'from-emerald-900/20 to-green-900/20',
    image: '/Images/ukc/rebel-dlab-rent.png',
    title: 'KITEBOARDING',
    subtitle: 'Everything you need to ride the wind.',
    description: 'From the latest Duotone kites and boards to control bars, harnesses, and spare parts — explore our full range of kiteboarding equipment. Whether you\'re just getting started or upgrading your setup, we\'ve got you covered.',
    buttonText: 'Browse Kiteboarding',
    filterCategory: 'kitesurf',
  },
  {
    id: 'wingfoil',
    label: 'WING FOILING',
    color: 'purple',
    activeClass: 'text-purple-400 border-purple-400',
    btnClass: '!bg-purple-600 !border-purple-600 hover:!bg-purple-500 shadow-purple-900/40',
    gradientSkeleton: 'from-purple-900/20 to-fuchsia-900/20',
    image: '/Images/ukc/wing-header.png',
    title: 'WING FOILING',
    subtitle: 'Fly above the water with the latest wing foil gear.',
    description: 'Complete wing foil setups, foil boards, wings, and accessories. The fastest-growing watersport deserves the best equipment — find it here.',
    buttonText: 'Browse Wing Foiling',
    filterCategory: 'wingfoil',
  },
  {
    id: 'efoil',
    label: 'FOILING',
    color: 'yellow',
    activeClass: 'text-yellow-400 border-yellow-400',
    btnClass: '!bg-yellow-600 !border-yellow-600 hover:!bg-yellow-500 shadow-yellow-900/40',
    gradientSkeleton: 'from-yellow-900/20 to-amber-900/20',
    image: '/Images/ukc/e-foil.png',
    title: 'FOILING',
    subtitle: 'Electric flight. No wind required.',
    description: 'Explore our selection of e-foils and FoilAssist boards. Experience the thrill of flying above the water powered by a whisper-quiet electric motor — perfect for any conditions.',
    buttonText: 'Browse Foiling',
    filterCategory: 'efoil',
  },
  {
    id: 'ion',
    label: 'ION ACCESSORIES',
    color: 'pink',
    activeClass: 'text-pink-400 border-pink-400',
    btnClass: '!bg-pink-600 !border-pink-600 hover:!bg-pink-500 shadow-pink-900/40',
    gradientSkeleton: 'from-pink-900/20 to-rose-900/20',
    image: '/assets/images/harness.png',
    title: 'ION ACCESSORIES',
    subtitle: 'Premium gear for every rider.',
    description: 'Wetsuits, harnesses, protection equipment, water apparel, and accessories from ION. Everything you need for comfort and performance on and off the water.',
    buttonText: 'Browse ION Accessories',
    filterCategory: 'ion',
  },
  {
    id: 'secondwind',
    label: 'SECONDWIND',
    color: 'amber',
    activeClass: 'text-amber-400 border-amber-400',
    btnClass: '!bg-amber-600 !border-amber-600 hover:!bg-amber-500 shadow-amber-900/40',
    gradientSkeleton: 'from-amber-900/20 to-orange-900/20',
    image: '/assets/images/2ndwind.jpeg',
    title: 'SECONDWIND',
    subtitle: 'Quality second-hand gear at great prices.',
    description: 'Pre-loved kites, boards, bars, and sets — inspected and priced to move. Great gear doesn\'t have to break the bank. Find hidden gems from our carefully curated used collection.',
    buttonText: 'Browse SecondWind',
    filterCategory: 'secondwind',
  },
];

const ShopLandingPage = () => {
  const navigate = useNavigate();
  const [activeSection, setActiveSection] = useState(SECTIONS[0].id);
  const [imagesLoaded, setImagesLoaded] = useState({});
  const { allProducts, setAllProducts } = useShopFilters();

  usePageSEO({
    title: 'Shop | UKC World',
    description: 'Browse our full range of kiteboarding, wing foiling, foiling gear, wetsuits, and accessories.'
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
            window.dispatchEvent(new CustomEvent('shopLanding:sectionChange', { detail: section.id }));
            break;
          }
        }
      }
    };

    window.addEventListener('scroll', handleScroll);
    handleScroll();
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Listen for navbar pill clicks
  useEffect(() => {
    const handler = (e) => scrollToSection(e.detail);
    window.addEventListener('shopLanding:scrollTo', handler);
    return () => window.removeEventListener('shopLanding:scrollTo', handler);
  });

  const scrollToSection = (sectionId) => {
    document.getElementById(`shop-${sectionId}`)?.scrollIntoView({ behavior: 'smooth' });
    setActiveSection(sectionId);
    window.dispatchEvent(new CustomEvent('shopLanding:sectionChange', { detail: sectionId }));
  };


  // Helper to determine if we're on the landing page
  const isLandingPage = window.location.pathname === '/shop';

  // Click handler for filter bar
  const handleFilterTabClick = (section) => {
    if (isLandingPage) {
      scrollToSection(section.id);
    } else {
      navigate(`/shop/${section.filterCategory}`);
    }
  };

  return (
    <div className="bg-[#0d1511] min-h-screen text-white font-sans pb-20 selection:bg-emerald-400/30">

      {/* Sticky Category Nav */}
      <StickyNavBar
        className=""
        items={SECTIONS}
        activeItem={activeSection}
        onItemClick={(id, item) => handleFilterTabClick(item)}
      />

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
            <div className="flex items-baseline gap-1 mb-2">
              <span className="font-gotham-medium antialiased text-white" style={{ fontWeight: 500, letterSpacing: '0.1em', fontSize: '1.5rem', textRendering: 'geometricPrecision' }}>UKC</span>
              <span className="font-gotham-medium antialiased text-[#00a8c4]" style={{ fontWeight: 500, letterSpacing: 0, marginLeft: '-0.06em', fontSize: '1.5rem', textRendering: 'geometricPrecision' }}>.</span>
              <span className="font-gotham-medium antialiased" style={{ fontWeight: 600, letterSpacing: '0.02em', fontSize: '1.25rem', color: '#ec4899', textRendering: 'geometricPrecision', WebkitFontSmoothing: 'antialiased', MozOsxFontSmoothing: 'grayscale' }}>Shop</span>
            </div>
            <h1 className="text-3xl sm:text-4xl md:text-5xl font-duotone-bold mb-3 tracking-tight text-white drop-shadow-xl">
              {section.title}
            </h1>
            <p className="text-lg sm:text-xl font-duotone-bold text-white mb-2 drop-shadow">
              {section.subtitle}
            </p>
            <p className="text-sm sm:text-base font-duotone-regular text-white mb-6 sm:mb-8 max-w-lg leading-relaxed">
              {section.description}
            </p>

            <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 px-4 sm:px-0">
              <Button
                size="large"
                className="font-duotone-bold !h-12 sm:!h-14 !px-8 sm:!px-10 text-base sm:text-lg !rounded-lg shadow-xl transition-all duration-150 focus:outline-none w-full sm:w-auto"
                style={{ background: '#4b4f54', color: '#00a8c4', border: '1px solid rgba(0,168,196,0.5)', boxShadow: '0 0 8px rgba(0,168,196,0.2)' }}
                icon={<ShoppingCartOutlined />}
                onClick={() => navigate(`/shop/${section.filterCategory}`)}
              >
                {section.buttonText}
              </Button>
            </div>
          </div>
        </div>
      ))}

      {/* Duotone Banner */}

      {/* Trust Section */}
      <div className="py-20 bg-[#0d1511]">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl sm:text-3xl font-duotone-bold text-center text-white mb-12">
            Why Shop With Us?
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
            <div className="text-center">
              <div className="w-14 h-14 mx-auto rounded-full bg-emerald-500/10 flex items-center justify-center mb-4">
                <SafetyCertificateOutlined className="text-2xl text-emerald-400" />
              </div>
              <h3 className="text-lg font-duotone-bold text-white mb-2">Authorized Dealer</h3>
              <p className="text-sm font-duotone-regular text-white/60">Official Duotone, ION & Fliteboard dealer. Genuine products with full manufacturer warranty.</p>
            </div>
            <div className="text-center">
              <div className="w-14 h-14 mx-auto rounded-full bg-cyan-500/10 flex items-center justify-center mb-4">
                <ThunderboltOutlined className="text-2xl text-cyan-400" />
              </div>
              <h3 className="text-lg font-duotone-bold text-white mb-2">Expert Advice</h3>
              <p className="text-sm font-duotone-regular text-white/60">Our instructors ride the gear they sell. Get real, hands-on advice from people who know.</p>
            </div>
            <div className="text-center">
              <div className="w-14 h-14 mx-auto rounded-full bg-purple-500/10 flex items-center justify-center mb-4">
                <CustomerServiceOutlined className="text-2xl text-purple-400" />
              </div>
              <h3 className="text-lg font-duotone-bold text-white mb-2">Try Before You Buy</h3>
              <p className="text-sm font-duotone-regular text-white/60">Test equipment from our rental fleet before committing. Rent, ride, decide — then buy with confidence.</p>
            </div>
          </div>
        </div>
      </div>

      {/* CTA Section */}
      <div className="py-16 bg-[#0d1511]">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-2xl font-duotone-bold mb-4 text-white">Need Help Choosing?</h2>
          <p className="text-gray-400 font-duotone-regular mb-8">Not sure which gear is right for you? Our team can recommend the perfect setup based on your level and riding style.</p>
          <div className="flex justify-center gap-4">
              <div className="flex justify-center">
                <Button
                  size="large"
                  className="font-duotone-bold !px-6 !py-3 !rounded-md transition-all duration-150 focus:outline-none"
                  style={{ background: '#4b4f54', color: '#00a8c4', border: '1px solid rgba(0,168,196,0.5)', boxShadow: '0 0 8px rgba(0,168,196,0.2)' }}
                  onClick={() => navigate('/contact')}
                >
                  Contact Us
                </Button>
              </div>
          </div>
        </div>
      </div>


      <style>{`
        .scrollbar-hide::-webkit-scrollbar,
        .no-scrollbar::-webkit-scrollbar {
          display: none;
        }
      `}</style>

      {/* Trust Section */}
      {/* Trust Section */}
      {/* Duotone Blue Banner (moved to bottom) */}
      {/* Centered White Logo at Bottom */}
      <div className="w-full flex justify-center items-center" style={{ margin: '64px 0 0 0' }}>
        <img
          src={new URL('@/../../DuotoneFonts/DPCLOGOWHITEONEMPTY.png', import.meta.url).href}
          alt="Duotone Pro Center Urla White Logo"
          style={{ width: '100%', maxWidth: '900px', height: 'auto', display: 'block', margin: '0 auto', padding: '32px 0' }}
        />
      </div>
    </div>
  );
};

export default ShopLandingPage;
