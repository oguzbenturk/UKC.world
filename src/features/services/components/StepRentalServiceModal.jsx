import { useMemo, useState, useEffect } from 'react';
import { Modal, Steps, Form, Input, InputNumber, Select, Row, Col, Button, App } from 'antd';
import { ToolOutlined, ClockCircleOutlined, DollarOutlined, PlusOutlined, DeleteOutlined } from '@ant-design/icons';
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

const QUICK_DURATIONS = [
  { label: '1h', value: 1 },
  { label: '4h', value: 4 },
  { label: '8h (Full Day)', value: 8 },
  { label: '1 Week', value: 168 },
];

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

  // Multi-duration tiers (create mode only)
  const [tiers, setTiers] = useState([{ duration: 1, price: '', units: 1 }]);

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
      setTiers([{ duration: 1, price: '', units: 1 }]);
    }
    setCurrent(0);
  }, [open, service?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const steps = useMemo(
    () => isEditMode
      ? [
          { key: 'equipment', title: 'Equipment', icon: <ToolOutlined /> },
          { key: 'duration', title: 'Duration & Stock', icon: <ClockCircleOutlined /> },
          { key: 'pricing', title: 'Pricing', icon: <DollarOutlined /> },
        ]
      : [
          { key: 'equipment', title: 'Equipment', icon: <ToolOutlined /> },
          { key: 'tiers', title: 'Duration & Pricing', icon: <ClockCircleOutlined /> },
        ],
    [isEditMode]
  );

  // Edit-mode field validation per step
  const editFieldsPerStep = {
    equipment: ['name', 'rentalSegment'],
    duration: ['duration', 'availableUnits'],
    pricing: ['currency', 'price'],
  };

  const buildPayload = (values, duration, price, units) => {
    const segment = values.rentalSegment || 'standard';
    const segLabel = SEGMENT_LABELS[segment] || segment.toUpperCase();
    const baseName = (values.name || '').trim() || 'Rental Service';
    const dH = parseFloat(duration);
    const durationTag = Number.isFinite(dH) ? `${dH % 1 === 0 ? dH : dH}H` : '';
    const storedName = durationTag ? `${durationTag} - ${segLabel} - ${baseName}` : `${segLabel} - ${baseName}`;

    return {
      name: storedName,
      category: 'rental',
      duration: parseFloat(duration),
      price: parseFloat(price),
      currency: values.currency || businessCurrency || 'EUR',
      description: values.description || '',
      serviceType: 'rental',
      isPackage: false,
      disciplineTag: values.disciplineTag || null,
      rentalSegment: segment,
      max_participants: parseInt(units, 10) || 1,
      maxParticipants: parseInt(units, 10) || 1,
    };
  };

  const handleClose = () => {
    form.resetFields();
    setTiers([{ duration: 1, price: '', units: 1 }]);
    setCurrent(0);
    onClose?.();
  };

  const validateTiers = () => {
    for (let i = 0; i < tiers.length; i++) {
      const t = tiers[i];
      if (!t.duration || t.duration <= 0) {
        message.error(`Tier ${i + 1}: Duration is required`);
        return false;
      }
      if (t.price === '' || t.price === null || t.price === undefined || parseFloat(t.price) < 0) {
        message.error(`Tier ${i + 1}: Price is required`);
        return false;
      }
    }
    // Check for duplicate durations
    const durations = tiers.map(t => parseFloat(t.duration));
    const unique = new Set(durations);
    if (unique.size !== durations.length) {
      message.error('Each duration must be unique');
      return false;
    }
    return true;
  };

  const next = async () => {
    const stepKey = steps[current].key;
    if (stepKey === 'equipment') {
      await form.validateFields(['name', 'rentalSegment']);
    } else if (isEditMode && editFieldsPerStep[stepKey]) {
      await form.validateFields(editFieldsPerStep[stepKey]);
    }
    setCurrent((c) => c + 1);
  };

  const prev = () => setCurrent((c) => c - 1);

  const updateTier = (index, field, value) => {
    setTiers(prev => prev.map((t, i) => i === index ? { ...t, [field]: value } : t));
  };

  const addTier = () => {
    setTiers(prev => [...prev, { duration: '', price: '', units: 1 }]);
  };

  const removeTier = (index) => {
    if (tiers.length <= 1) return;
    setTiers(prev => prev.filter((_, i) => i !== index));
  };

  const addQuickDuration = (dur) => {
    if (tiers.some(t => parseFloat(t.duration) === dur)) return;
    setTiers(prev => [...prev, { duration: dur, price: '', units: 1 }]);
  };

  const handleSubmit = async () => {
    try {
      const values = form.getFieldsValue(true);
      setSubmitting(true);

      if (isEditMode) {
        // Edit mode: single service update
        await form.validateFields(['name', 'rentalSegment', 'currency', 'price', 'duration', 'availableUnits']);
        const payload = buildPayload(values, values.duration, values.price, values.availableUnits);
        const updated = await serviceApi.updateService(service.id, payload);
        message.success('Rental service updated');
        onUpdated?.(updated);
      } else {
        // Create mode: validate equipment fields + tiers
        await form.validateFields(['name', 'rentalSegment']);
        if (!validateTiers()) {
          setSubmitting(false);
          return;
        }

        // Create one service per duration tier
        let lastCreated = null;
        for (const tier of tiers) {
          const payload = buildPayload(values, tier.duration, tier.price, tier.units);
          lastCreated = await serviceApi.createService(payload);
        }
        message.success(`Created ${tiers.length} rental service${tiers.length > 1 ? 's' : ''}`);
        onCreated?.(lastCreated);
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

  const currencySymbol = getCurrencySymbol?.(form.getFieldValue('currency') || businessCurrency || 'EUR') || '€';

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
                {isEditMode ? 'Update Service' : `Create ${tiers.length > 1 ? `${tiers.length} Services` : 'Service'}`}
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

            <Form.Item name="description" label="Description / Notes">
              <Input.TextArea rows={3} placeholder="Equipment description visible to customers" />
            </Form.Item>

            <Form.Item name="currency" label="Currency" rules={[{ required: true }]}>
              <Select showSearch optionFilterProp="label" placeholder={businessCurrency || 'EUR'} style={{ width: 160 }}>
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
          </>
        )}

        {/* Create mode — Step 1: Duration & Pricing tiers */}
        {!isEditMode && current === 1 && (
          <div>
            <div className="mb-3">
              <div className="text-sm text-gray-500 mb-2">Quick add common durations:</div>
              <div className="flex gap-2 flex-wrap">
                {QUICK_DURATIONS.map((qd) => {
                  const exists = tiers.some(t => parseFloat(t.duration) === qd.value);
                  return (
                    <Button
                      key={qd.value}
                      size="small"
                      type={exists ? 'default' : 'dashed'}
                      disabled={exists}
                      onClick={() => addQuickDuration(qd.value)}
                    >
                      + {qd.label}
                    </Button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-3">
              {tiers.map((tier, idx) => (
                <div key={idx} className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg border">
                  <div className="flex-1">
                    <div className="text-xs text-gray-400 mb-1">Duration (hours)</div>
                    <InputNumber
                      min={0.5}
                      max={720}
                      step={0.5}
                      value={tier.duration}
                      onChange={(v) => updateTier(idx, 'duration', v)}
                      style={{ width: '100%' }}
                      placeholder="e.g. 1, 4, 8"
                    />
                  </div>
                  <div className="flex-1">
                    <div className="text-xs text-gray-400 mb-1">Price ({currencySymbol})</div>
                    <InputNumber
                      min={0}
                      value={tier.price}
                      onChange={(v) => updateTier(idx, 'price', v)}
                      style={{ width: '100%' }}
                      placeholder="e.g. 35"
                      addonBefore={currencySymbol}
                    />
                  </div>
                  <div style={{ width: 100 }}>
                    <div className="text-xs text-gray-400 mb-1">Units</div>
                    <InputNumber
                      min={1}
                      max={50}
                      value={tier.units}
                      onChange={(v) => updateTier(idx, 'units', v)}
                      style={{ width: '100%' }}
                    />
                  </div>
                  <div className="pt-5">
                    <Button
                      type="text"
                      danger
                      icon={<DeleteOutlined />}
                      disabled={tiers.length <= 1}
                      onClick={() => removeTier(idx)}
                    />
                  </div>
                </div>
              ))}
            </div>

            <Button
              type="dashed"
              icon={<PlusOutlined />}
              onClick={addTier}
              className="mt-3 w-full"
            >
              Add Duration Tier
            </Button>

            <div className="mt-4 p-3 bg-blue-50 rounded-lg text-sm text-blue-700">
              <strong>💡 Tip:</strong> Adding multiple durations (e.g. 1h, 4h, 8h) for the same equipment 
              creates one grouped card on the customer page where they can choose their preferred duration.
            </div>
          </div>
        )}

        {/* Edit mode — Step 1: Single duration & stock */}
        {isEditMode && current === 1 && (
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="duration"
                label="Rental Duration (Hours)"
                rules={[{ required: true, message: 'Please enter a duration' }]}
              >
                <InputNumber min={0.5} max={720} step={0.5} style={{ width: '100%' }} placeholder="e.g. 1, 4 or 8" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="availableUnits"
                label="Available Units"
                rules={[{ required: true, type: 'number', min: 1, max: 50 }]}
              >
                <InputNumber min={1} max={50} style={{ width: '100%' }} placeholder="e.g. 3" />
              </Form.Item>
            </Col>
          </Row>
        )}

        {/* Edit mode — Step 2: Pricing */}
        {isEditMode && current === 2 && (
          <>
            <Row gutter={16}>
              <Col span={8}>
                <Form.Item name="currency" label="Currency" rules={[{ required: true }]}>
                  <Select showSearch optionFilterProp="label" placeholder={businessCurrency || 'EUR'}>
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
