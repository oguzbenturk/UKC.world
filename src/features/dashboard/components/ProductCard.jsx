import { memo, useState, useMemo, useCallback } from 'react';
import { HeartFilled, HeartOutlined, ShoppingCartOutlined } from '@ant-design/icons';
import { useCurrency } from '@/shared/contexts/CurrencyContext';

const ProductCard = memo(({ 
    product, 
    onPreview, 
    onWishlistToggle, 
    isWishlisted,
    onAddToCart 
}) => {
    const { formatCurrency, convertCurrency, userCurrency } = useCurrency();

    const stockLabel = product.stock_quantity <= 0 ? 'Out of Stock'
        : product.stock_quantity <= 10 ? 'Limited' : null;

    const discountPercent = product.original_price && product.original_price > product.price
        ? Math.round(((product.original_price - product.price) / product.original_price) * 100)
        : 0;

    const imgSrc = useMemo(() => {
        if (product.image_url) return product.image_url;
        if (product.images) {
            const imgs = typeof product.images === 'string' ? JSON.parse(product.images) : product.images;
            return imgs?.[0] || null;
        }
        return null;
    }, [product.image_url, product.images]);

    const [imgError, setImgError] = useState(false);
    const handleImgError = useCallback(() => setImgError(true), []);

    const formattedPrice = formatCurrency(
        convertCurrency ? convertCurrency(product.price, product.currency || 'EUR', userCurrency) : product.price,
        userCurrency
    );

    const formattedOriginal = (product.original_price && product.original_price > product.price)
        ? formatCurrency(
            convertCurrency ? convertCurrency(product.original_price, product.currency || 'EUR', userCurrency) : product.original_price,
            userCurrency
        )
        : null;

    return (
        <div
            className="group relative overflow-hidden cursor-pointer flex flex-col w-full h-full bg-white hover:shadow-lg transition-shadow duration-200"
            style={{ borderRadius: '4px', border: '1px solid #e2e8f0' }}
            onClick={() => onPreview(product)}
        >
            {/* Image */}
            <div className="relative bg-[#f8f9fa] w-full" style={{ paddingTop: '100%' }}>
                <div className="absolute inset-0 p-2">
                    {imgSrc && !imgError ? (
                        <div className="w-full h-full rounded bg-white flex items-center justify-center overflow-hidden">
                            <img
                                src={imgSrc}
                                alt={product.name}
                                loading="lazy"
                                decoding="async"
                                onError={handleImgError}
                                className="h-[90%] w-[90%] object-contain mix-blend-multiply transition-transform duration-300 group-hover:scale-105"
                            />
                        </div>
                    ) : (
                        <div className="flex h-full w-full items-center justify-center bg-white rounded">
                            <ShoppingCartOutlined className="text-5xl text-gray-200" />
                        </div>
                    )}
                </div>
                
                {/* Badges */}
                {stockLabel === 'Limited' && (
                    <span className="absolute left-3 top-3 bg-gray-900 text-white text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-sm">
                        Limited
                    </span>
                )}
                {discountPercent > 0 && (
                    <span className="absolute left-3 top-3 bg-red-500 text-white text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-sm">
                        -{discountPercent}%
                    </span>
                )}
                
                {/* Wishlist */}
                <button
                    className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-white shadow-sm hover:shadow-md hover:scale-110 active:scale-95 transition-all duration-150"
                    onClick={(e) => { e.stopPropagation(); onWishlistToggle(product); }}
                >
                    {isWishlisted ? (
                        <HeartFilled className="text-red-500 text-sm" />
                    ) : (
                        <HeartOutlined className="text-gray-400 text-sm" />
                    )}
                </button>
            </div>

            {/* Content */}
            <div className="flex flex-col flex-grow p-4 pb-5">
                {product.brand && (
                    <span className="text-[11px] uppercase tracking-widest text-gray-400 font-semibold mb-1">
                        {product.brand}
                    </span>
                )}
                <p className="text-sm font-semibold text-gray-900 leading-snug line-clamp-2 mb-auto min-h-[40px] group-hover:text-[#ec4899] transition-colors duration-150 m-0">
                    {product.name}
                </p>
                <div className="flex items-baseline gap-2 mt-3">
                    <span className={`text-base font-bold ${discountPercent > 0 ? 'text-red-500' : 'text-gray-900'}`}>
                        {formattedPrice}
                    </span>
                    {formattedOriginal && (
                        <span className="text-xs text-gray-400 line-through">{formattedOriginal}</span>
                    )}
                </div>
            </div>
        </div>
    );
});

ProductCard.displayName = 'ProductCard';

export default ProductCard;
