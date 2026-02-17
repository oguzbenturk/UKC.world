import { useState } from 'react';
import { Card, Tag, Typography, Select, Button } from 'antd';
import { HeartFilled, HeartOutlined, ShoppingCartOutlined } from '@ant-design/icons';
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

    // Calculate discount percentage
    const discountPercent = product.original_price && product.original_price > product.price
        ? Math.round(((product.original_price - product.price) / product.original_price) * 100)
        : 0;

    return (
        <Card
            hoverable
            className="group relative overflow-hidden transition-all duration-300 hover:shadow-lg"
            style={{ 
                borderRadius: 8, 
                height: '100%',
                border: '1px solid #f0f0f0',
                boxShadow: '0 1px 4px rgba(0,0,0,0.06)' 
            }}
            bodyStyle={{ padding: 0 }}
            onClick={() => onPreview(product)}
        >
            {/* Image Container - Square aspect ratio */}
            <div className="relative overflow-hidden bg-gray-50" style={{ paddingTop: '100%', borderRadius: '8px 8px 0 0' }}>
                <div className="absolute inset-0">
                    {(product.image_url || (product.images && product.images.length > 0)) ? (
                        <img
                            src={product.image_url || (() => {
                                const images = typeof product.images === 'string' ? JSON.parse(product.images) : product.images;
                                const firstImg = images[0];
                                return firstImg?.startsWith('http') ? firstImg : firstImg;
                            })()}
                            alt={product.name}
                            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                        />
                    ) : (
                        <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-gray-100 to-gray-50">
                            <ShoppingCartOutlined className="text-5xl text-gray-300" />
                        </div>
                    )}
                </div>
                
                {/* Stock Badge - Compact */}
                {stock.label === 'Limited' && (
                    <div className="absolute left-2 top-2">
                        <div
                            style={{ 
                                background: '#FF8A00',
                                color: 'white',
                                borderRadius: 4,
                                padding: '2px 6px',
                                fontSize: 10,
                                fontWeight: 600,
                                boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
                            }}
                        >
                            {stock.label}
                        </div>
                    </div>
                )}
                
                {/* Discount Badge - Compact */}
                {discountPercent > 0 && (
                    <div className="absolute left-2 top-2">
                        <div
                            style={{ 
                                background: '#E63946',
                                color: 'white',
                                borderRadius: 4,
                                padding: '2px 6px',
                                fontSize: 10,
                                fontWeight: 600,
                                boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
                            }}
                        >
                            %{discountPercent}
                        </div>
                    </div>
                )}
                
                {/* New Badge - Compact */}
                {product.is_new && (
                    <div className="absolute left-2" style={{ top: discountPercent > 0 || stock.label === 'Limited' ? 28 : 8 }}>
                        <div
                            style={{ 
                                background: '#1E88E5',
                                color: 'white',
                                borderRadius: 4,
                                padding: '2px 6px',
                                fontSize: 9,
                                fontWeight: 600,
                                boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
                            }}
                        >
                            Yeni
                        </div>
                    </div>
                )}
                
                {/* Wishlist Button - Compact */}
                <button
                    className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-white/90 backdrop-blur-sm shadow-sm transition-all hover:bg-white hover:shadow-md active:scale-95"
                    onClick={(e) => {
                        e.stopPropagation();
                        onWishlistToggle(product);
                    }}
                >
                    {wishlistActive ? (
                        <HeartFilled className="text-red-500 text-base" />
                    ) : (
                        <HeartOutlined className="text-gray-500 text-base" />
                    )}
                </button>
            </div>

            {/* Content - Very Compact */}
            <div style={{ padding: '8px' }}>
                {/* Brand - Very Compact */}
                {product.brand && (
                    <Text 
                        className="block mb-0.5"
                        style={{ 
                            fontSize: 9,
                            textTransform: 'uppercase',
                            letterSpacing: '0.2px',
                            color: '#999',
                            fontWeight: 500
                        }}
                    >
                        {product.brand}
                    </Text>
                )}
                
                {/* Name - Very Compact */}
                <Title 
                    level={5} 
                    className="line-clamp-2 transition-colors group-hover:text-blue-600" 
                    style={{ 
                        margin: 0,
                        marginBottom: 4,
                        fontSize: 12, 
                        fontWeight: 500, 
                        lineHeight: 1.3,
                        minHeight: 31,
                        color: '#333'
                    }}
                >
                    {product.name}
                </Title>
                
                {/* Price - Very Compact */}
                <div className="flex flex-col" style={{ gap: 2 }}>
                    <Text 
                        strong 
                        style={{ 
                            fontSize: 15, 
                            color: discountPercent > 0 ? '#E63946' : '#333',
                            fontWeight: 600
                        }}
                    >
                        {formatCurrency(
                            convertCurrency 
                                ? convertCurrency(product.price, product.currency || 'EUR', userCurrency) 
                                : product.price, 
                            userCurrency
                        )}
                    </Text>
                    {product.original_price && product.original_price > product.price && (
                        <Text 
                            delete 
                            style={{ 
                                fontSize: 11,
                                color: '#999'
                            }}
                        >
                            {formatCurrency(
                                convertCurrency 
                                    ? convertCurrency(product.original_price, product.currency || 'EUR', userCurrency) 
                                    : product.original_price, 
                                userCurrency
                            )}
                        </Text>
                    )}
                </div>

                {/* Size Selector and Add to Cart */}
                {sizes?.length > 0 && (
                    <div style={{ marginTop: 6 }} onClick={(e) => e.stopPropagation()}>
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
