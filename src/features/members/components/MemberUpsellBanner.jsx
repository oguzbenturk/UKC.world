import { useNavigate } from 'react-router-dom';
import { Button } from 'antd';
import { RightOutlined } from '@ant-design/icons';
import imgAcademy from '../../../../DuotoneFonts/pictures/Website-CAU_9020.jpg';
import imgRental from '../../../../DuotoneFonts/pictures/Website-CAU_9031.jpg';
import imgShop from '../../../../DuotoneFonts/pictures/Website-CAU_9001.jpg';

const UPSELL_CARDS = [
  {
    key: 'lessons',
    gradient: 'linear-gradient(160deg, rgba(6,182,212,0.45) 0%, rgba(8,13,20,0.85) 100%)',
    image: imgAcademy,
    eyebrow: 'Kite · Wing · E-Foil · Foil',
    title: 'Learn to ride at the best spot',
    body: 'From your very first session to freestyle tricks — our certified instructors take you there at your own pace.',
    cta: 'View Lessons',
    to: '/academy',
  },
  {
    key: 'rental',
    gradient: 'linear-gradient(160deg, rgba(139,92,246,0.45) 0%, rgba(8,13,20,0.85) 100%)',
    image: imgRental,
    eyebrow: 'Duotone Equipment',
    title: 'Rent premium gear for your session',
    body: 'Standard, SLS, D/LAB or E-Foil — top-shelf Duotone equipment ready and waiting for your next ride.',
    cta: 'Browse Rentals',
    to: '/rental',
  },
  {
    key: 'shop',
    gradient: 'linear-gradient(160deg, rgba(245,158,11,0.45) 0%, rgba(8,13,20,0.85) 100%)',
    image: imgShop,
    eyebrow: 'Equipment Shop',
    title: 'Gear up right at the beach',
    body: 'Kites, boards, harnesses, accessories and apparel — everything you need, available on-site.',
    cta: 'Visit the Shop',
    to: '/shop',
  },
];

const btnStyle = {
  background: '#4b4f54',
  color: '#1E3A8A',
  border: '1px solid rgba(30,58,138,0.5)',
  boxShadow: '0 0 12px rgba(30,58,138,0.2)',
};

const MemberUpsellBanner = () => {
  const navigate = useNavigate();

  return (
    <div className="py-16 sm:py-20 bg-slate-50 border-t border-slate-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#1E3A8A] text-center mb-2">
          More at the Spot
        </p>
        <h2 className="text-2xl sm:text-3xl font-duotone-bold-extended text-center mb-10" style={{ color: '#00d4f4' }}>
          Everything you need, in one place
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {UPSELL_CARDS.map(({ key, gradient, image, eyebrow, title, body, cta, to }) => (
            <div
              key={key}
              className="relative rounded-2xl overflow-hidden min-h-[300px] sm:min-h-[340px] group cursor-pointer"
              onClick={() => navigate(to)}
            >
              {/* Photo background */}
              <img
                src={image}
                alt=""
                aria-hidden="true"
                className="absolute inset-0 w-full h-full object-cover object-center transition-transform duration-700 group-hover:scale-105"
              />
              {/* Color tint gradient overlay */}
              <div className="absolute inset-0" style={{ background: gradient }} />
              {/* Bottom darkening gradient */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/25 to-transparent" />

              {/* Content */}
              <div className="relative z-10 h-full flex flex-col justify-end p-6 sm:p-8">
                <span className="text-[10px] sm:text-xs font-semibold uppercase tracking-[0.15em] text-[#1E3A8A] mb-2">
                  {eyebrow}
                </span>
                <h3 className="text-lg sm:text-xl font-duotone-bold-extended text-white mb-2 leading-tight">
                  {title}
                </h3>
                <p className="text-sm font-duotone-regular text-white/80 mb-5 leading-relaxed">
                  {body}
                </p>
                <div>
                  <Button
                    size="large"
                    className="font-duotone-bold !h-12 !px-8 !text-base !rounded-md shadow-lg transition-all duration-150 hover:scale-[1.02] active:scale-95"
                    style={btnStyle}
                    onClick={e => { e.stopPropagation(); navigate(to); }}
                  >
                    {cta} <RightOutlined className="text-xs ml-1" />
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

export default MemberUpsellBanner;
