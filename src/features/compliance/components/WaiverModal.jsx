/**
 * WaiverModal Component
 * 
 * Digital signature modal for liability waiver acceptance
 * Features:
 * - Displays waiver content with scroll-to-accept
 * - Signature canvas for drawing signature
 * - One-time display check
 * - Form validation
 * - Photo consent checkbox
 */

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import PropTypes from 'prop-types';
import { Modal, Checkbox, Button, Alert, Spin, Typography, App, Space, Progress } from 'antd';
import { CheckCircleOutlined, EditOutlined, CloseCircleOutlined, LineChartOutlined } from '@ant-design/icons';
import { motion, AnimatePresence } from 'framer-motion';
import SignatureCanvas from './SignatureCanvas.jsx';
import WaiverDocument from './WaiverDocument.jsx';
import * as waiverApi from '../services/waiverApi';

const { Paragraph, Text } = Typography;

// eslint-disable-next-line complexity
const WaiverModal = ({ open, userId, userType, onSuccess, onCancel }) => {
  const { message, modal } = App.useApp();
  const signatureRef = useRef(null);
  const escapeConfirmVisible = useRef(false);

  // State
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [waiverTemplate, setWaiverTemplate] = useState(null);
  const [acknowledgements, setAcknowledgements] = useState({});
  const [photoConsent, setPhotoConsent] = useState(false);
  const [hasScrolledToBottom, setHasScrolledToBottom] = useState(false);
  const [signatureEmpty, setSignatureEmpty] = useState(true);
  const [scrollProgress, setScrollProgress] = useState(0);
  const [signatureStrokes, setSignatureStrokes] = useState(0);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [isMobileViewport, setIsMobileViewport] = useState(() => (typeof window !== 'undefined' ? window.innerWidth <= 768 : false));
  const [signatureCollapsed, setSignatureCollapsed] = useState(() => (typeof window !== 'undefined' ? window.innerWidth <= 768 : false));

  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth <= 768;
      setIsMobileViewport(mobile);
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('resize', handleResize);
      handleResize();
    }

    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('resize', handleResize);
      }
    };
  }, []);

  useEffect(() => {
    if (!isMobileViewport) {
      setSignatureCollapsed(false);
    }
  }, [isMobileViewport]);

  const displayVersion = useMemo(() => waiverTemplate?.version || waiverTemplate?.version_number || 'Draft', [waiverTemplate]);

  const checklistItems = useMemo(() => {
    const baseItems = [
      { key: 'risks', label: 'I understand the inherent risks of water sports and related activities.' },
      { key: 'liability', label: 'I release Plannivo and its partners from liability for injuries or damages.' },
      { key: 'medical', label: 'I declare that I (or the participant) am medically fit to participate.' },
      { key: 'instructions', label: 'I agree to follow instructor directions and safety protocols.' },
      { key: 'emergency', label: 'I authorize emergency medical treatment if required.' }
    ];

    if (userType === 'family_member') {
      baseItems.push({ key: 'guardian', label: 'I am the legal guardian and assume responsibility for the participant.' });
    }

    return baseItems;
  }, [userType]);

  /**
   * Fetch the latest waiver template from API
   */
  const fetchWaiverTemplate = useCallback(async () => {
    setLoading(true);
    try {
  const template = await waiverApi.getWaiverTemplate('en');
  setWaiverTemplate(template);
    } catch (error) {
      message.error(`Failed to load waiver: ${error.message}`);
    } finally {
      setLoading(false);
    }
  }, [message]);

  // Fetch waiver template when modal opens
  useEffect(() => {
    if (open) {
      setWaiverTemplate(null);
      fetchWaiverTemplate();
      // Reset form state
      setAcknowledgements({});
      setPhotoConsent(false);
      setHasScrolledToBottom(false);
      setSignatureEmpty(true);
      signatureRef.current?.clear();
      setSignatureCollapsed(typeof window !== 'undefined' ? window.innerWidth <= 768 : false);
    }
  }, [open, fetchWaiverTemplate]);

  const handleEscapeAttempt = useCallback(() => {
    if (submitting || escapeConfirmVisible.current) return;

    escapeConfirmVisible.current = true;
    modal.confirm({
      title: 'Cancel waiver signing?',
      content: 'Your partially completed waiver will be cleared if you exit now. You can restart the process later from your dashboard.',
      okText: 'Yes, discard',
      cancelText: 'Continue signing',
      centered: true,
      onOk: () => {
        signatureRef.current?.clear();
        setSignatureEmpty(true);
        setAcknowledgements({});
        setPhotoConsent(false);
        setHasScrolledToBottom(false);
        escapeConfirmVisible.current = false;
        onCancel();
      },
      onCancel: () => {
        escapeConfirmVisible.current = false;
      },
      afterClose: () => {
        escapeConfirmVisible.current = false;
      },
    });
  }, [modal, onCancel, submitting]);

  useEffect(() => {
    if (!open) return;

    const keyListener = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        handleEscapeAttempt();
      }
    };

    window.addEventListener('keydown', keyListener, true);
    return () => {
      window.removeEventListener('keydown', keyListener, true);
      escapeConfirmVisible.current = false;
    };
  }, [open, handleEscapeAttempt]);

  /**
   * Handle signature canvas changes
   */
  const handleSignatureEnd = (hasInk) => {
    const empty = typeof hasInk === 'boolean' ? !hasInk : signatureRef.current?.isEmpty();
    setSignatureEmpty(Boolean(empty));
    
    // Track signature quality (stroke count)
    if (!empty) {
      setSignatureStrokes((prev) => prev + 1);
    }
  };

  /**
   * Clear the signature canvas
   */
  const handleClearSignature = () => {
    waiverApi.clearSignature(signatureRef);
    setSignatureEmpty(true);
    setSignatureStrokes(0);
  };

  /**
   * Submit the signed waiver
   */
  const handleSubmit = async () => {
    // Validation
    if (!hasScrolledToBottom) {
      message.warning('Please read the entire waiver by scrolling to the bottom');
      return;
    }

    const missingAcknowledgements = checklistItems.filter((item) => !acknowledgements[item.key]);
    if (missingAcknowledgements.length > 0) {
      message.warning('Please acknowledge all required safety and liability statements.');
      return;
    }

    if (signatureEmpty) {
      message.warning('Please provide your signature');
      return;
    }

    // Get signature data
    const signatureData = waiverApi.getSignatureData(signatureRef);
    if (!signatureData) {
      message.error('Failed to capture signature. Please try again.');
      return;
    }

    // Prepare submission data
    const submissionData = {
      [userType === 'user' ? 'user_id' : 'family_member_id']: userId,
  waiver_version: waiverTemplate.version_number || waiverTemplate.version,
      language_code: waiverTemplate.language || 'en',
      signature_data: signatureData,
      agreed_to_terms: true,
      photo_consent: photoConsent
    };

    // Validate before sending
    const validation = waiverApi.validateWaiverSubmission(submissionData);
    if (!validation.valid) {
      message.error(validation.errors[0]);
      return;
    }

    // Submit to API
    setSubmitting(true);
    try {
      const result = await waiverApi.submitWaiver(submissionData);
      setSubmitSuccess(true);
      
      // Show success animation before closing
      setTimeout(() => {
        message.success({
          content: (
            <span>
              <CheckCircleOutlined style={{ color: '#52c41a', marginRight: 8 }} />
              Waiver signed successfully!
            </span>
          ),
          duration: 3,
        });
        onSuccess(result);
      }, 800);
    } catch (error) {
      message.error(`Failed to submit waiver: ${error.message}`);
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      title={
        <motion.div 
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.3 }}
          style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
        >
          <EditOutlined />
          <span>Liability Waiver & Digital Signature</span>
        </motion.div>
      }
      width={isMobileViewport ? '100%' : '95%'}
      style={{ top: isMobileViewport ? 10 : 20 }}
      styles={{
        body: {
          maxHeight: isMobileViewport ? '80vh' : '75vh',
          overflow: 'auto',
          paddingRight: isMobileViewport ? 12 : 24,
          paddingLeft: isMobileViewport ? 12 : 24,
          paddingTop: isMobileViewport ? 16 : 24,
          // Mobile touch scrolling improvements
          WebkitOverflowScrolling: 'touch',
          overscrollBehavior: 'contain',
        }
      }}
      closable={!submitting}
      footer={[
        <Button key="cancel" onClick={onCancel} disabled={submitting}>
          Cancel
        </Button>,
        <Button 
          key="submit" 
          type="primary" 
          onClick={handleSubmit}
          loading={submitting}
          disabled={signatureEmpty || !hasScrolledToBottom || checklistItems.some((item) => !acknowledgements[item.key])}
          icon={submitSuccess ? <CheckCircleOutlined /> : undefined}
        >
          {submitSuccess ? 'Submitted!' : 'Submit Signed Waiver'}
        </Button>
      ]}
      onCancel={onCancel}
      maskClosable={false}
      keyboard={false}
      destroyOnHidden
    >
      <AnimatePresence mode="wait">
        {loading ? (
        <div style={{ textAlign: 'center', padding: '40px 0' }}>
          <Spin size="large" />
          <Paragraph style={{ marginTop: 16 }}>Loading waiver...</Paragraph>
        </div>
      ) : !waiverTemplate ? (
        <div style={{ textAlign: 'center', padding: '32px 0' }}>
          <Alert
            message="Error Loading Waiver"
            description="Unable to load the waiver template. Please try again later."
            type="error"
            showIcon
            style={{ marginBottom: 16 }}
          />
          <Space align="center" size="middle" wrap style={{ justifyContent: 'center' }}>
            <Button type="primary" onClick={fetchWaiverTemplate}>
              Retry
            </Button>
            <Button onClick={onCancel}>Close</Button>
          </Space>
        </div>
      ) : (
        <>
          {/* Important Notice */}
          <Alert
            message="Important: One-Time Signature Required"
            description="This waiver must be signed once before booking lessons or renting equipment. Please read carefully before signing."
            type="info"
            showIcon
            icon={<CheckCircleOutlined />}
            style={{ marginBottom: 16 }}
          />

          {/* Waiver Content (Scrollable) */}
          <div style={{ position: 'relative', marginBottom: 16 }}>
            {scrollProgress < 100 && (
              <div style={{ marginBottom: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    Reading Progress
                  </Text>
                  <Text strong style={{ fontSize: 12, color: scrollProgress === 100 ? '#52c41a' : '#1890ff' }}>
                    {scrollProgress}%
                  </Text>
                </div>
                <Progress 
                  percent={scrollProgress} 
                  showInfo={false}
                  strokeColor={{
                    '0%': '#1890ff',
                    '100%': '#52c41a',
                  }}
                  trailColor="#e5e7eb"
                  strokeWidth={6}
                />
              </div>
            )}
            
            <WaiverDocument
              title={waiverTemplate.title}
              version={displayVersion}
              effectiveDate={waiverTemplate.effective_date}
              content={waiverTemplate.content}
              language={waiverTemplate.language}
              isMinor={userType === 'family_member'}
              onScrollBottom={() => setHasScrolledToBottom(true)}
              onScrollProgress={setScrollProgress}
              isMobile={isMobileViewport}
            />
          </div>

          {!hasScrolledToBottom && (
            <Alert
              message="Please scroll to the bottom to continue"
              type="warning"
              showIcon
              style={{ marginBottom: 16 }}
            />
          )}

          {/* Signature Canvas */}
          <div
            style={{
              position: 'sticky',
              bottom: -24,
              background: 'linear-gradient(180deg, rgba(255,255,255,0.95) 0%, #ffffff 45%)',
              padding: '16px 0 12px',
              marginBottom: 16,
              borderTop: '1px solid #e5e7eb',
              backdropFilter: 'blur(6px)',
            }}
          >
            <div style={{ display: 'flex', flexDirection: isMobileViewport ? 'column' : 'row', gap: 8, justifyContent: 'space-between', alignItems: isMobileViewport ? 'flex-start' : 'center', marginBottom: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Text strong>Your Signature *</Text>
                {signatureStrokes > 0 && !signatureEmpty && (
                  <span style={{ 
                    fontSize: 11, 
                    color: signatureStrokes >= 3 ? '#52c41a' : '#faad14',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4
                  }}>
                    <LineChartOutlined />
                    {signatureStrokes >= 3 ? 'Good quality' : 'Add more detail'}
                  </span>
                )}
              </div>
              {!signatureCollapsed && (
                <Button
                  size="small"
                  danger
                  type="default"
                  icon={<CloseCircleOutlined />}
                  onClick={handleClearSignature}
                  disabled={signatureEmpty}
                  style={{
                    fontWeight: 500,
                  }}
                >
                  Clear Signature
                </Button>
              )}
            </div>

            {signatureCollapsed ? (
              <Button
                type="primary"
                block
                size="large"
                onClick={() => setSignatureCollapsed(false)}
                icon={<EditOutlined />}
              >
                Tap to add your signature
              </Button>
            ) : (
              <>
                <div
                  style={{
                    border: '2px dashed #94a3b8',
                    borderRadius: '12px',
                    backgroundColor: '#ffffff',
                    boxShadow: '0 10px 25px -15px rgba(15, 23, 42, 0.35)',
                  }}
                >
                  <SignatureCanvas
                    ref={signatureRef}
                    width={isMobileViewport ? 320 : 750}
                    height={isMobileViewport ? 160 : 200}
                    penColor="#0f172a"
                    backgroundColor="#ffffff"
                    lineWidth={2.5}
                    onEnd={handleSignatureEnd}
                  />
                </div>
                <Text type="secondary" style={{ fontSize: '12px' }}>
                  Draw your signature above using your {isMobileViewport ? 'finger or stylus' : 'mouse, touch screen, or stylus'}.
                </Text>
              </>
            )}
          </div>

          {/* Agreement Checkboxes */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ 
              display: 'flex', 
              justifyContent: 'space-between', 
              alignItems: 'center',
              marginBottom: 12,
              paddingBottom: 8,
              borderBottom: '1px solid #e5e7eb'
            }}>
              <Text strong style={{ fontSize: '15px' }}>Required Acknowledgements</Text>
              <Button 
                type="link" 
                size="small"
                onClick={() => {
                  const allChecked = {};
                  checklistItems.forEach((item) => {
                    allChecked[item.key] = true;
                  });
                  setAcknowledgements(allChecked);
                  setPhotoConsent(true);
                }}
              >
                Select All
              </Button>
            </div>
            {checklistItems.map((item) => (
              <div 
                key={item.key} 
                style={{ 
                  marginBottom: isMobileViewport ? 12 : 8,
                  padding: isMobileViewport ? '12px 8px' : '4px 0',
                  backgroundColor: isMobileViewport ? '#f8fafc' : 'transparent',
                  borderRadius: isMobileViewport ? '8px' : 0,
                  border: isMobileViewport ? '1px solid #e2e8f0' : 'none',
                }}
              >
                <Checkbox
                  checked={Boolean(acknowledgements[item.key])}
                  onChange={(event) =>
                    setAcknowledgements((prev) => ({
                      ...prev,
                      [item.key]: event.target.checked,
                    }))
                  }
                  style={{ 
                    alignItems: 'flex-start',
                    width: '100%',
                  }}
                >
                  <Text 
                    strong 
                    style={{ 
                      fontSize: isMobileViewport ? '15px' : '14px',
                      lineHeight: isMobileViewport ? '1.5' : '1.4',
                    }}
                  >
                    {item.label}
                  </Text>
                </Checkbox>
              </div>
            ))}
            <div 
              style={{ 
                padding: isMobileViewport ? '12px 8px' : '4px 0',
                backgroundColor: isMobileViewport ? '#f8fafc' : 'transparent',
                borderRadius: isMobileViewport ? '8px' : 0,
                border: isMobileViewport ? '1px solid #e2e8f0' : 'none',
              }}
            >
              <Checkbox
                checked={photoConsent}
                onChange={(e) => setPhotoConsent(e.target.checked)}
                style={{ 
                  alignItems: 'flex-start',
                  width: '100%',
                }}
              >
                <Text style={{ 
                  fontSize: isMobileViewport ? '15px' : '14px',
                  lineHeight: isMobileViewport ? '1.5' : '1.4',
                }}>
                  I consent to having my photo/video taken during activities and used for promotional purposes (optional)
                </Text>
              </Checkbox>
            </div>
          </div>

          {/* Legal Notice */}
          <Alert
            message="Legal Notice"
            description="By signing this waiver, you acknowledge that you have read, understood, and agree to be bound by all terms and conditions. Your digital signature is legally binding."
            type="warning"
            showIcon
            style={{ marginBottom: 0 }}
          />
        </>
      )}
      </AnimatePresence>
    </Modal>
  );
};

WaiverModal.propTypes = {
  open: PropTypes.bool.isRequired,
  userId: PropTypes.string.isRequired,
  userType: PropTypes.oneOf(['user', 'family_member']).isRequired,
  onSuccess: PropTypes.func.isRequired,
  onCancel: PropTypes.func.isRequired
};

export default WaiverModal;
