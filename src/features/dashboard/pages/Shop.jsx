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
    Space,
    Tag,
    Tooltip,
    Typography,
    Input,
    Drawer,
    Select,
    Checkbox,
    Slider
} from 'antd';
import { message } from '@/shared/utils/antdStatic';
import {
    SearchOutlined,
    FilterOutlined,
    WalletOutlined,
    CloseOutlined,
    AppstoreOutlined,
    ShoppingCartOutlined
} from '@ant-design/icons';
import { productApi } from '@/shared/services/productApi';
import { useCurrency } from '@/shared/contexts/CurrencyContext';
import { useCart } from '@/shared/contexts/CartContext';
import ShoppingCart from '@/features/students/components/ShoppingCart';
import FinancialService from '@/features/finances/services/financialService';
import { useAuth } from '@/shared/hooks/useAuth';
import ProductCard from '@/features/dashboard/components/ProductCard';
import ProductPreviewModal from '@/features/dashboard/components/ProductPreviewModal';
import { getHierarchicalSubcategories, hasSubcategories, PRODUCT_CATEGORIES } from '@/shared/constants/productCategories';
import { DownOutlined, RightOutlined } from '@ant-design/icons';

const { Title, Text } = Typography;
const { Option } = Select;

// Sort options with icons/descriptions
const SORT_OPTIONS = [
    { value: 'newest', label: 'Newest First', icon: '🆕' },
    { value: 'price-low', label: 'Price: Low → High', icon: '💰' },
    { value: 'price-high', label: 'Price: High → Low', icon: '💎' },
    { value: 'name-az', label: 'Name: A → Z', icon: '🔤' },
    { value: 'popular', label: 'Most Popular', icon: '⭐' }
];

