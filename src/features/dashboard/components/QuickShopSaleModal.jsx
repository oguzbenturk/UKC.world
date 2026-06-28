/**
 * QuickShopSaleModal - Quick shop sale form for Front Desk dashboard
 * Allows making a shop sale: select customer -> select product -> process sale
 */
import { useState, useEffect, useMemo } from 'react';
import {
  Modal,
  Form,
  Select,
  InputNumber,
  Button,
  Row,
  Col,
  Space,
  Divider,
  Card,
  Spin,
  Typography,
  Alert
} from 'antd';
import { message } from '@/shared/utils/antdStatic';
import {
  ShoppingCartOutlined,
  UserOutlined,
  TagOutlined,
  DollarOutlined
} from '@ant-design/icons';
import apiClient from '@/shared/services/apiClient';
import { useCurrency } from '@/shared/contexts/CurrencyContext';
import {
  buildVariantIndex,
  buildSizeOptions,
  sizeOptionsFor,
  resolveCombo,
} from '@/features/products/utils/variantSelection';

const { Option } = Select;
const { Text } = Typography;

function QuickShopSaleModal({ open, onClose, onSuccess, prefilledCustomerId = null }) {
  const [form] = Form.useForm();
  const { formatCurrency } = useCurrency();
  
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [customers, setCustomers] = useState([]);
  const [products, setProducts] = useState([]);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [quantity, setQuantity] = useState(1);
  const [discountPercent, setDiscountPercent] = useState(0);
  const [selectedColor, setSelectedColor] = useState(null);
  const [selectedSize, setSelectedSize] = useState(null);

  // Colour×size variant model for the chosen product
  const variantIndex = useMemo(
    () => (selectedProduct ? buildVariantIndex(selectedProduct) : { isMatrix: false, variants: [], colors: [] }),
    [selectedProduct],
  );
  const legacySizeOptions = useMemo(
    () => (selectedProduct && !variantIndex.isMatrix ? buildSizeOptions(selectedProduct) : []),
    [selectedProduct, variantIndex.isMatrix],
  );
  const sizeOptions = useMemo(
    () => sizeOptionsFor({ isMatrix: variantIndex.isMatrix, variants: variantIndex.variants, sizeOptions: legacySizeOptions, color: selectedColor }),
    [variantIndex, legacySizeOptions, selectedColor],
  );
  const combo = useMemo(
    () => resolveCombo({ isMatrix: variantIndex.isMatrix, variants: variantIndex.variants, sizeOptions: legacySizeOptions, color: selectedColor, size: selectedSize }),
    [variantIndex, legacySizeOptions, selectedColor, selectedSize],
  );
  const hasColors = variantIndex.colors.length > 0;
  const needsSize = variantIndex.isMatrix ? variantIndex.variants.length > 0 : legacySizeOptions.length > 0;
  const effectivePrice = (combo.price != null ? combo.price : selectedProduct?.price) || 0;
  const effectiveStock = combo.stock != null
    ? combo.stock
    : (selectedProduct?.stock_quantity ?? selectedProduct?.stock ?? 0);

  // Clamp quantity if the chosen combo has less stock than currently entered.
  useEffect(() => {
    if (combo.stock != null && quantity > combo.stock) {
      setQuantity(Math.max(1, combo.stock));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [combo.stock]);

  // Fetch customers
  useEffect(() => {
    if (open) {
      fetchCustomers();
      fetchProducts();
    }
  }, [open]);

  // Pre-fill customer when opened from a customer profile
  useEffect(() => {
    if (open && prefilledCustomerId) {
      form.setFieldsValue({ customer_id: prefilledCustomerId });
    }
  }, [open, prefilledCustomerId, form]);

  const fetchCustomers = async () => {
    try {
      setLoading(true);
      // Load ALL users - staff and customers can all buy from shop
      const response = await apiClient.get('/users');
      setCustomers(response.data || []);
    } catch (error) {
      console.error('Error fetching customers:', error);
      message.error('Failed to load customers');
    } finally {
      setLoading(false);
    }
  };

  const fetchProducts = async () => {
    try {
      setLoading(true);
      // Try shop/products endpoint first, fallback to products
      let response;
      try {
        response = await apiClient.get('/shop/products');
      } catch {
        // Fallback to alternative endpoint
        response = await apiClient.get('/products');
      }
      // API returns { data: [...], pagination: {...} } - extract the products array
      const responseData = response.data || response || {};
      const productsArray = Array.isArray(responseData) 
        ? responseData 
        : (responseData.data || responseData.products || []);
      setProducts(productsArray);
    } catch (error) {
      console.error('Error fetching products:', error);
      message.error('Failed to load products');
      setProducts([]); // Ensure products is always an array
    } finally {
      setLoading(false);
    }
  };

  const handleProductChange = (productId) => {
    const product = products.find(p => p.id === productId);
    setSelectedProduct(product);
    setQuantity(1);

    // Auto-pick the only colour, then the only size that colour carries.
    const idx = product ? buildVariantIndex(product) : { isMatrix: false, variants: [], colors: [] };
    const initColor = idx.colors.length === 1 ? idx.colors[0] : null;
    setSelectedColor(initColor);
    let initSize = null;
    if (!idx.isMatrix) {
      const so = product ? buildSizeOptions(product) : [];
      if (so.length === 1) initSize = so[0].label;
    } else if (initColor) {
      const sizes = idx.variants.filter(v => v.color === initColor).map(v => v.size || v.label);
      if (sizes.length === 1) initSize = sizes[0];
    }
    setSelectedSize(initSize);
  };

  const handleColorChange = (color) => {
    setSelectedColor(color);
    if (variantIndex.isMatrix) {
      const sizes = variantIndex.variants.filter(v => v.color === color).map(v => v.size || v.label);
      setSelectedSize(prev => (prev && sizes.includes(prev) ? prev : (sizes.length === 1 ? sizes[0] : null)));
    }
  };

  const handleQuantityChange = (value) => {
    setQuantity(value || 1);
  };

  const calculateSubtotal = () => {
    if (!selectedProduct) return 0;
    return effectivePrice * quantity;
  };

  const calculateDiscountAmount = () => {
    const pct = Math.max(0, Math.min(100, Number(discountPercent) || 0));
    return Math.round(calculateSubtotal() * pct) / 100;
  };

  const calculateTotal = () => Math.max(0, calculateSubtotal() - calculateDiscountAmount());

  const handleSubmit = async (values) => {
    // A product with colours / sizes must have the combination chosen so the
    // right per-combo stock is decremented and the right price is charged.
    if (hasColors && !selectedColor) {
      message.warning('Please select a color');
      return;
    }
    if (needsSize && !selectedSize) {
      message.warning('Please select a size');
      return;
    }
    try {
      setSubmitting(true);

      // Create shop order via admin quick-sale endpoint. The discount is applied
      // atomically server-side (inside the order transaction), so a discounted
      // sale can never end up at full price from a failed second call. Only
      // meaningful for a registered customer.
      const pct = Math.max(0, Math.min(100, Number(discountPercent) || 0));
      const orderData = {
        user_id: values.customer_id || null, // null for walk-in customers
        items: [
          {
            product_id: values.product_id,
            quantity: quantity,
            price: effectivePrice,
            selected_size: selectedSize || undefined,
            selected_color: selectedColor || undefined
          }
        ],
        payment_method: values.payment_method || 'cash',
        notes: values.notes || '',
        discount_percent: pct > 0 && values.customer_id ? pct : undefined,
        discount_reason: pct > 0 ? 'Quick sale discount' : undefined,
      };

      await apiClient.post('/shop/orders/admin/quick-sale', orderData);

      form.resetFields();
      setSelectedProduct(null);
      setQuantity(1);
      setDiscountPercent(0);
      setSelectedColor(null);
      setSelectedSize(null);

      if (onSuccess) {
        onSuccess();
      }

      message.success('Sale completed successfully!');

      onClose();
    } catch (error) {
      console.error('Error creating sale:', error);
      message.error(error.response?.data?.message || 'Failed to complete sale');
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    form.resetFields();
    setSelectedProduct(null);
    setQuantity(1);
    setDiscountPercent(0);
    setSelectedColor(null);
    setSelectedSize(null);
    onClose();
  };

  return (
    <Modal
      title={
        <Space>
          <ShoppingCartOutlined style={{ color: '#ec4899' }} />
          <span>Quick Shop Sale</span>
        </Space>
      }
      open={open}
      onCancel={handleClose}
      footer={null}
      width={600}
      destroyOnHidden
    >
      <Spin spinning={loading}>
        <Form
          form={form}
          layout="vertical"
          onFinish={handleSubmit}
          className="mt-4"
        >
          {/* Customer Selection */}
          <Card 
            size="small" 
            className="mb-4 bg-blue-50/50 border-blue-200"
          >
            <Form.Item
              name="customer_id"
              label={
                <Space>
                  <UserOutlined />
                  <Text strong>Select Customer</Text>
                </Space>
              }
              rules={[{ required: true, message: 'Please select a customer' }]}
              className="mb-0"
            >
              <Select
                showSearch
                placeholder="Search by name, email or phone..."
                optionFilterProp="label"
                filterOption={(input, option) => {
                  const haystack = (option?.searchText || option?.label || '').toString().toLowerCase();
                  return haystack.includes(input.toLowerCase());
                }}
                size="large"
                allowClear
                options={(customers || []).map((customer) => {
                  const fullName = `${customer.first_name || ''} ${customer.last_name || ''}`.trim() || 'Unnamed';
                  const email = customer.email || '';
                  const phone = customer.phone || '';
                  return {
                    value: customer.id,
                    label: email ? `${fullName} (${email})` : fullName,
                    searchText: `${fullName} ${email} ${phone}`,
                  };
                })}
              />
            </Form.Item>
          </Card>

          {/* Product Selection */}
          <Card 
            size="small" 
            className="mb-4 bg-pink-50/50 border-pink-200"
          >
            <Form.Item
              name="product_id"
              label={
                <Space>
                  <TagOutlined />
                  <Text strong>Select Product</Text>
                </Space>
              }
              rules={[{ required: true, message: 'Please select a product' }]}
              className="mb-3"
            >
              <Select
                showSearch
                placeholder="Search for product..."
                optionFilterProp="label"
                onChange={handleProductChange}
                filterOption={(input, option) => {
                  const label = option?.label || '';
                  const searchText = typeof label === 'string' ? label : '';
                  return searchText.toLowerCase().includes(input.toLowerCase());
                }}
                size="large"
                options={(products || []).map((product) => ({
                  value: product.id,
                  label: `${product.name} - ${formatCurrency(product.price)} (Stock: ${product.stock_quantity ?? product.stock ?? 0})`,
                }))}
              />
            </Form.Item>

            {selectedProduct && (
              <>
                <Divider className="my-3" />

                {/* Colour / Size pickers — pick the colour first; for a
                    colour×size product the sizes depend on the chosen colour. */}
                {(hasColors || needsSize) && (
                  <Row gutter={16} className="mb-3">
                    {hasColors && (
                      <Col span={12}>
                        <div className="text-sm text-slate-600 mb-1">
                          Color <span className="text-red-400">*</span>
                        </div>
                        <Select
                          size="large"
                          className="w-full"
                          placeholder="Select color"
                          value={selectedColor}
                          status={!selectedColor ? 'warning' : undefined}
                          onChange={handleColorChange}
                          options={variantIndex.colors.map(c => ({ value: c, label: c }))}
                        />
                      </Col>
                    )}
                    {needsSize && (
                      <Col span={12}>
                        <div className="text-sm text-slate-600 mb-1">
                          Size <span className="text-red-400">*</span>
                        </div>
                        <Select
                          size="large"
                          className="w-full"
                          placeholder={variantIndex.isMatrix && !selectedColor ? 'Pick color first' : 'Select size'}
                          disabled={variantIndex.isMatrix && !selectedColor}
                          value={selectedSize}
                          status={!selectedSize ? 'warning' : undefined}
                          onChange={setSelectedSize}
                          options={sizeOptions.map(o => ({
                            value: o.label,
                            label: o.stock != null ? `${o.label} · ${o.stock} in stock` : o.label,
                            disabled: o.stock === 0,
                          }))}
                        />
                      </Col>
                    )}
                  </Row>
                )}

                <Row gutter={16}>
                  <Col span={12}>
                    <div className="text-sm text-slate-600 mb-1">Quantity</div>
                    <InputNumber
                      min={1}
                      max={effectiveStock || 999}
                      value={quantity}
                      onChange={handleQuantityChange}
                      size="large"
                      className="w-full"
                    />
                  </Col>
                  <Col span={12}>
                    <div className="text-sm text-slate-600 mb-1">Available Stock</div>
                    <div className="text-lg font-semibold text-slate-800 mt-2">
                      {effectiveStock} units
                    </div>
                  </Col>
                </Row>
              </>
            )}
          </Card>

          {/* Payment Method */}
          <Form.Item
            name="payment_method"
            label="Payment Method"
            initialValue="wallet"
          >
            <Select size="large">
              <Option value="wallet">Wallet (Recommended)</Option>
              <Option value="cash">Cash</Option>
              <Option value="card">Card</Option>
              <Option value="bank_transfer">Bank Transfer</Option>
            </Select>
          </Form.Item>

          {/* Discount */}
          {selectedProduct && (
            <Form.Item label="Discount (%)" className="mb-4">
              <InputNumber
                min={0}
                max={100}
                value={discountPercent}
                onChange={(v) => setDiscountPercent(v || 0)}
                size="large"
                className="w-full"
                addonAfter="%"
              />
            </Form.Item>
          )}

          {/* Total Display */}
          {selectedProduct && (
            <Card
              className="mb-4 bg-gradient-to-r from-emerald-50 to-green-50 border-emerald-200"
            >
              <div className="flex justify-between items-center">
                <Space>
                  <DollarOutlined style={{ fontSize: '20px', color: '#10b981' }} />
                  <Text strong className="text-lg">Total Amount</Text>
                </Space>
                <div className="text-right">
                  {discountPercent > 0 && (
                    <div className="text-sm text-slate-400 line-through">
                      {formatCurrency(calculateSubtotal())}
                    </div>
                  )}
                  <Text strong className="text-2xl text-emerald-600">
                    {formatCurrency(calculateTotal())}
                  </Text>
                </div>
              </div>
              <div className="mt-2 text-sm text-slate-600">
                {quantity} × {formatCurrency(effectivePrice)}
                {discountPercent > 0 && (
                  <> &nbsp;·&nbsp; −{discountPercent}% ({formatCurrency(calculateDiscountAmount())})</>
                )}
              </div>
            </Card>
          )}

          {products.length === 0 && !loading && (
            <Alert
              message="No products available"
              description="There are no products in stock. Please add products to the shop first."
              type="warning"
              showIcon
              className="mb-4"
            />
          )}

          {/* Actions */}
          <Row gutter={12} className="mt-6">
            <Col span={12}>
              <Button 
                block 
                size="large" 
                onClick={handleClose}
              >
                Cancel
              </Button>
            </Col>
            <Col span={12}>
              <Button 
                type="primary" 
                htmlType="submit" 
                block 
                size="large"
                loading={submitting}
                disabled={!selectedProduct || products.length === 0 || (hasColors && !selectedColor) || (needsSize && !selectedSize)}
                style={{ background: '#ec4899' }}
              >
                Complete Sale
              </Button>
            </Col>
          </Row>
        </Form>
      </Spin>
    </Modal>
  );
}

export default QuickShopSaleModal;
