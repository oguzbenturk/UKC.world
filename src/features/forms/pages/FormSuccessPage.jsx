/**
 * Form Success Page
 * Displayed after successful form submission
 * Shows confirmation and next steps
 */

import { useEffect } from 'react';
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

const { Text, Paragraph } = Typography;

const FormSuccessPage = () => {
  const { linkCode } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { token } = theme.useToken();

  // Get submission data from navigation state
  const { submissionId, formName, submittedData } = location.state || {};

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

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-2xl mx-auto">
        {/* Success Card */}
        <Card 
          className="mb-4"
          style={{ borderTop: `4px solid ${token.colorSuccess}` }}
        >
          <Result
            icon={
              <CheckCircleFilled 
                style={{ color: token.colorSuccess, fontSize: 72 }} 
              />
            }
            title="Form Submitted Successfully!"
            subTitle={
              <Space direction="vertical" size={0}>
                <Text type="secondary">
                  Thank you for submitting the form.
                </Text>
                {submissionId && (
                  <Text type="secondary">
                    Your confirmation number is: <Text strong>#{submissionId}</Text>
                  </Text>
                )}
              </Space>
            }
          />
        </Card>

        {/* Submission Summary */}
        {submittedData && Object.keys(submittedData).length > 0 && (
          <Card 
            title="Submission Summary" 
            className="mb-4"
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

        {/* Next Steps */}
        <Card title="What's Next?" className="mb-4">
          <Space direction="vertical" size="middle" className="w-full">
            <Alert
              type="info"
              showIcon
              message="Confirmation Email"
              description="A confirmation email has been sent to your email address with the details of your submission."
            />
            
            <Paragraph>
              Our team will review your submission and get back to you shortly. 
              If you have any questions, please don't hesitate to contact us.
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

        {/* Footer */}
        <div className="text-center text-gray-500 text-sm print:hidden">
          <Text type="secondary">
            Powered by UKC.world
          </Text>
        </div>
      </div>
    </div>
  );
};

export default FormSuccessPage;
