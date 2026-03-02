// src/features/authentication/components/RegisterModal.jsx
// Multi-step registration wizard: Account → Profile → Address
import { useState, useEffect, useCallback } from 'react';
import { Modal, Form, Input, Button, Select, InputNumber, Progress } from 'antd';
import { message } from '@/shared/utils/antdStatic';
import {
  UserOutlined,
  MailOutlined,
  PhoneOutlined,
  LockOutlined,
  DollarOutlined,
  EnvironmentOutlined,
  ArrowLeftOutlined,
  ArrowRightOutlined,
  CheckOutlined,
} from '@ant-design/icons';
import apiClient from '@/shared/services/apiClient';
import { useCurrency } from '@/shared/contexts/CurrencyContext';

const { Option } = Select;

// ─── Step configuration ───
const STEPS = [
  { key: 'account', title: 'Account', subtitle: "Let's get you in!", icon: '🔐' },
  { key: 'profile', title: 'Rider Profile', subtitle: 'Help us find the right gear for you', icon: '🏄' },
  { key: 'address', title: 'Your Location', subtitle: 'Where should we ship your orders?', icon: '📍' },
];

// ─── Country codes ───
const COUNTRY_CODES = [
  { code: '+90', country: 'TR', label: '🇹🇷 Turkey (+90)' },
  { code: '+49', country: 'DE', label: '🇩🇪 Germany (+49)' },
  { code: '+44', country: 'GB', label: '🇬🇧 United Kingdom (+44)' },
  { code: '+33', country: 'FR', label: '🇫🇷 France (+33)' },
  { code: '+31', country: 'NL', label: '🇳🇱 Netherlands (+31)' },
  { code: '+34', country: 'ES', label: '🇪🇸 Spain (+34)' },
  { code: '+39', country: 'IT', label: '🇮🇹 Italy (+39)' },
  { code: '+30', country: 'GR', label: '🇬🇷 Greece (+30)' },
  { code: '+43', country: 'AT', label: '🇦🇹 Austria (+43)' },
  { code: '+32', country: 'BE', label: '🇧🇪 Belgium (+32)' },
  { code: '+41', country: 'CH', label: '🇨🇭 Switzerland (+41)' },
  { code: '+45', country: 'DK', label: '🇩🇰 Denmark (+45)' },
  { code: '+46', country: 'SE', label: '🇸🇪 Sweden (+46)' },
  { code: '+47', country: 'NO', label: '🇳🇴 Norway (+47)' },
  { code: '+48', country: 'PL', label: '🇵🇱 Poland (+48)' },
  { code: '+351', country: 'PT', label: '🇵🇹 Portugal (+351)' },
  { code: '+353', country: 'IE', label: '🇮🇪 Ireland (+353)' },
  { code: '+358', country: 'FI', label: '🇫🇮 Finland (+358)' },
  { code: '+385', country: 'HR', label: '🇭🇷 Croatia (+385)' },
  { code: '+420', country: 'CZ', label: '🇨🇿 Czech Republic (+420)' },
  { code: '+36', country: 'HU', label: '🇭🇺 Hungary (+36)' },
  { code: '+40', country: 'RO', label: '🇷🇴 Romania (+40)' },
  { code: '+359', country: 'BG', label: '🇧🇬 Bulgaria (+359)' },
  { code: '+381', country: 'RS', label: '🇷🇸 Serbia (+381)' },
  { code: '+386', country: 'SI', label: '🇸🇮 Slovenia (+386)' },
  { code: '+421', country: 'SK', label: '🇸🇰 Slovakia (+421)' },
  { code: '+372', country: 'EE', label: '🇪🇪 Estonia (+372)' },
  { code: '+371', country: 'LV', label: '🇱🇻 Latvia (+371)' },
  { code: '+370', country: 'LT', label: '🇱🇹 Lithuania (+370)' },
  { code: '+356', country: 'MT', label: '🇲🇹 Malta (+356)' },
  { code: '+357', country: 'CY', label: '🇨🇾 Cyprus (+357)' },
  { code: '+354', country: 'IS', label: '🇮🇸 Iceland (+354)' },
  { code: '+355', country: 'AL', label: '🇦🇱 Albania (+355)' },
  { code: '+387', country: 'BA', label: '🇧🇦 Bosnia (+387)' },
  { code: '+382', country: 'ME', label: '🇲🇪 Montenegro (+382)' },
  { code: '+389', country: 'MK', label: '🇲🇰 North Macedonia (+389)' },
  { code: '+375', country: 'BY', label: '🇧🇾 Belarus (+375)' },
  { code: '+380', country: 'UA', label: '🇺🇦 Ukraine (+380)' },
  { code: '+7', country: 'RU', label: '🇷🇺 Russia (+7)' },
  { code: '+1', country: 'US', label: '🇺🇸 USA (+1)' },
  { code: '+1', country: 'CA', label: '🇨🇦 Canada (+1)' },
  { code: '+52', country: 'MX', label: '🇲🇽 Mexico (+52)' },
  { code: '+55', country: 'BR', label: '🇧🇷 Brazil (+55)' },
  { code: '+54', country: 'AR', label: '🇦🇷 Argentina (+54)' },
  { code: '+56', country: 'CL', label: '🇨🇱 Chile (+56)' },
  { code: '+57', country: 'CO', label: '🇨🇴 Colombia (+57)' },
  { code: '+971', country: 'AE', label: '🇦🇪 UAE (+971)' },
  { code: '+966', country: 'SA', label: '🇸🇦 Saudi Arabia (+966)' },
  { code: '+972', country: 'IL', label: '🇮🇱 Israel (+972)' },
  { code: '+962', country: 'JO', label: '🇯🇴 Jordan (+962)' },
  { code: '+961', country: 'LB', label: '🇱🇧 Lebanon (+961)' },
  { code: '+61', country: 'AU', label: '🇦🇺 Australia (+61)' },
  { code: '+64', country: 'NZ', label: '🇳🇿 New Zealand (+64)' },
  { code: '+86', country: 'CN', label: '🇨🇳 China (+86)' },
  { code: '+91', country: 'IN', label: '🇮🇳 India (+91)' },
  { code: '+81', country: 'JP', label: '🇯🇵 Japan (+81)' },
  { code: '+82', country: 'KR', label: '🇰🇷 South Korea (+82)' },
  { code: '+65', country: 'SG', label: '🇸🇬 Singapore (+65)' },
  { code: '+66', country: 'TH', label: '🇹🇭 Thailand (+66)' },
  { code: '+20', country: 'EG', label: '🇪🇬 Egypt (+20)' },
  { code: '+27', country: 'ZA', label: '🇿🇦 South Africa (+27)' },
  { code: '+212', country: 'MA', label: '🇲🇦 Morocco (+212)' },
  { code: '+234', country: 'NG', label: '🇳🇬 Nigeria (+234)' },
];

