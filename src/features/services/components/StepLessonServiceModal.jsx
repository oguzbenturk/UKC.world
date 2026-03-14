import { useMemo, useState, useEffect } from 'react';
import { Modal, Steps, Form, Input, InputNumber, Select, Row, Col, Button, App } from 'antd';
import { BookOutlined, TeamOutlined, DollarOutlined } from '@ant-design/icons';
import { serviceApi } from '@/shared/services/serviceApi';
import { useCurrency } from '@/shared/contexts/CurrencyContext';

const { Option } = Select;

const DISCIPLINE_OPTIONS = [
  { value: 'kite', label: '🪁 Kitesurfing', color: 'blue' },
  { value: 'wing', label: '🦅 Wing Foiling', color: 'purple' },
  { value: 'kite_foil', label: '🏄 Kite Foiling', color: 'cyan' },
  { value: 'efoil', label: '⚡ E-Foil', color: 'green' },
  { value: 'premium', label: '💎 Premium', color: 'gold' },
];

// Step-based modal for creating AND editing Lesson services
export default function StepLessonServiceModal({ open, onClose, onCreated, service, onUpdated }) {
  const isEditMode = Boolean(service?.id);
  const [form] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);
  const [current, setCurrent] = useState(0);
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
        currency: service.currency || businessCurrency || 'EUR',
        price: service.price ?? undefined,
        description: service.description || '',
      });
    } else {
      form.resetFields();
    }
    setCurrent(0);
  }, [open, service?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const steps = useMemo(
    () => [
      { key: 'basics', title: 'Basics', icon: <BookOutlined /> },
      { key: 'capacity', title: 'Capacity', icon: <TeamOutlined /> },
      { key: 'pricing', title: 'Pricing', icon: <DollarOutlined /> },
    ],
    []
  );

  const fieldsPerStep = {
    basics: ['name', 'disciplineTag', 'duration'],
    capacity: ['maxParticipants'],
    pricing: ['currency', 'price'],
  };
  const allFieldNames = Object.values(fieldsPerStep).flat();

  const buildPayload = (values) => {
    const duration = values.duration != null ? parseFloat(values.duration) : undefined;
    const price = values.price != null ? parseFloat(values.price) : undefined;
    const maxParticipants = values.maxParticipants != null ? parseInt(values.maxParticipants, 10) : undefined;
    const serviceType = maxParticipants > 1 ? 'group' : 'private';
    const lessonCategoryTag = maxParticipants > 1 ? 'group' : 'private';

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
    };
  };

  const handleClose = () => {
    form.resetFields();
    setCurrent(0);
    onClose?.();
  };

  const next = async () => {
    const stepKey = steps[current].key;
    await form.validateFields(fieldsPerStep[stepKey]);
    setCurrent((c) => c + 1);
  };

  const prev = () => setCurrent((c) => c - 1);

  const handleSubmit = async () => {
    try {
      await form.validateFields(allFieldNames);
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
    <Modal
      title={isEditMode ? `Edit — ${service.name}` : 'Add Lesson Service'}
      open={open}
      onCancel={handleClose}
      width={720}
      footer={
        <div className="flex justify-between w-full">
          <div />
          <div className="flex gap-2">
            {current > 0 && <Button onClick={prev}>Back</Button>}
            {current < steps.length - 1 ? (
              <Button type="primary" onClick={next}>Next</Button>
            ) : (
              <Button type="primary" loading={submitting} onClick={handleSubmit}>
                {isEditMode ? 'Update Service' : 'Save Service'}
              </Button>
            )}
          </div>
        </div>
      }
      destroyOnHidden
    >
      <Steps
        current={current}
        items={steps.map((s) => ({ key: s.key, title: s.title, icon: s.icon }))}
        className="mb-6"
      />

      <Form
        form={form}
        layout="vertical"
        initialValues={{
          duration: 1.0,
          maxParticipants: 1,
          currency: businessCurrency || 'EUR',
        }}
      >
        {current === 0 && (
          <>
            <Form.Item
              name="name"
              label="Service Name"
              rules={[{ required: true, message: 'Please enter service name' }]}
            >
              <Input placeholder="e.g. Private Kitesurfing Lesson" />
            </Form.Item>

            <Form.Item
              name="disciplineTag"
              label="Discipline"
              rules={[{ required: true, message: 'Please select a discipline' }]}
              extra="This determines which academy page shows this service"
            >
              <Select placeholder="Select discipline">
                {DISCIPLINE_OPTIONS.map((d) => (
                  <Option key={d.value} value={d.value}>
                    {d.label}
                  </Option>
                ))}
              </Select>
            </Form.Item>

            <Row gutter={16}>
              <Col span={12}>
                <Form.Item
                  name="duration"
                  label="Duration (Hours)"
                  rules={[{ required: true }]}
                >
                  <InputNumber min={0.5} max={24} step={0.5} style={{ width: '100%' }} />
                </Form.Item>
              </Col>
            </Row>
          </>
        )}

        {current === 1 && (
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="maxParticipants"
                label="Maximum Participants"
                rules={[{ required: true, type: 'number', min: 1, max: 50 }]}
                extra="Set to 1 for private lessons, 2+ for group lessons"
              >
                <InputNumber min={1} max={50} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>
        )}

        {current === 2 && (
          <>
            <Row gutter={16}>
              <Col span={8}>
                <Form.Item name="currency" label="Currency" rules={[{ required: true }]}>
                  <Select
                    showSearch
                    optionFilterProp="label"
                    placeholder={businessCurrency || 'EUR'}
                  >
                    {(getSupportedCurrencies?.() || ['EUR', 'USD', 'GBP']).map((code) => (
                      <Option key={code} value={code} label={code}>
                        {getCurrencySymbol?.(code) || ''} {code}
                      </Option>
                    ))}
                  </Select>
                </Form.Item>
              </Col>
              <Col span={16}>
                <Form.Item name="price" label="Hourly Price Per Person" rules={[{ required: true }]}>
                  <InputNumber
                    min={0}
                    style={{ width: '100%' }}
                    addonBefore={getCurrencySymbol?.(form.getFieldValue('currency') || businessCurrency || 'EUR')}
                  />
                </Form.Item>
              </Col>
            </Row>

            <Form.Item name="description" label="Description">
              <Input.TextArea rows={3} placeholder="Description" />
            </Form.Item>
          </>
        )}
      </Form>
    </Modal>
  );
}