// Category label mapping (for display purposes)
const CATEGORY_LABELS = {
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
    <Row gutter={[16, 16]}>
        {SKELETON_KEYS.map((key) => (
            <Col key={key} xs={12} sm={8} md={8} lg={6} xl={6}>
                <Card className="h-full rounded-xl border-0 shadow-sm">
                    <Skeleton.Image style={{ width: '100%', height: 140 }} active />
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
    const [selectedCategory, setSelectedCategory] = useState('all');
    const [selectedSubcategory, setSelectedSubcategory] = useState('all');
    const [selectedBrand, setSelectedBrand] = useState('all');
    const [sortBy, setSortBy] = useState('newest');
    const [showInStockOnly, setShowInStockOnly] = useState(false);
    const [pagination, setPagination] = useState({ page: 1, total: 0 });
    const [cartVisible, setCartVisible] = useState(false);
    const [userBalance, setUserBalance] = useState(0);
    const [previewProduct, setPreviewProduct] = useState(null);
    const [searchText, setSearchText] = useState('');
    const [filterDrawerVisible, setFilterDrawerVisible] = useState(false);
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
    const [expandedCategories, setExpandedCategories] = useState({});
    const [expandedCategorySections, setExpandedCategorySections] = useState({}); // Track which categories show all products
    const [allProducts, setAllProducts] = useState([]); // Store all products for stable category counts

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
                        // Store all products for stable category counts (only on initial load)
                        if (allProducts.length === 0) {
                            setAllProducts(availableProducts);
                        }
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
        [selectedCategory, selectedSubcategory, allProducts.length]
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

    const handleCategoryChange = useCallback((value, keepSubcategory = false) => {
        setSelectedCategory(value);
        if (!keepSubcategory) {
            setSelectedSubcategory('all'); // Reset subcategory when category changes (unless explicitly kept)
        }
        setPagination({ page: 1, total: 0 });
    }, []);

    const handleSubcategoryChange = useCallback((value) => {
        setSelectedSubcategory(value);
    }, []);

    const handleBrandChange = useCallback((value) => {
        setSelectedBrand(value);
    }, []);

    const handleSortChange = useCallback((value) => {
        setSortBy(value);
    }, []);

    const clearAllFilters = useCallback(() => {
        setSelectedCategory('all');
        setSelectedSubcategory('all');
        setSelectedBrand('all');
        setSearchText('');
        setShowInStockOnly(false);
        setSortBy('newest');
    }, []);

    // Count active filters
    const activeFilterCount = useMemo(() => {
        let count = 0;
        if (selectedCategory !== 'all') count++;
        if (selectedSubcategory !== 'all') count++;
        if (selectedBrand !== 'all') count++;
        if (searchText.trim()) count++;
        if (showInStockOnly) count++;
        return count;
    }, [selectedCategory, selectedSubcategory, selectedBrand, searchText, showInStockOnly]);

    const handleAddToCart = useCallback(
        (product, options = {}) => {
            addToCartContext(product, 1, options);
            message.success(`${product.name || 'Item'} added to cart`);
        },
        [addToCartContext]
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

    // Dynamically build categories from ALL products (stable, doesn't change on filter)
    const availableCategories = useMemo(() => {
        const productsForCounts = allProducts.length > 0 ? allProducts : products;
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
        
        // Add "All Products" at the beginning
        return [
            { value: 'all', label: 'All Products', count: productsForCounts.length },
            ...sorted
        ];
    }, [allProducts, products]);

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

    // Desktop Sidebar Filters
    const renderSidebar = () => (
        <div 
            className="hidden lg:block flex-shrink-0 transition-all duration-300"
            style={{ width: sidebarCollapsed ? 0 : 260, overflow: 'hidden' }}
        >
            <div 
                className="sticky top-5" 
                style={{ 
                    width: 260,
                    background: '#fff',
                    borderRadius: 12,
                    border: '1px solid #e5e7eb',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.04)'
                }}
            >
                {/* Header */}
                <div 
                    className="flex items-center justify-between px-5 py-4"
                    style={{ borderBottom: '1px solid #e5e7eb' }}
                >
                    <div className="flex items-center gap-2">
                        <FilterOutlined className="text-gray-500" />
                        <span className="font-semibold text-gray-900">Filters</span>
                        {activeFilterCount > 0 && (
                            <Badge count={activeFilterCount} size="small" style={{ backgroundColor: '#111827' }} />
                        )}
                    </div>
                    {activeFilterCount > 0 && (
                        <button 
                            onClick={clearAllFilters}
                            className="text-xs text-gray-500 hover:text-gray-900 transition-colors"
                        >
                            Clear all
                        </button>
                    )}
                </div>

                {/* Categories Section - Unified collapsible tree with inline subcategories */}
                <div className="px-5 py-4" style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
                        Category {availableCategories.length > 1 && <span className="text-gray-400">({availableCategories.length - 1})</span>}
                    </div>
                    <div className="space-y-0.5">
                        {availableCategories.map((cat) => {
                            const isActive = selectedCategory === cat.value && selectedSubcategory === 'all';
                            const isExpanded = expandedCategories[cat.value];
                            const hasSubs = cat.value !== 'all' && hasSubcategories(cat.value);
                            const subcats = hasSubs ? getHierarchicalSubcategories(cat.value) : [];
                            const isCategoryActive = selectedCategory === cat.value;
                            
                            return (
                                <div key={cat.value}>
                                    {/* Category row */}
                                    <div className="flex items-center">
                                        {/* Expand/collapse toggle for categories with subcategories */}
                                        {hasSubs ? (
                                            <button
                                                onClick={() => setExpandedCategories(prev => ({ ...prev, [cat.value]: !prev[cat.value] }))}
                                                className="w-6 h-8 flex items-center justify-center text-gray-400 hover:text-gray-600"
                                            >
                                                {isExpanded ? <DownOutlined style={{ fontSize: 10 }} /> : <RightOutlined style={{ fontSize: 10 }} />}
                                            </button>
                                        ) : (
                                            <div className="w-6" />
                                        )}
                                        <button
                                            onClick={() => {
                                                handleCategoryChange(cat.value);
                                                // Auto-expand when clicking a category with subcategories
                                                if (hasSubs && !isExpanded) {
                                                    setExpandedCategories(prev => ({ ...prev, [cat.value]: true }));
                                                }
                                            }}
                                            className={`flex-1 flex items-center justify-between px-2 py-2 rounded-lg text-sm transition-all ${
                                                isActive
                                                    ? 'bg-gray-900 text-white font-medium'
                                                    : isCategoryActive
                                                        ? 'bg-gray-100 text-gray-900 font-medium'
                                                        : 'text-gray-700 hover:bg-gray-50'
                                            }`}
                                        >
                                            <span>{cat.label}</span>
                                            <span className={`text-xs ${isActive ? 'text-gray-300' : 'text-gray-400'}`}>
                                                {cat.count}
                                            </span>
                                        </button>
                                    </div>
                                    
                                    {/* Subcategories - inline when expanded */}
                                    {hasSubs && isExpanded && (
                                        <div className="ml-6 mt-0.5 space-y-0.5 border-l-2 border-gray-200 pl-2">
                                            {subcats.map((parent) => {
                                                const isParentActive = selectedCategory === cat.value && selectedSubcategory === parent.value;
                                                const isChildActive = parent.children?.some(c => selectedSubcategory === c.value);
                                                
                                                return (
                                                    <div key={parent.value}>
                                                        {/* Parent subcategory */}
                                                        <button
                                                            onClick={() => {
                                                                if (selectedCategory !== cat.value) {
                                                                    handleCategoryChange(cat.value, true); // Keep subcategory
                                                                }
                                                                handleSubcategoryChange(parent.value);
                                                            }}
                                                            className={`w-full flex items-center justify-between px-2 py-1.5 rounded-lg text-sm transition-all ${
                                                                isParentActive
                                                                    ? 'bg-gray-900 text-white font-medium'
                                                                    : isChildActive
                                                                        ? 'text-gray-900 font-medium'
                                                                        : 'text-gray-600 hover:bg-gray-50'
                                                            }`}
                                                        >
                                                            <span>{parent.label}</span>
                                                        </button>
                                                        {/* Children subcategories */}
                                                        {parent.children && parent.children.length > 0 && (
                                                            <div className="ml-3 space-y-0.5 border-l border-gray-100 pl-2">
                                                                {parent.children.map((child) => {
                                                                    const isChildItemActive = selectedCategory === cat.value && selectedSubcategory === child.value;
                                                                    return (
                                                                        <button
                                                                            key={child.value}
                                                                            onClick={() => {
                                                                                if (selectedCategory !== cat.value) {
                                                                                    handleCategoryChange(cat.value, true);
                                                                                }
                                                                                handleSubcategoryChange(child.value);
                                                                            }}
                                                                            className={`w-full flex items-center px-2 py-1 rounded text-sm transition-all ${
                                                                                isChildItemActive
                                                                                    ? 'bg-gray-900 text-white font-medium'
                                                                                    : 'text-gray-500 hover:bg-gray-50 hover:text-gray-700'
                                                                            }`}
                                                                        >
                                                                            <span>{child.label}</span>
                                                                        </button>
                                                                    );
                                                                })}
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Availability */}
                <div className="px-5 py-4">
                    <Checkbox 
                        checked={showInStockOnly}
                        onChange={(e) => setShowInStockOnly(e.target.checked)}
                        className="text-sm text-gray-700"
                    >
                        In Stock Only
                    </Checkbox>
                </div>
            </div>
        </div>
    );

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
                
                {/* Mobile Filter Button */}
                <Button
                    icon={<FilterOutlined />}
                    onClick={() => setFilterDrawerVisible(true)}
                    className="lg:hidden flex-shrink-0"
                    size="large"
                    style={{ borderRadius: 10 }}
                >
                    <span className="hidden sm:inline">Filters</span>
                    {activeFilterCount > 0 && (
                        <Badge 
                            count={activeFilterCount} 
                            size="small" 
                            style={{ marginLeft: 8, backgroundColor: '#111827' }} 
                        />
                    )}
                </Button>
                
                {/* Sidebar Toggle - Desktop */}
                <Tooltip title={sidebarCollapsed ? "Show filters" : "Hide filters"}>
                    <Button
                        icon={<AppstoreOutlined />}
                        onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
                        className="hidden lg:flex"
                        size="large"
                        style={{ borderRadius: 10 }}
                    />
                </Tooltip>
            </div>

            {/* Mobile Category Pills - Quick Access (Dynamic) */}
            <div className="lg:hidden mt-4 -mx-4 px-4">
                <div className="flex gap-2 overflow-x-auto pb-3 scrollbar-hide" style={{ WebkitOverflowScrolling: 'touch' }}>
                    {availableCategories.slice(0, 5).map((cat) => (
                        <button
                            key={cat.value}
                            onClick={() => handleCategoryChange(cat.value)}
                            className={`flex-shrink-0 rounded-full px-4 py-2 text-sm font-medium transition-all ${
                                selectedCategory === cat.value
                                    ? 'bg-gray-900 text-white'
                                    : 'bg-white text-gray-700 border border-gray-200'
                            }`}
                        >
                            {cat.label}
                            {cat.value !== 'all' && <span className="ml-1 opacity-60">({cat.count})</span>}
                        </button>
                    ))}
                    {availableCategories.length > 5 && (
                        <button
                            onClick={() => setFilterDrawerVisible(true)}
                            className="flex-shrink-0 rounded-full px-4 py-2 text-sm font-medium bg-white text-gray-700 border border-gray-200"
                        >
                            +{availableCategories.length - 5} more
                        </button>
                    )}
                </div>
            </div>
        </div>
    );

    const renderFilterDrawer = () => (
        <Drawer
            title={null}
            placement="bottom"
            open={filterDrawerVisible}
            onClose={() => setFilterDrawerVisible(false)}
            height="85vh"
            closable={false}
            styles={{
                header: { display: 'none' },
                body: { padding: 0, display: 'flex', flexDirection: 'column', background: '#f9fafb' }
            }}
        >
            {/* Custom Header - matches sidebar */}
            <div 
                className="flex items-center justify-between px-5 py-4 bg-white"
                style={{ borderBottom: '1px solid #e5e7eb' }}
            >
                <div className="flex items-center gap-2">
                    <FilterOutlined className="text-gray-500" />
                    <span className="font-semibold text-gray-900">Filters</span>
                    {activeFilterCount > 0 && (
                        <Badge count={activeFilterCount} size="small" style={{ backgroundColor: '#111827' }} />
                    )}
                </div>
                <div className="flex items-center gap-4">
                    {activeFilterCount > 0 && (
                        <button 
                            onClick={clearAllFilters}
                            className="text-sm text-gray-500 hover:text-gray-900"
                        >
                            Clear all
                        </button>
                    )}
                    <button 
                        onClick={() => setFilterDrawerVisible(false)}
                        className="text-gray-400 hover:text-gray-600"
                    >
                        <CloseOutlined />
                    </button>
                </div>
            </div>

            {/* Scrollable Content - Card style sections */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
                
                {/* Sort Section */}
                <div 
                    className="bg-white rounded-xl"
                    style={{ border: '1px solid #e5e7eb' }}
                >
                    <div 
                        className="px-4 py-3"
                        style={{ borderBottom: '1px solid #f3f4f6' }}
                    >
                        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                            Sort By
                        </div>
                    </div>
                    <div className="p-3">
                        <div className="grid grid-cols-2 gap-2">
                            {SORT_OPTIONS.map((option) => (
                                <button
                                    key={option.value}
                                    onClick={() => handleSortChange(option.value)}
                                    className={`rounded-lg px-3 py-2.5 text-sm font-medium transition-all text-left flex items-center gap-2 ${
                                        sortBy === option.value
                                            ? 'bg-gray-900 text-white'
                                            : 'bg-gray-50 text-gray-700 hover:bg-gray-100'
                                    }`}
                                >
                                    <span>{option.icon}</span>
                                    <span>{option.label}</span>
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Categories Section - Unified collapsible tree */}
                <div 
                    className="bg-white rounded-xl"
                    style={{ border: '1px solid #e5e7eb' }}
                >
                    <div 
                        className="px-4 py-3"
                        style={{ borderBottom: '1px solid #f3f4f6' }}
                    >
                        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                            Category {availableCategories.length > 1 && <span className="text-gray-400">({availableCategories.length - 1})</span>}
                        </div>
                    </div>
                    <div className="p-3 space-y-0.5">
                        {availableCategories.map((cat) => {
                            const isActive = selectedCategory === cat.value && selectedSubcategory === 'all';
                            const isExpanded = expandedCategories[cat.value];
                            const hasSubs = cat.value !== 'all' && hasSubcategories(cat.value);
                            const subcats = hasSubs ? getHierarchicalSubcategories(cat.value) : [];
                            const isCategoryActive = selectedCategory === cat.value;
                            
                            return (
                                <div key={cat.value}>
                                    {/* Category row */}
                                    <div className="flex items-center">
                                        {hasSubs ? (
                                            <button
                                                onClick={() => setExpandedCategories(prev => ({ ...prev, [cat.value]: !prev[cat.value] }))}
                                                className="w-6 h-10 flex items-center justify-center text-gray-400 hover:text-gray-600"
                                            >
                                                {isExpanded ? <DownOutlined style={{ fontSize: 10 }} /> : <RightOutlined style={{ fontSize: 10 }} />}
                                            </button>
                                        ) : (
                                            <div className="w-6" />
                                        )}
                                        <button
                                            onClick={() => {
                                                handleCategoryChange(cat.value);
                                                if (hasSubs && !isExpanded) {
                                                    setExpandedCategories(prev => ({ ...prev, [cat.value]: true }));
                                                }
                                            }}
                                            className={`flex-1 flex items-center justify-between px-2 py-2.5 rounded-lg text-sm transition-all ${
                                                isActive
                                                    ? 'bg-gray-900 text-white font-medium'
                                                    : isCategoryActive
                                                        ? 'bg-gray-100 text-gray-900 font-medium'
                                                        : 'text-gray-700 hover:bg-gray-50'
                                            }`}
                                        >
                                            <span>{cat.label}</span>
                                            <span className={`text-xs ${isActive ? 'text-gray-300' : 'text-gray-400'}`}>
                                                {cat.count}
                                            </span>
                                        </button>
                                    </div>
                                    
                                    {/* Subcategories - inline when expanded */}
                                    {hasSubs && isExpanded && (
                                        <div className="ml-6 mt-0.5 space-y-0.5 border-l-2 border-gray-200 pl-2">
                                            {subcats.map((parent) => {
                                                const isParentActive = selectedCategory === cat.value && selectedSubcategory === parent.value;
                                                const isChildActive = parent.children?.some(c => selectedSubcategory === c.value);
                                                
                                                return (
                                                    <div key={parent.value}>
                                                        <button
                                                            onClick={() => {
                                                                if (selectedCategory !== cat.value) {
                                                                    handleCategoryChange(cat.value, true);
                                                                }
                                                                handleSubcategoryChange(parent.value);
                                                            }}
                                                            className={`w-full flex items-center px-2 py-2 rounded-lg text-sm transition-all ${
                                                                isParentActive
                                                                    ? 'bg-gray-900 text-white font-medium'
                                                                    : isChildActive
                                                                        ? 'text-gray-900 font-medium'
                                                                        : 'text-gray-600 hover:bg-gray-50'
                                                            }`}
                                                        >
                                                            <span>{parent.label}</span>
                                                        </button>
                                                        {parent.children && parent.children.length > 0 && (
                                                            <div className="ml-3 space-y-0.5 border-l border-gray-100 pl-2">
                                                                {parent.children.map((child) => {
                                                                    const isChildItemActive = selectedCategory === cat.value && selectedSubcategory === child.value;
                                                                    return (
                                                                        <button
                                                                            key={child.value}
                                                                            onClick={() => {
                                                                                if (selectedCategory !== cat.value) {
                                                                                    handleCategoryChange(cat.value, true);
                                                                                }
                                                                                handleSubcategoryChange(child.value);
                                                                            }}
                                                                            className={`w-full flex items-center px-2 py-1.5 rounded text-sm transition-all ${
                                                                                isChildItemActive
                                                                                    ? 'bg-gray-900 text-white font-medium'
                                                                                    : 'text-gray-500 hover:bg-gray-50 hover:text-gray-700'
                                                                            }`}
                                                                        >
                                                                            <span>{child.label}</span>
                                                                        </button>
                                                                    );
                                                                })}
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Availability Section */}
                <div 
                    className="bg-white rounded-xl"
                    style={{ border: '1px solid #e5e7eb' }}
                >
                    <div className="px-4 py-4">
                        <Checkbox 
                            checked={showInStockOnly}
                            onChange={(e) => setShowInStockOnly(e.target.checked)}
                            className="text-sm text-gray-700"
                        >
                            Show In Stock Only
                        </Checkbox>
                    </div>
                </div>
            </div>
            
            {/* Sticky Footer */}
            <div 
                className="p-4 bg-white"
                style={{ borderTop: '1px solid #e5e7eb' }}
            >
                <Button 
                    type="primary" 
                    block 
                    size="large"
                    onClick={() => setFilterDrawerVisible(false)}
                    style={{ borderRadius: 10, height: 48, background: '#111827', border: 'none', fontWeight: 600 }}
                >
                    Show {filteredProducts.length} Product{filteredProducts.length !== 1 ? 's' : ''}
                </Button>
            </div>
        </Drawer>
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

                    {/* Active Filter Chips - Desktop */}
                    <div className="hidden lg:block">
                        {renderActiveFilters()}
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
                                <Row gutter={[16, 16]}>
                                    {displayProducts.map((product) => (
                                        <Col key={product.id} xs={12} sm={8} md={8} lg={6} xl={6}>
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

                {/* Active Filter Chips - Desktop */}
                <div className="hidden lg:block">
                    {renderActiveFilters()}
                </div>

                {/* Product Grid */}
                <Row gutter={[16, 16]}>
                    {filteredProducts.map((product) => (
                        <Col key={product.id} xs={12} sm={8} md={8} lg={6} xl={6}>
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
                
                {/* Main Content with Sidebar */}
                <div className="flex gap-6">
                    {/* Sidebar - Desktop */}
                    {renderSidebar()}
                    
                    {/* Product Grid Area */}
                    <div className="flex-1 min-w-0">
                        {renderProducts()}
                    </div>
                </div>
                
                {renderFilterDrawer()}
                
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
