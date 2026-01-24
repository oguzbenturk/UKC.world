/**
 * QuickShopSaleModal - Quick shop sale form for Front Desk dashboard
 * Allows making a shop sale: select customer -> select product -> process sale
 */
import { useState, useEffect } from 'react';
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

const { Option } = Select;
const { Text } = Typography;

function QuickShopSaleModal({ open, onClose, onSuccess }) {
  const [form] = Form.useForm();
  const { formatCurrency } = useCurrency();
  
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [customers, setCustomers] = useState([]);
  const [products, setProducts] = useState([]);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [quantity, setQuantity] = useState(1);

  // Fetch customers
  useEffect(() => {
    if (open) {
      fetchCustomers();
      fetchProducts();
    }
  }, [open]);

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
      // Show all products, indicate stock status in display
      setProducts(response.data || []);
    } catch (error) {
      console.error('Error fetching products:', error);
      message.error('Failed to load products');
    } finally {
      setLoading(false);
    }
  };

  const handleProductChange = (productId) => {
    const product = products.find(p => p.id === productId);
    setSelectedProduct(product);
    setQuantity(1);
  };

  const handleQuantityChange = (value) => {
    setQuantity(value || 1);
  };

  const calculateTotal = () => {
    if (!selectedProduct) return 0;
    return selectedProduct.price * quantity;
  };

  const handleSubmit = async (values) => {
    try {
      setSubmitting(true);

      // Create shop order
      const orderData = {
        user_id: values.customer_id,
        items: [
          {
            product_id: values.product_id,
            quantity: quantity,
            price: selectedProduct.price
          }
        ],
        payment_method: values.payment_method || 'cash',
        notes: values.notes || ''
      };

      await apiClient.post('/shop/orders', orderData);

      message.success('Sale completed successfully!');
      
      form.resetFields();
      setSelectedProduct(null);
      setQuantity(1);
      
      if (onSuccess) {
        onSuccess();
      }
      
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
                placeholder="Search for customer..."
                optionFilterProp="children"
                filterOption={(input, option) =>
                  option.children.toLowerCase().includes(input.toLowerCase())
                }
                size="large"
              >
                {customers.map((customer) => (
                  <Option key={customer.id} value={customer.id}>
                    {customer.first_name} {customer.last_name} ({customer.email})
                  </Option>
                ))}
              </Select>
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
                optionFilterProp="children"
                onChange={handleProductChange}
                filterOption={(input, option) =>
                  option.children.toLowerCase().includes(input.toLowerCase())
                }
                size="large"
              >
                {products.map((product) => (
                  <Option key={product.id} value={product.id}>
                    {product.name} - {formatCurrency(product.price)} (Stock: {product.stock})
                  </Option>
                ))}
              </Select>
            </Form.Item>

            {selectedProduct && (
              <>
                <Divider className="my-3" />
                <Row gutter={16}>
                  <Col span={12}>
                    <div className="text-sm text-slate-600 mb-1">Quantity</div>
                    <InputNumber
                      min={1}
                      max={selectedProduct.stock}
                      value={quantity}
                      onChange={handleQuantityChange}
                      size="large"
                      className="w-full"
                    />
                  </Col>
                  <Col span={12}>
                    <div className="text-sm text-slate-600 mb-1">Available Stock</div>
                    <div className="text-lg font-semibold text-slate-800 mt-2">
                      {selectedProduct.stock} units
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
                <Text strong className="text-2xl text-emerald-600">
                  {formatCurrency(calculateTotal())}
                </Text>
              </div>
              <div className="mt-2 text-sm text-slate-600">
                {quantity} × {formatCurrency(selectedProduct.price)}
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
                disabled={!selectedProduct || products.length === 0}
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
