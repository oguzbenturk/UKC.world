import { useState, useEffect } from 'react';
import { LeftOutlined, RightOutlined, ShoppingCartOutlined } from '@ant-design/icons';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || '';
const resolveImageUrl = (url) => {
    if (!url) return null;
    if (url.startsWith('http')) return url;
    return `${BACKEND_URL}${url.startsWith('/') ? '' : '/'}${url}`;
};

const parseJSON = (field) => {
    if (!field) return null;
    if (typeof field === 'string') {
        try { return JSON.parse(field); } catch { return null; }
    }
    return field;
};

const ProductImageGallery = ({ product, selectedColor }) => {
    const [selectedImageIndex, setSelectedImageIndex] = useState(0);

    // Reset image index when product or color changes
    useEffect(() => { setSelectedImageIndex(0); }, [product?.id, selectedColor]);

    if (!product) return null;

    const colors = parseJSON(product.colors);

    const getImages = () => {
        if (!product.images) return [];
        if (typeof product.images === 'string') {
            try { return JSON.parse(product.images); } catch { return []; }
        }
        return Array.isArray(product.images) ? product.images : [];
    };

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

    const galleryImages = getImages();
    const selectedColorRange = getColorImageRange(selectedColor);

    let displayImages = galleryImages;
    if (selectedColorRange && galleryImages.length > 0) {
        const { start, count } = selectedColorRange;
        if (count > 0) {
            displayImages = galleryImages.slice(start, start + count);
        }
    }

    const allImagesRaw = product.image_url && !displayImages.includes(product.image_url)
        ? [product.image_url, ...displayImages]
        : displayImages.length > 0 ? displayImages : (product.image_url ? [product.image_url] : []);

    const allImages = allImagesRaw.map(resolveImageUrl).filter(Boolean);
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

    return (
        <div>
            {/* Main Image */}
            <div className="relative overflow-hidden rounded-lg" style={{ background: '#f8f9fa', minHeight: 300 }}>
                {currentImage ? (
                    <img
                        src={currentImage}
                        alt={product.name}
                        className="w-full object-contain"
                        style={{ display: 'block', maxHeight: 500 }}
                        onError={(e) => { e.target.style.display = 'none'; if (e.target.nextSibling) e.target.nextSibling.style.display = 'flex'; }}
                    />
                ) : null}
                <div
                    className="w-full items-center justify-center"
                    style={{ display: currentImage ? 'none' : 'flex', minHeight: 300 }}
                >
                    <ShoppingCartOutlined style={{ fontSize: 64, color: '#d9d9d9' }} />
                </div>

                {hasMultipleImages && (
                    <>
                        <button
                            onClick={handlePrevImage}
                            className="absolute left-3 top-1/2 -translate-y-1/2 flex items-center justify-center transition-all hover:scale-110"
                            style={{
                                width: 40, height: 40, borderRadius: '50%',
                                background: 'rgba(255,255,255,0.95)', border: 'none', cursor: 'pointer',
                                boxShadow: '0 2px 12px rgba(0,0,0,0.15)', backdropFilter: 'blur(8px)'
                            }}
                        >
                            <LeftOutlined style={{ fontSize: 14, color: '#333' }} />
                        </button>
                        <button
                            onClick={handleNextImage}
                            className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center justify-center transition-all hover:scale-110"
                            style={{
                                width: 40, height: 40, borderRadius: '50%',
                                background: 'rgba(255,255,255,0.95)', border: 'none', cursor: 'pointer',
                                boxShadow: '0 2px 12px rgba(0,0,0,0.15)', backdropFilter: 'blur(8px)'
                            }}
                        >
                            <RightOutlined style={{ fontSize: 14, color: '#333' }} />
                        </button>
                    </>
                )}

                {hasMultipleImages && (
                    <div
                        className="absolute bottom-3 right-3"
                        style={{
                            background: 'rgba(0,0,0,0.6)', color: '#fff',
                            padding: '4px 12px', borderRadius: 20, fontSize: 13,
                            fontWeight: 500, backdropFilter: 'blur(8px)'
                        }}
                    >
                        {selectedImageIndex + 1} / {allImages.length}
                    </div>
                )}
            </div>

            {/* Thumbnail Strip */}
            {hasMultipleImages && (
                <div
                    className="flex gap-2 py-3 overflow-x-auto"
                    style={{ scrollbarWidth: 'none', msOverflowStyle: 'none', WebkitOverflowScrolling: 'touch' }}
                >
                    {allImages.map((img, index) => {
                        const isSelected = index === selectedImageIndex;
                        return (
                            <button
                                key={img + index}
                                onClick={() => setSelectedImageIndex(index)}
                                style={{ padding: 0, border: 'none', background: 'none', cursor: 'pointer', outline: 'none', flexShrink: 0 }}
                            >
                                <div
                                    style={{
                                        width: 64, height: 64, borderRadius: 8, overflow: 'hidden',
                                        border: isSelected ? '2px solid #000' : '2px solid transparent',
                                        boxShadow: isSelected ? '0 4px 12px rgba(0,0,0,0.2)' : '0 1px 4px rgba(0,0,0,0.08)',
                                        transition: 'border 0.2s ease, box-shadow 0.2s ease'
                                    }}
                                >
                                    <img
                                        src={img}
                                        alt={`${product.name} ${index + 1}`}
                                        loading="eager"
                                        onError={(e) => { e.target.style.display = 'none'; }}
                                        style={{
                                            width: '100%', height: '100%', objectFit: 'cover',
                                            opacity: isSelected ? 1 : 0.7, transition: 'opacity 0.2s ease'
                                        }}
                                    />
                                </div>
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

export default ProductImageGallery;
