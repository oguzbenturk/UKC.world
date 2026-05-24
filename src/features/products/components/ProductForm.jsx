// src/features/products/components/ProductForm.jsx
// Modern redesigned form for creating and editing products
// Context-aware fields: sections shown/hidden based on selected category
// Combo-box category/subcategory selectors with inline creation

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  Form,
  Input,
  InputNumber,
  Button,
  Select,
  Switch,
  Row,
  Col,
  Tag,
  Tabs,
  Badge,
  Tooltip,
} from 'antd';
import { message } from '@/shared/utils/antdStatic';
import { useTranslation } from 'react-i18next';
import {
  PlusOutlined,
  InfoCircleOutlined,
  TagsOutlined,
  DollarOutlined,
  AppstoreOutlined,
  BgColorsOutlined,
  LinkOutlined,
  CheckCircleOutlined,
  InboxOutlined,
} from '@ant-design/icons';
import { useCurrency } from '@/shared/contexts/CurrencyContext';
import { productApi } from '@/shared/services/productApi';
import VariantTable from './VariantTable';
import CreatableSelect from './CreatableSelect';
import GallerySection from './GallerySection';
import {
  getHierarchicalSubcategories,
  hasSubcategories,
  CATEGORY_OPTIONS,
} from '@/shared/constants/productCategories';
import { buildImagePayload } from '../utils/productImagePayload';

const { Option } = Select;
const { TextArea } = Input;

// JSONB columns can arrive as arrays, JSON-encoded strings, or null depending
// on the pg client config. Normalize to an array so callers don't silently
// drop data on format mismatch.
const safeParseArray = (value) => {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch { return []; }
  }
  return [];
};

const PRODUCT_STATUS = [
  { value: 'active', label: 'Active', color: 'success' },
  { value: 'inactive', label: 'Inactive', color: 'warning' },
  { value: 'discontinued', label: 'Discontinued', color: 'error' }
];

const BRANDS = ['Duotone', 'ION', 'North', 'Core', 'Cabrinha', 'Mystic', 'Dakine', 'F-One', 'Ozone', 'Slingshot'];

// ─── Context-aware field visibility per category ───────────────────
const CATEGORY_FIELD_CONFIG = {
  kitesurf: {
    showGender: false,
    showColors: true,
    showSizes: true,
    showVariants: true,
    showWeight: true,
    showCostPrice: true,
    sizePlaceholder: 'e.g., 7m, 9m, 10m, 12m or 133, 136, 139',
    sizeLabel: 'Available Sizes / Dimensions',
  },
  wingfoil: {
    showGender: false,
    showColors: true,
    showSizes: true,
    showVariants: true,
    showWeight: true,
    showCostPrice: true,
    sizePlaceholder: 'e.g., 3m, 4m, 5m, 6m or 80L, 100L, 120L',
    sizeLabel: 'Available Sizes / Volumes',
  },
  efoil: {
    showGender: false,
    showColors: true,
    showSizes: true,
    showVariants: true,
    showWeight: true,
    showCostPrice: true,
    sizePlaceholder: 'e.g., S, M, L or specific dimensions',
    sizeLabel: 'Available Sizes',
  },
  ion: {
    showGender: true,
    showColors: true,
    showSizes: true,
    showVariants: true,
    showWeight: false,
    showCostPrice: true,
    sizePlaceholder: 'e.g., XS, S, M, L, XL, XXL or 46, 48, 50, 52',
    sizeLabel: 'Available Sizes',
  },
  'ukc-shop': {
    showGender: true,
    showColors: true,
    showSizes: true,
    showVariants: true,
    showWeight: false,
    showCostPrice: true,
    sizePlaceholder: 'e.g., S, M, L, XL',
    sizeLabel: 'Available Sizes',
  },
  secondwind: {
    showGender: false,
    showColors: true,
    showSizes: true,
    showVariants: false,
    showWeight: true,
    showCostPrice: false,
    sizePlaceholder: 'e.g., 7m, 9m, 12m or 133, 136',
    sizeLabel: 'Available Sizes',
  },
  _default: {
    showGender: true,
    showColors: true,
    showSizes: true,
    showVariants: true,
    showWeight: true,
    showCostPrice: true,
    sizePlaceholder: 'e.g., S, M, L, XL',
    sizeLabel: 'Available Sizes',
  },
};

