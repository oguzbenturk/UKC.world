// src/components/ServiceForm.jsx
import { useState, useEffect } from 'react';
import { 
  Form, 
  Input, 
  InputNumber, 
  Button, 
  Select, 
  Row,
  Col,
  Tag,
} from 'antd';
import { message } from '@/shared/utils/antdStatic';
// import { UploadOutlined, PlusOutlined, LoadingOutlined } from '@ant-design/icons';
import moment from 'moment';
import { serviceApi } from '@/shared/services/serviceApi';
import { useCurrency } from '@/shared/contexts/CurrencyContext';
import MultiCurrencyPriceInput from '@/shared/components/ui/MultiCurrencyPriceInput';
// import CurrencyInput from '@/shared/components/ui/CurrencyInput';

const { Option } = Select;
const { TextArea } = Input;

const DISCIPLINE_OPTIONS = [
  { value: 'kite', label: '🪁 Kitesurfing' },
  { value: 'wing', label: '🦅 Wing Foiling' },
  { value: 'kite_foil', label: '🏄 Kite Foiling' },
  { value: 'efoil', label: '⚡ E-Foil' },
  { value: 'accessory', label: '🎒 Accessories' },
  { value: 'premium', label: '💎 Premium' },
];

const RENTAL_SEGMENT_OPTIONS = [
  { value: 'standard', label: 'Standard' },
  { value: 'sls', label: 'SLS' },
  { value: 'dlab', label: 'D/LAB' },
  { value: 'efoil', label: 'E-Foil' },
  { value: 'board', label: 'Board' },
  { value: 'accessory', label: 'Accessory' },
];

const COLORS = [
  { label: 'Slate', value: '#64748b' },
  { label: 'Gray', value: '#6b7280' },
  { label: 'Zinc', value: '#71717a' },
  { label: 'Neutral', value: '#737373' },
  { label: 'Stone', value: '#78716c' },
  { label: 'Red', value: '#ef4444' },
  { label: 'Orange', value: '#f97316' },
  { label: 'Amber', value: '#f59e0b' },
  { label: 'Yellow', value: '#eab308' },
  { label: 'Lime', value: '#84cc16' },
  { label: 'Green', value: '#22c55e' },
  { label: 'Emerald', value: '#10b981' },
  { label: 'Teal', value: '#14b8a6' },
  { label: 'Cyan', value: '#06b6d4' },
  { label: 'Sky', value: '#0ea5e9' },
  { label: 'Blue', value: '#3b82f6' },
  { label: 'Indigo', value: '#6366f1' },
  { label: 'Violet', value: '#8b5cf6' },
  { label: 'Purple', value: '#a855f7' },
  { label: 'Fuchsia', value: '#d946ef' },
  { label: 'Pink', value: '#ec4899' },
  { label: 'Rose', value: '#f43f5e' },
];

