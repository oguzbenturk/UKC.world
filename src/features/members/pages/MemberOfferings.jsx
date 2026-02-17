import { useState, useEffect } from 'react';
import { Button, Spin, Alert, message, Modal, Space, Select, Card, Input } from 'antd';
import { 
  CrownOutlined, 
  TrophyOutlined, 
  StarOutlined, 
  StarFilled,
  RocketOutlined,
  CheckOutlined,
  CheckCircleFilled,
  WalletOutlined,
  ShopOutlined,
  ThunderboltOutlined,
  UserOutlined,
  SearchOutlined,
  FireOutlined,
  GlobalOutlined,
  SafetyCertificateOutlined,
  SketchOutlined,
  CompassOutlined,
  FlagOutlined
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useCurrency } from '@/shared/contexts/CurrencyContext';
import { useAuth } from '@/shared/hooks/useAuth';
import { useAuthModal } from '@/shared/contexts/AuthModalContext';
import apiClient from '@/shared/services/apiClient';

const fetchMemberOfferings = async () => {
  const { data } = await apiClient.get('/member-offerings');
  return data;
};

const fetchMyPurchases = async () => {
  const { data } = await apiClient.get('/member-offerings/my-purchases');
  return data;
};

const purchaseMembership = async ({ offeringId, paymentMethod }) => {
  const { data } = await apiClient.post(`/member-offerings/${offeringId}/purchase`, { paymentMethod });
  return data;
};

const getOfferingIcon = (name) => {
  const n = (name || '').toLowerCase();
  
  // Specific thematic matches
  if (n.includes('platinum') || n.includes('vip')) return <SketchOutlined />; // Diamond/Premium look
  if (n.includes('gold') || n.includes('master')) return <CrownOutlined />;
  if (n.includes('silver') || n.includes('pro')) return <TrophyOutlined />;
  if (n.includes('bronze') || n.includes('starter')) return <StarOutlined />;
  
  if (n.includes('beach') || n.includes('club')) return <GlobalOutlined />;
  if (n.includes('rental') || n.includes('gear')) return <SafetyCertificateOutlined />;
  if (n.includes('lesson') || n.includes('course')) return <CompassOutlined />; // Learning/Direction
  if (n.includes('camp') || n.includes('travel')) return <FlagOutlined />;
  if (n.includes('discovery') || n.includes('trial')) return <RocketOutlined />; // Launch
  
  if (n.includes('fast') || n.includes('express')) return <ThunderboltOutlined />;
  
  // Default fallback based on "vibe" or random if nothing matches
  return <StarOutlined />;
};

const getBackgroundIcon = (name) => {
  const n = (name || '').toLowerCase();
  if (n.includes('platinum') || n.includes('vip')) return <SketchOutlined />;
  if (n.includes('gold')) return <CrownOutlined />;
  if (n.includes('fire') || n.includes('hot')) return <FireOutlined />;
  return getOfferingIcon(name); // Fallback to the main icon
};

const parseFeatures = (features) => {
  if (!features) return [];
  if (Array.isArray(features)) return features;
  if (typeof features === 'string') {
    try {
      return JSON.parse(features);
    } catch {
      return features.split('\n').filter(Boolean);
    }
  }
  return [];
};

