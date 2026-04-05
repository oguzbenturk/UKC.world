import { useState, useEffect } from 'react';
import { CheckOutlined, PlusOutlined, MinusOutlined, ShoppingCartOutlined } from '@ant-design/icons';
import { productApi } from '@/shared/services/productApi';
import { useCurrency } from '@/shared/contexts/CurrencyContext';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || '';
const resolveImageUrl = (url) => {
    if (!url) return null;
    if (url.startsWith('http')) return url;
    return `${BACKEND_URL}${url.startsWith('/') ? '' : '/'}${url}`;
};

// Maps product subcategory to related accessory subcategories (purchase companions)
// 'bars' catches bars, bars-trust, bars-click via startsWith logic in filter
const ADDON_MAP = {
    // Kitesurf — Kites need: bar, chickenloop, pump
    'kites': ['bars', 'chickenloops', 'pumps'],
    // Kitesurf — Bars need: chickenloop + kite
    'bars': ['chickenloops', 'kites'],
    'bars-trust': ['chickenloops', 'kites'],
    'bars-click': ['chickenloops', 'kites'],
    // Kitesurf — Chickenloops need: bar + kite
    'chickenloops': ['bars', 'kites'],
    // Kitesurf — Boards need: foot straps/pads, board bag
    'boards': ['bindings-boots', 'board-bags'],
    'boards-twintips': ['bindings-boots', 'board-bags'],
    'boards-surfboards': ['board-bags'],
    'boards-foilboards': ['board-bags'],
    // Wingfoil — Wings need: board (and vice versa)
    'wings': ['boards'],
    // ION — Wetsuits need: impact vest, boots/shoes, leash
    'wetsuits': ['protection', 'footwear', 'ion-accs-leash'],
    'wetsuits-men': ['protection-men', 'footwear', 'ion-accs-leash'],
    'wetsuits-men-fullsuits': ['protection-men', 'footwear', 'ion-accs-leash'],
    'wetsuits-men-springsuits': ['protection-men', 'footwear', 'ion-accs-leash'],
    'wetsuits-women': ['protection-women', 'footwear', 'ion-accs-leash'],
    'wetsuits-women-fullsuits': ['protection-women', 'footwear', 'ion-accs-leash'],
    'wetsuits-women-springsuits': ['protection-women', 'footwear', 'ion-accs-leash'],
    // ION — Harnesses need: impact vest, leash
    'harnesses': ['protection', 'ion-accs-leash'],
    'harnesses-kite': ['protection', 'ion-accs-leash'],
    'harnesses-wing': ['protection', 'ion-accs-leash'],
};

// Friendly labels for add-on accordion sections
const ADDON_LABELS = {
    'bars': 'Control Bar',
    'bars-trust': 'Trust Bar',
    'bars-click': 'Click Bar',
    'kites': 'Kite',
    'boards': 'Board',
    'board-bags': 'Board Bag',
    'bindings-boots': 'Foot Straps & Pads',
    'pumps': 'Pump',
    'chickenloops': 'Chickenloop',
    'spare-parts': 'Spare Parts',
    'wings': 'Wing',
    'protection': 'Impact Vest',
    'protection-men': 'Impact Vest',
    'protection-women': 'Impact Vest',
    'footwear': 'Boots & Shoes',
    'ion-accs-leash': 'Leash',
    'apparel': 'Apparel',
    'wetsuits': 'Wetsuit',
    'harnesses': 'Harness',
};

