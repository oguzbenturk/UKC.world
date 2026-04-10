import { useNavigate } from 'react-router-dom';
import { Button } from 'antd';
import { RightOutlined } from '@ant-design/icons';
import standardBg from '../../../../DuotoneFonts/DPSLOGOS/Website-DSC07450.jpg';
import slsBg from '../../../../DuotoneFonts/pictures/Website-Dtk-Duotone-Lazepump-RebelSLS-MatchuLopes-Venezuela-2026-TobyBromwich-0955.jpg';
import dlabBg from '../../../../DuotoneFonts/pictures/Website-DTK-RebelD-Lab-Rigging-ColleenCarroll-HoodRiver-2026-TobyBromwich-3391.jpg';
import efoilBg from '../../../../DuotoneFonts/pictures/Website-MelissaTrullier_MidfishAir_FoilAssistCruiseAL_Duotone_DTE_Tahiti_by_Ben_Thouard_54333.jpg';

const ALL_RENTAL_CARDS = [
  {
    key: 'standard',
    image: standardBg,
    eyebrow: 'Duotone Standard',
    title: 'Solid gear for every session',
    body: 'Reliable, progression-friendly equipment. Perfect for daily sessions without breaking the bank.',
    cta: 'Explore Standard',
    to: '/rental/standard',
  },
  {
    key: 'sls',
    image: slsBg,
    eyebrow: 'Strong Light Superior',
    title: 'Want something that feels better?',
    body: 'Lighter, stronger, more responsive. Our SLS range takes your session to the next level with premium carbon construction.',
    cta: 'Explore SLS',
    to: '/rental/sls',
  },
  {
    key: 'dlab',
    image: dlabBg,
    eyebrow: 'Duotone Laboratory',
    title: 'Try something exclusive',
    body: 'The pinnacle of kiteboarding technology. D/LAB is the lightest, most responsive equipment Duotone has ever made.',
    cta: 'Explore D/LAB',
    to: '/rental/dlab',
  },
  {
    key: 'efoil',
    image: efoilBg,
    eyebrow: 'Electric Hydrofoil',
    title: 'Fly above the water',
    body: 'No wind needed. Glide silently above the surface with our premium E-Foil rental — the most unique watersport experience.',
    cta: 'Explore E-Foil',
    to: '/rental/efoil',
  },
];

const btnStyle = {
  background: '#4b4f54',
  color: '#00a8c4',
  border: '1px solid rgba(0,168,196,0.5)',
  boxShadow: '0 0 12px rgba(0,168,196,0.2)',
};

/**
 * Renders an upsell section promoting other rental tiers.
 * @param {object} props
 * @param {string} props.currentKey - The key of the current page to exclude (e.g. 'standard', 'sls', 'dlab', 'efoil')
 */
const RentalUpsellBanner = ({ currentKey }) => {
  const navigate = useNavigate();
  const cards = ALL_RENTAL_CARDS.filter(c => c.key !== currentKey);

  return (
    <div className="py-16 sm:py-20 bg-slate-50 border-t border-slate-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#00a8c4] text-center mb-2">
          Explore Other Rentals
        </p>
        <h2 className="text-2xl sm:text-3xl font-duotone-bold-extended text-slate-900 text-center mb-10">
          Looking for something different?
        </h2>

        <div className={`grid grid-cols-1 ${cards.length === 2 ? 'md:grid-cols-2' : 'md:grid-cols-3'} gap-6`}>
          {cards.map(card => (
            <div
              key={card.key}
              className="relative rounded-2xl overflow-hidden min-h-[300px] sm:min-h-[340px] group cursor-pointer"
              onClick={() => navigate(card.to)}
            >
              <div
                className="absolute inset-0 bg-cover bg-center transition-transform duration-700 group-hover:scale-105"
                style={{ backgroundImage: `url('${card.image}')` }}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/60 to-black/30" />

              <div className="relative z-10 h-full flex flex-col justify-end p-6 sm:p-8">
                <span className="text-[10px] sm:text-xs font-semibold uppercase tracking-[0.15em] text-[#00d4f5] mb-2" style={{ textShadow: '0 0 10px rgba(0,212,245,0.7)' }}>
                  {card.eyebrow}
                </span>
                <h3 className="text-lg sm:text-xl font-duotone-bold-extended text-white mb-2 leading-tight" style={{ textShadow: '0 2px 8px rgba(0,0,0,0.9)' }}>
                  {card.title}
                </h3>
                <p className="text-sm font-duotone-regular text-white mb-5 max-w-md leading-relaxed" style={{ textShadow: '0 1px 4px rgba(0,0,0,0.8)' }}>
                  {card.body}
                </p>
                <div>
                  <Button
                    size="large"
                    className="font-duotone-bold !h-12 !px-8 !text-base !rounded-md shadow-lg transition-all duration-150 hover:scale-[1.02] active:scale-95"
                    style={btnStyle}
                    onClick={(e) => { e.stopPropagation(); navigate(card.to); }}
                  >
                    {card.cta} <RightOutlined className="text-xs ml-1" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default RentalUpsellBanner;
