// src/features/products/components/ProductForm.jsx
// Modern redesigned form for creating and editing products

import React, { useState, useEffect, useRef } from 'react';
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
  Tooltip
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
  SettingOutlined,
  BgColorsOutlined,
  LinkOutlined,
  StarOutlined,
  CheckCircleOutlined
} from '@ant-design/icons';
import { useCurrency } from '@/shared/contexts/CurrencyContext';
import CurrencySelector from '@/shared/components/ui/CurrencySelector';
import apiClient from '@/shared/services/apiClient';
import VariantTable from './VariantTable';
import ColorTable from './ColorTable';
import { getHierarchicalSubcategories, hasSubcategories } from '@/shared/constants/productCategories';

const { Option } = Select;
const { TextArea } = Input;
const { Title, Text } = Typography;

const PRODUCT_CATEGORIES = [
  { value: 'kites', label: 'Kites', color: '#f50' },
  { value: 'boards', label: 'Boards (Kite)', color: '#2db7f5' },
  { value: 'wing-foil', label: 'Wing Foil', color: '#9254de' },
  { value: 'e-foil', label: 'E-Foil', color: '#fadb14' },
  { value: 'harnesses', label: 'Harnesses', color: '#87d068' },
  { value: 'wetsuits', label: 'Wetsuits', color: '#108ee9' },
  { value: 'bars', label: 'Bars & Lines', color: '#13c2c2' },
  { value: 'equipment', label: 'Equipment', color: '#faad14' },
  { value: 'accessories', label: 'Accessories', color: '#722ed1' },
  { value: 'apparel', label: 'Apparel', color: '#eb2f96' },
  { value: 'safety', label: 'Safety Gear', color: '#fa541c' },
  { value: 'spare-parts', label: 'Spare Parts', color: '#595959' },
  { value: 'other', label: 'Other / Second-Hand', color: '#8c8c8c' }
];

const PRODUCT_STATUS = [
  { value: 'active', label: 'Active', color: 'success' },
  { value: 'inactive', label: 'Inactive', color: 'warning' },
  { value: 'discontinued', label: 'Discontinued', color: 'error' }
];

