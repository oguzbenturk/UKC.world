/* eslint-disable complexity */
/**
 * Public Form Page
 * Renders a form for public submission using link code
 * Supports multi-step forms with progress indicator
 * Now with branded layout support via theme_config
 */

import { useState, useEffect, useContext } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { 
  Form, 
  Card, 
  Button, 
  Steps, 
  Row,
  Typography,
  Spin,
  Result,
  Progress,
  App,
  theme,
  Modal,
  Input
} from 'antd';
import { 
  ArrowLeftOutlined, 
  ArrowRightOutlined, 
  CheckCircleOutlined,
  MailOutlined,
  SaveOutlined
} from '@ant-design/icons';
import DynamicField from '../components/DynamicField';
import PublicFormLayout from '../components/PublicFormLayout';
import apiClient from '@/shared/services/apiClient';
import { logger } from '@/shared/utils/logger';
import { AuthContext } from '@/shared/contexts/AuthContext';
import { FIELD_TYPES } from '../constants/fieldTypes';

const { Title, Paragraph, Text } = Typography;

/**
 * Maps user profile fields to form field types for auto-fill
 */
const getAutoFillValue = (field, user) => {
  if (!user) return null;
  
  // Map by field type
  switch (field.field_type) {
    case FIELD_TYPES.EMAIL:
      return user.email || null;
    case FIELD_TYPES.PHONE:
      return user.phone || null;
    case FIELD_TYPES.COUNTRY:
      return user.nationality || user.country || null;
    default:
      break;
  }
  
  // Map by field name patterns
  const fieldName = (field.field_name || '').toLowerCase();
  
  if (fieldName.includes('email')) {
    return user.email || null;
  }
  if (fieldName.includes('first_name') || fieldName.includes('firstname')) {
    return user.first_name || null;
  }
  if (fieldName.includes('last_name') || fieldName.includes('lastname') || fieldName.includes('surname')) {
    return user.last_name || null;
  }
  if (fieldName.includes('full_name') || fieldName === 'name') {
    return user.name || `${user.first_name || ''} ${user.last_name || ''}`.trim() || null;
  }
  if (fieldName.includes('phone') || fieldName.includes('mobile') || fieldName.includes('tel')) {
    return user.phone || null;
  }
  if (fieldName.includes('country') || fieldName.includes('nationality')) {
    return user.nationality || user.country || null;
  }
  
  return null;
};

