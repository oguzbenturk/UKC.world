import { useState, useEffect, useCallback, useMemo } from 'react';
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
    Typography,
    Input,
    Select
} from 'antd';
import { message } from '@/shared/utils/antdStatic';
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
import FinancialService from '@/features/finances/services/financialService';
import { useAuth } from '@/shared/hooks/useAuth';
import ProductCard from '@/features/dashboard/components/ProductCard';
import ProductPreviewModal from '@/features/dashboard/components/ProductPreviewModal';
import { getHierarchicalSubcategories, hasSubcategories, PRODUCT_CATEGORIES } from '@/shared/constants/productCategories';
import { DownOutlined, RightOutlined } from '@ant-design/icons';

const { Title, Text } = Typography;
const { Option } = Select;

// Note: SORT_OPTIONS and CATEGORY_LABELS are imported from ShopFiltersContext

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
    const [products, setProducts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [pagination, setPagination] = useState({ page: 1, total: 0 });
    const [cartVisible, setCartVisible] = useState(false);
    const [userBalance, setUserBalance] = useState(0);
    const [previewProduct, setPreviewProduct] = useState(null);
    const [expandedCategorySections, setExpandedCategorySections] = useState({}); // Track which categories show all products

    const { isGuest, isAuthenticated } = useAuth();
    const { openAuthModal } = useAuthModal();

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

    const { user } = useAuth();
    
    const { formatCurrency, convertCurrency, userCurrency } = useCurrency();
    const {
        addToCart: addToCartContext,
        addToWishlist,
        removeFromWishlist,
        isInWishlist,
        getCartCount
    } = useCart();

    const fetchProducts = useCallback(
        async () => {
            setLoading(true);
            setError(null);

            try {
                let availableProducts = [];
                let total = 0;
                
                // If viewing all categories, fetch ALL products (no limit)
                if (selectedCategory === 'all') {
                    const response = await productApi.getProductsByCategory(100); // High limit to get all products
                    if (response.success && response.categories) {
                        // Flatten all products from all categories
                        Object.values(response.categories).forEach(categoryGroup => {
                            availableProducts.push(...categoryGroup.products);
                        });
                        total = availableProducts.length;
                    }
                } else {
                    // Fetch all products for specific category with subcategory filter
                    // Note: 'all-kites' is a special value that means "show all" (no subcategory filter)
                    const effectiveSubcategory = selectedSubcategory !== 'all' && selectedSubcategory !== 'all-kites' 
                        ? selectedSubcategory 
                        : undefined;
                    
                    const response = await productApi.getProducts({
                        status: 'active',
                        page: 1,
                        limit: PAGE_SIZE,
                        category: selectedCategory,
                        subcategory: effectiveSubcategory,
                        sort_by: 'created_at',
                        sort_order: 'DESC'
                    });
                    
                    availableProducts = (response.data || []).filter((product) => {
                        const hasPrice = typeof product.price === 'number' ? product.price >= 0 : true;
                        return product.status === 'active' && product.stock_quantity > 0 && hasPrice;
                    });
                    
                    total = response.pagination?.total ?? availableProducts.length;
                }

                setProducts(availableProducts);
                setPagination({ page: 1, total });
            } catch (error) {
                const reason = error?.response?.data?.message;
                setError(reason || 'Unable to load products right now. Please try again soon.');
            } finally {
                setLoading(false);
            }
        },
        [selectedCategory, selectedSubcategory]
    );

    useEffect(() => {
        fetchProducts();
    }, [fetchProducts]);

    useEffect(() => {
        let cancelled = false;

        const loadBalance = async () => {
            if (!user?.id) {
                setUserBalance(0);
                return;
            }

            try {
                const balance = await FinancialService.getUserBalance(user.id);
                if (!cancelled) {
                    setUserBalance(Number(balance?.currentBalance || 0));
                }
            } catch {
                if (!cancelled) {
                    setUserBalance(0);
                }
            }
        };

        loadBalance();

        return () => {
            cancelled = true;
        };
    }, [user?.id]);

    // Local handler wrappers to reset pagination when category changes
    const localHandleCategoryChange = useCallback((value, keepSubcategory = false) => {
        handleCategoryChange(value);
        if (!keepSubcategory) {
            setSelectedSubcategory('all'); // Reset subcategory when category changes (unless explicitly kept)
        }
        setPagination({ page: 1, total: 0 });
    }, [handleCategoryChange, setSelectedSubcategory]);

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
    }, []);

    const cartCount = getCartCount();

    // availableCategories is now from context
    // We need to update allProducts in context when we fetch ALL products (for category counts)
    useEffect(() => {
        // Only set allProducts when viewing 'all' categories and we have products
        if (selectedCategory === 'all' && products.length > 0 && allProducts.length === 0) {
            setAllProducts(products);
        }
    }, [selectedCategory, products, allProducts.length, setAllProducts]);

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

    // Header with search and sort (no filter pills - they're in sidebar now)
    const renderHeader = () => (
        <div className="mb-5">
            {/* Top Bar: Search + Sort + Filter Button */}
            <div className="flex items-center gap-3 flex-wrap">
                {/* Search */}
                <div className="flex-1 min-w-[200px] max-w-[400px]">
                    <Input
                        placeholder="Search products..."
                        prefix={<SearchOutlined className="text-gray-400" />}
                        value={searchText}
                        onChange={(e) => setSearchText(e.target.value)}
                        allowClear
                        size="large"
                        style={{ 
                            borderRadius: 10,
                            border: '1px solid #e5e7eb',
                            backgroundColor: '#fff'
                        }}
                    />
                </div>
                
                {/* Sort - Desktop - Improved styling */}
                <div className="hidden md:block">
                    <Select
                        value={sortBy}
                        onChange={handleSortChange}
                        size="large"
                        style={{ 
                            width: 200,
                            borderRadius: 10
                        }}
                        popupMatchSelectWidth={200}
                    >
                        {SORT_OPTIONS.map(opt => (
                            <Option key={opt.value} value={opt.value}>
                                <div className="flex items-center gap-2">
                                    <span>{opt.icon}</span>
                                    <span>{opt.label}</span>
                                </div>
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
            
            if (selectedCategory !== 'all') {
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

        // When viewing "All Products", show grouped by category with "Show More"
        if (selectedCategory === 'all' && !searchText.trim()) {
            const categoryOrder = Object.keys(productsByCategory).sort((a, b) => {
                // Sort by count (most products first)
                return productsByCategory[b].length - productsByCategory[a].length;
            });

            return (
                <div className="space-y-8">
                    {/* Results Header */}
                    <div className="flex items-center justify-between flex-wrap gap-2">
                        <Text className="text-sm text-gray-600">
                            {buildResultsDescription()}
                        </Text>
                    </div>

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
                            <div key={category} className="space-y-4">
                                {/* Category Header */}
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <h2 className="text-lg font-semibold text-gray-900">{categoryLabel}</h2>
                                        <span className="text-sm text-gray-500">({categoryProducts.length})</span>
                                    </div>
                                    <Button 
                                        type="link" 
                                        className="text-gray-600 hover:text-gray-900"
                                        onClick={() => handleCategoryChange(category)}
                                    >
                                        View all →
                                    </Button>
                                </div>

                                {/* Products Grid */}
                                <Row gutter={[12, 16]}>
                                    {displayProducts.map((product) => (
                                        <Col key={product.id} xs={12} sm={8} md={6} lg={4} xl={4}>
                                            <ProductCard
                                                product={product}
                                                onPreview={handleOpenPreview}
                                                onWishlistToggle={handleWishlistToggle}
                                                isInWishlist={isInWishlist}
                                            />
                                        </Col>
                                    ))}
                                </Row>

                                {/* Show More/Less Button */}
                                {hasMore && (
                                    <div className="flex justify-center pt-2">
                                        <Button
                                            type="default"
                                            onClick={() => toggleCategoryExpansion(category)}
                                            className="px-6"
                                            style={{ borderRadius: 8 }}
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
            <div className="space-y-4">
                {/* Results Header */}
                <div className="flex items-center justify-between flex-wrap gap-2">
                    <Text className="text-sm text-gray-600">
                        {buildResultsDescription()}
                    </Text>
                </div>

                {/* Product Grid */}
                <Row gutter={[12, 16]}>
                    {filteredProducts.map((product) => (
                        <Col key={product.id} xs={12} sm={8} md={6} lg={4} xl={4}>
                            <ProductCard
                                product={product}
                                onPreview={handleOpenPreview}
                                onWishlistToggle={handleWishlistToggle}
                                isInWishlist={isInWishlist}
                            />
                        </Col>
                    ))}
                </Row>
            </div>
        );
    };

    return (
        <div className="shop-page min-h-screen bg-gray-50 px-4 pb-28 pt-5 lg:px-6">
            <div className="w-full">
                {renderHeader()}
                
                {/* Main Content */}
                <div className="flex gap-6">
                    {/* Product Grid Area */}
                    <div className="flex-1 min-w-0">
                        {renderProducts()}
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
                        background: '#111827',
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
                        <ShoppingCartOutlined style={{ fontSize: 26, color: '#fff' }} />
                    </Badge>
                </div>
                
                <ShoppingCart
                    visible={cartVisible}
                    onClose={() => setCartVisible(false)}
                    userBalance={userBalance}
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
