import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Tabs,
  Form,
  Input,
  Switch,
  Select,
  InputNumber,
  Row,
  Col,
  Typography,
  Tooltip,
  Upload,
  ColorPicker
} from 'antd';
import {
  InfoCircleOutlined,
  PictureOutlined
} from '@ant-design/icons';
import PopupTemplates from './PopupTemplates';

const { TextArea } = Input;
const { Text } = Typography;

/**
 * PopupFormIntegration - Reusable popup form for Marketing campaign modal
 * Integrates PopupSettings functionality without the standalone page wrapper
 * 
 * @param {Object} props
 * @param {Object} props.form - Ant Design form instance
 * @param {Object} props.preview - Preview state object (not directly used, updated via handleFormChange)
 * @param {Function} props.handleFormChange - Function to update preview
 * @param {Object} props.initialData - Initial popup data for editing
 */
const PopupFormIntegration = ({ form, preview: _preview, handleFormChange, initialData = null }) => {
  const [activeTab, setActiveTab] = useState('general');

  // Initialize form with data
  useEffect(() => {
    if (initialData) {
      form.setFieldsValue({
        name: initialData.name || '',
        enabled: initialData.enabled !== false,
        targetAudience: initialData.config?.general?.targetAudience || 'all_users',
        displayFrequency: initialData.config?.general?.displayFrequency || 'once',
        priority: initialData.config?.general?.priority || 'normal',
        allowClose: initialData.config?.general?.allowClose !== false,
        autoClose: initialData.config?.general?.autoClose || 0,
        showOnPages: initialData.config?.general?.showOnPages || [],
        title: initialData.config?.content?.title || '',
        subtitle: initialData.config?.content?.subtitle || '',
        bodyText: initialData.config?.content?.bodyText || '',
        buttonText: initialData.config?.content?.buttonText || '',
        buttonUrl: initialData.config?.content?.buttonUrl || '',
        theme: initialData.config?.design?.theme || 'modern',
        position: initialData.config?.design?.position || 'center',
        animation: initialData.config?.design?.animation || 'fade',
        backgroundColor: initialData.config?.design?.backgroundColor || '#ffffff',
        textColor: initialData.config?.design?.textColor || '#000000',
        buttonColor: initialData.config?.design?.buttonColor || '#1890ff'
      });
    }
  }, [initialData, form]);

  // Image upload handler
  const handleImageUpload = useCallback((info, field) => {
    if (info.fileList.length > 0) {
      const file = info.fileList[0].originFileObj;
      const reader = new FileReader();
      reader.onload = (e) => {
        handleFormChange({ [field]: e.target.result });
      };
      reader.readAsDataURL(file);
    } else {
      handleFormChange({ [field]: '' });
    }
  }, [handleFormChange]);

  // General Settings Tab
  const GeneralTab = useMemo(() => (
    <div className="space-y-6">
      <Row gutter={16}>
        <Col span={18}>
          <Form.Item 
            name="name" 
            label="Popup Name" 
            rules={[{ required: true, message: 'Please enter popup name' }]}
          >
            <Input 
              placeholder="e.g., Welcome Popup, Special Offer" 
              className="rounded-lg"
              onChange={(e) => handleFormChange({ name: e.target.value })}
            />
          </Form.Item>
        </Col>
        <Col span={6}>
          <Form.Item name="enabled" label="Enabled" valuePropName="checked">
            <Switch 
              checkedChildren="Active" 
              unCheckedChildren="Inactive"
              onChange={(checked) => handleFormChange({ enabled: checked })}
            />
          </Form.Item>
        </Col>
      </Row>

      <Row gutter={16}>
        <Col xs={24} md={8}>
          <Form.Item name="targetAudience" label="Target Audience">
            <Select
              placeholder="Select audience"
              className="w-full"
              onChange={(value) => handleFormChange({ targetAudience: value })}
            >
              <Select.Option value="all_users">📊 All Users</Select.Option>
              <Select.Option value="new_users">✨ New Users (First Login)</Select.Option>
              <Select.Option value="returning_users">🔄 Returning Users</Select.Option>
              <Select.Option value="students">🎓 Students Only</Select.Option>
              <Select.Option value="instructors">👨‍🏫 Instructors Only</Select.Option>
              <Select.Option value="admin">👑 Admins Only</Select.Option>
            </Select>
          </Form.Item>
        </Col>
        <Col xs={24} md={8}>
          <Form.Item name="displayFrequency" label="Display Frequency">
            <Select
              placeholder="How often to show"
              onChange={(value) => handleFormChange({ displayFrequency: value })}
            >
              <Select.Option value="once">Once per user</Select.Option>
              <Select.Option value="session">Once per session</Select.Option>
              <Select.Option value="daily">Once per day</Select.Option>
              <Select.Option value="always">Every page load</Select.Option>
            </Select>
          </Form.Item>
        </Col>
        <Col xs={24} md={8}>
          <Form.Item name="priority" label="Priority">
            <Select
              placeholder="Display priority"
              onChange={(value) => handleFormChange({ priority: value })}
            >
              <Select.Option value="low">🔵 Low</Select.Option>
              <Select.Option value="normal">🟢 Normal</Select.Option>
              <Select.Option value="high">🟡 High</Select.Option>
              <Select.Option value="urgent">🔴 Urgent</Select.Option>
            </Select>
          </Form.Item>
        </Col>
      </Row>

      <Row gutter={16}>
        <Col span={12}>
          <Form.Item name="allowClose" label="Allow Close" valuePropName="checked">
            <Switch 
              checkedChildren="Users can close"
              unCheckedChildren="No close button"
              onChange={(checked) => handleFormChange({ allowClose: checked })}
            />
          </Form.Item>
        </Col>
        <Col span={12}>
          <Form.Item 
            name="autoClose" 
            label={
              <span>
                Auto Close (seconds)
                <Tooltip title="0 = manual close only">
                  <InfoCircleOutlined className="ml-2 text-gray-400" />
                </Tooltip>
              </span>
            }
          >
            <InputNumber 
              min={0} 
              max={60} 
              className="w-full"
              placeholder="0 = manual close"
              onChange={(value) => handleFormChange({ autoClose: value })}
            />
          </Form.Item>
        </Col>
      </Row>

      <Form.Item 
        name="showOnPages" 
        label={
          <span>
            Show on Pages
            <Tooltip title="Leave empty to show on all pages">
              <InfoCircleOutlined className="ml-2 text-gray-400" />
            </Tooltip>
          </span>
        }
      >
        <Select
          mode="tags"
          placeholder="Leave empty for all pages, or enter specific routes"
          className="w-full"
          onChange={(value) => handleFormChange({ showOnPages: value })}
        >
          <Select.Option value="/">/home</Select.Option>
          <Select.Option value="/dashboard">/dashboard</Select.Option>
          <Select.Option value="/calendar">/calendar</Select.Option>
          <Select.Option value="/bookings">/bookings</Select.Option>
        </Select>
      </Form.Item>
    </div>
  ), [handleFormChange]);

  // Content Tab
  const ContentTab = useMemo(() => (
    <div className="space-y-6">
      <Form.Item 
        name="title" 
        label="Title"
        rules={[{ required: true, message: 'Please enter title' }]}
      >
        <Input 
          placeholder="Welcome to Plannivo!" 
          className="rounded-lg text-lg"
          onChange={(e) => handleFormChange({ title: e.target.value })}
        />
      </Form.Item>

      <Form.Item name="subtitle" label="Subtitle">
        <Input 
          placeholder="Your planning assistant" 
          className="rounded-lg"
          onChange={(e) => handleFormChange({ subtitle: e.target.value })}
        />
      </Form.Item>

      <Form.Item name="bodyText" label="Body Content">
        <TextArea
          rows={6}
          placeholder="Enter your message here..."
          className="rounded-lg"
          onChange={(e) => handleFormChange({ bodyText: e.target.value })}
        />
      </Form.Item>

      <Row gutter={16}>
        <Col span={12}>
          <Form.Item name="buttonText" label="Button Text">
            <Input 
              placeholder="Get Started" 
              className="rounded-lg"
              onChange={(e) => handleFormChange({ buttonText: e.target.value })}
            />
          </Form.Item>
        </Col>
        <Col span={12}>
          <Form.Item name="buttonUrl" label="Button URL">
            <Input 
              placeholder="/dashboard or https://..." 
              className="rounded-lg"
              onChange={(e) => handleFormChange({ buttonUrl: e.target.value })}
            />
          </Form.Item>
        </Col>
      </Row>

      <Form.Item label="Hero Image">
        <Upload
          listType="picture-card"
          maxCount={1}
          beforeUpload={() => false}
          onChange={(info) => handleImageUpload(info, 'imageUrl')}
        >
          <div className="flex flex-col items-center">
            <PictureOutlined className="text-2xl text-gray-400" />
            <div className="mt-2 text-xs text-gray-500">Upload Image</div>
          </div>
        </Upload>
      </Form.Item>
    </div>
  ), [handleFormChange, handleImageUpload]);

  // Design Tab
  const DesignTab = useMemo(() => (
    <div className="space-y-6">
      <Row gutter={16}>
        <Col span={8}>
          <Form.Item name="theme" label="Theme">
            <Select
              placeholder="Select theme"
              onChange={(value) => handleFormChange({ theme: value })}
            >
              <Select.Option value="modern">🎨 Modern</Select.Option>
              <Select.Option value="minimal">✨ Minimal</Select.Option>
              <Select.Option value="gradient">🌈 Gradient</Select.Option>
              <Select.Option value="dark">🌙 Dark</Select.Option>
            </Select>
          </Form.Item>
        </Col>
        <Col span={8}>
          <Form.Item name="position" label="Position">
            <Select
              placeholder="Select position"
              onChange={(value) => handleFormChange({ position: value })}
            >
              <Select.Option value="center">🎯 Center</Select.Option>
              <Select.Option value="top">⬆️ Top</Select.Option>
              <Select.Option value="bottom">⬇️ Bottom</Select.Option>
              <Select.Option value="top-right">↗️ Top Right</Select.Option>
              <Select.Option value="bottom-right">↘️ Bottom Right</Select.Option>
            </Select>
          </Form.Item>
        </Col>
        <Col span={8}>
          <Form.Item name="animation" label="Animation">
            <Select
              placeholder="Select animation"
              onChange={(value) => handleFormChange({ animation: value })}
            >
              <Select.Option value="fade">Fade In</Select.Option>
              <Select.Option value="slide-up">Slide Up</Select.Option>
              <Select.Option value="slide-down">Slide Down</Select.Option>
              <Select.Option value="zoom">Zoom In</Select.Option>
              <Select.Option value="bounce">Bounce</Select.Option>
            </Select>
          </Form.Item>
        </Col>
      </Row>

      <Row gutter={16}>
        <Col span={8}>
          <Form.Item name="backgroundColor" label="Background Color">
            <ColorPicker
              showText
              className="w-full"
              onChange={(color) => handleFormChange({ bgColor: color.toHexString() })}
            />
          </Form.Item>
        </Col>
        <Col span={8}>
          <Form.Item name="textColor" label="Text Color">
            <ColorPicker
              showText
              className="w-full"
              onChange={(color) => handleFormChange({ textColor: color.toHexString() })}
            />
          </Form.Item>
        </Col>
        <Col span={8}>
          <Form.Item name="buttonColor" label="Button Color">
            <ColorPicker
              showText
              className="w-full"
              onChange={(color) => handleFormChange({ buttonColor: color.toHexString() })}
            />
          </Form.Item>
        </Col>
      </Row>
    </div>
  ), [handleFormChange]);

  // Templates Tab
  const TemplatesTab = useMemo(() => (
    <div className="space-y-4">
      <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
        <Text strong>Quick Start Templates</Text>
        <p className="text-sm text-gray-600 mt-2">
          Choose a pre-designed template to get started quickly. You can customize it after selection.
        </p>
      </div>
      <PopupTemplates 
        onSelectTemplate={(template) => {
          // Apply template to form
          form.setFieldsValue({
            title: template.title,
            subtitle: template.subtitle,
            bodyText: template.bodyText,
            buttonText: template.buttonText,
            theme: template.theme,
            backgroundColor: template.backgroundColor,
            textColor: template.textColor,
            buttonColor: template.buttonColor
          });
          
          // Update preview
          handleFormChange({
            title: template.title,
            subtitle: template.subtitle,
            bodyText: template.bodyText,
            buttonText: template.buttonText,
            bgColor: template.backgroundColor,
            textColor: template.textColor,
            buttonColor: template.buttonColor
          });
        }}
      />
    </div>
  ), [form, handleFormChange]);

  // Targeting Tab
  const TargetingTab = useMemo(() => (
    <div className="space-y-6">
      <div className="p-4 bg-gradient-to-r from-purple-50 to-pink-50 rounded-lg border border-purple-200">
        <Text strong className="text-purple-900">Advanced Targeting Rules</Text>
        <p className="text-sm text-gray-600 mt-2">
          Fine-tune who sees this popup based on user behavior, location, and more.
        </p>
      </div>

      <Form.Item label="Device Type">
        <Select
          mode="multiple"
          placeholder="Show on which devices?"
          defaultValue={['desktop', 'mobile', 'tablet']}
        >
          <Select.Option value="desktop">🖥️ Desktop</Select.Option>
          <Select.Option value="mobile">📱 Mobile</Select.Option>
          <Select.Option value="tablet">📱 Tablet</Select.Option>
        </Select>
      </Form.Item>

      <Form.Item label="User Language">
        <Select
          mode="multiple"
          placeholder="Show to which language users?"
        >
          <Select.Option value="en">🇬🇧 English</Select.Option>
          <Select.Option value="es">🇪🇸 Spanish</Select.Option>
          <Select.Option value="fr">🇫🇷 French</Select.Option>
          <Select.Option value="de">🇩🇪 German</Select.Option>
        </Select>
      </Form.Item>

      <Form.Item label="Time-based Display">
        <Select placeholder="When to show this popup?">
          <Select.Option value="immediate">Immediately on page load</Select.Option>
          <Select.Option value="delay-3">After 3 seconds</Select.Option>
          <Select.Option value="delay-5">After 5 seconds</Select.Option>
          <Select.Option value="delay-10">After 10 seconds</Select.Option>
          <Select.Option value="scroll-50">After 50% page scroll</Select.Option>
          <Select.Option value="exit-intent">On exit intent</Select.Option>
        </Select>
      </Form.Item>
    </div>
  ), []);

  return (
    <Tabs
      activeKey={activeTab}
      onChange={setActiveTab}
      type="card"
      className="modern-tabs"
      items={[
        {
          key: 'general',
          label: (
            <span className="flex items-center gap-2">
              <InfoCircleOutlined />
              General
            </span>
          ),
          children: GeneralTab
        },
        {
          key: 'content',
          label: (
            <span className="flex items-center gap-2">
              📝 Content
            </span>
          ),
          children: ContentTab
        },
        {
          key: 'design',
          label: (
            <span className="flex items-center gap-2">
              🎨 Design
            </span>
          ),
          children: DesignTab
        },
        {
          key: 'templates',
          label: (
            <span className="flex items-center gap-2">
              📋 Templates
            </span>
          ),
          children: TemplatesTab
        },
        {
          key: 'targeting',
          label: (
            <span className="flex items-center gap-2">
              🎯 Targeting
            </span>
          ),
          children: TargetingTab
        }
      ]}
    />
  );
};

export default PopupFormIntegration;
