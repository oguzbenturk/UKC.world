/**
 * QuickCustomerModal - Quick customer/student registration form for Front Desk dashboard
 * Allows registering new customers without navigating away from dashboard
 */
import { useState, useEffect } from 'react';
import { 
  Modal, 
  Form, 
  Input, 
  Select, 
  Button, 
  Row, 
  Col, 
  Space,
  Checkbox
} from 'antd';
import { message } from '@/shared/utils/antdStatic';
import { 
  UserAddOutlined, 
  MailOutlined, 
  PhoneOutlined,
  IdcardOutlined
} from '@ant-design/icons';
import apiClient from '@/shared/services/apiClient';

const { Option } = Select;

function QuickCustomerModal({ open, onClose, onSuccess }) {
  const [form] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);

  // Reset form when modal closes
  useEffect(() => {
    if (!open) {
      form.resetFields();
    }
  }, [open, form]);

  // Handle form submission
  const handleSubmit = async (values) => {
    setSubmitting(true);
    try {
      const payload = {
        first_name: values.first_name,
        last_name: values.last_name,
        email: values.email,
        phone: values.phone,
        user_role: values.user_role || 'student',
        emergency_contact_name: values.emergency_contact_name,
        emergency_contact_phone: values.emergency_contact_phone,
        notes: values.notes,
        // Generate a temporary password if needed
        password: values.send_credentials ? generateTempPassword() : undefined,
        send_welcome_email: values.send_credentials
      };

      await apiClient.post('/users', payload);
      message.success(`${values.first_name} ${values.last_name} registered successfully!`);
      onSuccess?.();
    } catch (err) {
      const errorMessage = err.response?.data?.error || 'Failed to register customer';
      if (errorMessage.includes('email') && errorMessage.includes('exists')) {
        message.error('A user with this email already exists');
      } else {
        message.error(errorMessage);
      }
    } finally {
      setSubmitting(false);
    }
  };

  // Generate temporary password
  const generateTempPassword = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
    let password = '';
    for (let i = 0; i < 10; i++) {
      password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return password;
  };

  return (
    <Modal
      title={
        <Space>
          <UserAddOutlined className="text-blue-500" />
          <span>Register New Customer</span>
        </Space>
      }
      open={open}
      onCancel={onClose}
      footer={null}
      width={600}
      destroyOnHidden
    >
      <Form
        form={form}
        layout="vertical"
        onFinish={handleSubmit}
        initialValues={{
          user_role: 'student',
          send_credentials: false
        }}
      >
        <Row gutter={16}>
          {/* First Name */}
          <Col span={12}>
            <Form.Item
              name="first_name"
              label="First Name"
              rules={[{ required: true, message: 'First name is required' }]}
            >
              <Input 
                prefix={<IdcardOutlined className="text-gray-400" />} 
                placeholder="First name" 
              />
            </Form.Item>
          </Col>

          {/* Last Name */}
          <Col span={12}>
            <Form.Item
              name="last_name"
              label="Last Name"
              rules={[{ required: true, message: 'Last name is required' }]}
            >
              <Input placeholder="Last name" />
            </Form.Item>
          </Col>
        </Row>

        <Row gutter={16}>
          {/* Email */}
          <Col span={12}>
            <Form.Item
              name="email"
              label="Email"
              rules={[
                { required: true, message: 'Email is required' },
                { type: 'email', message: 'Please enter a valid email' }
              ]}
            >
              <Input 
                prefix={<MailOutlined className="text-gray-400" />} 
                placeholder="email@example.com" 
              />
            </Form.Item>
          </Col>

          {/* Phone */}
          <Col span={12}>
            <Form.Item
              name="phone"
              label="Phone"
            >
              <Input 
                prefix={<PhoneOutlined className="text-gray-400" />} 
                placeholder="+1 234 567 8900" 
              />
            </Form.Item>
          </Col>
        </Row>

        {/* Role */}
        <Form.Item
          name="user_role"
          label="Customer Type"
        >
          <Select>
            <Option value="student">Student (Lessons)</Option>
            <Option value="outsider">Guest/Walk-in</Option>
            <Option value="trusted_customer">Trusted Customer</Option>
          </Select>
        </Form.Item>

        {/* Emergency Contact */}
        <div className="bg-orange-50 p-4 rounded-xl mb-4">
          <p className="text-sm font-medium text-orange-700 mb-3">Emergency Contact (Optional)</p>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="emergency_contact_name"
                label="Contact Name"
                className="mb-0"
              >
                <Input placeholder="Emergency contact name" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="emergency_contact_phone"
                label="Contact Phone"
                className="mb-0"
              >
                <Input placeholder="Emergency contact phone" />
              </Form.Item>
            </Col>
          </Row>
        </div>

        {/* Notes */}
        <Form.Item
          name="notes"
          label="Notes"
        >
          <Input.TextArea 
            rows={2} 
            placeholder="Any additional notes about this customer..." 
          />
        </Form.Item>

        {/* Send Credentials */}
        <Form.Item
          name="send_credentials"
          valuePropName="checked"
        >
          <Checkbox>
            <span className="text-sm">
              Send login credentials via email (creates account access)
            </span>
          </Checkbox>
        </Form.Item>

        {/* Actions */}
        <div className="flex justify-end gap-3 mt-4">
          <Button onClick={onClose}>Cancel</Button>
          <Button 
            type="primary" 
            htmlType="submit" 
            loading={submitting}
            icon={<UserAddOutlined />}
          >
            Register Customer
          </Button>
        </div>
      </Form>
    </Modal>
  );
}

export default QuickCustomerModal;
