import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from 'antd';
import dpcLogo from '../../../../DuotoneFonts/DPSLOGOS/DPC-transparant-white.svg';
import {
  ThunderboltOutlined,
  SafetyCertificateOutlined,
  CustomerServiceOutlined,
  LeftOutlined,
  RightOutlined,
  ShoppingCartOutlined,
} from '@ant-design/icons';
import { usePageSEO } from '@/shared/utils/seo';
import { useShopFilters } from '@/shared/contexts/ShopFiltersContext';
import { productApi } from '@/shared/services/productApi';
import { resolveCategory } from '@/shared/constants/productCategories';

const hasProductImage = (p) => p.image_url || (Array.isArray(p.images) && p.images.length > 0);
import FuturisticScrollCue from '@/shared/components/ui/FuturisticScrollCue';
import { UkcBrandDot } from '@/shared/components/ui/UkcBrandDot';
import ProductCard from '@/features/dashboard/components/ProductCard';
import ContactOptionsBanner from '@/features/outsider/components/ContactOptionsBanner';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || '';
const resolveImageUrl = (url) => {
  if (!url) return null;
  if (url.startsWith('http')) return url;
  return `${BACKEND_URL}${url.startsWith('/') ? '' : '/'}${url}`;
};

const CATEGORIES = [
  { id: 'kitesurf',   label: 'KITEBOARDING',    image: '/Images/ukc/rebel-dlab-rent.png' },
  { id: 'wingfoil',   label: 'WING FOILING',     image: '/Images/ukc/wing-header.png' },
  { id: 'efoil',      label: 'FOILING',           image: '/Images/ukc/e-foil.png' },
  { id: 'ion',        label: 'ION ACCESSORIES',   image: '/assets/images/harness.png' },
  { id: 'secondwind', label: 'SECONDWIND',        image: '/assets/images/2ndwind.jpeg' },
];

const PROMO_BANNERS = [
  {
    id: 'kite-promo',
    image: '/Images/ukc/rebel-dlab-rent.png',
    eyebrow: 'New In',
    title: 'Latest Kiteboarding Gear',
    body: 'Duotone kites, boards, bars, and everything you need to ride.',
    cta: 'Shop Kiteboarding',
    to: '/shop/kitesurf',
    align: 'left',
  },
  {
    id: 'wing-promo',
    image: '/Images/ukc/wing-header.png',
    eyebrow: 'Trending Now',
    title: 'Wing Foiling Collection',
    body: 'Complete wing foil setups — wings, foils, and boards in one place.',
    cta: 'Shop Wing Foiling',
    to: '/shop/wingfoil',
    align: 'right',
  },
];

