import { Drawer, Form, Input, Select, Button, DatePicker, InputNumber, Row, Col, Space, Switch, Divider } from 'antd';
import {
  EditOutlined,
  HomeOutlined,
  BookOutlined,
  CarOutlined,
  ShoppingCartOutlined,
  CreditCardOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';

const { Option } = Select;

const EditLinkDrawer = ({
  open,
  onCancel,
  form,
  onFinish,
  selectedLink,
  accommodations,
  lessons,
  rentals,
  shopProducts,
}) => (
  <Drawer
    title={
      <div className="flex items-center gap-2">
        <EditOutlined className="text-blue-500" />
        <span>Edit Link</span>
      </div>
    }
    open={open}
    onClose={onCancel}
    width={520}
    destroyOnHidden
  >
    <div className="py-2">
      <Form form={form} layout="vertical" onFinish={onFinish}>
        <Form.Item
          name="name"
          label="Link Name"
          rules={[{ required: true, message: 'Enter a name' }]}
        >
          <Input size="large" placeholder="e.g., Instructor Application 2026" />
        </Form.Item>

        {selectedLink && selectedLink.service_type && (
          <>
            <Form.Item name="service_type" label="Service Type">
              <Select size="large" disabled>
                <Option value="accommodation">
                  <Space><HomeOutlined /> Accommodation</Space>
                </Option>
                <Option value="lesson">
                  <Space><BookOutlined /> Lessons</Space>
                </Option>
                <Option value="rental">
                  <Space><CarOutlined /> Rentals</Space>
                </Option>
                <Option value="shop">
                  <Space><ShoppingCartOutlined /> Shop</Space>
                </Option>
              </Select>
            </Form.Item>

            <Form.Item noStyle shouldUpdate={(prevValues, currentValues) => prevValues.service_type !== currentValues.service_type}>
              {({ getFieldValue }) => {
                const serviceType = getFieldValue('service_type');
                if (!serviceType) return null;

                let items = [];
                let label = '';
                
                if (serviceType === 'accommodation') { items = accommodations; label = 'Select Accommodation'; }
                else if (serviceType === 'lesson') { items = lessons; label = 'Select Lesson'; }
                else if (serviceType === 'rental') { items = rentals; label = 'Select Rental'; }
                else if (serviceType === 'shop') { items = shopProducts; label = 'Select Product'; }

                return (
                  <Form.Item
                    name="service_id"
                    label={label}
                    rules={[{ required: true, message: `Please select a ${serviceType}` }]}
                  >
                    <Select 
                      size="large" 
                      placeholder={`Choose specific ${serviceType}...`}
                      showSearch
                      filterOption={(input, option) =>
                        option.children.toLowerCase().includes(input.toLowerCase())
                      }
                    >
                      {items.map(item => (
                        <Option key={item.id} value={item.id}>{item.name || item.title}</Option>
                      ))}
                    </Select>
                  </Form.Item>
                );
              }}
            </Form.Item>
          </>
        )}

        {/* Payment toggle for service links */}
        {selectedLink && selectedLink.link_type === 'service' && (
          <>
            <Divider className="!my-3" />
            <div className="bg-gradient-to-br from-emerald-50 to-green-50 rounded-xl p-4 mb-4 border border-emerald-100">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CreditCardOutlined className="text-emerald-600 text-lg" />
                  <div>
                    <div className="font-semibold text-gray-800 text-sm">Require Payment</div>
                    <div className="text-xs text-gray-500">Customer pays via Iyzico</div>
                  </div>
                </div>
                <Form.Item name="require_payment" valuePropName="checked" className="!mb-0">
                  <Switch />
                </Form.Item>
              </div>
            </div>
          </>
        )}

        <Form.Item name="description" label="Description (optional)">
          <Input.TextArea size="large" rows={3} placeholder="Add details about what this link is for..." />
        </Form.Item>

        <Row gutter={16}>
          <Col span={12}>
            <Form.Item name="expires_at" label="Expires (optional)">
              <DatePicker 
                className="w-full" 
                size="large"
                placeholder="Never"
                disabledDate={(current) => current && current < dayjs().startOf('day')}
              />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="max_uses" label="Max responses (optional)">
              <InputNumber className="w-full" size="large" min={1} placeholder="Unlimited" />
            </Form.Item>
          </Col>
        </Row>

        <div className="flex justify-end gap-2 mt-4">
          <Button onClick={onCancel}>Cancel</Button>
          <Button type="primary" htmlType="submit" icon={<EditOutlined />} size="large">
            Update Link
          </Button>
        </div>
      </Form>
    </div>
  </Drawer>
);

export default EditLinkDrawer;
