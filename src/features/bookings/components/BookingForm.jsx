// src/components/BookingForm.jsx
import { useState, useEffect, useCallback } from "react";
import { useCurrency } from "@/shared/contexts/CurrencyContext";
import { Form, Input, Button, Select, DatePicker, Radio } from "antd";
import { message } from '@/shared/utils/antdStatic';
import familyApi from "@/features/students/services/familyApi";
import DataService from "@/shared/services/dataService";
import { serviceApi } from "@/shared/services/serviceApi";
import moment from "moment";
import { STANDARD_SLOTS as TIMELINE_SLOTS } from "@/shared/utils/timelineUtils";
import { filterServicesByCapacity } from "@/shared/utils/serviceCapacityFilter";

// Convert standard slots from timelineUtils to format needed by form
const STANDARD_SLOTS = TIMELINE_SLOTS.map(slot => ({
  id: slot.id,
  value: slot.title,
  label: slot.title,
  startHour: slot.start,
  duration: slot.end - slot.start
}));

const BookingForm = ({ booking, onClose, onSave, students, instructors }) => {
  const { formatCurrency, businessCurrency } = useCurrency();
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [customTimeSlot, setCustomTimeSlot] = useState(false);
  const [availableServices, setAvailableServices] = useState([]);
  const [servicesLoading, setServicesLoading] = useState(true);
  const [participantCount] = useState(1); // Track number of participants for filtering
  const [familyMembers, setFamilyMembers] = useState([]);
  const [participantType, setParticipantType] = useState('self');
  const [selectedFamilyMemberId, setSelectedFamilyMemberId] = useState(null);
  
  // Load services from database
  useEffect(() => {
    const loadServices = async () => {
      try {
        setServicesLoading(true);
        const services = await serviceApi.getServices();
        // Filter to only lesson services
        const lessonServices = services.filter(s => 
          s.category === 'lesson' || 
          s.category?.toLowerCase().includes('lesson') ||
          s.name?.toLowerCase().includes('lesson')
        );
        setAvailableServices(lessonServices);
  } catch {
        message.error('Failed to load available services');
        // Fallback to empty array
        setAvailableServices([]);
      } finally {
        setServicesLoading(false);
      }
    };
    
    loadServices();
  }, []);
  
  // Get capacity-filtered services based on participant count
  const filteredServices = filterServicesByCapacity(availableServices, participantCount);
  
  // eslint-disable-next-line complexity
  const initFromBooking = useCallback(() => {
    if (booking) {
      const bookingData = { ...booking };
      
      if (bookingData.date && typeof bookingData.date === 'string') {
        bookingData.date = moment(bookingData.date);
      }

      // Handle both old (start_hour) and new (startTime) formats for editing
      let startHour, durationHours;

      if (bookingData.startTime) { // New format: "HH:MM"
          const parts = bookingData.startTime.split(':');
          startHour = parseInt(parts[0], 10) + (parseInt(parts[1], 10) / 60);
          durationHours = bookingData.duration / 60; // Duration is in minutes
      } else if (bookingData.start_hour !== undefined) { // Old format: numeric hour
          startHour = bookingData.start_hour;
          durationHours = bookingData.duration; // Duration is in hours
      }

      if (startHour !== undefined && durationHours !== undefined) {
        const matchedSlot = STANDARD_SLOTS.find(slot => 
            Math.abs(startHour - slot.startHour) < 0.1 && 
            Math.abs(durationHours - slot.duration) < 0.1
        );
        
        if (matchedSlot) {
          bookingData.time_slot = matchedSlot.value;
          setCustomTimeSlot(false);
        } else {
          setCustomTimeSlot(true);
          bookingData.custom_start_hour = startHour;
          bookingData.custom_duration = durationHours;
        }
      }
      
      if (bookingData.duration && !servicesLoading) {
        const lessonDurationHours = bookingData.startTime ? bookingData.duration / 60 : bookingData.duration;
        // Try to find a matching service by duration or by service_id
        let matchingService = null;
        
        if (bookingData.service_id) {
          matchingService = availableServices.find(service => service.id === bookingData.service_id);
        }
        
        if (!matchingService) {
          matchingService = availableServices.find(service => 
            Math.abs(service.duration - lessonDurationHours) < 0.1
          );
        }
        
        if (matchingService) {
          bookingData.service_id = matchingService.id;
        }
      }
      
      // Handle inconsistent ID fields
      if (bookingData.instructorId) bookingData.instructor_user_id = bookingData.instructorId;
      if (bookingData.studentId) bookingData.student_user_id = bookingData.studentId;

      form.setFieldsValue(bookingData);
    } else {
      form.setFieldsValue({
        date: moment(),
        time_slot: STANDARD_SLOTS[0].value,
        status: 'pending'
      });
    }
  }, [booking, form, availableServices, servicesLoading]);

  useEffect(() => {
    initFromBooking();
  }, [initFromBooking]);

  // Load family members whenever selected student changes
  const [watchedStudentId, setWatchedStudentId] = useState(null);
  // Mirror form field into state for safe dependency
  const handleValuesChange = (_, allValues) => {
    if (allValues?.student_user_id && allValues.student_user_id !== watchedStudentId) {
      setWatchedStudentId(allValues.student_user_id);
    }
  };

  useEffect(() => {
    let cancelled = false;
    if (!watchedStudentId) return;
    (async () => {
      try {
        const members = await familyApi.getFamilyMembers(watchedStudentId);
        if (!cancelled) setFamilyMembers(members || []);
      } catch {
        // non-blocking
      }
    })();
    return () => { cancelled = true; };
  }, [watchedStudentId]);
  
  const handleLessonTypeChange = (serviceId) => {
    const selectedService = filteredServices.find(service => service.id === serviceId);
    
    // If it's a long duration service (6+ hours), switch to custom time
    if (selectedService && selectedService.duration >= 6) {
      setCustomTimeSlot(true);
      form.setFieldsValue({
        custom_start_hour: 10,
        custom_duration: selectedService.duration
      });
    }
  };
  
  const handleTimeSlotTypeChange = (e) => {
    setCustomTimeSlot(e.target.value === 'custom');
  };
  
  const handleSubmit = async (values) => {
    try {
      setLoading(true);
      
      let startHour, durationHours;
      if (customTimeSlot) {
        startHour = parseFloat(values.custom_start_hour);
        durationHours = parseFloat(values.custom_duration);
      } else {
        const slot = STANDARD_SLOTS.find(s => s.value === values.time_slot);
        if (slot) {
          startHour = slot.startHour;
          durationHours = slot.duration;
        } else {
          throw new Error("Invalid time slot selected");
        }
      }
      
      // Convert to new, consistent data format
      const startTotalMinutes = startHour * 60;
      const startTime = `${String(Math.floor(startTotalMinutes / 60)).padStart(2, '0')}:${String(startTotalMinutes % 60).padStart(2, '0')}`;
      const durationMinutes = durationHours * 60;
      const endTotalMinutes = startTotalMinutes + durationMinutes;
      const endTime = `${String(Math.floor(endTotalMinutes / 60)).padStart(2, '0')}:${String(endTotalMinutes % 60).padStart(2, '0')}`;

      // This is the consistent data structure the frontend now uses
      const bookingData = {
        id: booking?.id,
        date: values.date.format('YYYY-MM-DD'),
        startTime: startTime,
        endTime: endTime,
        duration: durationMinutes,
        instructorId: values.instructor_user_id,
        studentId: values.student_user_id,
        serviceId: values.service_id,
        status: values.status,
        notes: values.notes,
      };

      // The backend API might still expect snake_case and old formats.
      // For now, we will send a payload that is more likely to be compatible.
      // Ideally, the backend would be updated to accept the new `bookingData` structure.
      const apiPayload = {
        id: booking?.id,
        date: bookingData.date,
        start_time: bookingData.startTime,
        end_time: bookingData.endTime,
        duration: bookingData.duration, // Send duration in minutes
        instructor_user_id: bookingData.instructorId,
        student_user_id: bookingData.studentId,
        service_id: bookingData.serviceId,
        status: bookingData.status,
        notes: bookingData.notes,
        family_member_id: participantType === 'family' ? selectedFamilyMemberId : null,
        participant_type: participantType,
      };
      
      if (booking?.id) {
        await DataService.updateBooking(apiPayload);
        message.success("Booking updated successfully!");
        // Dispatch global refresh event to trigger calendar auto-refresh
        window.dispatchEvent(new CustomEvent('booking-updated', {
          detail: { bookingId: booking.id }
        }));
      } else {
        const result = await DataService.createBooking(apiPayload);
        message.success("New booking created successfully!");
        // Dispatch global refresh event to trigger calendar auto-refresh
        window.dispatchEvent(new CustomEvent('booking-created', {
          detail: { bookingId: result?.id }
        }));
      }
      
      form.resetFields();
      
      if (onSave) {
        // Pass the full, consistent object to the parent for state update
        onSave({
          ...bookingData,
          serviceName: filteredServices.find(service => service.id === values.service_id)?.name,
          studentName: students.find(s => s.id === values.student_user_id)?.name,
        });
      }
  } catch {
      message.error("Failed to save booking. Please try again.");
    } finally {
      setLoading(false);
    }
  };
  
  return (
    <Form
      form={form}
      layout="vertical"
      onFinish={handleSubmit}
      onValuesChange={handleValuesChange}
      className="text-slate-300"
    >
      <div className="flex items-center mb-6">
        <div className="w-12 h-12 rounded-full bg-sky-500/20 flex items-center justify-center mr-4">
          <svg className="w-6 h-6 text-sky-400" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M14 9l-9 9M16 14l-3 3M17 6l-7 7M5 19a2 2 0 01-2-2V7a2 2 0 012-2h11a2 2 0 012 2v1M9 21h10a2 2 0 002-2V10M21 10l-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <h3 className="text-2xl font-bold text-white">
          {booking ? "Edit Booking" : "New Kitesurfing Lesson"}
        </h3>
      </div>
      {/* Participant selection: self vs family */}
      <div className="mb-4">
        <label className="block text-sm font-medium text-slate-300 mb-1">Participant</label>
        <div className="flex gap-3 items-center">
          <Radio.Group
            value={participantType}
            onChange={(e) => setParticipantType(e.target.value)}
            className="custom-radio"
          >
            <Radio.Button value="self">Myself</Radio.Button>
            <Radio.Button value="family">Family member</Radio.Button>
          </Radio.Group>
          {participantType === 'family' && (
            <Select
              placeholder="Select family member"
              value={selectedFamilyMemberId}
              onChange={setSelectedFamilyMemberId}
              style={{ minWidth: 220 }}
              className="custom-select"
              popupClassName="custom-dropdown"
              options={(familyMembers || []).map((m) => ({
                value: m.id,
                label: `${m.full_name} (${m.age})`,
              }))}
            />
          )}
        </div>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <Form.Item
          name="instructor_user_id"
          label={<span className="text-slate-300">Instructor</span>}
          rules={[{ required: true, message: "Please select an instructor" }]}
        >
          <Select 
            placeholder="Select an instructor" 
            className="custom-select"
            popupClassName="custom-dropdown"
          >
            {instructors.map(instructor => (
              <Select.Option key={instructor.id} value={instructor.id}>
                {instructor.name}
              </Select.Option>
            ))}
          </Select>
        </Form.Item>
        
        <Form.Item
          name="student_user_id"
          label={<span className="text-slate-300">Student</span>}
          rules={[{ required: true, message: "Please select a student" }]}
        >
          <Select 
            placeholder="Select a student" 
            className="custom-select"
            popupClassName="custom-dropdown"
            showSearch
            optionFilterProp="children"
          >
            {students.map(student => (
              <Select.Option key={student.id} value={student.id}>
                {student.name}
              </Select.Option>
            ))}
          </Select>
        </Form.Item>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <Form.Item
          name="service_id"
          label={<span className="text-slate-300">Lesson Type</span>}
          rules={[{ required: true, message: "Please select a lesson type" }]}
        >
          <Select 
            placeholder={servicesLoading ? "Loading services..." : "Select lesson type"}
            className="custom-select"
            popupClassName="custom-dropdown"
            onChange={handleLessonTypeChange}
            loading={servicesLoading}
            disabled={servicesLoading}
          >
  {filteredServices.map(service => (
      <Select.Option key={service.id} value={service.id}>
    {service.name} {service.price > 0 ? `(${formatCurrency(service.price || 0, service.currency || businessCurrency || 'EUR')})` : ''}
                {service.max_participants === 1 && (
                  <span className="text-purple-400 ml-2">(Private)</span>
                )}
                {service.max_participants > 1 && (
                  <span className="text-blue-400 ml-2">(Group max: {service.max_participants})</span>
                )}
              </Select.Option>
            ))}
          </Select>
        </Form.Item>
        
        <Form.Item
          name="date"
          label={<span className="text-slate-300">Date</span>}
          rules={[{ required: true, message: "Please select a date" }]}
        >
          <DatePicker className="w-full custom-datepicker" />
        </Form.Item>
      </div>
      
      <div className="mb-4">
        <Form.Item
          label={<span className="text-slate-300">Time Slot</span>}
        >
          <Radio.Group 
            onChange={handleTimeSlotTypeChange} 
            value={customTimeSlot ? 'custom' : 'standard'}
            className="mb-3 custom-radio"
          >
            <Radio value="standard">Standard Time Slot</Radio>
            <Radio value="custom">Custom Time</Radio>
          </Radio.Group>
          
          {!customTimeSlot ? (
            <Form.Item
              name="time_slot"
              noStyle
              rules={[{ required: !customTimeSlot, message: "Please select a time slot" }]}
            >
              <Select placeholder="Select time slot" className="custom-select" popupClassName="custom-dropdown">
                {STANDARD_SLOTS.map(slot => (
                  <Select.Option key={slot.id} value={slot.value}>
                    {slot.label}
                  </Select.Option>
                ))}
              </Select>
            </Form.Item>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <Form.Item
                name="custom_start_hour"
                label={<span className="text-slate-300 text-sm">Start Time (24h)</span>}
                rules={[{ required: customTimeSlot, message: "Required" }]}
              >
                <Select className="custom-select" popupClassName="custom-dropdown">
                  {Array.from({ length: 26 }, (_, i) => i * 0.5 + 8).map(hour => {
                    const intHour = Math.floor(hour);
                    const minutes = hour % 1 ? '30' : '00';
                    const label = `${intHour.toString().padStart(2, '0')}:${minutes}`;
                    return (
                      <Select.Option key={hour} value={hour}>{label}</Select.Option>
                    );
                  })}
                </Select>
              </Form.Item>
              
              <Form.Item
                name="custom_duration"
                label={<span className="text-slate-300 text-sm">Duration (hours)</span>}
                rules={[{ required: customTimeSlot, message: "Required" }]}
              >
                <Select className="custom-select" popupClassName="custom-dropdown">
                  {[0.5, 1, 1.5, 2, 2.5, 3, 4, 5, 6, 8].map(duration => (
                    <Select.Option key={duration} value={duration}>
                      {duration} {duration === 1 ? 'hour' : 'hours'}
                    </Select.Option>
                  ))}
                </Select>
              </Form.Item>
            </div>
          )}
        </Form.Item>
      </div>
      
      <Form.Item
        name="status"
        label={<span className="text-slate-300">Status</span>}
        rules={[{ required: true, message: "Please select a status" }]}
      >
        <Select placeholder="Select status" className="custom-select" popupClassName="custom-dropdown">
          <Select.Option value="pending">Pending</Select.Option>
          <Select.Option value="confirmed">Confirmed</Select.Option>
          <Select.Option value="completed">Completed</Select.Option>
          <Select.Option value="cancelled">Cancelled</Select.Option>
        </Select>
      </Form.Item>
      
      <Form.Item
        name="notes"
        label={<span className="text-slate-300">Notes</span>}
      >
        <Input.TextArea 
          rows={4} 
          placeholder="Any special requirements or notes for this lesson" 
          className="custom-textarea" 
        />
      </Form.Item>
      
      <Form.Item className="flex justify-end gap-3 mb-0 mt-6">
        <Button 
          onClick={onClose}
          className="border border-slate-600 text-slate-300 hover:text-white hover:border-slate-500 bg-transparent"
        >
          Cancel
        </Button>
        <Button 
          type="primary" 
          htmlType="submit" 
          loading={loading}
          className="bg-gradient-to-r from-sky-500 to-indigo-500 hover:from-sky-600 hover:to-indigo-600 border-none text-white"
        >
          {booking ? "Update Booking" : "Create Booking"}
        </Button>
      </Form.Item>        {/* Custom styling for Ant Design components */}
      <style>{`
        .custom-select .ant-select-selector {
          background-color: rgba(15, 23, 42, 0.8) !important;
          border-color: rgba(51, 65, 85, 0.5) !important;
          color: white !important;
        }
        
        .custom-datepicker {
          background-color: rgba(15, 23, 42, 0.8) !important;
          border-color: rgba(51, 65, 85, 0.5) !important;
          color: white !important;
        }
        
        .custom-textarea {
          background-color: rgba(15, 23, 42, 0.8) !important;
          border-color: rgba(51, 65, 85, 0.5) !important;
          color: white !important;
        }
        
        .custom-radio .ant-radio-wrapper {
          color: rgb(203, 213, 225) !important;
        }
        
        .ant-select-dropdown {
          background-color: rgba(15, 23, 42, 0.95) !important;
          backdrop-filter: blur(10px);
          border: 1px solid rgba(51, 65, 85, 0.5) !important;
        }
        
        .ant-select-item {
          color: rgb(203, 213, 225) !important;
        }
        
        .ant-select-item-option-selected:not(.ant-select-item-option-disabled) {
          background-color: rgba(2, 132, 199, 0.2) !important;
          color: white !important;
        }
        
        .ant-select-item-option-active:not(.ant-select-item-option-disabled) {
          background-color: rgba(51, 65, 85, 0.5) !important;
        }
        
        .ant-picker-panel {
          background-color: rgba(15, 23, 42, 0.95) !important;
          backdrop-filter: blur(10px);
          border: 1px solid rgba(51, 65, 85, 0.5) !important;
        }
        
        .ant-picker-header {
          color: rgb(203, 213, 225) !important;
          border-bottom: 1px solid rgba(51, 65, 85, 0.5) !important;
        }
        
        .ant-picker-header button {
          color: rgb(203, 213, 225) !important;
        }
        
        .ant-picker-cell {
          color: rgb(148, 163, 184) !important;
        }
        
        .ant-picker-cell-in-view {
          color: white !important;
        }
        
        .ant-picker-cell-selected .ant-picker-cell-inner {
          background-color: #0ea5e9 !important;
        }
        
        .ant-form-item-label > label {
          color: rgb(203, 213, 225) !important;
        }
      `}</style>
    </Form>
  );
};

export default BookingForm;