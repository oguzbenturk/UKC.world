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
    showColors: false,
    showSizes: true,
    showVariants: true,
    showWeight: true,
    showCostPrice: true,
    sizePlaceholder: 'e.g., 7m, 9m, 10m, 12m or 133, 136, 139',
    sizeLabel: 'Available Sizes / Dimensions',
  },
  wingfoil: {
    showGender: false,
    showColors: false,
    showSizes: true,
    showVariants: true,
    showWeight: true,
    showCostPrice: true,
    sizePlaceholder: 'e.g., 3m, 4m, 5m, 6m or 80L, 100L, 120L',
    sizeLabel: 'Available Sizes / Volumes',
  },
  efoil: {
    showGender: false,
    showColors: false,
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
    showColors: false,
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
  const isEditing = !!product;

  // Derived field config based on selected category
  const fieldConfig = useMemo(() => getFieldConfig(selectedCategory), [selectedCategory]);

  // Track variant stock totals for badge & auto-sync
  const variantStockTotal = useMemo(() => {
    const variants = form.getFieldValue('variants') || [];
    return variants.reduce((sum, v) => sum + (v.quantity || 0), 0);
  }, [form]);

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
    return [...tree, ...extras];
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
          setExtraSubcategories(data.subcategories || []);
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
      setImages(product.images || []);
      setSelectedCurrency(product.currency || businessCurrency);
      setSelectedCategory(product.category || null);
      
      const formValues = {
        ...product,
        price: product.price != null ? parseFloat(product.price) : undefined,
        cost_price: product.cost_price != null ? parseFloat(product.cost_price) : undefined,
        stock_quantity: product.stock_quantity != null ? parseInt(product.stock_quantity) : 0,
        min_stock_level: product.min_stock_level != null ? parseInt(product.min_stock_level) : 0,
        weight: product.weight != null ? parseFloat(product.weight) : undefined,
        tags: product.tags || [],
        variants: product.variants || [],
        colors: product.colors || [],
        sizes: product.sizes || []
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
      const formattedValues = {
        ...values,
        currency: selectedCurrency,
        image_url: imageUrl,
        images: images,
        tags: Array.isArray(values.tags) ? values.tags : [],
        dimensions: values.dimensions || null,
        supplier_info: values.supplier_info || null,
        variants: values.variants || null,
        colors: values.colors || null,
        gender: values.gender || null,
        sizes: values.sizes || null,
        source_url: values.source_url || null
      };

      await onSubmit(formattedValues);
      
      if (!isEditing) {
        form.resetFields();
        setImageUrl(null);
        setImages([]);
      }
      
      message.success(`Product ${isEditing ? 'updated' : 'created'} successfully!`);
    } catch {
      message.error(`Failed to ${isEditing ? 'update' : 'create'} product`);
    }
  };

  const handleCategoryChange = useCallback((value) => {
    setSelectedCategory(value);
    form.setFieldValue('category', value);
    form.setFieldValue('subcategory', undefined);
    // Clear fields that may not apply to the new category
    const config = getFieldConfig(value);
    if (!config.showGender) form.setFieldValue('gender', undefined);
    if (!config.showColors) form.setFieldValue('colors', []);
  }, [form]);

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
                  onChange={handleCategoryChange}
                  onCreateNew={async (slug, label) => { message.info(`"${label}" will be saved with this product`); }}
                  createLabel="Create category"
                  createPlaceholder="e.g., Surfboards"
                />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item name="subcategory" label="Subcategory">
                <CreatableSelect
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
              <Form.Item name="is_featured" label="Featured" valuePropName="checked">
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
          {/* ── Pricing ── */}
          <div className="flex items-center gap-2">
            <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400"><DollarOutlined /> Pricing</p>
            {profitMargin && (
              <Tag className="ml-1" color={parseFloat(profitMargin) >= 30 ? 'success' : parseFloat(profitMargin) >= 15 ? 'warning' : 'error'}>
                {profitMargin}% margin
              </Tag>
            )}
          </div>
          <Row gutter={[8, 0]}>
            <Col xs={24} md={fieldConfig.showCostPrice ? 8 : 12}>
              <Form.Item name="currency" label="Currency">
                <CurrencySelector value={selectedCurrency} onChange={setSelectedCurrency} />
              </Form.Item>
            </Col>
            <Col xs={24} md={fieldConfig.showCostPrice ? 8 : 12}>
              <Form.Item name="price" label="Selling Price" rules={[{ required: true, message: 'Required' }, { type: 'number', min: 0.01 }]}>
                <InputNumber style={{ width: '100%' }} min={0} step={0.01} precision={2} prefix={getCurrencySymbol(selectedCurrency)} placeholder="0.00" onChange={calculateMargin} />
              </Form.Item>
            </Col>
            {fieldConfig.showCostPrice && (
              <Col xs={24} md={8}>
                <Form.Item name="cost_price" label="Cost Price">
                  <InputNumber style={{ width: '100%' }} min={0} step={0.01} precision={2} prefix={getCurrencySymbol(selectedCurrency)} placeholder="0.00" onChange={calculateMargin} />
                </Form.Item>
              </Col>
            )}
          </Row>

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

          {/* ── Colors ── */}
          {fieldConfig.showColors && (
            <>
              <div className="h-px bg-slate-100" />
              <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400"><BgColorsOutlined /> Colors</p>
              <Form.Item name="colors" noStyle>
                <ColorTable />
              </Form.Item>
            </>
          )}

          <div className="h-px bg-slate-100" />

          {/* ── Main Image ── */}
          <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400"><PictureOutlined /> Main Image</p>
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

          {/* ── Gallery ── */}
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
        ...product,
        price: product?.price ? parseFloat(product.price) : undefined,
        cost_price: product?.cost_price ? parseFloat(product.cost_price) : undefined,
        weight: product?.weight ? parseFloat(product.weight) : undefined,
        stock_quantity: product?.stock_quantity ? parseInt(product.stock_quantity) : 0,
        min_stock_level: product?.min_stock_level ? parseInt(product.min_stock_level) : 5,
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
