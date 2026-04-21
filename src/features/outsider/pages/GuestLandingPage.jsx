/**
 * GuestLandingPage - Duotone Pro Center Urla branded welcome page
 */

import { useNavigate } from 'react-router-dom';
import { useTranslation, Trans } from 'react-i18next';
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
import dpcLogo from '../../../../DuotoneFonts/DPSLOGOS/DPS-transparenton-black.svg';
import { usePageSEO } from '@/shared/utils/seo';
import GoogleReviewsStrip from '@/shared/components/ui/GoogleReviewsStrip';
import { featureFlags } from '@/shared/config/featureFlags';

const SERVICE_CONFIG = [
  ...(featureFlags.publicShopEnabled ? [{
    key: 'shop', icon: ShoppingBagIcon, accent: '#ec4899', path: '/shop',
    image: '/Images/guest/dice-sls-header.jpg',
  }] : []),
  { key: 'academy', icon: AcademicCapIcon, accent: '#4ade80', path: '/academy', image: '/Images/guest/epump-header.jpg' },
  { key: 'rentals', icon: CubeIcon, accent: '#fb923c', path: '/rental', image: '/Images/guest/dpc-pingtan-kitefoil-rental.jpg' },
  { key: 'membership', icon: UsersIcon, accent: '#93c47d', path: '/members/offerings', image: '/Images/guest/wing-foil.jpg' },
  { key: 'care', icon: WrenchScrewdriverIcon, accent: '#14b8a6', path: '/care', image: '/Images/guest/Efoilassist.jpg' },
  { key: 'stay', icon: HomeIcon, accent: '#3b82f6', path: '/stay', image: 'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=600&h=400&fit=crop' },
  { key: 'experience', icon: CalendarDaysIcon, accent: '#eab308', path: '/experience', image: '/Images/ukc/kite-header.jpg.png' },
  { key: 'community', icon: ChatBubbleLeftRightIcon, accent: '#0ea5e9', path: '/services/events', image: '/Images/ukc/team.png' },
];

const ServiceCard = ({ service, onNavigate }) => {
  const { t } = useTranslation(['outsider']);
  const Icon = service.icon;
  const title = t(`outsider:landing.services.${service.key}.title`);
  const tagline = t(`outsider:landing.services.${service.key}.tagline`);
  const subItems = t(`outsider:landing.services.${service.key}.subItems`, { returnObjects: true });
  return (
      <div
        onClick={() => onNavigate(service.path)}
        className="group relative cursor-pointer flex flex-col overflow-hidden rounded-2xl transition-all duration-300 hover:-translate-y-2 hover:shadow-2xl"
        style={{
          border: '1px solid rgba(75,79,84,0.12)',
          boxShadow: '0 4px 20px rgba(75,79,84,0.10)',
          background: '#fff',
        }}
      >
        <div className="relative h-40 overflow-hidden" style={{ background: service.accent }}>
          <img
            src={service.image}
            alt={title}
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
          />
          <div
            className="absolute inset-0"
            style={{
              background: `linear-gradient(to bottom, ${service.accent}22 0%, ${service.accent}cc 100%)`,
            }}
          />
          <div
            className="absolute top-3 left-3 w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ background: 'rgba(255,255,255,0.2)', backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.3)' }}
          >
            <Icon className="w-5 h-5 text-white" style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.3))' }} />
          </div>
          <div className="absolute bottom-3 left-4">
            <h3
              className="leading-none mb-0.5"
              style={{ fontFamily: '"Gotham Medium", sans-serif', fontWeight: 600, fontSize: '1.3rem', color: 'white', textShadow: '0 2px 8px rgba(0,0,0,0.5)' }}
            >
              <span style={{ opacity: 0.8, position: 'relative', top: '0.15em' }}>•</span>{title}
            </h3>
            <p
              className="tracking-widest uppercase"
              style={{ fontFamily: '"Gotham Medium", sans-serif', fontWeight: 500, fontSize: '9px', color: 'rgba(255,255,255,0.95)', textShadow: '0 1px 4px rgba(0,0,0,0.5)' }}
            >
              {tagline}
            </p>
          </div>
        </div>

        <div className="p-4 flex flex-col flex-1">
          <ul className="space-y-1.5 flex-1 mb-3">
            {(Array.isArray(subItems) ? subItems : []).map((item, i) => (
              <li key={i} className="flex items-center gap-2 text-sm" style={{ fontFamily: '"Duotone Regular", sans-serif', color: '#4b4f54', letterSpacing: '0.01em' }}>
                <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: service.accent }} />
                {item}
              </li>
            ))}
          </ul>

          <div
            className="flex items-center gap-1.5 text-xs tracking-[0.15em] uppercase border-t pt-3"
            style={{ fontFamily: '"Gotham Medium", sans-serif', borderColor: 'rgba(75,79,84,0.12)', color: service.accent }}
          >
            <span className="group-hover:underline">{t('outsider:landing.discover')}</span>
            <ArrowRightIcon className="w-3.5 h-3.5 transition-transform group-hover:translate-x-1" />
          </div>
        </div>
      </div>
    );
};

