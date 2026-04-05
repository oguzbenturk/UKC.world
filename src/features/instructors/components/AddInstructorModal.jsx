import { useState, useEffect, useCallback } from 'react';
import { Form, Input, Button, Modal, DatePicker, Upload, Select, Steps, Switch, Tag, Radio, InputNumber } from 'antd';
import { message } from '@/shared/utils/antdStatic';
import {
  UserOutlined, MailOutlined, PhoneOutlined,
  LockOutlined, CalendarOutlined, EnvironmentOutlined,
  CameraOutlined, SaveOutlined,
  BookOutlined, CheckOutlined, ArrowRightOutlined, ArrowLeftOutlined,
  DollarOutlined, PercentageOutlined, SafetyCertificateOutlined, TrophyOutlined,
} from '@ant-design/icons';
import { useData } from '@/shared/hooks/useData';
import { useCurrency } from '@/shared/contexts/CurrencyContext';
import { useInstructorRoleId } from '@/shared/hooks/useInstructorRoleId';
import apiClient from '@/shared/services/apiClient';

const { Option } = Select;

// ── Constants ─────────────────────────────────────────────────────────────────
const DISCIPLINES = [
  { key: 'kite',      label: 'Kitesurfing', emoji: '🪁', color: '#3B82F6', description: 'Kite lessons & coaching' },
  { key: 'wing',      label: 'Wing Foil', emoji: '🦅', color: '#8B5CF6', description: 'Wing foil & wing surf' },
  { key: 'kite_foil', label: 'Kite Foil',   emoji: '🏄', color: '#06B6D4', description: 'Kite foil racing & training' },
  { key: 'efoil',     label: 'E-Foil',      emoji: '⚡', color: '#F59E0B', description: 'Electric foil board' },
  { key: 'premium',   label: 'Premium',     emoji: '⭐', color: '#EF4444', description: 'Premium / VIP sessions' },
];
const LESSON_CATS = [
  { key: 'private',      label: 'Private',      color: 'blue' },
  { key: 'semi-private', label: 'Semi-Private',  color: 'purple' },
  { key: 'group',        label: 'Group',         color: 'green' },
  { key: 'supervision',  label: 'Supervision',   color: 'orange' },
];
const LEVELS = [
  { key: 'beginner',     label: 'Beginner',     icon: '🟢' },
  { key: 'intermediate', label: 'Intermediate',  icon: '🟡' },
  { key: 'advanced',     label: 'Advanced',      icon: '🔴' },
];
const AVAILABLE_CURRENCIES = [
  { value: 'EUR', label: '🇪🇺 Euro (EUR)' },
  { value: 'USD', label: '🇺🇸 US Dollar (USD)' },
  { value: 'TRY', label: '🇹🇷 Turkish Lira (TL)' },
];

const STEP_ITEMS = [
  { title: 'Personal Info', icon: <UserOutlined /> },
  { title: 'Skills',        icon: <BookOutlined /> },
  { title: 'Commission',    icon: <DollarOutlined /> },
  { title: 'Location',      icon: <EnvironmentOutlined /> },
];

// ── Helper components ─────────────────────────────────────────────────────────
const Label = ({ children, required }) => (
  <span className="text-xs font-medium text-slate-600">
    {children} {required && <span className="text-red-400">*</span>}
  </span>
);

const SectionTitle = ({ icon, children }) => (
  <div className="flex items-center gap-2 mb-3">
    <div className="flex items-center justify-center w-6 h-6 rounded-lg bg-gradient-to-br from-sky-500 to-indigo-600 text-white flex-shrink-0 text-xs">
      {icon}
    </div>
    <h3 className="text-xs font-semibold text-slate-600 uppercase tracking-wide">{children}</h3>
  </div>
);