const getFieldConfig = (category) =>
  CATEGORY_FIELD_CONFIG[category] || CATEGORY_FIELD_CONFIG._default;

// `colors` JSONB is either `[{name, imageCount}, ...]` (current — slice
// `images` per imageCount) or plain strings (legacy — all images stay in
// the unbucketed gallery).
const hydrateGalleryFromProduct = (product) => {
  const empty = { colorNames: [], colorImagesMap: {}, gallery: [] };
  if (!product) return empty;

  const rawColors = safeParseArray(product.colors);
  const allImages = safeParseArray(product.images);
  const firstIsObject = rawColors.length > 0
    && rawColors[0] !== null
    && typeof rawColors[0] === 'object'
    && !Array.isArray(rawColors[0]);

  if (firstIsObject) {
    const names = [];
    const map = {};
    let idx = 0;
    for (const c of rawColors) {
      const name = (c && (c.name || c.code)) || '';
      if (!name) continue;
      names.push(name);
      map[name] = allImages.slice(idx, idx + (c.imageCount || 0));
      idx += (c.imageCount || 0);
    }
    return { colorNames: names, colorImagesMap: map, gallery: allImages.slice(idx) };
  }

  const names = rawColors
    .map(c => typeof c === 'string' ? c : (c && (c.name || c.code)) || '')
    .filter(Boolean);
  return {
    colorNames: names,
    colorImagesMap: Object.fromEntries(names.map(n => [n, []])),
    gallery: allImages,
  };
};

/** Avoid spreading raw API/ORM `product` into Form initialValues — nested refs cause antd deepEqual "circular references" warnings. */
const pickPlainProductForForm = (p) => {
  if (!p || typeof p !== 'object') return {};
  const cloneJson = (v) => {
    try {
      return JSON.parse(JSON.stringify(v));
    } catch {
      return undefined;
    }
  };
  const variantRow = (row) =>
    row && typeof row === 'object'
      ? {
          key: row.key,
          label: row.label,
          quantity: row.quantity,
          price: row.price,
          price_final: row.price_final,
          cost_price: row.cost_price,
        }
      : row;
  const keys = [
    'name',
    'sku',
    'category',
    'subcategory',
    'brand',
    'gender',
    'status',
    'is_featured',
    'source_url',
    'tags',
    'description',
    'sizes',
    'dimensions',
    'supplier_info',
    'currency',
    'colors',
    'images',
    'image_url',
  ];
  const out = {};
  for (const k of keys) {
    if (p[k] === undefined || p[k] === null) continue;
    const v = p[k];
    if (k === 'tags' || k === 'sizes' || k === 'images') {
      out[k] = Array.isArray(v) ? [...v] : v;
    } else if (k === 'dimensions' || k === 'supplier_info' || k === 'colors') {
      const c = cloneJson(v);
      if (c !== undefined) out[k] = c;
    } else {
      out[k] = v;
    }
  }
  if (Array.isArray(p.variants)) {
    out.variants = p.variants.map(variantRow);
  }
  return out;
};

