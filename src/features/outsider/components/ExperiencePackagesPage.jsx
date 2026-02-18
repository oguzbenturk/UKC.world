import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { App, Button, Tag } from 'antd';
import { RocketOutlined, CalendarOutlined } from '@ant-design/icons';
import ExperienceDetailModal from './ExperienceDetailModal';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/shared/hooks/useAuth';
import { useAuthModal } from '@/shared/contexts/AuthModalContext';
import { usePageSEO } from '@/shared/utils/seo';
import { useCurrency } from '@/shared/contexts/CurrencyContext';
import { useWalletSummary } from '@/shared/hooks/useWalletSummary';
import apiClient from '@/shared/services/apiClient';
import PackagePurchaseModal from './PackagePurchaseModal';

const normalize = (v) => String(v || '').toLowerCase();

const EXPERIENCE_TYPE_LABELS = {
  all_inclusive: 'All Inclusive',
  lesson_rental: 'Lessons + Rental',
  accommodation_lesson: 'Lessons + Stay',
  accommodation_rental: 'Rental + Stay',
  downwinders: 'Downwinders',
  camps: 'Camps',
  lesson: 'Lessons',
  rental: 'Rental',
  accommodation: 'Stay'
};

const isExperienceBundle = (pkg) => {
  const packageType = normalize(pkg.packageType);
  
  // Event packages are always experience bundles
  if (['downwinders', 'camps'].includes(packageType)) return true;
  
  // Experience packages MUST include accommodation
  const includesAccommodation = !!pkg.includesAccommodation;
  
  // Accommodation-based package types
  if (['accommodation', 'accommodation_lesson', 'accommodation_rental', 'all_inclusive'].includes(packageType)) {
    return true;
  }
  
  // Any package that explicitly includes accommodation
  if (includesAccommodation) return true;
  
  return false;
};

const matchesDiscipline = (pkg, disciplineKey) => {
  if (!disciplineKey) return true;

  const packageType = normalize(pkg.packageType);
  
  // If filtering by camps or downwinders, only show those specific package types
  if (disciplineKey === 'camps') {
    return packageType === 'camps';
  }
  if (disciplineKey === 'downwinders') {
    return packageType === 'downwinders';
  }

  // For regular disciplines (kite, wing, etc.), exclude event packages
  if (packageType === 'camps' || packageType === 'downwinders') {
    return false;
  }

  const text = [
    pkg.name,
    pkg.description,
    pkg.disciplineTag,
    pkg.lessonCategoryTag,
    pkg.lessonServiceName,
    pkg.packageType,
    pkg.levelTag
  ].map(normalize).join(' ');

  if (disciplineKey === 'kite') {
    const hasKite = text.includes('kite');
    const hasWing = text.includes('wing');
    const hasEFoil = text.includes('efoil') || text.includes('e-foil') || text.includes('electric');
    return hasKite && !hasWing && !hasEFoil;
  }
  if (disciplineKey === 'wing') return text.includes('wing');

  return text.includes(normalize(disciplineKey));
};

const getBundleType = (pkg) => {
  const packageType = normalize(pkg.packageType);
  
  // If it's explicitly downwinders or camps, return that
  if (packageType === 'downwinders') return 'downwinders';
  if (packageType === 'camps') return 'camps';
  
  const includesLessons = pkg.includesLessons !== false;
  const includesRental = !!pkg.includesRental;
  const includesAccommodation = !!pkg.includesAccommodation;

  if (includesLessons && includesRental && includesAccommodation) return 'all_inclusive';
  if (includesLessons && includesRental) return 'lesson_rental';
  if (includesLessons && includesAccommodation) return 'accommodation_lesson';
  if (includesRental && includesAccommodation) return 'accommodation_rental';
  return packageType || 'lesson';
};

const getSectionOrder = (sectionKey) => {
  const order = {
    all_inclusive: 0,
    accommodation_lesson: 1,
    lesson_rental: 2,
    accommodation_rental: 3,
    downwinders: 4,
    camps: 5,
    lesson: 6,
    rental: 7,
    accommodation: 8
  };
  return order[sectionKey] ?? 99;
};

const getPriceForUserCurrency = (pkg, userCurrency, convertCurrency, formatCurrency) => {
  const priceRows = Array.isArray(pkg.prices) ? pkg.prices : [];
  const directPrice = priceRows.find((p) => normalize(p.currencyCode || p.currency_code) === normalize(userCurrency));
  if (directPrice?.price != null) {
    return formatCurrency(Number(directPrice.price), userCurrency);
  }

  const basePrice = Number(pkg.price) || 0;
  const baseCurrency = pkg.currency || 'EUR';
  if (baseCurrency === userCurrency) return formatCurrency(basePrice, userCurrency);
  const converted = convertCurrency(basePrice, baseCurrency, userCurrency);
  return formatCurrency(converted, userCurrency);
};

