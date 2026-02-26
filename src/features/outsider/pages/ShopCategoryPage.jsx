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
  'kitesurf': 'kites',
  'wing-foil': 'wing-foil',
  'e-foil': 'e-foil',
  'wetsuits': 'wetsuits',
  'ion-accs': 'accessories',
  'second-wind': 'other',
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
