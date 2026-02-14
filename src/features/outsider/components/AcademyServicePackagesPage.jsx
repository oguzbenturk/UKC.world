import { useEffect, useMemo, useState } from 'react';
import { Button, Modal, Tag } from 'antd';
import {
  RocketOutlined,
  CheckOutlined,
  ClockCircleOutlined,
  StarFilled,
  InfoCircleOutlined,
  ThunderboltFilled,
  CloseOutlined
} from '@ant-design/icons';
import { usePageSEO } from '@/shared/utils/seo';
import { useCurrency } from '@/shared/contexts/CurrencyContext';
import apiClient from '@/shared/services/apiClient';

const defaultColors = {
  blue: { text: 'text-blue-400', bg: 'bg-blue-500', border: 'border-blue-500', soft: 'bg-blue-500/10' },
  cyan: { text: 'text-cyan-400', bg: 'bg-cyan-500', border: 'border-cyan-500', soft: 'bg-cyan-500/10' },
  purple: { text: 'text-purple-400', bg: 'bg-purple-500', border: 'border-purple-500', soft: 'bg-purple-500/10' },
  yellow: { text: 'text-yellow-400', bg: 'bg-yellow-500', border: 'border-yellow-500', soft: 'bg-yellow-500/10' },
  green: { text: 'text-green-400', bg: 'bg-green-500', border: 'border-green-500', soft: 'bg-green-500/10' }
};

