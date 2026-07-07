import { useState, useEffect } from 'react';
import { Drawer, Form, Input, InputNumber, Select, Row, Col, Button, Divider, App, Upload, Switch } from 'antd';
import { PlusOutlined, LoadingOutlined, DeleteOutlined } from '@ant-design/icons';
import { serviceApi } from '@/shared/services/serviceApi';
import { useCurrency } from '@/shared/contexts/CurrencyContext';
import { resolvePublicUploadUrl } from '@/shared/utils/mediaUrl';

const { Option } = Select;

const DISCIPLINE_OPTIONS = [
  { value: 'kite', label: '🪁 Kitesurfing' },
  { value: 'wing', label: '🦅 Wing Foiling' },
  { value: 'kite_foil', label: '🏄 Kite Foiling' },
  { value: 'efoil', label: '⚡ E-Foil' },
  { value: 'premium', label: '💎 Premium' },
  // Rescue is a DISCIPLINE (like kite/wing), not a lesson style — it works with
  // ALL lesson categories (private/semi/group/supervision). Internal tag stays
  // 'rescue_boat' (already in the discipline_tag CHECK constraint).
  { value: 'rescue_boat', label: '🚤 Rescue' },
];

// Discipline tag that marks a service as a rescue service. Drives the active-
// membership discount, the rescue card and the rescue-specific booking fields.
const RESCUE_DISCIPLINE = 'rescue_boat';

const LESSON_CATEGORY_OPTIONS = [
  { value: 'private', label: 'Private' },
  { value: 'semi-private', label: 'Semi-Private' },
  { value: 'group', label: 'Group' },
  { value: 'supervision', label: 'Supervision' },
  { value: 'semi-private-supervision', label: 'Semi-Private Supervision' },
];

// Default % discount applied to a rescue service for customers with an active
// membership (owner rule). Adjustable per-service via the form field.
const RESCUE_DEFAULT_MEMBER_DISCOUNT = 50;

