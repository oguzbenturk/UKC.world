// src/features/authentication/components/RegisterModal.jsx
// Multi-step registration wizard: Account → Profile → Address
// Plannivo editorial styling — see docs/design-system/
import { useState, useEffect, useCallback } from 'react';
import { Modal, Form, Input, Button, Select, InputNumber, Progress, DatePicker, Space } from 'antd';
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
  IdcardOutlined,
  CompassOutlined
} from '@ant-design/icons';
import apiClient from '@/shared/services/apiClient';
import {
  REGISTRATION_DISABLED_USER_MESSAGE,
  SIGN_IN_DISABLED_USER_MESSAGE,
} from '@/shared/services/auth/authService';
import { useCurrency } from '@/shared/contexts/CurrencyContext';
import { useAuth } from '@/shared/hooks/useAuth';

const { Option } = Select;

// ─── Plannivo design tokens (see docs/design-system/) ───
const P = {
  bone:        '#F0EADD',
  paper:       '#F5F0E3',
  paperSoft:   '#F8F4EA',
  ink:         '#141E28',
  ink80:       'rgba(20, 30, 40, 0.80)',
  ink60:       'rgba(20, 30, 40, 0.60)',
  ink40:       'rgba(20, 30, 40, 0.42)',
  ink20:       'rgba(20, 30, 40, 0.20)',
  line:        '#D8CEB6',
  seafoam:     '#557872',
  seafoamSoft: '#A7BAB4',
  clay:        '#B9876D',
};
const SERIF = '"Fraunces", "Cormorant Garamond", Georgia, serif';
const SANS  = '"Instrument Sans", -apple-system, BlinkMacSystemFont, "Helvetica Neue", Arial, sans-serif';
const MONO  = '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
const FRAME_SHADOW =
  '0 1px 0 rgba(255, 255, 255, 0.8) inset,' +
  '0 40px 80px -40px rgba(20, 30, 40, 0.22),' +
  '0 15px 25px -20px rgba(20, 30, 40, 0.12)';

