import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Form, Input, Button, InputNumber, Row, Col, Result } from 'antd';
import { message } from '@/shared/utils/antdStatic';
import { UserOutlined, MailOutlined, PhoneOutlined, EnvironmentOutlined, CheckCircleOutlined } from '@ant-design/icons';
import { ArrowRightIcon } from '@heroicons/react/24/outline';
import ReactCountryFlag from 'react-country-flag';
import dayjs from 'dayjs';
import DataService from '@/shared/services/dataService';
import apiClient from '@/shared/services/apiClient';
import FlexibleDatePicker from '@/shared/components/ui/FlexibleDatePicker';
import { countries, detectCountryFromPhone } from '@/shared/components/ui/UserForm';

/**
 * A deliberately minimal, friendly registration form intended to be handed to a customer
 * so they can enter their own details. No role/password/currency pickers — it self-registers
 * a student account and triggers an activation email.
 *
 * - Staff context (default): posts to the authenticated POST /users with self_service:true.
 * - publicMode (the QR /join page): the customer is anonymous, so it posts to the public
 *   POST /auth/self-register, which forces the student role + passwordless flow server-side.
 */
const CustomerSelfRegisterForm = ({ roles, onSuccess, onCancel, publicMode = false }) => {
  const { t } = useTranslation(['common']);
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [selectedCountry, setSelectedCountry] = useState(null);
  const [done, setDone] = useState(false);
  const [registeredEmail, setRegisteredEmail] = useState('');

  const handlePhoneChange = (e) => {
    const phone = e.target.value;
    if (phone.length >= 3) {
      const detectedCode = detectCountryFromPhone(phone);
      const country = detectedCode ? countries.find((c) => c.code === detectedCode) : null;
      if (country) {
        setSelectedCountry(country);
        form.setFieldsValue({ country: country.name });
      }
    } else if (phone.length === 0) {
      setSelectedCountry(null);
    }
  };

  const resetForNext = () => {
    form.resetFields();
    setSelectedCountry(null);
    setRegisteredEmail('');
    setDone(false);
  };

  const handleFinish = async (values) => {
    setLoading(true);
    try {
      const payload = {
        ...values,
        name: `${values.first_name || ''} ${values.last_name || ''}`.trim(),
        preferred_currency: 'EUR',
      };

      if (payload.date_of_birth) {
        const dob = dayjs(payload.date_of_birth);
        payload.date_of_birth = dob.format('YYYY-MM-DD');
        payload.age = dayjs().diff(dob, 'year');
      } else {
        delete payload.date_of_birth;
        delete payload.age;
      }

      if (payload.weight === '' || payload.weight === null) {
        delete payload.weight;
      }

      if (publicMode) {
        // Anonymous QR page: role + passwordless flow are forced entirely server-side.
        await apiClient.post('/auth/self-register', payload);
      } else {
        const studentRole = roles?.find((r) => (r.name || '').toLowerCase() === 'student');
        if (!studentRole) {
          throw new Error(t('common:userForm.selectRoleRequired', 'Could not determine the customer role.'));
        }
        // No password is sent: self_service tells the backend to mint a secure random one and
        // email the customer a one-time link to set their own + activate their account.
        await DataService.createUser({ ...payload, role_id: studentRole.id, self_service: true });
      }

      setRegisteredEmail(values.email || '');
      setDone(true);
      onSuccess?.();
    } catch (error) {
      const apiMsg = error?.response?.data?.error;
      message.error(apiMsg || error.message || t('common:userForm.errorSaving', 'Something went wrong. Please try again.'));
    } finally {
      setLoading(false);
    }
  };

  if (done) {
    if (publicMode) {
      return (
        <div className="text-center py-2">
          <div
            className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full border border-[#00a8c4]/40 bg-[#00a8c4]/10"
            style={{ boxShadow: '0 0 26px rgba(0,168,196,0.28)' }}
          >
            <CheckCircleOutlined style={{ fontSize: 30, color: '#00a8c4' }} />
          </div>
          <h3 className="m-0 font-duotone-bold-extended text-xl uppercase tracking-tight text-white">
            {t('common:customerSelf.successTitle', 'Almost done — check your email 📧')}
          </h3>
          <p className="mx-auto mt-2 mb-5 max-w-xs font-duotone-regular text-sm text-gray-400">
            {t('common:customerSelf.successSubtitle', "We've sent you a link to set your password and activate your account.")}
          </p>
          <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-left">
            <p className="m-0 font-duotone-bold text-[11px] uppercase tracking-wider text-[#4b4f54]">
              {t('common:customerSelf.activationSentTo', "We've emailed an activation link to:")}
            </p>
            {registeredEmail && (
              <p className="m-0 mt-1 break-all text-sm font-semibold text-[#00a8c4]">{registeredEmail}</p>
            )}
            <p className="m-0 mt-3 text-xs leading-relaxed text-gray-400">
              {t(
                'common:customerSelf.activateWarning',
                '⚠️ Open that email and click "Set your password" to choose a password and activate your account. You won\'t be able to log in until you do.'
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={resetForNext}
            className="mt-5 text-xs uppercase tracking-widest text-gray-500 transition-colors hover:text-[#00a8c4] focus-visible:text-[#00a8c4] focus:outline-none"
          >
            {t('common:customerSelf.registerAnother', 'Register another')}
          </button>
        </div>
      );
    }
    return (
      <Result
        status="success"
        title={t('common:customerSelf.successTitle', 'Almost done — check your email 📧')}
        subTitle={t(
          'common:customerSelf.successSubtitle',
          "We've sent you a link to set your password and activate your account."
        )}
        extra={[
          <Button key="again" type="primary" size="large" onClick={resetForNext}>
            {t('common:customerSelf.registerAnother', 'Register another')}
          </Button>,
          ...(onCancel
            ? [
                <Button key="close" size="large" onClick={onCancel}>
                  {t('common:buttons.close', 'Close')}
                </Button>,
              ]
            : []),
        ]}
      >
        <div className="mx-auto max-w-sm text-left bg-sky-50 border border-sky-100 rounded-xl p-4">
          <p className="text-sm text-slate-600 m-0">
            {t('common:customerSelf.activationSentTo', "We've emailed an activation link to:")}
          </p>
          {registeredEmail && (
            <p className="text-sm font-semibold text-slate-800 break-all m-0 mt-1">{registeredEmail}</p>
          )}
          <div className="mt-3 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2">
            <p className="text-xs text-amber-700 m-0">
              {t(
                'common:customerSelf.activateWarning',
                '⚠️ Open that email and click "Set your password" to choose a password and activate your account. You won\'t be able to log in until you do.'
              )}
            </p>
          </div>
        </div>
      </Result>
    );
  }

  return (
    <div>
      {!publicMode && (
        <div className="mb-6 rounded-xl bg-sky-50 border border-sky-100 px-4 py-3">
          <p className="text-sky-800 font-medium m-0">
            {t('common:customerSelf.welcomeTitle', 'Welcome! 👋')}
          </p>
          <p className="text-sky-700 text-sm m-0">
            {t('common:customerSelf.welcomeSubtitle', 'Please fill in your details below. It only takes a minute.')}
          </p>
        </div>
      )}

      <Form
        form={form}
        layout="vertical"
        onFinish={handleFinish}
        requiredMark={false}
        size="large"
        className={publicMode ? 'dark-form' : ''}
      >
        <Row gutter={16}>
          <Col xs={24} sm={12}>
            <Form.Item
              name="first_name"
              label={t('common:userForm.firstName')}
              rules={[{ required: true, message: t('common:userForm.firstNameRequired') }]}
            >
              <Input prefix={<UserOutlined />} placeholder={t('common:userForm.enterFirstName')} autoComplete="given-name" />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12}>
            <Form.Item
              name="last_name"
              label={t('common:userForm.lastName')}
              rules={[{ required: true, message: t('common:userForm.lastNameRequired') }]}
            >
              <Input prefix={<UserOutlined />} placeholder={t('common:userForm.enterLastName')} autoComplete="family-name" />
            </Form.Item>
          </Col>
        </Row>

        <Form.Item
          name="email"
          label={t('common:userForm.email')}
          rules={[
            { type: 'email', message: t('common:userForm.emailInvalid') },
            { required: true, message: t('common:userForm.emailRequired') },
          ]}
        >
          <Input prefix={<MailOutlined />} placeholder={t('common:userForm.enterEmail')} autoComplete="email" />
        </Form.Item>

        <Form.Item
          name="phone"
          label={t('common:userForm.phone')}
          rules={[{ required: true, message: t('common:userForm.phoneRequired') }]}
        >
          <Input
            prefix={<PhoneOutlined />}
            placeholder={t('common:userForm.enterPhone')}
            autoComplete="tel"
            onChange={handlePhoneChange}
            addonBefore={selectedCountry ? (
              <ReactCountryFlag countryCode={selectedCountry.code} svg style={{ width: '16px', height: '12px' }} />
            ) : (
              <span style={{ width: '16px', height: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', color: '#999' }}>
                🌍
              </span>
            )}
          />
        </Form.Item>

        <Row gutter={16}>
          <Col xs={24} sm={12}>
            <Form.Item name="date_of_birth" label={t('common:userForm.dateOfBirth')}>
              <FlexibleDatePicker
                style={{ width: '100%' }}
                placeholder={t('common:userForm.selectDateOfBirth')}
                disabledDate={(current) => current && current > dayjs().endOf('day')}
              />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12}>
            <Form.Item name="weight" label={t('common:userForm.weight')}>
              <InputNumber
                min={30}
                max={200}
                step={0.1}
                precision={1}
                style={{ width: '100%' }}
                placeholder={t('common:userForm.enterWeightKg')}
                addonAfter="kg"
              />
            </Form.Item>
          </Col>
        </Row>

        <Form.Item name="city" label={t('common:userForm.city')}>
          <Input prefix={<EnvironmentOutlined />} placeholder={t('common:userForm.enterCity')} autoComplete="address-level2" />
        </Form.Item>

        {/* Country is captured silently from the phone number; kept as a hidden field. */}
        <Form.Item name="country" hidden>
          <Input />
        </Form.Item>

        <Form.Item style={{ marginTop: publicMode ? 20 : 8, marginBottom: 0 }}>
          {publicMode ? (
            <button
              type="submit"
              disabled={loading}
              className="group relative inline-flex w-full items-center justify-center gap-4 rounded-md bg-[#4b4f54] px-8 py-4 font-duotone-bold text-base uppercase leading-none text-[#00a8c4] transition-all duration-300 hover:bg-[#525759] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#00a8c4]/60 disabled:cursor-wait disabled:opacity-70"
              style={{
                border: '1px solid rgba(0,168,196,0.6)',
                boxShadow: '0 0 10px rgba(0,168,196,0.3), 0 0 24px rgba(0,168,196,0.1), inset 0 1px 0 rgba(255,255,255,0.05)',
                letterSpacing: '0.22em',
              }}
            >
              <span>
                {loading
                  ? t('common:customerSelf.submitting', 'Registering…')
                  : t('common:customerSelf.submit', 'Register')}
              </span>
              {!loading && (
                <>
                  <span style={{ width: '1px', height: '14px', backgroundColor: 'rgba(0,168,196,0.35)', flexShrink: 0 }} />
                  <ArrowRightIcon className="h-4 w-4 flex-shrink-0 transition-transform duration-300 group-hover:translate-x-1" />
                </>
              )}
            </button>
          ) : (
            <Button type="primary" htmlType="submit" loading={loading} size="large" block>
              {t('common:customerSelf.submit', 'Register')}
            </Button>
          )}
        </Form.Item>
      </Form>
    </div>
  );
};

export default CustomerSelfRegisterForm;