const BRANDS = ['Duotone', 'ION', 'North', 'Core', 'Cabrinha', 'Mystic', 'Dakine', 'F-One', 'Ozone', 'Slingshot'];

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
  const [activeTab, setActiveTab] = useState('basic');
  const [profitMargin, setProfitMargin] = useState(null);
  const [selectedCategory, setSelectedCategory] = useState(product?.category || null);
  const isEditing = !!product;

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

  // Tab items configuration
  const tabItems = [
    {
      key: 'basic',
      label: (
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <InfoCircleOutlined />
          Basic Info
        </span>
      ),
      children: (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {/* Product Identity Card */}
          <Card 
            size="small" 
            title={<span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><TagsOutlined /> Product Identity</span>}
            styles={{ body: { padding: 20 } }}
          >
            <Row gutter={[16, 16]}>
              <Col xs={24} md={16}>
                <Form.Item
                  name="name"
                  label="Product Name"
                  rules={[
                    { required: true, message: 'Please enter product name' },
                    { min: 2, message: 'Name must be at least 2 characters' }
                  ]}
                >
                  <Input 
                    placeholder="e.g., Duotone Rebel D/LAB 2026" 
                    size="large"
                    style={{ fontWeight: 500 }}
                  />
                </Form.Item>
              </Col>
              <Col xs={24} md={8}>
                <Form.Item
                  name="sku"
                  label={
                    <span>
                      SKU 
                      <Tooltip title="Stock Keeping Unit - auto-generated if empty">
                        <InfoCircleOutlined style={{ marginLeft: 4, color: '#999' }} />
                      </Tooltip>
                    </span>
                  }
                >
                  <Input placeholder="Auto-generated" size="large" />
                </Form.Item>
              </Col>
            </Row>

            <Row gutter={[16, 16]}>
              <Col xs={24} md={8}>
                <Form.Item
                  name="category"
                  label="Category"
                  rules={[{ required: true, message: 'Please select a category' }]}
                >
                  <Select 
                    placeholder="Select category" 
                    size="large"
                    onChange={(value) => {
                      setSelectedCategory(value);
                      // Reset subcategory when category changes
                      form.setFieldValue('subcategory', undefined);
                    }}
                  >
                    {PRODUCT_CATEGORIES.map(cat => (
                      <Option key={cat.value} value={cat.value}>
                        <Tag color={cat.color}>{cat.label}</Tag>
                      </Option>
                    ))}
                  </Select>
                </Form.Item>
              </Col>
              <Col xs={24} md={8}>
                <Form.Item 
                  name="subcategory" 
                  label="Subcategory"
                  tooltip={selectedCategory && hasSubcategories(selectedCategory) ? "Select product type" : "Select a category first"}
                >
                  <Select 
                    placeholder={selectedCategory ? "Select subcategory" : "Select category first"}
                    size="large"
                    allowClear
                    disabled={!selectedCategory || !hasSubcategories(selectedCategory)}
                  >
                    {selectedCategory && hasSubcategories(selectedCategory) && 
                      getHierarchicalSubcategories(selectedCategory).map((parent) => (
                        <React.Fragment key={parent.value}>
                          {/* Parent option */}
                          <Option value={parent.value} style={{ fontWeight: 600 }}>
                            {parent.label}
                          </Option>
                          {/* Child options (indented) */}
                          {parent.children && parent.children.map((child) => (
                            <Option key={child.value} value={child.value}>
                              <span style={{ paddingLeft: 16 }}>↳ {child.label}</span>
                            </Option>
                          ))}
                        </React.Fragment>
                      ))
                    }
                  </Select>
                </Form.Item>
              </Col>
            </Row>

            <Row gutter={[16, 16]}>
              <Col xs={24} md={8}>
                <Form.Item name="brand" label="Brand">
                  <Select 
                    placeholder="Select or type brand" 
                    size="large"
                    showSearch
                    allowClear
                  >
                    {BRANDS.map(brand => (
                      <Option key={brand} value={brand}>{brand}</Option>
                    ))}
                  </Select>
                </Form.Item>
              </Col>
              <Col xs={24} md={8}>
                <Form.Item name="gender" label="Gender">
                  <Select placeholder="Select gender" size="large" allowClear>
                    <Option value="Men">👨 Men</Option>
                    <Option value="Women">👩 Women</Option>
                    <Option value="Unisex">👥 Unisex</Option>
                  </Select>
                </Form.Item>
              </Col>
            </Row>

            <Form.Item name="description" label="Description">
              <TextArea 
                rows={3} 
                placeholder="Detailed product description..."
                showCount
                maxLength={1000}
              />
            </Form.Item>

            <Form.Item name="tags" label="Tags">
              <Select
                mode="tags"
                placeholder="Add tags (press Enter after each)"
                tokenSeparators={[',']}
                suffixIcon={<TagsOutlined />}
              />
            </Form.Item>
          </Card>

          {/* Status Card */}
          <Card 
            size="small" 
            title={<span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><SettingOutlined /> Status & Visibility</span>}
            styles={{ body: { padding: 20 } }}
          >
            <Row gutter={[24, 16]} align="middle">
              <Col xs={24} md={8}>
                <Form.Item name="status" label="Status" rules={[{ required: true }]}>
                  <Select size="large">
                    {PRODUCT_STATUS.map(s => (
                      <Option key={s.value} value={s.value}>
                        <Badge status={s.color} text={s.label} />
                      </Option>
                    ))}
                  </Select>
                </Form.Item>
              </Col>
              <Col xs={24} md={8}>
                <Form.Item 
                  name="is_featured" 
                  label="Featured Product" 
                  valuePropName="checked"
                >
                  <Switch 
                    checkedChildren={<><StarOutlined /> Featured</>}
                    unCheckedChildren="Not Featured"
                  />
                </Form.Item>
              </Col>
              <Col xs={24} md={8}>
                <Form.Item 
                  name="source_url" 
                  label={
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <LinkOutlined /> Source URL
                    </span>
                  }
                >
                  <Input placeholder="https://..." />
                </Form.Item>
              </Col>
            </Row>
          </Card>
        </div>
      )
    },
    {
      key: 'pricing',
      label: (
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <DollarOutlined />
          Pricing & Stock
        </span>
      ),
      children: (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {/* Pricing Card */}
          <Card 
            size="small" 
            title={<span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><DollarOutlined /> Pricing</span>}
            styles={{ body: { padding: 20 } }}
            extra={
              profitMargin && (
                <Tag color={parseFloat(profitMargin) >= 30 ? 'success' : parseFloat(profitMargin) >= 15 ? 'warning' : 'error'}>
                  Margin: {profitMargin}%
                </Tag>
              )
            }
          >
            <Row gutter={[16, 16]}>
              <Col xs={24} md={8}>
                <Form.Item name="currency" label="Currency">
                  <CurrencySelector 
                    value={selectedCurrency}
                    onChange={setSelectedCurrency}
                  />
                </Form.Item>
              </Col>
              <Col xs={24} md={8}>
                <Form.Item
                  name="price"
                  label="Selling Price"
                  rules={[
                    { required: true, message: 'Required' },
                    { type: 'number', min: 0.01, message: 'Must be > 0' }
                  ]}
                >
                  <InputNumber 
                    style={{ width: '100%' }}
                    size="large"
                    min={0}
                    step={0.01}
                    precision={2}
                    prefix={getCurrencySymbol(selectedCurrency)}
                    placeholder="0.00"
                    onChange={calculateMargin}
                  />
                </Form.Item>
              </Col>
              <Col xs={24} md={8}>
                <Form.Item name="cost_price" label="Cost Price">
                  <InputNumber 
                    style={{ width: '100%' }}
                    size="large"
                    min={0}
                    step={0.01}
                    precision={2}
                    prefix={getCurrencySymbol(selectedCurrency)}
                    placeholder="0.00"
                    onChange={calculateMargin}
                  />
                </Form.Item>
              </Col>
            </Row>
          </Card>

          {/* Stock Card */}
          <Card 
            size="small" 
            title={<span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><AppstoreOutlined /> Inventory</span>}
            styles={{ body: { padding: 20 } }}
          >
            <Row gutter={[16, 16]}>
              <Col xs={24} md={8}>
                <Form.Item
                  name="stock_quantity"
                  label="Stock Quantity"
                  rules={[
                    { required: true, message: 'Required' },
                    { type: 'number', min: 0, message: 'Must be >= 0' }
                  ]}
                >
                  <InputNumber 
                    style={{ width: '100%' }}
                    size="large"
                    min={0}
                    placeholder="0"
                  />
                </Form.Item>
              </Col>
              <Col xs={24} md={8}>
                <Form.Item
                  name="min_stock_level"
                  label={
                    <span>
                      Low Stock Alert
                      <Tooltip title="Alert when stock drops below this level">
                        <InfoCircleOutlined style={{ marginLeft: 4, color: '#999' }} />
                      </Tooltip>
                    </span>
                  }
                >
                  <InputNumber 
                    style={{ width: '100%' }}
                    size="large"
                    min={0}
                    placeholder="5"
                  />
                </Form.Item>
              </Col>
              <Col xs={24} md={8}>
                <Form.Item name="weight" label="Weight (kg)">
                  <InputNumber 
                    style={{ width: '100%' }}
                    size="large"
                    min={0}
                    step={0.1}
                    precision={2}
                    placeholder="0.00"
                  />
                </Form.Item>
              </Col>
            </Row>
          </Card>
        </div>
      )
    },
    {
      key: 'variants',
      label: (
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <AppstoreOutlined />
          Variants
        </span>
      ),
      children: (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {/* Size Variants Card */}
          <Card 
            size="small" 
            title={
              <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <AppstoreOutlined /> Size & Price Variants
              </span>
            }
            styles={{ body: { padding: 20 } }}
            extra={
              <Text type="secondary" style={{ fontSize: 12 }}>
                Different sizes can have different prices
              </Text>
            }
          >
            <Form.Item name="variants">
              <VariantTable currency={selectedCurrency} />
            </Form.Item>
          </Card>

          {/* Simple Sizes Card */}
          <Card 
            size="small" 
            title="Quick Size List"
            styles={{ body: { padding: 20 } }}
            extra={
              <Text type="secondary" style={{ fontSize: 12 }}>
                For products with same price across sizes
              </Text>
            }
          >
            <Form.Item 
              name="sizes" 
              label="Available Sizes"
              extra="Press Enter after each size"
            >
              <Select
                mode="tags"
                style={{ width: '100%' }}
                placeholder="e.g., 133, 136, 139 or S, M, L, XL"
                tokenSeparators={[',', ' ']}
                size="large"
              />
            </Form.Item>
          </Card>

          {/* Color Options Card */}
          <Card 
            size="small" 
            title={
              <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <BgColorsOutlined /> Color Options
              </span>
            }
            styles={{ body: { padding: 20 } }}
          >
            <Form.Item name="colors">
              <ColorTable />
            </Form.Item>
          </Card>
        </div>
      )
    },
    {
      key: 'images',
      label: (
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <PictureOutlined />
          Images
          {(imageUrl || images.length > 0) && (
            <Badge count={images.length + (imageUrl ? 1 : 0)} size="small" />
          )}
        </span>
      ),
      children: (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {/* Main Image Card */}
          <Card 
            size="small" 
            title={
              <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <PictureOutlined /> Main Product Image
              </span>
            }
            styles={{ body: { padding: 20 } }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 24 }}>
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
                      }
                    });
                    onSuccess?.(response.data);
                  } catch (err) {
                    onError?.(err);
                  }
                }}
              >
                {imageUrl ? (
                  <div style={{ position: 'relative', width: 128, height: 128, overflow: 'hidden', borderRadius: 8 }}>
                    <img 
                      src={imageUrl} 
                      alt="main" 
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                  </div>
                ) : (
                  <div style={{ 
                    width: 128, 
                    height: 128, 
                    display: 'flex', 
                    flexDirection: 'column', 
                    alignItems: 'center', 
                    justifyContent: 'center',
                    border: '2px dashed #d9d9d9',
                    borderRadius: 8
                  }}>
                    {imageLoading ? <LoadingOutlined style={{ fontSize: 24 }} /> : <PlusOutlined style={{ fontSize: 24, color: '#999' }} />}
                    <span style={{ marginTop: 8, fontSize: 14, color: '#666' }}>Upload</span>
                  </div>
                )}
              </Upload>
              <div style={{ flex: 1 }}>
                <Title level={5} style={{ marginBottom: 8 }}>Primary Display Image</Title>
                <Text type="secondary" style={{ fontSize: 14 }}>
                  This image appears in product listings and as the main image on the product page.
                  Recommended size: 800x800px, max 5MB.
                </Text>
              </div>
            </div>
          </Card>

          {/* Gallery Card */}
          <Card 
            size="small" 
            title={
              <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <AppstoreOutlined /> Product Gallery
                <Tag>{images.length}/10</Tag>
              </span>
            }
            styles={{ body: { padding: 20 } }}
          >
            <Upload
              multiple
              listType="picture-card"
              showUploadList={false}
              beforeUpload={(file, fileList) => {
                if (images.length + fileList.length > 10) {
                  message.error('Maximum 10 images allowed');
                  return false;
                }
                handleMultipleImagesUpload(fileList);
                return false;
              }}
              disabled={imageLoading || images.length >= 10}
            >
              {images.length < 10 && uploadButton}
            </Upload>

            {images.length > 0 && (
              <Row gutter={[12, 12]} style={{ marginTop: 16 }}>
                {images.map((imgUrl, index) => (
                  <Col key={index} xs={12} sm={8} md={6} lg={4}>
                    <div style={{ position: 'relative' }}>
                      <div style={{ 
                        aspectRatio: '1/1', 
                        overflow: 'hidden', 
                        borderRadius: 8, 
                        border: '1px solid #f0f0f0' 
                      }}>
                        <Image
                          src={imgUrl}
                          alt={`Product ${index + 1}`}
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                          preview={{ mask: 'Preview' }}
                        />
                      </div>
                      <Button
                        type="primary"
                        danger
                        size="small"
                        icon={<DeleteOutlined />}
                        style={{ 
                          position: 'absolute', 
                          top: -8, 
                          right: -8,
                          borderRadius: '50%',
                          width: 24,
                          height: 24,
                          padding: 0,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center'
                        }}
                        onClick={() => removeImage(index)}
                      />
                      <div style={{ 
                        position: 'absolute', 
                        bottom: 4, 
                        left: 4, 
                        background: 'rgba(0,0,0,0.6)', 
                        color: 'white', 
                        fontSize: 11, 
                        padding: '2px 6px', 
                        borderRadius: 4 
                      }}>
                        {index + 1}
                      </div>
                    </div>
                  </Col>
                ))}
              </Row>
            )}

            {images.length === 0 && (
              <div style={{ textAlign: 'center', padding: '32px 0', color: '#999' }}>
                <PictureOutlined style={{ fontSize: 48, marginBottom: 8 }} />
                <div>No gallery images uploaded yet</div>
              </div>
            )}
          </Card>
        </div>
      )
    }
  ];

  return (
    <Form
      form={form}
      layout="vertical"
      onFinish={handleSubmit}
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
        min_stock_level: product?.min_stock_level ? parseInt(product.min_stock_level) : 5
      }}
    >
      <Tabs 
        activeKey={activeTab}
        onChange={setActiveTab}
        items={tabItems}
        style={{ marginBottom: 0 }}
        tabBarStyle={{ marginBottom: 24 }}
      />

      {/* Footer Actions */}
      <div style={{ 
        position: 'sticky', 
        bottom: 0, 
        background: '#fff', 
        borderTop: '1px solid #f0f0f0', 
        padding: '16px 0',
        marginTop: 24,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between'
      }}>
        <div>
          {isEditing && (
            <Text type="secondary" style={{ fontSize: 14 }}>
              <CheckCircleOutlined style={{ marginRight: 4 }} />
              Editing: {product.name}
            </Text>
          )}
        </div>
        <Space>
          <Button onClick={onCancel} size="large">
            Cancel
          </Button>
          <Button 
            type="primary" 
            htmlType="submit" 
            loading={loading}
            size="large"
            icon={isEditing ? <CheckCircleOutlined /> : <PlusOutlined />}
          >
            {isEditing ? 'Update Product' : 'Create Product'}
          </Button>
        </Space>
      </div>
    </Form>
  );
};

export default ProductForm;
