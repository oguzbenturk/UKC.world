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
  Upload,
  Row,
  Col,
  Tag,
  Image,
  Card,
  Tabs,
  Space,
  Typography,
  Badge,
  Tooltip,
  Alert
} from 'antd';
import { message } from '@/shared/utils/antdStatic';
import { 
  PlusOutlined, 
  LoadingOutlined, 
  DeleteOutlined,
  InfoCircleOutlined,
  TagsOutlined,
  DollarOutlined,
  AppstoreOutlined,
  PictureOutlined,
  BgColorsOutlined,
  LinkOutlined,
  StarOutlined,
  CheckCircleOutlined,
  InboxOutlined
} from '@ant-design/icons';
import { useCurrency } from '@/shared/contexts/CurrencyContext';
import CurrencySelector from '@/shared/components/ui/CurrencySelector';
import apiClient from '@/shared/services/apiClient';
import { productApi } from '@/shared/services/productApi';
import VariantTable from './VariantTable';
import ColorTable from './ColorTable';
import CreatableSelect from './CreatableSelect';
import { 
  getHierarchicalSubcategories, 
  hasSubcategories, 
  CATEGORY_OPTIONS,
  PRODUCT_CATEGORIES as CATEGORIES_MAP
} from '@/shared/constants/productCategories';

