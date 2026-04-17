import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Tag, Divider, Skeleton, Badge, Typography, Button } from 'antd';
import { message } from '@/shared/utils/antdStatic';
import {
    HeartFilled, HeartOutlined, ShoppingCartOutlined,
    ArrowLeftOutlined
} from '@ant-design/icons';
import { productApi } from '@/shared/services/productApi';
import { useCurrency } from '@/shared/contexts/CurrencyContext';
import { useCart } from '@/shared/contexts/CartContext';
import { useAuth } from '@/shared/hooks/useAuth';
import { useWalletSummary } from '@/shared/hooks/useWalletSummary';
import { getCategoryLabel } from '@/shared/constants/productCategories';
import ProductImageGallery from '@/features/outsider/components/ProductImageGallery';
import ProductVariantSelector from '@/features/outsider/components/ProductVariantSelector';
import RelatedProducts from '@/features/outsider/components/RelatedProducts';
import ContactOptionsBanner from '@/features/outsider/components/ContactOptionsBanner';
import ProductAddOns from '@/features/outsider/components/ProductAddOns';
import ShoppingCart from '@/features/students/components/ShoppingCart';
import { usePageSEO } from '@/shared/utils/seo';

const { Title } = Typography;

const parseJSON = (field) => {
    if (!field) return null;
    if (typeof field === 'string') { try { return JSON.parse(field); } catch { return null; } }
    return field;
};

const getStockStatus = (quantity) => {
    if (quantity === 0) return { label: 'Out of Stock', color: '#ff4d4f' };
    if (quantity <= 5) return { label: 'Low Stock', color: '#faad14' };
    if (quantity <= 10) return { label: 'Limited', color: '#faad14' };
    return { label: 'In Stock', color: '#52c41a' };
};

