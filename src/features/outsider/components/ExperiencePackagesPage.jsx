import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { App, Button, Tag, Segmented } from 'antd';
import { RocketOutlined, CalendarOutlined } from '@ant-design/icons';
import ExperienceDetailModal from './ExperienceDetailModal';
import AcademyLessonPackageCard from './AcademyLessonPackageCard';
import { imageRevisionFromRecord, resolvePublicUploadUrl } from '@/shared/utils/mediaUrl';
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
import IyzicoPaymentModal from '@/shared/components/IyzicoPaymentModal';
import GoogleReviewsStrip from '@/shared/components/ui/GoogleReviewsStrip';

const normalize = (v) => String(v || '').toLowerCase();

const getPackageType = (pkg) => normalize(pkg.packageType || pkg.package_type);

/** True when the row clearly includes a stay (flag, linked unit, or nights), even if includes_accommodation was not saved in admin. */
const pkgIncludesAccommodation = (pkg) => {
  if (pkg.includesAccommodation === true || pkg.includes_accommodation === true) return true;
  const unitId = pkg.accommodationUnitId ?? pkg.accommodation_unit_id;
  if (unitId != null && String(unitId).trim() !== '') return true;
  const nights = Number(pkg.accommodationNights ?? pkg.accommodation_nights);
  return Number.isFinite(nights) && nights > 0;
};

const ACCOMMODATION_FAMILY_TYPES = ['accommodation', 'accommodation_lesson', 'accommodation_rental', 'all_inclusive'];

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
  const packageType = getPackageType(pkg);

  // Event packages are always experience bundles
  if (['downwinders', 'camps'].includes(packageType)) return true;

  // Subheadline: lessons + rental (no stay) counts as an experience bundle
  if (packageType === 'lesson_rental') return true;

  // Accommodation-based package types (even if flags were not synced in DB)
  if (ACCOMMODATION_FAMILY_TYPES.includes(packageType)) return true;

  // Any package that includes a stay by flag, unit link, or nights
  if (pkgIncludesAccommodation(pkg)) return true;

  return false;
};

const disciplineMatchesInHaystack = (disciplineKey, haystack) => {
  const text = haystack;
  if (disciplineKey === 'kite') {
    const hasKite = text.includes('kite');
    const hasWing = text.includes('wing');
    const hasEFoil = text.includes('efoil') || text.includes('e-foil') || text.includes('electric');
    return hasKite && !hasWing && !hasEFoil;
  }
  if (disciplineKey === 'wing') return text.includes('wing');
  return text.includes(normalize(disciplineKey));
};

const matchesDiscipline = (pkg, disciplineKey) => {
  if (!disciplineKey) return true;

  const packageType = getPackageType(pkg);

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

  const tagHay = [
    pkg.disciplineTag,
    pkg.discipline_tag,
    pkg.lessonCategoryTag,
    pkg.lesson_category_tag
  ]
    .map(normalize)
    .join(' ');

  const stayHeavy =
    pkgIncludesAccommodation(pkg) || ACCOMMODATION_FAMILY_TYPES.includes(packageType);

  // Stay / all-inclusive bundles: match on discipline tags when marketing copy omits "kite" etc.
  if (stayHeavy && tagHay.trim()) {
    if (disciplineMatchesInHaystack(disciplineKey, tagHay)) return true;
  }
  // Untagged stay / rental bundles: rental inventory is kitesurf-centric — show on kite only unless admin sets discipline tags
  if (stayHeavy && !tagHay.trim()) {
    return disciplineKey === 'kite';
  }

  const text = [
    pkg.name,
    pkg.description,
    pkg.disciplineTag,
    pkg.lessonCategoryTag,
    pkg.lessonServiceName,
    pkg.packageType,
    pkg.package_type,
    pkg.levelTag
  ]
    .map(normalize)
    .join(' ');

  return disciplineMatchesInHaystack(disciplineKey, text);
};