const { Option } = Select;
const { TextArea } = Input;
const { Title, Text } = Typography;

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
  const [form] = Form.useForm();
  const [imageUrl, setImageUrl] = useState(product?.image_url || null);
  const [images, setImages] = useState(product?.images || []);
  const [imageLoading, setImageLoading] = useState(false);
  const { getCurrencySymbol, businessCurrency } = useCurrency();
  const [selectedCurrency, setSelectedCurrency] = useState(product?.currency || businessCurrency || 'EUR');
  const [activeTab, setActiveTab] = useState('product');
  const [profitMargin, setProfitMargin] = useState(null);
  const [selectedCategory, setSelectedCategory] = useState(product?.category || null);
  const [extraSubcategories, setExtraSubcategories] = useState([]);
  const [colorNames, setColorNames] = useState([]);
  const [colorImagesMap, setColorImagesMap] = useState({});
  const [colorInputVal, setColorInputVal] = useState('');
  const [colorUploading, setColorUploading] = useState(null);
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

  // Calculate profit margin
  const calculateMargin = () => {
    const price = form.getFieldValue('price');
    const costPrice = form.getFieldValue('cost_price');
    if (price && costPrice && costPrice > 0) {
      const margin = ((price - costPrice) / costPrice * 100).toFixed(1);
      setProfitMargin(margin);
    } else {
      setProfitMargin(null);
    }
  };

  useEffect(() => {
    if (product) {
      setSelectedCurrency(product.currency || businessCurrency);
      setSelectedCategory(product.category || null);

      // Distribute colors + images into per-color state
      const rawColors = product.colors || [];
      const allImages = Array.isArray(product.images) ? product.images : [];
      if (rawColors.length > 0 && typeof rawColors[0] === 'object') {
        // Object format [{name, imageCount}] — slice images per color
        const names = [];
        const map = {};
        let idx = 0;
        for (const c of rawColors) {
          const name = c.name || c.code || '';
          if (!name) continue;
          names.push(name);
          map[name] = allImages.slice(idx, idx + (c.imageCount || 0));
          idx += (c.imageCount || 0);
        }
        setColorNames(names);
        setColorImagesMap(map);
        setImages(allImages.slice(idx)); // any leftover without a color
      } else {
        // Simple strings or empty — no images distributed yet
        const names = rawColors.map(c => typeof c === 'string' ? c : (c.name || '')).filter(Boolean);
        setColorNames(names);
        setColorImagesMap(Object.fromEntries(names.map(n => [n, []])));
        setImages(allImages);
      }

      const plain = pickPlainProductForForm(product);
      const formValues = {
        ...plain,
        price: product.price != null ? parseFloat(product.price) : undefined,
        cost_price: product.cost_price != null ? parseFloat(product.cost_price) : undefined,
        original_price: product.original_price != null ? parseFloat(product.original_price) : undefined,
        stock_quantity: product.stock_quantity != null ? parseInt(product.stock_quantity, 10) : 0,
        min_stock_level: product.min_stock_level != null ? parseInt(product.min_stock_level, 10) : 0,
        weight: product.weight != null ? parseFloat(product.weight) : undefined,
      };

      setTimeout(() => {
        form.setFieldsValue(formValues);
        calculateMargin();
      }, 50);
    }
  }, [product, form, businessCurrency]);

  useEffect(() => {
    if (!isEditing && !product?.currency && businessCurrency) {
      setSelectedCurrency(businessCurrency);
      form.setFieldsValue({ currency: businessCurrency });
    }
  }, [businessCurrency, isEditing, product?.currency, form]);

  const handleSubmit = async (values) => {
    try {
      // Build colors [{name, imageCount}] and flat images array from per-color state
      const hasColors = colorNames.length > 0;
      const finalColors = hasColors
        ? colorNames.map(name => ({ name, imageCount: (colorImagesMap[name] || []).length }))
        : null;
      const finalImages = hasColors
        ? colorNames.flatMap(name => colorImagesMap[name] || [])
        : images;

      // Derive product-level price/cost from variant entries
      const variantList = values.variants || [];
      const variantPrices = variantList.map(v => v.price).filter(p => p != null && p > 0);
      const derivedPrice = variantPrices.length > 0
        ? Math.min(...variantPrices)
        : (product?.price ? parseFloat(product.price) : 0);
      const variantCosts = variantList.map(v => v.cost_price).filter(p => p != null && p > 0);
      const derivedCostPrice = variantCosts.length > 0
        ? Math.min(...variantCosts)
        : (product?.cost_price ? parseFloat(product.cost_price) : null);

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

      message.success(`Product ${isEditing ? 'updated' : 'created'} successfully!`);
    } catch {
      message.error(`Failed to ${isEditing ? 'update' : 'create'} product`);
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

  const handleColorImageUpload = useCallback(async (colorName, fileList) => {
    if (!fileList.length) return;
    setColorUploading(colorName);
    try {
      const formData = new FormData();
      fileList.forEach(f => formData.append('images', f));
      const response = await apiClient.post('/upload/images', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const urls = response.data.images.map(img => img.url);
      setColorImagesMap(prev => ({ ...prev, [colorName]: [...(prev[colorName] || []), ...urls] }));
      message.success(`${urls.length} photo${urls.length > 1 ? 's' : ''} added to ${colorName}`);
    } catch {
      message.error('Image upload failed');
    } finally {
      setColorUploading(null);
    }
  }, []);

  const removeColorImage = useCallback((colorName, index) => {
    setColorImagesMap(prev => ({
      ...prev,
      [colorName]: (prev[colorName] || []).filter((_, i) => i !== index),
    }));
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
      message.success(`Subcategory "${label}" created${parentValue ? ` under ${parentValue}` : ''}`);
    } catch {
      message.error('Failed to create subcategory');
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
      message.success('Subcategory removed');
    } catch {
      message.error('Failed to delete subcategory');
      throw new Error('deletion failed');
    }
  }, [selectedCategory]);

  const handleImageUpload = async (info) => {
    if (info.file.status === 'uploading') {
      setImageLoading(true);
      return;
    }
    if (info.file.status === 'done') {
      setImageLoading(false);
      setImageUrl(info.file.response.url);
      message.success('Image uploaded successfully!');
    } else if (info.file.status === 'error') {
      setImageLoading(false);
      message.error('Image upload failed');
    }
  };

  // Ref to prevent duplicate uploads when beforeUpload is called per file
  const uploadInProgressRef = useRef(false);

  const handleMultipleImagesUpload = async (fileList) => {
    // Prevent duplicate calls - beforeUpload fires for each file with full list
    if (uploadInProgressRef.current) return;
    if (fileList.length === 0) return;
    
    uploadInProgressRef.current = true;
    setImageLoading(true);
    
    try {
      const formData = new FormData();
      fileList.forEach(file => formData.append('images', file));
      const response = await apiClient.post('/upload/images', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      const newImages = response.data.images.map(img => img.url);
      setImages(prev => [...prev, ...newImages]);
      message.success(`${response.data.count} images uploaded!`);
    } catch (error) {
      console.error('Error uploading images:', error);
      message.error('Failed to upload images');
    } finally {
      setImageLoading(false);
      // Reset after a short delay to allow for next batch
      setTimeout(() => {
        uploadInProgressRef.current = false;
      }, 100);
    }
  };

  const removeImage = (indexToRemove) => {
    setImages(prev => prev.filter((_, i) => i !== indexToRemove));
    message.success('Image removed');
  };

  const uploadButton = (
    <div style={{ padding: 16, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
      {imageLoading ? <LoadingOutlined style={{ fontSize: 24 }} /> : <PlusOutlined style={{ fontSize: 24 }} />}
      <div style={{ marginTop: 8, fontSize: 14 }}>Upload</div>
    </div>
  );

  // ── Compute live variant stock for tab badge ────────────────────
  const watchedVariants = Form.useWatch('variants', form) || [];
  const liveStockSummary = useMemo(() => {
    const total = watchedVariants.reduce((sum, v) => sum + (v.quantity || 0), 0);
    const withStock = watchedVariants.filter(v => (v.quantity || 0) > 0);
    return { total, sizeCount: withStock.length, variantCount: watchedVariants.length };
  }, [watchedVariants]);

  // Auto-sync stock_quantity from variant totals
  useEffect(() => {
    if (watchedVariants.length > 0) {
      const total = watchedVariants.reduce((sum, v) => sum + (v.quantity || 0), 0);
      form.setFieldValue('stock_quantity', total);
    }
  }, [watchedVariants, form]);

  // Tab items — Product | Stock & Pricing
  const tabItems = [
    {
      key: 'product',
      label: <span className="flex items-center gap-1.5"><TagsOutlined /> Product</span>,
      children: (
        <div className="space-y-3 pt-1">
          {/* ── Identity ── */}
          <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400"><TagsOutlined /> Identity</p>
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
          <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400"><InfoCircleOutlined /> Details</p>
          <Row gutter={[8, 0]}>
            {fieldConfig.showGender && (
              <Col xs={12} md={8}>
                <Form.Item name="gender" label="Gender">
                  <Select placeholder="Gender" allowClear>
                    <Option value="Men">Men</Option>
                    <Option value="Women">Women</Option>
                    <Option value="Unisex">Unisex</Option>
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
              <Form.Item name="is_featured" label={<span>Featured <Tooltip title="Featured products appear in the shop landing page carousel"><InfoCircleOutlined className="text-slate-300" /></Tooltip></span>} valuePropName="checked">
                <Switch checkedChildren="Yes" unCheckedChildren="No" />
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
                    <BgColorsOutlined className="mr-1" />Color Options
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
                      placeholder="e.g., Black, Ocean Blue…"
                      size="small"
                      className="rounded-lg"
                    />
                    <Button
                      size="small"
                      onClick={() => { addColor(colorInputVal); setColorInputVal(''); }}
                      disabled={!colorInputVal.trim()}
                    >Add</Button>
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
                    <p className="text-xs text-slate-400">Add colors — you can then upload per-color photos in the Stock tab</p>
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
          <DollarOutlined /> Stock & Pricing
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
              <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400"><AppstoreOutlined /> Size & Stock Variants</p>
              <Form.Item name="variants" noStyle>
                <VariantTable currency={selectedCurrency} category={selectedCategory} />
              </Form.Item>
            </>
          )}

          {/* ── Simple Sizes ── */}
          {fieldConfig.showSizes && !fieldConfig.showVariants && (
            <>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Sizes</p>
              <Form.Item name="sizes" noStyle>
                <Select mode="tags" style={{ width: '100%' }} placeholder={fieldConfig.sizePlaceholder} tokenSeparators={[',', ' ']} />
              </Form.Item>
            </>
          )}

          <div className="h-px bg-slate-100" />

          {/* ── Inventory ── */}
          <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400"><InboxOutlined /> Inventory</p>
          <Row gutter={[8, 0]}>
            <Col xs={24} md={fieldConfig.showWeight ? 8 : 12}>
              <Form.Item
                name="stock_quantity"
                label="Total Stock"
                rules={[{ required: true, message: 'Required' }, { type: 'number', min: 0 }]}
                extra={liveStockSummary.variantCount > 0 ? `Synced from variants: ${liveStockSummary.total}` : undefined}
              >
                <InputNumber style={{ width: '100%' }} min={0} placeholder="0" disabled={liveStockSummary.variantCount > 0} />
              </Form.Item>
            </Col>
            <Col xs={24} md={fieldConfig.showWeight ? 8 : 12}>
              <Form.Item name="min_stock_level" label="Low Stock Alert">
                <InputNumber style={{ width: '100%' }} min={0} placeholder="5" />
              </Form.Item>
            </Col>
            {fieldConfig.showWeight && (
              <Col xs={24} md={8}>
                <Form.Item name="weight" label="Weight (kg)">
                  <InputNumber style={{ width: '100%' }} min={0} step={0.1} precision={2} placeholder="0.00" />
                </Form.Item>
              </Col>
            )}
          </Row>

          {/* ── Discount / Original Price ── */}
          <div className="h-px bg-slate-100" />
          <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400"><TagsOutlined /> Discount</p>
          <Row gutter={[8, 0]}>
            <Col xs={24} md={12}>
              <Form.Item
                name="original_price"
                label="Original Price (before discount)"
                extra="Set higher than the sale price to show a discount badge in the shop. Leave empty if no discount."
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

          {/* ── Main Image ── */}
          <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400"><PictureOutlined /> Main Image <span className="normal-case tracking-normal font-normal text-slate-300">— required to appear in carousel & hot deals</span></p>
          <div className="flex items-center gap-3">
            <Upload
              name="image"
              listType="picture-card"
              showUploadList={false}
              onChange={handleImageUpload}
              customRequest={async ({ file, onSuccess, onError, onProgress }) => {
                try {
                  const formData = new FormData();
                  formData.append('image', file);
                  const response = await apiClient.post('/upload/image', formData, {
                    headers: { 'Content-Type': 'multipart/form-data' },
                    onUploadProgress: ({ total, loaded }) => {
                      if (total) onProgress?.({ percent: Math.round((loaded / total) * 100) });
                    },
                  });
                  onSuccess?.(response.data);
                } catch (err) { onError?.(err); }
              }}
            >
              {imageUrl ? (
                <div className="w-20 h-20 overflow-hidden rounded-lg">
                  <img src={imageUrl} alt="main" className="w-full h-full object-cover" />
                </div>
              ) : (
                <div className="w-20 h-20 flex flex-col items-center justify-center border-2 border-dashed border-slate-200 rounded-lg">
                  {imageLoading ? <LoadingOutlined className="text-slate-400" /> : <PlusOutlined className="text-slate-400" />}
                  <span className="text-xs text-slate-400 mt-1">Upload</span>
                </div>
              )}
            </Upload>
            <p className="text-xs text-slate-400">800×800px · max 5 MB</p>
          </div>

          {/* ── Gallery / Color Images ── */}
          {colorNames.length > 0 ? (
            <>
              <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                <BgColorsOutlined /> Photos per Color
              </p>
              <div className="space-y-3">
                {colorNames.map(colorName => {
                  const colorImgs = colorImagesMap[colorName] || [];
                  const isUploading = colorUploading === colorName;
                  return (
                    <div key={colorName} className="rounded-lg border border-slate-100 bg-slate-50/40 p-3">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-xs font-semibold text-slate-700">{colorName}</span>
                        <span className="text-xs text-slate-400">({colorImgs.length} photo{colorImgs.length !== 1 ? 's' : ''})</span>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Upload
                          multiple
                          listType="picture-card"
                          showUploadList={false}
                          beforeUpload={(file, fileList) => { if (file === fileList[fileList.length - 1]) handleColorImageUpload(colorName, fileList); return false; }}
                          disabled={isUploading}
                        >
                          <div className="flex flex-col items-center justify-center w-14 h-14">
                            {isUploading ? <LoadingOutlined /> : <PlusOutlined />}
                            <span className="text-[10px] mt-1">Add</span>
                          </div>
                        </Upload>
                        {colorImgs.map((url, i) => (
                          <div key={i} className="relative w-14 h-14 flex-shrink-0">
                            <img src={url} alt={`${colorName}-${i + 1}`} className="w-full h-full object-cover rounded-lg border border-slate-100" />
                            <button
                              type="button"
                              onClick={() => removeColorImage(colorName, i)}
                              className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-red-500 text-white flex items-center justify-center hover:bg-red-600 transition-colors"
                              style={{ fontSize: 9 }}
                            >✕</button>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <>
              <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                <AppstoreOutlined /> Gallery <span className="ml-1 font-normal normal-case text-slate-300">{images.length}/10</span>
              </p>
              <div className="flex flex-wrap gap-2">
                <Upload
                  multiple
                  listType="picture-card"
                  showUploadList={false}
                  beforeUpload={(file, fileList) => {
                    if (images.length + fileList.length > 10) { message.error('Maximum 10 images'); return false; }
                    handleMultipleImagesUpload(fileList);
                    return false;
                  }}
                  disabled={imageLoading || images.length >= 10}
                >
                  {images.length < 10 && (
                    <div className="flex flex-col items-center justify-center w-16 h-16">
                      {imageLoading ? <LoadingOutlined /> : <PlusOutlined />}
                      <span className="text-xs mt-1">Add</span>
                    </div>
                  )}
                </Upload>
                {images.map((imgUrl, index) => (
                  <div key={index} className="relative w-16 h-16 flex-shrink-0">
                    <div className="w-full h-full overflow-hidden rounded-lg border border-slate-100">
                      <Image src={imgUrl} alt={`${index + 1}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} preview={{ mask: false }} />
                    </div>
                    <button
                      type="button"
                      onClick={() => removeImage(index)}
                      className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-red-500 text-white flex items-center justify-center hover:bg-red-600 transition-colors"
                      style={{ fontSize: 9 }}
                    >✕</button>
                  </div>
                ))}
              </div>
            </>
          )}
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
        price: product?.price ? parseFloat(product.price) : undefined,
        cost_price: product?.cost_price ? parseFloat(product.cost_price) : undefined,
        weight: product?.weight ? parseFloat(product.weight) : undefined,
        stock_quantity: product?.stock_quantity ? parseInt(product.stock_quantity, 10) : 0,
        min_stock_level: product?.min_stock_level ? parseInt(product.min_stock_level, 10) : 5,
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
        <Button onClick={onCancel} size="small">Cancel</Button>
        <Button
          type="primary"
          htmlType="submit"
          loading={loading}
          size="small"
          icon={isEditing ? <CheckCircleOutlined /> : <PlusOutlined />}
        >
          {isEditing ? 'Update Product' : '+ Create Product'}
        </Button>
      </div>
    </Form>
  );
};

export default ProductForm;
