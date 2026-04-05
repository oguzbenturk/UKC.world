import { useState, useEffect } from 'react';
import { productApi } from '@/shared/services/productApi';
import ProductCard from '@/features/dashboard/components/ProductCard';

const RelatedProducts = ({ category, subcategory, currentProductId, onWishlistToggle, isInWishlist }) => {
    const [products, setProducts] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!category) { setLoading(false); return; }

        let cancelled = false;
        const fetchRelated = async () => {
            try {
                const result = await productApi.getProducts({ category, limit: 20, status: 'active' });
                if (cancelled) return;
                const items = (result?.products || result?.data || result || []);
                // Filter out current product, prioritize different subcategories
                const filtered = items.filter(p => p.id !== currentProductId);
                const differentSub = filtered.filter(p => p.subcategory !== subcategory);
                const sameSub = filtered.filter(p => p.subcategory === subcategory);
                setProducts([...differentSub, ...sameSub].slice(0, 8));
            } catch (err) {
                console.error('Failed to fetch related products:', err);
            } finally {
                if (!cancelled) setLoading(false);
            }
        };
        fetchRelated();
        return () => { cancelled = true; };
    }, [category, subcategory, currentProductId]);

    if (loading) {
        return (
            <div className="mt-12">
                <h2 className="text-xl font-duotone-bold-extended mb-6">You might also like</h2>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {[1, 2, 3, 4].map(i => (
                        <div key={i} className="bg-gray-100 rounded-lg animate-pulse" style={{ paddingTop: '120%' }} />
                    ))}
                </div>
            </div>
        );
    }

    if (products.length === 0) return null;

    return (
        <div className="mt-12">
            <h2 className="text-xl font-duotone-bold-extended mb-6">You might also like</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {products.map(product => (
                    <ProductCard
                        key={product.id}
                        product={product}
                        onWishlistToggle={onWishlistToggle}
                        isWishlisted={isInWishlist?.(product.id)}
                    />
                ))}
            </div>
        </div>
    );
};

export default RelatedProducts;
