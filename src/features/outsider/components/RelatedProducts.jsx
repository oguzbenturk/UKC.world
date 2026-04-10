import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { productApi } from '@/shared/services/productApi';
import ProductCard from '@/features/dashboard/components/ProductCard';

const RelatedProducts = ({ category, subcategory, currentProductId, onWishlistToggle, isInWishlist }) => {
    const { data: rawProducts, isLoading: loading } = useQuery({
        queryKey: ['relatedProducts', category],
        queryFn: () => productApi.getProducts({ category, limit: 20, status: 'active' }),
        enabled: !!category,
    });

    const products = useMemo(() => {
        const items = rawProducts?.products || rawProducts?.data || rawProducts || [];
        const filtered = items.filter(p => p.id !== currentProductId);
        const differentSub = filtered.filter(p => p.subcategory !== subcategory);
        const sameSub = filtered.filter(p => p.subcategory === subcategory);
        return [...differentSub, ...sameSub].slice(0, 8);
    }, [rawProducts, currentProductId, subcategory]);

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
