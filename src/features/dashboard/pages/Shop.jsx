import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
    Alert,
    Badge,
    Button,
    Card,
    Checkbox,
    Col,
    Divider,
    Drawer,
    Empty,
    Grid,
    Row,
    Skeleton,
    Switch,
    Tag,
    Input,
    Select
} from 'antd';
import { message } from '@/shared/utils/antdStatic';
import { useLocation, useNavigate } from 'react-router-dom';
import {
    SearchOutlined,
    CloseOutlined,
    ShoppingCartOutlined,
    FilterOutlined,
    RightOutlined,
    LeftOutlined,
    DownOutlined
} from '@ant-design/icons';
import { productApi } from '@/shared/services/productApi';
import { useCurrency } from '@/shared/contexts/CurrencyContext';
import { useCart } from '@/shared/contexts/CartContext';
import { useAuthModal } from '@/shared/contexts/AuthModalContext';
import { useShopFilters, SORT_OPTIONS, CATEGORY_LABELS, DEFAULT_PRICE_RANGE } from '@/shared/contexts/ShopFiltersContext';
import ShoppingCart from '@/features/students/components/ShoppingCart';
import { useWalletSummary } from '@/shared/hooks/useWalletSummary';
import { useAuth } from '@/shared/hooks/useAuth';
import ProductCard from '@/features/dashboard/components/ProductCard';
import { getHierarchicalSubcategories, hasSubcategories, PRODUCT_CATEGORIES, resolveCategory } from '@/shared/constants/productCategories';
import StickyNavBar from '@/shared/components/navigation/StickyNavBar';
import { usePageSEO } from '@/shared/utils/seo';

const { Option } = Select;
const { useBreakpoint } = Grid;

// Normalize category/subcategory on freshly fetched products (mutates in place)
const normalizeProducts = (prods) => {
    prods.forEach(p => {
        if (p.category) p.category = resolveCategory(p.category);
        if (p.subcategory) p.subcategory = p.subcategory.toLowerCase();
    });
    return prods;
};

// Category navigation tabs
const SHOP_NAV_CATEGORIES = [
    { id: 'all',        label: 'All',             filterValue: 'all' },
    { id: 'kitesurf',   label: 'Kiteboarding',    filterValue: 'kitesurf' },
    { id: 'wingfoil',   label: 'Wing Foiling',    filterValue: 'wingfoil' },
    { id: 'foiling',    label: 'Foiling',         filterValue: 'foiling' },
    { id: 'efoil',      label: 'E-Foiling',       filterValue: 'efoil' },
    { id: 'ion',        label: 'ION Accessories', filterValue: 'ion' },
    { id: 'ukc-shop',   label: 'UKC Shop',        filterValue: 'ukc-shop' },
    { id: 'secondwind', label: 'SecondWind',       filterValue: 'secondwind' },
];

const SHOP_NAV_ITEMS = SHOP_NAV_CATEGORIES.map(cat => {
    const subcats = hasSubcategories(cat.filterValue)
        ? getHierarchicalSubcategories(cat.filterValue).map(s => ({ value: s.value, label: s.label }))
        : [];
    return { ...cat, id: cat.filterValue, children: subcats };
});

const SKELETON_KEYS = Array.from({ length: 8 }, (_, i) => `skeleton-${i}`);
const PRODUCTS_PER_CATEGORY_INITIAL = 10;

const renderLoadingSkeletons = () => (
    <Row gutter={[12, 16]}>
        {SKELETON_KEYS.map((key) => (
            <Col key={key} xs={12} sm={8} md={6} lg={6} xl={6}>
                <Card className="h-full rounded-xl border-0 shadow-sm">
                    <Skeleton.Image style={{ width: '100%', height: 200 }} active />
                    <Skeleton active paragraph={{ rows: 2 }} title={{ width: '60%' }} className="mt-3" />
                </Card>
            </Col>
        ))}
    </Row>
);

