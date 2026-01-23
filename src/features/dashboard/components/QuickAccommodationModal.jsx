/**
 * QuickAccommodationModal - Quick accommodation booking form for Front Desk dashboard
 * Allows booking accommodation without navigating away from dashboard
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
  Spin,
  Card
} from 'antd';
import { message } from '@/shared/utils/antdStatic';
import { 
  HomeOutlined, 
  UserOutlined, 
  CalendarOutlined,
  DollarOutlined,
  TeamOutlined
} from '@ant-design/icons';
import dayjs from 'dayjs';
import apiClient from '@/shared/services/apiClient';
import { useCurrency } from '@/shared/contexts/CurrencyContext';

const { Option } = Select;
const { RangePicker } = DatePicker;

function QuickAccommodationModal({ open, onClose, onSuccess }) {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [customers, setCustomers] = useState([]);
  const [accommodations, setAccommodations] = useState([]);
  const [selectedAccommodation, setSelectedAccommodation] = useState(null);
  const { formatCurrency, businessCurrency } = useCurrency();

  // Load customers and accommodations on open
  useEffect(() => {
    if (!open) return;

    const loadData = async () => {
      setLoading(true);
      try {
        const [usersRes, accommodationsRes] = await Promise.all([
          apiClient.get('/users'),
          apiClient.get('/accommodation/units')
        ]);

        // Filter customers
        const users = Array.isArray(usersRes.data) ? usersRes.data : [];
        const customersOnly = users.filter(
          (user) => !user.user_role || user.user_role === 'student' || user.user_role === 'customer' || user.user_role === 'outsider'
        );
        setCustomers(customersOnly);

        // Get available accommodations
        const accommodationsList = Array.isArray(accommodationsRes.data) 
          ? accommodationsRes.data 
          : accommodationsRes.data?.units || [];
        setAccommodations(accommodationsList.filter(a => a.status === 'Available'));
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
      setSelectedAccommodation(null);
    }
  }, [open, form]);

  // Handle accommodation selection
  const handleAccommodationChange = (accommodationId) => {
    const selected = accommodations.find(a => a.id === accommodationId);
    setSelectedAccommodation(selected);
  };

  // Calculate total price
  const calculateTotal = useCallback(() => {
    if (!selectedAccommodation) return 0;
    
    const values = form.getFieldsValue();
    const dateRange = values.date_range;
    
    if (!dateRange || !dateRange[0] || !dateRange[1]) return 0;
    
    const nights = dateRange[1].diff(dateRange[0], 'day');
    return (selectedAccommodation.price_per_night || 0) * nights;
  }, [form, selectedAccommodation]);

  // Handle form submission
  const handleSubmit = async (values) => {
    setSubmitting(true);
    try {
      const payload = {
        unit_id: values.accommodation_id,
        guest_id: values.customer_id,
        check_in_date: values.date_range[0].format('YYYY-MM-DD'),
        check_out_date: values.date_range[1].format('YYYY-MM-DD'),
        guests_count: values.guests_count || 1,
        notes: values.notes
      };

      await apiClient.post('/accommodation/bookings', payload);
      message.success('Accommodation booked successfully!');
      onSuccess?.();
    } catch (err) {
      message.error(err.response?.data?.error || 'Failed to create booking');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      title={
        <Space>
          <HomeOutlined className="text-purple-500" />
          <span>Quick Accommodation Booking</span>
        </Space>
      }
      open={open}
      onCancel={onClose}
      footer={null}
      width={700}
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
            guests_count: 1
          }}
        >
          {/* Customer Selection */}
          <Form.Item
            name="customer_id"
            label={<><UserOutlined /> Guest</>}
            rules={[{ required: true, message: 'Please select a guest' }]}
          >
            <Select
              showSearch
              placeholder="Search and select guest"
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

          {/* Accommodation Selection */}
          <Form.Item
            name="accommodation_id"
            label={<><HomeOutlined /> Accommodation</>}
            rules={[{ required: true, message: 'Please select accommodation' }]}
          >
            <Select
              placeholder="Select accommodation"
              onChange={handleAccommodationChange}
            >
              {accommodations.map((a) => (
                <Option key={a.id} value={a.id}>
                  <Space>
                    {a.name}
                    <Tag color="blue">{a.type}</Tag>
                    <Tag color="green">{formatCurrency(a.price_per_night, businessCurrency)}/night</Tag>
                  </Space>
                </Option>
              ))}
            </Select>
          </Form.Item>

          {/* Selected Accommodation Preview */}
          {selectedAccommodation && (
            <Card size="small" className="mb-4 bg-purple-50 border-purple-200">
              <div className="flex justify-between items-start">
                <div>
                  <h4 className="font-medium text-purple-800">{selectedAccommodation.name}</h4>
                  <p className="text-sm text-purple-600">
                    {selectedAccommodation.description?.slice(0, 100) || 'No description'}
                  </p>
                  <Space className="mt-2">
                    <Tag icon={<TeamOutlined />} color="purple">
                      Max {selectedAccommodation.capacity || 2} guests
                    </Tag>
                    {selectedAccommodation.amenities?.slice(0, 3).map((amenity) => (
                      <Tag key={amenity}>{amenity}</Tag>
                    ))}
                  </Space>
                </div>
                <div className="text-right">
                  <span className="text-2xl font-bold text-purple-600">
                    {formatCurrency(selectedAccommodation.price_per_night, businessCurrency)}
                  </span>
                  <p className="text-sm text-purple-500">per night</p>
                </div>
              </div>
            </Card>
          )}

          <Row gutter={16}>
            {/* Date Range */}
            <Col span={16}>
              <Form.Item
                name="date_range"
                label={<><CalendarOutlined /> Check-in / Check-out</>}
                rules={[{ required: true, message: 'Please select dates' }]}
              >
                <RangePicker 
                  className="w-full" 
                  disabledDate={(current) => current && current < dayjs().startOf('day')}
                  onChange={() => form.setFieldsValue({})} // Trigger re-render for total
                />
              </Form.Item>
            </Col>

            {/* Guests Count */}
            <Col span={8}>
              <Form.Item
                name="guests_count"
                label={<><TeamOutlined /> Guests</>}
                rules={[{ required: true }]}
              >
                <InputNumber 
                  min={1} 
                  max={selectedAccommodation?.capacity || 10} 
                  className="w-full"
                />
              </Form.Item>
            </Col>
          </Row>

          <Divider />

          {/* Total Price Display */}
          <Form.Item shouldUpdate>
            {() => {
              const total = calculateTotal();
              const dateRange = form.getFieldValue('date_range');
              const nights = dateRange?.[0] && dateRange?.[1] 
                ? dateRange[1].diff(dateRange[0], 'day') 
                : 0;
              
              return (
                <div className="flex justify-between items-center p-4 bg-purple-50 rounded-xl">
                  <div>
                    <span className="text-lg font-medium">
                      <DollarOutlined className="mr-2" />
                      Total
                    </span>
                    {nights > 0 && (
                      <p className="text-sm text-purple-600">
                        {nights} night{nights > 1 ? 's' : ''} × {formatCurrency(selectedAccommodation?.price_per_night || 0, businessCurrency)}
                      </p>
                    )}
                  </div>
                  <span className="text-2xl font-bold text-purple-600">
                    {formatCurrency(total, businessCurrency)}
                  </span>
                </div>
              );
            }}
          </Form.Item>

          {/* Actions */}
          <div className="flex justify-end gap-3 mt-6">
            <Button onClick={onClose}>Cancel</Button>
            <Button 
              type="primary" 
              htmlType="submit" 
              loading={submitting}
              className="bg-purple-600 hover:bg-purple-700"
            >
              Book Accommodation
            </Button>
          </div>
        </Form>
      )}
    </Modal>
  );
}

export default QuickAccommodationModal;
