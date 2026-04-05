// src/features/customers/components/CustomerBookingModal.jsx
import React, { useState, useEffect } from 'react';
import {
  Modal,
  Form,
  Select,
  DatePicker,
  TimePicker,
  Button,
  Steps,
  Card,
  Alert,
  Row,
  Col,
  Typography,
  Divider,
  Tag,
  Space
} from 'antd';
import { message } from '@/shared/utils/antdStatic';
import {
  UserOutlined,
  CalendarOutlined,
  ClockCircleOutlined,
  CheckCircleOutlined,
  DollarOutlined
} from '@ant-design/icons';
import moment from 'moment';
import DataService from '@/shared/services/dataService';
import { serviceApi } from '@/shared/services/serviceApi';
import { useToast } from '@/shared/contexts/ToastContext';
import { useCurrency } from '@/shared/contexts/CurrencyContext';

const { Option } = Select;
const { Step } = Steps;
const { Title, Text } = Typography;

/**
 * Customer Booking Modal - A simplified booking modal for customer pages
 * Doesn't require CalendarContext, fetches its own data
 */
const CustomerBookingModal = ({ isOpen, onClose, customerId, onBookingCreated }) => {
  const [form] = Form.useForm();
  const [currentStep, setCurrentStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const { showSuccess, showError } = useToast();
  const { formatCurrency, businessCurrency } = useCurrency();

  // Data states
  const [services, setServices] = useState([]);
  const [instructors, setInstructors] = useState([]);
  const [customer, setCustomer] = useState(null);
  const [selectedService, setSelectedService] = useState(null);

  // Form data
  const [bookingData, setBookingData] = useState({
    date: null,
    time: null,
    serviceId: null,
    instructorId: null,
    duration: 1,
    notes: ''
  });

  // Load data when modal opens
  useEffect(() => {
    if (isOpen && customerId) {
      loadInitialData();
    }
  }, [isOpen, customerId]);

  // Set initial form values after data is loaded
  useEffect(() => {
    if (services.length > 0 && instructors.length > 0) {
      const lastInstructor = localStorage.getItem('lastUsedInstructor');
      const lastService = localStorage.getItem('lastUsedService');

      console.log('Setting initial values:', { lastInstructor, lastService, services: services.length, instructors: instructors.length });

      const initialValues = {};

      // Set default values if they exist
      if (lastInstructor && instructors.find(i => i.id === lastInstructor)) {
        initialValues.instructorId = lastInstructor;
        setBookingData(prev => ({ ...prev, instructorId: lastInstructor }));
        console.log('Pre-selecting instructor:', lastInstructor);
      }

      if (lastService && services.find(s => s.id === lastService)) {
        const service = services.find(s => s.id === lastService);
        initialValues.serviceId = lastService;
        handleServiceChange(lastService); // This will set selectedService and update bookingData
        console.log('Pre-selecting service:', lastService, service);
      }

      // Set all initial values at once
      if (Object.keys(initialValues).length > 0) {
        console.log('Setting form values:', initialValues);
        form.setFieldsValue(initialValues);
      }
    }
  }, [services, instructors, form]);

  const loadInitialData = async () => {
    setLoading(true);
    try {
      // Load services, instructors, and customer data
      const [servicesRes, instructorsRes, customerRes] = await Promise.all([
        serviceApi.getServices(),
        DataService.getInstructors(),
        DataService.getUserById(customerId)
      ]);

      setServices(servicesRes || []);
      setInstructors(instructorsRes || []);
      setCustomer(customerRes);
    } catch (error) {
      console.error('Error loading booking data:', error);
      showError('Failed to load booking data');
    } finally {
      setLoading(false);
    }
  };

  const handleServiceChange = (serviceId) => {
    const service = services.find(s => s.id === serviceId);
    setSelectedService(service);
    setBookingData(prev => ({
      ...prev,
      serviceId,
      duration: service?.duration || 1
    }));
  };

  const handleNext = () => {
    // Validate only the fields for the current step
    let fieldsToValidate = [];
    
    switch (currentStep) {
      case 0: // Service selection
        fieldsToValidate = ['serviceId'];
        break;
      case 1: // Date & Time
        fieldsToValidate = ['date', 'time'];
        break;
      case 2: // Instructor
        fieldsToValidate = ['instructorId'];
        break;
      default:
        fieldsToValidate = [];
    }

    if (fieldsToValidate.length === 0) {
      setCurrentStep(prev => prev + 1);
      return;
    }

    form.validateFields(fieldsToValidate).then(() => {
      setCurrentStep(prev => prev + 1);
    }).catch(err => {
      console.log('Validation failed for step:', currentStep, err);
    });
  };

  const handlePrev = () => {
    setCurrentStep(prev => prev - 1);
  };

  const handleSubmit = async () => {
    try {
      setSubmitting(true);
      
      const formValues = form.getFieldsValue();
      const bookingPayload = {
        student_user_id: customerId,
        instructor_user_id: formValues.instructorId,
        service_id: formValues.serviceId,
        date: formValues.date.format('YYYY-MM-DD'),
        start_time: formValues.time.format('HH:mm'),
        duration: Number(selectedService?.duration) || 1,
        notes: formValues.notes || '',
        status: 'pending'
      };

      console.log('Creating booking:', bookingPayload);
      const response = await DataService.createBooking(bookingPayload);
      
      if (response && response.id) {
        // Save last used instructor and service to localStorage
        localStorage.setItem('lastUsedInstructor', formValues.instructorId);
        localStorage.setItem('lastUsedService', formValues.serviceId);
        
        showSuccess('Booking created successfully!');
        onBookingCreated && onBookingCreated(response);
        handleClose();
      } else {
        throw new Error('Invalid response from server');
      }
    } catch (error) {
      console.error('Error creating booking:', error);
      showError('Failed to create booking: ' + (error.message || 'Unknown error'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    form.resetFields();
    setCurrentStep(0);
    setBookingData({
      date: null,
      time: null,
      serviceId: null,
      instructorId: null,
      duration: 1,
      notes: ''
    });
    setSelectedService(null);
    onClose();
  };

  const steps = [
    {
      title: 'Service',
      content: (
        <div className="space-y-4">
          <Title level={4}>Select Service</Title>
          <Form.Item
            name="serviceId"
            rules={[{ required: true, message: 'Please select a service' }]}
          >
            <Select
              placeholder="Select a service"
              size="large"
              onChange={handleServiceChange}
              loading={loading}
            >
              {services.map(service => {
                const isLastUsed = localStorage.getItem('lastUsedService') === service.id;
                return (
                  <Option key={service.id} value={service.id}>
                    <div className="flex justify-between items-center">
                      <span>
                        {service.name}
                        {isLastUsed && <Tag color="green" size="small" className="ml-2">Last Used</Tag>}
                      </span>
                      <Tag color="blue">{formatCurrency(service.price_per_hour, service.currency || businessCurrency)}/h</Tag>
                    </div>
                  </Option>
                );
              })}
            </Select>
          </Form.Item>
          {selectedService && (
            <Card size="small" className="bg-blue-50">
              <div className="flex justify-between items-center">
                <span><strong>Duration:</strong> {selectedService.duration}h</span>
                <span><strong>Price:</strong> {formatCurrency(selectedService.price_per_hour, selectedService.currency || businessCurrency)}/h</span>
              </div>
            </Card>
          )}
        </div>
      )
    },
    {
      title: 'Date & Time',
      content: (
        <div className="space-y-4">
          <Title level={4}>Select Date & Time</Title>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="date"
                label="Date"
                rules={[{ required: true, message: 'Please select a date' }]}
              >
                <DatePicker
                  size="large"
                  style={{ width: '100%' }}
                  disabledDate={(current) => current && current < moment().startOf('day')}
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="time"
                label="Time"
                rules={[{ required: true, message: 'Please select a time' }]}
              >
                <TimePicker
                  size="large"
                  style={{ width: '100%' }}
                  format="HH:mm"
                  minuteStep={15}
                />
              </Form.Item>
            </Col>
          </Row>
        </div>
      )
    },
    {
      title: 'Instructor',
      content: (
        <div className="space-y-4">
          <Title level={4}>Select Instructor</Title>
          <Form.Item
            name="instructorId"
            rules={[{ required: true, message: 'Please select an instructor' }]}
          >
            <Select
              placeholder="Select an instructor"
              size="large"
              loading={loading}
            >
              {instructors.map(instructor => {
                const isLastUsed = localStorage.getItem('lastUsedInstructor') === instructor.id;
                return (
                  <Option key={instructor.id} value={instructor.id}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <UserOutlined />
                        <span>{instructor.name}</span>
                      </div>
                      {isLastUsed && <Tag color="green" size="small">Last Used</Tag>}
                    </div>
                  </Option>
                );
              })}
            </Select>
          </Form.Item>
        </div>
      )
    },
    {
      title: 'Confirm',
      content: (
        <div className="space-y-4">
          <Title level={4}>Confirm Booking</Title>
          <Card>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span>Customer:</span>
                <span><strong>{customer?.name}</strong></span>
              </div>
              <div className="flex justify-between">
                <span>Service:</span>
                <span><strong>{selectedService?.name}</strong></span>
              </div>
              <div className="flex justify-between">
                <span>Date:</span>
                <span><strong>{bookingData.date?.format('YYYY-MM-DD')}</strong></span>
              </div>
              <div className="flex justify-between">
                <span>Time:</span>
                <span><strong>{bookingData.time?.format('HH:mm')}</strong></span>
              </div>
              <div className="flex justify-between">
                <span>Duration:</span>
                <span><strong>{selectedService?.duration}h</strong></span>
              </div>
              <Divider />
              <div className="flex justify-between text-lg font-bold">
                <span>Total Price:</span>
                <span>{formatCurrency(selectedService?.price_per_hour * selectedService?.duration, selectedService?.currency || businessCurrency)}</span>
              </div>
            </div>
          </Card>
        </div>
      )
    }
  ];

  return (
    <Modal
      title="Book a Service"
      open={isOpen}
      onCancel={handleClose}
      width={600}
      footer={null}
      destroyOnHidden
    >
      <div className="space-y-6">
        <Steps current={currentStep} size="small">
          {steps.map((step, index) => (
            <Step key={index} title={step.title} />
          ))}
        </Steps>

        <Form form={form} layout="vertical" onValuesChange={(changed, all) => {
          if (changed.date) setBookingData(prev => ({ ...prev, date: changed.date }));
          if (changed.time) setBookingData(prev => ({ ...prev, time: changed.time }));
        }}>
          <div className="min-h-[300px]">
            {steps[currentStep].content}
          </div>
        </Form>

        <div className="flex justify-between">
          <Button 
            disabled={currentStep === 0}
            onClick={handlePrev}
          >
            Previous
          </Button>
          <Space>
            <Button onClick={handleClose}>
              Cancel
            </Button>
            {currentStep < steps.length - 1 ? (
              <Button type="primary" onClick={handleNext}>
                Next
              </Button>
            ) : (
              <Button 
                type="primary" 
                loading={submitting}
                onClick={handleSubmit}
                icon={<CheckCircleOutlined />}
              >
                Create Booking
              </Button>
            )}
          </Space>
        </div>
      </div>
    </Modal>
  );
};

export default CustomerBookingModal;
