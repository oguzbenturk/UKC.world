import { useEffect, useState } from 'react';
import { Button, Modal, Tag } from 'antd';
import {
  RocketOutlined,
  CheckOutlined,
  ClockCircleOutlined,
  TeamOutlined,
  TrophyOutlined,
  SafetyCertificateOutlined,
  StarFilled,
  InfoCircleOutlined,
  ThunderboltFilled,
  CloseOutlined
} from '@ant-design/icons';
import { usePageSEO } from '@/shared/utils/seo';
import { useCurrency } from '@/shared/contexts/CurrencyContext';
import apiClient from '@/shared/services/apiClient';

const KiteLessonsPage = () => {
  const { formatCurrency, convertCurrency, userCurrency } = useCurrency();
  const [selectedPackage, setSelectedPackage] = useState(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedDuration, setSelectedDuration] = useState('6h');
  const [dynamicPackages, setDynamicPackages] = useState([]);

  usePageSEO({
    title: 'Kite Lessons | UKC Academy',
    description: 'Professional kitesurfing lessons with experienced instructors. Choose your package and start your journey today.'
  });

  const fallbackPackages = [
    {
      id: 'beginner-private',
      name: 'Beginner Private',
      subtitle: '1-on-1 Instruction',
      icon: <SafetyCertificateOutlined />,
      featured: false,
      color: 'blue',
      gradient: 'from-blue-600 to-blue-400',
      shadow: 'shadow-blue-500/20',
      border: 'hover:border-blue-500/50',
      image: '/Images/ukc/kite-header.jpg.png',
      description: 'The fastest way to learn. Get 100% personalized attention from a dedicated instructor focusing entirely on your progression speed and comfort level.',
      highlights: [
        'Dedicated private instructor',
        'Radio helmet communication',
        'Latest Duotone equipment included',
        'Personalized progression plan',
        'Step-by-step progression tracking',
        'Personal session recap'
      ],
      durations: [
        { hours: '4h', price: 280, label: 'Intro', sessions: '2 x 2hr', tag: 'Basic' },
        { hours: '6h', price: 420, label: 'Standard', sessions: '3 x 2hr', tag: 'Popular' },
        { hours: '8h', price: 560, label: 'Plus', sessions: '4 x 2hr', tag: 'Recommended' },
        { hours: '10h', price: 650, label: 'Pro', sessions: '5 x 2hr', tag: 'Best Value' }
      ],
      badges: ['Private Focus', 'Radio Helmet']
    },
    {
      id: 'group-course',
      name: 'Group Course',
      subtitle: 'Semi-Private (2 Students)',
      icon: <TeamOutlined />,
      featured: true,
      color: 'cyan',
      gradient: 'from-cyan-500 to-blue-500',
      shadow: 'shadow-cyan-500/20',
      border: 'hover:border-cyan-500/50',
      image: '/Images/ukc/kite-header.jpg.png',
      description: 'Learn with a friend or meet a new kite buddy! This semi-private format offers a perfect balance of instruction and rest/observation time.',
      highlights: [
        'Max 2 students per instructor',
        'Shared kite & board',
        'Learn by watching others',
        'Fun social environment',
        'More affordable rate',
        'Full gear included'
      ],
      durations: [
        { hours: '4h', price: 180, label: 'Intro', sessions: '2 x 2hr', perPerson: true, tag: 'Starter' },
        { hours: '6h', price: 270, label: 'Standard', sessions: '3 x 2hr', perPerson: true, tag: 'Popular' },
        { hours: '8h', price: 360, label: 'Plus', sessions: '4 x 2hr', perPerson: true, tag: 'Value' },
        { hours: '10h', price: 450, label: 'Pro', sessions: '5 x 2hr', perPerson: true, tag: 'Complete' }
      ],
      badges: ['Best Seller', 'Social Fun']
    },
    {
      id: 'advanced-coaching',
      name: 'Advanced Coaching',
      subtitle: 'Pro Level Training',
      icon: <TrophyOutlined />,
      featured: false,
      color: 'yellow',
      gradient: 'from-yellow-500 to-amber-500',
      shadow: 'shadow-yellow-500/20',
      border: 'hover:border-yellow-500/50',
      image: '/Images/ukc/kite-header.jpg.png',
      description: 'Already riding? Take your skills to the next level with our senior instructors. Master jumps, transitions, unhooked tricks, or wave riding.',
      highlights: [
        'Senior Level 3 Instructor',
        'Advanced performance feedback',
        'Trick progression roadmap',
        'Downwinder support',
        'Competition preparation',
        'Equipment tuning clinic'
      ],
      durations: [
        { hours: '4h', price: 320, label: 'Fix It', sessions: '4 x 1hr', tag: 'Tune-up' },
        { hours: '6h', price: 480, label: 'Progress', sessions: '6 x 1hr', tag: 'Core' },
        { hours: '8h', price: 640, label: 'Mastery', sessions: '8 x 1hr', tag: 'Advanced' },
        { hours: '10h', price: 750, label: 'Pro Camp', sessions: '10 x 1hr', tag: 'Intensive' }
      ],
      badges: ['Expert Only', 'Progress Coaching']
    },
    {
      id: 'supervision',
      name: 'Supervision',
      subtitle: 'Independent Practice',
      icon: <RocketOutlined />,
      featured: false,
      color: 'green',
      gradient: 'from-green-500 to-emerald-600',
      shadow: 'shadow-green-500/20',
      border: 'hover:border-green-500/50',
      image: '/Images/ukc/kite-header.jpg.png',
      description: 'Practice independently with peace of mind. Our beach crew will help you launch/land and keep an eye on you while you rip.',
      highlights: [
        'Launch & Land assistance',
        'Safety boat rescue cover',
        'School zone access',
        'Daily weather briefing',
        'Emergency equipment access'
      ],
      durations: [
        { hours: '4h', price: 240, label: 'Half Day', sessions: '4h Slot', tag: 'Quick' },
        { hours: '6h', price: 360, label: 'Full Day', sessions: 'Daily', tag: 'Standard' },
        { hours: '8h', price: 480, label: 'Weekend', sessions: '2 Days', tag: 'Weekend' },
        { hours: '10h', price: 600, label: 'Week', sessions: '5 Days', tag: 'Holiday' }
      ],
      badges: ['Safety First', 'Rental Available']
    }
  ];

  const parseHours = (hoursText) => Number(String(hoursText || '').replace('h', '')) || 0;

  const detectPackageBucket = (pkg) => {
    const text = [
      pkg.name,
      pkg.description,
      pkg.lessonServiceName,
      pkg.lessonCategoryTag,
      pkg.levelTag,
      pkg.lessonServiceType
    ].filter(Boolean).join(' ').toLowerCase();

    if (text.includes('supervision')) return 'supervision';
    if (text.includes('group') || text.includes('semi-private') || text.includes('semi private')) return 'group-course';
    if (text.includes('advanced') || text.includes('premium') || text.includes('coaching') || text.includes('pro')) return 'advanced-coaching';
    return 'beginner-private';
  };

  const toDuration = (pkg) => {
    const hours = Math.round(Number(pkg.totalHours) || 0);
    const price = Number(pkg.price) || 0;
    if (!hours || !price) return null;

    const groupLike = String(pkg.lessonCategoryTag || pkg.lessonServiceType || '').toLowerCase();
    return {
      hours: `${hours}h`,
      price,
      label: pkg.name || `${hours}h`,
      sessions: pkg.sessionsCount ? `${pkg.sessionsCount} sessions` : `${hours}h package`,
      tag: pkg.levelTag ? String(pkg.levelTag).replace(/(^\w|[-_]\w)/g, (m) => m.replace(/[-_]/, '').toUpperCase()) : undefined,
      perPerson: groupLike.includes('group') || groupLike.includes('semi')
    };
  };

  const mergeApiPackagesWithCards = (apiPackages = []) => {
    const grouped = {
      'beginner-private': [],
      'group-course': [],
      'advanced-coaching': [],
      supervision: []
    };

    apiPackages.forEach((pkg) => {
      if (pkg.includesLessons === false) return;
      const duration = toDuration(pkg);
      if (!duration) return;
      const bucket = detectPackageBucket(pkg);
      grouped[bucket].push(duration);
    });

    return fallbackPackages.map((card) => {
      const durations = grouped[card.id] || [];
      if (durations.length === 0) return card;

      const uniqueByHours = new Map();
      durations.forEach((d) => {
        const existing = uniqueByHours.get(d.hours);
        if (!existing || d.price < existing.price) uniqueByHours.set(d.hours, d);
      });

      const sortedDurations = Array.from(uniqueByHours.values())
        .sort((a, b) => parseHours(a.hours) - parseHours(b.hours));

      return {
        ...card,
        durations: sortedDurations,
      };
    });
  };

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const response = await apiClient.get('/services/packages/public');
        const apiPackages = Array.isArray(response.data) ? response.data : [];
        if (!apiPackages.length || cancelled) return;
        const merged = mergeApiPackagesWithCards(apiPackages);
        if (!cancelled) setDynamicPackages(merged);
      } catch {
        // keep static fallback packages
      }
    })();

    return () => {
      cancelled = true;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const packages = dynamicPackages.length > 0 ? dynamicPackages : fallbackPackages;

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

  const getThemeColor = (pkg) => {
    const colors = {
      blue: { text: 'text-blue-400', bg: 'bg-blue-500', border: 'border-blue-500', soft: 'bg-blue-500/10' },
      cyan: { text: 'text-cyan-400', bg: 'bg-cyan-500', border: 'border-cyan-500', soft: 'bg-cyan-500/10' },
      yellow: { text: 'text-yellow-400', bg: 'bg-yellow-500', border: 'border-yellow-500', soft: 'bg-yellow-500/10' },
      green: { text: 'text-green-400', bg: 'bg-green-500', border: 'border-green-500', soft: 'bg-green-500/10' }
    };
    return colors[pkg?.color] || colors.blue;
  };

  // Academy/Learning Theme (Purple/Indigo/Cosmic)
  const bgTheme = (
    <div className="absolute inset-0 w-full h-full overflow-hidden pointer-events-none">
        <div className="absolute inset-0 bg-[#0a0b10]" />
        
        {/* Subtle Gradient Overlay */}
        <div className="absolute inset-0 bg-gradient-to-b from-[#13111c] via-[#0a0b10]/90 to-[#0a0b10]" />
        
        {/* Abstract "Flow" Lines for Wind/Progress */}
        <div className="absolute inset-0 opacity-10" 
             style={{ 
                 backgroundImage: 'repeating-linear-gradient(45deg, rgba(99, 102, 241, 0.1) 0px, transparent 2px, transparent 10px)',
                 backgroundSize: '20px 20px' 
             }} 
        />
        
        {/* Deep "Academy" Orbs - Switched to Indigo/Violet for Premium feel */}
        <div className="absolute top-[-10%] left-[-10%] w-[900px] h-[900px] bg-indigo-600/10 rounded-full blur-[130px] mix-blend-screen" />
        <div className="absolute top-[10%] right-[-5%] w-[700px] h-[700px] bg-violet-600/10 rounded-full blur-[110px] mix-blend-screen" />
        <div className="absolute bottom-[0%] left-[20%] w-[600px] h-[600px] bg-blue-900/10 rounded-full blur-[100px]" />
    </div>
  );

  return (
    <div className="bg-[#0f1013] min-h-screen text-white font-sans selection:bg-indigo-500/30 relative">
      <div className="relative py-12 overflow-hidden">
        {bgTheme}

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10 text-center">
          <Tag className="mb-2 !bg-blue-500/10 !border-blue-500/30 !text-blue-400 !px-4 !py-1 !rounded-full !font-bold uppercase tracking-wider">
            UKC Academy
          </Tag>
          <h1 className="text-4xl md:text-5xl font-extrabold text-white mb-2 tracking-tight">
            Kite <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-cyan-400">Lessons</span>
          </h1>
          <p className="text-lg text-gray-400 max-w-2xl mx-auto leading-relaxed">
            Choose your perfect learning path. From total beginner to pro-level coaching, our experienced team is ready.
          </p>
        </div>
      </div>

      {/* Modern Card Grid */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-32">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
          {packages.map((pkg) => (
            <div
              key={pkg.id}
              onClick={() => handleCardClick(pkg)}
              className={`group relative bg-[#1a1d26] rounded-3xl border border-white/5 transition-all duration-500 cursor-pointer hover:-translate-y-2 hover:shadow-2xl ${pkg.shadow} ${pkg.border}`}
            >
              {/* Image Overlay */}
              <div className="h-48 relative rounded-t-3xl overflow-hidden">
                <div 
                  className="absolute inset-0 bg-cover bg-center transition-transform duration-700 group-hover:scale-110"
                  style={{ backgroundImage: `url('${pkg.image}')` }}
                />
                <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[#1a1d26]/50 to-[#1a1d26]"></div>
                
                {/* Floating Icon */}
                <div className={`absolute -bottom-6 left-6 w-14 h-14 rounded-2xl flex items-center justify-center text-2xl shadow-lg border-4 border-[#1a1d26] z-10 ${pkg.gradient} text-white`}>
                  {pkg.icon}
                </div>

                {/* Popular Badge */}
                {pkg.featured && (
                  <div className="absolute top-4 right-4 bg-white/90 backdrop-blur-md text-black px-3 py-1 rounded-full text-xs font-bold shadow-lg flex items-center gap-1">
                    <StarFilled className="text-yellow-500" /> POPULAR
                  </div>
                )}
              </div>

              {/* Card Content */}
              <div className="pt-10 px-6 pb-6">
                <h3 className="text-xl font-bold text-white mb-1 group-hover:text-blue-400 transition-colors">{pkg.name}</h3>
                <p className="text-sm text-gray-500 mb-6 font-medium uppercase tracking-wide">{pkg.subtitle}</p>

                {/* Features Preview */}
                <div className="space-y-3 mb-6">
                  {pkg.badges.map((badge, idx) => (
                     <div key={idx} className="flex items-center gap-2 text-sm text-gray-300">
                        <CheckOutlined className={`${getThemeColor(pkg).text}`} /> {badge}
                     </div>
                  ))}
                </div>

                {/* Price Tag */}
                <div className="flex items-end justify-between border-t border-white/5 pt-4 mt-auto">
                    <div>
                        <p className="text-xs text-gray-500 mb-1">Starting from</p>
                        <p className="text-2xl font-bold text-white">
                          {formatPrice(pkg.durations[0].price)}
                        </p>
                    </div>
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center transition-all duration-300 ${getThemeColor(pkg).soft} group-hover:bg-white group-hover:text-black`}>
                        <RocketOutlined />
                    </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Deluxe Modal */}
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
            {/* Left Column: Visuals & Info */}
            <div className="md:w-2/5 bg-[#0f1013] relative overflow-hidden flex flex-col">
               {/* Background Header Image */}
               <div className="h-48 relative shrink-0">
                  <div 
                    className="absolute inset-0 bg-cover bg-center"
                    style={{ backgroundImage: `url('${selectedPackage.image}')` }}
                  />
                  <div className="absolute inset-0 bg-gradient-to-b from-transparent to-[#0f1013]"></div>
                  <div className="absolute bottom-4 left-6 z-10">
                     <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider mb-2 ${getThemeColor(selectedPackage).soft} ${getThemeColor(selectedPackage).text}`}>
                        {selectedPackage.subtitle}
                     </div>
                     <h2 className="text-3xl font-extrabold text-white leading-tight">{selectedPackage.name}</h2>
                  </div>
               </div>
               
               {/* Description & Highlights */}
               <div className="p-6 md:p-8 flex-grow overflow-y-auto">
                  <p className="text-gray-400 mb-8 leading-relaxed text-sm">
                    {selectedPackage.description}
                  </p>
                  
                  <h4 className="text-white font-bold mb-4 flex items-center gap-2 text-sm uppercase tracking-wide">
                    <ThunderboltFilled className="text-yellow-500" /> What's Included
                  </h4>
                  <ul className="space-y-3">
                    {selectedPackage.highlights.map((h, i) => (
                        <li key={i} className="flex items-start gap-3 text-sm text-gray-300">
                           <div className={`mt-0.5 w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${getThemeColor(selectedPackage).soft}`}>
                             <CheckOutlined className={`text-xs ${getThemeColor(selectedPackage).text}`} />
                           </div>
                           {h}
                        </li>
                    ))}
                  </ul>
               </div>
            </div>

            {/* Right Column: Configuration */}
            <div className="md:w-3/5 bg-[#13151a] p-6 md:p-8 flex flex-col h-full relative">
                <div className="mb-6">
                    <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                        <ClockCircleOutlined className="text-gray-500" /> Choose Duration
                    </h3>
                    
                    {/* Visual Duration Selectors */}
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
                                            : 'border-white/5 bg-[#1a1d26] hover:border-white/10 hover:bg-[#20242e]'}
                                    `}
                                >
                                    {isSelected && (
                                        <div className={`absolute top-2 right-2 w-4 h-4 rounded-full ${theme.bg} flex items-center justify-center`}>
                                            <CheckOutlined className="text-white text-[10px]" />
                                        </div>
                                    )}
                                    <div className="flex justify-between items-start mb-2">
                                        <span className={`text-sm font-bold ${isSelected ? 'text-white' : 'text-gray-400'}`}>
                                            {dur.hours}
                                        </span>
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

                {/* Sticky Bottom Summary */}
                <div className="mt-auto bg-[#0f1013] rounded-2xl p-5 border border-white/5">
                    <div className="flex justify-between items-center mb-4">
                        <div>
                            <p className="text-gray-400 text-xs uppercase tracking-wider font-semibold">Total Price</p>
                            <p className="text-gray-500 text-xs">{selectedPackage.durations.find(d => d.hours === selectedDuration)?.sessions}</p>
                        </div>
                        <div className="text-right">
                            <span className="text-3xl font-bold text-white tracking-tight">
                                {formatPrice(getCurrentPrice())}
                            </span>
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
        /* Custom Scrollbar for content */
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

export default KiteLessonsPage;
