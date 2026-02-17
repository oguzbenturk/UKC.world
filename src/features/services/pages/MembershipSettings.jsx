import { useState, useEffect, useCallback } from 'react';
import {
  Table,
  Button,
  Modal,
  Form,
  Input,
  InputNumber,
  Select,
  Tag,
  Space,
  Card,
  Typography,
  Popconfirm,
  Badge,
  Alert,
  Upload,
  Switch,
  Checkbox,
  Slider,
  Grid
} from 'antd';
import { message } from '@/shared/utils/antdStatic';
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  UploadOutlined,
  PictureOutlined,
  CloseCircleOutlined,
  CrownOutlined,
  StarOutlined,
  TrophyOutlined,
  RocketOutlined,
  ThunderboltOutlined,
  FireOutlined,
  HeartOutlined,
  GiftOutlined
} from '@ant-design/icons';
import apiClient from '@/shared/services/apiClient';
import { useCurrency } from '@/shared/contexts/CurrencyContext';
import { usePageSEO } from '@/shared/utils/seo';
import { logger } from '@/shared/utils/logger';

const { Title, Text } = Typography;
const { TextArea } = Input;
const { useBreakpoint } = Grid;

const PERIOD_OPTIONS = [
  { value: 'month', label: 'Monthly' },
  { value: 'year', label: 'Yearly' },
  { value: 'season', label: 'Seasonal' },
  { value: 'day', label: 'Daily' },
];

const CARD_STYLE_OPTIONS = [
  { value: 'simple', label: 'Simple Card', description: 'Clean white card with icon' },
  { value: 'gradient', label: 'Gradient Header', description: 'Colored gradient header with content' },
  { value: 'image_background', label: 'Full Image', description: 'Image covers entire card' },
];

const TEXT_COLOR_OPTIONS = [
  { value: 'dark', label: 'Dark Text', color: '#1f2937' },
  { value: 'light', label: 'Light Text', color: '#ffffff' },
];

const BADGE_COLORS = [
  // Blues
  { value: 'blue', label: 'Blue', color: '#1890ff' },
  { value: 'navy', label: 'Navy', color: '#001f5c' },
  { value: 'sky', label: 'Sky Blue', color: '#0ea5e9' },
  { value: 'indigo', label: 'Indigo', color: '#4f46e5' },
  // Greens
  { value: 'green', label: 'Green', color: '#52c41a' },
  { value: 'emerald', label: 'Emerald', color: '#10b981' },
  { value: 'teal', label: 'Teal', color: '#14b8a6' },
  // Warm Colors
  { value: 'gold', label: 'Gold', color: '#faad14' },
  { value: 'orange', label: 'Orange', color: '#fa8c16' },
  { value: 'amber', label: 'Amber', color: '#f59e0b' },
  { value: 'red', label: 'Red', color: '#f5222d' },
  { value: 'rose', label: 'Rose', color: '#f43f5e' },
  { value: 'pink', label: 'Pink', color: '#ec4899' },
  // Purples
  { value: 'purple', label: 'Purple', color: '#722ed1' },
  { value: 'violet', label: 'Violet', color: '#8b5cf6' },
  { value: 'fuchsia', label: 'Fuchsia', color: '#d946ef' },
  // Others
  { value: 'cyan', label: 'Cyan', color: '#13c2c2' },
  { value: 'slate', label: 'Slate', color: '#475569' },
  { value: 'gray', label: 'Gray', color: '#6b7280' },
  { value: 'black', label: 'Black', color: '#1f2937' },
];

const ICON_OPTIONS = [
  { value: 'CrownOutlined', label: 'Crown', icon: <CrownOutlined /> },
  { value: 'StarOutlined', label: 'Star', icon: <StarOutlined /> },
  { value: 'TrophyOutlined', label: 'Trophy', icon: <TrophyOutlined /> },
  { value: 'RocketOutlined', label: 'Rocket', icon: <RocketOutlined /> },
  { value: 'ThunderboltOutlined', label: 'Lightning', icon: <ThunderboltOutlined /> },
  { value: 'FireOutlined', label: 'Fire', icon: <FireOutlined /> },
  { value: 'HeartOutlined', label: 'Heart', icon: <HeartOutlined /> },
  { value: 'GiftOutlined', label: 'Gift', icon: <GiftOutlined /> },
];