const ProductForm = ({
  product = null,
  onSubmit,
  onCancel,
  loading = false
}) => {
  const { t } = useTranslation(['manager']);
  const [form] = Form.useForm();
  // Parent remounts the form via `key` whenever `product` changes, so a
  // one-shot lazy init covers reloads.
  const [initialGallery] = useState(() => hydrateGalleryFromProduct(product));

  const [imageUrl, setImageUrl] = useState(product?.image_url || null);
  const [images, setImages] = useState(initialGallery.gallery);
  const [imageLoading, setImageLoading] = useState(false);
  const { businessCurrency } = useCurrency();
  const [selectedCurrency, setSelectedCurrency] = useState(product?.currency || businessCurrency || 'EUR');
  const [activeTab, setActiveTab] = useState('product');
  const [selectedCategory, setSelectedCategory] = useState(product?.category || null);
  const [extraSubcategories, setExtraSubcategories] = useState([]);
  const [colorNames, setColorNames] = useState(initialGallery.colorNames);
  const [colorImagesMap, setColorImagesMap] = useState(initialGallery.colorImagesMap);
  const [colorInputVal, setColorInputVal] = useState('');
  const isEditing = !!product;

  const watchedCategory = Form.useWatch('category', form);
  const prevWatchedCategoryRef = useRef(undefined);

  /** Keep UI + subcategory fetch in sync; clear dependent fields when category changes (no duplicate Form onChange — avoids antd deepEqual issues). */
  useEffect(() => {
    setSelectedCategory(watchedCategory ?? null);
    const prev = prevWatchedCategoryRef.current;
    if (prev !== undefined && prev !== watchedCategory) {
      form.setFieldValue('subcategory', undefined);
      const config = getFieldConfig(watchedCategory);
      if (!config.showGender) form.setFieldValue('gender', undefined);
    }
    prevWatchedCategoryRef.current = watchedCategory;
  }, [watchedCategory, form]);

  // Derived field config based on selected category
  const fieldConfig = useMemo(() => getFieldConfig(selectedCategory), [selectedCategory]);

  // Category options for CreatableSelect
  const categoryOptions = useMemo(() => 
    CATEGORY_OPTIONS.map(cat => ({
      value: cat.value,
      label: `${cat.icon} ${cat.label}`,
    })),
    []
  );

  // Subcategory options: merge constants hierarchy + any DB extras
  const subcategoryOptions = useMemo(() => {
    if (!selectedCategory) return [];
    const hasSubs = hasSubcategories(selectedCategory);
    if (!hasSubs) {
      // Only show extra (DB-sourced) subcategories
      return extraSubcategories.map(s => ({
        value: s.value || s.subcategory,
        label: s.label || s.display_name,
        children: [],
      }));
    }
    const tree = getHierarchicalSubcategories(selectedCategory);
    // Gather all constant values to avoid duplicates
    const collectValues = (nodes) => {
      const vals = new Set();
      nodes.forEach(n => {
        vals.add(n.value);
        if (n.children) collectValues(n.children).forEach(v => vals.add(v));
      });
      return vals;
    };
    const constantValues = collectValues(tree);
    const extras = extraSubcategories
      .filter(s => !constantValues.has(s.value || s.subcategory))
      .map(s => ({
        value: s.value || s.subcategory,
        label: s.label || s.display_name,
        children: [],
      }));
    const merged = [...tree, ...extras];
    try {
      return JSON.parse(JSON.stringify(merged));
    } catch {
      return merged;
    }
  }, [selectedCategory, extraSubcategories]);

  // Fetch extra subcategories from DB when category changes
  useEffect(() => {
    if (!selectedCategory) {
      setExtraSubcategories([]);
      return;
    }
    let cancelled = false;
    const fetchExtras = async () => {
      try {
        const data = await productApi.getSubcategories(selectedCategory);
        if (!cancelled) {
          const raw = data.subcategories || [];
          setExtraSubcategories(
            raw.map((s) => ({
              value: s.value || s.subcategory,
              label: s.label || s.display_name,
            }))
          );
        }
      } catch {
        // Silent — constants are always available as fallback
      }
    };
    fetchExtras();
    return () => { cancelled = true; };
  }, [selectedCategory]);

  // businessCurrency may resolve async after mount; pick it up for new products.
  useEffect(() => {
    if (!isEditing && !product?.currency && businessCurrency) {
      setSelectedCurrency(businessCurrency);
      form.setFieldsValue({ currency: businessCurrency });
    }
  }, [businessCurrency, isEditing, product?.currency, form]);

  const handleSubmit = async (values) => {
    try {
      const { colors: finalColors, images: finalImages } = buildImagePayload({
        colorNames,
        colorImagesMap,
        gallery: images,
      });

      const variantList = values.variants || [];
      const variantPrices = variantList.map(v => v.price).filter(p => p != null && p > 0);
      const formPrice = values.price != null && values.price !== '' ? parseFloat(values.price) : null;
      const derivedPrice = variantPrices.length > 0
        ? Math.min(...variantPrices)
        : (formPrice ?? (product?.price ? parseFloat(product.price) : 0));
      const variantCosts = variantList.map(v => v.cost_price).filter(p => p != null && p > 0);
      const formCost = values.cost_price != null && values.cost_price !== '' ? parseFloat(values.cost_price) : null;
      const derivedCostPrice = variantCosts.length > 0
        ? Math.min(...variantCosts)
        : (formCost ?? (product?.cost_price ? parseFloat(product.cost_price) : null));

      const formattedValues = {
        ...values,
        price: derivedPrice,
        cost_price: derivedCostPrice,
        original_price: values.original_price != null ? parseFloat(values.original_price) : null,
        currency: selectedCurrency,
        image_url: imageUrl,
        images: finalImages,
        tags: Array.isArray(values.tags) ? values.tags : [],
        dimensions: values.dimensions || null,
        supplier_info: values.supplier_info || null,
        variants: values.variants || null,
        colors: finalColors,
        gender: values.gender || null,
        sizes: values.sizes || null,
        source_url: values.source_url || null
      };

      await onSubmit(formattedValues);

      if (!isEditing) {
        form.resetFields();
        setImageUrl(null);
        setImages([]);
        setColorNames([]);
        setColorImagesMap({});
        setColorInputVal('');
      }
    } catch {
      // Parent (Products.jsx) owns success/error toasts.
    }
  };

  const addColor = useCallback((name) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setColorNames(prev => prev.includes(trimmed) ? prev : [...prev, trimmed]);
    setColorImagesMap(prev => ({ ...prev, [trimmed]: prev[trimmed] || [] }));
  }, []);

  const removeColor = useCallback((name) => {
    setColorNames(prev => prev.filter(n => n !== name));
    setColorImagesMap(prev => { const copy = { ...prev }; delete copy[name]; return copy; });
  }, []);

  const handleCreateSubcategory = useCallback(async (slug, label, parentValue) => {
    if (!selectedCategory) return;
    try {
      await productApi.createSubcategory({
        category: selectedCategory,
        subcategory: slug,
        display_name: label,
        parent_subcategory: parentValue || null,
      });
      // Refresh extra subcategories from DB
      const data = await productApi.getSubcategories(selectedCategory);
      setExtraSubcategories(data.subcategories || []);
      message.success(t('manager:products.form.subcategoryCreated', { label }));
    } catch {
      message.error(t('manager:products.form.subcategoryCreateError'));
      throw new Error('creation failed');
    }
  }, [selectedCategory]);

  const handleDeleteSubcategory = useCallback(async (subcategoryValue) => {
    if (!selectedCategory) return;
    try {
      await productApi.deleteSubcategory(selectedCategory, subcategoryValue);
      // Refresh extra subcategories from DB
      const data = await productApi.getSubcategories(selectedCategory);
      setExtraSubcategories(data.subcategories || []);
      message.success(t('manager:products.form.subcategoryRemoved'));
    } catch {
      message.error(t('manager:products.form.subcategoryRemoveError'));
      throw new Error('deletion failed');
    }
  }, [selectedCategory]);

  // ── Compute live variant stock for tab badge ────────────────────
  const watchedVariants = Form.useWatch('variants', form) || [];
  const liveStockSummary = useMemo(() => {
    let total = 0, minPrice = null, minCost = null, pricedVariantCount = 0;
    for (const v of watchedVariants) {
      total += v.quantity || 0;
      if (v.price != null && v.price > 0) {
        pricedVariantCount++;
        if (minPrice === null || v.price < minPrice) minPrice = v.price;
      }
      if (v.cost_price != null && v.cost_price > 0) {
        if (minCost === null || v.cost_price < minCost) minCost = v.cost_price;
      }
    }
    return { total, variantCount: watchedVariants.length, pricedVariantCount, minPrice, minCost };
  }, [watchedVariants]);

  // Guarded write — unguarded `setFieldValue` causes a render loop via `Form.useWatch`.
  useEffect(() => {
    if (liveStockSummary.variantCount === 0) return;
    const setIfChanged = (field, value) => {
      if (value !== null && form.getFieldValue(field) !== value) {
        form.setFieldValue(field, value);
      }
    };
    setIfChanged('stock_quantity', liveStockSummary.total);
    setIfChanged('price', liveStockSummary.minPrice);
    setIfChanged('cost_price', liveStockSummary.minCost);
  }, [
    liveStockSummary.variantCount,
    liveStockSummary.total,
    liveStockSummary.minPrice,
    liveStockSummary.minCost,
    form,
  ]);

  // Tab items — Product | Stock & Pricing
  const tabItems = [
    {
      key: 'product',
      label: <span className="flex items-center gap-1.5"><TagsOutlined /> {t('manager:products.form.productTab')}</span>,
      children: (
        <div className="space-y-3 pt-1">
          {/* ── Identity ── */}
          <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400"><TagsOutlined /> {t('manager:products.form.identity')}</p>
          <Row gutter={[8, 0]}>
            <Col xs={24} md={16}>
              <Form.Item name="name" label="Name" rules={[{ required: true, message: 'Required' }, { min: 2 }]}>
                <Input placeholder="e.g., Duotone Rebel D/LAB 2026" />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item name="sku" label="SKU">
                <Input placeholder="Auto-generated" />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item name="category" label="Category" rules={[{ required: true, message: 'Required' }]}>
                <CreatableSelect
                  options={categoryOptions}
                  placeholder="Select or create"
                  onCreateNew={async (slug, label) => { message.info(`"${label}" will be saved with this product`); }}
                  createLabel="Create category"
                  createPlaceholder="e.g., Surfboards"
                />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item name="subcategory" label="Subcategory">
                <CreatableSelect
                  key={selectedCategory || 'no-category'}
                  options={subcategoryOptions}
                  placeholder={selectedCategory ? 'Select or create' : 'Select category first'}
                  disabled={!selectedCategory}
                  hierarchical={hasSubcategories(selectedCategory)}
                  onCreateNew={handleCreateSubcategory}
                  onDelete={handleDeleteSubcategory}
                  createLabel="Create subcategory"
                  createPlaceholder="e.g., Harnesses"
                />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item name="brand" label="Brand">
                <Select placeholder="Select brand" showSearch allowClear>
                  {BRANDS.map(b => <Option key={b} value={b}>{b}</Option>)}
                </Select>
              </Form.Item>
            </Col>
          </Row>

          <div className="h-px bg-slate-100" />

          {/* ── Details ── */}
          <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400"><InfoCircleOutlined /> {t('manager:products.form.details')}</p>
          <Row gutter={[8, 0]}>
            {fieldConfig.showGender && (
              <Col xs={12} md={8}>
                <Form.Item name="gender" label="Gender">
                  <Select placeholder="Select gender" allowClear>
                    <Option value="Men">{t('manager:products.form.genderMen')}</Option>
                    <Option value="Women">{t('manager:products.form.genderWomen')}</Option>
                    <Option value="Unisex">{t('manager:products.form.genderUnisex')}</Option>
                  </Select>
                </Form.Item>
              </Col>
            )}
            <Col xs={12} md={8}>
              <Form.Item name="status" label="Status" rules={[{ required: true }]}>
                <Select>
                  {PRODUCT_STATUS.map(s => (
                    <Option key={s.value} value={s.value}>
                      <Badge status={s.color} text={s.label} />
                    </Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
            <Col xs={12} md={8}>
              <Form.Item name="is_featured" label={<span>Featured <Tooltip title={t('manager:products.form.featuredTooltip')}><InfoCircleOutlined className="text-slate-300" /></Tooltip></span>} valuePropName="checked">
                <Switch checkedChildren={t('manager:products.form.featuredYes')} unCheckedChildren={t('manager:products.form.featuredNo')} />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="source_url" label="Source URL">
                <Input placeholder="https://..." prefix={<LinkOutlined className="text-slate-300" />} />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="tags" label="Tags">
                <Select mode="tags" placeholder="Add tags" tokenSeparators={[',']} />
              </Form.Item>
            </Col>
            {fieldConfig.showColors && (
              <Col xs={24}>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1.5">
                    <BgColorsOutlined className="mr-1" />{t('manager:products.form.colorOptions')}
                  </label>
                  <div className="flex gap-2 mb-2">
                    <Input
                      value={colorInputVal}
                      onChange={e => setColorInputVal(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          e.stopPropagation();
                          addColor(colorInputVal);
                          setColorInputVal('');
                        }
                      }}
                      placeholder={t('manager:products.form.colorPlaceholder')}
                      size="small"
                      className="rounded-lg"
                    />
                    <Button
                      size="small"
                      onClick={() => { addColor(colorInputVal); setColorInputVal(''); }}
                      disabled={!colorInputVal.trim()}
                    >{t('manager:products.form.addColor')}</Button>
                  </div>
                  {colorNames.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {colorNames.map(name => (
                        <Tag key={name} closable onClose={() => removeColor(name)} color="blue" className="rounded-full">
                          {name}
                        </Tag>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-slate-400">{t('manager:products.form.noColorsHint')}</p>
                  )}
                </div>
              </Col>
            )}
            <Col xs={24}>
              <Form.Item name="description" label="Description">
                <TextArea rows={2} placeholder="Product description..." showCount maxLength={1000} className="resize-none" />
              </Form.Item>
            </Col>
          </Row>
        </div>
      ),
    },
    {
      key: 'stock-media',
      label: (
        <span className="flex items-center gap-1.5">
          <DollarOutlined /> {t('manager:products.form.stockTab')}
          {liveStockSummary.variantCount > 0 && (
            <Badge count={`${liveStockSummary.total}`} style={{ backgroundColor: '#1677ff', fontSize: 10 }} size="small" />
          )}
        </span>
      ),
      children: (
        <div className="space-y-3 pt-1">
          {fieldConfig.showVariants && <div className="h-px bg-slate-100" />}

          {/* ── Variants ── */}
          {fieldConfig.showVariants && (
            <>
              <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400"><AppstoreOutlined /> {t('manager:products.form.sizeVariants')}</p>
              <Form.Item name="variants" noStyle>
                <VariantTable currency={selectedCurrency} category={selectedCategory} />
              </Form.Item>
            </>
          )}

          {/* ── Simple Sizes ── */}
          {fieldConfig.showSizes && !fieldConfig.showVariants && (
            <>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{t('manager:products.form.sizesLabel')}</p>
              <Form.Item name="sizes" noStyle>
                <Select mode="tags" style={{ width: '100%' }} placeholder={fieldConfig.sizePlaceholder} tokenSeparators={[',', ' ']} />
              </Form.Item>
            </>
          )}

          <div className="h-px bg-slate-100" />

          {/* ── Price ── */}
          <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400"><DollarOutlined /> Price</p>
          <Row gutter={[8, 0]}>
            <Col xs={24} md={12}>
              <Form.Item
                name="price"
                label="Selling Price"
                rules={[{ required: liveStockSummary.pricedVariantCount === 0, message: 'Set a price or add a variant with a price' }, { type: 'number', min: 0 }]}
                extra={liveStockSummary.pricedVariantCount > 0
                  ? 'Derived from the lowest variant price below. Edit variant rows to change it.'
                  : 'Used when no variant has a price set.'}
              >
                <InputNumber
                  style={{ width: '100%' }}
                  min={0}
                  step={0.01}
                  precision={2}
                  placeholder="0.00"
                  prefix="€"
                  disabled={liveStockSummary.pricedVariantCount > 0}
                />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="cost_price" label="Cost Price">
                <InputNumber
                  style={{ width: '100%' }}
                  min={0}
                  step={0.01}
                  precision={2}
                  placeholder="0.00"
                  prefix="€"
                  disabled={liveStockSummary.pricedVariantCount > 0}
                />
              </Form.Item>
            </Col>
          </Row>

          <div className="h-px bg-slate-100" />

          {/* ── Inventory ── */}
          <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400"><InboxOutlined /> {t('manager:products.form.inventory')}</p>
          <Row gutter={[8, 0]}>
            <Col xs={24} md={fieldConfig.showWeight ? 8 : 12}>
              <Form.Item
                name="stock_quantity"
                label={t('manager:products.form.totalStock')}
                rules={[{ required: true, message: 'Required' }, { type: 'number', min: 0 }]}
                extra={liveStockSummary.variantCount > 0 ? t('manager:products.form.syncedFromVariants', { count: liveStockSummary.total }) : undefined}
              >
                <InputNumber style={{ width: '100%' }} min={0} placeholder="0" disabled={liveStockSummary.variantCount > 0} />
              </Form.Item>
            </Col>
            <Col xs={24} md={fieldConfig.showWeight ? 8 : 12}>
              <Form.Item name="min_stock_level" label={t('manager:products.form.lowStockAlert')}>
                <InputNumber style={{ width: '100%' }} min={0} placeholder="5" />
              </Form.Item>
            </Col>
            {fieldConfig.showWeight && (
              <Col xs={24} md={8}>
                <Form.Item name="weight" label={t('manager:products.form.weightKg')}>
                  <InputNumber style={{ width: '100%' }} min={0} step={0.1} precision={2} placeholder="0.00" />
                </Form.Item>
              </Col>
            )}
          </Row>

          {/* ── Discount / Original Price ── */}
          <div className="h-px bg-slate-100" />
          <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400"><TagsOutlined /> {t('manager:products.form.discount')}</p>
          <Row gutter={[8, 0]}>
            <Col xs={24} md={12}>
              <Form.Item
                name="original_price"
                label={t('manager:products.form.originalPrice')}
                extra={t('manager:products.form.originalPriceHint')}
              >
                <InputNumber
                  style={{ width: '100%' }}
                  min={0}
                  step={0.01}
                  precision={2}
                  placeholder="e.g. 1299.00"
                  prefix="€"
                />
              </Form.Item>
            </Col>
          </Row>

          <div className="h-px bg-slate-100" />

          <GallerySection
            imageUrl={imageUrl}
            setImageUrl={setImageUrl}
            imageLoading={imageLoading}
            setImageLoading={setImageLoading}
            images={images}
            setImages={setImages}
            colorNames={colorNames}
            colorImagesMap={colorImagesMap}
            setColorImagesMap={setColorImagesMap}
          />
        </div>
      ),
    },
  ];

  return (
    <Form
      form={form}
      layout="vertical"
      onFinish={handleSubmit}
      className="[&_.ant-form-item]:mb-2 [&_.ant-form-item-label]:py-0 [&_.ant-form-item-label>label]:text-xs [&_.ant-form-item-label>label]:text-slate-500 [&_.ant-form-item-label>label]:font-medium"
      initialValues={{
        currency: selectedCurrency,
        status: 'active',
        is_featured: false,
        tags: [],
        variants: [],
        colors: [],
        sizes: [],
        ...pickPlainProductForForm(product),
        // `!= null` (not truthy): 0 is a legitimate saved value here.
        price: product?.price != null ? parseFloat(product.price) : undefined,
        cost_price: product?.cost_price != null ? parseFloat(product.cost_price) : undefined,
        original_price: product?.original_price != null ? parseFloat(product.original_price) : undefined,
        weight: product?.weight != null ? parseFloat(product.weight) : undefined,
        stock_quantity: product?.stock_quantity != null ? parseInt(product.stock_quantity, 10) : 0,
        min_stock_level: product?.min_stock_level != null ? parseInt(product.min_stock_level, 10) : 5,
      }}
    >
      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        items={tabItems}
        size="small"
        tabBarStyle={{ marginBottom: 8 }}
      />

      {/* Footer */}
      <div className="sticky bottom-0 flex items-center justify-end gap-2 border-t border-slate-100 bg-white pt-2 mt-2">
        {isEditing && (
          <span className="mr-auto text-xs text-slate-400">
            <CheckCircleOutlined className="mr-1" />{product.name}
          </span>
        )}
        <Button onClick={onCancel} size="small">{t('manager:products.form.cancelButton')}</Button>
        <Button
          type="primary"
          htmlType="submit"
          loading={loading}
          size="small"
          icon={isEditing ? <CheckCircleOutlined /> : <PlusOutlined />}
        >
          {isEditing ? t('manager:products.form.updateButton') : t('manager:products.form.createButton')}
        </Button>
      </div>
    </Form>
  );
};

export default ProductForm;
