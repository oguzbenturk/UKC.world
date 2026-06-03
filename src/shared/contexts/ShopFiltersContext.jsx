import { createContext, useContext, useState, useMemo, useCallback } from 'react';
import { PRODUCT_CATEGORIES, resolveCategory } from '@/shared/constants/productCategories';
import { useProductCategories } from '@/shared/hooks/useProductCategories';

// Sort options
export const SORT_OPTIONS = [
    { value: 'newest', label: 'Newest First' },
    { value: 'price-low', label: 'Price: Low → High' },
    { value: 'price-high', label: 'Price: High → Low' },
    { value: 'name-az', label: 'Name: A → Z' },
    { value: 'popular', label: 'Most Popular' }
];

// Category label mapping — derived from PRODUCT_CATEGORIES (single source of truth)
export const CATEGORY_LABELS = Object.fromEntries(
    Object.values(PRODUCT_CATEGORIES).map(cat => [cat.value, cat.label])
);

export const DEFAULT_PRICE_RANGE = [0, 10000];

const ShopFiltersContext = createContext(null);

export const ShopFiltersProvider = ({ children }) => {
    // Filter state
    const [selectedCategory, setSelectedCategory] = useState('all');
    const [selectedSubcategory, setSelectedSubcategory] = useState('all');
    const [selectedBrand, setSelectedBrand] = useState('all');
    const [sortBy, setSortBy] = useState('newest');
    const [showInStockOnly, setShowInStockOnly] = useState(false);
    const [searchText, setSearchText] = useState('');
    const [expandedCategories, setExpandedCategories] = useState({});
    const [priceRange, setPriceRange] = useState(DEFAULT_PRICE_RANGE);

    // All products for stable category counts
    const [allProducts, setAllProducts] = useState([]);

    // Top-level categories (built-in + custom) from the DB. Calling the hook here
    // — at the app-wide ShopFiltersProvider — also hydrates the category registry
    // so display helpers resolve custom categories everywhere in the app.
    const { options: mergedCategories } = useProductCategories();

    // Active filter count
    const activeFilterCount = useMemo(() => {
        let count = 0;
        if (selectedCategory !== 'all') count++;
        if (selectedSubcategory !== 'all') count++;
        if (selectedBrand !== 'all') count++;
        if (searchText.trim()) count++;
        if (showInStockOnly) count++;
        if (priceRange[0] > DEFAULT_PRICE_RANGE[0] || priceRange[1] < DEFAULT_PRICE_RANGE[1]) count++;
        return count;
    }, [selectedCategory, selectedSubcategory, selectedBrand, searchText, showInStockOnly, priceRange]);

    // Available categories — built-in + custom, merged from the DB.
    const availableCategories = useMemo(() => {
        const countMap = {};
        allProducts.forEach(p => {
            const rawCat = p.category || 'secondwind';
            const cat = resolveCategory(rawCat);
            countMap[cat] = (countMap[cat] || 0) + 1;
        });

        const categories = mergedCategories.map(cat => ({
            value: cat.value,
            label: cat.label,
            count: countMap[cat.value] || 0
        }));

        const featuredCount = allProducts.filter(p => p.is_featured).length;

        return [
            { value: 'featured', label: 'Featured', count: featuredCount },
            ...categories
        ];
    }, [allProducts, mergedCategories]);

    // Handler functions
    const handleCategoryChange = useCallback((value, keepSubcategory = false) => {
        setSelectedCategory(value);
        if (!keepSubcategory) {
            setSelectedSubcategory('all');
            setSelectedBrand('all');
            setPriceRange(DEFAULT_PRICE_RANGE);
        }
        if (typeof window !== 'undefined') {
            window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
        }
    }, []);

    const handleSubcategoryChange = useCallback((value) => {
        setSelectedSubcategory(value);
        setSelectedBrand('all');
    }, []);

    const handleSortChange = useCallback((value) => {
        setSortBy(value);
    }, []);

    const handleSearchChange = useCallback((value) => {
        setSearchText(value);
    }, []);

    const clearAllFilters = useCallback(() => {
        setSelectedCategory('all');
        setSelectedSubcategory('all');
        setSelectedBrand('all');
        setSearchText('');
        setShowInStockOnly(false);
        setSortBy('newest');
        setExpandedCategories({});
        setPriceRange(DEFAULT_PRICE_RANGE);
    }, []);

    const toggleCategoryExpanded = useCallback((categoryValue) => {
        setExpandedCategories(prev => ({
            ...prev,
            [categoryValue]: !prev[categoryValue]
        }));
    }, []);

    const value = {
        // State
        selectedCategory,
        selectedSubcategory,
        selectedBrand,
        sortBy,
        showInStockOnly,
        searchText,
        expandedCategories,
        allProducts,
        priceRange,
        activeFilterCount,
        availableCategories,

        // Setters
        setSelectedCategory,
        setSelectedSubcategory,
        setSelectedBrand,
        setSortBy,
        setShowInStockOnly,
        setSearchText,
        setExpandedCategories,
        setAllProducts,
        setPriceRange,

        // Handlers
        handleCategoryChange,
        handleSubcategoryChange,
        handleSortChange,
        handleSearchChange,
        clearAllFilters,
        toggleCategoryExpanded
    };

    return (
        <ShopFiltersContext.Provider value={value}>
            {children}
        </ShopFiltersContext.Provider>
    );
};

export const useShopFilters = () => {
    const context = useContext(ShopFiltersContext);
    if (!context) {
        throw new Error('useShopFilters must be used within a ShopFiltersProvider');
    }
    return context;
};

export default ShopFiltersContext;
