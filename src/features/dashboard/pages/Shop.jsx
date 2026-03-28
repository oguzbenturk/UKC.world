import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
    Alert,
    Badge,
    Button,
    Card,
    Col,
    Empty,
    Row,
    Skeleton,
    Tag,
    Input,
    Select
} from 'antd';
import { message } from '@/shared/utils/antdStatic';
import { useLocation, useNavigate } from 'react-router-dom';
import {
    SearchOutlined,
    WalletOutlined,
    CloseOutlined,
    ShoppingCartOutlined
} from '@ant-design/icons';
import { productApi } from '@/shared/services/productApi';
import { useCurrency } from '@/shared/contexts/CurrencyContext';
import { useCart } from '@/shared/contexts/CartContext';
import { useAuthModal } from '@/shared/contexts/AuthModalContext';
import { useShopFilters, SORT_OPTIONS, CATEGORY_LABELS } from '@/shared/contexts/ShopFiltersContext';
import ShoppingCart from '@/features/students/components/ShoppingCart';
import { useWalletSummary } from '@/shared/hooks/useWalletSummary';
import { useAuth } from '@/shared/hooks/useAuth';
import ProductCard from '@/features/dashboard/components/ProductCard';
import ProductPreviewModal from '@/features/dashboard/components/ProductPreviewModal';
import { getHierarchicalSubcategories, hasSubcategories, PRODUCT_CATEGORIES } from '@/shared/constants/productCategories';
import { DownOutlined, RightOutlined, LeftOutlined } from '@ant-design/icons';

const { Option } = Select;

// Note: SORT_OPTIONS and CATEGORY_LABELS are imported from ShopFiltersContext
import StickyNavBar from '@/shared/components/navigation/StickyNavBar';

// Category navigation tabs (mirrors ShopLandingPage sections)
const SHOP_NAV_CATEGORIES = [
    { id: 'all',              label: 'All',            filterValue: 'all' },
    { id: 'kitesurf',         label: 'Kiteboarding',   filterValue: 'kitesurf' },
    { id: 'wingfoil',         label: 'Wing Foiling',   filterValue: 'wingfoil' },
    { id: 'foiling',          label: 'Foiling',        filterValue: 'foiling' },
    { id: 'efoil',            label: 'E-Foiling',      filterValue: 'efoil' },
    { id: 'ion',              label: 'ION Accessories', filterValue: 'ion' },
    { id: 'secondwind',       label: 'SecondWind',     filterValue: 'secondwind' },
];

const PAGE_SIZE = 1000; // Load all products at once
const SKELETON_KEYS = Array.from({ length: 8 }, (_, index) => `skeleton-${index}`);
const getStockStatus = (quantity) => {
    if (quantity <= 0) {
        return { label: 'Out of stock', color: 'red' };
    }
    if (quantity <= 3) {
        return { label: 'Last units', color: 'volcano' };
    }
    if (quantity <= 10) {
        return { label: 'Limited', color: 'gold' };
    }
    return { label: 'In Stock', color: 'green' };
};

