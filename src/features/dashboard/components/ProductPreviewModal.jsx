import { useState, useEffect } from 'react';
import { Modal, Tag, Typography, Button, Divider, Space, Row, Col } from 'antd';
import { HeartFilled, HeartOutlined, ShoppingCartOutlined, LeftOutlined, RightOutlined, InfoCircleOutlined } from '@ant-design/icons';
import { useCurrency } from '@/shared/contexts/CurrencyContext';

const { Text, Title, Paragraph } = Typography;

const PRODUCT_CATEGORIES = [
    { value: 'kites', label: 'Kites', color: '#f50' },
    { value: 'boards', label: 'Boards', color: '#2db7f5' },
    { value: 'harnesses', label: 'Harnesses', color: '#87d068' },
    { value: 'wetsuits', label: 'Wetsuits', color: '#108ee9' },
    { value: 'bars', label: 'Bars & Lines', color: '#13c2c2' },
    { value: 'equipment', label: 'Equipment', color: '#faad14' },
    { value: 'accessories', label: 'Accessories', color: '#722ed1' },
    { value: 'apparel', label: 'Apparel', color: '#eb2f96' },
    { value: 'safety', label: 'Safety Gear', color: '#fa541c' },
    { value: 'spare-parts', label: 'Spare Parts', color: '#595959' },
    { value: 'other', label: 'Other', color: '#8c8c8c' }
];