// Drawer form for creating AND editing Lesson services (single page)
export default function StepLessonServiceModal({ open, onClose, onCreated, service, onUpdated }) {
  const isEditMode = Boolean(service?.id);
  const [form] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);
  const [imageUploading, setImageUploading] = useState(false);
  const coverImageUrl = Form.useWatch('imageUrl', form);
  // Rescue is sold per trip, not per hour, and has no lesson category — so the
  // form adapts when it is the selected discipline (see conditional fields).
  const selectedDiscipline = Form.useWatch('disciplineTag', form);
  const isRescueSelected = selectedDiscipline === RESCUE_DISCIPLINE;
  const { message } = App.useApp();
  const { businessCurrency, getSupportedCurrencies, getCurrencySymbol } = useCurrency();

  // Pre-fill form when opening in edit mode; reset when opening for create
  useEffect(() => {
    if (!open) return;
    if (isEditMode) {
      const maxP = service.max_participants || service.maxParticipants || 1;
      form.setFieldsValue({
        name: service.name || '',
        disciplineTag: service.disciplineTag || undefined,
        duration: service.duration ?? 1.0,
        maxParticipants: maxP,
        lessonCategoryTag: service.lessonCategoryTag || service.lesson_category_tag || undefined,
        currency: service.currency || businessCurrency || 'EUR',
        price: service.price ?? undefined,
        description: service.description || '',
        imageUrl: service.imageUrl || service.image_url || null,
        memberDiscountPercent: service.memberDiscountPercent ?? service.member_discount_percent ?? undefined,
        isVisible: (service.isVisible ?? service.is_visible) !== false,
      });
    } else {
      form.resetFields();
    }
  }, [open, service?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const buildPayload = (values) => {
    // Rescue is a DISCIPLINE sold PER TRIP (not per hour) and has NO lesson
    // category. So: duration is forced to 1 (1 trip = 1 consumable unit),
    // lesson_category is null, and the price entered is the flat per-trip price.
    const isRescue = values.disciplineTag === RESCUE_DISCIPLINE;
    const duration = isRescue ? 1 : (values.duration != null ? parseFloat(values.duration) : undefined);
    const price = values.price != null ? parseFloat(values.price) : undefined;
    const maxParticipants = values.maxParticipants != null ? parseInt(values.maxParticipants, 10) : undefined;
    const autoCategory = maxParticipants === 1 ? 'private' : maxParticipants <= 3 ? 'semi-private' : 'group';
    // Rescue stores lesson_category='rescue_boat' (not NULL) so the captain's
    // optional per-instructor rescue rate (instructor_category_rates) can match.
    // The UI category picker is still disabled — this value is internal.
    let lessonCategoryTag = isRescue ? RESCUE_DISCIPLINE : (values.lessonCategoryTag || autoCategory);
    // Auto-promote supervision → semi-private-supervision when capacity > 1
    if (!isRescue && lessonCategoryTag === 'supervision' && maxParticipants > 1) {
      lessonCategoryTag = 'semi-private-supervision';
    }
    const serviceType = isRescue
      ? autoCategory
      : (lessonCategoryTag === 'supervision' || lessonCategoryTag === 'semi-private-supervision') ? 'supervision' : autoCategory;

    return {
      name: (values.name || '').trim(),
      category: 'lesson',
      duration,
      level: 'all-levels',
      maxParticipants,
      max_participants: maxParticipants,
      price,
      currency: values.currency || businessCurrency || 'EUR',
      description: values.description || '',
      serviceType,
      isPackage: false,
      disciplineTag: values.disciplineTag || null,
      lessonCategoryTag,
      imageUrl: values.imageUrl || null,
      // Members with an active membership get an automatic discount on rescue
      // services (default 50%); NULL for every other discipline so existing
      // behaviour is untouched.
      memberDiscountPercent: isRescue
        ? (values.memberDiscountPercent != null && values.memberDiscountPercent !== ''
            ? parseFloat(values.memberDiscountPercent)
            : RESCUE_DEFAULT_MEMBER_DISCOUNT)
        : null,
      // Hidden services stay staff-assignable but drop off the customer Academy pages.
      isVisible: values.isVisible !== false,
    };
  };

  const handleClose = () => {
    form.resetFields();
    setImageUploading(false);
    onClose?.();
  };

  const handleImageUpload = async ({ file, onSuccess, onError }) => {
    try {
      setImageUploading(true);
      const data = await serviceApi.uploadServiceImage(file);
      const url = data?.imageUrl || data?.url;
      if (!url) throw new Error('No image URL returned');
      form.setFieldValue('imageUrl', url);
      message.success('Image uploaded');
      onSuccess?.(data, file);
    } catch (e) {
      message.error(e?.response?.data?.error || e?.message || 'Failed to upload image');
      onError?.(e);
    } finally {
      setImageUploading(false);
    }
  };

  const handleSubmit = async () => {
    try {
      await form.validateFields();
      const values = form.getFieldsValue(true);
      setSubmitting(true);
      const payload = buildPayload(values);

      if (isEditMode) {
        const updated = await serviceApi.updateService(service.id, payload);
        message.success('Lesson service updated');
        onUpdated?.(updated);
      } else {
        const created = await serviceApi.createService(payload);
        message.success('Lesson service created');
        onCreated?.(created);
      }

      handleClose();
    } catch (err) {
      if (err?.errorFields) return;
      const serverMsg = err?.response?.data?.error || err?.message;
      message.error(serverMsg || `Failed to ${isEditMode ? 'update' : 'create'} service`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Drawer
      title={isEditMode ? `Edit — ${service.name}` : 'New Service'}
      open={open}
      onClose={handleClose}
      width={560}
      placement="right"
      footer={
        <div className="flex justify-end">
          <Button type="primary" loading={submitting} onClick={handleSubmit}>
            {isEditMode ? 'Update Service' : 'Save Service'}
          </Button>
        </div>
      }
      destroyOnHidden
    >
      <Form
        form={form}
        layout="vertical"
        initialValues={{
          duration: 1.0,
          maxParticipants: 1,
          currency: businessCurrency || 'EUR',
        }}
      >
        <Form.Item
          name="name"
          label="Service Name"
          rules={[{ required: true, message: 'Please enter service name' }]}
        >
          <Input placeholder="e.g. Private Kitesurfing Lesson" />
        </Form.Item>

        <Row gutter={16}>
          <Col span={12}>
            <Form.Item
              name="disciplineTag"
              label="Discipline"
              rules={[{ required: true, message: 'Please select a discipline' }]}
            >
              <Select
                placeholder="Select discipline"
                onChange={(val) => {
                  if (val === RESCUE_DISCIPLINE) {
                    // Rescue has no lesson category and is sold per trip.
                    form.setFieldsValue({ lessonCategoryTag: undefined, duration: 1 });
                    if (form.getFieldValue('memberDiscountPercent') == null) {
                      form.setFieldValue('memberDiscountPercent', RESCUE_DEFAULT_MEMBER_DISCOUNT);
                    }
                  }
                }}
              >
                {DISCIPLINE_OPTIONS.map((d) => (
                  <Option key={d.value} value={d.value}>
                    {d.label}
                  </Option>
                ))}
              </Select>
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item
              name="lessonCategoryTag"
              label="Lesson Category"
              rules={isRescueSelected ? [] : [{ required: true, message: 'Please select a category' }]}
            >
              <Select
                placeholder={isRescueSelected ? 'Not applicable for rescue' : 'Select category'}
                disabled={isRescueSelected}
              >
                {LESSON_CATEGORY_OPTIONS.map((c) => (
                  <Option key={c.value} value={c.value}>
                    {c.label}
                  </Option>
                ))}
              </Select>
            </Form.Item>
          </Col>
        </Row>

        <Divider className="my-3" />

        <Row gutter={16}>
          {!isRescueSelected && (
            <Col span={8}>
              <Form.Item
                name="duration"
                label="Duration (Hours)"
                rules={[{ required: true }]}
              >
                <InputNumber min={0.5} max={24} step={0.5} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          )}
          <Col span={8}>
            <Form.Item
              name="maxParticipants"
              label={isRescueSelected ? 'Max Passengers' : 'Max Participants'}
              rules={[{ required: true, type: 'number', min: 1, max: 50 }]}
            >
              <InputNumber min={1} max={50} style={{ width: '100%' }} />
            </Form.Item>
          </Col>
          {isRescueSelected && (
            <Col span={8}>
              <Form.Item
                name="memberDiscountPercent"
                label="Member discount (%)"
                tooltip="Customers with an active membership get this % off the trip price."
                rules={[{ type: 'number', min: 0, max: 100 }]}
              >
                <InputNumber min={0} max={100} step={5} style={{ width: '100%' }} addonAfter="%" />
              </Form.Item>
            </Col>
          )}
        </Row>

        <Divider className="my-3" />

        <Row gutter={16}>
          <Col span={8}>
            <Form.Item name="currency" label="Currency" rules={[{ required: true }]}>
              <Select
                showSearch
                optionFilterProp="label"
                placeholder={businessCurrency || 'EUR'}
              >
                {(() => {
                  const list = getSupportedCurrencies?.() || [];
                  const items = list.length > 0 ? list : ['EUR', 'USD', 'GBP'];
                  return items.map((item) => {
                    const code = typeof item === 'string' ? item : item.value;
                    const labelText =
                      typeof item === 'string'
                        ? `${getCurrencySymbol?.(code) || ''} ${code}`.trim()
                        : (item.label || `${getCurrencySymbol?.(code) || ''} ${code}`.trim());
                    return (
                      <Option key={code} value={code} label={labelText}>
                        {labelText}
                      </Option>
                    );
                  });
                })()}
              </Select>
            </Form.Item>
          </Col>
          <Col span={16}>
            <Form.Item name="price" label={isRescueSelected ? 'Price Per Rescue (per trip)' : 'Hourly Price Per Person'} rules={[{ required: true }]}>
              <InputNumber
                min={0}
                style={{ width: '100%' }}
                addonBefore={getCurrencySymbol?.(form.getFieldValue('currency') || businessCurrency || 'EUR')}
              />
            </Form.Item>
          </Col>
        </Row>

        <Divider className="my-3" />

        <Form.Item label="Cover image (optional)">
          <div className="flex flex-col gap-2">
            <p className="text-xs text-gray-500 m-0">
              Shown on the lesson service card and detail view. JPG or PNG, max 5&nbsp;MB.
            </p>
            <div className="flex flex-wrap items-start gap-3">
              <Upload
                name="image"
                listType="picture-card"
                showUploadList={false}
                accept="image/*"
                customRequest={handleImageUpload}
                disabled={imageUploading}
                beforeUpload={(file) => {
                  const okType = file.type?.startsWith('image/');
                  const okSize = file.size / 1024 / 1024 < 5;
                  if (!okType) message.error('Please upload an image file');
                  if (!okSize) message.error('Image must be smaller than 5MB');
                  return okType && okSize;
                }}
              >
                {coverImageUrl ? (
                  <div className="relative h-full w-full">
                    <img
                      src={resolvePublicUploadUrl(coverImageUrl)}
                      alt="Service cover"
                      className="h-full w-full object-cover rounded-lg"
                    />
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center text-gray-500">
                    {imageUploading ? <LoadingOutlined className="text-2xl" /> : <PlusOutlined className="text-2xl" />}
                    <span className="mt-1 text-xs">Upload</span>
                  </div>
                )}
              </Upload>
              {coverImageUrl && (
                <Button
                  type="text"
                  danger
                  size="small"
                  icon={<DeleteOutlined />}
                  onClick={() => form.setFieldValue('imageUrl', null)}
                >
                  Remove image
                </Button>
              )}
            </div>
          </div>
        </Form.Item>
        <Form.Item name="imageUrl" hidden>
          <Input />
        </Form.Item>

        <Form.Item name="description" label="Description">
          <Input.TextArea rows={3} placeholder="Description (optional)" />
        </Form.Item>

        <Divider className="my-3" />

        {/* Visibility — hidden services stay staff-assignable but drop off the
            customer-facing Academy pages. Defaults ON. */}
        <Form.Item
          name="isVisible"
          valuePropName="checked"
          initialValue={true}
          label="Visible to customers"
          tooltip="Turn off to hide this service from the public Academy pages. It stays fully usable and assignable by staff."
          className="!mb-1"
        >
          <Switch checkedChildren="Visible" unCheckedChildren="Hidden" />
        </Form.Item>
        <p className="text-xs text-gray-400 m-0">
          When hidden, customers won't see this lesson in Academy, but staff can still book and assign it.
        </p>
      </Form>
    </Drawer>
  );
}