const getFallbackImageByDiscipline = (disciplineKey) => {
  if (disciplineKey === 'wing') return '/Images/ukc/wing-header.png';
  if (disciplineKey === 'downwinders') return '/Images/ukc/rebel-dlab-header.jpg';
  if (disciplineKey === 'camps') return '/Images/ukc/team.png';
  return '/Images/ukc/kite-header.jpg.png';
};

const getImageUrl = (imageUrl) => {
  if (!imageUrl) return null;
  if (imageUrl.startsWith('http')) return imageUrl;
  return imageUrl;
};

const toImageArray = (value) => {
  if (!value) return [];
  if (Array.isArray(value)) return value.filter(Boolean);
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed.filter(Boolean);
      if (parsed) return [parsed];
      return [];
    } catch {
      return value.trim() ? [value.trim()] : [];
    }
  }
  return [];
};

const buildSuccessMessage = (data, formatCurrency) => {
  let description = `You have successfully purchased "${data.customerPackage.packageName}".`;

  if (data.voucher) {
    description += ` Promo code "${data.voucher.code}" saved you ${data.voucher.discountApplied.toFixed(2)}.`;
    if (data.voucher.walletCreditApplied) {
      description += ` Plus ${data.voucher.walletCreditApplied.toFixed(2)} ${data.voucher.walletCurrency} was added to your wallet.`;
    }
  }

  if (data.accommodationBooking) {
    description += ` Accommodation confirmed at ${data.accommodationBooking.unitName} for ${data.accommodationBooking.nights} night(s).`;
  }

  if (data.wallet) {
    description += ` New wallet balance: ${formatCurrency(data.wallet.newBalance, data.wallet.currency)}.`;
  } else if (data.externalPayment) {
    description += ` Payment via ${data.externalPayment.processor} recorded.`;
  } else if (data.paymentMethod === 'pay_later') {
    description += ' Payment is pending.';
  }

  if (data.roleUpgrade?.upgraded) {
    description += ' 🎉 Your account has been upgraded to Student.';
  }

  return description;
};

