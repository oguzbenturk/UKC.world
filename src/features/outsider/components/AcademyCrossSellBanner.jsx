import { useNavigate } from 'react-router-dom';
import { Button } from 'antd';
import { RightOutlined } from '@ant-design/icons';
import stayCardImg from '../../../../DuotoneFonts/ukcstay/WhatsApp Image 2026-03-17 at 13.14.32 (1).jpeg';
import rentalBannerImg from '../../../../DuotoneFonts/pictures/shoprentalbanner.jpg';
import shopBannerImg from '../../../../DuotoneFonts/pictures/shop.jpg';

const CROSS_SELL_CARDS = [
  {
    key: 'shop',
    image: shopBannerImg,
    eyebrow: 'Duotone Pro Shop',
    title: 'Gear up for the season',
    body: 'Browse the latest Duotone kites, boards, harnesses and accessories. Pro center pricing, expert advice included.',
    cta: 'Visit Shop',
    to: '/shop',
  },
  {
    key: 'rental',
    image: rentalBannerImg,
    eyebrow: 'Equipment Rental',
    title: 'Ride premium gear daily',
    body: 'Standard to D/LAB — pick the level that matches your riding. All maintained, all latest models.',
    cta: 'Browse Rentals',
    to: '/rental',
  },
  {
    key: 'stay',
    image: stayCardImg,
    eyebrow: 'Accommodation',
    title: 'Stay right at the spot',
    body: 'Wake up meters from the water. Comfortable rooms and homes designed for kiters, with gear storage included.',
    cta: 'Find a Stay',
    to: '/stay',
  },
];

const btnStyle = {
  background: '#4b4f54',
  color: '#00a8c4',
  border: '1px solid rgba(0,168,196,0.5)',
  boxShadow: '0 0 12px rgba(0,168,196,0.2)',
};

/**
 * Cross-sell banner shown on Academy pages linking to Shop, Rental & Stay.
 * @param {object} props
 * @param {string} [props.excludeKey] - Optionally hide one card (e.g. 'rental' on a rental page)
 */
const AcademyCrossSellBanner = ({ excludeKey }) => {
  const navigate = useNavigate();
  const cards = excludeKey
    ? CROSS_SELL_CARDS.filter(c => c.key !== excludeKey)
    : CROSS_SELL_CARDS;

  return (
    <div className="py-16 sm:py-20 bg-slate-50 border-t border-slate-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#00a8c4] text-center mb-2">
          Complete Your Experience
        </p>
        <h2 className="text-2xl sm:text-3xl font-duotone-bold-extended text-slate-900 text-center mb-10">
          Everything you need in one place
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
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-black/10" />

              <div className="relative z-10 h-full flex flex-col justify-end p-6 sm:p-8">
                <span className="text-[10px] sm:text-xs font-semibold uppercase tracking-[0.15em] text-[#00a8c4] mb-2">
                  {card.eyebrow}
                </span>
                <h3 className="text-lg sm:text-xl font-duotone-bold-extended text-white mb-2 leading-tight">
                  {card.title}
                </h3>
                <p className="text-sm font-duotone-regular text-white/80 mb-5 max-w-md leading-relaxed">
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

export default AcademyCrossSellBanner;
