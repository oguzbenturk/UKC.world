/**
 * GroupLessonRequestPage
 * 
 * Simple form for students who want a group lesson but don't have a partner.
 * They submit preferences, and management will match them with another student.
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Card,
  Typography,
  Button,
  Form,
  Select,
  DatePicker,
  Radio,
  Input,
  message,
  Alert,
  Avatar
} from 'antd';
import {
  UserGroupIcon,
  ArrowLeftIcon,
  SparklesIcon
} from '@heroicons/react/24/outline';
import {
  SendOutlined,
  HeartOutlined
} from '@ant-design/icons';
import { useQuery, useMutation } from '@tanstack/react-query';
import dayjs from 'dayjs';
import apiClient from '@/shared/services/apiClient';
import { createGroupLessonRequest } from '../services/groupLessonRequestService';
import { usePageSEO } from '@/shared/utils/seo';

const { Title, Text } = Typography;
const { TextArea } = Input;
const { RangePicker } = DatePicker;

const GroupLessonRequestPage = () => {
  usePageSEO({
    title: 'Request Group Lesson',
    description: 'Request to be matched with another student for a group lesson'
  });

  const navigate = useNavigate();
  const [form] = Form.useForm();
  const [submitted, setSubmitted] = useState(false);

  // Fetch lesson services
  const { data: services = [], isLoading: servicesLoading } = useQuery({
    queryKey: ['group-request', 'services'],
    queryFn: async () => {
      const res = await apiClient.get('/services', { params: { category: 'lesson' } });
      const data = Array.isArray(res.data) ? res.data : res.data?.services || [];
      return data.filter(s => s.status === 'active' || !s.status);
    },
    staleTime: 300_000,
  });

  const submitMutation = useMutation({
    mutationFn: (values) => {
      const dateRange = values.dateRange;
      return createGroupLessonRequest({
        serviceId: values.serviceId,
        preferredDateStart: dateRange[0].format('YYYY-MM-DD'),
        preferredDateEnd: dateRange[1] ? dateRange[1].format('YYYY-MM-DD') : null,
        preferredTimeOfDay: values.preferredTimeOfDay || 'any',
        preferredDurationHours: values.preferredDurationHours || 1,
        skillLevel: values.skillLevel || 'beginner',
        notes: values.notes || null,
      });
    },
    onSuccess: () => {
      setSubmitted(true);
      message.success('Request submitted! We\'ll match you with a partner soon.');
    },
    onError: (err) => {
      message.error(err.response?.data?.error || err.message || 'Failed to submit request');
    },
  });

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      submitMutation.mutate(values);
    } catch {
      message.warning('Please fill in all required fields');
    }
  };

  if (submitted) {
    return (
      <div className="max-w-lg mx-auto p-4 pt-12">
        <Card className="text-center">
          <div className="py-6">
            <div className="w-20 h-20 mx-auto bg-gradient-to-br from-green-100 to-emerald-100 rounded-full flex items-center justify-center mb-5">
              <HeartOutlined className="text-3xl text-emerald-500" />
            </div>
            <Title level={3} className="!mb-2">Request Submitted!</Title>
            <Text type="secondary" className="block mb-6">
              We'll review your request and match you with a compatible partner.
              You'll be notified once a match is found.
            </Text>
            <div className="flex gap-3 justify-center">
              <Button onClick={() => navigate('/student/schedule?tab=group')}>
                View My Requests
              </Button>
              <Button type="primary" onClick={() => { setSubmitted(false); form.resetFields(); }}>
                Submit Another
              </Button>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto p-4">
      {/* Back */}
      <Button
        type="text"
        icon={<ArrowLeftIcon className="w-4 h-4" />}
        onClick={() => navigate('/student/schedule?tab=group')}
        className="mb-4"
      >
        Back to Group Lessons
      </Button>

      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Avatar
          size={48}
          className="bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center"
          icon={<UserGroupIcon className="w-6 h-6" />}
        />
        <div>
          <Title level={3} className="!mb-0">Request Group Lesson</Title>
          <Text type="secondary">Don't have a partner? We'll find one for you!</Text>
        </div>
      </div>

      <Alert
        type="info"
        showIcon
        icon={<SparklesIcon className="w-5 h-5 mt-0.5" />}
        message="How it works"
        description="Submit your lesson preferences and we'll match you with another student who has similar preferences. Once matched, you'll both be notified and can proceed with payment."
        className="mb-6 !rounded-xl"
      />

      <Card className="!rounded-2xl">
        <Form
          form={form}
          layout="vertical"
          requiredMark="optional"
          size="large"
        >
          <Form.Item
            name="serviceId"
            label="What would you like to learn?"
            rules={[{ required: true, message: 'Please select a lesson type' }]}
          >
            <Select
              placeholder="Choose a lesson type"
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
            name="dateRange"
            label="When are you available?"
            rules={[{ required: true, message: 'Please select at least a start date' }]}
            extra="Select a range of dates you're flexible on, or pick a single day"
          >
            <RangePicker
              className="w-full"
              disabledDate={(d) => d && d.isBefore(dayjs(), 'day')}
              format="ddd, MMM D"
              placeholder={['From', 'To (optional)']}
              allowEmpty={[false, true]}
            />
          </Form.Item>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Form.Item
              name="preferredTimeOfDay"
              label="Preferred time"
              initialValue="any"
            >
              <Radio.Group className="w-full">
                <div className="grid grid-cols-2 gap-2">
                  <Radio.Button value="any" className="!text-center !rounded-lg">Any</Radio.Button>
                  <Radio.Button value="morning" className="!text-center !rounded-lg">Morning</Radio.Button>
                  <Radio.Button value="afternoon" className="!text-center !rounded-lg">Afternoon</Radio.Button>
                  <Radio.Button value="evening" className="!text-center !rounded-lg">Evening</Radio.Button>
                </div>
              </Radio.Group>
            </Form.Item>

            <Form.Item
              name="preferredDurationHours"
              label="Session duration"
              initialValue={1}
            >
              <Select
                options={[
                  { value: 0.5, label: '30 minutes' },
                  { value: 1, label: '1 hour' },
                  { value: 1.5, label: '1.5 hours' },
                  { value: 2, label: '2 hours' },
                  { value: 3, label: '3 hours' },
                ]}
              />
            </Form.Item>
          </div>

          <Form.Item
            name="skillLevel"
            label="Your skill level"
            initialValue="beginner"
            rules={[{ required: true }]}
          >
            <Radio.Group className="w-full">
              <div className="grid grid-cols-3 gap-2">
                <Radio.Button value="beginner" className="!text-center !rounded-lg">
                  🌱 Beginner
                </Radio.Button>
                <Radio.Button value="intermediate" className="!text-center !rounded-lg">
                  🏄 Intermediate
                </Radio.Button>
                <Radio.Button value="advanced" className="!text-center !rounded-lg">
                  🏆 Advanced
                </Radio.Button>
              </div>
            </Radio.Group>
          </Form.Item>

          <Form.Item
            name="notes"
            label="Anything else we should know? (optional)"
          >
            <TextArea
              placeholder="e.g., I'm flexible on dates, I prefer a specific instructor, etc."
              rows={3}
              maxLength={500}
            />
          </Form.Item>

          <Button
            type="primary"
            size="large"
            block
            loading={submitMutation.isPending}
            onClick={handleSubmit}
            icon={<SendOutlined />}
            className="!rounded-xl !font-bold !h-14"
          >
            Submit Request
          </Button>
        </Form>
      </Card>
    </div>
  );
};

export default GroupLessonRequestPage;
