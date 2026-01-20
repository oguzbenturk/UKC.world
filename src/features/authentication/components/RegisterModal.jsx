// src/features/authentication/components/RegisterModal.jsx
import { useState, useEffect } from 'react';
import { Modal, Form, Input, Button, Select, InputNumber } from 'antd';
import { message } from '@/shared/utils/antdStatic';
import { UserOutlined, MailOutlined, PhoneOutlined, LockOutlined, DollarOutlined } from '@ant-design/icons';
import apiClient from '@/shared/services/apiClient';
import { useCurrency } from '@/shared/contexts/CurrencyContext';

const { Option } = Select;

const RegisterModal = ({ visible, onClose, onSuccess }) => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [allowedCurrencies, setAllowedCurrencies] = useState([]);
  const { getSupportedCurrencies, businessCurrency } = useCurrency();
  const supportedCurrencies = getSupportedCurrencies();
  const fallbackCurrencies = [
    { label: 'Euro (€)', value: 'EUR', symbol: '€', name: 'Euro' },
    { label: 'US Dollar ($)', value: 'USD', symbol: '$', name: 'US Dollar' },
    { label: 'Turkish Lira (₺)', value: 'TRY', symbol: '₺', name: 'Turkish Lira' },
  ];
  
  // Filter currencies based on admin-allowed list
  const currencyOptions = allowedCurrencies.length > 0
    ? (supportedCurrencies?.length ? supportedCurrencies : fallbackCurrencies).filter(c => 
        allowedCurrencies.includes(c.value)
      )
    : (supportedCurrencies?.length ? supportedCurrencies : fallbackCurrencies);
  
  // Country codes for phone numbers - comprehensive list
  const countryCodes = [
    // Europe
    { code: '+355', country: 'AL', label: '🇦🇱 Albania (+355)' },
    { code: '+376', country: 'AD', label: '🇦🇩 Andorra (+376)' },
    { code: '+43', country: 'AT', label: '🇦🇹 Austria (+43)' },
    { code: '+375', country: 'BY', label: '🇧🇾 Belarus (+375)' },
    { code: '+32', country: 'BE', label: '🇧🇪 Belgium (+32)' },
    { code: '+387', country: 'BA', label: '🇧🇦 Bosnia (+387)' },
    { code: '+359', country: 'BG', label: '🇧🇬 Bulgaria (+359)' },
    { code: '+385', country: 'HR', label: '🇭🇷 Croatia (+385)' },
    { code: '+357', country: 'CY', label: '🇨🇾 Cyprus (+357)' },
    { code: '+420', country: 'CZ', label: '🇨🇿 Czech Republic (+420)' },
    { code: '+45', country: 'DK', label: '🇩🇰 Denmark (+45)' },
    { code: '+372', country: 'EE', label: '🇪🇪 Estonia (+372)' },
    { code: '+358', country: 'FI', label: '🇫🇮 Finland (+358)' },
    { code: '+33', country: 'FR', label: '🇫🇷 France (+33)' },
    { code: '+49', country: 'DE', label: '🇩🇪 Germany (+49)' },
    { code: '+30', country: 'GR', label: '🇬🇷 Greece (+30)' },
    { code: '+36', country: 'HU', label: '🇭🇺 Hungary (+36)' },
    { code: '+354', country: 'IS', label: '🇮🇸 Iceland (+354)' },
    { code: '+353', country: 'IE', label: '🇮🇪 Ireland (+353)' },
    { code: '+39', country: 'IT', label: '🇮🇹 Italy (+39)' },
    { code: '+371', country: 'LV', label: '🇱🇻 Latvia (+371)' },
    { code: '+423', country: 'LI', label: '🇱🇮 Liechtenstein (+423)' },
    { code: '+370', country: 'LT', label: '🇱🇹 Lithuania (+370)' },
    { code: '+352', country: 'LU', label: '🇱🇺 Luxembourg (+352)' },
    { code: '+389', country: 'MK', label: '🇲🇰 North Macedonia (+389)' },
    { code: '+356', country: 'MT', label: '🇲🇹 Malta (+356)' },
    { code: '+373', country: 'MD', label: '🇲🇩 Moldova (+373)' },
    { code: '+377', country: 'MC', label: '🇲🇨 Monaco (+377)' },
    { code: '+382', country: 'ME', label: '🇲🇪 Montenegro (+382)' },
    { code: '+31', country: 'NL', label: '🇳🇱 Netherlands (+31)' },
    { code: '+47', country: 'NO', label: '🇳🇴 Norway (+47)' },
    { code: '+48', country: 'PL', label: '🇵🇱 Poland (+48)' },
    { code: '+351', country: 'PT', label: '🇵🇹 Portugal (+351)' },
    { code: '+40', country: 'RO', label: '🇷🇴 Romania (+40)' },
    { code: '+7', country: 'RU', label: '🇷🇺 Russia (+7)' },
    { code: '+378', country: 'SM', label: '🇸🇲 San Marino (+378)' },
    { code: '+381', country: 'RS', label: '🇷🇸 Serbia (+381)' },
    { code: '+421', country: 'SK', label: '🇸🇰 Slovakia (+421)' },
    { code: '+386', country: 'SI', label: '🇸🇮 Slovenia (+386)' },
    { code: '+34', country: 'ES', label: '🇪🇸 Spain (+34)' },
    { code: '+46', country: 'SE', label: '🇸🇪 Sweden (+46)' },
    { code: '+41', country: 'CH', label: '🇨🇭 Switzerland (+41)' },
    { code: '+90', country: 'TR', label: '🇹🇷 Turkey (+90)' },
    { code: '+380', country: 'UA', label: '🇺🇦 Ukraine (+380)' },
    { code: '+44', country: 'GB', label: '🇬🇧 United Kingdom (+44)' },
    // North America
    { code: '+1', country: 'US', label: '🇺🇸 USA (+1)' },
    { code: '+1', country: 'CA', label: '🇨🇦 Canada (+1)' },
    { code: '+52', country: 'MX', label: '🇲🇽 Mexico (+52)' },
    // South America
    { code: '+54', country: 'AR', label: '🇦🇷 Argentina (+54)' },
    { code: '+55', country: 'BR', label: '🇧🇷 Brazil (+55)' },
    { code: '+56', country: 'CL', label: '🇨🇱 Chile (+56)' },
    { code: '+57', country: 'CO', label: '🇨🇴 Colombia (+57)' },
    { code: '+51', country: 'PE', label: '🇵🇪 Peru (+51)' },
    { code: '+598', country: 'UY', label: '🇺🇾 Uruguay (+598)' },
    { code: '+58', country: 'VE', label: '🇻🇪 Venezuela (+58)' },
    // Middle East
    { code: '+971', country: 'AE', label: '🇦🇪 UAE (+971)' },
    { code: '+966', country: 'SA', label: '🇸🇦 Saudi Arabia (+966)' },
    { code: '+972', country: 'IL', label: '🇮🇱 Israel (+972)' },
    { code: '+962', country: 'JO', label: '🇯🇴 Jordan (+962)' },
    { code: '+961', country: 'LB', label: '🇱🇧 Lebanon (+961)' },
    { code: '+965', country: 'KW', label: '🇰🇼 Kuwait (+965)' },
    { code: '+974', country: 'QA', label: '🇶🇦 Qatar (+974)' },
    { code: '+973', country: 'BH', label: '🇧🇭 Bahrain (+973)' },
    { code: '+968', country: 'OM', label: '🇴🇲 Oman (+968)' },
    { code: '+98', country: 'IR', label: '🇮🇷 Iran (+98)' },
    { code: '+964', country: 'IQ', label: '🇮🇶 Iraq (+964)' },
    // Asia
    { code: '+86', country: 'CN', label: '🇨🇳 China (+86)' },
    { code: '+91', country: 'IN', label: '🇮🇳 India (+91)' },
    { code: '+81', country: 'JP', label: '🇯🇵 Japan (+81)' },
    { code: '+82', country: 'KR', label: '🇰🇷 South Korea (+82)' },
    { code: '+65', country: 'SG', label: '🇸🇬 Singapore (+65)' },
    { code: '+852', country: 'HK', label: '🇭🇰 Hong Kong (+852)' },
    { code: '+886', country: 'TW', label: '🇹🇼 Taiwan (+886)' },
    { code: '+66', country: 'TH', label: '🇹🇭 Thailand (+66)' },
    { code: '+84', country: 'VN', label: '🇻🇳 Vietnam (+84)' },
    { code: '+60', country: 'MY', label: '🇲🇾 Malaysia (+60)' },
    { code: '+62', country: 'ID', label: '🇮🇩 Indonesia (+62)' },
    { code: '+63', country: 'PH', label: '🇵🇭 Philippines (+63)' },
    { code: '+92', country: 'PK', label: '🇵🇰 Pakistan (+92)' },
    { code: '+880', country: 'BD', label: '🇧🇩 Bangladesh (+880)' },
    { code: '+94', country: 'LK', label: '🇱🇰 Sri Lanka (+94)' },
    { code: '+977', country: 'NP', label: '🇳🇵 Nepal (+977)' },
    // Oceania
    { code: '+61', country: 'AU', label: '🇦🇺 Australia (+61)' },
    { code: '+64', country: 'NZ', label: '🇳🇿 New Zealand (+64)' },
    // Africa
    { code: '+20', country: 'EG', label: '🇪🇬 Egypt (+20)' },
    { code: '+27', country: 'ZA', label: '🇿🇦 South Africa (+27)' },
    { code: '+212', country: 'MA', label: '🇲🇦 Morocco (+212)' },
    { code: '+213', country: 'DZ', label: '🇩🇿 Algeria (+213)' },
    { code: '+216', country: 'TN', label: '🇹🇳 Tunisia (+216)' },
    { code: '+234', country: 'NG', label: '🇳🇬 Nigeria (+234)' },
    { code: '+254', country: 'KE', label: '🇰🇪 Kenya (+254)' },
    { code: '+233', country: 'GH', label: '🇬🇭 Ghana (+233)' },
  ];

  // Fetch allowed registration currencies
  useEffect(() => {
    const fetchAllowedCurrencies = async () => {
      try {
        const response = await apiClient.get('/settings/registration-currencies');
        setAllowedCurrencies(response.data.currencies || ['EUR', 'USD', 'TRY']);
      } catch (error) {
        // Fallback to default currencies
        setAllowedCurrencies(['EUR', 'USD', 'TRY']);
      }
    };
    fetchAllowedCurrencies();
  }, []);

  // Set default country code and currency when modal opens
  useEffect(() => {
    if (visible && allowedCurrencies.length > 0) {
      const defaultCurrency = allowedCurrencies.includes(businessCurrency) 
        ? businessCurrency 
        : allowedCurrencies[0];
      
      form.setFieldsValue({ 
        country_code: '+90',
        preferred_currency: defaultCurrency
      });
    }
  }, [visible, form, businessCurrency, allowedCurrencies]);

  const handleClose = () => {
    form.resetFields();
    onClose();
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      setLoading(true);

      // Combine country code and phone number
      const fullPhone = `${values.country_code}${values.phone}`;

      const response = await apiClient.post('/auth/register', {
        first_name: values.first_name,
        last_name: values.last_name,
        email: values.email.toLowerCase(),
        phone: fullPhone,
        password: values.password,
        age: values.age,
        weight: values.weight,
        preferred_currency: values.preferred_currency,
      });

      message.success('Account created successfully! Please login.');
      form.resetFields();
      onSuccess?.();
      onClose();
    } catch (error) {
      const errorMessage = error.response?.data?.error || error.message || 'Registration failed';
      message.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      open={visible}
      onCancel={handleClose}
      footer={null}
      width={600}
      className="register-modal"
      maskClosable={!loading}
      closable={!loading}
    >
      <div className="py-2">
        <h2 className="text-2xl font-bold text-white mb-2 text-center">Create Account</h2>
        <p className="text-slate-400 text-center text-sm mb-6">
          Enter your information to register
        </p>

        <Form
          form={form}
          layout="vertical"
          onFinish={handleSubmit}
          className="space-y-4"
        >
          <div className="grid grid-cols-2 gap-4">
            <Form.Item
              name="first_name"
              label={<span className="text-slate-300">First Name</span>}
              rules={[{ required: true, message: 'First name is required' }]}
            >
              <Input
                prefix={<UserOutlined className="text-slate-500" />}
                placeholder="John"
                className="bg-slate-700/50 border-slate-600 text-white"
              />
            </Form.Item>
            <Form.Item
              name="last_name"
              label={<span className="text-slate-300">Last Name</span>}
              rules={[{ required: true, message: 'Last name is required' }]}
            >
              <Input
                prefix={<UserOutlined className="text-slate-500" />}
                placeholder="Doe"
                className="bg-slate-700/50 border-slate-600 text-white"
              />
            </Form.Item>
          </div>

          <Form.Item
            name="email"
            label={<span className="text-slate-300">Email Address</span>}
            rules={[
              { required: true, message: 'Email is required' },
              { type: 'email', message: 'Please enter a valid email' }
            ]}
          >
            <Input
              prefix={<MailOutlined className="text-slate-500" />}
              placeholder="your@email.com"
              className="bg-slate-700/50 border-slate-600 text-white"
            />
          </Form.Item>

          <Form.Item
            label={<span className="text-slate-300">Phone Number</span>}
            required
          >
            <Input.Group compact>
              <Form.Item
                name="country_code"
                noStyle
                rules={[{ required: true, message: 'Country code required' }]}
              >
                <Select
                  className="country-code-select"
                  style={{ width: '140px' }}
                  showSearch
                  filterOption={(input, option) =>
                    option.label.toLowerCase().includes(input.toLowerCase())
                  }
                >
                  {countryCodes.map((item) => (
                    <Option key={item.code} value={item.code} label={item.label}>
                      {item.label}
                    </Option>
                  ))}
                </Select>
              </Form.Item>
              <Form.Item
                name="phone"
                noStyle
                rules={[
                  { required: true, message: 'Phone number is required' },
                  { pattern: /^[0-9]{6,15}$/, message: 'Please enter a valid phone number' }
                ]}
              >
                <Input
                  prefix={<PhoneOutlined className="text-slate-500" />}
                  placeholder="5xx xxx xxxx"
                  className="bg-slate-700/50 border-slate-600 text-white"
                  style={{ width: 'calc(100% - 140px)' }}
                />
              </Form.Item>
            </Input.Group>
          </Form.Item>

          <div className="grid grid-cols-2 gap-4">
            <Form.Item
              name="age"
              label={<span className="text-slate-300">Age</span>}
              rules={[
                { required: true, message: 'Age is required' },
                { type: 'number', min: 10, max: 100, message: 'Age must be between 10 and 100' }
              ]}
            >
              <InputNumber
                placeholder="e.g. 25"
                className="w-full bg-slate-700/50 border-slate-600 text-white"
                min={10}
                max={100}
              />
            </Form.Item>
            <Form.Item
              name="weight"
              label={<span className="text-slate-300">Weight (kg)</span>}
              rules={[
                { required: true, message: 'Weight is required' },
                { type: 'number', min: 30, max: 200, message: 'Weight must be between 30 and 200 kg' }
              ]}
            >
              <InputNumber
                placeholder="e.g. 70"
                className="w-full bg-slate-700/50 border-slate-600 text-white"
                min={30}
                max={200}
              />
            </Form.Item>
          </div>

          <Form.Item
            name="preferred_currency"
            label={<span className="text-slate-300">Preferred Currency</span>}
            rules={[{ required: true, message: 'Please select your preferred currency' }]}
            extra={<span className="text-slate-500 text-xs">This will be used for displaying prices</span>}
          >
            <Select
              placeholder="Select currency"
              className="currency-select"
              suffixIcon={<DollarOutlined className="text-slate-500" />}
              showSearch
              filterOption={(input, option) =>
                option.label.toLowerCase().includes(input.toLowerCase())
              }
            >
              {currencyOptions.map((currency) => (
                <Option key={currency.value} value={currency.value} label={currency.label}>
                  <div className="flex items-center gap-2">
                    <span>{currency.symbol}</span>
                    <span>{currency.name}</span>
                    <span className="text-slate-500">({currency.value})</span>
                  </div>
                </Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item
            name="password"
            label={<span className="text-slate-300">Password</span>}
            rules={[
              { required: true, message: 'Password is required' },
              { min: 8, message: 'Password must be at least 8 characters' }
            ]}
          >
            <Input.Password
              prefix={<LockOutlined className="text-slate-500" />}
              placeholder="••••••••"
              className="bg-slate-700/50 border-slate-600 text-white"
            />
          </Form.Item>

          <Form.Item
            name="confirm_password"
            label={<span className="text-slate-300">Confirm Password</span>}
            dependencies={['password']}
            rules={[
              { required: true, message: 'Please confirm your password' },
              ({ getFieldValue }) => ({
                validator(_, value) {
                  if (!value || getFieldValue('password') === value) {
                    return Promise.resolve();
                  }
                  return Promise.reject(new Error('Passwords do not match'));
                },
              }),
            ]}
          >
            <Input.Password
              prefix={<LockOutlined className="text-slate-500" />}
              placeholder="••••••••"
              className="bg-slate-700/50 border-slate-600 text-white"
            />
          </Form.Item>

          <div className="flex gap-3 justify-end pt-4">
            <Button
              onClick={handleClose}
              disabled={loading}
              className="px-6"
            >
              Cancel
            </Button>
            <Button
              type="primary"
              htmlType="submit"
              loading={loading}
              className="px-6 bg-sky-500 hover:bg-sky-600"
            >
              Create Account
            </Button>
          </div>
        </Form>
      </div>
    </Modal>
  );
};

export default RegisterModal;
