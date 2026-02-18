/**
 * Form Success Page
 * Displayed after successful form submission
 * Shows confirmation and next steps
 * Supports custom success messages and branded layout
 */

import { useEffect, useMemo } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import { 
  Result, 
  Card, 
  Button, 
  Typography, 
  Descriptions,
  Space,
  Divider,
  Alert,
  theme
} from 'antd';
import { 
  CheckCircleFilled, 
  HomeOutlined, 
  FormOutlined,
  PrinterOutlined
} from '@ant-design/icons';
import PublicFormLayout from '../components/PublicFormLayout';
import { sanitizeHtml } from '@/shared/utils/sanitizeHtml';

const { Text, Paragraph, Title } = Typography;

const FormSuccessPage = () => {
  const { linkCode } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { token } = theme.useToken();

  // Get submission data from navigation state
  const { 
    submissionId, 
    formName, 
    submittedData,
    formSettings,
    themeConfig,
    successMessage 
  } = location.state || {};

  // Redirect if no submission data
  useEffect(() => {
    if (!submissionId && !formName) {
      navigate(`/f/${linkCode}`, { replace: true });
    }
  }, [submissionId, formName, linkCode, navigate]);

  // Handle print
  const handlePrint = () => {
    window.print();
  };

  // Format value for display
  const formatValue = (value) => {
    if (value === null || value === undefined) return '-';
    if (Array.isArray(value)) return value.join(', ');
    if (typeof value === 'object') {
      // Handle address or complex objects
      return Object.entries(value)
        .filter(([, v]) => v)
        .map(([, v]) => v)
        .join(', ');
    }
    if (typeof value === 'boolean') return value ? 'Yes' : 'No';
    return String(value);
  };

  // Check if we should show the branded layout
  const hasBrandedTheme = useMemo(() => {
    return themeConfig?.background?.type === 'image' || 
           themeConfig?.branding?.show_header ||
           themeConfig?.branding?.logo_url;
  }, [themeConfig]);

  // Check if we have a custom success message (HTML content)
  const hasCustomSuccessMessage = useMemo(() => {
    const msg = formSettings?.success_message;
    return msg && msg.includes('<') && msg.includes('>');
  }, [formSettings?.success_message]);

  // Custom success title
  const customSuccessTitle = formSettings?.success_title;

  // Main success content
  const successContent = (
    <>
      {/* Success Card */}
      <Card 
        className="mb-4"
        style={{ 
          borderTop: hasBrandedTheme ? 'none' : `4px solid ${token.colorSuccess}`,
          borderRadius: hasBrandedTheme ? 16 : undefined
        }}
      >
        {hasCustomSuccessMessage ? (
          // Custom HTML success message
          <div className="text-center py-4">
            <CheckCircleFilled 
              style={{ 
                color: themeConfig?.colors?.primary || token.colorSuccess, 
                fontSize: 64,
                marginBottom: 24,
                display: 'block'
              }} 
            />
            {customSuccessTitle && (
              <Title level={2} style={{ marginBottom: 16 }}>
                {customSuccessTitle}
              </Title>
            )}
            <div 
              dangerouslySetInnerHTML={{ __html: sanitizeHtml(formSettings.success_message) }}
              className="success-message-content"
            />
            {submissionId && (
              <Text type="secondary" className="block mt-4">
                Confirmation number: <Text strong>#{submissionId}</Text>
              </Text>
            )}
          </div>
        ) : (
          // Default success message
          <Result
            icon={
              <CheckCircleFilled 
                style={{ color: token.colorSuccess, fontSize: 72 }} 
              />
            }
            title={customSuccessTitle || "Form Submitted Successfully!"}
            subTitle={
              <Space direction="vertical" size={0}>
                <Text type="secondary">
                  {successMessage || "Thank you for submitting the form."}
                </Text>
                {submissionId && (
                  <Text type="secondary">
                    Your confirmation number is: <Text strong>#{submissionId}</Text>
                  </Text>
                )}
              </Space>
            }
          />
        )}
      </Card>

      {/* Submission Summary - Only show if not using custom message or explicitly enabled */}
      {submittedData && Object.keys(submittedData).length > 0 && !hasCustomSuccessMessage && (
        <Card 
          title="Submission Summary" 
          className="mb-4"
          style={{ borderRadius: hasBrandedTheme ? 16 : undefined }}
          extra={
            <Button 
              icon={<PrinterOutlined />} 
              onClick={handlePrint}
              className="print:hidden"
            >
              Print
            </Button>
          }
        >
          <Descriptions 
            column={1} 
            bordered 
            size="small"
            className="print:border-0"
          >
            {Object.entries(submittedData).map(([key, value]) => (
              <Descriptions.Item 
                key={key} 
                label={
                  // Convert field_name to readable label
                  key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
                }
              >
                {formatValue(value)}
              </Descriptions.Item>
            ))}
          </Descriptions>
        </Card>
      )}

      {/* Next Steps - Hide if using custom message */}
      {!hasCustomSuccessMessage && (
        <Card 
          title="What's Next?" 
          className="mb-4"
          style={{ borderRadius: hasBrandedTheme ? 16 : undefined }}
        >
          <Space direction="vertical" size="middle" className="w-full">
            <Alert
              type="info"
              showIcon
              message="Confirmation Email"
              description="A confirmation email has been sent to your email address with the details of your submission."
            />
            
            <Paragraph>
              Our team will review your submission and get back to you shortly. 
              If you have any questions, please don&apos;t hesitate to contact us.
            </Paragraph>

            <Divider />

            <Space className="print:hidden">
              <Button 
                type="primary" 
                icon={<HomeOutlined />}
                onClick={() => navigate('/')}
              >
                Go to Homepage
              </Button>
              <Button 
                icon={<FormOutlined />}
                onClick={() => navigate(`/f/${linkCode}`)}
              >
                Submit Another Response
              </Button>
            </Space>
          </Space>
        </Card>
      )}

      {/* Buttons for custom message - simpler navigation */}
      {hasCustomSuccessMessage && (
        <div className="flex justify-center gap-4 mt-6 print:hidden">
          <Button 
            type="primary" 
            size="large"
            icon={<HomeOutlined />}
            onClick={() => navigate('/')}
            style={{
              backgroundColor: themeConfig?.colors?.primary,
              borderColor: themeConfig?.colors?.primary
            }}
          >
            Go to Homepage
          </Button>
        </div>
      )}

      {/* Footer - only if not using branded layout */}
      {!hasBrandedTheme && (
        <div className="text-center text-gray-500 text-sm print:hidden mt-4">
          <Text type="secondary">
            Powered by UKC.world
          </Text>
        </div>
      )}
    </>
  );

  // Render with branded layout if available
  if (hasBrandedTheme) {
    return (
      <PublicFormLayout 
        themeConfig={themeConfig}
        formName={formName}
      >
        {successContent}
      </PublicFormLayout>
    );
  }

  // Default layout
  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-2xl mx-auto">
        {successContent}
      </div>
    </div>
  );
};

export default FormSuccessPage;
