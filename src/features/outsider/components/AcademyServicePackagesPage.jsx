import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import StickyNavBar from '@/shared/components/navigation/StickyNavBar';
import ContactOptionsBanner from '@/features/outsider/components/ContactOptionsBanner';
import { Button, Tag, Spin, message } from 'antd';
import { useQuery } from '@tanstack/react-query';
import StayAccommodationModal from './StayAccommodationModal';
import AcademyLessonPackageCard from './AcademyLessonPackageCard';
import AccommodationBookingModal from './AccommodationBookingModal';
import StudentBookingWizard from '@/features/students/components/StudentBookingWizard';
import QuickBookingModal from './QuickBookingModal';
import RentalBookingModal from './RentalBookingModal';
import AcademyCrossSellBanner from './AcademyCrossSellBanner';
import {
  RocketOutlined,
  HomeOutlined,
  ThunderboltFilled
} from '@ant-design/icons';
import { usePageSEO } from '@/shared/utils/seo';
import { useCurrency } from '@/shared/contexts/CurrencyContext';
import { useAuth } from '@/shared/hooks/useAuth';
import { useAuthModal } from '@/shared/contexts/AuthModalContext';
import apiClient from '@/shared/services/apiClient';
import { imageRevisionFromRecord, resolvePublicUploadUrl } from '@/shared/utils/mediaUrl';
import {
  closePackageDetailsModal,
  getPackageDetailsModalSnapshot,
  openPackageDetailsModal,
  refreshOpenPackageDetailsModal,
} from '@/features/outsider/stores/packageDetailsModalStore';
import { packageDetailsModalDepsRef } from '@/features/outsider/stores/packageDetailsModalDepsRef';

const LESSON_NAV_ITEMS = [
  { id: 'kite',    label: 'KITE LESSONS',   shortLabel: 'KITE',   path: '/academy/kite-lessons' },
  { id: 'wing',    label: 'WING LESSONS',   shortLabel: 'WING',   path: '/academy/wing-lessons' },
  { id: 'foil',    label: 'FOIL LESSONS',   shortLabel: 'FOIL',   path: '/academy/foil-lessons' },
  { id: 'efoil',   label: 'E-FOIL LESSONS', shortLabel: 'E-FOIL', path: '/academy/efoil-lessons' },
  { id: 'premium', label: 'PREMIUM',        shortLabel: 'VIP',    path: '/academy/premium-lessons' },
];
const LESSON_KEYS = new Set(['kite', 'wing', 'foil', 'efoil', 'premium']);

const RENTAL_NAV_ITEMS = [
  { id: 'rental_standard', label: 'STANDARD',  path: '/rental/standard' },
  { id: 'rental_sls',      label: 'SLS',       path: '/rental/sls' },
  { id: 'rental_dlab',     label: 'D-LAB',     path: '/rental/dlab' },
  { id: 'rental_efoil',    label: 'E-FOIL',    path: '/rental/efoil' },
  { id: 'rental_premium',  label: 'PREMIUM',   path: '/rental/premium' },
];

