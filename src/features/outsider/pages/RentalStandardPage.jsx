/**
 * RentalStandardPage
 *
 * Informational page about standard rental equipment.
 * Shows full sets, boards, and hourly/daily pricing.
 * Opens booking wizard directly on this page without navigation.
 */

import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  SafetyCertificateOutlined,
  AppstoreOutlined,
  SkinOutlined,
  DeploymentUnitOutlined,
} from '@ant-design/icons';
import AcademyServicePackagesPage from '../components/AcademyServicePackagesPage';

// Non-translatable per-package structural metadata (icons, colors, images, hours, prices)
const PACKAGE_CONFIG = [
  {
    i18nKey: 'fullSet',
    id: 'rental-full-set',
    icon: <SafetyCertificateOutlined />,
    featured: true,
    color: 'blue',
    gradient: 'from-blue-600 to-blue-400',
    shadow: 'shadow-blue-500/20',
    border: 'hover:border-blue-500/50',
    image: '/Images/ukc/evo-rent-standart.png',
    durations: [
      { hours: '1h', price: 35 },
      { hours: '4h', price: 55 },
      { hours: '8h', price: 75 },
      { hours: '168h', price: 380 },
    ],
  },
  {
    i18nKey: 'board',
    id: 'rental-board',
    icon: <AppstoreOutlined />,
    featured: false,
    color: 'green',
    gradient: 'from-green-500 to-emerald-600',
    shadow: 'shadow-green-500/20',
    border: 'hover:border-green-500/50',
    image: '/Images/ukc/evo-rent-standart.png',
    durations: [
      { hours: '24h', price: 20 },
      { hours: '168h', price: 100 },
    ],
  },
  {
    i18nKey: 'wetsuit',
    id: 'rental-wetsuit',
    icon: <SkinOutlined />,
    featured: false,
    color: 'cyan',
    gradient: 'from-cyan-500 to-blue-500',
    shadow: 'shadow-cyan-500/20',
    border: 'hover:border-cyan-500/50',
    image: '/Images/ukc/evo-rent-standart.png',
    durations: [
      { hours: '24h', price: 10 },
      { hours: '168h', price: 50 },
    ],
  },
  {
    i18nKey: 'harnessBar',
    id: 'rental-harness-bar',
    icon: <DeploymentUnitOutlined />,
    featured: false,
    color: 'purple',
    gradient: 'from-purple-600 to-fuchsia-500',
    shadow: 'shadow-purple-500/20',
    border: 'hover:border-purple-500/50',
    image: '/Images/ukc/evo-rent-standart.png',
    durations: [
      { hours: '24h', price: 15 },
      { hours: '168h', price: 80 },
    ],
  },
];

const RentalStandardPage = () => {
  const { t } = useTranslation(['outsider']);

  const standardRentalPackages = useMemo(() => PACKAGE_CONFIG.map((cfg) => {
    const base = `outsider:rentalStandard.packages.${cfg.i18nKey}`;
    const durationLabels = t(`${base}.durations`, { returnObjects: true });
    const labels = Array.isArray(durationLabels) ? durationLabels : [];
    return {
      id: cfg.id,
      name: t(`${base}.name`),
      subtitle: t(`${base}.subtitle`),
      icon: cfg.icon,
      featured: cfg.featured,
      color: cfg.color,
      gradient: cfg.gradient,
      shadow: cfg.shadow,
      border: cfg.border,
      image: cfg.image,
      description: t(`${base}.description`),
      highlights: t(`${base}.highlights`, { returnObjects: true }) || [],
      durations: cfg.durations.map((d, i) => ({
        ...d,
        label: labels[i]?.label ?? d.hours,
        sessions: labels[i]?.sessions ?? '',
        ...(labels[i]?.tag ? { tag: labels[i].tag } : {}),
      })),
      badges: t(`${base}.badges`, { returnObjects: true }) || [],
    };
  }), [t]);

  return (
    <AcademyServicePackagesPage
      seoTitle="Standard Rental | UKC"
      seoDescription="Standard rental options for kites, boards, wetsuits and accessories with clear durations and pricing."
      headline={t('outsider:rentalStandard.headline')}
      accentWord={t('outsider:rentalStandard.accentWord')}
      academyTheme="rental"
      subheadline={t('outsider:rentalStandard.subheadline')}
      academyTag="UKC•Rental"
      packages={standardRentalPackages}
    />
  );
};

export default RentalStandardPage;
