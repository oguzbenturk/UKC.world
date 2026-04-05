import { useState, useEffect } from 'react';

const parseJSON = (field) => {
    if (!field) return null;
    if (typeof field === 'string') {
        try { return JSON.parse(field); } catch { return null; }
    }
    return field;
};

const COLOR_MAP = {
    'black': '#1a1a1a', 'white': '#fafafa', 'red': '#e53935', 'blue': '#1e88e5',
    'green': '#43a047', 'yellow': '#fdd835', 'orange': '#fb8c00', 'purple': '#8e24aa',
    'pink': '#d81b60', 'gray': '#757575', 'grey': '#757575', 'navy': '#1a237e',
    'mint': '#26a69a', 'coral': '#ff7043', 'lime': '#c0ca33', 'turquoise': '#00acc1',
    'slate': '#546e7a', 'silver': '#9e9e9e', 'gold': '#ffb300', 'brown': '#6d4c41',
    'beige': '#d7ccc8', 'tan': '#bcaaa4', 'olive': '#827717', 'teal': '#00897b',
    'heron': '#607d8b', 'dark': '#424242', 'petrol': '#006064', 'sand': '#c2b280'
};

const getColorHex = (name) => {
    const lower = name.toLowerCase().trim();
    if (COLOR_MAP[lower]) return COLOR_MAP[lower];
    for (const [key, value] of Object.entries(COLOR_MAP)) {
        if (lower.includes(key)) return value;
    }
    return '#9e9e9e';
};

const LIGHT_COLORS = ['white', 'beige', 'cream', 'yellow', 'lime', 'silver', 'ivory', 'sand'];

const ProductVariantSelector = ({ product, onChange }) => {
    const [selectedColor, setSelectedColor] = useState(null);
    const [selectedSize, setSelectedSize] = useState(null);
    const [selectedVariant, setSelectedVariant] = useState(null);

    const variants = parseJSON(product?.variants);
    const colors = parseJSON(product?.colors);
    const sizes = parseJSON(product?.sizes);

    const colorsFromVariants = variants?.length > 0
        ? [...new Set(variants.map(v => v.color).filter(Boolean))]
        : [];
    const colorsFromArray = Array.isArray(colors) && colors.length > 0
        ? colors.map(c => typeof c === 'object' && c.name ? c.name : c).filter(Boolean)
        : [];
    const uniqueColors = colorsFromVariants.length > 0 ? colorsFromVariants : colorsFromArray;

    const uniqueSizes = variants?.length > 0
        ? [...new Set(variants.map(v => v.size || v.label).filter(Boolean))]
        : sizes?.map(s => s.size || s) || [];

    // Reset when product changes
    useEffect(() => {
        setSelectedColor(null);
        setSelectedSize(null);
        setSelectedVariant(null);
    }, [product?.id]);

    // Auto-select first color/size
    useEffect(() => {
        if (!selectedColor && uniqueColors.length > 0) setSelectedColor(uniqueColors[0]);
        if (variants?.length > 0 && !selectedSize && uniqueSizes.length > 0) setSelectedSize(uniqueSizes[0]);
    }, [variants, uniqueColors.length, uniqueSizes.length, selectedColor, selectedSize]);

    // Find matching variant
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

    // Calculate display price
    const getDisplayPrice = () => {
        if (selectedSize && variants?.length > 0) {
            const matchingVariant = variants.find(v => v.label === selectedSize || v.size === selectedSize);
            if (matchingVariant?.price !== undefined && matchingVariant?.price !== null) return matchingVariant.price;
        }
        if (selectedVariant?.price !== undefined && selectedVariant?.price !== null) return selectedVariant.price;
        return product?.price;
    };

    const displayPrice = getDisplayPrice();

    // Notify parent of changes
    useEffect(() => {
        onChange?.({ selectedColor, selectedSize, selectedVariant, displayPrice });
    }, [selectedColor, selectedSize, selectedVariant, displayPrice]);

    if (!product) return null;

    const hasVariants = uniqueSizes.length > 0 || uniqueColors.length > 0;
    if (!hasVariants) return null;

    return (
        <div>
            {/* Color Picker */}
            {uniqueColors.length > 0 && (
                <div style={{ marginBottom: 20 }}>
                    <span className="text-xs text-gray-400 uppercase tracking-wider font-medium">
                        Color: <span className="text-gray-800 capitalize">{selectedColor || 'Select'}</span>
                    </span>
                    <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                        {uniqueColors.map((color) => {
                            const isSelected = selectedColor === color;
                            const colorLower = color.toLowerCase();
                            const isDualColor = color.includes('/') || (color.includes('-') && !color.startsWith('dark'));
                            const separator = color.includes('/') ? '/' : '-';
                            const colorParts = isDualColor ? color.split(separator).map(c => c.trim()) : [color];

                            let bgStyle;
                            if (isDualColor && colorParts.length >= 2) {
                                bgStyle = `linear-gradient(135deg, ${getColorHex(colorParts[0])} 50%, ${getColorHex(colorParts[1])} 50%)`;
                            } else {
                                bgStyle = getColorHex(color);
                            }

                            const isLight = LIGHT_COLORS.some(c => colorLower.includes(c));

                            return (
                                <button
                                    key={color}
                                    onClick={() => setSelectedColor(color)}
                                    title={color}
                                    style={{
                                        width: 28, height: 28, borderRadius: 4,
                                        background: bgStyle,
                                        border: isSelected ? '2px solid #000' : isLight ? '1px solid #e0e0e0' : '1px solid transparent',
                                        cursor: 'pointer', padding: 0, position: 'relative', outline: 'none', overflow: 'hidden'
                                    }}
                                >
                                    {isSelected && (
                                        <div style={{
                                            position: 'absolute', inset: -4,
                                            border: '1px solid #000', borderRadius: 6, pointerEvents: 'none'
                                        }} />
                                    )}
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Size Picker */}
            {uniqueSizes.length > 0 && (
                <div style={{ marginBottom: 20 }}>
                    <span className="text-xs text-gray-400 uppercase tracking-wider font-medium">
                        Size: <span className="text-gray-800">{selectedSize || 'Select'}</span>
                    </span>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
                        {uniqueSizes.map((size) => {
                            const isSelected = selectedSize === size;
                            const variantForSize = variants?.find(v =>
                                (v.size === size || v.label === size) &&
                                (!selectedColor || v.color === selectedColor)
                            );
                            const hasStock = !variantForSize || (variantForSize.stock === undefined || variantForSize.stock > 0);

                            return (
                                <button
                                    key={size}
                                    onClick={() => hasStock && setSelectedSize(size)}
                                    disabled={!hasStock}
                                    title={!hasStock ? 'Out of stock' : ''}
                                    style={{
                                        minWidth: 44, height: 36, padding: '0 12px',
                                        border: isSelected ? '2px solid #000' : '1px solid #e0e0e0',
                                        borderRadius: 4,
                                        background: isSelected ? '#000' : '#fff',
                                        color: isSelected ? '#fff' : hasStock ? '#262626' : '#bfbfbf',
                                        fontSize: 13, fontWeight: 500,
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

            {/* Variant Info */}
            {selectedVariant && (selectedVariant.label || selectedVariant.sku) && (
                <div className="text-xs text-gray-400 mt-1">
                    {selectedVariant.label && <span>Variant: {selectedVariant.label}</span>}
                    {selectedVariant.label && selectedVariant.sku && <span> &bull; </span>}
                    {selectedVariant.sku && <span>SKU: {selectedVariant.sku}</span>}
                </div>
            )}
        </div>
    );
};

export default ProductVariantSelector;
