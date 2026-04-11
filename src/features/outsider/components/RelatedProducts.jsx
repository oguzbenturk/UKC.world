import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { productApi } from '@/shared/services/productApi';
import ProductCard from '@/features/dashboard/components/ProductCard';

// For each subcategory, ordered list of related subcategories (most related first).
// The index position = affinity score: lower is more related.
const SUBCATEGORY_AFFINITY = {
    kitesurf: {
        'kites':             ['kites', 'bars', 'bars-trust', 'bars-click', 'boards', 'boards-twintips', 'boards-surfboards', 'boards-foilboards', 'pumps', 'chickenloops'],
        'bars':              ['bars', 'bars-trust', 'bars-click', 'kites', 'chickenloops'],
        'bars-trust':        ['bars-trust', 'bars', 'bars-click', 'kites', 'chickenloops'],
        'bars-click':        ['bars-click', 'bars', 'bars-trust', 'kites', 'chickenloops'],
        'boards':            ['boards', 'boards-twintips', 'boards-surfboards', 'boards-foilboards', 'bindings-boots', 'board-bags'],
        'boards-twintips':   ['boards-twintips', 'boards', 'boards-surfboards', 'bindings-boots', 'board-bags'],
        'boards-surfboards': ['boards-surfboards', 'boards', 'boards-twintips', 'bindings-boots'],
        'boards-foilboards': ['boards-foilboards', 'boards', 'bindings-boots'],
        'pumps':             ['pumps', 'kites', 'spare-parts'],
        'chickenloops':      ['chickenloops', 'bars', 'bars-trust', 'bars-click'],
        'bindings-boots':    ['bindings-boots', 'boards', 'boards-twintips', 'board-bags'],
        'board-bags':        ['board-bags', 'boards', 'bindings-boots'],
        'spare-parts':       ['spare-parts', 'bars', 'kites'],
        'accessories':       ['accessories', 'pumps', 'chickenloops', 'spare-parts'],
    },
    wingfoil: {
        'wings':  ['wings', 'boards'],
        'boards': ['boards', 'wings'],
    },
    foiling: {
        'wings':           ['wings', 'masts-fuselages'],
        'masts-fuselages': ['masts-fuselages', 'wings'],
    },
    efoil: {
        'efoil-boards':      ['efoil-boards', 'efoil-accessories'],
        'efoil-accessories': ['efoil-accessories', 'efoil-boards'],
    },
    ion: {
        'wetsuits':                   ['wetsuits', 'wetsuits-men', 'wetsuits-women', 'wetsuits-men-fullsuits', 'wetsuits-women-fullsuits', 'protection', 'apparel'],
        'wetsuits-men':               ['wetsuits-men', 'wetsuits-men-fullsuits', 'wetsuits-men-springsuits', 'wetsuits'],
        'wetsuits-men-fullsuits':     ['wetsuits-men-fullsuits', 'wetsuits-men', 'wetsuits-men-springsuits', 'wetsuits'],
        'wetsuits-men-springsuits':   ['wetsuits-men-springsuits', 'wetsuits-men', 'wetsuits-men-fullsuits', 'wetsuits'],
        'wetsuits-women':             ['wetsuits-women', 'wetsuits-women-fullsuits', 'wetsuits-women-springsuits', 'wetsuits'],
        'wetsuits-women-fullsuits':   ['wetsuits-women-fullsuits', 'wetsuits-women', 'wetsuits-women-springsuits', 'wetsuits'],
        'wetsuits-women-springsuits': ['wetsuits-women-springsuits', 'wetsuits-women', 'wetsuits-women-fullsuits', 'wetsuits'],
        'harnesses':                  ['harnesses', 'harnesses-kite', 'harnesses-wing'],
        'harnesses-kite':             ['harnesses-kite', 'harnesses', 'harnesses-wing'],
        'harnesses-wing':             ['harnesses-wing', 'harnesses', 'harnesses-kite'],
        'protection':                 ['protection', 'protection-men', 'protection-women', 'wetsuits'],
        'protection-men':             ['protection-men', 'protection', 'protection-women'],
        'protection-women':           ['protection-women', 'protection', 'protection-men'],
        'apparel':                    ['apparel', 'apparel-tops', 'apparel-ponchos', 'footwear'],
        'apparel-tops':               ['apparel-tops', 'apparel', 'apparel-ponchos'],
        'apparel-ponchos':            ['apparel-ponchos', 'apparel', 'apparel-tops'],
        'footwear':                   ['footwear', 'apparel'],
        'ion-accs':                   ['ion-accs', 'ion-accs-leash'],
        'ion-accs-leash':             ['ion-accs-leash', 'ion-accs'],
    },
    'ukc-shop': {
        'hoodies': ['hoodies', 'ponchos', 'tshirts'],
        'ponchos': ['ponchos', 'hoodies', 'tshirts'],
        'tshirts': ['tshirts', 'hoodies', 'ponchos'],
    },
    secondwind: {
        'kites':  ['kites', 'bars', 'boards', 'sets'],
        'bars':   ['bars', 'kites', 'sets'],
        'boards': ['boards', 'foils', 'kites', 'sets'],
        'wings':  ['wings', 'boards', 'foils'],
        'foils':  ['foils', 'boards', 'wings'],
        'sets':   ['sets', 'kites', 'boards'],
    },
};

const getAffinityScore = (currentSub, targetSub, category) => {
    const list = SUBCATEGORY_AFFINITY[category]?.[currentSub];
    if (!list) return targetSub === currentSub ? 0 : 999;
    const idx = list.indexOf(targetSub);
    return idx === -1 ? 999 : idx;
};

const RelatedProducts = ({ category, subcategory, currentProductId, onWishlistToggle, isInWishlist }) => {
    const { data: rawProducts, isLoading: loading } = useQuery({
        queryKey: ['relatedProducts', category],
        queryFn: () => productApi.getProducts({ category, limit: 20, status: 'active' }),
        enabled: !!category,
    });

    const products = useMemo(() => {
        const items = rawProducts?.products || rawProducts?.data || rawProducts || [];
        const filtered = items.filter(p => p.id !== currentProductId);
        return filtered
            .map(p => ({ ...p, _score: getAffinityScore(subcategory, p.subcategory, category) }))
            .sort((a, b) => a._score - b._score)
            .slice(0, 8);
    }, [rawProducts, currentProductId, subcategory, category]);

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
