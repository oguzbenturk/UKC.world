import { useMemo, useState, useEffect } from 'react';
import { Modal, Steps, Form, Input, InputNumber, Select, Row, Col, Button, App } from 'antd';
import { ToolOutlined, ClockCircleOutlined, DollarOutlined } from '@ant-design/icons';
import { serviceApi } from '@/shared/services/serviceApi';
import { useCurrency } from '@/shared/contexts/CurrencyContext';

const { Option } = Select;

const DISCIPLINE_OPTIONS = [
  { value: 'kite', label: '🪁 Kitesurfing' },
  { value: 'wing', label: '🦅 Wing Foiling' },
  { value: 'kite_foil', label: '🏄 Kite Foiling' },
  { value: 'efoil', label: '⚡ E-Foil' },
  { value: 'accessory', label: '🎒 Accessories' },
];

const RENTAL_SEGMENT_OPTIONS = [
  { value: 'standard', label: 'Standard' },
  { value: 'sls', label: 'SLS' },
  { value: 'dlab', label: 'D/LAB' },
  { value: 'efoil', label: 'E-Foil' },
  { value: 'board', label: 'Board' },
  { value: 'accessory', label: 'Accessory' },
];

const SEGMENT_LABELS = {
  sls: 'SLS',
  dlab: 'D/LAB',
  standard: 'Standard',
  efoil: 'E-Foil',
  board: 'Board',
  accessory: 'Accessory',
};

/** Strip auto-generated "{duration}H - {SEGMENT} - " prefix so the admin sees only the descriptive part */
const stripAutoPrefix = (name, rentalSegment) => {
  if (!name) return '';
  let n = name.replace(/^\d+\.?\d*[Hh]\s*[-–]\s*/u, '').trim();
  const segLabel = SEGMENT_LABELS[rentalSegment] || '';
  if (segLabel) {
    n = n.replace(new RegExp(`^${segLabel.replace('/', '\\/')}\\s*[-–]\\s*`, 'i'), '').trim();
  }
  return n || name;
};

