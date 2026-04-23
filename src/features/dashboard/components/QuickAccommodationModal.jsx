/**
 * QuickAccommodationModal - Quick accommodation booking drawer for Front Desk dashboard
 */
import { useState, useEffect, useCallback } from 'react';
import {
  Drawer,
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
  Card,
  Input
} from 'antd';
import { message } from '@/shared/utils/antdStatic';
import {
  HomeOutlined,
  UserOutlined,
  CalendarOutlined,
  DollarOutlined,
  TeamOutlined,
  EditOutlined
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
  const [priceOverride, setPriceOverride] = useState(null);
  const { formatCurrency, businessCurrency } = useCurrency();

  useEffect(() => {
    if (!open) return;

    const loadData = async () => {
      setLoading(true);
      try {
        const [usersRes, accommodationsRes] = await Promise.all([
          apiClient.get('/users'),
          apiClient.get('/accommodation/units')
        ]);

        const users = Array.isArray(usersRes.data) ? usersRes.data : [];
        setCustomers(users.filter(
          (u) => !u.user_role || u.user_role === 'student' || u.user_role === 'customer' || u.user_role === 'outsider'
        ));

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

  useEffect(() => {
    if (!open) {
      form.resetFields();
      setSelectedAccommodation(null);
      setPriceOverride(null);
    }
  }, [open, form]);

  const handleAccommodationChange = (accommodationId) => {
    const selected = accommodations.find(a => a.id === accommodationId);
    if (selected) {
      const raw = selected.amenities;
      selected.amenities = Array.isArray(raw)
        ? raw
        : typeof raw === 'string' && raw.trim()
          ? raw.startsWith('[') ? JSON.parse(raw) : raw.split(',').map(s => s.trim()).filter(Boolean)
          : [];
    }
    setSelectedAccommodation(selected);
    setPriceOverride(null);
  };

  const calculateTotal = useCallback(() => {
    if (!selectedAccommodation) return 0;
    const dateRange = form.getFieldValue('date_range');
    if (!dateRange?.[0] || !dateRange?.[1]) return 0;
    const nights = dateRange[1].diff(dateRange[0], 'day');
    return (selectedAccommodation.price_per_night || 0) * nights;
  }, [form, selectedAccommodation]);

  const handleSubmit = async (values) => {
    setSubmitting(true);
    try {
      const payload = {
        unit_id: values.accommodation_id,
        guest_id: values.customer_id,
        check_in_date: values.date_range[0].format('YYYY-MM-DD'),
        check_out_date: values.date_range[1].format('YYYY-MM-DD'),
        guests_count: values.guests_count || 1,
        notes: values.notes,
        payment_method: 'pay_later',
      };

      if (priceOverride !== null && priceOverride !== '') {
        payload.custom_price = parseFloat(priceOverride);
      }

      await apiClient.post('/accommodation/bookings', payload);
      onSuccess?.();
      message.success('Accommodation booked successfully!');
    } catch (err) {
      message.error(err.response?.data?.error || 'Failed to create booking');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Drawer
      title={
        <Space>
          <HomeOutlined style={{ color: '#7c3aed' }} />
          <span>Quick Accommodation Booking</span>
        </Space>
      }
      open={open}
      onClose={onClose}
      width={520}
      destroyOnHidden
      footer={
        <div className="flex justify-end gap-3">
          <Button onClick={onClose}>Cancel</Button>
          <Button
            type="primary"
            loading={submitting}
            onClick={() => form.submit()}
            style={{ background: '#7c3aed', borderColor: '#7c3aed' }}
          >
            Book Accommodation
          </Button>
        </div>
      }
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
          initialValues={{ guests_count: 1 }}
        >
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

          {selectedAccommodation && (
            <Card size="small" className="mb-4" style={{ background: '#f5f3ff', borderColor: '#ddd6fe' }}>
              <div className="flex flex-col gap-3">
                <div className="flex justify-between items-center">
                  <div>
                    <h4 className="font-semibold text-purple-800 text-base mb-0">
                      {selectedAccommodation.name}
                    </h4>
                    <p className="text-sm text-purple-600 mb-0 mt-0.5">
                      {selectedAccommodation.description?.slice(0, 80) || 'No description'}
                      {selectedAccommodation.description?.length > 80 && '...'}
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0 ml-4">
                    <span className="text-xl font-bold text-purple-600">
                      {formatCurrency(selectedAccommodation.price_per_night, businessCurrency)}
                    </span>
                    <p className="text-xs text-purple-500 mb-0">per night</p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Tag icon={<TeamOutlined />} color="purple" className="m-0">
                    Max {selectedAccommodation.capacity || 2} guests
                  </Tag>
                  {(() => {
                    const visibleAmenities = (selectedAccommodation.amenities || []).filter(
                      (a) => typeof a !== 'string' || !a.startsWith('__meta__')
                    );
                    return (
                      <>
                        {visibleAmenities.slice(0, 4).map((amenity) => (
                          <Tag key={amenity} className="m-0">{amenity}</Tag>
                        ))}
                        {visibleAmenities.length > 4 && (
                          <Tag className="m-0">+{visibleAmenities.length - 4} more</Tag>
                        )}
                      </>
                    );
                  })()}
                </div>
              </div>
            </Card>
          )}

          <Row gutter={16}>
            <Col span={16}>
              <Form.Item
                name="date_range"
                label={<><CalendarOutlined /> Check-in / Check-out</>}
                rules={[{ required: true, message: 'Please select dates' }]}
              >
                <RangePicker
                  className="w-full"
                  disabledDate={(current) => current && current < dayjs().startOf('day')}
                  onChange={() => {
                    form.setFieldsValue({});
                    setPriceOverride(null);
                  }}
                />
              </Form.Item>
            </Col>
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

          <Form.Item
            name="notes"
            label="Notes"
          >
            <Input.TextArea rows={2} placeholder="Optional notes..." />
          </Form.Item>

          <Divider />

          {/* Total Price with editable override */}
          <Form.Item shouldUpdate>
            {() => {
              const calculatedTotal = calculateTotal();
              const dateRange = form.getFieldValue('date_range');
              const nights = dateRange?.[0] && dateRange?.[1]
                ? dateRange[1].diff(dateRange[0], 'day')
                : 0;
              const displayTotal = priceOverride !== null && priceOverride !== ''
                ? parseFloat(priceOverride) || 0
                : calculatedTotal;

              return (
                <div className="p-4 rounded-xl" style={{ background: '#f5f3ff' }}>
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <span className="text-base font-medium">
                        <DollarOutlined className="mr-2" />
                        Total Price
                      </span>
                      {nights > 0 && (
                        <p className="text-sm text-purple-600 mb-0">
                          {nights} night{nights > 1 ? 's' : ''} × {formatCurrency(selectedAccommodation?.price_per_night || 0, businessCurrency)}
                        </p>
                      )}
                    </div>
                    <span className="text-2xl font-bold text-purple-600">
                      {formatCurrency(displayTotal, businessCurrency)}
                    </span>
                  </div>

                  <div>
                    <label className="text-xs text-purple-700 font-medium flex items-center gap-1 mb-1">
                      <EditOutlined /> Override price
                    </label>
                    <InputNumber
                      placeholder={`Calculated: ${calculatedTotal}`}
                      value={priceOverride}
                      onChange={(val) => setPriceOverride(val)}
                      min={0}
                      precision={2}
                      className="w-full"
                      prefix={businessCurrency}
                    />
                    {priceOverride !== null && priceOverride !== '' && (
                      <button
                        type="button"
                        className="text-xs text-purple-500 underline mt-1"
                        onClick={() => setPriceOverride(null)}
                      >
                        Reset to calculated
                      </button>
                    )}
                  </div>
                </div>
              );
            }}
          </Form.Item>
        </Form>
      )}
    </Drawer>
  );
}

export default QuickAccommodationModal;
