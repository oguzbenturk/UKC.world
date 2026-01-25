/**
 * Form Preview Page
 * Standalone page for previewing a form template with theme branding support
 * Renders outside the main app layout (no sidebar/navbar) for full-screen branded preview
 */

/* eslint-disable complexity */

import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button, Spin, Result, Space, Typography, FloatButton } from 'antd';
import { ArrowLeftOutlined, EditOutlined, BgColorsOutlined } from '@ant-design/icons';
import { useAuth } from '@/shared/hooks/useAuth';
import { hasPermission, ROLES } from '@/shared/utils/roleUtils';
import * as formService from '../services/formService';
import FormPreview from '../components/FormPreview';
import PublicFormLayout from '../components/PublicFormLayout';

const { Text } = Typography;

const FormPreviewPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { isAuthenticated, loading: authLoading, user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [template, setTemplate] = useState(null);
  const [steps, setSteps] = useState([]);
  const [error, setError] = useState(null);
  const [showBrandedPreview, setShowBrandedPreview] = useState(true);

  // Check authorization - only managers and admins can preview forms
  const isAuthorized = isAuthenticated && user && hasPermission(user.role, [ROLES.MANAGER, ROLES.ADMIN, ROLES.DEVELOPER]);

  // Redirect unauthorized users
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      navigate('/login', { replace: true });
    } else if (!authLoading && isAuthenticated && !isAuthorized) {
      navigate('/', { replace: true });
    }
  }, [authLoading, isAuthenticated, isAuthorized, navigate]);

  const loadForm = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      // Load template
      const templateData = await formService.getFormTemplate(id);
      setTemplate(templateData);
      
      // Load steps with fields
      const stepsData = await formService.getFormSteps(id);
      
      // Load fields for each step
      const stepsWithFields = await Promise.all(
        stepsData.map(async (step) => {
          const fields = await formService.getFormFields(step.id);
          return { ...step, fields };
        })
      );
      
      setSteps(stepsWithFields.sort((a, b) => a.order_index - b.order_index));
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Error loading form for preview:', err);
      setError(err.message || 'Failed to load form');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadForm();
  }, [loadForm]);

  // Debug: log theme config
  useEffect(() => {
    if (template?.theme_config) {
      console.log('📋 Template theme_config:', JSON.stringify(template.theme_config, null, 2));
    }
  }, [template]);

  // Check if form has branded theme
  const hasBrandedTheme = template?.theme_config?.background?.type === 'image' || 
                          template?.theme_config?.branding?.show_header ||
                          template?.theme_config?.branding?.logo_url;

  // Show loading while checking auth or loading form
  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Spin size="large" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Result
          status="error"
          title="Failed to Load Form"
          subTitle={error}
          extra={[
            <Button key="back" onClick={() => navigate('/forms')}>
              Back to Forms
            </Button>,
          ]}
        />
      </div>
    );
  }

  // Render with branded layout if theme is configured and enabled
  if (hasBrandedTheme && showBrandedPreview) {
    return (
      <>
        <PublicFormLayout
          themeConfig={template.theme_config}
          formName={template.name}
        >
          <FormPreview
            template={template}
            steps={steps}
            showStepNavigation={true}
            embedded={true}
          />
        </PublicFormLayout>
        
        {/* Floating action buttons for preview controls */}
        <FloatButton.Group shape="square" style={{ right: 24 }}>
          <FloatButton
            icon={<ArrowLeftOutlined />}
            tooltip="Back to Forms"
            onClick={() => navigate('/forms')}
          />
          <FloatButton
            icon={<EditOutlined />}
            tooltip="Edit Form"
            onClick={() => navigate(`/forms/builder/${id}`)}
          />
          <FloatButton
            icon={<BgColorsOutlined />}
            tooltip="Toggle Theme Preview"
            onClick={() => setShowBrandedPreview(false)}
          />
        </FloatButton.Group>
      </>
    );
  }

  // Standard preview without branding
  return (
    <div className="min-h-screen bg-gray-50 py-8">
      {/* Header */}
      <div className="max-w-2xl mx-auto px-4 mb-6">
        <div className="flex items-center justify-between">
          <Space>
            <Button
              icon={<ArrowLeftOutlined />}
              onClick={() => navigate('/forms')}
            >
              Back to Forms
            </Button>
            <Button
              type="primary"
              icon={<EditOutlined />}
              onClick={() => navigate(`/forms/builder/${id}`)}
            >
              Edit Form
            </Button>
            {hasBrandedTheme && (
              <Button
                icon={<BgColorsOutlined />}
                onClick={() => setShowBrandedPreview(true)}
              >
                Show Branded
              </Button>
            )}
          </Space>
          <Text type="secondary">Preview Mode</Text>
        </div>
      </div>

      {/* Form Preview */}
      <FormPreview
        template={template}
        steps={steps}
        showStepNavigation={true}
        embedded={false}
      />
    </div>
  );
};

export default FormPreviewPage;
