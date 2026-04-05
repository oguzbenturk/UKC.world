import { useState, useEffect } from 'react';
import { Modal, Button, Steps, Card, Image, Typography, Space, Row, Col } from 'antd';
import { CloseOutlined, ArrowLeftOutlined, ArrowRightOutlined } from '@ant-design/icons';
import { sanitizeHtml } from '@/shared/utils/sanitizeHtml';
import './PopupDisplay.css';

const { Title, Paragraph, Text } = Typography;
const { Step } = Steps;

// eslint-disable-next-line complexity
const PopupDisplay = ({ popup, visible, onClose, onAction }) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [displayedOnce, setDisplayedOnce] = useState(false);

  useEffect(() => {
    if (visible && !displayedOnce) {
      setDisplayedOnce(true);
      // Track popup view
      if (popup?.id) {
        trackPopupEvent(popup.id, 'view');
      }
    }
  }, [visible, displayedOnce, popup?.id]);

  const trackPopupEvent = async (popupId, eventType, data = {}) => {
    try {
      await fetch('/api/popups/track', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          popupId,
          eventType,
          data
        })
      });
      // eslint-disable-next-line no-unused-vars
    } catch (error) {
      // Silent fail for tracking
    }
  };

  const handleClose = () => {
    if (popup?.id) {
      trackPopupEvent(popup.id, 'dismiss');
    }
    onClose();
  };

  const handleAction = (action, buttonData) => {
    if (popup?.id) {
      trackPopupEvent(popup.id, 'click', { action, buttonData });
    }
    if (onAction) {
      onAction(action, buttonData);
    }
  };

  const handleStepChange = (step) => {
    setCurrentStep(step);
    if (popup?.id) {
      trackPopupEvent(popup.id, 'step_change', { step });
    }
  };

  if (!popup || !visible) return null;

  const config = popup.config || {};
  const content = config.content || {};
  const design = config.design || {};
  const isMultiStep = content.steps && content.steps.length > 1;
  const currentContent = isMultiStep ? content.steps[currentStep] : content;

  // eslint-disable-next-line complexity
  const renderContent = () => {
    const contentStyle = {
      textAlign: design.textAlignment || 'center',
      padding: `${design.padding || 24}px`
    };

    return (
      <div style={contentStyle}>
        {/* Background Image/Video */}
        {design.backgroundImage && (
          <div 
            className="popup-background"
            style={{
              backgroundImage: `url(${design.backgroundImage})`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              zIndex: -1,
              opacity: design.backgroundOpacity || 0.8
            }}
          />
        )}

        {/* Hero Image */}
        {currentContent.heroImage && (
          <div style={{ marginBottom: 24 }}>
            <Image
              src={currentContent.heroImage}
              alt="Hero"
              style={{
                maxWidth: '100%',
                maxHeight: design.heroImageHeight || '200px',
                borderRadius: design.borderRadius || '8px'
              }}
              preview={false}
            />
          </div>
        )}

        {/* Logo */}
        {design.logo && (
          <div style={{ marginBottom: 16 }}>
            <Image
              src={design.logo}
              alt="Logo"
              style={{
                height: design.logoHeight || '40px',
                width: 'auto'
              }}
              preview={false}
            />
          </div>
        )}

        {/* Title */}
        {currentContent.title && (
          <Title 
            level={design.titleLevel || 2}
            style={{ 
              color: design.titleColor || '#1890ff',
              marginBottom: 16,
              fontSize: design.titleSize || undefined
            }}
          >
            {currentContent.title}
          </Title>
        )}

        {/* Subtitle */}
        {currentContent.subtitle && (
          <Title 
            level={design.subtitleLevel || 4}
            style={{ 
              color: design.subtitleColor || '#666',
              marginBottom: 16,
              fontWeight: 'normal'
            }}
          >
            {currentContent.subtitle}
          </Title>
        )}

        {/* Body Text */}
        {currentContent.bodyText && (
          <div style={{ marginBottom: 24 }}>
            {currentContent.htmlContent ? (
              <div 
                dangerouslySetInnerHTML={{ __html: sanitizeHtml(currentContent.bodyText) }}
                style={{ color: design.textColor || '#333' }}
              />
            ) : (
              <Paragraph style={{ color: design.textColor || '#333', fontSize: design.textSize }}>
                {currentContent.bodyText}
              </Paragraph>
            )}
          </div>
        )}

        {/* Content Blocks */}
        {currentContent.contentBlocks && (
          <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
            {currentContent.contentBlocks.map((block, index) => (
              // eslint-disable-next-line react/no-array-index-key
              <Col span={24 / (currentContent.contentBlocks.length > 3 ? 3 : currentContent.contentBlocks.length)} key={`block-${block.title || 'untitled'}-${index}`}>
                <Card size="small" style={{ textAlign: 'center' }}>
                  {block.icon && <div style={{ fontSize: '24px', marginBottom: 8 }}>{block.icon}</div>}
                  {block.title && <Text strong>{block.title}</Text>}
                  {block.description && <Paragraph style={{ margin: '8px 0 0 0' }}>{block.description}</Paragraph>}
                </Card>
              </Col>
            ))}
          </Row>
        )}

        {/* Action Buttons */}
        <Space size="middle" wrap>
          {currentContent.primaryButton && (
            <Button
              type="primary"
              size={design.buttonSize || 'middle'}
              style={{
                backgroundColor: currentContent.primaryButton.color || '#1890ff',
                borderColor: currentContent.primaryButton.color || '#1890ff',
                borderRadius: design.buttonRadius || '6px'
              }}
              onClick={() => handleAction('primary', currentContent.primaryButton)}
            >
              {currentContent.primaryButton.text}
            </Button>
          )}

          {currentContent.secondaryButton && (
            <Button
              size={design.buttonSize || 'middle'}
              style={{
                borderRadius: design.buttonRadius || '6px'
              }}
              onClick={() => handleAction('secondary', currentContent.secondaryButton)}
            >
              {currentContent.secondaryButton.text}
            </Button>
          )}

          {isMultiStep && currentStep < content.steps.length - 1 && (
            <Button
              type="primary"
              icon={<ArrowRightOutlined />}
              onClick={() => handleStepChange(currentStep + 1)}
            >
              Next
            </Button>
          )}

          {isMultiStep && currentStep > 0 && (
            <Button
              icon={<ArrowLeftOutlined />}
              onClick={() => handleStepChange(currentStep - 1)}
            >
              Back
            </Button>
          )}
        </Space>

        {/* Social Links */}
        {currentContent.socialLinks && (
          <div style={{ marginTop: 24 }}>
            <Space>
              {currentContent.socialLinks.map((link, index) => (
                <Button
                  // eslint-disable-next-line react/no-array-index-key
                  key={`social-${link.url || 'link'}-${index}`}
                  type="link"
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => handleAction('social', link)}
                >
                  {link.icon} {link.text}
                </Button>
              ))}
            </Space>
          </div>
        )}
      </div>
    );
  };

  const modalProps = {
    open: visible,
    onCancel: handleClose,
    footer: null,
    width: design.width || 600,
    centered: design.position === 'center',
    closable: config.general?.allowClose !== false,
    closeIcon: <CloseOutlined />,
    destroyOnHidden: true,
    className: `popup-modal popup-${design.theme || 'default'}`,
    style: {
      borderRadius: design.borderRadius || '8px'
    },
    styles: {
      body: {
        padding: 0,
        borderRadius: design.borderRadius || '8px',
        background: design.backgroundColor || '#fff'
      }
    }
  };

  return (
    <Modal {...modalProps}>
      {/* Progress Indicator for Multi-step */}
      {isMultiStep && design.showProgress && (
        <div style={{ padding: '16px 24px 0', borderBottom: '1px solid #f0f0f0' }}>
          <Steps current={currentStep} size="small">
            {content.steps.map((step, index) => (
              // eslint-disable-next-line react/no-array-index-key
              <Step key={`step-${step.stepTitle || 'step'}-${index}`} title={step.stepTitle || `Step ${index + 1}`} />
            ))}
          </Steps>
        </div>
      )}

      {renderContent()}
    </Modal>
  );
};

export default PopupDisplay;
