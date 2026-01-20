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
      
      const formattedValues = {
        ...values,
        serviceType: serviceType, // Add serviceType from state
        isPackage: isPackage, // Add isPackage from state
        category: categoryValue, // Respect locked category when provided
        startTime: values.startTime ? values.startTime.format('HH:mm') : undefined,
        endTime: values.endTime ? values.endTime.format('HH:mm') : undefined,
        imageUrl: imageUrl,
        currency: primaryCurrency,
        price: primaryPrice,
        prices: prices.filter(p => p.price != null && p.price > 0), // Only send valid prices
      };

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

  return (
    <Form
      form={form}
      layout="vertical"
      onFinish={handleSubmit}
      initialValues={{
        ...initialValues,
        startTime: initialValues.startTime ? moment(initialValues.startTime, 'HH:mm') : undefined,
        endTime: initialValues.endTime ? moment(initialValues.endTime, 'HH:mm') : undefined,
        isPackage: initialValues.isPackage || false,
        serviceType: initialValues.serviceType || 'private',
        duration: initialValues.duration ?? undefined,
        max_participants: initialValues.max_participants || initialValues.maxParticipants || 1,
        category: initialValues.category || defaultCategory || 'lesson',
        currency: initialValues.currency || selectedCurrency,
        color: '#64748b'
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
          >
            <Input placeholder={isLessonCategory ? "e.g. Private Kitesurfing Lesson" : "e.g. 2025 Duotone Rebel 9m"} allowClear />
          </Form.Item>
          <Row gutter={16} className="gap-y-4">
            <Col xs={24} md={12}>
              <Form.Item
                name="maxParticipants"
                label="Required people"
              >
                <InputNumber min={0} style={{ width: '100%' }} placeholder="Optional" />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
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
            </Col>
          </Row>
          {isCategoryLocked ? (
            <>
              <Form.Item name="category" hidden initialValue={resolvedCategory}>
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
            <p className="text-xs font-semibold uppercase tracking-[0.32em] text-slate-500">Session details</p>
            <h3 className="mt-1 text-lg font-semibold text-slate-900">Timing & capacity</h3>
            <p className="text-sm text-slate-500">Choose the {categoryLabel} duration and capacity shown to the team.</p>
          </div>
          <Row gutter={16} className="gap-y-4">
            <Col xs={24} md={12}>
              <Form.Item
                name="duration"
                label="Duration (hours)"
                rules={[{ required: true, message: 'Please enter a duration' }]}
              >
                <InputNumber 
                  min={0.5} 
                  max={48} 
                  step={0.5} 
                  style={{ width: '100%' }} 
                  placeholder="e.g. 2" 
                />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
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
