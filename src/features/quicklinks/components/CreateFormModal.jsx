import { Drawer, Form, Input, Select, Button, Typography } from 'antd';
import {
  FormOutlined,
  RightOutlined,
  HomeOutlined,
  BookOutlined,
  CarOutlined,
  ShoppingCartOutlined,
} from '@ant-design/icons';
import { FORM_CATEGORIES } from '../utils/formHelpers';

const { Paragraph } = Typography;
const { Option } = Select;

const SERVICE_CATEGORY_OPTIONS = [
  { value: 'accommodation', label: 'Accommodation', icon: <HomeOutlined /> },
  { value: 'lesson', label: 'Lessons', icon: <BookOutlined /> },
  { value: 'rental', label: 'Rentals', icon: <CarOutlined /> },
  { value: 'shop', label: 'Shop', icon: <ShoppingCartOutlined /> },
];

const CreateFormDrawer = ({
  open,
  onCancel,
  form,
  onFinish,
}) => (
  <Drawer
    title={
      <div className="flex items-center gap-2">
        <FormOutlined className="text-indigo-500" />
        <span>Create New Form</span>
      </div>
    }
    open={open}
    onClose={onCancel}
    width={480}
    destroyOnClose
  >
    <div className="py-2">
      <Paragraph type="secondary" className="mb-4">
        Create a form, then build it with our drag-and-drop editor.
      </Paragraph>
      
      <Form form={form} layout="vertical" onFinish={onFinish}>
        <Form.Item
          name="name"
          label="Form Name"
          rules={[{ required: true, message: 'Enter a name' }]}
        >
          <Input size="large" placeholder="e.g., Instructor Application, Waiver Form" />
        </Form.Item>

        <Form.Item name="description" label="Description (optional)">
          <Input.TextArea rows={2} placeholder="What is this form for?" />
        </Form.Item>

        <Form.Item
          name="category"
          label="Category"
          rules={[{ required: true, message: 'Select a category' }]}
        >
          <Select size="large" placeholder="Select category">
            {FORM_CATEGORIES.map(cat => (
              <Option key={cat.value} value={cat.value}>{cat.label}</Option>
            ))}
          </Select>
        </Form.Item>

        <Form.Item
          name="service_category"
          label="Service Category (optional)"
        >
          <Select size="large" placeholder="Link to a service category" allowClear>
            {SERVICE_CATEGORY_OPTIONS.map(opt => (
              <Option key={opt.value} value={opt.value}>
                <span className="flex items-center gap-2">{opt.icon} {opt.label}</span>
              </Option>
            ))}
          </Select>
        </Form.Item>

        <div className="flex justify-end gap-2 mt-6">
          <Button onClick={onCancel}>Cancel</Button>
          <Button type="primary" htmlType="submit" icon={<RightOutlined />} size="large">
            Create & Open Builder
          </Button>
        </div>
      </Form>
    </div>
  </Drawer>
);

export default CreateFormDrawer;
