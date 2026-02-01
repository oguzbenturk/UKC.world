/* eslint-disable complexity */
/**
 * Public Form Page
 * Renders a form for public submission using link code
 * Supports multi-step forms with progress indicator
 * Now with branded layout support via theme_config
 * Service quick links are redirected to PublicQuickBooking page
 */

import { useState, useEffect, useContext, useRef, useLayoutEffect, useCallback } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { 
  Form,
  Button,
  Steps,
  Row,
  Typography,
  Spin,
  App,
  Modal,
  Input,
  Result
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
  // const { token } = theme.useToken();
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
  const [redirecting, setRedirecting] = useState(false);
  
  // Draft save state - must be declared here before any early returns
  const [lastSaved, setLastSaved] = useState(null);
  const [savingDraft, setSavingDraft] = useState(false);
  const [resumeEmailModalVisible, setResumeEmailModalVisible] = useState(false);
  const [resumeEmail, setResumeEmail] = useState('');  
  const [sendingResumeEmail, setSendingResumeEmail] = useState(false);

  // Ref for the form container (non-branded theme)
  const formContainerRef = useRef(null);

  // Scroll the viewport so the form container sits a bit below the top (offset)
  const scrollToFormStart = (offset = 140) => {
    if (!formContainerRef.current) return;
    const rect = formContainerRef.current.getBoundingClientRect();
    const top = rect.top + window.scrollY - offset;
    const scrollTarget = Math.max(0, Math.round(top));
    window.scrollTo({ top: scrollTarget, behavior: 'smooth' });
  };

  function getScrollableParent(element) {
    let parent = element.parentElement;
    while (parent) {
      const overflowY = window.getComputedStyle(parent).overflowY;
      if (overflowY === 'auto' || overflowY === 'scroll') {
        return parent;
      }
      parent = parent.parentElement;
    }
    return window;
  }

  const scrollToFormHeader = useCallback((offset = 28, maxWaitMs = 1000) => {
    const headerSelector = '.ant-typography.ant-typography-secondary';
    const header = document.querySelector(headerSelector);
    if (header) {
      const scrollParent = getScrollableParent(header);
      const rect = header.getBoundingClientRect();
      let scrollTarget;
      if (scrollParent === window) {
        const top = rect.top + window.scrollY - offset;
        scrollTarget = Math.max(0, Math.round(top));
        window.scrollTo({ top: scrollTarget, behavior: 'smooth' });
      } else {
        const parentRect = scrollParent.getBoundingClientRect();
        const top = rect.top - parentRect.top + scrollParent.scrollTop - offset;
        scrollTarget = Math.max(0, Math.round(top));
        scrollParent.scrollTo({ top: scrollTarget, behavior: 'smooth' });
      }
      return true;
    }
    // If not found, observe DOM for changes
    const observer = new MutationObserver((mutations, obs) => {
      const headerNow = document.querySelector(headerSelector);
      if (headerNow) {
        const scrollParent = getScrollableParent(headerNow);
        const rect = headerNow.getBoundingClientRect();
        let scrollTarget;
        if (scrollParent === window) {
          const top = rect.top + window.scrollY - offset;
          scrollTarget = Math.max(0, Math.round(top));
          window.scrollTo({ top: scrollTarget, behavior: 'smooth' });
        } else {
          const parentRect = scrollParent.getBoundingClientRect();
          const top = rect.top - parentRect.top + scrollParent.scrollTop - offset;
          scrollTarget = Math.max(0, Math.round(top));
          scrollParent.scrollTo({ top: scrollTarget, behavior: 'smooth' });
        }
        obs.disconnect();
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    // Stop observing after maxWaitMs
    setTimeout(() => observer.disconnect(), maxWaitMs);
    return true;
  }, []);

  // Scroll to form start whenever the current step changes (DOM will have updated)
  useLayoutEffect(() => {
    if (!formContainerRef.current) {
      return;
    }
    // Give the browser a frame to render updated DOM, then scroll
    requestAnimationFrame(() => {
      setTimeout(() => {
        // Try header first, fallback to container top
        const didScrollHeader = scrollToFormHeader(28);
        if (!didScrollHeader) scrollToFormStart(140);
      }, 50);
    });
  }, [currentStep, scrollToFormHeader]);

  // Fetch form template by link code
  useEffect(() => {
    const fetchForm = async () => {
      try {
        setLoading(true);
        setError(null);

        // First, try to fetch as a quick link to determine the type
        try {
          const quickLinkResponse = await apiClient.get(`/quick-links/public/${linkCode}`);
          const quickLink = quickLinkResponse.data;
          // If it's a service link, redirect to the PublicQuickBooking page
          // This page handles the registration form without requiring authentication
          if (quickLink.service_type && quickLink.service_id) {
            setRedirecting(true);
            setLoading(false);
            navigate(`/quick/${linkCode}`, { replace: true });
            return;
          }
          // If it's a form link, continue with form fetching below
          // Fall through to the form fetch logic
        } catch {
          // If quick link fetch fails, try as a regular form
        }

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
  }, [linkCode, searchParams, form, currentUser, navigate]);

  // If redirecting to a service page, show loading spinner
  if (redirecting) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Spin size="large" tip="Redirecting..." />
      </div>
    );
  }

  // Render error state first
  if (error) {
    return (
      <PublicFormLayout themeConfig={null} formName="">
        <div className="p-8">
          <Result
            status={error.status}
            title={error.title}
            subTitle={error.subTitle}
            extra={
              <Button type="primary" onClick={() => window.location.reload()}>
                Try Again
              </Button>
            }
          />
        </div>
      </PublicFormLayout>
    );
  }

  // If still loading or no form template, show loading
  if (loading || !formTemplate) {
    return (
      <PublicFormLayout themeConfig={null} formName="">
        <div className="flex items-center justify-center p-16">
          <Spin size="large" />
        </div>
      </PublicFormLayout>
    );
  }

  // Get current step data
  const steps = formTemplate?.steps || [];
  const currentStepData = steps[currentStep];
  const isLastStep = currentStep === steps.length - 1;
  const isFirstStep = currentStep === 0;

  // Calculate progress
  // const progressPercent = steps.length > 0 
  //   ? Math.round(((currentStep + 1) / steps.length) * 100) 
  //   : 0;

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
    } catch (err) {
      // Scroll to first error field if present
      if (err && err.errorFields && err.errorFields.length > 0) {
        const firstError = err.errorFields[0];
        const fieldNameArr = Array.isArray(firstError.name) ? firstError.name : [firstError.name];
        // Try to build selectors for AntD Form.Item and input descendants
        const selectorCandidates = [];
        // Try name attribute (simple fields)
        if (fieldNameArr.length === 1) {
          selectorCandidates.push(`[name="${fieldNameArr[0]}"]`);
        }
        // Try AntD data-name attribute (array fields)
        selectorCandidates.push(`[data-name='${JSON.stringify(fieldNameArr)}']`);
        // Try input/textarea/select inside Form.Item label
        selectorCandidates.push(
          `.ant-form-item [name="${fieldNameArr.join('.')}"]`,
          `.ant-form-item input[name$='${fieldNameArr[fieldNameArr.length-1]}']`,
          `.ant-form-item textarea[name$='${fieldNameArr[fieldNameArr.length-1]}']`,
          `.ant-form-item select[name$='${fieldNameArr[fieldNameArr.length-1]}']`
        );
        // Try by aria-label
        selectorCandidates.push(`[aria-label="${fieldNameArr[fieldNameArr.length-1]}"]`);
        // Try by id
        selectorCandidates.push(`#${fieldNameArr.join('_')}`);

        let el = null;
        for (const sel of selectorCandidates) {
          el = document.querySelector(sel);
          if (el) break;
        }
        // Fallback: scroll to parent .ant-form-item if found
        if (!el && selectorCandidates.length > 0) {
          const formItem = document.querySelector('.ant-form-item-has-error');
          if (formItem) el = formItem;
        }
        if (el && typeof el.scrollIntoView === 'function') {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          // Optionally, focus the field
          const focusable = el.querySelector('input,textarea,select') || el;
          if (typeof focusable.focus === 'function') focusable.focus();
        }
      }
      return false;
    }
  };

  // Save progress as draft
  const handleSaveDraft = async () => {
    if (!formTemplate?.session_id) return;
    try {
      setSavingDraft(true);
      // Use accumulated formValues for all steps
      await apiClient.post(`/public/forms/${linkCode}/save-draft`, {
        session_id: formTemplate.session_id,
        submission_data: formValues,
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
        await handleSaveDraft();
      }
      setCurrentStep(prev => prev + 1);
    }
  };

  // Handle previous step
  const handlePrevious = () => {
    setCurrentStep(prev => prev - 1);
  };

  // Handle form submission
  const handleSubmit = async () => {
    try {
      const isValid = await validateCurrentStep();
      if (!isValid) return;

      setSubmitting(true);

      // Use accumulated formValues for all steps
      const submissionData = {
        session_id: formTemplate.session_id,
        submission_data: formValues,
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
        // Navigate to success page with form settings for custom success message
        navigate(`/f/success/${linkCode}`, { 
          state: { 
            submissionId: response.data.submission_id,
            formName: formTemplate.form_name,
            submittedData: formValues,
            formSettings: formTemplate.settings,
            themeConfig: formTemplate.theme_config,
            successMessage: response.data.message,
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

  // Check if branded theme is enabled
  const hasBrandedTheme = formTemplate?.theme_config?.background?.type === 'image' || 
                          formTemplate?.theme_config?.branding?.show_header ||
                          formTemplate?.theme_config?.branding?.logo_url;

  // Render form
  // Use branded layout if theme_config has branding, otherwise use simple layout
  const formContent = (
    <>
      {/* Form Header */}
      <div className="p-4 sm:p-6 border-b">
        <Title level={3} className="mb-2 text-lg sm:text-xl md:text-2xl">
          {formTemplate.form_name}
        </Title>
        {formTemplate.description && (
          <Paragraph type="secondary" className="text-sm sm:text-base">
            {formTemplate.description}
          </Paragraph>
        )}
        
        {/* Multi-step progress */}
        {steps.length > 1 && (
          <div className="mt-4 overflow-x-auto">
            <Steps
              current={currentStep}
              size="small"
              responsive={false}
              direction="horizontal"
              className="min-w-max sm:min-w-0"
              items={steps.map((step, index) => ({
                title: <span className="text-xs sm:text-sm">{step.step_name}</span>,
                status: index < currentStep ? 'finish' : 
                        index === currentStep ? 'process' : 'wait',
              }))}
            />
          </div>
        )}
      </div>

      {/* Step Content */}
      <div className="p-4 sm:p-6">
        {currentStepData && (
          <>
            {/* Step header */}
            {steps.length > 1 && (
              <div className="mb-4 sm:mb-6">
                <Title level={4} className="mb-1 text-base sm:text-lg">
                  {currentStepData.step_name}
                </Title>
                {currentStepData.step_description && (
                  <Text type="secondary" className="text-sm">
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
              noValidate // Disable browser validation to allow permissive inputs
            >
              <Row gutter={[16, 16]}>
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
              <div className="flex flex-col-reverse sm:flex-row justify-between gap-3 mt-8 pt-4 border-t border-gray-200">
                <div className="flex flex-col sm:flex-row gap-2">
                  {!isFirstStep && (
                    <Button 
                      size="large"
                      icon={<ArrowLeftOutlined />}
                      onClick={handlePrevious}
                      disabled={submitting}
                      className="w-full sm:w-auto"
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
                        className="w-full sm:w-auto"
                      >
                        {lastSaved ? 'Saved ✓' : 'Save Progress'}
                      </Button>
                      <Button
                        size="large"
                        icon={<MailOutlined />}
                        onClick={() => setResumeEmailModalVisible(true)}
                        className="w-full sm:w-auto"
                      >
                        Email Resume Link
                      </Button>
                    </>
                  )}
                </div>
                <div className="w-full sm:w-auto">
                  {isLastStep ? (
                    <Button 
                      type="primary" 
                      size="large"
                      icon={<CheckCircleOutlined />}
                      htmlType="submit"
                      loading={submitting}
                      className="w-full sm:w-auto"
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
                      className="w-full sm:w-auto"
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
    <div ref={formContainerRef}>
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
            {formContent}
          </div>
        </div>
      )}
      {/* Resume Email Modal and any other modals/footers */}
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
    </div>
  );
};

export default PublicFormPage;
