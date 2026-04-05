import React, { useState } from 'react';
import { 
  Modal, 
  Form, 
  Select, 
  DatePicker, 
  TimePicker, 
  Input, 
  InputNumber,
  Button, 
  Alert,
  Card,
  Tag
} from 'antd';
import { 
  ClockCircleOutlined, 
  CalendarOutlined, 
  UserOutlined,
  BookOutlined,
  CheckCircleOutlined
} from '@ant-design/icons';
import moment from 'moment';

const { Option } = Select;

function QuickLessonBooking({ visible, onClose, customerPackages, onBookSession }) {
  const [form] = Form.useForm();
  const [selectedPackage, setSelectedPackage] = useState(null);
  const [loading, setLoading] = useState(false);

  const handlePackageSelect = (packageId) => {
    const pkg = customerPackages.find(p => p.id === packageId);
    setSelectedPackage(pkg);
  };

  const handleSubmit = async (values) => {
    try {
      setLoading(true);
      
      const sessionData = {
        packageId: selectedPackage.id,
        date: values.date.format('YYYY-MM-DD'),
        time: values.time.format('HH:mm'),
        hoursToUse: values.hoursToUse,
        instructor: values.instructor,
        notes: values.notes || ''
      };
      
      await onBookSession(sessionData);
      form.resetFields();
      setSelectedPackage(null);
      onClose();
      
    } catch (error) {
      console.error('Booking error:', error);
    } finally {
      setLoading(false);
    }
  };

  const availablePackages = customerPackages?.filter(pkg => 
    pkg.remainingHours > 0 && pkg.status === 'active'
  ) || [];

  return (
    <Modal
      title={
        <div className="text-center py-2">
          <div className="flex items-center justify-center mb-2">
            <CalendarOutlined className="text-2xl text-blue-500 mr-3" />
            <span className="text-2xl font-bold text-gray-800">Book Your Lesson Session</span>
          </div>
          <p className="text-gray-600 text-sm">Choose your preferred date and time for an amazing kitesurfing experience</p>
        </div>
      }
      open={visible}
      onCancel={() => {
        onClose();
        setSelectedPackage(null);
        form.resetFields();
      }}
      footer={null}
      width={700}
      className="lesson-booking-modal"
    >
      <div className="py-4">
        {availablePackages.length === 0 ? (
          <div className="text-center py-12">
            <div className="w-20 h-20 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <BookOutlined className="text-3xl text-blue-500" />
            </div>
            <h3 className="text-xl font-semibold text-gray-800 mb-4">No Active Packages Found</h3>
            <p className="text-gray-600 mb-6">
              You don't have any active lesson packages with remaining hours. 
              Purchase a lesson package to start booking sessions.
            </p>
            <Button 
              type="primary" 
              size="large"
              className="bg-blue-600 border-blue-600 px-8"
            >
              Browse Lesson Packages
            </Button>
          </div>
        ) : (
          <Form
            form={form}
            layout="vertical"
            onFinish={handleSubmit}
            className="space-y-6"
          >
            {/* Package Selection */}
            <div className="bg-blue-50 rounded-lg p-6">
              <h4 className="text-lg font-semibold text-gray-800 mb-4 flex items-center">
                <BookOutlined className="mr-2 text-blue-600" />
                Select Your Lesson Package
              </h4>
              <Form.Item
                name="packageId"
                rules={[{ required: true, message: 'Please select a package' }]}
              >
                <div className="space-y-3">
                  {availablePackages.map(pkg => (
                    <div 
                      key={pkg.id}
                      className={`border-2 rounded-lg p-4 cursor-pointer transition-all ${
                        selectedPackage?.id === pkg.id 
                          ? 'border-blue-500 bg-blue-50' 
                          : 'border-gray-200 hover:border-blue-300'
                      }`}
                      onClick={() => {
                        form.setFieldValue('packageId', pkg.id);
                        handlePackageSelect(pkg.id);
                      }}
                    >
                      <div className="flex justify-between items-center">
                        <div>
                          <h5 className="font-semibold text-gray-800">{pkg.lessonType}</h5>
                          <p className="text-sm text-gray-600">
                            Expires: {moment(pkg.expiryDate).format('MMM DD, YYYY')}
                          </p>
                        </div>
                        <div className="text-right">
                          <div className="bg-green-100 text-green-800 px-3 py-1 rounded-full text-sm font-medium">
                            <ClockCircleOutlined className="mr-1" />
                            {pkg.remainingHours}h remaining
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </Form.Item>
            </div>

            {selectedPackage && (
              <div className="bg-green-50 rounded-lg p-6 border border-green-200">
                <h4 className="text-lg font-semibold text-green-800 mb-3 flex items-center">
                  <CheckCircleOutlined className="mr-2" />
                  Selected Package Details
                </h4>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="font-medium text-gray-700">Lesson Type:</span>
                    <p className="text-gray-600">{selectedPackage.lessonType}</p>
                  </div>
                  <div>
                    <span className="font-medium text-gray-700">Remaining Hours:</span>
                    <p className="text-green-600 font-semibold">{selectedPackage.remainingHours} hours</p>
                  </div>
                  <div>
                    <span className="font-medium text-gray-700">Package Expires:</span>
                    <p className="text-gray-600">{moment(selectedPackage.expiryDate).format('MMM DD, YYYY')}</p>
                  </div>
                  <div>
                    <span className="font-medium text-gray-700">Status:</span>
                    <Tag color="green" className="ml-0">{selectedPackage.status}</Tag>
                  </div>
                </div>
              </div>
            )}

            {/* Session Details */}
            <div className="bg-gray-50 rounded-lg p-6">
              <h4 className="text-lg font-semibold text-gray-800 mb-4 flex items-center">
                <CalendarOutlined className="mr-2 text-blue-600" />
                Session Details
              </h4>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Form.Item
                  name="date"
                  label={<span className="font-medium">Session Date</span>}
                  rules={[{ required: true, message: 'Please select date' }]}
                >
                  <DatePicker 
                    style={{ width: '100%' }}
                    size="large"
                    disabledDate={(current) => current && current < moment().startOf('day')}
                    placeholder="Choose your lesson date"
                  />
                </Form.Item>

                <Form.Item
                  name="time"
                  label={<span className="font-medium">Session Time</span>}
                  rules={[{ required: true, message: 'Please select time' }]}
                >
                  <TimePicker 
                    style={{ width: '100%' }}
                    size="large"
                    format="HH:mm"
                    minuteStep={30}
                    placeholder="Select start time"
                  />
                </Form.Item>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Form.Item
                name="hoursToUse"
                label={<span className="font-medium">Hours to Use</span>}
                rules={[
                  { required: true, message: 'Please select hours' },
                  {
                    validator: (_, value) => {
                      if (selectedPackage && value > selectedPackage.remainingHours) {
                        return Promise.reject(new Error('Cannot exceed remaining hours'));
                      }
                      return Promise.resolve();
                    }
                  }
                ]}
              >
                <InputNumber
                  min={0.5}
                  max={selectedPackage?.remainingHours || 8}
                  step={0.5}
                  style={{ width: '100%' }}
                  size="large"
                  placeholder="e.g., 2.0"
                  suffix="hours"
                />
              </Form.Item>

              <Form.Item
                name="instructor"
                label={<span className="font-medium">Preferred Instructor (Optional)</span>}
              >
                <Input
                  placeholder="Any specific instructor?"
                  size="large"
                />
              </Form.Item>
            </div>

            <Form.Item
              name="notes"
              label={<span className="font-medium">Special Requests or Notes</span>}
            >
              <Input.TextArea
                rows={3}
                placeholder="Any special requirements, experience level, or specific goals for this session?"
              />
            </Form.Item>

            {/* Booking Summary & Action */}
            <div className="bg-blue-50 rounded-lg p-6 border border-blue-200">
              <h4 className="text-lg font-semibold text-blue-800 mb-4">Booking Summary</h4>
              {selectedPackage && form.getFieldValue('hoursToUse') && form.getFieldValue('date') && (
                <div className="space-y-2 text-sm mb-6">
                  <div className="flex justify-between">
                    <span>Lesson Type:</span>
                    <span className="font-medium">{selectedPackage.lessonType}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Date:</span>
                    <span className="font-medium">{form.getFieldValue('date')?.format('MMM DD, YYYY')}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Time:</span>
                    <span className="font-medium">{form.getFieldValue('time')?.format('HH:mm')}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Duration:</span>
                    <span className="font-medium">{form.getFieldValue('hoursToUse')} hours</span>
                  </div>
                  <div className="flex justify-between border-t pt-2 mt-2">
                    <span>Remaining after booking:</span>
                    <span className="font-bold text-green-600">
                      {(selectedPackage.remainingHours - (form.getFieldValue('hoursToUse') || 0)).toFixed(1)} hours
                    </span>
                  </div>
                </div>
              )}

              <div className="flex gap-3 justify-end">
                <Button 
                  size="large" 
                  onClick={() => {
                    onClose();
                    setSelectedPackage(null);
                    form.resetFields();
                  }}
                >
                  Cancel
                </Button>
                <Button 
                  type="primary" 
                  htmlType="submit" 
                  loading={loading}
                  size="large"
                  className="bg-blue-600 border-blue-600 px-8"
                >
                  {loading ? 'Booking...' : 'Confirm Booking'}
                </Button>
              </div>
            </div>
          </Form>
        )}
      </div>
    </Modal>
  );
}

export default QuickLessonBooking;