const renderLoadingSkeletons = () => (
    <Row gutter={[12, 16]}>
        {SKELETON_KEYS.map((key) => (
            <Col key={key} xs={12} sm={8} md={6} lg={4} xl={4}>
                <Card className="h-full rounded-xl border-0 shadow-sm">
                    <Skeleton.Image style={{ width: '100%', height: 200 }} active />
                    <Skeleton active paragraph={{ rows: 2 }} title={{ width: '60%' }} className="mt-3" />
                </Card>
            </Col>
        ))}
    </Row>
);
const ShopPage = () => {

    // Ref for the horizontal category navbar
    const categoryNavRef = useRef(null);

    const location = useLocation();
    const navigate = useNavigate();

    const [products, setProducts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [pagination, setPagination] = useState({ page: 1, total: 0 });
    const [cartVisible, setCartVisible] = useState(false);
    const [previewProduct, setPreviewProduct] = useState(null);
    const [expandedCategorySections, setExpandedCategorySections] = useState({}); // Track which categories show all products

    const { isGuest, isAuthenticated } = useAuth();
    const { openAuthModal } = useAuthModal();
    const { data: walletSummary, refetch: refetchWallet } = useWalletSummary({ enabled: isAuthenticated });

    // Use shared filter context
    const {
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
        setSelectedCategory,
        setSelectedSubcategory,
        setSelectedBrand,
        setSortBy,
        setShowInStockOnly,
        setSearchText,
        setExpandedCategories,
        setAllProducts,
        handleCategoryChange,
        handleSubcategoryChange,
        handleSortChange,
        handleSearchChange,
        clearAllFilters,
        toggleCategoryExpanded
    } = useShopFilters();

    const fetchIdRef = useRef(0);
    const allProductsFetchedRef = useRef(false);
    const masterProductsRef = useRef([]); // All products loaded once
    const [masterProductsLoaded, setMasterProductsLoaded] = useState(false); // Trigger re-filter after load
    
    const { formatCurrency, convertCurrency, userCurrency } = useCurrency();

    // Aggregate all wallet balances into EUR equivalent
    const userBalance = useMemo(() => {
        if (walletSummary?.balances?.length) {
            return walletSummary.balances.reduce((sum, row) => {
                const amt = Number(row.available) || 0;
                if (amt === 0) return sum;
                if (row.currency === 'EUR') return sum + amt;
                return sum + (convertCurrency ? convertCurrency(amt, row.currency, 'EUR') : amt);
            }, 0);
        }
        return Number(walletSummary?.available ?? 0);
    }, [walletSummary, convertCurrency]);

    const {
        addToCart: addToCartContext,
        addToWishlist,
        removeFromWishlist,
        isInWishlist,
        getCartCount
    } = useCart();

    // Single upfront fetch — loads ALL products once, then everything is client-side
    const fetchAllProducts = useCallback(async () => {
        if (masterProductsRef.current.length > 0) return; // Already loaded
        const currentFetchId = ++fetchIdRef.current;
        setLoading(true);
        setError(null);

        try {
            const response = await productApi.getProductsByCategory(100);
            if (currentFetchId !== fetchIdRef.current) return;
            
            if (response.success && response.categories) {
                const allProds = [];
                Object.values(response.categories).forEach(categoryGroup => {
                    allProds.push(...categoryGroup.products);
                });
                masterProductsRef.current = allProds;
                setMasterProductsLoaded(true);
                setProducts(allProds);
                setPagination({ page: 1, total: allProds.length });
                
                // Also populate sidebar counts
                if (allProds.length > 0 && allProducts.length === 0) {
                    setAllProducts(allProds);
                    allProductsFetchedRef.current = true;
                }
            }
        } catch (err) {
            if (currentFetchId !== fetchIdRef.current) return;
            const reason = err?.response?.data?.message;
            setError(reason || 'Unable to load products right now. Please try again soon.');
        } finally {
            if (currentFetchId === fetchIdRef.current) {
                setLoading(false);
            }
        }
    }, [setAllProducts]); // eslint-disable-line react-hooks/exhaustive-deps

    // Load all products once on mount
    useEffect(() => {
        fetchAllProducts();
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        if (!location.state?.openCart) {
            return;
        }

        setCartVisible(true);

        const { openCart, ...restState } = location.state;
        navigate(`${location.pathname}${location.search}${location.hash}`, {
            replace: true,
            state: Object.keys(restState).length > 0 ? restState : null
        });
    }, [location, navigate]);

    // Instant client-side filtering when category/subcategory changes
    useEffect(() => {
        if (masterProductsRef.current.length === 0) return;
        
        let result = masterProductsRef.current;
        
        if (selectedCategory === 'featured') {
            result = result.filter(p => p.is_featured);
        } else if (selectedCategory !== 'all') {
            result = result.filter(p => p.category === selectedCategory);
            if (selectedSubcategory !== 'all') {
                // Hierarchical match: selected subcategory matches itself AND all children
                // e.g. selecting 'bars' matches 'bars', 'bars-trust', 'bars-click'
                result = result.filter(p =>
                    p.subcategory === selectedSubcategory ||
                    p.subcategory?.startsWith(selectedSubcategory + '-')
                );
            }
        }
        
        setProducts(result);
        setPagination({ page: 1, total: result.length });
    }, [selectedCategory, selectedSubcategory, masterProductsLoaded]);

    // Local handler wrappers to reset pagination when category changes
    const localHandleCategoryChange = useCallback((value, keepSubcategory = false) => {
        handleCategoryChange(value, keepSubcategory);
        setPagination({ page: 1, total: 0 });
        
        // Scroll so the search bar comes back into view at the top of the page
        const scrollContainer = document.querySelector('.content-container') || window;
        scrollContainer.scrollTo({ top: 0, behavior: 'smooth' });
    }, [handleCategoryChange]);

    const localHandleSubcategoryChange = useCallback((value) => {
        handleSubcategoryChange(value);
    }, [handleSubcategoryChange]);

    const handleBrandChange = useCallback((value) => {
        setSelectedBrand(value);
    }, [setSelectedBrand]);

    const localHandleSortChange = useCallback((value) => {
        handleSortChange(value);
    }, [handleSortChange]);

    // clearAllFilters from context now handles everything including sortBy reset

    // activeFilterCount is now from context

    const handleAddToCart = useCallback(
        (product, options = {}) => {
            // Check if user is a guest
            if (isGuest || !isAuthenticated) {
                openAuthModal({
                    title: 'Sign In to Purchase',
                    message: 'Create an account to add items to your cart and complete your purchase',
                    returnUrl: '/shop'
                });
                return;
            }
            
            addToCartContext(product, 1, options);
            message.success(`${product.name || 'Item'} added to cart`);
        },
        [addToCartContext, isGuest, isAuthenticated, openAuthModal]
    );

    const handleWishlistToggle = useCallback(
        (product) => {
            const alreadySaved = isInWishlist(product.id);

            if (alreadySaved) {
                removeFromWishlist(product.id);
                message.success('Removed from wishlist');
            } else {
                addToWishlist(product);
                message.success('Saved to wishlist');
            }
        },
        [isInWishlist, removeFromWishlist, addToWishlist]
    );

    const handleOpenPreview = useCallback((product) => {
        setPreviewProduct(product);
    }, []);

    const handleClosePreview = useCallback(() => {
        setPreviewProduct(null);
        // Ensure scroll-to-top when modal closes
        if (typeof window !== 'undefined') {
            window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
        }
    }, []);

    const cartCount = getCartCount();

    // availableCategories is now from context

    // Dynamically build brands from actual products
    const availableBrands = useMemo(() => {
        const brandMap = {};
        
        // Filter by current category first
        const categoryFiltered = selectedCategory === 'all' 
            ? products 
            : products.filter(p => p.category === selectedCategory);
        
        categoryFiltered.forEach(p => {
            const brand = p.brand;
            if (brand && brand.trim()) {
                if (!brandMap[brand]) {
                    brandMap[brand] = {
                        value: brand,
                        label: brand,
                        count: 0
                    };
                }
                brandMap[brand].count++;
            }
        });
        
        // Sort by count (most products first), then alphabetically
        const sorted = Object.values(brandMap).sort((a, b) => {
            if (b.count !== a.count) return b.count - a.count;
            return a.label.localeCompare(b.label);
        });
        
        // Add "All Brands" at the beginning
        return [
            { value: 'all', label: 'All Brands', count: categoryFiltered.length },
            ...sorted
        ];
    }, [products, selectedCategory]);

    // Filter products by search text, brand, and stock + sort
    const filteredProducts = useMemo(() => {
        let result = products;
        
        // Filter by search text
        if (searchText.trim()) {
            const query = searchText.toLowerCase();
            result = result.filter(p => 
                p.name?.toLowerCase().includes(query) ||
                p.brand?.toLowerCase().includes(query) ||
                p.category?.toLowerCase().includes(query)
            );
        }
        
        // Filter by brand
        if (selectedBrand !== 'all') {
            result = result.filter(p => p.brand === selectedBrand);
        }
        
        // Filter by stock
        if (showInStockOnly) {
            result = result.filter(p => p.stock_quantity > 0);
        }
        
        // Sort
        switch (sortBy) {
            case 'price-low':
                result = [...result].sort((a, b) => (a.price || 0) - (b.price || 0));
                break;
            case 'price-high':
                result = [...result].sort((a, b) => (b.price || 0) - (a.price || 0));
                break;
            case 'name-az':
                result = [...result].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
                break;
            case 'popular':
                result = [...result].sort((a, b) => (b.reviews_count || 0) - (a.reviews_count || 0));
                break;
            case 'newest':
            default:
                // Already sorted by created_at from API
                break;
        }
        
        return result;
    }, [products, searchText, selectedBrand, showInStockOnly, sortBy]);

    // Active Filters Chips
    const renderActiveFilters = () => {
        if (activeFilterCount === 0) return null;
        
        const chips = [];
        
        if (selectedCategory !== 'all') {
            const cat = availableCategories.find(c => c.value === selectedCategory);
            chips.push(
                <Tag
                    key="category"
                    closable
                    onClose={() => handleCategoryChange('all')}
                    style={{ 
                        borderRadius: 16, 
                        padding: '4px 12px', 
                        background: '#f3f4f6',
                        border: 'none',
                        fontSize: 13
                    }}
                    closeIcon={<CloseOutlined style={{ fontSize: 10 }} />}
                >
                    {cat?.label}
                </Tag>
            );
        }
        
        if (selectedBrand !== 'all') {
            chips.push(
                <Tag
                    key="brand"
                    closable
                    onClose={() => handleBrandChange('all')}
                    style={{ 
                        borderRadius: 16, 
                        padding: '4px 12px', 
                        background: '#f3f4f6',
                        border: 'none',
                        fontSize: 13
                    }}
                    closeIcon={<CloseOutlined style={{ fontSize: 10 }} />}
                >
                    {selectedBrand}
                </Tag>
            );
        }
        
        if (searchText.trim()) {
            chips.push(
                <Tag
                    key="search"
                    closable
                    onClose={() => setSearchText('')}
                    style={{ 
                        borderRadius: 16, 
                        padding: '4px 12px', 
                        background: '#f3f4f6',
                        border: 'none',
                        fontSize: 13
                    }}
                    closeIcon={<CloseOutlined style={{ fontSize: 10 }} />}
                >
                    "{searchText}"
                </Tag>
            );
        }
        
        if (showInStockOnly) {
            chips.push(
                <Tag
                    key="stock"
                    closable
                    onClose={() => setShowInStockOnly(false)}
                    style={{ 
                        borderRadius: 16, 
                        padding: '4px 12px', 
                        background: '#f3f4f6',
                        border: 'none',
                        fontSize: 13
                    }}
                    closeIcon={<CloseOutlined style={{ fontSize: 10 }} />}
                >
                    In Stock
                </Tag>
            );
        }
        
        return (
            <div className="flex items-center gap-2 flex-wrap mb-4">
                <span className="text-sm text-gray-500">Active filters:</span>
                {chips}
                <button 
                    onClick={clearAllFilters}
                    className="text-sm text-gray-500 hover:text-gray-900 underline ml-2"
                >
                    Clear all
                </button>
            </div>
        );
    };

    // Header with search and sort
    const renderHeader = () => (
        <div className="mb-4 flex flex-col md:flex-row items-center justify-center gap-3">
            {/* Results Count */}
            <div className="text-gray-400 font-medium text-xs flex items-center gap-1.5">
                <div className="h-1.5 w-1.5 rounded-full bg-green-500"></div>
                {filteredProducts.length} items
            </div>

            {/* Top Bar: Search + Sort */}
            <div className="flex items-center gap-2">
                {/* Search */}
                <div className="w-[280px]">
                    <Input
                        placeholder="Search products..."
                        prefix={<SearchOutlined className="text-gray-400 mr-1" />}
                        value={searchText}
                        onChange={(e) => setSearchText(e.target.value)}
                        allowClear
                        size="large"
                        className="hover:border-black focus:border-black focus:shadow-none"
                        style={{ 
                            borderRadius: '8px',
                            backgroundColor: '#f9fafb'
                        }}
                    />
                </div>
                
                {/* Sort - Desktop - Improved styling */}
                <div className="hidden md:block">
                    <Select
                        value={sortBy}
                        onChange={handleSortChange}
                        size="large"
                        className="hover:border-black focus:border-black"
                        style={{ 
                            width: 200,
                        }}
                        styles={{ popup: { root: { borderRadius: '8px', padding: '4px' } } }}
                    >
                        {SORT_OPTIONS.map(opt => (
                            <Option key={opt.value} value={opt.value}>
                                <span className="font-medium text-gray-700">{opt.label}</span>
                            </Option>
                        ))}
                    </Select>
                </div>
            </div>
        </div>
    );

    const PRODUCTS_PER_CATEGORY_INITIAL = 10;

    // Group products by category
    const productsByCategory = useMemo(() => {
        const grouped = {};
        filteredProducts.forEach(product => {
            const cat = product.category || 'other';
            if (!grouped[cat]) {
                grouped[cat] = [];
            }
            grouped[cat].push(product);
        });
        return grouped;
    }, [filteredProducts]);

    const toggleCategoryExpansion = useCallback((category) => {
        setExpandedCategorySections(prev => ({
            ...prev,
            [category]: !prev[category]
        }));
    }, []);

    const renderProducts = () => {
        if (loading) {
            return renderLoadingSkeletons();
        }

        if (error) {
            return (
                <div className="rounded-xl bg-white p-6 shadow-sm">
                    <Alert
                        type="error"
                        message="Unable to load products"
                        description={error}
                        showIcon
                    />
                </div>
            );
        }

        if (!filteredProducts.length) {
            return (
                <div className="rounded-xl bg-white p-8 shadow-sm text-center">
                    <Empty
                        description={
                            <div className="space-y-2">
                                <p className="text-gray-500">
                                    {searchText ? "No products match your search" : "No products available"}
                                </p>
                                {activeFilterCount > 0 && (
                                    <Button 
                                        type="link" 
                                        onClick={clearAllFilters}
                                    >
                                        Clear all filters
                                    </Button>
                                )}
                            </div>
                        }
                        image={Empty.PRESENTED_IMAGE_SIMPLE}
                    />
                </div>
            );
        }

        // Build description string
        const buildResultsDescription = () => {
            const parts = [];
            parts.push(`${filteredProducts.length} product${filteredProducts.length !== 1 ? 's' : ''}`);
            
            if (selectedCategory !== 'all' && selectedCategory !== 'featured') {
                const cat = availableCategories.find(c => c.value === selectedCategory);
                parts.push(`in ${cat?.label || selectedCategory}`);
            }
            
            if (selectedBrand !== 'all') {
                parts.push(`from ${selectedBrand}`);
            }
            
            if (searchText.trim()) {
                parts.push(`matching "${searchText}"`);
            }
            
            return parts.join(' ');
        };

        // When viewing "All" or "Featured", show grouped by category with "Show More"
        if ((selectedCategory === 'all' || selectedCategory === 'featured') && !searchText.trim()) {
            const categoryOrder = Object.keys(productsByCategory).sort((a, b) => {
                // Sort by count (most products first)
                return productsByCategory[b].length - productsByCategory[a].length;
            });

            return (
                <div className="space-y-6">
                    {/* Category Sections */}
                    {categoryOrder.map((category) => {
                        const categoryProducts = productsByCategory[category];
                        const isExpanded = expandedCategorySections[category];
                        const displayProducts = isExpanded 
                            ? categoryProducts 
                            : categoryProducts.slice(0, PRODUCTS_PER_CATEGORY_INITIAL);
                        const hasMore = categoryProducts.length > PRODUCTS_PER_CATEGORY_INITIAL;
                        const remainingCount = categoryProducts.length - PRODUCTS_PER_CATEGORY_INITIAL;
                        const categoryLabel = CATEGORY_LABELS[category] || category.charAt(0).toUpperCase() + category.slice(1).replace(/-/g, ' ');

                        return (
                            <div key={category} className="space-y-3">
                                {/* Category Header */}
                                <div className="flex items-end justify-between border-b border-gray-200 pb-2">
                                    <div className="flex items-center gap-2">
                                        <h2 className="text-xl font-bold text-gray-900 tracking-tight m-0 leading-none">{categoryLabel}</h2>
                                        <span className="bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full text-xs font-semibold">
                                            {categoryProducts.length}
                                        </span>
                                    </div>
                                    <Button 
                                        type="link" 
                                        className="text-gray-500 hover:text-black font-semibold text-sm mr-2 flex items-center gap-1 p-0 transition-colors"
                                        onClick={() => handleCategoryChange(category)}
                                    >
                                        View all <RightOutlined className="text-[10px]" />
                                    </Button>
                                </div>

                                {/* Products Grid */}
                                <Row gutter={[12, 16]}>
                                    {displayProducts.map((product) => (
                                        <Col key={product.id} xs={12} sm={8} md={6} lg={4} xl={4} className="flex">
                                            <ProductCard
                                                product={product}
                                                onPreview={handleOpenPreview}
                                                onWishlistToggle={handleWishlistToggle}
                                                isWishlisted={isInWishlist(product.id)}
                                            />
                                        </Col>
                                    ))}
                                </Row>

                                {/* Show More/Less Button - Minimalist */}
                                {hasMore && (
                                    <div className="flex justify-center pt-2 pb-4">
                                        <Button
                                            onClick={() => toggleCategoryExpansion(category)}
                                            className="px-8 h-10 border-gray-300 text-gray-700 hover:border-black hover:text-black font-medium transition-all"
                                            style={{ borderRadius: '4px' }}
                                        >
                                            {isExpanded 
                                                ? 'Show Less' 
                                                : `Show ${remainingCount} More ${categoryLabel}`
                                            }
                                        </Button>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            );
        }

        // Standard grid view (for specific category or search results)
        return (
            <div className="space-y-3">
                {/* Product Grid */}
                <Row gutter={[12, 16]}>
                    {filteredProducts.map((product) => (
                        <Col key={product.id} xs={12} sm={8} md={6} lg={4} xl={4} className="flex">
                            <ProductCard
                                product={product}
                                onPreview={handleOpenPreview}
                                onWishlistToggle={handleWishlistToggle}
                                isWishlisted={isInWishlist(product.id)}
                            />
                        </Col>
                    ))}
                </Row>
            </div>
        );
    };

    const activeFilter = selectedCategory === 'featured' ? 'all' : selectedCategory;

    return (
        <div className="shop-page min-h-screen bg-gray-50 pb-28 lg:px-6">
            <div className="w-full">
                {/* Category Navigation Bar */}
                <StickyNavBar
                    className="sticky top-0 z-30 mb-4 -mx-4 lg:-mx-6"
                    items={SHOP_NAV_CATEGORIES.map(cat => ({ ...cat, id: cat.filterValue }))}
                    activeItem={activeFilter}
                    onItemClick={(id) => localHandleCategoryChange(id)}
                />

                <div className="px-4">

                {renderHeader()}
                
                {/* Main Content */}
                <div className="flex gap-6">
                    {/* Product Grid Area */}
                    <div className="flex-1 min-w-0">
                        {renderProducts()}
                    </div>
                </div>
                </div>
                
                {/* Floating Cart Button */}
                <div
                    onClick={() => setCartVisible(true)}
                    style={{
                        position: 'fixed',
                        right: 20,
                        bottom: 20,
                        width: 56,
                        height: 56,
                        borderRadius: 16,
                        background: '#4b4f54', // Duotone Antrasit
                        boxShadow: '0 4px 16px rgba(0, 0, 0, 0.2)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer',
                        zIndex: 1000,
                        transition: 'transform 0.2s, box-shadow 0.2s'
                    }}
                    className="hover:scale-105 active:scale-95"
                >
                    <Badge count={cartCount} size="small" offset={[-4, 4]} style={{ boxShadow: '0 2px 6px rgba(0,0,0,0.2)' }}>
                        <ShoppingCartOutlined style={{ fontSize: 26, color: '#00a8c4' }} />
                    </Badge>
                </div>
                
                <ShoppingCart
                    visible={cartVisible}
                    onClose={() => setCartVisible(false)}
                    userBalance={userBalance}
                    onRefreshBalance={isAuthenticated ? refetchWallet : undefined}
                />
                
                <ProductPreviewModal
                    product={previewProduct}
                    isOpen={Boolean(previewProduct)}
                    onClose={handleClosePreview}
                    onAddToCart={handleAddToCart}
                    onWishlistToggle={handleWishlistToggle}
                    isInWishlist={isInWishlist}
                />
            </div>
        </div>
    );
};

export default ShopPage;
