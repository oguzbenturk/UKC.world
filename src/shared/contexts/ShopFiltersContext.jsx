import { createContext, useContext, useState, useMemo, useCallback } from 'react';
import { PRODUCT_CATEGORIES, LEGACY_CATEGORY_MAP, resolveCategory } from '@/shared/constants/productCategories';

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

const ShopFiltersContext = createContext(null);

export const ShopFiltersProvider = ({ children }) => {
    // Filter state
    const [selectedCategory, setSelectedCategory] = useState('featured');
    const [selectedSubcategory, setSelectedSubcategory] = useState('all');
    const [selectedBrand, setSelectedBrand] = useState('all');
    const [sortBy, setSortBy] = useState('newest');
    const [showInStockOnly, setShowInStockOnly] = useState(false);
    const [searchText, setSearchText] = useState('');
    const [expandedCategories, setExpandedCategories] = useState({});
    
    // All products for stable category counts
    const [allProducts, setAllProducts] = useState([]);

    // Active filter count
    const activeFilterCount = useMemo(() => {
        let count = 0;
        if (selectedCategory !== 'all' && selectedCategory !== 'featured') count++;
        if (selectedSubcategory !== 'all') count++;
        if (selectedBrand !== 'all') count++;
        if (searchText.trim()) count++;
        if (showInStockOnly) count++;
        return count;
    }, [selectedCategory, selectedSubcategory, selectedBrand, searchText, showInStockOnly]);

    // Available categories — always built from PRODUCT_CATEGORIES constant
    // so sidebar always shows categories even before products are loaded.
    // Counts come from allProducts when available.
    const availableCategories = useMemo(() => {
        // Count products per resolved category
        const countMap = {};
        let totalCount = 0;
        allProducts.forEach(p => {
            const rawCat = p.category || 'secondwind';
            const cat = resolveCategory(rawCat);
            countMap[cat] = (countMap[cat] || 0) + 1;
            totalCount++;
        });

        // Always include all defined categories from constants
        const categories = Object.values(PRODUCT_CATEGORIES)
            .filter(cat => cat.value !== 'ukc-shop') // Hidden from shop sidebar
            .map(cat => ({
                value: cat.value,
                label: cat.label,
                count: countMap[cat.value] || 0
            }));

        // Count featured products
        const featuredCount = allProducts.filter(p => p.is_featured).length;

        return [
            { value: 'featured', label: 'Featured Products', count: featuredCount },
            ...categories
        ];
    }, [allProducts]);

    // Handler functions
    const handleCategoryChange = useCallback((value, keepSubcategory = false) => {
        setSelectedCategory(value);
        if (!keepSubcategory) {
            setSelectedSubcategory('all');
            setSelectedBrand('all');
        }
        // Ensure view resets when switching categories inside shop page
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
