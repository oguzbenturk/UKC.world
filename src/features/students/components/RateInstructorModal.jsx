import { useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import { Avatar, Form, Input, Modal, Rate, Space, Switch, Typography, Card, Divider, Tag } from 'antd';
import { StarFilled, HeartFilled, SmileOutlined, MehOutlined, FrownOutlined, CheckCircleFilled } from '@ant-design/icons';
import { useSubmitRating } from '../hooks/useRatings';

const { Paragraph, Text, Title } = Typography;

// Custom rating icons with emoji faces
const ratingDescriptions = {
  1: { label: 'Poor', emoji: '😞', color: '#f5222d' },
  2: { label: 'Fair', emoji: '😕', color: '#fa8c16' },
  3: { label: 'Good', emoji: '😊', color: '#fadb14' },
  4: { label: 'Great', emoji: '😄', color: '#52c41a' },
  5: { label: 'Amazing!', emoji: '🤩', color: '#1677ff' }
};

export const RateInstructorModal = ({ open = false, booking = null, onClose = undefined }) => {
  const [form] = Form.useForm();
  const [currentRating, setCurrentRating] = useState(5);
  const { mutateAsync, isPending } = useSubmitRating({
    onSuccess: () => {
      form.resetFields();
      if (onClose) {
        onClose(true);
      }
    }
  });

  const shouldShowModal = open && Boolean(booking);

  useEffect(() => {
    if (shouldShowModal) {
      form.setFieldsValue({ rating: 5, isAnonymous: false, feedbackText: '' });
      setCurrentRating(5);
    } else {
      form.resetFields();
      setCurrentRating(5);
    }
  }, [shouldShowModal, form]);

  const instructorName = booking?.instructor?.name ?? 'Instructor';
  const serviceName = booking?.service?.name ?? 'Lesson';
  const ratingInfo = ratingDescriptions[currentRating] || ratingDescriptions[5];

  const handleSubmit = async () => {
    if (!booking) {
      return;
    }

    try {
      const values = await form.validateFields();
      const ratingValue = values.rating ?? currentRating ?? 5;
      
      await mutateAsync({
        bookingId: booking.bookingId,
        rating: Number(ratingValue),
        feedbackText: values.feedbackText || undefined,
        isAnonymous: Boolean(values.isAnonymous),
        serviceType: booking.service?.type ?? 'lesson'
      });
    } catch {
      // Antd already surfaces form validation errors; swallow mutation errors to keep modal open
    }
  };

  const handleRatingChange = (value) => {
    setCurrentRating(value);
    form.setFieldValue('rating', value);
  };

  return (
    <Modal
      open={shouldShowModal}
      title={null}
      destroyOnHidden
      footer={null}
      onCancel={() => onClose?.(false)}
      width={480}
      centered
      className="rating-modal"
      styles={{
        body: { padding: 0 }
      }}
    >
      {booking ? (
        <div className="overflow-hidden rounded-lg">
          {/* Header with gradient */}
          <div className="bg-gradient-to-br from-sky-500 via-sky-600 to-indigo-600 px-6 py-8 text-center text-white">
            <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full border-4 border-white/30 bg-white/20 shadow-lg backdrop-blur">
              <Avatar size={64} src={booking.instructor?.avatar} className="ring-2 ring-white/50">
                {(instructorName || 'I').slice(0, 1).toUpperCase()}
              </Avatar>
            </div>
            <Title level={4} className="!mb-1 !text-white">
              How was your lesson?
            </Title>
            <Text className="text-white/80">
              with <span className="font-semibold">{instructorName}</span>
            </Text>
            <div className="mt-2">
              <Tag className="border-white/30 bg-white/20 text-white">
                {serviceName} • {booking.date ?? 'Recent lesson'}
              </Tag>
            </div>
          </div>

          {/* Rating Section */}
          <div className="px-6 py-6">
            <Form layout="vertical" form={form} requiredMark={false} initialValues={{ rating: 5, isAnonymous: false, feedbackText: '' }}>
              {/* Star Rating with Emoji Feedback */}
              <div className="mb-6 text-center">
                <Form.Item
                  name="rating"
                  rules={[{ required: true, message: 'Please pick a rating between 1 and 5' }]}
                  className="!mb-3"
                >
                  <Rate 
                    allowClear={false} 
                    onChange={handleRatingChange}
                    className="text-3xl"
                    character={<StarFilled />}
                    style={{ fontSize: 36 }}
                  />
                </Form.Item>
                
                {/* Emoji feedback indicator */}
                <div 
                  className="inline-flex items-center gap-2 rounded-full px-4 py-2 transition-all duration-300"
                  style={{ backgroundColor: `${ratingInfo.color}15` }}
                >
                  <span className="text-2xl">{ratingInfo.emoji}</span>
                  <Text strong style={{ color: ratingInfo.color }}>
                    {ratingInfo.label}
                  </Text>
                </div>
              </div>

              <Divider className="my-4" />

              {/* Feedback Text - Required if rating < 5 */}
              <Form.Item 
                label={
                  <Text className="text-slate-600">
                    {currentRating < 5 ? (
                      <>How can we earn 5 stars next time? <Text type="danger">*</Text></>
                    ) : (
                      <>Share your experience <Text type="secondary">(optional)</Text></>
                    )}
                  </Text>
                } 
                name="feedbackText"
                rules={[
                  {
                    required: currentRating < 5,
                    message: 'Please let us know how we can improve'
                  }
                ]}
              >
                <Input.TextArea 
                  rows={4} 
                  maxLength={2000} 
                  showCount
                  placeholder={currentRating < 5 
                    ? "We'd love to do better! What could we improve for next time?" 
                    : "What did you enjoy? Any suggestions for improvement?"
                  }
                  className="rounded-xl"
                />
              </Form.Item>

              {/* Improvement hint for < 5 stars */}
              {currentRating < 5 && (
                <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-center">
                  <Text className="text-amber-700">
                    💡 Your feedback helps our instructors improve!
                  </Text>
                </div>
              )}

              {/* Anonymous Switch */}
              <Card 
                size="small" 
                className="mb-4 rounded-xl border-slate-200 bg-slate-50"
                styles={{ body: { padding: '12px 16px' } }}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <Text strong className="text-slate-700">Submit anonymously</Text>
                    <Paragraph className="!mb-0 text-xs text-slate-500">
                      Your rating counts, but your name stays private
                    </Paragraph>
                  </div>
                  <Form.Item name="isAnonymous" valuePropName="checked" className="!mb-0">
                    <Switch />
                  </Form.Item>
                </div>
              </Card>

              {/* Submit Button */}
              <button
                type="button"
                onClick={handleSubmit}
                disabled={isPending}
                className="w-full rounded-xl bg-gradient-to-r from-sky-500 to-indigo-600 px-6 py-3 font-semibold text-white shadow-lg transition-all duration-200 hover:from-sky-600 hover:to-indigo-700 hover:shadow-xl active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isPending ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                    Submitting...
                  </span>
                ) : (
                  <span className="flex items-center justify-center gap-2">
                    <HeartFilled />
                    Submit Rating
                  </span>
                )}
              </button>

              {/* Cancel link */}
              <button
                type="button"
                onClick={() => onClose?.(false)}
                disabled={isPending}
                className="mt-3 w-full rounded-lg px-4 py-2 text-sm text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 disabled:cursor-not-allowed"
              >
                Maybe later
              </button>
            </Form>
          </div>
        </div>
      ) : (
        <div className="p-6 text-center">
          <Paragraph style={{ marginBottom: 0 }}>We couldn&apos;t find details for this lesson.</Paragraph>
        </div>
      )}
    </Modal>
  );
};

RateInstructorModal.propTypes = {
  open: PropTypes.bool,
  booking: PropTypes.shape({
    bookingId: PropTypes.string.isRequired,
    date: PropTypes.string,
    instructor: PropTypes.shape({
      id: PropTypes.string,
      name: PropTypes.string,
      avatar: PropTypes.string
    }),
    service: PropTypes.shape({
      id: PropTypes.string,
      name: PropTypes.string,
      type: PropTypes.string
    })
  }),
  onClose: PropTypes.func
};

export default RateInstructorModal;