const AcademyServicePackagesPage = ({
  seoTitle,
  seoDescription,
  headline,
  accentWord,
  subheadline,
  academyTag = 'UKC•Academy',
  academyTheme = 'auto',
  packages = [],
  dynamicServiceKey = null,
  promoBanner = null,
}) => {
  const { formatCurrency, convertCurrency, userCurrency } = useCurrency();
  const { user } = useAuth();
  const { openAuthModal } = useAuthModal();
  const navigate = useNavigate();
  const [dynamicPackages, setDynamicPackages] = useState([]);
  // For stay pages: keep raw unit objects so the gallery modal has full data
  const [rawUnits, setRawUnits] = useState([]);
  const [stayModalUnit, setStayModalUnit] = useState(null);
  const [stayModalPkg, setStayModalPkg] = useState(null);
  const [stayModalVisible, setStayModalVisible] = useState(false);
  // Discipline filter (rental pages only)
  const [disciplineFilter, setDisciplineFilter] = useState(null);
  const [availableDisciplines, setAvailableDisciplines] = useState([]);
  const [isLoading, setIsLoading] = useState(!!dynamicServiceKey);
  // Booking wizard state (lessons / rentals)
  const [bookingWizardOpen, setBookingWizardOpen] = useState(false);
  const [bookingInitialData, setBookingInitialData] = useState({});
  // Accommodation booking modal state (stays)
  const [accomModalOpen, setAccomModalOpen] = useState(false);
  const [accomBookingUnit, setAccomBookingUnit] = useState(null);
  // Quick booking modal state (lesson packages)
  const [quickBookingOpen, setQuickBookingOpen] = useState(false);
  const [quickBookingData, setQuickBookingData] = useState(null);
  // Rental booking modal state
  const [rentalBookingOpen, setRentalBookingOpen] = useState(false);
  const [rentalBookingData, setRentalBookingData] = useState(null);
  // Raw package rows for lookup when opening quick booking
  const [rawPackageRows, setRawPackageRows] = useState([]);

  // ── Fetch user's owned customer packages ──────────────────────────────────
  const { data: ownedPackages = [] } = useQuery({
    queryKey: ['customer-packages', user?.id],
    queryFn: async () => {
      const res = await apiClient.get(`/services/customer-packages/${user.id}`);
      return Array.isArray(res.data) ? res.data : [];
    },
    enabled: !!user?.id,
    staleTime: 30_000,
  });

  // Build a map: service_package_id → owned customer package (active + has remaining hours)
  const ownedByPackageId = useMemo(() => {
    const map = new Map();
    for (const cp of ownedPackages) {
      const isActive = (cp.status || '').toLowerCase() === 'active';
      const remaining = parseFloat(cp.remainingHours ?? cp.remaining_hours) || 0;
      if (isActive && remaining > 0) {
        const spId = String(cp.servicePackageId || cp.service_package_id);
        // Keep the one with most remaining hours if duplicates
        const existing = map.get(spId);
        if (!existing || remaining > (parseFloat(existing.remainingHours ?? existing.remaining_hours) || 0)) {
          map.set(spId, cp);
        }
      }
    }
    return map;
  }, [ownedPackages]);

  usePageSEO({
    title: seoTitle,
    description: seoDescription
  });

  const normalize = (v) => String(v || '').toLowerCase();
  const isStayPage = normalize(dynamicServiceKey || '').startsWith('stay');
  const isRentalPage = normalize(dynamicServiceKey || '').startsWith('rental_');
  const isLessonPage = LESSON_KEYS.has(normalize(dynamicServiceKey || ''));

  const DISCIPLINE_META = {
    kite:     { label: 'Kitesurfing',  color: 'bg-sky-500/20 border-sky-500/40 text-sky-300 hover:bg-sky-500/30',    active: 'bg-sky-500/40 border-sky-400 text-sky-100' },
    wing:     { label: 'Wing Foil',    color: 'bg-purple-500/20 border-purple-500/40 text-purple-300 hover:bg-purple-500/30', active: 'bg-purple-500/40 border-purple-400 text-purple-100' },
    kite_foil:{ label: 'Kite Foil',   color: 'bg-cyan-500/20 border-cyan-500/40 text-cyan-300 hover:bg-cyan-500/30', active: 'bg-cyan-500/40 border-cyan-400 text-cyan-100' },
    efoil:    { label: 'E-Foil',       color: 'bg-yellow-500/20 border-yellow-500/40 text-yellow-300 hover:bg-yellow-500/30', active: 'bg-yellow-500/40 border-yellow-400 text-yellow-100' },
    accessory:{ label: 'Accessories',  color: 'bg-orange-500/20 border-orange-500/40 text-orange-300 hover:bg-orange-500/30', active: 'bg-orange-500/40 border-orange-400 text-orange-100' },
  };

  // The rental sport filters always available on rental pages
  const RENTAL_DISCIPLINES = ['kite', 'wing', 'kite_foil', 'accessory'];

  // Build display cards from rental services fetched from the API
  const buildRentalCards = (services, serviceKey) => {
    const segment = serviceKey.replace('rental_', '');
    // Strip leading duration prefix like "4H - ", "8H – ", "1.5h - " (hyphen, en dash, em dash)
    const stripDurationPrefix = (name) => {
      let s = String(name || '').trim();
      s = s.replace(/^\d+\.?\d*[Hh](?:ours?)?\s*[-–—]\s*/u, '').trim();
      // Hyphenated or spaced week prefix: "1-WEEK …", "2 WEEKS — …"
      s = s.replace(/^\d+\s*[-]?\s*(?:weeks?|WEEKS?|[Ww])\s*[-–—]\s*/iu, '').trim();
      s = s.replace(/^\d+\s*Weeks?\s*[-–—]\s*/iu, '').trim();
      s = s.replace(/^\d+\s*Days?\s*[-–—]\s*/iu, '').trim();
      s = s.replace(/^1\s*[Ww]\s*[-–—]\s*/, '').trim();
      return s;
    };
    /** Merge tag variants so "foil" and "kite_foil" rental rows group into one card. */
    const canonicalRentalDiscipline = (raw) => {
      const d = String(raw || '').toLowerCase().trim();
      if (d === 'foil' || d === 'kitefoil') return 'kite_foil';
      return d;
    };
    /** Group wing foil + kite foil (and mis-tagged kite+foil names) into one rental card family. */
    const coarseRentalEquipmentFamily = (discipline, serviceName) => {
      const d = canonicalRentalDiscipline(discipline || '');
      const nm = String(serviceName || '');
      if (d === 'accessory') return 'accessory';
      if (d === 'wing' || d === 'kite_foil') return 'foil';
      if (d === 'kite' && /\bfoil\b/i.test(nm)) return 'foil';
      return d || 'misc';
    };
    /** Remove sport qualifiers so "KITE — …" and "WING FOIL — …" share the same group key. */
    const stripSportQualifiersForGrouping = (n) => {
      let s = String(n || '').trim();
      const sportChunk =
        '(?:Kite|Wing|Wing\\s+Foil|Kite\\s+Foil|Kitesurf(?:ing)?)\\b';
      const reLead = new RegExp(`^\\s*${sportChunk}\\s*[-–—]\\s*`, 'gi');
      const reTrail = new RegExp(`\\s*[-–—]\\s*${sportChunk}\\s*$`, 'gi');
      let prev;
      do {
        prev = s;
        s = s.replace(reLead, '').replace(reTrail, '').trim();
      } while (s !== prev);
      return s.replace(/\s+/g, ' ').trim();
    };
    // Further normalize: strip segment markers and duration words anywhere in the title so
    // "4h – Standard – Foil – Half Day", "Foil — Full Day", and "1h - Foil" share one card.
    const normalizeBaseName = (name) => {
      let n = stripDurationPrefix(name);
      // Remove segment labels (SLS, D/LAB, D-LAB, DLAB, Standart, Standard)
      n = n.replace(/\b(SLS|D[\s/\-]?LAB|DLAB|Standart|Standard)\b\s*[-–—]?\s*/gi, '').trim();
      // Remove leading filler like "Half Day", "Full Day"
      n = n.replace(/^(Half\s+Day|Full\s+Day)\s*[-–—]?\s*/i, '').trim();
      const stripTrailingDurationTokens = (s) => {
        let t = s;
        let prev;
        do {
          prev = t;
          t = t
            .replace(
              /\s*[-–—]\s*(Half\s+Day|Full\s+Day|Multi[-\s]?Day|One\s+Day|One\s+Week|One\s+Hour|Single\s+Hour|(\d+)\s*Days?|(\d+)\s*Weeks?|(\d+\.?\d*)\s*(?:H|h)(?:ours?)?)\s*$/i,
              ''
            )
            .replace(
              /\s+(Half\s+Day|Full\s+Day|One\s+Day|One\s+Week|One\s+Hour|Single\s+Hour|(\d+)\s*Days?|(\d+)\s*Weeks?|(\d+\.?\d*)\s*(?:H|h)(?:ours?)?)\s*$/i,
              ''
            )
            .trim();
        } while (t !== prev);
        return t;
      };
      n = stripTrailingDurationTokens(n);
      n = n.replace(/\s+/g, ' ').trim();
      return n || stripDurationPrefix(name); // fallback to original stripped name if empty
    };

    const segmentServices = services.filter(s => {
      // must be a rental service (category stored as 'rental', 'equipment-rental', etc.)
      const cat = normalize(s.category);
      if (!cat.includes('rental') && !cat.includes('equipment')) return false;
      const seg = (s.rentalSegment || '').toLowerCase();
      const disc = (s.disciplineTag || '').toLowerCase();
      // Accessories always appear on every rental page (discipline filter pill handles isolation)
      if (seg === 'accessory' || disc === 'accessory') return true;
      // "premium" is a virtual segment combining sls + dlab
      if (segment === 'premium') return seg === 'sls' || seg === 'dlab';
      if (seg) return seg === segment;
      // legacy fallback: infer segment from name when rentalSegment not stored
      const text = (s.name || '').toLowerCase();
      if (segment === 'sls')      return /\bsls\b/i.test(text);
      if (segment === 'dlab')     return /\bd[\s-]?lab\b/i.test(text);
      return !/\bsls\b/i.test(text) && !/\bd[\s-]?lab\b/i.test(text);
    });

    const groups = new Map();
    segmentServices.forEach((s) => {
      const groupBase =
        stripSportQualifiersForGrouping(normalizeBaseName(s.name)) || normalizeBaseName(s.name);
      const family = coarseRentalEquipmentFamily(s.disciplineTag, s.name);
      // Same equipment line + sport family → one card; all durations become rows (modal lists each sport if needed).
      const groupKey = `${groupBase}|${family}`;
      if (!groups.has(groupKey)) groups.set(groupKey, { groupBase, items: [] });
      groups.get(groupKey).items.push(s);
    });

    const cardPalette = [
      { color: 'blue',   gradient: 'from-blue-600 to-blue-400',      shadow: 'shadow-blue-500/20',   border: 'hover:border-blue-500/50' },
      { color: 'cyan',   gradient: 'from-cyan-500 to-blue-500',      shadow: 'shadow-cyan-500/20',   border: 'hover:border-cyan-500/50' },
      { color: 'purple', gradient: 'from-purple-600 to-fuchsia-500', shadow: 'shadow-purple-500/20', border: 'hover:border-purple-500/50' },
      { color: 'green',  gradient: 'from-green-500 to-emerald-600',  shadow: 'shadow-green-500/20',  border: 'hover:border-green-500/50' },
    ];

    const SEGMENT_IMG = {
      sls:      '/Images/ukc/evo-sls-header.jpg',
      dlab:     '/Images/ukc/rebel-dlab-header.jpg',
      standard: '/Images/ukc/evo-rent-standart.png',
      efoil:    '/Images/ukc/e-foil.png',
    };
    const DISC_IMG = {
      kite:     '/Images/ukc/kite-header.jpg.png',
      wing:     '/Images/ukc/wing-header.png',
      kite_foil:'/Images/ukc/foil-lessons-header.png',
      efoil:    '/Images/ukc/e-foil.png',
    };

    return Array.from(groups.values()).map(({ groupBase, items }, idx) => {
      const first = items[0];
      const theme = cardPalette[idx % cardPalette.length];
      let discTags = [
        ...new Set(items.map((i) => canonicalRentalDiscipline(i.disciplineTag || '')).filter(Boolean)),
      ];
      if (!discTags.length) {
        const raw = String(first.disciplineTag || '')
          .toLowerCase()
          .trim();
        if (raw) discTags = [canonicalRentalDiscipline(raw) || raw];
      }
      const discLabels = discTags.map((t) => DISCIPLINE_META[t]?.label).filter(Boolean);
      const disc =
        discTags.includes('wing')
          ? 'wing'
          : discTags.includes('kite_foil')
            ? 'kite_foil'
            : discTags[0] || canonicalRentalDiscipline(first.disciplineTag || '') || first.disciplineTag || '';

      const nearlyInteger = (x) => Math.abs(x - Math.round(x)) < 0.02;
      const buildRentalDurationRow = (s) => {
        const h = parseFloat(s.duration);
        const hoursNumeric = Number.isFinite(h) && h > 0 ? h : 1;
        const canonD = canonicalRentalDiscipline(s.disciplineTag || '');
        const sportTag = DISCIPLINE_META[canonD]?.label || '';
        const withSport = (text) => (sportTag ? `${sportTag} — ${text}` : text);
        if (hoursNumeric < 24) {
          const core = `${hoursNumeric}h Session`;
          return {
            hours: `${hoursNumeric}h`,
            hoursNumeric,
            price: parseFloat(s.price) || 0,
            label: withSport(core),
            sessions: `${hoursNumeric} hour rental`,
            serviceId: s.id || null,
            tag: sportTag || undefined,
          };
        }
        const weeks = hoursNumeric / 168;
        if (hoursNumeric >= 168 && nearlyInteger(weeks) && weeks >= 1) {
          const w = Math.round(weeks);
          const wkLabel = w === 1 ? '1 week' : `${w} weeks`;
          return {
            hours: wkLabel,
            hoursNumeric,
            price: parseFloat(s.price) || 0,
            label: withSport(wkLabel),
            sessions: w === 1 ? '1 week rental' : `${w} weeks rental`,
            serviceId: s.id || null,
            tag: sportTag || undefined,
          };
        }
        const days = hoursNumeric / 24;
        if (nearlyInteger(days) && days >= 1) {
          const d = Math.round(days);
          const core = `${d} Day${d > 1 ? 's' : ''}`;
          return {
            hours: `${d}d`,
            hoursNumeric,
            price: parseFloat(s.price) || 0,
            label: withSport(core),
            sessions: `${d} day rental`,
            serviceId: s.id || null,
            tag: sportTag || undefined,
          };
        }
        const dRounded = Math.round(days * 10) / 10;
        const core = `${dRounded} Day rental`;
        return {
          hours: `${dRounded}d`,
          hoursNumeric,
          price: parseFloat(s.price) || 0,
          label: withSport(core),
          sessions: `${dRounded} day rental`,
          serviceId: s.id || null,
          tag: sportTag || undefined,
        };
      };

      const durations = items
        .map(buildRentalDurationRow)
        .sort((a, b) => {
          const dh = (a.hoursNumeric || 0) - (b.hoursNumeric || 0);
          if (dh !== 0) return dh;
          return String(a.tag || '').localeCompare(String(b.tag || ''));
        });

      const rawRentalImg = first.imageUrl || first.image_url || '';
      const image =
        rawRentalImg ||
        DISC_IMG[disc] ||
        SEGMENT_IMG[segment] ||
        '/Images/ukc/evo-rent-standart.png';

      // One card per equipment line: title from merged base (sport tokens stripped for grouping).
      const displayName = toTitle(groupBase);

      return {
        id: `rent-${segment}-${idx}`,
        name: displayName,
        subtitle: discLabels.length > 1 ? discLabels.join(' · ') : discLabels[0] || segment.toUpperCase(),
        disciplineTag: disc,
        rentalDisciplineTags: discTags,
        icon: <ThunderboltFilled />,
        featured: idx === 0,
        color: theme.color,
        gradient: theme.gradient,
        shadow: theme.shadow,
        border: theme.border,
        image,
        imageRevision: imageRevisionFromRecord(first),
        description: first.description || `${displayName} — available in multiple durations.`,
        highlights: [
          'Equipment included',
          `${items.length} duration option${items.length > 1 ? 's' : ''}`,
          discLabels.length > 1
            ? `Sports: ${discLabels.join(' · ')}`
            : discLabels[0]
              ? `Sport: ${discLabels[0]}`
              : 'Multi-sport compatible',
          'Daily safety checks',
          'Book directly',
        ],
        durations: durations.length > 0 ? durations : [{ hours: '—', price: 0, label: 'Contact us', sessions: 'Flexible' }],
        badges: [segment.toUpperCase(), ...discLabels],
      };
    }).filter(c => c.durations.length > 0);
  };

  const isMatchForService = (pkg, key) => {
    if (!key) return true;
    const normKey = normalize(key);

    const packageType = normalize(pkg.packageType || pkg.package_type);
    const includesAccommodation = pkg.includesAccommodation === true || pkg.includes_accommodation === true;
    const accommodationUnitType = normalize(pkg.accommodationUnitType || pkg.accommodation_unit_type);
    const accommodationUnitCategory = normalize(pkg.accommodationUnitCategory || pkg.accommodation_unit_category || '');
    const accommodationText = [
      pkg.name,
      pkg.description,
      pkg.accommodationUnitName,
      pkg.accommodation_unit_name,
      pkg.packageType,
      pkg.package_type,
      pkg.disciplineTag,
      pkg.lessonCategoryTag
    ].map(normalize).join(' ');

    const isAccommodationPackage =
      includesAccommodation ||
      packageType.includes('accommodation') ||
      packageType === 'all_inclusive';

    if (normKey === 'stay') {
      return isAccommodationPackage;
    }

    if (normKey === 'stay_hotel') {
      const hasCategoryRule = accommodationUnitCategory.length > 0;
      const isHotelByCategory = accommodationUnitCategory === 'hotel';
      const hasTypedRule = !hasCategoryRule && accommodationUnitType.length > 0;
      const isHotelByType = accommodationUnitType === 'room';
      const isHotelLike = ['hotel', 'otel', 'burlahan'].some((token) => accommodationText.includes(token));
      if (hasCategoryRule) return isAccommodationPackage && isHotelByCategory;
      if (hasTypedRule) return isAccommodationPackage && isHotelByType;
      return isAccommodationPackage && isHotelLike;
    }

    if (normKey === 'stay_home') {
      const hasCategoryRule = accommodationUnitCategory.length > 0;
      const isHomeByCategory = accommodationUnitCategory === 'own';
      const hasTypedRule = !hasCategoryRule && accommodationUnitType.length > 0;
      const isHomeByType = accommodationUnitType !== 'room';
      const isHomeLike = ['home', 'house', 'farm', 'studio', 'staff', 'villa', 'pool'].some((token) => accommodationText.includes(token));
      if (hasCategoryRule) return isAccommodationPackage && isHomeByCategory;
      if (hasTypedRule) return isAccommodationPackage && isHomeByType;
      return isAccommodationPackage && isHomeLike;
    }
    
    // 1. Tag based match
    const tag = normalize(pkg.disciplineTag || pkg.discipline_tag);
    
    // Explicit exclusions based on key to prevent cross-contamination
    if (normKey === 'kite') {
      if (tag.includes('efoil') || tag.includes('e-foil') || tag.includes('wing') || tag.includes('foil')) return false;
    }
    if (normKey === 'foil') {
      if (tag.includes('efoil') || tag.includes('e-foil') || tag.includes('wing')) return false;
    }
    if (normKey === 'efoil') {
      if (
        tag.includes('kite_foil') ||
        tag.includes('kite foil') ||
        tag === 'foil' ||
        tag.includes('wing_foil') ||
        tag.includes('wing foil')
      ) return false;
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

    let matchesSpecific = false;

    if (normKey === 'efoil') {
      const hasEfoil = text.includes('e-foil') || text.includes('efoil') || text.includes('electric');
      const hasKiteFoil = text.includes('kite foil') || (text.includes('kite') && text.includes('foil') && !hasEfoil);
      const hasWingFoil = text.includes('wing foil') || (text.includes('wing') && text.includes('foil') && !hasEfoil);
      matchesSpecific = hasEfoil && !hasKiteFoil && !hasWingFoil;
    } else if (normKey === 'wing') {
      matchesSpecific = text.includes('wing');
    } else if (normKey === 'foil') {
      // Must include foil, must NOT be wing or efoil (unless specified)
      const isWing = text.includes('wing');
      // "Kite Foil" IS valid foil. "E-Foil" is technically foil but usually separate.
      const isEfoil = text.includes('e-foil') || text.includes('efoil') || text.includes('electric');
      matchesSpecific = (text.includes('foil') || text.includes('kite foil')) && !isWing && !isEfoil;
    } else if (normKey === 'kite') {
       // Must include kite, must NOT be wing or efoil
       const isEfoil = text.includes('efoil') || text.includes('e-foil') || text.includes('electric');
       const isWing = text.includes('wing');
       const isFoil = text.includes('foil'); // Strict: no "kite foil" in "kite" page if separate foil page exists
       matchesSpecific = text.includes('kite') && !isEfoil && !isWing && !isFoil;
    } else {
       matchesSpecific = text.includes(normKey);
    }

    if (matchesSpecific) return true;

    // 3. Generic Service Fallback (Universal Lessons)
    // If a service (not package) has a generic name (e.g. "Private Lesson") and mentions NO specific discipline,
    // show it on all pages to ensure "1h option" exists.
    if (pkg.isService) {
        const disciplines = ['kite', 'wing', 'foil', 'efoil']; // major keywords
        const otherDisciplines = disciplines.filter(d => d !== normKey);
        
        // Does the text match ANY other discipline?
        // Note: For 'foil', 'kite foil' contains 'kite' (which is 'other'). 
        // But we already checked specific match above. 
        // If we are here, specific match failed.
        // So this is for TRULY generic items.
        
        const mentionsAnyDiscipline = disciplines.some(d => text.includes(d));
        
        // If it mentions NOTHING (no kite, no wing, no foil, no efoil), treat as generic universal
        if (!mentionsAnyDiscipline) {
            return true;
        }
    }

    return false;
  };

  const toTitle = (value) =>
    String(value || '')
      .replace(/[-_]/g, ' ')
      .replace(/\b\w/g, (m) => m.toUpperCase())
      .trim();

  const resolveLessonCardImage = (pkg, serviceKey) => {
    const key = normalize(serviceKey);
    const isStayMode = key.startsWith('stay');

    // For stay/accommodation pages, prioritize accommodation unit images
    if (isStayMode) {
      // First check for accommodation unit image URL
      const accommodationImageUrl = pkg.accommodationImageUrl || pkg.accommodation_image_url;
      if (accommodationImageUrl) return accommodationImageUrl;

      // Then check for accommodation images array (take first image)
      const accommodationImages = pkg.accommodationImages || pkg.accommodation_images;
      if (Array.isArray(accommodationImages) && accommodationImages.length > 0) {
        return accommodationImages[0];
      }

      // Fall back to package's own image
      const packageImage = pkg.imageUrl || pkg.image_url;
      if (packageImage) return packageImage;

      // No hardcoded fallback for stay mode - force admin to upload images
      return null;
    }

    // For non-stay modes, check package image first
    const imageFromApi = pkg.imageUrl || pkg.image_url;
    if (imageFromApi) return imageFromApi;

    const text = [
      pkg.name,
      pkg.description,
      pkg.lessonServiceName,
      pkg.disciplineTag,
      pkg.lessonCategoryTag,
      pkg.levelTag
    ].map(normalize).join(' ');

    if (text.includes('kite foil') || text.includes('kite_foil')) {
      return '/Images/ukc/kite-foil-header.jpg';
    }

    // Keep kite untouched
    if (key === 'kite') return '/Images/ukc/kite-header.jpg.png';

    // High-priority matches by service content
    if (text.includes('d/lab') || text.includes('d-lab') || text.includes('dlab') || text.includes('premium')) {
      return '/Images/ukc/rebel-dlab-header.jpg';
    }
    if (text.includes('sls')) return '/Images/ukc/evo-sls-header.jpg';
    if (text.includes('e-foil') || text.includes('efoil') || text.includes('electric')) return '/Images/ukc/e-foil.png';
    if (text.includes('wing')) return '/Images/ukc/wing-header.png';
    if (text.includes('foil')) return '/Images/ukc/foil-lessons-header.png';

    // Fallback by page key
    if (key === 'premium') return '/Images/ukc/rebel-dlab-header.jpg';
    if (key === 'efoil') return '/Images/ukc/e-foil.png';
    if (key === 'wing') return '/Images/ukc/wing-header.png';
    if (key === 'foil') return '/Images/ukc/foil-lessons-header.png';

    return '/Images/ukc/kite-header.jpg.png';
  };

  const resolveLessonCardImagePosition = (pkg, serviceKey) => {
    const key = normalize(serviceKey);
    const text = [
      pkg.name,
      pkg.description,
      pkg.lessonServiceName,
      pkg.disciplineTag,
      pkg.lessonCategoryTag,
      pkg.levelTag
    ].map(normalize).join(' ');

    if (text.includes('kite foil') || text.includes('kite_foil')) return '50% 58%';

    // Keep kite unchanged
    if (key === 'kite') return '50% 50%';

    // Foil/efoil shots often need lower focal point to keep rider visible
    if (text.includes('e-foil') || text.includes('efoil') || text.includes('electric')) return '50% 62%';
    if (text.includes('foil')) return '50% 60%';
    if (text.includes('wing')) return '50% 56%';

    return '50% 50%';
  };

  const buildAccommodationHighlights = (pkg) => {
    const highlights = [];
    
    // Add accommodation unit name if available
    const unitName = pkg.accommodationUnitName || pkg.accommodation_unit_name;
    if (unitName) {
      highlights.push(unitName);
    }
    
    // Add accommodation nights if available
    const nights = pkg.accommodationNights || pkg.accommodation_nights;
    if (nights && nights > 0) {
      highlights.push(`${nights} night${nights > 1 ? 's' : ''} available`);
    }
    
    // Add unit type if available
    const unitType = pkg.accommodationUnitType || pkg.accommodation_unit_type;
    if (unitType) {
      highlights.push(`${toTitle(unitType)} type`);
    }
    
    // Add package type
    const packageType = pkg.packageType || pkg.package_type;
    if (packageType && packageType !== 'accommodation') {
      highlights.push(toTitle(packageType));
    }
    
    // Add generic helpful info
    highlights.push('Book directly');
    
    // Return first 5 highlights
    return highlights.slice(0, 5);
  };

  const buildAccommodationUnitCards = (units = [], allPackages = []) => {
    const cardPalette = [
      { color: 'blue', gradient: 'from-blue-600 to-blue-400', shadow: 'shadow-blue-500/20', border: 'hover:border-blue-500/50' },
      { color: 'cyan', gradient: 'from-cyan-500 to-blue-500', shadow: 'shadow-cyan-500/20', border: 'hover:border-cyan-500/50' },
      { color: 'purple', gradient: 'from-purple-600 to-fuchsia-500', shadow: 'shadow-purple-500/20', border: 'hover:border-purple-500/50' },
      { color: 'green', gradient: 'from-green-500 to-emerald-600', shadow: 'shadow-green-500/20', border: 'hover:border-green-500/50' }
    ];

    return units.map((unit, idx) => {
      const theme = cardPalette[idx % cardPalette.length];
      const pricePerNight = parseFloat(unit.price_per_night || 0);
      
      // Get images
      const imageUrl = unit.image_url;
      const images = Array.isArray(unit.images) ? unit.images : [];
      const primaryImage = imageUrl || (images.length > 0 ? images[0] : null);
      
      // Build amenities/highlights
      const amenities = Array.isArray(unit.amenities) 
        ? unit.amenities 
        : (typeof unit.amenities === 'string' ? JSON.parse(unit.amenities) : []);
      
      const highlights = [
        `Capacity: ${unit.capacity} guest${unit.capacity > 1 ? 's' : ''}`,
        ...(amenities.length > 0 ? amenities.slice(0, 3) : ['Comfortable accommodation']),
        'Available for booking'
      ].slice(0, 5);

      // Find packages linked to this unit
      const unitPackages = allPackages.filter((p) => {
        const pkgUnitId = p.accommodationUnitId || p.accommodation_unit_id;
        const pkgUnitName = normalize(p.accommodationUnitName || p.accommodation_unit_name || '');
        const isLinkedById = pkgUnitId && String(pkgUnitId) === String(unit.id);
        const isLinkedByName = pkgUnitName && pkgUnitName === normalize(unit.name);
        const isAccommodation = p.includesAccommodation === true || p.includes_accommodation === true ||
          normalize(p.packageType || p.package_type).includes('accommodation');
        return isAccommodation && (isLinkedById || isLinkedByName);
      });

      // Build durations: always start with 1 night, then add real packages, then custom
      const seen = new Set();
      const durations = [
        // 1. Always: 1 night
        {
          key: '1night',
          nights: 1,
          price: pricePerNight,
          label: '1 Night',
          sessions: '1 night',
          tag: 'Per Night',
        },
      ];
      seen.add(1);

      // 2. Real packages sorted by nights
      const pkgDurations = unitPackages
        .map((p) => {
          const nights = Number(p.accommodationNights || p.accommodation_nights || 0);
          if (!nights || nights <= 1) return null;
          return {
            key: `pkg-${p.id}`,
            nights,
            price: Number(p.price) || pricePerNight * nights,
            label: p.name || `${nights} Nights`,
            sessions: `${nights} nights`,
            tag: toTitle(p.packageType || p.package_type || 'Package'),
          };
        })
        .filter(Boolean)
        .sort((a, b) => a.nights - b.nights);

      pkgDurations.forEach((d) => {
        if (!seen.has(d.nights)) {
          seen.add(d.nights);
          durations.push(d);
        }
      });

      // 3. Always: custom
      durations.push({
        key: 'custom',
        nights: null,
        price: pricePerNight,
        label: 'Custom',
        sessions: 'Choose nights',
        tag: 'Flexible',
      });

      return {
        id: unit.id,
        name: unit.name,
        subtitle: toTitle(unit.type || 'Accommodation'),
        icon: <HomeOutlined />,
        featured: idx === 0,
        color: theme.color,
        gradient: theme.gradient,
        shadow: theme.shadow,
        border: theme.border,
        image: primaryImage,
        pricePerNight,
        description: unit.description || `${unit.name} - ${toTitle(unit.type)} accommodation for up to ${unit.capacity} guests.`,
        highlights,
        durations,
        badges: [toTitle(unit.type), `${unit.capacity} guests`]
      };
    });
  };

  const buildDynamicCards = (apiRows = [], serviceKey = dynamicServiceKey) => {
    const isStayMode = normalize(serviceKey).startsWith('stay');

    const filtered = apiRows.filter((pkg) => {
      if (isStayMode) {
        const packageType = normalize(pkg.packageType || pkg.package_type);
        const isAccommodationPackage =
          pkg.includesAccommodation === true ||
          pkg.includes_accommodation === true ||
          packageType.includes('accommodation') ||
          packageType === 'all_inclusive';

        return isAccommodationPackage && isMatchForService(pkg, serviceKey);
      }

      const isLessonOnlyOffer = pkg.isService || (
        (!pkg.packageType || normalize(pkg.packageType) === 'lesson') &&
        pkg.includesRental !== true &&
        pkg.includesAccommodation !== true
      );

      return (pkg.includesLessons !== false) && isLessonOnlyOffer && isMatchForService(pkg, serviceKey);
    });
    if (filtered.length === 0) return [];

    const groups = new Map();
    filtered.forEach((pkg) => {
      const key = isStayMode
        ? (pkg.accommodationUnitName || pkg.accommodation_unit_name || pkg.name)
        : (pkg.lessonServiceName || pkg.lessonServiceId || pkg.name);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(pkg);
    });

    const cardPalette = [
      { color: 'blue', gradient: 'from-blue-600 to-blue-400', shadow: 'shadow-blue-500/20', border: 'hover:border-blue-500/50' },
      { color: 'cyan', gradient: 'from-cyan-500 to-blue-500', shadow: 'shadow-cyan-500/20', border: 'hover:border-cyan-500/50' },
      { color: 'purple', gradient: 'from-purple-600 to-fuchsia-500', shadow: 'shadow-purple-500/20', border: 'hover:border-purple-500/50' },
      { color: 'green', gradient: 'from-green-500 to-emerald-600', shadow: 'shadow-green-500/20', border: 'hover:border-green-500/50' }
    ];

    const cards = Array.from(groups.values()).map((group, idx) => {
      const first = group[0];
      const imageSource = [...group]
        .filter((row) => row?.imageUrl || row?.image_url)
        .sort((a, b) => {
          const aTime = Date.parse(a?.updatedAt || a?.updated_at || a?.createdAt || a?.created_at || 0) || 0;
          const bTime = Date.parse(b?.updatedAt || b?.updated_at || b?.createdAt || b?.created_at || 0) || 0;
          return bTime - aTime;
        })[0] || first;
      const theme = cardPalette[idx % cardPalette.length];
      const durations = group
        .map((pkg) => {
          const nightsRaw = Number(pkg.accommodationNights ?? pkg.accommodation_nights ?? 0);
          const derivedHours = Math.round(Number(pkg.totalHours) || 0);
          const hours = isStayMode
            ? (nightsRaw > 0 ? nightsRaw * 24 : derivedHours)
            : derivedHours;

          if (!hours) return null;

          const stayNights = isStayMode
            ? (nightsRaw > 0 ? nightsRaw : Math.max(1, Math.round(hours / 24)))
            : null;

          return {
            hours: `${hours}h`,
            price: Number(pkg.price) || 0,
            label: pkg.name,
            sessions: isStayMode
              ? `${stayNights} night${stayNights > 1 ? 's' : ''}`
              : (pkg.sessionsCount ? `${pkg.sessionsCount} sessions` : `${hours}h package`),
            tag: isStayMode
              ? toTitle(pkg.packageType || pkg.package_type || 'Stay')
              : (pkg.levelTag ? toTitle(pkg.levelTag) : undefined),
            perPerson: normalize(pkg.lessonCategoryTag).includes('group') || normalize(pkg.lessonCategoryTag).includes('semi'),
            serviceId: pkg.lessonServiceId || pkg.lesson_service_id || null,
            packageId: pkg.isService ? null : (pkg.id || null)
          };
        })
        .filter(Boolean)
        .reduce((acc, current) => {
          const existing = acc.get(current.hours);
          // Keep the cheapest option per duration to avoid duplicate 6h/6h/6h entries
          // Preserve serviceId from the winner
          if (!existing || current.price < existing.price) {
            acc.set(current.hours, current);
          }
          return acc;
        }, new Map())
        .values();

      const sortedDurations = Array.from(durations)
        .sort((a, b) => Number(a.hours.replace('h', '')) - Number(b.hours.replace('h', '')));

      if (sortedDurations.length === 0) return null;

      // All items in a lesson group share the same lessonServiceId
      const groupServiceId = first.lessonServiceId || first.lesson_service_id || null;

      return {
        id: first.id || `${serviceKey || 'lesson'}-${idx}`,
        serviceId: groupServiceId,
        name: isStayMode
          ? (first.accommodationUnitName || first.accommodation_unit_name || first.name)
          : (first.lessonServiceName || toTitle(serviceKey) || first.name),
        subtitle: isStayMode
          ? toTitle(first.packageType || first.package_type || 'Stay')
          : (first.lessonCategoryTag ? toTitle(first.lessonCategoryTag) : 'Configured Package'),
        icon: isStayMode ? <HomeOutlined /> : <RocketOutlined />,
        featured: idx === 0,
        color: theme.color,
        gradient: theme.gradient,
        shadow: theme.shadow,
        border: theme.border,
        image: resolveLessonCardImage(imageSource, serviceKey),
        imageRevision: imageRevisionFromRecord(imageSource),
        description: first.description || (isStayMode
          ? `${first.accommodationUnitName || first.accommodation_unit_name || 'Accommodation'} available for booking.`
          : 'Structured lessons designed for progressive learning.'),
        highlights: isStayMode
          ? buildAccommodationHighlights(first)
          : [
              'Equipment included',
              first.levelTag ? `Level: ${toTitle(first.levelTag)}` : 'Progress-based sessions',
              'Professional instruction',
              'Flexible durations',
              'Book directly'
            ],
        durations: sortedDurations,
        badges: isStayMode
          ? [toTitle(first.packageType || first.package_type || 'Stay'), first.accommodationUnitType || 'Unit']
          : [toTitle(first.lessonCategoryTag || 'Lesson'), toTitle(first.levelTag || 'Package')],
        lessonCategoryTag: normalize(first.lessonCategoryTag || '')
      };
    }).filter(Boolean);

    // Apply custom display order for lesson cards
    if (!isStayMode) {
      // Sort by name using specific-first pattern matching to avoid substring collisions
      const getLessonPriority = (name) => {
        if (name.includes('semi private supervision')) return 5;
        if (name.includes('semi private')) return 2;
        if (name.includes('group')) return 3;
        if (name.includes('supervision')) return 4;
        if (name.includes('private')) return 1;
        if (name.includes('advanced')) return 6;
        if (name.includes('premium')) return 7;
        if (name.includes('boat')) return 8;
        return 999;
      };
      cards.sort((a, b) => {
        return getLessonPriority(normalize(a.name)) - getLessonPriority(normalize(b.name));
      });
      // Re-assign colors and featured flag based on new order
      cards.forEach((card, idx) => {
        const theme = cardPalette[idx % cardPalette.length];
        card.featured = idx === 0;
        card.color = theme.color;
        card.gradient = theme.gradient;
        card.shadow = theme.shadow;
        card.border = theme.border;
      });
    }

    return cards;
  };

  const transformServiceToPackage = (s) => {
    // Try to find price in standard structure
    const eurPriceObj = Array.isArray(s.prices) 
      ? s.prices.find((p) => (p.currencyCode === 'EUR' || p.currency_code === 'EUR')) 
      : null;
      
    const basePrice = eurPriceObj 
      ? (eurPriceObj.price || eurPriceObj.amount) 
      : (s.price || 0);

    const parseDuration = (d) => {
        if (!d) return 1;
        if (typeof d === 'number') return d;
        if (typeof d === 'string') {
            if (d.includes(':')) {
                const parts = d.split(':');
                return parseFloat(parts[0]) + (parseFloat(parts[1] || 0) / 60);
            }
            return parseFloat(d) || 1;
        }
        if (typeof d === 'object') {
             // Postgres interval: { hours: 1, minutes: 30 }
            let h = 0;
            if (d.hours) h += d.hours;
            if (d.minutes) h += d.minutes / 60;
            return h || 1;
        }
        return 1;
    };

    const hours = s.duration_minutes 
      ? (s.duration_minutes / 60) 
      : parseDuration(s.duration);
    
    // Ensure disciplineTag is set correctly for filtering
    let dTag = s.disciplineTag || s.discipline_tag;
    if (!dTag) {
        // Build a combined text string to guess discipline
        const searchText = (s.name + ' ' + (s.category || '') + ' ' + (s.description || '')).toLowerCase();
        
        if (searchText.includes('kite')) dTag = 'kite';
        else if (searchText.includes('wing')) dTag = 'wing';
        else if (searchText.includes('efoil') || searchText.includes('e-foil') || searchText.includes('electric')) dTag = 'efoil';
        else if (searchText.includes('foil')) dTag = 'foil'; 
        else dTag = s.category || 'generic';
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
      updatedAt: s.updatedAt || s.updated_at,
      isService: true
    };
  };

  useEffect(() => {
    let cancelled = false;
    if (!dynamicServiceKey) return undefined;

    const isStayMode = normalize(dynamicServiceKey).startsWith('stay');
    setIsLoading(true);

    (async () => {
      try {
        if (isStayMode) {
          // For stay pages, fetch units only — no lesson packages should appear
          const unitsRes = await apiClient.get('/accommodation/units/public');
          const units = Array.isArray(unitsRes.data) ? unitsRes.data : [];
          const allPackages = []; // Only show 1-night + custom durations
          
          // Filter units by category (hotel = external/third-party, own = our property)
          const filteredUnits = units.filter((unit) => {
            const unitCat = normalize(unit.category || '');
            if (normalize(dynamicServiceKey) === 'stay_hotel') {
              return unitCat === 'hotel';
            }
            if (normalize(dynamicServiceKey) === 'stay_home') {
              return unitCat === 'own';
            }
            return true; // 'stay' shows all
          });
          
          const cards = buildAccommodationUnitCards(filteredUnits, allPackages);
          if (!cancelled) {
            setRawUnits(filteredUnits);
            setDynamicPackages(cards);
          }
        } else if (normalize(dynamicServiceKey).startsWith('rental_')) {
          // Rental segment page — fetch services and build discipline-filterable cards
          const servicesRes = await apiClient.get('/services');
          const rawServices = Array.isArray(servicesRes.data) ? servicesRes.data : [];
          const cards = buildRentalCards(rawServices, dynamicServiceKey);
          const discs = [
            ...new Set(
              cards.flatMap((c) =>
                Array.isArray(c.rentalDisciplineTags) && c.rentalDisciplineTags.length > 0
                  ? c.rentalDisciplineTags
                  : c.disciplineTag
                    ? [c.disciplineTag]
                    : []
              )
            ),
          ];
          if (!cancelled) {
            setDynamicPackages(cards);
            setAvailableDisciplines(discs);
          }
        } else {
          // For lesson pages, fetch packages and services as before
          const [packagesRes, servicesRes] = await Promise.all([
            apiClient.get('/services/packages/public'),
            apiClient.get('/services')
          ]);
          
          const packageRows = Array.isArray(packagesRes.data) ? packagesRes.data : [];
          const rawServices = Array.isArray(servicesRes.data) ? servicesRes.data : [];

          // Resolve missing lessonServiceId on packages by matching lessonServiceName
          // against the actual services list. Many packages are created with a name
          // link but no ID link in the database.
          const lessonServices = rawServices.filter((s) => normalize(s.category) === 'lesson');
          packageRows.forEach((pkg) => {
            if (!pkg.lessonServiceId && pkg.lessonServiceName) {
              const match = lessonServices.find(
                (s) => normalize(s.name) === normalize(pkg.lessonServiceName)
              );
              if (match) {
                pkg.lessonServiceId = match.id;
              }
            }
          });

          // Transform services into compatible format
          const serviceRows = rawServices
            .filter((s) => !s.package_id && normalize(s.category) === 'lesson') // Only standalone lesson services
            .map(transformServiceToPackage);

          const allRows = [...packageRows, ...serviceRows];
          const mappedByService = buildDynamicCards(allRows, dynamicServiceKey);

          if (!cancelled) {
            setDynamicPackages(mappedByService);
            setRawPackageRows(packageRows);
          }
        }
      } catch (error) {
        if (!cancelled) setDynamicPackages([]);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dynamicServiceKey]);

  useEffect(() => () => {
    packageDetailsModalDepsRef.current = {};
  }, []);

  const displayPackages = useMemo(() => {
    const base = dynamicServiceKey ? dynamicPackages : (dynamicPackages.length > 0 ? dynamicPackages : packages);
    if (!disciplineFilter) return base;
    return base.filter((p) => {
      const tags =
        Array.isArray(p.rentalDisciplineTags) && p.rentalDisciplineTags.length > 0
          ? p.rentalDisciplineTags
          : p.disciplineTag
            ? [p.disciplineTag]
            : [];
      // Services without discipline tags still show under any filter; avoid empty grid when filter is on.
      if (tags.length === 0) return true;
      return tags.includes(disciplineFilter);
    });
  }, [dynamicPackages, packages, dynamicServiceKey, disciplineFilter]);

  // Keep package details modal in sync when services/packages refetch (e.g. cover image updated in admin).
  useEffect(() => {
    const snap = getPackageDetailsModalSnapshot();
    if (!snap.open || !snap.package?.id) return;
    const live = displayPackages.find((p) => String(p.id) === String(snap.package.id));
    if (!live) return;
    const prev = snap.package;
    if (
      live.image === prev.image &&
      live.description === prev.description &&
      live.name === prev.name
    ) {
      return;
    }
    refreshOpenPackageDetailsModal(live);
  }, [displayPackages]);

  // Handle booking: auth-gate then open inline modal (wizard or accommodation picker)
  const handleBookNow = (pkg, durationIndex, durationOverride = null) => {
    const selectedDur = durationOverride ?? pkg?.durations?.[durationIndex];
    const durationHours = selectedDur?.hours;
    if (!user) {
      // Close any open card/stay modals so the auth modal is visible on top
      closePackageDetailsModal();
      setStayModalVisible(false);
      openAuthModal({
        title: 'Sign in to Book',
        message: 'Create an account or sign in to book this service.',
        mode: 'register',
        returnUrl: window.location.pathname
      });
      return;
    }

    if (academyTheme === 'stay' || normalize(dynamicServiceKey || '').startsWith('stay')) {
      // Open accommodation booking modal with the selected unit
      const unitData = rawUnits.find(u => String(u.id) === String(pkg?.id)) || pkg || {};
      setAccomBookingUnit(unitData);
      setAccomModalOpen(true);
      setStayModalVisible(false);
    } else {
      // Open StudentBookingWizard for lessons / rentals
      const isRental = academyTheme === 'rental';
      const serviceCategory = isRental ? 'rental' : 'lesson';

      // Parse duration — numeric from rental rows when set; else "6h", "1.5h", "1d", "1 week", etc.
      let parsedDurationHours = null;
      if (selectedDur?.hoursNumeric != null && Number.isFinite(Number(selectedDur.hoursNumeric))) {
        parsedDurationHours = Number(selectedDur.hoursNumeric);
      } else if (durationHours) {
        const durStr = String(durationHours).trim().toLowerCase();
        if (durStr.endsWith('h')) {
          parsedDurationHours = parseFloat(durStr);
        } else if (durStr.endsWith('d')) {
          parsedDurationHours = parseFloat(durStr) * 24;
        } else if (/\bweek/.test(durStr)) {
          const m = durStr.match(/(\d+(?:\.\d+)?)/);
          const n = m ? parseFloat(m[1]) : 1;
          parsedDurationHours = (Number.isFinite(n) ? n : 1) * 168;
        } else {
          parsedDurationHours = parseFloat(durStr) || null;
        }
      }

      // Resolve service ID and package ID from the selected card + duration
      let resolvedServiceId = null;
      let resolvedPackageId = null;
      if (pkg && selectedDur) {
        if (selectedDur.serviceId) resolvedServiceId = selectedDur.serviceId;
        if (selectedDur.packageId) resolvedPackageId = selectedDur.packageId;
        if (!resolvedServiceId && pkg.serviceId) resolvedServiceId = pkg.serviceId;
      }

      // For lesson packages: use the streamlined QuickBookingModal
      if (!isRental && resolvedPackageId) {
        const rawPkg = rawPackageRows.find(p => String(p.id) === String(resolvedPackageId));
        if (rawPkg) {
          setQuickBookingData({
            packageData: rawPkg,
            serviceId: resolvedServiceId,
            durationHours: parsedDurationHours,
            proRataTotalHours: selectedDur?.isCustomProRata ? parsedDurationHours : undefined,
          });
          setQuickBookingOpen(true);
          closePackageDetailsModal();
          return;
        }
      }

      // For standalone lesson services (no package): also use QuickBookingModal
      if (!isRental && resolvedServiceId && !resolvedPackageId) {
        setQuickBookingData({
          packageData: null,
          serviceId: resolvedServiceId,
          durationHours: parsedDurationHours,
          servicePrice: selectedDur?.price || 0,
          serviceName: pkg.name || 'Lesson',
        });
        setQuickBookingOpen(true);
        closePackageDetailsModal();
        return;
      }

      // For rentals: use the streamlined RentalBookingModal
      if (isRental && resolvedServiceId) {
        setRentalBookingData({
          serviceId: resolvedServiceId,
          serviceName: pkg.name || 'Equipment Rental',
          servicePrice: selectedDur?.price || 0,
          serviceCurrency: 'EUR',
          durationHours: parsedDurationHours || 1,
          serviceDescription: pkg.description || '',
        });
        setRentalBookingOpen(true);
        closePackageDetailsModal();
        return;
      }

      // Fallback: use full StudentBookingWizard
      setBookingInitialData({
        serviceCategory,
        preferredCategory: dynamicServiceKey || undefined,
        durationHours: parsedDurationHours || undefined,
        serviceId: resolvedServiceId || undefined,
        step: resolvedServiceId ? 1 : 0,
      });
      setBookingWizardOpen(true);
      closePackageDetailsModal();
    }
  };

  const handleQuickBookingClose = () => {
    setQuickBookingOpen(false);
    setQuickBookingData(null);
  };

  const handleRentalBookingClose = () => {
    setRentalBookingOpen(false);
    setRentalBookingData(null);
  };

  const handleBookingWizardClose = () => {
    setBookingWizardOpen(false);
    setBookingInitialData({});
  };

  const handleAccomModalClose = () => {
    setAccomModalOpen(false);
    setAccomBookingUnit(null);
  };

  const handleCardClick = (pkg) => {
    if (isStayPage) {
      // Find the matching raw unit by card id (unit.id)
      const unit = rawUnits.find((u) => String(u.id) === String(pkg.id)) || {};
      setStayModalUnit(unit);
      setStayModalPkg(pkg);
      setStayModalVisible(true);
    } else {
      openPackageDetailsModal(pkg);
    }
  };

  const handleStayModalClose = () => {
    setStayModalVisible(false);
    setTimeout(() => {
      setStayModalUnit(null);
      setStayModalPkg(null);
    }, 300);
  };

  packageDetailsModalDepsRef.current = { handleBookNow, ownedByPackageId };

  const formatPrice = (eurPrice) => {
    const eurFormatted = formatCurrency(eurPrice, 'EUR');
    if (!userCurrency || userCurrency === 'EUR') return eurFormatted;
    const converted = convertCurrency(eurPrice, 'EUR', userCurrency);
    return `${eurFormatted} (~${formatCurrency(converted, userCurrency)})`;
  };

  const normalizedTag = normalize(academyTag);
  const resolvedTheme = (() => {
    const explicitTheme = normalize(academyTheme);
    if (explicitTheme && explicitTheme !== 'auto') {
      if (explicitTheme === 'green') return 'academy';
      if (explicitTheme === 'orange') return 'rental';
      return explicitTheme;
    }
    if (normalizedTag.includes('rental')) return 'rental';
    if (normalizedTag.includes('premium')) return 'premium';
    if (normalizedTag.includes('member')) return 'member';
    if (normalizedTag.includes('stay')) return 'stay';
    if (normalizedTag.includes('experience')) return 'experience';
    return 'academy';
  })();

  const pageBackgroundClassMap = {
    academy: 'bg-[#f4f6f8]',
    rental: 'bg-[#f4f6f8]',
    member: 'bg-[#f4f6f8]',
    stay: 'bg-[#f4f6f8]',
    experience: 'bg-[#f4f6f8]',
    premium: 'bg-[#f4f6f8]'
  };
  const selectionClassMap = {
    academy: 'selection:bg-emerald-400/30',
    rental: 'selection:bg-orange-400/30',
    member: 'selection:bg-lime-300/30',
    stay: 'selection:bg-blue-400/30',
    experience: 'selection:bg-yellow-400/30',
    premium: 'selection:bg-amber-400/30'
  };
  const academyTagClassMap = {
    academy: '!bg-emerald-500/15 !border-emerald-500/40 !text-emerald-600',
    rental: '!bg-orange-500/15 !border-orange-500/40 !text-orange-600',
    member: '!bg-lime-400/10 !border-lime-400/30 !text-lime-300',
    stay: '!bg-blue-500/10 !border-blue-500/30 !text-blue-400',
    experience: '!bg-yellow-500/10 !border-yellow-500/30 !text-yellow-400',
    premium: '!bg-amber-500/10 !border-amber-500/30 !text-amber-400'
  };
  const accentWordClassMap = {
    academy: 'text-transparent bg-clip-text bg-gradient-to-r from-emerald-500 to-green-500',
    rental: 'text-transparent bg-clip-text bg-gradient-to-r from-orange-500 to-amber-500',
    member: 'text-transparent bg-clip-text bg-gradient-to-r from-lime-500 to-emerald-500',
    stay: 'text-transparent bg-clip-text bg-gradient-to-r from-blue-500 to-sky-500',
    experience: 'text-transparent bg-clip-text bg-gradient-to-r from-yellow-500 to-amber-500',
    premium: 'text-transparent bg-clip-text bg-gradient-to-r from-amber-500 to-orange-500'
  };
  const cardTitleHoverClassMap = {
    academy: 'group-hover:text-emerald-400',
    rental: 'group-hover:text-orange-400',
    member: 'group-hover:text-lime-300',
    stay: 'group-hover:text-blue-400',
    experience: 'group-hover:text-yellow-400',
    premium: 'group-hover:text-amber-400'
  };

  const pageBackgroundClass = pageBackgroundClassMap[resolvedTheme] || pageBackgroundClassMap.academy;
  const selectionClass = selectionClassMap[resolvedTheme] || selectionClassMap.academy;
  const academyTagClass = academyTagClassMap[resolvedTheme] || academyTagClassMap.academy;
  const accentWordClass = accentWordClassMap[resolvedTheme] || accentWordClassMap.academy;
  const cardTitleHoverClass = cardTitleHoverClassMap[resolvedTheme] || cardTitleHoverClassMap.academy;

  // Page background: radial gradients only (no filter: blur). Large blur blobs on
  // desktop were competing with modals/overlays for GPU fill-rate; gradients stay cheap.
  const pageBgGradientMap = {
    rental: {
      background: [
        'radial-gradient(ellipse 80% 50% at 90% 10%, rgba(251,146,60,0.14) 0%, transparent 70%)',
        'radial-gradient(ellipse 60% 60% at 10% 50%, rgba(251,191,36,0.10) 0%, transparent 70%)',
        'radial-gradient(ellipse 70% 40% at 60% 90%, rgba(249,115,22,0.09) 0%, transparent 70%)',
      ].join(', '),
    },
    member: {
      background: [
        'radial-gradient(ellipse 80% 50% at 10% 10%, rgba(190,242,100,0.10) 0%, transparent 70%)',
        'radial-gradient(ellipse 60% 60% at 90% 50%, rgba(52,211,153,0.09) 0%, transparent 70%)',
        'radial-gradient(ellipse 70% 40% at 40% 90%, rgba(163,230,53,0.08) 0%, transparent 70%)',
      ].join(', '),
    },
    stay: {
      background: [
        'radial-gradient(ellipse 80% 50% at 10% 15%, rgba(96,165,250,0.12) 0%, transparent 70%)',
        'radial-gradient(ellipse 60% 60% at 90% 50%, rgba(56,189,248,0.10) 0%, transparent 70%)',
        'radial-gradient(ellipse 70% 40% at 50% 90%, rgba(59,130,246,0.08) 0%, transparent 70%)',
      ].join(', '),
    },
    experience: {
      background: [
        'radial-gradient(ellipse 80% 50% at 90% 10%, rgba(253,224,71,0.12) 0%, transparent 70%)',
        'radial-gradient(ellipse 60% 60% at 10% 50%, rgba(251,191,36,0.10) 0%, transparent 70%)',
        'radial-gradient(ellipse 70% 40% at 60% 90%, rgba(234,179,8,0.08) 0%, transparent 70%)',
      ].join(', '),
    },
    premium: {
      background: [
        'radial-gradient(ellipse 80% 50% at 10% 15%, rgba(252,211,77,0.12) 0%, transparent 70%)',
        'radial-gradient(ellipse 60% 60% at 90% 45%, rgba(251,146,60,0.10) 0%, transparent 70%)',
        'radial-gradient(ellipse 70% 40% at 50% 90%, rgba(245,158,11,0.08) 0%, transparent 70%)',
      ].join(', '),
    },
    academy: {
      background: [
        'radial-gradient(ellipse 80% 50% at 10% 15%, rgba(52,211,153,0.15) 0%, transparent 70%)',
        'radial-gradient(ellipse 60% 60% at 85% 40%, rgba(34,197,94,0.12) 0%, transparent 70%)',
        'radial-gradient(ellipse 70% 40% at 50% 90%, rgba(5,150,105,0.10) 0%, transparent 70%)',
      ].join(', '),
    },
  };

  const bgTheme = (
    <div
      className="fixed inset-0 pointer-events-none z-0"
      style={pageBgGradientMap[resolvedTheme] || pageBgGradientMap.academy}
    />
  );

  // Memoize rendered cards to prevent re-rendering the entire massive grid
  // when simply opening/closing a modal
  const renderedCards = useMemo(() => {
    return displayPackages.map((pkg) => {
      const imagePosition = resolveLessonCardImagePosition(pkg, dynamicServiceKey);
      const resolvedImageSrc = pkg.image
        ? resolvePublicUploadUrl(pkg.image, pkg.imageRevision)
        : '';

      return (
        <AcademyLessonPackageCard
          key={pkg.id}
          pkg={pkg}
          resolvedImageSrc={resolvedImageSrc}
          imagePosition={imagePosition}
          formatPrice={formatPrice}
          cardTitleHoverClass={cardTitleHoverClass}
          onCardClick={() => handleCardClick(pkg)}
          showCheapestPerHour={!isStayPage && !isRentalPage && LESSON_KEYS.has(normalize(dynamicServiceKey || ''))}
        />
      );
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displayPackages, cardTitleHoverClass, userCurrency, isStayPage, isRentalPage, dynamicServiceKey]);

  const isLessonNavPage = LESSON_KEYS.has(normalize(dynamicServiceKey || ''));

  return (
    <div className={`min-h-screen text-slate-900 font-sans relative ${pageBackgroundClass} ${selectionClass}`} style={{ overflowX: 'clip' }}>
      {bgTheme}

      {/* Lesson category sticky nav — shown on all individual lesson pages */}
      {isLessonNavPage && (
        <StickyNavBar
          items={LESSON_NAV_ITEMS}
          activeItem={normalize(dynamicServiceKey)}
          onItemClick={(id) => {
            const item = LESSON_NAV_ITEMS.find(n => n.id === id);
            if (item) navigate(item.path);
          }}
        />
      )}

      {/* Rental category sticky nav — shown on all individual rental pages */}
      {isRentalPage && (
        <StickyNavBar
          items={RENTAL_NAV_ITEMS}
          activeItem={normalize(dynamicServiceKey)}
          onItemClick={(id) => {
            const item = RENTAL_NAV_ITEMS.find(n => n.id === id);
            if (item) navigate(item.path);
          }}
        />
      )}

      <div className="relative z-10 py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center pt-8">
          <h1 className="text-4xl md:text-5xl font-duotone-bold-extended text-slate-900 mb-4 uppercase">
            {headline} <span className={accentWordClass}>{accentWord}</span>
          </h1>
          <p className="text-lg md:text-xl font-duotone-regular text-slate-500 max-w-3xl mx-auto leading-relaxed">
            {subheadline}
          </p>

          {/* Discipline filter pills — always shown on rental segment pages */}
          {isRentalPage && (
            <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
              <button
                onClick={() => setDisciplineFilter(null)}
                className={`px-4 py-1.5 rounded-full text-sm font-semibold border transition-all ${
                  disciplineFilter === null
                    ? 'bg-slate-900 border-slate-900 text-white'
                    : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50 hover:border-slate-300'
                }`}
              >
                All Services
              </button>
              {RENTAL_DISCIPLINES.map(disc => {
                const meta = DISCIPLINE_META[disc];
                if (!meta) return null;
                return (
                  <button
                    key={disc}
                    onClick={() => setDisciplineFilter(disciplineFilter === disc ? null : disc)}
                    className={`px-4 py-1.5 rounded-full text-sm font-semibold border transition-all ${
                      disciplineFilter === disc
                        ? meta.active
                        : 'bg-white/5 border-white/10 text-gray-400 hover:bg-white/10'
                    }`}
                  >
                    {meta.label}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-32">
        {isLoading ? (
          <div className="flex justify-center py-20">
            <Spin size="large" />
          </div>
        ) : displayPackages.length === 0 ? (
          <div className="rounded-3xl border border-slate-200 bg-white p-10 text-center shadow-sm">
            <h3 className="text-xl font-bold text-slate-900 mb-2">
              {normalize(dynamicServiceKey).startsWith('stay') 
                ? 'No accommodation units available' 
                : 'No configured packages yet'}
            </h3>
            <p className="text-slate-500 max-w-2xl mx-auto">
              {normalize(dynamicServiceKey).startsWith('stay')
                ? 'No accommodation units have been added to the system yet. Check back soon or contact us for availability.'
                : 'This page only shows live packages configured in the admin panel for this discipline. Create lesson services and packages in Services → Lessons to publish them here.'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-5">
            {renderedCards}
          </div>
        )}
      </div>

      {/* Stay-specific gallery modal */}
      {isStayPage && stayModalPkg && (
        <StayAccommodationModal
          unit={stayModalUnit}
          pkg={stayModalPkg}
          visible={stayModalVisible}
          onClose={handleStayModalClose}
          onBookNow={handleBookNow}
        />
      )}

      {promoBanner}

      {/* Cross-sell: Shop · Rental · Stay */}
      {isLessonPage && <AcademyCrossSellBanner />}

      {/* Contact Us Section */}
      <div className={`py-16 sm:py-20 ${pageBackgroundClass} border-t border-slate-200`}>
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-2xl sm:text-3xl font-duotone-bold-extended mb-3 text-slate-900">Not sure which package is right for you?</h2>
          <p className="text-slate-500 font-duotone-regular mb-8 text-sm sm:text-base max-w-xl mx-auto leading-relaxed">
            Our team is happy to help you pick the best option based on your experience level, goals, and schedule. Reach out — we don&apos;t bite.
          </p>
          <div className="flex justify-center">
            <Button
              type="primary"
              size="large"
              onClick={() => navigate('/contact')}
              className="!h-12 !rounded-md font-duotone-bold !px-10 !text-base shadow-lg transition-transform hover:scale-[1.02] active:scale-95"
              style={{ backgroundColor: '#4b4f54', color: '#00a8c4', border: '1px solid rgba(0,168,196,0.5)', boxShadow: '0 0 12px rgba(0,168,196,0.2)' }}
            >
              Contact Us
            </Button>
          </div>
          <ContactOptionsBanner variant="light" />
        </div>
      </div>

      {/* Booking Wizard — lessons & rentals */}
      <StudentBookingWizard
        open={bookingWizardOpen}
        onClose={handleBookingWizardClose}
        initialData={bookingInitialData}
      />

      {/* Quick Booking Modal — lesson packages */}
      <QuickBookingModal
        open={quickBookingOpen}
        onClose={handleQuickBookingClose}
        packageData={quickBookingData?.packageData}
        serviceId={quickBookingData?.serviceId}
        durationHours={quickBookingData?.durationHours}
        proRataTotalHours={quickBookingData?.proRataTotalHours}
        servicePrice={quickBookingData?.servicePrice}
        serviceName={quickBookingData?.serviceName}
      />

      {/* Rental Booking Modal — equipment rentals */}
      <RentalBookingModal
        open={rentalBookingOpen}
        onClose={handleRentalBookingClose}
        serviceId={rentalBookingData?.serviceId}
        serviceName={rentalBookingData?.serviceName}
        servicePrice={rentalBookingData?.servicePrice}
        serviceCurrency={rentalBookingData?.serviceCurrency}
        durationHours={rentalBookingData?.durationHours}
        serviceDescription={rentalBookingData?.serviceDescription}
      />

      {/* Accommodation Booking Modal — stays */}
      <AccommodationBookingModal
        open={accomModalOpen}
        onClose={handleAccomModalClose}
        unit={accomBookingUnit}
      />
    </div>
  );
};

export default AcademyServicePackagesPage;
