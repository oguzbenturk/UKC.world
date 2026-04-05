// src/features/services/components/NewSaleDrawer.jsx
// Admin drawer for creating shop orders on behalf of customers
import { useState, useEffect, useCallback, useMemo } from 'react';
import PropTypes from 'prop-types';
import {
  Drawer,
  Form,
  Select,
  DatePicker,
  Input,
  Button,
  Tag,
  InputNumber,
  Avatar,
  Spin,
  Checkbox,
  Alert,
} from 'antd';
import {
  ShoppingCartOutlined,
  DeleteOutlined,
  PlusOutlined,
} from '@ant-design/icons';
import { message } from '@/shared/utils/antdStatic';
import { useCurrency } from '@/shared/contexts/CurrencyContext';
import { useData } from '@/shared/hooks/useData';
import { useAuth } from '@/shared/hooks/useAuth';
import apiClientDefault from '@/shared/services/apiClient';
import dayjs from 'dayjs';



/** Safely parse JSON fields that may already be objects or may be JSON strings */
function parseJSON(field) {
  if (!field) return null;
  if (typeof field === 'string') {
    try { return JSON.parse(field); } catch { return null; }
  }
  return field;
}

/** Build size options from variants or sizes field.
 *  Returns: [{ label: 'S', stock: 12, price: 145 }, ...] */
function buildSizeOptions(product) {
  const variants = parseJSON(product.variants);
  if (Array.isArray(variants) && variants.length > 0) {
    return variants
      .filter(v => v.label || v.size)
      .map(v => ({
        label: v.label || v.size || String(v.key),
        stock: v.quantity ?? 0,
        price: v.price ?? v.price_final ?? null,
      }));
  }
  // Fallback to sizes array
  const sizes = parseJSON(product.sizes);
  if (Array.isArray(sizes) && sizes.length > 0) {
    const labels = typeof sizes[0] === 'string'
      ? sizes
      : sizes.map(s => s.label || s.name || s.size || String(s)).filter(Boolean);
    return labels.map(s => ({ label: s, stock: null, price: null }));
  }
  return [];
}

/** Normalize colors — may be [{code, name}] objects or simple strings */
function normalizeColors(raw) {
  const parsed = parseJSON(raw);
  if (!Array.isArray(parsed) || parsed.length === 0) return [];
  if (typeof parsed[0] === 'string') return parsed;
  return parsed.map(c => c.name || c.label || c.code || String(c)).filter(Boolean);
}

function validateOrderItems(items) {
  for (const item of items) {
    if (item._sizeOptions?.length > 0 && !item.selected_size) {
      return { ok: false, level: 'warning', msg: `Please select a size for ${item.product_name}` };
    }
    if (item._colors?.length > 0 && !item.selected_color) {
      return { ok: false, level: 'warning', msg: `Please select a color for ${item.product_name}` };
    }
    const maxStock = item._selectedSizeStock ?? item._stock;
    if (item.quantity > maxStock) {
      return { ok: false, level: 'error', msg: `Insufficient stock for ${item.product_name}. Available: ${maxStock}` };
    }
  }
  return { ok: true };
}

/** Apply field update to an order item, handling size-variant stock/price lookup */
function applyItemUpdate(item, field, value) {
  const updated = { ...item, [field]: value };
  if (field === 'selected_size' && item._sizeOptions?.length > 0) {
    const opt = item._sizeOptions.find(o => o.label === value);
    updated._selectedSizeStock = opt?.stock ?? item._stock;
    updated._selectedSizePrice = opt?.price ?? null;
    if (opt?.stock != null && updated.quantity > opt.stock) {
      updated.quantity = Math.max(1, opt.stock);
    }
  }
  return updated;
}

