/**
 * Group Booking Create Page
 *
 * Full-featured form for creating a new group lesson booking:
 * - Select a service (lesson type)
 * - Choose instructor, date, time
 * - Configure group settings (participants, payment model)
 * - Invite friends immediately after creation
 */

import { useState, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Card,
  Typography,
  Button,
  Space,
  Form,
  Input,
  InputNumber,
  Select,
  DatePicker,
  Radio,
  Alert,
  Avatar,
  Steps,
  message
} from 'antd';
import {
  UserGroupIcon,
  AcademicCapIcon,
  ArrowLeftIcon,
  CurrencyEuroIcon,
  SparklesIcon
} from '@heroicons/react/24/outline';
import {
  TeamOutlined,
  CheckCircleOutlined,
  RocketOutlined
} from '@ant-design/icons';
import { useQuery, useMutation } from '@tanstack/react-query';
import dayjs from 'dayjs';
import apiClient from '@/shared/services/apiClient';
import { createGroupBooking } from '../services/groupBookingService';
import { useAuth } from '@/shared/hooks/useAuth';
import { useCurrency } from '@/shared/contexts/CurrencyContext';
import { usePageSEO } from '@/shared/utils/seo';

const { Title, Text } = Typography;
const { TextArea } = Input;

const GroupBookingCreatePage = () => {
  usePageSEO({
    title: 'Create Group Lesson',
    description: 'Organize a group lesson and invite friends'
  });

  const navigate = useNavigate();
  const location = useLocation();
  const _user = useAuth();
  const { formatCurrency, userCurrency } = useCurrency();
  const [form] = Form.useForm();

  // Pre-fill from navigation state (e.g., coming from QuickBookingModal)
  const prefill = useMemo(() => location.state || {}, [location.state]);

  const [currentStep, setCurrentStep] = useState(0);
  const [creating, setCreating] = useState(false);

  // Fetch services (lesson types)
  const { data: services = [], isLoading: servicesLoading } = useQuery({
    queryKey: ['group-create', 'services'],
    queryFn: async () => {
      const res = await apiClient.get('/services', { params: { category: 'lesson' } });
      const data = Array.isArray(res.data) ? res.data : res.data?.services || [];
      return data.filter(s => s.status === 'active' || !s.status);
    },
    staleTime: 300_000,
  });

  // Fetch instructors
  const { data: instructors = [], isLoading: instructorsLoading } = useQuery({
    queryKey: ['group-create', 'instructors'],
    queryFn: async () => {
      const res = await apiClient.get('/instructors');
      return Array.isArray(res.data) ? res.data : res.data?.instructors || [];
    },
    staleTime: 300_000,
  });

  // Fetch packages for pricing reference
  const { data: packages = [] } = useQuery({
    queryKey: ['group-create', 'packages'],
    queryFn: async () => {
      const res = await apiClient.get('/services/packages');
      return Array.isArray(res.data) ? res.data : res.data?.packages || [];
    },
    staleTime: 300_000,
  });

  // Selected service details
  const selectedServiceId = Form.useWatch('serviceId', form);
  const selectedService = useMemo(
    () => services.find(s => s.id === selectedServiceId),
    [services, selectedServiceId]
  );

  // Auto-suggest price from service/package
  const suggestedPrice = useMemo(() => {
    if (prefill.packageData?.price) return prefill.packageData.price;
    if (selectedService?.base_price) return Number(selectedService.base_price);
    if (selectedService?.price) return Number(selectedService.price);
    // Find matching packages
    const matchingPkgs = packages.filter(p =>
      String(p.service_id) === String(selectedServiceId)
    );
    if (matchingPkgs.length > 0) {
      return Math.min(...matchingPkgs.map(p => Number(p.price || 0)).filter(p => p > 0));
    }
    return 0;
  }, [selectedService, selectedServiceId, packages, prefill]);

  const createMutation = useMutation({
    mutationFn: async (values) => {
      return createGroupBooking({
        serviceId: values.serviceId,
        instructorId: values.instructorId || null,
        title: values.title,
        description: values.description || null,
        maxParticipants: values.maxParticipants,
        minParticipants: values.minParticipants,
        pricePerPerson: values.pricePerPerson,
        currency: userCurrency || 'EUR',
        scheduledDate: values.date.format('YYYY-MM-DD'),
        startTime: values.startTime,
        endTime: values.endTime || null,
        durationHours: values.durationHours || 1,
        paymentModel: values.paymentModel,
        notes: values.notes || null,
        // Pass invitee emails if provided
        invitees: values.inviteEmails
          ? values.inviteEmails
              .split(/[\n,;]/)
              .map(e => e.trim())
              .filter(e => e && e.includes('@'))
              .map(email => ({ email }))
          : undefined,
      });
    },
    onSuccess: (data) => {
      message.success('Group lesson created! Now invite your friends.');
      navigate(`/student/group-bookings/${data.groupBooking.id}`);
    },
    onError: (err) => {
      message.error(err.response?.data?.error || err.message || 'Failed to create group lesson');
      setCreating(false);
    },
  });

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      setCreating(true);
      createMutation.mutate(values);
    } catch (err) {
      // Validation error — stay on current step
      if (err.errorFields) {
        message.warning('Please fill in all required fields');
      }
    }
  };

  const handleNext = async () => {
    try {
      // Validate current step fields
      if (currentStep === 0) {
        await form.validateFields(['serviceId', 'title', 'date', 'startTime', 'durationHours']);
      } else if (currentStep === 1) {
        await form.validateFields(['maxParticipants', 'minParticipants', 'pricePerPerson', 'paymentModel']);
      }
      setCurrentStep(prev => prev + 1);
    } catch {
      message.warning('Please fill in all required fields for this step');
    }
  };

  const timeOptions = useMemo(() => {
    const opts = [];
    for (let h = 7; h <= 20; h++) {
      for (let m = 0; m < 60; m += 30) {
        const time = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
        opts.push({ value: time, label: time });
      }
    }
    return opts;
  }, []);

  const steps = [
    {
      title: 'Lesson Details',
      icon: <AcademicCapIcon className="w-4 h-4" />,
      content: (
        <div className="space-y-4">
          <Form.Item
            name="title"
            label="Group Name"
            rules={[{ required: true, message: 'Give your group lesson a name' }]}
            initialValue={prefill.packageData?.name ? `${prefill.packageData.name} — Group` : ''}
          >
            <Input
              placeholder="e.g., Weekend Kite Session with Friends"
              size="large"
              maxLength={100}
            />
          </Form.Item>

          <Form.Item
            name="serviceId"
            label="Lesson Type"
            rules={[{ required: true, message: 'Select a lesson type' }]}
            initialValue={prefill.serviceId}
          >
            <Select
              placeholder="Choose a lesson type"
              size="large"
              loading={servicesLoading}
              showSearch
              optionFilterProp="label"
              options={services.map(s => ({
                value: s.id,
                label: s.name || s.title,
              }))}
            />
          </Form.Item>

          <Form.Item
            name="instructorId"
            label="Preferred Instructor (optional)"
          >
            <Select
              placeholder="Any instructor"
              size="large"
              loading={instructorsLoading}
              allowClear
              showSearch
              optionFilterProp="label"
              options={instructors.map(i => ({
                value: i.id,
                label: `${i.first_name || ''} ${i.last_name || ''}`.trim() || i.name || i.email,
              }))}
            />
          </Form.Item>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Form.Item
              name="date"
              label="Date"
              rules={[{ required: true, message: 'Pick a date' }]}
            >
              <DatePicker
                className="w-full"
                size="large"
                disabledDate={(d) => d && d.isBefore(dayjs(), 'day')}
                format="ddd, MMM D, YYYY"
              />
            </Form.Item>

            <Form.Item
              name="startTime"
              label="Start Time"
              rules={[{ required: true, message: 'Pick a start time' }]}
            >
              <Select
                placeholder="Select time"
                size="large"
                options={timeOptions}
              />
            </Form.Item>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Form.Item
              name="durationHours"
              label="Duration (hours)"
              rules={[{ required: true, message: 'Set duration' }]}
              initialValue={prefill.durationHours || 1}
            >
              <Select
                size="large"
                options={[
                  { value: 0.5, label: '30 minutes' },
                  { value: 1, label: '1 hour' },
                  { value: 1.5, label: '1.5 hours' },
                  { value: 2, label: '2 hours' },
                  { value: 3, label: '3 hours' },
                  { value: 4, label: '4 hours' },
                ]}
              />
            </Form.Item>

            <Form.Item
              name="endTime"
              label="End Time (optional)"
            >
              <Select
                placeholder="Auto-calculated"
                size="large"
                allowClear
                options={timeOptions}
              />
            </Form.Item>
          </div>

          <Form.Item name="description" label="Description (optional)">
            <TextArea
              placeholder="What will you be doing? Any special notes for participants..."
              rows={3}
              maxLength={500}
            />
          </Form.Item>
        </div>
      ),
    },
    {
      title: 'Group Settings',
      icon: <TeamOutlined />,
      content: (
        <div className="space-y-4">
          <Form.Item
            name="paymentModel"
            label="Payment Model"
            rules={[{ required: true, message: 'Choose a payment model' }]}
            initialValue="individual"
          >
            <Radio.Group size="large" className="w-full">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Radio.Button value="individual" className="!h-auto !py-3 !px-4 !rounded-xl !text-left">
                  <div>
                    <Text strong className="block">Everyone Pays</Text>
                    <Text type="secondary" className="text-xs">Each participant pays their own share</Text>
                  </div>
                </Radio.Button>
                <Radio.Button value="organizer_pays" className="!h-auto !py-3 !px-4 !rounded-xl !text-left">
                  <div>
                    <Text strong className="block">I Pay for All</Text>
                    <Text type="secondary" className="text-xs">You cover the cost for everyone</Text>
                  </div>
                </Radio.Button>
              </div>
            </Radio.Group>
          </Form.Item>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Form.Item
              name="maxParticipants"
              label="Max Participants"
              rules={[{ required: true, message: 'Set max participants' }]}
              initialValue={6}
            >
              <InputNumber
                min={2}
                max={30}
                size="large"
                className="w-full"
                placeholder="e.g., 6"
              />
            </Form.Item>

            <Form.Item
              name="minParticipants"
              label="Min Participants to Confirm"
              rules={[{ required: true, message: 'Set min participants' }]}
              initialValue={2}
            >
              <InputNumber
                min={2}
                max={30}
                size="large"
                className="w-full"
                placeholder="e.g., 2"
              />
            </Form.Item>
          </div>

          <Form.Item
            name="pricePerPerson"
            label="Price per Person"
            rules={[{ required: true, message: 'Set price per person' }]}
            initialValue={suggestedPrice}
            extra={suggestedPrice > 0 ? `Suggested: ${formatCurrency(suggestedPrice, userCurrency)}` : null}
          >
            <InputNumber
              min={0}
              step={5}
              size="large"
              className="w-full"
              placeholder="0.00"
              prefix={<CurrencyEuroIcon className="w-4 h-4 text-slate-400" />}
              formatter={(value) => `${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
              parser={(value) => value.replace(/,/g, '')}
            />
          </Form.Item>

          <Form.Item name="notes" label="Notes (optional)">
            <TextArea
              placeholder="Any special requirements or instructions..."
              rows={2}
              maxLength={500}
            />
          </Form.Item>
        </div>
      ),
    },
    {
      title: 'Invite Friends',
      icon: <CheckCircleOutlined />,
      content: (
        <div className="space-y-4">
          <Alert
            type="success"
            showIcon
            icon={<SparklesIcon className="w-5 h-5" />}
            message="Almost there!"
            description="Enter email addresses of friends you'd like to invite. They'll receive an invitation with a link to join. You can also invite more friends later from the group details page."
            className="mb-4"
          />

          <Form.Item
            name="inviteEmails"
            label="Friend's Email Addresses"
            rules={[
              { required: true, message: 'Invite at least one friend to create a group lesson' },
              {
                validator: (_, value) => {
                  if (!value) return Promise.reject();
                  const emails = value.split(/[\n,;]/).map(e => e.trim()).filter(e => e && e.includes('@'));
                  if (emails.length === 0) return Promise.reject(new Error('Enter at least one valid email address'));
                  return Promise.resolve();
                }
              }
            ]}
          >
            <TextArea
              placeholder="Enter email addresses — one per line or comma-separated&#10;&#10;e.g.,&#10;john@example.com&#10;jane@example.com"
              rows={5}
              maxLength={2000}
            />
          </Form.Item>

          <Alert
            type="warning"
            showIcon
            message="Don't have a friend to invite?"
            description={
              <span>
                Group lessons require at least 2 people.
                If you're alone, <a onClick={() => navigate('/student/group-bookings/request')} className="font-semibold underline cursor-pointer">submit a matching request</a> and we'll find you a partner!
              </span>
            }
          />
        </div>
      ),
    },
  ];

  return (
    <div className="max-w-3xl mx-auto p-4">
      {/* Back Button */}
      <Button
        type="text"
        icon={<ArrowLeftIcon className="w-4 h-4" />}
        onClick={() => navigate('/student/group-bookings')}
        className="mb-4"
      >
        Back to Group Lessons
      </Button>

      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Avatar
          size={48}
          className="bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center"
          icon={<UserGroupIcon className="w-6 h-6" />}
        />
        <div>
          <Title level={3} className="!mb-0">Create Group Lesson</Title>
          <Text type="secondary">Organize a lesson and invite friends to join</Text>
        </div>
      </div>

      {/* Steps indicator */}
      <Steps
        current={currentStep}
        size="small"
        className="mb-6"
        items={steps.map(s => ({
          title: s.title,
          icon: s.icon,
        }))}
      />

      {/* Form */}
      <Card className="mb-6">
        <Form
          form={form}
          layout="vertical"
          requiredMark="optional"
          size="large"
        >
          {steps[currentStep].content}
        </Form>
      </Card>

      {/* Navigation Buttons */}
      <div className="flex justify-between">
        <Button
          size="large"
          onClick={() => setCurrentStep(prev => prev - 1)}
          disabled={currentStep === 0}
          className="!rounded-xl"
        >
          Previous
        </Button>

        <Space>
          {currentStep < steps.length - 1 && (
            <Button
              type="primary"
              size="large"
              onClick={handleNext}
              className="!rounded-xl !font-semibold"
            >
              Next
            </Button>
          )}
          {currentStep === steps.length - 1 && (
            <Button
              type="primary"
              size="large"
              loading={creating || createMutation.isPending}
              onClick={handleSubmit}
              icon={<RocketOutlined />}
              className="!rounded-xl !font-bold"
            >
              Create Group & Send Invites
            </Button>
          )}
        </Space>
      </div>
    </div>
  );
};

export default GroupBookingCreatePage;