const GuestLandingPage = () => {
  const { t } = useTranslation(['outsider']);
  usePageSEO({
    title: 'Welcome | UKC. Duotone Pro Center Urla',
    description: 'Explore lessons, rentals, gear shop, experiences, accommodation, and more at UKC. Duotone Pro Center in Urla, Turkey.',
    path: '/guest',
  });
  const navigate = useNavigate();

  return (
    <div className="min-h-screen" style={{
      background: 'linear-gradient(160deg, #f4f6f8 0%, #eaecef 50%, #e4e7eb 100%)',
      backgroundImage: 'linear-gradient(160deg, #f4f6f8 0%, #eaecef 50%, #e4e7eb 100%), radial-gradient(circle, rgba(75,79,84,0.06) 1px, transparent 1px)',
      backgroundSize: 'auto, 28px 28px',
    }}>

      <div className="max-w-6xl mx-auto px-6 pt-10 pb-6">
        <div className="flex justify-center mb-8">
          <img src={dpcLogo} alt="Duotone Pro Center Logo" className="mx-auto w-full sm:w-[85%] md:w-[500px]" style={{ filter: 'invert(1) drop-shadow(0 2px 8px rgba(75,79,84,0.18))', display: 'block', height: 'auto' }} />
        </div>
        <div className="flex items-center gap-5 mb-4">
          <div className="flex-1 h-px" style={{ background: 'linear-gradient(to right, transparent, rgba(75,79,84,0.2))' }} />
          <span
            style={{ fontFamily: '"Gotham Medium", sans-serif', fontWeight: 600, fontSize: '0.7rem', letterSpacing: '0.22em', color: '#9ca3af', textTransform: 'uppercase' }}
          >
            {t('outsider:landing.sectionLabel')}
          </span>
          <div className="flex-1 h-px" style={{ background: 'linear-gradient(to left, transparent, rgba(75,79,84,0.2))' }} />
        </div>
        <p className="text-center mt-3 mb-1" style={{ fontFamily: '"Duotone Regular", sans-serif', fontWeight: 400, fontSize: '0.95rem', lineHeight: '1.7', color: '#6b7280', letterSpacing: '0.02em' }}>
          <Trans
            i18nKey="outsider:landing.description"
            components={{
              urla: <span style={{ fontFamily: '"Gotham Medium", sans-serif', fontWeight: 600, color: '#4b4f54' }} />,
              duotone: <span style={{ fontFamily: '"Gotham Medium", sans-serif', fontWeight: 600, color: '#00a8c4' }} />,
            }}
          />
        </p>
      </div>

      <div className="max-w-6xl mx-auto px-6 pb-10">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {SERVICE_CONFIG.map((service) => (
            <ServiceCard key={service.key} service={service} onNavigate={navigate} />
          ))}
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 pb-14">
        <div className="flex items-center gap-5 mb-6 mt-2">
          <div className="flex-1 h-px" style={{ background: 'linear-gradient(to right, transparent, rgba(75,79,84,0.2))' }} />
          <span style={{ fontFamily: '"Gotham Medium", sans-serif', fontSize: '0.65rem', letterSpacing: '0.22em', color: '#b0b8be', textTransform: 'uppercase' }}>{t('outsider:landing.established')}</span>
          <div className="flex-1 h-px" style={{ background: 'linear-gradient(to left, transparent, rgba(75,79,84,0.2))' }} />
        </div>
        <div
          className="flex flex-col sm:flex-row items-center justify-between gap-6 py-5 px-8"
          style={{ background: 'transparent' }}
        >
          <div>
            <h3
              style={{ fontFamily: '"Gotham Medium", sans-serif', fontWeight: 600, fontSize: '1.15rem', letterSpacing: '0.03em', color: '#4b4f54' }}
            >
              {t('outsider:landing.ctaTitle')}
            </h3>
            <p
              style={{ fontFamily: '"Gotham Medium", sans-serif', fontWeight: 400, fontSize: '0.82rem', letterSpacing: '0.04em', color: '#9ca3af', marginTop: '4px' }}
            >
              {t('outsider:landing.ctaSubtitle')}
            </p>
          </div>
          <div className="flex gap-3 flex-shrink-0">
            <button
              onClick={() => navigate('/academy')}
              className="text-xs tracking-[0.2em] py-3 px-8 rounded-lg transition-all duration-200 hover:scale-[1.03]"
              style={{ fontFamily: '"Gotham Medium", sans-serif', background: '#4b4f54', color: '#00a8c4', border: '1px solid rgba(0,168,196,0.45)', boxShadow: '0 0 14px rgba(0,168,196,0.15)' }}
            >
              {t('outsider:landing.bookLesson')}
            </button>
            {featureFlags.publicShopEnabled && (
              <button
                onClick={() => navigate('/shop')}
                className="text-xs tracking-[0.2em] py-3 px-8 rounded-lg transition-all duration-200 hover:scale-[1.03]"
                style={{ fontFamily: '"Gotham Medium", sans-serif', background: 'transparent', color: '#4b4f54', border: '1.5px solid #4b4f54' }}
              >
                {t('outsider:landing.browseShop')}
              </button>
            )}
          </div>
        </div>
      </div>

      <GoogleReviewsStrip />

    </div>
  );
};

export default GuestLandingPage;
