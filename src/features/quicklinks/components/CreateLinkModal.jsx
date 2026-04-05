import { Drawer, Form, Input, Select, Button, DatePicker, InputNumber, Row, Col, Space, Typography, Segmented, Switch, Divider, Alert } from 'antd';
import {
  ShareAltOutlined,
  LinkOutlined,
  HomeOutlined,
  BookOutlined,
  CarOutlined,
  ShoppingCartOutlined,
  UserAddOutlined,
  DollarOutlined,
  CreditCardOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';

const { Text } = Typography;
const { Option } = Select;

const LINK_TYPE_OPTIONS = [
  { value: 'registration', label: 'Registration', icon: <UserAddOutlined /> },
  { value: 'service', label: 'Service Buy Link', icon: <DollarOutlined /> },
];

const CreateLinkDrawer = ({
  open,
  onCancel,
  form,
  onFinish,
  selectedFormForLink,
  setSelectedServiceType,
  accommodations,
  lessons,
  rentals,
  shopProducts,
}) => {
  // Determine if form link mode
  const isFormLink = !!selectedFormForLink;

  return (
    <Drawer
      title={
        <div className="flex items-center gap-2">
          <ShareAltOutlined className="text-green-500" />
          <span>{isFormLink ? 'Create Form Link' : 'Create Shareable Link'}</span>
        </div>
      }
      open={open}
      onClose={onCancel}
      width={520}
      destroyOnClose
    >
      <div className="py-2">
        {selectedFormForLink && (
          <div className="bg-indigo-50 rounded-lg p-3 mb-4">
            <Text type="secondary">Creating link for:</Text>
            <div className="font-medium text-indigo-700">{selectedFormForLink.name}</div>
          </div>
        )}
        
        <Form form={form} layout="vertical" onFinish={onFinish}>
          <Form.Item name="form_template_id" hidden>
            <Input />
          </Form.Item>

          {/* Link Type selector — only when not creating form link */}
          {!isFormLink && (
            <Form.Item
              name="link_type"
              label="Link Type"
              rules={[{ required: true, message: 'Select a link type' }]}
              initialValue="registration"
            >
              <Segmented
                block
                size="large"
                options={LINK_TYPE_OPTIONS.map(opt => ({
                  value: opt.value,
                  label: (
                    <div className="flex items-center justify-center gap-2 py-1">
                      {opt.icon}
                      <span>{opt.label}</span>
                    </div>
                  ),
                }))}
                onChange={() => {
                  form.setFieldsValue({ service_type: undefined, service_id: undefined, require_payment: false });
                  setSelectedServiceType(null);
                }}
              />
            </Form.Item>
          )}

          <Form.Item
            name="name"
            label="Link Name"
            rules={[{ required: true, message: 'Enter a name' }]}
          >
            <Input size="large" placeholder="e.g., Summer Camp Registration 2026" />
          </Form.Item>

          {/* Service type & service selection — for all non-form links */}
          {!isFormLink && (
            <>
              <Form.Item
                name="service_type"
                label="Service Type"
                rules={[{ required: true, message: 'Select a service type' }]}
              >
                <Select 
                  size="large" 
                  placeholder="Select service type"
                  onChange={(value) => {
                    setSelectedServiceType(value);
                    form.setFieldsValue({ service_id: undefined });
                  }}
                >
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

              <Form.Item noStyle shouldUpdate={(prev, cur) => prev.service_type !== cur.service_type}>
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

          {/* Payment toggle — only for Service Buy Link */}
          <Form.Item noStyle shouldUpdate={(prev, cur) => prev.link_type !== cur.link_type}>
            {({ getFieldValue }) => {
              const linkType = getFieldValue('link_type');
              if (isFormLink || linkType !== 'service') return null;

              return (
                <>
                  <Divider className="!my-3" />
                  <div className="bg-gradient-to-br from-emerald-50 to-green-50 rounded-xl p-4 mb-4 border border-emerald-100">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <CreditCardOutlined className="text-emerald-600 text-lg" />
                        <div>
                          <div className="font-semibold text-gray-800 text-sm">Require Payment</div>
                          <div className="text-xs text-gray-500">Customer pays via Iyzico before registration</div>
                        </div>
                      </div>
                      <Form.Item name="require_payment" valuePropName="checked" className="!mb-0">
                        <Switch />
                      </Form.Item>
                    </div>

                    <Form.Item noStyle shouldUpdate={(prev, cur) => prev.require_payment !== cur.require_payment}>
                      {({ getFieldValue: gfv }) => {
                        if (!gfv('require_payment')) return null;
                        return (
                          <Alert
                            type="info"
                            showIcon
                            className="!mt-2"
                            message="Payment will be processed via Iyzico"
                            description="The customer will be redirected to a secure Iyzico payment page. The service price from your catalog will be used."
                          />
                        );
                      }}
                    </Form.Item>
                  </div>
                </>
              );
            }}
          </Form.Item>

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
            <Form.Item noStyle shouldUpdate>
              {({ getFieldValue }) => {
                const linkType = getFieldValue('link_type');
                const requirePayment = getFieldValue('require_payment');
                const icon = (!isFormLink && linkType === 'service' && requirePayment)
                  ? <CreditCardOutlined />
                  : <LinkOutlined />;
                const label = (!isFormLink && linkType === 'service' && requirePayment)
                  ? 'Create Payment Link'
                  : 'Create Link';
                return (
                  <Button type="primary" htmlType="submit" icon={icon} size="large">
                    {label}
                  </Button>
                );
              }}
            </Form.Item>
          </div>
        </Form>
      </div>
    </Drawer>
  );
};

export default CreateLinkDrawer;