const ProductAddOns = ({ category, subcategory, currentProductId, onSelectionChange }) => {
    const [addonGroups, setAddonGroups] = useState([]);
    const [expandedGroup, setExpandedGroup] = useState(null);
    const [loading, setLoading] = useState(true);
    const [selectedIds, setSelectedIds] = useState(new Set());
    const { formatCurrency, convertCurrency, userCurrency } = useCurrency();

    const addonSubcategories = ADDON_MAP[subcategory] || [];

    useEffect(() => {
        if (!category || addonSubcategories.length === 0) {
            setLoading(false);
            return;
        }

        let cancelled = false;
        const fetchAddOns = async () => {
            try {
                const result = await productApi.getProducts({
                    category,
                    limit: 200,
                    status: 'active'
                });
                if (cancelled) return;

                const items = result?.products || result?.data || result || [];
                const filtered = items.filter(p => p.id !== currentProductId);

                const groups = addonSubcategories
                    .map(sub => {
                        const products = filtered.filter(p =>
                            p.subcategory === sub || p.subcategory?.startsWith(sub + '-')
                        );
                        return {
                            subcategory: sub,
                            label: ADDON_LABELS[sub] || sub.replace(/-/g, ' '),
                            products
                        };
                    })
                    .filter(g => g.products.length > 0);

                setAddonGroups(groups);
            } catch (err) {
                console.error('Failed to fetch add-ons:', err);
            } finally {
                if (!cancelled) setLoading(false);
            }
        };
        fetchAddOns();
        return () => { cancelled = true; };
    }, [category, subcategory, currentProductId]);

    const toggleAddon = (addon) => {
        const next = new Set(selectedIds);
        if (next.has(addon.id)) {
            next.delete(addon.id);
        } else {
            next.add(addon.id);
        }
        setSelectedIds(next);
        const allGroupProducts = addonGroups.flatMap(g => g.products);
        onSelectionChange?.(allGroupProducts.filter(p => next.has(p.id)));
    };

    if (loading || addonGroups.length === 0) return null;

    return (
        <div className="mt-6 space-y-2">
            {addonGroups.map(group => {
                const isExpanded = expandedGroup === group.subcategory;
                return (
                    <div key={group.subcategory} className="border border-gray-200 rounded-lg overflow-hidden">
                        <button
                            onClick={() => setExpandedGroup(isExpanded ? null : group.subcategory)}
                            className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors cursor-pointer border-none text-left"
                        >
                            <span className="flex items-center gap-2 text-sm font-duotone-bold text-gray-700">
                                {isExpanded ? <MinusOutlined style={{ fontSize: 10 }} /> : <PlusOutlined style={{ fontSize: 10 }} />}
                                {group.label}
                            </span>
                            <span className="text-xs text-gray-400 font-duotone-regular">
                                {group.products.length} {group.products.length === 1 ? 'option' : 'options'}
                            </span>
                        </button>

                        {isExpanded && (
                            <div className="divide-y divide-gray-100">
                                {group.products.slice(0, 6).map(addon => {
                                    const imgSrc = resolveImageUrl(addon.image_url);
                                    const addonCurrency = addon.currency || 'EUR';
                                    const price = convertCurrency
                                        ? convertCurrency(addon.price, addonCurrency, userCurrency)
                                        : addon.price;
                                    return (
                                        <div key={addon.id} className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors">
                                            <div className="w-12 h-12 rounded-md overflow-hidden bg-gray-100 flex-shrink-0 flex items-center justify-center">
                                                {imgSrc ? (
                                                    <img src={imgSrc} alt={addon.name} className="w-full h-full object-contain" />
                                                ) : (
                                                    <ShoppingCartOutlined className="text-gray-300 text-lg" />
                                                )}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-duotone-regular text-gray-800 truncate m-0">
                                                    {addon.name}
                                                </p>
                                                <p className="text-xs text-gray-400 font-duotone-regular m-0">
                                                    {formatCurrency(price, userCurrency)}
                                                </p>
                                            </div>
                                            {selectedIds.has(addon.id) ? (
                                                <button
                                                    onClick={() => toggleAddon(addon)}
                                                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-duotone-bold
                                                        bg-green-600 border border-green-500 text-white
                                                        hover:bg-green-700 transition-all duration-300 cursor-pointer"
                                                >
                                                    <CheckOutlined style={{ fontSize: 10 }} />
                                                    Added
                                                </button>
                                            ) : (
                                                <button
                                                    onClick={() => toggleAddon(addon)}
                                                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-duotone-bold
                                                        bg-antrasit border border-duotone-blue/30 text-duotone-blue
                                                        hover:bg-[#525759] hover:border-duotone-blue/60
                                                        transition-all duration-300 cursor-pointer"
                                                >
                                                    <PlusOutlined style={{ fontSize: 10 }} />
                                                    Add
                                                </button>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
};

export default ProductAddOns;
