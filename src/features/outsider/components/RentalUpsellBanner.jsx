import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from 'antd';
import { RightOutlined } from '@ant-design/icons';
import standardBg from '../../../../DuotoneFonts/DPSLOGOS/Website-DSC07450.jpg';
import slsBg from '../../../../DuotoneFonts/pictures/Website-Dtk-Duotone-Lazepump-RebelSLS-MatchuLopes-Venezuela-2026-TobyBromwich-0955.jpg';
import dlabBg from '../../../../DuotoneFonts/pictures/Website-DTK-RebelD-Lab-Rigging-ColleenCarroll-HoodRiver-2026-TobyBromwich-3391.jpg';
import efoilBg from '../../../../DuotoneFonts/pictures/Website-MelissaTrullier_MidfishAir_FoilAssistCruiseAL_Duotone_DTE_Tahiti_by_Ben_Thouard_54333.jpg';

const CARD_CONFIG = [
  { key: 'standard', image: standardBg, to: '/rental/standard' },
  { key: 'sls', image: slsBg, to: '/rental/sls' },
  { key: 'dlab', image: dlabBg, to: '/rental/dlab' },
  { key: 'efoil', image: efoilBg, to: '/rental/efoil' },
];

const btnStyle = {
  background: '#4b4f54',
  color: '#00a8c4',
  border: '1px solid rgba(0,168,196,0.5)',
  boxShadow: '0 0 12px rgba(0,168,196,0.2)',
};

const RentalUpsellBanner = ({ currentKey }) => {
  const { t } = useTranslation(['outsider']);
  const navigate = useNavigate();

  const cards = useMemo(() => CARD_CONFIG
    .filter((c) => c.key !== currentKey)
    .map((c) => ({
      key: c.key,
      image: c.image,
      to: c.to,
      eyebrow: t(`outsider:rentalUpsell.cards.${c.key}.eyebrow`),
      title: t(`outsider:rentalUpsell.cards.${c.key}.title`),
      body: t(`outsider:rentalUpsell.cards.${c.key}.body`),
      cta: t(`outsider:rentalUpsell.cards.${c.key}.cta`),
    })), [t, currentKey]);

  return (
    <div className="py-16 sm:py-20 bg-slate-50 border-t border-slate-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#00a8c4] text-center mb-2">
          {t('outsider:rentalUpsell.sectionLabel')}
        </p>
        <h2 className="text-2xl sm:text-3xl font-duotone-bold-extended text-slate-900 text-center mb-10">
          {t('outsider:rentalUpsell.title')}
        </h2>

        <div className={`grid grid-cols-1 ${cards.length === 2 ? 'md:grid-cols-2' : 'md:grid-cols-3'} gap-6`}>
          {cards.map((card) => (
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