const ShopLandingPage = () => {
  const navigate = useNavigate();
  const { allProducts, setAllProducts } = useShopFilters();

  const [carouselIndex, setCarouselIndex] = useState(0);
  const [wishlist, setWishlist] = useState(new Set());
  const dealsRef = useRef(null);
  const carouselTimerRef = useRef(null);

  usePageSEO({
    title: 'Shop | UKC World',
    description: 'Browse our full range of kiteboarding, wing foiling, foiling gear, wetsuits, and accessories.',
  });

  // Always load fresh products on mount so discount/featured changes are reflected immediately
  useEffect(() => {
    let cancelled = false;
    productApi.getProductsByCategory(20)
      .then(response => {
        if (cancelled) return;
        if (response?.success && response?.categories) {
          const flat = Object.values(response.categories).flatMap(g => g.products || []);
          flat.forEach(p => {
            if (p.category) p.category = resolveCategory(p.category);
            if (p.subcategory) p.subcategory = p.subcategory.toLowerCase();
          });
          if (flat.length > 0) setAllProducts(flat);
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Products with images (or all if none have images), memoized once
  const productsWithImages = useMemo(() => {
    const pool = allProducts.filter(hasProductImage);
    return pool.length > 0 ? pool : allProducts;
  }, [allProducts]);

  // Carousel: featured first, then diverse round-robin across categories
  const carouselSlides = useMemo(() => {
    if (!productsWithImages.length) return [];
    const enriched = productsWithImages.map(p => ({
      ...p,
      discountPercent: p.original_price && p.original_price > p.price
        ? Math.round(((p.original_price - p.price) / p.original_price) * 100)
        : 0,
    }));
    const featured = enriched.filter(p => p.is_featured);
    const remaining = enriched.filter(p => !p.is_featured);
    const byCategory = {};
    for (const p of remaining) {
      const cat = p.category || 'other';
      if (!byCategory[cat]) byCategory[cat] = [];
      byCategory[cat].push(p);
    }
    const diverse = [];
    const cats = Object.keys(byCategory);
    let idx = 0;
    while (diverse.length < 12 && cats.some(c => byCategory[c].length > 0)) {
      const cat = cats[idx % cats.length];
      if (byCategory[cat].length > 0) diverse.push(byCategory[cat].shift());
      idx++;
    }
    return [...featured, ...diverse].slice(0, 8);
  }, [productsWithImages]);

  // Hot deals: discounted first, then best-priced from each category
  const hotDeals = useMemo(() => {
    const onSale = productsWithImages
      .filter(p => p.original_price && p.original_price > p.price)
      .map(p => ({
        ...p,
        discountPercent: Math.round(((p.original_price - p.price) / p.original_price) * 100),
      }))
      .sort((a, b) => b.discountPercent - a.discountPercent);
    const saleIds = new Set(onSale.map(p => p.id));
    const nonSale = productsWithImages.filter(p => !saleIds.has(p.id) && p.price > 0);
    const byCategory = {};
    for (const p of nonSale) {
      const cat = p.category || 'other';
      if (!byCategory[cat]) byCategory[cat] = [];
      byCategory[cat].push(p);
    }
    const filler = [];
    const cats = Object.keys(byCategory);
    let idx = 0;
    while (filler.length < 12 && cats.some(c => byCategory[c].length > 0)) {
      const cat = cats[idx % cats.length];
      if (byCategory[cat].length > 0) filler.push(byCategory[cat].shift());
      idx++;
    }
    return [...onSale, ...filler].slice(0, 14);
  }, [productsWithImages]);

  // Carousel auto-rotation — 3s interval, starts immediately
  useEffect(() => {
    if (carouselSlides.length < 2) return;
    carouselTimerRef.current = setInterval(() => {
      setCarouselIndex(i => (i + 1) % carouselSlides.length);
    }, 3000);
    return () => clearInterval(carouselTimerRef.current);
  }, [carouselSlides.length]);

  const goToSlide = useCallback((idx) => {
    clearInterval(carouselTimerRef.current);
    setCarouselIndex(idx);
  }, []);

  const prevSlide = useCallback(() => {
    goToSlide((carouselIndex - 1 + carouselSlides.length) % carouselSlides.length);
  }, [carouselIndex, carouselSlides.length, goToSlide]);

  const nextSlide = useCallback(() => {
    goToSlide((carouselIndex + 1) % carouselSlides.length);
  }, [carouselIndex, carouselSlides.length, goToSlide]);

  const scrollDeals = (dir) => {
    if (!dealsRef.current) return;
    dealsRef.current.scrollBy({ left: dir * 280, behavior: 'smooth' });
  };

  const scrollToFirstHero = () => {
    document.getElementById('shop-hero-start')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="bg-[#0d1511] min-h-screen text-white font-sans pb-20 selection:bg-emerald-400/30">

      {/* ── White brand banner ── */}
      <div className="relative z-10 flex min-h-[50dvh] flex-col bg-white">
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-4 pt-16 pb-12 sm:px-6 sm:pt-20 sm:pb-16 lg:px-8">
          <div className="flex flex-col items-center gap-8 sm:gap-12 relative z-[1]">
            <div className="flex items-baseline">
              <span
                className="font-gotham-bold antialiased text-[#1a1a1a]"
                style={{ fontSize: 'clamp(3rem, 8vw, 6rem)', letterSpacing: '0.1em', textRendering: 'geometricPrecision' }}
              >
                UKC
              </span>
              <UkcBrandDot style={{ width: '0.13em', height: '0.13em', top: '-0.04em', fontSize: 'clamp(3rem, 8vw, 6rem)', marginLeft: '0.04em', marginRight: '0.18em' }} />
              <span
                className="font-gotham-bold antialiased"
                style={{ letterSpacing: '0.02em', fontSize: 'clamp(2.5rem, 6.5vw, 5rem)', color: '#ec4899', textRendering: 'geometricPrecision' }}
              >
                Shop
              </span>
            </div>
            <p className="flex flex-wrap items-baseline justify-center gap-x-2 text-center font-gotham-bold tracking-normal leading-tight text-[#4b4f54] text-lg sm:text-xl md:text-2xl mt-3 sm:mt-5">
              <span>Powered By</span>
              <span className="inline-flex items-baseline whitespace-nowrap font-gotham-bold text-[#4b4f54]">
                <span style={{ letterSpacing: '0.1em' }}>UKC</span>
                <UkcBrandDot className="ml-[0.03em]" style={{ top: '-0.02em' }} />
              </span>
            </p>
          </div>
        </div>
        <div className="flex w-full justify-center px-4 pb-4 pt-4 sm:px-6 sm:pb-8 sm:pt-6 lg:px-8">
          <FuturisticScrollCue
            ariaLabel="Scroll to shop products"
            onActivate={scrollToFirstHero}
            className="focus-visible:ring-offset-2 focus-visible:ring-offset-white"
          />
        </div>
      </div>

      <div id="shop-hero-start" />

      {/* ── Hero Carousel ── */}
      {carouselSlides.length > 0 ? (
        <div className="relative w-full overflow-hidden" style={{ minHeight: '420px', maxHeight: '580px', height: '55vw' }}>
          {/* Bottom fade: blend carousel into dark page bg */}
          <div
            className="absolute inset-x-0 bottom-0 z-[1] pointer-events-none h-24 sm:h-32"
            style={{ background: 'linear-gradient(to bottom, transparent 0%, #0d1511 100%)' }}
            aria-hidden
          />
          {/* White dissolve from banner seam into photo */}
          <div
            className="pointer-events-none absolute inset-x-0 top-0 z-[5] h-32 sm:h-40 md:h-48"
            style={{
              background: 'linear-gradient(to bottom, #ffffff 0%, rgba(255,255,255,0.92) 10%, rgba(255,255,255,0.55) 32%, rgba(255,255,255,0.2) 58%, rgba(255,255,255,0.06) 78%, rgba(255,255,255,0) 100%)',
            }}
            aria-hidden
          />
          {/* Slides */}
          <div
            className="flex h-full transition-transform duration-500 ease-in-out"
            style={{ transform: `translateX(-${carouselIndex * 100}%)` }}
          >
            {carouselSlides.map((product) => {
              const rawImg = product.image_url || (Array.isArray(product.images) ? product.images[0] : null);
              const imgSrc = resolveImageUrl(rawImg);
              return (
                <div
                  key={product.id}
                  className="relative min-w-full h-full flex-shrink-0 cursor-pointer group"
                  onClick={() => navigate(`/shop/${product.category}`)}
                >
                  {/* Dark bg behind product image */}
                  <div className="absolute inset-0 bg-[#0d1511]" />
                  {/* Product image — contain so it's never cropped */}
                  {imgSrc ? (
                    <img
                      src={imgSrc}
                      alt={product.name}
                      className="absolute inset-0 w-full h-full object-contain object-center transition-transform duration-700 group-hover:scale-[1.02]"
                    />
                  ) : (
                    <div className="absolute inset-0 bg-gradient-to-br from-emerald-900/40 to-[#0d1511]" />
                  )}
                  {/* Scrim: left-side on desktop, bottom on mobile for text readability */}
                  <div className="absolute inset-0 bg-gradient-to-r from-black/50 via-transparent to-transparent hidden sm:block" style={{ maxWidth: '50%' }} />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent sm:hidden" />
                  {/* Content — bottom-centered on mobile, center-left on sm+ */}
                  <div className="absolute inset-0 flex items-end sm:items-center justify-center sm:justify-start px-4 sm:px-12 lg:px-16 pb-10 sm:pb-0">
                    <div className="w-full sm:w-auto sm:max-w-lg rounded-xl px-4 py-3 sm:px-6 sm:py-5 text-center sm:text-left" style={{ background: 'rgba(13,21,17,0.72)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)' }}>
                      <div className="flex items-center justify-center sm:justify-start gap-2 mb-1 sm:mb-2">
                        {product.brand && (
                          <span className="text-xs font-duotone-regular uppercase tracking-widest text-[#00a8c4]">
                            {product.brand}
                          </span>
                        )}
                        {product.discountPercent > 0 && (
                          <span className="inline-block bg-red-500 text-white text-xs font-duotone-bold px-2 py-0.5 rounded-sm">
                            -{product.discountPercent}%
                          </span>
                        )}
                      </div>
                      <h2 className="text-lg sm:text-3xl md:text-4xl font-duotone-bold-extended text-white leading-tight mb-2 sm:mb-3 drop-shadow-xl">
                        {product.name}
                      </h2>
                      {product.price && (
                        <div className="flex items-baseline justify-center sm:justify-start gap-3 mb-3 sm:mb-5">
                          <span className={`text-base sm:text-xl font-duotone-bold ${product.discountPercent > 0 ? 'text-red-400' : 'text-white'}`}>
                            €{Number(product.price).toFixed(0)},-
                          </span>
                          {product.original_price && product.original_price > product.price && (
                            <span className="text-xs sm:text-sm text-white/50 line-through">€{Number(product.original_price).toFixed(0)},-</span>
                          )}
                        </div>
                      )}
                      <div className="flex justify-center sm:justify-start">
                        <Button
                          size="middle"
                          icon={<ShoppingCartOutlined />}
                          className="font-duotone-bold !rounded-md !text-sm"
                          style={{ background: '#4b4f54', color: '#00a8c4', border: '1px solid rgba(0,168,196,0.5)', boxShadow: '0 0 8px rgba(0,168,196,0.2)' }}
                          onClick={(e) => { e.stopPropagation(); navigate(`/shop/${product.category}`); }}
                        >
                          Shop Now
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Arrows */}
          {carouselSlides.length > 1 && (
            <>
              <button
                type="button"
                aria-label="Previous slide"
                className="absolute left-3 top-1/2 -translate-y-1/2 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-black/40 text-white hover:bg-black/70 transition-all"
                onClick={prevSlide}
              >
                <LeftOutlined />
              </button>
              <button
                type="button"
                aria-label="Next slide"
                className="absolute right-3 top-1/2 -translate-y-1/2 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-black/40 text-white hover:bg-black/70 transition-all"
                onClick={nextSlide}
              >
                <RightOutlined />
              </button>
              {/* Dot indicators */}
              <div className="absolute bottom-4 left-0 right-0 flex justify-center gap-2 z-10">
                {carouselSlides.map((_, i) => (
                  <button
                    key={i}
                    type="button"
                    aria-label={`Slide ${i + 1}`}
                    onClick={() => goToSlide(i)}
                    className={`rounded-full transition-all duration-300 ${i === carouselIndex ? 'w-6 h-2 bg-[#00a8c4]' : 'w-2 h-2 bg-white/40 hover:bg-white/70'}`}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      ) : (
        /* Fallback when no products loaded yet */
        <div className="relative w-full flex items-center justify-center bg-gradient-to-br from-emerald-900/30 to-[#0d1511]" style={{ minHeight: '320px' }}>
          <div
            className="pointer-events-none absolute inset-x-0 top-0 z-[5] h-32 sm:h-40 md:h-48"
            style={{
              background: 'linear-gradient(to bottom, #ffffff 0%, rgba(255,255,255,0.92) 10%, rgba(255,255,255,0.55) 32%, rgba(255,255,255,0.2) 58%, rgba(255,255,255,0.06) 78%, rgba(255,255,255,0) 100%)',
            }}
            aria-hidden
          />
          <div className="text-center px-4">
            <p className="text-white/40 font-duotone-regular text-sm">Loading featured products…</p>
          </div>
        </div>
      )}

      {/* ── Hot Deals ── */}
      {hotDeals.length > 0 && (
        <div className="py-12 sm:py-14 bg-[#0d1511]">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-end justify-between mb-8">
              <div>
                <span className="text-xs font-duotone-regular uppercase tracking-widest text-[#00a8c4] mb-1 block">Limited Offers</span>
                <h2 className="text-xl sm:text-2xl font-duotone-bold-extended text-white">
                  On Sale Now
                </h2>
              </div>
              <button
                type="button"
                className="text-[#00a8c4] text-sm font-duotone-regular hover:underline underline-offset-4"
                onClick={() => navigate('/shop/browse')}
              >
                View all
              </button>
            </div>
            <div className="relative group/deals">
              {/* Left arrow */}
              <button
                type="button"
                aria-label="Scroll left"
                className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-3 z-10 hidden sm:flex h-10 w-10 items-center justify-center rounded-full bg-white/10 backdrop-blur-sm border border-white/10 text-white/80 hover:bg-white/20 hover:text-white transition-all opacity-0 group-hover/deals:opacity-100"
                onClick={() => scrollDeals(-1)}
              >
                <LeftOutlined className="text-xs" />
              </button>
              {/* Scrollable row */}
              <div
                ref={dealsRef}
                className="flex gap-4 overflow-x-auto pb-3 no-scrollbar"
                style={{ scrollbarWidth: 'none' }}
              >
                {hotDeals.map(product => (
                  <div key={product.id} className="flex-shrink-0 w-48 sm:w-56">
                    <ProductCard
                      product={product}
                      onPreview={() => navigate(`/shop/${product.category}`)}
                      onWishlistToggle={(p) => setWishlist(prev => {
                        const next = new Set(prev);
                        next.has(p.id) ? next.delete(p.id) : next.add(p.id);
                        return next;
                      })}
                      isWishlisted={wishlist.has(product.id)}
                    />
                  </div>
                ))}
              </div>
              {/* Right arrow */}
              <button
                type="button"
                aria-label="Scroll right"
                className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-3 z-10 hidden sm:flex h-10 w-10 items-center justify-center rounded-full bg-white/10 backdrop-blur-sm border border-white/10 text-white/80 hover:bg-white/20 hover:text-white transition-all opacity-0 group-hover/deals:opacity-100"
                onClick={() => scrollDeals(1)}
              >
                <RightOutlined className="text-xs" />
              </button>
              {/* Fade edges to hint scrollability */}
              <div className="pointer-events-none absolute inset-y-0 left-0 w-8 bg-gradient-to-r from-[#0d1511] to-transparent z-[1]" />
              <div className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-[#0d1511] to-transparent z-[1]" />
            </div>
          </div>
        </div>
      )}

      {/* ── Promo Banners ── */}
      <div className="w-full">
        {PROMO_BANNERS.map((banner) => (
          <div
            key={banner.id}
            className="relative w-full overflow-hidden cursor-pointer group"
            style={{ minHeight: '340px', maxHeight: '460px', height: '38vw' }}
            onClick={() => navigate(banner.to)}
          >
            <img
              src={banner.image}
              alt={banner.title}
              className="absolute inset-0 w-full h-full object-cover object-center transition-transform duration-700 group-hover:scale-[1.03]"
              loading="lazy"
            />
            <div className={`absolute inset-0 ${banner.align === 'right' ? 'bg-gradient-to-l' : 'bg-gradient-to-r'} from-black/75 via-black/40 to-transparent`} />
            <div className={`absolute inset-0 flex items-center ${banner.align === 'right' ? 'justify-end px-8 sm:px-12 lg:px-20' : 'px-8 sm:px-12 lg:px-16'}`}>
              <div className="max-w-md">
                <span className="text-xs font-duotone-regular uppercase tracking-widest text-[#00a8c4] mb-2 block">
                  {banner.eyebrow}
                </span>
                <h3 className="text-2xl sm:text-3xl font-duotone-bold-extended text-white leading-tight mb-2 drop-shadow-xl">
                  {banner.title}
                </h3>
                <p className="text-sm sm:text-base font-duotone-regular text-white/80 mb-5 leading-relaxed">
                  {banner.body}
                </p>
                <Button
                  size="large"
                  className="font-duotone-bold !rounded-md"
                  style={{ background: '#4b4f54', color: '#00a8c4', border: '1px solid rgba(0,168,196,0.5)', boxShadow: '0 0 8px rgba(0,168,196,0.2)' }}
                  onClick={(e) => { e.stopPropagation(); navigate(banner.to); }}
                >
                  {banner.cta}
                </Button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* ── Shop by Category ── */}
      <div className="py-14 sm:py-16 bg-[#0d1511]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-10">
            <span className="text-xs font-duotone-regular uppercase tracking-widest text-[#00a8c4] mb-1 block">Browse</span>
            <h2 className="text-xl sm:text-2xl font-duotone-bold-extended text-white">
              Shop by Category
            </h2>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
            {CATEGORIES.map((cat) => (
              <div
                key={cat.id}
                className="relative overflow-hidden rounded-lg cursor-pointer group"
                style={{ paddingTop: '125%' }}
                onClick={() => navigate(`/shop/${cat.id}`)}
              >
                <img
                  src={cat.image}
                  alt={cat.label}
                  className="absolute inset-0 w-full h-full object-cover object-center transition-transform duration-500 group-hover:scale-110"
                  loading="lazy"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                <div className="absolute bottom-0 left-0 right-0 p-3 sm:p-4">
                  <p className="text-xs sm:text-sm font-duotone-bold-extended uppercase tracking-wider text-white text-center">
                    {cat.label}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── About UKC.Shop ── */}
      <div className="py-16 bg-[#111d17]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-10 items-center">
            <div>
              <span className="text-xs font-duotone-regular uppercase tracking-widest text-[#00a8c4] mb-3 block">
                Duotone Pro Center Urla
              </span>
              <h2 className="text-2xl sm:text-3xl font-duotone-bold-extended text-white mb-4 leading-tight">
                About Us
              </h2>
              <p className="font-duotone-regular text-white/70 mb-4 leading-relaxed">
                As an official Duotone Pro Center, we stock the full range of Duotone kites, wings, foils, and boards — plus ION wetsuits, harnesses, and protection gear. Every product we sell is genuine, warrantied, and backed by our team's real-world experience.
              </p>
              <p className="font-duotone-regular text-white/70 mb-6 leading-relaxed">
                Our instructors ride the gear they sell. Whether you're a beginner looking for your first setup or an expert upgrading, we'll help you make the right call.
              </p>
              <Button
                size="large"
                className="font-duotone-bold !rounded-md"
                style={{ background: '#4b4f54', color: '#00a8c4', border: '1px solid rgba(0,168,196,0.5)', boxShadow: '0 0 8px rgba(0,168,196,0.2)' }}
                onClick={() => navigate('/shop/browse')}
              >
                Browse All Products
              </Button>
            </div>
            <div className="relative rounded-xl overflow-hidden" style={{ minHeight: '280px' }}>
              <img
                src="/Images/ukc/rebel-dlab-rent.png"
                alt="UKC Shop — Duotone Pro Center Urla"
                className="w-full h-full object-cover object-center"
                style={{ minHeight: '280px' }}
                loading="lazy"
              />
              <div className="absolute inset-0 rounded-xl ring-1 ring-inset ring-white/10" />
            </div>
          </div>
        </div>
      </div>

      {/* ── Why Shop With Us ── */}
      <div className="py-20 bg-[#0d1511]">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl sm:text-3xl font-duotone-bold-extended text-center text-white mb-12">
            Why Shop With Us?
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
            <div className="text-center">
              <h3 className="text-lg font-duotone-bold text-white mb-2">Authorized Dealer</h3>
              <p className="text-sm font-duotone-regular text-white/60">Official Duotone, ION & Fliteboard dealer. Genuine products with full manufacturer warranty.</p>
            </div>
            <div className="text-center">
              <h3 className="text-lg font-duotone-bold text-white mb-2">Expert Advice</h3>
              <p className="text-sm font-duotone-regular text-white/60">Our instructors ride the gear they sell. Get real, hands-on advice from people who know.</p>
            </div>
            <div className="text-center">
              <h3 className="text-lg font-duotone-bold text-white mb-2">Try Before You Buy</h3>
              <p className="text-sm font-duotone-regular text-white/60">Test equipment from our rental fleet before committing. Rent, ride, decide — then buy with confidence.</p>
            </div>
          </div>
        </div>
      </div>

      {/* ── CTA ── */}
      <div className="py-16 bg-[#0d1511]">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-2xl font-duotone-bold-extended mb-4 text-white">Need Help Choosing?</h2>
          <p className="text-gray-400 font-duotone-regular mb-8">Not sure which gear is right for you? Our team can recommend the perfect setup based on your level and riding style.</p>
          <Button
            size="large"
            className="font-duotone-bold !px-6 !py-3 !rounded-md transition-all duration-150 focus:outline-none"
            style={{ background: '#4b4f54', color: '#00a8c4', border: '1px solid rgba(0,168,196,0.5)', boxShadow: '0 0 8px rgba(0,168,196,0.2)' }}
            onClick={() => navigate('/contact')}
          >
            Contact Us
          </Button>
          <ContactOptionsBanner />
        </div>
      </div>

      {/* ── DPC Logo ── */}
      <div className="w-full flex justify-center items-center" style={{ margin: '64px 0 0 0' }}>
        <img
          src={dpcLogo}
          alt="Duotone Pro Center Urla"
          style={{ width: '100%', maxWidth: '900px', height: 'auto', display: 'block', margin: '0 auto', padding: '32px 0' }}
        />
      </div>

      <style>{`
        .no-scrollbar::-webkit-scrollbar { display: none; }
      `}</style>
    </div>
  );
};

export default ShopLandingPage;
