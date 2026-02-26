import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { App, Button, Tag } from 'antd';
import { RocketOutlined, CalendarOutlined, CheckCircleOutlined } from '@ant-design/icons';
import ExperienceDetailModal from './ExperienceDetailModal';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/shared/hooks/useAuth';
import { useAuthModal } from '@/shared/contexts/AuthModalContext';
import { usePageSEO } from '@/shared/utils/seo';
import { useCurrency } from '@/shared/contexts/CurrencyContext';
import { useWalletSummary } from '@/shared/hooks/useWalletSummary';
import apiClient from '@/shared/services/apiClient';
import PackagePurchaseModal from './PackagePurchaseModal';
import AllInclusiveBookingModal from './AllInclusiveBookingModal';
import DownwinderBookingModal from './DownwinderBookingModal';

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
  const { isAuthenticated, isGuest, refreshToken, user } = useAuth();
  const { openAuthModal } = useAuthModal();
  const { userCurrency, formatCurrency, convertCurrency, businessCurrency } = useCurrency();

  const storageCurrency = businessCurrency || 'EUR';
  const { data: walletSummary, refetch: refetchWallet } = useWalletSummary({ currency: storageCurrency });

  const [loading, setLoading] = useState(true);
  const [packages, setPackages] = useState([]);
  const [selectedPackage, setSelectedPackage] = useState(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [purchaseModalOpen, setPurchaseModalOpen] = useState(false);
  const [allInclusiveModalOpen, setAllInclusiveModalOpen] = useState(false);
  const [downwinderModalOpen, setDownwinderModalOpen] = useState(false);

  // ── Fetch user's owned customer packages ──────────────────────────────────
  const { data: ownedPackages = [] } = useQuery({
    queryKey: ['customer-packages', user?.id],
    queryFn: async () => {
      const res = await apiClient.get(`/services/customer-packages/${user.id}`);
      return Array.isArray(res.data) ? res.data : [];
    },
    enabled: !!user?.id,
    staleTime: 120_000,
  });

  // Build a map: service_package_id → owned customer package (active + has remaining)
  const ownedByPackageId = useMemo(() => {
    const map = new Map();
    for (const cp of ownedPackages) {
      const isActive = (cp.status || '').toLowerCase() === 'active';
      if (!isActive) continue;
      const spId = String(cp.servicePackageId || cp.service_package_id);
      const remaining = parseFloat(cp.remainingHours ?? cp.remaining_hours) || 0;
      const existingRemaining = map.has(spId) ? (parseFloat(map.get(spId).remainingHours ?? map.get(spId).remaining_hours) || 0) : -1;
      if (remaining > existingRemaining) map.set(spId, cp);
    }
    return map;
  }, [ownedPackages]);

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
      setAllInclusiveModalOpen(false);
      setDownwinderModalOpen(false);
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
    // Event packages (downwinders/camps) skip the detail modal and go straight to booking
    if (isEventPackage(pkg)) {
      if (!requireAuthForPurchase()) return;
      setSelectedPackage(pkg);
      setDownwinderModalOpen(true);
      return;
    }
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

  // Determine if a package needs the detailed multi-step modal
  const isMultiStepPackage = (pkg) => {
    const pType = (pkg?.packageType || pkg?.package_type || '').toLowerCase();
    return ['all_inclusive', 'accommodation_lesson', 'accommodation_rental'].includes(pType);
  };

  // Determine if package is an event type (downwinder / camp)
  const isEventPackage = (pkg) => {
    const pType = (pkg?.packageType || pkg?.package_type || '').toLowerCase();
    return ['downwinders', 'camps'].includes(pType);
  };

  const handleOpenPurchaseModal = (pkg = selectedPackage) => {
    if (!pkg) return;
    if (!requireAuthForPurchase()) return;
    setSelectedPackage(pkg);
    setDetailOpen(false);
    // Add delay to ensure detail modal animation completes before purchase modal opens
    setTimeout(() => {
      if (isEventPackage(pkg)) {
        setDownwinderModalOpen(true);
      } else if (isMultiStepPackage(pkg)) {
        setAllInclusiveModalOpen(true);
      } else {
        setPurchaseModalOpen(true);
      }
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
              {sortedPackages.map((pkg) => {
                const ownedPkg = ownedByPackageId.get(String(pkg.id));
                const ownedRemaining = ownedPkg ? (parseFloat(ownedPkg.remainingHours ?? ownedPkg.remaining_hours) || 0) : 0;
                const ownedRentalDays = ownedPkg ? (parseFloat(ownedPkg.remainingRentalDays ?? ownedPkg.remaining_rental_days) || 0) : 0;
                const ownedNights = ownedPkg ? (parseFloat(ownedPkg.remainingAccommodationNights ?? ownedPkg.remaining_accommodation_nights) || 0) : 0;
                return (
                <div
                  key={pkg.id}
                  onClick={() => openPackageDetail(pkg)}
                  className={`group relative isolate overflow-hidden [clip-path:inset(0_round_1.25rem)] bg-gradient-to-b from-[#1f2230] to-[#171925] rounded-2xl border transition-[transform,box-shadow,border-color] duration-300 hover:-translate-y-1 hover:shadow-2xl cursor-pointer ${
                    ownedPkg
                      ? 'border-emerald-500/40 hover:border-emerald-400/60'
                      : 'border-white/10 hover:border-yellow-400/40'
                  }`}
                >
                  {/* Owned badge */}
                  {ownedPkg && (
                    <div className="absolute top-3 right-3 z-10 flex items-center gap-1.5 bg-emerald-500/20 border border-emerald-500/40 rounded-full px-2.5 py-1 backdrop-blur-sm">
                      <CheckCircleOutlined className="text-emerald-400 text-xs" />
                      <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wide">Owned</span>
                    </div>
                  )}

                  {/* Package Image */}
                  <div className="relative h-48 overflow-hidden">
                    <img
                      src={getImageUrl(pkg.imageUrl) || getFallbackImageByDiscipline(disciplineKey)}
                      alt={pkg.name}
                      className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                      onError={(e) => {
                        e.target.onerror = null;
                        e.target.src = getFallbackImageByDiscipline(disciplineKey);
                      }}
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

                    {/* Owned remaining info */}
                    {ownedPkg && (
                      <div className="mb-3 p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                        <p className="text-[11px] text-emerald-400 font-semibold">
                          {ownedRemaining > 0 && `${ownedRemaining}h lessons`}
                          {ownedRemaining > 0 && ownedRentalDays > 0 && ' · '}
                          {ownedRentalDays > 0 && `${ownedRentalDays}d rental`}
                          {(ownedRemaining > 0 || ownedRentalDays > 0) && ownedNights > 0 && ' · '}
                          {ownedNights > 0 && `${ownedNights}n stay`}
                          {ownedRemaining === 0 && ownedRentalDays === 0 && ownedNights === 0 && 'Active package'}
                          <span className="text-emerald-500/60 ml-1">remaining</span>
                        </p>
                      </div>
                    )}

                    <div className="flex items-end justify-between border-t border-white/10 pt-4">
                      {ownedPkg ? (
                        <div>
                          <p className="text-xs text-emerald-400 uppercase tracking-wider font-semibold">You Own This</p>
                          <p className="text-xs text-emerald-400/60">Buy again or schedule</p>
                        </div>
                      ) : (
                        <div>
                          <p className="text-xs text-gray-500 mb-1">Starting from</p>
                          <p className="text-xl font-bold text-white">
                            {getPriceForUserCurrency(pkg, userCurrency, convertCurrency, formatCurrency)}
                          </p>
                        </div>
                      )}
                      <Button
                        type="primary"
                        size="small"
                        className={ownedPkg
                          ? '!bg-emerald-500 !border-emerald-500 hover:!bg-emerald-400 !text-black !font-semibold'
                          : '!bg-yellow-500 !border-yellow-500 hover:!bg-yellow-400 !text-black !font-semibold'
                        }
                        onClick={(event) => {
                          event.stopPropagation();
                          handleOpenPurchaseModal(pkg);
                        }}
                      >
                        {ownedPkg ? 'Buy Again' : 'Buy'}
                      </Button>
                    </div>
                  </div>
                </div>
              );
              })}
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

      <AllInclusiveBookingModal
        open={allInclusiveModalOpen}
        onCancel={() => setAllInclusiveModalOpen(false)}
        selectedPackage={selectedPackage}
        walletBalance={walletSummary?.available || 0}
        onPurchase={(purchaseData) => purchaseMutation.mutate(purchaseData)}
        isPurchasing={purchaseMutation.isPending}
      />

      <DownwinderBookingModal
        open={downwinderModalOpen}
        onCancel={() => setDownwinderModalOpen(false)}
        selectedPackage={selectedPackage}
        walletBalance={walletSummary?.available || 0}
        onPurchase={(purchaseData) => purchaseMutation.mutate(purchaseData)}
        isPurchasing={purchaseMutation.isPending}
      />
    </div>
  );
};

export default ExperiencePackagesPage;
