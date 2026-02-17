import { createContext, useContext, useState, useMemo, useCallback } from 'react';

// Sort options
export const SORT_OPTIONS = [
    { value: 'newest', label: 'Newest First', icon: '🆕' },
    { value: 'price-low', label: 'Price: Low → High', icon: '💰' },
    { value: 'price-high', label: 'Price: High → Low', icon: '💎' },
    { value: 'name-az', label: 'Name: A → Z', icon: '🔤' },
    { value: 'popular', label: 'Most Popular', icon: '⭐' }
];

// Category label mapping
export const CATEGORY_LABELS = {
    'kites': 'Kites',
    'boards': 'Boards',
    'harnesses': 'Harnesses',
    'wetsuits': 'Wetsuits',
    'bars': 'Bars & Lines',
    'equipment': 'Equipment',
    'accessories': 'Accessories',
    'apparel': 'Apparel',
    'safety': 'Safety Gear',
    'spare-parts': 'Spare Parts',
    'other': 'Other'
};

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
    
    // All products for stable category counts
    const [allProducts, setAllProducts] = useState([]);

    // Active filter count
    const activeFilterCount = useMemo(() => {
        let count = 0;
        if (selectedCategory !== 'all') count++;
        if (selectedSubcategory !== 'all') count++;
        if (selectedBrand !== 'all') count++;
        if (searchText.trim()) count++;
        if (showInStockOnly) count++;
        return count;
    }, [selectedCategory, selectedSubcategory, selectedBrand, searchText, showInStockOnly]);

    // Available categories computed from products
    const availableCategories = useMemo(() => {
        const productsForCounts = allProducts;
        if (productsForCounts.length === 0) {
            return [{ value: 'all', label: 'All Products', count: 0 }];
        }
        
        const categoryMap = {};
        productsForCounts.forEach(p => {
            const cat = p.category || 'other';
            if (!categoryMap[cat]) {
                categoryMap[cat] = {
                    value: cat,
                    label: CATEGORY_LABELS[cat] || cat.charAt(0).toUpperCase() + cat.slice(1).replace(/-/g, ' '),
                    count: 0
                };
            }
            categoryMap[cat].count++;
        });
        
        // Sort by count (most products first), then alphabetically
        const sorted = Object.values(categoryMap).sort((a, b) => {
            if (b.count !== a.count) return b.count - a.count;
            return a.label.localeCompare(b.label);
        });
        
        return [
            { value: 'all', label: 'All Products', count: productsForCounts.length },
            ...sorted
        ];
    }, [allProducts]);

    // Handler functions
    const handleCategoryChange = useCallback((value, keepSubcategory = false) => {
        setSelectedCategory(value);
        if (!keepSubcategory) {
            setSelectedSubcategory('all');
            setSelectedBrand('all');
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
