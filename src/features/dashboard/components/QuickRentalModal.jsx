/**
 * QuickRentalModal - Quick equipment rental form for Front Desk dashboard
 * Allows creating rentals without navigating away from dashboard
 */
import { useState, useEffect, useCallback } from 'react';
import { 
  Modal, 
  Form, 
  Select, 
  DatePicker, 
  InputNumber, 
  Button, 
  Row, 
  Col, 
  Space,
  Divider,
  Tag,
  Spin
} from 'antd';
import { message } from '@/shared/utils/antdStatic';
import { 
  ToolOutlined, 
  UserOutlined, 
  CalendarOutlined,
  DollarOutlined
} from '@ant-design/icons';
import dayjs from 'dayjs';
import apiClient from '@/shared/services/apiClient';
import { serviceApi } from '@/shared/services/serviceApi';
import { useCurrency } from '@/shared/contexts/CurrencyContext';

const { Option } = Select;

function QuickRentalModal({ open, onClose, onSuccess }) {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [customers, setCustomers] = useState([]);
  const [equipment, setEquipment] = useState([]);
  const { formatCurrency, businessCurrency } = useCurrency();

  // Load customers and equipment on open
  useEffect(() => {
    if (!open) return;

    const loadData = async () => {
      setLoading(true);
      try {
        const [usersRes, servicesData] = await Promise.all([
          apiClient.get('/users'),
          serviceApi.getServices()
        ]);

        // Filter customers (students and customers)
        const users = Array.isArray(usersRes.data) ? usersRes.data : [];
        const customersOnly = users.filter(
          (user) => !user.user_role || user.user_role === 'student' || user.user_role === 'customer' || user.user_role === 'outsider'
        );
        setCustomers(customersOnly);

        // Filter rental equipment
        const rentalEquipment = (servicesData || []).filter(
          (s) => s.service_type === 'rental' && s.status === 'active'
        );
        setEquipment(rentalEquipment);
      } catch {
        message.error('Failed to load data');
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [open]);

  // Reset form when modal closes
  useEffect(() => {
    if (!open) {
      form.resetFields();
    }
  }, [open, form]);

  // Calculate total price
  const calculateTotal = useCallback(() => {
    const values = form.getFieldsValue();
    const equipmentIds = values.equipment_ids || [];
    const duration = values.duration || 1;

    let total = 0;
    equipmentIds.forEach(id => {
      const item = equipment.find(e => e.id === id);
      if (item) {
        total += (item.price || 0) * duration;
      }
    });

    return total;
  }, [form, equipment]);

  // Handle form submission
  const handleSubmit = async (values) => {
    setSubmitting(true);
    try {
      const payload = {
        user_id: values.customer_id,
        equipment_ids: values.equipment_ids,
        start_date: values.start_date.format('YYYY-MM-DD'),
        end_date: values.end_date?.format('YYYY-MM-DD') || values.start_date.format('YYYY-MM-DD'),
        duration: values.duration || 1,
        total_price: calculateTotal(),
        status: 'active',
        notes: values.notes
      };

      await apiClient.post('/rentals', payload);
      message.success('Rental created successfully!');
      onSuccess?.();
    } catch (err) {
      message.error(err.response?.data?.error || 'Failed to create rental');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      title={
        <Space>
          <ToolOutlined className="text-emerald-500" />
          <span>Quick Rental</span>
        </Space>
      }
      open={open}
      onCancel={onClose}
      footer={null}
      width={600}
      destroyOnHidden
    >
      {loading ? (
        <div className="flex justify-center py-12">
          <Spin size="large" />
        </div>
      ) : (
        <Form
          form={form}
          layout="vertical"
          onFinish={handleSubmit}
          initialValues={{
            start_date: dayjs(),
            duration: 1
          }}
        >
          {/* Customer Selection */}
          <Form.Item
            name="customer_id"
            label={<><UserOutlined /> Customer</>}
            rules={[{ required: true, message: 'Please select a customer' }]}
          >
            <Select
              showSearch
              placeholder="Search and select customer"
              optionFilterProp="children"
              filterOption={(input, option) =>
                option.children?.toLowerCase().includes(input.toLowerCase())
              }
            >
              {customers.map((c) => (
                <Option key={c.id} value={c.id}>
                  {c.name || `${c.first_name || ''} ${c.last_name || ''}`.trim() || c.email}
                </Option>
              ))}
            </Select>
          </Form.Item>

          {/* Equipment Selection */}
          <Form.Item
            name="equipment_ids"
            label={<><ToolOutlined /> Equipment</>}
            rules={[{ required: true, message: 'Please select equipment' }]}
          >
            <Select
              mode="multiple"
              placeholder="Select equipment to rent"
              optionFilterProp="children"
              onChange={() => form.setFieldsValue({})} // Trigger re-render for total
            >
              {equipment.map((e) => (
                <Option key={e.id} value={e.id}>
                  <Space>
                    {e.name}
                    <Tag color="green">{formatCurrency(e.price, businessCurrency)}/hr</Tag>
                  </Space>
                </Option>
              ))}
            </Select>
          </Form.Item>

          <Row gutter={16}>
            {/* Start Date */}
            <Col span={12}>
              <Form.Item
                name="start_date"
                label={<><CalendarOutlined /> Start Date</>}
                rules={[{ required: true }]}
              >
                <DatePicker 
                  className="w-full" 
                  disabledDate={(current) => current && current < dayjs().startOf('day')}
                />
              </Form.Item>
            </Col>

            {/* Duration */}
            <Col span={12}>
              <Form.Item
                name="duration"
                label="Duration (hours)"
                rules={[{ required: true }]}
              >
                <InputNumber 
                  min={1} 
                  max={24} 
                  className="w-full"
                  onChange={() => form.setFieldsValue({})} // Trigger re-render for total
                />
              </Form.Item>
            </Col>
          </Row>

          <Divider />

          {/* Total Price Display */}
          <Form.Item shouldUpdate>
            {() => (
              <div className="flex justify-between items-center p-4 bg-emerald-50 rounded-xl">
                <span className="text-lg font-medium">
                  <DollarOutlined className="mr-2" />
                  Estimated Total
                </span>
                <span className="text-2xl font-bold text-emerald-600">
                  {formatCurrency(calculateTotal(), businessCurrency)}
                </span>
              </div>
            )}
          </Form.Item>

          {/* Actions */}
          <div className="flex justify-end gap-3 mt-6">
            <Button onClick={onClose}>Cancel</Button>
            <Button 
              type="primary" 
              htmlType="submit" 
              loading={submitting}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              Create Rental
            </Button>
          </div>
        </Form>
      )}
    </Modal>
  );
}

export default QuickRentalModal;