// eslint-disable-next-line complexity
const ServiceForm = ({ onSubmit, initialValues = {}, isEditing = false, defaultCategory = null }) => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [isPackage, setIsPackage] = useState(initialValues.isPackage || false);
  const [serviceType, setServiceType] = useState(initialValues.serviceType || 'private');
  const [imageUrl, setImageUrl] = useState(initialValues.imageUrl || null);
  const [categories, setCategories] = useState([]);
  const [fullCategories, setFullCategories] = useState([]); // Store full category objects
  const { businessCurrency } = useCurrency();
  const [selectedCurrency, setSelectedCurrency] = useState(initialValues.currency || businessCurrency || 'EUR');
  const participantsValue = Form.useWatch('max_participants', form);
  const baseCategory = initialValues.category || defaultCategory || 'rental';
  const resolvedCategory = typeof baseCategory === 'string' ? baseCategory.toLowerCase() : 'rental';
  const resolvedCategoryLabel = resolvedCategory
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
  const isCategoryLocked = Boolean(defaultCategory);
  
  // Dynamic labels based on category
  const isLessonCategory = resolvedCategory === 'lesson' || resolvedCategory === 'lessons';
  const isRentalCategory = resolvedCategory === 'rental' || resolvedCategory.includes('rental') || resolvedCategory.includes('equipment');
  const categoryLabel = isLessonCategory ? 'lesson' : 'service';
  const categoryLabelCapitalized = isLessonCategory ? 'Lesson' : 'Service';

  useEffect(() => {
    // For new records, adopt business preferred currency when it changes
    if (!isEditing && !initialValues?.currency && businessCurrency) {
      setSelectedCurrency(businessCurrency);
      form.setFieldsValue({ currency: businessCurrency });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [businessCurrency]);

  useEffect(() => {
    if (isCategoryLocked) {
      setCategories([]);
      setFullCategories([]);
      return;
    }

    const loadCategories = async () => {
      try {
        const fullData = await serviceApi.getFullServiceCategories();
        setFullCategories(fullData);
        const simpleData = await serviceApi.getServiceCategories();
        setCategories(simpleData);
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('Failed to load service categories:', error);
        setCategories(['lesson', 'accommodation', 'rental', 'sale']);
        setFullCategories([]);
      }
    };

    loadCategories();
  }, [isCategoryLocked]);

  // eslint-disable-next-line complexity
  const handleSubmit = async (values) => {
    setLoading(true);
    try {
      // Convert times to string format if present
      const categoryValue = isCategoryLocked ? resolvedCategory : values.category;
      
      // Build prices array from form values (multi-currency support)
      const prices = values.prices || [];
      const primaryPrice = prices.length > 0 ? prices[0].price : values.price;
      const primaryCurrency = prices.length > 0 ? prices[0].currencyCode : selectedCurrency;
      
      const derivedMaxParticipants = parseInt(values.max_participants || 1, 10);
      const derivedServiceType = derivedMaxParticipants > 1 ? 'group' : 'private';
      const formattedValues = {
        ...values,
        serviceType: derivedServiceType,
        isPackage: isPackage, // Add isPackage from state
        category: categoryValue, // Respect locked category when provided
        startTime: values.startTime ? values.startTime.format('HH:mm') : undefined,
        endTime: values.endTime ? values.endTime.format('HH:mm') : undefined,
        imageUrl: imageUrl,
        currency: primaryCurrency,
        price: primaryPrice,
        prices: prices.filter(p => p.price != null && p.price > 0), // Only send valid prices
        disciplineTag: values.disciplineTag || null,
        lessonCategoryTag: values.lessonCategoryTag || derivedServiceType,
        rentalSegment: values.rentalSegment || null,
        insuranceRate: values.insuranceRate != null ? parseFloat(values.insuranceRate) : null,
        max_participants: derivedMaxParticipants,
        maxParticipants: derivedMaxParticipants,
      };

      // For rental services, auto-construct the stored name so that the duration
      // prefix always matches the actual duration field and the segment label is
      // included.  Format: "{duration}H - {SEGMENT} - {descriptive name}"
      if (isRentalCategory && formattedValues.duration && formattedValues.rentalSegment) {
        const SEGMENT_LABELS = { sls: 'SLS', dlab: 'D/LAB', standard: 'Standart', efoil: 'E-Foil', board: 'Board', accessory: 'Accessory' };
        const segLabel = SEGMENT_LABELS[formattedValues.rentalSegment] || formattedValues.rentalSegment.toUpperCase();
        // Strip any existing duration prefix (e.g. "4H - ") and segment from the typed name
        let baseName = (formattedValues.name || '')
          .replace(/^\d+\.?\d*[Hh]\s*[-–]\s*/u, '')
          .replace(new RegExp(`^${segLabel}\\s*[-–]\\s*`, 'i'), '')
          .trim();
        if (!baseName) baseName = formattedValues.name?.trim() || 'Rental Service';
        const dH = parseFloat(formattedValues.duration);
        const durationTag = dH % 1 === 0 ? `${dH}H` : `${dH}H`;
        formattedValues.name = `${durationTag} - ${segLabel} - ${baseName}`;
      }

      // Calculate savings for package if applicable
      if (isPackage && formattedValues.price && formattedValues.sessionsCount) {
        const singlePrice = formattedValues.price;
        const totalSessions = formattedValues.sessionsCount;
        const packagePrice = formattedValues.packagePrice;
        
        // If package price is not set or less than 50% of total value, suggest a better price
        if (!packagePrice || packagePrice < (singlePrice * totalSessions * 0.5)) {
          const suggestedPrice = Math.round(singlePrice * totalSessions * 0.85); // 15% discount
          
          if (!packagePrice) {
            formattedValues.packagePrice = suggestedPrice;
          }
        }
      }
      
      // Call the API and get the response
      let result;
      if (isEditing && initialValues.id) {
        result = await serviceApi.updateService(initialValues.id, formattedValues);
      } else {
        if (import.meta.env?.DEV) {
          // lightweight breadcrumb for debugging the payload being sent
          // eslint-disable-next-line no-console
          console.groupCollapsed('ServiceForm payload', formattedValues.name || '');
          // eslint-disable-next-line no-console
          console.log('Submitting payload:', formattedValues);
          // eslint-disable-next-line no-console
          console.groupEnd();
        }
        result = await serviceApi.createService(formattedValues);
      }
      
      // Pass the API response to the parent component
      await onSubmit(result);
      
      if (!isEditing) {
        form.resetFields();
        setImageUrl(null);
        setIsPackage(false);
        setServiceType('private');
      }
      message.success(`Service ${isEditing ? 'updated' : 'created'} successfully!`);
    } catch (error) {
      message.error(`Failed to ${isEditing ? 'update' : 'create'} service: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };
  // Image upload removed in this form; asset can be set via URL elsewhere

  // Custom price validation removed (handled in packages manager)

  const handleClear = () => {
    form.resetFields();
    // Reset any other state if necessary
    setSelectedCurrency(initialValues.currency || businessCurrency || 'EUR');
  };

  // For rental edits, strip the auto-generated prefix so the admin sees only the descriptive part
  const deriveEditName = (iv) => {
    if (!isEditing || !isRentalCategory || !iv.name) return iv.name;
    const SEGMENT_LABELS = { sls: 'SLS', dlab: 'D/LAB', standard: 'Standart', efoil: 'E-Foil', board: 'Board', accessory: 'Accessory' };
    let n = iv.name.replace(/^\d+\.?\d*[Hh]\s*[-–]\s*/u, '').trim();
    const seg = iv.rentalSegment || '';
    const segLabel = SEGMENT_LABELS[seg] || seg.toUpperCase();
    if (segLabel) n = n.replace(new RegExp(`^${segLabel.replace('/', '\\/')}\\s*[-–]\\s*`, 'i'), '').trim();
    return n || iv.name;
  };

  return (
    <Form
      form={form}
      layout="vertical"
      onFinish={handleSubmit}
      initialValues={{
        ...initialValues,
        name: deriveEditName(initialValues),
        startTime: initialValues.startTime ? moment(initialValues.startTime, 'HH:mm') : undefined,
        endTime: initialValues.endTime ? moment(initialValues.endTime, 'HH:mm') : undefined,
        isPackage: initialValues.isPackage || false,
        serviceType: initialValues.serviceType || 'private',
        duration: initialValues.duration ?? undefined,
        max_participants: initialValues.max_participants || initialValues.maxParticipants || 1,
        category: initialValues.category || defaultCategory || 'lesson',
        currency: initialValues.currency || selectedCurrency,
        color: '#64748b',
        disciplineTag: initialValues.disciplineTag || undefined,
        lessonCategoryTag: initialValues.lessonCategoryTag || undefined,
        rentalSegment: initialValues.rentalSegment || undefined,
        insuranceRate: initialValues.insuranceRate ?? undefined,
      }}
    >
      <div className="space-y-6">
        <section className="space-y-4 rounded-2xl border border-slate-200/70 bg-white p-5 shadow-sm">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.32em] text-slate-500">General</p>
            <h3 className="mt-1 text-lg font-semibold text-slate-900">{categoryLabelCapitalized} overview</h3>
            <p className="text-sm text-slate-500">Name the {categoryLabel} and place it in the right category.</p>
          </div>
          <Form.Item
            name="name"
            label={`${categoryLabelCapitalized} name`}
            rules={[{ required: true, message: `Please enter the ${categoryLabel} name` }]}
            extra={isRentalCategory ? 'Duration and equipment class are added to the name automatically' : undefined}
          >
            <Input placeholder={isLessonCategory ? "e.g. Private Kitesurfing Lesson" : isRentalCategory ? "e.g. Full Equipment Rental Service" : "e.g. 2025 Duotone Rebel 9m"} allowClear />
          </Form.Item>
          {isLessonCategory && (
            <Form.Item
              name="disciplineTag"
              label="Discipline"
              rules={[{ required: true, message: 'Please select a discipline' }]}
              extra="Determines which academy page shows this service"
            >
              <Select placeholder="Select discipline" allowClear>
                {DISCIPLINE_OPTIONS.map((d) => (
                  <Option key={d.value} value={d.value}>
                    {d.label}
                  </Option>
                ))}
              </Select>
            </Form.Item>
          )}
          {isRentalCategory && (
            <>
              <Form.Item
                name="disciplineTag"
                label="Sport / Discipline"
                extra="Which sport is this equipment for?"
              >
                <Select placeholder="Select sport (optional)" allowClear>
                  {DISCIPLINE_OPTIONS.filter(d => d.value !== 'premium').map((d) => (
                    <Option key={d.value} value={d.value}>
                      {d.label}
                    </Option>
                  ))}
                </Select>
              </Form.Item>
              <Form.Item
                name="rentalSegment"
                label="Equipment Class"
                rules={[{ required: true, message: 'Please select the equipment class' }]}
                extra="Used to group equipment in the rental catalogue"
              >
                <Select placeholder="Select class (SLS, D/LAB, Standard…)">
                  {RENTAL_SEGMENT_OPTIONS.map((s) => (
                    <Option key={s.value} value={s.value}>
                      {s.label}
                    </Option>
                  ))}
                </Select>
              </Form.Item>
              <Form.Item
                name="insuranceRate"
                label="Insurance rate (%)"
                extra="Optional. When set, customers are offered equipment insurance at checkout at this rate. Leave blank to disable insurance for this service."
              >
                <InputNumber
                  min={0}
                  max={100}
                  step={0.5}
                  precision={2}
                  placeholder="e.g. 10"
                  style={{ width: '100%' }}
                  addonAfter="%"
                />
              </Form.Item>
            </>
          )}
          {isLessonCategory && (
            <Form.Item
              name="lessonCategoryTag"
              label="Lesson type"
              extra="Private = 1 person, group = 2+ people in the same booking"
            >
              <Select placeholder="Derived from max participants if left blank" allowClear>
                <Option value="private">🧑 Private</Option>
                <Option value="semi-private">👥 Semi-private</Option>
                <Option value="group">👨‍👩‍👧 Group</Option>
                <Option value="supervision">🎓 Supervision</Option>
              </Select>
            </Form.Item>
          )}
          {!isRentalCategory && (
            <Form.Item
              name="color"
              label="Calendar color"
            >
              <Select placeholder="Choose a color swatch" allowClear>
                {COLORS.map(color => (
                  <Option key={color.value} value={color.value}>
                    <div style={{ display: 'flex', alignItems: 'center' }}>
                      <div style={{ width: '14px', height: '14px', backgroundColor: color.value, marginRight: '8px', borderRadius: '2px' }} />
                      {color.label}
                    </div>
                  </Option>
                ))}
              </Select>
            </Form.Item>
          )}
          {isCategoryLocked ? (
            <>
              <Form.Item name="category" hidden>
                <Input type="hidden" />
              </Form.Item>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="text-slate-500">Category</span>
                <Tag color="blue" className="!border-blue-100 !bg-blue-50 !text-blue-600 !rounded-full">
                  {resolvedCategoryLabel}
                </Tag>
              </div>
            </>
          ) : (
            <Form.Item
              name="category"
              label="Service category"
              rules={[{ required: true, message: 'Please choose a category' }]}
              extra={fullCategories.length > 0 ? 'Manage categories from Services → Categories' : 'Loading categories...'}
            >
              <Select placeholder="Select a category">
                {fullCategories.length > 0 ? (
                  fullCategories
                    .filter(cat => cat.status === 'active')
                    .map((category) => (
                      <Option key={category.id} value={category.name.toLowerCase()}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <span>{category.name}</span>
                          <span style={{ 
                            background: category.type === 'lessons' ? '#52c41a' : 
                                       category.type === 'rentals' ? '#fa8c16' : 
                                       category.type === 'accommodation' ? '#1890ff' : '#d9d9d9',
                            color: '#fff',
                            padding: '2px 6px',
                            borderRadius: '999px',
                            fontSize: '11px'
                          }}>
                            {category.type?.toUpperCase()}
                          </span>
                        </div>
                      </Option>
                    ))
                ) : categories.length > 0 ? (
                  categories.map((category) => (
                    <Option key={`category-${String(category).toLowerCase()}`} value={category}>
                      {category.charAt(0).toUpperCase() + category.slice(1).replace('-', ' ')}
                    </Option>
                  ))
                ) : (
                  <>
                    <Option value="lesson">Lesson</Option>
                    <Option value="kitesurfing">Kitesurfing</Option>
                    <Option value="windsurfing">Windsurfing</Option>
                    <Option value="equipment-rental">Equipment Rental</Option>
                    <Option value="other">Other</Option>
                  </>
                )}
              </Select>
            </Form.Item>
          )}
        </section>

        <section className="space-y-4 rounded-2xl border border-slate-200/70 bg-white p-5 shadow-sm">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.32em] text-slate-500">{isRentalCategory ? 'Rental period' : 'Session details'}</p>
            <h3 className="mt-1 text-lg font-semibold text-slate-900">{isRentalCategory ? 'Duration & availability' : 'Timing & capacity'}</h3>
            <p className="text-sm text-slate-500">{isRentalCategory ? 'Set how long each rental slot lasts (e.g. 1h, 4h, 8h per day).' : `Choose the ${categoryLabel} duration and capacity shown to the team.`}</p>
          </div>
          <Row gutter={16} className="gap-y-4">
            <Col xs={24} md={12}>
              <Form.Item
                name="duration"
                label={isRentalCategory ? 'Rental duration (hours)' : 'Duration (hours)'}
                rules={[{ required: true, message: 'Please enter a duration' }]}
                extra={isRentalCategory ? 'Common durations: 1h, 4h, 8h' : undefined}
              >
                <InputNumber 
                  min={0.5} 
                  max={48} 
                  step={0.5} 
                  style={{ width: '100%' }} 
                  placeholder={isRentalCategory ? 'e.g. 1, 4 or 8' : 'e.g. 2'} 
                />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              {isRentalCategory ? (
                <Form.Item
                  name="max_participants"
                  label="Available units"
                  rules={[
                    { required: true, message: 'Please set available units' },
                    { type: 'number', min: 1, max: 50, message: 'Must be between 1-50' }
                  ]}
                  extra="How many of this equipment can be rented at the same time"
                >
                  <InputNumber 
                    min={1} 
                    max={50}
                    style={{ width: '100%' }} 
                    placeholder="e.g. 3"
                  />
                </Form.Item>
              ) : (
                <Form.Item
                  name="max_participants"
                  label="Maximum participants"
                  rules={[
                    { required: true, message: 'Please set maximum participants' },
                    { type: 'number', min: 1, max: 50, message: 'Must be between 1-50 participants' }
                  ]}
                  extra={participantsValue && participantsValue > 1 ? `Shown as a group ${categoryLabel}` : `Shown as a single-person ${categoryLabel}`}
                >
                  <InputNumber 
                    min={1} 
                    max={50}
                    style={{ width: '100%' }} 
                    placeholder="e.g. 1"
                  />
                </Form.Item>
              )}
            </Col>
          </Row>
        </section>

        <section className="space-y-4 rounded-2xl border border-slate-200/70 bg-white p-5 shadow-sm">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.32em] text-slate-500">Pricing</p>
            <h3 className="mt-1 text-lg font-semibold text-slate-900">Set {categoryLabel} prices</h3>
            <p className="text-sm text-slate-500">Add prices in multiple currencies for international customers.</p>
          </div>
          <MultiCurrencyPriceInput
            form={form}
            name="prices"
            label={`${categoryLabelCapitalized} Prices`}
            primaryCurrencyName="currency"
            primaryPriceName="price"
            required={true}
            initialPrices={initialValues.prices}
            compact={false}
          />
        </section>

        <section className="space-y-4 rounded-2xl border border-slate-200/70 bg-white p-5 shadow-sm">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.32em] text-slate-500">Notes & actions</p>
            <h3 className="mt-1 text-lg font-semibold text-slate-900">Optional details</h3>
            <p className="text-sm text-slate-500">Leave guidance for staff or include special conditions.</p>
          </div>
          <Form.Item
            name="description"
            label="Internal notes"
          >
            <TextArea rows={4} placeholder="Add key details, limits, or handling instructions" />
          </Form.Item>
          <div className="flex flex-wrap justify-between gap-3">
            <Button onClick={handleClear} ghost>
              Reset form
            </Button>
            <Button type="primary" htmlType="submit" loading={loading}>
              Save {categoryLabel}
            </Button>
          </div>
        </section>
      </div>
    </Form>
  );
};

export default ServiceForm;