const PublicFormPage = () => {
  const { linkCode } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [form] = Form.useForm();
  const { token } = theme.useToken();
  const { message } = App.useApp();
  
  // Try to get authenticated user (may not exist if not logged in)
  const authContext = useContext(AuthContext);
  const currentUser = authContext?.isAuthenticated ? authContext.user : null;

  // State
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [formTemplate, setFormTemplate] = useState(null);
  const [currentStep, setCurrentStep] = useState(0);
  const [formValues, setFormValues] = useState({});
  const [error, setError] = useState(null);

  // Fetch form template by link code
  useEffect(() => {
    const fetchForm = async () => {
      try {
        setLoading(true);
        setError(null);

        const response = await apiClient.get(`/public/forms/${linkCode}`);
        
        if (response.data) {
          const formData = response.data;
          
          // Check if form is published
          if (formData.status !== 'published') {
            setError({
              status: 'warning',
              title: 'Form Not Available',
              subTitle: 'This form is not currently accepting submissions.',
            });
            return;
          }

          // Sort steps and fields
          if (formData.steps) {
            formData.steps.sort((a, b) => a.step_order - b.step_order);
            formData.steps.forEach(step => {
              if (step.fields) {
                step.fields.sort((a, b) => a.field_order - b.field_order);
              }
            });
          }

          setFormTemplate(formData);
          
          // Auto-fill from logged-in user profile (if enabled in form settings)
          const autoFillData = {};
          if (formData.settings?.prefill_from_user && currentUser) {
            const allFields = formData.steps?.flatMap(step => step.fields || []) || [];
            allFields.forEach(field => {
              const autoFillValue = getAutoFillValue(field, currentUser);
              if (autoFillValue !== null) {
                autoFillData[field.field_name] = autoFillValue;
              }
            });
          }
          
          // Pre-fill from URL params (overrides auto-fill)
          const prefillData = { ...autoFillData };
          for (const [key, value] of searchParams.entries()) {
            if (key !== 'utm_source' && key !== 'utm_medium' && key !== 'utm_campaign') {
              prefillData[key] = value;
            }
          }
          if (Object.keys(prefillData).length > 0) {
            setFormValues(prefillData);
            form.setFieldsValue(prefillData);
          }
        }
      } catch (err) {
        logger.error('Error fetching form:', err);
        if (err.response?.status === 404) {
          setError({
            status: 'error',
            title: 'Form Not Found',
            subTitle: 'The form you are looking for does not exist or has been removed.',
          });
        } else {
          setError({
            status: 'error',
            title: 'Error Loading Form',
            subTitle: 'There was an error loading the form. Please try again later.',
          });
        }
      } finally {
        setLoading(false);
      }
    };

    if (linkCode) {
      fetchForm();
    }
  }, [linkCode, searchParams, form, currentUser]);

  // Get current step data
  const steps = formTemplate?.steps || [];
  const currentStepData = steps[currentStep];
  const isLastStep = currentStep === steps.length - 1;
  const isFirstStep = currentStep === 0;

  // Calculate progress
  const progressPercent = steps.length > 0 
    ? Math.round(((currentStep + 1) / steps.length) * 100) 
    : 0;

  // Handle form value changes
  const handleValuesChange = (changedValues, allValues) => {
    setFormValues(prev => ({ ...prev, ...allValues }));
  };

  // Validate current step
  const validateCurrentStep = async () => {
    const fieldsToValidate = currentStepData?.fields?.map(f => f.field_name) || [];
    try {
      await form.validateFields(fieldsToValidate);
      return true;
    } catch {
      return false;
    }
  };

  // Auto-save draft when step changes or values change
  const [lastSaved, setLastSaved] = useState(null);
  const [savingDraft, setSavingDraft] = useState(false);
  const [resumeEmailModalVisible, setResumeEmailModalVisible] = useState(false);
  const [resumeEmail, setResumeEmail] = useState('');
  const [sendingResumeEmail, setSendingResumeEmail] = useState(false);

  // Save progress as draft
  const handleSaveDraft = async () => {
    if (!formTemplate?.session_id) return;
    
    try {
      setSavingDraft(true);
      const allValues = form.getFieldsValue(true);
      
      await apiClient.post(`/public/forms/${linkCode}/save-draft`, {
        session_id: formTemplate.session_id,
        submission_data: allValues,
        current_step: currentStep,
        metadata: {
          saved_at: new Date().toISOString()
        }
      });
      
      setLastSaved(new Date());
      message.success('Progress saved', 1);
    } catch (err) {
      logger.error('Error saving draft:', err);
      message.error('Failed to save progress');
    } finally {
      setSavingDraft(false);
    }
  };

  // Send resume link email
  const handleSendResumeEmail = async () => {
    if (!resumeEmail || !formTemplate?.session_id) return;

    try {
      setSendingResumeEmail(true);
      
      // First save the current progress
      const allValues = form.getFieldsValue(true);
      await apiClient.post(`/public/forms/${linkCode}/save-draft`, {
        session_id: formTemplate.session_id,
        submission_data: allValues,
        current_step: currentStep,
        metadata: { saved_at: new Date().toISOString() }
      });
      
      // Then send the resume email
      await apiClient.post(`/public/forms/${linkCode}/send-resume-link`, {
        session_id: formTemplate.session_id,
        email: resumeEmail
      });
      
      message.success('Resume link sent to your email!');
      setResumeEmailModalVisible(false);
      setResumeEmail('');
    } catch (err) {
      logger.error('Error sending resume email:', err);
      message.error('Failed to send resume link');
    } finally {
      setSendingResumeEmail(false);
    }
  };

  // Handle next step
  const handleNext = async () => {
    const isValid = await validateCurrentStep();
    if (isValid) {
      // Save draft when navigating to next step
      if (formTemplate?.settings?.allow_save_progress) {
        handleSaveDraft();
      }
      setCurrentStep(prev => prev + 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  // Handle previous step
  const handlePrevious = () => {
    setCurrentStep(prev => prev - 1);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Handle form submission
  const handleSubmit = async () => {
    try {
      const isValid = await validateCurrentStep();
      if (!isValid) return;

      setSubmitting(true);

      // Collect all form values
      const allValues = form.getFieldsValue(true);

      // Add metadata
      const submissionData = {
        session_id: formTemplate.session_id,
        submission_data: allValues,
        metadata: {
          submitted_at: new Date().toISOString(),
          user_agent: navigator.userAgent,
          referrer: document.referrer,
          utm_source: searchParams.get('utm_source'),
          utm_medium: searchParams.get('utm_medium'),
          utm_campaign: searchParams.get('utm_campaign'),
        },
      };

      const response = await apiClient.post(`/public/forms/${linkCode}/submit`, submissionData);

      if (response.data?.submission_id) {
        // Navigate to success page
        navigate(`/f/success/${linkCode}`, { 
          state: { 
            submissionId: response.data.submission_id,
            formName: formTemplate.form_name,
            submittedData: allValues,
          },
          replace: true,
        });
      }
    } catch (err) {
      logger.error('Submission error:', err);
      message.error(
        err.response?.data?.error || 'Failed to submit form. Please try again.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  // Render loading state
  if (loading) {
    return (
      <PublicFormLayout themeConfig={null} formName="">
        <div className="flex items-center justify-center p-16">
          <Spin size="large" />
        </div>
      </PublicFormLayout>
    );
  }

  // Render error state
  if (error) {
    return (
      <PublicFormLayout themeConfig={null} formName="">
        <div className="p-8">
          <Result
            status={error.status}
            title={error.title}
            subTitle={error.subTitle}
            extra={
              <Button type="primary" onClick={() => navigate('/')}>
                Go to Homepage
              </Button>
            }
          />
        </div>
      </PublicFormLayout>
    );
  }

  // Check if branded theme is enabled
  const hasBrandedTheme = formTemplate?.theme_config?.background?.type === 'image' || 
                          formTemplate?.theme_config?.branding?.show_header ||
                          formTemplate?.theme_config?.branding?.logo_url;

  // Render form
  // Use branded layout if theme_config has branding, otherwise use simple layout
  const formContent = (
    <>
      {/* Form Header */}
      <div 
        className="p-6 border-b"
        style={{ borderTop: `4px solid ${token.colorPrimary}` }}
      >
        <Title level={3} className="mb-2">
          {formTemplate.form_name}
        </Title>
        {formTemplate.description && (
          <Paragraph type="secondary">
            {formTemplate.description}
          </Paragraph>
        )}
        
        {/* Multi-step progress */}
        {steps.length > 1 && (
          <div className="mt-4">
            <Progress 
              percent={progressPercent} 
              showInfo={false}
              strokeColor={token.colorPrimary}
            />
            <div className="mt-2">
              <Steps
                current={currentStep}
                size="small"
                items={steps.map((step, index) => ({
                  title: step.step_name,
                  status: index < currentStep ? 'finish' : 
                          index === currentStep ? 'process' : 'wait',
                }))}
              />
            </div>
          </div>
        )}
      </div>

      {/* Step Content */}
      <div className="p-6">
        {currentStepData && (
          <>
            {/* Step header */}
            {steps.length > 1 && (
              <div className="mb-6">
                <Title level={4} className="mb-1">
                  {currentStepData.step_name}
                </Title>
                {currentStepData.step_description && (
                  <Text type="secondary">
                    {currentStepData.step_description}
                  </Text>
                )}
              </div>
            )}

            {/* Form fields */}
            <Form
              form={form}
              layout="vertical"
              onValuesChange={handleValuesChange}
              onFinish={handleSubmit}
              requiredMark="optional"
            >
              <Row gutter={[16, 0]}>
                {currentStepData.fields?.map(field => (
                  <DynamicField
                    key={field.id || field.field_name}
                    field={field}
                    form={form}
                    allValues={formValues}
                    disabled={submitting}
                  />
                ))}
              </Row>

              {/* Navigation buttons */}
              <div className="flex justify-between mt-8 pt-4 border-t border-gray-200">
                <div className="flex gap-2">
                  {!isFirstStep && (
                    <Button 
                      size="large"
                      icon={<ArrowLeftOutlined />}
                      onClick={handlePrevious}
                      disabled={submitting}
                    >
                      Previous
                    </Button>
                  )}
                  {/* Save Progress button */}
                  {formTemplate.settings?.allow_save_progress && (
                    <>
                      <Button
                        size="large"
                        icon={<SaveOutlined />}
                        onClick={handleSaveDraft}
                        loading={savingDraft}
                      >
                        {lastSaved ? 'Saved ✓' : 'Save Progress'}
                      </Button>
                      <Button
                        size="large"
                        icon={<MailOutlined />}
                        onClick={() => setResumeEmailModalVisible(true)}
                      >
                        Email Resume Link
                      </Button>
                    </>
                  )}
                </div>
                <div>
                  {isLastStep ? (
                    <Button 
                      type="primary" 
                      size="large"
                      icon={<CheckCircleOutlined />}
                      htmlType="submit"
                      loading={submitting}
                    >
                      {formTemplate.settings?.submit_button_text || 'Submit'}
                    </Button>
                  ) : (
                    <Button 
                      type="primary" 
                      size="large"
                      icon={<ArrowRightOutlined />}
                      onClick={handleNext}
                      disabled={submitting}
                    >
                      Next
                    </Button>
                  )}
                </div>
              </div>
            </Form>
          </>
        )}
      </div>
    </>
  );

  return (
    <>
      {hasBrandedTheme ? (
        <PublicFormLayout 
          themeConfig={formTemplate.theme_config}
          formName={formTemplate.form_name}
        >
          {formContent}
        </PublicFormLayout>
      ) : (
        <div className="min-h-screen bg-gray-50 py-8 px-4">
          <div className="max-w-3xl mx-auto">
            <Card 
              className="mb-4"
              style={{ borderTop: `4px solid ${token.colorPrimary}` }}
            >
              <Title level={3} className="mb-2">
                {formTemplate.form_name}
              </Title>
              {formTemplate.description && (
                <Paragraph type="secondary">
                  {formTemplate.description}
                </Paragraph>
              )}
              
              {/* Multi-step progress */}
              {steps.length > 1 && (
                <div className="mt-4">
                  <Progress 
                    percent={progressPercent} 
                    showInfo={false}
                    strokeColor={token.colorPrimary}
                  />
                  <div className="mt-2">
                    <Steps
                      current={currentStep}
                      size="small"
                      items={steps.map((step, index) => ({
                        title: step.step_name,
                        status: index < currentStep ? 'finish' : 
                                index === currentStep ? 'process' : 'wait',
                      }))}
                    />
                  </div>
                </div>
              )}
            </Card>

            {/* Step Content */}
            <Card className="mb-4">
              {currentStepData && (
                <>
                  {/* Step header */}
                  {steps.length > 1 && (
                    <div className="mb-6">
                      <Title level={4} className="mb-1">
                        {currentStepData.step_name}
                      </Title>
                      {currentStepData.step_description && (
                        <Text type="secondary">
                          {currentStepData.step_description}
                        </Text>
                      )}
                    </div>
                  )}

                  {/* Form fields */}
                  <Form
                    form={form}
                    layout="vertical"
                    onValuesChange={handleValuesChange}
                    onFinish={handleSubmit}
                    requiredMark="optional"
                  >
                    <Row gutter={[16, 0]}>
                      {currentStepData.fields?.map(field => (
                        <DynamicField
                          key={field.id || field.field_name}
                          field={field}
                          form={form}
                          allValues={formValues}
                          disabled={submitting}
                        />
                      ))}
                    </Row>

                    {/* Navigation buttons */}
                    <div className="flex justify-between mt-8 pt-4 border-t border-gray-200">
                      <div className="flex gap-2">
                        {!isFirstStep && (
                          <Button 
                            size="large"
                            icon={<ArrowLeftOutlined />}
                            onClick={handlePrevious}
                            disabled={submitting}
                          >
                            Previous
                          </Button>
                        )}
                        {/* Save Progress button */}
                        {formTemplate.settings?.allow_save_progress && (
                          <>
                            <Button
                              size="large"
                              icon={<SaveOutlined />}
                              onClick={handleSaveDraft}
                              loading={savingDraft}
                            >
                              {lastSaved ? 'Saved ✓' : 'Save Progress'}
                            </Button>
                            <Button
                              size="large"
                              icon={<MailOutlined />}
                              onClick={() => setResumeEmailModalVisible(true)}
                            >
                              Email Resume Link
                            </Button>
                          </>
                        )}
                      </div>
                      <div>
                        {isLastStep ? (
                          <Button 
                            type="primary" 
                            size="large"
                            icon={<CheckCircleOutlined />}
                            htmlType="submit"
                            loading={submitting}
                          >
                            {formTemplate.settings?.submit_button_text || 'Submit'}
                          </Button>
                        ) : (
                          <Button 
                            type="primary" 
                            size="large"
                            icon={<ArrowRightOutlined />}
                            onClick={handleNext}
                            disabled={submitting}
                          >
                            Next
                          </Button>
                        )}
                      </div>
                    </div>
                  </Form>
                </>
              )}
            </Card>

            {/* Footer */}
            <div className="text-center text-gray-500 text-sm">
              <Text type="secondary">
                {formTemplate.settings?.footer_text || 'Powered by UKC.world'}
              </Text>
            </div>
          </div>
        </div>
      )}

      {/* Resume Email Modal */}
      <Modal
        title="Send Resume Link"
        open={resumeEmailModalVisible}
        onCancel={() => setResumeEmailModalVisible(false)}
        onOk={handleSendResumeEmail}
        confirmLoading={sendingResumeEmail}
        okText="Send Link"
        okButtonProps={{ disabled: !resumeEmail }}
      >
        <div className="py-4">
          <p className="text-gray-600 mb-4">
            Enter your email address and we&apos;ll send you a link to continue this form later.
            The link will be valid for 7 days.
          </p>
          <Input
            type="email"
            size="large"
            prefix={<MailOutlined />}
            placeholder="your.email@example.com"
            value={resumeEmail}
            onChange={(e) => setResumeEmail(e.target.value)}
            onPressEnter={handleSendResumeEmail}
          />
        </div>
      </Modal>
    </>
  );
};

export default PublicFormPage;
