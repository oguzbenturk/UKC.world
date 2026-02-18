import { useEffect, useMemo, useState } from 'react';
import { Button, Modal, Tag } from 'antd';
import StayAccommodationModal from './StayAccommodationModal';
import {
  RocketOutlined,
  HomeOutlined,
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
  academyTag = 'UKC.Academy',
  academyTheme = 'auto',
  packages = [],
  dynamicServiceKey = null
}) => {
  const { formatCurrency, convertCurrency, userCurrency } = useCurrency();
  const [selectedPackage, setSelectedPackage] = useState(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedDuration, setSelectedDuration] = useState('6h');
  const [dynamicPackages, setDynamicPackages] = useState([]);
  // For stay pages: keep raw unit objects so the gallery modal has full data
  const [rawUnits, setRawUnits] = useState([]);
  const [stayModalUnit, setStayModalUnit] = useState(null);
  const [stayModalPkg, setStayModalPkg] = useState(null);
  const [stayModalVisible, setStayModalVisible] = useState(false);

  usePageSEO({
    title: seoTitle,
    description: seoDescription
  });

  const normalize = (v) => String(v || '').toLowerCase();
  const isStayPage = normalize(dynamicServiceKey || '').startsWith('stay');

  const isMatchForService = (pkg, key) => {
    if (!key) return true;
    const normKey = normalize(key);

    const packageType = normalize(pkg.packageType || pkg.package_type);
    const includesAccommodation = pkg.includesAccommodation === true || pkg.includes_accommodation === true;
    const accommodationUnitType = normalize(pkg.accommodationUnitType || pkg.accommodation_unit_type);
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
      const hasTypedRule = accommodationUnitType.length > 0;
      const isHotelByType = accommodationUnitType === 'room';
      const isHotelLike = ['hotel', 'otel', 'burlahan'].some((token) => accommodationText.includes(token));
      if (hasTypedRule) return isAccommodationPackage && isHotelByType;
      return isAccommodationPackage && isHotelLike;
    }

    if (normKey === 'stay_home') {
      const hasTypedRule = accommodationUnitType.length > 0;
      const isHomeByType = accommodationUnitType !== 'room';
      const isHomeLike = ['home', 'house', 'farm', 'studio', 'staff', 'villa', 'pool'].some((token) => accommodationText.includes(token));
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

    return Array.from(groups.values()).map((group, idx) => {
      const first = group[0];
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
            perPerson: normalize(pkg.lessonCategoryTag).includes('group') || normalize(pkg.lessonCategoryTag).includes('semi')
          };
        })
        .filter(Boolean)
        .reduce((acc, current) => {
          const existing = acc.get(current.hours);
          // Keep the cheapest option per duration to avoid duplicate 6h/6h/6h entries
          if (!existing || current.price < existing.price) {
            acc.set(current.hours, current);
          }
          return acc;
        }, new Map())
        .values();

      const sortedDurations = Array.from(durations)
        .sort((a, b) => Number(a.hours.replace('h', '')) - Number(b.hours.replace('h', '')));

      if (sortedDurations.length === 0) return null;

      return {
        id: first.id || `${serviceKey || 'lesson'}-${idx}`,
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
        image: resolveLessonCardImage(first, serviceKey),
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
          : [toTitle(first.lessonCategoryTag || 'Lesson'), toTitle(first.levelTag || 'Package')]
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
      isService: true
    };
  };

  useEffect(() => {
    let cancelled = false;
    if (!dynamicServiceKey) return undefined;

    const isStayMode = normalize(dynamicServiceKey).startsWith('stay');

    (async () => {
      try {
        if (isStayMode) {
          // For stay pages, fetch units only — no lesson packages should appear
          const unitsRes = await apiClient.get('/accommodation/units/public');
          const units = Array.isArray(unitsRes.data) ? unitsRes.data : [];
          const allPackages = []; // Only show 1-night + custom durations
          
          // Filter units by type (hotel vs home)
          const filteredUnits = units.filter((unit) => {
            const unitType = normalize(unit.type);
            if (normalize(dynamicServiceKey) === 'stay_hotel') {
              return unitType === 'room';
            }
            if (normalize(dynamicServiceKey) === 'stay_home') {
              return unitType !== 'room' && unitType.length > 0;
            }
            return true; // 'stay' shows all
          });
          
          const cards = buildAccommodationUnitCards(filteredUnits, allPackages);
          if (!cancelled) {
            setRawUnits(filteredUnits);
            setDynamicPackages(cards);
          }
        } else {
          // For lesson pages, fetch packages and services as before
          const [packagesRes, servicesRes] = await Promise.all([
            apiClient.get('/services/packages/public'),
            apiClient.get('/services')
          ]);
          
          const packageRows = Array.isArray(packagesRes.data) ? packagesRes.data : [];
          const rawServices = Array.isArray(servicesRes.data) ? servicesRes.data : [];

          // Transform services into compatible format
          const serviceRows = rawServices
            .filter((s) => !s.package_id && normalize(s.category) === 'lesson') // Only standalone lesson services
            .map(transformServiceToPackage);

          const allRows = [...packageRows, ...serviceRows];
          const mappedByService = buildDynamicCards(allRows, dynamicServiceKey);

          if (!cancelled) setDynamicPackages(mappedByService);
        }
      } catch (error) {
        console.error('Error fetching dynamic content:', error);
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
    if (isStayPage) {
      // Find the matching raw unit by card id (unit.id)
      const unit = rawUnits.find((u) => String(u.id) === String(pkg.id)) || {};
      setStayModalUnit(unit);
      setStayModalPkg(pkg);
      setStayModalVisible(true);
    } else {
      setSelectedPackage(pkg);
      setSelectedDuration((pkg.durations[1] || pkg.durations[0])?.hours || '6h');
      setModalVisible(true);
    }
  };

  const handleModalClose = () => {
    setModalVisible(false);
    setTimeout(() => {
      setSelectedPackage(null);
      setSelectedDuration('6h');
    }, 300);
  };

  const handleStayModalClose = () => {
    setStayModalVisible(false);
    setTimeout(() => {
      setStayModalUnit(null);
      setStayModalPkg(null);
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
    academy: 'bg-[#0d1511]',
    rental: 'bg-[#16110d]',
    member: 'bg-[#10140f]',
    stay: 'bg-[#0d1118]',
    experience: 'bg-[#17140b]',
    premium: 'bg-[#15120d]'
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
    academy: '!bg-emerald-500/10 !border-emerald-500/30 !text-emerald-400',
    rental: '!bg-orange-500/10 !border-orange-500/30 !text-orange-400',
    member: '!bg-lime-400/10 !border-lime-400/30 !text-lime-300',
    stay: '!bg-blue-500/10 !border-blue-500/30 !text-blue-400',
    experience: '!bg-yellow-500/10 !border-yellow-500/30 !text-yellow-400',
    premium: '!bg-amber-500/10 !border-amber-500/30 !text-amber-400'
  };
  const accentWordClassMap = {
    academy: 'text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-green-400',
    rental: 'text-transparent bg-clip-text bg-gradient-to-r from-orange-400 to-amber-400',
    member: 'text-transparent bg-clip-text bg-gradient-to-r from-lime-300 to-emerald-400',
    stay: 'text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-sky-400',
    experience: 'text-transparent bg-clip-text bg-gradient-to-r from-yellow-300 to-amber-400',
    premium: 'text-transparent bg-clip-text bg-gradient-to-r from-amber-300 to-orange-400'
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

  const bgTheme = (
    <div className="fixed inset-0 w-full h-full overflow-hidden pointer-events-none z-0">
      {resolvedTheme === 'rental' && (
        <>
          <div className="absolute top-[-12%] right-[-8%] w-[900px] h-[900px] bg-orange-400/20 rounded-full blur-[150px]" />
          <div className="absolute top-[22%] left-[-10%] w-[760px] h-[760px] bg-amber-400/16 rounded-full blur-[130px]" />
          <div className="absolute bottom-[-8%] right-[22%] w-[680px] h-[680px] bg-orange-500/14 rounded-full blur-[120px]" />
        </>
      )}
      {resolvedTheme === 'member' && (
        <>
          <div className="absolute top-[-12%] left-[-10%] w-[900px] h-[900px] bg-lime-300/16 rounded-full blur-[150px]" />
          <div className="absolute top-[24%] right-[-8%] w-[780px] h-[780px] bg-emerald-400/14 rounded-full blur-[135px]" />
          <div className="absolute bottom-[-10%] left-[24%] w-[720px] h-[720px] bg-lime-400/12 rounded-full blur-[125px]" />
        </>
      )}
      {resolvedTheme === 'stay' && (
        <>
          <div className="absolute top-[-10%] left-[-8%] w-[860px] h-[860px] bg-blue-400/18 rounded-full blur-[145px]" />
          <div className="absolute top-[24%] right-[-8%] w-[760px] h-[760px] bg-sky-400/15 rounded-full blur-[135px]" />
          <div className="absolute bottom-[-10%] left-[30%] w-[680px] h-[680px] bg-blue-500/12 rounded-full blur-[120px]" />
        </>
      )}
      {resolvedTheme === 'experience' && (
        <>
          <div className="absolute top-[-12%] right-[-8%] w-[920px] h-[920px] bg-yellow-300/18 rounded-full blur-[155px]" />
          <div className="absolute top-[22%] left-[-10%] w-[760px] h-[760px] bg-amber-400/16 rounded-full blur-[135px]" />
          <div className="absolute bottom-[-10%] right-[20%] w-[700px] h-[700px] bg-yellow-500/12 rounded-full blur-[120px]" />
        </>
      )}
      {resolvedTheme === 'premium' && (
        <>
          <div className="absolute top-[-12%] left-[-10%] w-[900px] h-[900px] bg-amber-300/18 rounded-full blur-[150px]" />
          <div className="absolute top-[20%] right-[-8%] w-[800px] h-[800px] bg-orange-400/16 rounded-full blur-[140px]" />
          <div className="absolute bottom-[-8%] left-[30%] w-[700px] h-[700px] bg-amber-500/12 rounded-full blur-[130px]" />
        </>
      )}
      {resolvedTheme === 'academy' && (
        <>
          <div className="absolute top-[-12%] left-[-10%] w-[950px] h-[950px] bg-emerald-400/24 rounded-full blur-[150px]" />
          <div className="absolute top-[16%] right-[-8%] w-[860px] h-[860px] bg-green-500/20 rounded-full blur-[140px]" />
          <div className="absolute bottom-[-8%] left-[30%] w-[760px] h-[760px] bg-emerald-600/18 rounded-full blur-[130px]" />
          <div className="absolute top-[45%] left-[18%] w-[620px] h-[620px] bg-green-400/12 rounded-full blur-[120px]" />
        </>
      )}
    </div>
  );

  return (
    <div className={`min-h-screen text-white font-sans relative overflow-hidden ${pageBackgroundClass} ${selectionClass}`}>
      {bgTheme}
      
      <div className="relative z-10 py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <Tag className={`mb-2 !px-4 !py-1 !rounded-full !font-bold uppercase tracking-wider ${academyTagClass}`}>
            {academyTag}
          </Tag>
          <h1 className="text-4xl md:text-5xl font-extrabold text-white mb-2 tracking-tight">
            {headline} <span className={accentWordClass}>{accentWord}</span>
          </h1>
          <p className="text-lg text-gray-400 max-w-2xl mx-auto leading-relaxed">
            {subheadline}
          </p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-32">
        {displayPackages.length === 0 ? (
          <div className="rounded-3xl border border-white/10 bg-[#1a1d26] p-10 text-center">
            <h3 className="text-xl font-bold text-white mb-2">
              {normalize(dynamicServiceKey).startsWith('stay') 
                ? 'No accommodation units available' 
                : 'No configured packages yet'}
            </h3>
            <p className="text-gray-400 max-w-2xl mx-auto">
              {normalize(dynamicServiceKey).startsWith('stay')
                ? 'No accommodation units have been added to the system yet. Check back soon or contact us for availability.'
                : 'This page only shows live packages configured in the admin panel for this discipline. Create lesson services and packages in Services → Lessons to publish them here.'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-5">
            {displayPackages.map((pkg) => (
              <div
                key={pkg.id}
                onClick={() => handleCardClick(pkg)}
                className={`group relative isolate overflow-hidden [clip-path:inset(0_round_1.5rem)] bg-[#1a1d26] rounded-3xl border border-white/5 transition-[transform,box-shadow,border-color] duration-300 cursor-pointer hover:-translate-y-1 hover:shadow-2xl hover:border-white/20 ${pkg.shadow || ''} ${pkg.border || ''}`}
              >
                <div className="h-36 sm:h-40 relative rounded-t-3xl overflow-hidden">
                  {pkg.image ? (
                    <img
                      src={pkg.image}
                      alt={pkg.name}
                      className="absolute inset-0 w-full h-full object-cover transition-all duration-500 group-hover:scale-[1.03] group-hover:brightness-110 group-hover:contrast-110"
                      style={{ objectPosition: resolveLessonCardImagePosition(pkg, dynamicServiceKey) }}
                      loading="lazy"
                      onError={(e) => {
                        e.target.style.display = 'none';
                        e.target.nextSibling?.classList.remove('hidden');
                      }}
                    />
                  ) : null}
                  <div className={`absolute inset-0 flex items-center justify-center bg-gradient-to-br ${pkg.gradient || 'from-gray-700 to-gray-900'} ${pkg.image ? 'hidden' : ''}`}>
                    <div className="text-center px-4">
                      <HomeOutlined className="text-5xl text-white/40 mb-2" />
                      <p className="text-xs text-white/60">No image uploaded</p>
                    </div>
                  </div>
                  <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[#1a1d26]/50 to-[#1a1d26]" />
                  <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-[#1a1d26]" />

                  <div className={`absolute bottom-3 left-3 w-9 h-9 rounded-lg flex items-center justify-center text-sm shadow-lg border border-white/20 z-20 ${pkg.gradient} text-white`}>
                    {pkg.icon}
                  </div>

                  {pkg.featured && (
                    <div className="absolute top-4 right-4 bg-white/90 backdrop-blur-md text-black px-3 py-1 rounded-full text-xs font-bold shadow-lg flex items-center gap-1">
                      <StarFilled className="text-yellow-500" /> POPULAR
                    </div>
                  )}
                </div>

                <div className="relative z-10 -mt-px pt-5 px-4 pb-4 bg-[#1a1d26] rounded-b-3xl">
                  <h3 className={`text-base sm:text-lg font-bold text-white mb-1 transition-colors leading-tight break-words ${cardTitleHoverClass}`}>{pkg.name}</h3>
                  <p className="text-xs text-gray-500 mb-4 font-medium uppercase tracking-wide break-words">{pkg.subtitle}</p>

                  <div className="space-y-2 mb-4">
                    {pkg.badges.slice(0, 2).map((badge) => (
                      <div key={`${pkg.id}-${badge}`} className="flex items-center gap-2 text-xs text-gray-300">
                        <CheckOutlined className={`${getThemeColor(pkg).text}`} /> <span className="break-words">{badge}</span>
                      </div>
                    ))}
                  </div>

                  <div className="flex items-end justify-between border-t border-white/5 pt-4 mt-auto">
                    <div>
                      <p className="text-xs text-gray-500 mb-1">Starting from</p>
                      <p className="text-lg sm:text-xl font-bold text-white">{formatPrice(pkg.durations[0].price)}</p>
                    </div>
                    <div className="w-9 h-9 rounded-full flex items-center justify-center border border-white/20 bg-white/10 text-white transition-all duration-300 group-hover:bg-white group-hover:text-black">
                      <RocketOutlined />
                    </div>
                  </div>
                </div>
              </div>
            ))}
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
        />
      )}

      {/* Generic modal for non-stay pages */}
      {!isStayPage && selectedPackage && (
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
            },
            body: {
              padding: 0,
              maxHeight: '90vh',
              overflowY: 'auto'
            }
          }}
        >
          <div className="flex flex-col md:flex-row">
            <div className="md:w-2/5 bg-[#0f1013] relative overflow-hidden flex flex-col">
              <div className="h-48 md:h-56 relative shrink-0">
                <img
                  src={selectedPackage.image}
                  alt={selectedPackage.name}
                  className="absolute inset-0 w-full h-full object-cover"
                  loading="eager"
                />
                <div className="absolute inset-0 bg-gradient-to-b from-transparent to-[#0f1013]" />
                <div className="absolute bottom-4 left-4 sm:left-6 z-10 pr-4">
                  <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider mb-2 ${getThemeColor(selectedPackage).soft} ${getThemeColor(selectedPackage).text}`}>
                    {selectedPackage.subtitle}
                  </div>
                  <h2 className="text-2xl sm:text-3xl font-extrabold text-white leading-tight">{selectedPackage.name}</h2>
                </div>
              </div>

              <div className="p-4 sm:p-6 md:p-8 flex-grow overflow-y-auto">
                <p className="text-gray-400 mb-6 sm:mb-8 leading-relaxed text-sm">{selectedPackage.description}</p>

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

            <div className="md:w-3/5 bg-[#13151a] p-4 sm:p-6 md:p-8 flex flex-col relative">
              <div className="mb-6">
                <h3 className="text-lg sm:text-xl font-bold text-white mb-4 flex items-center gap-2">
                  <ClockCircleOutlined className="text-gray-500" /> Choose Duration
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {selectedPackage.durations.map((dur) => {
                    const isSelected = selectedDuration === dur.hours;
                    const theme = getThemeColor(selectedPackage);
                    return (
                      <div
                        key={`${selectedPackage.id}-${dur.hours}-${dur.price}`}
                        onClick={() => setSelectedDuration(dur.hours)}
                        className={`
                          relative cursor-pointer rounded-xl p-3 sm:p-4 border-2 transition-all duration-300
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
                          <span className="text-lg sm:text-xl font-bold text-white">{formatPrice(dur.price)}</span>
                          {dur.perPerson && <span className="text-[10px] text-gray-500 ml-1">/pp</span>}
                        </div>
                        <p className="text-[11px] text-gray-500 font-medium">{dur.sessions}</p>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="mt-auto bg-[#0f1013] rounded-2xl p-4 sm:p-5 border border-white/5">
                <div className="flex justify-between items-center mb-4">
                  <div>
                    <p className="text-gray-400 text-xs uppercase tracking-wider font-semibold">Total Price</p>
                    <p className="text-gray-500 text-xs">{selectedPackage.durations.find(d => d.hours === selectedDuration)?.sessions}</p>
                  </div>
                  <div className="text-right">
                    <span className="text-2xl sm:text-3xl font-bold text-white tracking-tight">{formatPrice(getCurrentPrice())}</span>
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
                  className={`!h-12 sm:!h-14 !rounded-xl !text-base sm:!text-lg !font-bold !border-none shadow-lg transition-transform active:scale-95 ${selectedPackage.gradient}`}
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