const ProductDetailPage = () => {
    const { id } = useParams();
    const navigate = useNavigate();

    const { data: product, isLoading: loading, error: queryError } = useQuery({
        queryKey: ['product', id],
        queryFn: () => productApi.getProduct(id),
    });
    const error = queryError
        ? (queryError?.response?.status === 404 ? 'Product not found' : 'Failed to load product')
        : (!loading && !product ? 'Product not found' : null);

    // SEO is updated dynamically once product loads (see useEffect below)
    usePageSEO({
      title: product ? `${product.name} | Plannivo Shop` : 'Product | Plannivo Shop',
      description: product?.description?.slice(0, 160) || 'View product details, specifications, and pricing.',
      path: `/shop/product/${id}`,
    });
    const [cartVisible, setCartVisible] = useState(false);

    // Variant state lifted from ProductVariantSelector
    const [variantState, setVariantState] = useState({
        selectedColor: null,
        selectedSize: null,
        selectedVariant: null,
        displayPrice: null
    });
    const [selectedAddons, setSelectedAddons] = useState([]);

    const { formatCurrency, convertCurrency, userCurrency } = useCurrency();
    const { isAuthenticated } = useAuth();
    const { data: walletSummary, refetch: refetchWallet } = useWalletSummary({ enabled: isAuthenticated });
    const {
        addToCart: addToCartContext,
        addToWishlist,
        removeFromWishlist,
        isInWishlist,
        getCartCount
    } = useCart();

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

    useEffect(() => {
        setSelectedAddons([]);
    }, [id]);


    const handleAddToCart = useCallback(() => {
        const productWithPrice = {
            ...product,
            price: variantState.displayPrice ?? product.price
        };
        addToCartContext(productWithPrice, 1, {
            selectedSize: variantState.selectedSize,
            selectedColor: variantState.selectedColor,
            selectedVariant: variantState.selectedVariant
        });
        selectedAddons.forEach(addon => addToCartContext(addon, 1, {
            selectedSize: addon._selectedSize || null
        }));
        const count = 1 + selectedAddons.length;
        message.success(`${count} item${count > 1 ? 's' : ''} added to cart`);
        setSelectedAddons([]);
    }, [product, variantState, selectedAddons, addToCartContext]);

    const handleWishlistToggle = useCallback((p) => {
        const target = p || product;
        if (!target) return;
        if (isInWishlist(target.id)) {
            removeFromWishlist(target.id);
            message.success('Removed from wishlist');
        } else {
            addToWishlist(target);
            message.success('Saved to wishlist');
        }
    }, [product, isInWishlist, removeFromWishlist, addToWishlist]);

    const cartCount = getCartCount();

    const displayPrice = variantState.displayPrice ?? product?.price;
    const productCurrency = product?.currency || 'EUR';

    const { addDisabled } = useMemo(() => {
        const variants = parseJSON(product?.variants);
        const colors = parseJSON(product?.colors);
        const sizes = parseJSON(product?.sizes);
        const colorsFromVariants = variants?.length > 0
            ? [...new Set(variants.map(v => v.color).filter(Boolean))] : [];
        const colorsFromArray = Array.isArray(colors) && colors.length > 0
            ? colors.map(c => typeof c === 'object' && c.name ? c.name : c).filter(Boolean) : [];
        const uniqueColors = colorsFromVariants.length > 0 ? colorsFromVariants : colorsFromArray;
        const uniqueSizes = variants?.length > 0
            ? [...new Set(variants.map(v => v.size || v.label).filter(Boolean))]
            : sizes?.map(s => s.size || s) || [];
        return {
            addDisabled: (uniqueSizes.length > 0 && !variantState.selectedSize)
                || (uniqueColors.length > 0 && !variantState.selectedColor)
        };
    }, [product, variantState.selectedSize, variantState.selectedColor]);

    const toUser = useCallback(
        (amount, currency = productCurrency) =>
            convertCurrency ? convertCurrency(Number(amount), currency, userCurrency) : Number(amount),
        [convertCurrency, userCurrency, productCurrency]
    );
    const baseTotal = toUser(displayPrice);
    const addonTotal = selectedAddons.reduce((sum, a) => sum + toUser(a.price, a.currency || 'EUR'), 0);
    const grandTotal = baseTotal + addonTotal;

    // Loading state
    if (loading) {
        return (
            <div className="min-h-screen bg-white">
                <div className="max-w-6xl mx-auto px-4 pt-6 pb-12">
                    <Skeleton active paragraph={{ rows: 1 }} style={{ maxWidth: 300 }} />
                    <div className="flex flex-col md:flex-row gap-8 mt-6">
                        <div className="w-full md:w-[55%]">
                            <div className="bg-gray-100 rounded-lg animate-pulse" style={{ paddingTop: '100%' }} />
                        </div>
                        <div className="w-full md:w-[45%]">
                            <Skeleton active paragraph={{ rows: 8 }} />
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    // Error state
    if (error || !product) {
        return (
            <div className="min-h-screen bg-white">
                <div className="max-w-6xl mx-auto px-4 pt-6 pb-12 text-center">
                    <div className="py-20">
                        <ShoppingCartOutlined style={{ fontSize: 64, color: '#d9d9d9' }} />
                        <Title level={3} className="mt-4" style={{ color: '#595959' }}>
                            {error || 'Product not found'}
                        </Title>
                        <Button type="primary" onClick={() => navigate('/shop/browse')} className="mt-4">
                            Back to Shop
                        </Button>
                    </div>
                </div>
            </div>
        );
    }

    const stock = getStockStatus(product.stock_quantity || 0);
    const categoryLabel = getCategoryLabel(product.category) || 'Shop';
    const description = product.description_detailed || product.description;

    return (
        <div className="min-h-screen bg-white">

            <div className="max-w-6xl mx-auto px-4 pt-6 pb-32 md:pb-12">
                {/* Back + Breadcrumb */}
                <div className="flex items-center gap-2 text-sm text-gray-400 mb-6 flex-wrap">
                    <button onClick={() => navigate(-1)} className="hover:text-gray-700 cursor-pointer bg-transparent border-none p-0 text-sm text-gray-400 flex items-center gap-1 mr-2">
                        <ArrowLeftOutlined style={{ fontSize: 12 }} /> Back
                    </button>
                    <span className="text-gray-300">|</span>
                    <button onClick={() => navigate('/shop')} className="hover:text-gray-700 cursor-pointer bg-transparent border-none p-0 text-sm text-gray-400 font-duotone-regular">
                        Shop
                    </button>
                    <span>/</span>
                    <button onClick={() => navigate(`/shop/${product.category}`)} className="hover:text-gray-700 cursor-pointer bg-transparent border-none p-0 text-sm text-gray-400 font-duotone-regular">
                        {categoryLabel}
                    </button>
                    <span>/</span>
                    <span className="text-gray-700 font-duotone-regular">{product.name}</span>
                </div>

                {/* Two-column layout (desktop) / stacked (mobile) */}
                <div className="flex flex-col md:flex-row gap-8">
                    {/* Left — Image Gallery + Description + Details */}
                    <div className="w-full md:w-[55%] flex flex-col gap-8">
                        <ProductImageGallery product={product} selectedColor={variantState.selectedColor} />

                        {/* Description */}
                        {description && (
                            <div>
                                <h3 className="text-sm uppercase tracking-wider text-gray-400 font-duotone-bold mb-3">Description</h3>
                                <p className="text-gray-600 text-sm leading-relaxed font-duotone-regular whitespace-pre-line m-0">
                                    {description}
                                </p>
                            </div>
                        )}

                        {/* Product Specs */}
                        <div>
                            <h3 className="text-sm uppercase tracking-wider text-gray-400 font-duotone-bold mb-3">Details</h3>
                            <div className="space-y-2 text-sm">
                                {product.sku && (
                                    <div className="flex justify-between">
                                        <span className="text-gray-400">SKU</span>
                                        <span className="text-gray-700 font-duotone-regular">{product.sku}</span>
                                    </div>
                                )}
                                <div className="flex justify-between">
                                    <span className="text-gray-400">Category</span>
                                    <span className="text-gray-700 font-duotone-regular">{categoryLabel}</span>
                                </div>
                                {product.subcategory && (
                                    <div className="flex justify-between">
                                        <span className="text-gray-400">Type</span>
                                        <span className="text-gray-700 font-duotone-regular capitalize">{product.subcategory.replace(/-/g, ' ')}</span>
                                    </div>
                                )}
                                {product.weight && (
                                    <div className="flex justify-between">
                                        <span className="text-gray-400">Weight</span>
                                        <span className="text-gray-700 font-duotone-regular">{product.weight} kg</span>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Right — Product Info (sticky on desktop) */}
                    <div className="w-full md:w-[45%] md:sticky md:top-24 md:self-start overflow-visible">
                        <Tag
                            color={stock.color}
                            style={{ borderRadius: 8, border: 0, padding: '4px 12px', fontSize: 12, fontWeight: 600, marginBottom: 12 }}
                        >
                            {stock.label}
                        </Tag>

                        {product.brand && (
                            <p className="text-xs uppercase tracking-[2px] text-gray-400 font-duotone-regular mb-1 mt-0">
                                {product.brand}
                            </p>
                        )}

                        <h1 className="text-2xl md:text-3xl font-duotone-bold-extended text-black leading-tight mb-4 mt-0">
                            {product.name}
                        </h1>

                        <div className="mb-6">
                            <div className="flex items-baseline gap-3">
                                <span className="text-3xl font-bold text-black">
                                    {formatCurrency(baseTotal, userCurrency)}
                                </span>
                                {product.original_price && product.original_price > displayPrice && (
                                    <span className="text-lg text-gray-400 line-through">
                                        {formatCurrency(toUser(product.original_price), userCurrency)}
                                    </span>
                                )}
                            </div>
                            {userCurrency !== productCurrency && (
                                <div className="text-sm text-gray-400 font-duotone-regular mt-0.5">
                                    ≈ {formatCurrency(displayPrice, productCurrency)}
                                    {product.original_price && product.original_price > displayPrice && (
                                        <span className="line-through ml-2 text-gray-300">
                                            {formatCurrency(product.original_price, productCurrency)}
                                        </span>
                                    )}
                                </div>
                            )}
                            {product.original_price && product.original_price > displayPrice && (
                                <span className="text-sm text-green-600 font-semibold">
                                    Save {Math.round(((product.original_price - displayPrice) / product.original_price) * 100)}%
                                </span>
                            )}
                        </div>

                        <Divider style={{ margin: '0 0 20px' }} />

                        <ProductVariantSelector product={product} onChange={setVariantState} />

                        <ProductAddOns
                            key={product.id}
                            category={product.category}
                            subcategory={product.subcategory}
                            currentProductId={product.id}
                            onSelectionChange={setSelectedAddons}
                        />

                        <div className="hidden md:block mt-6">
                            <div className="border border-gray-100 rounded-lg p-3 mb-3 space-y-1.5 text-sm">
                                <div className="flex justify-between text-gray-500 font-duotone-regular">
                                    <span className="truncate mr-2">{product.name}</span>
                                    <span className="whitespace-nowrap">{formatCurrency(baseTotal, userCurrency)}</span>
                                </div>
                                {selectedAddons.map(addon => (
                                    <div key={addon.id} className="flex justify-between text-gray-500 font-duotone-regular">
                                        <span className="truncate mr-2">+ {addon.name}</span>
                                        <span className="whitespace-nowrap">{formatCurrency(toUser(addon.price, addon.currency || 'EUR'), userCurrency)}</span>
                                    </div>
                                ))}
                                <div className="flex justify-between font-duotone-bold text-black border-t border-gray-100 pt-1.5 mt-1.5">
                                    <span>Total</span>
                                    <div className="text-right">
                                        <div>{formatCurrency(grandTotal, userCurrency)}</div>
                                        {userCurrency !== productCurrency && (
                                            <div className="text-xs text-gray-400 font-duotone-regular font-normal">
                                                ≈ {formatCurrency(convertCurrency(grandTotal, userCurrency, productCurrency), productCurrency)}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                            <div className="flex gap-2">
                                <button
                                    onClick={() => handleWishlistToggle()}
                                    className="h-12 w-12 flex-shrink-0 flex items-center justify-center rounded-lg
                                        bg-antrasit border border-duotone-blue/30 text-duotone-blue
                                        hover:bg-[#525759] hover:border-duotone-blue/60
                                        transition-all duration-300 cursor-pointer"
                                >
                                    {isInWishlist(product.id) ? <HeartFilled style={{ fontSize: 18 }} /> : <HeartOutlined style={{ fontSize: 18 }} />}
                                </button>
                                <button
                                    onClick={handleAddToCart}
                                    disabled={addDisabled}
                                    className="flex-1 h-12 flex items-center justify-center gap-2 rounded-lg
                                        bg-antrasit border border-duotone-blue/30 text-duotone-blue
                                        hover:bg-[#525759] hover:border-duotone-blue/60
                                        transition-all duration-300 cursor-pointer font-duotone-bold text-sm tracking-widest
                                        disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    <ShoppingCartOutlined style={{ fontSize: 18 }} />
                                    Add to Cart{selectedAddons.length > 0 ? ` (${1 + selectedAddons.length})` : ''}
                                </button>
                            </div>
                        </div>

                        <div className="mt-8 overflow-visible">
                            <ContactOptionsBanner variant="light" />
                        </div>
                    </div>
                </div>

                <RelatedProducts
                    category={product.category}
                    subcategory={product.subcategory}
                    currentProductId={product.id}
                    onWishlistToggle={handleWishlistToggle}
                    isInWishlist={isInWishlist}
                />
            </div>

            <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-4 pt-2 pb-3 z-50 md:hidden">
                <div className="flex justify-between items-center mb-2 text-sm px-1">
                    <span className="text-gray-500 font-duotone-regular">
                        Total{selectedAddons.length > 0 ? ` (${1 + selectedAddons.length} items)` : ''}
                    </span>
                    <div className="text-right">
                        <div className="font-duotone-bold text-black">{formatCurrency(grandTotal, userCurrency)}</div>
                        {userCurrency !== productCurrency && (
                            <div className="text-xs text-gray-400 font-duotone-regular">
                                ≈ {formatCurrency(convertCurrency(grandTotal, userCurrency, productCurrency), productCurrency)}
                            </div>
                        )}
                    </div>
                </div>
                <div className="flex gap-2">
                    <button
                        onClick={() => handleWishlistToggle()}
                        className="h-12 w-12 flex-shrink-0 flex items-center justify-center rounded-lg
                            bg-antrasit border border-duotone-blue/30 text-duotone-blue
                            hover:bg-[#525759] hover:border-duotone-blue/60
                            transition-all duration-300 cursor-pointer"
                    >
                        {isInWishlist(product.id) ? <HeartFilled style={{ fontSize: 18 }} /> : <HeartOutlined style={{ fontSize: 18 }} />}
                    </button>
                    <button
                        onClick={handleAddToCart}
                        disabled={addDisabled}
                        className="flex-1 h-12 flex items-center justify-center gap-2 rounded-lg
                            bg-antrasit border border-duotone-blue/30 text-duotone-blue
                            hover:bg-[#525759] hover:border-duotone-blue/60
                            transition-all duration-300 cursor-pointer font-duotone-bold tracking-widest
                            disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <ShoppingCartOutlined style={{ fontSize: 18 }} />
                        Add to Cart{selectedAddons.length > 0 ? ` (${1 + selectedAddons.length})` : ''}
                    </button>
                </div>
            </div>

            <div
                onClick={() => setCartVisible(true)}
                className="fixed right-5 bottom-36 md:bottom-8 z-40 cursor-pointer rounded-full bg-[#23272a] p-3 shadow-lg hover:scale-105 active:scale-95 transition-transform"
            >
                <Badge count={cartCount} size="small" offset={[-4, 4]} style={{ boxShadow: '0 2px 6px rgba(0,0,0,0.2)' }}>
                    <ShoppingCartOutlined style={{ fontSize: 26, color: '#1E3A8A' }} />
                </Badge>
            </div>

            <ShoppingCart
                visible={cartVisible}
                onClose={() => setCartVisible(false)}
                userBalance={userBalance}
                onRefreshBalance={isAuthenticated ? refetchWallet : undefined}
            />
        </div>
    );
};

export default ProductDetailPage;