/** Size/Color/Qty selectors row inside an OrderItemCard */
function ItemOptionsRow({ item, index, onUpdate }) {
  const hasSizes = item._sizeOptions?.length > 0;
  const hasColors = item._colors?.length > 0;
  const effectiveStock = item._selectedSizeStock ?? item._stock;

  return (
    <div className="flex flex-wrap items-center gap-2 mt-2 pt-2 border-t border-slate-50">
      <div className="flex items-center gap-1.5">
        <span className="text-[10px] uppercase text-slate-400 font-semibold">
          Size{hasSizes && <span className="text-red-400">*</span>}
        </span>
        <Select
          size="small"
          className="!w-28"
          placeholder={hasSizes ? 'Pick size' : '—'}
          disabled={!hasSizes}
          status={hasSizes && !item.selected_size ? 'warning' : undefined}
          value={item.selected_size}
          onChange={(val) => onUpdate(index, 'selected_size', val)}
        >
          {(item._sizeOptions || []).map(opt => (
            <Select.Option key={opt.label} value={opt.label} disabled={opt.stock === 0}>
              <span className="font-medium">{opt.label}</span>
              {opt.stock != null && (
                <span className="text-slate-400 ml-1 text-[11px]">· {opt.stock}</span>
              )}
            </Select.Option>
          ))}
        </Select>
      </div>

      <div className="flex items-center gap-1.5">
        <span className="text-[10px] uppercase text-slate-400 font-semibold">
          Color{hasColors && <span className="text-red-400">*</span>}
        </span>
        <Select
          size="small"
          className="!w-24"
          placeholder={hasColors ? 'Pick' : '—'}
          disabled={!hasColors}
          status={hasColors && !item.selected_color ? 'warning' : undefined}
          value={item.selected_color}
          onChange={(val) => onUpdate(index, 'selected_color', val)}
        >
          {(item._colors || []).map(c => (
            <Select.Option key={c} value={c}>{c}</Select.Option>
          ))}
        </Select>
      </div>

      <div className="flex items-center gap-1.5">
        <span className="text-[10px] uppercase text-slate-400 font-semibold">Qty</span>
        <InputNumber
          min={1}
          max={effectiveStock || 999}
          value={item.quantity}
          size="small"
          className="!w-16"
          onChange={(val) => onUpdate(index, 'quantity', val || 1)}
        />
      </div>
    </div>
  );
}