// eslint-disable-next-line complexity
const ExperiencePackagesPage = ({
  seoTitle,
  seoDescription,
  headline,
  accentWord,
  subheadline,
  disciplineKey,
  emptyTitle,
  emptyDescription
}) => {
  const navigate = useNavigate();
  const { notification } = App.useApp();
  const queryClient = useQueryClient();
  const { isAuthenticated, isGuest, refreshToken } = useAuth();
  const { openAuthModal } = useAuthModal();
  const { userCurrency, formatCurrency, convertCurrency, businessCurrency } = useCurrency();

  const storageCurrency = businessCurrency || 'EUR';
  const { data: walletSummary, refetch: refetchWallet } = useWalletSummary({ currency: storageCurrency });

  const [loading, setLoading] = useState(true);
  const [packages, setPackages] = useState([]);
  const [selectedPackage, setSelectedPackage] = useState(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [purchaseModalOpen, setPurchaseModalOpen] = useState(false);

  usePageSEO({
    title: seoTitle,
    description: seoDescription
  });

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        setLoading(true);
        const response = await apiClient.get('/services/packages/public');
        const rows = Array.isArray(response.data) ? response.data : [];

        const filtered = rows.filter((pkg) => isExperienceBundle(pkg) && matchesDiscipline(pkg, disciplineKey));
        if (!cancelled) setPackages(filtered);
      } catch {
        if (!cancelled) setPackages([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [disciplineKey]);

  const sortedPackages = useMemo(() => {
    return packages
      .map((pkg) => ({
        ...pkg,
        bundleType: getBundleType(pkg)
      }))
      .sort((a, b) => {
        const byType = getSectionOrder(a.bundleType) - getSectionOrder(b.bundleType);
        if (byType !== 0) return byType;
        return (Number(a.price) || 0) - (Number(b.price) || 0);
      });
  }, [packages]);

  const visibleBundleTypes = useMemo(() => {
    return Array.from(new Set(sortedPackages.map((pkg) => pkg.bundleType))).sort(
      (a, b) => getSectionOrder(a) - getSectionOrder(b)
    );
  }, [sortedPackages]);

  const purchaseMutation = useMutation({
    mutationFn: async (purchaseData) => {
      const response = await apiClient.post('/services/packages/purchase', purchaseData);
      return response.data;
    },
    onSuccess: async (data) => {
      const roleUpgraded = data.roleUpgrade?.upgraded;
      if (roleUpgraded) {
        await refreshToken();
      }

      notification.success({
        message: 'Package Purchased!',
        description: buildSuccessMessage(data, formatCurrency),
        duration: roleUpgraded ? 8 : 5,
      });

      refetchWallet();
      queryClient.invalidateQueries({ queryKey: ['wallet'] });
      queryClient.invalidateQueries({ queryKey: ['customer-packages'] });

      setPurchaseModalOpen(false);
      setDetailOpen(false);
      setSelectedPackage(null);
    },
    onError: (error) => {
      notification.error({
        message: 'Purchase Failed',
        description: error.response?.data?.error || 'Failed to purchase package. Please try again.',
      });
    },
  });

  const openPackageDetail = (pkg) => {
    setSelectedPackage(pkg);
    setDetailOpen(true);
  };

  const requireAuthForPurchase = () => {
    if (isGuest || !isAuthenticated) {
      setDetailOpen(false);
      setTimeout(() => {
        openAuthModal({
          title: 'Sign In Required',
          message: 'Create an account or sign in to purchase this package.',
          returnUrl: window.location.pathname,
          mode: 'register'
        });
      }, 300);
      return false;
    }
    return true;
  };

  const handleOpenPurchaseModal = (pkg = selectedPackage) => {
    if (!pkg) return;
    if (!requireAuthForPurchase()) return;
    setSelectedPackage(pkg);
    setDetailOpen(false);
    // Add delay to ensure detail modal animation completes before purchase modal opens
    setTimeout(() => {
      setPurchaseModalOpen(true);
    }, 300);
  };

  return (
    <div className="min-h-screen text-white font-sans relative overflow-x-hidden bg-[#17140b] selection:bg-yellow-400/30">
      <div className="fixed inset-0 w-full h-full overflow-hidden pointer-events-none z-0">
        <div className="absolute top-[-12%] right-[-8%] w-[920px] h-[920px] bg-yellow-300/18 rounded-full blur-[155px]" />
        <div className="absolute top-[22%] left-[-10%] w-[760px] h-[760px] bg-amber-400/16 rounded-full blur-[135px]" />
        <div className="absolute bottom-[-10%] right-[20%] w-[700px] h-[700px] bg-yellow-500/12 rounded-full blur-[120px]" />
      </div>

      <div className="relative z-10 py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <Tag className="mb-2 !px-4 !py-1 !rounded-full !font-bold uppercase tracking-wider !bg-yellow-500/10 !border-yellow-500/30 !text-yellow-400">
            UKC.Experience
          </Tag>
          <h1 className="text-4xl md:text-5xl font-extrabold text-white mb-2 tracking-tight">
            {headline} <span className="text-transparent bg-clip-text bg-gradient-to-r from-yellow-300 to-amber-400">{accentWord}</span>
          </h1>
          <p className="text-lg text-gray-300 max-w-2xl mx-auto leading-relaxed">
            {subheadline}
          </p>

          <div className="mt-6 flex items-center justify-center gap-3 flex-wrap">
            <Button
              type="primary"
              icon={<RocketOutlined />}
              className="!bg-yellow-500 !border-yellow-500 hover:!bg-yellow-400 !text-black !font-bold !rounded-xl"
              onClick={() => {
                if (!requireAuthForPurchase()) return;
                navigate('/experience/book-package');
              }}
            >
              Buy Package
            </Button>
            <Button
              icon={<CalendarOutlined />}
              className="!rounded-xl"
              onClick={() => navigate('/academy')}
            >
              Explore Lessons
            </Button>
          </div>
        </div>
      </div>

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-24">
        {loading ? (
          <div className="rounded-3xl border border-white/10 bg-[#1a1d26] p-10 text-center text-gray-300">
            Loading packages...
          </div>
        ) : sortedPackages.length === 0 ? (
          <div className="rounded-3xl border border-white/10 bg-[#1a1d26] p-10 text-center">
            <h3 className="text-xl font-bold text-white mb-2">{emptyTitle || 'No packages configured yet'}</h3>
            <p className="text-gray-400 max-w-2xl mx-auto">
              {emptyDescription || 'No bundle packages are configured for this category yet.'}
            </p>
          </div>
        ) : (
          <div>
            <div className="mb-6 flex flex-wrap items-center gap-2">
              <Tag className="!bg-white/10 !border-white/20 !text-white !px-3 !py-1 !rounded-full">{sortedPackages.length} Packages</Tag>
              {visibleBundleTypes.map((bundleType) => (
                <Tag
                  key={bundleType}
                  className="!bg-yellow-500/10 !border-yellow-500/30 !text-yellow-300 !px-3 !py-1 !rounded-full"
                >
                  {EXPERIENCE_TYPE_LABELS[bundleType] || 'Experience'}
                </Tag>
              ))}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-5">
              {sortedPackages.map((pkg) => (
                <div
                  key={pkg.id}
                  onClick={() => openPackageDetail(pkg)}
                  className="group relative isolate overflow-hidden [clip-path:inset(0_round_1.25rem)] bg-gradient-to-b from-[#1f2230] to-[#171925] rounded-2xl border border-white/10 transition-[transform,box-shadow,border-color] duration-300 hover:-translate-y-1 hover:shadow-2xl hover:border-yellow-400/40 cursor-pointer"
                >
                  {/* Package Image */}
                  <div className="relative h-48 overflow-hidden">
                    <img
                      src={getImageUrl(pkg.imageUrl) || getFallbackImageByDiscipline(disciplineKey)}
                      alt={pkg.name}
                      className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-[#1f2230] via-[#1f2230]/50 to-transparent" />
                    <Tag className="absolute top-3 left-3 !bg-yellow-500/10 !border-yellow-500/30 !text-yellow-300 !rounded-full backdrop-blur-sm">
                      {EXPERIENCE_TYPE_LABELS[pkg.bundleType] || 'Experience'}
                    </Tag>
                  </div>

                  <div className="p-5 flex flex-col">
                    <div className="mb-4">
                      <h3 className="text-lg font-bold text-white mb-1 group-hover:text-yellow-300 transition-colors line-clamp-2">{pkg.name}</h3>
                      <p className="text-sm text-gray-400 line-clamp-2">{pkg.description || 'Complete experience bundle package.'}</p>
                    </div>

                    <div className="flex flex-wrap gap-2 mb-4">
                      {(pkg.includesLessons !== false) && <Tag className="!bg-emerald-500/10 !border-emerald-500/30 !text-emerald-300">Lesson</Tag>}
                      {!!pkg.includesRental && <Tag className="!bg-orange-500/10 !border-orange-500/30 !text-orange-300">Rental</Tag>}
                      {!!pkg.includesAccommodation && <Tag className="!bg-blue-500/10 !border-blue-500/30 !text-blue-300">Stay</Tag>}
                      {!!pkg.totalHours && <Tag className="!bg-white/5 !border-white/15 !text-gray-200">{Math.round(Number(pkg.totalHours))}h</Tag>}
                      {!!pkg.accommodationNights && <Tag className="!bg-white/5 !border-white/15 !text-gray-200">{pkg.accommodationNights} nights</Tag>}
                      {!!pkg.rentalDays && <Tag className="!bg-white/5 !border-white/15 !text-gray-200">{pkg.rentalDays} rental days</Tag>}
                    </div>

                    <div className="flex items-end justify-between border-t border-white/10 pt-4">
                      <div>
                        <p className="text-xs text-gray-500 mb-1">Starting from</p>
                        <p className="text-xl font-bold text-white">
                          {getPriceForUserCurrency(pkg, userCurrency, convertCurrency, formatCurrency)}
                        </p>
                      </div>
                      <Button
                        type="primary"
                        size="small"
                        className="!bg-yellow-500 !border-yellow-500 hover:!bg-yellow-400 !text-black !font-semibold"
                        onClick={(event) => {
                          event.stopPropagation();
                          handleOpenPurchaseModal(pkg);
                        }}
                      >
                        Buy
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <ExperienceDetailModal
        pkg={selectedPackage}
        visible={detailOpen}
        onClose={() => setDetailOpen(false)}
        onBuy={handleOpenPurchaseModal}
        disciplineKey={disciplineKey}
      />

      <PackagePurchaseModal
        open={purchaseModalOpen}
        onCancel={() => setPurchaseModalOpen(false)}
        selectedPackage={selectedPackage}
        walletBalance={walletSummary?.available || 0}
        onPurchase={(purchaseData) => purchaseMutation.mutate(purchaseData)}
        isPurchasing={purchaseMutation.isPending}
        destroyOnHidden
      />
    </div>
  );
};

export default ExperiencePackagesPage;
