import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Form, Input, Select, Button, Tag, Divider, Spin, Alert, message } from 'antd';
import dpsLogo from '../../../../DuotoneFonts/DPSLOGOS/DPS-transparenton-black.svg';
import {
  ToolOutlined,
  SearchOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  SyncOutlined,
  CloseCircleOutlined,
  ArrowRightOutlined,
  UserOutlined,
  MailOutlined,
  PhoneOutlined,
} from '@ant-design/icons';
import { usePageSEO } from '@/shared/utils/seo';
import { useAuth } from '@/shared/hooks/useAuth';
import apiClient from '@/shared/services/apiClient';
import GoogleReviewsStrip from '@/shared/components/ui/GoogleReviewsStrip';

/* ─────────────────────────────────────────────────── helpers ── */

async function submitGuestRequest(payload) {
  const { data } = await apiClient.post('/repair-requests/guest', payload);
  return data;
}

async function lookupToken(token) {
  const { data } = await apiClient.get(`/repair-requests/track/${encodeURIComponent(token.trim())}`);
  return data.data;
}

/* ──────────────────────────────────────────── sub-components ── */

const StatusTimeline = ({ status, statusConfig }) => {
  const steps = ['pending', 'in_progress', 'completed'];
  return (
    <div className="flex items-center gap-0 mt-4">
      {steps.map((step, i) => {
        const cfg = statusConfig[step];
        const isActive = step === status;
        const isDone = steps.indexOf(status) > i;
        const color = isDone || isActive ? 'bg-teal-500' : 'bg-white/10';
        return (
          <div key={step} className="flex items-center flex-1">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm ${color} ${isActive ? 'ring-2 ring-teal-300 ring-offset-2 ring-offset-transparent' : ''}`}>
              {isDone ? <CheckCircleOutlined className="text-white" /> : (
                <span className={isActive ? 'text-white' : 'text-white/40'}>{i + 1}</span>
              )}
            </div>
            <span className={`ml-2 text-xs hidden sm:inline ${isActive ? 'text-teal-300 font-semibold' : isDone ? 'text-white/60' : 'text-white/30'}`}>
              {cfg.label}
            </span>
            {i < steps.length - 1 && (
              <div className={`flex-1 h-0.5 mx-2 ${isDone ? 'bg-teal-500' : 'bg-white/10'}`} />
            )}
          </div>
        );
      })}
    </div>
  );
};

const TrackingResult = ({ request, statusConfig }) => {
  if (!request) return null;
  const cfg = statusConfig[request.status] || statusConfig.pending;
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-6 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <p className="text-xs text-white/40 uppercase tracking-widest mb-1">Request #{request.id}</p>
          <h3 className="text-lg font-bold text-white">{request.item_name}</h3>
          <p className="text-sm text-white/50">{request.equipment_type?.replace('_', ' ')}</p>
        </div>
        <Tag color={cfg.tagColor} icon={cfg.icon} className="text-sm px-3 py-1 rounded-full">
          {cfg.label}
        </Tag>
      </div>

      <StatusTimeline status={request.status} statusConfig={statusConfig} />

      <p className={`text-sm mt-2 ${cfg.color}`}>{cfg.desc}</p>

      {request.description && (
        <div>
          <p className="text-xs text-white/40 uppercase tracking-widest mb-1">Your description</p>
          <p className="text-sm text-white/70 whitespace-pre-wrap">{request.description}</p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 text-xs text-white/40">
        <div>
          <span className="block text-white/25 uppercase tracking-wider mb-0.5">Submitted</span>
          {new Date(request.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
        </div>
        <div>
          <span className="block text-white/25 uppercase tracking-wider mb-0.5">Priority</span>
          <span className="capitalize">{request.priority}</span>
        </div>
        {request.assigned_to_name && (
          <div className="col-span-2">
            <span className="block text-white/25 uppercase tracking-wider mb-0.5">Assigned to</span>
            {request.assigned_to_name}
          </div>
        )}
      </div>
    </div>
  );
};

/* ─────────────────────────────────────────────── main page ── */

const CareLandingPage = () => {
  const { t } = useTranslation(['outsider']);
  const { isAuthenticated, user } = useAuth();
  const ADMIN_ROLES = ['admin', 'manager', 'developer'];
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [form] = Form.useForm();
  const [trackForm] = Form.useForm();

  // Active tab: 'submit' | 'track'
  const [activeTab, setActiveTab] = useState('submit');

  // Submit state
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(null); // { trackingToken, id }

  // Track state
  const [tracking, setTracking] = useState(false);
  const [trackResult, setTrackResult] = useState(null);
  const [trackError, setTrackError] = useState(null);

  usePageSEO({
    title: '.Care | Equipment Repair – UKC World',
    description: 'Submit a repair request for your kite, board, bar & lines — no account needed. All brands welcome. Track your repair status online.',
  });

  const EQUIPMENT_TYPES = [
    { value: 'kite', label: t('outsider:care.equipmentTypes.kite') },
    { value: 'board', label: t('outsider:care.equipmentTypes.board') },
    { value: 'bar_lines', label: t('outsider:care.equipmentTypes.bar') },
    { value: 'harness', label: t('outsider:care.equipmentTypes.harness') },
    { value: 'wetsuit', label: t('outsider:care.equipmentTypes.wetsuit') },
    { value: 'pump', label: 'Pump' },
    { value: 'bag', label: 'Bag / Travel case' },
    { value: 'other', label: t('outsider:care.equipmentTypes.other') },
  ];

  const PRIORITY_OPTIONS = [
    { value: 'low', label: t('outsider:care.priorityOptions.low'), color: 'blue' },
    { value: 'medium', label: t('outsider:care.priorityOptions.medium'), color: 'orange' },
    { value: 'high', label: t('outsider:care.priorityOptions.high'), color: 'red' },
    { value: 'urgent', label: t('outsider:care.priorityOptions.urgent'), color: 'volcano' },
  ];

  const STATUS_CONFIG = {
    pending: {
      label: t('outsider:care.statusConfig.received.label'),
      icon: <ClockCircleOutlined />,
      color: 'text-yellow-400',
      tagColor: 'yellow',
      desc: t('outsider:care.statusConfig.received.description'),
    },
    in_progress: {
      label: t('outsider:care.statusConfig.inProgress.label'),
      icon: <SyncOutlined spin />,
      color: 'text-blue-400',
      tagColor: 'blue',
      desc: t('outsider:care.statusConfig.inProgress.description'),
    },
    completed: {
      label: t('outsider:care.statusConfig.completed.label'),
      icon: <CheckCircleOutlined />,
      color: 'text-green-400',
      tagColor: 'green',
      desc: t('outsider:care.statusConfig.completed.description'),
    },
    cancelled: {
      label: t('outsider:care.statusConfig.cancelled.label'),
      icon: <CloseCircleOutlined />,
      color: 'text-gray-400',
      tagColor: 'default',
      desc: t('outsider:care.statusConfig.cancelled.description'),
    },
  };

  // Auto-load tracking if token is in URL
  useEffect(() => {
    const token = searchParams.get('token');
    if (token) {
      setActiveTab('track');
      trackForm.setFieldsValue({ token });
      handleTrack({ token });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSubmit = async (values) => {
    setSubmitting(true);
    try {
      const result = await submitGuestRequest({
        guestName: values.guestName,
        guestEmail: values.guestEmail,
        guestPhone: values.guestPhone,
        equipmentType: values.equipmentType,
        itemName: values.itemName,
        description: values.description,
        priority: values.priority,
        location: values.location,
      });
      setSubmitted({
        trackingToken: result.trackingToken,
        id: result.data?.id,
      });
    } catch (err) {
      const msg = err.response?.data?.error || err.message || 'Failed to submit request';
      message.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleTrack = async (values) => {
    const token = (values?.token || trackForm.getFieldValue('token') || '').trim();
    if (!token) return;
    setTracking(true);
    setTrackResult(null);
    setTrackError(null);
    setSearchParams({ token });
    try {
      const data = await lookupToken(token);
      setTrackResult(data);
    } catch (err) {
      setTrackError(err.response?.data?.error || err.message || 'Request not found');
    } finally {
      setTracking(false);
    }
  };

  return (
    <div className="bg-[#0d1511] min-h-screen text-white font-sans pb-20 selection:bg-teal-400/30">

      {/* ── Hero ── */}
      <div className="relative overflow-hidden pt-12 md:pt-16">
        <div className="absolute inset-0 bg-gradient-to-br from-teal-900/30 via-transparent to-cyan-900/10 pointer-events-none" />

        {/* Duotone Pro Center Urla Logo */}
        <div className="absolute top-14 left-1/2 transform -translate-x-1/2 w-[95vw] sm:w-[65vw] md:w-[48rem] max-w-[850px] z-10">
          <img
            src={dpsLogo}
            alt="Duotone Pro Center Urla Logo"
            className="w-full"
            style={{ filter: 'drop-shadow(0 2px 8px rgba(0,0,0,0.2))' }}
          />
        </div>

        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 pb-14 relative z-10 text-center">
          <div className="mt-20 md:mt-24 mb-4">
            <h1 className="text-4xl sm:text-5xl md:text-6xl font-duotone-bold-extended mb-4 tracking-tight text-white drop-shadow-xl uppercase">
              {t('outsider:care.hero.pretitle')}
            </h1>
            <p className="text-gray-300 text-lg sm:text-xl font-duotone-regular max-w-2xl mx-auto drop-shadow">
              {t('outsider:care.hero.description')}
            </p>
          </div>

          {/* CTA for logged-in users */}
          {isAuthenticated && ADMIN_ROLES.includes(user?.role?.toLowerCase?.() || '') && (
            <div className="mt-8 inline-flex items-center gap-3 bg-teal-500/10 border border-teal-500/20 rounded-2xl px-6 py-4">
              <span className="text-teal-300 text-sm">{t('outsider:care.adminCta.text')}</span>
              <Button
                type="primary"
                size="small"
                icon={<ArrowRightOutlined />}
                onClick={() => navigate('/repairs')}
                className="!bg-teal-600 !border-none hover:!bg-teal-500"
              >
                {t('outsider:care.adminCta.button')}
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* ── Tab switcher ── */}
      <div className="max-w-2xl mx-auto px-4 sm:px-6 mb-8">
        <div className="flex rounded-2xl overflow-hidden border border-white/10 bg-white/5">
          {[
            { key: 'submit', label: t('outsider:care.tabs.submit'), icon: <ToolOutlined /> },
            { key: 'track', label: t('outsider:care.tabs.track'), icon: <SearchOutlined /> },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-semibold transition-all duration-200 ${
                activeTab === tab.key
                  ? 'bg-teal-600 text-white'
                  : 'text-white/40 hover:text-white/70 hover:bg-white/5'
              }`}
            >
              {tab.icon} {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Submit form ── */}
      {activeTab === 'submit' && (
        <div className="max-w-2xl mx-auto px-4 sm:px-6">
          {submitted ? (
            /* ── Success state ── */
            <div className="rounded-2xl border border-teal-500/20 bg-teal-500/5 p-8 space-y-5 text-center">
              <CheckCircleOutlined className="text-5xl text-teal-400" />
              <h2 className="text-2xl font-bold text-white">{t('outsider:care.success.title')}</h2>
              <p className="text-white/60">
                {t('outsider:care.success.description')}
              </p>

              <div className="bg-black/30 rounded-xl border border-teal-500/20 px-6 py-5">
                <p className="text-xs text-white/40 uppercase tracking-widest mb-2">
                  {t('outsider:care.success.tokenLabel')}
                </p>
                <p className="font-mono text-teal-300 text-sm break-all">{submitted.trackingToken}</p>
              </div>

              <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
                <Button
                  type="primary"
                  icon={<SearchOutlined />}
                  onClick={() => {
                    setActiveTab('track');
                    trackForm.setFieldsValue({ token: submitted.trackingToken });
                    handleTrack({ token: submitted.trackingToken });
                  }}
                  className="!bg-teal-600 !border-none hover:!bg-teal-500"
                >
                  {t('outsider:care.success.trackButton')}
                </Button>
                <Button
                  ghost
                  onClick={() => {
                    setSubmitted(null);
                    form.resetFields();
                  }}
                >
                  {t('outsider:care.success.anotherButton')}
                </Button>
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-white/10 bg-white/5 p-6 sm:p-8">
              <h2 className="text-2xl font-duotone-bold-extended text-white mb-1 uppercase">
                {t('outsider:care.submitSection.heading')}
              </h2>
              <p className="text-white/40 text-sm font-duotone-regular mb-6 uppercase">
                {t('outsider:care.submitSection.subheading')}
              </p>

              <Form
                form={form}
                layout="vertical"
                onFinish={handleSubmit}
                requiredMark={false}
                className="care-form"
              >
                {/* Contact info */}
                <p className="text-xs font-duotone-bold uppercase tracking-widest mb-3" style={{ color: '#00a8c4' }}>
                  {t('outsider:care.form.contactInfo')}
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4">
                  <Form.Item
                    name="guestName"
                    label={<span className="text-white/60 text-sm font-duotone-regular">{t('outsider:care.form.fullName')}</span>}
                    rules={[{ required: true, message: t('outsider:care.form.validation.nameRequired') }]}
                  >
                    <Input
                      prefix={<UserOutlined className="text-white/30" />}
                      placeholder={t('outsider:care.form.placeholders.fullName')}
                      className="!bg-white/5 !border-white/10 !text-white placeholder:!text-white/20 hover:!border-[#00a8c4]/50 focus:!border-[#00a8c4] font-duotone-regular"
                    />
                  </Form.Item>
                  <Form.Item
                    name="guestEmail"
                    label={<span className="text-white/60 text-sm font-duotone-regular">{t('outsider:care.form.email')}</span>}
                    rules={[{ type: 'email', message: t('outsider:care.form.validation.emailInvalid') }]}
                  >
                    <Input
                      prefix={<MailOutlined className="text-white/30" />}
                      placeholder={t('outsider:care.form.placeholders.email')}
                      className="!bg-white/5 !border-white/10 !text-white placeholder:!text-white/20 hover:!border-[#00a8c4]/50 focus:!border-[#00a8c4] font-duotone-regular"
                    />
                  </Form.Item>
                </div>
                <Form.Item
                  name="guestPhone"
                  label={<span className="text-white/60 text-sm font-duotone-regular">{t('outsider:care.form.phone')}</span>}
                  rules={[{ required: true, message: t('outsider:care.form.validation.phoneRequired') }]}
                >
                  <Input
                    prefix={<PhoneOutlined className="text-white/30" />}
                    placeholder={t('outsider:care.form.placeholders.phone')}
                    className="!bg-white/5 !border-white/10 !text-white placeholder:!text-white/20 hover:!border-[#00a8c4]/50 focus:!border-[#00a8c4] font-duotone-regular"
                  />
                </Form.Item>

                <Divider className="!border-white/10 !my-5" />

                {/* Equipment info */}
                <p className="text-xs font-duotone-bold text-white uppercase tracking-widest mb-3">
                  {t('outsider:care.form.equipmentDetails')}
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4">
                  <Form.Item
                    name="equipmentType"
                    label={<span className="text-white/60 text-sm font-duotone-regular">{t('outsider:care.form.equipmentType')}</span>}
                    rules={[{ required: true, message: t('outsider:care.form.validation.equipmentTypeRequired') }]}
                  >
                    <Select
                      placeholder="Select type..."
                      options={EQUIPMENT_TYPES}
                      className="font-duotone-regular"
                    />
                  </Form.Item>
                  <Form.Item
                    name="itemName"
                    label={<span className="text-white/60 text-sm font-duotone-regular">{t('outsider:care.form.brandItem')}</span>}
                    rules={[{ required: true, message: t('outsider:care.form.validation.brandRequired') }]}
                  >
                    <Input
                      placeholder={t('outsider:care.form.placeholders.brandItem')}
                      className="!bg-white/5 !border-white/10 !text-white placeholder:!text-white/20 hover:!border-[#00a8c4]/50 focus:!border-[#00a8c4] font-duotone-regular"
                    />
                  </Form.Item>
                </div>

                <Form.Item
                  name="description"
                  label={<span className="text-white/60 text-sm font-duotone-regular">{t('outsider:care.form.issueDescription')}</span>}
                  rules={[{ required: true, message: t('outsider:care.form.validation.issueRequired') }]}
                >
                  <Input.TextArea
                    rows={4}
                    placeholder={t('outsider:care.form.placeholders.issueDescription')}
                    className="!bg-white/5 !border-white/10 !text-white placeholder:!text-white/20 hover:!border-[#00a8c4]/50 focus:!border-[#00a8c4] !resize-none font-duotone-regular"
                  />
                </Form.Item>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4">
                  <Form.Item
                    name="priority"
                    label={<span className="text-white/60 text-sm font-duotone-regular">{t('outsider:care.form.urgency')}</span>}
                    rules={[{ required: true, message: t('outsider:care.form.validation.urgencyRequired') }]}
                  >
                    <Select
                      placeholder={t('outsider:care.form.placeholders.urgency')}
                      className="font-duotone-regular"
                    >
                      {PRIORITY_OPTIONS.map((p) => (
                        <Select.Option key={p.value} value={p.value}>
                          <Tag color={p.color} className="mr-2 font-duotone-bold">{p.value.toUpperCase()}</Tag>
                          <span className="font-duotone-regular">{p.label}</span>
                        </Select.Option>
                      ))}
                    </Select>
                  </Form.Item>
                  <Form.Item
                    name="location"
                    label={<span className="text-white/60 text-sm font-duotone-regular">{t('outsider:care.form.currentLocation')}</span>}
                  >
                    <Input
                      placeholder={t('outsider:care.form.placeholders.currentLocation')}
                      className="!bg-white/5 !border-white/10 !text-white placeholder:!text-white/20 hover:!border-[#00a8c4]/50 focus:!border-[#00a8c4] font-duotone-regular"
                    />
                  </Form.Item>
                </div>

                <Button
                  type="primary"
                  htmlType="submit"
                  loading={submitting}
                  size="large"
                  block
                  className="!h-14 font-duotone-bold !text-lg !rounded-md shadow-lg transition-all duration-150 hover:scale-[1.02] active:scale-95"
                  style={{ background: '#4b4f54', color: '#00a8c4', border: '1px solid rgba(0,168,196,0.5)', boxShadow: '0 0 12px rgba(0,168,196,0.2)' }}
                >
                  {t('outsider:care.form.submitButton')}
                </Button>
              </Form>
            </div>
          )}
        </div>
      )}

      {/* ── Track repair ── */}
      {activeTab === 'track' && (
        <div className="max-w-2xl mx-auto px-4 sm:px-6 space-y-6">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-6 sm:p-8">
            <h2 className="text-2xl font-duotone-bold-extended text-white mb-1 uppercase">
              {t('outsider:care.track.heading')}
            </h2>
            <p className="text-white/40 text-sm font-duotone-regular mb-6 uppercase">
              Enter the tracking token you received when submitting your request.
            </p>

            <Form form={trackForm} onFinish={handleTrack} layout="vertical" requiredMark={false}>
              <Form.Item
                name="token"
                label={<span className="text-white/60 text-sm font-duotone-regular">{t('outsider:care.track.tokenLabel')}</span>}
                rules={[{ required: true, message: 'Please enter your tracking token' }]}
              >
                <Input
                  prefix={<SearchOutlined className="text-white/30" />}
                  placeholder={t('outsider:care.track.tokenPlaceholder')}
                  size="large"
                  className="!bg-white/5 !border-white/10 !text-white placeholder:!text-white/20 hover:!border-[#00a8c4]/50 focus:!border-[#00a8c4] font-mono"
                />
              </Form.Item>
              <Button
                type="primary"
                htmlType="submit"
                loading={tracking}
                size="large"
                block
                icon={<SearchOutlined />}
                className="!h-14 font-duotone-bold !text-lg !rounded-md shadow-lg transition-all duration-150 hover:scale-[1.02] active:scale-95"
                style={{ background: '#4b4f54', color: '#00a8c4', border: '1px solid rgba(0,168,196,0.5)', boxShadow: '0 0 12px rgba(0,168,196,0.2)' }}
              >
                {tracking ? t('outsider:care.track.loadingButton') : t('outsider:care.track.checkButton')}
              </Button>
            </Form>
          </div>

          {tracking && (
            <div className="text-center py-8">
              <Spin size="large" />
              <p className="text-white/40 mt-4 text-sm">{t('outsider:care.track.loadingText')}</p>
            </div>
          )}

          {trackError && !tracking && (
            <Alert
              type="error"
              showIcon
              message={t('outsider:care.track.notFound')}
              description={trackError}
              className="!bg-red-500/10 !border-red-500/20 !text-white [&_.ant-alert-message]:!text-white [&_.ant-alert-description]:!text-white/60"
            />
          )}

          {trackResult && !tracking && (
            <TrackingResult request={trackResult} statusConfig={STATUS_CONFIG} />
          )}
        </div>
      )}

      <GoogleReviewsStrip />

      {/* Centered White Logo at Bottom */}
      <div className="w-full flex justify-center items-center" style={{ margin: '48px 0 24px 0' }}>
        <img
          src={dpsLogo}
          alt="Duotone Pro Center Urla White Logo"
          style={{ width: '100%', maxWidth: '900px', height: 'auto', display: 'block', margin: '0 auto', padding: '8px 0' }}
        />
      </div>
    </div>
  );
};

export default CareLandingPage;