function MembershipSettings() {
  usePageSEO({ title: 'Membership Settings', description: 'Configure VIP memberships and offerings' });
  const { formatCurrency, businessCurrency } = useCurrency();
  const screens = useBreakpoint();
  const isMobile = !screens.md;
  const [offerings, setOfferings] = useState([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingOffering, setEditingOffering] = useState(null);
  const [imageUrl, setImageUrl] = useState(null);
  const [imageLoading, setImageLoading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [form] = Form.useForm();
  const [previewData, setPreviewData] = useState({});

  // Watch form values for live preview
  const formValues = Form.useWatch([], form);

  // Sync imageUrl when editing offering changes
  useEffect(() => {
    if (editingOffering && modalVisible) {
      setImageUrl(editingOffering.image_url || null);
    } else if (!modalVisible && !editingOffering) {
      // Clear imageUrl only when modal closes
      setImageUrl(null);
    }
  }, [editingOffering, modalVisible]);

  const fetchOfferings = async () => {
    setLoading(true);
    try {
      const { data } = await apiClient.get('/member-offerings');
      setOfferings(data);
    } catch (error) {
      logger.error('Failed to fetch offerings:', error);
      message.error('Failed to load memberships');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOfferings();
  }, []);

  const handleCreate = () => {
    setEditingOffering(null);
    form.resetFields();
    setImageUrl(null);
    form.setFieldsValue({
      is_active: true,
      period: 'month',
      badge_color: 'gold',
      icon: 'CrownOutlined',
      sort_order: 0,
      features: [],
      use_image_background: true,
      card_style: 'simple',
      button_text: 'Choose Plan',
      text_color: 'dark',
      gradient_opacity: 70
    });
    setModalVisible(true);
  };

  const handleEdit = (record) => {
    setEditingOffering(record);
    // imageUrl will be synced by useEffect
    form.resetFields();
    form.setFieldsValue({
      ...record,
      features: Array.isArray(record.features) ? record.features : [],
      use_image_background: record.use_image_background !== false,
      card_style: record.card_style || 'simple',
      button_text: record.button_text || 'Choose Plan',
      text_color: record.text_color || 'dark',
      gradient_opacity: record.gradient_opacity ?? 70
    });
    setModalVisible(true);
  };

  const handleDelete = async (id) => {
    try {
      await apiClient.delete(`/member-offerings/${id}`);
      message.success('Membership deactivated');
      fetchOfferings();
    } catch (error) {
      logger.error('Delete failed:', error);
      message.error('Failed to deactivate membership');
    }
  };

  const handleSave = async (values) => {
    try {
      const payload = {
        ...values,
        price: Number(values.price),
        sort_order: Number(values.sort_order),
        duration_days: values.duration_days ? Number(values.duration_days) : null,
        image_url: imageUrl,
        use_image_background: values.use_image_background !== false,
        card_style: values.card_style || 'simple',
        button_text: values.button_text || 'Choose Plan',
        gradient_color: values.gradient_color || null,
        text_color: values.text_color || 'dark',
        gradient_opacity: values.gradient_opacity ?? 70,
      };

      if (editingOffering) {
        await apiClient.put(`/member-offerings/${editingOffering.id}`, payload);
        message.success('Membership updated successfully');
      } else {
        await apiClient.post('/member-offerings', payload);
        message.success('Membership created successfully');
      }
      setModalVisible(false);
      setImageUrl(null);
      fetchOfferings();
    } catch (error) {
      logger.error('Save failed:', error);
      message.error('Failed to save membership');
    }
  };

  // Custom image upload handler using customRequest pattern
  const postMembershipImageUpload = useCallback(({ file, onSuccess, onError, onProgress }) => {
    const formData = new FormData();
    formData.append('image', file);

    // Use apiClient for authenticated upload
    apiClient.post('/upload/image', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      onUploadProgress: (progressEvent) => {
        const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
        setUploadProgress(percentCompleted);
        if (onProgress) {
          onProgress({ percent: percentCompleted });
        }
      },
    })
    .then((response) => {
      const imageUrl = response.data?.url;
      if (imageUrl) {
        setImageUrl(imageUrl);
        message.success('Image uploaded successfully');
        onSuccess(response.data);
      } else {
        throw new Error('No URL returned from server');
      }
    })
    .catch((error) => {
      logger.error('Image upload failed:', error);
      message.error('Failed to upload image');
      onError(error);
    })
    .finally(() => {
      setImageLoading(false);
      setUploadProgress(0);
    });
  }, []);

  const removeImage = () => {
    setImageUrl(null);
    message.info('Image removed');
  };

  const columns = [
    {
      title: 'Name',
      dataIndex: 'name',
      key: 'name',
      render: (text, record) => (
        <Space>
           <Badge color={record.badge_color || 'blue'} />
           <span className="font-semibold">{text}</span>
           {record.highlighted && <Tag color="gold">Highlighted</Tag>}
        </Space>
      )
    },
    {
      title: 'Price',
      dataIndex: 'price',
      key: 'price',
      render: (price) => formatCurrency(price, businessCurrency)
    },
    {
      title: 'Period',
      dataIndex: 'period',
      key: 'period',
      render: (text) => <Tag>{text ? text.toUpperCase() : 'N/A'}</Tag>
    },
    {
      title: 'Duration (Days)',
      dataIndex: 'duration_days',
      key: 'duration_days',
      render: (val) => val || 'Unlimited'
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_, record) => (
        <Space>
          <Button 
            icon={<EditOutlined />} 
            onClick={() => handleEdit(record)}
            size="small"
          >
            Edit
          </Button>
          <Popconfirm
            title="Deactivate membership?"
            description="This will hide the membership from users."
            onConfirm={() => handleDelete(record.id)}
            okText="Deactivate"
            cancelText="Cancel"
            okButtonProps={{ danger: true }}
          >
            <Button 
              icon={<DeleteOutlined />} 
              danger 
              size="small" 
            />
          </Popconfirm>
        </Space>
      )
    }
  ];

  // Mobile card component for memberships
  const MembershipCard = ({ membership }) => {
    const badgeColor = BADGE_COLORS.find(c => c.value === membership.badge_color)?.color || '#1890ff';
    const IconComponent = ICON_OPTIONS.find(i => i.value === membership.icon)?.icon || <StarOutlined />;
    
    return (
      <Card 
        className="mb-3 rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow"
        styles={{ body: { padding: 12 } }}
      >
        <div className="flex gap-3">
          {/* Icon/Badge */}
          <div 
            className="flex-shrink-0 w-12 h-12 rounded-xl flex items-center justify-center text-xl"
            style={{ backgroundColor: `${badgeColor}20`, color: badgeColor }}
          >
            {IconComponent}
          </div>
          
          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="font-semibold text-slate-900 truncate flex items-center gap-2">
                  {membership.name}
                  {membership.highlighted && (
                    <Tag color="gold" className="text-xs">Featured</Tag>
                  )}
                </div>
                <div className="text-sm text-slate-500">
                  {formatCurrency(membership.price, businessCurrency)} / {membership.period || 'month'}
                </div>
              </div>
              <Tag color={membership.badge_color || 'blue'} className="flex-shrink-0">
                {membership.period?.toUpperCase() || 'MONTH'}
              </Tag>
            </div>
            
            {/* Duration */}
            <div className="text-xs text-slate-400 mt-1">
              Duration: {membership.duration_days ? `${membership.duration_days} days` : 'Unlimited'}
            </div>
            
            {/* Features preview */}
            {membership.features?.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {membership.features.slice(0, 2).map((f, i) => (
                  <Tag key={i} className="text-xs" color="default">{f}</Tag>
                ))}
                {membership.features.length > 2 && (
                  <Tag className="text-xs" color="default">+{membership.features.length - 2}</Tag>
                )}
              </div>
            )}
            
            {/* Actions */}
            <div className="flex gap-2 mt-3 pt-2 border-t border-slate-100">
              <Button 
                icon={<EditOutlined />} 
                size="small"
                onClick={() => handleEdit(membership)}
                className="flex-1"
              >
                Edit
              </Button>
              <Popconfirm
                title="Deactivate membership?"
                description="This will hide the membership from users."
                onConfirm={() => handleDelete(membership.id)}
                okText="Deactivate"
                cancelText="Cancel"
                okButtonProps={{ danger: true }}
              >
                <Button icon={<DeleteOutlined />} size="small" danger />
              </Popconfirm>
            </div>
          </div>
        </div>
      </Card>
    );
  };

  return (
    <div className="p-4 md:p-6">
      <Card className="shadow-sm border-slate-200 rounded-xl md:rounded-2xl">
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 mb-4 md:mb-6">
          <div>
            <Title level={isMobile ? 4 : 3} className="!mb-1">Membership Settings</Title>
            <Text type="secondary" className="text-sm hidden sm:block">Configure VIP memberships and subscription packages</Text>
          </div>
          <Button 
            type="primary" 
            icon={<PlusOutlined />} 
            onClick={handleCreate}
            size={isMobile ? 'middle' : 'large'}
          >
            {isMobile ? 'Add' : 'Add Membership'}
          </Button>
        </div>

        <Alert 
          message="About Memberships" 
          description={isMobile ? "Configure membership duration and pricing." : "Memberships allow students to access special rates or features. Configuring 'Duration Days' sets an automatic expiration."}
          type="info"
          showIcon
          className="mb-4 md:mb-6"
        />

        {isMobile ? (
          // Mobile: Card View
          <div>
            <div className="text-xs text-slate-500 mb-2">{offerings.length} membership{offerings.length !== 1 ? 's' : ''}</div>
            {offerings.length === 0 ? (
              <div className="text-center py-8 text-slate-400">No memberships yet</div>
            ) : (
              offerings.map(m => <MembershipCard key={m.id} membership={m} />)
            )}
          </div>
        ) : (
          // Desktop: Table View
          <Table 
            columns={columns} 
            dataSource={offerings} 
            rowKey="id" 
            loading={loading}
            pagination={{ pageSize: 10 }}
            scroll={{ x: 600 }}
          />
        )}
      </Card>

      <Modal
        title={null}
        open={modalVisible}
        onCancel={() => {
          setModalVisible(false);
          setEditingOffering(null);
          setImageUrl(null);
          form.resetFields();
        }}
        footer={null}
        width={isMobile ? '100%' : 1100}
        style={isMobile ? { top: 20, margin: '0 10px' } : undefined}
        destroyOnHidden
        className="clean-modal-override"
        closeIcon={<div className="bg-white/10 hover:bg-white/20 w-7 h-7 flex items-center justify-center rounded-full text-white transition-colors">×</div>}
        styles={{
          content: { padding: 0, borderRadius: '16px', overflow: 'hidden', backgroundColor: '#f8fafc' },
          body: { padding: 0 }
        }}
      >
        <div className="bg-gradient-to-r from-violet-600 to-indigo-600 px-6 py-5 border-b border-violet-500/30">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-white/20 backdrop-blur-sm flex items-center justify-center text-lg shadow-sm ring-1 ring-white/10">
              {editingOffering ? '✏️' : '✨'}
            </div>
            <div>
              <h2 className="text-lg font-bold text-white leading-tight">
                {editingOffering ? 'Edit Membership' : 'New Membership'}
              </h2>
              <p className="text-violet-100/90 text-xs mt-0.5">
                Configure membership details, visuals, and pricing.
              </p>
            </div>
          </div>
        </div>

        <div className={`p-6 flex ${isMobile ? 'flex-col' : 'gap-6'}`}>
          <div className="flex-1" style={{ maxWidth: isMobile ? '100%' : '600px' }}>
            <Form
              form={form}
              layout="vertical"
              onFinish={handleSave}
              requiredMark={false}
              className="package-creator-form"
            >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
            <Form.Item
              name="name"
              label="Membership Name"
              rules={[{ required: true, message: 'Please enter a name' }]}
              tooltip={!isMobile ? "The main title displayed on the membership card" : undefined}
            >
              <Input placeholder="e.g. VIP Gold" />
            </Form.Item>

            <Form.Item
              name="price"
              label={`Price (${businessCurrency})`}
              rules={[{ required: true, message: 'Please enter price' }]}
            >
              <InputNumber 
                className="w-full" 
                min={0} 
                precision={2}
                prefix={businessCurrency === 'EUR' ? '€' : businessCurrency} 
              />
            </Form.Item>

            <Form.Item
              name="period"
              label="Billing Period"
              rules={[{ required: true, message: 'Select period' }]}
            >
              <Select options={PERIOD_OPTIONS} />
            </Form.Item>

             <Form.Item
              name="duration_days"
              label={isMobile ? 'Duration (Days)' : 'Duration (Days)'}
            >
              <InputNumber className="w-full" min={1} placeholder="30" />
            </Form.Item>
            
            <Form.Item name="badge_color" label="Badge Color">
              <Select 
                options={BADGE_COLORS}
                optionRender={(option) => (
                  <Space>
                    <div style={{ 
                      width: '16px', 
                      height: '16px', 
                      borderRadius: '4px', 
                      backgroundColor: option.data.color,
                      border: '1px solid #d9d9d9'
                    }} />
                    {option.data.label}
                  </Space>
                )}
              />
            </Form.Item>
            
            <Form.Item name="badge" label="Badge Text">
              <Input placeholder="e.g. VIP" maxLength={10} />
            </Form.Item>
            
            <Form.Item name="sort_order" label="Display Order">
              <InputNumber className="w-full" min={0} />
            </Form.Item>

            <Form.Item name="highlighted" valuePropName="checked" label={isMobile ? 'Featured' : 'Highlight as Popular'}>
              <Checkbox>Featured</Checkbox>
            </Form.Item>
          </div>

          <Form.Item name="description" label="Description" tooltip="Brief description shown on the card">
            <TextArea rows={2} placeholder="Short description for the card" maxLength={150} showCount />
          </Form.Item>

          <Form.Item 
            label="Card Image" 
            tooltip="Upload a custom designed image (recommended 400x250px)"
            extra="This will be displayed on the membership card"
          >
            <div className="flex items-start gap-4">
              {imageUrl ? (
                <div className="relative group">
                  <img
                    src={imageUrl}
                    alt="Card preview"
                    style={{ 
                      width: '200px',
                      height: '125px',
                      objectFit: 'cover', 
                      borderRadius: '8px', 
                      border: '1px solid #e5e7eb' 
                    }}
                  />
                  <Button
                    type="text"
                    danger
                    icon={<CloseCircleOutlined />}
                    onClick={removeImage}
                    className="absolute -top-2 -right-2 bg-white shadow-sm rounded-full"
                    size="small"
                  />
                </div>
              ) : (
                <Upload
                  name="image"
                  listType="picture-card"
                  showUploadList={false}
                  customRequest={postMembershipImageUpload}
                  accept="image/*"
                  beforeUpload={(file) => {
                    const isImage = file.type.startsWith('image/');
                    if (!isImage) {
                      message.error('You can only upload image files!');
                    }
                    const isLt5M = file.size / 1024 / 1024 < 5;
                    if (!isLt5M) {
                      message.error('Image must be smaller than 5MB!');
                    }
                    setImageLoading(isImage && isLt5M);
                    return isImage && isLt5M;
                  }}
                >
                  <div className="flex flex-col items-center justify-center p-2">
                    {imageLoading ? (
                      <>
                        <span className="text-xs">Uploading...</span>
                        {uploadProgress > 0 && (
                          <span className="text-xs text-blue-500">{uploadProgress}%</span>
                        )}
                      </>
                    ) : (
                      <>
                        <UploadOutlined className="text-2xl mb-1" />
                        <span className="text-xs text-center">Upload Image</span>
                      </>
                    )}
                  </div>
                </Upload>
              )}
            </div>
          </Form.Item>

          <Form.Item
            name="use_image_background"
            label="Display Mode"
            valuePropName="checked"
            tooltip="Choose how the image is displayed on the card"
            extra="Background: Image fills the entire card. Inline: Image shown as content within card."
            hidden={!imageUrl}
          >
            <Switch 
              checkedChildren="Background" 
              unCheckedChildren="Inline"
              disabled={!imageUrl}
            />
          </Form.Item>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Form.Item
              name="card_style"
              label="Card Style"
              tooltip="Choose the visual template for this card"
            >
              <Select
                options={CARD_STYLE_OPTIONS}
                optionRender={(option) => (
                  <div>
                    <div className="font-medium">{option.data.label}</div>
                    <div className="text-xs text-gray-500">{option.data.description}</div>
                  </div>
                )}
              />
            </Form.Item>

            <Form.Item
              name="button_text"
              label="Button Text"
              tooltip="Text displayed on the action button"
            >
              <Input placeholder="e.g. Get Started, Choose Plan" maxLength={30} />
            </Form.Item>

            <Form.Item
              name="gradient_color"
              label="Gradient Color"
              tooltip="Second color for gradient style headers"
              extra={formValues?.card_style === 'gradient' ? 'Works with badge color' : 'Only used with Gradient Header style'}
            >
              <Select 
                allowClear
                placeholder="Select gradient color"
                options={BADGE_COLORS}
                optionRender={(option) => (
                  <Space>
                    <div style={{ 
                      width: '16px', 
                      height: '16px', 
                      borderRadius: '4px', 
                      backgroundColor: option.data.color,
                      border: '1px solid #d9d9d9'
                    }} />
                    {option.data.label}
                  </Space>
                )}
              />
            </Form.Item>

            <Form.Item
              name="text_color"
              label="Text Color"
              tooltip="Choose light text for dark backgrounds"
            >
              <Select
                options={TEXT_COLOR_OPTIONS}
                optionRender={(option) => (
                  <Space>
                    <div style={{ 
                      width: '16px', 
                      height: '16px', 
                      borderRadius: '4px', 
                      backgroundColor: option.data.color,
                      border: '1px solid #d9d9d9'
                    }} />
                    {option.data.label}
                  </Space>
                )}
              />
            </Form.Item>
          </div>

          {(formValues?.card_style === 'gradient' || formValues?.card_style === 'image_background') && imageUrl && (
            <Form.Item
              name="gradient_opacity"
              label="Overlay Transparency"
              tooltip="Adjust how visible the image is behind the gradient/overlay. Lower = more image visible, Higher = more overlay"
              extra={`Current: ${formValues?.gradient_opacity || 70}% overlay`}
            >
              <Slider
                min={0}
                max={100}
                marks={{
                  0: 'Clear',
                  30: 'Light',
                  50: 'Medium',
                  70: 'Strong',
                  100: 'Solid'
                }}
                defaultValue={70}
              />
            </Form.Item>
          )}

          <Form.Item name="features" label="Features" tooltip="Benefits included with this membership">
             <Select 
               mode="tags" 
               placeholder="Type a feature and press enter" 
               tokenSeparators={[',']}
               maxTagCount="responsive"
             />
          </Form.Item>
          
          <Form.Item name="icon" label="Card Icon" tooltip="Select an icon to display on the membership card">
            <Select
              placeholder="Select an icon"
              options={ICON_OPTIONS}
              optionRender={(option) => (
                <Space>
                  {option.data.icon}
                  {option.data.label}
                </Space>
              )}
            />
          </Form.Item>

          <Form.Item className="!mb-0">
            <div className="flex justify-end gap-3 pt-4 border-t border-slate-200">
              <Button
                onClick={() => {
                  setModalVisible(false);
                  setEditingOffering(null);
                  setImageUrl(null);
                  form.resetFields();
                }}
                className="rounded-lg !px-5"
              >
                Cancel
              </Button>
              <Button
                type="primary"
                htmlType="submit"
                className="rounded-lg bg-gradient-to-r from-violet-600 to-indigo-600 border-0 shadow-md hover:shadow-lg transition-all !px-6"
              >
                {editingOffering ? 'Update Membership' : 'Create Membership'}
              </Button>
            </div>
          </Form.Item>
            </Form>
          </div>

          {/* Live Preview - Hidden on mobile */}
          {!isMobile && (
          <div className="flex-shrink-0" style={{ width: '380px', borderLeft: '1px solid #f0f0f0', paddingLeft: '24px' }}>
            <Text strong className="block mb-3">Live Preview</Text>
            <div style={{ position: 'sticky', top: '20px' }}>
              {formValues?.card_style === 'image_background' && imageUrl ? (
                // Full Image Background Style
                <div style={{
                  borderRadius: '16px',
                  overflow: 'hidden',
                  boxShadow: '0 4px 16px rgba(0,0,0,0.1)',
                  position: 'relative',
                  minHeight: '280px',
                }}>
                  <div style={{
                    backgroundImage: `url(${imageUrl})`,
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                    minHeight: '280px',
                    display: 'flex',
                    flexDirection: 'column',
                  }}>
                    <div style={{
                      position: 'absolute',
                      bottom: 0,
                      left: 0,
                      right: 0,
                      height: '60%',
                      background: 'linear-gradient(to top, rgba(0,0,0,0.8) 0%, rgba(0,0,0,0) 100%)',
                    }} />
                    <div style={{
                      marginTop: 'auto',
                      padding: '16px',
                      position: 'relative',
                      zIndex: 1,
                      color: 'white',
                    }}>
                      <div style={{ fontSize: '20px', fontWeight: '700', marginBottom: '4px' }}>
                        {formValues?.name || 'Membership Name'}
                      </div>
                      <div style={{ fontSize: '24px', fontWeight: '800' }}>
                        {formatCurrency(formValues?.price || 0, businessCurrency)}
                      </div>
                      <Button size="small" style={{ marginTop: '8px' }}>{formValues?.button_text || 'Get Started'}</Button>
                    </div>
                  </div>
                </div>
              ) : formValues?.card_style === 'gradient' ? (
                // Gradient Header Style
                <div style={{
                  borderRadius: '16px',
                  overflow: 'hidden',
                  boxShadow: '0 4px 16px rgba(0,0,0,0.1)',
                  backgroundColor: '#fff',
                }}>
                  {/* Gradient Header - with optional image */}
                  <div style={{
                    position: 'relative',
                    padding: '24px 20px',
                    textAlign: 'center',
                    color: '#fff',
                  }}>
                    {/* Background Image Layer */}
                    {imageUrl && (
                      <div style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        backgroundImage: `url(${imageUrl})`,
                        backgroundSize: 'cover',
                        backgroundPosition: 'center',
                        zIndex: 0,
                      }} />
                    )}
                    {/* Gradient Overlay Layer */}
                    <div style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      right: 0,
                      bottom: 0,
                      background: `linear-gradient(135deg, ${BADGE_COLORS.find(c => c.value === formValues?.badge_color)?.color || '#667eea'} 0%, ${BADGE_COLORS.find(c => c.value === formValues?.gradient_color)?.color || '#764ba2'} 100%)`,
                      opacity: imageUrl ? (formValues?.gradient_opacity ?? 70) / 100 : 1,
                      zIndex: 1,
                    }} />
                    {formValues?.badge && (
                      <div style={{
                        position: 'absolute',
                        top: '12px',
                        left: '50%',
                        transform: 'translateX(-50%)',
                        background: 'rgba(255,255,255,0.2)',
                        padding: '4px 12px',
                        borderRadius: '12px',
                        fontSize: '10px',
                        fontWeight: '600',
                        textTransform: 'uppercase',
                        letterSpacing: '1px',
                        zIndex: 2,
                      }}>
                        ⚡ {formValues.badge}
                      </div>
                    )}
                    <div style={{ 
                      width: '48px', 
                      height: '48px', 
                      background: 'rgba(255,255,255,0.2)', 
                      borderRadius: '12px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      margin: formValues?.badge ? '24px auto 12px' : '0 auto 12px',
                      fontSize: '24px',
                      position: 'relative',
                      zIndex: 2,
                    }}>
                      {ICON_OPTIONS.find(i => i.value === formValues?.icon)?.icon || <StarOutlined />}
                    </div>
                    <div style={{ fontSize: '18px', fontWeight: '700', position: 'relative', zIndex: 2 }}>
                      {formValues?.name || 'Membership Name'}
                    </div>
                    <div style={{ fontSize: '12px', opacity: 0.9, marginTop: '4px', position: 'relative', zIndex: 2 }}>
                      {formValues?.description || 'Add a description...'}
                    </div>
                  </div>
                  {/* Card Body */}
                  <div style={{ padding: '20px' }}>
                    <div style={{ textAlign: 'center', marginBottom: '16px' }}>
                      <div style={{ fontSize: '28px', fontWeight: '800', color: '#1f2937' }}>
                        {formatCurrency(formValues?.price || 0, businessCurrency)}
                      </div>
                      <div style={{ fontSize: '12px', color: '#6b7280' }}>
                        per {formValues?.period || 'month'}
                      </div>
                    </div>
                    {formValues?.features?.length > 0 && (
                      <div style={{ marginBottom: '16px' }}>
                        {formValues.features.slice(0, 4).map((f, i) => (
                          <div key={i} style={{ fontSize: '13px', color: '#4b5563', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ color: BADGE_COLORS.find(c => c.value === formValues?.badge_color)?.color || '#52c41a' }}>✓</span> {f}
                          </div>
                        ))}
                      </div>
                    )}
                    <Button 
                      type="primary" 
                      block
                      style={{ 
                        borderRadius: '8px',
                        height: '40px',
                        fontWeight: '600',
                        background: BADGE_COLORS.find(c => c.value === formValues?.badge_color)?.color || '#667eea',
                        borderColor: BADGE_COLORS.find(c => c.value === formValues?.badge_color)?.color || '#667eea',
                      }}
                    >
                      {formValues?.button_text || 'Get Started Now'}
                    </Button>
                  </div>
                </div>
              ) : (
                // Simple Card Style (Default)
                <div style={{
                  background: formValues?.highlighted ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' : '#fff',
                  borderRadius: '16px',
                  padding: formValues?.highlighted ? '2px' : '0',
                  boxShadow: '0 4px 16px rgba(0,0,0,0.1)',
                }}>
                  <div style={{
                    background: '#fff',
                    borderRadius: formValues?.highlighted ? '14px' : '16px',
                    padding: '20px',
                    textAlign: 'center',
                  }}>
                    {/* Icon */}
                    <div style={{ 
                      width: '48px', 
                      height: '48px', 
                      background: `${BADGE_COLORS.find(c => c.value === formValues?.badge_color)?.color || '#f0f0f0'}20`, 
                      borderRadius: '12px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      margin: '0 auto 12px',
                      fontSize: '24px',
                      color: BADGE_COLORS.find(c => c.value === formValues?.badge_color)?.color || '#667eea',
                    }}>
                      {ICON_OPTIONS.find(i => i.value === formValues?.icon)?.icon || <StarOutlined />}
                    </div>
                    {imageUrl && formValues?.card_style !== 'image_background' && (
                      <div style={{ marginBottom: '12px', borderRadius: '8px', overflow: 'hidden' }}>
                        <img src={imageUrl} alt="preview" style={{ width: '100%', height: 'auto', maxHeight: '100px', objectFit: 'cover' }} />
                      </div>
                    )}
                    <div style={{ fontSize: '18px', fontWeight: '700', marginBottom: '4px', color: formValues?.text_color === 'light' ? '#fff' : '#1f2937' }}>
                      {formValues?.name || 'Membership Name'}
                    </div>
                    <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '12px' }}>
                      {formValues?.description || 'Add a description...'}
                    </div>
                    <div style={{ fontSize: '28px', fontWeight: '800', color: formValues?.text_color === 'light' ? '#fff' : '#1f2937', marginBottom: '4px' }}>
                      {formatCurrency(formValues?.price || 0, businessCurrency)}
                    </div>
                    <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '16px' }}>
                      per {formValues?.period || 'month'}
                    </div>
                    {formValues?.features?.length > 0 && (
                      <div style={{ marginBottom: '16px', textAlign: 'left' }}>
                        {formValues.features.slice(0, 4).map((f, i) => (
                          <div key={i} style={{ fontSize: '12px', color: '#4b5563', marginBottom: '4px' }}>
                            <span style={{ color: '#52c41a' }}>✓</span> {f}
                          </div>
                        ))}
                      </div>
                    )}
                    <Button 
                      type={formValues?.highlighted ? 'primary' : 'default'} 
                      block
                      style={{ borderRadius: '8px', height: '36px' }}
                    >
                      {formValues?.button_text || 'Choose Plan'}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
          )}
        </div>

        <style>{`
          .package-creator-form .ant-form-item-label > label {
            color: #334155;
            font-weight: 600;
          }
          .package-creator-form .ant-input,
          .package-creator-form .ant-input-number,
          .package-creator-form .ant-input-number-group-addon,
          .package-creator-form .ant-select-selector {
            border-radius: 10px !important;
          }
        `}</style>
      </Modal>
    </div>
  );
}

export default MembershipSettings;