const ProductPreviewModal = ({ 
    product, 
    isOpen,
    onClose, 
    onAddToCart, 
    onWishlistToggle, 
    isInWishlist 
}) => {
    const { formatCurrency, convertCurrency, userCurrency } = useCurrency();
    const [selectedImageIndex, setSelectedImageIndex] = useState(0);
    const [selectedSize, setSelectedSize] = useState(null);
    const [selectedColor, setSelectedColor] = useState(null);
    const [selectedVariant, setSelectedVariant] = useState(null);

    // Parse JSON fields helper
    const parseJSON = (field) => {
        if (!field) return null;
        if (typeof field === 'string') {
            try {
                return JSON.parse(field);
            } catch {
                return null;
            }
        }
        return field;
    };

    // Extract data (safe even if product is null)
    const variants = parseJSON(product?.variants);
    const colors = parseJSON(product?.colors);
    const sizes = parseJSON(product?.sizes);
    
    // Extract unique colors: first try variants[].color, then fall back to colors[] array
    // Note: colors from scraper may be objects {code, name, imageCount} - extract name
    const colorsFromVariants = variants?.length > 0 
        ? [...new Set(variants.map(v => v.color).filter(Boolean))]
        : [];
    
    const colorsFromArray = Array.isArray(colors) && colors.length > 0 
        ? colors.map(c => typeof c === 'object' && c.name ? c.name : c).filter(Boolean)
        : [];
    
    // Use variant colors if available, otherwise use colors array
    const uniqueColors = colorsFromVariants.length > 0 ? colorsFromVariants : colorsFromArray;

    // Extract unique sizes from variants or sizes array
    const uniqueSizes = variants?.length > 0 
        ? [...new Set(variants.map(v => v.size || v.label).filter(Boolean))]
        : sizes?.map(s => s.size || s) || [];

    // Reset selected image and variant when product changes (ALWAYS CALL)
    useEffect(() => {
        setSelectedImageIndex(0);
        setSelectedSize(null);
        setSelectedColor(null);
        setSelectedVariant(null);
    }, [product?.id]);

    // Reset image index when color changes (to show first image of new color)
    useEffect(() => {
        setSelectedImageIndex(0);
    }, [selectedColor]);

    // Auto-select first color/size on mount if variants exist (ALWAYS CALL)
    useEffect(() => {
        if (!selectedColor && uniqueColors.length > 0) {
            setSelectedColor(uniqueColors[0]);
        }
        if (variants?.length > 0 && !selectedSize && uniqueSizes.length > 0) {
            setSelectedSize(uniqueSizes[0]);
        }
    }, [variants, uniqueColors.length, uniqueSizes.length, selectedColor, selectedSize]);

    // Find matching variant based on selected color and size (ALWAYS CALL)
    useEffect(() => {
        if (variants?.length > 0) {
            const match = variants.find(v => {
                const colorMatch = !selectedColor || v.color === selectedColor;
                const sizeMatch = !selectedSize || v.size === selectedSize || v.label === selectedSize;
                return colorMatch && sizeMatch;
            });
            setSelectedVariant(match || null);
        } else {
            setSelectedVariant(null);
        }
    }, [selectedColor, selectedSize, variants]);

    // Early return AFTER all hooks
    if (!product) return null;

    const getStockStatus = (quantity) => {
        if (quantity === 0) return { label: 'Out of Stock', color: '#ff4d4f' };
        if (quantity <= 5) return { label: 'Low Stock', color: '#faad14' };
        if (quantity <= 10) return { label: 'Limited', color: '#faad14' };
        return { label: 'In Stock', color: '#52c41a' };
    };

    // Parse images properly
    const getImages = () => {
        if (!product.images) return [];
        if (typeof product.images === 'string') {
            try {
                return JSON.parse(product.images);
            } catch {
                return [];
            }
        }
        return Array.isArray(product.images) ? product.images : [];
    };

    // Get color code for selected color name (for image filtering)
    const getColorCode = (colorName) => {
        if (!colorName || !Array.isArray(colors)) return null;
        const colorObj = colors.find(c => 
            (typeof c === 'object' && c.name === colorName) || c === colorName
        );
        return colorObj?.code || null;
    };

    // Get image range for a specific color based on imageCount
    const getColorImageRange = (colorName) => {
        if (!colorName || !Array.isArray(colors)) return null;
        
        let startIndex = 0;
        for (const colorObj of colors) {
            if (typeof colorObj === 'object' && colorObj.name === colorName) {
                return { start: startIndex, count: colorObj.imageCount || 0 };
            }
            startIndex += colorObj.imageCount || 0;
        }
        return null;
    };

    // Build all images array (main + gallery), filtered by selected color if applicable
    const galleryImages = getImages();
    const selectedColorCode = getColorCode(selectedColor);
    const selectedColorRange = getColorImageRange(selectedColor);
    
    // Filter images by color using imageCount ranges
    // The images are uploaded in order: first color's images, then second color's, etc.
    let displayImages = galleryImages;
    if (selectedColorRange && galleryImages.length > 0) {
        const { start, count } = selectedColorRange;
        if (count > 0) {
            displayImages = galleryImages.slice(start, start + count);
        }
    }
    
    const allImages = product.image_url && !displayImages.includes(product.image_url)
        ? [product.image_url, ...displayImages]
        : displayImages.length > 0 ? displayImages : (product.image_url ? [product.image_url] : []);
    
    const hasMultipleImages = allImages.length > 1;
    const currentImage = allImages[selectedImageIndex] || allImages[0] || null;

    const handlePrevImage = (e) => {
        e.stopPropagation();
        setSelectedImageIndex(prev => (prev === 0 ? allImages.length - 1 : prev - 1));
    };

    const handleNextImage = (e) => {
        e.stopPropagation();
        setSelectedImageIndex(prev => (prev === allImages.length - 1 ? 0 : prev + 1));
    };

    const stock = getStockStatus(product.stock_quantity || 0);
    const categoryLabel = PRODUCT_CATEGORIES.find((category) => category.value === product.category)?.label || 'Featured';

    const dimensions = parseJSON(product.dimensions);

    // Calculate display price based on selected size/variant
    const getDisplayPrice = () => {
        // First, try to find variant by selectedSize matching label
        if (selectedSize && variants?.length > 0) {
            const matchingVariant = variants.find(v => 
                v.label === selectedSize || v.size === selectedSize
            );
            if (matchingVariant?.price !== undefined && matchingVariant?.price !== null) {
                return matchingVariant.price;
            }
        }
        // If selectedVariant exists and has price, use it
        if (selectedVariant?.price !== undefined && selectedVariant?.price !== null) {
            return selectedVariant.price;
        }
        // Otherwise, use base product price
        return product.price;
    };

    const displayPrice = getDisplayPrice();

    return (
        <Modal
            open={isOpen}
            onCancel={onClose}
            title={null}
            width={Math.min(600, window.innerWidth - 32)}
            centered
            footer={null}
            styles={{ 
                content: { borderRadius: 20, overflow: 'hidden', padding: 0 },
                body: { padding: 0 }
            }}
            className="shop-preview-modal"
        >
            <div style={{ maxHeight: '85vh', overflow: 'auto' }}>
                {/* Hero Image with Navigation */}
                <div className="relative overflow-hidden" style={{ background: '#f8f9fa', minHeight: 280 }}>
                    {currentImage ? (
                        <img
                            src={currentImage}
                            alt={product.name}
                            className="w-full object-contain"
                            style={{ display: 'block', maxHeight: 400 }}
                        />
                    ) : (
                        <div className="flex w-full h-full items-center justify-center">
                            <ShoppingCartOutlined style={{ fontSize: 64, color: '#d9d9d9' }} />
                        </div>
                    )}
                    
                    {/* Navigation Arrows */}
                    {hasMultipleImages && (
                        <>
                            <button
                                onClick={handlePrevImage}
                                className="absolute left-3 top-1/2 -translate-y-1/2 flex items-center justify-center transition-all hover:scale-110"
                                style={{
                                    width: 40,
                                    height: 40,
                                    borderRadius: '50%',
                                    background: 'rgba(255,255,255,0.95)',
                                    border: 'none',
                                    cursor: 'pointer',
                                    boxShadow: '0 2px 12px rgba(0,0,0,0.15)',
                                    backdropFilter: 'blur(8px)'
                                }}
                            >
                                <LeftOutlined style={{ fontSize: 14, color: '#333' }} />
                            </button>
                            <button
                                onClick={handleNextImage}
                                className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center justify-center transition-all hover:scale-110"
                                style={{
                                    width: 40,
                                    height: 40,
                                    borderRadius: '50%',
                                    background: 'rgba(255,255,255,0.95)',
                                    border: 'none',
                                    cursor: 'pointer',
                                    boxShadow: '0 2px 12px rgba(0,0,0,0.15)',
                                    backdropFilter: 'blur(8px)'
                                }}
                            >
                                <RightOutlined style={{ fontSize: 14, color: '#333' }} />
                            </button>
                        </>
                    )}

                    {/* Image Counter */}
                    {hasMultipleImages && (
                        <div 
                            className="absolute bottom-3 right-3"
                            style={{
                                background: 'rgba(0,0,0,0.6)',
                                color: '#fff',
                                padding: '4px 12px',
                                borderRadius: 20,
                                fontSize: 13,
                                fontWeight: 500,
                                backdropFilter: 'blur(8px)'
                            }}
                        >
                            {selectedImageIndex + 1} / {allImages.length}
                        </div>
                    )}
                    
                    {/* Status Badge */}
                    <div className="absolute left-4 top-4">
                        <Tag 
                            color={stock.color} 
                            style={{ 
                                borderRadius: 8, 
                                border: 0, 
                                padding: '6px 14px', 
                                fontSize: 13, 
                                fontWeight: 600,
                                boxShadow: '0 2px 8px rgba(0,0,0,0.15)'
                            }}
                        >
                            {stock.label}
                        </Tag>
                    </div>
                </div>

                {/* Thumbnail Gallery - Horizontally scrollable on mobile */}
                {hasMultipleImages && (
                    <div 
                        className="flex gap-2 px-4 py-3 overflow-x-auto justify-start sm:justify-center" 
                        style={{ 
                            background: 'linear-gradient(to bottom, #f8f9fa, #fff)',
                            borderBottom: '1px solid #f0f0f0',
                            scrollbarWidth: 'none',
                            msOverflowStyle: 'none',
                            WebkitOverflowScrolling: 'touch'
                        }}
                    >
                        {allImages.map((img, index) => {
                            const isSelected = index === selectedImageIndex;
                            return (
                                <button
                                    key={img + index}
                                    onClick={() => setSelectedImageIndex(index)}
                                    style={{ 
                                        padding: 0,
                                        border: 'none',
                                        background: 'none',
                                        cursor: 'pointer',
                                        outline: 'none',
                                        flexShrink: 0
                                    }}
                                >
                                    <div
                                        style={{
                                            width: 56,
                                            height: 56,
                                            borderRadius: 10,
                                            overflow: 'hidden',
                                            border: isSelected ? '2px solid #000' : '2px solid transparent',
                                            boxShadow: isSelected 
                                                ? '0 4px 12px rgba(0,0,0,0.2)' 
                                                : '0 1px 4px rgba(0,0,0,0.08)',
                                            transition: 'border 0.2s ease, box-shadow 0.2s ease'
                                        }}
                                    >
                                        <img
                                            src={img}
                                            alt={`${product.name} ${index + 1}`}
                                            loading="eager"
                                            style={{ 
                                                width: '100%', 
                                                height: '100%', 
                                                objectFit: 'cover',
                                                opacity: isSelected ? 1 : 0.7,
                                                transition: 'opacity 0.2s ease'
                                            }}
                                        />
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                )}

                {/* Product Info */}
                <div className="px-6 py-5">
                    {/* Brand & Category */}
                    <div className="flex items-center justify-between mb-3">
                        {product.brand && (
                            <Text 
                                strong 
                                style={{ 
                                    fontSize: 12, 
                                    textTransform: 'uppercase', 
                                    letterSpacing: 1.5, 
                                    color: '#595959',
                                    fontWeight: 700
                                }}
                            >
                                {product.brand}
                            </Text>
                        )}
                        <Tag 
                            style={{ 
                                borderRadius: 6, 
                                border: '1px solid #e8e8e8', 
                                padding: '2px 10px', 
                                fontSize: 11,
                                background: '#fafafa',
                                color: '#595959',
                                fontWeight: 500
                            }}
                        >
                            {categoryLabel}
                        </Tag>
                    </div>

                    {/* Product Name */}
                    <Title level={3} style={{ margin: '0 0 12px', fontSize: 24, lineHeight: 1.3, fontWeight: 700, color: '#000' }}>
                        {product.name}
                    </Title>

                    {/* Description */}
                    {product.description && (
                        <Paragraph 
                            style={{ 
                                marginBottom: 20, 
                                fontSize: 15, 
                                lineHeight: 1.6,
                                color: '#595959'
                            }}
                        >
                            {product.description}
                        </Paragraph>
                    )}
                    <Divider style={{ margin: '20px 0' }} />

                    {/* Color Picker - Minimalist Duotone Style with dual-color support */}
                    {uniqueColors.length > 0 && (
                        <div style={{ marginBottom: 20 }}>
                            <Text style={{ fontSize: 12, color: '#8c8c8c', textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 500 }}>
                                Color: <span style={{ color: '#262626', textTransform: 'capitalize' }}>{selectedColor || 'Select'}</span>
                            </Text>
                            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                                {uniqueColors.map((color) => {
                                    const isSelected = selectedColor === color;
                                    const colorMap = {
                                        'black': '#1a1a1a', 'white': '#fafafa', 'red': '#e53935', 'blue': '#1e88e5',
                                        'green': '#43a047', 'yellow': '#fdd835', 'orange': '#fb8c00', 'purple': '#8e24aa',
                                        'pink': '#d81b60', 'gray': '#757575', 'grey': '#757575', 'navy': '#1a237e',
                                        'mint': '#26a69a', 'coral': '#ff7043', 'lime': '#c0ca33', 'turquoise': '#00acc1',
                                        'slate': '#546e7a', 'silver': '#9e9e9e', 'gold': '#ffb300', 'brown': '#6d4c41',
                                        'beige': '#d7ccc8', 'tan': '#bcaaa4', 'olive': '#827717', 'teal': '#00897b',
                                        'heron': '#607d8b', 'dark': '#424242', 'petrol': '#006064', 'sand': '#c2b280'
                                    };
                                    
                                    // Helper to get color hex from name
                                    const getColorHex = (name) => {
                                        const lower = name.toLowerCase().trim();
                                        if (colorMap[lower]) return colorMap[lower];
                                        for (const [key, value] of Object.entries(colorMap)) {
                                            if (lower.includes(key)) return value;
                                        }
                                        return '#9e9e9e';
                                    };
                                    
                                    // Check if this is a dual color (contains / or -)
                                    const colorLower = color.toLowerCase();
                                    const isDualColor = color.includes('/') || (color.includes('-') && !color.startsWith('dark'));
                                    const separator = color.includes('/') ? '/' : '-';
                                    const colorParts = isDualColor ? color.split(separator).map(c => c.trim()) : [color];
                                    
                                    let bgStyle;
                                    if (isDualColor && colorParts.length >= 2) {
                                        const color1 = getColorHex(colorParts[0]);
                                        const color2 = getColorHex(colorParts[1]);
                                        // Diagonal split gradient
                                        bgStyle = `linear-gradient(135deg, ${color1} 50%, ${color2} 50%)`;
                                    } else {
                                        bgStyle = getColorHex(color);
                                    }
                                    
                                    const isLight = ['white', 'beige', 'cream', 'yellow', 'lime', 'silver', 'ivory', 'sand'].some(c => colorLower.includes(c));
                                    
                                    return (
                                        <button
                                            key={color}
                                            onClick={() => setSelectedColor(color)}
                                            title={color}
                                            style={{
                                                width: 28,
                                                height: 28,
                                                borderRadius: 4,
                                                background: bgStyle,
                                                border: isSelected ? '2px solid #000' : isLight ? '1px solid #e0e0e0' : '1px solid transparent',
                                                cursor: 'pointer',
                                                padding: 0,
                                                position: 'relative',
                                                outline: 'none',
                                                overflow: 'hidden'
                                            }}
                                        >
                                            {isSelected && (
                                                <div style={{
                                                    position: 'absolute',
                                                    inset: -4,
                                                    border: '1px solid #000',
                                                    borderRadius: 6,
                                                    pointerEvents: 'none'
                                                }} />
                                            )}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* Size Picker - Minimalist Duotone Style */}
                    {uniqueSizes.length > 0 && (
                        <div style={{ marginBottom: 20 }}>
                            <Text style={{ fontSize: 12, color: '#8c8c8c', textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 500 }}>
                                Size: <span style={{ color: '#262626' }}>{selectedSize || 'Select'}</span>
                            </Text>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
                                {uniqueSizes.map((size) => {
                                    const isSelected = selectedSize === size;
                                    const variantForSize = variants?.find(v => 
                                        (v.size === size || v.label === size) && 
                                        (!selectedColor || v.color === selectedColor)
                                    );
                                    const hasStock = !variantForSize || (variantForSize.stock === undefined || variantForSize.stock > 0);
                                    const variantPrice = variantForSize?.price;
                                    
                                    return (
                                        <button
                                            key={size}
                                            onClick={() => hasStock && setSelectedSize(size)}
                                            disabled={!hasStock}
                                            title={!hasStock ? 'Out of stock' : variantPrice ? `€${variantPrice}` : ''}
                                            style={{
                                                minWidth: 44,
                                                height: 36,
                                                padding: '0 12px',
                                                border: isSelected ? '2px solid #000' : '1px solid #e0e0e0',
                                                borderRadius: 4,
                                                background: isSelected ? '#000' : '#fff',
                                                color: isSelected ? '#fff' : hasStock ? '#262626' : '#bfbfbf',
                                                fontSize: 13,
                                                fontWeight: 500,
                                                cursor: hasStock ? 'pointer' : 'not-allowed',
                                                transition: 'all 0.15s ease',
                                                opacity: hasStock ? 1 : 0.5,
                                                textDecoration: !hasStock ? 'line-through' : 'none',
                                                outline: 'none'
                                            }}
                                        >
                                            {size}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* Price - with dynamic pricing */}
                    <div style={{ marginBottom: 24 }}>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
                            <Title level={2} style={{ margin: 0, fontSize: 32, fontWeight: 700, color: '#000' }}>
                                {formatCurrency(
                                    convertCurrency 
                                        ? convertCurrency(displayPrice, product.currency || 'EUR', userCurrency) 
                                        : displayPrice, 
                                    userCurrency
                                )}
                            </Title>
                            {product.original_price && product.original_price > displayPrice && (
                                <Text delete type="secondary" style={{ fontSize: 18 }}>
                                    {formatCurrency(
                                        convertCurrency 
                                            ? convertCurrency(product.original_price, product.currency || 'EUR', userCurrency) 
                                            : product.original_price, 
                                        userCurrency
                                    )}
                                </Text>
                            )}
                        </div>
                        {product.original_price && product.original_price > displayPrice && (
                            <Text type="success" style={{ fontSize: 13, fontWeight: 600 }}>
                                Save {Math.round(((product.original_price - displayPrice) / product.original_price) * 100)}%
                            </Text>
                        )}
                        {/* Show variant-specific info */}
                        {selectedVariant && (
                            <div style={{ marginTop: 8 }}>
                                <Text type="secondary" style={{ fontSize: 12 }}>
                                    {selectedVariant.label && <span>Variant: {selectedVariant.label} • </span>}
                                    {selectedVariant.sku && <span>SKU: {selectedVariant.sku}</span>}
                                </Text>
                            </div>
                        )}
                    </div>

                    {/* Product Details - Single View (No Tabs) */}
                    {(product.gender || product.weight || dimensions) && (
                        <div style={{ 
                            marginBottom: 24, 
                            padding: 16, 
                            background: '#fafafa', 
                            borderRadius: 12,
                            border: '1px solid #f0f0f0'
                        }}>
                            <div style={{ marginBottom: 12 }}>
                                <Text strong style={{ fontSize: 14, color: '#262626' }}>
                                    <InfoCircleOutlined style={{ marginRight: 6 }} />
                                    Product Details
                                </Text>
                            </div>
                            <Row gutter={[16, 12]}>
                                {product.gender && (
                                    <Col span={12}>
                                        <Text type="secondary" style={{ fontSize: 12 }}>Gender</Text>
                                        <div style={{ fontWeight: 600, textTransform: 'capitalize' }}>{product.gender}</div>
                                    </Col>
                                )}
                                {product.weight && (
                                    <Col span={12}>
                                        <Text type="secondary" style={{ fontSize: 12 }}>Weight</Text>
                                        <div style={{ fontWeight: 600 }}>{product.weight} kg</div>
                                    </Col>
                                )}
                                {dimensions?.length && (
                                    <Col span={12}>
                                        <Text type="secondary" style={{ fontSize: 12 }}>Length</Text>
                                        <div style={{ fontWeight: 600 }}>{dimensions.length} cm</div>
                                    </Col>
                                )}
                                {dimensions?.width && (
                                    <Col span={12}>
                                        <Text type="secondary" style={{ fontSize: 12 }}>Width</Text>
                                        <div style={{ fontWeight: 600 }}>{dimensions.width} cm</div>
                                    </Col>
                                )}
                                {dimensions?.height && (
                                    <Col span={12}>
                                        <Text type="secondary" style={{ fontSize: 12 }}>Height</Text>
                                        <div style={{ fontWeight: 600 }}>{dimensions.height} cm</div>
                                    </Col>
                                )}
                            </Row>
                        </div>
                    )}

                    {/* Description */}
                    {product.description && (
                        <div style={{ marginBottom: 24 }}>
                            <Divider style={{ margin: '16px 0' }} />
                            <Text 
                                type="secondary" 
                                style={{ 
                                    fontSize: 14, 
                                    lineHeight: 1.6,
                                    display: 'block'
                                }}
                            >
                                {product.description}
                            </Text>
                        </div>
                    )}

                    {/* Action Buttons */}
                    <div style={{ display: 'flex', gap: 12 }}>
                        <Button
                            size="large"
                            icon={isInWishlist(product.id) ? <HeartFilled /> : <HeartOutlined />}
                            onClick={() => onWishlistToggle(product)}
                            style={{ 
                                borderRadius: 12, 
                                height: 52,
                                width: 52,
                                padding: 0,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                border: '2px solid #f0f0f0',
                                color: isInWishlist(product.id) ? '#ff4d4f' : '#8c8c8c'
                            }}
                        />
                        <Button
                            type="primary"
                            size="large"
                            icon={<ShoppingCartOutlined style={{ fontSize: 20 }} />}
                            onClick={() => {
                                // Include variant information when adding to cart
                                const productWithVariant = {
                                    ...product,
                                    price: displayPrice // Use the dynamic price
                                };
                                onAddToCart(productWithVariant, {
                                    selectedSize,
                                    selectedColor,
                                    selectedVariant
                                });
                                onClose();
                            }}
                            disabled={
                                // Disable if product has variants but none selected
                                (uniqueSizes.length > 0 && !selectedSize) ||
                                (uniqueColors.length > 0 && !selectedColor)
                            }
                            style={{ 
                                flex: 1, 
                                borderRadius: 12, 
                                height: 52,
                                fontWeight: 700,
                                fontSize: 16,
                                background: '#000',
                                border: 'none',
                                boxShadow: '0 4px 12px rgba(0,0,0,0.15)'
                            }}
                        >
                            Add to Cart
                        </Button>
                    </div>
                </div>
            </div>
        </Modal>
    );
};

export default ProductPreviewModal;
