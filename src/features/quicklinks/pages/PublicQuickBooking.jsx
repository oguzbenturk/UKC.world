import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Card,
  Form,
  Input,
  Button,
  Typography,
  Result,
  Spin,
  Steps,
  Radio,
  Space,
  Checkbox,
  Divider,
  Select
} from 'antd';
import { message } from '@/shared/utils/antdStatic';
import {
  UserOutlined,
  MailOutlined,
  PhoneOutlined,
  CheckCircleOutlined,
  HomeOutlined,
  BookOutlined,
  ShoppingCartOutlined,
  CarOutlined,
  ArrowRightOutlined,
  ArrowLeftOutlined,
  WhatsAppOutlined,
  MessageOutlined,
  SmileOutlined
} from '@ant-design/icons';
import { getPublicQuickLink, registerViaQuickLink } from '../services/quickLinksService';

const { Title, Text, Paragraph } = Typography;

// Country codes for phone number selection - sorted alphabetically by country name
const COUNTRY_CODES = [
  { code: '+93', country: 'AF', label: '🇦🇫 Afghanistan (+93)' },
  { code: '+355', country: 'AL', label: '🇦🇱 Albania (+355)' },
  { code: '+213', country: 'DZ', label: '🇩🇿 Algeria (+213)' },
  { code: '+376', country: 'AD', label: '🇦🇩 Andorra (+376)' },
  { code: '+54', country: 'AR', label: '🇦🇷 Argentina (+54)' },
  { code: '+374', country: 'AM', label: '🇦🇲 Armenia (+374)' },
  { code: '+61', country: 'AU', label: '🇦🇺 Australia (+61)' },
  { code: '+43', country: 'AT', label: '🇦🇹 Austria (+43)' },
  { code: '+994', country: 'AZ', label: '🇦🇿 Azerbaijan (+994)' },
  { code: '+973', country: 'BH', label: '🇧🇭 Bahrain (+973)' },
  { code: '+880', country: 'BD', label: '🇧🇩 Bangladesh (+880)' },
  { code: '+375', country: 'BY', label: '🇧🇾 Belarus (+375)' },
  { code: '+32', country: 'BE', label: '🇧🇪 Belgium (+32)' },
  { code: '+55', country: 'BR', label: '🇧🇷 Brazil (+55)' },
  { code: '+359', country: 'BG', label: '🇧🇬 Bulgaria (+359)' },
  { code: '+1', country: 'CA', label: '🇨🇦 Canada (+1)' },
  { code: '+56', country: 'CL', label: '🇨🇱 Chile (+56)' },
  { code: '+86', country: 'CN', label: '🇨🇳 China (+86)' },
  { code: '+57', country: 'CO', label: '🇨🇴 Colombia (+57)' },
  { code: '+385', country: 'HR', label: '🇭🇷 Croatia (+385)' },
  { code: '+357', country: 'CY', label: '🇨🇾 Cyprus (+357)' },
  { code: '+420', country: 'CZ', label: '🇨🇿 Czech Republic (+420)' },
  { code: '+45', country: 'DK', label: '🇩🇰 Denmark (+45)' },
  { code: '+20', country: 'EG', label: '🇪🇬 Egypt (+20)' },
  { code: '+372', country: 'EE', label: '🇪🇪 Estonia (+372)' },
  { code: '+358', country: 'FI', label: '🇫🇮 Finland (+358)' },
  { code: '+33', country: 'FR', label: '🇫🇷 France (+33)' },
  { code: '+995', country: 'GE', label: '🇬🇪 Georgia (+995)' },
  { code: '+49', country: 'DE', label: '🇩🇪 Germany (+49)' },
  { code: '+30', country: 'GR', label: '🇬🇷 Greece (+30)' },
  { code: '+852', country: 'HK', label: '🇭🇰 Hong Kong (+852)' },
  { code: '+36', country: 'HU', label: '🇭🇺 Hungary (+36)' },
  { code: '+354', country: 'IS', label: '🇮🇸 Iceland (+354)' },
  { code: '+91', country: 'IN', label: '🇮🇳 India (+91)' },
  { code: '+62', country: 'ID', label: '🇮🇩 Indonesia (+62)' },
  { code: '+98', country: 'IR', label: '🇮🇷 Iran (+98)' },
  { code: '+964', country: 'IQ', label: '🇮🇶 Iraq (+964)' },
  { code: '+353', country: 'IE', label: '🇮🇪 Ireland (+353)' },
  { code: '+972', country: 'IL', label: '🇮🇱 Israel (+972)' },
  { code: '+39', country: 'IT', label: '🇮🇹 Italy (+39)' },
  { code: '+81', country: 'JP', label: '🇯🇵 Japan (+81)' },
  { code: '+962', country: 'JO', label: '🇯🇴 Jordan (+962)' },
  { code: '+7', country: 'KZ', label: '🇰🇿 Kazakhstan (+7)' },
  { code: '+254', country: 'KE', label: '🇰🇪 Kenya (+254)' },
  { code: '+965', country: 'KW', label: '🇰🇼 Kuwait (+965)' },
  { code: '+371', country: 'LV', label: '🇱🇻 Latvia (+371)' },
  { code: '+961', country: 'LB', label: '🇱🇧 Lebanon (+961)' },
  { code: '+370', country: 'LT', label: '🇱🇹 Lithuania (+370)' },
  { code: '+352', country: 'LU', label: '🇱🇺 Luxembourg (+352)' },
  { code: '+60', country: 'MY', label: '🇲🇾 Malaysia (+60)' },
  { code: '+356', country: 'MT', label: '🇲🇹 Malta (+356)' },
  { code: '+52', country: 'MX', label: '🇲🇽 Mexico (+52)' },
  { code: '+377', country: 'MC', label: '🇲🇨 Monaco (+377)' },
  { code: '+212', country: 'MA', label: '🇲🇦 Morocco (+212)' },
  { code: '+31', country: 'NL', label: '🇳🇱 Netherlands (+31)' },
  { code: '+64', country: 'NZ', label: '🇳🇿 New Zealand (+64)' },
  { code: '+234', country: 'NG', label: '🇳🇬 Nigeria (+234)' },
  { code: '+47', country: 'NO', label: '🇳🇴 Norway (+47)' },
  { code: '+968', country: 'OM', label: '🇴🇲 Oman (+968)' },
  { code: '+92', country: 'PK', label: '🇵🇰 Pakistan (+92)' },
  { code: '+507', country: 'PA', label: '🇵🇦 Panama (+507)' },
  { code: '+51', country: 'PE', label: '🇵🇪 Peru (+51)' },
  { code: '+63', country: 'PH', label: '🇵🇭 Philippines (+63)' },
  { code: '+48', country: 'PL', label: '🇵🇱 Poland (+48)' },
  { code: '+351', country: 'PT', label: '🇵🇹 Portugal (+351)' },
  { code: '+974', country: 'QA', label: '🇶🇦 Qatar (+974)' },
  { code: '+40', country: 'RO', label: '🇷🇴 Romania (+40)' },
  { code: '+7', country: 'RU', label: '🇷🇺 Russia (+7)' },
  { code: '+966', country: 'SA', label: '🇸🇦 Saudi Arabia (+966)' },
  { code: '+381', country: 'RS', label: '🇷🇸 Serbia (+381)' },
  { code: '+65', country: 'SG', label: '🇸🇬 Singapore (+65)' },
  { code: '+421', country: 'SK', label: '🇸🇰 Slovakia (+421)' },
  { code: '+386', country: 'SI', label: '🇸🇮 Slovenia (+386)' },
  { code: '+27', country: 'ZA', label: '🇿🇦 South Africa (+27)' },
  { code: '+82', country: 'KR', label: '🇰🇷 South Korea (+82)' },
  { code: '+34', country: 'ES', label: '🇪🇸 Spain (+34)' },
  { code: '+46', country: 'SE', label: '🇸🇪 Sweden (+46)' },
  { code: '+41', country: 'CH', label: '🇨🇭 Switzerland (+41)' },
  { code: '+886', country: 'TW', label: '🇹🇼 Taiwan (+886)' },
  { code: '+66', country: 'TH', label: '🇹🇭 Thailand (+66)' },
  { code: '+90', country: 'TR', label: '🇹🇷 Turkey (+90)' },
  { code: '+380', country: 'UA', label: '🇺🇦 Ukraine (+380)' },
  { code: '+971', country: 'AE', label: '🇦🇪 UAE (+971)' },
  { code: '+44', country: 'GB', label: '🇬🇧 United Kingdom (+44)' },
  { code: '+1', country: 'US', label: '🇺🇸 United States (+1)' },
  { code: '+598', country: 'UY', label: '🇺🇾 Uruguay (+598)' },
  { code: '+998', country: 'UZ', label: '🇺🇿 Uzbekistan (+998)' },
  { code: '+58', country: 'VE', label: '🇻🇪 Venezuela (+58)' },
  { code: '+84', country: 'VN', label: '🇻🇳 Vietnam (+84)' }
];