function OrderItemCard({ item, index, onUpdate, onRemove, formatCurrency, currency }) {
  const effectiveStock = item._selectedSizeStock ?? item._stock;
  const effectivePrice = item._selectedSizePrice ?? item.unit_price;
  const cur = item._currency || currency;

  return (
    <div className="border border-slate-100 rounded-lg px-3 py-2.5">
      <div className="flex items-center gap-2">
        {item.product_image ? (
          <Avatar src={item.product_image} shape="square" size={32} className="!rounded shrink-0" />
        ) : (
          <div className="w-8 h-8 rounded bg-slate-100 flex items-center justify-center shrink-0">
            <ShoppingCartOutlined className="text-slate-300 text-xs" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-medium text-slate-900 truncate">{item.product_name}</p>
          <p className="text-[11px] text-slate-500">
            {formatCurrency(effectivePrice, cur)} each
            {effectiveStock != null && <span className="ml-1 text-slate-400">· {effectiveStock} in stock</span>}
          </p>
        </div>
        <p className="text-sm font-semibold text-slate-900 shrink-0">
          {formatCurrency(effectivePrice * item.quantity, cur)}
        </p>
        <button
          onClick={() => onRemove(index)}
          className="text-slate-300 hover:text-red-500 transition-colors p-0.5 shrink-0"
        >
          <DeleteOutlined className="text-sm" />
        </button>
      </div>
      <ItemOptionsRow item={item} index={index} onUpdate={onUpdate} />
    </div>
  );
}

function NewSaleDrawer({ isOpen, onClose, onSuccess }) {
  const { apiClient } = useData();
  const { user } = useAuth();
  const { businessCurrency, formatCurrency } = useCurrency();
  const messageApi = message;
  const [form] = Form.useForm();

  const [customers, setCustomers] = useState([]);
  const [products, setProducts] = useState([]);
  const [loadingCustomers, setLoadingCustomers] = useState(false);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [orderItems, setOrderItems] = useState([]);
  const [productDropdownOpen, setProductDropdownOpen] = useState(false);
  const [allowNegativeBalance, setAllowNegativeBalance] = useState(false);

  const isAdminOrManager = ['admin', 'manager', 'super_admin', 'owner'].includes(user?.role?.toLowerCase?.());
  const canSelectPastDates = isAdminOrManager;

  // Load customers
  const loadCustomers = useCallback(async () => {
    setLoadingCustomers(true);
    try {
      const client = apiClient || apiClientDefault;
      const response = await client.get('/users');
      const users = Array.isArray(response.data) ? response.data : [];
      setCustomers(users.filter(u => {
        const role = (u.role_name || u.role || '').toLowerCase();
        return !role || role === 'student' || role === 'customer' || role === 'outsider' || role === 'trusted_customer';
      }));
    } catch {
      setCustomers([]);
    } finally {
      setLoadingCustomers(false);
    }
  }, [apiClient]);

  // Load products
  const loadProducts = useCallback(async () => {
    setLoadingProducts(true);
    try {
      const client = apiClient || apiClientDefault;
      const response = await client.get('/products?status=active&limit=200');
      const body = response.data;
      setProducts(Array.isArray(body) ? body : (body?.data || body?.products || []));
    } catch {
      setProducts([]);
    } finally {
      setLoadingProducts(false);
    }
  }, [apiClient]);

  // Load data when drawer opens
  useEffect(() => {
    if (isOpen) {
      loadCustomers();
      loadProducts();
      form.resetFields();
      form.setFieldsValue({
        order_date: dayjs(),
        status: 'confirmed',
      });
      setOrderItems([]);
      setAllowNegativeBalance(false);
    }
  }, [isOpen, form, loadCustomers, loadProducts]);

  // Add product to order
  const handleAddProduct = useCallback((productId) => {
    const product = products.find(p => p.id === productId);
    if (!product) return;

    // Check if already added (without size/color picked yet — safe to bump qty)
    const existing = orderItems.find(i => i.product_id === productId);
    if (existing) {
      const hasPendingOptions = (existing._sizeOptions?.length > 0 && !existing.selected_size) ||
                                 (existing._colors?.length > 0 && !existing.selected_color);
      const hasNoOptions = (!existing._sizeOptions?.length && !existing._colors?.length);
      if (hasNoOptions || hasPendingOptions) {
        setOrderItems(prev => prev.map(i =>
          i === existing ? { ...i, quantity: i.quantity + 1 } : i
        ));
        setProductDropdownOpen(false);
        return;
      }
    }
    const sizeOptions = buildSizeOptions(product);
    const colors = normalizeColors(product.colors);
    setOrderItems(prev => [...prev, {
      product_id: product.id,
      product_name: product.name,
      product_image: product.image_url,
      brand: product.brand,
      unit_price: parseFloat(product.price) || 0,
      quantity: 1,
      selected_size: sizeOptions.length === 1 ? sizeOptions[0].label : null,
      selected_color: colors.length === 1 ? colors[0] : null,
      // variant/size options with per-size stock
      _sizeOptions: sizeOptions,
      _colors: colors,
      _stock: product.stock_quantity,
      // When a size is selected, these get updated
      _selectedSizeStock: sizeOptions.length === 1 ? (sizeOptions[0].stock ?? product.stock_quantity) : null,
      _selectedSizePrice: sizeOptions.length === 1 ? sizeOptions[0].price : null,
      _currency: product.currency,
    }]);
    setProductDropdownOpen(false);
  }, [products, orderItems]);

  // Update item field — special handling when size changes to update stock/price
  const updateItem = useCallback((index, field, value) => {
    setOrderItems(prev => prev.map((item, i) =>
      i === index ? applyItemUpdate(item, field, value) : item
    ));
  }, []);

  // Remove item
  const removeItem = useCallback((index) => {
    setOrderItems(prev => prev.filter((_, i) => i !== index));
  }, []);

  // Calculate totals (use variant price when selected)
  const orderTotal = useMemo(() => {
    return orderItems.reduce((sum, item) => {
      const price = item._selectedSizePrice ?? item.unit_price;
      return sum + (price * item.quantity);
    }, 0);
  }, [orderItems]);

  // Submit order
  // eslint-disable-next-line complexity
  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();

      if (orderItems.length === 0) {
        messageApi.warning('Add at least one item to the order');
        return;
      }

      // Validate items (size/color/stock)
      const check = validateOrderItems(orderItems);
      if (!check.ok) {
        messageApi[check.level](check.msg);
        return;
      }

      setSubmitting(true);
      const client = apiClient || apiClientDefault;

      const payload = {
        user_id: values.customer_id,
        items: orderItems.map(item => ({
          product_id: item.product_id,
          product_name: item.product_name,
          quantity: item.quantity,
          selected_size: item.selected_size || undefined,
          selected_color: item.selected_color || undefined,
        })),
        payment_method: 'wallet',
        allowNegativeBalance: isAdminOrManager && allowNegativeBalance ? true : undefined,
        notes: values.notes || undefined,
        shipping_address: values.shipping_address || undefined,
        // Send custom date if admin picked one (backend will use it for created_at)
        created_at: values.order_date ? values.order_date.toISOString() : undefined,
      };

      await client.post('/shop-orders', payload);
      messageApi.success('Sale created successfully');
      onSuccess?.();
      onClose();
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('NewSaleDrawer submit error:', error?.response?.status, error?.response?.data || error);
      const msg = error?.response?.data?.error || 'Failed to create sale';
      messageApi.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Drawer
      title="New Sale"
      placement="right"
      width={480}
      open={isOpen}
      onClose={onClose}
      destroyOnClose
      footer={
        <div className="flex items-center justify-between">
          <div>
            {orderItems.length > 0 && (
              <span className="text-base font-bold text-slate-900">
                Total: {formatCurrency(orderTotal, businessCurrency)}
              </span>
            )}
          </div>
          <div className="flex gap-2">
            <Button onClick={onClose}>Cancel</Button>
            <Button
              type="primary"
              onClick={handleSubmit}
              loading={submitting}
              disabled={orderItems.length === 0}
              className="!bg-emerald-600 !border-emerald-600 hover:!bg-emerald-700"
            >
              Create Sale
            </Button>
          </div>
        </div>
      }
    >
      <Form form={form} layout="vertical" className="space-y-1">
        {/* Customer */}
        <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 mb-2">Customer</p>
        <Form.Item
          name="customer_id"
          rules={[{ required: true, message: 'Please select a customer' }]}
          className="!mb-4"
        >
          <Select
            placeholder="Search customer name or email"
            showSearch
            size="large"
            optionFilterProp="children"
            optionLabelProp="label"
            className="w-full"
            loading={loadingCustomers}
            notFoundContent={loadingCustomers ? <Spin size="small" /> : 'No customers found'}
          >
            {customers.map(c => {
              const name = c.name || `${c.first_name || ''} ${c.last_name || ''}`.trim();
              const label = name || c.email || 'Customer';
              return (
                <Select.Option key={c.id} value={c.id} label={label}>
                  <div className="flex flex-col">
                    <span className="font-medium text-slate-900">{label}</span>
                    {c.email && c.email !== label && (
                      <span className="text-xs text-slate-500">{c.email}</span>
                    )}
                  </div>
                </Select.Option>
              );
            })}
          </Select>
        </Form.Item>

        {/* Products */}
        <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 mb-2">Items</p>
        <Select
          placeholder="Search and add products..."
          showSearch
          size="large"
          optionFilterProp="children"
          className="w-full mb-3"
          value={null}
          loading={loadingProducts}
          open={productDropdownOpen}
          onOpenChange={setProductDropdownOpen}
          onSelect={handleAddProduct}
          notFoundContent={loadingProducts ? <Spin size="small" /> : 'No products found'}
        >
          {products.filter(p => p.stock_quantity > 0).map(p => (
            <Select.Option key={p.id} value={p.id}>
              <div className="flex items-center gap-2">
                {p.image_url ? (
                  <Avatar src={p.image_url} shape="square" size={24} className="!rounded shrink-0" />
                ) : (
                  <div className="w-6 h-6 rounded bg-slate-100 flex items-center justify-center shrink-0">
                    <ShoppingCartOutlined className="text-slate-300 text-[10px]" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <span className="text-sm truncate">{p.name}</span>
                  {p.brand && <span className="text-xs text-slate-400 ml-1">({p.brand})</span>}
                </div>
                <span className="text-xs font-medium text-slate-600 shrink-0">
                  {formatCurrency(p.price, p.currency || businessCurrency)}
                </span>
                <Tag className="!text-[10px] !m-0 !px-1.5 !py-0 !rounded !border-0 !bg-slate-100 !text-slate-500">
                  {p.stock_quantity} left
                </Tag>
              </div>
            </Select.Option>
          ))}
        </Select>

        {/* Order items list */}
        {orderItems.length > 0 && (
          <div className="space-y-2 mb-4">
            {orderItems.map((item, idx) => (
              <OrderItemCard
                key={`${item.product_id}-${item.selected_size || ''}-${item.selected_color || ''}`}
                item={item}
                index={idx}
                onUpdate={updateItem}
                onRemove={removeItem}
                formatCurrency={formatCurrency}
                currency={businessCurrency}
              />
            ))}

            {/* Totals summary */}
            <div className="flex items-center justify-between pt-2 px-1">
              <span className="text-xs text-slate-500">
                {orderItems.reduce((s, i) => s + i.quantity, 0)} item(s)
              </span>
              <span className="text-sm font-bold text-slate-900">
                {formatCurrency(orderTotal, businessCurrency)}
              </span>
            </div>
          </div>
        )}

        {orderItems.length === 0 && (
          <div className="flex flex-col items-center justify-center py-6 text-slate-300 mb-4">
            <PlusOutlined className="text-2xl mb-2" />
            <p className="text-xs">Search and add products above</p>
          </div>
        )}

        {/* Order details */}
        <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 mb-2 pt-2 border-t border-slate-100">Order Details</p>

        <Form.Item
          name="order_date"
          label="Order date"
          className="!mb-2"
        >
          <DatePicker
            size="large"
            className="w-full"
            placeholder="Today"
            disabledDate={canSelectPastDates ? undefined : (current) => current && current < dayjs().startOf('day')}
          />
        </Form.Item>

        {isAdminOrManager && (
          <div className="border border-amber-200 rounded-lg p-3 space-y-2 mb-3">
            <label className="flex items-center gap-2 cursor-pointer text-sm">
              <Checkbox
                checked={allowNegativeBalance}
                onChange={(e) => setAllowNegativeBalance(e.target.checked)}
              />
              <span className="text-slate-700">Allow negative wallet balance</span>
            </label>
            {allowNegativeBalance && (
              <Alert
                type="warning"
                showIcon
                message="Customer wallet may go into negative balance (debt)."
                className="text-sm [&_.ant-alert-message]:!mb-0 !rounded-lg"
              />
            )}
          </div>
        )}

        <Form.Item
          name="shipping_address"
          label="Shipping address"
          className="!mb-2"
        >
          <Input size="large" placeholder="Optional — leave empty for pickup" />
        </Form.Item>

        <Form.Item
          name="notes"
          label="Notes"
          className="!mb-0"
        >
          <Input.TextArea
            rows={2}
            placeholder="Internal notes about this sale..."
            maxLength={500}
            showCount
          />
        </Form.Item>
      </Form>
    </Drawer>
  );
}

NewSaleDrawer.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  onSuccess: PropTypes.func,
};

export default NewSaleDrawer;
