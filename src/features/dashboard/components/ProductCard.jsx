import { useState } from 'react';
import { Card, Tag, Typography, Space, Select, Button } from 'antd';
import { HeartFilled, HeartOutlined, ShoppingCartOutlined, BgColorsOutlined, AppstoreOutlined } from '@ant-design/icons';
import { useCurrency } from '@/shared/contexts/CurrencyContext';

const { Text, Title } = Typography;

const ProductCard = ({ 
    product, 
    onPreview, 
    onWishlistToggle, 
    isInWishlist,
    onAddToCart 
}) => {
    const { formatCurrency, convertCurrency, userCurrency } = useCurrency();
    const [selectedSize, setSelectedSize] = useState(null);

    const getStockStatus = (quantity) => {
        if (quantity === 0) return { label: 'Out of Stock', color: '#ff4d4f' };
        if (quantity <= 5) return { label: 'Low Stock', color: '#faad14' };
        if (quantity <= 10) return { label: 'Limited', color: '#faad14' };
        return { label: 'In Stock', color: '#52c41a' };
    };

    const stock = getStockStatus(product.stock_quantity || 0);
    const wishlistActive = isInWishlist(product.id);

    // Parse JSON fields
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

    const variants = parseJSON(product.variants);
    const colors = parseJSON(product.colors);
    const sizes = parseJSON(product.sizes);

    const handleAddToCart = (e) => {
        e.stopPropagation();
        if (onAddToCart) {
            onAddToCart(product, { selectedSize });
        }
    };

    return (
        <Card
            hoverable
            className="group relative overflow-hidden transition-all duration-300 hover:shadow-lg"
            style={{ 
                borderRadius: 16, 
                height: '100%',
                border: '1px solid #e5e7eb',
                boxShadow: '0 1px 2px rgba(0,0,0,0.04)' 
            }}
            onClick={() => onPreview(product)}
        >
            {/* Image Container */}
            <div className="relative aspect-square overflow-hidden bg-gray-100" style={{ borderRadius: '12px 12px 0 0' }}>
                {(product.image_url || (product.images && product.images.length > 0)) ? (
                    <img
                        src={product.image_url || (() => {
                            const images = typeof product.images === 'string' ? JSON.parse(product.images) : product.images;
                            const firstImg = images[0];
                            // Use relative path directly - nginx serves /uploads/*
                            return firstImg?.startsWith('http') ? firstImg : firstImg;
                        })()}
                        alt={product.name}
                        className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
                    />
                ) : (
                    <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-gray-100 to-gray-50">
                        <ShoppingCartOutlined className="text-4xl text-gray-300" />
                    </div>
                )}
                
                {/* Stock Badge */}
                <div className="absolute left-3 top-3">
                    <Tag
                        color={stock.color}
                        style={{ 
                            borderRadius: 4, 
                            border: 0, 
                            padding: '2px 8px',
                            fontSize: 11,
                            fontWeight: 500
                        }}
                    >
                        {stock.label}
                    </Tag>
                </div>
                
                {/* Wishlist Button */}
                <button
                    className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-white shadow-sm transition-all hover:shadow-md active:scale-95"
                    onClick={(e) => {
                        e.stopPropagation();
                        onWishlistToggle(product);
                    }}
                >
                    {wishlistActive ? (
                        <HeartFilled className="text-red-500" />
                    ) : (
                        <HeartOutlined className="text-gray-400" />
                    )}
                </button>
            </div>

            {/* Content */}
            <div className="p-4">
                {/* Brand */}
                {product.brand && (
                    <Text className="text-[11px] uppercase tracking-wider text-gray-400 font-medium">
                        {product.brand}
                    </Text>
                )}
                
                {/* Name */}
                <Title 
                    level={5} 
                    className="mb-2 line-clamp-2 transition-colors group-hover:text-blue-600" 
                    style={{ 
                        margin: '4px 0 8px', 
                        fontSize: 15, 
                        fontWeight: 600, 
                        lineHeight: 1.4,
                        minHeight: 42
                    }}
                >
                    {product.name}
                </Title>
                
                {/* Price */}
                <div className="flex items-baseline gap-2">
                    <Text strong style={{ fontSize: 18, color: '#1890ff' }}>
                        {formatCurrency(
                            convertCurrency 
                                ? convertCurrency(product.price, product.currency || 'EUR', userCurrency) 
                                : product.price, 
                            userCurrency
                        )}
                    </Text>
                    {product.original_price && product.original_price > product.price && (
                        <Text delete type="secondary" style={{ fontSize: 13 }}>
                            {formatCurrency(
                                convertCurrency 
                                    ? convertCurrency(product.original_price, product.currency || 'EUR', userCurrency) 
                                    : product.original_price, 
                                userCurrency
                            )}
                        </Text>
                    )}
                </div>

                {/* Quick Info Tags */}
                {(colors?.length > 0 || sizes?.length > 0 || variants?.length > 0) && (
                    <Space size={4} wrap style={{ marginTop: 8 }}>
                        {colors?.length > 0 && (
                            <Tag 
                                icon={<BgColorsOutlined />} 
                                style={{ 
                                    fontSize: 11, 
                                    padding: '2px 6px',
                                    border: '1px solid #e8e8e8',
                                    background: '#fafafa'
                                }}
                            >
                                {colors.length} {colors.length === 1 ? 'Color' : 'Colors'}
                            </Tag>
                        )}
                        {sizes?.length > 0 && (
                            <Tag 
                                style={{ 
                                    fontSize: 11, 
                                    padding: '2px 6px',
                                    border: '1px solid #e8e8e8',
                                    background: '#fafafa'
                                }}
                            >
                                {sizes.length} {sizes.length === 1 ? 'Size' : 'Sizes'}
                            </Tag>
                        )}
                        {variants?.length > 0 && (
                            <Tag 
                                icon={<AppstoreOutlined />}
                                style={{ 
                                    fontSize: 11, 
                                    padding: '2px 6px',
                                    border: '1px solid #e8e8e8',
                                    background: '#fafafa'
                                }}
                            >
                                {variants.length} {variants.length === 1 ? 'Variant' : 'Variants'}
                            </Tag>
                        )}
                    </Space>
                )}

                {/* Size Selector and Add to Cart */}
                {sizes?.length > 0 && (
                    <div style={{ marginTop: 12 }} onClick={(e) => e.stopPropagation()}>
                        <Select
                            placeholder="Select size"
                            value={selectedSize}
                            onChange={setSelectedSize}
                            style={{ width: '100%', marginBottom: 8 }}
                            size="small"
                        >
                            {sizes.map((size, idx) => {
                                const sizeValue = typeof size === 'object' ? size.size : size;
                                const stock = typeof size === 'object' ? size.stock : product.stock_quantity;
                                return (
                                    <Select.Option 
                                        key={idx} 
                                        value={sizeValue}
                                        disabled={stock <= 0}
                                    >
                                        {sizeValue} {typeof size === 'object' && size.stock !== undefined ? `(${stock} available)` : ''}
                                    </Select.Option>
                                );
                            })}
                        </Select>
                        <Button 
                            type="primary" 
                            block 
                            size="small"
                            icon={<ShoppingCartOutlined />}
                            disabled={!selectedSize}
                            onClick={handleAddToCart}
                        >
                            Add to Cart
                        </Button>
                    </div>
                )}
            </div>
        </Card>
    );
};

export default ProductCard;
