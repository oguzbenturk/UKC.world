/**
 * Family Member Modal Component
 * 
 * Form modal for adding/editing family members
 * Includes validation and error handling
 */

import { useCallback, useEffect, useState, useMemo } from 'react';
import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation(['student']);
  const [form] = Form.useForm();
  const { modal } = App.useApp();
  const { user } = useAuth();
  const isEditing = Boolean(member);
  const [selectedRelationship, setSelectedRelationship] = useState(member?.relationship || 'child');
  const [isDirty, setIsDirty] = useState(false);

  const confirmClose = useCallback(() => new Promise((resolve) => {
    modal.confirm({
      title: t('student:family.modal.discardConfirm.title'),
      content: t('student:family.modal.discardConfirm.content'),
      okText: t('student:family.modal.discardConfirm.okText'),
      okType: 'danger',
      cancelText: t('student:family.modal.discardConfirm.cancelText'),
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
            title: t('student:family.modal.ageError.title'),
            content: t('student:family.modal.ageError.content'),
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
          title: t('student:family.modal.saveError.title'),
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
        <h2 className="text-xl font-duotone-bold-extended text-white flex items-center gap-2">
          {isEditing ? (
            <>
              <EditOutlined /> {t('student:family.modal.editTitle')}
            </>
          ) : (
            <>
              <UserAddOutlined /> {t('student:family.modal.addTitle')}
            </>
          )}
        </h2>
        <p className="text-emerald-100 text-sm mt-1">
          {isEditing ? t('student:family.modal.editSubtitle') : t('student:family.modal.addSubtitle')}
        </p>
      </div>

      <div className="px-6 py-5">
        <Alert
          message={isChildRelationship ? t('student:family.modal.ageAlert.childTitle') : t('student:family.modal.ageAlert.adultTitle')}
          description={isChildRelationship
            ? t('student:family.modal.ageAlert.childDesc')
            : t('student:family.modal.ageAlert.adultDesc')
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
              <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">{t('student:family.modal.sections.personal')}</p>
              <h3 className="text-base font-duotone-bold text-slate-800">{t('student:family.modal.sections.basicInfo')}</h3>
            </div>
            
            {/* Full Name */}
            <Form.Item
              label={<span className="font-medium text-slate-700">{t('student:family.modal.fields.fullName')}</span>}
              name="full_name"
              rules={[
                { required: true, message: t('student:family.modal.validation.nameRequired') },
                { min: 2, message: t('student:family.modal.validation.nameMin') },
                { max: 255, message: t('student:family.modal.validation.nameMax') },
              ]}
            >
              <Input
                placeholder={t('student:family.modal.fields.fullNamePlaceholder')}
                maxLength={255}
                autoFocus
                className="rounded-lg"
              />
            </Form.Item>

            {/* Relationship - placed before date so user sees age restriction info */}
            <Form.Item
              label={<span className="font-medium text-slate-700">{t('student:family.modal.fields.relationship')}</span>}
              name="relationship"
              rules={[
                { required: true, message: t('student:family.modal.validation.relationshipRequired') },
              ]}
            >
              <Select
                placeholder={t('student:family.modal.fields.relationshipPlaceholder')}
                className="rounded-lg"
                onChange={handleRelationshipChange}
              >
                <Select.Option value="son">👦 {t('student:family.modal.relationships.son')}</Select.Option>
                <Select.Option value="daughter">👧 {t('student:family.modal.relationships.daughter')}</Select.Option>
                <Select.Option value="child">🧒 {t('student:family.modal.relationships.child')}</Select.Option>
                <Select.Option value="spouse">💑 {t('student:family.modal.relationships.spouse')}</Select.Option>
                <Select.Option value="sibling">👫 {t('student:family.modal.relationships.sibling')}</Select.Option>
                <Select.Option value="parent">👨‍👩‍👧 {t('student:family.modal.relationships.parent')}</Select.Option>
                <Select.Option value="other">👤 {t('student:family.modal.relationships.other')}</Select.Option>
              </Select>
            </Form.Item>

            {/* Date of Birth */}
            <Form.Item
              label={<span className="font-medium text-slate-700">{t('student:family.modal.fields.dateOfBirth')}</span>}
              name="date_of_birth"
              rules={[
                { required: true, message: t('student:family.modal.validation.dobRequired') },
              ]}
              extra={<Text type="secondary">{isChildRelationship ? t('student:family.modal.fields.dobUnderAge') : t('student:family.modal.fields.dobEnter')}</Text>}
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
              label={<span className="font-medium text-slate-700">{t('student:family.modal.fields.gender')}</span>}
              name="gender"
            >
              <Select placeholder={t('student:family.modal.fields.genderPlaceholder')} allowClear className="rounded-lg">
                <Select.Option value="male">{t('student:family.modal.genderOptions.male')}</Select.Option>
                <Select.Option value="female">{t('student:family.modal.genderOptions.female')}</Select.Option>
                <Select.Option value="other">{t('student:family.modal.genderOptions.other')}</Select.Option>
                <Select.Option value="prefer_not_to_say">{t('student:family.modal.genderOptions.preferNotToSay')}</Select.Option>
              </Select>
            </Form.Item>
          </section>

          {/* Section 2: Contact & Medical */}
          <section className="space-y-4 rounded-xl border border-slate-200/70 bg-slate-50/50 p-4 mb-5">
            <div className="border-b border-slate-200/70 pb-3 mb-3">
              <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">{t('student:family.modal.sections.safety')}</p>
              <h3 className="text-base font-duotone-bold text-slate-800">{t('student:family.modal.sections.emergencyMedical')}</h3>
            </div>

            {/* Emergency Contact */}
            <Form.Item
              label={<span className="font-medium text-slate-700">{t('student:family.modal.fields.emergencyContact')}</span>}
              name="emergency_contact"
              rules={[
                { max: 50, message: t('student:family.modal.validation.emergencyMax') },
              ]}
            >
              <Input
                placeholder={t('student:family.modal.fields.emergencyPlaceholder')}
                maxLength={50}
                className="rounded-lg"
              />
            </Form.Item>

            {/* Medical Notes */}
            <Form.Item
              label={<span className="font-medium text-slate-700">{t('student:family.modal.fields.medicalNotes')}</span>}
              name="medical_notes"
              rules={[
                { max: 2000, message: t('student:family.modal.validation.medicalMax') },
              ]}
              extra={
                <Paragraph type="secondary" style={{ marginBottom: 0, marginTop: 4 }}>
                  🔒 {t('student:family.modal.fields.medicalHint')}
                </Paragraph>
              }
            >
              <TextArea
                rows={3}
                placeholder={t('student:family.modal.fields.medicalPlaceholder')}
                maxLength={2000}
                showCount
                className="rounded-lg"
              />
            </Form.Item>
          </section>

          {/* Action buttons */}
          <div className="flex justify-end gap-3 pt-2 border-t border-slate-200">
            <Button onClick={handleCancel} className="rounded-lg">
              {t('student:family.modal.buttons.cancel')}
            </Button>
            <Button
              type="primary"
              onClick={handleOk}
              loading={submitting}
              className="rounded-lg bg-gradient-to-r from-emerald-600 to-teal-600 border-0 shadow-md hover:shadow-lg transition-all"
            >
              {isEditing ? t('student:family.modal.buttons.update') : t('student:family.modal.buttons.add')}
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
