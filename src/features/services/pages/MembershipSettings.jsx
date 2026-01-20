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
  Image,
  Switch,
  Checkbox,
  Slider
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

  return (
    <div className="p-6">
      <Card className="shadow-sm border-slate-200">
        <div className="flex justify-between items-center mb-6">
          <div>
            <Title level={3}>Membership Settings</Title>
            <Text type="secondary">Configure VIP memberships and subscription packages</Text>
          </div>
          <Button 
            type="primary" 
            icon={<PlusOutlined />} 
            onClick={handleCreate}
            size="large"
          >
            Add Membership
          </Button>
        </div>

        <Alert 
          message="About Memberships" 
          description="Memberships allow students to access special rates or features. Configuring 'Duration Days' sets an automatic expiration."
          type="info"
          showIcon
          className="mb-6"
        />

        <Table 
          columns={columns} 
          dataSource={offerings} 
          rowKey="id" 
          loading={loading}
          pagination={{ pageSize: 10 }}
        />
      </Card>

      <Modal
        title={editingOffering ? 'Edit Membership' : 'New Membership'}
        open={modalVisible}
        onCancel={() => setModalVisible(false)}
        onOk={() => form.submit()}
        width={1100}
        destroyOnHidden
      >
        <div className="flex gap-6">
          <div className="flex-1" style={{ maxWidth: '600px' }}>
            <Form
              form={form}
              layout="vertical"
              onFinish={handleSave}
            >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Form.Item
              name="name"
              label="Membership Name"
              rules={[{ required: true, message: 'Please enter a name' }]}
              tooltip="The main title displayed on the membership card"
            >
              <Input placeholder="e.g. VIP Gold" />
            </Form.Item>

            <Form.Item
              name="price"
              label={`Price (${businessCurrency})`}
              rules={[{ required: true, message: 'Please enter price' }]}
              tooltip="The membership cost in your business currency"
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
              tooltip="How often this membership is charged"
            >
              <Select options={PERIOD_OPTIONS} />
            </Form.Item>

             <Form.Item
              name="duration_days"
              label="Duration (Days)"
              tooltip="Leave empty for automatic renewal based on period"
            >
              <InputNumber className="w-full" min={1} placeholder="30" />
            </Form.Item>
            
            <Form.Item name="badge_color" label="Badge Color" tooltip="Color for the badge/tag on the card">
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
            
            <Form.Item name="badge" label="Badge Text" tooltip="Short text to display in the badge/ribbon (e.g., 'VIP', 'POPULAR')">
              <Input placeholder="e.g. VIP" maxLength={10} />
            </Form.Item>
            
            <Form.Item name="sort_order" label="Display Order" tooltip="Lower numbers appear first">
              <InputNumber className="w-full" min={0} />
            </Form.Item>

            <Form.Item name="highlighted" valuePropName="checked" label="Highlight as Popular" tooltip="Adds a gradient border and visual emphasis">
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
            </Form>
          </div>

          {/* Live Preview */}
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
        </div>
      </Modal>
    </div>
  );
}

export default MembershipSettings;
