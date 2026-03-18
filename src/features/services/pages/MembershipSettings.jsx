import { useState, useEffect, useCallback } from 'react';
import {
  Table,
  Button,
  Form,
  Input,
  InputNumber,
  Select,
  Tag,
  Space,
  Card,
  Popconfirm,
  Badge,
  Alert,
  Upload,
  Switch,
  Checkbox,
  Slider,
  Grid,
  Drawer,
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
            <h3 className={`${isMobile ? 'text-lg' : 'text-xl'} font-semibold text-slate-900 !mb-1`}>Membership Settings</h3>
            <p className="text-sm text-slate-500 hidden sm:block">Configure VIP memberships and subscription packages</p>
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

      <Drawer
        open={modalVisible}
        onClose={() => {
          setModalVisible(false);
          setEditingOffering(null);
          setImageUrl(null);
          form.resetFields();
        }}
        width={isMobile ? '100%' : 520}
        closable={false}
        destroyOnHidden
        styles={{ body: { padding: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }, header: { display: 'none' } }}
      >
        {/* ── Sticky Header ── */}
        <div className="flex-shrink-0 bg-gradient-to-r from-violet-600 to-indigo-600 px-5 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center text-lg shadow-sm ring-1 ring-white/10">
                {editingOffering ? '✏️' : '✨'}
              </div>
              <div>
                <h2 className="text-base font-bold text-white leading-tight">
                  {editingOffering ? 'Edit Membership' : 'New Membership'}
                </h2>
                <p className="text-violet-200 text-xs mt-0.5">Configure details, visuals & pricing</p>
              </div>
            </div>
            <button
              onClick={() => { setModalVisible(false); setEditingOffering(null); setImageUrl(null); form.resetFields(); }}
              className="w-8 h-8 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white border-0 cursor-pointer transition-colors text-base"
            >
              ×
            </button>
          </div>
        </div>

        {/* ── Scrollable Content ── */}
        <div className="flex-1 overflow-y-auto">
          {/* Live Preview Card */}
          <div className="px-5 pt-5 pb-3">
            <div className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">Preview</div>
            <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
              {formValues?.card_style === 'image_background' && imageUrl ? (
                <div className="relative" style={{ minHeight: 160 }}>
                  <div style={{ backgroundImage: `url(${imageUrl})`, backgroundSize: 'cover', backgroundPosition: 'center', minHeight: 160, display: 'flex', flexDirection: 'column' }}>
                    <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '70%', background: 'linear-gradient(to top, rgba(0,0,0,0.8) 0%, rgba(0,0,0,0) 100%)' }} />
                    <div style={{ marginTop: 'auto', padding: 16, position: 'relative', zIndex: 1, color: 'white' }}>
                      <div className="text-lg font-bold">{formValues?.name || 'Membership Name'}</div>
                      <div className="text-2xl font-extrabold mt-1">{formatCurrency(formValues?.price || 0, businessCurrency)}</div>
                      <div className="text-xs opacity-80 mt-0.5">per {formValues?.period || 'month'}</div>
                    </div>
                  </div>
                </div>
              ) : formValues?.card_style === 'gradient' ? (
                <div>
                  <div className="relative text-center py-5 px-4" style={{ color: '#fff', minHeight: 100 }}>
                    {imageUrl && <div style={{ position: 'absolute', inset: 0, backgroundImage: `url(${imageUrl})`, backgroundSize: 'cover', backgroundPosition: 'center', zIndex: 0 }} />}
                    <div style={{ position: 'absolute', inset: 0, background: `linear-gradient(135deg, ${BADGE_COLORS.find(c => c.value === formValues?.badge_color)?.color || '#667eea'} 0%, ${BADGE_COLORS.find(c => c.value === formValues?.gradient_color)?.color || '#764ba2'} 100%)`, opacity: imageUrl ? (formValues?.gradient_opacity ?? 70) / 100 : 1, zIndex: 1 }} />
                    {formValues?.badge && (
                      <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[2] bg-white/20 px-3 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider">
                        ⚡ {formValues.badge}
                      </div>
                    )}
                    <div className="relative z-[2]" style={{ marginTop: formValues?.badge ? 20 : 0 }}>
                      <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center text-xl mx-auto mb-2">
                        {ICON_OPTIONS.find(i => i.value === formValues?.icon)?.icon || <StarOutlined />}
                      </div>
                      <div className="text-base font-bold">{formValues?.name || 'Membership Name'}</div>
                      <div className="text-xs opacity-90 mt-1">{formValues?.description || 'Add a description...'}</div>
                    </div>
                  </div>
                  <div className="px-5 py-4 text-center">
                    <div className="text-2xl font-extrabold text-slate-900">{formatCurrency(formValues?.price || 0, businessCurrency)}</div>
                    <div className="text-xs text-slate-500 mt-0.5">per {formValues?.period || 'month'}</div>
                    {formValues?.features?.length > 0 && (
                      <div className="mt-3 text-left">
                        {formValues.features.slice(0, 4).map((f, i) => (
                          <div key={i} className="text-xs text-slate-600 mb-1 flex items-center gap-2">
                            <span style={{ color: BADGE_COLORS.find(c => c.value === formValues?.badge_color)?.color || '#52c41a' }}>✓</span> {f}
                          </div>
                        ))}
                      </div>
                    )}
                    <Button type="primary" block className="mt-3" style={{ borderRadius: 8, height: 36, fontWeight: 600, background: BADGE_COLORS.find(c => c.value === formValues?.badge_color)?.color || '#667eea', borderColor: BADGE_COLORS.find(c => c.value === formValues?.badge_color)?.color || '#667eea' }}>
                      {formValues?.button_text || 'Choose Plan'}
                    </Button>
                  </div>
                </div>
              ) : (
                <div style={{ background: formValues?.highlighted ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' : 'transparent', padding: formValues?.highlighted ? 2 : 0, borderRadius: 16 }}>
                  <div className="bg-white rounded-2xl p-5 text-center">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl mx-auto mb-2" style={{ backgroundColor: `${BADGE_COLORS.find(c => c.value === formValues?.badge_color)?.color || '#f0f0f0'}20`, color: BADGE_COLORS.find(c => c.value === formValues?.badge_color)?.color || '#667eea' }}>
                      {ICON_OPTIONS.find(i => i.value === formValues?.icon)?.icon || <StarOutlined />}
                    </div>
                    {imageUrl && formValues?.card_style !== 'image_background' && (
                      <div className="mb-3 rounded-lg overflow-hidden"><img src={imageUrl} alt="preview" style={{ width: '100%', height: 'auto', maxHeight: 80, objectFit: 'cover' }} /></div>
                    )}
                    <div className="text-base font-bold text-slate-900">{formValues?.name || 'Membership Name'}</div>
                    <div className="text-xs text-slate-500 mb-3">{formValues?.description || 'Add a description...'}</div>
                    <div className="text-2xl font-extrabold text-slate-900">{formatCurrency(formValues?.price || 0, businessCurrency)}</div>
                    <div className="text-xs text-slate-500 mb-3">per {formValues?.period || 'month'}</div>
                    {formValues?.features?.length > 0 && (
                      <div className="mb-3 text-left">
                        {formValues.features.slice(0, 4).map((f, i) => (
                          <div key={i} className="text-xs text-slate-600 mb-1"><span className="text-green-500">✓</span> {f}</div>
                        ))}
                      </div>
                    )}
                    <Button type={formValues?.highlighted ? 'primary' : 'default'} block style={{ borderRadius: 8, height: 36 }}>
                      {formValues?.button_text || 'Choose Plan'}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Form */}
          <div className="px-5 pb-5">
            <div className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3 mt-2">Details</div>
            <Form
              form={form}
              layout="vertical"
              onFinish={handleSave}
              requiredMark={false}
              className="package-creator-form"
            >
              <div className="grid grid-cols-2 gap-3">
                <Form.Item name="name" label="Name" rules={[{ required: true, message: 'Required' }]} tooltip="The title on the card">
                  <Input placeholder="e.g. VIP Gold" />
                </Form.Item>
                <Form.Item name="price" label={`Price (${businessCurrency})`} rules={[{ required: true, message: 'Required' }]}>
                  <InputNumber className="w-full" min={0} precision={2} prefix={businessCurrency === 'EUR' ? '€' : businessCurrency} />
                </Form.Item>
                <Form.Item name="period" label="Billing Period" rules={[{ required: true, message: 'Required' }]}>
                  <Select options={PERIOD_OPTIONS} />
                </Form.Item>
                <Form.Item name="duration_days" label="Duration (Days)">
                  <InputNumber className="w-full" min={1} placeholder="30" />
                </Form.Item>
                <Form.Item name="badge_color" label="Badge Color">
                  <Select options={BADGE_COLORS} optionRender={(option) => (<Space><div style={{ width: 14, height: 14, borderRadius: 3, backgroundColor: option.data.color, border: '1px solid #d9d9d9' }} />{option.data.label}</Space>)} />
                </Form.Item>
                <Form.Item name="badge" label="Badge Text">
                  <Input placeholder="e.g. VIP" maxLength={10} />
                </Form.Item>
                <Form.Item name="icon" label="Icon">
                  <Select placeholder="Select icon" options={ICON_OPTIONS} optionRender={(option) => (<Space>{option.data.icon}{option.data.label}</Space>)} />
                </Form.Item>
                <Form.Item name="sort_order" label="Display Order">
                  <InputNumber className="w-full" min={0} />
                </Form.Item>
              </div>

              <Form.Item name="description" label="Description" tooltip="Brief description shown on the card">
                <TextArea rows={2} placeholder="Short description for the card" maxLength={150} showCount />
              </Form.Item>

              <div className="grid grid-cols-2 gap-3">
                <Form.Item name="highlighted" valuePropName="checked" label="Featured">
                  <Checkbox>Highlight as popular</Checkbox>
                </Form.Item>
                <Form.Item name="card_style" label="Card Style">
                  <Select options={CARD_STYLE_OPTIONS} optionRender={(option) => (<div><div className="font-medium text-xs">{option.data.label}</div><div className="text-[10px] text-gray-400">{option.data.description}</div></div>)} />
                </Form.Item>
              </div>

              <Form.Item name="button_text" label="Button Text">
                <Input placeholder="e.g. Get Started, Choose Plan" maxLength={30} />
              </Form.Item>

              <div className="grid grid-cols-2 gap-3">
                <Form.Item name="gradient_color" label="Gradient Color" extra={formValues?.card_style === 'gradient' ? 'Works with badge color' : 'Gradient header only'}>
                  <Select allowClear placeholder="Select color" options={BADGE_COLORS} optionRender={(option) => (<Space><div style={{ width: 14, height: 14, borderRadius: 3, backgroundColor: option.data.color, border: '1px solid #d9d9d9' }} />{option.data.label}</Space>)} />
                </Form.Item>
                <Form.Item name="text_color" label="Text Color">
                  <Select options={TEXT_COLOR_OPTIONS} optionRender={(option) => (<Space><div style={{ width: 14, height: 14, borderRadius: 3, backgroundColor: option.data.color, border: '1px solid #d9d9d9' }} />{option.data.label}</Space>)} />
                </Form.Item>
              </div>

              {(formValues?.card_style === 'gradient' || formValues?.card_style === 'image_background') && imageUrl && (
                <Form.Item name="gradient_opacity" label="Overlay Transparency" extra={`${formValues?.gradient_opacity || 70}% overlay`}>
                  <Slider min={0} max={100} marks={{ 0: 'Clear', 50: 'Medium', 100: 'Solid' }} />
                </Form.Item>
              )}

              <Form.Item label="Card Image" extra="Displayed on the membership card">
                <div className="flex items-start gap-3">
                  {imageUrl ? (
                    <div className="relative group">
                      <img src={imageUrl} alt="Card preview" style={{ width: 160, height: 100, objectFit: 'cover', borderRadius: 8, border: '1px solid #e5e7eb' }} />
                      <Button type="text" danger icon={<CloseCircleOutlined />} onClick={removeImage} className="absolute -top-2 -right-2 bg-white shadow-sm rounded-full" size="small" />
                    </div>
                  ) : (
                    <Upload name="image" listType="picture-card" showUploadList={false} customRequest={postMembershipImageUpload} accept="image/*"
                      beforeUpload={(file) => { const ok = file.type.startsWith('image/') && file.size / 1024 / 1024 < 5; if (!file.type.startsWith('image/')) message.error('Only images!'); if (file.size / 1024 / 1024 >= 5) message.error('Max 5MB!'); setImageLoading(ok); return ok; }}
                    >
                      <div className="flex flex-col items-center justify-center p-2">
                        {imageLoading ? <span className="text-xs">Uploading...{uploadProgress > 0 && ` ${uploadProgress}%`}</span> : <><UploadOutlined className="text-xl mb-1" /><span className="text-xs">Upload</span></>}
                      </div>
                    </Upload>
                  )}
                </div>
              </Form.Item>

              {imageUrl && (
                <Form.Item name="use_image_background" label="Display Mode" valuePropName="checked">
                  <Switch checkedChildren="Background" unCheckedChildren="Inline" />
                </Form.Item>
              )}

              <Form.Item name="features" label="Features" tooltip="Benefits included">
                <Select mode="tags" placeholder="Type a feature and press enter" tokenSeparators={[',']} maxTagCount="responsive" />
              </Form.Item>

              {/* ── Sticky Footer ── */}
              <Form.Item className="!mb-0">
                <div className="flex gap-3 pt-4 border-t border-slate-200">
                  <Button
                    onClick={() => { setModalVisible(false); setEditingOffering(null); setImageUrl(null); form.resetFields(); }}
                    className="flex-1 rounded-xl !h-10"
                  >
                    Cancel
                  </Button>
                  <Button type="primary" htmlType="submit" className="flex-1 rounded-xl !h-10 bg-gradient-to-r from-violet-600 to-indigo-600 border-0 shadow-md hover:shadow-lg transition-all font-semibold">
                    {editingOffering ? 'Update' : 'Create Membership'}
                  </Button>
                </div>
              </Form.Item>
            </Form>
          </div>
        </div>

        <style>{`
          .package-creator-form .ant-form-item { margin-bottom: 12px; }
          .package-creator-form .ant-form-item-label > label { color: #334155; font-weight: 600; font-size: 12px; }
          .package-creator-form .ant-input,
          .package-creator-form .ant-input-number,
          .package-creator-form .ant-input-number-group-addon,
          .package-creator-form .ant-select-selector { border-radius: 10px !important; }
        `}</style>
      </Drawer>
    </div>
  );
}

export default MembershipSettings;
