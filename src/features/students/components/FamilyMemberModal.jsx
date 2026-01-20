/**
 * Family Member Modal Component
 * 
 * Form modal for adding/editing family members
 * Includes validation and error handling
 */

import { useCallback, useEffect, useState, useMemo } from 'react';
import PropTypes from 'prop-types';
import {
  App,
  Button,
  DatePicker,
  Form,
  Input,
  Modal,
  Select,
  Typography,
  Alert,
} from 'antd';
import {
  UserAddOutlined,
  EditOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import familyApi from '../services/familyApi';
import useUnsavedChangesPrompt from '@/shared/hooks/useUnsavedChangesPrompt';
import { useAuth } from '@/shared/hooks/useAuth';

const { TextArea } = Input;
const { Text, Paragraph } = Typography;

// Relationships that require under-18 age
const CHILD_RELATIONSHIPS = ['son', 'daughter', 'child', 'sibling'];

const FamilyMemberModal = ({ open, member = null, onSubmit, onCancel, submitting = false }) => {
  const [form] = Form.useForm();
  const { modal } = App.useApp();
  const { user } = useAuth();
  const isEditing = Boolean(member);
  const [selectedRelationship, setSelectedRelationship] = useState(member?.relationship || 'child');
  const [isDirty, setIsDirty] = useState(false);

  const confirmClose = useCallback(() => new Promise((resolve) => {
    modal.confirm({
      title: 'Discard changes?',
      content: 'You have unsaved changes. Are you sure you want to close without saving?',
      okText: 'Discard',
      okType: 'danger',
      cancelText: 'Continue editing',
      onOk: () => resolve(true),
      onCancel: () => resolve(false),
    });
  }), [modal]);

  useUnsavedChangesPrompt(open && isDirty, { confirm: confirmClose });

  // Check if relationship is child-type (requires under-18)
  const isChildRelationship = useMemo(() => 
    CHILD_RELATIONSHIPS.includes(selectedRelationship), 
    [selectedRelationship]
  );

  // Auto-fill emergency contact with logged-in user's phone
  const defaultEmergencyContact = useMemo(() => {
    if (user?.phone) {
      return user.phone;
    }
    return '';
  }, [user]);

  // Reset form when modal opens/closes or member changes
  useEffect(() => {
    if (open) {
      if (member) {
        // Editing existing member
        form.setFieldsValue({
          full_name: member.full_name,
          date_of_birth: member.date_of_birth ? dayjs(member.date_of_birth) : null,
          relationship: member.relationship,
          gender: member.gender,
          medical_notes: member.medical_notes,
          emergency_contact: member.emergency_contact,
        });
        setSelectedRelationship(member.relationship || 'child');
      } else {
        // Adding new member - set defaults with auto-filled emergency contact
        form.resetFields();
        form.setFieldsValue({
          emergency_contact: defaultEmergencyContact,
        });
        setSelectedRelationship('child');
      }
      setIsDirty(false);
    } else {
      setIsDirty(false);
    }
  }, [open, member, form, defaultEmergencyContact]);

  const handleOk = async () => {
    try {
      const values = await form.validateFields();
      
      // Convert date to string format
      const formattedValues = {
        ...values,
        date_of_birth: values.date_of_birth ? values.date_of_birth.format('YYYY-MM-DD') : null,
      };

      // Validate using service layer
      const validation = familyApi.validateFamilyMember(formattedValues);
      
      if (!validation.valid) {
        // Show validation errors with better clarity
        const errorMessages = validation.errors.map((error) => ({
          name: 'date_of_birth', // Default to date field for age errors
          errors: [error],
        }));
        
        form.setFields(errorMessages);
        
        // Show a clearer error message for age restrictions
        if (validation.errors.some(err => err.includes('18'))) {
          modal.error({
            title: 'Age Requirement Not Met',
            content: 'Children, sons, daughters, and siblings must be under 18 years old. For adults, please select "Spouse" or "Parent" as the relationship.',
          });
        }
        return;
      }

      // Submit to parent
      await onSubmit(formattedValues);
      
      // Reset form on success
      form.resetFields();
      setIsDirty(false);
    } catch (error) {
      // Form validation failed - check if it's a field validation error or network error
      if (error?.errorFields && error.errorFields.length > 0) {
        // Ant Design validation errors - already displayed inline
        const firstError = error.errorFields[0];
        if (firstError.errors && firstError.errors.length > 0) {
          // Scroll to the first error field
          const fieldName = Array.isArray(firstError.name) ? firstError.name[0] : firstError.name;
          form.scrollToField(fieldName);
        }
      } else if (error?.message) {
        // Network or other errors
        modal.error({
          title: 'Failed to Save',
          content: error.message,
        });
      }
    }
  };

  // Handle relationship change to update date restrictions
  const handleRelationshipChange = (value) => {
    setSelectedRelationship(value);
    // Clear date if switching to child type and current date makes them 18+
    const currentDate = form.getFieldValue('date_of_birth');
    if (currentDate && CHILD_RELATIONSHIPS.includes(value)) {
      const age = familyApi.calculateAge(currentDate.format('YYYY-MM-DD'));
      if (age >= 18) {
        form.setFieldValue('date_of_birth', null);
      }
    }
  };

  const handleCancel = async () => {
    if (isDirty) {
      const shouldClose = await confirmClose();
      if (!shouldClose) {
        return;
      }
    }
    form.resetFields();
    setIsDirty(false);
    onCancel();
  };

  // Calculate date restrictions - only apply min date for child relationships
  const maxDate = dayjs(); // Can't be born in the future
  const minDate = isChildRelationship 
    ? dayjs().subtract(17, 'year').subtract(364, 'day') // Must be under 18
    : dayjs().subtract(120, 'year'); // Reasonable age limit

  return (
    <Modal
      open={open}
      title={null}
      footer={null}
      onCancel={handleCancel}
      width={600}
      destroyOnHidden
      styles={{ body: { padding: 0 } }}
    >
      {/* Modern gradient header */}
      <div className="bg-gradient-to-r from-emerald-600 to-teal-600 px-6 py-5 -mx-6 -mt-5 mb-0 rounded-t-lg">
        <h2 className="text-xl font-semibold text-white flex items-center gap-2">
          {isEditing ? (
            <>
              <EditOutlined /> Edit Family Member
            </>
          ) : (
            <>
              <UserAddOutlined /> Add Family Member
            </>
          )}
        </h2>
        <p className="text-emerald-100 text-sm mt-1">
          {isEditing ? 'Update the family member details below' : 'Add a family member to book activities on their behalf'}
        </p>
      </div>

      <div className="px-6 py-5">
        <Alert
          message={isChildRelationship ? "Age restriction applies" : "Add any family member"}
          description={isChildRelationship 
            ? "Children, sons, daughters, and siblings must be under 18 years old."
            : "You can add a spouse, parent, or any adult family member."
          }
          type="info"
          showIcon
          className="mb-5 rounded-lg"
        />

        <Form
          form={form}
          layout="vertical"
          requiredMark="optional"
          initialValues={{
            relationship: 'child',
            gender: undefined,
          }}
          onValuesChange={() => setIsDirty(true)}
        >
          {/* Section 1: Personal Info */}
          <section className="space-y-4 rounded-xl border border-slate-200/70 bg-slate-50/50 p-4 mb-5">
            <div className="border-b border-slate-200/70 pb-3 mb-3">
              <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Personal</p>
              <h3 className="text-base font-semibold text-slate-800">Basic Information</h3>
            </div>
            
            {/* Full Name */}
            <Form.Item
              label={<span className="font-medium text-slate-700">Full Name</span>}
              name="full_name"
              rules={[
                { required: true, message: 'Please enter the full name' },
                { min: 2, message: 'Name must be at least 2 characters' },
                { max: 255, message: 'Name must be less than 255 characters' },
              ]}
            >
              <Input
                placeholder="Enter full name"
                maxLength={255}
                autoFocus
                className="rounded-lg"
              />
            </Form.Item>

            {/* Relationship - placed before date so user sees age restriction info */}
            <Form.Item
              label={<span className="font-medium text-slate-700">Relationship</span>}
              name="relationship"
              rules={[
                { required: true, message: 'Please select relationship' },
              ]}
            >
              <Select 
                placeholder="Select relationship" 
                className="rounded-lg"
                onChange={handleRelationshipChange}
              >
                <Select.Option value="son">👦 Son</Select.Option>
                <Select.Option value="daughter">👧 Daughter</Select.Option>
                <Select.Option value="child">🧒 Child</Select.Option>
                <Select.Option value="spouse">💑 Spouse/Wife</Select.Option>
                <Select.Option value="sibling">👫 Sibling</Select.Option>
                <Select.Option value="parent">👨‍👩‍👧 Parent</Select.Option>
                <Select.Option value="other">👤 Other</Select.Option>
              </Select>
            </Form.Item>

            {/* Date of Birth */}
            <Form.Item
              label={<span className="font-medium text-slate-700">Date of Birth</span>}
              name="date_of_birth"
              rules={[
                { required: true, message: 'Please select date of birth' },
              ]}
              extra={<Text type="secondary">{isChildRelationship ? 'Must be under 18 years old' : 'Enter date of birth'}</Text>}
            >
              <DatePicker
                style={{ width: '100%' }}
                format="DD-MM-YYYY"
                placeholder="DD-MM-YYYY"
                maxDate={maxDate}
                minDate={minDate}
                showToday={false}
                className="rounded-lg"
              />
            </Form.Item>

            {/* Gender */}
            <Form.Item
              label={<span className="font-medium text-slate-700">Gender</span>}
              name="gender"
            >
              <Select placeholder="Select gender (optional)" allowClear className="rounded-lg">
                <Select.Option value="male">Male</Select.Option>
                <Select.Option value="female">Female</Select.Option>
                <Select.Option value="other">Other</Select.Option>
                <Select.Option value="prefer_not_to_say">Prefer not to say</Select.Option>
              </Select>
            </Form.Item>
          </section>

          {/* Section 2: Contact & Medical */}
          <section className="space-y-4 rounded-xl border border-slate-200/70 bg-slate-50/50 p-4 mb-5">
            <div className="border-b border-slate-200/70 pb-3 mb-3">
              <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Safety</p>
              <h3 className="text-base font-semibold text-slate-800">Emergency & Medical</h3>
            </div>

            {/* Emergency Contact */}
            <Form.Item
              label={<span className="font-medium text-slate-700">Emergency Contact</span>}
              name="emergency_contact"
              rules={[
                { max: 50, message: 'Emergency contact must be less than 50 characters' },
              ]}
            >
              <Input
                placeholder="Phone number or contact info (optional)"
                maxLength={50}
                className="rounded-lg"
              />
            </Form.Item>

            {/* Medical Notes */}
            <Form.Item
              label={<span className="font-medium text-slate-700">Medical Notes</span>}
              name="medical_notes"
              rules={[
                { max: 2000, message: 'Medical notes must be less than 2000 characters' },
              ]}
              extra={
                <Paragraph type="secondary" style={{ marginBottom: 0, marginTop: 4 }}>
                  🔒 Any allergies, medical conditions, or special needs. This information is encrypted and only accessible by authorized staff.
                </Paragraph>
              }
            >
              <TextArea
                rows={3}
                placeholder="Enter any medical information, allergies, or special needs (optional)"
                maxLength={2000}
                showCount
                className="rounded-lg"
              />
            </Form.Item>
          </section>

          {/* Action buttons */}
          <div className="flex justify-end gap-3 pt-2 border-t border-slate-200">
            <Button onClick={handleCancel} className="rounded-lg">
              Cancel
            </Button>
            <Button 
              type="primary" 
              onClick={handleOk}
              loading={submitting}
              className="rounded-lg bg-gradient-to-r from-emerald-600 to-teal-600 border-0 shadow-md hover:shadow-lg transition-all"
            >
              {isEditing ? 'Update' : 'Add Family Member'}
            </Button>
          </div>
        </Form>
      </div>
    </Modal>
  );
};

FamilyMemberModal.propTypes = {
  open: PropTypes.bool.isRequired,
  member: PropTypes.shape({
    id: PropTypes.string,
    full_name: PropTypes.string,
    date_of_birth: PropTypes.string,
    relationship: PropTypes.string,
    gender: PropTypes.string,
    medical_notes: PropTypes.string,
    emergency_contact: PropTypes.string,
    photo_url: PropTypes.string,
  }),
  onSubmit: PropTypes.func.isRequired,
  onCancel: PropTypes.func.isRequired,
  submitting: PropTypes.bool,
};

export default FamilyMemberModal;
