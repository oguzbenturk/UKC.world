import { useEffect } from 'react';
import PropTypes from 'prop-types';
import { Avatar, Form, Input, Modal, Rate, Space, Switch, Typography } from 'antd';
import { useSubmitRating } from '../hooks/useRatings';

const { Paragraph, Text } = Typography;

export const RateInstructorModal = ({ open = false, booking = null, onClose = undefined }) => {
  const [form] = Form.useForm();
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
    } else {
      form.resetFields();
    }
  }, [shouldShowModal, form]);

  const instructorName = booking?.instructor?.name ?? 'Instructor';
  const serviceName = booking?.service?.name ?? 'Lesson';

  const handleSubmit = async () => {
    if (!booking) {
      return;
    }

    try {
      const values = await form.validateFields();
      await mutateAsync({
        bookingId: booking.bookingId,
        rating: values.rating,
        feedbackText: values.feedbackText || undefined,
        isAnonymous: values.isAnonymous,
        serviceType: booking.service?.type ?? 'lesson'
      });
    } catch {
      // Antd already surfaces form validation errors; swallow mutation errors to keep modal open
    }
  };

  return (
    <Modal
      open={shouldShowModal}
      title="Rate your experience"
      destroyOnHidden
      forceRender
      okText="Submit rating"
      okButtonProps={{ loading: isPending, disabled: isPending }}
      cancelButtonProps={{ disabled: isPending }}
      onCancel={() => onClose?.(false)}
      onOk={handleSubmit}
    >
      <Space direction="vertical" size="large" className="w-full">
        {booking ? (
          <>
            <Space align="center" size="middle" className="w-full">
              <Avatar size={48} src={booking.instructor?.avatar}>
                {(instructorName || 'I').slice(0, 1).toUpperCase()}
              </Avatar>
              <div>
                <Paragraph style={{ marginBottom: 0, fontWeight: 600 }}>{instructorName}</Paragraph>
                <Text type="secondary">{serviceName} • {booking.date ?? 'Recent lesson'}</Text>
              </div>
            </Space>

            <Form layout="vertical" form={form} requiredMark={false}>
              <Form.Item
                label="How was your session?"
                name="rating"
                rules={[{ required: true, message: 'Please pick a rating between 1 and 5' }]}
              >
                <Rate allowClear={false} />
              </Form.Item>

              <Form.Item label="Share feedback" name="feedbackText">
                <Input.TextArea rows={4} maxLength={2000} placeholder="Tell us what went well or what could improve" />
              </Form.Item>

              <Form.Item
                label="Submit anonymously"
                name="isAnonymous"
                valuePropName="checked"
                extra="Your rating will still help the team improve, but your name stays hidden from instructors."
              >
                <Switch />
              </Form.Item>
            </Form>
          </>
        ) : (
          <>
            <Paragraph style={{ marginBottom: 0 }}>We couldn&apos;t find details for this lesson.</Paragraph>
            <Form form={form} style={{ display: 'none' }} />
          </>
        )}
      </Space>
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