const SERVICE_ICONS = {
  accommodation: <HomeOutlined className="text-5xl text-blue-500" />,
  lesson: <BookOutlined className="text-5xl text-green-500" />,
  rental: <CarOutlined className="text-5xl text-orange-500" />,
  shop: <ShoppingCartOutlined className="text-5xl text-purple-500" />
};

const SERVICE_LABELS = {
  accommodation: 'Accommodation',
  lesson: 'Lesson',
  rental: 'Rental',
  shop: 'Shop'
};

const SERVICE_COLORS = {
  accommodation: 'from-blue-500 to-blue-600',
  lesson: 'from-green-500 to-green-600',
  rental: 'from-orange-500 to-orange-600',
  shop: 'from-purple-500 to-purple-600'
};

const PublicQuickBooking = () => {
  const { linkCode } = useParams();
  const navigate = useNavigate();
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [linkData, setLinkData] = useState(null);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [formData, setFormData] = useState({});

  const fetchLinkData = useCallback(async () => {
    try {
      const data = await getPublicQuickLink(linkCode);
      setLinkData(data);
      setError(null);
    } catch (err) {
      setError(err.response?.data?.error || 'This link is invalid or has expired');
    } finally {
      setLoading(false);
    }
  }, [linkCode]);

  useEffect(() => {
    fetchLinkData();
  }, [fetchLinkData]);

  const steps = [
    {
      title: 'About You',
      icon: <SmileOutlined />,
      description: "Let's get to know you"
    },
    {
      title: 'Contact',
      icon: <MailOutlined />,
      description: 'How can we reach you'
    },
    {
      title: 'Preferences',
      icon: <MessageOutlined />,
      description: 'Your communication preference'
    }
  ];

  const handleNext = async () => {
    try {
      // Validate current step fields
      if (currentStep === 0) {
        await form.validateFields(['first_name', 'last_name']);
      } else if (currentStep === 1) {
        await form.validateFields(['email', 'phone', 'phone_country_code']);
      }
      
      // Save form data
      const values = form.getFieldsValue();
      setFormData(prev => ({ ...prev, ...values }));
      setCurrentStep(prev => prev + 1);
    } catch {
      // Validation failed, don't proceed
    }
  };

  const handlePrev = () => {
    setCurrentStep(prev => prev - 1);
  };

  const handleSubmit = async () => {
    try {
      await form.validateFields();
      const allValues = { ...formData, ...form.getFieldsValue() };
      
      setSubmitting(true);
      
      // Prepare data for API
      const submitData = {
        first_name: allValues.first_name,
        last_name: allValues.last_name,
        email: allValues.email,
        phone: allValues.phone,
        phone_country_code: allValues.phone_country_code || '+90',
        additional_data: {
          contact_preference: allValues.contact_preference,
          contact_methods: allValues.contact_methods || []
        },
        notes: allValues.notes || ''
      };

      await registerViaQuickLink(linkCode, submitData);
      setSuccess(true);
      message.success('Registration submitted successfully!');
    } catch (err) {
      if (err.errorFields) {
        // Validation error
        return;
      }
      message.error(err.response?.data?.error || 'Failed to submit registration');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100">
        <div className="text-center">
          <Spin size="large" />
          <p className="mt-4 text-gray-500">Loading registration form...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 p-4">
        <Card className="max-w-md w-full shadow-xl rounded-3xl border-0">
          <Result
            status="error"
            title="Link Not Available"
            subTitle={error}
            extra={
              <Button type="primary" size="large" onClick={() => navigate('/')} className="rounded-xl h-12 px-8">
                Go Home
              </Button>
            }
          />
        </Card>
      </div>
    );
  }

  if (success) {
    const serviceColor = SERVICE_COLORS[linkData?.service_type] || SERVICE_COLORS.lesson;
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 p-4">
        <Card className="max-w-lg w-full shadow-xl rounded-3xl border-0 overflow-hidden">
          <div className={`bg-gradient-to-r ${serviceColor} -mx-6 -mt-6 px-6 py-8 mb-6`}>
            <div className="text-center text-white">
              <CheckCircleOutlined className="text-6xl mb-4" />
              <Title level={2} className="!text-white !mb-2">You're All Set!</Title>
              <Text className="text-white/80">Registration submitted successfully</Text>
            </div>
          </div>
          
          <div className="text-center space-y-4">
            <Paragraph className="text-gray-600">
              Thank you for your interest in our <strong>{SERVICE_LABELS[linkData?.service_type] || 'service'}</strong>.
              We've received your registration and will contact you shortly via your preferred method.
            </Paragraph>
            
            <div className="bg-green-50 rounded-2xl p-4 text-left">
              <Text strong className="text-green-700 block mb-2">What happens next?</Text>
              <ul className="text-sm text-green-600 space-y-1">
                <li>✓ Our team will review your registration</li>
                <li>✓ We'll contact you within 24-48 hours via your preferred method</li>
                <li>✓ Once approved, we'll help you set up your account</li>
              </ul>
            </div>

            <Divider />

            <Space>
              <Button size="large" onClick={() => navigate('/')} className="rounded-xl h-12 px-6">
                Go to Homepage
              </Button>
              <Button 
                type="primary" 
                size="large"
                onClick={() => {
                  setSuccess(false);
                  setCurrentStep(0);
                  form.resetFields();
                  setFormData({});
                }}
                className="rounded-xl h-12 px-6"
              >
                Submit Another
              </Button>
            </Space>
          </div>
        </Card>
      </div>
    );
  }

  const serviceColor = SERVICE_COLORS[linkData?.service_type] || SERVICE_COLORS.lesson;

  // Step content components
  const renderStepContent = () => {
    switch (currentStep) {
      case 0:
        return (
          <div className="space-y-6">
            <div className="text-center mb-8">
              <div className="w-20 h-20 mx-auto bg-gradient-to-br from-indigo-100 to-purple-100 rounded-full flex items-center justify-center mb-4">
                <SmileOutlined className="text-3xl text-indigo-500" />
              </div>
              <Title level={4} className="!mb-1">Let's get to know you!</Title>
              <Text type="secondary">Please enter your name as it appears on your ID</Text>
            </div>

            <Form.Item
              name="first_name"
              rules={[{ required: true, message: 'Please enter your first name' }]}
            >
              <Input 
                size="large"
                prefix={<UserOutlined className="text-gray-400" />}
                placeholder="First Name"
                className="rounded-xl h-14 text-lg"
              />
            </Form.Item>

            <Form.Item
              name="last_name"
              rules={[{ required: true, message: 'Please enter your last name' }]}
            >
              <Input 
                size="large"
                prefix={<UserOutlined className="text-gray-400" />}
                placeholder="Last Name"
                className="rounded-xl h-14 text-lg"
              />
            </Form.Item>
          </div>
        );

      case 1:
        return (
          <div className="space-y-6">
            <div className="text-center mb-8">
              <div className="w-20 h-20 mx-auto bg-gradient-to-br from-blue-100 to-cyan-100 rounded-full flex items-center justify-center mb-4">
                <MailOutlined className="text-3xl text-blue-500" />
              </div>
              <Title level={4} className="!mb-1">How can we reach you?</Title>
              <Text type="secondary">We'll use this to send you updates</Text>
            </div>

            <Form.Item
              name="email"
              rules={[
                { required: true, message: 'Please enter your email address' },
                { type: 'email', message: 'Please enter a valid email address' }
              ]}
            >
              <Input 
                size="large"
                prefix={<MailOutlined className="text-gray-400" />}
                placeholder="Email Address"
                className="rounded-xl h-14 text-lg"
                type="email"
              />
            </Form.Item>

            <div className="phone-input-container">
              <Form.Item
                name="phone_country_code"
                initialValue="+90"
                className="phone-country-select mb-0"
              >
                <Select 
                  size="large"
                  className="h-14"
                  showSearch
                  optionFilterProp="label"
                  popupMatchSelectWidth={280}
                  dropdownStyle={{ maxHeight: 300 }}
                >
                  {COUNTRY_CODES.map(({ code, country, label }) => (
                    <Select.Option key={`${country}-${code}`} value={code} label={label}>
                      {label}
                    </Select.Option>
                  ))}
                </Select>
              </Form.Item>
              <Form.Item
                name="phone"
                className="phone-number-input mb-0 flex-1"
                rules={[
                  { required: true, message: 'Please enter your phone number' },
                  { pattern: /^[\d\s-]{6,}$/, message: 'Please enter a valid phone number' }
                ]}
              >
                <Input 
                  size="large"
                  prefix={<PhoneOutlined className="text-gray-400" />}
                  placeholder="555 123 4567"
                  className="h-14 text-lg"
                />
              </Form.Item>
            </div>
          </div>
        );

      case 2:
        return (
          <div className="space-y-6">
            <div className="text-center mb-8">
              <div className="w-20 h-20 mx-auto bg-gradient-to-br from-green-100 to-emerald-100 rounded-full flex items-center justify-center mb-4">
                <MessageOutlined className="text-3xl text-green-500" />
              </div>
              <Title level={4} className="!mb-1">Communication Preferences</Title>
              <Text type="secondary">How would you prefer we contact you?</Text>
            </div>

            <Form.Item
              name="contact_preference"
              rules={[{ required: true, message: 'Please select your preferred contact method' }]}
            >
              <Radio.Group className="w-full">
                <div className="space-y-3">
                  <Radio.Button 
                    value="whatsapp" 
                    className="w-full h-auto p-4 rounded-xl flex items-center border-2 hover:border-green-400 transition-all"
                    style={{ display: 'flex', alignItems: 'center' }}
                  >
                    <div className="flex items-center gap-4 w-full">
                      <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
                        <WhatsAppOutlined className="text-2xl text-green-500" />
                      </div>
                      <div className="text-left">
                        <div className="font-semibold text-gray-800">WhatsApp</div>
                        <div className="text-sm text-gray-500">Quick messages via WhatsApp</div>
                      </div>
                    </div>
                  </Radio.Button>

                  <Radio.Button 
                    value="phone" 
                    className="w-full h-auto p-4 rounded-xl flex items-center border-2 hover:border-blue-400 transition-all"
                    style={{ display: 'flex', alignItems: 'center' }}
                  >
                    <div className="flex items-center gap-4 w-full">
                      <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
                        <PhoneOutlined className="text-2xl text-blue-500" />
                      </div>
                      <div className="text-left">
                        <div className="font-semibold text-gray-800">Phone Call</div>
                        <div className="text-sm text-gray-500">We'll give you a call</div>
                      </div>
                    </div>
                  </Radio.Button>

                  <Radio.Button 
                    value="email" 
                    className="w-full h-auto p-4 rounded-xl flex items-center border-2 hover:border-purple-400 transition-all"
                    style={{ display: 'flex', alignItems: 'center' }}
                  >
                    <div className="flex items-center gap-4 w-full">
                      <div className="w-12 h-12 bg-purple-100 rounded-full flex items-center justify-center">
                        <MailOutlined className="text-2xl text-purple-500" />
                      </div>
                      <div className="text-left">
                        <div className="font-semibold text-gray-800">Email</div>
                        <div className="text-sm text-gray-500">Detailed information via email</div>
                      </div>
                    </div>
                  </Radio.Button>
                </div>
              </Radio.Group>
            </Form.Item>

            <Divider className="!my-4" />

            <Form.Item
              name="contact_methods"
              label={<Text type="secondary">Also allow contact via:</Text>}
            >
              <Checkbox.Group className="w-full">
                <div className="flex flex-wrap gap-3">
                  <Checkbox value="sms" className="border rounded-lg px-3 py-2 hover:bg-gray-50">
                    SMS
                  </Checkbox>
                  <Checkbox value="telegram" className="border rounded-lg px-3 py-2 hover:bg-gray-50">
                    Telegram
                  </Checkbox>
                </div>
              </Checkbox.Group>
            </Form.Item>

            <Form.Item
              name="notes"
              label={<Text type="secondary">Any additional notes? (Optional)</Text>}
            >
              <Input.TextArea 
                rows={3}
                placeholder="Special requests, questions, or comments..."
                className="rounded-xl"
              />
            </Form.Item>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 py-6 px-4">
      <div className="max-w-xl mx-auto">
        {/* Header */}
        <Card className="mb-4 shadow-lg rounded-3xl border-0 overflow-hidden">
          <div className={`bg-gradient-to-r ${serviceColor} -mx-6 -mt-6 px-6 py-6`}>
            <div className="text-center text-white">
              <div className="w-16 h-16 mx-auto bg-white/20 rounded-2xl flex items-center justify-center mb-3 backdrop-blur-sm">
                {SERVICE_ICONS[linkData?.service_type] ? 
                  <span className="text-white">{SERVICE_ICONS[linkData?.service_type]}</span> : 
                  <BookOutlined className="text-3xl" />
                }
              </div>
              <Title level={3} className="!text-white !mb-1">
                {linkData?.name || 'Registration'}
              </Title>
              {linkData?.description && (
                <Text className="text-white/80 text-sm">{linkData.description}</Text>
              )}
            </div>
          </div>
          
          <div className="pt-4">
            <Steps 
              current={currentStep} 
              size="small"
              items={steps.map((step, index) => ({
                title: <span className={currentStep >= index ? 'font-medium' : 'text-gray-400'}>{step.title}</span>,
                description: <span className="text-xs">{step.description}</span>
              }))}
            />
          </div>
        </Card>

        {/* Form Card */}
        <Card className="shadow-lg rounded-3xl border-0">
          <Form
            form={form}
            layout="vertical"
            className="mt-2"
            initialValues={formData}
          >
            {renderStepContent()}

            {/* Navigation Buttons */}
            <div className="flex justify-between mt-8 pt-4 border-t">
              {currentStep > 0 ? (
                <Button 
                  size="large" 
                  onClick={handlePrev}
                  icon={<ArrowLeftOutlined />}
                  className="rounded-xl h-12 px-6"
                >
                  Back
                </Button>
              ) : (
                <div />
              )}

              {currentStep < steps.length - 1 ? (
                <Button 
                  type="primary" 
                  size="large" 
                  onClick={handleNext}
                  className="rounded-xl h-12 px-8"
                >
                  Continue <ArrowRightOutlined className="ml-1" />
                </Button>
              ) : (
                <Button 
                  type="primary" 
                  size="large" 
                  onClick={handleSubmit}
                  loading={submitting}
                  icon={<CheckCircleOutlined />}
                  className="rounded-xl h-12 px-8 bg-gradient-to-r from-green-500 to-emerald-500 border-0 hover:from-green-600 hover:to-emerald-600"
                >
                  {submitting ? 'Submitting...' : 'Complete Registration'}
                </Button>
              )}
            </div>
          </Form>
        </Card>

        {/* Progress indicator */}
        <div className="text-center mt-6">
          <div className="inline-flex items-center gap-2 text-gray-400 text-sm">
            <span>Step {currentStep + 1} of {steps.length}</span>
            <div className="flex gap-1">
              {steps.map((step, index) => (
                <div 
                  key={step.title}
                  className={`w-2 h-2 rounded-full transition-all ${
                    index <= currentStep ? 'bg-indigo-500' : 'bg-gray-300'
                  }`}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="text-center mt-4 text-gray-400 text-xs">
          Powered by Plannivo
        </div>
      </div>
    </div>
  );
};

export default PublicQuickBooking;