// ─── Countries for address ───
const COUNTRIES = [
  'Turkey', 'Germany', 'United Kingdom', 'France', 'Netherlands', 'Spain', 'Italy',
  'Greece', 'Austria', 'Belgium', 'Switzerland', 'Denmark', 'Sweden', 'Norway',
  'Finland', 'Poland', 'Portugal', 'Ireland', 'Croatia', 'Czech Republic', 'Hungary',
  'Romania', 'Bulgaria', 'Serbia', 'Slovenia', 'Slovakia', 'Estonia', 'Latvia',
  'Lithuania', 'Malta', 'Cyprus', 'Iceland', 'Albania', 'Bosnia and Herzegovina',
  'Montenegro', 'North Macedonia', 'Ukraine', 'Russia', 'USA', 'Canada', 'Mexico',
  'Brazil', 'Argentina', 'Chile', 'Colombia', 'UAE', 'Saudi Arabia', 'Israel',
  'Australia', 'New Zealand', 'China', 'India', 'Japan', 'South Korea', 'Singapore',
  'Thailand', 'Egypt', 'South Africa', 'Morocco', 'Nigeria',
];

const RegisterModal = ({ visible, onClose, onSuccess }) => {
  const [form] = Form.useForm();
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [allowedCurrencies, setAllowedCurrencies] = useState([]);
  const { getSupportedCurrencies, businessCurrency } = useCurrency();
  const supportedCurrencies = getSupportedCurrencies();

  const fallbackCurrencies = [
    { label: 'Euro (€)', value: 'EUR', symbol: '€', name: 'Euro' },
    { label: 'US Dollar ($)', value: 'USD', symbol: '$', name: 'US Dollar' },
    { label: 'Turkish Lira (₺)', value: 'TRY', symbol: '₺', name: 'Turkish Lira' },
  ];

  const currencyOptions = allowedCurrencies.length > 0
    ? (supportedCurrencies?.length ? supportedCurrencies : fallbackCurrencies).filter(c =>
        allowedCurrencies.includes(c.value)
      )
    : (supportedCurrencies?.length ? supportedCurrencies : fallbackCurrencies);

  // Fetch allowed currencies
  useEffect(() => {
    const fetchAllowedCurrencies = async () => {
      try {
        const response = await apiClient.get('/settings/registration-currencies');
        setAllowedCurrencies(response.data.currencies || ['EUR', 'USD', 'TRY']);
      } catch {
        setAllowedCurrencies(['EUR', 'USD', 'TRY']);
      }
    };
    fetchAllowedCurrencies();
  }, []);

  // Set defaults when modal opens
  useEffect(() => {
    if (visible) {
      setStep(0);
      form.resetFields();
      const defaultCurrency = allowedCurrencies.includes('EUR')
        ? 'EUR'
        : allowedCurrencies.includes(businessCurrency) ? businessCurrency : (allowedCurrencies[0] || 'EUR');
      form.setFieldsValue({
        country_code: '+90',
        preferred_currency: defaultCurrency,
        country: 'Turkey',
      });
    }
  }, [visible, form, businessCurrency, allowedCurrencies]);

  const handleClose = useCallback(() => {
    form.resetFields();
    setStep(0);
    onClose();
  }, [form, onClose]);

  // Fields to validate per step
  const stepFields = [
    ['first_name', 'last_name', 'email', 'password', 'confirm_password'],
    ['country_code', 'phone', 'age', 'weight', 'preferred_currency'],
    ['address', 'city', 'country', 'zip_code'],
  ];

  const goNext = async () => {
    try {
      await form.validateFields(stepFields[step]);
      setStep((s) => Math.min(s + 1, STEPS.length - 1));
    } catch {
      // validation errors shown automatically by antd
    }
  };

  const goBack = () => setStep((s) => Math.max(s - 1, 0));

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      setLoading(true);

      const fullPhone = `${values.country_code}${values.phone}`;

      await apiClient.post('/auth/register', {
        first_name: values.first_name,
        last_name: values.last_name,
        email: values.email.toLowerCase(),
        phone: fullPhone,
        password: values.password,
        age: values.age,
        weight: values.weight,
        preferred_currency: values.preferred_currency,
        address: values.address,
        city: values.city,
        country: values.country,
        zip_code: values.zip_code,
      });

      message.success('Account created successfully! Please login.');
      form.resetFields();
      setStep(0);
      onSuccess?.();
      onClose();
    } catch (error) {
      const errorMessage = error.response?.data?.error || error.message || 'Registration failed';
      message.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  // ─── Password strength indicator ───
  const passwordValue = Form.useWatch('password', form) || '';
  const getPasswordStrength = (pw) => {
    if (!pw) return { pct: 0, label: '', color: '#d9d9d9' };
    let score = 0;
    if (pw.length >= 8) score++;
    if (/[a-z]/.test(pw)) score++;
    if (/[A-Z]/.test(pw)) score++;
    if (/\d/.test(pw)) score++;
    if (/[@$!%*?&]/.test(pw)) score++;
    if (score <= 2) return { pct: 30, label: 'Weak', color: '#ff4d4f' };
    if (score <= 3) return { pct: 55, label: 'Fair', color: '#faad14' };
    if (score <= 4) return { pct: 80, label: 'Good', color: '#1890ff' };
    return { pct: 100, label: 'Strong', color: '#52c41a' };
  };
  const pwStrength = getPasswordStrength(passwordValue);

  // ─── Shared form item label helper ───
  const lbl = (text) => <span className="text-slate-300 text-sm">{text}</span>;

  return (
    <Modal
      open={visible}
      onCancel={handleClose}
      footer={null}
      width={480}
      maskClosable={!loading}
      closable={!loading}
      destroyOnClose
      styles={{ content: { padding: 0, overflow: 'hidden', borderRadius: 16 } }}
    >
      {/* Header with progress */}
      <div className="bg-gradient-to-r from-sky-600 to-blue-700 px-6 pt-6 pb-4">
        <div className="flex items-center gap-3 mb-3">
          <span className="text-2xl">{STEPS[step].icon}</span>
          <div>
            <h2 className="text-xl font-bold text-white m-0 leading-tight">{STEPS[step].title}</h2>
            <p className="text-sky-200 text-sm m-0">{STEPS[step].subtitle}</p>
          </div>
        </div>
        {/* Step progress bars */}
        <div className="flex items-center gap-2 mt-3">
          {STEPS.map((s, i) => (
            <div key={s.key} className="flex-1">
              <div
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  i <= step ? 'bg-white' : 'bg-white/30'
                }`}
              />
            </div>
          ))}
        </div>
        <p className="text-sky-200/80 text-xs mt-2 mb-0 text-right">Step {step + 1} of {STEPS.length}</p>
      </div>

      {/* Form body */}
      <div className="px-6 py-5 bg-slate-800">
        <Form form={form} layout="vertical" requiredMark={false}>
          {/* ─── STEP 1: Account ─── */}
          <div style={{ display: step === 0 ? 'block' : 'none' }}>
            <div className="grid grid-cols-2 gap-3">
              <Form.Item
                name="first_name"
                label={lbl('First Name')}
                rules={[{ required: true, message: 'Required' }]}
              >
                <Input
                  prefix={<UserOutlined className="text-slate-500" />}
                  placeholder="John"
                  autoComplete="given-name"
                  size="large"
                />
              </Form.Item>
              <Form.Item
                name="last_name"
                label={lbl('Last Name')}
                rules={[{ required: true, message: 'Required' }]}
              >
                <Input
                  prefix={<UserOutlined className="text-slate-500" />}
                  placeholder="Doe"
                  autoComplete="family-name"
                  size="large"
                />
              </Form.Item>
            </div>

            <Form.Item
              name="email"
              label={lbl('Email Address')}
              rules={[
                { required: true, message: 'Required' },
                { type: 'email', message: 'Enter a valid email' },
              ]}
            >
              <Input
                prefix={<MailOutlined className="text-slate-500" />}
                placeholder="you@example.com"
                autoComplete="email"
                size="large"
              />
            </Form.Item>

            <Form.Item
              name="password"
              label={lbl('Password')}
              rules={[
                { required: true, message: 'Required' },
                { min: 8, message: 'Min 8 characters' },
                {
                  pattern: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])/,
                  message: 'Need uppercase, lowercase, number & special char (@$!%*?&)',
                },
              ]}
            >
              <Input.Password
                prefix={<LockOutlined className="text-slate-500" />}
                placeholder="••••••••"
                autoComplete="new-password"
                size="large"
              />
            </Form.Item>
            {passwordValue && (
              <div className="flex items-center gap-2 -mt-3 mb-4">
                <div className="flex-1">
                  <Progress
                    percent={pwStrength.pct}
                    showInfo={false}
                    strokeColor={pwStrength.color}
                    trailColor="#334155"
                    size="small"
                  />
                </div>
                <span className="text-xs font-medium" style={{ color: pwStrength.color }}>
                  {pwStrength.label}
                </span>
              </div>
            )}

            <Form.Item
              name="confirm_password"
              label={lbl('Confirm Password')}
              dependencies={['password']}
              rules={[
                { required: true, message: 'Required' },
                ({ getFieldValue }) => ({
                  validator(_, value) {
                    if (!value || getFieldValue('password') === value) return Promise.resolve();
                    return Promise.reject(new Error('Passwords don\'t match'));
                  },
                }),
              ]}
            >
              <Input.Password
                prefix={<LockOutlined className="text-slate-500" />}
                placeholder="••••••••"
                autoComplete="new-password"
                size="large"
              />
            </Form.Item>
          </div>

          {/* ─── STEP 2: Rider Profile ─── */}
          <div style={{ display: step === 1 ? 'block' : 'none' }}>
            <Form.Item label={lbl('Phone Number')} required>
              <Input.Group compact>
                <Form.Item
                  name="country_code"
                  noStyle
                  rules={[{ required: true, message: 'Required' }]}
                >
                  <Select
                    style={{ width: 150 }}
                    showSearch
                    size="large"
                    filterOption={(input, option) =>
                      option.label.toLowerCase().includes(input.toLowerCase())
                    }
                  >
                    {COUNTRY_CODES.map((item) => (
                      <Option key={`${item.code}-${item.country}`} value={item.code} label={item.label}>
                        {item.label}
                      </Option>
                    ))}
                  </Select>
                </Form.Item>
                <Form.Item
                  name="phone"
                  noStyle
                  rules={[
                    { required: true, message: 'Required' },
                    { pattern: /^[0-9]{6,15}$/, message: 'Valid phone number needed' },
                  ]}
                >
                  <Input
                    prefix={<PhoneOutlined className="text-slate-500" />}
                    placeholder="5xx xxx xxxx"
                    autoComplete="tel-national"
                    size="large"
                    style={{ width: 'calc(100% - 150px)' }}
                  />
                </Form.Item>
              </Input.Group>
            </Form.Item>

            <div className="grid grid-cols-2 gap-3">
              <Form.Item
                name="age"
                label={lbl('Age')}
                rules={[
                  { required: true, message: 'Required' },
                  { type: 'number', min: 10, max: 100, message: '10–100' },
                ]}
                extra={<span className="text-slate-500 text-xs">For safety guidelines</span>}
              >
                <InputNumber placeholder="e.g. 25" className="w-full" min={10} max={100} size="large" />
              </Form.Item>
              <Form.Item
                name="weight"
                label={lbl('Weight (kg)')}
                rules={[
                  { required: true, message: 'Required' },
                  { type: 'number', min: 30, max: 200, message: '30–200 kg' },
                ]}
                extra={<span className="text-slate-500 text-xs">For correct kite & board sizing</span>}
              >
                <InputNumber placeholder="e.g. 70" className="w-full" min={30} max={200} size="large" />
              </Form.Item>
            </div>

            <Form.Item
              name="preferred_currency"
              label={lbl('Preferred Currency')}
              rules={[{ required: true, message: 'Required' }]}
              extra={<span className="text-slate-500 text-xs">Prices will be shown in this currency</span>}
            >
              <Select
                placeholder="Select currency"
                suffixIcon={<DollarOutlined className="text-slate-500" />}
                showSearch
                size="large"
                filterOption={(input, option) =>
                  option.label.toLowerCase().includes(input.toLowerCase())
                }
              >
                {currencyOptions.map((c) => (
                  <Option key={c.value} value={c.value} label={c.label}>
                    <span className="flex items-center gap-2">
                      <span>{c.symbol}</span>
                      <span>{c.name}</span>
                      <span className="text-slate-400">({c.value})</span>
                    </span>
                  </Option>
                ))}
              </Select>
            </Form.Item>
          </div>

          {/* ─── STEP 3: Address ─── */}
          <div style={{ display: step === 2 ? 'block' : 'none' }}>
            <div className="mb-3 p-3 rounded-lg bg-sky-900/30 border border-sky-700/40">
              <p className="text-sky-300 text-xs m-0">
                📦 Your address will be used as the default delivery address for shop orders. You can always change it at checkout.
              </p>
            </div>

            <Form.Item
              name="address"
              label={lbl('Street Address')}
              rules={[{ required: true, message: 'Required' }]}
            >
              <Input
                prefix={<EnvironmentOutlined className="text-slate-500" />}
                placeholder="123 Beach Road, Apt 4"
                autoComplete="street-address"
                size="large"
              />
            </Form.Item>

            <div className="grid grid-cols-2 gap-3">
              <Form.Item
                name="city"
                label={lbl('City')}
                rules={[{ required: true, message: 'Required' }]}
              >
                <Input placeholder="e.g. Istanbul" autoComplete="address-level2" size="large" />
              </Form.Item>
              <Form.Item
                name="zip_code"
                label={lbl('Postal / ZIP Code')}
                rules={[{ required: true, message: 'Required' }]}
              >
                <Input placeholder="e.g. 34000" autoComplete="postal-code" size="large" />
              </Form.Item>
            </div>

            <Form.Item
              name="country"
              label={lbl('Country')}
              rules={[{ required: true, message: 'Required' }]}
            >
              <Select
                placeholder="Select country"
                showSearch
                size="large"
                filterOption={(input, option) =>
                  option.children.toLowerCase().includes(input.toLowerCase())
                }
              >
                {COUNTRIES.map((c) => (
                  <Option key={c} value={c}>{c}</Option>
                ))}
              </Select>
            </Form.Item>
          </div>
        </Form>

        {/* ─── Navigation buttons ─── */}
        <div className="flex items-center justify-between mt-4 pt-4 border-t border-slate-700">
          {step > 0 ? (
            <Button
              icon={<ArrowLeftOutlined />}
              onClick={goBack}
              disabled={loading}
              size="large"
              className="text-slate-300"
            >
              Back
            </Button>
          ) : (
            <Button onClick={handleClose} disabled={loading} size="large" className="text-slate-300">
              Cancel
            </Button>
          )}

          {step < STEPS.length - 1 ? (
            <Button
              type="primary"
              onClick={goNext}
              size="large"
              className="px-8"
              style={{ background: '#0284c7', borderColor: '#0284c7' }}
            >
              Continue <ArrowRightOutlined />
            </Button>
          ) : (
            <Button
              type="primary"
              onClick={handleSubmit}
              loading={loading}
              size="large"
              icon={<CheckOutlined />}
              className="px-8"
              style={{ background: '#059669', borderColor: '#059669' }}
            >
              Create Account
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
};

export default RegisterModal;
