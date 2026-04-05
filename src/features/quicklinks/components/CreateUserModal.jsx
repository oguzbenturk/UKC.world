import { Modal, Form, Input, Select, Button } from 'antd';
import { MailOutlined } from '@ant-design/icons';

const { Option } = Select;

const CreateUserModal = ({
  open,
  onCancel,
  form,
  onFinish,
  loading,
}) => (
  <Modal
    title="Create User Account"
    open={open}
    onCancel={onCancel}
    footer={null}
    destroyOnHidden
  >
    <Form form={form} layout="vertical" onFinish={onFinish}>
      <div className="grid grid-cols-2 gap-4">
        <Form.Item
          name="first_name"
          label="First Name"
          rules={[{ required: true, message: 'Required' }]}
        >
          <Input placeholder="John" />
        </Form.Item>
        <Form.Item
          name="last_name"
          label="Last Name"
          rules={[{ required: true, message: 'Required' }]}
        >
          <Input placeholder="Doe" />
        </Form.Item>
      </div>
      
      <Form.Item
        name="email"
        label="Email"
        rules={[
          { required: true, message: 'Required' },
          { type: 'email', message: 'Invalid email' }
        ]}
      >
        <Input placeholder="john@example.com" prefix={<MailOutlined />} />
      </Form.Item>

      <Form.Item name="phone" label="Phone">
        <Input placeholder="+1234567890" />
      </Form.Item>
      
      <Form.Item
        name="role"
        label="Role"
        rules={[{ required: true, message: 'Required' }]}
      >
        <Select>
          <Option value="student">Student / Customer</Option>
          <Option value="instructor">Instructor</Option>
        </Select>
      </Form.Item>
      
      <Form.Item
        name="password"
        label="Initial Password"
        rules={[{ required: true, message: 'Required' }]}
        help="Share this password with the user."
      >
        <Input.Password placeholder="secret" />
      </Form.Item>
      
      <div className="flex justify-end gap-2 mt-4">
        <Button onClick={onCancel}>Cancel</Button>
        <Button type="primary" htmlType="submit" loading={loading}>
          Create Account
        </Button>
      </div>
    </Form>
  </Modal>
);

export default CreateUserModal;