const getBundleType = (pkg) => {
  const packageType = getPackageType(pkg);

  // If it's explicitly downwinders or camps, return that
  if (packageType === 'downwinders') return 'downwinders';
  if (packageType === 'camps') return 'camps';

  const includesLessons = (pkg.includesLessons ?? pkg.includes_lessons) !== false;
  const includesRental = !!(pkg.includesRental || pkg.includes_rental);
  const includesAccommodation = pkgIncludesAccommodation(pkg);

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

const pkgIncludesStay = (pkg) => {
  if (!pkg) return false;
  if (pkg.includesAccommodation === true || pkg.includes_accommodation === true) return true;
  const unitId = pkg.accommodationUnitId ?? pkg.accommodation_unit_id;
  if (unitId != null && String(unitId).trim() !== '') return true;
  const nights = Number(pkg.accommodationNights ?? pkg.accommodation_nights);
  return Number.isFinite(nights) && nights > 0;
};

/** Card hero: accommodation unit imagery first; stay bundles omit service package cover so cards match modal gallery. */
const getExperienceCardCoverResolved = (pkg) => {
  const ordered = [];
  const accomCover = pkg.accommodationImageUrl || pkg.accommodation_image_url;
  if (accomCover) ordered.push(accomCover);
  ordered.push(...toImageArray(pkg.accommodationImages || pkg.accommodation_images));
  if (!pkgIncludesStay(pkg)) {
    const cover = pkg.imageUrl || pkg.image_url;
    if (cover) ordered.push(cover);
  }
  const seen = new Set();
  for (const raw of ordered) {
    if (!raw || seen.has(raw)) continue;
    seen.add(raw);
    const u = String(raw).trim();
    if (!u) continue;
    return resolvePublicUploadUrl(u, imageRevisionFromRecord(pkg));
  }
  return '';
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
  } else if (data.paymentMethod === 'pay_later') {
    description += ' Payment is pending.';
  }

  if (data.roleUpgrade?.upgraded) {
    description += ' 🎉 Your account has been upgraded to Student.';
  }

  return description;
};

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
  const { userCurrency, formatCurrency, formatDualCurrency, convertCurrency, businessCurrency } = useCurrency();

  const formatCardPrice = (eurPrice) => formatDualCurrency(eurPrice, 'EUR');

  const cardTitleHoverClass = 'group-hover:text-cyan-300';

  const storageCurrency = businessCurrency || 'EUR';
  const { data: walletSummary, refetch: refetchWallet } = useWalletSummary({ currency: storageCurrency });

  // Aggregate ALL wallet currency rows into user's display currency
  const aggregatedWalletBalance = useMemo(() => {
    const allBalances = walletSummary?.balances;
    if (Array.isArray(allBalances) && allBalances.length > 0) {
      return allBalances.reduce((sum, row) => {
        const amt = Number(row.available) || 0;
        if (amt === 0) return sum;
        if (row.currency === userCurrency || !convertCurrency) return sum + amt;
        return sum + convertCurrency(amt, row.currency, userCurrency);
      }, 0);
    }
    const singleAmt = Number(walletSummary?.available) || 0;
    const singleCur = walletSummary?.currency || storageCurrency;
    if (singleCur === userCurrency || !convertCurrency) return singleAmt;
    return convertCurrency(singleAmt, singleCur, userCurrency);
  }, [walletSummary, convertCurrency, userCurrency, storageCurrency]);

  const [loading, setLoading] = useState(true);
  const [packages, setPackages] = useState([]);
  const [selectedPackage, setSelectedPackage] = useState(null);
  const [selectedPackageVariants, setSelectedPackageVariants] = useState([]);
  const [iyzicoPaymentUrl, setIyzicoPaymentUrl] = useState(null);
  const [showIyzicoModal, setShowIyzicoModal] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [purchaseModalOpen, setPurchaseModalOpen] = useState(false);
  const [allInclusiveModalOpen, setAllInclusiveModalOpen] = useState(false);
  const [downwinderModalOpen, setDownwinderModalOpen] = useState(false);
  const [selectedVariants, setSelectedVariants] = useState({});

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

  // Group packages by lesson service name
  const groupedPackages = useMemo(() => {
    const groups = {};

    sortedPackages.forEach((pkg) => {
      const serviceKey = pkg.lessonServiceName || pkg.lesson_service_name || 'Other';
      if (!groups[serviceKey]) {
        groups[serviceKey] = {
          serviceName: serviceKey,
          bundleType: pkg.bundleType,
          variants: []
        };
      }
      groups[serviceKey].variants.push(pkg);
    });

    return Object.values(groups).sort((a, b) => {
      const byType = getSectionOrder(a.bundleType) - getSectionOrder(b.bundleType);
      if (byType !== 0) return byType;
      return (Number(a.variants[0]?.price) || 0) - (Number(b.variants[0]?.price) || 0);
    });
  }, [sortedPackages]);

  const purchaseMutation = useMutation({
    mutationFn: async (purchaseData) => {
      const response = await apiClient.post('/services/packages/purchase', purchaseData);
      return response.data;
    },
    onSuccess: async (data) => {
      // For credit card payments, show IyzicoPaymentModal
      if (data.paymentPageUrl) {
        setIyzicoPaymentUrl(data.paymentPageUrl);
        setShowIyzicoModal(true);
        return;
      }

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
    // Find the group this package belongs to and pass all sibling variants
    const group = groupedPackages.find((g) => g.variants.some((v) => v.id === pkg.id));
    setSelectedPackageVariants(group ? group.variants : [pkg]);
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
    const pType = getPackageType(pkg);
    if (['all_inclusive', 'accommodation_lesson', 'accommodation_rental'].includes(pType)) return true;
    if (pkgIncludesAccommodation(pkg)) {
      const hasL = (pkg.includesLessons ?? pkg.includes_lessons) !== false;
      const hasR = !!(pkg.includesRental || pkg.includes_rental);
      if (hasL || hasR) return true;
    }
    return false;
  };

  // Determine if package is an event type (downwinder / camp)
  const isEventPackage = (pkg) => {
    const pType = getPackageType(pkg);
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
    <div className="min-h-screen text-slate-900 font-sans relative overflow-x-hidden bg-[#f4f6f8] selection:bg-emerald-400/30">
      <div
        className="fixed inset-0 pointer-events-none z-0"
        style={{
          background: [
            'radial-gradient(ellipse 80% 50% at 10% 15%, rgba(52,211,153,0.14) 0%, transparent 70%)',
            'radial-gradient(ellipse 60% 60% at 90% 45%, rgba(0,168,196,0.10) 0%, transparent 70%)',
            'radial-gradient(ellipse 70% 40% at 50% 90%, rgba(5,150,105,0.08) 0%, transparent 70%)',
          ].join(', '),
        }}
      />

      <div className="relative z-10 py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center pt-16 sm:pt-24">
          <h1 className="text-4xl md:text-5xl font-duotone-bold-extended text-slate-900 mb-2 tracking-tight uppercase">
            {headline}{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#00a8c4] to-emerald-600">{accentWord}</span>
          </h1>
          <p className="text-lg text-slate-600 font-duotone-regular max-w-2xl mx-auto leading-relaxed">
            {subheadline}
          </p>

          <div className="mt-6 flex items-center justify-center gap-3 flex-wrap">
            <Button
              type="primary"
              icon={<RocketOutlined />}
              className="!h-12 !px-8 !text-base font-duotone-bold !rounded-md shadow-lg transition-all duration-150 hover:scale-[1.02] active:scale-95"
              style={{ background: '#4b4f54', color: '#00a8c4', border: '1px solid rgba(0,168,196,0.5)', boxShadow: '0 0 12px rgba(0,168,196,0.2)' }}
              onClick={() => {
                if (!requireAuthForPurchase()) return;
                navigate('/experience/book-package');
              }}
            >
              Buy Package
            </Button>
            <Button
              icon={<CalendarOutlined />}
              className="!h-12 !px-8 !text-base font-duotone-bold !rounded-md !border-slate-300 !text-slate-700"
              onClick={() => navigate('/academy')}
            >
              Discover Lessons
            </Button>
          </div>
        </div>
      </div>

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-32">
        {loading ? (
          <div className="rounded-3xl border border-slate-200 bg-white p-10 text-center text-slate-600 shadow-sm">
            Loading packages...
          </div>
        ) : sortedPackages.length === 0 ? (
          <div className="rounded-3xl border border-slate-200 bg-white p-10 text-center shadow-sm">
            <h3 className="text-xl font-duotone-bold-extended text-slate-900 mb-2">{emptyTitle || 'No packages configured yet'}</h3>
            <p className="text-slate-500 max-w-2xl mx-auto font-duotone-regular">
              {emptyDescription || 'No bundle packages are configured for this category yet.'}
            </p>
          </div>
        ) : (
          <div>
            <div className="mb-6 flex flex-wrap items-center justify-center gap-2 sm:justify-start">
              <Tag className="!bg-slate-100 !border-slate-200 !text-slate-800 !px-3 !py-1 !rounded-full">
                {sortedPackages.length} Packages
              </Tag>
              {visibleBundleTypes.map((bundleType) => (
                <Tag
                  key={bundleType}
                  className="!bg-cyan-500/10 !border-cyan-500/30 !text-cyan-800 !px-3 !py-1 !rounded-full"
                >
                  {EXPERIENCE_TYPE_LABELS[bundleType] || 'Experience'}
                </Tag>
              ))}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-5">
              {groupedPackages.map((group) => {
                const selectedVariantIdx = selectedVariants[group.serviceName] ?? 0;
                const selectedPkg = group.variants[selectedVariantIdx];

                // Check if ANY variant in this group is owned
                const anyOwnedVariant = group.variants.find((v) => ownedByPackageId.has(String(v.id)));
                const isGroupOwned = !!anyOwnedVariant;

                // Build hint text from the owned variant(s)
                const ownedPkg = ownedByPackageId.get(String(selectedPkg.id)) || (anyOwnedVariant ? ownedByPackageId.get(String(anyOwnedVariant.id)) : null);
                const ownedRemaining = ownedPkg ? (parseFloat(ownedPkg.remainingHours ?? ownedPkg.remaining_hours) || 0) : 0;
                const ownedUsedHours = ownedPkg ? (parseFloat(ownedPkg.usedHours ?? ownedPkg.used_hours) || 0) : 0;
                const ownedTotalHours = ownedPkg ? (parseFloat(ownedPkg.totalHours ?? ownedPkg.total_hours) || 0) : 0;
                const ownedRentalDays = ownedPkg ? (parseFloat(ownedPkg.remainingRentalDays ?? ownedPkg.remaining_rental_days) || 0) : 0;
                const ownedNights = ownedPkg ? (parseFloat(ownedPkg.remainingAccommodationNights ?? ownedPkg.remaining_accommodation_nights) || 0) : 0;
                const ownedParts = [
                  ownedRemaining > 0 && `${ownedRemaining}h lessons`,
                  ownedRentalDays > 0 && `${ownedRentalDays}d rental`,
                  ownedNights > 0 && `${ownedNights}n stay`,
                ].filter(Boolean);
                const ownedLessonsPending =
                  !!ownedPkg &&
                  ownedRemaining <= 0 &&
                  ownedTotalHours > 0 &&
                  ownedUsedHours > 0;
                const ownedHint = ownedPkg
                  ? (ownedParts.length
                    ? `${ownedParts.join(' · ')} remaining`
                    : ownedLessonsPending
                      ? 'Lessons scheduled'
                      : 'Tap for details')
                  : undefined;

                const coverSrc = getExperienceCardCoverResolved(selectedPkg);
                const summaryLabel = EXPERIENCE_TYPE_LABELS[selectedPkg.bundleType] || 'Experience';

                return (
                  <div key={group.serviceName} className="flex flex-col h-full">
                    <AcademyLessonPackageCard
                      pkg={{
                        ...selectedPkg,
                        featured: !!selectedPkg.featured,
                      }}
                      resolvedImageSrc={coverSrc}
                      imagePosition="center center"
                      formatPrice={formatCardPrice}
                      cardTitleHoverClass={cardTitleHoverClass}
                      bundleSummaryLabel={summaryLabel}
                      ownedHint={ownedHint}
                      isOwned={isGroupOwned}
                      onCardClick={() => openPackageDetail(selectedPkg)}
                    />
                    {group.variants.length > 1 && (
                      <div className="mt-3 px-1">
                        <Segmented
                          value={selectedVariantIdx}
                          onChange={(idx) => setSelectedVariants({
                            ...selectedVariants,
                            [group.serviceName]: idx
                          })}
                          options={group.variants.map((variant, idx) => ({
                            label: variant.name,
                            value: idx,
                          }))}
                          block
                          className="!w-full text-xs"
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <ExperienceDetailModal
        pkg={selectedPackage}
        variants={selectedPackageVariants}
        visible={detailOpen}
        onClose={() => setDetailOpen(false)}
        onBuy={handleOpenPurchaseModal}
        disciplineKey={disciplineKey}
      />

      <PackagePurchaseModal
        open={purchaseModalOpen}
        onCancel={() => setPurchaseModalOpen(false)}
        selectedPackage={selectedPackage}
        walletBalance={aggregatedWalletBalance}
        onPurchase={(purchaseData) => purchaseMutation.mutate(purchaseData)}
        isPurchasing={purchaseMutation.isPending}
        destroyOnHidden
      />

      <AllInclusiveBookingModal
        open={allInclusiveModalOpen}
        onCancel={() => setAllInclusiveModalOpen(false)}
        selectedPackage={selectedPackage}
        walletBalance={aggregatedWalletBalance}
        onPurchase={(purchaseData) => purchaseMutation.mutate(purchaseData)}
        isPurchasing={purchaseMutation.isPending}
      />

      <DownwinderBookingModal
        open={downwinderModalOpen}
        onCancel={() => setDownwinderModalOpen(false)}
        selectedPackage={selectedPackage}
        walletBalance={aggregatedWalletBalance}
        onPurchase={(purchaseData) => purchaseMutation.mutate(purchaseData)}
        isPurchasing={purchaseMutation.isPending}
      />

      {/* Iyzico Credit Card Payment Modal */}
      <IyzicoPaymentModal
        visible={showIyzicoModal}
        paymentPageUrl={iyzicoPaymentUrl}
        socketEventName="package:payment_confirmed"
        onSuccess={() => {
          setShowIyzicoModal(false);
          setIyzicoPaymentUrl(null);
          refetchWallet();
          queryClient.invalidateQueries({ queryKey: ['wallet'] });
          queryClient.invalidateQueries({ queryKey: ['customer-packages'] });
          notification.success({ message: 'Payment confirmed!', description: 'Your package has been purchased.' });
          setPurchaseModalOpen(false);
          setAllInclusiveModalOpen(false);
          setDownwinderModalOpen(false);
          setDetailOpen(false);
          setSelectedPackage(null);
        }}
        onClose={() => {
          setShowIyzicoModal(false);
          setIyzicoPaymentUrl(null);
        }}
        onError={(msg) => {
          setShowIyzicoModal(false);
          setIyzicoPaymentUrl(null);
          notification.error({ message: 'Payment Failed', description: msg || 'Payment could not be completed.' });
        }}
      />

      <GoogleReviewsStrip />
    </div>
  );
};

export default ExperiencePackagesPage;