// ─── Step configuration ───
const STEPS = [
  { key: 'account', title: 'Account', subtitle: "Let's get you in!", icon: <UserOutlined /> },
  { key: 'profile', title: 'Rider Profile', subtitle: 'Help us find the right gear for you', icon: <IdcardOutlined /> },
  { key: 'address', title: 'Your Location', subtitle: 'Where should we ship your orders?', icon: <CompassOutlined /> },
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

const RegisterModal = ({ visible, onClose, onSuccess, inline = false }) => {
  const [form] = Form.useForm();
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [allowedCurrencies, setAllowedCurrencies] = useState([]);
  const { getSupportedCurrencies, businessCurrency } = useCurrency();
  const { login } = useAuth();
  const supportedCurrencies = getSupportedCurrencies();

  const fallbackCurrencies = [
    { label: 'Euro (€)', value: 'EUR', symbol: '€', name: 'Euro' },
    { label: 'US Dollar ($)', value: 'USD', symbol: '$', name: 'US Dollar' },
    { label: 'Turkish Lira (₺)', value: 'TRY', symbol: '₺', name: 'Turkish Lira' },
    { label: 'British Pound (£)', value: 'GBP', symbol: '£', name: 'British Pound' },
    { label: 'Swiss Franc (CHF)', value: 'CHF', symbol: 'CHF', name: 'Swiss Franc' },
  ];

  // For registration, always use fallback list (user is not yet in DB so active currencies
  // may be limited). Filter by allowedCurrencies if admin has restricted them.
  const currencyOptions = allowedCurrencies.length > 0
    ? fallbackCurrencies.filter(c => allowedCurrencies.includes(c.value))
    : fallbackCurrencies;

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
    ['country_code', 'phone', 'date_of_birth', 'weight', 'preferred_currency'],
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
        date_of_birth: values.date_of_birth ? values.date_of_birth.format('YYYY-MM-DD') : undefined,
        weight: values.weight,
        preferred_currency: values.preferred_currency,
        address: values.address,
        city: values.city,
        country: values.country,
        zip_code: values.zip_code,
      });

      // Auto-login after successful registration
      const loggedIn = await login(values.email.toLowerCase(), values.password);
      if (loggedIn) {
        message.success(`Welcome, ${values.first_name}! Your account is ready.`);
      } else {
        message.success('Account created successfully! Please login.');
      }

      form.resetFields();
      setStep(0);
      onSuccess?.();
      onClose();
    } catch (error) {
      if (error.response?.data?.code === 'LOGIN_DISABLED') {
        message.info(REGISTRATION_DISABLED_USER_MESSAGE);
      } else if (error.message === SIGN_IN_DISABLED_USER_MESSAGE) {
        message.info(SIGN_IN_DISABLED_USER_MESSAGE);
      } else {
        const errorMessage = error.response?.data?.error || error.message || 'Registration failed';
        message.error(errorMessage);
      }
    } finally {
      setLoading(false);
    }
  };

  // ─── Shared form item label helper ───
  const lbl = (text) => (
    <span style={{
      fontFamily: MONO,
      fontSize: '0.6rem',
      letterSpacing: '0.14em',
      textTransform: 'uppercase',
      color: P.ink40,
    }}>{text}</span>
  );

  const content = (
    <div
      style={{
        display: 'flex', flexDirection: 'column',
        background: P.bone,
        color: P.ink,
        borderRadius: inline ? 14 : 0,
        overflow: 'hidden', width: '100%', position: 'relative',
        border: inline ? `1px solid ${P.line}` : 'none',
        boxShadow: inline ? FRAME_SHADOW : 'none',
        fontFamily: SANS,
      }}
    >
      {/* Header — editorial masthead */}
      <div
        style={{
          padding: '1.75rem 2rem 1.25rem',
          background: P.bone,
          backgroundImage: `radial-gradient(ellipse 560px 320px at 50% 0%, rgba(85,120,114,0.08), transparent 70%)`,
          borderBottom: `1px solid ${P.line}`,
        }}
      >
        {/* Brand mark */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.55em', marginBottom: '1rem' }}>
          <span
            aria-hidden="true"
            style={{
              width: 10, height: 10, borderRadius: '50%',
              background: P.seafoam,
              boxShadow: `0 0 0 3px ${P.seafoamSoft}`,
            }}
          />
          <span style={{
            fontFamily: SERIF,
            fontVariationSettings: '"opsz" 9, "SOFT" 0, "wght" 460',
            fontSize: '1.05rem',
            letterSpacing: '-0.015em',
            color: P.ink,
          }}>
            Plannivo
          </span>
        </div>

        {/* Kicker + title */}
        <p style={{
          fontFamily: MONO, fontSize: '0.66rem',
          letterSpacing: '0.14em', textTransform: 'uppercase',
          color: P.ink40,
          margin: '0 0 0.75em',
          display: 'flex', alignItems: 'center', gap: '0.6em',
        }}>
          <span style={{
            display: 'inline-block',
            padding: '3px 8px',
            background: P.ink, color: P.bone,
            borderRadius: 3,
            fontSize: '0.58rem',
            letterSpacing: '0.08em',
            fontWeight: 500,
          }}>{String(step).padStart(2, '0')}</span>
          {STEPS[step].title}
        </p>

        <h2 style={{
          fontFamily: SERIF,
          fontVariationSettings: '"opsz" 60, "SOFT" 30, "wght" 400',
          fontSize: '1.5rem',
          lineHeight: 1.1,
          letterSpacing: '-0.02em',
          color: P.ink,
          margin: '0 0 0.75em',
        }}>
          <em style={{
            fontStyle: 'italic',
            fontVariationSettings: '"opsz" 60, "SOFT" 80, "wght" 380',
            color: P.seafoam,
          }}>{STEPS[step].subtitle}</em>
        </h2>

        {/* Step progress */}
        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
          {STEPS.map((s, i) => (
            <div
              key={s.key}
              style={{
                flex: 1, height: 2, borderRadius: 999,
                background: i <= step ? P.seafoam : P.line,
                transition: 'background 0.5s ease',
              }}
            />
          ))}
        </div>
        <p style={{
          fontFamily: MONO,
          fontSize: '0.6rem',
          letterSpacing: '0.14em',
          textTransform: 'uppercase',
          color: P.ink40,
          margin: '0.7rem 0 0',
          textAlign: 'right',
        }}>
          Step {step + 1} of {STEPS.length}
        </p>
      </div>

      {/* Form body */}
      <div style={{ padding: '1.75rem 2rem 1.5rem', background: P.bone }}>
        <Form form={form} layout="vertical" requiredMark={false} className="register-form plannivo-form">
          {/* ─── STEP 1: Account ─── */}
          <div style={{ display: step === 0 ? 'block' : 'none' }}>
            <div className="grid grid-cols-2 gap-3">
              <Form.Item
                name="first_name"
                label={lbl('First Name')}
                rules={[{ required: true, message: 'Required' }]}
              >
                <Input
                  prefix={<UserOutlined style={{ color: P.ink40 }} />}
                  placeholder="John"
                  autoComplete="given-name"
                  size="large"
                  className="rounded-lg"
                />
              </Form.Item>
              <Form.Item
                name="last_name"
                label={lbl('Last Name')}
                rules={[{ required: true, message: 'Required' }]}
              >
                <Input
                  prefix={<UserOutlined style={{ color: P.ink40 }} />}
                  placeholder="Doe"
                  autoComplete="family-name"
                  size="large"
                  className="rounded-lg"
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
                prefix={<MailOutlined style={{ color: P.ink40 }} />}
                placeholder="you@example.com"
                autoComplete="email"
                size="large"
                className="rounded-lg"
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
                prefix={<LockOutlined style={{ color: P.ink40 }} />}
                placeholder="••••••••"
                autoComplete="new-password"
                size="large"
                className="rounded-lg"
              />
            </Form.Item>
            <Form.Item
              shouldUpdate={(prev, curr) => prev.password !== curr.password}
              className="mb-4 -mt-3"
            >
              {({ getFieldValue }) => {
                const pw = getFieldValue('password') || '';
                if (!pw) return null;
                
                let score = 0;
                if (pw.length >= 8) score++;
                if (/[a-z]/.test(pw)) score++;
                if (/[A-Z]/.test(pw)) score++;
                if (/\d/.test(pw)) score++;
                if (/[@$!%*?&]/.test(pw)) score++;
                
                let pct = 0, label = '', color = '#d9d9d9';
                if (score <= 2) { pct = 30; label = 'Weak'; color = '#ff4d4f'; }
                else if (score <= 3) { pct = 55; label = 'Fair'; color = '#faad14'; }
                else if (score <= 4) { pct = 80; label = 'Good'; color = '#1890ff'; }
                else { pct = 100; label = 'Strong'; color = '#52c41a'; }

                return (
                  <div className="flex items-center gap-2">
                    <div className="flex-1">
                      <Progress
                        percent={pct}
                        showInfo={false}
                        strokeColor={color}
                        trailColor="rgba(0,0,0,0.06)"
                        size="small"
                      />
                    </div>
                    <span className="text-xs font-medium" style={{ color }}>
                      {label}
                    </span>
                  </div>
                );
              }}
            </Form.Item>

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
                prefix={<LockOutlined style={{ color: P.ink40 }} />}
                placeholder="••••••••"
                autoComplete="new-password"
                size="large"
                className="rounded-lg"
              />
            </Form.Item>
          </div>

          {/* ─── STEP 2: Rider Profile ─── */}
          <div style={{ display: step === 1 ? 'block' : 'none' }}>
            <Form.Item label={lbl('Phone Number')} required>
              <Space.Compact className="flex !rounded-lg overflow-hidden w-full">
                <Form.Item
                  name="country_code"
                  noStyle
                  rules={[{ required: true, message: 'Required' }]}
                >
                  <Select
                    style={{ width: 140 }}
                    showSearch
                    size="large"
                    filterOption={(input, option) =>
                      option.label.toLowerCase().includes(input.toLowerCase())
                    }
                    className="[&_.ant-select-selector]:!rounded-none [&_.ant-select-selector]:!border-r-0"
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
                    prefix={<PhoneOutlined style={{ color: P.ink40 }} />}
                    placeholder="5xx xxx xxxx"
                    autoComplete="tel-national"
                    size="large"
                    style={{ width: 'calc(100% - 140px)' }}
                    className="!rounded-none"
                  />
                </Form.Item>
              </Space.Compact>
            </Form.Item>

            <div className="grid grid-cols-2 gap-3">
              <Form.Item
                name="date_of_birth"
                label={lbl('Date of Birth')}
                rules={[
                  { required: true, message: 'Required' },
                  () => ({
                    validator(_, value) {
                      if (!value) return Promise.resolve();
                      const today = new Date();
                      const dob = value.toDate ? value.toDate() : new Date(value);
                      let calcAge = today.getFullYear() - dob.getFullYear();
                      const m = today.getMonth() - dob.getMonth();
                      if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) calcAge--;
                      if (calcAge < 10) return Promise.reject('Must be at least 10 years old');
                      if (calcAge > 100) return Promise.reject('Please enter a valid date');
                      return Promise.resolve();
                    }
                  })
                ]}
                extra={<span style={{ color: '#9ca3af', fontSize: 12 }}>For safety guidelines</span>}
              >
                <DatePicker
                  placeholder="DD/MM/YYYY"
                  className="w-full !rounded-lg"
                  size="large"
                  format={['DD/MM/YYYY', 'DD.MM.YYYY', 'D/M/YYYY', 'D.M.YYYY', 'DDMMYYYY']}
                  disabledDate={(current) => current && current.valueOf() > Date.now()}
                />
              </Form.Item>
              <Form.Item
                name="weight"
                label={lbl('Weight (kg)')}
                rules={[
                  { required: true, message: 'Required' },
                  { type: 'number', min: 30, max: 200, message: '30–200 kg' },
                ]}
                extra={<span style={{ color: '#9ca3af', fontSize: 12 }}>For correct kite & board sizing</span>}
              >
                <InputNumber placeholder="e.g. 70" className="w-full !rounded-lg" min={30} max={200} size="large" />
              </Form.Item>
            </div>

            <Form.Item
              name="preferred_currency"
              label={lbl('Preferred Currency')}
              rules={[{ required: true, message: 'Required' }]}
              extra={<span style={{ color: '#9ca3af', fontSize: 12 }}>All prices and payments will be processed in this currency</span>}
            >
              <Select
                placeholder="Select currency"
                suffixIcon={<DollarOutlined style={{ color: P.ink40 }} />}
                showSearch
                size="large"
                className="[&_.ant-select-selector]:!rounded-lg"
                filterOption={(input, option) =>
                  option.label.toLowerCase().includes(input.toLowerCase())
                }
              >
                {currencyOptions.map((c) => (
                  <Option key={c.value} value={c.value} label={c.label}>
                    <span className="flex items-center gap-2">
                      <span>{c.symbol}</span>
                      <span>{c.name}</span>
                      <span style={{ color: P.ink40, fontFamily: MONO, fontSize: '0.72em' }}>({c.value})</span>
                    </span>
                  </Option>
                ))}
              </Select>
            </Form.Item>
          </div>

          {/* ─── STEP 3: Address ─── */}
          <div style={{ display: step === 2 ? 'block' : 'none' }}>
            <div
              style={{
                marginBottom: '1rem',
                padding: '0.85rem 1rem',
                borderRadius: 10,
                background: 'rgba(85, 120, 114, 0.06)',
                border: `1px solid ${P.seafoamSoft}`,
              }}
            >
              <p style={{
                margin: 0,
                fontFamily: SANS, fontSize: '0.78rem',
                lineHeight: 1.5,
                color: P.ink80,
              }}>
                <span style={{
                  fontFamily: MONO, fontSize: '0.58rem',
                  letterSpacing: '0.14em', textTransform: 'uppercase',
                  color: P.seafoam,
                  display: 'block', marginBottom: '0.3em',
                }}>Shipping</span>
                This address will be used as the default delivery for shop orders. You can always change it at checkout.
              </p>
            </div>

            <Form.Item
              name="address"
              label={lbl('Street Address')}
              rules={[{ required: true, message: 'Required' }]}
            >
              <Input
                prefix={<EnvironmentOutlined style={{ color: P.ink40 }} />}
                placeholder="123 Beach Road, Apt 4"
                autoComplete="street-address"
                size="large"
                className="rounded-lg"
              />
            </Form.Item>

            <div className="grid grid-cols-2 gap-3">
              <Form.Item
                name="city"
                label={lbl('City')}
                rules={[{ required: true, message: 'Required' }]}
              >
                <Input placeholder="e.g. Istanbul" autoComplete="address-level2" size="large" className="rounded-lg" />
              </Form.Item>
              <Form.Item
                name="zip_code"
                label={lbl('Postal / ZIP Code')}
                rules={[{ required: true, message: 'Required' }]}
              >
                <Input placeholder="e.g. 34000" autoComplete="postal-code" size="large" className="rounded-lg" />
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
                className="[&_.ant-select-selector]:!rounded-lg"
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
        <div
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            marginTop: '1.5rem', paddingTop: '1.25rem',
            borderTop: `1px solid ${P.line}`,
          }}
        >
          {step > 0 ? (
            <button
              type="button"
              onClick={goBack}
              disabled={loading}
              className="plannivo-quiet-btn"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: '0.5em',
                background: 'transparent', border: 'none',
                padding: '0.4em 0.2em',
                fontFamily: MONO, fontSize: '0.66rem',
                letterSpacing: '0.14em', textTransform: 'uppercase',
                color: P.ink60, cursor: loading ? 'not-allowed' : 'pointer',
                opacity: loading ? 0.5 : 1,
                transition: 'color 0.2s ease',
              }}
              onMouseEnter={(e) => { if (!loading) e.currentTarget.style.color = P.ink; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = P.ink60; }}
            >
              ← Back
            </button>
          ) : (
            <button
              type="button"
              onClick={handleClose}
              disabled={loading}
              style={{
                background: 'transparent',
                border: `1px solid ${P.line}`,
                padding: '0.7em 1.2em',
                borderRadius: 999,
                fontFamily: SANS, fontSize: '0.85rem',
                fontWeight: 500,
                color: P.ink80,
                cursor: loading ? 'not-allowed' : 'pointer',
                opacity: loading ? 0.5 : 1,
                transition: 'border-color 0.2s ease, color 0.2s ease',
              }}
              onMouseEnter={(e) => {
                if (!loading) {
                  e.currentTarget.style.borderColor = P.seafoam;
                  e.currentTarget.style.color = P.seafoam;
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = P.line;
                e.currentTarget.style.color = P.ink80;
              }}
            >
              Cancel
            </button>
          )}

          {step < STEPS.length - 1 ? (
            <button
              type="button"
              onClick={goNext}
              className="plannivo-primary-btn"
            >
              Continue
              <svg className="arrow" width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSubmit}
              disabled={loading}
              className="plannivo-primary-btn"
            >
              {loading ? 'Creating…' : 'Finish'}
              {!loading && (
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <path d="M3 8l3 3 7-7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );

  // Scoped <style> overrides for Ant Design controls inside this modal.
  const scopedStyles = (
    <style>{`
      .plannivo-register-modal .ant-input,
      .plannivo-register-modal .ant-input-affix-wrapper,
      .plannivo-register-modal .ant-input-password,
      .plannivo-register-modal .ant-input-number,
      .plannivo-register-modal .ant-input-number-input-wrap,
      .plannivo-register-modal .ant-picker,
      .plannivo-register-modal .ant-select:not(.ant-select-customize-input) .ant-select-selector {
        background: ${P.paperSoft} !important;
        border-color: ${P.line} !important;
        border-radius: 10px !important;
        font-family: ${SANS} !important;
        color: ${P.ink} !important;
        box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.35) !important;
        transition: border-color 0.2s ease, box-shadow 0.2s ease !important;
      }
      .plannivo-register-modal .ant-input,
      .plannivo-register-modal .ant-input-affix-wrapper,
      .plannivo-register-modal .ant-input-password,
      .plannivo-register-modal .ant-picker,
      .plannivo-register-modal .ant-select:not(.ant-select-customize-input) .ant-select-selector {
        height: 44px !important;
      }
      .plannivo-register-modal .ant-input-number { height: 44px !important; display: flex !important; align-items: center !important; }
      .plannivo-register-modal .ant-input-number-input { height: 42px !important; line-height: 42px !important; color: ${P.ink} !important; }
      .plannivo-register-modal .ant-input-affix-wrapper > input.ant-input {
        background: transparent !important;
        color: ${P.ink} !important;
        height: auto !important;
        box-shadow: none !important;
      }
      .plannivo-register-modal .ant-input::placeholder,
      .plannivo-register-modal .ant-input-affix-wrapper > input.ant-input::placeholder,
      .plannivo-register-modal .ant-select-selection-placeholder,
      .plannivo-register-modal .ant-picker-input > input::placeholder {
        color: ${P.ink40} !important;
      }
      .plannivo-register-modal .anticon {
        color: ${P.ink40} !important;
      }
      .plannivo-register-modal .ant-input-affix-wrapper:hover,
      .plannivo-register-modal .ant-input:hover,
      .plannivo-register-modal .ant-picker:hover,
      .plannivo-register-modal .ant-input-number:hover,
      .plannivo-register-modal .ant-select:not(.ant-select-disabled):not(.ant-select-customize-input):hover .ant-select-selector {
        border-color: ${P.seafoamSoft} !important;
      }
      .plannivo-register-modal .ant-input-affix-wrapper:focus-within,
      .plannivo-register-modal .ant-input:focus,
      .plannivo-register-modal .ant-picker-focused,
      .plannivo-register-modal .ant-input-number-focused,
      .plannivo-register-modal .ant-select-focused:not(.ant-select-customize-input) .ant-select-selector {
        border-color: ${P.seafoam} !important;
        box-shadow: 0 0 0 3px rgba(85, 120, 114, 0.15), inset 0 1px 0 rgba(255, 255, 255, 0.35) !important;
      }
      .plannivo-register-modal .ant-select-selection-item {
        color: ${P.ink} !important;
        font-family: ${SANS} !important;
      }
      .plannivo-register-modal .ant-picker-input > input {
        color: ${P.ink} !important;
        font-family: ${SANS} !important;
      }
      .plannivo-register-modal .ant-form-item-explain-error {
        font-family: ${MONO} !important;
        font-size: 0.66rem !important;
        letter-spacing: 0.06em !important;
        color: #8B4A3A !important;
        margin-top: 0.4em !important;
      }
      .plannivo-register-modal .plannivo-primary-btn {
        display: inline-flex; align-items: center; gap: 0.55em;
        padding: 0.7em 1.4em;
        background: ${P.ink};
        color: ${P.bone};
        border: none;
        border-radius: 999px;
        font-family: ${SANS}; font-size: 0.9rem; font-weight: 500;
        letter-spacing: 0.005em;
        cursor: pointer;
        box-shadow: 0 1px 0 rgba(255, 255, 255, 0.08) inset, 0 10px 24px -12px rgba(20, 30, 40, 0.4);
        transition: all 0.25s ease;
      }
      .plannivo-register-modal .plannivo-primary-btn:hover:not(:disabled) {
        background: ${P.seafoam};
        transform: translateY(-1px);
        box-shadow: 0 1px 0 rgba(255, 255, 255, 0.12) inset, 0 12px 28px -10px rgba(85, 120, 114, 0.6);
      }
      .plannivo-register-modal .plannivo-primary-btn:disabled { opacity: 0.6; cursor: not-allowed; }
      .plannivo-register-modal .plannivo-primary-btn .arrow { transition: transform 0.25s ease; }
      .plannivo-register-modal .plannivo-primary-btn:hover:not(:disabled) .arrow { transform: translateX(3px); }
    `}</style>
  );

  if (inline) {
    return (
      <>
        {scopedStyles}
        {content}
      </>
    );
  }

  return (
    <>
      {scopedStyles}
      <Modal
        open={visible}
        onCancel={handleClose}
        footer={null}
        width={480}
        maskClosable={!loading}
        closable={true}
        destroyOnHidden
        className="plannivo-register-modal"
        closeIcon={
          <span
            style={{
              color: P.ink40, fontSize: 22, lineHeight: 1,
              fontFamily: SANS, fontWeight: 300,
              transition: 'color 0.2s ease',
              padding: 6,
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = P.ink; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = P.ink40; }}
          >
            ×
          </span>
        }
        styles={{
          content: {
            padding: 0,
            overflow: 'hidden',
            borderRadius: 14,
            backgroundColor: P.bone,
            border: `1px solid ${P.line}`,
            boxShadow: FRAME_SHADOW,
          },
          body: { padding: 0 },
          mask: {
            backgroundColor: 'rgba(20, 30, 40, 0.45)',
            backdropFilter: 'blur(2px)',
          },
        }}
      >
        {content}
      </Modal>
    </>
  );
};

export default RegisterModal;