// Sub-component for image-based card
const ImageCard = ({ offering, displayPrice, formatCurrency, onPurchase, isOwned }) => {
  const imgSrc = offering.image_url;

  return (
    <div 
      className="offering-card"
      style={{
        borderRadius: '20px',
        height: '100%',
        position: 'relative',
        overflow: 'hidden',
        border: '1px solid rgba(148, 163, 184, 0.25)',
        background: 'rgba(15, 23, 42, 0.75)',
        backdropFilter: 'blur(8px)',
        boxShadow: '0 16px 40px rgba(15, 23, 42, 0.45)',
        transition: 'transform 0.2s ease, box-shadow 0.2s ease',
        opacity: isOwned ? 0.85 : 1,
      }}
    >
      {/* Owned Badge */}
      {isOwned && (
        <div style={{
          position: 'absolute',
          top: '16px',
          right: '16px',
          background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
          color: '#fff',
          padding: '8px 16px',
          borderRadius: '20px',
          fontSize: '13px',
          fontWeight: '700',
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          zIndex: 10,
          boxShadow: '0 4px 12px rgba(16, 185, 129, 0.4)',
        }}>
          <CheckCircleFilled /> Owned
        </div>
      )}
      <div style={{
        position: 'relative',
        width: '100%',
        minHeight: '400px',
        backgroundImage: `url(${imgSrc})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        display: 'flex',
        flexDirection: 'column',
      }}>
        <div style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          height: '64%',
          background: 'linear-gradient(to top, rgba(2,6,23,0.92) 0%, rgba(2,6,23,0.1) 100%)',
          pointerEvents: 'none',
        }} />

        <div style={{
          marginTop: 'auto',
          padding: '24px',
          position: 'relative',
          zIndex: 1,
        }}>
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '12px',
          }}>
            <div>
              <div style={{ 
                fontSize: '32px', 
                fontWeight: '800', 
                color: '#fff',
                lineHeight: '1',
                textShadow: '0 2px 4px rgba(0,0,0,0.3)',
              }}>
                {formatCurrency(displayPrice)}
              </div>
              <div style={{ 
                fontSize: '13px', 
                color: 'rgba(255,255,255,0.8)', 
                marginTop: '4px',
              }}>
                per {offering.period || 'month'}
              </div>
            </div>
            <Button
              type="primary"
              size="large"
              onClick={() => onPurchase(offering)}
              disabled={isOwned}
              style={{ 
                height: '48px', 
                borderRadius: '12px',
                fontSize: '15px',
                fontWeight: '600',
                background: isOwned ? '#9ca3af' : '#fff',
                color: isOwned ? '#fff' : '#1e1b4b',
                border: 'none',
                boxShadow: isOwned ? 'none' : '0 4px 14px rgba(0, 0, 0, 0.2)',
                paddingLeft: '24px',
                paddingRight: '24px',
                cursor: isOwned ? 'not-allowed' : 'pointer',
              }}
            >
              {isOwned ? 'Already Owned' : 'Get Started'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

// Feature list sub-component
const FeatureList = ({ features, isPopular }) => (
  <div style={{ flex: 1, marginBottom: '24px' }}>
    {features.map((feature) => (
      <div 
        key={feature}
        style={{
          display: 'flex',
          alignItems: 'center',
          marginBottom: '12px',
          color: '#cbd5e1',
          fontSize: '14px',
        }}
      >
        <CheckCircleFilled style={{ 
          color: isPopular ? '#1890ff' : '#10b981',
          marginRight: '10px',
          fontSize: '16px',
        }} />
        <span>{feature}</span>
      </div>
    ))}
  </div>
);

// Popular badge component
const PopularBadge = () => (
  <div style={{
    background: 'linear-gradient(135deg, #2563eb 0%, #7c3aed 100%)',
    color: '#fff',
    textAlign: 'center',
    padding: '10px',
    fontSize: '12px',
    fontWeight: '700',
    letterSpacing: '1px',
    textTransform: 'uppercase',
  }}>
    <ThunderboltOutlined style={{ marginRight: '6px' }} />
    Most Popular
  </div>
);

// Card header with icon and title
const CardHeader = ({ name, description, isPopular }) => (
  <div style={{ textAlign: 'center', marginBottom: '24px' }}>
    <div style={{ 
      width: '56px',
      height: '56px',
      borderRadius: '14px',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: '24px', 
      color: '#93c5fd',
      background: 'rgba(30, 58, 138, 0.35)',
      marginBottom: '16px',
    }}>
      {getOfferingIcon(name)}
    </div>
    
    <h3 style={{ 
      fontSize: '22px', 
      fontWeight: '700', 
      margin: '0 0 6px 0',
      color: '#f8fafc'
    }}>
      {name}
    </h3>
    
    {description && (
      <p style={{ 
        color: '#94a3b8', 
        fontSize: '14px', 
        margin: 0,
        lineHeight: '1.5' 
      }}>
        {description}
      </p>
    )}
  </div>
);

// Price display component
const PriceDisplay = ({ price, period, formatCurrency }) => (
  <div style={{ textAlign: 'center', marginBottom: '28px' }}>
    <div style={{ 
      fontSize: '42px', 
      fontWeight: '800', 
      color: '#e2e8f0',
      lineHeight: '1',
      letterSpacing: '-1px',
    }}>
      {formatCurrency(price)}
    </div>
    <div style={{ 
      fontSize: '14px', 
      color: '#94a3b8', 
      marginTop: '6px',
      fontWeight: '500',
    }}>
      per {period || 'month'}
    </div>
  </div>
);

// Sub-component for default card without image
const DefaultCard = ({ offering, displayPrice, formatCurrency, parsedFeatures, onPurchase, isPopular, isOwned }) => {
  const imgSrc = offering.image_url || null;

  return (
    <div 
      className="offering-card"
      style={{
        background: isPopular
          ? 'linear-gradient(135deg, #1d4ed8 0%, #6d28d9 100%)'
          : 'rgba(15, 23, 42, 0.75)',
        borderRadius: '20px',
        padding: isPopular ? '3px' : '0',
        height: '100%',
        position: 'relative',
        border: '1px solid rgba(148, 163, 184, 0.25)',
        boxShadow: isPopular 
          ? '0 20px 44px rgba(59, 130, 246, 0.35)'
          : '0 10px 30px rgba(2, 6, 23, 0.5)',
        transition: 'transform 0.2s ease, box-shadow 0.2s ease',
        opacity: isOwned ? 0.9 : 1,
      }}
    >
      {/* Owned Badge */}
      {isOwned && (
        <div style={{
          position: 'absolute',
          top: '16px',
          right: '16px',
          background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
          color: '#fff',
          padding: '8px 16px',
          borderRadius: '20px',
          fontSize: '13px',
          fontWeight: '700',
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          zIndex: 10,
          boxShadow: '0 4px 12px rgba(16, 185, 129, 0.4)',
        }}>
          <CheckCircleFilled /> Owned
        </div>
      )}
      <div style={{
        background: '#0f172a',
        borderRadius: isPopular ? '18px' : '20px',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}>
        {isPopular && <PopularBadge />}

        <div style={{ padding: '32px 28px', flex: 1, display: 'flex', flexDirection: 'column' }}>
          {/* Show image inline when use_image_background is false */}
          {imgSrc && (
            <div style={{ 
              marginBottom: '20px',
              borderRadius: '12px',
              overflow: 'hidden',
              maxHeight: '180px',
            }}>
              <img 
                src={imgSrc}
                alt={offering.name}
                style={{
                  width: '100%',
                  height: 'auto',
                  objectFit: 'cover',
                  display: 'block',
                }}
              />
            </div>
          )}
          
          <CardHeader name={offering.name} description={offering.description} isPopular={isPopular} />
          <PriceDisplay price={displayPrice} period={offering.period} formatCurrency={formatCurrency} />
          <FeatureList features={parsedFeatures} isPopular={isPopular} />

          <Button
            type={isPopular ? 'primary' : 'default'}
            size="large"
            block
            onClick={() => onPurchase(offering)}
            disabled={isOwned}
            style={{ 
              height: '52px', 
              borderRadius: '12px',
              fontSize: '16px',
              fontWeight: '600',
              background: isOwned 
                ? '#9ca3af' 
                : isPopular 
                  ? '#1890ff' 
                  : undefined,
              color: isOwned ? '#fff' : isPopular ? '#fff' : '#e2e8f0',
              border: isOwned ? 'none' : isPopular ? 'none' : '1px solid rgba(148,163,184,0.35)',
              boxShadow: isOwned ? 'none' : isPopular ? '0 4px 14px rgba(24, 144, 255, 0.4)' : 'none',
              cursor: isOwned ? 'not-allowed' : 'pointer',
            }}
          >
            {isOwned ? 'Already Owned' : isPopular ? 'Get Started Now' : 'Choose Plan'}
          </Button>
        </div>
      </div>
    </div>
  );
};

// Main card component
const OfferingCard = ({ offering, onPurchase, formatCurrency, convertCurrency, displayCurrency, businessCurrency, isPopular, isOwned }) => {
  const price = offering.price || 0;
  const displayPrice = convertCurrency(price, businessCurrency, displayCurrency);
  const parsedFeatures = parseFeatures(offering.features);
  
  // Theme map focused on clean, modern, dark aesthetics
  const visualThemeMap = {
    gold: { border: 'border-amber-500/50', accent: 'text-amber-400', bghover: 'hover:border-amber-500', glow: 'shadow-amber-900/20' },
    orange: { border: 'border-orange-500/50', accent: 'text-orange-400', bghover: 'hover:border-orange-500', glow: 'shadow-orange-900/20' },
    red: { border: 'border-rose-500/50', accent: 'text-rose-400', bghover: 'hover:border-rose-500', glow: 'shadow-rose-900/20' },
    green: { border: 'border-emerald-500/50', accent: 'text-emerald-400', bghover: 'hover:border-emerald-500', glow: 'shadow-emerald-900/20' },
    cyan: { border: 'border-cyan-500/50', accent: 'text-cyan-400', bghover: 'hover:border-cyan-500', glow: 'shadow-cyan-900/20' },
    blue: { border: 'border-blue-500/50', accent: 'text-blue-400', bghover: 'hover:border-blue-500', glow: 'shadow-blue-900/20' },
    purple: { border: 'border-purple-500/50', accent: 'text-purple-400', bghover: 'hover:border-purple-500', glow: 'shadow-purple-900/20' },
    violet: { border: 'border-violet-500/50', accent: 'text-violet-400', bghover: 'hover:border-violet-500', glow: 'shadow-violet-900/20' }
  };
  
  const theme = visualThemeMap[String(offering.badge_color || '').toLowerCase()] || visualThemeMap.green;
  const hasImage = !!offering.image_url;
  const BackgroundIcon = getBackgroundIcon(offering.name).type;

  return (
    <div
      onClick={() => onPurchase(offering)}
      className={`group relative flex flex-col h-full bg-[#151725] rounded-[2rem] border border-white/5 overflow-hidden transition-all duration-300 hover:-translate-y-2 hover:shadow-2xl ${theme.bghover} ${isOwned ? 'opacity-80 grayscale' : ''}`}
    >
      {/* Popular Badge */}
      {(isPopular || offering.highlighted) && (
        <div className="absolute top-0 right-0 z-20 overflow-hidden rounded-tr-[2rem]">
          <div className="bg-white text-black text-[10px] font-black uppercase tracking-widest px-4 py-1.5 shadow-lg">
            Popular
          </div>
        </div>
      )}

      {/* Owned Badge */}
      {isOwned && (
        <div className="absolute top-0 left-0 z-20 overflow-hidden rounded-tl-[2rem]">
          <div className="bg-emerald-500 text-white text-[10px] font-black uppercase tracking-widest px-4 py-1.5 shadow-lg flex items-center gap-1">
            <CheckCircleFilled /> Owned
          </div>
        </div>
      )}

      {/* Card Header Area */}
      <div className="relative h-48 overflow-hidden bg-[#0b0c15]">
         {hasImage ? (
           <>
            <div 
              className="absolute inset-0 bg-cover bg-center transition-transform duration-700 group-hover:scale-110"
              style={{ backgroundImage: `url(${offering.image_url})` }}
            />
            <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[#151725]/50 to-[#151725]" />
           </>
         ) : (
           <>
            <div className={`absolute inset-0 opacity-10 flex items-center justify-center transition-transform duration-500 group-hover:scale-125 group-hover:rotate-12 ${theme.accent}`}>
                <BackgroundIcon style={{ fontSize: '180px' }} />
            </div>
            <div className="absolute inset-0 bg-gradient-to-b from-[#151725]/0 to-[#151725]" />
           </>
         )}
         
         {/* Price Tag Overlay */}
         <div className="absolute bottom-4 left-6 z-10">
            <p className="text-sm text-gray-400 font-medium mb-0 uppercase tracking-widest">{offering.period || 'month'}</p>
            <div className="flex items-baseline gap-1">
                <span className="text-3xl font-black text-white tracking-tight">{formatCurrency(displayPrice)}</span>
                <span className={`text-xs ${theme.accent} font-bold`}>Starting</span>
            </div>
         </div>
      </div>

      {/* Card Body */}
      <div className="flex-1 px-6 pb-6 flex flex-col">
        <div className="mb-6">
            <h3 className="text-2xl font-bold text-white mb-2 leading-tight group-hover:text-emerald-200 transition-colors">{offering.name}</h3>
            {offering.description && (
                <p className="text-sm text-gray-400 line-clamp-2 leading-relaxed">{offering.description}</p>
            )}
        </div>

        <div className="space-y-3 mb-8 flex-1">
            {parsedFeatures.slice(0, 4).map((feature, idx) => (
                <div key={idx} className="flex items-start gap-3">
                    <div className={`mt-1 w-4 h-4 rounded-full bg-white/5 flex items-center justify-center ${theme.accent}`}>
                        <CheckOutlined style={{ fontSize: '10px' }} />
                    </div>
                    <span className="text-sm text-gray-300 font-medium">{feature}</span>
                </div>
            ))}
        </div>

        <button className={`w-full py-4 rounded-xl font-bold text-sm uppercase tracking-wider flex items-center justify-center gap-2 transition-all duration-300 ${isOwned ? 'bg-[#1a1d2e] text-gray-500 cursor-not-allowed' : 'bg-white text-black hover:bg-gray-200'}`}>
            {isOwned ? 'Active Plan' : (
                <>
                    <span>Select Plan</span>
                    <span className="opacity-0 -ml-2 group-hover:opacity-100 group-hover:ml-0 transition-all duration-300">→</span>
                </>
            )}
        </button>
      </div>
    </div>
  );
};

const MemberOfferings = () => {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { openAuthModal } = useAuthModal();
  const { formatCurrency, convertCurrency, displayCurrency, businessCurrency } = useCurrency();
  const [purchaseModal, setPurchaseModal] = useState({ visible: false, offering: null });
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [customerSearch, setCustomerSearch] = useState('');

  // Check if user is a guest (not logged in)
  const isGuest = !user;
  
  // Determine if user is staff (can assign memberships to others)
  const userRole = user?.role?.toLowerCase() || '';
  const customerRoles = ['student', 'outsider', 'trusted_customer'];
  const isStaff = !isGuest && !customerRoles.includes(userRole) && userRole !== '';

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Fetch customers for staff to assign memberships
  const { data: customers = [] } = useQuery({
    queryKey: ['customers-for-membership'],
    queryFn: async () => {
      const { data } = await apiClient.get('/users');
      // Filter to only customers
      return (data || []).filter(u => 
        customerRoles.includes(u.role?.toLowerCase()) || 
        (!u.role && !u.is_admin && !u.is_staff)
      );
    },
    enabled: isStaff,
  });

  // Filter customers by search
  const filteredCustomers = customers.filter(c => {
    if (!customerSearch) return true;
    const search = customerSearch.toLowerCase();
    const fullName = `${c.first_name || ''} ${c.last_name || ''}`.toLowerCase();
    return fullName.includes(search) || c.email?.toLowerCase().includes(search);
  });

  const { data: offerings = [], isLoading, error } = useQuery({
    queryKey: ['member-offerings'],
    queryFn: fetchMemberOfferings,
  });

  // Fetch user's purchases to determine owned offerings (only if authenticated)
  const { data: myPurchases = [] } = useQuery({
    queryKey: ['my-member-purchases'],
    queryFn: fetchMyPurchases,
    enabled: !!user, // Only fetch if user is logged in
  });

  // Create a set of owned offering IDs (active purchases only)
  const ownedOfferingIds = new Set(
    myPurchases
      .filter(p => p.status === 'active' && (!p.expires_at || new Date(p.expires_at) > new Date()))
      .map(p => p.offering_id)
  );

  // Mutation for self-purchase (customers)
  const purchaseMutation = useMutation({
    mutationFn: purchaseMembership,
    onSuccess: () => {
      message.success('🎉 Membership activated! Welcome aboard.');
      setPurchaseModal({ visible: false, offering: null });
      queryClient.invalidateQueries(['member-offerings']);
      queryClient.invalidateQueries(['my-member-purchases']);
    },
    onError: (err) => {
      message.error(err.response?.data?.error || err.response?.data?.message || 'Purchase failed. Please try again.');
    },
  });

  // Mutation for staff assigning membership to customer
  const assignMutation = useMutation({
    mutationFn: async ({ userId, offeringId, paymentMethod }) => {
      const { data } = await apiClient.post('/member-offerings/admin/purchases', {
        userId,
        offeringId,
        paymentMethod
      });
      return data;
    },
    onSuccess: () => {
      const customer = customers.find(c => c.id === selectedCustomer);
      const customerName = customer ? `${customer.first_name} ${customer.last_name}` : 'customer';
      message.success(`🎉 Membership assigned to ${customerName}!`);
      setPurchaseModal({ visible: false, offering: null });
      setSelectedCustomer(null);
      queryClient.invalidateQueries(['member-offerings']);
      queryClient.invalidateQueries(['admin-member-purchases']);
    },
    onError: (err) => {
      message.error(err.response?.data?.error || err.response?.data?.message || 'Assignment failed. Please try again.');
    },
  });

  const handlePurchase = (offering) => {
    // If guest, prompt them to sign up/login
    if (isGuest) {
      message.info('Please sign in or create an account to purchase a membership.');
      openAuthModal('signup');
      return;
    }
    // For staff, require a customer to be selected first
    if (isStaff && !selectedCustomer) {
      message.warning('Please select a customer first to assign this membership.');
      return;
    }
    setPurchaseModal({ visible: true, offering });
  };

  const confirmPurchase = (paymentMethod) => {
    if (!purchaseModal.offering) return;
    
    if (isStaff && selectedCustomer) {
      // Staff assigning to customer
      assignMutation.mutate({
        userId: selectedCustomer,
        offeringId: purchaseModal.offering.id,
        paymentMethod: paymentMethod,
      });
    } else {
      // Customer self-purchase
      purchaseMutation.mutate({
        offeringId: purchaseModal.offering.id,
        paymentMethod: paymentMethod,
      });
    }
  };

  const getIsPopular = (offering) => {
    const n = offering.name?.toLowerCase() || '';
    return n.includes('vip') || n.includes('beach');
  };

  // Get selected customer name for display
  const selectedCustomerData = customers.find(c => c.id === selectedCustomer);
  const selectedCustomerName = selectedCustomerData 
    ? `${selectedCustomerData.first_name} ${selectedCustomerData.last_name}`
    : null;

  return (
    <div className="bg-[#10140f] min-h-screen text-white font-sans selection:bg-lime-400/30">
      
      {/* 1. Hero Section with Background Image & Glass Overlay */}
      <div className="relative w-full h-[50vh] min-h-[400px] flex items-center justify-center overflow-hidden">
        {/* Background Image Parallax-ish */}
        <div 
          className="absolute inset-0 z-0 bg-cover bg-center"
          style={{ 
            backgroundImage: 'url(/Images/ukc/kite-foil-header.jpg)', 
            filter: 'brightness(0.4) saturate(1.2)'
          }}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#0b0c15] via-[#0b0c15]/50 to-transparent z-0" />

        <div className="relative z-10 text-center px-4 max-w-4xl mx-auto mt-12">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-white/20 bg-white/5 backdrop-blur-md text-xs font-bold tracking-widest uppercase text-white/80 mb-6">
                <CrownOutlined /> Official Membership
            </div>
            <h1 className="text-5xl md:text-7xl font-black text-transparent bg-clip-text bg-gradient-to-br from-white via-lime-200 to-emerald-300 mb-6 drop-shadow-2xl">
                Choose Your Legacy
            </h1>
            <p className="text-lg md:text-xl text-gray-300 max-w-2xl mx-auto leading-relaxed font-light">
                Unlock exclusive access to premium gear, priority booking, and a community of elite riders. Your journey to mastery starts here.
            </p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-32">
        {/* Staff Tools Section */}
        {isStaff && (
            <div className="mb-12 bg-[#18201a] border border-lime-400/20 rounded-3xl p-6 md:p-8 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-64 h-64 bg-lime-400/8 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none" />
                <h3 className="text-lg font-bold text-white flex items-center gap-2 mb-6">
                    <UserOutlined /> Staff Controls
                </h3>
                <div className="flex flex-col md:flex-row gap-6">
                    <div className="flex-1">
                  <label className="block text-xs font-bold text-lime-300 uppercase tracking-wider mb-2">Assign Membership To</label>
                        <Select
                            showSearch
                            placeholder="Search customer by name or email..."
                            value={selectedCustomer}
                            onChange={setSelectedCustomer}
                            className="w-full custom-select-dark"
                            size="large"
                            allowClear
                            filterOption={false}
                            onSearch={setCustomerSearch}
                            notFoundContent={customers.length === 0 ? <div className="p-4 text-center text-gray-500">No customers found</div> : null}
                            suffixIcon={<SearchOutlined className="text-white/50" />}
                            style={{ width: '100%', height: '50px' }}
                            dropdownStyle={{ backgroundColor: '#18201a', border: '1px solid #65a30d' }}
                        >
                            {filteredCustomers.map((customer) => (
                            <Select.Option key={customer.id} value={customer.id}>
                                <div className="flex items-center gap-3 py-1">
                                    <div className="w-8 h-8 rounded-full bg-lime-400/20 flex items-center justify-center text-lime-300 font-bold border border-lime-400/30">
                                        {(customer.first_name?.[0] || 'U').toUpperCase()}
                                    </div>
                                    <div className="flex flex-col">
                                        <span className="text-white font-medium">{customer.first_name} {customer.last_name}</span>
                                        <span className="text-xs text-gray-500">{customer.email}</span>
                                    </div>
                                </div>
                            </Select.Option>
                            ))}
                        </Select>
                    </div>
                    {selectedCustomerName && (
                        <div className="flex items-center justify-center px-8 py-4 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-full bg-emerald-500 text-white flex items-center justify-center shadow-lg shadow-emerald-500/20">
                                    <CheckOutlined />
                                </div>
                                <div>
                                    <p className="text-xs text-emerald-400 font-bold uppercase tracking-wider">Active Selection</p>
                                    <p className="text-white font-bold">{selectedCustomerName}</p>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        )}

      {/* Filters or Section Title */}
      <div className="flex items-center justify-between mb-10">
        <h2 className="text-3xl font-bold text-white flex items-center gap-3">
            Available Plans <span className="text-sm font-normal text-gray-500 bg-white/5 px-3 py-1 rounded-full border border-white/5">{offerings.length}</span>
        </h2>
        {/* Could add filters here later */}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-40">
            <div className="relative">
                <div className="w-16 h-16 border-4 border-lime-400/30 border-t-lime-400 rounded-full animate-spin" />
                <div className="absolute inset-0 flex items-center justify-center text-lime-400 text-xs font-bold">UKC</div>
            </div>
        </div>
      ) : error ? (
        <Alert 
          message="System Error" 
          description={error.message}
          type="error" 
          showIcon 
          className="bg-red-500/10 border-red-500/20 text-red-200 rounded-2xl max-w-xl mx-auto"
        />
      ) : offerings.length === 0 ? (
        <div className="text-center py-40 bg-[#151725] rounded-3xl border border-dashed border-gray-700">
          <StarOutlined style={{ fontSize: '48px', color: '#374151', marginBottom: '24px' }} />
          <p className="text-gray-400 text-lg">No membership plans available at the moment.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
          {offerings.map((offering) => (
            <OfferingCard
              key={offering.id}
              offering={offering}
              onPurchase={handlePurchase}
              formatCurrency={formatCurrency}
              convertCurrency={convertCurrency}
              displayCurrency={displayCurrency}
              businessCurrency={businessCurrency}
              isPopular={getIsPopular(offering)}
              isOwned={ownedOfferingIds.has(offering.id)}
            />
          ))}
        </div>
      )}
      </div>

      <Modal
        open={purchaseModal.visible}
        onCancel={() => setPurchaseModal({ visible: false, offering: null })}
        footer={null}
        width={420}
        centered
        title={null}
        className="custom-modal"
        styles={{
          content: { 
            borderRadius: '24px', 
            overflow: 'hidden', 
            padding: 0, 
            backgroundColor: '#1a1d2e', 
            border: '1px solid rgba(255,255,255,0.1)' 
          },
        }}
        closeIcon={<div className="text-white bg-white/10 rounded-full w-8 h-8 flex items-center justify-center hover:bg-white/20">×</div>}
      >
        {purchaseModal.offering && (
          <div>
            <div className="relative h-40 bg-indigo-900 overflow-hidden">
                {purchaseModal.offering.image_url ? (
                    <div 
                        className="absolute inset-0 bg-cover bg-center" 
                        style={{ backgroundImage: `url(${purchaseModal.offering.image_url})` }}
                    />
                ) : (
                    <div className="absolute inset-0 bg-gradient-to-br from-indigo-600 to-purple-700" />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-[#1a1d2e] to-transparent" />
                <div className="absolute bottom-6 left-6 right-6 text-center">
                    <h3 className="text-2xl font-bold text-white mb-1 shadow-black drop-shadow-md">
                        {purchaseModal.offering.name}
                    </h3>
                </div>
            </div>

            <div className="p-8 pt-4">
              <p className="text-gray-400 text-center text-sm mb-8">
                {isStaff && selectedCustomerName 
                  ? <span>Assigning to <strong className="text-white">{selectedCustomerName}</strong></span>
                  : 'Complete your secure purchase below.'
                }
              </p>

              <div className="space-y-4">
                <button
                  onClick={() => confirmPurchase('wallet')}
                  className="w-full group relative flex items-center justify-between p-4 bg-gradient-to-r from-indigo-600 to-purple-600 rounded-xl hover:shadow-lg hover:shadow-indigo-500/25 transition-all duration-300"
                >
                    <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-lg bg-white/20 flex items-center justify-center text-white text-xl">
                            <WalletOutlined />
                        </div>
                        <div className="text-left">
                            <div className="text-white font-bold">Use Wallet Balance</div>
                            <div className="text-indigo-200 text-xs">Fast & Secure</div>
                        </div>
                    </div>
                    <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-opacity">
                        →
                    </div>
                </button>

                <button
                  onClick={() => confirmPurchase('cash')}
                  className="w-full group flex items-center justify-between p-4 bg-[#25283d] border border-white/5 rounded-xl hover:bg-[#2a2e45] hover:border-white/10 transition-all duration-300"
                >
                    <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-lg bg-[#151725] flex items-center justify-center text-gray-400 text-xl group-hover:text-white transition-colors">
                            <ShopOutlined />
                        </div>
                        <div className="text-left">
                            <div className="text-gray-200 font-bold">{isStaff ? 'Cash Payment' : 'Pay at Reception'}</div>
                            <div className="text-gray-500 text-xs">In-person payment</div>
                        </div>
                    </div>
                </button>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default MemberOfferings;