const AcademyServicePackagesPage = ({
  seoTitle,
  seoDescription,
  headline,
  accentWord,
  subheadline,
  academyTag = 'UKC Academy',
  packages = [],
  dynamicServiceKey = null
}) => {
  const { formatCurrency, convertCurrency, userCurrency } = useCurrency();
  const [selectedPackage, setSelectedPackage] = useState(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedDuration, setSelectedDuration] = useState('6h');
  const [dynamicPackages, setDynamicPackages] = useState([]);

  usePageSEO({
    title: seoTitle,
    description: seoDescription
  });

  const normalize = (v) => String(v || '').toLowerCase();

  const isMatchForService = (pkg, key) => {
    if (!key) return true;
    const normKey = normalize(key);
    
    // 1. Tag based match
    const tag = normalize(pkg.disciplineTag || pkg.discipline_tag);
    
    // Explicit exclusions based on key to prevent cross-contamination
    if (normKey === 'kite') {
      if (tag.includes('efoil') || tag.includes('e-foil') || tag.includes('wing') || tag.includes('foil')) return false;
    }
    if (normKey === 'foil') {
      if (tag.includes('efoil') || tag.includes('e-foil') || tag.includes('wing')) return false;
    }
    if (normKey === 'wing') {
        if (tag.includes('kite') && !tag.includes('wing')) return false; // Basic sanity check
    }

    // Direct tag match using expanded synonyms
    const tagMatchMap = {
      kite: ['kite', 'kitesurfing', 'kitesurf'],
      wing: ['wing', 'wing_foil', 'wing foiling', 'wingfoil'],
      foil: ['kite_foil', 'kitefoil', 'foil'], 
      efoil: ['efoil', 'e-foil', 'e_foil', 'electric foil', 'electric'],
      premium: ['premium'],
    };
    
    const acceptedTags = tagMatchMap[normKey] || [normKey];
    // Check if tag contains any of the accepted variations OR matches exactly
    if (tag && acceptedTags.some(t => tag.includes(t) || t === tag)) return true;

    // 2. Text based match fallback
    const text = [
      pkg.name,
      pkg.description,
      pkg.lessonServiceName,
      pkg.disciplineTag, // Include tag in text search too
      pkg.lessonCategoryTag
    ].map(normalize).join(' ');

    if (normKey === 'efoil') {
      return text.includes('e-foil') || text.includes('efoil') || text.includes('electric');
    }
    
    if (normKey === 'wing') {
      return text.includes('wing');
    }

    if (normKey === 'foil') {
      // Must include foil, must NOT be wing or efoil (unless specified)
      const isWing = text.includes('wing');
      // "Kite Foil" IS valid foil. "E-Foil" is technically foil, but usually separate product.
      // If user has separate E-Foil page, exclude here.
      const isEfoil = text.includes('e-foil') || text.includes('efoil') || text.includes('electric');
      
      return (text.includes('foil') || text.includes('kite foil')) && !isWing && !isEfoil;
    }

    if (normKey === 'kite') {
       // Must include kite, must NOT be wing or efoil
       const isEfoil = text.includes('efoil') || text.includes('e-foil') || text.includes('electric');
       const isWing = text.includes('wing');
       const isFoil = text.includes('foil'); // Strict: no "kite foil" in "kite" page if separate foil page exists
       return text.includes('kite') && !isEfoil && !isWing && !isFoil;
    }

    return text.includes(normKey);
  };

  const toTitle = (value) =>
    String(value || '')
      .replace(/[-_]/g, ' ')
      .replace(/\b\w/g, (m) => m.toUpperCase())
      .trim();

  const buildDynamicCards = (apiRows = [], serviceKey = dynamicServiceKey) => {
    const filtered = apiRows.filter((pkg) => (pkg.includesLessons !== false) && isMatchForService(pkg, serviceKey));
    if (filtered.length === 0) return [];

    const groups = new Map();
    filtered.forEach((pkg) => {
      const key = pkg.lessonServiceName || pkg.lessonServiceId || pkg.name;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(pkg);
    });

    const cardPalette = [
      { color: 'blue', gradient: 'from-blue-600 to-blue-400', shadow: 'shadow-blue-500/20', border: 'hover:border-blue-500/50' },
      { color: 'cyan', gradient: 'from-cyan-500 to-blue-500', shadow: 'shadow-cyan-500/20', border: 'hover:border-cyan-500/50' },
      { color: 'purple', gradient: 'from-purple-600 to-fuchsia-500', shadow: 'shadow-purple-500/20', border: 'hover:border-purple-500/50' },
      { color: 'green', gradient: 'from-green-500 to-emerald-600', shadow: 'shadow-green-500/20', border: 'hover:border-green-500/50' }
    ];

    return Array.from(groups.values()).map((group, idx) => {
      const first = group[0];
      const theme = cardPalette[idx % cardPalette.length];
      const durations = group
        .map((pkg) => {
          const hours = Math.round(Number(pkg.totalHours) || 0);
          if (!hours) return null;
          return {
            hours: `${hours}h`,
            price: Number(pkg.price) || 0,
            label: pkg.name,
            sessions: pkg.sessionsCount ? `${pkg.sessionsCount} sessions` : `${hours}h package`,
            tag: pkg.levelTag ? toTitle(pkg.levelTag) : undefined,
            perPerson: normalize(pkg.lessonCategoryTag).includes('group') || normalize(pkg.lessonCategoryTag).includes('semi')
          };
        })
        .filter(Boolean)
        .sort((a, b) => Number(a.hours.replace('h', '')) - Number(b.hours.replace('h', '')));

      if (durations.length === 0) return null;

      return {
        id: first.id || `${serviceKey || 'lesson'}-${idx}`,
        name: first.lessonServiceName || toTitle(serviceKey) || first.name,
        subtitle: first.lessonCategoryTag ? toTitle(first.lessonCategoryTag) : 'Configured Package',
        icon: <RocketOutlined />,
        featured: idx === 0,
        color: theme.color,
        gradient: theme.gradient,
        shadow: theme.shadow,
        border: theme.border,
        image: first.imageUrl || '/Images/ukc/kite-header.jpg.png',
        description: first.description || 'Configured from admin panel packages.',
        highlights: [
          'Configured through admin panel',
          first.lessonServiceName ? `Service: ${first.lessonServiceName}` : 'Lesson package',
          first.levelTag ? `Level: ${toTitle(first.levelTag)}` : 'Progress-based sessions',
          'Real-time package pricing',
          'Durations based on configured packages',
          'Book directly from this page'
        ],
        durations,
        badges: [toTitle(first.lessonCategoryTag || 'Lesson'), toTitle(first.levelTag || 'Package')]
      };
    }).filter(Boolean);
  };

  const transformServiceToPackage = (s) => {
    // Try to find price in standard structure
    const eurPriceObj = Array.isArray(s.prices) 
      ? s.prices.find((p) => (p.currencyCode === 'EUR' || p.currency_code === 'EUR')) 
      : null;
      
    const basePrice = eurPriceObj 
      ? (eurPriceObj.price || eurPriceObj.amount) 
      : (s.price || 0);

    const hours = s.duration_minutes 
      ? (s.duration_minutes / 60) 
      : (s.duration ? parseFloat(s.duration) : 1);
    
    // Ensure disciplineTag is set correctly for filtering
    let dTag = s.disciplineTag || s.discipline_tag;
    if (!dTag && s.category) {
      const cat = s.category.toLowerCase();
      if (cat.includes('kite')) dTag = 'kite';
      else if (cat.includes('wing')) dTag = 'wing';
      else if (cat.includes('efoil') || cat.includes('e-foil')) dTag = 'efoil';
      else if (cat.includes('foil')) dTag = 'foil'; // generic foil
      else dTag = cat;
    }
    
    return {
      id: `svc-${s.id}`,
      name: s.name,
      description: s.description,
      price: parseFloat(basePrice) || 0,
      totalHours: hours,
      sessionsCount: 1,
      lessonServiceName: s.name, 
      lessonServiceId: s.id, 
      disciplineTag: dTag,
      lessonCategoryTag: s.lessonCategoryTag || s.category || 'Individual Lesson',
      levelTag: s.levelTag || (s.level ? toTitle(s.level) : 'Single Session'),
      includesLessons: true,
      imageUrl: s.imageUrl || s.image_url,
      isService: true
    };
  };

  useEffect(() => {
    let cancelled = false;
    if (!dynamicServiceKey) return undefined;

    (async () => {
      try {
        const [packagesRes, servicesRes] = await Promise.all([
          apiClient.get('/services/packages/public'),
          apiClient.get('/services')
        ]);
        
        const packageRows = Array.isArray(packagesRes.data) ? packagesRes.data : [];
        const rawServices = Array.isArray(servicesRes.data) ? servicesRes.data : [];

        // Transform services into compatible format
        const serviceRows = rawServices
          .filter((s) => !s.package_id) // Only standalone services
          .map(transformServiceToPackage);

        const allRows = [...packageRows, ...serviceRows];
        const mappedByService = buildDynamicCards(allRows, dynamicServiceKey);
        
        if (!cancelled) setDynamicPackages(mappedByService);
      } catch {
        // Silent error
        if (!cancelled) setDynamicPackages([]);
      }
    })();

    return () => {
      cancelled = true;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dynamicServiceKey]);

  const displayPackages = useMemo(() => {
    if (dynamicServiceKey) return dynamicPackages;
    if (dynamicPackages.length > 0) return dynamicPackages;
    return packages;
  }, [dynamicPackages, packages, dynamicServiceKey]);

  const handleCardClick = (pkg) => {
    setSelectedPackage(pkg);
    setSelectedDuration((pkg.durations[1] || pkg.durations[0])?.hours || '6h');
    setModalVisible(true);
  };

  const handleModalClose = () => {
    setModalVisible(false);
    setTimeout(() => {
      setSelectedPackage(null);
      setSelectedDuration('6h');
    }, 300);
  };

  const getCurrentPrice = () => {
    if (!selectedPackage) return 0;
    const duration = selectedPackage.durations.find(d => d.hours === selectedDuration);
    return duration ? duration.price : 0;
  };

  const formatPrice = (eurPrice) => {
    const converted = convertCurrency(eurPrice, 'EUR', userCurrency);
    return formatCurrency(converted, userCurrency);
  };

  const getThemeColor = (pkg) => defaultColors[pkg?.color] || defaultColors.blue;

  return (
    <div className="bg-[#0f1013] min-h-screen text-white font-sans selection:bg-blue-500/30">
      <div className="relative py-12 overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-full">
          <div className="absolute top-[-10%] right-[-5%] w-[600px] h-[600px] bg-blue-600/10 rounded-full blur-[120px]" />
          <div className="absolute bottom-[0%] left-[-10%] w-[500px] h-[500px] bg-cyan-600/10 rounded-full blur-[100px]" />
        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10 text-center">
          <Tag className="mb-2 !bg-blue-500/10 !border-blue-500/30 !text-blue-400 !px-4 !py-1 !rounded-full !font-bold uppercase tracking-wider">
            {academyTag}
          </Tag>
          <h1 className="text-4xl md:text-5xl font-extrabold text-white mb-2 tracking-tight">
            {headline} <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-cyan-400">{accentWord}</span>
          </h1>
          <p className="text-lg text-gray-400 max-w-2xl mx-auto leading-relaxed">
            {subheadline}
          </p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-32">
        {displayPackages.length === 0 ? (
          <div className="rounded-3xl border border-white/10 bg-[#1a1d26] p-10 text-center">
            <h3 className="text-xl font-bold text-white mb-2">No configured packages yet</h3>
            <p className="text-gray-400 max-w-2xl mx-auto">
              This page only shows live packages configured in the admin panel for this discipline.
              Create lesson services and packages in Services → Lessons to publish them here.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            {displayPackages.map((pkg) => (
              <div
                key={pkg.id}
                onClick={() => handleCardClick(pkg)}
                className={`group relative bg-[#1a1d26] rounded-3xl border border-white/5 transition-all duration-500 cursor-pointer hover:-translate-y-2 hover:shadow-2xl ${pkg.shadow || ''} ${pkg.border || ''}`}
              >
                <div className="h-48 relative rounded-t-3xl overflow-hidden">
                  <div
                    className="absolute inset-0 bg-cover bg-center transition-transform duration-700 group-hover:scale-110"
                    style={{ backgroundImage: `url('${pkg.image}')` }}
                  />
                  <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[#1a1d26]/50 to-[#1a1d26]" />

                  <div className={`absolute -bottom-6 left-6 w-14 h-14 rounded-2xl flex items-center justify-center text-2xl shadow-lg border-4 border-[#1a1d26] z-10 ${pkg.gradient} text-white`}>
                    {pkg.icon}
                  </div>

                  {pkg.featured && (
                    <div className="absolute top-4 right-4 bg-white/90 backdrop-blur-md text-black px-3 py-1 rounded-full text-xs font-bold shadow-lg flex items-center gap-1">
                      <StarFilled className="text-yellow-500" /> POPULAR
                    </div>
                  )}
                </div>

                <div className="pt-10 px-6 pb-6">
                  <h3 className="text-xl font-bold text-white mb-1 group-hover:text-blue-400 transition-colors">{pkg.name}</h3>
                  <p className="text-sm text-gray-500 mb-6 font-medium uppercase tracking-wide">{pkg.subtitle}</p>

                  <div className="space-y-3 mb-6">
                    {pkg.badges.map((badge) => (
                      <div key={`${pkg.id}-${badge}`} className="flex items-center gap-2 text-sm text-gray-300">
                        <CheckOutlined className={`${getThemeColor(pkg).text}`} /> {badge}
                      </div>
                    ))}
                  </div>

                  <div className="flex items-end justify-between border-t border-white/5 pt-4 mt-auto">
                    <div>
                      <p className="text-xs text-gray-500 mb-1">Starting from</p>
                      <p className="text-2xl font-bold text-white">{formatPrice(pkg.durations[0].price)}</p>
                    </div>
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center transition-all duration-300 ${getThemeColor(pkg).soft} group-hover:bg-white group-hover:text-black`}>
                      <RocketOutlined />
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {selectedPackage && (
        <Modal
          open={modalVisible}
          onCancel={handleModalClose}
          footer={null}
          width={900}
          centered
          className="deluxe-modal"
          closeIcon={<div className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors"><CloseOutlined /></div>}
          styles={{
            content: {
              backgroundColor: '#13151a',
              border: '1px solid rgba(255,255,255,0.08)',
              padding: 0,
              borderRadius: '24px',
              overflow: 'hidden',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)'
            }
          }}
        >
          <div className="flex flex-col md:flex-row h-full">
            <div className="md:w-2/5 bg-[#0f1013] relative overflow-hidden flex flex-col">
              <div className="h-48 relative shrink-0">
                <div
                  className="absolute inset-0 bg-cover bg-center"
                  style={{ backgroundImage: `url('${selectedPackage.image}')` }}
                />
                <div className="absolute inset-0 bg-gradient-to-b from-transparent to-[#0f1013]" />
                <div className="absolute bottom-4 left-6 z-10">
                  <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider mb-2 ${getThemeColor(selectedPackage).soft} ${getThemeColor(selectedPackage).text}`}>
                    {selectedPackage.subtitle}
                  </div>
                  <h2 className="text-3xl font-extrabold text-white leading-tight">{selectedPackage.name}</h2>
                </div>
              </div>

              <div className="p-6 md:p-8 flex-grow overflow-y-auto">
                <p className="text-gray-400 mb-8 leading-relaxed text-sm">{selectedPackage.description}</p>

                <h4 className="text-white font-bold mb-4 flex items-center gap-2 text-sm uppercase tracking-wide">
                  <ThunderboltFilled className="text-yellow-500" /> What's Included
                </h4>
                <ul className="space-y-3">
                  {selectedPackage.highlights.map((h) => (
                    <li key={`${selectedPackage.id}-${h}`} className="flex items-start gap-3 text-sm text-gray-300">
                      <div className={`mt-0.5 w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${getThemeColor(selectedPackage).soft}`}>
                        <CheckOutlined className={`text-xs ${getThemeColor(selectedPackage).text}`} />
                      </div>
                      {h}
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="md:w-3/5 bg-[#13151a] p-6 md:p-8 flex flex-col h-full relative">
              <div className="mb-6">
                <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                  <ClockCircleOutlined className="text-gray-500" /> Choose Duration
                </h3>

                <div className="grid grid-cols-2 gap-3">
                  {selectedPackage.durations.map((dur) => {
                    const isSelected = selectedDuration === dur.hours;
                    const theme = getThemeColor(selectedPackage);
                    return (
                      <div
                        key={dur.hours}
                        onClick={() => setSelectedDuration(dur.hours)}
                        className={`
                          relative cursor-pointer rounded-xl p-4 border-2 transition-all duration-300
                          ${isSelected
                            ? `${theme.border} ${theme.soft}`
                            : 'border-white/5 bg-[#1a1d26] hover:border-white/10 hover:bg-[#20242e]'}`}
                      >
                        {isSelected && (
                          <div className={`absolute top-2 right-2 w-4 h-4 rounded-full ${theme.bg} flex items-center justify-center`}>
                            <CheckOutlined className="text-white text-[10px]" />
                          </div>
                        )}
                        <div className="flex justify-between items-start mb-2">
                          <span className={`text-sm font-bold ${isSelected ? 'text-white' : 'text-gray-400'}`}>{dur.hours}</span>
                          {dur.tag && (
                            <span className={`text-[10px] px-2 py-0.5 rounded border ${isSelected ? 'border-white/20 text-white' : 'border-white/5 text-gray-600'}`}>
                              {dur.tag}
                            </span>
                          )}
                        </div>
                        <div className="mb-1">
                          <span className="text-xl font-bold text-white">{formatPrice(dur.price)}</span>
                          {dur.perPerson && <span className="text-[10px] text-gray-500 ml-1">/pp</span>}
                        </div>
                        <p className="text-[11px] text-gray-500 font-medium">{dur.sessions}</p>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="mt-auto bg-[#0f1013] rounded-2xl p-5 border border-white/5">
                <div className="flex justify-between items-center mb-4">
                  <div>
                    <p className="text-gray-400 text-xs uppercase tracking-wider font-semibold">Total Price</p>
                    <p className="text-gray-500 text-xs">{selectedPackage.durations.find(d => d.hours === selectedDuration)?.sessions}</p>
                  </div>
                  <div className="text-right">
                    <span className="text-3xl font-bold text-white tracking-tight">{formatPrice(getCurrentPrice())}</span>
                    {selectedPackage.durations.find(d => d.hours === selectedDuration)?.perPerson && (
                      <p className="text-[10px] text-gray-500">per person</p>
                    )}
                  </div>
                </div>

                <Button
                  block
                  size="large"
                  type="primary"
                  icon={<RocketOutlined />}
                  className={`!h-14 !rounded-xl !text-lg !font-bold !border-none shadow-lg transition-transform active:scale-95 ${selectedPackage.gradient}`}
                >
                  Book Now
                </Button>
                <p className="text-center text-gray-600 text-[10px] mt-3 flex items-center justify-center gap-1">
                  <InfoCircleOutlined /> No payment required today. Secure your spot now.
                </p>
              </div>
            </div>
          </div>
        </Modal>
      )}

      <style>{`
        .deluxe-modal .ant-modal-content {
           padding: 0;
           background: transparent;
        }
        ::-webkit-scrollbar {
          width: 6px;
        }
        ::-webkit-scrollbar-track {
          background: transparent;
        }
        ::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.1);
          border-radius: 10px;
        }
        ::-webkit-scrollbar-thumb:hover {
          background: rgba(255, 255, 255, 0.2);
        }
      `}</style>
    </div>
  );
};

export default AcademyServicePackagesPage;
