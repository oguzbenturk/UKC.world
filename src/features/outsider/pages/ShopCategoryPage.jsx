/**
 * ShopCategoryPage — thin wrapper around ShopPage that
 * reads the :section URL param and pre-selects the matching
 * product category in ShopFiltersContext.
 */
import { useEffect } from 'react';
import { useParams } from 'react-router-dom';
import ShopPage from '@/features/dashboard/pages/Shop';
import { useShopFilters } from '@/shared/contexts/ShopFiltersContext';

// Map nav sections to product category values
const SECTION_TO_CATEGORY = {
  'kitesurf': 'kitesurf',
  'wingfoil': 'wingfoil',
  'efoil': 'efoil',
  'ion': 'ion',
  'ukc-shop': 'ukc-shop',
  'secondwind': 'secondwind',
  // Legacy URL support
  'wing-foil': 'wingfoil',
  'e-foil': 'efoil',
  'ion-wetsuits': 'ion',
  'ion-harnesses': 'ion',
  'ion-accessories': 'ion',
  'wetsuits': 'ion',
  'ion-accs': 'ion',
  'second-wind': 'secondwind',
  'all': 'all',
};

const ShopCategoryPage = () => {
  const { section } = useParams();
  const { handleCategoryChange } = useShopFilters();

  useEffect(() => {
    if (section) {
      const category = SECTION_TO_CATEGORY[section] || 'all';
      handleCategoryChange(category);
    }
  }, [section, handleCategoryChange]);

  return <ShopPage />;
};

export default ShopCategoryPage;
