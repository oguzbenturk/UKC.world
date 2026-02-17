/**
 * QuickMembershipModal - Quick member registration form for Front Desk dashboard
 * Allows registering new members and assigning membership offerings
 */
import { useState, useEffect } from 'react';
import { 
  Modal, 
  Form, 
  Select, 
  Button, 
  Row, 
  Col, 
  Space,
  Card,
  Spin,
  Typography,
  Alert,
  Divider
} from 'antd';
import { message } from '@/shared/utils/antdStatic';
import { 
  CrownOutlined,
  UserOutlined, 
  DollarOutlined
} from '@ant-design/icons';
import apiClient from '@/shared/services/apiClient';
import { useCurrency } from '@/shared/contexts/CurrencyContext';

const { Option } = Select;
const { Text } = Typography;

function QuickMembershipModal({ open, onClose, onSuccess }) {
  const [form] = Form.useForm();
  const { formatCurrency } = useCurrency();
  
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [customers, setCustomers] = useState([]);
  const [offerings, setOfferings] = useState([]);
  const [selectedOffering, setSelectedOffering] = useState(null);

  // Fetch data when modal opens
  useEffect(() => {
    if (open) {
      fetchCustomers();
      fetchOfferings();
    }
  }, [open]);

  const fetchCustomers = async () => {
    try {
      setLoading(true);
      // Load customers - students, outsiders, trusted customers
      const response = await apiClient.get('/users');
      const allUsers = response.data || response || [];
      // Filter to only customers (not staff)
      const customerRoles = ['student', 'outsider', 'trusted_customer'];
      const filteredCustomers = allUsers.filter(u => 
        customerRoles.includes(u.role?.toLowerCase()) || 
        (!u.role && !u.is_admin && !u.is_staff)
      );
      setCustomers(filteredCustomers.length > 0 ? filteredCustomers : allUsers);
    } catch (error) {
      console.error('Error fetching customers:', error);
      message.error('Failed to load customers');
    } finally {
      setLoading(false);
    }
  };

  const fetchOfferings = async () => {
    try {
      setLoading(true);
      const response = await apiClient.get('/member-offerings');
      // Handle different response structures
      const data = response.data || response || [];
      // Filter active offerings only (handle different field names)
      const activeOfferings = data.filter(o => 
        o.is_active !== false && o.active !== false && o.status !== 'inactive'
      );
      setOfferings(activeOfferings.length > 0 ? activeOfferings : data);
    } catch (error) {
      console.error('Error fetching offerings:', error);
      message.error('Failed to load membership offerings');
    } finally {
      setLoading(false);
    }
  };

  const handleOfferingChange = (offeringId) => {
    const offering = offerings.find(o => o.id === offeringId);
    setSelectedOffering(offering);
  };

  const handleSubmit = async (values) => {
    try {
      setSubmitting(true);

      // Create membership purchase via admin endpoint
      const purchaseData = {
        userId: values.customer_id,
        offeringId: values.offering_id,
        paymentMethod: values.payment_method || 'wallet'
      };

      await apiClient.post('/member-offerings/admin/purchases', purchaseData);

      message.success('Member registered successfully!');
      
      form.resetFields();
      setSelectedOffering(null);
      
      if (onSuccess) {
        onSuccess();
      }
      
      onClose();
    } catch (error) {
      console.error('Error creating membership:', error);
      message.error(error.response?.data?.message || 'Failed to register member');
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    form.resetFields();
    setSelectedOffering(null);
    onClose();
  };

  return (
    <Modal
      title={
        <Space>
          <CrownOutlined style={{ color: '#f59e0b' }} />
          <span>Register New Member</span>
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

          {/* Membership Offering Selection */}
          <Card 
            size="small" 
            className="mb-4 bg-amber-50/50 border-amber-200"
          >
            <Form.Item
              name="offering_id"
              label={
                <Space>
                  <CrownOutlined />
                  <Text strong>Select Membership Plan</Text>
                </Space>
              }
              rules={[{ required: true, message: 'Please select a membership plan' }]}
              className="mb-0"
            >
              <Select
                showSearch
                placeholder="Choose membership plan..."
                optionFilterProp="children"
                onChange={handleOfferingChange}
                filterOption={(input, option) =>
                  option.children.toLowerCase().includes(input.toLowerCase())
                }
                size="large"
              >
                {offerings.map((offering) => (
                  <Option key={offering.id} value={offering.id}>
                    {offering.name} - {formatCurrency(offering.price)} / {offering.duration_days} days
                  </Option>
                ))}
              </Select>
            </Form.Item>
          </Card>

          {/* Offering Details */}
          {selectedOffering && (
            <Card className="mb-4 bg-gradient-to-r from-amber-50 to-yellow-50 border-amber-200">
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <Text strong>Plan Details</Text>
                  <Text strong className="text-amber-600 text-xl">
                    {formatCurrency(selectedOffering.price)}
                  </Text>
                </div>
                <Divider className="my-2" />
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <Text type="secondary">Duration:</Text>
                    <div className="font-medium">{selectedOffering.duration_days} days</div>
                  </div>
                  {selectedOffering.benefits && (
                    <div>
                      <Text type="secondary">Benefits:</Text>
                      <div className="font-medium">
                        {selectedOffering.benefits.split('\n')[0]}
                      </div>
                    </div>
                  )}
                </div>
                {selectedOffering.description && (
                  <>
                    <Divider className="my-2" />
                    <Text type="secondary" className="text-xs">
                      {selectedOffering.description}
                    </Text>
                  </>
                )}
              </div>
            </Card>
          )}

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

          {offerings.length === 0 && !loading && (
            <Alert
              message="No membership plans available"
              description="There are no active membership offerings. Please create membership plans first."
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
                disabled={!selectedOffering || offerings.length === 0}
                style={{ background: '#f59e0b' }}
              >
                Register Member
              </Button>
            </Col>
          </Row>
        </Form>
      </Spin>
    </Modal>
  );
}

export default QuickMembershipModal;