const ShopPage = () => {
    usePageSEO({
        title: 'Browse Products | UKC. Shop',
        description: 'Browse and shop watersports gear, kites, boards, wetsuits, harnesses, and accessories from Duotone and other top brands.',
        path: '/shop/browse',
    });

    const screens = useBreakpoint();
    const isDesktop = screens.lg;

    const location = useLocation();
    const navigate = useNavigate();

    const [products, setProducts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [cartVisible, setCartVisible] = useState(false);
    const [filterDrawerOpen, setFilterDrawerOpen] = useState(false);
    const [expandedCategorySections, setExpandedCategorySections] = useState({});

    const { isGuest, isAuthenticated } = useAuth();
    const { openAuthModal } = useAuthModal();
    const { data: walletSummary, refetch: refetchWallet } = useWalletSummary({ enabled: isAuthenticated });

    const {
        selectedCategory,
        selectedSubcategory,
        selectedBrand,
        sortBy,
        showInStockOnly,
        searchText,
        priceRange,
        allProducts,
        activeFilterCount,
        availableCategories,
        setSelectedBrand,
        setSortBy,
        setShowInStockOnly,
        setSearchText,
        setAllProducts,
        setPriceRange,
        handleCategoryChange,
        handleSubcategoryChange,
        handleSortChange,
        clearAllFilters,
    } = useShopFilters();

    const fetchIdRef = useRef(0);
    const allProductsFetchedRef = useRef(false);
    const masterProductsRef = useRef([]);
    const [masterProductsVersion, setMasterProductsVersion] = useState(0);
    const categoryCacheRef = useRef({});

    const { formatCurrency, convertCurrency, userCurrency } = useCurrency();

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

    const { addToCart: addToCartContext, addToWishlist, removeFromWishlist, isInWishlist, getCartCount } = useCart();

    // ─── Data Fetching ──────────────────────────────────────────────────────────

    // For 'all' view: grouped display via by-category endpoint (cached)
    // For specific category: getProducts() with full filter support at DB level
    const fetchForCategory = useCallback(async (category, filterParams = {}) => {
        const isAllView = category === 'all' || category === 'featured';
        const cacheKey = category;

        // Only use cache for the 'all' view (unfiltered)
        if (isAllView && categoryCacheRef.current[cacheKey]) {
            masterProductsRef.current = categoryCacheRef.current[cacheKey];
            setMasterProductsVersion(v => v + 1);
            setLoading(false);
            return;
        }

        const currentFetchId = ++fetchIdRef.current;
        setLoading(true);
        setError(null);

        try {
            let prods = [];

            if (isAllView) {
                const response = await productApi.getProductsByCategory(500);
                if (currentFetchId !== fetchIdRef.current) return;
                if (response.success && response.categories) {
                    Object.values(response.categories).forEach(g => prods.push(...g.products));
                    normalizeProducts(prods);
                    if (prods.length > 0 && !allProductsFetchedRef.current) {
                        setAllProducts(prods);
                        allProductsFetchedRef.current = true;
                    }
                }
                categoryCacheRef.current[cacheKey] = prods;
            } else {
                // Single-category: use getProducts with full filter support
                const {
                    brand: filterBrand,
                    priceRange: filterPrice,
                    in_stock: filterInStock,
                    subcategory: filterSubcat,
                } = filterParams;

                const response = await productApi.getProducts({
                    page: 1,
                    limit: 500,
                    category,
                    status: 'active',
                    subcategory: filterSubcat && filterSubcat !== 'all' ? filterSubcat : undefined,
                    brand: filterBrand && filterBrand !== 'all' ? filterBrand : undefined,
                    min_price: filterPrice && filterPrice[0] > 0 ? filterPrice[0] : undefined,
                    max_price: filterPrice && filterPrice[1] < DEFAULT_PRICE_RANGE[1] ? filterPrice[1] : undefined,
                    in_stock: true,
                    sort_by: 'created_at',
                    sort_order: 'DESC',
                });

                if (currentFetchId !== fetchIdRef.current) return;
                if (response?.data) {
                    prods = normalizeProducts([...response.data]);
                }
            }

            masterProductsRef.current = prods;
            setMasterProductsVersion(v => v + 1);
            setProducts(prods);
        } catch (err) {
            if (currentFetchId !== fetchIdRef.current) return;
            const reason = err?.response?.data?.message;
            setError(reason || 'Unable to load products right now. Please try again soon.');
        } finally {
            if (currentFetchId === fetchIdRef.current) setLoading(false);
        }
    }, [setAllProducts]);

    // Fetch on mount and when category changes (resets filters)
    useEffect(() => {
        fetchForCategory(selectedCategory, {
            brand: selectedBrand,
            priceRange,
            in_stock: showInStockOnly,
            subcategory: selectedSubcategory,
        });
    }, [selectedCategory]); // eslint-disable-line react-hooks/exhaustive-deps

    // Re-fetch when filters change for single-category views
    useEffect(() => {
        if (selectedCategory === 'all' || selectedCategory === 'featured') return;
        fetchForCategory(selectedCategory, {
            brand: selectedBrand,
            priceRange,
            in_stock: showInStockOnly,
            subcategory: selectedSubcategory,
        });
    }, [selectedBrand, priceRange, showInStockOnly, selectedSubcategory]); // eslint-disable-line react-hooks/exhaustive-deps

    // For 'all' view: apply subcategory/featured filtering client-side from master set
    useEffect(() => {
        if (masterProductsRef.current.length === 0) return;
        if (selectedCategory !== 'all' && selectedCategory !== 'featured') return;

        let result = masterProductsRef.current;

        if (selectedCategory === 'featured') {
            result = result.filter(p => p.is_featured);
        } else if (selectedSubcategory !== 'all') {
            const catDef = PRODUCT_CATEGORIES[selectedCategory];
            const childValues = new Set([selectedSubcategory]);
            if (catDef?.subcategories) {
                Object.values(catDef.subcategories).forEach(sub => {
                    if (sub.parent === selectedSubcategory) childValues.add(sub.value);
                });
            }
            result = result.filter(p =>
                childValues.has(p.subcategory) ||
                p.subcategory?.startsWith(selectedSubcategory + '-')
            );
        }

        setProducts(result);
    }, [selectedCategory, selectedSubcategory, masterProductsVersion]);

    // Open cart from location state
    useEffect(() => {
        if (!location.state?.openCart) return;
        setCartVisible(true);
        const { openCart, ...restState } = location.state;
        navigate(`${location.pathname}${location.search}${location.hash}`, {
            replace: true,
            state: Object.keys(restState).length > 0 ? restState : null
        });
    }, [location, navigate]);

    // ─── Filter Handlers ────────────────────────────────────────────────────────

    const localHandleCategoryChange = useCallback((value, keepSubcategory = false) => {
        handleCategoryChange(value, keepSubcategory);
        const scrollContainer = document.querySelector('.content-container') || window;
        scrollContainer.scrollTo({ top: 0, behavior: 'smooth' });
    }, [handleCategoryChange]);

    const localHandleSubcategoryChange = useCallback((value) => {
        handleSubcategoryChange(value);
    }, [handleSubcategoryChange]);

    const handleNavSubItemClick = useCallback((parentId, childValue) => {
        localHandleCategoryChange(parentId, true);
        localHandleSubcategoryChange(childValue);
    }, [localHandleCategoryChange, localHandleSubcategoryChange]);

    const handleAddToCart = useCallback((product, options = {}) => {
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
    }, [addToCartContext, isGuest, isAuthenticated, openAuthModal]);

    const handleWishlistToggle = useCallback((product) => {
        if (isInWishlist(product.id)) {
            removeFromWishlist(product.id);
            message.success('Removed from wishlist');
        } else {
            addToWishlist(product);
            message.success('Saved to wishlist');
        }
    }, [isInWishlist, removeFromWishlist, addToWishlist]);

    const cartCount = getCartCount();

    // ─── Available Brands (client-side, from loaded products) ──────────────────

    const availableBrands = useMemo(() => {
        const brandMap = {};
        const source = selectedCategory === 'all'
            ? masterProductsRef.current
            : products;

        source.forEach(p => {
            const brand = p.brand;
            if (brand && brand.trim()) {
                if (!brandMap[brand]) brandMap[brand] = { value: brand, label: brand, count: 0 };
                brandMap[brand].count++;
            }
        });

        const sorted = Object.values(brandMap).sort((a, b) =>
            b.count !== a.count ? b.count - a.count : a.label.localeCompare(b.label)
        );

        return sorted;
    }, [products, selectedCategory, masterProductsVersion]); // eslint-disable-line react-hooks/exhaustive-deps

    // ─── Client-side filtering for 'all' view + search (always client-side) ────

    const filteredProducts = useMemo(() => {
        let result = products;
        const isAllView = selectedCategory === 'all' || selectedCategory === 'featured';

        // Search text — always client-side for instant UX
        if (searchText.trim()) {
            const query = searchText.toLowerCase();
            result = result.filter(p =>
                p.name?.toLowerCase().includes(query) ||
                p.brand?.toLowerCase().includes(query) ||
                p.category?.toLowerCase().includes(query)
            );
        }

        // Brand/price/stock — client-side only for 'all' view
        // (for single-category these are already filtered at the DB level)
        if (isAllView) {
            if (selectedBrand !== 'all') {
                result = result.filter(p => p.brand === selectedBrand);
            }
            if (showInStockOnly) {
                result = result.filter(p => p.stock_quantity > 0);
            }
            if (priceRange[0] > DEFAULT_PRICE_RANGE[0]) {
                result = result.filter(p => p.price >= priceRange[0]);
            }
            if (priceRange[1] < DEFAULT_PRICE_RANGE[1]) {
                result = result.filter(p => p.price <= priceRange[1]);
            }
        }

        // Sort (always client-side on the returned set)
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
                break;
        }

        return result;
    }, [products, searchText, selectedBrand, showInStockOnly, sortBy, priceRange, selectedCategory]);

    // Group products by category (for 'all' view)
    const productsByCategory = useMemo(() => {
        const grouped = {};
        filteredProducts.forEach(product => {
            const cat = product.category || 'other';
            if (!grouped[cat]) grouped[cat] = [];
            grouped[cat].push(product);
        });
        return grouped;
    }, [filteredProducts]);

    const toggleCategoryExpansion = useCallback((category) => {
        setExpandedCategorySections(prev => ({ ...prev, [category]: !prev[category] }));
    }, []);

    // Sidebar tree: which categories are expanded
    const [sidebarExpandedCats, setSidebarExpandedCats] = useState({});

    // Auto-expand the active category in the sidebar tree
    useEffect(() => {
        if (selectedCategory && selectedCategory !== 'all' && selectedCategory !== 'featured') {
            setSidebarExpandedCats(prev => ({ ...prev, [selectedCategory]: true }));
        }
    }, [selectedCategory]);

    // Build category → subcategory → count tree from filtered products
    // This drives the sidebar browse tree — always reflects current brand/price/stock filters
    const productTree = useMemo(() => {
        const tree = {};
        filteredProducts.forEach(p => {
            const cat = p.category;
            if (!cat) return;
            if (!tree[cat]) tree[cat] = { count: 0, subcategories: {} };
            tree[cat].count++;
            if (p.subcategory) {
                tree[cat].subcategories[p.subcategory] = (tree[cat].subcategories[p.subcategory] || 0) + 1;
            }
        });
        return tree;
    }, [filteredProducts]);

    // Get subcategory label from PRODUCT_CATEGORIES constants
    const getSubcatLabel = useCallback((cat, sub) => {
        return PRODUCT_CATEGORIES[cat]?.subcategories?.[sub]?.label || sub.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    }, []);

    // Get top-level subcategories (parent=null) with their child subs from productTree
    const getTopLevelSubcats = useCallback((cat) => {
        const catDef = PRODUCT_CATEGORIES[cat]?.subcategories;
        if (!catDef) return [];
        const treeSubcats = productTree[cat]?.subcategories || {};
        const catDefValues = Object.values(catDef);

        // Recursively count products for a subcategory and ALL its descendants
        const countWithDescendants = (value) => {
            const direct = treeSubcats[value] || 0;
            const children = catDefValues.filter(s => s.parent === value);
            return direct + children.reduce((sum, c) => sum + countWithDescendants(c.value), 0);
        };

        // Build top-level list: subcategories that are either parent=null or have no parent field
        const topLevel = catDefValues.filter(s => !s.parent);

        return topLevel
            .map(parent => {
                const count = countWithDescendants(parent.value);
                const children = catDefValues.filter(s => s.parent === parent.value);
                const childItems = children
                    .map(c => ({ value: c.value, label: c.label, count: countWithDescendants(c.value) }))
                    .filter(c => c.count > 0);
                return { value: parent.value, label: parent.label, count, children: childItems };
            })
            .filter(s => s.count > 0)
            .sort((a, b) => b.count - a.count);
    }, [productTree]);

    // ─── Filter Panel (sidebar + drawer content) ────────────────────────────────

    const FilterPanel = () => {
        const treeCategoryOrder = Object.keys(productTree).sort(
            (a, b) => productTree[b].count - productTree[a].count
        );

        return (
            <div className="space-y-5">
                <div className="flex items-center justify-between">
                    <h3 className="text-xs font-bold text-gray-900 uppercase tracking-wider m-0">Browse</h3>
                    {activeFilterCount > 0 && (
                        <button
                            onClick={() => { clearAllFilters(); setFilterDrawerOpen(false); setSidebarExpandedCats({}); }}
                            className="text-xs text-gray-400 hover:text-gray-900 underline"
                        >
                            Clear all
                        </button>
                    )}
                </div>

                {/* Category + Subcategory Tree */}
                <div className="space-y-0.5">
                    {/* All products row */}
                    <button
                        onClick={() => { localHandleCategoryChange('all'); setSidebarExpandedCats({}); }}
                        className={`w-full flex items-center justify-between px-2 py-1.5 rounded-lg text-sm transition-colors ${
                            selectedCategory === 'all'
                                ? 'bg-[#00a8c4]/10 text-[#00a8c4] font-semibold'
                                : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                        }`}
                    >
                        <span>All Products</span>
                        <span className={`text-xs tabular-nums ${selectedCategory === 'all' ? 'text-[#00a8c4]' : 'text-gray-400'}`}>
                            {filteredProducts.length}
                        </span>
                    </button>

                    {/* Category rows */}
                    {treeCategoryOrder.map(cat => {
                        const { count } = productTree[cat];
                        const catLabel = CATEGORY_LABELS[cat] || cat;
                        const isCatActive = selectedCategory === cat;
                        const isExpanded = sidebarExpandedCats[cat];
                        const topSubcats = getTopLevelSubcats(cat);
                        const hasSubcats = topSubcats.length > 0;

                        return (
                            <div key={cat}>
                                {/* Category row */}
                                <div className={`flex items-center rounded-lg transition-colors ${
                                    isCatActive ? 'bg-[#00a8c4]/10' : 'hover:bg-gray-50'
                                }`}>
                                    <button
                                        onClick={() => {
                                            localHandleCategoryChange(cat);
                                            if (!sidebarExpandedCats[cat]) {
                                                setSidebarExpandedCats(prev => ({ ...prev, [cat]: true }));
                                            }
                                        }}
                                        className={`flex-1 flex items-center gap-1.5 px-2 py-1.5 text-sm text-left transition-colors ${
                                            isCatActive ? 'text-[#00a8c4] font-semibold' : 'text-gray-700 hover:text-gray-900'
                                        }`}
                                    >
                                        <span>{catLabel}</span>
                                    </button>
                                    <div className="flex items-center gap-1 pr-2">
                                        <span className={`text-xs tabular-nums ${isCatActive ? 'text-[#00a8c4]' : 'text-gray-400'}`}>
                                            {count}
                                        </span>
                                        {hasSubcats && (
                                            <button
                                                onClick={() => setSidebarExpandedCats(prev => ({ ...prev, [cat]: !prev[cat] }))}
                                                className="text-gray-400 hover:text-gray-700 p-0.5 rounded transition-colors"
                                            >
                                                <DownOutlined className={`text-[9px] transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                                            </button>
                                        )}
                                    </div>
                                </div>

                                {/* Subcategory rows */}
                                {isExpanded && hasSubcats && (
                                    <div className="ml-3 border-l border-gray-100 pl-2 space-y-0.5 mt-0.5 mb-1">
                                        {topSubcats.map(sub => {
                                            const isSubActive = selectedCategory === cat && selectedSubcategory === sub.value;
                                            return (
                                                <div key={sub.value}>
                                                    {/* Top-level subcategory */}
                                                    <button
                                                        onClick={() => {
                                                            localHandleCategoryChange(cat, true);
                                                            localHandleSubcategoryChange(sub.value);
                                                            setFilterDrawerOpen(false);
                                                        }}
                                                        className={`w-full flex items-center justify-between px-2 py-1 rounded-md text-sm transition-colors ${
                                                            isSubActive
                                                                ? 'bg-[#00a8c4]/10 text-[#00a8c4] font-medium'
                                                                : 'text-gray-500 hover:bg-gray-50 hover:text-gray-800'
                                                        }`}
                                                    >
                                                        <span>{sub.label}</span>
                                                        <span className={`text-xs tabular-nums ${isSubActive ? 'text-[#00a8c4]' : 'text-gray-300'}`}>
                                                            {sub.count}
                                                        </span>
                                                    </button>

                                                    {/* Child subcategories */}
                                                    {sub.children.length > 0 && (
                                                        <div className="ml-2 border-l border-gray-100 pl-2 space-y-0.5 mt-0.5">
                                                            {sub.children.map(child => {
                                                                const isChildActive = selectedCategory === cat && selectedSubcategory === child.value;
                                                                return (
                                                                    <button
                                                                        key={child.value}
                                                                        onClick={() => {
                                                                            localHandleCategoryChange(cat, true);
                                                                            localHandleSubcategoryChange(child.value);
                                                                            setFilterDrawerOpen(false);
                                                                        }}
                                                                        className={`w-full flex items-center justify-between px-2 py-1 rounded-md text-xs transition-colors ${
                                                                            isChildActive
                                                                                ? 'bg-[#00a8c4]/10 text-[#00a8c4] font-medium'
                                                                                : 'text-gray-400 hover:bg-gray-50 hover:text-gray-700'
                                                                        }`}
                                                                    >
                                                                        <span>{child.label}</span>
                                                                        <span className={`tabular-nums ${isChildActive ? 'text-[#00a8c4]' : 'text-gray-300'}`}>
                                                                            {child.count}
                                                                        </span>
                                                                    </button>
                                                                );
                                                            })}
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}

                                        {/* "All in category" shortcut when drilled into subcategory */}
                                        {isCatActive && selectedSubcategory !== 'all' && (
                                            <button
                                                onClick={() => localHandleSubcategoryChange('all')}
                                                className="w-full flex items-center gap-1 px-2 py-1 text-xs text-gray-400 hover:text-[#00a8c4] transition-colors"
                                            >
                                                ← All {catLabel}
                                            </button>
                                        )}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>

                <Divider className="my-0" />

                {/* Brand */}
                {availableBrands.length > 0 && (
                    <>
                        <div>
                            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2.5 m-0">Brand</p>
                            <div className="space-y-1 max-h-48 overflow-y-auto pr-1">
                                {availableBrands.map(brand => (
                                    <label
                                        key={brand.value}
                                        className="flex items-center gap-2 cursor-pointer group py-0.5"
                                    >
                                        <Checkbox
                                            checked={selectedBrand === brand.value}
                                            onChange={() =>
                                                setSelectedBrand(selectedBrand === brand.value ? 'all' : brand.value)
                                            }
                                        />
                                        <span className="text-sm text-gray-700 group-hover:text-gray-900 flex-1 leading-none">
                                            {brand.label}
                                        </span>
                                        <span className="text-xs text-gray-300 tabular-nums">{brand.count}</span>
                                    </label>
                                ))}
                            </div>
                        </div>
                        <Divider className="my-0" />
                    </>
                )}

                {/* In Stock */}
                <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-700">In stock only</span>
                    <Switch
                        checked={showInStockOnly}
                        onChange={setShowInStockOnly}
                        size="small"
                        style={showInStockOnly ? { backgroundColor: '#00a8c4' } : {}}
                    />
                </div>
            </div>
        );
    };

    // ─── Active Filter Chips ────────────────────────────────────────────────────

    const renderActiveFilters = () => {
        if (activeFilterCount === 0) return null;

        const chips = [];
        const tagStyle = {
            borderRadius: 16,
            padding: '4px 12px',
            background: '#f3f4f6',
            border: 'none',
            fontSize: 13
        };
        const closeIcon = <CloseOutlined style={{ fontSize: 10 }} />;

        if (selectedCategory !== 'all') {
            const cat = availableCategories.find(c => c.value === selectedCategory);
            const subLabel = selectedSubcategory !== 'all'
                ? getSubcatLabel(selectedCategory, selectedSubcategory)
                : null;
            chips.push(
                <Tag key="category" closable onClose={() => handleCategoryChange('all')} style={tagStyle} closeIcon={closeIcon}>
                    {cat?.label}{subLabel ? ` › ${subLabel}` : ''}
                </Tag>
            );
        }
        if (selectedBrand !== 'all') {
            chips.push(
                <Tag key="brand" closable onClose={() => setSelectedBrand('all')} style={tagStyle} closeIcon={closeIcon}>
                    {selectedBrand}
                </Tag>
            );
        }
        if (searchText.trim()) {
            chips.push(
                <Tag key="search" closable onClose={() => setSearchText('')} style={tagStyle} closeIcon={closeIcon}>
                    "{searchText}"
                </Tag>
            );
        }
        if (showInStockOnly) {
            chips.push(
                <Tag key="stock" closable onClose={() => setShowInStockOnly(false)} style={tagStyle} closeIcon={closeIcon}>
                    In Stock
                </Tag>
            );
        }

        return (
            <div className="flex items-center gap-2 flex-wrap mb-4">
                {chips}
                <button
                    onClick={clearAllFilters}
                    className="text-xs text-gray-400 hover:text-gray-900 underline ml-1"
                >
                    Clear all
                </button>
            </div>
        );
    };

    // ─── Header ─────────────────────────────────────────────────────────────────

    const renderHeader = () => (
        <div className="mb-3 flex items-center gap-2 flex-wrap">
            {/* Mobile filter button */}
            {!isDesktop && (
                <Button
                    icon={<FilterOutlined />}
                    onClick={() => setFilterDrawerOpen(true)}
                    style={{ borderRadius: 8 }}
                >
                    Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
                </Button>
            )}

            {/* Search */}
            <div className="flex-1 min-w-[180px] max-w-xs">
                <Input
                    placeholder="Search products..."
                    prefix={<SearchOutlined className="text-gray-400 mr-1" />}
                    value={searchText}
                    onChange={(e) => setSearchText(e.target.value)}
                    allowClear
                    size="large"
                    className="hover:border-black focus:border-black"
                    style={{ borderRadius: 8, backgroundColor: '#f9fafb' }}
                />
            </div>

            {/* Sort */}
            <Select
                value={sortBy}
                onChange={handleSortChange}
                size="large"
                style={{ width: 200 }}
                styles={{ popup: { root: { borderRadius: 8, padding: 4 } } }}
            >
                {SORT_OPTIONS.map(opt => (
                    <Option key={opt.value} value={opt.value}>
                        <span className="font-medium text-gray-700">{opt.label}</span>
                    </Option>
                ))}
            </Select>

            {/* Results count */}
            <div className="text-gray-400 font-medium text-xs flex items-center gap-1.5 ml-auto">
                <div className="h-1.5 w-1.5 rounded-full bg-green-500" />
                {loading ? '…' : `${filteredProducts.length} items`}
            </div>
        </div>
    );

    // ─── Product Grid ────────────────────────────────────────────────────────────

    const renderProducts = () => {
        if (loading) return renderLoadingSkeletons();

        if (error) {
            return (
                <div className="rounded-xl bg-white p-6 shadow-sm">
                    <Alert type="error" message="Unable to load products" description={error} showIcon />
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
                                    {searchText ? 'No products match your search' : 'No products found'}
                                </p>
                                {activeFilterCount > 0 && (
                                    <Button type="link" onClick={clearAllFilters}>Clear all filters</Button>
                                )}
                            </div>
                        }
                        image={Empty.PRESENTED_IMAGE_SIMPLE}
                    />
                </div>
            );
        }

        const isAllView = (selectedCategory === 'all' || selectedCategory === 'featured') && !searchText.trim();

        // Grouped view for 'all' / 'featured'
        if (isAllView) {
            const categoryOrder = Object.keys(productsByCategory).sort(
                (a, b) => productsByCategory[b].length - productsByCategory[a].length
            );

            return (
                <div className="space-y-8">
                    {categoryOrder.map(category => {
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
                                <div className="flex items-end justify-between border-b border-gray-200 pb-2">
                                    <div className="flex items-center gap-2">
                                        <h2 className="text-xl font-bold text-gray-900 tracking-tight m-0 leading-none">{categoryLabel}</h2>
                                        <span className="bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full text-xs font-semibold">
                                            {categoryProducts.length}
                                        </span>
                                    </div>
                                    <Button
                                        type="link"
                                        className="text-gray-500 hover:text-black font-semibold text-sm mr-2 flex items-center gap-1 p-0"
                                        onClick={() => handleCategoryChange(category)}
                                    >
                                        View all <RightOutlined className="text-[10px]" />
                                    </Button>
                                </div>

                                <Row gutter={[12, 16]}>
                                    {displayProducts.map(product => (
                                        <Col key={product.id} xs={12} sm={8} md={6} lg={6} xl={6} className="flex">
                                            <ProductCard
                                                product={product}
                                                onWishlistToggle={handleWishlistToggle}
                                                isWishlisted={isInWishlist(product.id)}
                                            />
                                        </Col>
                                    ))}
                                </Row>

                                {hasMore && (
                                    <div className="flex justify-center pt-2 pb-2">
                                        <Button
                                            onClick={() => toggleCategoryExpansion(category)}
                                            className="px-8 h-10 border-gray-300 text-gray-700 hover:border-black hover:text-black font-medium"
                                            style={{ borderRadius: 4 }}
                                        >
                                            {isExpanded
                                                ? 'Show Less'
                                                : `Show ${remainingCount} More ${categoryLabel}`}
                                        </Button>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            );
        }

        // Standard grid (single category or search)
        return (
            <Row gutter={[12, 16]}>
                {filteredProducts.map(product => (
                    <Col key={product.id} xs={12} sm={8} md={6} lg={6} xl={6} className="flex">
                        <ProductCard
                            product={product}
                            onWishlistToggle={handleWishlistToggle}
                            isWishlisted={isInWishlist(product.id)}
                        />
                    </Col>
                ))}
            </Row>
        );
    };

    const activeNavFilter = selectedCategory === 'featured' ? 'all' : selectedCategory;

    // ─── Render ──────────────────────────────────────────────────────────────────

    return (
        <div className="shop-page min-h-screen bg-gray-50 pb-28 lg:px-6">
            <div className="w-full">
                {/* Category Navigation Bar */}
                <StickyNavBar
                    className="sticky top-0 z-30 mb-4 -mx-4 lg:-mx-6"
                    items={SHOP_NAV_ITEMS}
                    activeItem={activeNavFilter}
                    activeSubItem={selectedSubcategory}
                    onItemClick={localHandleCategoryChange}
                    onSubItemClick={handleNavSubItemClick}
                />

                <div className="px-4">
                    {renderHeader()}
                    {renderActiveFilters()}

                    {/* Content: Sidebar + Grid */}
                    <div className="flex gap-6 items-start">

                        {/* Left Sidebar — desktop only */}
                        {isDesktop && (
                            <aside
                                className="w-60 flex-shrink-0 bg-white rounded-xl border border-gray-200 p-5"
                                style={{ position: 'sticky', top: 80 }}
                            >
                                <FilterPanel />
                            </aside>
                        )}

                        {/* Product Grid */}
                        <div className="flex-1 min-w-0">
                            {renderProducts()}
                        </div>
                    </div>
                </div>

                {/* Mobile Filter Drawer */}
                <Drawer
                    title="Filters"
                    placement="bottom"
                    height="auto"
                    open={filterDrawerOpen}
                    onClose={() => setFilterDrawerOpen(false)}
                    styles={{
                        body: { paddingBottom: 32, maxHeight: '75vh', overflowY: 'auto' },
                        header: { borderBottom: '1px solid #f0f0f0' }
                    }}
                    extra={
                        <Button type="primary" size="small" onClick={() => setFilterDrawerOpen(false)}
                            style={{ backgroundColor: '#00a8c4', borderColor: '#00a8c4' }}>
                            Show {filteredProducts.length} results
                        </Button>
                    }
                >
                    <FilterPanel />
                </Drawer>

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
                        background: '#4b4f54',
                        boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
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
            </div>
        </div>
    );
};

export default ShopPage;
