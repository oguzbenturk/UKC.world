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
  Upload,
  Checkbox,
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
  GiftOutlined,
  InboxOutlined,
} from '@ant-design/icons';
import apiClient from '@/shared/services/apiClient';
import { useCurrency } from '@/shared/contexts/CurrencyContext';
import { usePageSEO } from '@/shared/utils/seo';
import { logger } from '@/shared/utils/logger';

const { TextArea } = Input;
const { useBreakpoint } = Grid;

const TIER_PRESETS = [
  { key: 'daily', label: 'Daily', duration_days: 1 },
  { key: 'weekly', label: 'Weekly', duration_days: 7 },
  { key: 'monthly', label: 'Monthly', duration_days: 30 },
  { key: 'seasonal', label: 'Seasonal', duration_days: 180 },
  { key: 'yearly', label: 'Yearly', duration_days: 365 },
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
  const [tiers, setTiers] = useState({});
  const [customTier, setCustomTier] = useState({ enabled: false, days: '', price: '' });

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
    setTiers({});
    setCustomTier({ enabled: false, days: '', price: '' });
    form.setFieldsValue({
      is_active: true,
      badge_color: 'gold',
      icon: 'CrownOutlined',
      features: [],
      category: 'membership',
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
      gradient_opacity: record.gradient_opacity ?? 70,
      category: record.category || 'membership',
      total_capacity: record.total_capacity,
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
      const isStorage = values.category === 'storage';

      if (editingOffering) {
        const payload = {
          ...values,
          price: Number(values.price),
          duration_days: values.duration_days ? Number(values.duration_days) : null,
          image_url: imageUrl,
          total_capacity: isStorage ? (values.total_capacity ? Number(values.total_capacity) : null) : null,
        };
        await apiClient.put(`/member-offerings/${editingOffering.id}`, payload);
        message.success(`${isStorage ? 'Storage' : 'Membership'} updated`);
      } else {
        const tierList = [];
        TIER_PRESETS.forEach(preset => {
          const t = tiers[preset.key];
          if (t?.enabled && t?.price) {
            tierList.push({ label: preset.label, duration_days: preset.duration_days, price: Number(t.price) });
          }
        });
        if (customTier.enabled && customTier.days && customTier.price) {
          tierList.push({ label: `${customTier.days} Days`, duration_days: Number(customTier.days), price: Number(customTier.price) });
        }
        if (tierList.length === 0) {
          message.warning('Enable at least one duration tier');
          return;
        }
        await apiClient.post('/member-offerings/batch', {
          name: values.name,
          description: values.description,
          features: values.features || [],
          icon: values.icon,
          badge: values.badge,
          badge_color: values.badge_color,
          highlighted: values.highlighted || false,
          image_url: imageUrl,
          tiers: tierList,
          category: isStorage ? 'storage' : 'membership',
          total_capacity: isStorage ? (values.total_capacity ? Number(values.total_capacity) : null) : undefined,
        });
        const typeLabel = isStorage ? 'storage' : 'membership';
        message.success(`${tierList.length} ${typeLabel} offering${tierList.length !== 1 ? 's' : ''} created!`);
      }
      setModalVisible(false);
      setImageUrl(null);
      setTiers({});
      setCustomTier({ enabled: false, days: '', price: '' });
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
        <span className="flex items-center gap-2">
           <Badge color={record.badge_color || 'blue'} />
           <span className="text-sm font-medium">{text}</span>
           {record.highlighted && <Tag color="gold" className="text-[10px] m-0">Featured</Tag>}
        </span>
      )
    },
    {
      title: 'Price',
      dataIndex: 'price',
      key: 'price',
      width: 100,
      render: (price) => <span className="text-sm font-medium">{formatCurrency(price, businessCurrency)}</span>
    },
    {
      title: 'Type',
      dataIndex: 'category',
      key: 'category',
      width: 80,
      render: (cat, record) => (
        <Tag color={cat === 'storage' ? 'orange' : 'blue'} className="m-0">
          {cat === 'storage' ? 'Storage' : 'Member'}
          {cat === 'storage' && record.total_capacity != null && (
            <span className="ml-1 opacity-70">({record.available_count ?? '?'}/{record.total_capacity})</span>
          )}
        </Tag>
      )
    },
    {
      title: 'Period',
      dataIndex: 'period',
      key: 'period',
      width: 90,
      render: (text) => <Tag className="m-0">{text ? text.toUpperCase() : 'N/A'}</Tag>
    },
    {
      title: 'Duration',
      dataIndex: 'duration_days',
      key: 'duration_days',
      width: 90,
      render: (val) => <span className="text-sm text-slate-500">{val ? `${val}d` : '∞'}</span>
    },
    {
      title: '',
      key: 'actions',
      width: 80,
      render: (_, record) => (
        <Space size={4}>
          <Button 
            type="text"
            icon={<EditOutlined />} 
            onClick={() => handleEdit(record)}
            size="small"
          />
          <Popconfirm
            title="Deactivate membership?"
            description="This will hide the membership from users."
            onConfirm={() => handleDelete(record.id)}
            okText="Deactivate"
            cancelText="Cancel"
            okButtonProps={{ danger: true }}
          >
            <Button 
              type="text"
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
                <div className="text-sm text-slate-500 flex items-center gap-1.5">
                  {formatCurrency(membership.price, businessCurrency)} / {membership.period || 'month'}
                  {membership.category === 'storage' && (
                    <Tag color="orange" className="text-[10px] m-0">Storage</Tag>
                  )}
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
    <div className="p-3 md:p-5">
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-slate-100">
          <h3 className="text-base font-semibold text-slate-800 m-0 flex items-center gap-2">
            <CrownOutlined className="text-amber-500" />
            Memberships
          </h3>
          <Button 
            type="primary" 
            icon={<PlusOutlined />} 
            onClick={handleCreate}
            size="small"
          >
            {isMobile ? 'Add' : 'Add Membership'}
          </Button>
        </div>

        <div className="p-0">
        {isMobile ? (
          // Mobile: Card View
          <div className="p-3">
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
            size="small"
            pagination={{ pageSize: 15, size: 'small' }}
            scroll={{ x: 500 }}
          />
        )}
        </div>
      </div>

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
                  {editingOffering 
                    ? `Edit ${editingOffering.category === 'storage' ? 'Storage' : 'Membership'}`
                    : 'New Offering'}
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
              <div className="bg-white rounded-2xl p-5 text-center">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl mx-auto mb-2"
                  style={{
                    backgroundColor: `${BADGE_COLORS.find(c => c.value === formValues?.badge_color)?.color || '#f0f0f0'}20`,
                    color: BADGE_COLORS.find(c => c.value === formValues?.badge_color)?.color || '#667eea'
                  }}>
                  {ICON_OPTIONS.find(i => i.value === formValues?.icon)?.icon || <StarOutlined />}
                </div>
                {imageUrl && (
                  <div className="mb-3 rounded-lg overflow-hidden">
                    <img src={imageUrl} alt="preview" style={{ width: '100%', height: 'auto', maxHeight: 80, objectFit: 'cover' }} />
                  </div>
                )}
                <div className="text-base font-bold text-slate-900">{formValues?.name || 'Membership Name'}</div>
                <div className="text-xs text-slate-500 mb-3">{formValues?.description || 'Add a description...'}</div>
                {formValues?.features?.length > 0 && (
                  <div className="mb-3 text-left">
                    {formValues.features.slice(0, 4).map((f, i) => (
                      <div key={i} className="text-xs text-slate-600 mb-1">
                        <span className="text-green-500">✓</span> {f}
                      </div>
                    ))}
                  </div>
                )}
              </div>
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
              <Form.Item name="category" label="Category" rules={[{ required: true }]}>
                <Select
                  options={[
                    { value: 'membership', label: <span className="flex items-center gap-2"><CrownOutlined /> Membership</span> },
                    { value: 'storage', label: <span className="flex items-center gap-2"><InboxOutlined /> Storage</span> },
                  ]}
                />
              </Form.Item>

              <Form.Item name="name" label="Name" rules={[{ required: true, message: 'Required' }]}>
                <Input placeholder={formValues?.category === 'storage' ? 'e.g. Equipment Locker' : 'e.g. VIP Gold'} />
              </Form.Item>
              <Form.Item name="description" label="Description">
                <TextArea rows={2} placeholder="Short description" maxLength={150} showCount />
              </Form.Item>

              <div className="grid grid-cols-2 gap-3">
                <Form.Item name="icon" label="Icon">
                  <Select placeholder="Select icon" options={ICON_OPTIONS}
                    optionRender={(option) => (<Space>{option.data.icon}{option.data.label}</Space>)} />
                </Form.Item>
                <Form.Item name="badge_color" label="Color">
                  <Select options={BADGE_COLORS}
                    optionRender={(option) => (<Space><div style={{ width: 14, height: 14, borderRadius: 3, backgroundColor: option.data.color, border: '1px solid #d9d9d9' }} />{option.data.label}</Space>)} />
                </Form.Item>
              </div>

              <Form.Item label="Card Image">
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

              <Form.Item name="features" label="Features">
                <Select mode="tags" placeholder="Type a feature and press enter" tokenSeparators={[',']} maxTagCount="responsive" />
              </Form.Item>

              {/* ── Storage: Total Capacity ── */}
              {formValues?.category === 'storage' && (
                <Form.Item name="total_capacity" label="Total Capacity (units)">
                  <InputNumber className="w-full" min={1} placeholder="e.g. 20" />
                </Form.Item>
              )}

              {/* ── EDIT MODE: single price/duration ── */}
              {editingOffering && (
                <div className="grid grid-cols-2 gap-3">
                  <Form.Item name="price" label="Price" rules={[{ required: true }]}>
                    <InputNumber className="w-full" min={0} precision={2} prefix="€" />
                  </Form.Item>
                  <Form.Item name="duration_days" label="Duration (Days)">
                    <InputNumber className="w-full" min={1} placeholder="30" />
                  </Form.Item>
                </div>
              )}

              {/* ── CREATE MODE: tier pricing table (both membership and storage) ── */}
              {!editingOffering && (
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2 mt-1">Duration & Pricing</div>
                  <div className="space-y-2">
                    {TIER_PRESETS.map(preset => (
                      <div key={preset.key} className={`flex items-center gap-3 rounded-lg border px-3 py-2 transition-colors ${tiers[preset.key]?.enabled ? 'border-blue-200 bg-blue-50/50' : 'border-slate-200'}`}>
                        <Checkbox
                          checked={tiers[preset.key]?.enabled || false}
                          onChange={e => setTiers(prev => ({ ...prev, [preset.key]: { ...prev[preset.key], enabled: e.target.checked } }))}
                        />
                        <div className="flex-1">
                          <span className="text-sm font-medium text-slate-700">{preset.label}</span>
                          <span className="text-xs text-slate-400 ml-1.5">{preset.duration_days}d</span>
                        </div>
                        {tiers[preset.key]?.enabled && (
                          <InputNumber
                            size="small" min={0} precision={2} prefix="€"
                            placeholder="Price"
                            value={tiers[preset.key]?.price}
                            onChange={val => setTiers(prev => ({ ...prev, [preset.key]: { ...prev[preset.key], price: val } }))}
                            className="w-28"
                          />
                        )}
                      </div>
                    ))}
                    {/* Custom tier */}
                    <div className={`flex items-center gap-3 rounded-lg border px-3 py-2 transition-colors ${customTier.enabled ? 'border-violet-200 bg-violet-50/50' : 'border-slate-200'}`}>
                      <Checkbox
                        checked={customTier.enabled}
                        onChange={e => setCustomTier(prev => ({ ...prev, enabled: e.target.checked }))}
                      />
                      <span className="text-sm font-medium text-slate-700">Custom</span>
                      {customTier.enabled && (
                        <>
                          <InputNumber
                            size="small" min={1} placeholder="Days"
                            value={customTier.days}
                            onChange={val => setCustomTier(prev => ({ ...prev, days: val }))}
                            className="w-20"
                          />
                          <InputNumber
                            size="small" min={0} precision={2} prefix="€" placeholder="Price"
                            value={customTier.price}
                            onChange={val => setCustomTier(prev => ({ ...prev, price: val }))}
                            className="w-28"
                          />
                        </>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* ── Footer ── */}
              <Form.Item className="!mb-0">
                <div className="flex gap-3 pt-4 border-t border-slate-200 mt-4">
                  <Button
                    onClick={() => { setModalVisible(false); setEditingOffering(null); setImageUrl(null); setTiers({}); setCustomTier({ enabled: false, days: '', price: '' }); form.resetFields(); }}
                    className="flex-1 rounded-xl !h-10"
                  >
                    Cancel
                  </Button>
                  <Button type="primary" htmlType="submit"
                    className="flex-1 rounded-xl !h-10 bg-gradient-to-r from-violet-600 to-indigo-600 border-0 shadow-md hover:shadow-lg transition-all font-semibold">
                    {editingOffering ? 'Update' : (() => { let c = Object.values(tiers).filter(t => t?.enabled && t?.price).length; if (customTier.enabled && customTier.days && customTier.price) c++; const label = formValues?.category === 'storage' ? 'Storage' : 'Membership'; return `Create ${c} ${label}${c !== 1 ? 's' : ''}`; })()}
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
