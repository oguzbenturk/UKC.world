import { useState, useEffect } from 'react';
import { Modal, Form, Input, Select, DatePicker, TimePicker, Button, Spin, Row, Col, Typography } from 'antd';
import { message } from '@/shared/utils/antdStatic';
import { EditOutlined, DeleteOutlined, StopOutlined } from '@ant-design/icons';
import DataService from '../../../shared/services/dataService';
import { useCurrency } from '@/shared/contexts/CurrencyContext';
import dayjs from 'dayjs';

const { Text } = Typography;
const { Option } = Select;
const { TextArea } = Input;

const BookingDetailModal = ({ visible, onClose, bookingId, onBookingUpdated, onBookingDeleted }) => {
  const [form] = Form.useForm();
  const { formatCurrency, businessCurrency } = useCurrency();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [booking, setBooking] = useState(null);
  const [instructors, setInstructors] = useState([]);
  const [services, setServices] = useState([]);

  useEffect(() => {
    if (visible && bookingId) {
      loadBookingDetails();
      loadInstructors();
      loadServices();
    }
  }, [visible, bookingId]);

  const loadBookingDetails = async () => {
    try {
      setLoading(true);
      const bookingData = await DataService.getBooking(bookingId);
      setBooking(bookingData);
      
      // Populate form with booking data
      form.setFieldsValue({
        date: bookingData.date ? dayjs(bookingData.date) : null,
        start_time: bookingData.start_hour ? dayjs(`2000-01-01 ${bookingData.start_hour}:00`, 'YYYY-MM-DD HH:mm') : null,
        duration: bookingData.duration,
        instructor_user_id: bookingData.instructor_user_id,
        service_id: bookingData.service_id,
        status: bookingData.status,
        payment_status: bookingData.payment_status,
        amount: bookingData.amount,
        location: bookingData.location,
        notes: bookingData.notes,
        weather_conditions: bookingData.weather_conditions,
        checkin_status: bookingData.checkin_status,
        checkout_status: bookingData.checkout_status
      });
    } catch (error) {
      console.error('Error loading booking details:', error);
      message.error('Failed to load booking details');
    } finally {
      setLoading(false);
    }
  };

  const loadInstructors = async () => {
    try {
      const instructorsData = await DataService.getInstructors();
      setInstructors(instructorsData);
    } catch (error) {
      console.error('Error loading instructors:', error);
    }
  };

  const loadServices = async () => {
    try {
      const servicesData = await DataService.getServices();
      setServices(servicesData.filter(service => service.type === 'lesson'));
    } catch (error) {
      console.error('Error loading services:', error);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      const values = await form.validateFields();
      
      const updateData = {
        ...values,
        date: values.date ? values.date.format('YYYY-MM-DD') : null,
        start_hour: values.start_time ? values.start_time.format('HH.mm') : null,
      };
      
      await DataService.updateBooking(bookingId, updateData);
      message.success('Booking updated successfully');
      setEditing(false);
      
      if (onBookingUpdated) {
        onBookingUpdated();
      }
      
      // Reload booking details to show updated data
      await loadBookingDetails();
    } catch (error) {
      console.error('Error updating booking:', error);
      message.error('Failed to update booking');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    Modal.confirm({
      title: 'Delete Booking',
      content: 'Are you sure you want to delete this booking? This action cannot be undone. Package hours will be restored and lesson costs will be refunded to the customer\'s balance as applicable.',
      okText: 'Delete',
      okType: 'danger',
      cancelText: 'Cancel',
      onOk: async () => {
        try {
          const result = await DataService.deleteBooking(bookingId);
          
          let successMessage = 'Booking deleted successfully';
          
          // Handle the comprehensive response from the updated backend
          if (result.message && result.message !== 'Booking deleted successfully') {
            // Use the detailed message from the backend that includes all refund info
            successMessage = result.message;
          } else {
            // Fallback to constructing the message from individual fields
            if (result.packagesUpdated && result.packagesUpdated.length > 0) {
              const totalHoursRestored = result.totalHoursRestored || result.packagesUpdated.reduce((sum, pkg) => sum + pkg.hoursRestored, 0);
              const packageNames = result.packagesUpdated.map(pkg => pkg.packageName).join(', ');
              successMessage += `. ${totalHoursRestored} hours restored to package(s): ${packageNames}`;
            } else if (result.packageHoursRestored && result.packageHoursRestored > 0) {
              successMessage += `. ${result.packageHoursRestored} package hours restored to student.`;
            }
            
            // Add balance refund information
            if (result.balanceRefunded && result.balanceRefunded > 0) {
              successMessage += `. ${formatCurrency(result.balanceRefunded, businessCurrency)} refunded to balance.`;
            }
          }
          
          message.success(successMessage);
          
          if (onBookingDeleted) {
            onBookingDeleted(bookingId);
          }
          
          onClose();
        } catch (error) {
          console.error('Error deleting booking:', error);
          message.error('Failed to delete booking');
        }
      }
    });
  };

  const handleCancelBooking = async () => {
    Modal.confirm({
      title: 'Cancel Booking',
      content: 'Are you sure you want to cancel this booking? This will mark the booking as cancelled and may restore package hours and/or refund the lesson cost to the customer\'s balance.',
      okText: 'Cancel Booking',
      okType: 'warning',
      cancelText: 'Keep Booking',
      onOk: async () => {
        try {
          const token = localStorage.getItem('token');
          const response = await fetch(`/api/bookings/${bookingId}/cancel`, {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`,
            },
            body: JSON.stringify({
              reason: 'Cancelled from customer profile'
            })
          });
          
          if (!response.ok) {
            throw new Error('Failed to cancel booking');
          }
          
          const result = await response.json();
          
          // Use the detailed message from the backend
          let successMessage = result.message || 'Booking cancelled successfully';
          
          message.success(successMessage);
          
          if (onBookingUpdated) {
            onBookingUpdated();
          }
          
          onClose();
        } catch (error) {
          console.error('Error cancelling booking:', error);
          message.error('Failed to cancel booking');
        }
      }
    });
  };

  const handleCancel = () => {
    if (editing) {
      // Reset form to original values
      if (booking) {
        form.setFieldsValue({
          date: booking.date ? dayjs(booking.date) : null,
          start_time: booking.start_hour ? dayjs(`2000-01-01 ${booking.start_hour}:00`, 'YYYY-MM-DD HH:mm') : null,
          duration: booking.duration,
          instructor_user_id: booking.instructor_user_id,
          service_id: booking.service_id,
          status: booking.status,
          payment_status: booking.payment_status,
          amount: booking.amount,
          location: booking.location,
          notes: booking.notes,
          weather_conditions: booking.weather_conditions,
          checkin_status: booking.checkin_status,
          checkout_status: booking.checkout_status
        });
      }
      setEditing(false);
    } else {
      onClose();
    }
  };

  return (
    <Modal
      title={
        <div className="flex justify-between items-center">
          <span>Booking Details</span>
          {!editing && (
            <div>
              <Button 
                type="text" 
                icon={<EditOutlined />} 
                onClick={() => setEditing(true)}
                className="mr-2"
              >
                Edit
              </Button>
              
              {booking?.status !== 'cancelled' && (
                <Button 
                  type="text" 
                  icon={<StopOutlined />} 
                  onClick={handleCancelBooking}
                  className="mr-2"
                  style={{ color: '#f97316' }}
                >
                  Cancel
                </Button>
              )}
              
              <Button 
                type="text" 
                danger
                icon={<DeleteOutlined />} 
                onClick={handleDelete}
              >
                Delete
              </Button>
            </div>
          )}
        </div>
      }
      open={visible}
      onCancel={handleCancel}
      footer={editing ? [
        <Button key="cancel" onClick={handleCancel}>
          Cancel
        </Button>,
        <Button key="save" type="primary" loading={saving} onClick={handleSave}>
          Save Changes
        </Button>
      ] : [
        <Button key="close" onClick={onClose}>
          Close
        </Button>
      ]}
      width={800}
      destroyOnHidden
    >
      {loading ? (
        <div className="text-center py-8">
          <Spin size="large" />
        </div>
      ) : booking ? (
        <Form form={form} layout="vertical" disabled={!editing}>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                label="Date"
                name="date"
                rules={[{ required: true, message: 'Please select a date' }]}
              >
                <DatePicker className="w-full" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                label="Start Time"
                name="start_time"
                rules={[{ required: true, message: 'Please select start time' }]}
              >
                <TimePicker className="w-full" format="HH:mm" />
              </Form.Item>
            </Col>
          </Row>
          
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                label="Duration (hours)"
                name="duration"
                rules={[{ required: true, message: 'Please enter duration' }]}
              >
                <Input type="number" step="0.5" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                label="Amount"
                name="amount"
                rules={[{ required: true, message: 'Please enter amount' }]}
              >
                <Input type="number" step="0.01" />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                label="Instructor"
                name="instructor_user_id"
                rules={[{ required: true, message: 'Please select an instructor' }]}
              >
                <Select placeholder="Select instructor">
                  {instructors.map(instructor => (
                    <Option key={instructor.id} value={instructor.id}>
                      {instructor.first_name} {instructor.last_name}
                    </Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                label="Service"
                name="service_id"
                rules={[{ required: true, message: 'Please select a service' }]}
              >
                {editing ? (
                  <Select placeholder="Select service">
                    {services.map(service => (
                      <Option key={service.id} value={service.id}>
                        {service.name}
                      </Option>
                    ))}
                  </Select>
                ) : (
                  <Text>
                    {booking?.service_id ? 
                      (services.find(s => s.id === booking.service_id)?.name || `Service ID: ${booking.service_id}`) 
                      : 'No service selected'
                    }
                  </Text>
                )}
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={8}>
              <Form.Item
                label="Status"
                name="status"
                rules={[{ required: true, message: 'Please select status' }]}
              >
                <Select>
                  <Option value="scheduled">Scheduled</Option>
                  <Option value="completed">Completed</Option>
                  <Option value="cancelled">Cancelled</Option>
                </Select>
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item
                label="Payment Status"
                name="payment_status"
                rules={[{ required: true, message: 'Please select payment status' }]}
              >
                <Select>
                  <Option value="pending">Pending</Option>
                  <Option value="paid">Paid</Option>
                  <Option value="package">Package</Option>
                  <Option value="partial">Partial</Option>
                  <Option value="refunded">Refunded</Option>
                </Select>
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item
                label="Check-in Status"
                name="checkin_status"
              >
                <Select>
                  <Option value="pending">Pending</Option>
                  <Option value="checked-in">Checked In</Option>
                </Select>
              </Form.Item>
            </Col>
          </Row>

          <Form.Item label="Location" name="location">
            <Input />
          </Form.Item>

          <Form.Item label="Weather Conditions" name="weather_conditions">
            <Input />
          </Form.Item>

          <Form.Item label="Notes" name="notes">
            <TextArea rows={3} />
          </Form.Item>
        </Form>
      ) : (
        <div className="text-center py-8">
          <Text type="secondary">No booking data available</Text>
        </div>
      )}
    </Modal>
  );
};

export default BookingDetailModal;