// ── Main component ────────────────────────────────────────────────────────────
const AddInstructorModal = ({ open, onClose, onSuccess }) => {
  const [form] = Form.useForm();
  const { addInstructor } = useData();
  const { businessCurrency } = useCurrency();
  const [loading, setLoading] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [skills, setSkills] = useState([]);
  const [avatarUrl, setAvatarUrl] = useState(null);
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState(null);

  // Commission state
  const [commissionType, setCommissionType] = useState('percentage');
  const [commissionValue, setCommissionValue] = useState(50);
  const [categoryRates, setCategoryRates] = useState({});
  const { instructorRoleId, loading: instructorRoleLoading, error: instructorRoleError } = useInstructorRoleId(open);

  const watchedFirst = Form.useWatch('first_name', form);
  const watchedLast  = Form.useWatch('last_name',  form);

  // Reset state when modal opens
  useEffect(() => {
    if (open) {
      form.resetFields();
      setCurrentStep(0);
      setSkills([]);
      setAvatarUrl(null);
      setAvatarPreviewUrl(null);
      setCommissionType('percentage');
      setCommissionValue(50);
      setCategoryRates({});
    }
  }, [open, form]);

  useEffect(() => {
    return () => { if (avatarPreviewUrl) URL.revokeObjectURL(avatarPreviewUrl); };
  }, [avatarPreviewUrl]);

  // ── Avatar upload ───────────────────────────────────────────────────────────
  const postAvatarUpload = useCallback(async (file, progressCb) => {
    const formData = new FormData();
    formData.append('avatar', file);
    return apiClient.post('/users/upload-avatar', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: ({ total, loaded }) => {
        if (total && progressCb) progressCb(Math.round((loaded / total) * 100));
      },
    });
  }, []);

  const handleAvatarUpload = (info) => {
    if (info.file.status === 'uploading' && info.file.originFileObj) {
      const url = URL.createObjectURL(info.file.originFileObj);
      if (avatarPreviewUrl) URL.revokeObjectURL(avatarPreviewUrl);
      setAvatarPreviewUrl(url);
    }
    if (info.file.status === 'error') {
      if (avatarPreviewUrl) { URL.revokeObjectURL(avatarPreviewUrl); setAvatarPreviewUrl(null); }
      message.error(`${info.file.name} upload failed.`);
    }
  };

  // ── Skills helpers (same UX as InstructorSkillsManager) ─────────────────────
  const getSkill = (key) => skills.find(s => s.discipline_tag === key);

  const toggleDiscipline = (key) => {
    setSkills(prev =>
      prev.some(s => s.discipline_tag === key)
        ? prev.filter(s => s.discipline_tag !== key)
        : [...prev, { discipline_tag: key, lesson_categories: ['private', 'semi-private', 'group', 'supervision'], max_level: 'advanced' }]
    );
  };

  const updateCategories = (key, categories) => {
    if (categories.length === 0) { message.warning('At least one lesson type must be selected'); return; }
    setSkills(prev => prev.map(s => s.discipline_tag === key ? { ...s, lesson_categories: categories } : s));
  };

  const updateMaxLevel = (key, level) => {
    setSkills(prev => prev.map(s => s.discipline_tag === key ? { ...s, max_level: level } : s));
  };

  // ── Step navigation ─────────────────────────────────────────────────────────
  const stepFields = [
    ['first_name', 'last_name', 'email', 'password', 'confirm_password'],
    [], // skills — no antd form fields
    [], // commission — managed in state
    [], // location — optional
  ];

  const goNext = async () => {
    try {
      if (stepFields[currentStep].length > 0) {
        await form.validateFields(stepFields[currentStep]);
      }
      setCurrentStep(s => Math.min(s + 1, STEP_ITEMS.length - 1));
    } catch { /* validation messages shown automatically */ }
  };

  const goBack = () => setCurrentStep(s => Math.max(s - 1, 0));

  // ── Submit (only on last step) ──────────────────────────────────────────────
  const handleSubmit = async () => {
    if (instructorRoleLoading) {
      message.warning('Loading roles… please try again in a moment.');
      return;
    }
    if (!instructorRoleId) {
      message.error(
        instructorRoleError?.message || 'Could not resolve instructor role. Check Roles in settings or try again.'
      );
      return;
    }

    setLoading(true);
    try {
      const values = form.getFieldsValue(true);
      const payload = {
        ...values,
        date_of_birth: values.date_of_birth ? values.date_of_birth.format('YYYY-MM-DD') : null,
        profile_image_url: avatarUrl,
        name: `${values.first_name} ${values.last_name}`.trim(),
        role_id: instructorRoleId,
      };
      delete payload.confirm_password;

      const created = await addInstructor(payload);
      const instructorId = created?.id;

      if (instructorId) {
        // Save skills
        if (skills.length > 0) {
          try { await apiClient.put(`/instructors/${instructorId}/skills`, { skills }); }
          catch { message.warning('Profile saved, but skills could not be saved.'); }
        }
        // Save default commission
        try {
          await apiClient.put(`/instructor-commissions/instructors/${instructorId}/default-commission`, {
            commissionType,
            commissionValue,
          });
        } catch { message.warning('Profile saved, but commission could not be set.'); }
        // Save category rates
        const ratesToSave = Object.entries(categoryRates)
          .filter(([, r]) => r.enabled && r.rateValue > 0)
          .map(([cat, r]) => ({ lessonCategory: cat, rateType: r.rateType, rateValue: r.rateValue }));
        if (ratesToSave.length > 0) {
          try {
            await apiClient.put(`/instructor-commissions/instructors/${instructorId}/category-rates`, { rates: ratesToSave });
          } catch { message.warning('Profile saved, but category rates could not be set.'); }
        }
      }

      message.success('Instructor created successfully!');
      onSuccess?.();
      onClose();
    } catch (error) {
      message.error(`Failed to save: ${error.response?.data?.error || error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const displayAvatar = avatarPreviewUrl || avatarUrl;
  const initials = `${(watchedFirst || '')[0] || ''}${(watchedLast || '')[0] || ''}`.toUpperCase() || '?';
  const currencySymbol = { EUR: '€', USD: '$', TRY: '₺' }[businessCurrency] || '€';

  return (
    <Modal
      open={open}
      onCancel={onClose}
      title={null}
      footer={null}
      destroyOnHidden
      width={620}
      styles={{ body: { padding: 0 } }}
      centered
    >
      {/* ── Modal Header ─── */}
      <div className="px-6 pt-5 pb-3">
        <h2 className="text-lg font-bold text-slate-900">New Instructor</h2>
        <p className="text-xs text-slate-400 mt-0.5">Add a new team member in a few steps</p>
      </div>

      {/* ── Step Indicator ─── */}
      <div className="px-6 pb-4">
        <Steps
          current={currentStep}
          size="small"
          items={STEP_ITEMS.map((step, i) => ({
            title: <span className="text-[11px] font-medium">{step.title}</span>,
            icon: (
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs transition-all ${
                i < currentStep
                  ? 'bg-emerald-500 text-white'
                  : i === currentStep
                    ? 'bg-gradient-to-br from-sky-500 to-indigo-600 text-white shadow-md shadow-sky-200'
                    : 'bg-slate-100 text-slate-400'
              }`}>
                {i < currentStep ? <CheckOutlined style={{ fontSize: 10 }} /> : step.icon}
              </div>
            ),
          }))}
        />
      </div>

      {/* We use Form for field validation only — onFinish is NOT used to prevent accidental submit */}
      <Form form={form} layout="vertical" requiredMark={false} onFinish={(e) => e?.preventDefault?.()}>
        <div className="px-6 pb-2 max-h-[55vh] overflow-y-auto">

          {/* ═══ STEP 0 — Personal Information ═══ */}
          <div className={currentStep === 0 ? 'space-y-4' : 'hidden'}>
            {/* Avatar row */}
            <div className="flex items-center gap-4 pb-2">
              <Upload
                name="avatar"
                showUploadList={false}
                onChange={handleAvatarUpload}
                customRequest={async ({ file, onSuccess, onError, onProgress }) => {
                  try {
                    const res = await postAvatarUpload(file, (pct) => onProgress?.({ percent: pct }));
                    const bust = res.data?.cacheBust || Date.now();
                    const newUrl = res.data?.url ? `${res.data.url}?v=${bust}` : null;
                    if (newUrl) {
                      setAvatarUrl(newUrl);
                      form.setFieldsValue({ profile_image_url: newUrl });
                    }
                    onSuccess?.(res.data);
                  } catch (err) { onError?.(err); }
                }}
              >
                <div className="relative cursor-pointer flex-shrink-0">
                  <div className="w-14 h-14 rounded-xl overflow-hidden bg-gradient-to-br from-sky-100 to-indigo-100 border border-slate-200 shadow-sm">
                    {displayAvatar ? (
                      <img src={displayAvatar} alt="Profile" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <span className="text-lg font-bold text-sky-400">{initials}</span>
                      </div>
                    )}
                  </div>
                  <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-sky-500 hover:bg-sky-600 rounded-md flex items-center justify-center shadow transition-colors">
                    <CameraOutlined className="text-white" style={{ fontSize: 10 }} />
                  </div>
                </div>
              </Upload>
              <div>
                <Form.Item noStyle shouldUpdate={(prev, cur) => prev.first_name !== cur.first_name || prev.last_name !== cur.last_name}>
                  {({ getFieldValue }) => {
                    const name = `${getFieldValue('first_name') || ''} ${getFieldValue('last_name') || ''}`.trim();
                    return <p className="text-sm font-semibold text-slate-700">{name || 'New Instructor'}</p>;
                  }}
                </Form.Item>
                <p className="text-[11px] text-slate-400 mt-0.5">Click to upload photo</p>
              </div>
            </div>

            {/* Fields */}
            <div className="grid grid-cols-2 gap-x-3">
              <Form.Item name="first_name" label={<Label required>First Name</Label>} rules={[{ required: true, message: 'Required' }]}>
                <Input prefix={<UserOutlined className="text-slate-300" />} placeholder="Alex" />
              </Form.Item>
              <Form.Item name="last_name" label={<Label required>Last Name</Label>} rules={[{ required: true, message: 'Required' }]}>
                <Input placeholder="Johnson" />
              </Form.Item>
              <Form.Item name="email" label={<Label required>Email</Label>} rules={[{ required: true, type: 'email', message: 'Valid email required' }]} className="col-span-2">
                <Input prefix={<MailOutlined className="text-slate-300" />} placeholder="instructor@example.com" />
              </Form.Item>
              <Form.Item name="phone" label={<Label>Phone</Label>}>
                <Input prefix={<PhoneOutlined className="text-slate-300" />} placeholder="+1 555 000 0000" />
              </Form.Item>
              <Form.Item name="date_of_birth" label={<Label>Date of Birth</Label>}>
                <DatePicker style={{ width: '100%' }} placeholder="Select date" suffixIcon={<CalendarOutlined className="text-slate-300" />} />
              </Form.Item>
              <Form.Item name="preferred_currency" label={<Label>Preferred Currency</Label>} initialValue="EUR" className="col-span-2">
                <Select>
                  {AVAILABLE_CURRENCIES.map(c => (
                    <Option key={c.value} value={c.value}>{c.label}</Option>
                  ))}
                </Select>
              </Form.Item>
            </div>

            {/* Freelance toggle */}
            <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-2.5">
              <div>
                <p className="text-xs font-semibold text-slate-700">Freelance Instructor</p>
                <p className="text-[11px] text-slate-400">Freelance instructors are not prioritized for lesson assignments</p>
              </div>
              <Form.Item name="is_freelance" valuePropName="checked" initialValue={false} noStyle>
                <Switch />
              </Form.Item>
            </div>

            {/* Password */}
            <div className="border-t border-slate-100 pt-3">
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <LockOutlined className="text-xs" /> Account Password
              </p>
              <div className="grid grid-cols-2 gap-x-3">
                <Form.Item
                  name="password"
                  label={<Label required>Password</Label>}
                  rules={[{ required: true, message: 'Password is required' }, { min: 8, message: 'Min. 8 characters' }]}
                >
                  <Input.Password prefix={<LockOutlined className="text-slate-300" />} placeholder="Min. 8 characters" />
                </Form.Item>
                <Form.Item
                  name="confirm_password"
                  label={<Label required>Confirm Password</Label>}
                  dependencies={['password']}
                  rules={[
                    { required: true, message: 'Please confirm password' },
                    ({ getFieldValue }) => ({
                      validator(_, value) {
                        if (!value || getFieldValue('password') === value) return Promise.resolve();
                        return Promise.reject(new Error('Passwords do not match'));
                      },
                    }),
                  ]}
                >
                  <Input.Password prefix={<LockOutlined className="text-slate-300" />} placeholder="Repeat password" />
                </Form.Item>
              </div>
            </div>
          </div>

          {/* ═══ STEP 1 — Teaching Skills (same UX as InstructorSkillsManager) ═══ */}
          <div className={currentStep === 1 ? '' : 'hidden'}>
            <SectionTitle icon={<BookOutlined />}>Teaching Skills</SectionTitle>
            <p className="text-xs text-slate-400 -mt-1 mb-3">Toggle disciplines, then pick lesson types and max level</p>
            <div className="space-y-2.5">
              {DISCIPLINES.map((disc) => {
                const enabled = skills.some(s => s.discipline_tag === disc.key);
                const skill = getSkill(disc.key);
                return (
                  <div
                    key={disc.key}
                    className={`rounded-xl border-2 transition-all duration-200 overflow-hidden ${
                      enabled ? 'border-blue-200 bg-white shadow-sm' : 'border-gray-100 bg-gray-50/50'
                    }`}
                  >
                    {/* Header with switch */}
                    <div className="flex items-center justify-between px-4 py-2.5">
                      <div className="flex items-center gap-3">
                        <span className="text-lg">{disc.emoji}</span>
                        <div>
                          <div className="text-sm font-semibold text-gray-800">{disc.label}</div>
                          <div className="text-[11px] text-gray-400">{disc.description}</div>
                        </div>
                      </div>
                      <Switch
                        checked={enabled}
                        onChange={() => toggleDiscipline(disc.key)}
                        style={{ backgroundColor: enabled ? disc.color : undefined }}
                      />
                    </div>

                    {/* Expanded: lesson types + level */}
                    {enabled && skill && (
                      <div className="px-4 pb-3 pt-1 border-t border-gray-100 space-y-3">
                        {/* Lesson categories as clickable tags */}
                        <div>
                          <p className="text-xs text-gray-500 font-medium mb-1.5 flex items-center gap-1">
                            <SafetyCertificateOutlined className="text-[10px]" /> Lesson Types
                          </p>
                          <div className="flex flex-wrap gap-1.5">
                            {LESSON_CATS.map((cat) => {
                              const active = skill.lesson_categories.includes(cat.key);
                              return (
                                <Tag
                                  key={cat.key}
                                  color={active ? cat.color : undefined}
                                  className={`cursor-pointer select-none rounded-full px-3 py-0.5 text-xs transition-all ${
                                    active ? 'opacity-100' : 'opacity-40 bg-gray-100 text-gray-400 border-gray-200 hover:opacity-70'
                                  }`}
                                  onClick={() => {
                                    const next = active
                                      ? skill.lesson_categories.filter(c => c !== cat.key)
                                      : [...skill.lesson_categories, cat.key];
                                    updateCategories(disc.key, next);
                                  }}
                                >
                                  {active && <CheckOutlined className="mr-1 text-[10px]" />}
                                  {cat.label}
                                </Tag>
                              );
                            })}
                          </div>
                        </div>

                        {/* Max level buttons */}
                        <div>
                          <p className="text-xs text-gray-500 font-medium mb-1.5 flex items-center gap-1">
                            <TrophyOutlined className="text-[10px]" /> Maximum Teaching Level
                          </p>
                          <div className="flex gap-2">
                            {LEVELS.map((lvl) => {
                              const active = skill.max_level === lvl.key;
                              return (
                                <button
                                  key={lvl.key}
                                  type="button"
                                  onClick={() => updateMaxLevel(disc.key, lvl.key)}
                                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border-2 transition-all ${
                                    active
                                      ? 'border-blue-400 bg-blue-50 text-blue-700 shadow-sm'
                                      : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300'
                                  }`}
                                >
                                  <span>{lvl.icon}</span>
                                  {lvl.label}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* ═══ STEP 2 — Default Commission ═══ */}
          <div className={currentStep === 2 ? 'space-y-4' : 'hidden'}>
            <SectionTitle icon={<DollarOutlined />}>Default Commission</SectionTitle>
            <p className="text-xs text-slate-400 -mt-1 mb-3">
              Set the default commission rate for this instructor. You can fine-tune per-category or per-service later.
            </p>

            <div className="rounded-xl border-2 border-slate-200 bg-white p-4 space-y-4">
              {/* Commission Type Selector */}
              <div>
                <p className="text-xs font-medium text-slate-600 mb-2">Commission Type</p>
                <Radio.Group
                  value={commissionType}
                  onChange={(e) => { setCommissionType(e.target.value); setCommissionValue(e.target.value === 'percentage' ? 50 : 20); }}
                  className="w-full"
                >
                  <div className="grid grid-cols-2 gap-3">
                    <Radio.Button value="percentage" className="h-auto p-0 text-center overflow-hidden rounded-lg">
                      <div className={`px-4 py-3 rounded-lg border-2 transition-all ${commissionType === 'percentage' ? 'border-sky-400 bg-sky-50' : 'border-transparent'}`}>
                        <PercentageOutlined className="text-lg text-sky-500 block mb-1" />
                        <div className="text-xs font-semibold text-slate-700">Percentage</div>
                        <div className="text-[10px] text-slate-400">% of booking price</div>
                      </div>
                    </Radio.Button>
                    <Radio.Button value="fixed" className="h-auto p-0 text-center overflow-hidden rounded-lg">
                      <div className={`px-4 py-3 rounded-lg border-2 transition-all ${commissionType === 'fixed' ? 'border-sky-400 bg-sky-50' : 'border-transparent'}`}>
                        <DollarOutlined className="text-lg text-emerald-500 block mb-1" />
                        <div className="text-xs font-semibold text-slate-700">Fixed Rate</div>
                        <div className="text-[10px] text-slate-400">{currencySymbol} per hour</div>
                      </div>
                    </Radio.Button>
                  </div>
                </Radio.Group>
              </div>

              {/* Commission Value */}
              <div>
                <p className="text-xs font-medium text-slate-600 mb-2">
                  {commissionType === 'percentage' ? 'Commission Percentage' : 'Hourly Rate'}
                </p>
                <InputNumber
                  value={commissionValue}
                  onChange={(v) => setCommissionValue(v ?? 0)}
                  min={0}
                  max={commissionType === 'percentage' ? 100 : undefined}
                  step={commissionType === 'percentage' ? 5 : 1}
                  className="w-full"
                  size="large"
                  prefix={commissionType === 'fixed' ? currencySymbol : undefined}
                  suffix={commissionType === 'percentage' ? '%' : '/hr'}
                />
                {commissionType === 'percentage' && (
                  <div className="flex gap-1.5 mt-2">
                    {[30, 40, 50, 60, 70].map(p => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => setCommissionValue(p)}
                        className={`px-2.5 py-1 rounded-md text-xs font-medium border transition-all ${
                          commissionValue === p
                            ? 'border-sky-400 bg-sky-50 text-sky-700'
                            : 'border-slate-200 text-slate-500 hover:border-slate-300'
                        }`}
                      >
                        {p}%
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Preview */}
              <div className="bg-slate-50 rounded-lg p-3 text-xs text-slate-500">
                <span className="font-medium text-slate-700">Preview: </span>
                {commissionType === 'percentage'
                  ? `Instructor earns ${commissionValue}% of each booking's price`
                  : `Instructor earns ${currencySymbol}${commissionValue} per hour taught`
                }
              </div>
            </div>

            {/* ── Category Rate Overrides ── */}
            <div className="rounded-xl border-2 border-slate-200 bg-white overflow-hidden">
              <div className="px-4 py-3 bg-gradient-to-r from-slate-50 to-white border-b border-slate-100">
                <h4 className="text-xs font-semibold text-slate-700">Category Rate Overrides</h4>
                <p className="text-[11px] text-slate-400 mt-0.5">Optionally set different rates per lesson type</p>
              </div>
              <div className="divide-y divide-slate-100">
                {LESSON_CATS.map((cat) => {
                  const rate = categoryRates[cat.key] || { enabled: false, rateType: commissionType, rateValue: commissionValue };
                  return (
                    <div key={cat.key} className="px-4 py-2.5 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2 min-w-0">
                        <Switch
                          size="small"
                          checked={rate.enabled}
                          onChange={(checked) => setCategoryRates(prev => ({
                            ...prev,
                            [cat.key]: { ...rate, enabled: checked, rateType: rate.rateType || commissionType, rateValue: rate.rateValue ?? commissionValue },
                          }))}
                        />
                        <Tag color={rate.enabled ? cat.color : undefined} bordered={false} className={`rounded-full capitalize m-0 text-xs ${!rate.enabled ? 'opacity-40' : ''}`}>
                          {cat.label}
                        </Tag>
                      </div>
                      {rate.enabled && (
                        <div className="flex items-center gap-2">
                          <Select
                            value={rate.rateType}
                            onChange={(v) => setCategoryRates(prev => ({ ...prev, [cat.key]: { ...rate, rateType: v } }))}
                            size="small"
                            className="w-[110px]"
                            popupMatchSelectWidth={false}
                          >
                            <Option value="percentage"><PercentageOutlined className="mr-1" />Percent</Option>
                            <Option value="fixed"><DollarOutlined className="mr-1" />Fixed /h</Option>
                          </Select>
                          <InputNumber
                            value={rate.rateValue}
                            onChange={(v) => setCategoryRates(prev => ({ ...prev, [cat.key]: { ...rate, rateValue: v ?? 0 } }))}
                            min={0}
                            max={rate.rateType === 'percentage' ? 100 : undefined}
                            size="small"
                            className="w-20"
                            suffix={rate.rateType === 'percentage' ? '%' : currencySymbol}
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              <div className="px-4 py-2 bg-slate-50/70 border-t border-slate-100">
                <p className="text-[10px] text-slate-400">
                  Priority: Service-specific → <strong>Category rate</strong> → Default commission
                </p>
              </div>
            </div>
          </div>

          {/* ═══ STEP 3 — Location & Settings ═══ */}
          <div className={currentStep === 3 ? 'space-y-4' : 'hidden'}>
            <div>
              <SectionTitle icon={<EnvironmentOutlined />}>Location</SectionTitle>
              <Form.Item name="address" label={<Label>Street Address</Label>} className="mb-2">
                <Input.TextArea rows={2} placeholder="123 Main Street, Apt 4B" className="resize-none" />
              </Form.Item>
              <div className="grid grid-cols-3 gap-x-3">
                <Form.Item name="city" label={<Label>City</Label>}>
                  <Input placeholder="Barcelona" />
                </Form.Item>
                <Form.Item name="postal_code" label={<Label>Postal Code</Label>}>
                  <Input placeholder="08001" />
                </Form.Item>
                <Form.Item name="country" label={<Label>Country</Label>}>
                  <Input placeholder="Spain" />
                </Form.Item>
              </div>
            </div>


          </div>
        </div>

        {/* ── Footer Actions ─── */}
        <div className="flex items-center justify-between px-6 py-3 border-t border-slate-100 bg-slate-50/50 rounded-b-lg">
          <div className="flex items-center gap-2">
            {currentStep > 0 && (
              <Button type="button" onClick={goBack} icon={<ArrowLeftOutlined />} size="small">
                Back
              </Button>
            )}
            <span className="text-[11px] text-slate-400 ml-1">
              Step {currentStep + 1} of {STEP_ITEMS.length}
            </span>
          </div>
          {currentStep < STEP_ITEMS.length - 1 ? (
            <Button
              type="primary"
              onClick={goNext}
              className="font-semibold px-5"
              style={{ background: 'linear-gradient(135deg, #0ea5e9 0%, #4f46e5 100%)', border: 'none' }}
            >
              Next <ArrowRightOutlined />
            </Button>
          ) : (
            <Button
              type="primary"
              onClick={handleSubmit}
              loading={loading || instructorRoleLoading}
              disabled={!instructorRoleLoading && !instructorRoleId}
              icon={<SaveOutlined />}
              className="font-semibold px-5"
              style={{ background: 'linear-gradient(135deg, #0ea5e9 0%, #4f46e5 100%)', border: 'none' }}
            >
              Create Instructor
            </Button>
          )}
        </div>
      </Form>
    </Modal>
  );
};

export default AddInstructorModal;