// Step-based modal for creating AND editing Rental services
export default function StepRentalServiceModal({ open, onClose, onCreated, service, onUpdated }) {
  const isEditMode = Boolean(service?.id);
  const [form] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);
  const [current, setCurrent] = useState(0);
  const { message } = App.useApp();
  const { businessCurrency, getSupportedCurrencies, getCurrencySymbol } = useCurrency();

  // Pre-fill form when opening in edit mode; reset for create
  useEffect(() => {
    if (!open) return;
    if (isEditMode) {
      form.setFieldsValue({
        name: stripAutoPrefix(service.name, service.rentalSegment),
        rentalSegment: service.rentalSegment || undefined,
        disciplineTag: service.disciplineTag || undefined,
        duration: service.duration ?? 1,
        availableUnits: service.max_participants || service.maxParticipants || 1,
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
      { key: 'equipment', title: 'Equipment', icon: <ToolOutlined /> },
      { key: 'duration', title: 'Duration & Stock', icon: <ClockCircleOutlined /> },
      { key: 'pricing', title: 'Pricing', icon: <DollarOutlined /> },
    ],
    []
  );

  const fieldsPerStep = {
    equipment: ['name', 'rentalSegment'],
    duration: ['duration', 'availableUnits'],
    pricing: ['currency', 'price'],
  };
  const allFieldNames = Object.values(fieldsPerStep).flat();

  const buildPayload = (values) => {
    const duration = values.duration != null ? parseFloat(values.duration) : undefined;
    const price = values.price != null ? parseFloat(values.price) : undefined;
    const units = values.availableUnits != null ? parseInt(values.availableUnits, 10) : 1;
    const segment = values.rentalSegment || 'standard';
    const segLabel = SEGMENT_LABELS[segment] || segment.toUpperCase();

    // Auto-construct stored name: "{duration}H - {SEGMENT} - {descriptive name}"
    let baseName = (values.name || '').trim() || 'Rental Service';
    const dH = parseFloat(duration);
    const durationTag = Number.isFinite(dH) ? `${dH % 1 === 0 ? dH : dH}H` : '';
    const storedName = durationTag ? `${durationTag} - ${segLabel} - ${baseName}` : `${segLabel} - ${baseName}`;

    return {
      name: storedName,
      category: 'rental',
      duration,
      price,
      currency: values.currency || businessCurrency || 'EUR',
      description: values.description || '',
      serviceType: 'rental',
      isPackage: false,
      disciplineTag: values.disciplineTag || null,
      rentalSegment: segment,
      max_participants: units,
      maxParticipants: units,
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
        message.success('Rental service updated');
        onUpdated?.(updated);
      } else {
        const created = await serviceApi.createService(payload);
        message.success('Rental service created');
        onCreated?.(created);
      }

      handleClose();
    } catch (err) {
      if (err?.errorFields) return;
      const serverMsg = err?.response?.data?.error || err?.message;
      message.error(serverMsg || `Failed to ${isEditMode ? 'update' : 'create'} rental service`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      title={isEditMode ? `Edit — ${stripAutoPrefix(service.name, service.rentalSegment)}` : 'Add Rental Service'}
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
          duration: 1,
          availableUnits: 1,
          currency: businessCurrency || 'EUR',
        }}
      >
        {/* Step 0 — Equipment */}
        {current === 0 && (
          <>
            <Form.Item
              name="name"
              label="Equipment Name"
              rules={[{ required: true, message: 'Please enter the equipment name' }]}
              extra="Duration and equipment class are added to the stored name automatically"
            >
              <Input placeholder="e.g. Full Kite Set, Harness, Wetsuit" />
            </Form.Item>

            <Form.Item
              name="rentalSegment"
              label="Equipment Class"
              rules={[{ required: true, message: 'Please select the equipment class' }]}
              extra="Used to group equipment in the rental catalogue"
            >
              <Select placeholder="Select class (SLS, D/LAB, Standard…)">
                {RENTAL_SEGMENT_OPTIONS.map((s) => (
                  <Option key={s.value} value={s.value}>{s.label}</Option>
                ))}
              </Select>
            </Form.Item>

            <Form.Item
              name="disciplineTag"
              label="Sport / Discipline"
              extra="Which sport is this equipment for? (optional)"
            >
              <Select placeholder="Select sport (optional)" allowClear>
                {DISCIPLINE_OPTIONS.map((d) => (
                  <Option key={d.value} value={d.value}>{d.label}</Option>
                ))}
              </Select>
            </Form.Item>
          </>
        )}

        {/* Step 1 — Duration & Stock */}
        {current === 1 && (
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="duration"
                label="Rental Duration (Hours)"
                rules={[{ required: true, message: 'Please enter a duration' }]}
                extra="Common durations: 1h, 4h, 8h"
              >
                <InputNumber min={0.5} max={48} step={0.5} style={{ width: '100%' }} placeholder="e.g. 1, 4 or 8" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="availableUnits"
                label="Available Units"
                rules={[{ required: true, type: 'number', min: 1, max: 50 }]}
                extra="How many of this equipment can be rented at the same time"
              >
                <InputNumber min={1} max={50} style={{ width: '100%' }} placeholder="e.g. 3" />
              </Form.Item>
            </Col>
          </Row>
        )}

        {/* Step 2 — Pricing */}
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
                <Form.Item name="price" label="Rental Price" rules={[{ required: true }]}>
                  <InputNumber
                    min={0}
                    style={{ width: '100%' }}
                    addonBefore={getCurrencySymbol?.(form.getFieldValue('currency') || businessCurrency || 'EUR')}
                  />
                </Form.Item>
              </Col>
            </Row>

            <Form.Item name="description" label="Description / Notes">
              <Input.TextArea rows={3} placeholder="Internal notes about this rental item" />
            </Form.Item>
          </>
        )}
      </Form>
    </Modal>
  );
}
